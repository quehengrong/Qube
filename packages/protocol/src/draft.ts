import type { Attachment, Draft } from './index.js';
type Snapshot={text:string;attachments:Attachment[]};
type Document={current:Snapshot;undo:Snapshot[];redo:Snapshot[]};
const empty=():Snapshot=>({text:'',attachments:[]});
export class DraftController {
 state:Draft={...empty(),revision:0,sessionId:null,mode:'command',confirmedConnection:false};
 private documents=new Map<string,Document>();
 private sent=new Set<string>();private sending=false;
 private key(){return this.state.sessionId??'inbox';}
 private doc(){let d=this.documents.get(this.key());if(!d){d={current:empty(),undo:[],redo:[]};this.documents.set(this.key(),d);}return d;}
 private snapshot():Snapshot{return structuredClone({text:this.state.text,attachments:this.state.attachments});}
 private commit(next:Snapshot){const d=this.doc();d.undo.push(this.snapshot());d.undo=d.undo.slice(-50);d.redo=[];this.restore(next);}
 private restore(s:Snapshot){Object.assign(this.state,structuredClone(s));this.state.revision++;this.doc().current=this.snapshot();}
 saved(){return [...this.documents].filter(([key,d])=>key!==this.key()&&(d.current.text||d.current.attachments.length)).map(([id,d])=>({id,preview:d.current.text.slice(0,100),images:d.current.attachments.length}));}
 recover(id:string){if(id===this.key())throw Error('不能恢复到同一个草稿');const d=this.documents.get(id);if(!d)throw Error('保存的草稿不存在');if(this.state.text||this.state.attachments.length)throw Error('当前草稿非空，请先保存或清空');this.commit(d.current);this.documents.delete(id);}
 select(id:string){this.doc().current=this.snapshot();const inbox=this.state.sessionId===null?this.snapshot():null;this.state.sessionId=id;const d=this.doc();if(inbox&&(inbox.text||inbox.attachments.length)&&!d.current.text&&!d.current.attachments.length){d.current=inbox;this.documents.set('inbox',{current:empty(),undo:[],redo:[]});}this.restore(d.current);this.state.confirmedConnection=true;}
 disconnect(){this.state.confirmedConnection=false;this.state.revision++;}
 check(revision:number){if(revision!==this.state.revision)throw new Error('草稿已变化，请刷新后重试');}
 update(text:string,revision=this.state.revision){this.check(revision);if(text.length>16000)throw new Error('草稿过长');this.commit({...this.snapshot(),text});}
 append(text:string){this.update(this.state.text?`${this.state.text}\n${text}`:text);}
 attach(a:Attachment){if(this.state.attachments.length>=4)throw Error('每份草稿最多 4 张图片');this.commit({...this.snapshot(),attachments:[...this.state.attachments,a]});}
 removeAttachment(id:string){this.commit({...this.snapshot(),attachments:this.state.attachments.filter(a=>a.id!==id)});}
 undo(){const d=this.doc(),s=d.undo.pop();if(!s)throw Error('没有可以撤销的编辑');d.redo.push(this.snapshot());this.restore(s);}
 redo(){const d=this.doc(),s=d.redo.pop();if(!s)throw Error('没有可以重做的编辑');d.undo.push(this.snapshot());this.restore(s);}
 edit(command:string):boolean {
  const c=command.trim().replace(/[。！？!]+$/,'');
  if(c==='撤销刚才的修改'){this.undo();return true;}
  if(c==='重做'){this.redo();return true;}
  if(c==='撤销刚才一句'){this.update(this.state.text.split('\n').slice(0,-1).join('\n'));return true;}
  if(c==='把最后一句删掉'){this.update(this.state.text.trimEnd().replace(/[^。！？.!?\n]+[。！？.!?]?$/u,'').trimEnd());return true;}
  let match=c.match(/^把\s*(.+?)\s*改成\s*(.+)$/u);if(!match){const m=c.match(/^这里是\s*(.+?)\s*[，,]\s*不是\s*(.+)$/u);if(m)match=[m[0],m[2],m[1]];}
  if(match){const [,from,to]=match;const count=this.state.text.split(from).length-1;if(count!==1)throw Error(count?'找到多处原文，请在草稿中选择或明确修改范围':'没有找到原文，草稿未修改');this.update(this.state.text.replace(from,to));return true;}return false;
 }
 export(){this.doc().current=this.snapshot();return {documents:[...this.documents],sent:[...this.sent]};}
 import(value:any){if(!Array.isArray(value?.documents))return;for(const [k,d] of value.documents){if(typeof k==='string'&&typeof d?.current?.text==='string')this.documents.set(k,d);}this.sent=new Set(value.sent??[]);const inbox=this.documents.get('inbox');if(inbox)this.restore(inbox.current);}
 async submit(requestId:string,sessionId:string,revision:number,write:(id:string,text:string,attachments:Attachment[])=>Promise<void>,checkpoint?:()=>void){
  if(this.sent.has(requestId))return false;
  if(this.sending)throw new Error('正在提交，请勿重复发送');
  if(!this.state.confirmedConnection||this.state.sessionId!==sessionId)throw new Error('请重新选择目标会话');
  this.check(revision);if(!this.state.text.trim()&&!this.state.attachments.length)throw new Error('草稿为空');
  const content=this.snapshot();this.sending=true;this.sent.add(requestId);if(this.sent.size>512)this.sent.delete(this.sent.values().next().value!);
  try{checkpoint?.();await write(sessionId,content.text,content.attachments);const d=this.documents.get(sessionId)!;d.undo=[];d.redo=[];if(this.state.sessionId===sessionId&&this.state.revision===revision)this.restore(empty());else if(this.state.sessionId!==sessionId&&JSON.stringify(d.current)===JSON.stringify(content))d.current=empty();return true;}finally{this.sending=false;}
 }
}
