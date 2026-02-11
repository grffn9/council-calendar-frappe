# Copyright (c) 2026, TBD and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils.pdf import get_pdf

class CouncilMeeting(Document):
	def after_insert(self):
		# Generate PDF in background to avoid blocking the insert transaction
		frappe.enqueue(
			'council.council_calendar.doctype.council_meeting.council_meeting.generate_agenda_pdf_job',
			queue='short',
			doc_name=self.name
		)

	def on_update(self):
		# Only generate if we aren't already saving the PDF URL (avoids recursion)
		if not self.flags.in_pdf_generation:
			frappe.enqueue(
				'council.council_calendar.doctype.council_meeting.council_meeting.generate_agenda_pdf_job',
				queue='short',
				doc_name=self.name
			)

	@frappe.whitelist()
	def generate_agenda_pdf(self):
		"""
		Manually trigger PDF generation (UI Button)
		"""
		generate_agenda_pdf_job(self.name)


def generate_agenda_pdf_job(doc_name):
	"""
	Background job to generate agenda PDF
	"""
	doc = frappe.get_doc("Council Meeting", doc_name)
	
	# Set flag to prevent recursion during save/update
	doc.flags.in_pdf_generation = True

	if doc.meeting_type == "City Council Meeting":
		print_format = "City Council Agenda"
	else:
		print_format = "Standing Committee Agenda"
		
	# Get HTML content
	try:
		html = frappe.get_print(
			doctype=doc.doctype,
			name=doc.name,
			print_format=print_format,
			as_pdf=False
		)
		
		# Generate PDF
		pdf_content = get_pdf(html)
		
		# Save file 
		filename = f"Agenda-{doc.name}.pdf"
		
		# Check if file exists to update content or create new
		existing_file = frappe.get_all("File", filters={
			"attached_to_doctype": doc.doctype, 
			"attached_to_name": doc.name,
			"file_name": filename
		}, limit=1)

		if existing_file:
			_file = frappe.get_doc("File", existing_file[0].name)
			_file.content = pdf_content
			_file.save()
		else:
			_file = frappe.get_doc({
				"doctype": "File",
				"file_name": filename,
				"attached_to_doctype": doc.doctype,
				"attached_to_name": doc.name,
				"content": pdf_content,
				"is_private": 0
			})
			_file.save()
		
		# Update the field value directly 
		if doc.agenda_pdf != _file.file_url:
			doc.db_set('agenda_pdf', _file.file_url)

	except Exception as e:
		frappe.log_error(f"Failed to generate PDF for {doc_name}: {str(e)}", "Agenda PDF Generation Error")
		raise e
