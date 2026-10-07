import { createServer, type Server } from 'node:https';
import { networkInterfaces } from 'node:os';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes, randomUUID, X509Certificate, timingSafeEqual } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import selfsigned from 'selfsigned';
import { EventEmitter } from 'node:events';
import {ClientMessageSchema,type ClientMessage,type ServerMessage} from '@qube/protocol';
export class Bridge extends EventEmitter {
 private server!:Server;private wss!:WebSocketServer;private peers=new Set<WebSocket>();private token='';private fingerprint='';private seen=new Set<string>();
 constructor(private dir:string,private port:number){super();}
 async start(){let key:string,cert:string;
  try{key=readFileSync(join(this.dir,'tls.key'),'utf8');cert=readFileSync(join(this.dir,'tls.pem'),'utf8');}
  catch{const p=await selfsigned.generate([{name:'commonName',value:'Qube'}],{keySize:2048,algorithm:'sha256',extensions:[{name:'basicConstraints',cA:true}]});key=p.private;cert=p.cert;writeFileSync(join(this.dir,'tls.key'),key,{mode:0o600});writeFileSync(join(this.dir,'tls.pem'),cert,{mode:0o600});}
  this.fingerprint=new X509Certificate(cert).fingerprint256.replaceAll(':','').toLowerCase();
  try{this.token=readFileSync(join(this.dir,'pairing.key'),'utf8');}catch{this.rotate();}
  this.server=createServer({key,cert},(_req,res)=>{res.writeHead(404);res.end();});
  this.wss=new WebSocketServer({noServer:true,maxPayload:2600000,perMessageDeflate:false});
  this.server.on('upgrade',(req,socket,head)=>{if(req.url!=='/bridge'||req.headers.origin){socket.destroy();return;}this.wss.handleUpgrade(req,socket,head,ws=>this.wss.emit('connection',ws));});
  this.wss.on('connection',(ws:WebSocket)=>{let authenticated=false,busy=false;const timer=setTimeout(()=>{if(!authenticated)ws.close(1008,'Authentication required');},5000);
   ws.on('message',async raw=>{
    try{const msg=ClientMessageSchema.parse(JSON.parse(raw.toString()));
     if(!authenticated){if(msg.type!=='hello'||!this.matches(msg.payload.token))throw Error('配对失效');if(this.peers.size){ws.close(1008,'One phone at a time');return;}authenticated=true;clearTimeout(timer);this.peers.add(ws);this.emit('connected');return;}
     if(msg.type==='ping'){this.send(ws,{id:msg.id,type:'pong',payload:{}});return;}
     if(msg.type==='hello')return;
     if(msg.type!=='reminder-result'){if(this.seen.has(msg.id))return;if(busy)throw Error('正在处理上一条指令');this.seen.add(msg.id);if(this.seen.size>1024)this.seen.delete(this.seen.values().next().value!);}
     busy=true;try{await this.handler?.(msg);}finally{busy=false;}
    }catch(error){this.send(ws,{id:randomUUID(),type:'error',payload:{message:error instanceof Error?error.message:'消息无效'}});if(!authenticated)ws.close(1008);}
   });
   ws.on('error',()=>{});ws.on('close',()=>{clearTimeout(timer);if(this.peers.delete(ws))this.emit('disconnected');});
  });
  await new Promise<void>((resolve,reject)=>{this.server.once('error',reject);this.server.listen(this.port,'0.0.0.0',resolve);});
 }
 handler?: (message:ClientMessage)=>Promise<void>;
 private matches(value:string){const a=Buffer.from(value),b=Buffer.from(this.token);return a.length===b.length&&timingSafeEqual(a,b);}
 private send(ws:WebSocket,m:ServerMessage){if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify(m));}
 broadcast(m:ServerMessage){for(const ws of this.peers)this.send(ws,m);}
 get connected(){return this.peers.size>0;}
 pairing(){const ips=Object.values(networkInterfaces()).flat().filter(x=>x?.family==='IPv4'&&!x.internal).map(x=>x!.address);return ips.map(ip=>({version:1,url:`wss://${ip}:${this.port}/bridge`,token:this.token,fingerprint:this.fingerprint}));}
 rotate(){this.token=randomBytes(32).toString('hex');writeFileSync(join(this.dir,'pairing.key'),this.token,{mode:0o600});for(const ws of this.peers)ws.close(1008,'Pairing revoked');}
 stop(){for(const ws of this.peers)ws.close();this.wss?.close();this.server?.close();}
}
