(() => {
  "use strict";

  function create({view,connect,rpc,loggedIn,login,ready,sendMail,download,manageRound,button,esc}) {
    const open = panel=>panel?.isConnected && panel.closest("dialog[open]");
    const statusList = {pending:"待审核",approved:"已批准",denied:"已拒绝"};

    function refreshDirectory() {
      const container = document.querySelector("#dataset-catalog");
      if (container) directory(container);
    }

    async function fetchFile(id,authorized) {
      const dataset = await rpc("dataset_get",{p_id:id},authorized);
      if (!dataset) throw Error("数据当前未开放，请在「数据申请」查看审批结果。");
      const bytes = TasterExport.buildScores(dataset);
      const filename = dataset.title.replace(/[<>:"/\\|?*\u0000-\u001f]/g,"_")+".xlsx";
      download(new Blob([bytes],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}),filename);
    }

    function publishForm(item,{values,automatic=false,back} = {}) {
      const mapping = values?.mapping ?? item.mapping ?? {};
      const visibility = values?.visibility ?? item.visibility ?? "request";
      const preferred = visibility === "public";
      const title = automatic ? "采集完成，是否公开本场数据？" : "结场与公开设置";
      const options = '<fieldset class="dataset-options"><legend>数据是否公开</legend>'+
        '<label><input type="radio" name="visibility" value="request"'+(!preferred?" checked":"")+'>不公开 · 访客可申请使用</label>'+
        '<label><input type="radio" name="visibility" value="public"'+(preferred?" checked":"")+'>公开 · 访客可直接下载</label></fieldset>';
      let fields = "";
      for (let i=1;i<=item.sampleCount;i++) {
        fields += '<label class="dataset-name"><span>'+i+' 号</span><input name="map-'+i+
          '" aria-label="'+i+' 号实际品种名称" maxlength="80" value="'+esc(mapping[i])+'" placeholder="实际品种名称"></label>';
      }
      const details = '<details class="dataset-mapping"><summary>填写编号与实际品种名称（可选）</summary>'+
        '<p class="help">公开时，下方填写的对照会显示在目录和 Excel。选择不公开时，获批申请人可下载你填写的对照。</p>'+
        '<div class="dataset-names">'+fields+'</div></details>';
      const currentPanel = view(title,'<form data-cloud="publish">'+
        '<p class="share-purpose"><strong>'+esc(item.title)+'</strong><br>'+item.count+' 条评分 · '+item.sampleCount+' 份样品</p>'+
        '<p class="help">目录会展示场次名称、指标和评分条数。共享文件包含样品号和分数，评价员用代号显示。</p>'+
        options+details+'<div class="group-actions">'+button("cancel",back?"返回场次":"稍后决定")+
        '<button class="action">'+(item.online?"保存设置并结束收评":"上传并保存设置")+'</button></div></form>',{
        cancel:()=>back ? back() : currentPanel.closest("dialog")?.close(),
        publish:async form=>{
          const data = new FormData(form);
          const names = {};
          for (let i=1;i<=item.sampleCount;i++) {
            const name = data.get("map-"+i)?.trim();
            if (name) names[i] = name;
          }
          const mode = data.get("visibility");
          const save = async ()=>{
            try {
              await rpc("dataset_publish",{p_id:item.id,p_online:item.online,p_visibility:mode,p_mapping:names,
                p_title:item.payload?.title ?? null,p_rubric:item.payload?.rubric ?? null,
                p_codes:item.payload?.codes ?? null,p_records:item.payload?.records ?? null},true);
            } catch (error) {
              if (!document.querySelector("dialog[open]")) return;
              const updated = publishForm(item,{values:{mapping:names,visibility:mode},back});
              updated.querySelector(".issues").textContent = error.message;
              return;
            }
            refreshDirectory();
            if (!document.querySelector("dialog[open]")) return;
            view("数据共享设置已保存",'<p class="help">'+(mode==="public"?
              "这场测评出现在数据共享目录，访客可以直接下载 Excel。":
              "目录已列出这场测评。访客可申请使用，批准后才能下载评分和已填写的品种对照。")+
              '</p><div class="group-actions">'+button("inbox","查看数据申请")+
              (back?button("back","返回场次","action"):'<button class="action" data-action="close">完成</button>')+'</div>',
              {inbox:()=>requests(),back});
          };
          if (loggedIn()) await save();
          else if (ready) login(save);
          else throw Error("连接 Supabase 后可上传本场数据。评分仍保存在本机。");
        }
      });
      currentPanel.querySelector("form").addEventListener("input",event=>{event.currentTarget.dataset.changed="1";});
      return currentPanel;
    }

    async function publishLocal(round,records,automatic=false) {
      if (!records.length) {
        view("上传本机测评",'<p class="help">这个场次还没有评分。口述评分后即可上传。</p>');
        return;
      }
      const people = new Map();
      const rows = records.map(({code,scores,rater})=>{
        if (!people.has(rater)) people.set(rater,"r"+(people.size+1));
        return {code,scores,rater:people.get(rater)};
      });
      const item = {id:round.id,title:round.title,online:false,count:rows.length,sampleCount:round.samples.length,
        payload:{title:round.title,rubric:{traits:round.traits.map(name=>TasterModel.ruleFor(round,name))},
          codes:round.samples.map(sample=>sample.code),records:rows}};
      const panel = publishForm(item,{automatic});
      if (!loggedIn()) return;
      try {
        const previous = await rpc("dataset_get",{p_id:round.id},true);
        if (!open(panel) || !previous) return;
        const form = panel.querySelector("form");
        if (!form.dataset.changed && !panel.dataset.busy) {
          form.elements.visibility.value = previous.visibility;
          for (const [number,name] of Object.entries(previous.mapping || {})) {
            if (form.elements["map-"+number]) form.elements["map-"+number].value = name;
          }
        }
      } catch {}
    }

    async function publishRound(round,back) {
      if (!round.records.length) throw Error("本场还没有收到评分。");
      const waiting = view("结场与公开设置",'<p class="help">正在读取场次设置…</p>');
      try {
        const previous = await rpc("dataset_get",{p_id:round.id},true);
        if (!open(waiting)) return;
        publishForm({id:round.id,title:round.title,online:true,count:round.records.length,sampleCount:round.samples.length,
          mapping:previous?.mapping,visibility:previous?.visibility},{automatic:true,back});
      } catch (error) {
        if (open(waiting)) waiting.querySelector(".issues").textContent = error.message;
      }
    }

    async function manage(item) {
      if (item.online) return manageRound(item.id);
      const source = await rpc("dataset_get",{p_id:item.id},true);
      if (!source) throw Error("请登录上传这场数据的账号。");
      publishForm({...item,mapping:source.mapping});
    }

    function ask(item) {
      if (!loggedIn()) { login(()=>{refreshDirectory();ask(item);}); return; }
      view("申请使用数据",'<p class="share-purpose">'+esc(item.title)+'</p>'+
        '<form data-cloud="send"><label class="field">申请用途<textarea name="purpose" rows="4" maxlength="500" required></textarea></label>'+
        '<div class="group-actions">'+button("requests","查看我的申请")+'<button class="action">提交申请并通知主办人</button></div></form>',{
        requests:()=>requests(),
        send:async (form,panel)=>{
          const id = await rpc("dataset_ask",{p_id:item.id,p_purpose:form.elements.purpose.value.trim()},true);
          panel.querySelector(".issues").textContent = "已收到申请，正在通知主办人…";
          const mailed = await sendMail(id);
          refreshDirectory();
          if (open(panel)) await requests(mailed?"申请已提交，邮件已发给主办人。":"申请已提交，邮件暂未送出。可在申请列表重试。");
        }
      });
    }

    function review(item) {
      const decisions = [
        ["approved","仅批准此申请"],["public","将本场数据设为公开"],["denied","拒绝申请"]
      ];
      view("处理数据申请",'<div class="share-purpose"><strong>'+esc(item.title)+'</strong>'+
        '<p>'+esc(item.purpose)+'</p></div>'+(item.email?'<p class="help">申请人 '+esc(item.email)+'</p>':"")+
        '<form data-cloud="decide"><fieldset class="dataset-options"><legend>主办人决定</legend>'+
        decisions.map(([choice,label])=>'<label><input type="radio" name="decision" value="'+choice+'" required>'+label+'</label>').join("")+
        '</fieldset><p class="help">选择公开后，目录访客可直接下载评分和已填写的品种对照。</p>'+
        '<div class="group-actions">'+(item.online?button("finish","查看场次与结场设置"):"")+
        button("back","返回申请")+'<button class="action">确认决定</button></div></form>',{
        back:()=>requests(),
        finish:()=>manageRound(item.dataset),
        decide:async (form,panel)=>{
          const done = await rpc("dataset_decide",{p_id:item.id,p_choice:form.elements.decision.value},true);
          if (!done) throw Error("该申请已处理，请刷新申请列表。");
          refreshDirectory();
          if (open(panel)) await requests("审核结果已保存。");
        }
      });
    }

    async function requests(message="") {
      if (!ready) { view("数据申请",'<p class="help">连接 Supabase 后可发送和处理数据申请。</p>'); return; }
      if (!loggedIn()) { login(()=>{refreshDirectory();return requests(message);}); return; }
      const pending = view("数据申请",'<p class="help">正在读取申请…</p>');
      let items;
      try { items = await rpc("dataset_requests",{},true); }
      catch (error) {
        if (open(pending)) pending.querySelector(".issues").textContent = error.message;
        return;
      }
      if (!open(pending)) return;
      const actions = {};
      const cards = items.map((item,i)=>{
        let controls = "";
        if (item.incoming && item.status === "pending") {
          controls = button("review-"+i,"处理申请","action");
          actions["review-"+i] = ()=>review(item);
        } else if (!item.incoming && (item.status === "approved" || item.visibility === "public")) {
          controls = button("get-"+i,"下载 Excel");
          actions["get-"+i] = ()=>fetchFile(item.dataset,true);
        } else if (!item.incoming && item.status === "pending" && !item.sent) {
          controls = button("mail-"+i,"重试邮件");
          actions["mail-"+i] = async ()=>requests(await sendMail(item.id)?"邮件已发给主办人。":"邮件暂未送出，申请已保留。");
        }
        return '<article class="cloud-request"><strong>'+esc(item.title)+'</strong><p class="help">'+
          (item.incoming?"收到的申请":"我发出的申请")+' · '+statusList[item.status]+'</p>'+
          '<p>'+esc(item.purpose)+'</p>'+controls+'</article>';
      }).join("");
      const panel = view("数据申请",cards || '<p class="help">目前没有数据申请。</p>',actions);
      panel.querySelector(".issues").textContent = message;
    }

    function mappingCell(item) {
      if (item.visibility !== "public") return '<span class="help">'+
        (item.access==="approved"?"在获批文件中查看":"审核后可见")+'</span>';
      const names = Object.entries(item.mapping ?? {});
      if (!names.length) return '<span class="help">未提供对照</span>';
      return '<details class="dataset-row-mapping"><summary>查看 '+names.length+' 项对照</summary><ul>'+
        names.map(([number,name])=>'<li>'+esc(number)+' 号 · '+esc(name)+'</li>').join("")+'</ul></details>';
    }

    async function directory(panel) {
      if (!ready) { panel.innerHTML = '<p class="help">连接 Supabase 后可查看在线测评数据。</p>'; return; }
      const loading = document.createElement("p");
      loading.textContent = "正在读取测评数据…";
      loading.className = "help";
      panel.replaceChildren(loading);
      let items;
      try { items = await rpc("dataset_catalog",{},loggedIn()); }
      catch (error) {
        if (!loading.isConnected) return;
        loading.textContent = error.message;
        return;
      }
      if (!loading.isConnected) return;
      const actions = {requests:()=>requests()};
      const rows = items.map((item,i)=>{
        const publiclyAvailable = item.visibility === "public";
        const permit = publiclyAvailable || item.access === "approved" || (item.own && item.published);
        let controls = permit ? button("download-"+i,"下载 Excel","action") : "";
        if (permit) actions["download-"+i] = ()=>fetchFile(item.id,!publiclyAvailable);
        if (item.own) {
          actions["manage-"+i] = ()=>manage(item);
          controls += button("manage-"+i,"管理公开");
        } else if (!permit) {
          actions["ask-"+i] = ()=>item.access ? requests() : ask(item);
          controls = button("ask-"+i,item.access ? "查看申请" : "申请使用");
        }
        return '<tr role="row" data-dataset><th role="rowheader" scope="row">'+esc(item.title)+'</th><td role="cell" data-label="性状指标">'+esc(item.traits.join("、"))+
          '</td><td role="cell" data-label="数据份数">'+item.count+' 条</td><td role="cell" data-label="编号与品种">'+mappingCell(item)+
          '</td><td role="cell" data-label="是否公开"><span class="dataset-badge'+
          (publiclyAvailable?" public":"")+'">'+(publiclyAvailable?"公开":"不公开")+'</span></td><td role="cell"><div class="panel-actions">'+controls+'</div></td></tr>';
      }).join("");
      panel.innerHTML = '<div class="dataset-view"><div class="dataset-toolbar"><label class="field">搜索测评数据<input type="search" placeholder="品鉴名称、性状指标" maxlength="80"></label>'+
        button("requests","数据申请")+'</div><div class="table-wrap dataset-table" tabindex="0" aria-label="测评数据目录">'+
        '<table role="table"><thead><tr>'+["品鉴名称","性状指标","数据份数","编号与实际品种名称","是否公开","下载或申请"].map(name=>'<th scope="col">'+name+'</th>').join("")+
        '</tr></thead><tbody role="rowgroup">'+rows+'</tbody></table></div><p class="help dataset-empty"'+(items.length?" hidden":"")+'>'+
        (items.length?"没有符合条件的测评。":"目前还没有可展示的测评数据。")+'</p><p class="issues" role="status"></p></div>';
      const tableRows = [...panel.querySelectorAll("[data-dataset]")];
      panel.querySelector("input").addEventListener("input",event=>{
        const query = event.currentTarget.value.trim().normalize("NFKC").toLowerCase().split(/\s+/);
        tableRows.forEach((row,i)=>{
          const item = items[i];
          const text = [item.title,...item.traits].join(" ").normalize("NFKC").toLowerCase();
          row.hidden = !query.every(term=>text.includes(term));
        });
        panel.querySelector(".dataset-empty").hidden = tableRows.some(row=>!row.hidden);
      });
      connect(panel.querySelector(".dataset-view"),actions);
    }

    return {directory,publishLocal,publishRound};
  }

  globalThis.TasterDatasets = {create};
})();
