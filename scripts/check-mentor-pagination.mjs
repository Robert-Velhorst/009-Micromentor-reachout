import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { transform } from "esbuild";

const file = fileURLToPath(new URL("../client/src/lib/mentorPagination.ts", import.meta.url));
assert.ok(fs.existsSync(file), "The mentor list needs a bounded page calculation");
const { code } = await transform(fs.readFileSync(file, "utf8"), { loader: "ts", format: "esm" });
const { mentorPageWindow } = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
assert.deepEqual(mentorPageWindow(0, 1), { page: 1, pageCount: 1, start: 0, end: 0 });
assert.deepEqual(mentorPageWindow(26, 2), { page: 2, pageCount: 2, start: 25, end: 26 });
assert.deepEqual(mentorPageWindow(25, 999), { page: 1, pageCount: 1, start: 0, end: 25 });
for (const page of [NaN, Infinity, -1, 0]) assert.equal(mentorPageWindow(1000, page).page, 1);
assert.equal(mentorPageWindow(1000, 1.9).page, 1);
const records = Array.from({ length: 1000 }, (_, i) => ({ id: i }));
const visited = [];
for (let page = 1; page <= 40; page++) {
  const range = mentorPageWindow(records.length, page);
  const slice = records.slice(range.start, range.end);
  assert.equal(slice.length, 25);
  visited.push(...slice.map((record) => record.id));
}
assert.deepEqual(visited, records.map((record) => record.id));
const filtered = records.filter((record) => record.id === 0);
const range = mentorPageWindow(filtered.length, 40);
assert.deepEqual(filtered.slice(range.start, range.end), [{ id: 0 }]);
console.log("PASS mentor pagination: bounded pages, complete reachability, shrinking filters, empty results and invalid page values");
