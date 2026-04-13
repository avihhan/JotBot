var JotBotGemini = (function () {
  function extractEventDraftFromText(text, timezone, messageTimestamp) {
    if (!text || !text.trim()) return {};
    return requestStructuredEvent_({
      userText: text,
      timezone: timezone,
      includeImage: false,
      messageTimestamp: messageTimestamp
    });
  }

  function extractEventDraftFromMedia(base64, mimeType, timezone, messageTimestamp) {
    if (!base64) return {};
    return requestStructuredEvent_({
      userText: "",
      timezone: timezone,
      includeImage: true,
      imageBase64: base64,
      imageMimeType: mimeType || "image/jpeg",
      messageTimestamp: messageTimestamp
    });
  }

  function fetchWithRetry_(url, options, fallbackUrl) {
    var response = UrlFetchApp.fetch(url, options);
    var status = response.getResponseCode();
    if (status === 429 || status === 500 || status === 503) {
      Utilities.sleep(1500);
      response = UrlFetchApp.fetch(url, options);
      status = response.getResponseCode();
      if ((status === 429 || status === 500 || status === 503) && fallbackUrl) {
        Utilities.sleep(1000);
        response = UrlFetchApp.fetch(fallbackUrl, options);
      }
    }
    return response;
  }

  function buildGeminiUrl_(model, apiKey) {
    return "https://generativelanguage.googleapis.com/v1beta/models/" +
      encodeURIComponent(model) +
      ":generateContent?key=" +
      encodeURIComponent(apiKey);
  }

  function requestStructuredEvent_(opts) {
    var config = JotBotConfig.requireKeys(["geminiApiKey", "geminiModel"]);
    var url = buildGeminiUrl_(config.geminiModel, config.geminiApiKey);
    var fallbackUrl = config.geminiFallbackModel
      ? buildGeminiUrl_(config.geminiFallbackModel, config.geminiApiKey)
      : null;

    var parts = [
      { text: buildPrompt_(opts.userText || "", opts.timezone || "UTC", opts.includeImage, opts.messageTimestamp) }
    ];
    if (opts.includeImage && opts.imageBase64) {
      parts.push({
        inline_data: {
          mime_type: opts.imageMimeType || "image/jpeg",
          data: opts.imageBase64
        }
      });
    }

    var payload = {
      contents: [{ role: "user", parts: parts }],
      generationConfig: {
        temperature: 0.1,
        topP: 0.8,
        responseMimeType: "application/json"
      }
    };

    var response = fetchWithRetry_(url, {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    }, fallbackUrl);

    var status = response.getResponseCode();
    var bodyText = response.getContentText() || "{}";
    if (status >= 300) {
      throw new Error("Gemini request failed (" + status + "): " + bodyText);
    }
    return parseDraft_(bodyText);
  }

  function parseDraft_(bodyText) {
    var body = JSON.parse(bodyText || "{}");
    var text =
      (((body.candidates || [])[0] || {}).content || {}).parts &&
      (((body.candidates || [])[0] || {}).content || {}).parts[0] &&
      (((body.candidates || [])[0] || {}).content || {}).parts[0].text;

    if (!text) return {};
    var cleaned = text.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
    var parsed = JSON.parse(cleaned || "{}");
    return sanitizeDraft_(parsed);
  }

  function sanitizeDraft_(draft) {
    var d = draft || {};
    return {
      intent: d.intent || "create_event",
      title: d.title || "",
      start_datetime_iso: d.start_datetime_iso || "",
      end_datetime_iso: d.end_datetime_iso || "",
      duration_minutes: d.duration_minutes || null,
      timezone: d.timezone || "",
      description: d.description || "",
      location: d.location || "",
      meeting_link: d.meeting_link || "",
      calendar_hint: d.calendar_hint || "",
      color_hint: d.color_hint || "",
      reminders: Array.isArray(d.reminders) ? d.reminders : [],
      recurrence_rule: d.recurrence_rule || "",
      priority: d.priority || "normal",
      urgency: typeof d.urgency === "number" ? d.urgency : 3,
      category: d.category || "",
      confidence: typeof d.confidence === "number" ? d.confidence : 0.0,
      missing_fields: Array.isArray(d.missing_fields) ? d.missing_fields : []
    };
  }

  function buildPrompt_(text, timezone, isImageMode, messageTimestamp) {
    var currentTime = messageTimestamp
      ? new Date(messageTimestamp).toISOString()
      : new Date().toISOString();
    return [
      "You are extracting structured event details for Google Calendar.",
      "Respond in strict JSON only, no markdown, no extra keys.",
      "",
      "IMPORTANT TIMEZONE RULES:",
      "- The user is in the " + timezone + " timezone.",
      "- Interpret ALL times mentioned by the user (e.g. '3pm', 'tomorrow morning') as local to " + timezone + ".",
      "- All ISO-8601 datetime strings in your response MUST include the correct UTC offset for " + timezone + ".",
      "- Example: 3 PM Eastern Daylight Time = 2026-04-13T15:00:00-04:00 (NOT 2026-04-13T15:00:00Z).",
      "",
      "IMPORTANT TIME CONSTRAINTS:",
      "- If the user specifies an exact time, use it exactly.",
      "- If the time is ambiguous or not specified, default to a reasonable hour between 07:00 and 23:59.",
      "- NEVER schedule an ambiguous event between 00:00 and 06:59.",
      "",
      "The user sent this message at: " + currentTime,
      "Use this as the reference for relative dates like 'today', 'tomorrow', 'next week'.",
      "",
      "If details are missing, include them in missing_fields.",
      "Schema keys:",
      "{",
      '  "intent":"create_event",',
      '  "title":"string",',
      '  "start_datetime_iso":"ISO-8601 with UTC offset, e.g. 2026-04-13T15:00:00-04:00",',
      '  "end_datetime_iso":"ISO-8601 with UTC offset, or empty",',
      '  "duration_minutes":"number or null",',
      '  "timezone":"' + timezone + '",',
      '  "description":"string",',
      '  "location":"string",',
      '  "meeting_link":"string",',
      '  "calendar_hint":"string",',
      '  "color_hint":"string",',
      '  "reminders":"array<number> — minutes before event for popup reminders",',
      '  "recurrence_rule":"RRULE string (e.g. FREQ=WEEKLY;BYDAY=MO) or empty if not recurring",',
      '  "priority":"low|normal|high",',
      '  "urgency":"integer 1-5 (1=low, 3=normal, 5=critical)",',
      '  "category":"string — dynamic label: Work, School, Chore, Finance, Health, Social, Personal, etc.",',
      '  "confidence":"number 0-1",',
      '  "missing_fields":"array<string>"',
      "}",
      isImageMode ? "Read details from the image carefully (OCR + context)." : "Read details from text only.",
      "User text:",
      text || ""
    ].join("\n");
  }

  function extractNoteDraftFromText(text) {
    if (!text || !text.trim()) return {};
    return requestStructuredNote_(text);
  }

  function requestStructuredNote_(text) {
    var config = JotBotConfig.requireKeys(["geminiApiKey", "geminiModel"]);
    var url = buildGeminiUrl_(config.geminiModel, config.geminiApiKey);
    var fallbackUrl = config.geminiFallbackModel
      ? buildGeminiUrl_(config.geminiFallbackModel, config.geminiApiKey)
      : null;

    var payload = {
      contents: [{ role: "user", parts: [{ text: buildNotePrompt_(text) }] }],
      generationConfig: {
        temperature: 0.1,
        topP: 0.8,
        responseMimeType: "application/json"
      }
    };

    var response = fetchWithRetry_(url, {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    }, fallbackUrl);

    var status = response.getResponseCode();
    var bodyText = response.getContentText() || "{}";
    if (status >= 300) {
      throw new Error("Gemini request failed (" + status + "): " + bodyText);
    }
    return parseNoteDraft_(bodyText);
  }

  function parseNoteDraft_(bodyText) {
    var body = JSON.parse(bodyText || "{}");
    var text =
      (((body.candidates || [])[0] || {}).content || {}).parts &&
      (((body.candidates || [])[0] || {}).content || {}).parts[0] &&
      (((body.candidates || [])[0] || {}).content || {}).parts[0].text;

    if (!text) return {};
    var cleaned = text.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
    var parsed = JSON.parse(cleaned || "{}");
    return sanitizeNoteDraft_(parsed);
  }

  function sanitizeNoteDraft_(draft) {
    var d = draft || {};
    return {
      title: d.title || "",
      text: d.text || "",
      tags: Array.isArray(d.tags) ? d.tags : [],
      confidence: typeof d.confidence === "number" ? d.confidence : 0.0
    };
  }

  function buildNotePrompt_(text) {
    return [
      "You are extracting a structured note from a WhatsApp message.",
      "Respond in strict JSON only, no markdown, no extra keys.",
      "Extract a short title (5 words max), the full note text, and any tags found (words starting with # in the text, or inferred topic tags).",
      "Schema:",
      "{",
      '  "title":"string — short summary of the note",',
      '  "text":"string — full note content, stripped of the command tag",',
      '  "tags":"array<string> — lowercase tags without #",',
      '  "confidence":"number 0-1"',
      "}",
      "User message:",
      text || ""
    ].join("\n");
  }

  function extractTaskDraftFromText(text, timezone, messageTimestamp) {
    if (!text || !text.trim()) return {};
    var config = JotBotConfig.requireKeys(["geminiApiKey", "geminiModel"]);
    var url = buildGeminiUrl_(config.geminiModel, config.geminiApiKey);
    var fallbackUrl = config.geminiFallbackModel
      ? buildGeminiUrl_(config.geminiFallbackModel, config.geminiApiKey)
      : null;

    var payload = {
      contents: [{ role: "user", parts: [{ text: buildTaskPrompt_(text, timezone, messageTimestamp) }] }],
      generationConfig: {
        temperature: 0.1,
        topP: 0.8,
        responseMimeType: "application/json"
      }
    };

    var response = fetchWithRetry_(url, {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    }, fallbackUrl);

    var status = response.getResponseCode();
    var bodyText = response.getContentText() || "{}";
    if (status >= 300) {
      throw new Error("Gemini request failed (" + status + "): " + bodyText);
    }
    return parseTaskDraft_(bodyText);
  }

  function parseTaskDraft_(bodyText) {
    var body = JSON.parse(bodyText || "{}");
    var text =
      (((body.candidates || [])[0] || {}).content || {}).parts &&
      (((body.candidates || [])[0] || {}).content || {}).parts[0] &&
      (((body.candidates || [])[0] || {}).content || {}).parts[0].text;

    if (!text) return {};
    var cleaned = text.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
    var parsed = JSON.parse(cleaned || "{}");
    return sanitizeTaskDraft_(parsed);
  }

  function sanitizeTaskDraft_(draft) {
    var d = draft || {};
    return {
      intent: "create_task",
      title: d.title || "",
      due_datetime_iso: d.due_datetime_iso || "",
      description: d.description || "",
      priority: d.priority || "normal",
      confidence: typeof d.confidence === "number" ? d.confidence : 0.0,
      missing_fields: Array.isArray(d.missing_fields) ? d.missing_fields : []
    };
  }

  function buildTaskPrompt_(text, timezone, messageTimestamp) {
    var currentTime = messageTimestamp
      ? new Date(messageTimestamp).toISOString()
      : new Date().toISOString();
    return [
      "You are extracting structured task/to-do details for Google Tasks.",
      "Respond in strict JSON only, no markdown, no extra keys.",
      "",
      "IMPORTANT TIMEZONE RULES:",
      "- The user is in the " + timezone + " timezone.",
      "- Interpret ALL times and dates as local to " + timezone + ".",
      "- All ISO-8601 datetime strings MUST include the correct UTC offset for " + timezone + ".",
      "",
      "IMPORTANT TIME CONSTRAINTS:",
      "- If the user specifies an exact deadline, use it exactly.",
      "- If no deadline is mentioned, leave due_datetime_iso empty.",
      "",
      "The user sent this message at: " + currentTime,
      "Use this as reference for relative dates like 'today', 'tomorrow', 'next week'.",
      "",
      "Schema keys:",
      "{",
      '  "intent":"create_task",',
      '  "title":"string — concise task title",',
      '  "due_datetime_iso":"ISO-8601 with UTC offset or empty if no deadline",',
      '  "description":"string — additional details",',
      '  "priority":"low|normal|high",',
      '  "confidence":"number 0-1",',
      '  "missing_fields":"array<string>"',
      "}",
      "User text:",
      text || ""
    ].join("\n");
  }

  return {
    extractEventDraftFromText: extractEventDraftFromText,
    extractEventDraftFromMedia: extractEventDraftFromMedia,
    extractTaskDraftFromText: extractTaskDraftFromText,
    extractNoteDraftFromText: extractNoteDraftFromText
  };
})();
