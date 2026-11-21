(() => {
  "use strict";
  const M = TasterModel;
  const $ = selector => document.querySelector(selector);
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const paths = {
    grid:'<rect x="3" y="3" width="7" height="7" rx="1.4"/><rect x="14" y="3" width="7" height="7" rx="1.4"/><rect x="3" y="14" width="7" height="7" rx="1.4"/><rect x="14" y="14" width="7" height="7" rx="1.4"/>',
    list:'<rect x="4" y="3" width="16" height="18" rx="3"/><path d="M8 8h8M8 12h8M8 16h5"/>',
    sliders:'<path d="M3 7h5m5 0h8M3 17h10m5 0h3"/><circle cx="10.5" cy="7" r="2.5"/><circle cx="15.5" cy="17" r="2.5"/>',
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
  const round = () => state.rounds.find(r => r.id === state.active);
  let page = "workspace", showNote = false, toastTimer, recognition = null;
  let applyAfterRecording = false, lastFocused = null;
  const dialog = $("#dialog");
  const sharing = TasterShareUI.create(openModal);
  function notify(message) {
    $("#toast").textContent = message;
    $("#toast").classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $("#toast").classList.remove("show"), 3800);
  }
  function persist() {
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
    const active = recognition;
    recognition = null;
    applyAfterRecording = false;
    if (active) { try { active.abort(); } catch {} }
  }
  const knownPages = ["workspace","records","settings"];
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
    const r = page === "workspace" ? M.ensureScoringRound(state) : round();
    if (state.active !== previousId) persist();
    const isBiscuit = !r.template || r.template.foodType?.includes("饼干");
    const names = { workspace:isBiscuit ? "饼干盲评工作台" : "食品盲评工作台", records:"评价记录", settings:"场次设置" };
    const meta = '<div class="meta">'+icon("leaf")+esc(r.title)+'<span class="divider"></span>'+icon("user")+esc(r.rater)+'</div>';
    const savedCount = r.records.filter(x => x.rater === r.rater).length;
    const progress = '<div class="progress"><div><span>我的品鉴进度</span><span><b>'+savedCount+'</b> / '+r.samples.length+'</span></div><div class="track"><span style="width:'+100*savedCount/r.samples.length+'%"></span></div></div>';
    $("#main").innerHTML = (storageError ? '<p id="storage-warning" class="inline-status" role="alert">'+esc(storageError)+'</p>' : "")+
      '<div class="page-heading"><div><h1>'+names[page]+'</h1>'+meta+'</div>'+(page === "workspace" ? progress : "")+'</div>'+
      (page === "workspace" ? workspace(r) : page === "records" ? recordsPage(r) : settingsPage(r));
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
    return '<section class="hero" aria-label="当前盲评样品与语音录入"><div class="sample"><span class="sample-tag">'+icon("sample")+'当前样品</span><div class="sample-bottom"><div><small>样品盲码</small><div class="sample-code">'+esc(r.current)+'</div></div><button class="switch" data-action="samples">'+icon("swap")+'切换样品</button></div></div>'+
      '<div class="voice"><div class="voice-head"><h2>'+icon("wave")+'语音评分</h2><button data-action="text">'+icon("keyboard")+'文字录入</button></div><div class="wave-area"><div class="wave" aria-hidden="true">'+wave+'</div><button data-action="mic" class="mic" aria-label="开始语音评分">'+icon("mic")+'</button><div class="wave right" aria-hidden="true">'+wave+'</div></div>'+
      '<p class="voice-instruction">点击麦克风，口述评分</p><p class="voice-example">试着说「'+esc(example)+'」</p></div></section>'+
      '<section class="panel"><div class="sheet-heading"><div><h2 class="section-title">'+icon("clipboard")+'性状评分表</h2><p>'+esc(sheetHelp)+'</p></div><span class="count-tag" id="score-count">已填 '+count+' / '+r.traits.length+'</span></div>'+
      '<div class="scale-label"><span>品质性状</span><span class="scale-range"><span>评分刻度</span><span>'+(r.template?"按各项量表":"1 低 · 10 高")+'</span></span><span>得分</span></div><div>'+rows+'</div>'+
      ((showNote||d.note)?'<div class="note-box"><label for="note">品鉴备注</label><textarea id="note" maxlength="2000" placeholder="记下这块饼干的口感或香气">'+esc(d.note)+'</textarea></div>':"")+
      '<div class="sheet-footer"><button class="subtle" data-action="note">'+icon("note")+'品鉴备注</button><button class="action" data-action="confirm">'+icon("check")+(M.findRecord(r)?"更新评价":"确认评分")+'</button></div></section>';
  }
  function recordsPage(r) {
    const historical = M.usesPreviousBiscuitTraits(r);
    const closeout = '<section class="panel closeout"><div><h2>本场小结</h2><p class="help">已确认 '+r.records.length+' 条评价 · 原始记录保存在本机</p></div><button class="ghost" data-action="share-data">分享本场数据</button></section>';
    const header = '<div class="sheet-heading"><h2 class="section-title">'+icon("list")+'已确认的评价</h2><span class="count-tag">'+r.records.length+' 条记录</span></div>';
    if (!r.records.length) return '<section class="panel">'+header+'<div class="empty">'+icon("clipboard")+'<h3>还没有已确认的评价</h3><p>在工作台确认第一份样品评分后，即可在这里查看和导出。</p><button class="action" data-action="home">去评价</button></div></section>'+closeout;
    const columns = ["盲码","评价员",...r.traits,"备注"];
    if (!historical) columns.push("操作");
    const rows = r.records.map((x,i) => {
      const edit = historical ? "" : '<td><button class="subtle" data-edit="'+i+'">'+icon("note")+'修改</button></td>';
      return '<tr><td><b>'+esc(x.code)+'</b></td><td>'+esc(x.rater)+'</td>'+r.traits.map(t=>'<td>'+esc(x.scores[t])+'</td>').join("")+'<td>'+esc(x.note || "—")+'</td>'+edit+'</tr>';
    }).reverse().join("");
    return '<section class="panel">'+header+'<div class="table-wrap"><table><thead><tr>'+columns.map(t=>'<th>'+esc(t)+'</th>').join("")+'</tr></thead><tbody>'+rows+'</tbody></table></div></section>'+closeout;
  }
  function settingsPage(r) {
    const options = state.rounds.map((s,i)=>'<option value="'+esc(s.id)+'" '+(s===r?"selected":"")+'>'+esc(s.title)+' · 场次 '+(i+1)+(M.usesPreviousBiscuitTraits(s)?" · 历史记录":"")+'</option>').join("");
    return '<div class="settings-grid"><section class="panel setting-card"><h2 class="card-title">本机场次</h2><label class="field">选择场次<select id="round-select">'+options+'</select></label><dl class="summary-list"><dt>盲评样品</dt><dd>'+r.samples.length+' 份</dd><dt>评价性状</dt><dd>'+r.traits.map(esc).join("、")+'</dd><dt>已确认评价</dt><dd>'+r.records.length+' 条</dd></dl><div class="settings-actions"><button class="action" data-action="new-round">'+icon("plus")+'新建场次</button><button class="ghost" data-action="templates">使用共享模板</button><button class="ghost" data-action="mapping">'+icon("eye")+'组织者对照表</button></div></section>'+
      '<section class="panel setting-card"><h2 class="card-title">当前评价员</h2><p class="help">同一设备可以轮流试吃。换人时输入不同的姓名或代号，各自的评价会单独记录。</p><form id="rater-form"><label class="field">姓名或代号<input name="rater" value="'+esc(r.rater)+'" maxlength="40" required></label><button class="ghost">保存评价员</button></form></section></div>';
  }
  function openModal(title, content, focusSelector) {
    if (!dialog.open) lastFocused = document.activeElement;
    $("#dialog-inner").innerHTML = '<div class="dialog-title"><h2 id="dialog-title">'+esc(title)+'</h2><button class="close" aria-label="关闭" data-action="close">'+icon("close")+'</button></div>'+content;
    dialog.setAttribute("aria-labelledby","dialog-title");
    if (!dialog.open) dialog.showModal();
    if (focusSelector) dialog.querySelector(focusSelector)?.focus();
  }
  dialog.addEventListener("close",() => {
    stopRecognition();
    if (lastFocused?.isConnected) lastFocused.focus();
  });
  function openSamples() {
    const r = round();
    openModal("切换样品",'<p class="help">选择与你手中样品标签一致的盲码。</p><div class="sample-grid">'+r.samples.map((s,i)=>'<button data-sample="'+i+'" aria-pressed="'+(r.current===s.code)+'">'+esc(s.code)+'<small>'+(M.findRecord(r,s.code)?"已评价":"待评价")+'</small></button>').join("")+'</div>');
  }
  function voiceEditor(startMic = false) {
    const r = round();
    const dialogText = M.draft(r).transcript || "";
    const firstRule = M.ruleFor(r,r.traits[0]);
    const firstExample = r.traits[0]+(r.template ? Math.round((firstRule.min+firstRule.max)/2) : "八")+"分";
    openModal("口述评分 · "+r.current,'<p class="help">每项说出性状名称和分数，可一次说多项。浏览器的语音服务可能联网处理声音。</p><label class="field">口述文本<textarea id="speech-text" maxlength="2000" rows="4" placeholder="例如：'+esc(firstExample)+'">'+esc(dialogText)+'</textarea></label><p class="issues" id="speech-feedback" role="status"></p><div class="group-actions"><button class="ghost" id="record-btn" data-action="record">'+icon("mic")+'开始录音</button><button class="action" data-action="parse">填入评分表</button></div>',startMic ? "#record-btn" : "#speech-text");
    if (startMic) startRecording();
  }
  function startRecording() {
    if (recognition) { recognition.stop(); return; }
    $("#voice-choices")?.remove();
    const field = $("#speech-text");
    const feedback = $("#speech-feedback");
    const prior = field.value.trim();
    const updateText = text => {
      if (recognition !== rec) return;
      field.value = [prior,text].filter(Boolean).join("，").slice(0,2000);
      M.draft(round()).transcript = field.value;
      persist();
    };
    let failed = false;
    const rec = TasterVoice.createRecognition({onResult:updateText,onError:msg=>{
      if(recognition !== rec) return;
      failed = true;
      feedback.textContent = msg;
    },onEnd:()=>{
      if(recognition !== rec) return;
      recognition = null; field.readOnly = false;
      $("#record-btn").innerHTML = icon("mic")+"继续录音";
      if (applyAfterRecording) {
        applyAfterRecording = false;
        if (!failed) { applyTranscript(); return; }
      }
      if(!failed) feedback.textContent = field.value.trim() ? "录音已结束，可编辑文本并填入评分表。" : "未收到语音，请重试或输入文字。";
    }});
    if(!rec) { feedback.textContent = "此浏览器未提供语音识别。可使用输入法的语音键口述，或直接输入文字。"; field.focus(); return; }
    recognition = rec;
    try {
      rec.start();
      field.readOnly = true;
      $("#record-btn").innerHTML = icon("stop")+"结束录音";
      feedback.textContent = "正在聆听，请口述各项分数…";
    } catch {
      stopRecognition(); field.readOnly = false;
      feedback.textContent = "麦克风启动失败。请检查麦克风权限，也可以手动输入文字。";
    }
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
        if (recognition || source !== field.value.normalize("NFKC").trim()) { group.remove(); return; }
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
    if (recognition) {
      applyAfterRecording = true;
      $("#speech-feedback").textContent = "正在取得本次录音的最终转写…";
      recognition.stop();
      return;
    }
    const r = round(), text = $("#speech-text").value.trim();
    $("#voice-choices")?.remove();
    const parsed = TasterVoice.parse(text,r.traits,r.template?.traits);
    if (parsed.suggestions?.length) {
      askAboutWord($("#speech-text"),parsed.suggestions[0]);
      return;
    }
    if (parsed.issues.length || !Object.keys(parsed.scores).length) {
      $("#speech-feedback").textContent = parsed.issues.join("\n") || "请说出或输入性状名称和分数。";
      return;
    }
    const d = M.draft(r);
    Object.assign(d.scores,parsed.scores);
    delete d.transcript;
    const missing = r.traits.filter(t => !M.valid(d.scores[t],M.ruleFor(r,t)));
    persist(); dialog.close(); render();
    notify(missing.length ? "还差"+missing.join("、")+"，可继续口述或点选。" : "评分已填齐，请核对后确认。");
  }
  function templateEditor(initial, formDraft = {}) {
    const seed = formDraft.traits?.trim()
      ? { traits:formDraft.traits.split(/[、,，]/).map(s=>s.trim()).filter(Boolean) }
      : round();
    try {
      TasterTemplates.open({
        round:seed, openModal, initial,
        onUse:template=>newRoundForm(TasterTemplates.validate(template),formDraft)
      });
    } catch(e) { notify(e.message); }
  }
  function newRoundForm(template, formDraft = {}) {
    const ruleField = template
      ? '<div class="share-purpose"><strong>'+esc(template.foodType)+' · '+esc(template.version)+'</strong><p>'+template.traits.map(rule=>esc(rule.name)+' '+rule.min+'–'+rule.max).join('、')+'</p></div>'
      : '<label class="field">评价性状<input name="traits" required maxlength="250" value="'+esc(formDraft.traits ?? M.traits.join("、"))+'"><small>用顿号或逗号分隔，最多 12 项，每项按 1–10 分评价。</small></label>';
    openModal("新建盲评场次",'<form id="new-form"><button type="button" class="ghost" data-action="templates">'+(template?'修改模板副本':'使用共享模板')+'</button><label class="field">场次名称<input name="title" value="'+esc(formDraft.title ?? (template ? template.foodType+'盲评' : ''))+'" placeholder="例如：冬小麦饼干第一轮" maxlength="60" required></label><label class="field">品种名称<textarea name="names" rows="4" required maxlength="10000" placeholder="每行一个品种">'+esc(formDraft.names || '')+'</textarea><small>输入 1–200 个品种。创建后会随机分配盲码，请按对照表为实物贴签。</small></label>'+ruleField+'<p id="form-feedback" class="issues" role="status"></p><div class="group-actions"><button class="action">创建场次</button></div></form>',"input");
    $("#new-form").tastingTemplate = template;
  }
  function createRound(form) {
    const data = new FormData(form), title = data.get("title").trim();
    const names = data.get("names").split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
    const template = form.tastingTemplate;
    const dimensions = template ? template.traits.map(rule=>rule.name) : data.get("traits").split(/[、,，]/).map(s=>s.trim()).filter(Boolean);
    if (!title || !names.length || names.length>200 || names.some(x=>x.length>80) || !dimensions.length || dimensions.length>12 || dimensions.some(s=>s.length>20 || s in Object.prototype) || new Set(dimensions).size!==dimensions.length) {
      $("#form-feedback").textContent = "请填写场次名称、1–200 行品种（每行最多 80 字），以及 1–12 个不同性状（每项最多 20 字）。"; return;
    }
    const r = M.makeRound({ title, names, dimensions, template, rater:template ? "评价员 01" : round().rater });
    state.rounds.push(r); state.active = r.id;
    persist(); dialog.close(); navigate("settings"); notify("新场次已创建，可查看盲码对照表为实物贴签。");
  }
  function showMapping() {
    const r = round();
    openModal("组织者盲码对照表",'<p class="help">请按此表为实体样品贴签，完成后关闭对照表再交给评价员。</p><div class="table-wrap"><table><thead><tr><th>样品盲码</th><th>小麦品种</th></tr></thead><tbody>'+r.samples.map((s,i)=>'<tr><td>'+esc(s.code)+'</td><td><input aria-label="'+esc(s.code)+' 对应品种" data-mapping="'+i+'" maxlength="80" value="'+esc(s.name)+'" placeholder="填写实际品种"></td></tr>').join("")+'</tbody></table></div><div class="group-actions"><button class="action" data-action="save-map">保存对照表</button></div>');
  }
  function exportOptions() {
    const r = round();
    if (!r.records.length) { openModal("导出 Excel",'<p class="help">当前场次还没有已确认的评分。完成一份样品并确认后，即可导出评价记录。</p><div class="group-actions"><button class="action" data-action="home">返回工作台</button></div>'); return; }
    openModal("导出 Excel",'<p class="help">将「'+esc(r.title)+'」的 '+r.records.length+' 条已确认评价导出为 .xlsx 文件，保留各评价员的原始分数和备注。</p><label class="checkline"><input type="checkbox" id="export-names">包含真实品种名称（揭盲）</label><div class="group-actions"><button class="action" data-action="download">'+icon("download")+'下载 Excel</button></div>');
  }
  function download() {
    const r = round(), withNames = $("#export-names").checked;
    try {
      const bytes = TasterExport.build({...r,samples:r.samples.map(s=>({...s,name:withNames?s.name:""}))});
      const url = URL.createObjectURL(new Blob([bytes],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}));
      const a = document.createElement("a"); a.href = url;
      a.download = r.title.replace(/[<>:"/\\|?*\u0000-\u001f]/g,"_")+"_"+(withNames?"揭盲":"盲评")+"_"+new Date().toISOString().slice(0,10)+".xlsx";
      document.body.append(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),60000);
      dialog.close(); notify("已生成 Excel 文件。");
    } catch (err) { notify("导出失败："+err.message); }
  }
  document.addEventListener("click",event=>{
    const b = event.target.closest("button");
    if (!b) return;
    if (b.dataset.view) { navigate(b.dataset.view); return; }
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
    if (b.id==="export") { exportOptions(); return; }
    switch (b.dataset.action) {
      case "home": navigate("workspace"); break;
      case "samples": openSamples(); break;
      case "text": voiceEditor(); break;
      case "mic": voiceEditor(true); break;
      case "record": startRecording(); break;
      case "parse": applyTranscript(); break;
      case "close": dialog.close(); break;
      case "note": showNote=true; render(); $("#note").focus(); break;
      case "confirm": {
        if (M.draft(r).transcript?.trim()) { voiceEditor(); $("#speech-feedback").textContent="还有待核对的口述文本。请先填入评分表，或清空文本后手动评分。"; break; }
        try {
          const {record,done} = M.confirmScore(r); showNote=false; const saved=persist();
          if (done) navigate("records"); else render();
          notify(record.code+" 已确认"+(done?"，本轮品鉴完成。":"，下一份是 "+r.current+"。")+(saved?"":" 请及时导出。"));
        } catch (err) { notify(err.message); }
        break;
      }
      case "new-round": newRoundForm(); break;
      case "templates": {
        const form = $("#new-form");
        templateEditor(form?.tastingTemplate, form ? Object.fromEntries(new FormData(form)) : {});
        break;
      }
      case "share-data": sharing.ownerRound(r); break;
      case "mapping": showMapping(); break;
      case "save-map":
        dialog.querySelectorAll("[data-mapping]").forEach(input=>r.samples[Number(input.dataset.mapping)].name=input.value.trim());
        persist(); dialog.close(); notify("对照表已更新。"); break;
      case "download": download(); break;
    }
  });
  document.addEventListener("submit",event=>{
    event.preventDefault();
    if(event.target.id==="new-form") createRound(event.target);
    if(event.target.id==="rater-form") {
      const name=new FormData(event.target).get("rater").trim();
      if(!name){notify("请输入评价员姓名或代号。"); return;}
      const r=round(); r.rater=name; r.current=r.samples.find(s=>!M.findRecord(r,s.code))?.code || r.samples[0].code;
      persist(); render(); notify("已切换至"+name+"。");
    }
  });
  document.addEventListener("input",event=>{
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
    if(event.target.id==="round-select") { state.active=event.target.value; showNote=false; persist(); render(); }
  });
  function route() {
    const hash=location.hash;
    if(hash.startsWith("#template=") || /^#(data|request|decision)=/.test(hash)) {
      stopRecognition();
      page=hash.startsWith("#template=") ? "settings" : "records";
      render();
      if(page==="records") { sharing.fromHash(hash); return; }
      try { templateEditor(TasterTemplates.readLink(hash)); }
      catch(e) { openModal("模板无法打开",'<p class="issues">'+esc(e.message)+'</p>'); }
      return;
    }
    const next=knownPages.includes(hash.slice(1)) ? hash.slice(1) : "workspace";
    if(next!==page || dialog.open) navigate(next); else render();
  }
  window.addEventListener("hashchange",route);
  persist(); route();
})();
