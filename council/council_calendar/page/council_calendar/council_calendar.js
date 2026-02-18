/**
 * Council Calendar – Desk Page
 *
 * Renders a full monthly calendar grid inside the Frappe Desk,
 * with modals for creating / editing / deleting Council Meeting documents
 * and an inline PDF viewer.
 */

frappe.pages["council-calendar"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: "Council Calendar",
		single_column: true,
	});

	// ── Kick-off ──────────────────────────────────────────────
	build_calendar_ui(page);
};

/* ================================================================
   UI BUILDER – injects all static HTML into the page wrapper
   ================================================================ */
function build_calendar_ui(page) {
	const $main = $(page.main);

	// ── Calendar shell ────────────────────────────────────────
	$main.html(`
		<div class="cc-calendar-wrapper">
			<!-- Month nav + action buttons -->
			<div class="cc-calendar-header">
				<div class="cc-header-left">
					<button class="btn btn-default btn-sm" id="cc-prev-month">
						<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16">
							<path fill-rule="evenodd" d="M11.354 1.646a.5.5 0 0 1 0 .708L5.707 8l5.647 5.646a.5.5 0 0 1-.708.708l-6-6a.5.5 0 0 1 0-.708l6-6a.5.5 0 0 1 .708 0z"/>
						</svg>
					</button>
					<button class="btn btn-default btn-sm" id="cc-next-month">
						<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16">
							<path fill-rule="evenodd" d="M4.646 1.646a.5.5 0 0 1 .708 0l6 6a.5.5 0 0 1 0 .708l-6 6a.5.5 0 0 1-.708-.708L10.293 8 4.646 2.354a.5.5 0 0 1 0-.708z"/>
						</svg>
					</button>
				</div>

				<h3 id="cc-month-year-label" class="cc-month-title"></h3>

				<div class="cc-header-right">
					<button class="btn btn-default btn-sm" id="cc-btn-edit-agenda">Edit Existing Agenda</button>
					<button class="btn btn-primary btn-sm"  id="cc-btn-new-agenda">New Agenda</button>
				</div>
			</div>

			<!-- Weekday headers -->
			<div class="cc-weekdays">
				<div>Sun</div><div>Mon</div><div>Tue</div><div>Wed</div>
				<div>Thu</div><div>Fri</div><div>Sat</div>
			</div>

			<!-- Day grid (filled by JS) -->
			<div class="cc-grid" id="cc-calendar-grid"></div>
		</div>
	`);

	// ── Wire everything up ────────────────────────────────────
	init_calendar_logic($main);
}

/* ================================================================
   CORE LOGIC
   ================================================================ */
