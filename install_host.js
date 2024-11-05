import { webcrypto } from "node:crypto";
import { chmodSync, readFileSync, writeFileSync } from "node:fs";

const { dirname } = import.meta;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

const manifest = JSON.parse(decoder.decode(readFileSync("manifest.json")));
const host = {};
// Generate Chrome extension ID
// https://stackoverflow.com/questions/26053434
// https://gist.github.com/dfkaye/84feac3688b110e698ad3b81713414a9
async function generateIdForPath(path) {
  return [
    ...[
      ...new Uint8Array(
        await webcrypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(path),
        ),
      ),
    ].map((u8) => u8.toString(16).padStart(2, "0")).join("").slice(0, 32),
  ]
    .map((hex) => String.fromCharCode(parseInt(hex, 16) + "a".charCodeAt(0)))
    .join(
      "",
    );
}

const id = await generateIdForPath(dirname);
// Write Native Messaging host manifest to NativeMessagingHosts
// in Chromium or Chrome user data directory
host.name = manifest.short_name;
host.description = manifest.description;
host.path = `${dirname}/${manifest.short_name}.js`;
host.type = "stdio";
host.allowed_origins = [];
host.allowed_origins.push(`chrome-extension://${id}/`);

chmodSync(host.path, 0o764);
console.log(`${host.path} set to executable.`);

writeFileSync(`${manifest.short_name}.json`, JSON.stringify(host, null, 2));
// https://chromium.googlesource.com/chromium/src.git/+/HEAD/docs/user_data_dir.md
writeFileSync(
  `${
    dirname.split("/").slice(0, 3).join("/")
  }/.config/chromium/NativeMessagingHosts/${host.name}.json`,
  JSON.stringify(host, null, 2),
);

console.log(
  `${host.name} Native Messaging host manifest written to ${dirname}/${manifest.short_name}.json and ${
    dirname.split("/").slice(0, 3).join("/")
  }/.config/chromium/NativeMessagingHosts/${host.name}.json.`,
);
