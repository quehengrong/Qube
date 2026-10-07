import { app, BrowserWindow, ipcMain, Menu, Tray, nativeImage } from 'electron';
import { randomUUID } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync,existsSync } from 'node:fs';
import { Store } from './store.js';
import { ContextCapture,Helper,native } from './features.js';
import { SceneRunner } from './scenes.js';
import QRCode from 'qrcode';
import { z } from 'zod';
import { DraftController } from '@qube/protocol/dist/draft.js';
import { intent } from '@qube/protocol/dist/intents.js';
import { parseReminder } from '@qube/protocol/dist/time.js';
import type {ClientMessage,FaceState} from '@qube/protocol';
import { Bridge } from './bridge.js';
import { Sessions } from './sessions.js';
import { ConfigSchema, loadConfig, saveJson } from './config.js';
import { Speech } from './speech.js';
import { control } from './control.js';
if(process.env.QUBE_USER_DATA)app.setPath('userData',process.env.QUBE_USER_DATA);
const base=dirname(fileURLToPath(import.meta.url));let win:BrowserWindow;let tray:Tray;let bridge:Bridge;let quitting=false;
const sessions=new Sessions(),draft=new DraftController(),speech=new Speech();let face:FaceState='idle';let lastMessage='欢迎来到 Qube';
const pendingReminders=new Set<string>();let dir:string;let config:ReturnType<typeof loadConfig>;let store:Store;let capture:ContextCapture;const helperAgent=new Helper();let metrics:unknown=null;let rewrite:{text:string;before:string;revision:number;sessionId:string|null}|null=null;const localPending=new Map<string,{resolve:(message:string)=>void,reject:(e:Error)=>void,timer:NodeJS.Timeout}>();
const scenes=new SceneRunner(()=>publish());
function nativePath(){return app.isPackaged?join(process.resourcesPath,'native','Qube.Native.exe'):join(base,'..','native','publish','Qube.Native.exe');}
const single=app.requestSingleInstanceLock();if(!single)app.quit();
app.on('second-instance',()=>{win?.show();win?.focus();});
function state(){return {face,message:lastMessage,connected:bridge?.connected??false,sessions:sessions.list(),draft:draft.state,speech:speech.status,protocol:2,capabilities:['agents','draft-history','attachments','scenes','phone-local','metrics','history'],approvals:sessions.approvals(),scene:scenes.current,metrics,history:store?.history()??[],helper:{running:helperAgent.running,result:helperAgent.result},rewrite};}
function publish(){const s=state();win?.webContents.send('state',s);bridge?.broadcast({id:randomUUID(),type:'state',payload:s});store?.put('drafts',draft.export());}
function feedback(message:string,error=false,id:string=randomUUID()){lastMessage=message;face=error?'error':'success';store?.event('操作反馈',error?'failed':'success',message,draft.state.sessionId??'',id);bridge?.broadcast({id,type:error?'error':'result',payload:{message}});publish();}
async function textCommand(text:string,id:string){
 const assistant=text.startsWith('助手，')||text.startsWith('助手,');if(assistant)text=text.slice(3);
 if(draft.state.mode==='dictation'&&!assistant&&draft.edit(text)){lastMessage='草稿已修改，可撤销';publish();return;}
 if((draft.state.mode==='command'||assistant)&&await enhancedCommand(text,id))return;
 const parsed=intent(text);if(parsed.kind==='mode'){draft.state.mode=parsed.mode;feedback(parsed.mode==='dictation'?'已进入编程听写，请先选择目标会话':'已回到电脑控制模式');return;}
 if(draft.state.mode==='dictation'&&!assistant){
  if(parsed.kind==='submit'){await submit(id,draft.state.sessionId??'',draft.state.revision);return;}
  if(parsed.kind==='clear'||parsed.kind==='cancel'){draft.update('');publish();return;}
  draft.append(text);lastMessage='草稿已更新，确认后发送';face='idle';publish();return;
 }
 if(parsed.kind==='reminder'){
  if(!bridge.connected)throw Error('请先连接手机，提醒由手机保存');
  const result=parseReminder(text,Date.now(),randomUUID(),config.defaultAdvance);if(!result.ok)throw Error(result.question);
  pendingReminders.add(id);bridge.broadcast({id,type:'reminder-proposal',payload:{reminder:result.reminder,summary:result.summary}});lastMessage='等待手机确认提醒';publish();return;
 }
 if(parsed.kind==='reminders'){bridge.broadcast({id,type:'reminder-action',payload:{action:'list'}});return;}
 if(parsed.kind==='unknown'||parsed.kind==='cancel'||parsed.kind==='submit'||parsed.kind==='clear')throw Error('未识别指令。可以说：打开软件、播放每日推荐、进入编程听写，或明天下午三点提醒我开会。');
 face='executing';publish();const helper=app.isPackaged?join(process.resourcesPath,'native','Qube.Native.exe'):join(base,'..','native','publish','Qube.Native.exe');
 feedback(await control(parsed,config,helper),false,id);
}
async function submit(id:string,sessionId:string,revision:number){const sent=await draft.submit(id,sessionId,revision,(sid,text,images)=>sessions.submit(sid,text,images),()=>store.put('drafts',draft.export()));if(sent)feedback('已发送到选定会话',false,id);else publish();}
async function message(m:ClientMessage){
 try{switch(m.type){
  case 'wake':await capture.foreground().catch(()=>{});break;
  case 'feature':await feature(m.payload,m.id);if(m.payload.action==='note-task')bridge.broadcast({id:m.id,type:'result',payload:{message:'灵感已加入草稿，确认后发送'}});break;
  case 'local-result':{const p=localPending.get(m.id);if(p){clearTimeout(p.timer);localPending.delete(m.id);store.event('手机操作',m.payload.ok?'success':'failed',m.payload.message,'phone',m.id);m.payload.ok?p.resolve(m.payload.message):p.reject(Error(m.payload.message));}break;}
  case 'audio':{face='thinking';publish();const text=await speech.transcribe(m.payload.pcm);if(!text.trim())throw Error('没有识别到语音，请重试');bridge.broadcast({id:m.id,type:'transcript',payload:{text}});await textCommand(text,m.id);break;}
  case 'text':await textCommand(m.payload.text,m.id);break;
  case 'select-session':select(m.payload.sessionId);break;
  case 'draft-update':draft.update(m.payload.text,m.payload.revision);publish();break;
  case 'draft-submit':await submit(m.id,m.payload.sessionId,m.payload.revision);break;
  case 'reminder-result':if(pendingReminders.delete(m.id))feedback(m.payload.message,!m.payload.ok);break;
 }}catch(e){feedback(e instanceof Error?e.message:'操作失败',true,m.id);}
}
function select(id:string){if(!sessions.list().some(s=>s.id===id&&s.alive))throw Error('目标会话不存在或已结束');draft.select(id);publish();}
async function local(action:string,payload:Record<string,unknown>={},id:string=randomUUID()):Promise<string>{
 if(!bridge.connected||bridge.version<2)throw Error('请连接新版 Qube 手机应用');
 return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{localPending.delete(id);store.event('手机操作','unknown','未收到手机回执，请查看手机，勿重复执行','phone',id);reject(Error('未收到手机回执，请查看手机确认结果'));},15000);localPending.set(id,{resolve,reject,timer});bridge.broadcast({id,type:'local-command',payload:{action,...payload}});});
}
function targetInfo(){const id=draft.state.sessionId;if(!id)throw Error('请先选择 Agent 会话');return sessions.get(id).info;}
async function feature(raw:any,id:string){
 const p=z.object({action:z.string(),text:z.string().max(16000).optional(),target:z.string().max(200).optional(),revision:z.number().int().optional()}).parse(raw);
 if(p.revision!==undefined)draft.check(p.revision);
 switch(p.action){
  case 'undo':draft.undo();break;case 'redo':draft.redo();break;
  case 'capture':{const sid=draft.state.sessionId,rev=draft.state.revision;const a=await capture.capture(p.target);if(sid!==draft.state.sessionId||rev!==draft.state.revision)throw Error('草稿已变化，请重新截图');draft.attach(a);lastMessage='截图已加入草稿，确认后发送';break;}
  case 'remove-attachment':draft.removeAttachment(p.target??'');break;
  case 'helper-cancel':helperAgent.cancel();break;
  case 'helper-append':if(!helperAgent.result)throw Error('没有辅助结果');draft.append(helperAgent.result);break;
  case 'helper':{const info=targetInfo(),revision=draft.state.revision,sessionId=draft.state.sessionId,before=draft.state.text;const source=p.target==='draft'?before:p.target==='clipboard'?await capture.clipboard():await capture.selected();const instruction=p.text??'用中文解释下面的文本';const task=helperAgent.run(info,source,instruction);publish();const result=await task;if(p.target==='draft')rewrite={text:result,before,revision,sessionId};lastMessage='辅助结果已准备，请查看后决定是否加入草稿';break;}
  case 'apply-rewrite':if(!rewrite||rewrite.sessionId!==draft.state.sessionId)throw Error('修改目标已变化');draft.update(rewrite.text,rewrite.revision);rewrite=null;break;
  case 'discard-rewrite':rewrite=null;break;
  case 'note-task':if(!p.text?.trim())throw Error('灵感为空');targetInfo();if(store.get('note-task:'+id))return;draft.append(p.text);store.put('drafts',draft.export());store.put('note-task:'+id,true);lastMessage='灵感已加入目标草稿，确认后发送';break;
  case 'clipboard-append':draft.append(await capture.clipboard());break;
  case 'selection-append':draft.append(await capture.selected());break;
  case 'metrics':metrics=await native(nativePath(),{action:'metrics'});break;
  case 'clear-history':store.clearHistory();break;
  case 'history':break;
  case 'scene':await runScene(p.text??'开始写代码',id);break;
  case 'scene-retry':await scenes.retry();store.event('场景重试',scenes.current!.status,scenes.current!.name);break;
  case 'wake-config':{const phrase=p.text??'';if(!/^[\u4e00-\u9fff]{2,6}$/.test(phrase))throw Error('唤醒词请输入 2～6 个汉字');const url=await speech.keywords(phrase);bridge.broadcast({id,type:'wake-config',payload:url});lastMessage='请在手机试唤醒，确认后保存';break;}
  default:throw Error('不支持的增强操作');
 }
 if(!['metrics','history','clear-history'].includes(p.action))store.event(p.action,'success',lastMessage,draft.state.sessionId??'',id);publish();
}
async function runScene(name:string,id:string){
 if(name==='我要休息'){await scenes.run(id,name,[{name:'暂停音乐',required:false,run:()=>control({kind:'music',action:'pause'},config,nativePath())},{name:'休息五分钟',required:true,run:()=>local('focus-start',{minutes:5,kind:'rest'})}]);}
 else if(name==='开始专注'){await scenes.run(id,name,[{name:'专注四十五分钟',required:true,run:()=>local('focus-start',{minutes:45,kind:'focus'})}]);}
 else{const project=config.projects.find(p=>p.name===config.activeProject)??config.projects[0];if(!project)throw Error('请先在场景设置中配置项目');await scenes.run(id,name,[{name:'打开编辑器',required:!!project.editor,run:async()=>{if(project.editor)return control({kind:'open',name:project.editor},config,nativePath());return '未配置编辑器';}},{name:'选择项目会话',required:true,run:async()=>{const match=sessions.list().find(s=>s.alive&&s.cwd===project.cwd&&s.agent===project.agent&&s.environment===project.environment&&(s.distribution??'')===project.distribution);select((match??await sessions.launch(project)).id);}},{name:'播放歌单',required:false,run:()=>control(project.playlist?{kind:'music',action:'playlist',name:project.playlist}:{kind:'music',action:'daily'},config,nativePath())}]);}
 store.event('工作场景',scenes.current!.status,name,'',id);lastMessage=`${name}：${scenes.current!.status}`;publish();
}
async function enhancedCommand(text:string,id:string):Promise<boolean>{
 const t=text.trim().replace(/[。！!]+$/,'');
 if(['开始写代码','我要休息','开始专注'].includes(t)){await runScene(t,id);return true;}
 if(t==='你刚才做了什么'||t==='你刚才做了什么？'){feedback(store.history(3).map(e=>`${e.action}：${e.message}`).join('；')||'还没有操作记录',false,id);return true;}
 if(/^(截一下|截图)/.test(t)){await feature({action:'capture'},id);if(t!=='截图')draft.append(t);publish();return true;}
 if(t==='把这段加入草稿'){await feature({action:'selection-append'},id);return true;}
 if(t==='解释这段'||t==='翻译一下'){await feature({action:'helper',target:'selection',text:t==='翻译一下'?'将外文翻译成中文；如果原文为中文则翻译成英文。只返回译文。':'用中文解释以下文本'},id);return true;}
 if(/^把这段整理/.test(t)){await feature({action:'helper',target:'draft',text:t+'。只返回修改后的完整草稿。'},id);return true;}
 if(/(电脑状态|哪个程序占内存|显卡现在忙|CPU.*忙)/i.test(t)){await feature({action:'metrics'},id);feedback('电脑状态已更新，请查看状态页',false,id);await local('page',{page:'status'});return true;}
 if(/^记一下[：:,，]/.test(t)){feedback(await local('note-add',{text:t.replace(/^记一下[：:,，]\s*/,''),project:config.activeProject},id),false,id);return true;}
 if(t==='回到眼睛'){await local('page',{page:'eyes'},id);return true;}
 if(['开启安静模式','关闭安静模式'].includes(t)){feedback(await local('quiet',{enabled:t==='开启安静模式'},id),false,id);return true;}
 const duration=t.match(/^(专注|休息)([一二三四五六七八九十百零两\d]+)分钟$/);if(duration){const raw=duration[2];const n=/^\d+$/.test(raw)?Number(raw):chineseMinutes(raw);feedback(await local('focus-start',{kind:duration[1]==='专注'?'focus':'rest',minutes:n},id),false,id);return true;}
 const action=({'暂停计时':'focus-pause','继续计时':'focus-resume','结束专注':'focus-cancel','结束休息':'focus-cancel'} as Record<string,string>)[t];if(action){feedback(await local(action,{},id),false,id);return true;}
 return false;
}
function chineseMinutes(s:string){const digits:Record<string,number>={'零':0,'一':1,'二':2,'两':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9};let n=0,part=0;for(const c of s){if(c==='十'||c==='百'){n+=(part||1)*(c==='十'?10:100);part=0;}else part=digits[c]??0;}return n+part;}
function speechDir(){return app.isPackaged?join(process.resourcesPath,'speech'):join(base,'..','..','..','services','speech');}
async function start(){dir=app.getPath('userData');config=loadConfig(dir);store=new Store(join(dir,'qube.db'));capture=new ContextCapture(nativePath(),dir);sessions.configure(dir,config.pythonPath);const savedDrafts=store.get('drafts');if(savedDrafts)draft.import(savedDrafts);else try{const saved=JSON.parse(readFileSync(join(dir,'draft.json'),'utf8'));draft.update(z.string().max(16000).parse(saved.text));}catch{}
 win=new BrowserWindow({width:1280,height:860,minWidth:980,minHeight:640,title:'Qube',backgroundColor:'#0b1118',webPreferences:{preload:join(base,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
 win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',e=>e.preventDefault());
 win.on('close',e=>{if(!quitting){e.preventDefault();win.hide();}});
 bridge=new Bridge(dir,config.port);bridge.handler=message;bridge.on('connected',()=>{face='idle';publish();});bridge.on('disconnected',()=>{draft.disconnect();face='offline';publish();});
 sessions.on('agent-event',event=>{store.event('Agent 状态',event.status,event.message,event.sessionId);if(['completed','failed','waiting_input','waiting_approval'].includes(event.status)){bridge.broadcast({id:randomUUID(),type:'agent-event',payload:event});lastMessage=`${event.name}：${event.message}`;}if(event.sessionId===draft.state.sessionId)face=event.status==='running'?'thinking':event.status.startsWith('waiting')?'attention':event.status==='completed'?'success':event.status==='failed'?'error':'idle';publish();});
 sessions.on('changed',()=>{if(draft.state.sessionId&&!sessions.list().some(s=>s.id===draft.state.sessionId&&s.alive))draft.disconnect();publish();});sessions.on('output',data=>win.webContents.send('terminal-output',data));
 const handlers:Record<string,(x:any)=>any>={
  state:()=>state(),config:()=>config,
  feature:x=>feature(x,randomUUID()),
  windows:()=>capture.windows(),
  approval:x=>{const p=z.object({sessionId:z.string().uuid(),key:z.string(),answer:z.unknown()}).parse(x);sessions.respond(p.sessionId,p.key,p.answer);},
  'save-config':(x)=>{config=ConfigSchema.parse(x);saveJson(dir,'config.json',config);sessions.configure(dir,config.pythonPath);speech.start(config.pythonPath,speechDir());return config;},
  pairing:async()=>Promise.all(bridge.pairing().map(async p=>({payload:JSON.stringify(p),url:p.url,qr:await QRCode.toDataURL(JSON.stringify(p))}))),
  'revoke-pairing':()=>{bridge.rotate();return true;},
  'launch-session':async x=>{const s=await sessions.launch(x);select(s.id);return s;},
  'select-session':x=>select(z.string().uuid().parse(x)),
  'close-session':x=>sessions.close(z.string().uuid().parse(x)),
  'terminal-output':x=>sessions.output(z.string().uuid().parse(x)),
  'terminal-input':x=>{const p=z.object({id:z.string().uuid(),data:z.string().max(16000)}).parse(x);sessions.input(p.id,p.data);},
  'terminal-resize':x=>{const p=z.object({id:z.string().uuid(),cols:z.number().int(),rows:z.number().int()}).parse(x);sessions.resize(p.id,p.cols,p.rows);},
  'draft-update':x=>{const p=z.object({text:z.string().max(16000),revision:z.number().int()}).parse(x);draft.update(p.text,p.revision);publish();},
  'draft-submit':x=>{const p=z.object({id:z.string().uuid(),sessionId:z.string().uuid(),revision:z.number().int()}).parse(x);return submit(p.id,p.sessionId,p.revision);},
  text:x=>textCommand(z.string().min(1).max(16000).parse(x),randomUUID()),
  'speech-health':()=>speech.health(),'speech-unload':()=>speech.unload()
 };
 for(const [name,fn] of Object.entries(handlers))ipcMain.handle(name,async(event,arg)=>{if(event.sender!==win.webContents||event.senderFrame!==win.webContents.mainFrame)throw Error('Invalid caller');try{return await fn(arg);}catch(e){feedback(e instanceof Error?e.message:'操作失败',true);throw e;}});
 const icon=nativeImage.createFromPath(join(base,'renderer','icon.png')).resize({width:18,height:18});
 tray=new Tray(icon);tray.setToolTip('Qube');tray.setContextMenu(Menu.buildFromTemplate([{label:'打开 Qube',click:()=>win.show()},{label:'退出',click:()=>app.quit()}]));tray.on('double-click',()=>win.show());
 await win.loadFile(join(base,'renderer','index.html'));
 try{await bridge.start();}catch(e){feedback(`连接服务启动失败：${String(e)}`,true);}
 speech.start(config.pythonPath,speechDir());if(process.platform==='win32')setInterval(()=>capture.foreground().catch(()=>{}),1000).unref();publish();
}
app.on('before-quit',()=>{quitting=true;helperAgent.cancel();sessions.dispose();speech.stop();bridge?.stop();});
if(single)app.whenReady().then(start).catch(e=>{console.error('Qube startup failed:',e.message);app.exit(1);});
