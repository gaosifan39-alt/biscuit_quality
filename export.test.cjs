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

test("a new biscuit session exports the seven default traits in tasting order", () => {
  require("../public/model.js");
  require("../public/templates.js");
  const traits = ["色泽", "香气", "酥脆度", "甜度", "粘牙度", "孔隙度", "总体喜好"];
  const round = TasterModel.makeRound({ names: ["试吃样品"] });
  assert.deepEqual(round.traits, traits);
  assert.deepEqual(TasterTemplates.fromRound({ traits }), round.template);
  const oldRound = { id: "earlier", traits: ["色泽", "裂纹"] };
  assert.equal(TasterTemplates.fromRound(oldRound).traits[0].high, "色泽很满意");
  traits.forEach((name, i) => { TasterModel.draft(round).scores[name] = i + 2; });
  TasterModel.confirmScore(round);
  const sheets = readSheets(TasterExport.build(round));
  const scores = sheets["xl/worksheets/sheet1.xml"];
  for (const [i, name] of traits.entries()) {
    const column = "DEFGHIJ"[i];
    assert.ok(scores.includes('r="' + column + '1" s="1" t="inlineStr"><is><t xml:space="preserve">' + name + '</t>'));
    assert.ok(scores.includes('r="' + column + '2" s="2" t="n"><v>' + (i + 2) + '</v>'));
  }
  assert.match(sheets["xl/worksheets/sheet3.xml"], /观察孔洞占整个断面的面积/);
});

test("out-of-range scores are flagged at export", () => {
  const round = fixture();
  round.records[0].scores.裂纹 = 11;
  assert.throws(() => TasterExport.build(round), /1 至 10/);
});

test("custom ranges export as numbers, with the round's rubric for interpretation", () => {
  const round = fixture();
  round.template = { foodType: "饼干", version: "1.2", instructions: "先观察", contributor: "组员",
    traits: [
      { name: "色泽", min: -100, max: 100, low: "偏淡", high: "偏深", instructions: "对照色卡" },
      { name: "裂纹", min: 0, max: 3, low: "无", high: "明显", instructions: "" }
    ] };
  round.records[0].scores = { 色泽: -90, 裂纹: 0 };
  const parts = readSheets(TasterExport.build(round));
  const sheet = parts["xl/worksheets/sheet1.xml"];
  assert.match(sheet, /r="D2"[^>]*t="n"><v>-90<\/v>/);
  assert.match(sheet, /r="E2"[^>]*t="n"><v>0<\/v>/);
  assert.match(parts["xl/workbook.xml"], /name="评分量表"/);
  for (const label of ["偏淡", "偏深", "对照色卡", "先观察", "组员", "1.2"]) {
    assert.ok(parts["xl/worksheets/sheet3.xml"].includes(label));
  }
  for (const path of ["[Content_Types].xml", "xl/_rels/workbook.xml.rels"]) {
    assert.match(parts[path], /worksheets\/sheet3.xml/);
  }
  round.records[0].scores.裂纹 = 4;
  assert.throws(() => TasterExport.build(round), /0 至 3/);
});
