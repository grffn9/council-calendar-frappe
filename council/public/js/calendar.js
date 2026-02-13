/**
 * Council Calendar Application Script
 * 
 * Use: Public-facing calendar interface
 * Description: Handles the rendering of the monthly calendar grid, fetching of meeting events,
 * and management (creation/editing) of Council Meeting documents via modal interfaces.
 * 
 * Dependencies:
 * - jQuery (included in Frappe)
 * - Frappe Framework Client API
 */

frappe.ready(function() {
    // Initialize namespace
    frappe.provide('frappe.council');

    /**
     * Opens the PDF viewer in a modal dialog.
     * @param {string} url - The URL of the PDF file to viewing.
     */
    frappe.council.open_pdf = function(url) {
        // Construct the viewer URL with the file parameter
        const viewerUrl = `/assets/council/pdfjs/web/viewer.html?file=${encodeURIComponent(url)}`;
        
        // Create a Frappe Dialog containing the iframe
        // Note: We inject HTML directly into the body to avoid 'make_control' errors 
        // that can occur on public pages where the full Desk form library isn't loaded.
        const d = new frappe.ui.Dialog({
            title: 'Meeting Agenda'
        });
        
        const content = `<div style="width: 100%; height: 100%;">
            <iframe src="${viewerUrl}" style="width: 100%; height: 80vh; border: none;" allowfullscreen></iframe>
        </div>`;
        
        d.show();
        
        // Inject content directly
        d.$body.html(content);
        
        // Adjust modal width to be wider for better viewing
        d.$wrapper.find('.modal-dialog').css('max-width', '90%');
        d.$wrapper.find('.modal-content').css('height', '90vh');
    };

    let currentDate = new Date();
    
    /**
     * Renders the calendar grid for the specified date's month.
     * Clears the existing grid, calculates day positions, and fills in day cells.
     * Triggers event fetching after rendering the grid.
     * 
     * @param {Date} date - The date object determining which month to display.
     */
    function renderCalendar(date) {
        const year = date.getFullYear();
        const month = date.getMonth();
        
        // Update the header label with full month name and year
        const monthNames = ["January", "February", "March", "April", "May", "June",
            "July", "August", "September", "October", "November", "December"
        ];
        $("#month-year-label").text(`${monthNames[month]} ${year}`);
        
        // Calculate Grid
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0); // Last day of current month
        const prevLastDay = new Date(year, month, 0); // Last day of prev month
        
        const startDayIndex = firstDay.getDay(); // 0 is Sunday
        const totalDays = lastDay.getDate();
        const grid = $("#calendar-grid");
        grid.empty();
        
        let daysHTML = "";
        
        // Previous month filler
        for (let i = startDayIndex; i > 0; i--) {
            const dayNum = prevLastDay.getDate() - i + 1;
            daysHTML += `<div class="calendar-day other-month"><span class="day-number">${dayNum}</span></div>`;
        }
        
        // Current month days
        for (let i = 1; i <= totalDays; i++) {
            // Check if today
            const now = new Date();
            const isToday = (i === now.getDate() && month === now.getMonth() && year === now.getFullYear()) ? "today" : "";
            
            // Format date key for event lookup YYYY-MM-DD
            const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
            
            daysHTML += `<div class="calendar-day ${isToday}" data-date="${dateKey}">
                            <span class="day-number">${i}</span>
                            <div class="events-container" id="events-${dateKey}"></div>
                         </div>`;
        }
        
        // Next month filler
        const usedCells = startDayIndex + totalDays;
        
        // Need to fill at least until the end of the required rows
        // 5 rows = 35, 6 rows = 42
        const rowsNeeded = Math.ceil((startDayIndex + totalDays) / 7);
        const nextMonthDays = (rowsNeeded * 7) - usedCells;
        
        for (let i = 1; i <= nextMonthDays; i++) {
             daysHTML += `<div class="calendar-day other-month"><span class="day-number">${i}</span></div>`;
        }
        
        grid.append(daysHTML);
        
        // Fetch Events
        fetchEvents(year, month + 1);
    }
    
    /**
     * Event Listener: Open the "New Agenda" modal.
     */
    $("#btn-new-agenda").click(function() {
        $("#new-agenda-modal").modal("show");
    });

    /**
     * Event Listener: Open the "Edit Existing Agenda" modal.
     * Also initializes the list of upcoming meetings.
     */
    $("#btn-edit-agenda").click(function() {
        $("#edit-agenda-modal").modal("show");
        loadUpcomingMeetings();
        // Hide update form initially
        $("#update-meeting-form").hide();
        $("#btn-delete-meeting").hide();
    });
    
    /**
     * Event Listener: Filter the upcoming meetings list when committee selection changes.
     */
    $("#edit-agenda-committee").change(function() {
        loadUpcomingMeetings();
    });

    /**
     * Event Listener: Delegated click for meeting rows in the edit modal.
     * Replaces individual row listeners for better performance and reliability.
     */
    $("#existing-meetings-list").on("click", "tr", function() {
        const name = $(this).attr('data-name');
        console.log("Meeting row clicked:", name);
        
        if (name) {
            // Visual feedback
            $(this).siblings().removeClass('table-primary text-white bg-primary');
            $(this).addClass('table-primary text-white bg-primary');
            
            // Load form
            loadMeetingForEdit(name);
        }
    });

    /**
     * Retrieves a list of upcoming meetings and populates the table in the edit modal.
     * Filters by committee if one is selected.
     */
    function loadUpcomingMeetings() {
        const committee = $("#edit-agenda-committee").val();
        const filters = [
            ['meeting_date', '>=', frappe.datetime.now_date()],
            ['docstatus', '=', 0]
        ];
        
        if (committee) {
            filters.push(['committee', '=', committee]);
        }

        frappe.call({
            method: 'frappe.client.get_list',
            args: {
                doctype: 'Council Meeting',
                fields: ['name', 'meeting_date', 'meeting_time', 'committee', 'location', 'meeting_type'],
                filters: filters,
                order_by: 'meeting_date asc, meeting_time asc',
                limit_page_length: 50
            },
            callback: function(r) {
                const tbody = $("#existing-meetings-list");
                tbody.empty();
                
                if (r.message && r.message.length) {
                    r.message.forEach(mtg => {
                        const timeParts = mtg.meeting_time.split(':');
                        const timeLabel = `${timeParts[0]}:${timeParts[1]}`;
                        
                        const row = $('<tr style="cursor: pointer;"></tr>').attr('data-name', mtg.name);
                        $('<td></td>').text(mtg.meeting_date).appendTo(row);
                        $('<td></td>').text(timeLabel).appendTo(row);
                        $('<td></td>').text(mtg.committee || mtg.meeting_type).appendTo(row);
                        $('<td></td>').text(mtg.location || '').appendTo(row);
                        
                        tbody.append(row);
                    });
                } else {
                    tbody.append('<tr><td colspan="4" class="text-center">No upcoming meetings found.</td></tr>');
                }
            }
        });
    }

    /**
     * Fetches details for a single meeting and populates the update form fields.
     * 
     * @param {string} name - The ID (name) of the Council Meeting document.
     */
    function loadMeetingForEdit(name) {
        console.log("loadMeetingForEdit called with:", name);
        if (!name) {
            frappe.msgprint("Error: No meeting ID provided.");
            return;
        }
        
        frappe.call({
            method: 'frappe.client.get_list',
            args: {
                doctype: 'Council Meeting',
                filters: { name: name },
                fields: ['*'],
                limit_page_length: 1
            },
            callback: function(r) {
                if(r.message && r.message.length > 0) {
                    const doc = r.message[0];
                    const form = $("#update-meeting-form");
                    
                    // Show form first
                    form.show();
                    $("#btn-delete-meeting").show();
                    
                    // Helper to format time (HH:MM:SS -> HH:MM)
                    const formatTime = (t) => {
                        if (!t) return '';
                        const parts = t.split(':');
                        if (parts.length >= 2) return `${parts[0]}:${parts[1]}`;
                        return t;
                    };

                    // Populate fields
                    form.find("input[name='meeting_name']").val(doc.name);
                    form.find("input[name='meeting_name']").attr("data-original-val", doc.name);
                    
                    form.find("input[name='meeting_date']").val(doc.meeting_date);
                    form.find("input[name='meeting_time']").val(formatTime(doc.meeting_time));
                    form.find("input[name='meeting_end_time']").val(formatTime(doc.meeting_end_time));
                    
                    form.find("input[name='location']").val(doc.location || '');
                    form.find("textarea[name='address']").val(doc.address || '');
                    form.find("input[name='meeting_re']").val(doc.meeting_re || '');
                    form.find("input[name='additional_info']").val(doc.additional_info || '');

                    // Scroll to form
                    setTimeout(() => {
                        if (form[0]) {
                            form[0].scrollIntoView({ behavior: 'smooth' });
                        }
                    }, 100);
                } else {
                     frappe.msgprint("Could not retrieve meeting details.");
                }
            }
        });
    }

    /**
     * Event Listener: Confirm Button for Updating a Meeting.
     * Collects form data and sends a set_value request to update the record.
     */
    $("#btn-update-meeting-confirm").click(function() {
        const form = $("#update-meeting-form");
        const name = form.find("input[name='meeting_name']").val();
        
        if (!name) return;

        const values = {
            meeting_date: form.find("input[name='meeting_date']").val(),
            meeting_time: form.find("input[name='meeting_time']").val(),
            meeting_end_time: form.find("input[name='meeting_end_time']").val(),
            location: form.find("input[name='location']").val(),
            address: form.find("textarea[name='address']").val(),
            meeting_re: form.find("input[name='meeting_re']").val(),
            additional_info: form.find("input[name='additional_info']").val()
        };

        frappe.call({
            method: 'frappe.client.set_value',
            args: {
                doctype: 'Council Meeting',
                name: name,
                fieldname: values
            },
            callback: function(r) {
                if(!r.exc) {
                    frappe.msgprint("Meeting Updated Successfully");
                    $("#edit-agenda-modal").modal("hide");
                    renderCalendar(currentDate); // Refresh UI
                } else {
                    if(r._server_messages) {
                        frappe.msgprint(JSON.parse(r._server_messages).join("<br>"));
                    } else {
                        frappe.msgprint("An error occurred while updating the meeting.");
                    }
                }
            }
        });
    });
    
    /**
     * Event Listener: Delete Button for a Meeting.
     * Prompts for confirmation before deleting the record.
     */
    $("#btn-delete-meeting").click(function() {
        const form = $("#update-meeting-form");
        const name = form.find("input[name='meeting_name']").val();
        
        if (!name) return;

        frappe.confirm('Are you sure you want to delete this meeting? This action cannot be undone.',
            () => {
                // Yes
                frappe.call({
                    method: 'frappe.client.delete',
                    args: {
                        doctype: 'Council Meeting',
                        name: name
                    },
                    callback: function(r) {
                        if(!r.exc) {
                            frappe.msgprint("Meeting Deleted Successfully");
                            $("#edit-agenda-modal").modal("hide");
                            renderCalendar(currentDate); // Refresh UI
                        } else {
                            if(r._server_messages) {
                                frappe.msgprint(JSON.parse(r._server_messages).join("<br>"));
                            } else {
                                frappe.msgprint("An error occurred while deleting the meeting.");
                            }
                        }
                    }
                });
            }
        );
    });

    /**
     * Event Listener: Save Button for Creating a New Agenda.
     * Validates input and creates a new Council Meeting document.
     */
    $("#save-agenda").click(function() {
        // Collect form data
        const form = $("#new-agenda-form");
        const meetingType = form.find("select[name='meeting_type']").val();
        const committee = form.find("select[name='committee']").val();
        const date = form.find("input[name='meeting_date']").val();
        const time = form.find("input[name='meeting_time']").val();
        const endTime = form.find("input[name='meeting_end_time']").val();
        const location = form.find("input[name='location']").val();
        const address = form.find("textarea[name='address']").val();
        const re = form.find("input[name='meeting_re']").val();
        const additional = form.find("input[name='additional_info']").val();
        
        if(!date || !time || !meetingType) {
            frappe.msgprint("Please provide Meeting Type, Date and Time.");
            return;
        }

        frappe.call({
            method: 'frappe.client.insert',
            args: {
                doc: {
                    doctype: 'Council Meeting',
                    meeting_type: meetingType,
                    committee: committee,
                    meeting_date: date,
                    meeting_time: time,
                    meeting_end_time: endTime,
                    location: location,
                    address: address,
                    meeting_re: re,
                    additional_info: additional
                }
            },
            callback: function(r) {
                if(!r.exc) {
                    frappe.msgprint("Meeting Scheduled!");
                    $("#new-agenda-modal").modal("hide");
                    // Clear form
                    $("#new-agenda-form")[0].reset();
                    // Refresh calendar with current view
                    renderCalendar(currentDate); 
                } else {
                    if(r._server_messages) {
                        frappe.msgprint(JSON.parse(r._server_messages).join("<br>"));
                    } else {
                        frappe.msgprint("An error occurred while creating the meeting.");
                    }
                }
            }
        });
    });

    /**
     * Fetches meeting events for a specific month/year and renders them on the calendar.
     * 
     * @param {number} year - Four-digit year.
     * @param {number} month - Month index (1-based for string formatting, but careful with Date logic).
     */
    function fetchEvents(year, month) {
        // Construct date range
        const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
        // Get last day number correctly
        const lastDay = new Date(year, month, 0).getDate();
        const endDate = `${year}-${String(month).padStart(2, '0')}-${lastDay}`;
        
        frappe.call({
            method: 'frappe.client.get_list',
            args: {
                doctype: 'Council Meeting',
                fields: ['name', 'meeting_date', 'meeting_time', 'agenda_pdf'],
                filters: [
                    ['meeting_date', '>=', startDate],
                    ['meeting_date', '<=', endDate]
                ],
                order_by: 'meeting_time asc'
            },
            callback: function(r) {
                if (r.message) {
                    r.message.forEach(event => {
                         const eventDate = event.meeting_date;
                         const container = $(`#events-${eventDate}`);
                         if (container.length) {
                             const timeParts = event.meeting_time.split(':');
                             const timeLabel = `${timeParts[0]}:${timeParts[1]}`;
                        const eventHTML = $(`<div class="calendar-event" style="cursor: pointer;">
                                                ${timeLabel} Meeting
                                            </div>`);
                        eventHTML.attr('title', event.name);
                        
                        // Click Handlers (Single vs Double)
                        let clicks = 0;
                        let timer = null;
                        
                        eventHTML.on("click", function(e){
                             e.stopPropagation();
                             clicks++;
                             if(clicks === 1) {
                                 timer = setTimeout(function() {
                                     // Single Click Action -> Edit
                                     $("#edit-agenda-modal").modal("show");
                                     $("#update-meeting-form").show(); 
                                     loadMeetingForEdit(event.name);
                                     loadUpcomingMeetings();
                                     clicks = 0;
                                 }, 300); // 300ms delay to wait for potential second click
                             } else {
                                 // Double Click Action -> View PDF
                                 clearTimeout(timer);
                                 clicks = 0;
                                 if (event.agenda_pdf) {
                                     frappe.council.open_pdf(event.agenda_pdf);
                                 } else {
                                     frappe.msgprint("No agenda PDF available yet. Please save the meeting again to generate it.");
                                 }
                             }
                        }).on("dblclick", function(e){
                             e.preventDefault(); // Prevent default double click behavior if any
                        });

                        container.append(eventHTML);
                         }
                    });
                }
            }
        });
    }
    
    // Initial Render
    renderCalendar(currentDate);
    
    // Listeners
    $("#prev-month").click(function() {
        currentDate.setMonth(currentDate.getMonth() - 1);
        renderCalendar(currentDate);
    });
    
    $("#next-month").click(function() {
        currentDate.setMonth(currentDate.getMonth() + 1);
        renderCalendar(currentDate);
    });
});
