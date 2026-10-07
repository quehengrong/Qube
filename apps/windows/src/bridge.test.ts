import {it,expect} from 'vitest';
import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {randomUUID} from 'node:crypto';import WebSocket from 'ws';import {Bridge} from './bridge.js';
it('authenticates TLS clients, deduplicates requests and revokes credentials',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'qube-test-'));const bridge=new Bridge(dir,29431);let ws:WebSocket|undefined;const received:string[]=[];
 try{await bridge.start();bridge.handler=async m=>{received.push(m.id);};const p=bridge.pairing()[0];expect(p.fingerprint).toMatch(/^[0-9a-f]{64}$/);
 ws=new WebSocket('wss://127.0.0.1:29431/bridge',{rejectUnauthorized:false});await new Promise<void>((resolve,reject)=>{ws!.once('open',resolve);ws!.once('error',reject);});
 const connected=new Promise(resolve=>bridge.once('connected',resolve));ws.send(JSON.stringify({id:randomUUID(),type:'hello',payload:{token:p.token,version:1}}));await connected;
 const id=randomUUID(),m=JSON.stringify({id,type:'text',payload:{text:'打开夜间模式'}});ws.send(m);ws.send(m);await new Promise(r=>setTimeout(r,60));expect(received).toEqual([id]);
 const closed=new Promise(resolve=>ws!.once('close',resolve));bridge.rotate();await closed;expect(bridge.pairing()[0].token).not.toBe(p.token);
 }finally{ws?.terminate();bridge.stop();rmSync(dir,{recursive:true,force:true});}
},15000);
