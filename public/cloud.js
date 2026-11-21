(() => {
  "use strict";

  const config = globalThis.LittleTasterCloudConfig || {};
  const origin = /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(config.url) ? config.url.replace(/\/$/,"") : "";
  const ready = Boolean(origin && /^sb_publishable_[\w-]+$/.test(config.publishableKey || ""));
  const loginKey = "little-taster.cloud.login.v1";
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const button = (id,label,style="ghost") => '<button class="'+style+'" type="button" data-cloud="'+id+'">'+esc(label)+'</button>';
  let session;
  try { session = JSON.parse(sessionStorage.getItem(loginKey)); } catch {}

  function setSession(auth) {
    session = auth;
    try {
      if (auth) sessionStorage.setItem(loginKey,JSON.stringify(auth));
      else sessionStorage.removeItem(loginKey);
    } catch {}
  }

  async function request(path, data, token) {
    if (!ready) throw Error("请先连接 Supabase 项目。");
    let response;
    const timeout = path.endsWith("/lt_demo_submit_v2") ? 60_000 : path.startsWith("/functions/") ? 25_000 : 15_000;
    try {
      response = await fetch(origin+path, {
        method:"POST", headers:{"Content-Type":"application/json", apikey:config.publishableKey,
          ...(token ? {Authorization:"Bearer "+token} : {})},
        body:JSON.stringify(data), signal:AbortSignal.timeout(timeout)
      });
    } catch { throw Error("连接服务器失败，请检查网络后重试。"); }
    const body = await response.json().catch(()=>null);
    if (!response.ok) {
      const message = [body?.msg,body?.message,body?.error_description].find(value=>typeof value==="string" && /[\u3400-\u9fff]/u.test(value));
      const error = Error(message || (response.status === 429 ? "操作太频繁，请稍后再试。" : "云端服务未能完成操作。"));
      error.status = response.status;
      throw error;
    }
    return body;
  }

  let refreshing;
  async function refresh() {
    if (!session?.refresh_token) throw Error("登录已过期，请重新登录。");
    if (!refreshing) {
      const previous = session;
      refreshing = request("/auth/v1/token?grant_type=refresh_token",{refresh_token:previous.refresh_token})
        .then(result => {
          if (session === previous) setSession(result);
        })
        .catch(error => {
          if (error.status === 400 || error.status === 401) setSession(null);
          throw error;
        })
        .finally(()=>{refreshing=null;});
    }
    return refreshing;
  }

  async function authenticatedRequest(path,data) {
    if (!session?.access_token) throw Error("请先登录邮箱账号。");
    try { return await request(path,data,session.access_token); }
    catch (error) {
      if (error.status !== 401) throw error;
      await refresh();
      if (!session?.access_token) throw Error("登录已过期，请重新登录。");
      return request(path,data,session.access_token);
    }
  }

  function rpc(operation,data = {},owner = false) {
    const path = "/rest/v1/rpc/lt_demo_"+operation;
    return owner ? authenticatedRequest(path,data) : request(path,data);
  }

  const audioTypes = {"audio/webm":"webm","audio/mp4":"m4a","audio/ogg":"ogg","audio/wav":"wav","audio/mpeg":"mp3"};
  const audioBytes = clip => Uint8Array.from(atob(clip.base64),value=>value.charCodeAt(0));

  async function submit(id,evaluator,code,scores,recordings = []) {
    const args = {p_round:id,p_evaluator:evaluator,p_code:code,p_scores:scores};
    if (!recordings.length) { await rpc("submit",args); return ""; }
    const clips = [];
    let total = 0, skipped = 0;
    for (const {id,blob} of [...recordings].sort((a,b)=>b.at-a.at)) {
      const mime = blob.type.split(";")[0].toLowerCase();
      if (!Object.hasOwn(audioTypes,mime) || !blob.size || blob.size > 2097152 ||
          clips.length >= 8 || total+blob.size > 6291456) {
        skipped++;
        continue;
      }
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let binary = "";
      for (let i=0; i<bytes.length; i+=16384) binary += String.fromCharCode(...bytes.subarray(i,i+16384));
      clips.unshift({id,mime,base64:btoa(binary)});
      total += bytes.length;
    }
    if (clips.length) await rpc("submit_v2",{...args,p_clips:clips});
    else await rpc("submit",args);
    return skipped ? " 有 "+skipped+" 段录音因格式或大小限制未上传。" : "";
  }

  async function recordingsFor(id,record) {
    const clips = await rpc("audio",{p_round:id,p_evaluator:record.evaluator,p_code:record.code},true);
    if (clips.length < record.audioCount) throw Error("录音已更新，请刷新评分再试。");
    return clips;
  }

  function download(blob,name) {
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(()=>URL.revokeObjectURL(url),30000);
  }

  function drawQR(canvas, url) {
    const qr = globalThis.qrcode(0,"M");
    qr.addData(url);
    qr.make();
    const count = qr.getModuleCount();
    const unit = 8;
    canvas.width = canvas.height = (count+8)*unit;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle = "#101c16";
    for (let y=0; y<count; y++) for (let x=0; x<count; x++) {
      if (qr.isDark(y,x)) ctx.fillRect((x+4)*unit,(y+4)*unit,unit,unit);
    }
  }

  function create(openModal,getRound,useTemplate,recordingURL) {
    function view(title,html,actions = {}) {
      openModal(title,'<div id="cloud-view">'+html+'<p class="issues" role="status"></p></div>');
      return connect(document.querySelector("#cloud-view"),actions);
    }

    function connect(panel,actions) {
      const handle = async event => {
        const trigger = event.type === "submit" ? event.target : event.target.closest("button[data-cloud]");
        const action = trigger?.dataset.cloud;
        if (!Object.hasOwn(actions,action) || panel.dataset.busy) return;
        event.preventDefault();
        panel.dataset.busy = "true";
        const feedback = panel.querySelector(".issues");
        feedback.textContent = "";
        trigger.setAttribute("aria-busy","true");
        try { await actions[action](trigger,panel); }
        catch (error) { feedback.textContent = error.message; }
        finally {
          trigger.removeAttribute("aria-busy");
          delete panel.dataset.busy;
        }
      };
      panel.addEventListener("click",handle);
      panel.addEventListener("submit",handle);
      return panel;
    }

    function login(email = "",after = dashboard) {
      const emailField = '<label class="field">邮箱<input type="email" name="email" autocomplete="email" maxlength="254" required></label>';
      const tokenField = '<p class="help">验证码已发送到 '+esc(email)+'。</p><label class="field">邮箱验证码<input name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6,10}" required></label>';
      view("邮箱登录",'<form data-cloud="'+(email?"verify":"send")+'">'+(email?tokenField:emailField)+
        '<div class="group-actions">'+(email?button("back","更换邮箱"):"")+'<button class="action">'+(email?"登录":"发送验证码")+'</button></div></form>',{
        send:async (form,panel)=>{
          const address = form.elements.email.value.trim();
          try { await request("/auth/v1/otp",{email:address,create_user:true}); }
          catch (error) {
            if (error.status === 429) throw error;
            throw Error("验证码发送失败。请检查邮箱地址和项目的邮件配置。");
          }
          if (panel.isConnected && panel.closest("dialog[open]")) login(address,after);
        },
        verify:async (form,panel)=>{
          const code = form.elements.code.value.trim();
          let auth;
          try { auth = await request("/auth/v1/verify",{email,token:code,type:"email"}); }
          catch { throw Error("验证码无效或已过期，请重新获取。"); }
          if (!auth?.access_token) throw Error("登录未完成，请重试。");
          setSession(auth);
          if (panel.isConnected && panel.closest("dialog[open]")) await after();
        },
        back:()=>login("",after)
      });
    }

    async function dashboard() {
      if (!session?.access_token) { login(); return; }
      const pending = view("扫码收评",'<p class="help">正在读取你的场次…</p>');
      let events;
      try { events = await rpc("list",{},true); }
      catch (error) {
        if (!pending.isConnected || !pending.closest("dialog[open]")) return;
        if (!session) { login(); return; }
        const failed = view("扫码收评",button("retry","重试")+button("logout","退出登录"),{retry:dashboard,logout});
        failed.querySelector(".issues").textContent = error.message;
        return;
      }
      if (!pending.isConnected || !pending.closest("dialog[open]")) return;
      const source = getRound();
      const rows = events.map((item,i)=>'<div class="cloud-list-row"><div><strong>'+esc(item.title)+'</strong><p class="help">'+
        (item.accepting?"收评中":"已暂停")+' · '+item.count+' 条评分</p></div>'+button("view-"+i,"二维码与评分")+'</div>').join("");
      const actions = {upload:()=>uploadRound(source),logout};
      events.forEach((item,i)=>{actions["view-"+i] = () => showRound(item.id);});
      view("扫码收评",'<p class="help">已登录 '+esc(session.user?.email || "")+'</p>'+
        '<div class="cloud-list">'+rows+'</div><div class="group-actions">'+button("logout","退出登录")+
        button("upload","为当前场次生成二维码","action")+'</div>',actions);
    }

    function logout() {
      const token = session?.access_token;
      setSession(null);
      login();
      if (token) request("/auth/v1/logout?scope=local",{},token).catch(()=>{});
    }

    function uploadRound(source) {
      view("生成场次二维码",'<p class="help">场次名称、模板和盲码将供扫码者查看。后续提交的评分由主办人在此汇总。</p>'+
        '<p class="share-purpose">'+esc(source.title)+' · '+source.samples.length+' 份样品</p>'+
        '<div class="group-actions">'+button("back","返回")+button("publish","创建收评场次","action")+'</div>',{
        back:dashboard,
        publish:async (_button,panel)=>{
          const template = TasterTemplates.fromRound(source);
          const id = await rpc("create_v2",{p_title:source.title,p_rubric:template,
            p_samples:source.samples.map(({code,name})=>({code,name}))},true);
          if (panel.isConnected && panel.closest("dialog[open]")) await showRound(id);
        }
      });
    }

    async function showRound(id, previous = document.querySelector("#cloud-view")) {
      const result = await rpc("result",{p_round:id},true);
      if (!previous?.isConnected || !previous.closest("dialog[open]")) return;
      if (!result) throw Error("当前账号无法查看该场次。");
      const url = location.origin+location.pathname+"#join="+id;
      const recent = result.records.slice(-20).reverse();
      const rows = recent.map((record,i)=>'<tr><td>'+esc(record.code)+'</td><td>'+
        esc(record.rater.slice(0,13))+'</td>'+result.traits.map(trait=>'<td>'+esc(record.scores[trait])+'</td>').join("")+
        '<td>'+(record.audioCount ? button("audio-"+i,"试听 "+record.audioCount+" 段","subtle") : "未上传")+'</td></tr>').join("");
      const contents = rows ? '<div class="table-wrap"><table><thead><tr>'+
        ["盲码","评价员",...result.traits,"录音"].map(name=>'<th>'+esc(name)+'</th>').join("")+
        '</tr></thead><tbody>'+rows+'</tbody></table></div>' : "";
      const visibility = {private:"仅自己可见",request:"审核后可用",public:"直接公开使用"};
      const play = Object.fromEntries(recent.flatMap((record,i)=>record.audioCount
        ? [["audio-"+i,()=>showAudio(id,record)]] : []));
      const panel = view("场次二维码与评分",'<div class="share-purpose"><strong>'+esc(result.title)+'</strong><p>'+
        (result.accepting?"收评中":"已暂停")+' · 已收 '+result.records.length+' 条评分</p></div>'+
        '<canvas class="cloud-qr" aria-label="评价员扫码进入场次"></canvas>'+
        '<label class="field">评价员链接<input data-cloud-url readonly value="'+esc(url)+'"></label>'+
        '<div class="panel-actions">'+button("qr","下载二维码")+button("copy","复制评价链接")+button("refresh","刷新评分")+
        button("toggle",result.accepting?"暂停收评":"恢复收评")+
        button("sharing","模板共享设置")+'</div><p class="help">模板目录 · '+esc(visibility[result.visibility] || visibility.private)+'</p>'+contents+
        (result.records.length>recent.length?'<p class="help">此处显示最近 20 条，下载文件包含全场。</p>':"")+
        '<label class="checkline"><input type="checkbox" data-reveal>导出时包含样品真实名称</label>'+
        '<div class="group-actions">'+button("back","我的场次")+button("export","导出本场 Excel")+
        button("zip","下载 Excel 和录音 ZIP","action")+'</div>',{
        ...play,
        back:dashboard, refresh:()=>showRound(id),
        sharing:()=>configureSharing(result),
        toggle:async ()=>{await rpc("set_open",{p_round:id,p_accepting:!result.accepting},true); await showRound(id);},
        qr:(_button,view)=>view.querySelector("canvas").toBlob(blob=>{if(blob) download(blob,"品鉴场次二维码.png");},"image/png"),
        copy:async (_button,view)=>{
          const input = view.querySelector("[data-cloud-url]");
          try { await navigator.clipboard.writeText(url); view.querySelector(".issues").textContent="链接已复制。"; }
          catch { input.disabled=false; input.focus(); input.select(); view.querySelector(".issues").textContent="链接已选中，可手动复制。"; }
        },
        export:(_button,panel)=>exportRound(id,panel,false),
        zip:(_button,panel)=>exportRound(id,panel,true)
      });
      drawQR(panel.querySelector("canvas"),url);
    }

    async function showAudio(id,record) {
      const pending = view("录音 · "+record.code,'<p class="help">正在读取原声…</p>',{});
      try {
        const clips = await recordingsFor(id,record);
        if (!pending.isConnected || !pending.closest("dialog[open]")) return;
        const panel = view("录音 · "+record.code,clips.map((_,i)=>'<div class="clip-row"><p>第 '+(i+1)+
          ' 段</p><audio controls preload="metadata"></audio></div>').join("")+
          '<div class="group-actions">'+button("back","返回评分")+'</div>',{back:()=>showRound(id)});
        panel.querySelectorAll("audio").forEach((player,i)=>{
          player.src = recordingURL(new Blob([audioBytes(clips[i])],{type:clips[i].mime}));
        });
      } catch (error) {
        if (pending.isConnected && pending.closest("dialog[open]")) {
          view("录音 · "+record.code,'<p class="help">'+esc(error.message)+'</p>'+button("back","返回评分"),
            {back:()=>showRound(id)});
        }
      }
    }

    async function exportRound(id,panel,includeAudio) {
      const reveal = panel.querySelector("[data-reveal]").checked;
      const feedback = panel.querySelector(".issues");
      feedback.textContent = "正在整理评分…";
      const result = await rpc("result",{p_round:id},true);
      if (!result?.records.length) throw Error("本场还没有收到评分。");
      const excel = TasterExport.build({...result,samples:result.samples.map(({code,name})=>({code,name:reveal?name:""}))});
      if (!includeAudio) {
        download(new Blob([excel],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}),"小小品鉴家-扫码评分.xlsx");
        feedback.textContent = "Excel 已生成。";
        return;
      }
      const files = {"评分.xlsx":excel};
      const withAudio = result.records.filter(record=>record.audioCount);
      let count = 0;
      for (const [index,record] of withAudio.entries()) {
        if (!panel.isConnected || !panel.closest("dialog[open]")) return;
        feedback.textContent = "正在打包录音 "+(index+1)+" / "+withAudio.length+"…";
        const clips = await recordingsFor(id,record);
        clips.forEach((clip,i)=>{
          files["录音/"+record.code+"_"+record.rater+"_"+(i+1)+"."+audioTypes[clip.mime]] = audioBytes(clip);
        });
        count += clips.length;
      }
      download(new Blob([TasterExport.writeZip(files)],{type:"application/zip"}),"小小品鉴家-评分与录音.zip");
      feedback.textContent = "已打包 "+result.records.length+" 条评分和 "+count+" 段录音。";
    }

    function configureSharing(round) {
      view("模板共享设置",'<form data-cloud="save"><p class="help">目录只展示模板信息。公开或批准后，其他人可复制评分规则来建自己的场次。</p>'+
        '<label class="field">访问方式<select name="access">'+
        [["private","仅自己可见"],["request","审核后可用"],["public","直接公开使用"]].map(([value,label])=>
          '<option value="'+value+'"'+((round.visibility || "private")===value?" selected":"")+'>'+label+'</option>').join("")+
        '</select></label><label class="checkline"><input type="checkbox" name="email"'+(round.showEmail?" checked":"")+
        '>在目录显示我的登录邮箱</label><div class="group-actions">'+button("back","返回评分")+
        '<button class="action">保存共享设置</button></div></form>',{
        back:()=>showRound(round.id),
        save:async (form,panel)=>{
          const saved = await rpc("template_share",{p_round:round.id,p_visibility:form.elements.access.value,
            p_show_email:form.elements.email.checked},true);
          if (!saved) throw Error("当前账号无法修改该场次。");
          if (panel.isConnected && panel.closest("dialog[open]")) await showRound(round.id);
        }
      });
    }

    async function previewTemplate(id,authorized) {
      const template = await rpc("shared_template",{p_round:id},authorized);
      if (!template) throw Error("该模板尚未开放使用。");
      useTemplate(TasterTemplates.validate(template));
    }

    const mailStatus = async id => {
      try {
        const reply = await authenticatedRequest("/functions/v1/template-request-email",{id});
        return reply.status === "sent";
      } catch { return false; }
    };

    function askTemplate(item) {
      if (!session?.access_token) { login("",()=>askTemplate(item)); return; }
      view("申请使用 · "+item.food,'<form data-cloud="send"><label class="field">申请用途'+
        '<textarea name="purpose" rows="4" maxlength="500" required></textarea></label><div class="group-actions">'+
        button("inbox","我的申请")+'<button class="action">提交并通知主办人</button></div></form>',{
        inbox:showRequests,
        send:async (form,panel)=>{
          const id = await rpc("ask_template",{p_round:item.id,p_purpose:form.elements.purpose.value.trim()},true);
          panel.querySelector(".issues").textContent = "站内申请已保存，正在通知主办人…";
          const sent = await mailStatus(id);
          if (!panel.isConnected || !panel.closest("dialog[open]")) return;
          await showRequests(sent ? "站内申请已保存，邮件已发给主办人。" :
            "站内申请已保存，邮件暂未送出。可在待审核的申请旁重试。");
        }
      });
    }

    async function showRequests(message = "") {
      if (!session?.access_token) { login("",()=>showRequests()); return; }
      const panel = view("模板申请",'<p class="help">正在读取申请…</p>');
      let items;
      try { items = await rpc("requests",{},true); }
      catch (error) {
        if (!panel.isConnected || !panel.closest("dialog[open]")) return;
        view("模板申请",'<p class="help">'+esc(error.message)+'</p>'+button("retry","重试"),{retry:()=>showRequests()});
        return;
      }
      if (!panel.isConnected || !panel.closest("dialog[open]")) return;
      const actions = {};
      const rows = items.map((item,i)=>{
        const controls = [];
        if (item.incoming && item.status === "pending") {
          [[true,"批准"],[false,"拒绝"]].forEach(([approve,label])=>{
            const key = "decide-"+i+"-"+approve;
            controls.push(button(key,label));
            actions[key] = async ()=>{
              await rpc("decide_request",{p_request:item.id,p_approve:approve},true);
              await showRequests();
            };
          });
        }
        if (!item.incoming && item.status === "approved" && item.available) {
          controls.push(button("use-"+i,"预览并使用"));
          actions["use-"+i] = ()=>previewTemplate(item.round,true);
        }
        if (!item.incoming && item.status === "pending" && !item.sent && item.available) {
          controls.push(button("mail-"+i,"重试邮件"));
          actions["mail-"+i] = async ()=>showRequests(await mailStatus(item.id) ? "邮件已发给主办人。" :
            "邮件暂未送出，请稍后重试，站内申请已保留。");
        }
        const status = {pending:"待审核",approved:"已批准",denied:"已拒绝"}[item.status];
        return '<article class="cloud-request"><strong>'+esc(item.food)+'</strong><p class="help">'+
          (item.incoming?"收到的申请":"我发出的申请")+' · '+status+'</p><p class="share-purpose">'+esc(item.purpose)+'</p>'+
          '<div class="panel-actions">'+controls.join("")+'</div></article>';
      }).join("");
      const result = view("模板申请",rows || '<p class="help">暂无模板申请。</p>',actions);
      result.querySelector(".issues").textContent = message;
    }

    async function directory(panel) {
      if (!ready) { panel.innerHTML = '<p class="help">连接云端服务后即可查看场次模板。</p>'; return; }
      panel.innerHTML = '<p class="help">正在读取云端目录…</p>';
      let items;
      try { items = await rpc("directory"); }
      catch (error) {
        if (!panel.isConnected) return;
        panel.innerHTML = '<p class="help">'+esc(error.message)+'</p>';
        const retry = document.createElement("button");
        retry.className = "ghost";
        retry.textContent = "重新加载";
        retry.addEventListener("click",()=>directory(panel),{once:true});
        panel.append(retry);
        return;
      }
      if (!panel.isConnected) return;
      const actions = {inbox:()=>showRequests(),manage:()=>open()};
      const itemsHTML = items.map((item,i)=>{
        const publicTemplate = item.visibility === "public";
        actions["entry-"+i] = () => publicTemplate ? previewTemplate(item.id,false) : askTemplate(item);
        return '<article class="cloud-request" data-directory-entry><strong>'+esc(item.food)+'</strong><p class="help">'+
          esc(item.traits.join(" · "))+'</p><p class="help">v'+esc(item.version)+' · '+(publicTemplate?"已公开":"审核后可用")+
          (item.email?' · <span class="organizer-email">主办人 '+esc(item.email)+'</span>':"")+'</p>'+
          button("entry-"+i,publicTemplate?"预览并使用":"申请使用")+'</article>';
      }).join("");
      panel.innerHTML = '<p class="help">按食品、指标或关键词查找主办人发布的模板。</p>'+
        '<div class="panel-actions">'+button("inbox","模板申请")+button("manage","我的扫码场次")+'</div>'+
        '<label class="field">搜索共享模板<input type="search" maxlength="80" placeholder="小麦品质、刀削面" data-directory-search></label>'+
        '<p class="help" data-no-results role="status"'+(items.length?' hidden':"")+'>'+(items.length?"没有匹配的模板。":"暂时没有主办人发布模板。")+'</p>'+
        '<div class="cloud-directory-list">'+itemsHTML+'</div><p class="issues" role="status"></p>';
      const search = panel.querySelector("[data-directory-search]");
      const entries = panel.querySelectorAll("[data-directory-entry]");
      search.addEventListener("input",()=>{
        let found = false;
        entries.forEach((entry,i)=>{
          const item = items[i];
          const template = {foodType:item.food,keywords:item.keywords,contributor:item.email,
            traits:item.traits.map(name=>({name}))};
          entry.hidden = !TasterTemplates.matches(template,search.value);
          found ||= !entry.hidden;
        });
        panel.querySelector("[data-no-results]").hidden = found;
      });
      connect(panel,actions);
    }

    function open() {
      if (!ready) {
        view("扫码收评",'<p class="help">请先为演示版配置 Supabase 的项目地址和发布密钥。</p>');
      } else if (session?.access_token) dashboard();
      else login();
    }
    return {open,directory};
  }

  globalThis.TasterCloud = {
    create,
    join:id=>rpc("join",{p_round:id}),
    submit
  };
})();
