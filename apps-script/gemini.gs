var JotBotGemini = (function () {
  function extractEventDraftFromText(text, timezone) {
    if (!text || !text.trim()) return {};
    return requestStructuredEvent_({
      userText: text,
      timezone: timezone,
      includeImage: false
    });
  }

  function extractEventDraftFromImage(base64Image, mimeType, timezone) {
    if (!base64Image) return {};
    return requestStructuredEvent_({
      userText: "",
      timezone: timezone,
      includeImage: true,
      imageBase64: base64Image,
      imageMimeType: mimeType || "image/jpeg"
    });
  }

  function requestStructuredEvent_(opts) {
    var config = JotBotConfig.requireKeys(["geminiApiKey", "geminiModel"]);
    var url =
      "https://generativelanguage.googleapis.com/v1beta/models/" +
      encodeURIComponent(config.geminiModel) +
      ":generateContent?key=" +
      encodeURIComponent(config.geminiApiKey);

    var parts = [
      { text: buildPrompt_(opts.userText || "", opts.timezone || "UTC", opts.includeImage) }
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

    var response = UrlFetchApp.fetch(url, {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });

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
      priority: d.priority || "normal",
      confidence: typeof d.confidence === "number" ? d.confidence : 0.0,
      missing_fields: Array.isArray(d.missing_fields) ? d.missing_fields : []
    };
  }

  function buildPrompt_(text, timezone, isImageMode) {
    return [
      "You are extracting structured event details for Google Calendar.",
      "Respond in strict JSON only, no markdown, no extra keys.",
      "Timezone default: " + timezone,
      "Current timestamp: " + new Date().toISOString(),
      "If details are missing, include them in missing_fields.",
      "Schema keys:",
      "{",
      '  "intent":"create_event",',
      '  "title":"string",',
      '  "start_datetime_iso":"ISO-8601 string",',
      '  "end_datetime_iso":"ISO-8601 string or empty",',
      '  "duration_minutes":"number or null",',
      '  "timezone":"IANA timezone string",',
      '  "description":"string",',
      '  "location":"string",',
      '  "meeting_link":"string",',
      '  "calendar_hint":"string",',
      '  "color_hint":"string",',
      '  "reminders":"array<number>",',
      '  "priority":"low|normal|high",',
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
    var url =
      "https://generativelanguage.googleapis.com/v1beta/models/" +
      encodeURIComponent(config.geminiModel) +
      ":generateContent?key=" +
      encodeURIComponent(config.geminiApiKey);

    var payload = {
      contents: [{ role: "user", parts: [{ text: buildNotePrompt_(text) }] }],
      generationConfig: {
        temperature: 0.1,
        topP: 0.8,
        responseMimeType: "application/json"
      }
    };

    var response = UrlFetchApp.fetch(url, {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });

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

  return {
    extractEventDraftFromText: extractEventDraftFromText,
    extractEventDraftFromImage: extractEventDraftFromImage,
    extractNoteDraftFromText: extractNoteDraftFromText
  };
})();
