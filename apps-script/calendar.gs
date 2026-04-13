var JotBotCalendar = (function () {
  function createEventFromDraft(draft, startDate, endDate) {
    var config = JotBotConfig.getConfig();
    var calendarId = resolveCalendarId_(draft.calendar_hint, config);
    var calendar = CalendarApp.getCalendarById(calendarId) || CalendarApp.getDefaultCalendar();

    var description = (draft.description || "").trim();
    if (draft.meeting_link) {
      description = description ? description + "\n\nMeeting: " + draft.meeting_link : "Meeting: " + draft.meeting_link;
    }

    var event;
    var eventOptions = {
      description: description,
      location: draft.location || ""
    };

    if (draft.recurrence_rule) {
      var recurrence = parseRecurrenceRule_(draft.recurrence_rule);
      if (recurrence) {
        event = calendar.createEventSeries(draft.title, startDate, endDate, recurrence, eventOptions);
      }
    }
    if (!event) {
      event = calendar.createEvent(draft.title, startDate, endDate, eventOptions);
    }

    var colorName = resolveColorName_(draft.color_hint, draft.priority, draft.category, config);
    if (colorName && CalendarApp.EventColor[colorName]) {
      event.setColor(CalendarApp.EventColor[colorName]);
    }

    var reminders = Array.isArray(draft.reminders) ? draft.reminders : [];
    var urgency = typeof draft.urgency === "number" ? draft.urgency : 3;
    if (reminders.length === 0 && urgency >= 4) {
      reminders = urgency >= 5 ? [60, 15] : [60];
    }
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
      calendarId: calendar.getId(),
      isRecurring: !!draft.recurrence_rule,
      category: draft.category || ""
    };
  }

  function resolveCalendarId_(hint, config) {
    var map = JotBotConfig.parseJsonMap(config.calendarMapJson);
    var normalized = String(hint || "").toLowerCase().trim();
    if (normalized && map[normalized]) return map[normalized];
    return config.defaultCalendarId || "primary";
  }

  function resolveColorName_(hint, priority, category, config) {
    var colorMap = JotBotConfig.parseJsonMap(config.colorMapJson);
    var normalizedHint = String(hint || "").toLowerCase().trim();
    if (normalizedHint && colorMap[normalizedHint]) return colorMap[normalizedHint];

    if (category) {
      var categoryMap = JotBotConfig.parseJsonMap(config.categoryColorMapJson);
      var normalizedCategory = String(category).toLowerCase().trim();
      if (normalizedCategory && categoryMap[normalizedCategory]) return categoryMap[normalizedCategory];
    }

    if (priority === "high") return "RED";
    if (priority === "low") return "GRAY";
    return "PALE_BLUE";
  }

  function parseRecurrenceRule_(rrule) {
    if (!rrule || typeof rrule !== "string") return null;
    try {
      var recurrence = CalendarApp.newRecurrence();
      var upper = rrule.toUpperCase();
      var parts = {};
      upper.split(";").forEach(function (part) {
        var kv = part.split("=");
        if (kv.length === 2) parts[kv[0].trim()] = kv[1].trim();
      });

      var freq = parts.FREQ;
      if (!freq) return null;

      var dayMap = {
        MO: CalendarApp.Weekday.MONDAY,
        TU: CalendarApp.Weekday.TUESDAY,
        WE: CalendarApp.Weekday.WEDNESDAY,
        TH: CalendarApp.Weekday.THURSDAY,
        FR: CalendarApp.Weekday.FRIDAY,
        SA: CalendarApp.Weekday.SATURDAY,
        SU: CalendarApp.Weekday.SUNDAY
      };

      var rule;
      if (freq === "DAILY") {
        rule = recurrence.addDailyRule();
      } else if (freq === "WEEKLY") {
        rule = recurrence.addWeeklyRule();
        if (parts.BYDAY) {
          var days = parts.BYDAY.split(",").map(function (d) { return dayMap[d.trim()]; }).filter(Boolean);
          if (days.length > 0) rule.onlyOnWeekdays(days);
        }
      } else if (freq === "MONTHLY") {
        rule = recurrence.addMonthlyRule();
      } else if (freq === "YEARLY") {
        rule = recurrence.addYearlyRule();
      } else {
        return null;
      }

      var interval = Number(parts.INTERVAL);
      if (interval && interval > 1) rule.interval(interval);
      var count = Number(parts.COUNT);
      if (count && count > 0) rule.times(count);
      if (parts.UNTIL) {
        var untilDate = new Date(parts.UNTIL.replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3"));
        if (!isNaN(untilDate.getTime())) rule.until(untilDate);
      }

      return recurrence;
    } catch (err) {
      console.error("parseRecurrenceRule_ failed:", err);
      return null;
    }
  }

  return {
    createEventFromDraft: createEventFromDraft
  };
})();
