(() => {
  "use strict";

  const limits = {foodType:60, instructions:500, contributor:60, version:24, name:20, low:100, high:100, keywords:160};
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
    const keywords = clean(input.keywords, "keywords", "搜索关键词", false);
    return {
      foodType:clean(input.foodType, "foodType", "食品类别"),
      instructions:clean(input.instructions, "instructions", "评价总说明", false),
      contributor:clean(input.contributor, "contributor", "贡献者", false),
      version:clean(input.version, "version", "版本"),
      ...(keywords ? {keywords} : {}),
      traits
    };
  }

  function fromRound(round) {
    if (round.template) return validate(round.template);
    // A new-round form passes only its list of names. Saved rounds retain
    // their original rules, including the older satisfaction-based color scale.
    if (!round.id) {
      const preset = globalThis.TasterModel?.defaultTemplateFor(round.traits);
      if (preset) return validate(preset);
    }
    return validate({
      foodType:"小麦饼干", instructions:"", contributor:"", version:"1.0",
      traits:round.traits.map(name => {
        const [low,high] = Object.hasOwn(biscuitEnds, name) ? biscuitEnds[name] : ["程度低","程度高"];
        return {name, min:1, max:10, low, high, instructions:""};
      })
    });
  }

  function presets() {
    const biscuit = globalThis.TasterModel.defaultTemplateFor(globalThis.TasterModel.traits);
    const noodle = {
      foodType: "刀削面", version: "1.0", contributor: "小小品鉴家", keywords:"刀削面品质、面条、面制品、小麦品质",
      instructions: "各样品尽量用相同的煮制时间和试吃温度。每项按 1–10 分评，最后一项记录总体喜好。",
      traits: [
        ["色泽", "面片颜色很浅", "面片颜色很深", "在相同光线下观察刚煮好的面片。"],
        ["香气", "几乎闻不到香气", "香气非常浓", "盛出后先闻香气。"],
        ["筋道度", "面片松软易断", "咬起来有明显弹性", "感受咬下去后的韧性和回弹。"],
        ["顺滑度", "入口明显粗涩", "入口非常顺滑", "感受面片在口中的滑润程度。"],
        ["粘牙度", "几乎不粘牙", "明显粘牙", "咀嚼后感受面片黏附牙齿的程度。"],
        ["总体喜好", "非常不喜欢", "非常喜欢", "按个人喜好评分。"]
      ].map(([name, low, high, instructions]) => ({ name, min: 1, max: 10, low, high, instructions }))
    };
    return [validate({...biscuit, contributor:"小小品鉴家", keywords:"小麦品质、小麦饼干、饼干品质、烘焙"}), validate(noodle)];
  }

  function matches(template, query) {
    const words = query.normalize("NFKC").toLowerCase().trim().split(/[\s,，、]+/u).filter(Boolean);
    const content = [template.foodType,template.keywords,template.contributor,template.instructions,...template.traits.map(trait=>trait.name)]
      .join("\n").normalize("NFKC").toLowerCase();
    return words.every(word => content.includes(word));
  }

  const columns = ["食品类别","模板版本","贡献者","搜索关键词","评价总说明","性状名称","最低分","最高分","最低分含义","最高分含义","评价说明"];

  function exampleCSV() {
    const sample = presets()[0];
    const quote = cell => '"'+String(cell).replaceAll('"','""')+'"';
    const rows = sample.traits.map((trait,i) => [
      ...(i===0 ? [sample.foodType,sample.version,"",sample.keywords,sample.instructions] : ["","","","",""]),
      trait.name,trait.min,trait.max,trait.low,trait.high,trait.instructions
    ]);
    return "\uFEFF"+[columns,...rows].map(row=>row.map(quote).join(",")).join("\r\n")+"\r\n";
  }

  function csvRows(content) {
    const rows = [];
    let row = [], cell = "", quoted = false, afterQuote = false;
    const finishCell = () => { row.push(cell); cell = ""; afterQuote = false; };
    const finishRow = () => {
      finishCell();
      if (row.some(value => value.trim())) rows.push(row);
      row = [];
    };
    const input = content.replace(/^\uFEFF/u,"");
    for (let index=0; index<input.length; index++) {
      const char = input[index];
      if (quoted) {
        if (char !== '"') cell += char;
        else if (input[index+1] === '"') { cell += '"'; index++; }
        else { quoted = false; afterQuote = true; }
      } else if (char === ",") {
        finishCell();
      } else if (char === "\n" || char === "\r") {
        finishRow();
        if (char === "\r" && input[index+1] === "\n") index++;
      } else if (char === '"' && !cell && !afterQuote) {
        quoted = true;
      } else if (afterQuote || char === '"') {
        problem("CSV 有一处引号格式不正确，请用 Excel 另存为 CSV UTF-8 后重试。");
      } else {
        cell += char;
      }
    }
    if (quoted) problem("CSV 有一处引号没有闭合，请用 Excel 重新保存文件。");
    finishRow();
    return rows;
  }

  function parseCSV(content) {
    const [head = [],...rows] = csvRows(content);
    if (head.length !== columns.length || !columns.every((name,i)=>head[i].trim()===name))
      problem("CSV 列名与示例表不一致。请在下载的示例表上修改，保留第一行列名。");
    if (!rows.length) problem("请在示例表中至少填写一项性状。");
    const [foodType,version,contributor,keywords,instructions] = rows[0];
    const asScore = value => /^[+-]?\d+$/u.test(value.trim()) ? Number(value) : NaN;
    return validate({
      foodType,version,contributor,keywords,instructions,
      traits:rows.map((row,index)=>{
        if (row.length !== columns.length) problem("第 "+(index+2)+" 行的列数与示例表不一致。");
        const [name,min,max,low,high,notes] = row.slice(5);
        return {name,min:asScore(min),max:asScore(max),low,high,instructions:notes};
      })
    });
  }

  async function readTemplateFile(file) {
    if (file.size > maxFileSize) problem("文件超过 64 KB，请选用示例表格或模板 JSON。");
    if (!/\.csv$/iu.test(file.name)) return parseJSON(await file.text());
    const bytes = await file.arrayBuffer();
    let decoded;
    try { decoded = new TextDecoder("utf-8",{fatal:true}).decode(bytes); }
    catch { decoded = new TextDecoder("gb18030").decode(bytes); }
    return parseCSV(decoded);
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

  function open({round, openModal, onUse, onSave, initial, mode}) {
    let design = initial ? validate(initial) : round ? fromRound(round) : {
      foodType: "", instructions: "", contributor: "", keywords: "", version: "1.0",
      traits: [{name:"",min:1,max:10,low:"",high:"",instructions:""}]
    };
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
        field("搜索关键词（选填）","keywords",design.keywords)+
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
          if (action === "import") importer(true);
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
    function importer(fromEditor = false) {
      const own = show("导入评价模板",
        '<p class="help">用 Excel 打开示例表。保留列名，在第一条性状所在行填写食品信息，改完另存为 CSV UTF-8 后上传。</p>'+
        '<label class="tt-field">上传 CSV 或 JSON<input type="file" accept=".csv,text/csv,.json,application/json" data-import-file></label>'+
        '<div class="tt-actions">'+(fromEditor?button("back","返回编辑"):"")+button("example","下载示例表格 CSV","action")+'</div>'+feedback);
      own.querySelector("[data-import-file]").addEventListener("change", async event => {
        const file = event.target.files[0];
        if (!file) return;
        try {
          const template = await readTemplateFile(file);
          if (!own.closest("dialog[open]")) return;
          design = template;
          preview();
        } catch (error) { if (own.closest("dialog[open]")) report(error.message); }
        event.target.value = "";
      });
      own.addEventListener("click", event => {
        const action = event.target.closest("[data-tt]")?.dataset.tt;
        if (action==="back") return edit();
        if (action==="example") {
          const url = URL.createObjectURL(new Blob([exampleCSV()],{type:"text/csv;charset=utf-8"}));
          const a = document.createElement("a");
          a.href = url;
          a.download = "小小品鉴家-评价模板示例.csv";
          a.click();
          setTimeout(()=>URL.revokeObjectURL(url),30000);
        }
      });
    }
    function preview() {
      const content = '<div class="tt-identity"><h3>'+escape(design.foodType)+'</h3><p>版本 '+escape(design.version)+' · '+(design.contributor ? '贡献者 '+escape(design.contributor) : '未署名')+'</p></div>'+
        (design.keywords?'<p class="tt-instructions">关键词 · '+escape(design.keywords)+'</p>':'')+
        (design.instructions?'<p class="tt-instructions">'+escape(design.instructions)+'</p>':'')+
        '<dl class="tt-rules">'+design.traits.map(t => '<div><dt>'+escape(t.name)+'</dt><dd><b>'+t.min+' 分</b> '+escape(t.low)+'<br><b>'+t.max+' 分</b> '+escape(t.high)+
          (t.instructions?'<p>'+escape(t.instructions)+'</p>':'')+'</dd></div>').join('')+'</dl>'+
        '<p class="help">发布时，以上食品类别、署名、版本和评价规则会写入分享链接与文件。接收方可修改副本并自行开场。</p>'+
        '<div class="tt-actions">'+button("edit","修改模板副本")+button("use","使用模板新建场次","action")+'</div>'+
        '<div class="tt-share">'+(onSave ? button("save","保存到本机模板") : "")+button("publish","生成模板分享链接")+'</div>'+feedback;
      show("模板预览", content).addEventListener("click", event => {
        const action = event.target.closest("[data-tt]")?.dataset.tt;
        try {
          if (action==="edit") return edit();
          if (action==="use") return onUse(validate(design));
          if (action==="save") return report(onSave(validate(design)));
          if (action==="publish") published();
        } catch (error) { report(error.message); }
      });
    }
    function published() {
      const url = shareLink(design, location.href);
      const title = escape(design.foodType) + " · " + escape(design.version);
      const large = url.length > 2048 ? "链接较长，可以下载 JSON 文件发送。" : "接收方可打开链接，或在「模板与共享」导入文件。";
      const content = '<div class="tt-identity"><h3>'+title+'</h3><p>'+design.traits.length+' 项评价性状</p></div>'+
        '<label class="tt-field">分享链接<textarea rows="2" readonly data-copy-link>'+escape(url)+'</textarea></label>'+
        '<p class="help">'+large+'</p><div class="tt-actions">'+button("copy","复制分享链接","action")+button("file","下载模板 JSON")+'</div>'+
        '<div class="tt-share">'+button("back","查看模板预览")+button("use","使用模板新建场次")+'</div>'+feedback;
      show("模板分享",content).addEventListener("click", async event => {
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
    if (mode === "import") importer();
    else if (mode === "edit") edit();
    else if (initial) preview();
    else edit();
  }

  globalThis.TasterTemplates = {validate, fromRound, presets, matches, exampleCSV, parseCSV, readLink, shareLink, fromURL, open};
})();

