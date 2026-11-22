(() => {
  "use strict";
  const M = TasterModel;
  const $ = selector => document.querySelector(selector);
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const paths = {
    grid:'<rect x="3" y="3" width="7" height="7" rx="1.4"/><rect x="14" y="3" width="7" height="7" rx="1.4"/><rect x="3" y="14" width="7" height="7" rx="1.4"/><rect x="14" y="14" width="7" height="7" rx="1.4"/>',
    list:'<rect x="4" y="3" width="16" height="18" rx="3"/><path d="M8 8h8M8 12h8M8 16h5"/>',
    sliders:'<path d="M3 7h5m5 0h8M3 17h10m5 0h3"/><circle cx="10.5" cy="7" r="2.5"/><circle cx="15.5" cy="17" r="2.5"/>',
    share:'<path d="m8 11 8-5M8 13l8 5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="5" r="2.5"/><circle cx="18" cy="19" r="2.5"/>',
    download:'<path d="M12 3v11m-4-4 4 4 4-4M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"/>',
    leaf:'<path d="M4 20c1-7 8-9 14-15M5 16C1 7 12 3 21 3c-1 10-6 17-16 13Z"/>',
    user:'<circle cx="12" cy="8" r="3.4"/><path d="M5 20c0-7 14-7 14 0"/>',
    sample:'<path d="M3 8h18v4H3zM5 12v8h14v-8M9 16h6M5 8l2-4h10l2 4"/>',
    swap:'<path d="M4 8h14l-3-3m5 11H6l3 3"/>',
    wave:'<path d="M3 10v4m4-8v12m5-16v20m5-16v12m4-8v4"/>',
    keyboard:'<rect x="2" y="5" width="20" height="14" rx="3"/><path d="M6 9h.2m3 0h.2m3 0h.2m3 0h.2M6 12h.2m3 0h.2m3 0h.2m3 0h.2M8 15h8"/>',
    mic:'<rect x="9" y="2" width="6" height="13" rx="3"/><path d="M5.5 11.5v1a6.5 6.5 0 0 0 13 0v-1M12 19v3m-3 0h6"/>',
    stop:'<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/>',
    clipboard:'<path d="M9 4H6a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-3"/><rect x="9" y="2" width="6" height="4" rx="1"/><path d="m8 13 3 3 5-6"/>',
    sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19m0-14-1.5 1.5m-11 11L5 19"/>',
    crack:'<path d="m8 3 5 5-4 4 6 4-4 5M5 5l-2 5 2 8 6 3 8-3 2-7-3-6-5-2"/>',
    crisp:'<path d="m13 2-8 12h6l-1 8 9-13h-7Z"/>',
    drop:'<path d="M12 2C10 6 5 11 5 15a7 7 0 0 0 14 0c0-4-5-9-7-13Zm-3 13c0 2 1 3 3 3"/>',
    aroma:'<path d="M4 19h16M7 15c-4-5 5-5 1-10m4 10c-4-5 5-6 1-12m4 12c-3-4 4-5 2-9"/>',
    note:'<path d="M13 5H5v15h15v-8m-9 1 7-9 3 3-8 8-4 1Z"/>',
    check:'<path d="m4 12 5 5L20 6"/>', close:'<path d="m6 6 12 12m0-12L6 18"/>',
    plus:'<path d="M12 4v16M4 12h16"/>', eye:'<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>'
  };
  const icon = name => '<svg aria-hidden="true" class="ico" viewBox="0 0 24 24">' + (paths[name] || paths.leaf) + '</svg>';
  document.querySelectorAll("[data-icon]").forEach(el => el.outerHTML = icon(el.dataset.icon));
  const traitsInfo = {
    "色泽":["sun","烘焙色泽满意度",0], "裂纹":["crack","表面裂纹明显程度",1], "酥脆度":["crisp","咬碎时的松脆程度",2],
    "粘牙度":["drop","咀嚼后的粘牙程度",3], "风味":["aroma","香气与滋味满意度",4],
    "香气":["aroma","闻起来的香气浓淡",4], "甜度":["drop","入口后的甜味强弱",1],
    "孔隙度":["eye","掰开饼干，看断面上孔洞所占的面积",0], "总体喜好":["user","你有多喜欢这款饼干",2]
  };
  const storeKey = "little-taster.workspace.v1";
  const blank = () => { const first = M.makeRound(); return { active: first.id, rounds: [first] }; };
  let snapshot, state, storageError = "";
  try {
    snapshot = localStorage.getItem(storeKey);
    state = snapshot ? JSON.parse(snapshot) : blank();
    if (!state.rounds?.some(r => r.id === state.active)) throw Error("场次数据格式异常");
  } catch {
    state = blank();
    storageError = "本机存储暂时无法读取。可在当前页面评价并导出 Excel，关闭前请先导出。";
  }
  let guest, routeId = 0;
  const round = () => guest?.round ?? state.rounds.find(r => r.id === state.active);
  const sharedTemplates = TasterTemplates.presets();
  let page = "workspace", showNote = false, toastTimer, voiceSession = null;
  let lastFocused = null;
  const audioURLs = [];
  const dialog = $("#dialog");
  const sharing = TasterShareUI.create(openModal);
  const cloud = TasterCloud.create(openModal,round,template=>templateEditor({initial:template}),blob=>{
    const url = URL.createObjectURL(blob);
    audioURLs.push(url);
    return url;
  });
  function notify(message) {
    $("#toast").textContent = message;
    $("#toast").classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $("#toast").classList.remove("show"), 3800);
  }
  function persist() {
    if (guest) {
      const {records,drafts,current} = guest.round;
      try { sessionStorage.setItem(guest.storageKey,JSON.stringify({evaluator:guest.evaluator,records,drafts,current})); } catch {}
      return true;
    }
    if (!storageError) {
      try {
        if (localStorage.getItem(storeKey) !== snapshot) throw Error("another tab");
        const next = JSON.stringify(state);
        localStorage.setItem(storeKey, next);
        snapshot = next;
        return true;
      } catch {
        storageError = "本机保存已暂停（存储不可用或另一标签页已修改数据）。请先导出本页记录，再刷新继续。";
      }
    }
    $("#local-status").textContent = "本机保存已暂停";
    if (!$("#storage-warning")) $("#main").insertAdjacentHTML("afterbegin", '<p id="storage-warning" class="inline-status" role="alert">'+esc(storageError)+'</p>');
    return false;
  }
  function stopRecognition() {
    const session = voiceSession;
    voiceSession = null;
    if (!session) return;
    clearTimeout(session.pauseTimer);
    clearTimeout(session.limitTimer);
    clearTimeout(session.stopTimer);
    if (session.started && !session.ended) {
      try { session.recognition.abort(); } catch {}
    }
    session.capture?.finish();
  }
  const knownPages = ["workspace","records","community","sharing"];
  function navigate(next) {
    if (!knownPages.includes(next)) next = "workspace";
    stopRecognition();
    if (dialog.open) dialog.close();
    showNote = false;
    page = next;
    if (location.hash.slice(1) !== next) location.hash = next;
    render();
  }
  function render() {
    document.querySelectorAll("nav button").forEach(b => {
      if (b.dataset.view === page) b.setAttribute("aria-current","page"); else b.removeAttribute("aria-current");
    });
    const previousId = state.active;
    const r = page === "workspace" && !guest ? M.ensureScoringRound(state) : round();
    if (state.active !== previousId) persist();
    const names = { workspace:guest?"扫码品鉴":"品鉴工作台", records:"本机评分与录音", community:"模板上传", sharing:"数据共享" };
    const meta = '<div class="meta">'+icon("leaf")+esc(r.title)+'<span class="divider"></span>'+icon("user")+esc(r.rater)+'</div>';
    const savedCount = r.records.filter(x => x.rater === r.rater).length;
    const progress = '<div class="progress"><div><span>我的品鉴进度</span><span><b>'+savedCount+'</b> / '+r.samples.length+'</span></div><div class="track"><span style="width:'+100*savedCount/r.samples.length+'%"></span></div></div>';
    $("#main").innerHTML = (storageError ? '<p id="storage-warning" class="inline-status" role="alert">'+esc(storageError)+'</p>' : "")+
      '<div class="page-heading"><div><h1>'+names[page]+'</h1>'+(page === "workspace" || page === "records" ? meta : "")+'</div>'+(page === "workspace" ? progress : "")+'</div>'+
      (page === "workspace" ? workspace(r) : page === "records" ? recordsPage(r) : page === "sharing" ? sharingPage(r) : communityPage());
    if (page === "sharing") cloud.directory($("#cloud-directory"));
  }
  function makeWave() {
    const heights = [3,5,3,8,11,7,13,18,10,8,17,25,14,22,31,18,13,27,40,24,18,35,46,30,19,28,42,34,23,15];
    return heights.map(h => '<span style="height:'+h+'px"></span>').join("");
  }
  function workspace(r) {
    const d = M.draft(r);
    const count = r.traits.filter(t => M.valid(d.scores[t],M.ruleFor(r,t))).length;
    const rows = r.traits.map((t,i) => {
      const [symbol, desc, tone] = traitsInfo[t] || ["leaf","按场次约定评分",i%5];
      const rule = M.ruleFor(r,t), width = rule.max - rule.min + 1;
      const description = rule.low && rule.high ? esc(rule.min+" 分 · "+rule.low+" / "+rule.max+" 分 · "+rule.high) : desc;
      const controls = width>10 ? '<input type="number" step="1" min="'+rule.min+'" max="'+rule.max+'" data-range-trait="'+i+'" aria-label="'+esc(t)+'分数" placeholder="'+rule.min+' 至 '+rule.max+'" value="'+(d.scores[t] ?? "")+'">' :
        Array.from({length:width},(_,n) => {
          const score = n+rule.min;
          return '<button type="button" data-trait="'+i+'" data-value="'+score+'" aria-label="'+esc(t)+' '+score+' 分" aria-pressed="'+(d.scores[t]===score)+'">'+score+'</button>';
        }).join("");
      return '<div class="score-row"><div class="row-name"><span class="trait-icon tone'+tone+'">'+icon(symbol)+'</span><span><strong>'+esc(t)+'</strong><small>'+description+'</small>'+(rule.instructions?'<small>'+esc(rule.instructions)+'</small>':'')+'</span></div><div class="numbers" style="--steps:'+(width>10?1:width)+'" role="group" aria-label="'+esc(t)+'">'+controls+'</div><div class="result '+(d.scores[t]!=null?"scored":"")+'">'+(d.scores[t] ?? "—")+'</div></div>';
    }).join("");
    const wave = makeWave();
    const example = r.traits.slice(0,3).map((t,i)=>{
      const rule = M.ruleFor(r,t);
      return t+(r.template ? Math.round((rule.min+rule.max)/2) : ["八","七","九"][i])+"分";
    }).join("，");
    const sheetHelp = r.template?.instructions || "核对口述结果，也可点选分数。";
    const missing = d.voiceNeedsReview ? r.traits.filter(t=>!M.valid(d.scores[t],M.ruleFor(r,t))) : [];
    const voiceHelp = d.voiceNeedsReview
      ? '<p id="voice-outcome" role="status">'+esc(missing.length ?
        "还差 "+missing.join("、")+"。可以只补说这些项，也可以点选分数。" :
        "有一段口述需要核对。可以补说那一项，或点选分数后保存。")+'</p>' : "";
    const food = r.template?.foodType || "小麦饼干";
    const sampleClass = food.includes("饼干") ? "sample" : "sample sample-generic";
    const header = guest
      ? '<p class="guest-status help">'+(r.records.length>=r.samples.length?"本场评分已全部提交。你可以切换样品查看或更新。":"核对实物盲码后口述评分。分数齐全后自动提交给主办人，录音随评分提交。")+'</p>'
      : '<section class="panel tasting-bar" aria-label="评鉴对象"><div class="tasting-selection"><span class="trait-icon tone3">'+icon("sample")+'</span><div><p>当前评鉴</p><h2>'+esc(food)+'</h2></div></div>'+
        '<div class="panel-actions"><button class="action" data-action="catalog">'+icon("grid")+'选食品与模板</button><button class="ghost" data-action="organize">'+icon("sliders")+'管理场次</button><button class="ghost" data-action="cloud">扫码收评</button></div></section>';
    return header+
      '<section class="hero" aria-label="当前盲评样品与语音录入"><div class="'+sampleClass+'"><span class="sample-tag">'+icon("sample")+'当前样品</span><div class="sample-bottom"><div><small>样品盲码</small><div class="sample-code">'+esc(r.current)+'</div></div><button class="switch" data-action="samples">'+icon("swap")+'切换样品</button></div></div>'+
      '<div class="voice"><div class="voice-head"><h2>'+icon("wave")+'语音评分</h2><button data-action="text">'+icon("keyboard")+'文字录入</button></div><div class="wave-area"><div class="wave" aria-hidden="true">'+wave+'</div><button data-action="mic" class="mic" aria-label="开始语音评分">'+icon("mic")+'</button><div class="wave right" aria-hidden="true">'+wave+'</div></div>'+
      '<p class="voice-instruction">点麦克风口述，停顿后自动填分</p><p class="voice-example">试着说「'+esc(example)+'」</p></div></section>'+
      '<section class="panel"><div class="sheet-heading"><div><h2 class="section-title">'+icon("clipboard")+'性状评分表</h2><p>'+esc(sheetHelp)+'</p>'+voiceHelp+'</div><span class="count-tag" id="score-count">已填 '+count+' / '+r.traits.length+'</span></div>'+
      '<div class="scale-label"><span>品质性状</span><span class="scale-range"><span>评分刻度</span><span>'+(r.template?"按各项量表":"1 低 · 10 高")+'</span></span><span>得分</span></div><div>'+rows+'</div>'+
      ((!guest&&(showNote||d.note))?'<div class="note-box"><label for="note">品鉴备注</label><textarea id="note" maxlength="2000" placeholder="记下样品的口感或香气">'+esc(d.note)+'</textarea></div>':"")+
      '<div class="sheet-footer">'+(!guest?'<button class="subtle" data-action="note">'+icon("note")+'品鉴备注</button>':"")+
      (d.hasAudio?'<button class="subtle" data-action="voice-audio">'+icon("wave")+'录音</button>':"")+
      '<button class="action" data-action="confirm">'+icon("check")+(M.findRecord(r)?"更新评价":guest?"提交评分":"确认评分")+'</button></div></section>';
  }
  function recordsPage(r) {
    const historical = M.usesPreviousBiscuitTraits(r);
    const header = '<div class="sheet-heading"><h2 class="section-title">'+icon("list")+'已确认的评价</h2><span class="count-tag">'+r.records.length+' 条记录</span></div>'+roundPicker(r,"records-select");
    if (!r.records.length) return '<section class="panel">'+header+'<div class="empty">'+icon("clipboard")+'<h3>还没有已确认的评价</h3><p>录入第一份样品评分后，即可在这里查看和导出。</p><button class="action" data-action="home">去评价</button></div></section>';
    const columns = ["盲码","评价员",...r.traits,"备注"];
    const hasOperations = !historical || r.records.some(record => record.hasAudio);
    if (hasOperations) columns.push("操作");
    const rows = r.records.map((x,i) => {
      const edit = historical ? "" : '<button class="subtle" data-edit="'+i+'">'+icon("note")+'修改</button>';
      const audio = x.hasAudio ? '<button class="subtle" data-audio="'+i+'">'+icon("wave")+'录音</button>' : "";
      return '<tr><td><b>'+esc(x.code)+'</b></td><td>'+esc(x.rater)+'</td>'+r.traits.map(t=>'<td>'+esc(x.scores[t])+'</td>').join("")+'<td>'+esc(x.note || "—")+'</td>'+
        (hasOperations?'<td>'+audio+edit+'</td>':"")+'</tr>';
    }).reverse().join("");
    return '<section class="panel">'+header+'<div class="table-wrap"><table><thead><tr>'+columns.map(t=>'<th>'+esc(t)+'</th>').join("")+'</tr></thead><tbody>'+rows+'</tbody></table></div></section>';
  }
  function roundPicker(r, id) {
    const options = state.rounds.map((s,i)=>'<option value="'+esc(s.id)+'" '+(s===r?"selected":"")+'>'+esc(s.title)+' · 场次 '+(i+1)+(M.usesPreviousBiscuitTraits(s)?" · 历史记录":"")+'</option>').join("");
    return '<label class="field session-picker">选择场次<select id="'+id+'" data-round-picker>'+options+'</select></label>';
  }
  function organizeRound(r) {
    openModal("管理场次",roundPicker(r,"round-select")+
      '<form id="rater-form"><label class="field">更换评价员<input name="rater" value="'+esc(r.rater)+'" maxlength="40" required></label><div class="panel-actions"><button class="ghost">保存评价员</button><button type="button" class="ghost" data-action="mapping">'+icon("eye")+'盲码对照表</button><button type="button" class="ghost" data-action="local-records">本机评分与录音</button></div></form>');
  }
  function localTemplates() {
    return state.savedTemplates || [];
  }
  function templateCards(templates, offset = 0) {
    return templates.map((template,index) => '<button class="template-card" data-template="'+(offset+index)+'"><strong>'+esc(template.foodType)+'</strong>'+
      '<span>'+template.traits.map(t=>esc(t.name)).join(" · ")+'</span><small>'+template.traits.length+' 项 · v'+esc(template.version)+'</small></button>').join("");
  }
  function catalogPage() {
    const saved = localTemplates();
    return '<div data-template-catalog><label class="field template-search">搜索评价模板'+
      '<input type="search" data-template-search maxlength="80" placeholder="例如：小麦品质、刀削面" autocomplete="off"></label>'+
      '<p class="help" data-template-search-status role="status" hidden></p>'+
      '<section data-template-section><h3 class="template-category">示例模板</h3><div class="template-list">'+templateCards(sharedTemplates)+'</div></section>'+
      (saved.length ? '<section data-template-section><h3 class="template-category">本机模板</h3><div class="template-list">'+templateCards(saved,sharedTemplates.length)+'</div></section>' : "")+'</div>';
  }
  function filterTemplates(input) {
    const catalog = input.closest("[data-template-catalog]");
    const templates = [...sharedTemplates,...localTemplates()];
    let matches = 0;
    for (const section of catalog.querySelectorAll("[data-template-section]")) {
      let shown = 0;
      for (const card of section.querySelectorAll("[data-template]")) {
        card.hidden = !TasterTemplates.matches(templates[Number(card.dataset.template)],input.value);
        if (!card.hidden) shown++;
      }
      section.hidden = shown === 0;
      matches += shown;
    }
    const status = catalog.querySelector("[data-template-search-status]");
    status.hidden = !input.value.trim();
    status.textContent = matches ? "找到 "+matches+" 个模板" : "没有找到模板。可换个关键词，或新建模板。";
  }
  function sharingPage(r) {
    return '<div class="settings-grid"><section class="panel setting-card"><h2 class="card-title">场次模板目录</h2><div id="cloud-directory"></div></section>'+
      '<section class="panel setting-card"><h2 class="card-title">本机数据</h2><p class="help">分享评分汇总或数据说明卡，也可接收他人发来的共享文件。</p>'+roundPicker(r,"share-round-select")+
      '<p class="help">'+r.records.length+' 条评价 · 原始数据保存在本机</p><div class="panel-actions"><button class="action" data-action="share-data">'+icon("share")+'分享本场数据</button>'+
      '<button class="ghost" data-action="import-data">接收共享文件</button></div></section></div>';
  }
  function communityPage() {
    return '<section class="panel setting-card">'+
      '<div class="panel-actions"><button class="action" data-action="blank-template">'+icon("plus")+'新建模板</button><button class="ghost" data-action="import-template">上传或导入模板</button><button class="ghost" data-action="round-template">使用本场规则</button></div>'+
      catalogPage()+'</section>';
  }
  function openCatalog() {
    openModal("选择食品与模板",catalogPage()+'<div class="group-actions"><button class="ghost" data-action="shared-directory">浏览共享模板</button><button class="ghost" data-action="import-template">导入模板</button><button class="action" data-action="blank-template">'+icon("plus")+'新建模板</button></div>');
  }
  function openModal(title, content, focusSelector) {
    clearAudioURLs();
    if (!dialog.open) lastFocused = document.activeElement;
    $("#dialog-inner").innerHTML = '<div class="dialog-title"><h2 id="dialog-title">'+esc(title)+'</h2><button class="close" aria-label="关闭" data-action="close">'+icon("close")+'</button></div>'+content;
    dialog.setAttribute("aria-labelledby","dialog-title");
    if (!dialog.open) dialog.showModal();
    if (focusSelector) dialog.querySelector(focusSelector)?.focus();
  }
  dialog.addEventListener("close",() => {
    stopRecognition();
    clearAudioURLs();
    if (lastFocused?.isConnected) lastFocused.focus();
  });

  function clearAudioURLs() {
    for (const url of audioURLs) URL.revokeObjectURL(url);
    audioURLs.length = 0;
  }

  async function showVoiceAudio(r, code, rater) {
    openModal("录音 · "+code, '<div id="voice-clips"><p class="help" role="status">正在读取本机录音…</p></div>');
    const panel = $("#voice-clips");
    try {
      const clips = await TasterAudio.list({ roundId: r.id, code, rater });
      if (!dialog.open || !panel.isConnected) return;
      if (!clips.length) { panel.textContent = "本机没有这份评价的录音。"; return; }
      panel.replaceChildren();
      clips.forEach(({ blob }, index) => {
        const url = URL.createObjectURL(blob);
        audioURLs.push(url);
        const row = document.createElement("div");
        row.className = "clip-row";
        const player = document.createElement("audio");
        player.controls = true;
        player.preload = "none";
        player.src = url;
        player.setAttribute("aria-label", "录音 "+(index+1));
        const link = document.createElement("a");
        const extension = blob.type.includes("mp4") ? "m4a" : blob.type.includes("ogg") ? "ogg" :
          blob.type.includes("wav") ? "wav" : "webm";
        link.href = url;
        link.download = code+"-录音-"+(index+1)+"."+extension;
        link.textContent = "下载录音 "+(index+1);
        row.append(player, link);
        panel.append(row);
      });
    } catch {
      if (panel.isConnected) panel.textContent = "本机录音暂时无法读取。";
    }
  }
  function openSamples() {
    const r = round();
    openModal("切换样品",'<p class="help">选择与你手中样品标签一致的盲码。</p><div class="sample-grid">'+r.samples.map((s,i)=>'<button data-sample="'+i+'" aria-pressed="'+(r.current===s.code)+'">'+esc(s.code)+'<small>'+(M.findRecord(r,s.code)?"已评价":"待评价")+'</small></button>').join("")+'</div>');
  }
  function voiceEditor(startMic = false) {
    const r = round();
    const dialogText = M.draft(r).transcript || "";
    const firstRule = M.ruleFor(r,r.traits[0]);
    const firstExample = r.traits[0]+(r.template ? Math.round((firstRule.min+firstRule.max)/2) : "八")+"分";
    const audioHelp = guest ? "评分和录音会提交给本场主办人。" : "原声保存在本机。";
    openModal((startMic?"口述评分":"文字录入")+" · "+r.current,'<p class="help">连续报性状和分数，停顿后自动填入，分数齐全即'+(guest?"提交":"保存")+'。'+audioHelp+'浏览器的转写服务可能联网处理声音。</p><label class="field">口述文本<textarea id="speech-text" maxlength="2000" rows="4" placeholder="例如：'+esc(firstExample)+'">'+esc(dialogText)+'</textarea></label><p class="issues" id="speech-feedback" role="status"></p><div class="group-actions"><button class="ghost" id="record-btn" data-action="record">'+icon("mic")+'开始录音</button><button class="action" data-action="parse"'+(startMic?" hidden":"")+'>应用文字评分</button></div>',startMic ? "#record-btn" : "#speech-text");
    if (startMic) startRecording();
  }
  function requestRecordingEnd(session) {
    if (voiceSession !== session || !session.started || session.ending) return;
    session.ending = true;
    try { session.recognition.stop(); }
    catch { finishRecording(session); return; }
    if (!session.ended) session.stopTimer = setTimeout(() => finishRecording(session), 2500);
  }

  async function startRecording() {
    if (voiceSession) { requestRecordingEnd(voiceSession); return; }
    $("#voice-choices")?.remove();
    const field = $("#speech-text");
    const feedback = $("#speech-feedback");
    const button = $("#record-btn");
    const parseButton = dialog.querySelector('[data-action="parse"]');
    const r = round();
    const session = { round: r, code: r.current, rater: r.rater, field, feedback, button, parseButton, text: "" };
    const onActivity = () => {
      if (voiceSession !== session || session.ending) return;
      clearTimeout(session.pauseTimer);
      session.pauseTimer = setTimeout(() => requestRecordingEnd(session), 3000);
    };
    const rec = TasterVoice.createRecognition({
      onActivity,
      onResult: text => {
        if (voiceSession !== session || session.ended) return;
        const nextText = text.slice(0,2000).trim();
        if (nextText === session.text) return;
        session.text = nextText;
        if (session.text) field.value = session.text;
        onActivity();
      },
      onError: message => {
        if (voiceSession !== session) return;
        session.error = message;
        feedback.textContent = message;
      },
      onEnd: () => finishRecording(session)
    });
    if (!rec) {
      parseButton.hidden = false;
      feedback.textContent = "此浏览器未提供语音识别。可使用输入法的语音键口述，或直接输入文字。";
      field.focus();
      return;
    }
    session.recognition = rec;
    voiceSession = session;
    field.readOnly = true;
    parseButton.hidden = true;
    button.disabled = true;
    feedback.textContent = "正在打开麦克风…";
    try { session.capture = await TasterAudio.record(); }
    catch { session.audioWarning = "本次原声无法保存。"; }
    if (voiceSession !== session) { session.capture?.finish(); return; }
    try {
      session.started = true;
      if (session.capture?.track) {
        try { rec.start(session.capture.track); }
        catch { rec.start(); }
      } else {
        rec.start();
      }
      session.limitTimer = setTimeout(() => requestRecordingEnd(session), 90000);
      button.disabled = false;
      button.innerHTML = icon("stop")+"结束录音";
      feedback.textContent = "正在聆听，停顿后自动填分…"+(session.audioWarning || "");
    } catch {
      stopRecognition();
      field.readOnly = false;
      button.disabled = false;
      parseButton.hidden = false;
      feedback.textContent = "麦克风启动失败。请检查麦克风权限，也可以手动输入文字。";
    }
  }

  async function finishRecording(session) {
    if (voiceSession !== session || session.ended) return;
    session.ended = true;
    clearTimeout(session.pauseTimer);
    clearTimeout(session.limitTimer);
    clearTimeout(session.stopTimer);
    const { round: r, code, rater, text, field, button, parseButton, feedback } = session;
    button.disabled = true;
    feedback.textContent = "正在填入评分…";
    let recorded = false;
    try {
      const blob = await session.capture?.finish();
      if (voiceSession !== session) return;
      if (blob?.size) {
        const sample = { roundId: r.id, code, rater };
        try { await TasterAudio.save(sample, blob); }
        catch (error) {
          if (guest?.round !== r) throw error;
          const clips = guest.unsavedAudio.get(code) || [];
          clips.push({id:crypto.randomUUID(),at:Date.now(),blob});
          guest.unsavedAudio.set(code,clips);
        }
        recorded = true;
      }
    } catch {}
    if (voiceSession !== session) return;
    voiceSession = null;
    field.readOnly = false;
    button.disabled = false;
    button.innerHTML = icon("mic")+"继续录音";
    const d = M.draft(r);
    if (recorded) d.hasAudio = true;
    const audioWarning = recorded ? "" : " 本次原声未保存。";
    if (!text) {
      persist();
      parseButton.hidden = false;
      feedback.textContent = (session.error || "未识别到分数，请重说。")+audioWarning;
      return;
    }
    const parsed = TasterVoice.parse(text,r.traits,r.template?.traits,{ autoMatch: true });
    applyRecognizedScores(r,parsed,text,audioWarning);
  }
  function applyRecognizedScores(r,parsed,text,audioWarning = "") {
    const d = M.draft(r);
    Object.assign(d.scores,parsed.scores);
    const missing = r.traits.filter(trait => !M.valid(d.scores[trait],M.ruleFor(r,trait)));
    const needsReview = parsed.issues.length || parsed.suggestions?.length;
    if (Object.keys(parsed.scores).length && !missing.length && !needsReview) {
      delete d.transcript;
      delete d.voiceNeedsReview;
      saveCurrentScore(r,audioWarning);
      return;
    }
    if (needsReview) d.transcript = text;
    else delete d.transcript;
    d.voiceNeedsReview = true;
    persist();
    dialog.close();
    render();
    const count = Object.keys(parsed.scores).length;
    notify((count ? "已自动填入 "+count+" 项评分。" : "这一段未能填写评分。")+audioWarning);
  }
  function askAboutWord(field, suggestion) {
    const {heard,start,end,choices} = suggestion;
    // The parser indexes the NFKC-normalized transcript. Keep the editable
    // source intact until the taster actually selects a column.
    const source = field.value.normalize("NFKC").trim();
    const group = document.createElement("div");
    group.id = "voice-choices";
    group.className = "settings-actions";
    group.setAttribute("role","group");
    group.setAttribute("aria-label","确认口述性状");
    for (const trait of choices) {
      const b = document.createElement("button");
      b.type = "button"; b.className = "ghost"; b.dataset.voiceChoice = trait;
      b.textContent = "按「"+trait+"」填写";
      b.addEventListener("click",()=>{
        if (voiceSession || source !== field.value.normalize("NFKC").trim()) { group.remove(); return; }
        field.value = source.slice(0,start)+trait+source.slice(end);
        M.draft(round()).transcript = field.value;
        persist();
        applyTranscript();
      });
      group.append(b);
    }
    const feedback = $("#speech-feedback");
    feedback.textContent = "听到的是「"+heard+"」。请选择你指的性状，或直接修改上面的文字。";
    feedback.after(group);
  }
  function applyTranscript() {
    if (voiceSession) {
      requestRecordingEnd(voiceSession);
      return;
    }
    const r = round(), text = $("#speech-text").value.trim();
    $("#voice-choices")?.remove();
    const parsed = TasterVoice.parse(text,r.traits,r.template?.traits,{autoMatch:true});
    if (parsed.suggestions?.length) {
      askAboutWord($("#speech-text"),parsed.suggestions[0]);
      return;
    }
    if (!Object.keys(parsed.scores).length) {
      $("#speech-feedback").textContent = parsed.issues.join("\n") || "请说出或输入性状名称和分数。";
      return;
    }
    applyRecognizedScores(r,parsed,text);
  }

  function saveCurrentScore(r, extra = "") {
    if (guest?.round === r) { submitGuestScore(guest,extra); return; }
    try {
      const { record, done } = M.confirmScore(r);
      showNote = false;
      const saved = persist();
      if (dialog.open) dialog.close();
      render();
      notify(record.code+" 已保存"+(done?"，本轮品鉴完成。":"，下一份是 "+r.current+"。")+
        extra+(saved?"":" 请及时导出。"));
    } catch (error) {
      notify(error.message);
    }
  }
  async function submitGuestScore(entry, extra) {
    if (entry.pending) return;
    const {round:r,evaluator} = entry;
    let scores;
    try { scores = M.checkedDraft(r).scores; }
    catch (error) { notify(error.message); return; }
    const main = $("#main");
    entry.pending = true;
    persist();
    if (dialog.open) dialog.close();
    main.inert = true;
    main.setAttribute("aria-busy","true");
    notify("正在提交评分…");
    try {
      const local = await TasterAudio.list({roundId:r.id,code:r.current,rater:r.rater}).catch(()=>[]);
      const memory = entry.unsavedAudio.get(r.current) || [];
      const warning = await TasterCloud.submit(r.id,evaluator,r.current,scores,[...local,...memory]);
      if (guest !== entry) return;
      entry.unsavedAudio.delete(r.current);
      const {record,done} = M.confirmScore(r);
      persist();
      render();
      notify(record.code+" 已提交"+(done?"，本场评分完成。":"，下一份是 "+r.current+"。")+(warning || extra));
    } catch (error) {
      if (guest === entry) {
        render();
        notify(error.message+" 草稿已保留，可重试。");
      }
    } finally {
      entry.pending = false;
      if (guest === entry) {
        main.inert = false;
        main.removeAttribute("aria-busy");
      }
    }
  }
  function saveLocalTemplate(template) {
    const key = JSON.stringify(template);
    if ([...sharedTemplates,...localTemplates()].some(existing => JSON.stringify(existing) === key)) return "模板库已有这一份模板。";
    const saved = (state.savedTemplates ??= []);
    saved.push(template);
    if (!persist()) {
      saved.pop();
      throw Error("本机保存失败，请下载模板文件保留。");
    }
    render();
    return "已保存到本机模板，可从品鉴工作台选择。";
  }
  function templateEditor({ initial, mode, source, formDraft = {} } = {}) {
    try {
      TasterTemplates.open({
        round:source, openModal, initial, mode, onSave:saveLocalTemplate,
        onUse:template=>newRoundForm(TasterTemplates.validate(template),formDraft)
      });
    } catch(e) { notify(e.message); }
  }
  function newRoundForm(template, formDraft = {}) {
    const ruleField = '<div class="share-purpose"><strong>'+esc(template.foodType)+' · '+esc(template.version)+'</strong><p>'+
      template.traits.map(rule=>esc(rule.name)+' '+rule.min+'–'+rule.max).join('、')+'</p></div>';
    openModal("新建品鉴场次",'<form id="new-form">'+ruleField+
      '<label class="field">场次名称<input name="title" value="'+esc(formDraft.title ?? (template.foodType+'品鉴').slice(0,60))+'" maxlength="60" required></label>'+
      '<label class="field">样品名称<textarea name="names" rows="4" required maxlength="10000" placeholder="每行填写一个样品">'+esc(formDraft.names || '')+'</textarea><small>可填写 1–200 个样品。创建后会随机分配盲码。</small></label>'+
      '<p id="form-feedback" class="issues" role="status"></p><div class="group-actions"><button type="button" class="ghost" data-action="edit-form-template">修改模板副本</button><button class="action">创建场次</button></div></form>',"input");
    $("#new-form").tastingTemplate = template;
  }
  function createRound(form) {
    const data = new FormData(form), title = data.get("title").trim();
    const names = data.get("names").split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
    const template = form.tastingTemplate;
    if (!title || !names.length || names.length>200 || names.some(x=>x.length>80)) {
      $("#form-feedback").textContent = "请填写场次名称和 1–200 行样品名称，每行最多 80 字。"; return;
    }
    const r = M.makeRound({ title, names, template, rater:round().rater });
    state.rounds.push(r); state.active = r.id;
    persist(); navigate("workspace"); notify("场次已创建。可到「管理场次」查看盲码对照表。");
  }
  function showMapping() {
    const r = round();
    openModal("组织者盲码对照表",'<p class="help">请按此表为实体样品贴签，完成后关闭对照表再交给评价员。</p><div class="table-wrap"><table><thead><tr><th>样品盲码</th><th>样品名称</th></tr></thead><tbody>'+r.samples.map((s,i)=>'<tr><td>'+esc(s.code)+'</td><td><input aria-label="'+esc(s.code)+' 对应样品" data-mapping="'+i+'" maxlength="80" value="'+esc(s.name)+'" placeholder="填写样品名称"></td></tr>').join("")+'</tbody></table></div><div class="group-actions"><button class="action" data-action="save-map">保存对照表</button></div>');
  }
  function exportOptions() {
    const r = round();
    if (!r.records.length) { openModal("导出 Excel",'<p class="help">当前场次还没有已确认的评分。完成一份样品并确认后，即可导出评价记录。</p><div class="group-actions"><button class="action" data-action="home">返回工作台</button></div>'); return; }
    openModal("导出本机评分",'<p class="help">将「'+esc(r.title)+'」的 '+r.records.length+' 条已确认评价导出为 Excel，也可连同本机保存的录音一起打包。</p><label class="checkline"><input type="checkbox" id="export-names">包含样品真实名称（揭盲）</label><div class="group-actions"><button class="ghost" data-action="download">'+icon("download")+'只下载 Excel</button><button class="action" data-action="download-archive">下载 Excel 和录音 ZIP</button></div>');
  }
  async function download(button,includeAudio = false) {
    const r = round(), withNames = $("#export-names").checked;
    if ($("#dialog-inner [aria-busy='true']")) return;
    button.setAttribute("aria-busy","true");
    try {
      const excel = TasterExport.build({...r,samples:r.samples.map(s=>({...s,name:withNames?s.name:""}))});
      const title = r.title.replace(/[<>:"/\\|?*\u0000-\u001f]/g,"_");
      let blob = new Blob([excel],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
      if (includeAudio) {
        const files = {"评分.xlsx":excel};
        for (const [index,record] of r.records.entries()) {
          if (!button.isConnected || !dialog.open) return;
          const clips = await TasterAudio.list({roundId:r.id,code:record.code,rater:record.rater});
          for (const [i,clip] of clips.entries()) {
            const type = clip.blob.type;
            const ext = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : type.includes("wav") ? "wav" : "webm";
            files["录音/"+record.code+"_记录"+(index+1)+"_"+(i+1)+"."+ext] = new Uint8Array(await clip.blob.arrayBuffer());
          }
        }
        blob = new Blob([TasterExport.writeZip(files)],{type:"application/zip"});
      }
      if (!button.isConnected || !dialog.open) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url;
      a.download = title+"_"+(withNames?"揭盲":"盲评")+"_"+new Date().toISOString().slice(0,10)+(includeAudio?".zip":".xlsx");
      document.body.append(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),60000);
      dialog.close(); notify(includeAudio?"已打包本机评分和可用录音。":"已生成 Excel 文件。");
    } catch (err) { notify("导出失败："+err.message); }
    finally { button.removeAttribute("aria-busy"); }
  }
  document.addEventListener("click",event=>{
    const b = event.target.closest("button");
    if (!b) return;
    if (b.dataset.view) { navigate(b.dataset.view); return; }
    if ("template" in b.dataset) {
      const template = [...sharedTemplates,...localTemplates()][Number(b.dataset.template)];
      if (template) templateEditor({ initial:template });
      return;
    }
    const r = round();
    if ("trait" in b.dataset) {
      const t = r.traits[Number(b.dataset.trait)];
      M.draft(r).scores[t] = Number(b.dataset.value); persist(); render();
      document.querySelector('[data-trait="'+b.dataset.trait+'"][data-value="'+b.dataset.value+'"]')?.focus({preventScroll:true});
      return;
    }
    if ("sample" in b.dataset) {
      r.current = r.samples[Number(b.dataset.sample)].code; showNote = false; persist(); dialog.close(); render(); return;
    }
    if ("edit" in b.dataset) {
      const rec = r.records[Number(b.dataset.edit)]; r.current = rec.code; r.rater = rec.rater; persist(); navigate("workspace"); return;
    }
    if ("audio" in b.dataset) {
      const rec = r.records[Number(b.dataset.audio)];
      showVoiceAudio(r,rec.code,rec.rater);
      return;
    }
    if (b.id==="export") { exportOptions(); return; }
    switch (b.dataset.action) {
      case "home": navigate("workspace"); break;
      case "samples": openSamples(); break;
      case "text": voiceEditor(); break;
      case "mic": voiceEditor(true); break;
      case "voice-audio": showVoiceAudio(r,r.current,r.rater); break;
      case "record": startRecording(); break;
      case "parse": applyTranscript(); break;
      case "close": dialog.close(); break;
      case "note": showNote=true; render(); $("#note").focus(); break;
      case "confirm": {
        saveCurrentScore(r);
        break;
      }
      case "catalog": openCatalog(); break;
      case "cloud": cloud.open(); break;
      case "organize": organizeRound(r); break;
      case "local-records": navigate("records"); break;
      case "shared-directory": navigate("sharing"); break;
      case "blank-template": templateEditor({ mode:"edit" }); break;
      case "round-template": templateEditor({ source:r, mode:"edit" }); break;
      case "import-template": templateEditor({ mode:"import" }); break;
      case "import-data": sharing.openFile(); break;
      case "edit-form-template": {
        const form = $("#new-form");
        templateEditor({ initial:form.tastingTemplate, mode:"edit", formDraft:Object.fromEntries(new FormData(form)) });
        break;
      }
      case "share-data": sharing.ownerRound(r); break;
      case "mapping": showMapping(); break;
      case "save-map":
        dialog.querySelectorAll("[data-mapping]").forEach(input=>r.samples[Number(input.dataset.mapping)].name=input.value.trim());
        persist(); dialog.close(); notify("对照表已更新。"); break;
      case "download": download(b); break;
      case "download-archive": download(b,true); break;
    }
  });
  document.addEventListener("submit",event=>{
    event.preventDefault();
    if(event.target.id==="new-form") createRound(event.target);
    if(event.target.id==="rater-form") {
      const name=new FormData(event.target).get("rater").trim();
      if(!name){notify("请输入评价员姓名或代号。"); return;}
      const r=round(); r.rater=name; r.current=r.samples.find(s=>!M.findRecord(r,s.code))?.code || r.samples[0].code;
      persist(); dialog.close(); render(); notify("已切换至"+name+"。");
    }
  });
  document.addEventListener("input",event=>{
    if (event.target.hasAttribute("data-template-search")) filterTemplates(event.target);
    if(event.target.hasAttribute("data-range-trait")) {
      const r=round(), input=event.target, t=r.traits[Number(input.dataset.rangeTrait)];
      const value=input.valueAsNumber, draft=M.draft(r);
      if(M.valid(value,M.ruleFor(r,t))) draft.scores[t]=value; else delete draft.scores[t];
      const result=input.closest(".score-row").querySelector(".result");
      result.textContent=draft.scores[t] ?? "—"; result.classList.toggle("scored",draft.scores[t]!=null);
      $("#score-count").textContent="已填 "+r.traits.filter(k=>M.valid(draft.scores[k],M.ruleFor(r,k))).length+" / "+r.traits.length;
      persist();
    }
    if(event.target.id==="note") { M.draft(round()).note=event.target.value; persist(); }
    if(event.target.id==="speech-text"){ $("#voice-choices")?.remove(); $("#speech-feedback").textContent=""; M.draft(round()).transcript=event.target.value; persist(); }
  });
  document.addEventListener("change",event=>{
    if (event.target.hasAttribute("data-round-picker")) {
      state.active=event.target.value; showNote=false; persist();
      if (dialog.open) dialog.close();
      if (page === "workspace" && M.usesPreviousBiscuitTraits(round())) navigate("records"); else render();
    }
  });
  async function openGuest(invite, revision) {
    document.body.classList.add("cloud-guest");
    $("#main").innerHTML = '<p role="status">正在读取场次…</p>';
    const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu;
    try {
      if (!uuid.test(invite)) throw Error("评价链接格式有误。");
      const data = await TasterCloud.join(invite);
      if (revision !== routeId) return;
      if (!data?.codes?.length) throw Error("场次不存在或已暂停收评。");
      const storageKey = "little-taster.guest."+invite;
      let saved;
      try { saved = JSON.parse(sessionStorage.getItem(storageKey)); } catch {}
      const evaluator = saved && uuid.test(saved.evaluator) ? saved.evaluator : crypto.randomUUID();
      const r = M.makeRound({
        title:data.title, template:TasterTemplates.validate(data.template),
        codedSamples:data.codes.map(code=>({code,name:""})), rater:"匿名评价员"
      });
      r.id = data.id;
      if (saved) {
        r.current = data.codes.includes(saved.current) ? saved.current : r.current;
        if (Array.isArray(saved.records)) r.records = saved.records;
        if (saved.drafts && typeof saved.drafts === "object") r.drafts = saved.drafts;
      }
      guest = { round:r, storageKey, evaluator, unsavedAudio:new Map() };
      page = "workspace";
      persist(); render();
    } catch (error) {
      if (revision === routeId) $("#main").innerHTML = '<section class="panel setting-card"><h1>无法打开评价</h1><p class="help">'+esc(error.message)+'</p></section>';
    }
  }
  function route() {
    const hash=location.hash;
    const revision = ++routeId;
    if (guest || document.body.classList.contains("cloud-guest")) {
      stopRecognition();
      if (dialog.open) dialog.close();
      showNote = false;
      guest = null;
      $("#main").inert = false;
      $("#main").removeAttribute("aria-busy");
      document.body.classList.remove("cloud-guest");
    }
    if (hash.startsWith("#join=")) {
      stopRecognition();
      if (dialog.open) dialog.close();
      openGuest(hash.slice(6),revision);
      return;
    }
    if(hash.startsWith("#template=") || /^#(data|request|decision)=/.test(hash)) {
      stopRecognition();
      page=hash.startsWith("#template=") ? "community" : "sharing";
      render();
      if(!hash.startsWith("#template=")) { sharing.fromHash(hash); return; }
      try { templateEditor({ initial:TasterTemplates.readLink(hash) }); }
      catch(e) { openModal("模板无法打开",'<p class="issues">'+esc(e.message)+'</p>'); }
      return;
    }
    const next = hash === "#settings" ? "community" : knownPages.includes(hash.slice(1)) ? hash.slice(1) : "workspace";
    if(next!==page || dialog.open) navigate(next); else render();
  }
  window.addEventListener("hashchange",route);
  if (!location.hash.startsWith("#join=")) persist();
  route();
})();
