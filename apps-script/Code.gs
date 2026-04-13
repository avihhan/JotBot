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
    list_today: processListToday_,
    note: processNote_
  };

  function handleWebhook(payload) {
    var config = JotBotConfig.requireKeys(["waAccessToken", "waPhoneNumberId", "geminiApiKey"]);
    var allowedSenders = JotBotConfig.getAllowedSenders(config);
    var messages = JotBotWhatsApp.parseIncomingMessages(payload);

    Logger.log("Parsed " + messages.length + " message(s) from webhook payload");
    messages.forEach(function (message) {
      try {
        Logger.log("Processing message id=" + message.id + " from=" + message.from);
        if (isDuplicateMessage_(message.id, config.idempotencyTtlSeconds)) {
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
          Logger.log("No handler for command: " + command.command);
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

  var textDraft = {};
  var imageDraft = {};
  var finalDraft = {};

  try {
    if (messageText) {
      textDraft = JotBotRules.buildDirectNoteDraft(messageText);
    }

    if (message.imageId) {
      var media = JotBotWhatsApp.downloadMedia(message.imageId);
      imageDraft = JotBotGemini.extractNoteDraftFromImage(media.base64, media.mimeType);
    }
  } catch (err) {
    console.error("Note extraction failed:", err);
    appendDeadLetter("note_extraction_failure", { message: message, error: String(err) });
    JotBotWhatsApp.sendTextMessage(
      message.from,
      "Could not process the note. Please try again.",
      message.id
    );
    return;
  }

  finalDraft = JotBotRules.mergeNoteDrafts(imageDraft, textDraft);

  var validated = JotBotRules.validateNoteDraft(finalDraft);
  if (!validated.ok) {
    JotBotWhatsApp.sendTextMessage(
      message.from,
      "I need some text to save a note. Reply with #note followed by your note.",
      message.id
    );
    return;
  }

  try {
    NotesStore.appendNote(
      validated.draft,
      message.from,
      message.id,
      config.notesSheetId,
      config.notesSheetName,
      {
        rawText: messageTextRaw,
        sourceType: message.imageId ? (messageText ? "text+image" : "image") : "text",
        imageUsed: !!message.imageId
      }
    );
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

  var confirmation = JotBotRules.buildNoteConfirmationMessage(validated.draft.title, validated.draft.text);
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
  }

  function processListToday_(message, config) {
    try {
      var agenda = JotBotCalendar.listEventsForToday(config.defaultTimezone);
      var response = JotBotRules.buildAgendaMessage(agenda.events, agenda.timezone, agenda.calendarName);
      JotBotWhatsApp.sendTextMessage(message.from, response, message.id);
      console.log(JSON.stringify({ type: "agenda_listed", messageId: message.id, count: agenda.events.length, calendarId: agenda.calendarId }));
    } catch (err) {
      console.error("Agenda listing failed:", err);
      appendDeadLetter("agenda_listing_failure", { message: message, error: String(err) });
      JotBotWhatsApp.sendTextMessage(
        message.from,
        "Could not fetch today's events. Please try again.",
        message.id
      );
    }
  }

  function isDuplicateMessage_(messageId, ttlSeconds) {
    if (!messageId) return false;
    var cache = CacheService.getScriptCache();
    var cacheKey = "msg:" + messageId;
    if (cache.get(cacheKey)) return true;

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
