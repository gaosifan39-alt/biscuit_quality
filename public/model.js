(() => {
  "use strict";
  const traits = ["色泽", "裂纹", "酥脆度", "粘牙度", "风味"];
  const codeAt = index => "B-" + String(index + 1).padStart(3, "0");

  function makeRound({ title = "小麦饼干品质盲评", names = Array(20).fill(""), dimensions = traits, rater = "评价员 01" } = {}) {
    const shuffled = [...names];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return {
      id: crypto.randomUUID(), title, traits: [...dimensions], rater,
      samples: shuffled.map((name, i) => ({ name, code: codeAt(i) })),
      current: codeAt(0), drafts: {}, records: [], created: new Date().toISOString()
    };
  }

  const key = (code, rater) => JSON.stringify([code, rater]);
  function findRecord(round, code = round.current) {
    return round.records.find(record => record.code === code && record.rater === round.rater);
  }
  function draft(round) {
    const id = key(round.current, round.rater);
    if (!round.drafts[id]) {
      const record = findRecord(round);
      round.drafts[id] = { scores: { ...record?.scores }, note: record?.note || "" };
    }
    return round.drafts[id];
  }
  const valid = value => Number.isInteger(value) && value >= 1 && value <= 10;
  function confirmScore(round) {
    const entry = draft(round);
    if (round.traits.some(t => !valid(entry.scores[t]))) throw Error("请补全所有性状的 1–10 分整数评分。");
    const found = findRecord(round);
    const record = { code: round.current, rater: round.rater, scores: { ...entry.scores }, note: entry.note.trim(), at: new Date().toISOString() };
    if (found) Object.assign(found, record);
    else round.records.push(record);
    delete round.drafts[key(round.current, round.rater)];
    const i = round.samples.findIndex(s => s.code === round.current);
    const next = round.samples.slice(i + 1).concat(round.samples.slice(0, i)).find(s => !findRecord(round, s.code));
    if (next) round.current = next.code;
    return { record, done: !next };
  }
  globalThis.TasterModel = { traits, makeRound, findRecord, draft, valid, confirmScore };
})();
