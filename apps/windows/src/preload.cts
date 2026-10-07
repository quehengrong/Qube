import {contextBridge,ipcRenderer} from 'electron';
const allowed=new Set(['feature','windows','approval','state','config','save-config','pairing','revoke-pairing','launch-session','select-session','close-session','terminal-output','terminal-input','terminal-resize','draft-update','draft-submit','text','speech-health','speech-unload']);
contextBridge.exposeInMainWorld('qube',{
 invoke:(name:string,arg:unknown)=>{if(!allowed.has(name))throw Error('Unsupported operation');return ipcRenderer.invoke(name,arg);},
 on:(name:string,fn:(data:unknown)=>void)=>{if(!['state','terminal-output'].includes(name))throw Error('Unsupported event');const listener=(_event:unknown,data:unknown)=>fn(data);ipcRenderer.on(name,listener);return ()=>ipcRenderer.removeListener(name,listener);}
});
