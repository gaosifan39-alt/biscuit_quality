(() => {
  "use strict";
  const traits = ["色泽", "裂纹", "酥脆度", "粘牙度", "风味"];
  const codeAt = index => "B-" + String(index + 1).padStart(3, "0");

  function makeRound({ title = "小麦饼干品质盲评", names = Array(20).fill(""), dimensions = traits, rater = "评价员 01", template } = {}) {
    let snapshot;
    if (template != null) {
      snapshot = JSON.parse(JSON.stringify(template));
      if (!Array.isArray(snapshot.traits) || !snapshot.traits.length) throw Error("模板至少需要一项评价性状。");
      const namesSeen = new Set();
      for (const rule of snapshot.traits) {
        if (typeof rule?.name !== "string" || !rule.name.trim() || namesSeen.has(rule.name.trim())) throw Error("各项性状需要有不同的名称。");
        rule.name = rule.name.trim();
        namesSeen.add(rule.name);
        if (!Number.isInteger(rule.min) || !Number.isInteger(rule.max) ||
            rule.min < -100 || rule.max > 1000 || rule.min >= rule.max) {
          throw Error(`${rule.name}的评分上下限须为 -100 到 1000 之间的整数，且下限小于上限。`);
        }
      }
    }
    const shuffled = [...names];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return {
      id: crypto.randomUUID(), title, traits: snapshot ? snapshot.traits.map(rule => rule.name) : [...dimensions], rater,
      ...(snapshot ? { template: snapshot } : {}),
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
  function ruleFor(round, trait) {
    return round.template?.traits.find(rule => rule.name === trait) ??
      { name: trait, min: 1, max: 10, low: "", high: "", instructions: "" };
  }
  const valid = (value, rule = { min: 1, max: 10 }) => Number.isInteger(value) && value >= rule.min && value <= rule.max;
  function confirmScore(round) {
    const entry = draft(round);
    for (const trait of round.traits) {
      const rule = ruleFor(round, trait);
      if (!valid(entry.scores[trait], rule)) throw Error(`请为“${trait}”填写 ${rule.min} 到 ${rule.max} 之间的整数评分。`);
    }
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
  globalThis.TasterModel = { traits, makeRound, findRecord, draft, ruleFor, valid, confirmScore };
})();
