# Copyright (c) 2026, TBD and contributors
# For license information, please see license.txt

import frappe
from frappe.utils.pdf import get_pdf


def generate_agenda_pdf_job(doc_name, user=None):
    """
    Background job: generates the agenda PDF using offline-first rendering.

    All CSS is inlined from the local filesystem so the worker never needs
    to make HTTP requests.  The resulting PDF is attached to the doc and
    the front-end is notified via realtime.
    """
    frappe.set_user(user or "Administrator")

    try:
        doc = frappe.get_doc("Council Meeting", doc_name)

        # ── 1. Pick the right print-format template ──────────────────────
        if doc.meeting_type == "City Council Meeting":
            print_format_name = "City Council Agenda"
        else:
            print_format_name = "Standing Committee Agenda"

        # ── 2. Render the body HTML from the print format ────────────────
        body_html = frappe.get_print(
            doctype=doc.doctype,
            name=doc.name,
            print_format=print_format_name,
            as_pdf=False,
        )

        # ── 3. Load CSS from disk (offline-first) ───────────────────────
        css_path = frappe.get_app_path("council", "public", "css", "calendar.css")
        try:
            with open(css_path, "r") as f:
                local_css = f.read()
        except FileNotFoundError:
            local_css = ""
            frappe.log_error(
                f"CSS file not found at {css_path}",
                "Agenda PDF – Missing CSS",
            )

        # ── 4. Compose full standalone HTML ──────────────────────────────
        full_html = _build_standalone_html(body_html, local_css)

        # ── 5. Generate the PDF ──────────────────────────────────────────
        pdf_options = {
            "page-size": "Letter",
            "margin-top": "15mm",
            "margin-bottom": "15mm",
            "margin-left": "15mm",
            "margin-right": "15mm",
            "no-outline": None,
            "disable-local-file-access": None,
        }
        pdf_content = get_pdf(full_html, options=pdf_options)

        # ── 6. Persist the PDF as a File doc ─────────────────────────────
        filename = f"Agenda-{doc.name}.pdf"

        existing_files = frappe.get_all(
            "File",
            filters={
                "attached_to_doctype": doc.doctype,
                "attached_to_name": doc.name,
                "file_name": filename,
            },
            pluck="name",
            limit=1,
        )

        if existing_files:
            _file = frappe.get_doc("File", existing_files[0])
            _file.content = pdf_content
            _file.save(ignore_permissions=True)
        else:
            _file = frappe.get_doc(
                {
                    "doctype": "File",
                    "file_name": filename,
                    "attached_to_doctype": doc.doctype,
                    "attached_to_name": doc.name,
                    "content": pdf_content,
                    "is_private": 0,
                }
            )
            _file.save(ignore_permissions=True)

        # ── 7. Link the file URL without triggering on_update ────────────
        doc.db_set("agenda_pdf", _file.file_url, update_modified=False)

        # ── 8. Notify the originating user via realtime ──────────────────
        # IMPORTANT: publish BEFORE commit with after_commit=True so the
        # event fires exactly when commit() flushes the transaction.
        print(f"--- Sending Realtime Event to User: {user} ---")
        print(f"--- Event: council_meeting_pdf_generated | doc_name: {doc_name} | file_url: {_file.file_url} ---")
        frappe.publish_realtime(
            event="council_meeting_pdf_generated",
            message={
                "doc_name": doc_name,
                "file_url": _file.file_url,
            },
            user=user,
            after_commit=True,
        )
        frappe.db.commit()
        print(f"--- commit() completed, realtime event should have fired ---")

    except Exception:
        frappe.db.rollback()
        frappe.log_error(
            frappe.get_traceback(),
            f"Agenda PDF Generation Error – {doc_name}",
        )
        # Notify user of the failure so the UI isn't left waiting
        frappe.publish_realtime(
            event="council_meeting_pdf_failed",
            message={"doc_name": doc_name},
            user=user,
            after_commit=True,
        )
        frappe.db.commit()


def _build_standalone_html(body_html, local_css):
    """
    Wraps the print-format body in a full HTML document with all styles
    inlined so wkhtmltopdf never needs to fetch anything over the network.
    """
    return f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
/* ── Reset / base ──────────────────────────────────────────── */
*, *::before, *::after {{ box-sizing: border-box; }}
body {{
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI",
                 Roboto, "Helvetica Neue", Arial, sans-serif;
    font-size: 14px;
    color: #212529;
    margin: 0;
    padding: 0;
}}
.text-center {{ text-align: center; }}
hr {{ border: none; border-top: 1px solid #ccc; margin: 15px 0; }}
/* ── App CSS (calendar.css) ────────────────────────────────── */
{local_css}
</style>
</head>
<body>
{body_html}
</body>
</html>"""
