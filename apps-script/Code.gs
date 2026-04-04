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
    add_event: processAddEvent_
  };

  function handleWebhook(payload) {
    var config = JotBotConfig.requireKeys(["waAccessToken", "waPhoneNumberId", "geminiApiKey"]);
    var allowedSenders = JotBotConfig.getAllowedSenders(config);
    var messages = JotBotWhatsApp.parseIncomingMessages(payload);

    messages.forEach(function (message) {
      try {
        if (isDuplicateMessage_(message.id, config.idempotencyTtlSeconds)) {
          return;
        }
        if (!isSenderAllowed_(message.from, config, allowedSenders)) {
          return;
        }

        var textForCommand = message.caption || message.text || "";
        var command = JotBotRules.parseCommand(textForCommand);
        if (!commandHandlers_[command.command]) return;
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
