import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import type {Config} from './config.js';
import type {Intent} from '@qube/protocol/dist/intents.js';
const exec=promisify(execFile);
export async function control(i:Intent,c:Config,helper:string):Promise<string>{
 if(process.platform!=='win32')throw new Error('电脑控制仅在 Windows 11 可用');
 if(i.kind==='open'){
  const app=c.applications[i.name];if(!app)throw new Error(`请先在设置中配置软件：${i.name}`);
  if(!existsSync(app.path))throw new Error('配置的软件路径不存在');
  await new Promise<void>((resolve,reject)=>{const p=spawn(app.path,app.args,{detached:true,stdio:'ignore',shell:false});p.once('error',reject);p.once('spawn',()=>{p.unref();resolve();});});return `已启动${i.name}`;
 }
 if(!existsSync(helper))throw new Error('Windows 控件适配程序未安装，请使用完整安装包或先编译 native');
 const request=i.kind==='night'?{action:'night',enabled:i.enabled,name:c.night.toggleName}:i.kind==='music'?{action:'music',command:i.action,name:i.name,config:c.music}:null;
 if(!request)throw new Error('此指令尚不支持');
 const {stdout}=await exec(helper,[JSON.stringify(request)],{timeout:20000,maxBuffer:1024*1024,windowsHide:true});
 const result=JSON.parse(stdout);if(!result.ok)throw new Error(result.message);return result.message;
}
