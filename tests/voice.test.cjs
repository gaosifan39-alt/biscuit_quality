const test = require('node:test');
const assert = require('node:assert/strict');
require('../public/voice.js');

const { parse, createRecognition } = globalThis.TasterVoice;
const traits = ['色泽', '裂纹', '酥脆度', '粘牙度', '风味'];

test('extracts a mixed numeral transcript in any order without using the sample number', () => {
  const draft = parse('这是第20号，风味我给十分，颜色７分裂纹五分，黏牙度两分，酥脆九分。', traits);
  assert.deepEqual(draft.scores, { 色泽: 7, 裂纹: 5, 酥脆度: 9, 粘牙度: 2, 风味: 10 });
  assert.deepEqual(draft.issues, []);
});

test('retains only confidently interpreted traits and permits independent corrections', () => {
  const result = parse('色泽偏浅，给七分；裂纹比较少，酥脆度是8分，粘牙度八分或九分。', traits);
  assert.deepEqual(result.scores, { 色泽: 7, 酥脆度: 8 });
  assert.equal(result.issues.length, 2);
  assert.deepEqual(parse('酥脆度六分', traits), { scores: { 酥脆度: 6 }, issues: [] });
});

test('never clamps or extracts part of a range, decimal, conflicting score, or negative', () => {
  for (const value of ['零', '0', '-2', '负二', '11', '十一', '一百', '八点五', '8.5', '8至9分', '八、九分', '7-9', '七八分', '八分半', '八分，改成七分', '八分，色泽九分']) {
    const draft = parse(`色泽${value}，风味９分`, traits);
    assert.deepEqual(draft.scores, { 风味: 9 }, value);
    assert.ok(draft.issues.length, value);
  }
  assert.deepEqual(parse('色泽八分，色泽8分', traits), { scores: { 色泽: 8 }, issues: [] });
});

test('observations and unknown traits do not contribute accidental scores', () => {
  for (const input of ['第九个样品', '色泽两种颜色', '色泽偏深，甜度八分', '色泽1号样品', '色泽三分之一']) {
    assert.deepEqual(parse(input, traits).scores, {}, input);
  }
});

test('custom labels remain literal and take priority over overlapping synonyms', () => {
  const custom = ['色泽', '颜色', '香气(强度)', '香气', '__proto__'];
  const result = parse('颜色五分，色泽九分，香气（强度）十分，香气七分，__proto__一分', custom);
  assert.deepEqual(result, { scores: { 颜色: 5, 色泽: 9, '香气(强度)': 10, 香气: 7, ['__proto__']: 1 }, issues: [] });
});

test('speech results replace the prior provisional text and expose recoverable errors', t => {
  assert.equal(createRecognition({}), null);
  globalThis.webkitSpeechRecognition = class { start() {} stop() {} };
  t.after(() => { delete globalThis.webkitSpeechRecognition; });
  const transcripts = [];
  const errors = [];
  let ended = false;
  const recognition = createRecognition({
    onResult: text => transcripts.push(text),
    onError: message => errors.push(message),
    onEnd: () => { ended = true; },
  });
  assert.equal(recognition.lang, 'zh-CN');
  recognition.onresult({ results: [[{ transcript: '色泽八分' }]] });
  recognition.onresult({ results: [[{ transcript: '色泽八分' }], [{ transcript: '裂纹七分' }]] });
  recognition.onerror({ error: 'not-allowed' });
  recognition.onend();
  assert.deepEqual(transcripts, ['色泽八分', '色泽八分裂纹七分']);
  assert.match(errors[0], /允许使用麦克风/u);
  assert.equal(ended, true);
});
