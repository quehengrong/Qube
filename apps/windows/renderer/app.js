const $=id=>document.getElementById(id),api=window.qube;let state=null,selected=null,dirty=false,editRevision=null;let timer;
function toast(text,error=false){$('toast').textContent=text;$('toast').className=error?'error':'';clearTimeout(timer);timer=setTimeout(()=>$('toast').className='hidden',6000);}
async function call(name,arg){try{return await api.invoke(name,arg);}catch(e){toast(e.message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/,''),true);throw e;}}
function safe(action){return (...args)=>Promise.resolve().then(()=>action(...args)).catch(()=>{});}
const term=new Terminal({theme:{background:'#131e29',foreground:'#d5e6ed',cursor:'#73edd0'},fontSize:13,fontFamily:'Consolas, monospace',scrollback:3000});const fit=new FitAddon.FitAddon();term.loadAddon(fit);term.open($('terminal'));
term.onData(data=>{if(selected)call('terminal-input',{id:selected,data}).catch(()=>{});});
new ResizeObserver(()=>{try{fit.fit();if(selected)call('terminal-resize',{id:selected,cols:term.cols,rows:term.rows}).catch(()=>{});}catch{}}).observe($('terminal'));
api.on('terminal-output',({sessionId,data})=>{if(sessionId===selected)term.write(data);});
const headings={home:'你的桌面，多了一个伙伴。',coding:'说出想法，留在心流。',pairing:'让手机与电脑相遇。',settings:'让 Qube 适应你的习惯。'};
for(const b of document.querySelectorAll('[data-tab]'))b.onclick=()=>{document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('hidden',x.id!==b.dataset.tab));document.querySelectorAll('[data-tab]').forEach(x=>x.classList.toggle('active',x===b));$('heading').textContent=headings[b.dataset.tab];if(b.dataset.tab==='coding')fit.fit();if(b.dataset.tab==='pairing')pairings().catch(()=>{});};
function render(s){state=s;$('connection').textContent=s.connected?'● 手机已连接':'○ 手机未连接';$('connection').className='badge'+(s.connected?' online':'');$('message').textContent=s.message;$('face').className=`face ${s.face}`;$('speech').textContent=s.speech;$('mode').textContent=s.draft.mode==='dictation'?'听写模式':'控制模式';if(!dirty){$('draft').value=s.draft.text;editRevision=s.draft.revision;}$('draft-target').textContent=`发送至：${s.sessions.find(x=>x.id===s.draft.sessionId)?.name??'请先选择会话'}`;$('submit-draft').disabled=!s.draft.confirmedConnection||!s.draft.text.trim()||dirty;
 $('sessions').replaceChildren();for(const session of s.sessions){const b=document.createElement('button');b.textContent=`${session.alive?'●':'○'} ${session.name} · ${session.agent}`;b.className=s.draft.sessionId===session.id?'active':'';b.disabled=!session.alive;b.onclick=safe(async()=>{await call('select-session',session.id);selected=session.id;term.reset();term.write(await call('terminal-output',session.id));$('terminal-title').textContent=session.name;fit.fit();});$('sessions').append(b);}}
api.on('state',render);
$('command-form').onsubmit=safe(async e=>{e.preventDefault();await call('text',$('command').value);$('command').value='';});
for(const b of document.querySelectorAll('[data-command]'))b.onclick=safe(()=>call('text',b.dataset.command));
$('launch').onsubmit=safe(async e=>{e.preventDefault();const data=Object.fromEntries(new FormData(e.target));await call('launch-session',data);});
$('draft').oninput=()=>{dirty=true;$('submit-draft').disabled=true;};
$('save-draft').onclick=safe(async()=>{await call('draft-update',{text:$('draft').value,revision:editRevision});dirty=false;render(await call('state'));});
$('reload-draft').onclick=safe(async()=>{dirty=false;render(await call('state'));});
$('clear-draft').onclick=safe(async()=>{await call('draft-update',{text:'',revision:state.draft.revision});dirty=false;render(await call('state'));});
$('submit-draft').onclick=safe(async()=>{await call('draft-submit',{id:crypto.randomUUID(),sessionId:state.draft.sessionId,revision:state.draft.revision});});
$('close-session').onclick=safe(async()=>{if(selected&&confirm('结束此会话？未完成的 agent 工作将中断。'))await call('close-session',selected);});
async function pairings(){$('pairings').replaceChildren();for(const p of await call('pairing')){const card=document.createElement('div'),img=document.createElement('img'),label=document.createElement('p'),copy=document.createElement('button');img.src=p.qr;img.alt='Qube 配对二维码';label.textContent=p.url;copy.textContent='复制配对数据';copy.onclick=safe(async()=>{await navigator.clipboard.writeText(p.payload);toast('已复制，可在手机手动粘贴配对');});card.append(img,label,copy);$('pairings').append(card);}}
$('refresh-pairing').onclick=safe(pairings);$('revoke-pairing').onclick=safe(async()=>{await call('revoke-pairing');await pairings();});
$('save-config').onclick=safe(async()=>{const c=JSON.parse($('config').value);await call('save-config',c);toast('设置已保存');});
$('speech-check').onclick=safe(async()=>toast(await call('speech-health')));$('unload-model').onclick=safe(async()=>{await call('speech-unload');toast('语音模型已释放');});
(async()=>{render(await call('state'));$('config').value=JSON.stringify(await call('config'),null,2);})().catch(()=>{});
