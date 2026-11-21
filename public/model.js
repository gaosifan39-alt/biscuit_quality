(() => {
  "use strict";
  const biscuitRules = [
    ["色泽", "表面颜色很浅", "表面颜色很深", "观察饼干正面，按颜色深浅评分。"],
    ["香气", "几乎闻不到香气", "香气非常浓", "拿近鼻子闻一下，按香气浓淡评分。"],
    ["酥脆度", "咬下去绵软", "咬下去有明显的脆裂感", "留意第一口咬断时是否干脆。"],
    ["甜度", "几乎没有甜味", "甜味非常强", "嚼几下，按甜味强弱评分。"],
    ["粘牙度", "牙齿上几乎不粘饼屑", "饼屑明显黏在牙齿上", "咽下后、喝水前，感受粘牙程度。"],
    ["孔隙度", "断面几乎看不到孔洞", "孔洞占断面的面积很大", "掰开饼干，观察孔洞占整个断面的面积。"],
    ["总体喜好", "非常不喜欢", "非常喜欢", "尝完后，按你有多喜欢这款饼干评分。"]
  ];
  const traits = biscuitRules.map(([name]) => name);
  const previousBiscuitTraits = [
    ["色泽", "裂纹", "酥脆度", "粘牙度", "风味"],
    ["色泽", "香气", "酥脆度", "甜度", "粘牙度", "总体喜好"]
  ];
  const sixItemEndpoints = [
    ["表面颜色很浅", "表面颜色很深"],
    ["几乎闻不到香气", "香气非常浓"],
    ["咬下去绵软，几乎没有脆感", "咬下去干脆，有明显的脆裂感"],
    ["几乎没有甜味", "甜味非常强"],
    ["牙齿上几乎不粘饼屑", "饼屑明显黏在牙齿上"],
    ["非常不喜欢", "非常喜欢"]
  ];
  const codeAt = index => "B-" + String(index + 1).padStart(3, "0");

  function usesPreviousBiscuitTraits(round) {
    if (round.customScale) return false;
    const old = previousBiscuitTraits.find(list =>
      list.length === round.traits.length && list.every((name, i) => name === round.traits[i]));
    if (!old || !round.template) return Boolean(old);
    const { foodType, version, traits: rules } = round.template;
    return old.length === sixItemEndpoints.length && foodType === "市售饼干" && version === "1.2"
      && rules?.length === old.length && rules.every((rule, i) => rule.name === old[i]
        && rule.min === 1 && rule.max === 10 && rule.low === sixItemEndpoints[i][0] && rule.high === sixItemEndpoints[i][1]);
  }

  function defaultTemplateFor(dimensions) {
    if (dimensions.length !== traits.length || !traits.every((name, i) => name === dimensions[i])) return;
    return {
      foodType: "小麦饼干", version: "1.3", contributor: "",
      instructions: "前六项按感受到的程度评分，最后一项评总体喜好。每项报名称和 1–10 的整数分数。",
      traits: biscuitRules.map(([name, low, high, instructions]) => ({ name, min: 1, max: 10, low, high, instructions }))
    };
  }

  function assignBlindCodes(names) {
    const shuffled = [...names];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled.map((name, i) => ({ name, code: codeAt(i) }));
  }

  function makeRound({ title = "小麦饼干品质盲评", names = Array(20).fill(""), dimensions = traits, rater = "评价员 01", template, codedSamples } = {}) {
    let snapshot;
    const builtIn = template == null ? defaultTemplateFor(dimensions) : undefined;
    template ??= builtIn;
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
    const samples = codedSamples ? codedSamples.map(({ code, name }) => ({ code, name })) : assignBlindCodes(names);
    return {
      id: crypto.randomUUID(), title, traits: snapshot ? snapshot.traits.map(rule => rule.name) : [...dimensions], rater,
      ...(snapshot ? { template: snapshot } : {}),
      ...(!builtIn ? { customScale: true } : {}),
      samples, current: samples[0]?.code ?? codeAt(0), drafts: {}, records: [], created: new Date().toISOString()
    };
  }

  function ensureScoringRound(state) {
    const source = state.rounds.find(round => round.id === state.active);
    if (!usesPreviousBiscuitTraits(source)) return source;
    let target = state.rounds.find(r => r.sevenItemSource === source.id);
    if (!target) {
      target = makeRound({ title: source.title + "（七项）", rater: source.rater, codedSamples: source.samples });
      target.current = source.current;
      target.sevenItemSource = source.id;
      const completed = new Set(source.records.map(record => key(record.code, record.rater)));
      const compatible = target.traits.filter(trait => source.traits.includes(trait) && (trait !== "色泽" || source.template));
      for (const [id, prior] of Object.entries(source.drafts)) {
        if (completed.has(id)) continue;
        const scores = Object.fromEntries(compatible
          .filter(trait => valid(prior.scores[trait], ruleFor(target, trait)))
          .map(trait => [trait, prior.scores[trait]]));
        if (Object.keys(scores).length || prior.note) target.drafts[id] = { scores, note: prior.note || "" };
      }
      state.rounds.push(target);
    }
    state.active = target.id;
    return target;
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
  globalThis.TasterModel = { traits, defaultTemplateFor, makeRound, usesPreviousBiscuitTraits, ensureScoringRound, findRecord, draft, ruleFor, valid, confirmScore };
})();
