import frappe

def execute():
    committees = [
        "Economic Development",
        "Education",
        "Municipal and Legislative Operations",
        "Public Health and Human Services",
        "Public Safety",
        "Public Service and Transportation",
        "Public Works",
        "Traffic and Parking",
        "Urban Technologies, Innovation and Environment",
        "Veterans' Memorials, Parks and Recreation"
    ]
    
    for committee_name in committees:
        if not frappe.db.exists("Committee", committee_name):
            doc = frappe.new_doc("Committee")
            doc.committee_name = committee_name
            doc.insert()
