import frappe

def get_context(context):
    context.title = "Council Calendar"
    context.committees = frappe.get_all("Committee", fields=["name", "committee_name"], order_by="committee_name asc")
