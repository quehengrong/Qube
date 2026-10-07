import type { Draft } from './index.js';
export class DraftController {
 state:Draft={text:'',revision:0,sessionId:null,mode:'command',confirmedConnection:false};
 private sent=new Set<string>();private sending=false;
 select(id:string){this.state={...this.state,sessionId:id,revision:this.state.revision+1,confirmedConnection:true};}
 disconnect(){this.state.confirmedConnection=false;this.state.revision++;}
 update(text:string,revision=this.state.revision){if(revision!==this.state.revision)throw new Error('草稿已变化，请刷新后重试');if(text.length>16000)throw new Error('草稿过长');this.state.text=text;this.state.revision++;}
 append(text:string){this.update(this.state.text?`${this.state.text}\n${text}`:text);}
 async submit(requestId:string,sessionId:string,revision:number,write:(id:string,text:string)=>Promise<void>){
  if(this.sent.has(requestId))return false;
  if(this.sending)throw new Error('正在提交，请勿重复发送');
  if(!this.state.confirmedConnection||this.state.sessionId!==sessionId)throw new Error('请重新选择目标会话');
  if(revision!==this.state.revision)throw new Error('草稿或目标已变化，请重新确认');
  if(!this.state.text.trim())throw new Error('草稿为空');
  const text=this.state.text;this.sending=true;
  // Mark before writing: delivery may be uncertain after a transport failure. Never auto-replay.
  this.sent.add(requestId);if(this.sent.size>512)this.sent.delete(this.sent.values().next().value!);
  try{await write(sessionId,text);if(this.state.revision===revision)this.update('');return true;}
  finally{this.sending=false;}
 }
}
