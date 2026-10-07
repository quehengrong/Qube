import { app, BrowserWindow, ipcMain, Menu, Tray, nativeImage } from 'electron';
import { randomUUID } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
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
const pendingReminders=new Set<string>();let dir:string;let config:ReturnType<typeof loadConfig>;
const single=app.requestSingleInstanceLock();if(!single)app.quit();
app.on('second-instance',()=>{win?.show();win?.focus();});
function state(){return {face,message:lastMessage,connected:bridge?.connected??false,sessions:sessions.list(),draft:draft.state,speech:speech.status};}
function publish(){const s=state();win?.webContents.send('state',s);bridge?.broadcast({id:randomUUID(),type:'state',payload:s});saveJson(dir,'draft.json',{text:draft.state.text});}
function feedback(message:string,error=false,id:string=randomUUID()){lastMessage=message;face=error?'error':'success';bridge?.broadcast({id,type:error?'error':'result',payload:{message}});publish();}
async function textCommand(text:string,id:string){
 const parsed=intent(text);if(parsed.kind==='mode'){draft.state.mode=parsed.mode;feedback(parsed.mode==='dictation'?'已进入编程听写，请先选择目标会话':'已回到电脑控制模式');return;}
 if(draft.state.mode==='dictation'){
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
async function submit(id:string,sessionId:string,revision:number){const sent=await draft.submit(id,sessionId,revision,(sid,text)=>sessions.submit(sid,text));if(sent)feedback('已发送到选定会话',false,id);else publish();}
async function message(m:ClientMessage){
 try{switch(m.type){
  case 'audio':{face='thinking';publish();const text=await speech.transcribe(m.payload.pcm);if(!text.trim())throw Error('没有识别到语音，请重试');bridge.broadcast({id:m.id,type:'transcript',payload:{text}});await textCommand(text,m.id);break;}
  case 'text':await textCommand(m.payload.text,m.id);break;
  case 'select-session':select(m.payload.sessionId);break;
  case 'draft-update':draft.update(m.payload.text,m.payload.revision);publish();break;
  case 'draft-submit':await submit(m.id,m.payload.sessionId,m.payload.revision);break;
  case 'reminder-result':if(pendingReminders.delete(m.id))feedback(m.payload.message,!m.payload.ok);break;
 }}catch(e){feedback(e instanceof Error?e.message:'操作失败',true,m.id);}
}
function select(id:string){if(!sessions.list().some(s=>s.id===id&&s.alive))throw Error('目标会话不存在或已结束');draft.select(id);publish();}
function speechDir(){return app.isPackaged?join(process.resourcesPath,'speech'):join(base,'..','..','..','services','speech');}
async function start(){dir=app.getPath('userData');config=loadConfig(dir);try{const saved=JSON.parse(readFileSync(join(dir,'draft.json'),'utf8'));draft.update(z.string().max(16000).parse(saved.text));}catch{}
 win=new BrowserWindow({width:1280,height:860,minWidth:980,minHeight:640,title:'Qube',backgroundColor:'#0b1118',webPreferences:{preload:join(base,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
 win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',e=>e.preventDefault());
 win.on('close',e=>{if(!quitting){e.preventDefault();win.hide();}});
 bridge=new Bridge(dir,config.port);bridge.handler=message;bridge.on('connected',()=>{face='idle';publish();});bridge.on('disconnected',()=>{draft.disconnect();face='offline';publish();});
 sessions.on('changed',()=>{if(draft.state.sessionId&&!sessions.list().some(s=>s.id===draft.state.sessionId&&s.alive))draft.disconnect();publish();});sessions.on('output',data=>win.webContents.send('terminal-output',data));
 const handlers:Record<string,(x:any)=>any>={
  state:()=>state(),config:()=>config,
  'save-config':(x)=>{config=ConfigSchema.parse(x);saveJson(dir,'config.json',config);speech.start(config.pythonPath,speechDir());return config;},
  pairing:async()=>Promise.all(bridge.pairing().map(async p=>({payload:JSON.stringify(p),url:p.url,qr:await QRCode.toDataURL(JSON.stringify(p))}))),
  'revoke-pairing':()=>{bridge.rotate();return true;},
  'launch-session':x=>sessions.launch(x),
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
 speech.start(config.pythonPath,speechDir());publish();
}
app.on('before-quit',()=>{quitting=true;sessions.dispose();speech.stop();bridge?.stop();});
if(single)app.whenReady().then(start).catch(e=>{console.error('Qube startup failed:',e.message);app.exit(1);});
