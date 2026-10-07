import type * as pty from 'node-pty';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import type { SessionInfo } from '@qube/protocol';
import { z } from 'zod';
export const LaunchSchema=z.object({name:z.string().min(1).max(80),environment:z.enum(['wsl','powershell']),agent:z.enum(['codex','claude']),cwd:z.string().min(1).max(2000),distribution:z.string().max(100).default('')});
export class Sessions extends EventEmitter {
 private all=new Map<string,{info:SessionInfo;pty:pty.IPty;output:string}>();
 list(){return [...this.all.values()].map(s=>s.info);}
 launch(input:unknown){
  if(process.platform!=='win32')throw new Error('CLI 托管需要 Windows 11，请在目标电脑启动 Qube');
  const c=LaunchSchema.parse(input);let executable:string,args:string[],cwd:string|undefined;
  if(c.environment==='wsl'){executable='wsl.exe';args=[...(c.distribution?['--distribution',c.distribution]:[]),'--cd',c.cwd,'--exec',c.agent];}
  else{executable='powershell.exe';args=['-NoLogo','-NoProfile','-Command',`& ${c.agent}; exit $LASTEXITCODE`];cwd=c.cwd;}
  const native=require('node-pty') as typeof pty;
  const id=randomUUID();const child=native.spawn(executable,args,{name:'xterm-256color',cols:100,rows:28,cwd,env:process.env as Record<string,string>});
  const entry={info:{id,name:c.name,environment:c.environment,agent:c.agent,cwd:c.cwd,alive:true},pty:child,output:''};this.all.set(id,entry);
  child.onData(data=>{entry.output=(entry.output+data).slice(-200000);this.emit('output',{sessionId:id,data});});
  child.onExit(()=>{entry.info.alive=false;this.emit('changed');});this.emit('changed');return entry.info;
 }
 output(id:string){return this.all.get(id)?.output??'';}
 input(id:string,data:string){const s=this.all.get(id);if(!s?.info.alive)throw new Error('会话已结束，请重新启动并选择目标');s.pty.write(data);}
 resize(id:string,cols:number,rows:number){this.all.get(id)?.pty.resize(Math.max(20,Math.min(300,cols)),Math.max(5,Math.min(100,rows)));}
 async submit(id:string,text:string){
  if(/[\x00-\x08\x0b-\x1f\x7f]/.test(text.replace(/\r/g,'')))throw new Error('草稿含不允许的终端控制字符');
  this.input(id,`\x1b[200~${text.replace(/\r\n/g,'\n').replace(/\r/g,'\n')}\x1b[201~`);
  await new Promise(r=>setTimeout(r,100));this.input(id,'\r');
 }
 close(id:string){const s=this.all.get(id);if(s?.info.alive)s.pty.kill();}
 dispose(){for(const id of this.all.keys())this.close(id);}
}
