const test = require("node:test");
const assert = require("node:assert/strict");
require("../public/share-core.js");
const S = globalThis.TasterShare;
const copy = value => JSON.parse(JSON.stringify(value));
const deliver = (kind, message) => S.decode(S.encode(kind, copy(message))).value;

function sampleRound() {
  const record = (code, first, second) => ({
    code, scores: { 色泽: first, 酥脆度: second }, note: "非公开备注", rater: "非公开评价人", at: "私有时间"
  });
  return {
    title: "非公开农场名称", owner: "非公开所有者", template: { foodType: "燕麦饼干", contributor: "非公开作者" },
    traits: ["色泽","酥脆度"], samples: [{ code: "B-001", name: "非公开品种名" }, { code: "B-002", name: "非公开品种二" }],
    records: [record("B-001", 25, 6), record("B-002", 23, 8), record("B-002", 30, 7)]
  };
}

test("public cards expose whitelisted metadata and optionally grouped trait means", async () => {
  const round = sampleRound();
  const owner = await S.ownerKeys();
  const c = await S.card(round, "metadata", owner);
  await S.verifyCard(deliver("data", c));
  assert.ok(round.id);
  assert.equal(c.foodType, "燕麦饼干");
  assert.deepEqual(c.stats, []);
  assert.deepEqual(c.availableFields, ["code", "trait:0", "trait:1"]);
  assert.equal(c.recordCount, 3);
  assert.equal(c.sampleCount, 2);
  assert.doesNotMatch(JSON.stringify(c), /非公开|B-001|B-002|私有时间|"records"|"rows"|"scores"|"privateKey"/);
  assert.ok(!JSON.stringify(c).includes(round.id));
  assert.ok(!JSON.stringify(c).includes(owner.privateKey.d));
  const summary = await S.card(round, "summary", owner);
  assert.deepEqual(summary.stats, [{trait:"色泽",count:3,mean:26},{trait:"酥脆度",count:3,mean:7}]);
  round.records.length = 2;
  const pair = await S.verifyCard(await S.card(round,"summary",owner));
  assert.deepEqual(pair.stats.map(s => s.mean), [24,7]);
  round.records.length = 1;
  const small = await S.verifyCard(await S.card(round, "summary", owner));
  assert.deepEqual(small.stats.map(s => s.mean), [25,6]);
  round.records.length = 0;
  const empty = await S.verifyCard(await S.card(round,"summary",owner));
  assert.ok(empty.stats.every(s => s.count === 0 && s.mean === null));
  await assert.rejects(S.verifyCard({...c, sampleCount: 6}));
});

test("independent browser handoffs yield only the owner-approved subset", async () => {
  const round = sampleRound();
  const owner = await S.ownerKeys();
  const publisherCard = await S.card(round, "metadata", owner);
  const visitorCard = deliver("data", publisherCard);
  const visitor = await S.applicantKeys();
  const outgoing = await S.request(visitorCard, "分析酥脆度", ["code","trait:1"], visitor);
  assert.ok(!JSON.stringify(outgoing).includes(visitor.privateKey.d));
  assert.ok(!JSON.stringify(outgoing).includes(visitor.signingKeys.privateKey.d));
  const incoming = deliver("request", outgoing);
  const verified = await S.review(copy(publisherCard), incoming);
  assert.equal(verified.purpose, "分析酥脆度");
  const preview = await S.preview(copy(round), publisherCard, incoming, ["trait:1"]);
  assert.deepEqual(preview, { fields:["trait:1"], rows:[[6],[8],[7]] });
  const d = await S.decide(copy(round), publisherCard, incoming, ["trait:1"], copy(owner));
  assert.equal(d.requestId, incoming.id);
  assert.equal(d.cardId, publisherCard.id);
  assert.ok(d.id);
  assert.doesNotMatch(JSON.stringify(d), /非公开|B-001|trait:1|"fields"|"approved"|"rows"/);
  const result = await S.open(visitorCard, outgoing, deliver("decision", d), copy(visitor));
  assert.deepEqual(result, {approved:true, fields:["trait:1"], rows:[[6],[8],[7]]});
  const stranger = await S.applicantKeys();
  await assert.rejects(S.open(visitorCard, outgoing, d, stranger));
  // Even with the correct public key, a different private key cannot decrypt the AES payload.
  await assert.rejects(S.open(visitorCard, outgoing, d, {...stranger,publicKey:visitor.publicKey}), /无法解密/);
  const altered = {...d, cipher: (d.cipher[0] === "A" ? "B" : "A") + d.cipher.slice(1)};
  await assert.rejects(S.open(visitorCard, outgoing, altered, visitor), /签名/);
  await assert.rejects(S.review(publisherCard, {...incoming, purpose: "被更改的用途"}), /签名/);
  await assert.rejects(S.review(publisherCard, {...incoming, recipient: stranger.publicKey}), /签名/);
  const second = await S.request(visitorCard, "不同用途", ["trait:1"], visitor);
  await assert.rejects(S.open(visitorCard, second, d, visitor), /不匹配/);
});

test("scope, snapshot, owner and deny decision are enforced", async () => {
  const round = sampleRound();
  const owner = await S.ownerKeys(), visitor = await S.applicantKeys();
  const c = await S.card(round, "metadata", owner);
  const r = await S.request(c, "按盲码计数", ["code"], visitor);
  assert.equal(S.fieldLabel(c, "code"), "样品盲码");
  assert.equal(S.fieldLabel(c, "trait:0"), "色泽");
  for (const attempt of [[], ["rater"], ["note"], ["trait:9"], ["__proto__"], ["code","code"]]) {
    await assert.rejects(S.request(c, "用途", attempt, visitor));
  }
  await assert.rejects(S.decide(round, c, r, ["trait:0"], owner));
  await assert.rejects(S.decide(round, c, r, ["code"], await S.ownerKeys()));
  const other = await S.card(round, "summary", owner);
  await assert.rejects(S.request(other, "汇总卡申请", ["code"], visitor), /只有数据说明卡/);
  await assert.rejects(S.review(other, r));
  round.records[0].scores.色泽++;
  await assert.rejects(S.preview(round, c, r, ["code"]), /版本不同/);
  const denial = await S.decide(null, c, r, [], owner);
  assert.deepEqual(await S.open(c, r, denial, visitor), {approved:false, fields:[], rows:[]});
});

