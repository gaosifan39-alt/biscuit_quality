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

  const preference = ["总体喜好", "非常不喜欢", "非常喜欢", "品尝后按个人喜好评分。"];
  const scale = ([name,low,high,instructions]) => ({name,min:1,max:10,low,high,instructions});
  const foodExamples = [
    {
      foodType:"馒头",
      keywords:"小麦品质、小麦馒头、白馒头、蒸制面食、蒸制品",
      instructions:"将各样品切成厚度接近的片。先看切面，再按相同温度试吃。",
      traits:[
        ["色泽","瓤色很浅","瓤色很深","对准切面，在同一光线下比较颜色深浅。"],
        ["麦香","几乎闻不到麦香","麦香很浓","掰开后闻内瓤的麦香。"],
        ["柔软度","入口明显偏硬","入口非常柔软","比较第一口咬开时的用力大小。"],
        ["回弹性","轻按后几乎不回弹","轻按后回弹明显","用相近力度轻按切面，松手后观察。"],
        ["粘牙度","几乎不粘牙","明显粘牙","咀嚼后再判断牙齿上是否黏附馒头。"]
      ]
    },
    {
      foodType:"吐司面包",
      keywords:"小麦品质、吐司、切片面包、烘焙、面包品鉴",
      instructions:"取厚度相近的面包片。观察外皮，评价口感时取中部内瓤。",
      traits:[
        ["外皮色泽","外皮颜色很浅","外皮颜色很深","在同一光线下观察外皮，按颜色深浅评分。"],
        ["烘烤香气","几乎闻不到烘烤香","烘烤香很浓","靠近外皮闻香，按强弱评分。"],
        ["松软度","内瓤偏硬","内瓤非常松软","咬一口内瓤，感受压下去所需的力。"],
        ["细腻度","内瓤口感粗糙","内瓤口感细腻","轻嚼内瓤，比较颗粒和粗糙感。"],
        ["湿润度","内瓤明显干燥","内瓤明显湿润","比较咀嚼时内瓤的干湿感。"]
      ]
    },
    {
      foodType:"米饭",
      keywords:"稻米品质、大米、稻谷、蒸米饭、籼米、粳米",
      instructions:"用相同盛样量和接近的试吃温度比较；比较品种时记录煮饭用水比例。",
      traits:[
        ["光泽","米粒表面暗哑","米粒表面很有光泽","在同一光线下观察米粒表面的反光。"],
        ["米香","几乎闻不到米香","米香很浓","取样后先闻香，再入口。"],
        ["硬度","米粒很软","米粒很硬","用相近分量，比较第一口咬压时的阻力。"],
        ["粘连度","米粒容易分开","米粒明显黏成团","用勺轻拨，观察米粒之间的黏连。"],
        ["湿润度","咀嚼时明显偏干","咀嚼时明显湿润","比较咀嚼时口中的干湿感。"]
      ]
    },
    {
      foodType:"鲜湿米粉",
      keywords:"米粉、米线、鲜米粉、稻米、米制面条、米制品",
      instructions:"用一致的煮制与沥水流程对比；试吃时不加汤料，尽量用相同温度。",
      traits:[
        ["完整度","粉条碎断很多","粉条基本完整","沥水后挑起同等分量，观察断条。"],
        ["米香","几乎闻不到米香","米香很浓","盛出后闻香，避免把调料气味计入。"],
        ["弹性","咬下去几乎没有回弹","咬下去回弹明显","取单根或相同根数试咬。"],
        ["顺滑度","入口明显粗涩","入口非常顺滑","用舌面轻触粉条，比较表面口感。"],
        ["粘牙度","几乎不粘牙","明显粘牙","咀嚼后判断牙齿上的黏附程度。"]
      ]
    },
    {
      foodType:"米饼",
      keywords:"大米饼干、米制品、膨化食品、米饼品质、脆米饼",
      instructions:"取大小接近的样块，记录开封后等待时间。用相同部位试咬。",
      traits:[
        ["米香","几乎闻不到米香","米香很浓","掰开样块，在接近的距离闻香。"],
        ["酥脆度","咬下去偏韧或发软","咬下去明显酥脆","感受第一口的破裂感。"],
        ["膨松度","断面很紧实","断面很疏松","掰开后观察断面和孔洞。"],
        ["油腻感","口中几乎没有油膜感","口中油膜感很明显","咽下后感受口腔中的油膜。"],
        ["粘牙度","几乎不粘牙","明显粘牙","咀嚼后比较碎屑黏附牙齿的程度。"]
      ]
    },
    {
      foodType:"鲜食玉米",
      keywords:"甜玉米、糯玉米、甜糯玉米、鲜食玉米品质、玉米品鉴",
      instructions:"采用同样的蒸煮方式，取穗中部籽粒，在相近温度下比较。",
      traits:[
        ["色泽","籽粒颜色很浅","籽粒颜色很深","在相同光线下看籽粒，记录颜色深浅。"],
        ["玉米香","几乎闻不到玉米香","玉米香很浓","盛出后先闻香。"],
        ["甜度","几乎没有甜味","甜味很强","用相近分量咀嚼，按甜味强度评分。"],
        ["外皮韧性","外皮很容易咬破","外皮明显难咬破","感受第一口咬破籽粒外皮的阻力。"],
        ["多汁度","咬开后几乎没有汁水","咬开后汁水很多","比较籽粒咬开时释放汁水的多少。"]
      ]
    },
    {
      foodType:"蒸红薯",
      keywords:"红薯、甘薯、地瓜、番薯、蒸薯、薯类",
      instructions:"用相同蒸制方式；去皮后取中部薯肉，在接近的温度下比较。",
      traits:[
        ["瓤色","薯肉颜色很浅","薯肉颜色很深","观察中部切面，在同一光线下比较。"],
        ["薯香","几乎闻不到薯香","薯香很浓","切开后闻薯肉香气。"],
        ["甜度","几乎没有甜味","甜味很强","咀嚼薯肉后按甜味强度评分。"],
        ["湿润度","薯肉明显偏干","薯肉明显湿润","比较咀嚼时薯肉的干湿感。"],
        ["纤维感","几乎感觉不到纤维","纤维很明显","咀嚼后判断是否留有丝状纤维。"]
      ]
    },
    {
      foodType:"苹果",
      keywords:"水果、鲜果、苹果品质、苹果品鉴、果肉口感",
      instructions:"样品统一带皮或去皮，切成大小接近的果块。尽量缩短切块到试吃的间隔。",
      traits:[
        ["果香","几乎闻不到果香","果香很浓","切开后闻果肉香气。"],
        ["甜度","几乎没有甜味","甜味很强","按尝到的甜味强度评分。"],
        ["酸度","几乎没有酸味","酸味很强","按尝到的酸味强度评分。"],
        ["脆度","果肉偏绵软","果肉明显清脆","比较第一口咬断果肉时的脆裂感。"],
        ["多汁度","咬下去汁水很少","咬下去汁水很多","比较咀嚼时果肉放出的汁水。"]
      ]
    },
    {
      foodType:"豆浆",
      keywords:"黄豆、大豆、豆乳、豆奶、豆制品、植物饮品",
      instructions:"取相同容量，在相近温度下试饮。甜度按实际甜味强度评分。",
      traits:[
        ["豆香","几乎闻不到豆香","豆香很浓","端杯闻香，判断熟豆香气的强度。"],
        ["豆腥味","几乎感受不到豆腥味","豆腥味很明显","入口后单独判断豆腥味强度。"],
        ["甜度","几乎没有甜味","甜味很强","比较入口后感受到的甜味。"],
        ["稠度","入口很稀薄","入口明显浓稠","取一小口，比较在舌面流动的快慢。"],
        ["颗粒感","几乎感觉不到细颗粒","明显感到细颗粒","用舌面感受豆浆中的细颗粒。"]
      ]
    },
    {
      foodType:"原味酸奶",
      keywords:"酸奶、发酵乳、乳制品、原味乳制品、酸奶品鉴",
      instructions:"用相同大小的勺取样，在相近温度下品尝；同一批比较时保持搅拌方式一致。",
      traits:[
        ["奶香","几乎闻不到奶香","奶香很浓","入口前比较乳香的强弱。"],
        ["酸度","几乎没有酸味","酸味很强","按尝到的酸味强度评分。"],
        ["甜度","几乎没有甜味","甜味很强","与酸味分开，按甜味强度评分。"],
        ["稠度","很容易流动","明显浓稠","观察勺面流动，并比较入口的厚薄感。"],
        ["细腻度","口感明显粗糙或有颗粒","口感均匀细腻","感受酸奶在舌面上的均匀程度。"]
      ]
    }
  ];

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
      ].map(scale)
    };
    const additional = foodExamples.map(example=>({
      ...example, version:"1.0", contributor:"小小品鉴家",
      traits:[...example.traits,preference].map(scale)
    }));
    return [{...biscuit, contributor:"小小品鉴家", keywords:"小麦品质、小麦饼干、饼干品质、烘焙"}, noodle, ...additional].map(validate);
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
      const large = url.length > 2048 ? "链接较长，可以下载 JSON 文件发送。" : "接收方可打开链接，或在「模板上传」导入文件。";
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

