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

    $("#save-agenda").click(function() {
        // Collect form data
        const meetingType = $("#new-agenda-form select[name='meeting_type']").val();
        const date = $("#new-agenda-form input[name='meeting_date']").val();
        const time = $("#new-agenda-form input[name='meeting_time']").val();
        
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
                    meeting_date: date,
                    meeting_time: time
                }
            },
            callback: function(r) {
                if(!r.exc) {
                    frappe.msgprint("Meeting Scheduled!");
                    $("#new-agenda-modal").modal("hide");
                    // Clear form
                    $("#new-agenda-form")[0].reset();
                    // Refresh calendar with current view
                    const current = new Date(); // Or keep track of current view state
                    // Re-rendering with current state would be ideal, but simple reload works
                    // Or just re-call renderCalendar with the date active
                    // Let's assume we want to refresh the view we are looking at? 
                    // renderCalendar(stateDate); // Need to store stateDate globally in this scope or read text
                    
                    // Simple hack: re-click header label or just reload logic
                    location.reload(); 
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
                             const eventHTML = `<div class="calendar-event" title="${event.name}">
                                                    ${timeLabel} Meeting
                                                </div>`;
                             container.append(eventHTML);
                             
                             // Click handler for modal?
                             container.find('.calendar-event').last().click(function(e) {
                                e.stopPropagation();
                                frappe.msgprint(`Meeting ID: ${event.name}`);
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
