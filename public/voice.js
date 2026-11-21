(() => {
  'use strict';

  const traitNames = [
    ['色泽', '颜色', '色澤', '色泽深浅', '颜色深浅'],
    ['香气', '香氣', '香味', '香气强度', '香味浓度'],
    ['裂纹', '裂纹度', '裂紋'],
    ['酥脆度', '酥脆', '松脆度', '脆度'],
    ['甜度', '甜味', '甜味强度'],
    ['粘牙度', '黏牙度', '粘牙', '黏牙', '沾牙度', '粘牙程度', '黏牙程度'],
    ['孔隙度', '孔隙', '空隙度', '空隙', '气孔', '气孔多少'],
    ['筋道度', '筋道', '劲道度', '劲道', '筋道程度'],
    ['顺滑度', '顺滑', '滑润度', '滑润'],
    ['总体喜好', '总体喜好度', '整体喜好', '整体喜好度', '总体喜欢程度', '整体喜欢程度'],
    ['风味', '風味'],
  ];

  // Explicitly reported readings can also be used for short, two-syllable names.
  const confirmedReadings = new Map([
    ['色泽', ['塞责', '塞責']],
    ['筋道度', ['进高度', '進高度']],
    ['顺滑度', ['胜华路', '勝華路']],
    ['粘牙度', [
      '年牙', '年牙度', '年牙程度',
      '绵羊', '绵羊度', '棉羊', '棉羊度', '绵牙', '绵牙度', '棉牙', '棉牙度',
    ]],
  ]);
  const sounds = ['色涩瑟设社射舍塞', '泽澤责責择则折哲', '酥苏素速舒书', '脆翠催崔萃',
    '度杜渡肚部步布', '香乡相湘想', '气氣器汽起', '甜田填天添', '粘黏沾年念碾',
    '牙芽崖伢压壓呀', '总總宗纵棕中', '体體提', '喜洗禧', '好号號', '裂列烈', '纹文紋闻',
    '孔空恐控', '隙细細系係戏', '筋劲勁金津进進', '道到导導', '顺順舜', '滑华華'];
  const soundSets = new Map(sounds.flatMap(group => [...group].map(c => [c, group])));
  const otherReadings = new Map([
    ['色泽', ['设置', '四则', '色则度']], ['总体喜好', ['总体型号', '总体信号']],
  ]);

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

  function traitDictionary(labels) {
    const names = new Map(labels);
    const variants = new Map();
    const confirmed = new Set();
    for (const group of traitNames) {
      const owners = group.filter(alias => labels.has(alias)).map(alias => labels.get(alias));
      if (!owners.length) continue;
      for (const alias of group) {
        if (names.has(alias)) continue;
        if (owners.length === 1) names.set(alias, owners[0]);
        else variants.set(alias, owners);
      }
      for (const reading of otherReadings.get(group[0]) || []) variants.set(reading, owners);
      for (const reading of confirmedReadings.get(group[0]) || []) {
        variants.set(reading, owners);
        confirmed.add(reading);
      }
    }
    const forms = [];
    for (const [name, trait] of names) {
      forms.push({ length: name.length, pattern: escapeRegex(name) });
      if (!/^[\u3400-\u9fff]{2,20}$/u.test(name) || ![...name].some(c => soundSets.has(c))) continue;
      const pattern = [...name].map(c => soundSets.has(c) ? '[' + soundSets.get(c) + ']' : c).join('[ \\t]*');
      forms.push({ length: name.length, pattern, match: new RegExp('^(?:' + pattern + ')$', 'u'), trait });
    }
    for (const reading of variants.keys()) {
      const pattern = [...reading].map(escapeRegex).join('[ \\t]*');
      forms.push({ length: reading.length, pattern });
    }
    forms.sort((a, b) => b.length - a.length);
    const pattern = [...new Set(forms.map(form => form.pattern))].join('|');
    const phonetic = forms.filter(form => form.match);
    return { names, variants, confirmed, phonetic, pattern };
  }

  function soundKey(name) {
    return [...name].map(c => soundSets.get(c)?.[0] || c).join('');
  }

  // Compare complete, explicitly scored names. A single missing, added,
  // replaced or transposed syllable may suggest a field. Repetition of an
  // adjacent syllable, as in “牙牙度”, provides stronger evidence.
  function closeness(heard, name) {
    if (heard === name) return 2;
    if (Math.max(heard.length, name.length) < 3 || Math.abs(heard.length - name.length) > 1) return 0;
    let i = 0;
    while (i < heard.length && heard[i] === name[i]) i++;
    if (heard.length === name.length) {
      if (heard.slice(i + 1) === name.slice(i + 1)) {
        const repeated = heard[i] === heard[i + 1] || heard[i] === heard[i - 1];
        return repeated && name.length >= 3 ? 2 : 1;
      }
      const swapped = heard[i] === name[i + 1] && heard[i + 1] === name[i];
      return swapped && heard.slice(i + 2) === name.slice(i + 2) ? 1 : 0;
    }
    const [longer, shorter] = heard.length > name.length ? [heard, name] : [name, heard];
    if (longer.slice(i + 1) !== shorter.slice(i)) return 0;
    return heard === longer && longer[i] === longer[i - 1] && shorter.length >= 2 ? 2 : 1;
  }

  function matchScoredPhrases(transcript, mentions, suggestions, names, autoMatch) {
    const issues = [];
    const forms = [...names].filter(([name]) => /^[\u3400-\u9fff]{2,20}$/u.test(name))
      .map(([name, trait]) => [soundKey(name), trait]);
    let previousEnd = 0;
    for (const score of transcript.matchAll(new RegExp(numberPattern + '\\s*分', 'gu'))) {
      const preceding = transcript.slice(previousEnd, score.index).replace(/[，,、:： \t]+$/u, '');
      const prefix = preceding.split(punctuation).pop();
      const start = previousEnd + preceding.length - prefix.length;
      previousEnd = score.index + score[0].length;
      // A score ends a spoken item even without a comma. Ignore number units
      // used in observations, such as “放凉三分钟” or “八分之一”.
      if (/^(?:钟|鐘|之|半|贝|貝)/u.test(transcript.slice(previousEnd))) continue;
      const phrase = prefix.trim() + score[0];
      if (scoreAtStart.test(phrase) || extraScore.test(phrase)) continue;
      if (/^(?:满分|总分|扣分|加分|减分|上限|下限)/u.test(phrase)) continue;
      const heard = prefix.trim().replace(/(?:我给|我打|评分为|得分为|给|打|是)$/u, '').trimEnd();
      const compact = heard.replace(/[ \t]/gu, '');
      if (!/^[\u3400-\u9fff]{2,20}$/u.test(compact)) continue;
      if (/[零〇一二两兩三四五六七八九十百千万负負分]/u.test(compact)) continue;
      const index = start + prefix.indexOf(heard);
      const end = index + heard.length;
      const inside = mentions.filter(m => m.index >= start && m.index < previousEnd);
      // A full name (including one preceded by conversational words) already
      // has its score. A shorter prefix may belong to a stuttered longer name.
      if (inside.some(m => m.end >= end) || inside.length > 1) continue;
      const heardKey = soundKey(compact);
      let best = 0;
      const choices = new Set();
      for (const [name, trait] of forms) {
        const level = closeness(heardKey, name);
        if (!level || level < best) continue;
        if (level > best) { best = level; choices.clear(); }
        choices.add(trait);
      }
      if (!choices.size) {
        if (!inside.length) issues.push('“' + phrase + '”未对应到本场性状，' +
          (autoMatch ? '请重说这项。' : '请修改这段文字后再填入。'));
        continue;
      }
      if (inside.length) {
        const [earlier] = inside;
        mentions.splice(mentions.indexOf(earlier), 1);
        const superseded = suggestions.findIndex(suggestion => suggestion.start === earlier.index && suggestion.end === earlier.end);
        if (superseded !== -1) suggestions.splice(superseded, 1);
      }
      if ((best === 2 || autoMatch) && choices.size === 1) {
        mentions.push({ index, end, trait: [...choices][0] });
      } else {
        mentions.push({ index, end });
        suggestions.push({ heard, start: index, end, choices: [...choices] });
      }
    }
    mentions.sort((a, b) => a.index - b.index);
    suggestions.sort((a, b) => a.start - b.start);
    return issues;
  }

  function parse(text, traits, rules = [], { autoMatch = false } = {}) {
    const transcript = normalize(text || '');
    const ranges = new Map(rules.map(rule => [rule.name, rule]));
    const labels = new Map(traits.filter(trait => typeof trait === 'string' && trait.trim())
      .map(trait => [normalize(trait), trait]));
    const { names, variants, confirmed, phonetic, pattern } = traitDictionary(labels);
    const suggestions = [];
    const mentions = [];
    for (const match of pattern ? transcript.matchAll(new RegExp(pattern, 'gu')) : []) {
      const heard = match[0];
      const end = match.index + heard.length;
      let trait = names.get(heard);
      if (trait === undefined) {
        // Only offer a near match in a scoring context ("设置八分"), never
        // rewrite ordinary conversation ("打开设置，再评香气八分").
        const rest = transcript.slice(end).trimStart().replace(/^[，,、:：]\s*/u, '');
        if (!scoreAtStart.test(rest.split(punctuation, 1)[0])) continue;
        const spelling = heard.replace(/[ \t]/gu, '');
        const choices = new Set(variants.get(spelling) || []);
        for (const form of phonetic) if (form.match.test(heard)) choices.add(form.trait);
        if (!choices.size) continue;
        const fullSoundMatch = !variants.has(spelling) && spelling.length >= 3;
        if ((confirmed.has(spelling) || fullSoundMatch || autoMatch) && choices.size === 1) {
          [trait] = choices;
        } else {
          suggestions.push({ heard, start: match.index, end, choices: [...choices] });
        }
      }
      mentions.push({ index: match.index, end, trait });
    }
    const issues = matchScoredPhrases(transcript, mentions, suggestions, names, autoMatch);
    const outcomes = new Map();
    for (const [index, mention] of mentions.entries()) {
      const { trait, end } = mention;
      if (trait === undefined) continue;
      const fragment = transcript.slice(end, mentions[index + 1]?.index);
      const current = getScore(fragment, ranges.get(trait));
      const earlier = outcomes.get(trait);
      if (earlier && (earlier.issue || current.issue || earlier.value !== current.value)) {
        outcomes.set(trait, { issue: '前后评分不明确，请确认' });
      } else {
        outcomes.set(trait, current);
      }
    }
    const values = [];
    for (const [trait, outcome] of outcomes) {
      if (outcome.issue) issues.push(`${trait}${outcome.issue}`);
      else values.push([trait, outcome.value]);
    }
    if (!mentions.length && !issues.length) issues.push('请按“性状名称 + 分数”口述，例如“'+(traits[0] || '色泽')+'给几分”。');
    const result = { scores: Object.fromEntries(values), issues };
    if (suggestions.length) result.suggestions = suggestions;
    return result;
  }

  const errorMessages = {
    'not-allowed': '请在浏览器中允许使用麦克风，也可以手动输入口述内容。',
    'service-not-allowed': '浏览器未开放语音识别服务，可以使用输入法语音或手动输入。',
    'audio-capture': '未能读取麦克风，请检查设备或使用输入法语音。',
    'no-speech': '没有听清，请靠近麦克风重试。',
    'network': '语音识别服务连接失败，请重试或使用输入法语音。',
    'language-not-supported': '当前语音服务未提供中文识别，可以使用中文输入法语音。',
  };

  function createRecognition({ onResult, onError, onEnd, onActivity }) {
    const Recognition = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition;
    if (!Recognition) return null;
    const recognition = new Recognition();
    recognition.lang = 'zh-CN';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onspeechstart = () => onActivity?.();
    recognition.onspeechend = () => onActivity?.();
    recognition.onresult = event => {
      // Each event contains the session transcript, including revisions to interim hypotheses.
      const results = Array.from(event.results);
      const read = result => result[0]?.transcript || '';
      onResult(results.map(read).join(''), results.filter(result => result.isFinal).map(read).join(''));
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
