import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { build } from "esbuild";

const root = fileURLToPath(new URL("..", import.meta.url));
const ledgerPath = path.join(root, "server/ledger.ts");
const source = fs.readFileSync(ledgerPath, "utf8");
const bundle = await build({
  stdin: {
    contents: `${source}\nexport { createSeedState, createMentorRecord, buildNextActionRecommendations, relatedMentorProfiles, activeDraftForMentorPerson, canonicalMentorProfileForPerson, indexMentorRelationships };`,
    resolveDir: path.dirname(ledgerPath),
    sourcefile: ledgerPath,
    loader: "ts",
  },
  bundle: true,
  platform: "node",
  format: "cjs",
  write: false,
});
const module = { exports: {} };
vm.runInNewContext(bundle.outputFiles[0].text, {
  module, exports: module.exports, require: createRequire(ledgerPath), process, console, Buffer, URL, structuredClone,
}, { filename: "ledger-recommendations-test.cjs" });
const exports = module.exports;
const { createSeedState, createMentorRecord, buildNextActionRecommendations } = exports;
const plain = (value) => JSON.parse(JSON.stringify(value));

const state = createSeedState();
const campaign = state.campaigns[0];
function mentor(id, fields = {}) {
  const result = createMentorRecord(state, campaign, { name: id, company: id, profileUrl: `https://example.invalid/${id}` });
  result.mentor.id = id;
  result.assessment.mentorProfileId = id;
  Object.assign(result.mentor, { createdAt: "2026-01-01T00:00:00.000Z", ...fields });
  return result.mentor;
}

const a = mentor("a");
const b = mentor("b", { mentorIdentityId: a.mentorIdentityId });
assert.equal(b.profileUrl, "https://example.invalid/b");
const c = mentor("c", { profileUrl: b.profileUrl });
mentor("closed", { stage: "closed" });
mentor("blank1", { profileUrl: "" });
mentor("blank2", { profileUrl: "" });
mentor("other-campaign", { campaignId: "other", mentorIdentityId: a.mentorIdentityId, profileUrl: a.profileUrl });
state.messageDrafts.push({ id: "sent-b", campaignId: campaign.id, mentorProfileId: b.id, status: "sent" });
state.messageDrafts.push({ id: "rejected-blank", campaignId: campaign.id, mentorProfileId: "blank1", status: "rejected" });
const actions = plain(buildNextActionRecommendations(state, campaign.id));
const typesFor = (id) => actions.filter((action) => action.mentorProfileId === id).map((action) => action.type).sort();
assert.deepEqual(typesFor("a"), []);
assert.deepEqual(typesFor("b"), ["review_duplicate_profile"]);
assert.deepEqual(typesFor("c"), ["review_duplicate_profile"]);
assert.deepEqual(typesFor("closed"), []);
assert.deepEqual(typesFor("other-campaign"), []);
assert.deepEqual(typesFor("blank1"), []);
assert.deepEqual(typesFor("blank2"), ["review_fit"]);
assert.deepEqual(plain(exports.relatedMentorProfiles(state, a)).map((item) => item.id), ["a", "b"]);
assert.deepEqual(plain(exports.relatedMentorProfiles(state, b)).map((item) => item.id), ["a", "b", "c"]);
assert.deepEqual(plain(exports.relatedMentorProfiles(state, c)).map((item) => item.id), ["b", "c"]);
console.log("PASS recommendation guards: direct identity/URL relations, no transitive matches, campaign isolation, closed profiles and sent/rejected drafts");

// Compare the request-local index with the unchanged direct lookup used by write guards.
const varied = createSeedState();
varied.mentorProfiles = Array.from({ length: 180 }, (_, i) => ({
  ...a,
  id: `profile-${i}`,
  campaignId: `campaign-${i % 3}`,
  mentorIdentityId: `identity-${i % 11}`,
  profileUrl: [null, "", "   ", ` HTTPS://EXAMPLE.INVALID/${i % 13} `, `https://example.invalid/${i % 13}`][i % 5],
  createdAt: i % 17 === 0 ? "invalid-date" : `2026-01-${String((i % 9) + 1).padStart(2, "0")}T00:00:00.000Z`,
}));
varied.messageDrafts = varied.mentorProfiles.map((profile, i) => ({
  id: `message-${i}`,
  mentorProfileId: profile.id,
  campaignId: profile.campaignId,
  status: ["rejected", "draft", "approved", "sent"][i % 4],
}));
const lookup = exports.indexMentorRelationships(varied.mentorProfiles);
for (const profile of varied.mentorProfiles) {
  assert.deepEqual(plain(exports.relatedMentorProfiles(varied, profile, lookup)), plain(exports.relatedMentorProfiles(varied, profile)));
  assert.equal(exports.canonicalMentorProfileForPerson(varied, profile, lookup)?.id, exports.canonicalMentorProfileForPerson(varied, profile)?.id);
  assert.equal(exports.activeDraftForMentorPerson(varied, profile.campaignId, profile, lookup)?.id, exports.activeDraftForMentorPerson(varied, profile.campaignId, profile)?.id);
}
console.log("PASS 180 differential cases: indexed and direct lookups agree on related profiles, canonical order and active drafts");

const large = createSeedState();
const largeCampaign = large.campaigns[0];
const count = 1000;
for (let i = 0; i < count; i++) {
  createMentorRecord(large, largeCampaign, { name: `Synthetic ${i}`, company: `Company ${i}`, profileUrl: `https://example.invalid/${i}` });
}
let urlReads = 0;
for (const profile of large.mentorProfiles) {
  const url = profile.profileUrl;
  Object.defineProperty(profile, "profileUrl", { enumerable: true, get() { urlReads++; return url; } });
}
const recommendations = buildNextActionRecommendations(large, largeCampaign.id);
assert.equal(recommendations.filter((action) => action.mentorProfileId).length, count);
assert.ok(urlReads <= count * 10, `Repeated profile scans: ${urlReads} URL reads for ${count} distinct mentors (budget ${count * 10})`);
console.log(`PASS bounded relationship work: ${urlReads} URL reads for ${count} profiles`);
