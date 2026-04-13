var JotBotGCS = (function () {
  var TOKEN_URL = "https://oauth2.googleapis.com/token";
  var TOKEN_SCOPE = "https://www.googleapis.com/auth/devstorage.read_write";
  var TOKEN_CACHE_KEY = "jotbot_gcs_oauth";
  var TOKEN_CACHE_SECONDS = 3300;
  var SIGNED_URL_EXPIRY_SECONDS = 604800;

  function isConfigured(config) {
    return !!(config && config.gcpBucketName && config.gcpServiceAccountJson);
  }

  function uploadFile(bytes, mimeType, filename, config) {
    if (!isConfigured(config)) return null;
    var token = getAccessToken_(config.gcpServiceAccountJson);
    if (!token) return null;

    var url =
      "https://storage.googleapis.com/upload/storage/v1/b/" +
      encodeURIComponent(config.gcpBucketName) +
      "/o?uploadType=media&name=" +
      encodeURIComponent(filename);

    var res = UrlFetchApp.fetch(url, {
      method: "post",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": mimeType || "application/octet-stream"
      },
      payload: bytes,
      muteHttpExceptions: true
    });

    if (res.getResponseCode() >= 300) {
      console.error("JotBotGCS: upload failed", res.getResponseCode(), res.getContentText());
      return null;
    }

    try {
      var obj = JSON.parse(res.getContentText());
      return obj.name || filename;
    } catch (e) {
      return filename;
    }
  }

  function getSignedUrl(objectName, config) {
    if (!isConfigured(config) || !objectName) return null;
    var sa = parseServiceAccount_(config.gcpServiceAccountJson);
    if (!sa) return null;

    var now = new Date();
    var expiry = SIGNED_URL_EXPIRY_SECONDS;
    var timestamp = Utilities.formatDate(now, "UTC", "yyyyMMdd'T'HHmmss'Z'");
    var datestamp = Utilities.formatDate(now, "UTC", "yyyyMMdd");
    var credentialScope = datestamp + "/auto/storage/goog4_request";
    var credential = sa.client_email + "/" + credentialScope;

    var host = config.gcpBucketName + ".storage.googleapis.com";
    var canonicalUri = "/" + objectName.split("/").map(function (p) {
      return encodeURIComponent(p);
    }).join("/");

    var params = [
      "X-Goog-Algorithm=GOOG4-RSA-SHA256",
      "X-Goog-Credential=" + encodeURIComponent(credential),
      "X-Goog-Date=" + timestamp,
      "X-Goog-Expires=" + expiry,
      "X-Goog-SignedHeaders=host"
    ];
    var canonicalQueryString = params.join("&");
    var canonicalHeaders = "host:" + host + "\n";
    var signedHeaders = "host";

    var canonicalRequest = [
      "GET",
      canonicalUri,
      canonicalQueryString,
      canonicalHeaders,
      signedHeaders,
      "UNSIGNED-PAYLOAD"
    ].join("\n");

    var hash = Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256,
      canonicalRequest,
      Utilities.Charset.UTF_8
    ).map(function (b) { return ("0" + (b & 0xff).toString(16)).slice(-2); }).join("");

    var stringToSign = [
      "GOOG4-RSA-SHA256",
      timestamp,
      credentialScope,
      hash
    ].join("\n");

    var sigBytes = Utilities.computeRsaSha256Signature(stringToSign, sa.private_key);
    var signature = sigBytes.map(function (b) {
      return ("0" + (b & 0xff).toString(16)).slice(-2);
    }).join("");

    return "https://" + host + canonicalUri + "?" + canonicalQueryString + "&X-Goog-Signature=" + signature;
  }

  function parseServiceAccount_(jsonString) {
    if (!jsonString || typeof jsonString !== "string") return null;
    try {
      var o = JSON.parse(jsonString);
      if (o && o.client_email && o.private_key) return o;
    } catch (err) {
      console.error("JotBotGCS: invalid service account JSON", err);
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
    var base64UrlEncode = function (obj) {
      return Utilities.base64EncodeWebSafe(JSON.stringify(obj)).replace(/=+$/, "");
    };
    var toSign = base64UrlEncode(header) + "." + base64UrlEncode(claim);
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
      console.error("JotBotGCS: token request failed", res.getResponseCode(), res.getContentText());
      return null;
    }
    try {
      return JSON.parse(res.getContentText()).access_token || null;
    } catch (e) {
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

  return {
    isConfigured: isConfigured,
    uploadFile: uploadFile,
    getSignedUrl: getSignedUrl
  };
})();
