var JotBotFirestore = (function () {
  var TOKEN_URL = "https://oauth2.googleapis.com/token";
  var TOKEN_SCOPE = "https://www.googleapis.com/auth/datastore";
  var TOKEN_CACHE_KEY = "jotbot_firestore_oauth";
  var TOKEN_CACHE_SECONDS = 3300;

  function sha256Hex_(s) {
    var digest = Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256,
      s,
      Utilities.Charset.UTF_8
    );
    return digest
      .map(function (b) {
        return ("0" + (b & 0xff).toString(16)).slice(-2);
      })
      .join("");
  }

  function base64UrlEncodeJson_(obj) {
    var json = JSON.stringify(obj);
    return Utilities.base64EncodeWebSafe(json).replace(/=+$/, "");
  }

  function parseServiceAccount_(jsonString) {
    if (!jsonString || typeof jsonString !== "string") return null;
    try {
      var o = JSON.parse(jsonString);
      if (o && o.client_email && o.private_key) return o;
    } catch (err) {
      console.error("JotBotFirestore: invalid GCP_SERVICE_ACCOUNT_JSON", err);
    }
    return null;
  }

  function fetchAccessToken_(sa) {
    var header = { alg: "RS256", typ: "JWT" };
    var now = Math.floor(Date.now() / 1000);
    var claim = {
      iss: sa.client_email,
      sub: sa.client_email,
      aud: TOKEN_URL,
      iat: now,
      exp: now + 3600,
      scope: TOKEN_SCOPE
    };
    var toSign =
      base64UrlEncodeJson_(header) + "." + base64UrlEncodeJson_(claim);
    var sigBytes = Utilities.computeRsaSha256Signature(toSign, sa.private_key);
    var sig = Utilities.base64EncodeWebSafe(sigBytes).replace(/=+$/, "");
    var jwt = toSign + "." + sig;

    var res = UrlFetchApp.fetch(TOKEN_URL, {
      method: "post",
      muteHttpExceptions: true,
      payload: {
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: jwt
      }
    });
    if (res.getResponseCode() !== 200) {
      console.error(
        "JotBotFirestore: token request failed",
        res.getResponseCode(),
        res.getContentText()
      );
      return null;
    }
    try {
      return JSON.parse(res.getContentText()).access_token || null;
    } catch (e) {
      console.error("JotBotFirestore: token parse error", e);
      return null;
    }
  }

  function getAccessToken_(saJson) {
    var cache = CacheService.getScriptCache();
    var cached = cache.get(TOKEN_CACHE_KEY);
    if (cached) return cached;

    var sa = parseServiceAccount_(saJson);
    if (!sa) return null;
    var token = fetchAccessToken_(sa);
    if (token) cache.put(TOKEN_CACHE_KEY, token, TOKEN_CACHE_SECONDS);
    return token;
  }

  function documentUrl_(projectId, databaseId, collection, docId) {
    return (
      "https://firestore.googleapis.com/v1/projects/" +
      encodeURIComponent(projectId) +
      "/databases/" +
      encodeURIComponent(databaseId || "(default)") +
      "/documents/" +
      encodeURIComponent(collection) +
      "/" +
      encodeURIComponent(docId)
    );
  }

  function isConfigured(config) {
    return !!(config && config.firestoreProjectId && config.gcpServiceAccountJson);
  }

  /**
   * Check whether messageId was already processed and, if not, record it.
   * @returns {boolean|null} true = duplicate, false = first time, null = Firestore unavailable
   */
  function checkAndRecord(messageId, ttlSeconds, config) {
    if (!isConfigured(config)) return null;

    var token = getAccessToken_(config.gcpServiceAccountJson);
    if (!token) return null;

    var docId = sha256Hex_(String(messageId));
    var url = documentUrl_(
      config.firestoreProjectId,
      config.firestoreDatabaseId,
      config.firestoreIdempotencyCollection,
      docId
    );
    var headers = { Authorization: "Bearer " + token };

    var getRes = UrlFetchApp.fetch(url, {
      method: "get",
      muteHttpExceptions: true,
      headers: headers
    });
    if (getRes.getResponseCode() === 200) return true;
    if (getRes.getResponseCode() !== 404) {
      console.error(
        "JotBotFirestore: GET failed",
        getRes.getResponseCode(),
        getRes.getContentText()
      );
      return null;
    }

    var now = new Date();
    var expiresAt = new Date(now.getTime() + (ttlSeconds || 21600) * 1000);
    var body = {
      fields: {
        processedAt: { timestampValue: now.toISOString() },
        expiresAt: { timestampValue: expiresAt.toISOString() }
      }
    };

    var createUrl =
      url +
      "?updateMask.fieldPaths=processedAt" +
      "&updateMask.fieldPaths=expiresAt" +
      "&currentDocument.exists=false";
    var createRes = UrlFetchApp.fetch(createUrl, {
      method: "patch",
      muteHttpExceptions: true,
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json"
      },
      payload: JSON.stringify(body)
    });

    var code = createRes.getResponseCode();
    if (code === 200 || code === 201) return false;

    var text = createRes.getContentText() || "";
    if (
      code === 409 ||
      text.indexOf("ALREADY_EXISTS") !== -1 ||
      text.indexOf("FAILED_PRECONDITION") !== -1
    ) {
      return true;
    }

    console.error("JotBotFirestore: PATCH failed", code, text);
    return null;
  }

  function senderDocId_(sender) {
    return "sender_" + sha256Hex_(String(sender || ""));
  }

  function saveLastAction(sender, actionData, config) {
    if (!isConfigured(config)) return;
    var token = getAccessToken_(config.gcpServiceAccountJson);
    if (!token) return;

    var url = documentUrl_(
      config.firestoreProjectId,
      config.firestoreDatabaseId,
      config.firestoreIdempotencyCollection,
      senderDocId_(sender)
    );
    var body = {
      fields: {
        type: { stringValue: actionData.type || "" },
        itemId: { stringValue: actionData.itemId || "" },
        calendarId: { stringValue: actionData.calendarId || "" },
        title: { stringValue: actionData.title || "" },
        createdAt: { timestampValue: new Date().toISOString() }
      }
    };
    var res = UrlFetchApp.fetch(url, {
      method: "patch",
      muteHttpExceptions: true,
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      payload: JSON.stringify(body)
    });
    if (res.getResponseCode() >= 300) {
      console.error("JotBotFirestore: saveLastAction failed", res.getResponseCode(), res.getContentText());
    }
  }

  function getLastAction(sender, config) {
    if (!isConfigured(config)) return null;
    var token = getAccessToken_(config.gcpServiceAccountJson);
    if (!token) return null;

    var url = documentUrl_(
      config.firestoreProjectId,
      config.firestoreDatabaseId,
      config.firestoreIdempotencyCollection,
      senderDocId_(sender)
    );
    var res = UrlFetchApp.fetch(url, {
      method: "get",
      muteHttpExceptions: true,
      headers: { Authorization: "Bearer " + token }
    });
    if (res.getResponseCode() !== 200) return null;

    try {
      var doc = JSON.parse(res.getContentText());
      var f = doc.fields || {};
      return {
        type: (f.type && f.type.stringValue) || "",
        itemId: (f.itemId && f.itemId.stringValue) || "",
        calendarId: (f.calendarId && f.calendarId.stringValue) || "",
        title: (f.title && f.title.stringValue) || "",
        createdAt: (f.createdAt && f.createdAt.timestampValue) ? new Date(f.createdAt.timestampValue) : null
      };
    } catch (e) {
      console.error("JotBotFirestore: getLastAction parse error", e);
      return null;
    }
  }

  function deleteLastAction(sender, config) {
    if (!isConfigured(config)) return;
    var token = getAccessToken_(config.gcpServiceAccountJson);
    if (!token) return;

    var url = documentUrl_(
      config.firestoreProjectId,
      config.firestoreDatabaseId,
      config.firestoreIdempotencyCollection,
      senderDocId_(sender)
    );
    var res = UrlFetchApp.fetch(url, {
      method: "delete",
      muteHttpExceptions: true,
      headers: { Authorization: "Bearer " + token }
    });
    if (res.getResponseCode() >= 300 && res.getResponseCode() !== 404) {
      console.error("JotBotFirestore: deleteLastAction failed", res.getResponseCode(), res.getContentText());
    }
  }

  return {
    isConfigured: isConfigured,
    checkAndRecord: checkAndRecord,
    saveLastAction: saveLastAction,
    getLastAction: getLastAction,
    deleteLastAction: deleteLastAction
  };
})();
