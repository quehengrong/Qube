import type * as pty from 'node-pty';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {EventEmitter} from 'node:events';
import {mkdirSync,writeFileSync,readFileSync,existsSync,statSync} from 'node:fs';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import type {SessionInfo,Attachment,AgentStatus} from '@qube/protocol';
import {z} from 'zod';
import {CodexAgent,command,quote} from './agent.js';
const require=createRequire(import.meta.url),exec=promisify(execFile);
export const LaunchSchema=z.object({name:z.string().min(1).max(80),environment:z.enum(['wsl','powershell']),agent:z.enum(['codex','claude']),cwd:z.string().min(1).max(2000),distribution:z.string().max(100).default(''),enhanced:z.boolean().default(true)});
export class Sessions extends EventEmitter {
 private all=new Map<string,{info:SessionInfo;pty?:pty.IPty;agent?:CodexAgent;output:string;events?:string;offset:number;timer?:NodeJS.Timeout}>();
 private dir='';private python='python';
 configure(dir:string,python:string){this.dir=dir;this.python=python||'python';}
 list(){return [...this.all.values()].map(s=>s.info);}
 get(id:string){const s=this.all.get(id);if(!s?.info.alive)throw Error('会话已结束，请重新启动并选择目标');return s;}
 approvals(){return [...this.all.values()].flatMap(s=>s.agent?[...s.agent.requests].map(([key,r])=>({sessionId:s.info.id,key,...r})):[]);}
 private status(id:string,status:AgentStatus,detail:string){const s=this.all.get(id);if(!s)return;const changed=s.info.status!==status;s.info.status=status;s.info.detail=detail;this.emit('changed');if(changed)this.emit('agent-event',{sessionId:id,name:s.info.name,status,message:detail});}
 async path(info:SessionInfo,path:string){if(info.environment!=='wsl')return path;const {stdout}=await exec('wsl.exe',[...(info.distribution?['--distribution',info.distribution]:[]),'--exec','wslpath','-a',path],{windowsHide:true,timeout:10000});return stdout.trim();}
 async launch(input:unknown){
  if(process.platform!=='win32')throw Error('CLI 托管需要 Windows 11，请在目标电脑启动 Qube');
  const c=LaunchSchema.parse(input),id=randomUUID();const entry:{info:SessionInfo;pty?:pty.IPty;agent?:CodexAgent;output:string;events?:string;offset:number;timer?:NodeJS.Timeout}={info:{...c,id,alive:true,status:'starting'},output:'',offset:0};this.all.set(id,entry);
  const output=(data:string)=>{entry.output=(entry.output+data).slice(-200000);this.emit('output',{sessionId:id,data});};
  try{
   if(c.agent==='codex'&&c.enhanced){const a=entry.agent=new CodexAgent(entry.info);a.on('output',output);a.on('status',(s,d)=>this.status(id,s,d));a.on('requests',()=>this.emit('changed'));a.on('exit',()=>{entry.info.alive=false;this.status(id,'exited','会话已退出');});await a.ready;}
   else {
    const args:string[]=[];
    if(c.agent==='claude'&&c.enhanced){
     const folder=join(this.dir,'hooks',id);mkdirSync(folder,{recursive:true});const events=join(folder,'events.jsonl'),script=join(folder,'relay.py'),settings=join(folder,'settings.json');writeFileSync(events,'');
     writeFileSync(script,"import sys,json,os\np=json.load(sys.stdin)\nf=sys.argv[1]\nwith open(f,'a',encoding='utf-8') as out: out.write(json.dumps(p,ensure_ascii=False)+'\\n')\n");
     const scriptPath=await this.path(entry.info,script),eventPath=await this.path(entry.info,events);const hookCommand=c.environment==='wsl'?['python3',scriptPath,eventPath].map(quote).join(' '):[this.python,scriptPath,eventPath].map(x=>'"'+x.replaceAll('"','')+'"').join(' ');
     const hooks=Object.fromEntries(['UserPromptSubmit','PreToolUse','PostToolUse','PermissionRequest','Notification','Stop','StopFailure','SessionEnd'].map(event=>[event,[{hooks:[{type:'command',command:hookCommand,timeout:5}]}]]));writeFileSync(settings,JSON.stringify({hooks}));args.push('--settings',await this.path(entry.info,settings));entry.events=events;entry.timer=setInterval(()=>this.pollHooks(id),250);
    }
    const cmd=command(entry.info,c.agent,args);entry.pty=(require('node-pty') as typeof pty).spawn(cmd.exe,cmd.args,{name:'xterm-256color',cols:100,rows:28,cwd:cmd.cwd,env:process.env as Record<string,string>});entry.pty.onData(output);entry.pty.onExit(()=>{if(entry.timer)clearInterval(entry.timer);entry.info.alive=false;this.status(id,'exited','会话已退出');});this.status(id,c.enhanced?'idle':'unknown',c.enhanced?'等待 CLI 就绪':'终端兼容模式，状态不可用');
   }
   this.emit('changed');return entry.info;
  }catch(e){entry.info.alive=false;entry.info.status='failed';if(entry.timer)clearInterval(entry.timer);entry.agent?.close();this.emit('changed');throw e;}
 }
 private pollHooks(id:string){const s=this.all.get(id);if(!s?.events)return;try{const raw=readFileSync(s.events,'utf8');const end=raw.lastIndexOf('\n')+1;if(end<=s.offset)return;const lines=raw.slice(s.offset,end).split('\n').filter(Boolean);s.offset=end;for(const line of lines){const p=JSON.parse(line);switch(p.hook_event_name){case 'UserPromptSubmit':case 'PreToolUse':case 'PostToolUse':this.status(id,p.hook_event_name==='PreToolUse'&&p.tool_name==='AskUserQuestion'?'waiting_input':'running','正在处理');break;case 'PermissionRequest':this.status(id,'waiting_approval','请在电脑终端处理授权');break;case 'Notification':if(p.notification_type==='permission_prompt')this.status(id,'waiting_approval','请在电脑终端处理授权');else if(p.notification_type==='idle_prompt')this.status(id,'waiting_input','请查看电脑会话');break;case 'Stop':this.status(id,'completed','本轮回复结束');break;case 'StopFailure':this.status(id,'failed','本轮请求失败，请查看终端');break;case 'SessionEnd':this.status(id,'exited','会话已结束');}}}catch{this.status(id,'unknown','状态事件读取失败，请查看终端');}}
 output(id:string){return this.all.get(id)?.output??'';}
 input(id:string,data:string){const s=this.get(id);if(!s.pty)throw Error('增强会话请使用草稿和授权卡片');s.pty.write(data);}
 resize(id:string,cols:number,rows:number){const s=this.all.get(id);s?.pty?.resize(Math.max(20,Math.min(300,cols)),Math.max(5,Math.min(100,rows)));}
 respond(id:string,key:string,answer:any){this.get(id).agent?.respond(key,answer);}
 async submit(id:string,text:string,attachments:Attachment[]=[]){
  const s=this.get(id);if(['running','waiting_input','waiting_approval','starting'].includes(s.info.status??''))throw Error('会话正在工作或等待处理，请先查看电脑');
  const images:Attachment[]=[];for(const a of attachments){if(!existsSync(a.path)||statSync(a.path).size!==a.bytes)throw Error('附件缺失或已变化，请重新截图');images.push({...a,path:await this.path(s.info,a.path)});}
  if(s.agent){await s.agent.submit(text,images);return;}
  if(images.length&&s.info.agent==='codex')throw Error('Codex 图片任务需要增强会话');
  const input=text+(images.length?'\n请查看这些本地图片：\n'+images.map(a=>a.path).join('\n'):'');
  if(/[\x00-\x08\x0b-\x1f\x7f]/.test(input.replace(/\r/g,'')))throw Error('草稿含不允许的终端控制字符');
  this.input(id,`\x1b[200~${input.replace(/\r\n/g,'\n').replace(/\r/g,'\n')}\x1b[201~`);await new Promise(r=>setTimeout(r,100));this.input(id,'\r');
 }
 close(id:string){const s=this.all.get(id);if(s?.info.alive){s.pty?.kill();s.agent?.close();}if(s?.timer)clearInterval(s.timer);}
 dispose(){for(const id of this.all.keys())this.close(id);}
}
