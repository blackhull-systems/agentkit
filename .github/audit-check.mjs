// Fails on any high or critical npm advisory in what a user installs, unless it is listed in audit-exceptions.txt
// with the reason it was accepted. An exception is public, specific (one advisory id) and reviewed, never a blanket
// switch-off.   usage: npm audit --omit=dev --json > audit.json; node audit-check.mjs audit.json audit-exceptions.txt
import { readFileSync, existsSync } from "node:fs";

const [report, exceptions] = process.argv.slice(2);
const allowed = new Set(existsSync(exceptions)
  ? readFileSync(exceptions, "utf8").split("\n").map(l => l.split("#")[0].trim()).filter(Boolean) : []);
const found = new Map();
for (const v of Object.values(JSON.parse(readFileSync(report, "utf8")).vulnerabilities || {})) {
  for (const via of v.via) {
    if (typeof via !== "object" || !["high", "critical"].includes(via.severity)) continue;  // strings: the path to it
    const id = via.url.split("/").pop();
    found.set(id, `${via.severity}: ${v.name} ${via.range}: ${via.title} (${via.url})`);
  }
}
const open = [...found].filter(([id]) => !allowed.has(id));
for (const [id] of found) if (allowed.has(id)) console.log(`accepted ${id}: see audit-exceptions.txt`);
for (const id of allowed) if (!found.has(id)) console.log(`note: exception ${id} no longer applies; remove it`);
if (open.length) {
  console.error(open.map(([, s]) => s).join("\n"));
  process.exit(1);
}
console.log("no unreviewed high or critical advisories");
