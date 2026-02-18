# Copyright (c) 2026, TBD and contributors
# For license information, please see license.txt

import hashlib
import json

import frappe
from frappe.model.document import Document


# Fields whose changes should trigger a PDF rebuild
_PDF_TRIGGER_FIELDS = (
	"meeting_type",
	"committee",
	"meeting_date",
	"meeting_time",
	"meeting_end_time",
	"location",
	"address",
	"meeting_re",
	"additional_info",
	"agenda_items",
)


class CouncilMeeting(Document):
	# ── hooks ────────────────────────────────────────────────────────

	def on_update(self):
		"""Enqueue a PDF job only when relevant content actually changed."""
		if self.flags.get("skip_pdf_enqueue"):
			return
		if self._pdf_content_changed():
			self._enqueue_pdf()

	def after_insert(self):
		"""Always generate a PDF for brand-new meetings."""
		self._enqueue_pdf()

	# ── manual trigger (button) ──────────────────────────────────────

	@frappe.whitelist()
	def generate_agenda_pdf(self):
		"""Manually trigger PDF generation from the UI."""
		if not self.has_permission("write"):
			frappe.throw(
				"You do not have permission to generate the Agenda PDF",
				frappe.PermissionError,
			)
		self._enqueue_pdf()
		frappe.msgprint("PDF generation has been queued.", indicator="blue", alert=True)

	# ── private helpers ──────────────────────────────────────────────

	def _enqueue_pdf(self):
		"""Enqueue the background job with built-in deduplication."""
		job_id = f"agenda_pdf_{self.name}"

		frappe.enqueue(
			"council.council_calendar.doctype.council_meeting.council_meeting_utils.generate_agenda_pdf_job",
			queue="default",
			timeout=300,
			job_id=job_id,
			deduplicate=True,
			doc_name=self.name,
			user=frappe.session.user,
		)

	def _pdf_content_changed(self) -> bool:
		"""
		Return True if any field that affects the PDF has been modified
		since the last save.  Uses a lightweight hash so we never store
		per-field old values.
		"""
		current_hash = self._content_hash(self)
		previous = self.get_doc_before_save()
		if not previous:
			return True
		previous_hash = self._content_hash(previous)
		return current_hash != previous_hash

	@staticmethod
	def _content_hash(doc=None) -> str:
		"""Deterministic hash of every field that feeds into the PDF."""
		if doc is None:
			return ""
		parts = []
		for field in _PDF_TRIGGER_FIELDS:
			val = doc.get(field)
			if isinstance(val, list):
				# child table – serialise each row's meaningful fields
				val = json.dumps(
					[
						{k: row.get(k) for k in ("item_title", "presenter", "duration", "description")}
						for row in val
					],
					sort_keys=True,
				)
			parts.append(str(val) if val else "")
		blob = "|".join(parts)
		return hashlib.md5(blob.encode()).hexdigest()


@frappe.whitelist()
def test_socket_connection(doc_name=None):
	"""DEBUG: Fires a realtime event directly from the web worker (no background job)."""
	user = frappe.session.user
	print(f"--- test_socket_connection called by user: {user} ---")
	frappe.publish_realtime(
		event="council_meeting_pdf_generated",
		message={"doc_name": doc_name or "TEST", "file_url": "/test", "test": True},
		user=user,
	)
	return {"status": "ok", "user": user}
