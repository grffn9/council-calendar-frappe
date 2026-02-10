frappe.ready(function() {
    let currentDate = new Date();
    
    function renderCalendar(date) {
        const year = date.getFullYear();
        const month = date.getMonth();
        
        // Update header
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
        const totalGridCells = 42; // Standard calendar grid
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
    
    // Wire up "New Agenda" button
    $("#btn-new-agenda").click(function() {
        $("#new-agenda-modal").modal("show");
    });

    // Wire up "Edit Existing Agenda" button
    $("#btn-edit-agenda").click(function() {
        $("#edit-agenda-modal").modal("show");
        loadUpcomingMeetings();
        // Hide update form initially
        $("#update-meeting-form").hide();
        $("#btn-delete-meeting").hide();
    });
    
    // Filter committee logic
    $("#edit-agenda-committee").change(function() {
        loadUpcomingMeetings();
    });

    function loadUpcomingMeetings() {
        const committee = $("#edit-agenda-committee").val();
        const filters = [
            ['meeting_date', '>=', frappe.datetime.now_date()]
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
                
                if (r.message) {
                    r.message.forEach(mtg => {
                        const timeParts = mtg.meeting_time.split(':');
                        const timeLabel = `${timeParts[0]}:${timeParts[1]}`;
                        
                        const row = $(`
                            <tr style="cursor: pointer;" data-name="${mtg.name}">
                                <td>${mtg.meeting_date}</td>
                                <td>${timeLabel}</td>
                                <td>${mtg.committee || mtg.meeting_type}</td>
                                <td>${mtg.location || ''}</td>
                            </tr>
                        `);
                        
                        row.click(function() {
                            // Highlight row
                            tbody.find('tr').removeClass('table-primary text-white bg-primary');
                            $(this).addClass('table-primary text-white bg-primary');
                            
                            // Load into form
                            loadMeetingForEdit(mtg.name);
                        });
                        
                        tbody.append(row);
                    });
                } else {
                    tbody.append('<tr><td colspan="4" class="text-center">No upcoming meetings found.</td></tr>');
                }
            }
        });
    }

    function loadMeetingForEdit(name) {
        frappe.call({
            method: 'frappe.client.get',
            args: {
                doctype: 'Council Meeting',
                name: name
            },
            callback: function(r) {
                if(r.message) {
                    const doc = r.message;
                    const form = $("#update-meeting-form");
                    form.show();
                    $("#btn-delete-meeting").show();
                    
                    form.find("input[name='meeting_name']").val(doc.name);
                    form.find("input[name='meeting_date']").val(doc.meeting_date);
                    form.find("input[name='meeting_time']").val(doc.meeting_time);
                    form.find("input[name='meeting_end_time']").val(doc.meeting_end_time || '');
                    form.find("input[name='location']").val(doc.location || '');
                    form.find("textarea[name='address']").val(doc.address || '');
                    form.find("input[name='meeting_re']").val(doc.meeting_re || '');
                    form.find("input[name='additional_info']").val(doc.additional_info || '');

                    // Scroll to form
                    form[0].scrollIntoView({ behavior: 'smooth' });
                }
            }
        });
    }

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
                }
            }
        });
    });

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
                        }
                    }
                });
            }
        );
    });


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
                }
            }
        });
    });

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
                fields: ['name', 'meeting_date', 'meeting_time'],
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
                             const eventHTML = `<div class="calendar-event" title="${event.name}" style="cursor: pointer;">
                                                    ${timeLabel} Meeting
                                                </div>`;
                             container.append(eventHTML);
                             
                             // Click handler for modal?
                             container.find('.calendar-event').last().click(function(e) {
                                e.stopPropagation();
                                // Open Edit Modal directly
                                $("#edit-agenda-modal").modal("show");
                                $("#update-meeting-form").show(); // Show form immediately
                                loadMeetingForEdit(event.name); // Load this specific meeting
                                
                                // Also load list in background or just clear it?
                                // Better to load list so "back" is possible, but for now just load list:
                                loadUpcomingMeetings();
                             });
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