test("wire decoder rejects mismatched and oversized fragments", () => {
  const spoof = Buffer.from(JSON.stringify({v:1,kind:"decision"})).toString("base64url");
  assert.throws(() => S.decode("#data=" + spoof));
  assert.throws(() => S.decode("#request=a;r"));
  assert.throws(() => S.decode("#request=" + "a".repeat(3000000)));
});

test("original signed v1 small-count summary with hidden means remains readable", async () => {
  const oldCard = {
    v:1, kind:"data", id:"eeec8a19-61b1-48b7-a76f-022cb3ea3b6a", mode:"summary",
    foodType:"小麦饼干", availableFields:["code","trait:0"], traits:["外观"],
    sampleCount:1, recordCount:1, stats:[{trait:"外观",count:1,mean:null}],
    owner:{kty:"EC",crv:"P-256",x:"vOhFYHnuqpbLonVnMoaUJqASmcmQcSkZpF7ZSa9ig1o",y:"Kv-6vZ1L3zVvdF5ednynV3YDBBBwC_gTDv7PxSjjvPA"},
    version:"tpRn5InvwQNvEBErGP44A7j5r-MD3e1--Ji2JuVlp9I",
    sig:"84DsRtFlJSBECdDecQBRpfNv9nJzECC6LOWlHF6q8-D5yo1hOxZxrfXSXA45c_Gh7ATRJnJMRIOrAkIonafC8g"
  };
  assert.deepEqual(await S.verifyCard(oldCard), oldCard);
  await assert.rejects(S.verifyCard({...oldCard, recordCount:0,stats:[{trait:"外观",count:0,mean:6}]}));
});

test("opted-in private text requires a field request and separate approval", async () => {
  const round = sampleRound();
  round.extraFields = ["note","quote","location","variety"];
  round.samples[0].location = "非公开地点";
  round.records[0].quote = "非公开原话";
  const owner = await S.ownerKeys(), visitor = await S.applicantKeys();
  const c = await S.verifyCard(await S.card(round,"metadata",owner));
  assert.deepEqual(c.availableFields, ["code","trait:0","trait:1","variety","location","note","quote"]);
  assert.deepEqual(c.availableFields.slice(-4).map(key => S.fieldLabel(c,key)), ["真实品种","田间地点","备注","个人原话"]);
  assert.doesNotMatch(JSON.stringify(c), /非公开|B-001|私有时间/);
  const summary = await S.verifyCard(await S.card(round,"summary",owner));
  assert.deepEqual(summary.availableFields, ["code","trait:0","trait:1"]);
  assert.doesNotMatch(JSON.stringify(summary), /非公开|B-001|私有时间/);
  const r = await S.request(c,"研究留言",["variety","quote","location"],visitor);
  await assert.rejects(S.preview(round,c,r,["note"]));
  await assert.rejects(S.decide(round,c,r,["code"],owner));
  const receipt = await S.decide(round,c,r,["quote","location"],owner);
  assert.doesNotMatch(JSON.stringify(receipt), /非公开|B-001/);
  assert.deepEqual(await S.open(c,r,deliver("decision",receipt),visitor), {
    approved:true, fields:["quote","location"],rows:[["非公开原话","非公开地点"],["",""],["",""]]
  });
  const altered = copy(round);
  altered.samples[0].name = "已经改变";
  await assert.rejects(S.preview(altered,c,r,["quote"]),/版本不同/);
  const missingOptIn = copy(round);
  missingOptIn.extraFields = ["quote"];
  await assert.rejects(S.preview(missingOptIn,c,r,["quote"]), /版本不同/);
});

test("unselected fields stay outside the commitment and receipt", async () => {
  const round = sampleRound();
  const owner = await S.ownerKeys(), visitor = await S.applicantKeys();
  round.extraFields = ["note"];
  const c = await S.card(round,"metadata",owner);
  round.samples[0].name = "变化的私人品种";
  round.records[0].quote = "变化的个人原话";
  const r = await S.request(c,"核对备注",["note"],visitor);
  const got = await S.open(c,r,await S.decide(round,c,r,["note"],owner),visitor);
  assert.deepEqual(got.rows,[["非公开备注"],["非公开备注"],["非公开备注"]]);
  await assert.rejects(S.request(c,"越界申请",["variety"],visitor));
  round.records[0].note = "另一个版本";
  await assert.rejects(S.preview(round,c,r,["note"]),/版本不同/);
  for (const unknown of [["rater"],["trait:0"],["variety","variety"]]) {
    await assert.rejects(S.card({...round, extraFields:unknown},"metadata",owner));
  }
  for (const [key, prop, target, limit] of [["variety","name",round.samples,80],["location","location",round.samples,200],
    ["note","note",round.records,2000],["quote","quote",round.records,2000]]) {
    round.extraFields = [key];
    target[0][prop] = {};
    await assert.rejects(S.card(round,"metadata",owner),/须为/);
    target[0][prop] = "字".repeat(limit+1);
    await assert.rejects(S.card(round,"metadata",owner),/须为/);
    target[0][prop] = "";
  }
});
