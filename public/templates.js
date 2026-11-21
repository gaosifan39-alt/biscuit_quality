(() => {
  "use strict";

  const limits = {foodType:60, instructions:500, contributor:60, version:24, name:20, low:100, high:100};
  const maxFileSize = 65536;
  const maxHashSize = 180000;
  const biscuitEnds = {
    "色泽":["色泽很不满意","色泽很满意"],
    "裂纹":["裂纹不明显","裂纹很明显"],
    "酥脆度":["很不酥脆","非常酥脆"],
    "粘牙度":["不粘牙","非常粘牙"],
    "风味":["风味很不满意","风味很满意"]
  };
  const problem = message => { throw new Error(message); };
  function clean(value, key, title, required = true) {
    if (value == null && !required) return "";
    if (typeof value !== "string") problem("请填写" + title + "。");
    const trimmed = value.trim();
    if (required && !trimmed) problem("请填写" + title + "。");
    if (trimmed.length > limits[key]) problem(title + "最多 " + limits[key] + " 个字符。");
    if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(trimmed)) problem(title + "含有不可显示的字符。");
    return trimmed;
  }

  function validate(input) {
    if (!input || typeof input !== "object" || Array.isArray(input)) problem("模板内容应为 JSON 对象。");
    if (!Array.isArray(input.traits) || input.traits.length < 1 || input.traits.length > 12) problem("请设置 1–12 个评价性状。");
    const names = new Set();
    const traits = input.traits.map((trait, i) => {
      const position = "第 " + (i+1) + " 项";
      if (!trait || typeof trait !== "object" || Array.isArray(trait)) problem(position + "的性状格式不正确。");
      const name = clean(trait.name, "name", position + "的性状名称");
      const spokenName = name.normalize("NFKC").trim();
      if (!spokenName || spokenName in Object.prototype || spokenName === "prototype")
        problem("请更换性状名称“" + name + "”。");
      if (names.has(spokenName)) problem("性状“" + name + "”重复，请使用不同名称。");
      names.add(spokenName);
      const {min, max} = trait;
      if (!Number.isInteger(min) || !Number.isInteger(max) || min < -100 || max > 1000 || min >= max)
        problem("“" + name + "”的下限和上限须为 −100 至 1000 的整数，且下限小于上限。");
      return {name, min, max,
        low:clean(trait.low, "low", "“" + name + "”的最低分含义"),
        high:clean(trait.high, "high", "“" + name + "”的最高分含义"),
        instructions:clean(trait.instructions, "instructions", "“" + name + "”的评价说明", false)
      };
    });
    return {
      foodType:clean(input.foodType, "foodType", "食品类别"),
      instructions:clean(input.instructions, "instructions", "评价总说明", false),
      contributor:clean(input.contributor, "contributor", "贡献者", false),
      version:clean(input.version, "version", "版本"),
      traits
    };
  }

  function fromRound(round) {
    if (round.template) return validate(round.template);
    return validate({
      foodType:"小麦饼干", instructions:"", contributor:"", version:"1.0",
      traits:round.traits.map(name => {
        const [low,high] = Object.hasOwn(biscuitEnds, name) ? biscuitEnds[name] : ["程度低","程度高"];
        return {name, min:1, max:10, low, high, instructions:""};
      })
    });
  }

  function parseJSON(text) {
    let input;
    try { input = JSON.parse(text); }
    catch { problem("模板内容不是有效的 JSON。请重新选择文件或复制完整链接。"); }
    return validate(input);
  }
  function readLink(hash) {
    if (typeof hash !== "string" || !hash.startsWith("#template=")) return null;
    if (hash.length > maxHashSize) problem("模板链接过长，请使用模板文件。");
    let decoded;
    try {
      const payload = hash.slice(10);
      if (payload.startsWith("v1.")) {
        const data = payload.slice(3);
        if (!/^[\w-]+$/.test(data)) throw Error();
        const binary = atob(data.replace(/-/g,"+").replace(/_/g,"/"));
        decoded = new TextDecoder("utf-8", {fatal:true}).decode(Uint8Array.from(binary, char => char.charCodeAt(0)));
      } else {
        decoded = decodeURIComponent(payload);
      }
    }
    catch { problem("模板链接编码不完整，请重新复制完整链接。"); }
    return parseJSON(decoded);
  }
  function fromURL(text, base) {
    let url;
    try { url = new URL(text.trim()); } catch { problem("请粘贴完整的模板链接。"); }
    if (url.origin !== new URL(base).origin || !["http:", "https:"].includes(url.protocol) || url.username || url.password)
      problem("请使用本网站生成的模板链接。");
    return readLink(url.hash) || problem("链接中缺少模板，请复制分享页的完整链接。");
  }
  function shareLink(template, base) {
    const url = new URL(base);
    url.username = "";
    url.password = "";
    url.search = "";
    const bytes = new TextEncoder().encode(JSON.stringify(validate(template)));
    const binary = Array.from(bytes, byte => String.fromCharCode(byte)).join("");
    url.hash = "template=v1." + btoa(binary).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/, "");
    if (url.hash.length > maxHashSize) problem("模板较长，请下载 JSON 文件分享。");
    return url.href;
  }

  const escape = text => String(text ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
  const field = (label, key, value, type="text") => {
    const attr = ' data-key="' + key + '"';
    let control;
    if (type === "textarea") control = '<textarea rows="2"' + attr + ' maxlength="'+limits[key]+'">'+escape(value)+'</textarea>';
    else if (type === "number") control = '<input type="number" min="-100" max="1000" step="1" inputmode="text"'+attr+' value="'+escape(value)+'">';
    else control = '<input type="text"'+attr+' maxlength="'+limits[key]+'" value="'+escape(value)+'">';
    return '<label class="tt-field">'+label+control+'</label>';
  };
  const button = (id, title, style="ghost") => '<button type="button" class="'+style+'" data-tt="'+id+'">'+title+'</button>';
  const feedback = '<p class="tt-feedback" aria-live="polite" role="status"></p>';

  function traitForm(trait, index, opened) {
    return '<details class="tt-trait" data-index="'+index+'"'+(opened ? ' open' : '')+'><summary><span>'+escape(trait.name || "新性状")+'</span><small>'+escape(trait.min)+' 至 '+escape(trait.max)+' 分</small></summary><div class="tt-details">'+
      field("性状名称","name",trait.name)+'<div class="tt-pair">'+field("最低分","min",trait.min,"number")+field("最高分","max",trait.max,"number")+'</div>'+
      '<div class="tt-pair">'+field("最低分含义","low",trait.low)+field("最高分含义","high",trait.high)+'</div>'+
      field("该项评价说明（选填）","instructions",trait.instructions,"textarea")+
      '<button type="button" class="tt-remove" data-tt="remove">移除此项</button></div></details>';
  }

  function open({round, openModal, onUse, initial}) {
    let design = initial ? validate(initial) : fromRound(round);
    let panel;

    function show(title, html) {
      openModal(title, '<div class="tt-panel">'+html+'</div>');
      panel = document.querySelector("dialog[open] .tt-panel") || document.querySelector(".tt-panel");
      const dialog = panel.closest("dialog");
      if (dialog) dialog.scrollTop = 0;
      return panel;
    }
    function report(message) {
      panel.querySelector(".tt-feedback").textContent = message;
    }
    function values(el) {
      const entry = {};
      el.querySelectorAll("[data-key]").forEach(input => {
        entry[input.dataset.key] = input.type === "number" ? input.valueAsNumber : input.value;
      });
      return entry;
    }
    function readDraft() {
      return {...values(panel.querySelector(".tt-meta")),
        traits:Array.from(panel.querySelectorAll(".tt-trait"), values)};
    }
    function edit(openIndex=0) {
      show("编辑评价模板",
        '<div class="tt-meta">'+field("食品类别","foodType",design.foodType)+
        '<div class="tt-pair">'+field("贡献者（选填）","contributor",design.contributor)+field("版本","version",design.version)+'</div>'+
        field("评价总说明（选填）","instructions",design.instructions,"textarea")+'</div>'+
        '<section><div class="tt-heading"><h3>评价性状</h3><span>'+design.traits.length+' / 12</span></div>'+
        design.traits.map((t,i)=>traitForm(t,i,i===openIndex)).join("")+
        '<button type="button" class="ghost tt-add" data-tt="add"'+(design.traits.length>=12?' disabled':'')+'>添加性状</button></section>'+
        feedback+'<div class="tt-actions">'+button("import","导入其他模板")+button("preview","预览模板","action")+'</div>');
      panel.addEventListener("click", event => {
        const action = event.target.closest("[data-tt]")?.dataset.tt;
        if (!action) return;
        design = readDraft();
        try {
          if (action === "preview") { design = validate(design); preview(); }
          if (action === "import") importer();
          if (action === "add" && design.traits.length<12) {
            design.traits.push({name:"",min:1,max:10,low:"",high:"",instructions:""});
            edit(design.traits.length-1);
            panel.querySelector(".tt-trait[open] input").focus();
          }
          if (action === "remove") {
            if (design.traits.length===1) return report("至少保留一个评价性状。");
            const index = Number(event.target.closest("[data-index]").dataset.index);
            design.traits.splice(index,1);
            edit(Math.min(index,design.traits.length-1));
          }
        } catch (error) { report(error.message); }
      });
    }
    function importer() {
      const own = show("导入评价模板",
        '<label class="tt-field">选择模板文件<input type="file" accept=".json,application/json" data-import-file></label>'+
        '<label class="tt-field">或粘贴分享链接<textarea rows="3" data-import-link placeholder="粘贴小小品鉴家的完整模板链接"></textarea></label>'+
        feedback+'<div class="tt-actions">'+button("back","返回编辑")+button("load","预览链接模板","action")+'</div>');
      own.querySelector("[data-import-file]").addEventListener("change", async event => {
        const file = event.target.files[0];
        if (!file) return;
        try {
          if (file.size > maxFileSize) problem("模板文件超过 64 KB，请选择导出的模板 JSON。");
          const template = parseJSON(await file.text());
          if (!own.closest("dialog[open]")) return;
          design = template;
          preview();
        } catch (error) { if (own.closest("dialog[open]")) report(error.message); }
        event.target.value = "";
      });
      own.addEventListener("click", event => {
        const action = event.target.closest("[data-tt]")?.dataset.tt;
        if (action==="back") return edit();
        if (action==="load") try {
          design = fromURL(own.querySelector("[data-import-link]").value, location.href);
          preview();
        } catch (error) { report(error.message); }
      });
    }
    function preview() {
      const content = '<div class="tt-identity"><h3>'+escape(design.foodType)+'</h3><p>版本 '+escape(design.version)+' · '+(design.contributor ? '贡献者 '+escape(design.contributor) : '未署名')+'</p></div>'+
        (design.instructions?'<p class="tt-instructions">'+escape(design.instructions)+'</p>':'')+
        '<dl class="tt-rules">'+design.traits.map(t => '<div><dt>'+escape(t.name)+'</dt><dd><b>'+t.min+' 分</b> '+escape(t.low)+'<br><b>'+t.max+' 分</b> '+escape(t.high)+
          (t.instructions?'<p>'+escape(t.instructions)+'</p>':'')+'</dd></div>').join('')+'</dl>'+
        '<p class="help">发布时，以上食品类别、署名、版本和评价规则会写入分享链接与文件。接收方可修改副本并自行开场。</p>'+
        '<div class="tt-actions">'+button("edit","修改模板副本")+button("use","使用模板新建场次","action")+'</div>'+
        '<div class="tt-share">'+button("publish","发布空模板")+'</div>'+feedback;
      show("模板预览", content).addEventListener("click", event => {
        const action = event.target.closest("[data-tt]")?.dataset.tt;
        try {
          if (action==="edit") return edit();
          if (action==="use") return onUse(validate(design));
          if (action==="publish") published();
        } catch (error) { report(error.message); }
      });
    }
    function published() {
      const url = shareLink(design, location.href);
      const title = escape(design.foodType) + " · " + escape(design.version);
      const large = url.length > 2048 ? "链接较长，建议下载 JSON 文件发送。" : "接收方可打开链接，或在「导入其他模板」中选择文件。";
      const content = '<div class="tt-identity"><h3>'+title+'</h3><p>'+design.traits.length+' 项评价性状</p></div>'+
        '<label class="tt-field">分享链接<textarea rows="2" readonly data-copy-link>'+escape(url)+'</textarea></label>'+
        '<p class="help">'+large+'</p><div class="tt-actions">'+button("copy","复制分享链接","action")+button("file","下载模板 JSON")+'</div>'+
        '<div class="tt-share">'+button("back","查看模板预览")+button("use","使用模板新建场次")+'</div>'+feedback;
      show("空模板已发布",content).addEventListener("click", async event => {
        const action = event.target.closest("[data-tt]")?.dataset.tt;
        try {
          if (action==="back") return preview();
          if (action==="use") return onUse(validate(design));
          if (action==="file") {
            const blob = new Blob([JSON.stringify(validate(design), null, 2)+"\n"], {type:"application/json;charset=utf-8"});
            const objectURL = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = objectURL;
            a.download = (design.foodType+"-"+design.version).replace(/[<>:"/\\|?*\x00-\x1F]/g,"_")+"-评价模板.json";
            a.click();
            setTimeout(()=>URL.revokeObjectURL(objectURL),30000);
            return report("已生成模板文件。");
          }
          if (action==="copy") {
            const own = panel;
            try {
              await navigator.clipboard.writeText(url);
              if (own.isConnected) report("已复制分享链接。");
            } catch {
              if (!own.isConnected) return;
              const textarea = own.querySelector("[data-copy-link]");
              textarea.focus(); textarea.select();
              report("请复制已选中的完整链接。");
            }
          }
        } catch (error) { report(error.message); }
      });
    }
    if (initial) preview(); else edit();
  }

  globalThis.TasterTemplates = {validate, fromRound, readLink, shareLink, fromURL, open};
})();

