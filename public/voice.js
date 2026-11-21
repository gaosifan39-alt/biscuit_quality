(() => {
  'use strict';

  const traitNames = [
    ['色泽', '颜色', '色澤'],
    ['裂纹', '裂纹度', '裂紋'],
    ['酥脆度', '酥脆', '松脆度'],
    ['粘牙度', '黏牙度', '粘牙', '黏牙', '沾牙度'],
    ['风味', '風味'],
  ];

  const digits = '零一二三四五六七八九';
  const numberPattern = '[负負−+\\-]?\\s*[0-9零〇一二两兩三四五六七八九十百千万]+(?:[.点點][0-9零〇一二两兩三四五六七八九十]+)?';
  const scoreAtStart = new RegExp(`^(?:的)?(?:这一项|这一块|这项|方面)?(?:我(?:觉得|认为|会)?)?(?:评分|得分|打分|打个|给个|给到|打|给)?(?:为|是)?\\s*(${numberPattern})\\s*(分)?(.*)$`, 'u');
  const explicitScore = new RegExp(`^(?:我)?(?:给到|给个|打个|打|给|评分为|得分为)\\s*(${numberPattern})\\s*(分)?(.*)$`, 'u');
  const extraScore = new RegExp(`(?:^|(?:改为|改成|应该是|还是|或者|或|到|至|和|不对|[~～/—–-]))\\s*${numberPattern}(?:\\s*分|$)`, 'u');
  const punctuation = /[,，。；;、！？!?\n]/u;

  function normalize(value) {
    return String(value).normalize('NFKC').trim();
  }

  function readInteger(token) {
    const signed = token.trim().replace(/[负負−]/gu, '-').replace(/[两兩]/gu, '二').replace(/〇/gu, '零');
    const sign = signed.startsWith('-') ? -1 : 1;
    const value = signed.replace(/^[-+]\s*/u, '');
    if (/^\d+$/u.test(value)) return sign * Number(value) || 0;
    if (value.length === 1 && digits.includes(value)) return sign * digits.indexOf(value) || 0;
    if (value === '一千') return sign * 1000;
    // Require explicit place values. For example 七八 and 一百二 have ambiguous spoken meanings.
    const hundreds = value.match(/^([一二三四五六七八九])百(.*)$/u);
    const base = hundreds ? digits.indexOf(hundreds[1]) * 100 : 0;
    const remainder = hundreds ? hundreds[2] : value;
    if (hundreds && !remainder) return sign * base;
    if (hundreds && /^零[一二三四五六七八九]$/u.test(remainder)) {
      return sign * (base + digits.indexOf(remainder[1]));
    }
    const tens = remainder.match(/^([一二三四五六七八九])?十([一二三四五六七八九])?$/u);
    if (!tens) return NaN;
    return sign * (base + (tens[1] ? digits.indexOf(tens[1]) : 1) * 10 + (tens[2] ? digits.indexOf(tens[2]) : 0));
  }

  function getScore(fragment, { min = 1, max = 10 } = {}) {
    const clauses = fragment.trim().replace(/^[\s:：,，、]+/u, '').split(punctuation)
      .map(clause => clause.trim()).filter(Boolean);
    const candidates = [];
    for (const [index, clause] of clauses.entries()) {
      // A later clause must explicitly rate the trait; a number in a comment may be a sample ID.
      const match = clause.match(index === 0 ? scoreAtStart : explicitScore);
      if (!match) {
        if (extraScore.test(clause)) return { issue: '有多个可能的分数，请确认' };
        continue;
      }
      const [, token, unit, rest] = match;
      const value = readInteger(token);
      if (!Number.isInteger(value) || value < min || value > max) {
        return { issue: '需要 ' + min + ' 到 ' + max + ' 之间的整数，请确认' };
      }
      // Bare numerals in phrases such as “两条裂纹” or “八成” are observations, not scores.
      if ((!unit && rest.trim()) || /^(?:半|之|钟|鐘|之一|贝|贝尔)/u.test(rest.trim()) || extraScore.test(rest)) {
        return { issue: '分数不明确，请确认' };
      }
      candidates.push(value);
    }
    if (!candidates.length) return { issue: '缺少明确分数，请补充' };
    if (new Set(candidates).size > 1) return { issue: '有多个可能的分数，请确认' };
    return { value: candidates[0] };
  }

  function escapeRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  }

  function parse(text, traits, rules = []) {
    const transcript = normalize(text || '');
    const ranges = new Map(rules.map(rule => [rule.name, rule]));
    const labels = new Map(traits.filter(trait => typeof trait === 'string' && trait.trim())
      .map(trait => [normalize(trait), trait]));
    const names = new Map(labels);
    for (const group of traitNames) {
      const owners = group.filter(label => labels.has(label));
      if (owners.length !== 1) continue;
      for (const alias of group) names.set(alias, labels.get(owners[0]));
    }
    const sorted = [...names.keys()].sort((left, right) => right.length - left.length);
    const pattern = sorted.map(escapeRegex).join('|');
    const mentions = pattern ? [...transcript.matchAll(new RegExp(pattern, 'gu'))] : [];
    const outcomes = new Map();
    for (const [index, mention] of mentions.entries()) {
      const trait = names.get(mention[0]);
      const fragment = transcript.slice(mention.index + mention[0].length, mentions[index + 1]?.index);
      const current = getScore(fragment, ranges.get(trait));
      const earlier = outcomes.get(trait);
      if (earlier && (earlier.issue || current.issue || earlier.value !== current.value)) {
        outcomes.set(trait, { issue: '前后评分不明确，请确认' });
      } else {
        outcomes.set(trait, current);
      }
    }
    const values = [];
    const issues = [];
    for (const [trait, outcome] of outcomes) {
      if (outcome.issue) issues.push(`${trait}${outcome.issue}`);
      else values.push([trait, outcome.value]);
    }
    if (!mentions.length) issues.push('请按“性状名称 + 分数”口述，例如“色泽八分”。');
    return { scores: Object.fromEntries(values), issues };
  }

  const errorMessages = {
    'not-allowed': '请在浏览器中允许使用麦克风，也可以手动输入口述内容。',
    'service-not-allowed': '浏览器未开放语音识别服务，可以使用输入法语音或手动输入。',
    'audio-capture': '未能读取麦克风，请检查设备或使用输入法语音。',
    'no-speech': '没有听清，请靠近麦克风重试。',
    'network': '语音识别服务连接失败，请重试或使用输入法语音。',
    'language-not-supported': '当前语音服务未提供中文识别，可以使用中文输入法语音。',
  };

  function createRecognition({ onResult, onError, onEnd }) {
    const Recognition = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition;
    if (!Recognition) return null;
    const recognition = new Recognition();
    recognition.lang = 'zh-CN';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onresult = event => {
      // Each event contains the session transcript, including revisions to interim hypotheses.
      const transcript = Array.from(event.results, result => result[0]?.transcript || '').join('');
      onResult(transcript);
    };
    recognition.onerror = event => {
      if (event.error === 'aborted') return;
      onError(errorMessages[event.error] || '语音识别暂时不可用，请重试或手动输入。');
    };
    recognition.onend = () => onEnd();
    return recognition;
  }

  globalThis.TasterVoice = Object.freeze({ parse, createRecognition });
})();
