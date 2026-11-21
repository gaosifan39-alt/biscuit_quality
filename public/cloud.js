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
    try {
      response = await fetch(origin+path, {
        method:"POST", headers:{"Content-Type":"application/json", apikey:config.publishableKey,
          ...(token ? {Authorization:"Bearer "+token} : {})},
        body:JSON.stringify(data), signal:AbortSignal.timeout(15_000)
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

  async function rpc(operation,data = {},owner = false) {
    const path = "/rest/v1/rpc/lt_demo_"+operation;
    if (!owner) return request(path,data);
    if (!session?.access_token) throw Error("请先登录主办人账号。");
    try { return await request(path,data,session.access_token); }
    catch (error) {
      if (error.status !== 401) throw error;
      await refresh();
      if (!session?.access_token) throw Error("登录已过期，请重新登录。");
      return request(path,data,session.access_token);
    }
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

  function create(openModal,getRound) {
    function view(title,html,actions = {}) {
      openModal(title,'<div id="cloud-view">'+html+'<p class="issues" role="status"></p></div>');
      const panel = document.querySelector("#cloud-view");
      const handle = async event => {
        const trigger = event.type === "submit" ? event.target : event.target.closest("button[data-cloud]");
        const action = trigger?.dataset.cloud;
        if (!Object.hasOwn(actions,action) || panel.dataset.busy) return;
        event.preventDefault();
        panel.dataset.busy = "true";
        const controls = [...panel.querySelectorAll("button,input,textarea")].filter(control=>!control.disabled);
        controls.forEach(control=>{control.disabled=true;});
        const feedback = panel.querySelector(".issues");
        feedback.textContent = "";
        try { await actions[action](trigger,panel); }
        catch (error) { feedback.textContent = error.message; }
        finally {
          controls.forEach(control=>{control.disabled=false;});
          delete panel.dataset.busy;
        }
      };
      panel.addEventListener("click",handle);
      panel.addEventListener("submit",handle);
      return panel;
    }

    function login(email = "") {
      const emailField = '<label class="field">主办人邮箱<input type="email" name="email" autocomplete="email" maxlength="254" required></label>';
      const tokenField = '<p class="help">验证码已发送到 '+esc(email)+'。</p><label class="field">邮箱验证码<input name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6,10}" required></label>';
      view("主办人邮箱登录",'<form data-cloud="'+(email?"verify":"send")+'">'+(email?tokenField:emailField)+
        '<div class="group-actions">'+(email?button("back","更换邮箱"):"")+'<button class="action">'+(email?"登录":"发送验证码")+'</button></div></form>',{
        send:async (form,panel)=>{
          const address = form.elements.email.value.trim();
          try { await request("/auth/v1/otp",{email:address,create_user:true}); }
          catch (error) {
            if (error.status === 429) throw error;
            throw Error("验证码发送失败。请检查邮箱地址和项目的邮件配置。");
          }
          if (panel.isConnected && panel.closest("dialog[open]")) login(address);
        },
        verify:async (form,panel)=>{
          const code = form.elements.code.value.trim();
          let auth;
          try { auth = await request("/auth/v1/verify",{email,token:code,type:"email"}); }
          catch { throw Error("验证码无效或已过期，请重新获取。"); }
          if (!auth?.access_token) throw Error("登录未完成，请重试。");
          setSession(auth);
          if (panel.isConnected && panel.closest("dialog[open]")) await dashboard();
        },
        back:()=>login()
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
          const id = await rpc("create",{p_title:source.title,p_rubric:template,
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
      const rows = result.records.slice(-20).reverse().map(record=>'<tr><td>'+esc(record.code)+'</td><td>'+
        esc(record.rater.slice(0,11))+'</td>'+result.traits.map(trait=>'<td>'+esc(record.scores[trait])+'</td>').join("")+'</tr>').join("");
      const contents = rows ? '<div class="table-wrap"><table><thead><tr>'+
        ["盲码","评价员",...result.traits].map(name=>'<th>'+esc(name)+'</th>').join("")+
        '</tr></thead><tbody>'+rows+'</tbody></table></div>' : "";
      const panel = view("场次二维码与评分",'<div class="share-purpose"><strong>'+esc(result.title)+'</strong><p>'+
        (result.accepting?"收评中":"已暂停")+' · 已收 '+result.records.length+' 条评分</p></div>'+
        '<canvas class="cloud-qr" aria-label="评价员扫码进入场次"></canvas>'+
        '<label class="field">评价员链接<input data-cloud-url readonly value="'+esc(url)+'"></label>'+
        '<div class="panel-actions">'+button("qr","下载二维码")+button("copy","复制评价链接")+button("refresh","刷新评分")+
        button("toggle",result.accepting?"暂停收评":"恢复收评")+'</div>'+contents+
        '<label class="checkline"><input type="checkbox" data-reveal>导出时包含样品真实名称</label>'+
        '<div class="group-actions">'+button("back","我的场次")+button("export","导出本场 Excel","action")+'</div>',{
        back:dashboard, refresh:()=>showRound(id),
        toggle:async ()=>{await rpc("set_open",{p_round:id,p_accepting:!result.accepting},true); await showRound(id);},
        qr:(_button,view)=>view.querySelector("canvas").toBlob(blob=>{if(blob) download(blob,"品鉴场次二维码.png");},"image/png"),
        copy:async (_button,view)=>{
          const input = view.querySelector("[data-cloud-url]");
          try { await navigator.clipboard.writeText(url); view.querySelector(".issues").textContent="链接已复制。"; }
          catch { input.disabled=false; input.focus(); input.select(); view.querySelector(".issues").textContent="链接已选中，可手动复制。"; }
        },
        export:(_button,view)=>{
          if (!result.records.length) throw Error("本场还没有收到评分。");
          const reveal = view.querySelector("[data-reveal]").checked;
          const bytes = TasterExport.build({...result,samples:result.samples.map(({code,name})=>({code,name:reveal?name:""}))});
          download(new Blob([bytes],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}),"小小品鉴家-扫码评分.xlsx");
        }
      });
      drawQR(panel.querySelector("canvas"),url);
    }

    function open() {
      if (!ready) {
        view("扫码收评",'<p class="help">请先为演示版配置 Supabase 的项目地址和发布密钥。</p>');
      } else if (session?.access_token) dashboard();
      else login();
    }
    return {open};
  }

  globalThis.TasterCloud = {
    create,
    join:id=>rpc("join",{p_round:id}),
    submit:(id,evaluator,code,scores)=>rpc("submit",{p_round:id,p_evaluator:evaluator,p_code:code,p_scores:scores})
  };
})();
