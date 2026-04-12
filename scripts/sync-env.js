#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const ENV_PATH = path.join(ROOT, ".env");

/**
 * Parses a .env file that may contain multiline JSON values (unquoted braces).
 */
function parseEnvFile(content) {
  const props = {};
  const lines = content.split("\n");
  let currentKey = null;
  let currentValue = "";
  let braceDepth = 0;

  for (const line of lines) {
    if (braceDepth > 0) {
      currentValue += "\n" + line;
      braceDepth += (line.match(/{/g) || []).length;
      braceDepth -= (line.match(/}/g) || []).length;
      if (braceDepth === 0) {
        props[currentKey] = currentValue;
        currentKey = null;
        currentValue = "";
      }
      continue;
    }

    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)/);
    if (!match) continue;

    const key = match[1];
    const value = match[2];
    const opens = (value.match(/{/g) || []).length;
    const closes = (value.match(/}/g) || []).length;

    if (opens > closes) {
      currentKey = key;
      currentValue = value;
      braceDepth = opens - closes;
    } else {
      props[key] = value;
    }
  }

  return props;
}

if (!fs.existsSync(ENV_PATH)) {
  console.error("No .env file found at", ENV_PATH);
  process.exit(1);
}

const raw = fs.readFileSync(ENV_PATH, "utf8");
const props = parseEnvFile(raw);

if (props.GCP_SERVICE_ACCOUNT_JSON) {
  try {
    const parsed = JSON.parse(props.GCP_SERVICE_ACCOUNT_JSON);
    props.GCP_SERVICE_ACCOUNT_JSON = JSON.stringify(parsed);
  } catch (_) {
    console.error("Warning: GCP_SERVICE_ACCOUNT_JSON is not valid JSON — sending as-is.");
  }
}

const count = Object.keys(props).length;
if (count === 0) {
  console.log("No properties found in .env — nothing to sync.");
  process.exit(0);
}

console.log(`Syncing ${count} properties to Apps Script...`);
Object.keys(props).forEach((k) => {
  const preview = k.includes("KEY") || k.includes("TOKEN") || k.includes("SECRET") || k.includes("JSON") || k.includes("PASSWORD")
    ? "***"
    : props[k].substring(0, 40) + (props[k].length > 40 ? "…" : "");
  console.log(`  ${k} = ${preview}`);
});

const jsonPayload = JSON.stringify(props);
const escapedPayload = JSON.stringify(jsonPayload);
const cmd = `npx clasp run syncScriptProperties --params [${escapedPayload}]`;

try {
  execSync(cmd, { stdio: "inherit", cwd: ROOT });
  console.log("\nDone — properties synced.");
} catch (_) {
  console.error("\nclasp run failed. One-time setup required:");
  console.error("  1. In GCP Console, enable the Apps Script API");
  console.error("  2. Create OAuth credentials (Desktop app) in GCP Console");
  console.error("  3. Download the credentials JSON and run:");
  console.error("       npx clasp login --creds <path-to-oauth-creds.json>");
  console.error("  4. Re-run: npm run sync-env");
  process.exit(1);
}