function init_calendar_logic($root) {
	let currentDate = new Date();

	// ── Helpers ───────────────────────────────────────────────
	const MONTH_NAMES = [
		"January","February","March","April","May","June",
		"July","August","September","October","November","December",
	];

	function pad2(n) { return String(n).padStart(2, "0"); }

	// ── PDF viewer (Desk-safe dialog) ─────────────────────────
	function open_pdf(url) {
		const viewerUrl = `/assets/council/pdfjs/web/viewer.html?file=${encodeURIComponent(url)}`;
		const d = new frappe.ui.Dialog({ title: "Meeting Agenda" });
		d.show();
		d.$body.empty().append(
			$("<div>").css({ width: "100%", height: "100%" }).append(
				$("<iframe>", { src: viewerUrl, allowfullscreen: true })
					.css({ width: "100%", height: "80vh", border: "none" })
			)
		);
		d.$wrapper.find(".modal-dialog").css("max-width", "90%");
		d.$wrapper.find(".modal-content").css("height", "90vh");
	}

	// ── Calendar rendering ────────────────────────────────────
	function renderCalendar(date) {
		const year  = date.getFullYear();
		const month = date.getMonth();

		$root.find("#cc-month-year-label").text(`${MONTH_NAMES[month]} ${year}`);

		const firstDay      = new Date(year, month, 1);
		const lastDay       = new Date(year, month + 1, 0);
		const prevLastDay   = new Date(year, month, 0);
		const startDayIndex = firstDay.getDay();
		const totalDays     = lastDay.getDate();
		const grid          = $root.find("#cc-calendar-grid");
		grid.empty();

		let html = "";

		// Previous-month filler
		for (let i = startDayIndex; i > 0; i--) {
			const d = prevLastDay.getDate() - i + 1;
			html += `<div class="cc-day cc-other-month"><span class="cc-day-number">${d}</span></div>`;
		}

		// Current month
		const now = new Date();
		for (let i = 1; i <= totalDays; i++) {
			const isToday =
				i === now.getDate() && month === now.getMonth() && year === now.getFullYear()
					? "cc-today" : "";
			const dateKey = `${year}-${pad2(month + 1)}-${pad2(i)}`;
			html += `<div class="cc-day ${isToday}" data-date="${dateKey}">
						<span class="cc-day-number">${i}</span>
						<div class="cc-events" id="cc-events-${dateKey}"></div>
					 </div>`;
		}

		// Next-month filler
		const rowsNeeded   = Math.ceil((startDayIndex + totalDays) / 7);
		const nextDays     = rowsNeeded * 7 - (startDayIndex + totalDays);
		for (let i = 1; i <= nextDays; i++) {
			html += `<div class="cc-day cc-other-month"><span class="cc-day-number">${i}</span></div>`;
		}

		grid.html(html);
		fetchEvents(year, month + 1);
	}

	// ── Fetch & render events ─────────────────────────────────
	function fetchEvents(year, month) {
		const startDate = `${year}-${pad2(month)}-01`;
		const lastDay   = new Date(year, month, 0).getDate();
		const endDate   = `${year}-${pad2(month)}-${lastDay}`;

		frappe.call({
			method: "frappe.client.get_list",
			args: {
				doctype: "Council Meeting",
				fields: ["name", "meeting_date", "meeting_time", "agenda_pdf"],
				filters: [
					["meeting_date", ">=", startDate],
					["meeting_date", "<=", endDate],
				],
				order_by: "meeting_time asc",
			},
			callback(r) {
				if (!r.message) return;
				r.message.forEach(function (ev) {
					const container = $root.find(`#cc-events-${ev.meeting_date}`);
					if (!container.length) return;

					const timeParts = ev.meeting_time.split(":");
					const timeLabel = `${timeParts[0]}:${timeParts[1]}`;
					const $event = $(`<div class="cc-event">${timeLabel} Meeting</div>`);
					$event.attr("title", ev.name);

					// Single-click → open meeting in Desk form
					// Double-click → view PDF
					let clicks = 0, timer = null;
					$event.on("click", function (e) {
						e.stopPropagation();
						clicks++;
						if (clicks === 1) {
							timer = setTimeout(function () {
								clicks = 0;
								frappe.set_route("Form", "Council Meeting", ev.name);
							}, 300);
						} else {
							clearTimeout(timer);
							clicks = 0;
							if (ev.agenda_pdf) {
								open_pdf(ev.agenda_pdf);
							} else {
								frappe.show_alert({
									message: __("No agenda PDF attached yet."),
									indicator: "orange",
								});
							}
						}
					}).on("dblclick", function (e) { e.preventDefault(); });

					container.append($event);
				});
			},
		});
	}

	// ── New-meeting dialog ────────────────────────────────────
	function show_new_meeting_dialog() {
		// Fetch committees for the dropdown
		frappe.call({
			method: "frappe.client.get_list",
			args: {
				doctype: "Committee",
				fields: ["name", "committee_name"],
				order_by: "committee_name asc",
				limit_page_length: 0,
			},
			callback(r) {
				const committees = (r.message || []);
				const committee_options = [""].concat(committees.map(c => c.name));

				const d = new frappe.ui.Dialog({
					title: "New Agenda",
					size: "large",
					fields: [
						{
							fieldname: "meeting_type", label: "Meeting Type",
							fieldtype: "Select", reqd: 1,
							options: "\nCity Council Meeting\nStanding Committee Meeting",
						},
						{
							fieldname: "committee", label: "Committee",
							fieldtype: "Link", options: "Committee",
						},
						{ fieldtype: "Section Break" },
						{
							fieldname: "meeting_date", label: "Date of Meeting",
							fieldtype: "Date", reqd: 1,
						},
						{
							fieldname: "meeting_time", label: "Start Time",
							fieldtype: "Time", reqd: 1,
						},
						{
							fieldname: "meeting_end_time", label: "End Time",
							fieldtype: "Time",
						},
						{ fieldtype: "Column Break" },
						{
							fieldname: "location", label: "Location",
							fieldtype: "Data",
						},
						{
							fieldname: "address", label: "Address",
							fieldtype: "Small Text",
						},
						{ fieldtype: "Section Break" },
						{
							fieldname: "meeting_re", label: "Re:",
							fieldtype: "Data",
						},
						{
							fieldname: "additional_info", label: "Additional Info",
							fieldtype: "Data",
							description: "e.g. Cancelled, Rescheduled, etc.",
						},
					],
					primary_action_label: "Save",
					primary_action(values) {
						frappe.call({
							method: "frappe.client.insert",
							args: {
								doc: Object.assign({ doctype: "Council Meeting" }, values),
							},
							callback(r) {
								if (!r.exc) {
									frappe.show_alert({ message: __("Meeting Scheduled!"), indicator: "green" });
									d.hide();
									renderCalendar(currentDate);
								}
							},
						});
					},
				});
				d.show();
			},
		});
	}

	// ── Edit-meeting dialog ───────────────────────────────────
	function show_edit_meeting_dialog() {
		const d = new frappe.ui.Dialog({
			title: "Edit Existing Meeting",
			size: "extra-large",
			fields: [
				{
					fieldname: "filter_committee", label: "Filter by Committee",
					fieldtype: "Link", options: "Committee",
					change() {
						load_meetings_into_dialog(d);
					},
				},
				{ fieldtype: "Section Break" },
				{
					fieldname: "meetings_html", label: "Upcoming Meetings",
					fieldtype: "HTML",
				},
			],
		});

		d.show();
		load_meetings_into_dialog(d);
	}

	function load_meetings_into_dialog(dlg) {
		const committee = dlg.get_value("filter_committee");
		const filters = [
			["meeting_date", ">=", frappe.datetime.now_date()],
			["docstatus", "=", 0],
		];
		if (committee) filters.push(["committee", "=", committee]);

		frappe.call({
			method: "frappe.client.get_list",
			args: {
				doctype: "Council Meeting",
				fields: ["name", "meeting_date", "meeting_time", "committee", "location", "meeting_type"],
				filters,
				order_by: "meeting_date asc, meeting_time asc",
				limit_page_length: 50,
			},
			callback(r) {
				const meetings = r.message || [];
				const $wrapper = dlg.fields_dict.meetings_html.$wrapper;
				$wrapper.empty();

				if (!meetings.length) {
					$wrapper.html('<p class="text-muted text-center">No upcoming meetings found.</p>');
					return;
				}

				let html = `<table class="table table-hover table-sm">
					<thead><tr>
						<th>Date</th><th>Time</th><th>Committee</th><th>Location</th>
					</tr></thead><tbody>`;

				meetings.forEach(function (m) {
					const tp = m.meeting_time.split(":");
					html += `<tr data-name="${m.name}" style="cursor:pointer">
						<td>${m.meeting_date}</td>
						<td>${tp[0]}:${tp[1]}</td>
						<td>${m.committee || m.meeting_type}</td>
						<td>${m.location || ""}</td>
					</tr>`;
				});
				html += "</tbody></table>";

				$wrapper.html(html);

				// Row click → navigate to the meeting form in Desk
				$wrapper.find("tr[data-name]").on("click", function () {
					const name = $(this).data("name");
					dlg.hide();
					frappe.set_route("Form", "Council Meeting", name);
				});
			},
		});
	}

	// ── Event bindings ────────────────────────────────────────
	$root.find("#cc-prev-month").on("click", function () {
		currentDate.setMonth(currentDate.getMonth() - 1);
		renderCalendar(currentDate);
	});

	$root.find("#cc-next-month").on("click", function () {
		currentDate.setMonth(currentDate.getMonth() + 1);
		renderCalendar(currentDate);
	});

	$root.find("#cc-btn-new-agenda").on("click",  show_new_meeting_dialog);
	$root.find("#cc-btn-edit-agenda").on("click", show_edit_meeting_dialog);

	// ── Initial render ────────────────────────────────────────
	renderCalendar(currentDate);
}