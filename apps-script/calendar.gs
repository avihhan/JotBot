var JotBotCalendar = (function () {
  function createEventFromDraft(draft, startDate, endDate) {
    var config = JotBotConfig.getConfig();
    var calendar = getCalendar_(resolveCalendarId_(draft.calendar_hint, config));

    var description = (draft.description || "").trim();
    if (draft.meeting_link) {
      description = description ? description + "\n\nMeeting: " + draft.meeting_link : "Meeting: " + draft.meeting_link;
    }

    var event = calendar.createEvent(draft.title, startDate, endDate, {
      description: description,
      location: draft.location || ""
    });

    var colorName = resolveColorName_(draft.color_hint, draft.priority, config);
    if (colorName && CalendarApp.EventColor[colorName]) {
      event.setColor(CalendarApp.EventColor[colorName]);
    }

    var reminders = Array.isArray(draft.reminders) ? draft.reminders : [];
    if (reminders.length > 0) {
      event.removeAllReminders();
      reminders.forEach(function (mins) {
        if (typeof mins === "number" && mins > 0) event.addPopupReminder(mins);
      });
    }

    return {
      eventId: event.getId(),
      title: event.getTitle(),
      startDate: event.getStartTime(),
      timezone: draft.timezone || config.defaultTimezone,
      calendarId: calendar.getId()
    };
  }

  function listEventsForToday(timezone) {
    var config = JotBotConfig.getConfig();
    var calendarId = resolveCalendarId_(null, config);
    var calendar = getCalendar_(calendarId);
    var range = buildTodayRange_(timezone || config.defaultTimezone);
    var events = calendar.getEvents(range.startDate, range.endDate);

    return {
      calendarId: calendar.getId(),
      calendarName: calendar.getName(),
      timezone: range.timezone,
      events: events.map(function (event) {
        return {
          id: event.getId(),
          title: event.getTitle(),
          startDate: event.getStartTime(),
          endDate: event.getEndTime(),
          isAllDay: event.isAllDayEvent()
        };
      }).sort(function (a, b) {
        return a.startDate.getTime() - b.startDate.getTime();
      })
    };
  }

  function resolveCalendarId_(hint, config) {
    var map = JotBotConfig.parseJsonMap(config.calendarMapJson);
    var normalized = String(hint || "").toLowerCase().trim();
    if (normalized && map[normalized]) return map[normalized];
    return config.defaultCalendarId || "primary";
  }

  function getCalendar_(calendarId) {
    return CalendarApp.getCalendarById(calendarId) || CalendarApp.getDefaultCalendar();
  }

  function buildTodayRange_(timezone) {
    var zone = timezone || Session.getScriptTimeZone() || "UTC";
    var today = Utilities.formatDate(new Date(), zone, "yyyy-MM-dd");
    var startDate = new Date(today + "T00:00:00");
    var endDate = new Date(today + "T23:59:59");
    return {
      timezone: zone,
      startDate: startDate,
      endDate: endDate
    };
  }

  function resolveColorName_(hint, priority, config) {
    var map = JotBotConfig.parseJsonMap(config.colorMapJson);
    var normalizedHint = String(hint || "").toLowerCase().trim();
    if (normalizedHint && map[normalizedHint]) return map[normalizedHint];
    if (priority === "high") return "RED";
    if (priority === "low") return "GRAY";
    return "PALE_BLUE";
  }

  return {
    createEventFromDraft: createEventFromDraft,
    listEventsForToday: listEventsForToday
  };
})();
