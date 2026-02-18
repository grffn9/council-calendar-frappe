// Copyright (c) 2026, TBD and contributors
// For license information, please see license.txt

frappe.ui.form.on("Council Meeting", {
	refresh(frm) {
		// Clear any existing poll to prevent duplicate loops
		if (frm._pdf_poll_id) {
			clearInterval(frm._pdf_poll_id);
			frm._pdf_poll_id = null;
		}

		if (frm.is_new()) return;

		// Add the Generate button
		frm.add_custom_button(__("Generate Agenda PDF"), function () {
			frappe.call({
				method: "generate_agenda_pdf",
				doc: frm.doc,
				callback(r) {
					if (!r.exc) {
						frappe.show_alert(
							{ message: __("PDF generation started…"), indicator: "blue" },
							5
						);
						start_pdf_poll(frm);
					}
				},
			});
		});

		// If no PDF yet, start polling automatically (handles page reload
		// while a background job is still running)
		if (!frm.doc.agenda_pdf) {
			start_pdf_poll(frm);
		}
	},
});

/**
 * Poll the database every 2 seconds for the `agenda_pdf` value.
 * Stops automatically after 60 seconds (30 attempts).
 */
function start_pdf_poll(frm) {
	// Guard against stacking intervals
	if (frm._pdf_poll_id) {
		clearInterval(frm._pdf_poll_id);
	}

	let attempts = 0;
	const MAX_ATTEMPTS = 30; // 30 × 2 s = 60 s

	frm._pdf_poll_id = setInterval(() => {
		attempts++;

		frappe.db.get_value("Council Meeting", frm.doc.name, "agenda_pdf", (r) => {
			if (r && r.agenda_pdf) {
				clearInterval(frm._pdf_poll_id);
				frm._pdf_poll_id = null;
				frappe.show_alert(
					{ message: __("PDF Ready"), indicator: "green" },
					7
				);
				frm.reload_doc();
				return;
			}

			if (attempts >= MAX_ATTEMPTS) {
				clearInterval(frm._pdf_poll_id);
				frm._pdf_poll_id = null;
				frappe.show_alert(
					{ message: __("PDF generation timed out – please try again."), indicator: "orange" },
					10
				);
			}
		});
	}, 2000);
}
