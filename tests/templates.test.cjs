const test = require("node:test");
const assert = require("node:assert/strict");
require("../public/templates.js");
const T = globalThis.TasterTemplates;
const base = "https://little-taster.example.com/";
const example = {
  foodType:"面包", contributor:"品鉴组", version:"2.1", instructions:"切相同厚度。",
  traits:[{name:"松软度",min:-5,max:6,low:"很硬", high:"松软",instructions:"按压后再品尝。"}]
};

test("shared template contains only allowlisted rule fields, in a fresh object", () => {
  const dirty = {...example, title:"secret title", rater:"secret identity", samples:["secret wheat"], records:[{}],
    traits:[{...example.traits[0],sample:"secret sample",score:3,note:"secret note"}]};
  const round = {template:dirty, rater:"secret identity", title:"secret title", samples:["secret wheat"], records:[{}]};
  const result = T.fromRound(round);
  assert.deepEqual(result, example);
  result.traits[0].name = "changed";
  assert.equal(dirty.traits[0].name, "松软度");
  assert.doesNotMatch(T.shareLink(dirty,base+"?private=secret"), /secret/);
});

test("old rounds generate independent named biscuit scales without importing people or samples", () => {
  const result = T.fromRound({traits:["粘牙度","自定义"],title:"不可导出",rater:"私人姓名",samples:["私人样品"]});
  assert.equal(result.traits[0].high, "非常粘牙");
  assert.equal(result.traits[0].min, 1);
  assert.equal(result.traits[1].max, 10);
  assert.equal(result.foodType, "小麦饼干");
  assert.equal(result.contributor,"");
  assert.doesNotMatch(JSON.stringify(result),/私人|不可导出/);
});

test("JSON link round trip covers Unicode and literal percent or ampersand", () => {
  const t = {...example, instructions:"盐水 2% & 脆薄\n共享 🍪"};
  const link = T.shareLink(t,base+"p/?event=private#settings");
  assert.match(new URL(link).hash,/^#template=v1\.[A-Za-z0-9_-]+$/);
  assert.deepEqual(T.readLink("#template="+encodeURIComponent(JSON.stringify(t))), t);
  assert.throws(()=>T.readLink("#template=v1.!bad"),/编码/);
  assert.throws(()=>T.readLink("#template=v1._w"),/编码/);
  assert.equal(new URL(link).pathname, "/p/");
  assert.equal(new URL(link).search,"");
  assert.deepEqual(T.readLink(new URL(link).hash), t);
  assert.deepEqual(T.fromURL(link,base),t);
  assert.throws(()=>T.fromURL(link.replace("little-taster.","different."),base),/本网站/);
  assert.throws(()=>T.fromURL(link.replace("https://","https://injected@"),base),/本网站/);
  assert.throws(()=>T.fromURL("#template=test",base),/完整/);
  assert.equal(T.readLink("#workspace"), null);
  assert.throws(()=>T.readLink("#template=%zz"),/编码/);
  assert.throws(()=>T.readLink("#template=%7B"),/JSON/);
  assert.throws(()=>T.readLink("#template="+"x".repeat(180002)),/过长/);
});

test("invalid rule sets, reserved names, empty endpoints and unsafe scales are rejected", () => {
  for (const changes of [
    {low:" "}, {high:null}, {min:-101}, {max:1001}, {max:2.5},
    {max:"8"}, {min:6}, {min:NaN}, {name:"__proto__"}, {name:"constructor"},
    {name:"prototype"}, {name:"a".repeat(21)}, {instructions:"X".repeat(501)}]) {
    assert.throws(()=>T.validate({...example, traits:[{...example.traits[0],...changes}]}));
  }
  assert.throws(()=>T.validate({...example,traits:[]}));
  assert.throws(()=>T.validate({...example,traits:Array(13).fill(example.traits[0])}));
  assert.throws(()=>T.validate({...example,traits:[...example.traits,...example.traits]}),/重复/);
  assert.throws(()=>T.validate({...example,traits:["Ａ级","A级"].map(name=>({...example.traits[0],name}))}),/重复/);
  assert.throws(()=>T.validate({...example,foodType:" "}),/食品类别/);
  assert.throws(()=>T.validate({...example,version:" "}),/版本/);
  const t = {...example, traits:[{...example.traits[0], min:-100, max:1000}]};
  assert.deepEqual(T.validate(t),t);
});

