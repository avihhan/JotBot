var JotBotConfig = (function () {
  function getScriptProperties_() {
    return PropertiesService.getScriptProperties();
  }

  function getConfig() {
    var props = getScriptProperties_();
    return {
      appName: "JotBot",
      waApiVersion: props.getProperty("WA_API_VERSION") || "v21.0",
      waVerifyToken: props.getProperty("WA_VERIFY_TOKEN") || "",
      waAccessToken: props.getProperty("WA_ACCESS_TOKEN") || "",
      waPhoneNumberId: props.getProperty("WA_PHONE_NUMBER_ID") || "",
      waBusinessAccountId: props.getProperty("WA_BUSINESS_ACCOUNT_ID") || "",
      selfWhatsappNumber: props.getProperty("SELF_WHATSAPP_NUMBER") || "",
      enforceSelfOnly: (props.getProperty("ENFORCE_SELF_ONLY") || "true") === "true",
      enforceAllowedSenders: (props.getProperty("ENFORCE_ALLOWED_SENDERS") || "false") === "true",
      allowedSendersCsv: props.getProperty("ALLOWED_SENDERS_CSV") || "",
      geminiApiKey: props.getProperty("GEMINI_API_KEY") || "",
      geminiModel: props.getProperty("GEMINI_MODEL") || "gemini-2.5-flash",
      defaultTimezone: props.getProperty("DEFAULT_TIMEZONE") || Session.getScriptTimeZone() || "UTC",
      defaultDurationMinutes: Number(props.getProperty("DEFAULT_DURATION_MINUTES") || "60"),
      defaultCalendarId: props.getProperty("DEFAULT_CALENDAR_ID") || "primary",
      calendarMapJson: props.getProperty("CALENDAR_MAP_JSON") || "{}",
      colorMapJson: props.getProperty("COLOR_MAP_JSON") || "{}",
      deadLetterSheetId: props.getProperty("DEAD_LETTER_SHEET_ID") || "",
      deadLetterSheetName: props.getProperty("DEAD_LETTER_SHEET_NAME") || "DeadLetter",
      idempotencyTtlSeconds: Number(props.getProperty("IDEMPOTENCY_TTL_SECONDS") || "21600"),
      notesSheetId: props.getProperty("NOTES_SHEET_ID") || "",
      notesSheetName: props.getProperty("NOTES_SHEET_NAME") || "Notes",
      firestoreProjectId: props.getProperty("FIRESTORE_PROJECT_ID") || "",
      firestoreDatabaseId: props.getProperty("FIRESTORE_DATABASE_ID") || "(default)",
      firestoreIdempotencyCollection: props.getProperty("FIRESTORE_IDEMPOTENCY_COLLECTION") || "jotbot_idempotency",
      gcpServiceAccountJson: props.getProperty("GCP_SERVICE_ACCOUNT_JSON") || "",
      cancelTtlSeconds: Number(props.getProperty("CANCEL_TTL_SECONDS") || "900"),
      defaultTaskListId: props.getProperty("DEFAULT_TASK_LIST_ID") || "@default",
      gcpBucketName: props.getProperty("GCP_BUCKET_NAME") || "",
      geminiFallbackModel: props.getProperty("GEMINI_FALLBACK_MODEL") || "gemini-1.5-flash",
      categoryColorMapJson: props.getProperty("CATEGORY_COLOR_MAP_JSON") || "{}",
      adminPhoneNumbers: props.getProperty("ADMIN_PHONE_NUMBERS") || ""
    };
  }

  function parseJsonMap(jsonString) {
    if (!jsonString) return {};
    try {
      var parsed = JSON.parse(jsonString);
      if (parsed && typeof parsed === "object") return parsed;
    } catch (err) {
      console.error("Invalid JSON map in script property:", err);
    }
    return {};
  }

  function requireKeys(keys) {
    var config = getConfig();
    var missing = keys.filter(function (key) {
      return !config[key];
    });
    if (missing.length > 0) {
      throw new Error("Missing required config keys: " + missing.join(", "));
    }
    return config;
  }

  function getAllowedSenders(config) {
    var source = (config && config.allowedSendersCsv) || "";
    return source
      .split(",")
      .map(function (item) {
        return String(item || "").replace(/[^\d+]/g, "").trim();
      })
      .filter(function (item) {
        return item.length > 0;
      });
  }

  return {
    getConfig: getConfig,
    parseJsonMap: parseJsonMap,
    requireKeys: requireKeys,
    getAllowedSenders: getAllowedSenders
  };
})();
