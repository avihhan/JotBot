function doGet(e) {
  try {
    var params = e && e.parameter ? e.parameter : {};
    var mode = params["hub.mode"];
    var verifyToken = params["hub.verify_token"];
    var challenge = params["hub.challenge"];
    var config = JotBotConfig.getConfig();

    if (mode === "subscribe" && verifyToken === config.waVerifyToken) {
      return ContentService.createTextOutput(challenge || "");
    }
    return ContentService.createTextOutput("verification_failed");
  } catch (err) {
    console.error("doGet error:", err);
    return ContentService.createTextOutput("error");
  }
}

function doPost(e) {
  try {
    var body = e && e.postData && e.postData.contents ? e.postData.contents : "{}";
    var payload = JSON.parse(body);
    JotBotApp.handleWebhook(payload);
    return ContentService.createTextOutput("ok");
  } catch (err) {
    console.error("doPost error:", err);
    JotBotApp.appendDeadLetter("webhook_parse_error", { raw: e && e.postData ? e.postData.contents : null, error: String(err) });
    return ContentService.createTextOutput("accepted_with_error");
  }
}

var JotBotApp = (function () {
  var commandHandlers_ = {
    add_event: processAddEvent_,
    note: processNote_,
    cancel: processCancel_,
    help: processHelp_
  };

  function handleWebhook(payload) {
    var config = JotBotConfig.requireKeys(["waAccessToken", "waPhoneNumberId", "geminiApiKey"]);
    var allowedSenders = JotBotConfig.getAllowedSenders(config);
    var messages = JotBotWhatsApp.parseIncomingMessages(payload);

    Logger.log("Parsed " + messages.length + " message(s) from webhook payload");
    messages.forEach(function (message) {
      try {
        Logger.log("Processing message id=" + message.id + " from=" + message.from);
        if (isDuplicateMessage_(message.id, config)) {
          Logger.log("Duplicate message, skipping: " + message.id);
          return;
        }
        if (!isSenderAllowed_(message.from, config, allowedSenders)) {
          Logger.log("Sender not allowed: " + message.from);
          return;
        }

        var textForCommand = message.caption || message.text || "";
        var command = JotBotRules.parseCommand(textForCommand);
        Logger.log("Command detected: " + command.command + " | text: " + textForCommand);
        if (!commandHandlers_[command.command]) {
          JotBotWhatsApp.sendTextMessage(message.from, JotBotRules.buildHelpMessage(), message.id);
          return;
        }
        commandHandlers_[command.command](message, config);
      } catch (err) {
        console.error("Message processing failed:", err);
        appendDeadLetter("message_processing_error", { message: message, error: String(err) });
      }
    });
  }

  function isSenderAllowed_(sender, config, allowedSenders) {
    var normalizedSender = String(sender || "").replace(/[^\d+]/g, "").trim();
    if (config.enforceSelfOnly && config.selfWhatsappNumber) {
      var self = String(config.selfWhatsappNumber).replace(/[^\d+]/g, "").trim();
      return normalizedSender === self;
    }
    if (config.enforceAllowedSenders) {
      return allowedSenders.indexOf(normalizedSender) !== -1;
    }
    return true;
  }

  function processNote_(message, config) {
    if (!config.notesSheetId) {
      JotBotWhatsApp.sendTextMessage(
        message.from,
        "Notes are not configured yet. Ask the admin to set NOTES_SHEET_ID.",
        message.id
      );
      return;
    }

    var messageTextRaw = message.caption || message.text || "";
    var messageText = JotBotRules.stripCommandTag(messageTextRaw);

    var draft = {};
    try {
      draft = messageText ? JotBotGemini.extractNoteDraftFromText(messageText) : {};
    } catch (err) {
      console.error("Gemini note extraction failed:", err);
      appendDeadLetter("note_extraction_failure", { message: message, error: String(err) });
      JotBotWhatsApp.sendTextMessage(
        message.from,
        "Could not process the note. Please try again.",
        message.id
      );
      return;
    }

    if (!draft.text && messageText) {
      draft.text = messageText;
    }

    var validated = JotBotRules.validateNoteDraft(draft);
    if (!validated.ok) {
      JotBotWhatsApp.sendTextMessage(
        message.from,
        "I need some text to save a note. Reply with #note followed by your note.",
        message.id
      );
      return;
    }

    try {
      NotesStore.appendNote(validated.draft, message.from, message.id, config.notesSheetId, config.notesSheetName);
    } catch (err) {
      console.error("NotesStore.appendNote failed:", err);
      appendDeadLetter("note_storage_failure", { message: message, draft: validated.draft, error: String(err) });
      JotBotWhatsApp.sendTextMessage(
        message.from,
        "Could not save the note. Please try again.",
        message.id
      );
      return;
    }

    var confirmation = JotBotRules.buildNoteConfirmationMessage(validated.draft.title);
    JotBotWhatsApp.sendTextMessage(message.from, confirmation, message.id);
    console.log(JSON.stringify({ type: "note_saved", messageId: message.id, title: validated.draft.title }));
  }

  function processAddEvent_(message, config) {
    var timezone = config.defaultTimezone;
    var messageTextRaw = message.caption || message.text || "";
    var messageText = JotBotRules.stripCommandTag(messageTextRaw);

    var textDraft = {};
    var imageDraft = {};
    try {
      textDraft = messageText
        ? JotBotGemini.extractEventDraftFromText(messageText, timezone)
        : {};

      if (message.imageId) {
        var media = JotBotWhatsApp.downloadMedia(message.imageId);
        imageDraft = JotBotGemini.extractEventDraftFromImage(media.base64, media.mimeType, timezone);
      }
    } catch (err) {
      console.error("Gemini/media extraction failed:", err);
      JotBotWhatsApp.sendTextMessage(
        message.from,
        "Could not read full event details. Reply with #add event title, date, and time.",
        message.id
      );
      appendDeadLetter("extraction_failure", { message: message, error: String(err) });
      return;
    }

    var merged = JotBotRules.mergeEventDrafts(imageDraft, textDraft);
    var hints = JotBotRules.parseHintsFromText(messageText);
    merged = JotBotRules.applyHints(merged, hints);

    var normalized = JotBotRules.validateAndNormalizeDraft(
      merged,
      config.defaultTimezone,
      config.defaultDurationMinutes
    );

    if (!normalized.ok) {
      var clarification = JotBotRules.buildClarificationMessage(normalized.missingFields);
      JotBotWhatsApp.sendTextMessage(message.from, clarification, message.id);
      appendDeadLetter("missing_fields", { message: message, draft: merged, missing: normalized.missingFields });
      return;
    }

    var created = JotBotCalendar.createEventFromDraft(normalized.draft, normalized.startDate, normalized.endDate);
    var confirmation = JotBotRules.buildConfirmationMessage(created.title, created.startDate, created.timezone);
    JotBotWhatsApp.sendTextMessage(message.from, confirmation, message.id);
    console.log(JSON.stringify({ type: "event_created", messageId: message.id, eventId: created.eventId, calendarId: created.calendarId }));

    if (JotBotFirestore.isConfigured(config)) {
      JotBotFirestore.saveLastAction(message.from, {
        type: "event",
        itemId: created.eventId,
        calendarId: created.calendarId,
        title: created.title
      }, config);
    }
  }

  function processHelp_(message, config) {
    JotBotWhatsApp.sendTextMessage(message.from, JotBotRules.buildHelpMessage(), message.id);
  }

  function processCancel_(message, config) {
    if (!JotBotFirestore.isConfigured(config)) {
      JotBotWhatsApp.sendTextMessage(message.from, "Cancel is not available — Firestore is not configured.", message.id);
      return;
    }

    var lastAction = JotBotFirestore.getLastAction(message.from, config);
    if (!lastAction || !lastAction.itemId) {
      JotBotWhatsApp.sendTextMessage(message.from, "Nothing to cancel.", message.id);
      return;
    }

    if (lastAction.createdAt) {
      var ageSeconds = (Date.now() - lastAction.createdAt.getTime()) / 1000;
      if (ageSeconds > (config.cancelTtlSeconds || 900)) {
        JotBotWhatsApp.sendTextMessage(message.from, "Your last action was too long ago to cancel.", message.id);
        JotBotFirestore.deleteLastAction(message.from, config);
        return;
      }
    }

    try {
      if (lastAction.type === "event") {
        var calendar = CalendarApp.getCalendarById(lastAction.calendarId) || CalendarApp.getDefaultCalendar();
        var event = calendar.getEventById(lastAction.itemId);
        if (event) {
          event.deleteEvent();
        }
      }
    } catch (err) {
      console.error("processCancel_ deletion failed:", err);
      JotBotWhatsApp.sendTextMessage(message.from, "Could not delete the item. It may have been removed already.", message.id);
      JotBotFirestore.deleteLastAction(message.from, config);
      return;
    }

    JotBotFirestore.deleteLastAction(message.from, config);
    var title = lastAction.title ? ' "' + lastAction.title + '"' : "";
    JotBotWhatsApp.sendTextMessage(message.from, "\ud83d\uddd1\ufe0f Successfully cancelled" + title + ".", message.id);
    console.log(JSON.stringify({ type: "event_cancelled", messageId: message.id, itemId: lastAction.itemId }));
  }

  function isDuplicateMessage_(messageId, config) {
    if (!messageId) return false;
    var ttlSeconds = config.idempotencyTtlSeconds;
    var cache = CacheService.getScriptCache();
    var cacheKey = "msg:" + messageId;
    if (cache.get(cacheKey)) return true;

    if (JotBotFirestore.isConfigured(config)) {
      var result = JotBotFirestore.checkAndRecord(messageId, ttlSeconds, config);
      if (result === true) return true;
      if (result === false) {
        cache.put(cacheKey, "1", ttlSeconds || 21600);
        return false;
      }
      Logger.log("Firestore unavailable, falling back to Script Properties");
    }

    var props = PropertiesService.getScriptProperties();
    var propKey = "processed_" + messageId;
    if (props.getProperty(propKey)) return true;

    cache.put(cacheKey, "1", ttlSeconds || 21600);
    props.setProperty(propKey, new Date().toISOString());
    return false;
  }

  function appendDeadLetter(type, payload) {
    var config = JotBotConfig.getConfig();
    if (!config.deadLetterSheetId) return;
    try {
      var spreadsheet = SpreadsheetApp.openById(config.deadLetterSheetId);
      var sheet = spreadsheet.getSheetByName(config.deadLetterSheetName) || spreadsheet.insertSheet(config.deadLetterSheetName);
      if (sheet.getLastRow() === 0) {
        sheet.appendRow(["timestamp", "type", "payload_json"]);
      }
      sheet.appendRow([new Date().toISOString(), type, JSON.stringify(payload || {})]);
    } catch (err) {
      console.error("appendDeadLetter failed:", err);
    }
  }

  return {
    handleWebhook: handleWebhook,
    appendDeadLetter: appendDeadLetter
  };
})();
