import {spawn, type ChildProcessWithoutNullStreams} from 'node:child_process';
import {EventEmitter} from 'node:events';
import {createInterface} from 'node:readline';
import type {SessionInfo,Attachment} from '@qube/protocol';
export function quote(s:string){return `'${s.replaceAll("'", "'\\''")}'`;}
export function command(c:Pick<SessionInfo,'environment'|'cwd'|'distribution'>,exe:string,args:string[]){return c.environment==='wsl'?{exe:'wsl.exe',args:[...(c.distribution?['--distribution',c.distribution]:[]),'--cd',c.cwd,'--exec','bash','-lic',`exec ${[exe,...args].map(quote).join(' ')}`],cwd:undefined}:{exe:'powershell.exe',args:['-NoLogo','-NoProfile','-Command',`& ${[exe,...args].map(s=>"'"+s.replaceAll("'","''")+"'").join(' ')}; exit $LASTEXITCODE`],cwd:c.cwd};}
export class CodexAgent extends EventEmitter {
 private child:ChildProcessWithoutNullStreams;private next=0;private pending=new Map<number,{resolve:(x:any)=>void;reject:(e:Error)=>void;timer:NodeJS.Timeout}>();
 thread='';turn='';requests=new Map<string,{id:any;method:string;params:any}>();ready:Promise<void>;private closed=false;
 constructor(c:SessionInfo,helper=false,transport?:ChildProcessWithoutNullStreams){super();const cmd=command(c,'codex',['app-server',...(helper?['-c','web_search="disabled"','-c','features.shell_tool=false','-c','features.apply_patch_freeform=false','-c','mcp_servers={}']:[])]);this.child=transport??spawn(cmd.exe,cmd.args,{cwd:cmd.cwd,windowsHide:true,stdio:'pipe'});
  const lines=createInterface({input:this.child.stdout});lines.on('line',line=>{try{this.receive(JSON.parse(line));}catch(e){this.emit('diagnostic',String(e));}});
  this.child.stderr.on('data',b=>this.emit('diagnostic',b.toString()));this.child.on('error',e=>this.end(e));this.child.on('exit',()=>this.end(Error('Codex 服务已退出')));
  this.ready=this.initialize(c,helper);this.ready.catch(e=>{this.emit('status','failed',e.message);this.close();});
 }
 private end(e:Error){if(this.closed)return;this.closed=true;for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(e);}this.pending.clear();this.emit('exit');}
 private send(value:unknown){if(this.closed||!this.child.stdin.writable)throw Error('Codex 服务不可用');this.child.stdin.write(JSON.stringify(value)+'\n');}
 request(method:string,params:unknown):Promise<any>{return new Promise((resolve,reject)=>{const id=++this.next;const timer=setTimeout(()=>{this.pending.delete(id);reject(Error(`${method} 超时；请检查 CLI 版本与登录状态`));},30000);this.pending.set(id,{resolve,reject,timer});try{this.send({id,method,params});}catch(e){clearTimeout(timer);this.pending.delete(id);reject(e);}});}
 private async initialize(c:SessionInfo,helper:boolean){await this.request('initialize',{clientInfo:{name:'qube',version:'0.2.0'},capabilities:{experimentalApi:true}});this.send({method:'initialized'});const r=await this.request('thread/start',{cwd:c.cwd,...(helper?{sandbox:'read-only',approvalPolicy:'never',ephemeral:true,developerInstructions:'Only transform the supplied text. Do not use tools, inspect files or run commands.'}:{})});this.thread=r.thread.id;this.emit('status','idle','已就绪');}
 private receive(m:any){if(m.id!==undefined&&!m.method){const p=this.pending.get(m.id);if(p){clearTimeout(p.timer);this.pending.delete(m.id);if(m.error)p.reject(Error(m.error.message));else p.resolve(m.result);}return;}
  const p=m.params??{};
  if(m.id!==undefined&&m.method){const key=String(m.id);this.requests.set(key,{id:m.id,method:m.method,params:p});this.emit('status',m.method.includes('requestUserInput')?'waiting_input':'waiting_approval','需要在电脑处理');this.emit('requests');return;}
  switch(m.method){
   case 'turn/started':this.turn=p.turn.id;this.emit('status','running','正在处理');break;
   case 'item/agentMessage/delta':this.emit('output',p.delta??'');break;
   case 'item/commandExecution/outputDelta':this.emit('output',p.delta??'');break;
   case 'turn/completed':this.turn='';this.requests.clear();this.emit('requests');this.emit('status',p.turn.status==='completed'?'completed':p.turn.status==='interrupted'?'interrupted':'failed',p.turn.error?.message??'本轮回复结束');this.emit('completed',p.turn);break;
   case 'error':this.emit('diagnostic',p.error?.message??'Agent 错误');break;
  }
 }
 async submit(text:string,attachments:Attachment[]){await this.ready;if(this.turn||this.requests.size)throw Error('Agent 正在工作或等待处理，请先完成当前轮次');const r=await this.request('turn/start',{threadId:this.thread,input:[...(text?[{type:'text',text}]:[]),...attachments.map(a=>({type:'localImage',path:a.path}))]});this.turn=r.turn.id;this.emit('status','running','任务已接收');}
 respond(key:string,answer:any){const req=this.requests.get(key);if(!req)throw Error('此请求已结束');let result:any;if(req.method==='item/commandExecution/requestApproval'||req.method==='item/fileChange/requestApproval'){if(!['accept','decline'].includes(answer))throw Error('无效授权选择');result={decision:answer};}else if(req.method==='item/tool/requestUserInput'){if(!answer||typeof answer!=='object'||!answer.answers)throw Error('请填写问题回答');result=answer;}else{if(answer!=='decline')throw Error('此授权类型尚不支持，请拒绝并在 CLI 操作');this.send({id:req.id,error:{code:-32601,message:'Unsupported interactive request'}});this.requests.delete(key);this.emit('requests');return;}this.send({id:req.id,result});this.requests.delete(key);this.emit('requests');this.emit('status','running','已回复');}
 reject(key:string){const r=this.requests.get(key);if(r){this.send({id:r.id,error:{code:-32601,message:'Interactive tools are disabled in Qube helper sessions'}});this.requests.delete(key);}}
 async interrupt(){if(this.turn)await this.request('turn/interrupt',{threadId:this.thread,turnId:this.turn});}
 close(){this.child.kill();}
}
