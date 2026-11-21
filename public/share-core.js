(() => {
  "use strict";
  const encoder = new TextEncoder();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const MAX_RECORDS = 20000;
  const MAX_ENVELOPE_BYTES = 2 * 1024 * 1024;
  const EC = "P-256";
  const signatureAlgorithm = { name: "ECDSA", hash: "SHA-256" };
  const kinds = ["data", "request", "decision"];
  const extraColumns = {
    variety:  {label:"真实品种", source:"sample", property:"name", limit:80},
    location: {label:"田间地点", source:"sample", property:"location", limit:200},
    note:     {label:"备注", source:"record", property:"note", limit:2000},
    quote:    {label:"个人原话", source:"record", property:"quote", limit:2000}
  };
  function eligibleExtras(fields = []) {
    const known = Object.keys(extraColumns);
    checkFields(fields, known, true);
    return known.filter(field => fields.includes(field));
  }
  function extraText(item, field) {
    const column = extraColumns[field];
    const value = Object.hasOwn(item, column.property) ? item[column.property] : "";
    check(typeof value === "string" && value.length <= column.limit, column.label + "须为不超过 " + column.limit + " 字符的文字。");
    return value;
  }

  function check(value, message = "共享材料的格式无效。") {
    if (!value) throw new Error(message);
  }
  function subtle() {
    check(globalThis.crypto?.subtle, "此浏览器需要通过 HTTPS 或 localhost 打开共享功能。");
    return crypto.subtle;
  }
  function exact(value, keys) {
    check(value && typeof value === "object" && !Array.isArray(value));
    check(Object.keys(value).length === keys.length && keys.every(k => Object.hasOwn(value, k)));
  }
  const isID = x => typeof x === "string" && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(x);
  const blind = value => typeof value === "string" && /^B-\d{3}$/.test(value);
  // Records have already passed their template's per-trait bounds at confirmation.
  const validScore = value => Number.isInteger(value) && value >= -100 && value <= 1000;
  function foodType(round) {
    const type = round.template?.foodType ?? "小麦饼干";
    check(typeof type === "string" && type.trim() && type.trim().length <= 60);
    return type.trim().replace(/[\x00-\x1f\x7f]/g, " ").replace(/\s+/g, " ");
  }

  function b64(bytes) {
    const parts = [];
    for (let i = 0; i < bytes.length; i += 16384) parts.push(String.fromCharCode(...bytes.subarray(i, i + 16384)));
    return btoa(parts.join("")).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function unb64(value, maxBytes = MAX_ENVELOPE_BYTES) {
    check(typeof value === "string" && value.length > 0 && value.length <= Math.ceil(maxBytes * 4 / 3)
      && /^[\w-]+$/.test(value), "共享材料格式错误或超过大小上限。");
    const raw = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(raw, c => c.charCodeAt(0));
  }
  function jsonBytes(value) { return encoder.encode(JSON.stringify(value)); }
  function encode(kind, value) {
    check(kinds.includes(kind) && value?.kind === kind);
    const bytes = jsonBytes(value);
    check(bytes.length <= MAX_ENVELOPE_BYTES, "共享材料超过 2 MiB。");
    return "#" + kind + "=" + b64(bytes);
  }
  function decode(hash) {
    check(typeof hash === "string" && hash.length <= Math.ceil(MAX_ENVELOPE_BYTES * 4 / 3) + 12);
    const match = /^#(data|request|decision)=([\w-]+)$/.exec(hash);
    check(match, "无法识别这个共享链接。");
    const value = JSON.parse(decoder.decode(unb64(match[2])));
    check(value?.kind === match[1] && value?.v === 1);
    return { kind: match[1], value };
  }

  // Signing uses a fixed, sorted JSON representation (only JSON primitives/tables enter it).
  function canonical(value) {
    if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
    if (value && typeof value === "object") {
      return "{" + Object.keys(value).sort().map(key => JSON.stringify(key) + ":" + canonical(value[key])).join(",") + "}";
    }
    return JSON.stringify(value);
  }
  function validatePublic(key) {
    exact(key, ["kty", "crv", "x", "y"]);
    check(key.kty === "EC" && key.crv === EC && [key.x, key.y].every(x => typeof x === "string" && /^[\w-]{43}$/.test(x)));
  }
  async function keyPair(name, usages) {
    const pair = await subtle().generateKey({ name, namedCurve: EC }, true, usages);
    const { kty, crv, x, y } = await subtle().exportKey("jwk", pair.publicKey);
    return { publicKey: { kty, crv, x, y }, privateKey: await subtle().exportKey("jwk", pair.privateKey) };
  }
  const ownerKeys = () => keyPair("ECDSA", ["sign", "verify"]);
  async function applicantKeys() {
    const pair = await keyPair("ECDH", ["deriveBits"]);
    return { ...pair, signingKeys: await ownerKeys() };
  }
  function importEC(key, name, usages) {
    return subtle().importKey("jwk", key, { name, namedCurve: EC }, false, usages);
  }
  async function sign(data, keys) {
    const key = await importEC(keys.privateKey, "ECDSA", ["sign"]);
    const bytes = await subtle().sign(signatureAlgorithm, key, encoder.encode(canonical(data)));
    return { ...data, sig: b64(new Uint8Array(bytes)) };
  }
  async function verify(data, publicKey) {
    validatePublic(publicKey);
    const { sig, ...body } = data;
    const key = await importEC(publicKey, "ECDSA", ["verify"]);
    const ok = await subtle().verify(signatureAlgorithm, key, unb64(sig, 64), encoder.encode(canonical(body)));
    check(ok, "签名校验未通过，请向原发送方重新索取材料。");
  }
  function validateTraits(traits) {
    check(Array.isArray(traits) && traits.length >= 1 && traits.length <= 12
      && traits.every(t => typeof t === "string" && t.trim() && t.length <= 20 && !(t in Object.prototype))
      && new Set(traits).size === traits.length);
  }
  function checkRound(round) {
    validateTraits(round.traits);
    check(typeof round.id === "string" && round.id.length > 0 && round.id.length <= 100);
    check(Array.isArray(round.samples) && round.samples.length >= 1 && round.samples.length <= 200);
    check(Array.isArray(round.records) && round.records.length <= MAX_RECORDS, "此版本每张共享卡最多支持两万条确认记录。");
    const codes = new Set(round.samples.map(sample => sample.code));
    check(codes.size === round.samples.length && [...codes].every(blind), "场次盲码无效。");
    for (const record of round.records) {
      check(codes.has(record.code) && round.traits.every(t => validScore(record.scores?.[t])), "已确认的记录包含无效盲码或评分。");
    }
  }
  // Bind this publication to the releasable projection. The private random local round id
  // salts the commitment so a viewer cannot enumerate a small round's scores from it.
  async function commitment(round, cardId, extras) {
    const rows = round.records.map(r => [r.code, ...round.traits.map(t => r.scores[t])]);
    const input = [cardId, round.id, foodType(round), round.traits, round.samples.map(s => s.code), rows];
    if (extras.length) {
      const atSample = extras.filter(field => extraColumns[field].source === "sample");
      const atRecord = extras.filter(field => extraColumns[field].source === "record");
      input.push(extras, atSample.length ? round.samples.map(s => atSample.map(field => extraText(s, field))) : [],
        atRecord.length ? round.records.map(r => atRecord.map(field => extraText(r, field))) : []);
    }
    return b64(new Uint8Array(await subtle().digest("SHA-256", jsonBytes(input))));
  }
  async function card(round, mode, keys) {
    check(mode === "summary" || mode === "metadata");
    validatePublic(keys.publicKey);
    // A minimal publisher snapshot can omit its id. The UI retains this private nonce with the snapshot.
    if (round.id == null) round.id = crypto.randomUUID();
    checkRound(round);
    const id = crypto.randomUUID();
    const extras = mode === "metadata" ? eligibleExtras(round.extraFields) : [];
    const count = round.records.length;
    const stats = mode === "summary" ? round.traits.map(trait => {
      const sum = round.records.reduce((total, row) => total + row.scores[trait], 0);
      return { trait, count, mean: count ? Math.round(100 * sum / count) / 100 : null };
    }) : [];
    return sign({ v: 1, kind: "data", id, mode, foodType: foodType(round), availableFields: [...baseFields(round), ...extras], traits: [...round.traits], sampleCount: round.samples.length,
      recordCount: count, stats, owner: keys.publicKey, version: await commitment(round, id, extras) }, keys);
  }
  async function verifyCard(c) {
    exact(c, ["v","kind","id","mode","traits","sampleCount","recordCount","stats","owner","version","sig","foodType","availableFields"]);
    check(c.v === 1 && c.kind === "data" && isID(c.id) && ["metadata","summary"].includes(c.mode));
    validateTraits(c.traits);
    check(typeof c.foodType === "string" && c.foodType.length > 0 && c.foodType.length <= 60 && !/[\x00-\x1f\x7f]/.test(c.foodType));
    const base = baseFields(c);
    check(Array.isArray(c.availableFields) && c.availableFields.length >= base.length
      && base.every((field, i) => field === c.availableFields[i]));
    const tail = c.availableFields.slice(base.length);
    const extras = eligibleExtras(tail);
    check((!extras.length || c.mode === "metadata") && extras.every((field, i) => field === tail[i]));
    check(Number.isInteger(c.sampleCount) && c.sampleCount >= 1 && c.sampleCount <= 200
      && Number.isInteger(c.recordCount) && c.recordCount >= 0 && c.recordCount <= MAX_RECORDS);
    check(typeof c.version === "string" && /^[\w-]{43}$/.test(c.version));
    check(Array.isArray(c.stats) && c.stats.length === (c.mode === "summary" ? c.traits.length : 0));
    c.stats.forEach((s, i) => {
      exact(s, ["trait","count","mean"]);
      const boundedMean = Number.isFinite(s.mean) && s.mean >= -100 && s.mean <= 1000;
      // Old v1 cards suppressed one- and two-record means. Their original signatures still verify.
      check(s.trait === c.traits[i] && s.count === c.recordCount &&
        ((s.count < 3 && s.mean === null) || (s.count > 0 && boundedMean)));
    });
    await verify(c, c.owner);
    return c;
  }
  function baseFields(c) { return ["code", ...c.traits.map((_, i) => "trait:" + i)]; }
  function checkFields(fields, allowed, allowEmpty = false) {
    check(Array.isArray(fields) && (allowEmpty || fields.length > 0) && fields.length <= allowed.length
      && new Set(fields).size === fields.length && fields.every(key => allowed.includes(key)), "选择的字段无效或超出申请范围。");
  }
  function fieldLabel(c, key) {
    checkFields([key], c.availableFields);
    if (Object.hasOwn(extraColumns, key)) return extraColumns[key].label;
    return key === "code" ? "样品盲码" : c.traits[Number(key.slice(6))];
  }
  async function request(c, purpose, fields, keys) {
    await verifyCard(c);
    check(c.mode === "metadata", "只有数据说明卡接受明细申请。");
    check(typeof purpose === "string" && purpose.trim() && purpose.trim().length <= 500, "请填写 1–500 字的使用目的。");
    checkFields(fields, c.availableFields);
    validatePublic(keys.publicKey);
    validatePublic(keys.signingKeys.publicKey);
    return sign({ v: 1, kind: "request", id: crypto.randomUUID(), cardId: c.id, cardSig: c.sig,
      purpose: purpose.trim(), fields: [...fields], recipient: keys.publicKey, signer: keys.signingKeys.publicKey }, keys.signingKeys);
  }
  async function review(c, r) {
    await verifyCard(c);
    check(c.mode === "metadata", "只有数据说明卡接受明细申请。");
    exact(r, ["v","kind","id","cardId","cardSig","purpose","fields","recipient","signer","sig"]);
    check(r.v === 1 && r.kind === "request" && isID(r.id) && r.cardId === c.id && r.cardSig === c.sig, "申请与共享卡不匹配。");
    check(typeof r.purpose === "string" && r.purpose.trim() && r.purpose.length <= 500);
    checkFields(r.fields, c.availableFields);
    validatePublic(r.recipient);
    await verify(r, r.signer);
    return r;
  }
  async function preview(round, c, r, fields) {
    await review(c, r);
    checkFields(fields, r.fields, true);
    if (!fields.length) return { fields: [], rows: [] };
    checkRound(round);
    const extras = eligibleExtras(round.extraFields);
    check(await commitment(round, c.id, extras) === c.version, "当前快照与发布时的版本不同，请重新发布并申请。");
    const byCode = new Map(round.samples.map(sample => [sample.code, sample]));
    const rows = round.records.map(record => fields.map(field => {
      if (field === "code") return record.code;
      if (Object.hasOwn(extraColumns, field)) {
        return extraText(extraColumns[field].source === "sample" ? byCode.get(record.code) : record, field);
      }
      return record.scores[c.traits[Number(field.slice(6))]];
    }));
    return { fields: [...fields], rows };
  }
  // ECDH with a fresh sender key per receipt. HKDF binds the AES key to the exact signed request.
  async function receiptKey(privateJwk, publicJwk, c, r) {
    const privateKey = await importEC(privateJwk, "ECDH", ["deriveBits"]);
    const publicKey = await importEC(publicJwk, "ECDH", []);
    const secret = await subtle().deriveBits({ name: "ECDH", public: publicKey }, privateKey, 256);
    const material = await subtle().importKey("raw", secret, "HKDF", false, ["deriveKey"]);
    return subtle().deriveKey({ name: "HKDF", hash: "SHA-256", salt: unb64(c.version, 32),
      info: jsonBytes(["little-taster/receipt/v1", c.sig, r.sig]) }, material, { name: "AES-GCM", length: 256 }, false, ["encrypt","decrypt"]);
  }
  function aad(c, r) { return jsonBytes(["little-taster/decision/v1", c.id, r.id, c.sig, r.sig]); }
  async function decide(round, c, r, fields, keys) {
    const projected = await preview(round, c, r, fields);
    check(canonical(keys.publicKey) === canonical(c.owner), "本机缺少此卡的发布密钥。");
    const ephemeral = await keyPair("ECDH", ["deriveBits"]);
    const key = await receiptKey(ephemeral.privateKey, r.recipient, c, r);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const clear = jsonBytes({ approved: projected.fields.length > 0, ...projected });
    const cipher = await subtle().encrypt({ name: "AES-GCM", iv, additionalData: aad(c, r) }, key, clear);
    const decision = await sign({ v: 1, kind: "decision", id: crypto.randomUUID(), cardId: c.id, requestId: r.id, requestSig: r.sig,
      ephemeral: ephemeral.publicKey, iv: b64(iv), cipher: b64(new Uint8Array(cipher)) }, keys);
    check(jsonBytes(decision).length <= MAX_ENVELOPE_BYTES, "回执超过大小限制，请减少字段。");
    return decision;
  }
  async function open(c, r, d, keys) {
    await review(c, r);
    exact(d, ["v","kind","id","cardId","requestId","requestSig","ephemeral","iv","cipher","sig"]);
    check(d.v === 1 && d.kind === "decision" && isID(d.id) && d.cardId === c.id && d.requestId === r.id && d.requestSig === r.sig,
      "回执与本机保存的申请不匹配。");
    validatePublic(d.ephemeral);
    check(typeof d.cipher === "string" && d.cipher.length <= MAX_ENVELOPE_BYTES && typeof d.iv === "string" && /^[\w-]{16}$/.test(d.iv));
    await verify(d, c.owner);
    check(canonical(keys.publicKey) === canonical(r.recipient), "请使用提交申请时的浏览器打开回执。");
    const key = await receiptKey(keys.privateKey, d.ephemeral, c, r);
    let clear;
    try {
      clear = await subtle().decrypt({ name: "AES-GCM", iv: unb64(d.iv, 12), additionalData: aad(c, r) }, key, unb64(d.cipher));
    } catch { throw new Error("此设备无法解密回执，请回到发起申请的浏览器。"); }
    const grant = JSON.parse(decoder.decode(clear));
    exact(grant, ["approved","fields","rows"]);
    checkFields(grant.fields, r.fields, true);
    check(grant.approved === (grant.fields.length > 0) && Array.isArray(grant.rows)
      && grant.rows.length === (grant.approved ? c.recordCount : 0));
    for (const row of grant.rows) {
      check(Array.isArray(row) && row.length === grant.fields.length && row.every((value, i) => {
        const field = grant.fields[i];
        if (field === "code") return blind(value);
        if (Object.hasOwn(extraColumns, field)) return typeof value === "string" && value.length <= extraColumns[field].limit;
        return validScore(value);
      }));
    }
    return grant;
  }
  globalThis.TasterShare = Object.freeze({ ownerKeys, applicantKeys, card, verifyCard, request, review, preview, decide, open, fieldLabel, encode, decode });
})();
