(() => {
  "use strict";
  const S = globalThis.TasterShare;
  const prefix = "little-taster.share.v1/";
  const esc = x => String(x ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const key = (type, id) => prefix + type + "/" + id;
  const read = (type, id) => JSON.parse(localStorage.getItem(key(type, id)) || "null");
  function save(type, id, value) {
    try { localStorage.setItem(key(type, id), JSON.stringify(value)); }
    catch { throw Error("本机存储空间不足或不可用。请保留原设备上的记录，释放空间后重试。"); }
  }
  function entries(type) {
    const start = key(type, "");
    return Object.keys(localStorage).filter(k => k.startsWith(start)).map(k => read(type, k.slice(start.length)));
  }
  const button = (id, label, primary = false) => '<button type="button" class="'+(primary?"action":"ghost")+'" data-share="'+id+'">'+esc(label)+'</button>';
  const help = msg => '<p class="help">'+esc(msg)+'</p>';
  const actions = (...items) => '<div class="group-actions">'+items.join("")+'</div>';
  const wrapped = rows => '<div class="table-wrap share-table"><table>'+rows+'</table></div>';
  const cells = (tag,list) => "<tr>"+list.map(v=>"<"+tag+">"+esc(v)+"</"+tag+">").join("")+"</tr>";
  const label = (card, field) => S.fieldLabel(card,field);
  const extras = {variety:"真实品种名称",location:"田间位置",note:"品鉴备注（可能包含原话）",quote:"个人原话"};
  const hasText = value => typeof value==="string" && !!value.trim();
  const counts = c => esc(c.foodType || "食品")+" · "+c.sampleCount+" 份样品 · "+c.recordCount+" 条评价";
  const tags = list => '<div class="share-tags">'+list.map(v=>'<span>'+esc(v)+'</span>').join("")+'</div>';
  const shareUrl = (kind, obj) => location.origin+location.pathname+S.encode(kind,obj);
  const fileInput = '<label class="field">打开共享文件<input type="file" data-share-file accept=".json,application/json"></label>';
  function download(name, content) {
    const url=URL.createObjectURL(new Blob([content],{type:"application/json;charset=utf-8"}));
    const a=document.createElement("a"); a.href=url; a.download=name; document.body.append(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),30000);
  }
  function snapshotOf(r, extraFields) {
    return {id:crypto.randomUUID(), traits:[...r.traits], template:{foodType:r.template?.foodType || "小麦饼干"},
      extraFields, samples:r.samples.map(s=>({code:s.code,
        ...(extraFields.includes("variety") ? {name:s.name || ""} : {}),
        ...(extraFields.includes("location") ? {location:s.location || ""} : {})})),
      records:r.records.map(row=>({code:row.code,scores:Object.fromEntries(r.traits.map(t=>[t,row.scores[t]])),
        ...(extraFields.includes("note") ? {note:row.note || ""} : {}),
        ...(extraFields.includes("quote") ? {quote:row.quote || ""} : {})}))};
  }
  function create(openModal) {
    // Each screen owns its listeners. Replacing the modal discards all previous handlers.
    function screen(title,html,handlers = {}) {
      openModal(title,'<div class="share-body">'+html+'<p class="issues" role="status"></p></div>');
      const el=document.querySelector("#dialog .share-body");
      el.addEventListener("click",async event=>{
        const b=event.target.closest("button[data-share]");
        if(!b || !handlers[b.dataset.share] || el.dataset.busy) return;
        el.dataset.busy="true"; b.disabled=true;
        const err=el.querySelector(".issues"); err.textContent="";
        try { await handlers[b.dataset.share](el); }
        catch(e) { err.textContent=e.message || "操作失败，请重试。"; }
        finally { b.disabled=false; delete el.dataset.busy; }
      });
      el.querySelector("[data-share-file]")?.addEventListener("change",async event=>{
        try {
          const f=event.target.files[0];
          if(!f) return;
          if(f.size>3_000_000) throw Error("文件过大，请分场分享。");
          const data=JSON.parse(await f.text());
          if(data.format!=="little-taster-share-v1" || !["data","request","decision"].includes(data.kind)) throw Error("请选择本应用生成的数据卡、申请或回执 JSON 文件。");
          await receive(data.kind,data.value);
        } catch(e) { el.querySelector(".issues").textContent=e.message; }
        event.target.value="";
      });
      return el;
    }
    function showError(e) {
      screen("无法打开分享",help(e.message || "共享内容无效。")+fileInput);
    }
    function handoff(kind,obj,title,description) {
      const url=shareUrl(kind,obj);
      const long=url.length>8000;
      screen(title,help(description)+(long?help("此内容较长，请发送共享文件。接收者在网站「评价记录 → 分享本场数据」打开文件。"):
        '<label class="field">分享链接<textarea readonly rows="2">'+esc(url)+'</textarea></label>')+
        actions(...(long?[]:[button("copy","复制链接",true)]),button("file","下载共享文件",long)),{
        copy:async el=>{
          const field=el.querySelector("textarea");
          try { await navigator.clipboard.writeText(url); el.querySelector(".issues").textContent="链接已复制。"; }
          catch { field.focus(); field.select(); el.querySelector(".issues").textContent="请长按选中的链接复制。"; }
        },
        file:()=>download(title+".json",JSON.stringify({format:"little-taster-share-v1",kind,value:obj}))
      });
    }
    function description(c) {
      let result='<p class="share-counts">'+counts(c)+'</p>';
      if(c.mode==="metadata") return result+tags(c.availableFields.map(f=>label(c,f)))+help("这张卡仅公开数据规模和可申请的字段。");
      result+=wrapped('<thead>'+cells("th",["性状","有效评分","平均值"])+'</thead><tbody>'+
        c.stats.map(s=>cells("td",[s.trait,s.count,s.mean ?? "未展示"])).join("")+'</tbody>');
      return result+help("均值按本场全部已确认的评分计算。只有一条评分时，均值等于该条评分。");
    }
    function ownerRound(r) {
      let own, inbox;
      try {
        own=entries("owner").filter(v=>v.roundId===r.id).reverse();
        const ids=new Set(own.map(v=>v.card.id));
        inbox=entries("inbox").filter(v=>ids.has(v.request.cardId)).reverse();
      } catch(e) { showError(e); return; }
      const handlers={};
      const list=own.map((o,i)=>{
        handlers["card"+i]=()=>handoff("data",o.card,"数据分享卡","可将这份已发布的快照发给其他人。");
        return button("card"+i,(o.card.mode==="summary"?"汇总":"说明卡")+" · "+o.card.recordCount+" 条 · "+new Date(o.at).toLocaleString("zh-CN"));
      });
      const requests=inbox.map((x,i)=>{
        handlers["review"+i]=()=>reviewRequest(x.request);
        return button("review"+i,(x.decision?"已处理":"待审批")+" · "+x.request.purpose);
      });
      const extraFields = [
        ...(r.samples.some(s=>hasText(s.name)) ? ["variety"] : []),
        ...(r.samples.some(s=>hasText(s.location)) ? ["location"] : []),
        ...(r.records.some(x=>hasText(x.note)) ? ["note"] : []),
        ...(r.records.some(x=>hasText(x.quote)) ? ["quote"] : [])
      ];
      const extraOptions=extraFields.length ? '<details class="share-import" data-extra-controls hidden><summary>额外开放申请的字段（选填）</summary>'+help("只在说明卡上列出字段名称。实际内容仍需在收到申请后单独勾选并批准。")+
        extraFields.map(f=>'<label class="checkline"><input type="checkbox" name="extra" value="'+f+'">'+esc(extras[f])+'</label>').join("")+'</details>' : '';
      const choices=r.records.length?'<fieldset class="share-options"><legend>选择发布内容</legend>'+
        '<label><input type="radio" name="share-mode" value="private" checked>保持私有</label>'+
        '<label><input type="radio" name="share-mode" value="summary">公开汇总结果</label>'+
        '<label><input type="radio" name="share-mode" value="metadata">公开数据说明卡，接受申请</label></fieldset>'+extraOptions+actions(button("preview","预览发布内容",true)):
        help("确认至少一条评分后，可以发布本场的数据说明卡或汇总结果。");
      handlers.preview=async el=>{
        const mode=el.querySelector("[name=share-mode]:checked").value;
        if(mode==="private") { el.querySelector(".issues").textContent="本次没有发布数据。"; return; }
        const allowed=mode==="metadata" ? Array.from(el.querySelectorAll('[name=extra]:checked'),n=>n.value) : [];
        const snapshot=snapshotOf(r,allowed), keys=await S.ownerKeys(), card=await S.card(snapshot,mode,keys);
        screen("预览"+(mode==="metadata"?"数据说明卡":"汇总结果"),description(card)+
          help("发布的是一次快照。发出的链接或文件可被转发，之后无法收回。")+
          actions(button("back","返回"),button("publish","确认发布",true)),{
          back:()=>ownerRound(r),
          publish:()=>{
            save("owner",card.id,{roundId:r.id,keys,card,snapshot:mode==="metadata"?snapshot:null,at:Date.now()});
            handoff("data",card,mode==="summary"?"本场汇总结果":"本场数据说明卡",mode==="summary"?"链接中只有汇总结果。":"把说明卡发给申请人。收到申请链接后，用发布说明卡的浏览器打开审批。");
          }
        });
      };
      const panel=screen("分享本场数据",help("原始记录默认私有。品种对照、田间位置和个人原话默认不共享。")+
        choices+(list.length?'<h3>已发布的快照</h3><div class="share-list">'+list.join("")+'</div>':"")+
        (requests.length?'<h3>本机收到的申请</h3><div class="share-list">'+requests.join("")+'</div>':"")+
        '<details class="share-import"><summary>接收共享文件</summary>'+fileInput+'</details>',handlers);
      panel.addEventListener("change",e=>{
        const controls=panel.querySelector("[data-extra-controls]");
        if(controls && e.target.name==="share-mode") controls.hidden=e.target.value!=="metadata";
      });
    }
    function chooser(c,fields,checked) {
      return '<fieldset class="share-options"><legend>数据字段</legend>'+fields.map(f=>
        '<label><input type="checkbox" name="field" value="'+esc(f)+'" '+(checked && !Object.hasOwn(extras,f)?"checked":"")+'>'+esc(label(c,f))+'</label>').join("")+'</fieldset>';
    }
    const selected = el=>Array.from(el.querySelectorAll('[name=field]:checked'),n=>n.value);
    async function showCard(input) {
      await S.verifyCard(input);
      const c=input;
      if(c.mode==="summary") { screen("公开汇总结果",description(c)); return; }
      screen("数据说明卡",description(c)+'<label class="field">申请用途<textarea maxlength="400" placeholder="说明你将如何使用这些数据"></textarea></label>'+
        chooser(c,c.availableFields,false)+help("将申请链接发给主办人。收到回执后，请用这台设备的同一浏览器打开。")+
        actions(button("apply","生成申请",true)),{
        apply:async el=>{
          const purpose=el.querySelector("textarea").value.trim(), fs=selected(el);
          if(!purpose || !fs.length) throw Error("请填写用途并选择需要的字段。");
          const keys=await S.applicantKeys(), req=await S.request(c,purpose,fs,keys);
          save("applicant",req.id,{card:c,request:req,keys});
          handoff("request",req,"数据申请","将此申请发给主办人，主办人审批后会把回执发给你。请保留此浏览器的数据。");
        }
      });
    }
    function table(card,fields,rows) {
      return wrapped('<thead>'+cells("th",fields.map(f=>label(card,f)))+'</thead><tbody>'+rows.map(row=>cells("td",row)).join("")+'</tbody>');
    }
    async function reviewRequest(raw) {
      const own=read("owner",raw.cardId);
      if(!own || !own.snapshot) throw Error("请在发布这张说明卡的设备和浏览器上打开申请。");
      await S.review(own.card,raw);
      const existing=read("inbox",raw.id);
      if(existing?.decision) { handoff("decision",existing.decision,"审批回执","请将回执发回申请人，由原申请设备打开。"); return; }
      if(existing && JSON.stringify(existing.request)!==JSON.stringify(raw)) throw Error("此编号已有另一份申请。");
      save("inbox",raw.id,{request:raw});
      const context='<p class="share-counts">'+counts(own.card)+'</p><div class="share-purpose"><strong>申请用途</strong><p>'+esc(raw.purpose)+'</p></div>';
      function confirm(fields,data) {
        const approve=fields.length>0;
        screen(approve?"预览批准的数据":"确认拒绝申请",context+
          (approve?'<p class="help">将向这位申请人交付以下 '+data.rows.length+' 行、'+fields.length+' 列。</p>'+table(own.card,fields,data.rows):help("申请人将收到拒绝回执，回执不包含评分数据。"))+
          actions(button("back","返回审核"),button("finish",approve?"批准并生成回执":"拒绝并生成回执",true)),{
          back:()=>reviewRequest(raw),
          finish:async()=>{
            async function finishOnce() {
              const saved=read("inbox",raw.id)?.decision;
              if(saved) return saved;
              const next=await S.decide(own.snapshot,own.card,raw,fields,own.keys);
              const current=read("inbox",raw.id)?.decision;
              if(current) return current;
              save("inbox",raw.id,{request:raw,decision:next});
              return next;
            }
            const decision=navigator.locks ? await navigator.locks.request(key("review",raw.id),finishOnce) : await finishOnce();
            handoff("decision",decision,"审批回执","将回执发回申请人。只有生成申请的设备和浏览器可以解读。");
          }
        });
      }
      screen("审核数据申请",context+chooser(own.card,raw.fields,true)+help("可取消部分字段，再预览实际将交付的内容。")+
        actions(button("deny","拒绝申请"),button("preview","预览将交付的数据",true)),{
        deny:()=>confirm([],null),
        preview:async el=>{
          const fields=selected(el);
          if(!fields.length) throw Error("请选择至少一个字段，或拒绝此申请。");
          confirm(fields,await S.preview(own.snapshot,own.card,raw,fields));
        }
      });
    }
    async function showDecision(raw) {
      const own=read("applicant",raw.requestId);
      if(!own || own.card.id!==raw.cardId) throw Error("请在生成这份申请的设备和浏览器上打开回执。");
      const result=await S.open(own.card,own.request,raw,own.keys);
      screen(result.approved?"申请已批准":"申请已拒绝",result.approved?table(own.card,result.fields,result.rows)+
        actions(button("save","下载获批数据",true)):help("主办人已拒绝此次申请。"),{
        save:()=>download("获批品鉴数据.json",JSON.stringify({fields:result.fields.map(f=>label(own.card,f)),rows:result.rows},null,2))
      });
    }
    async function receive(kind,obj) {
      if(!obj || typeof obj!=="object") throw Error("共享内容格式错误。");
      if(kind==="data") return showCard(obj);
      if(kind==="request") return reviewRequest(obj);
      if(kind==="decision") return showDecision(obj);
      throw Error("未知的分享类型。");
    }
    async function fromHash(hash) {
      try { const {kind,value}=S.decode(hash); await receive(kind,value); }
      catch(e) { showError(e); }
    }
    return {ownerRound,fromHash};
  }
  globalThis.TasterShareUI={create};
})();
