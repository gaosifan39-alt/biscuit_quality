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

const biscuitTraits = ['色泽', '香气', '酥脆度', '甜度', '粘牙度', '总体喜好'];

test('common spoken names fill the six biscuit traits directly', () => {
  const result = parse('颜色八分，香味七分，酥脆九分，甜味五分，黏牙两分，整体喜好八分', biscuitTraits);
  assert.deepEqual(result, {
    scores: { 色泽: 8, 香气: 7, 酥脆度: 9, 甜度: 5, 粘牙度: 2, 总体喜好: 8 }, issues: [],
  });
});

test('near sounds are proposed for confirmation only and preserve the spoken score', () => {
  const input = '香气七分设置８分，舒翠杜六分，田度三分，年芽度四分，总体型号九分';
  const result = parse(input, biscuitTraits);
  assert.deepEqual(result.scores, { 香气: 7 });
  assert.deepEqual(result.suggestions.map(s => [s.heard, ...s.choices]), [
    ['设置', '色泽'], ['舒翠杜', '酥脆度'], ['田度', '甜度'], ['年芽度', '粘牙度'], ['总体型号', '总体喜好'],
  ]);
  let corrected = input.normalize('NFKC');
  for (const s of result.suggestions.slice().reverse()) {
    assert.equal(corrected.slice(s.start, s.end), s.heard);
    corrected = corrected.slice(0, s.start) + s.choices[0] + corrected.slice(s.end);
  }
  assert.deepEqual(parse(corrected, biscuitTraits).scores,
    { 香气: 7, 色泽: 8, 酥脆度: 6, 甜度: 3, 粘牙度: 4, 总体喜好: 9 });
});

test('near matches respect active labels, exact custom names and context', () => {
  assert.deepEqual(parse('请打开设置，再给香气八分', biscuitTraits), { scores: { 香气: 8 }, issues: [] });
  assert.equal(parse('设置八分', ['香气']).suggestions, undefined);
  assert.deepEqual(parse('设置八分', ['色泽', '设置']), { scores: { 设置: 8 }, issues: [] });
  const ambiguous = parse('涩 择六分', ['色泽', '色折']);
  assert.deepEqual(ambiguous.scores, {});
  assert.deepEqual(ambiguous.suggestions[0].choices.sort(), ['色泽', '色折'].sort());
});

test('confirming a near match retains range and conflicting number checks', () => {
  const rules = [{ name: '色泽', min: 1, max: 5 }];
  for (const input of ['色折六分', '色折八点五分', '色折四分或五分', '色泽二分，色折三分']) {
    const result = parse(input, ['色泽'], rules);
    const [s] = result.suggestions;
    const corrected = input.slice(0, s.start) + s.choices[0] + input.slice(s.end);
    const checked = parse(corrected, ['色泽'], rules);
    assert.deepEqual(checked.scores, {});
    assert.equal(checked.issues.length, 1);
  }
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

test('applies per-trait ranges to aliases, signed numbers and canonical Chinese whole numbers', () => {
  const rules = [{ name: '色泽', min: -100, max: 1000 }, { name: '甜度', min: 0, max: 3 }];
  const names = rules.map(rule => rule.name);
  for (const [spoken, value] of Object.entries({
    '十六': 16, '二十': 20, '二十三': 23, '一百零三': 103, '一百一十': 110,
    '兩百八十六': 286, '九百九十九': 999, '一千': 1000, '负一百': -100, '−８２': -82,
    '負四十二': -42, '零': 0, '〇': 0, '+21': 21,
  })) {
    assert.deepEqual(parse('颜色' + spoken + '分，甜度零分', names, rules),
      { scores: { 色泽: value, 甜度: 0 }, issues: [] }, spoken);
  }
  for (const invalid of ['负一百零一', '一百二', '一百百', '九十八或一百', '二十三点五']) {
    const result = parse('色泽' + invalid + '分，甜度三分', names, rules);
    assert.deepEqual(result.scores, { 甜度: 3 }, invalid);
    assert.equal(result.issues.length, 1);
  }
  const result = parse('色泽十分，甜度十分', names, rules);
  assert.deepEqual(result.scores, { 色泽: 10 });
  assert.match(result.issues[0], /甜度.*0 到 3/);
});
