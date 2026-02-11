// Copyright (c) 2026, TBD and contributors
// For license information, please see license.txt

frappe.ui.form.on("Council Meeting", {
	refresh(frm) {
        if (!frm.is_new()) {
            frm.add_custom_button('Generate Agenda PDF', function() {
                frappe.call({
                    method: 'generate_agenda_pdf',
                    doc: frm.doc,
                    freeze: true,
                    freeze_message: "Generating PDF...",
                    callback: function(r) {
                        if (!r.exc) {
                            frappe.msgprint('Agenda PDF generated successfully!');
                            frm.reload_doc();
                        }
                    }
                });
            });
        }
	},
});
