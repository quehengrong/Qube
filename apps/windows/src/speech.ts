import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
export class Speech {
 private process:ChildProcess|null=null;private token=randomBytes(32).toString('hex');
 status='未启动';
 start(python:string,dir:string){this.stop();if(!python){this.status='请配置语音环境的 Python 路径';return;}this.status='加载中';
 const child=spawn(python,[join(dir,'server.py')],{env:{...process.env,QUBE_SPEECH_TOKEN:this.token},windowsHide:true,stdio:'ignore'});this.process=child;
 child.on('error',e=>{this.status=`启动失败：${e.message}`;});child.on('exit',code=>{if(this.process===child){this.process=null;this.status=`服务已退出 (${code})`;}});
 }
 async health(){try{const r=await fetch('http://127.0.0.1:19432/health',{headers:{Authorization:`Bearer ${this.token}`},signal:AbortSignal.timeout(2000)});if(!r.ok)throw Error();const data=await r.json() as {loaded:boolean};this.status=data.loaded?'模型就绪':'服务就绪，首次识别时加载模型';}catch{}return this.status;}
 async transcribe(pcm:string){const bytes=Buffer.from(pcm,'base64');if(bytes.length<3200||bytes.length>1920000||bytes.length%2)throw new Error('录音长度须为 0.1–60 秒');
 const r=await fetch('http://127.0.0.1:19432/transcribe',{method:'POST',headers:{Authorization:`Bearer ${this.token}`,'Content-Type':'application/octet-stream'},body:bytes,signal:AbortSignal.timeout(120000)}).catch(()=>{throw Error('本地语音服务不可用，请检查 Python 路径、模型和 CUDA 环境');});
 if(!r.ok)throw new Error(`语音识别失败 (${r.status})，请检查模型和 CUDA 环境`);const data=await r.json() as {text:string};return data.text;
 }
 async unload(){const r=await fetch('http://127.0.0.1:19432/unload',{method:'POST',headers:{Authorization:`Bearer ${this.token}`},signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('释放模型失败');this.status='模型已释放';}
 stop(){this.process?.kill();this.process=null;}
}
