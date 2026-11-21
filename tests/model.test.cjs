const test = require("node:test");
const assert = require("node:assert/strict");
require("../public/model.js");
const { makeRound, draft, confirmScore, findRecord } = globalThis.TasterModel;
test("partial entries stay in drafts; confirmation advances and edits replace the same rater's row", () => {
  const round = makeRound({ names: ["甲", "乙"], dimensions: ["裂纹"] });
  assert.throws(() => confirmScore(round));
  draft(round).scores["裂纹"] = 8;
  confirmScore(round);
  assert.equal(round.current, "B-002");
  round.current = "B-001";
  draft(round).scores["裂纹"] = 7;
  confirmScore(round);
  round.current = "B-001";
  assert.equal(findRecord(round).scores["裂纹"], 7);
  assert.equal(round.records.length, 1);
  round.rater = "乙";
  assert.deepEqual(draft(round).scores, {});
  draft(round).scores["裂纹"] = 9;
  confirmScore(round);
  assert.equal(round.records.length, 2);
});

test("each round freezes a copy of its template, including each trait's own range", () => {
  const template = { foodType: "饼干", version: "1.2", contributor: "组员",
    instructions: "先观察再品尝",
    traits: [
      { name: "偏甜", min: -4, max: 4, low: "太淡", high: "太甜", instructions: "零为正好" },
      { name: "整体", min: 0, max: 100 }
    ]
  };
  const round = makeRound({ template, names: ["甲"] });
  template.traits[0].min = 1;
  template.instructions = "更新说明";
  assert.deepEqual(round.traits, ["偏甜", "整体"]);
  assert.equal(round.template.instructions, "先观察再品尝");
  assert.equal(TasterModel.ruleFor(round, "偏甜").min, -4);
  const scores = draft(round).scores;
  Object.assign(scores, { 偏甜: -4, 整体: 101 });
  assert.throws(() => confirmScore(round), /整体.*0 到 100/);
  assert.equal(round.records.length, 0);
  scores.整体 = 0;
  const { record } = confirmScore(round);
  assert.deepEqual(record.scores, { 偏甜: -4, 整体: 0 });
});

test("invalid template bounds and duplicate columns are rejected at round creation", () => {
  for (const [min, max] of [[0, 0], [3, 2], [-101, 10], [1, 1001], [0.5, 10], [null, 10]]) {
    assert.throws(() => makeRound({ template: { traits: [{ name: "香气", min, max }] } }));
  }
  const rule = { name: "香气", min: -100, max: 1000 };
  const round = makeRound({ template: { traits: [rule] } });
  assert.ok(TasterModel.valid(1000, TasterModel.ruleFor(round, rule.name)));
  assert.ok(!TasterModel.valid(0));
  assert.throws(() => makeRound({ template: { traits: [rule, { ...rule, name: " 香气 " }] } }));
  assert.deepEqual([TasterModel.ruleFor({}, "甜").min, TasterModel.ruleFor({}, "甜").max], [1, 10]);
});
