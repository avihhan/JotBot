var JotBotRules = (function () {
  function parseCommand(text) {
    var raw = (text || "").trim();
    var normalized = raw.toLowerCase();
    var hasAddEvent = /#\s*(add\s*event|addevent|event)\b/.test(normalized);
    if (hasAddEvent) {
      return { command: "add_event", rawText: raw };
    }
    return { command: "none", rawText: raw };
  }

  function stripCommandTag(text) {
    return String(text || "")
      .replace(/#\s*(add\s*event|addevent|event)\b/gi, "")
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
    buildConfirmationMessage: buildConfirmationMessage
  };
})();
