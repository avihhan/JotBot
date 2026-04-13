var JotBotRules = (function () {
  function parseCommand(text) {
    var raw = (text || "").trim();
    var normalized = raw.toLowerCase();
    if (/#\s*(add\s*event|addevent|event)\b/.test(normalized)) {
      return { command: "add_event", rawText: raw };
    }
    if (/#\s*(note|jot)\b/.test(normalized)) {
      return { command: "note", rawText: raw };
    }
    if (/#\s*(add\s*task|addtask|task|todo)\b/.test(normalized)) {
      return { command: "add_task", rawText: raw };
    }
    if (/#\s*(cancel|delete)\b/.test(normalized)) {
      return { command: "cancel", rawText: raw };
    }
    if (/#\s*help\b/.test(normalized)) {
      return { command: "help", rawText: raw };
    }
    if (/^\/\s*(health|status)\b/.test(normalized)) {
      return { command: "health", rawText: raw };
    }
    return { command: "none", rawText: raw };
  }

  function stripCommandTag(text) {
    return String(text || "")
      .replace(/#\s*(add\s*event|addevent|event)\b/gi, "")
      .replace(/#\s*(note|jot)\b/gi, "")
      .replace(/#\s*(add\s*task|addtask|task|todo)\b/gi, "")
      .replace(/#\s*(cancel|delete)\b/gi, "")
      .replace(/#\s*help\b/gi, "")
      .trim();
  }

  function mergeEventDrafts(imageDraft, textDraft) {
    var merged = clone_(imageDraft || {});
    var text = textDraft || {};
    Object.keys(text).forEach(function (key) {
      var value = text[key];
      if (isMeaningful_(value)) merged[key] = value;
    });
    return merged;
  }

  function parseHintsFromText(text) {
    var t = (text || "").toLowerCase();
    var reminders = [];
    var reminderMatch = t.match(/(?:early reminder|remind me)\s*(\d{1,3})\s*(m|min|mins|minutes)\b/);
    if (reminderMatch) reminders.push(Number(reminderMatch[1]));
    if (/\bhigh priority\b|\bpriority\b/.test(t)) {
      return { priority: "high", reminders: reminders };
    }
    if (/\blow priority\b/.test(t)) {
      return { priority: "low", reminders: reminders };
    }
    return { reminders: reminders };
  }

  function applyHints(draft, hints) {
    var out = clone_(draft || {});
    var h = hints || {};
    if (h.priority) out.priority = h.priority;
    if (h.reminders && h.reminders.length > 0) {
      out.reminders = (out.reminders || []).concat(h.reminders).filter(uniquePositiveInts_);
    }
    return out;
  }

  function validateAndNormalizeDraft(draft, defaultTimezone, defaultDurationMinutes) {
    var d = clone_(draft || {});
    d.title = (d.title || "").trim();
    d.timezone = d.timezone || defaultTimezone;
    d.duration_minutes = Number(d.duration_minutes || defaultDurationMinutes || 60);
    d.reminders = Array.isArray(d.reminders) ? d.reminders.filter(uniquePositiveInts_) : [];

    var missing = [];
    if (!d.title) missing.push("title");
    if (!d.start_datetime_iso) missing.push("start_datetime_iso");
    if (missing.length > 0) {
      d.missing_fields = (d.missing_fields || []).concat(missing);
      return { ok: false, draft: d, missingFields: dedupe_(d.missing_fields) };
    }

    var start = new Date(d.start_datetime_iso);
    if (isNaN(start.getTime())) {
      return { ok: false, draft: d, missingFields: ["start_datetime_iso"] };
    }

    var end;
    if (d.end_datetime_iso) {
      end = new Date(d.end_datetime_iso);
      if (isNaN(end.getTime())) {
        return { ok: false, draft: d, missingFields: ["end_datetime_iso"] };
      }
    } else {
      end = new Date(start.getTime() + d.duration_minutes * 60000);
      d.end_datetime_iso = end.toISOString();
    }

    if (end.getTime() <= start.getTime()) {
      end = new Date(start.getTime() + d.duration_minutes * 60000);
      d.end_datetime_iso = end.toISOString();
    }

    return { ok: true, draft: d, startDate: start, endDate: end, missingFields: [] };
  }

  function buildClarificationMessage(missingFields) {
    var fields = (missingFields || []).join(", ");
    return "I need " + fields + " to add this event. Reply with #add event and the missing details.";
  }

  function buildConfirmationMessage(eventTitle, startDate, timezone) {
    var when = Utilities.formatDate(startDate, timezone || "UTC", "EEE, MMM d h:mm a");
    return "Added: " + eventTitle + " — " + when;
  }

  function validateNoteDraft(draft) {
    var d = clone_(draft || {});
    d.text = (d.text || "").trim();
    d.title = (d.title || "").trim();
    d.tags = Array.isArray(d.tags) ? d.tags.map(function (t) { return String(t).toLowerCase().trim(); }).filter(Boolean) : [];
    if (!d.text) {
      return { ok: false, draft: d };
    }
    return { ok: true, draft: d };
  }

  function buildNoteConfirmationMessage(title) {
    if (title) return "Noted: " + title;
    return "Note saved.";
  }

  function validateTaskDraft(draft) {
    var d = clone_(draft || {});
    d.title = (d.title || "").trim();
    d.description = (d.description || "").trim();
    if (!d.title) {
      return { ok: false, draft: d, missingFields: ["title"] };
    }
    return { ok: true, draft: d, missingFields: [] };
  }

  function buildTaskConfirmationMessage(title, dueDate, timezone) {
    if (dueDate) {
      var when = Utilities.formatDate(dueDate, timezone || "UTC", "EEE, MMM d h:mm a");
      return "Task created: " + title + " — due " + when;
    }
    return "Task created: " + title;
  }

  function buildHelpMessage() {
    return [
      "\ud83e\udd16 *JotBot Commands:*",
      "",
      "\u2022 `#add event <details>` \u2014 Schedule a Google Calendar event.",
      '  _Example: "#add event Team sync tomorrow 3pm high priority"_',
      "",
      "\u2022 `#add task <details>` \u2014 Create a Google Tasks to-do.",
      '  _Example: "#add task Buy groceries by Friday"_',
      "",
      "\u2022 `#note <text>` \u2014 Save a quick note to Google Sheets.",
      '  _Example: "#note Call dentist next week"_',
      "",
      "\u2022 `#cancel` \u2014 Delete the last event or task I created for you.",
      "",
      "\u2022 `#help` \u2014 Show this message.",
      "",
      "\u2022 `/health` \u2014 (Admin only) Check system status."
    ].join("\n");
  }

  function uniquePositiveInts_(value, index, arr) {
    if (typeof value !== "number" || value <= 0 || Math.floor(value) !== value) return false;
    return arr.indexOf(value) === index;
  }

  function dedupe_(arr) {
    var input = Array.isArray(arr) ? arr : [];
    return input.filter(function (value, index) {
      return input.indexOf(value) === index;
    });
  }

  function isMeaningful_(value) {
    if (value === null || value === undefined) return false;
    if (typeof value === "string") return value.trim().length > 0;
    if (Array.isArray(value)) return value.length > 0;
    return true;
  }

  function clone_(obj) {
    return JSON.parse(JSON.stringify(obj || {}));
  }

  return {
    parseCommand: parseCommand,
    stripCommandTag: stripCommandTag,
    mergeEventDrafts: mergeEventDrafts,
    parseHintsFromText: parseHintsFromText,
    applyHints: applyHints,
    validateAndNormalizeDraft: validateAndNormalizeDraft,
    buildClarificationMessage: buildClarificationMessage,
    buildConfirmationMessage: buildConfirmationMessage,
    validateNoteDraft: validateNoteDraft,
    buildNoteConfirmationMessage: buildNoteConfirmationMessage,
    validateTaskDraft: validateTaskDraft,
    buildTaskConfirmationMessage: buildTaskConfirmationMessage,
    buildHelpMessage: buildHelpMessage
  };
})();
