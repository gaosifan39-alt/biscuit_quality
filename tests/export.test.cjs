const test = require("node:test");
const assert = require("node:assert/strict");
require("../public/export.js");

// Read the published central directory, then follow each offset to its ZIP member.
function readSheets(bytes) {
  const archive = Buffer.from(bytes);
  const end = archive.length - 22;
  assert.equal(archive.readUInt32LE(end), 0x06054b50);
  const count = archive.readUInt16LE(end + 10);
  let cursor = archive.readUInt32LE(end + 16);
  const parts = {};
  for (let i = 0; i < count; i++) {
    assert.equal(archive.readUInt32LE(cursor), 0x02014b50);
    const nameLength = archive.readUInt16LE(cursor + 28);
    const name = archive.toString("utf8", cursor + 46, cursor + 46 + nameLength);
    const offset = archive.readUInt32LE(cursor + 42);
    assert.equal(archive.readUInt32LE(offset), 0x04034b50);
    const start = offset + 30 + archive.readUInt16LE(offset + 26);
    const length = archive.readUInt32LE(offset + 22);
    parts[name] = archive.toString("utf8", start, start + length);
    cursor += 46 + nameLength;
  }
  assert.equal(cursor, end);
  return parts;
}

function fixture() {
  return {
    title: "冬季盲评", traits: ["色泽", "裂纹"], rater: "当前评价员",
    samples: [{ code: "003", name: "小麦 & A" }, { code: "004", name: "B<2>" }],
    records: [{ code: "003", rater: "评价员甲", scores: { 色泽: 10, 裂纹: 1 }, note: "=1+1", at: "2026-11-20T16:00:00Z" }]
  };
}

test("organizer export aligns numeric scores, text IDs, original raters and every sample", () => {
  const parts = readSheets(TasterExport.build(fixture()));
  const ratings = parts["xl/worksheets/sheet1.xml"];
  const mapping = parts["xl/worksheets/sheet2.xml"];
  assert.match(ratings, /r="A2"[^>]*t="inlineStr"[^>]*><is><t[^>]*>003</);
  assert.match(ratings, /小麦 &amp; A/);
  assert.match(ratings, /评价员甲/);
  assert.doesNotMatch(ratings, /当前评价员|004|<f>/);
  assert.match(ratings, /r="D2"[^>]*t="n"><v>10<\/v>/);
  assert.match(ratings, /r="E2"[^>]*t="n"><v>1<\/v>/);
  assert.match(ratings, /r="F2"[^>]*t="inlineStr"[^>]*><is><t[^>]*>=1\+1</);
  assert.match(ratings, /r="G2" s="3" t="n"><v>46347<\/v>/);
  assert.match(ratings, /<autoFilter ref="A1:H2"\/>/);
  assert.match(ratings, /state="frozen"/);
  assert.match(mapping, /004/);
  assert.match(mapping, /B&lt;2&gt;/);
});

test("empty rounds retain complete headers and column references past Z", () => {
  const round = fixture();
  round.records = [];
  round.traits = Array.from({ length: 28 }, (_, i) => "性状" + i);
  const sheet = readSheets(TasterExport.build(round))["xl/worksheets/sheet1.xml"];
  assert.match(sheet, /<autoFilter ref="A1:AH1"\/>/);
  assert.doesNotMatch(sheet, /<row r="2"/);
});

test("out-of-range scores are flagged at export", () => {
  const round = fixture();
  round.records[0].scores.裂纹 = 11;
  assert.throws(() => TasterExport.build(round), /1 至 10/);
});
