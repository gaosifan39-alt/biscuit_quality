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
  let page = "workspace", readingStatus = "", toastTimer, voiceSession = null;
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
    clearTimeout(session.restartTimer);
    clearTimeout(session.stopTimer);
    if (session.listening && !session.ended) {
      try { session.recognition.abort(); } catch {}
    }
    session.capture?.finish();
  }
  const knownPages = ["workspace","records","community","sharing"];
  function navigate(next) {
    if (!knownPages.includes(next)) next = "workspace";
    stopRecognition();
    if (dialog.open) dialog.close();
    readingStatus = "";
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
    if (page === "sharing") cloud.datasets.directory($("#dataset-catalog"));
    if (page === "community") cloud.directory($("#cloud-directory"));
  }
  function workspace(r) {
    const food = r.template?.foodType || "小麦饼干";
    const rules = r.traits.map(t=>M.ruleFor(r,t));
    const example = rules.slice(0,2).map(rule=>rule.name+Math.round((rule.min+rule.max)/2)+"分").join("，");
    const next = rules[0].name+Math.min(rules[0].max,rules[0].min+2)+"分";
    const prompt = r.samples.length > 1 ? "如「一号样品，"+example+"。二号样品，"+next+"。」" : "如「一号样品，"+example+"。」";
    const rows = r.samples.map(({code},i)=>{
      const scores = M.readScores(r,code);
      const selected = code === r.current;
      const completed = Boolean(M.findRecord(r,code));
      const label = "选择 "+(i+1)+" 号样品"+(completed?"，已保存":"");
      return '<tr data-score-row="'+(i+1)+'"'+(selected?' class="current-row"':"")+'><th scope="row"><button class="sample-pick" data-sample="'+i+'" aria-label="'+label+'" aria-pressed="'+selected+'">'+(i+1)+'<small>号</small></button></th>'+
        r.traits.map(t=>'<td'+(Object.hasOwn(scores,t)?' class="has-score"':"")+'>'+esc(scores[t] ?? "—")+'</td>').join("")+'</tr>';
    }).join("");
    const help = !guest ? "先给实物贴 1、2、3…号，品种对照由你自己保存。" : "按实物编号口述，完整的评分和录音会自动发送给主办人。";
    const countLabel = guest ? '<span>'+r.samples.length+' 份样品</span>' :
      '<button class="count-link" data-action="new-round" aria-label="设置样品数量并新建场次">'+r.samples.length+' 份样品 · 设置</button>';
    const setup = !guest ? '<div class="panel-actions"><button class="ghost" data-action="catalog">选食品与模板</button><button class="ghost" data-action="organize">管理场次</button><button class="action" data-action="cloud">扫码收评</button>'+
      (r.records.length?'<button class="ghost" data-action="publish-dataset">结束本场</button>':"")+'</div>' : "";
    const headings = rules.map(rule=>'<th scope="col">'+esc(rule.name)+'<small>'+esc(rule.min+"–"+rule.max+' 分')+'</small></th>').join("");
    const guide = '<details class="panel scale-guide"><summary>查看评分说明</summary><p>'+esc(r.template?.instructions || "按各项量表口述分数。")+
      '</p><dl>'+rules.map(rule=>'<div><dt>'+esc(rule.name)+'</dt><dd>'+esc(rule.min+" 分 "+(rule.low || "程度低")+" · "+rule.max+" 分 "+(rule.high || "程度高"))+
      (rule.instructions?'<small>'+esc(rule.instructions)+'</small>':"")+'</dd></div>').join("")+'</dl></details>';
    const hasUnsent = Object.values(r.drafts).some(draft=>draft.syncPending);
    const current = M.sampleNumber(r,r.current);
    return '<section class="tasting-lead"><div class="tasting-intro"><div class="tasting-label"><span>'+esc(food)+'</span>'+countLabel+'</div>'+
      '<h2>按样品号口述评分</h2><p class="voice-sample-prompt">'+esc(prompt)+'</p>'+
      '<div class="tasting-action"><button class="action mic-start" data-action="mic">'+icon("mic")+'开始口述</button>'+
      '<span>不报样品号时填入当前 <b id="current-sample">'+current+'</b> 号</span></div><p class="tasting-help">'+help+'</p>'+setup+
      '</div><div class="tasting-photo" aria-hidden="true"></div></section>'+
      '<section class="panel score-matrix"><div class="sheet-heading"><h2 class="section-title">样品评分表</h2>'+
      (guest && hasUnsent?'<button class="ghost" data-action="retry-scores">重试提交</button>':"")+'</div>'+
      (readingStatus?'<p id="voice-outcome" class="reading-status" role="status">'+esc(readingStatus)+'</p>':"")+
      '<div class="matrix-scroll" tabindex="0" aria-label="样品评分表，可横向滚动"><table><thead><tr><th scope="col">样品号</th>'+headings+
      '</tr></thead><tbody>'+rows+'</tbody></table></div></section>'+guide;
  }
  function recordsPage(r) {
    const historical = M.usesPreviousBiscuitTraits(r);
    const header = '<div class="sheet-heading"><h2 class="section-title">'+icon("list")+'已确认的评价</h2><span class="count-tag">'+r.records.length+' 条记录</span></div>'+roundPicker(r,"records-select");
    if (!r.records.length) return '<section class="panel">'+header+'<div class="empty">'+icon("clipboard")+'<h3>还没有已确认的评价</h3><p>录入第一份样品评分后，即可在这里查看和导出。</p><button class="action" data-action="home">去评价</button></div></section>';
    const columns = ["样品号",...r.traits,"评价员"];
    const hasOperations = !historical || r.records.some(record => record.hasAudio);
    if (hasOperations) columns.push("操作");
    const rows = r.records.map((x,i) => {
      const edit = historical ? "" : '<button class="subtle" data-edit="'+i+'">'+icon("note")+'修改</button>';
      const audio = x.hasAudio ? '<button class="subtle" data-audio="'+i+'">'+icon("wave")+'录音</button>' : "";
      return '<tr><td><b>'+M.sampleNumber(r,x.code)+'</b></td>'+r.traits.map(t=>'<td>'+esc(x.scores[t])+'</td>').join("")+'<td>'+esc(x.rater)+'</td>'+
        (hasOperations?'<td>'+audio+edit+'</td>':"")+'</tr>';
    }).reverse().join("");
    return '<section class="panel">'+header+'<div class="table-wrap"><table><thead><tr>'+columns.map(t=>'<th>'+esc(t)+'</th>').join("")+'</tr></thead><tbody>'+rows+'</tbody></table></div></section>';
  }
  function roundPicker(r, id, label="选择场次") {
    const options = state.rounds.map((s,i)=>'<option value="'+esc(s.id)+'" '+(s===r?"selected":"")+'>'+esc(s.title)+' · 场次 '+(i+1)+(M.usesPreviousBiscuitTraits(s)?" · 历史记录":"")+'</option>').join("");
    return '<label class="field session-picker">'+label+'<select id="'+id+'" data-round-picker>'+options+'</select></label>';
  }
  function organizeRound(r) {
    openModal("管理场次",roundPicker(r,"round-select")+
      '<form id="rater-form"><label class="field">更换评价员<input name="rater" value="'+esc(r.rater)+'" maxlength="40" required></label><div class="panel-actions"><button class="ghost">保存评价员</button><button type="button" class="ghost" data-action="new-round">新建场次 · 设置样品数</button><button type="button" class="ghost" data-action="local-records">本机评分与录音</button></div></form>');
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
    return '<section class="panel setting-card dataset-card"><h2 class="card-title">测评数据目录</h2>'+
      '<p class="help">在线收评和已上传的本机测评会显示在这里。</p><div id="dataset-catalog"></div></section>'+
      '<section class="panel setting-card dataset-source"><div><h2 class="card-title">上传本机测评</h2>'+
      '<p class="help">选择一个场次并设置公开方式。</p></div>'+
      '<div class="dataset-source-actions">'+roundPicker(r,"share-round-select","选择本机场次")+
      '<button class="action" data-action="publish-dataset">上传并设置公开</button>'+
      '<button class="subtle" data-action="import-data">接收旧版共享文件</button></div></section>';
  }
  function communityPage() {
    return '<section class="panel setting-card">'+
      '<div class="panel-actions"><button class="action" data-action="blank-template">'+icon("plus")+'新建模板</button><button class="ghost" data-action="import-template">上传或导入模板</button><button class="ghost" data-action="round-template">使用本场规则</button></div>'+
      catalogPage()+'</section><details class="panel setting-card dataset-source" id="shared-template-panel"><summary>浏览共享评价模板</summary><div id="cloud-directory"></div></details>';
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
  dialog.addEventListener("cancel",event=>{
    if (voiceSession?.started) event.preventDefault();
  });

  function clearAudioURLs() {
    for (const url of audioURLs) URL.revokeObjectURL(url);
    audioURLs.length = 0;
  }

  async function showVoiceAudio(r, code, rater) {
    const sample = M.sampleNumber(r,code)+" 号";
    openModal("录音 · "+sample, '<div id="voice-clips"><p class="help" role="status">正在读取本机录音…</p></div>');
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
        link.download = sample+"-录音-"+(index+1)+"."+extension;
        link.textContent = "下载录音 "+(index+1);
        row.append(player, link);
        panel.append(row);
      });
    } catch {
      if (panel.isConnected) panel.textContent = "本机录音暂时无法读取。";
    }
  }
  function voiceEditor() {
    if (guest?.pending) return;
    const r = round();
    openModal("口述评分",'<p class="help">请保持<strong>语速平缓、发音清楚准确</strong>，依次报样品号、性状和分数。中途可以停下来品尝，再接着报分。说完点「结束录音」，分数会自动填入。</p>'+
      '<p class="help">'+(guest?"录音会随完整评分发送给主办人。":"原声保存在本机。")+'浏览器的语音服务可能联网处理声音。</p>'+
      '<p id="speech-feedback" class="recording-status" role="status">正在打开麦克风…</p>'+
      '<div class="group-actions"><button class="ghost" id="record-btn" data-action="stop-recording" disabled>'+icon("stop")+'结束录音</button></div>',"#record-btn");
    startRecording(r);
  }

  function requestRecordingEnd(session) {
    if (!session || voiceSession !== session || !session.started || session.ending) return;
    session.ending = true;
    session.button.disabled = true;
    session.feedback.textContent = "正在整理口述评分…";
    clearTimeout(session.restartTimer);
    if (!session.listening) { finishRecording(session); return; }
    try { session.recognition.stop(); }
    catch { finishRecording(session); return; }
    if (!session.ended) session.stopTimer = setTimeout(()=>finishRecording(session),2500);
  }

  function listen(session) {
    const {recognition,capture,feedback} = session;
    session.listening = true;
    try {
      if (capture?.track) {
        try { recognition.start(capture.track); }
        catch { recognition.start(); }
      } else recognition.start();
      feedback.textContent = "正在听，可以停顿。说完请点「结束录音」。"+(session.audioWarning || "");
    } catch {
      session.listening = false;
      session.error = "语音识别无法启动，请检查浏览器的麦克风权限。";
      feedback.textContent = session.error;
    }
  }

  async function startRecording(r) {
    const feedback = $("#speech-feedback");
    const button = $("#record-btn");
    const dismiss = dialog.querySelector(".close");
    const session = {round:r,guest,code:r.current,feedback,button,dismiss,parts:[],text:""};
    const rec = TasterVoice.createRecognition({
      onResult: text => {
        if (voiceSession === session && session.listening && !session.ended && text.trim()) session.text = text.trim();
      },
      onError: (message,reason) => {
        if (voiceSession !== session || session.ended || reason === "no-speech") return;
        session.error = message;
        if (!session.ending) feedback.textContent = message+" 点「结束录音」可填写已识别的分数。";
      },
      onEnd: ()=>{
        if (voiceSession !== session || session.ended) return;
        session.listening = false;
        if (session.ending) { finishRecording(session); return; }
        if (session.text) session.parts.push(session.text);
        session.text = "";
        // The speech service can disconnect during silence while the microphone recorder keeps running.
        if (!session.error) session.restartTimer = setTimeout(()=>{
          if (voiceSession === session && !session.ending) listen(session);
        },250);
      }
    });
    if (!rec) { feedback.textContent = "此浏览器未提供语音识别。请用支持语音识别的浏览器打开。"; return; }
    session.recognition = rec;
    voiceSession = session;
    try { session.capture = await TasterAudio.record(); }
    catch { session.audioWarning = "原声无法录制。"; }
    if (voiceSession !== session) { session.capture?.finish(); return; }
    listen(session);
    if (session.listening || session.capture) {
      session.started = true;
      dismiss.hidden = true;
      button.disabled = false;
      button.focus();
    } else {
      stopRecognition();
    }
  }

  async function finishRecording(session) {
    if (voiceSession !== session || !session.ending || session.ended) return;
    session.ended = true;
    clearTimeout(session.restartTimer);
    clearTimeout(session.stopTimer);
    const {round:r,feedback,button,dismiss} = session;
    const text = [...session.parts,session.text].filter(Boolean).join("，");
    if (session.listening) {
      try { session.recognition.abort(); } catch {}
    }
    button.disabled = true;
    feedback.textContent = "正在填表…";
    const blob = await session.capture?.finish().catch(()=>null);
    if (voiceSession !== session) return;
    if (!text) {
      voiceSession = null;
      dismiss.hidden = false;
      feedback.textContent = session.error || "没有听到评分，请关掉窗口后再试一次。";
      return;
    }
    const parsed = TasterVoice.parseSamples(text,r.samples,session.code,r.traits,r.template?.traits);
    const complete = [];
    const partial = [];
    let written = 0;
    let audioLost = false;
    for (const row of parsed.rows) {
      const n = M.sampleNumber(r,row.code);
      const draft = M.draft(r,row.code);
      const count = Object.keys(row.scores).length;
      if (count && blob?.size) {
        try {
          await TasterAudio.save({roundId:r.id,code:row.code,rater:r.rater},blob);
          draft.hasAudio = true;
        } catch {
          if (session.guest) {
            const memory = session.guest.unsavedAudio;
            const clips = memory.get(row.code) || [];
            clips.push({id:crypto.randomUUID(),at:Date.now(),blob});
            memory.set(row.code,clips);
          } else audioLost = true;
        }
      }
      if (voiceSession !== session) return;
      Object.assign(draft.scores,row.scores);
      delete draft.transcript;
      delete draft.voiceNeedsReview;
      written += count;
      const missing = r.traits.filter(t=>!M.valid(draft.scores[t],M.ruleFor(r,t)));
      if (count && !missing.length && !row.issues.length && !row.suggestions?.length) {
        if (session.guest) draft.syncPending = true;
        complete.push(row.code);
      } else {
        delete draft.syncPending;
        if (missing.length) partial.push(n+" 号还差 "+missing.join("、"));
        if (row.issues.length || row.suggestions?.length) {
          const issue = row.issues[0]?.replace(/请确认$/u,"请重说这一项。");
          partial.push(n+" 号 "+(issue || "有一项名称听不清，请重说。"));
        }
      }
    }
    voiceSession = null;
    if (!session.guest) for (const code of complete) M.confirmScore(r,code);
    const incomplete = parsed.rows.find(row=>!complete.includes(row.code));
    if (incomplete) r.current = incomplete.code;
    const message = written ? "已填入 "+written+" 个分数。" : "这次没有识别到可填写的分数。";
    const note = written && (!blob?.size || audioLost) ? "本次有录音未保存。" : "";
    readingStatus = [message,...parsed.issues,...partial,note].filter(Boolean).join(" ");
    if (!session.guest && complete.length && !r.datasetFinishPrompted && r.samples.every(({code})=>M.findRecord(r,code))) {
      r.datasetFinishPrompted = true;
      dialog.addEventListener("close",()=>{
        if (page === "workspace" && round() === r) cloud.datasets.publishLocal(r,localScores(r),true);
      },{once:true});
    }
    persist();
    dialog.close();
    render();
    if (session.guest && complete.length) await submitGuestScores(session.guest,complete);
  }

  async function submitGuestScores(entry,codes) {
    if (entry.pending) return;
    const {round:r,evaluator} = entry;
    entry.pending = true;
    const main = $("#main");
    main.inert = true;
    main.setAttribute("aria-busy","true");
    const failures = [];
    const notices = [];
    let submitted = 0;
    try {
      for (const code of codes) {
        if (guest !== entry) return;
        const draft = M.draft(r,code);
        if (!draft.syncPending) continue;
        try {
          const scores = M.checkedDraft(r,code).scores;
          const local = await TasterAudio.list({roundId:r.id,code,rater:r.rater}).catch(()=>[]);
          const clips = [...local,...(entry.unsavedAudio.get(code) || [])];
          const warning = await TasterCloud.submit(r.id,evaluator,code,scores,clips);
          if (guest !== entry) return;
          if (warning) notices.push(warning);
          entry.unsavedAudio.delete(code);
          M.confirmScore(r,code);
          persist();
          submitted++;
        } catch (error) { failures.push(M.sampleNumber(r,code)+" 号 "+error.message); }
      }
    } finally {
      entry.pending = false;
      if (guest === entry) {
        main.inert = false;
        main.removeAttribute("aria-busy");
        if (submitted) readingStatus += " 已提交 "+submitted+" 份样品。";
        if (failures.length) readingStatus += " "+failures.join(" ")+"，分数已保留，可重试提交。";
        if (notices.length) readingStatus += " "+[...new Set(notices)].join(" ");
        render();
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
      '<label class="field">样品数量<input name="count" type="number" inputmode="numeric" min="1" max="200" step="1" required value="'+esc(formDraft.count ?? 5)+'"><small>可设 1–200 份。按表中的顺序给实物贴号。</small></label>'+
      '<p id="form-feedback" class="issues" role="status"></p><div class="group-actions"><button type="button" class="ghost" data-action="edit-form-template">修改模板副本</button><button class="action">创建场次</button></div></form>',"input");
    $("#new-form").tastingTemplate = template;
  }
  function createRound(form) {
    const data = new FormData(form), title = data.get("title").trim();
    const count = Number(data.get("count"));
    const template = form.tastingTemplate;
    if (!title || !Number.isInteger(count) || count<1 || count>200) {
      $("#form-feedback").textContent = "请填写场次名称，样品数量为 1–200 之间的整数。"; return;
    }
    const r = M.makeRound({ title, names:Array(count).fill(""), template, rater:round().rater });
    state.rounds.push(r); state.active = r.id;
    persist(); navigate("workspace"); notify("已创建 "+count+" 份样品的评分表。");
  }
  function localScores(r) {
    const records = new Map(r.records.map(record=>[JSON.stringify([record.code,record.rater]),record]));
    for (const [id,draft] of Object.entries(r.drafts)) {
      if (!Object.keys(draft.scores).length) continue;
      const [code,rater] = JSON.parse(id);
      records.set(id,{code,rater,scores:draft.scores});
    }
    return [...records.values()];
  }
  function exportOptions() {
    const r = round();
    openModal("导出本机评分",'<p class="help">将「'+esc(r.title)+'」按样品号和性状导出。未填写的分数会留空。</p><div class="group-actions"><button class="ghost" data-action="download">'+icon("download")+'只下载 Excel</button><button class="action" data-action="download-archive">下载 Excel 和录音 ZIP</button></div>');
  }
  async function download(button,includeAudio = false) {
    const r = round(), records = localScores(r);
    if ($("#dialog-inner [aria-busy='true']")) return;
    button.setAttribute("aria-busy","true");
    try {
      const excel = TasterExport.buildScores({...r,records});
      const title = r.title.replace(/[<>:"/\\|?*\u0000-\u001f]/g,"_");
      let blob = new Blob([excel],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
      if (includeAudio) {
        const files = {"评分.xlsx":excel};
        for (const [index,record] of records.entries()) {
          if (!button.isConnected || !dialog.open) return;
          const clips = await TasterAudio.list({roundId:r.id,code:record.code,rater:record.rater});
          for (const [i,clip] of clips.entries()) {
            const type = clip.blob.type;
            const ext = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : type.includes("wav") ? "wav" : "webm";
            files["录音/"+M.sampleNumber(r,record.code)+"号_记录"+(index+1)+"_"+(i+1)+"."+ext] = new Uint8Array(await clip.blob.arrayBuffer());
          }
        }
        blob = new Blob([TasterExport.writeZip(files)],{type:"application/zip"});
      }
      if (!button.isConnected || !dialog.open) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url;
      a.download = title+"_"+new Date().toISOString().slice(0,10)+(includeAudio?".zip":".xlsx");
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
    if ("sample" in b.dataset) {
      r.current = r.samples[Number(b.dataset.sample)].code;
      persist();
      document.querySelector(".current-row")?.classList.remove("current-row");
      document.querySelector('.sample-pick[aria-pressed="true"]')?.setAttribute("aria-pressed","false");
      b.closest("tr").classList.add("current-row");
      b.setAttribute("aria-pressed","true");
      $("#current-sample").textContent = Number(b.dataset.sample)+1;
      return;
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
      case "mic": voiceEditor(); break;
      case "stop-recording": requestRecordingEnd(voiceSession); break;
      case "retry-scores":
        if (guest) submitGuestScores(guest,r.samples.filter(({code})=>M.draft(r,code).syncPending).map(({code})=>code));
        break;
      case "close": dialog.close(); break;
      case "catalog": openCatalog(); break;
      case "cloud": cloud.open(); break;
      case "organize": organizeRound(r); break;
      case "new-round": newRoundForm(TasterTemplates.fromRound(r),{count:r.samples.length}); break;
      case "local-records": navigate("records"); break;
      case "shared-directory":
        navigate("community");
        $("#shared-template-panel").open = true;
        $("#shared-template-panel").scrollIntoView({block:"nearest"});
        break;
      case "blank-template": templateEditor({ mode:"edit" }); break;
      case "round-template": templateEditor({ source:r, mode:"edit" }); break;
      case "import-template": templateEditor({ mode:"import" }); break;
      case "import-data": sharing.openFile(); break;
      case "edit-form-template": {
        const form = $("#new-form");
        templateEditor({ initial:form.tastingTemplate, mode:"edit", formDraft:Object.fromEntries(new FormData(form)) });
        break;
      }
      case "publish-dataset": cloud.datasets.publishLocal(r,localScores(r)); break;
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
      readingStatus = "";
      persist(); dialog.close(); render(); notify("已切换至"+name+"。");
    }
  });
  document.addEventListener("input",event=>{
    if (event.target.hasAttribute("data-template-search")) filterTemplates(event.target);
  });
  document.addEventListener("change",event=>{
    if (event.target.hasAttribute("data-round-picker")) {
      state.active=event.target.value; readingStatus=""; persist();
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
      readingStatus = "";
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
