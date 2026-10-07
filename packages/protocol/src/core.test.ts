import {describe,it,expect} from 'vitest';
import {DraftController} from './draft.js';
import {parseReminder} from './time.js';
import {intent} from './intents.js';
import {ClientMessageSchema} from './index.js';
const now=Date.parse('2026-10-07T10:00:00+08:00');const id='62dc932b-c78c-4e1e-845b-f9ddac1ebc5d';
describe('reminders',()=>{
 it('parses Chinese tomorrow afternoon and advance',()=>{const r=parseReminder('明天下午三点开会，提前十分钟提醒我',now,id);expect(r.ok).toBe(true);if(r.ok){expect(r.reminder.dueAt).toBe(Date.parse('2026-10-08T15:00:00+08:00'));expect(r.reminder.title).toBe('开会');expect(r.reminder.advanceMinutes).toBe(10);}});
 it('asks for ambiguity, past and impossible dates',()=>{for(const text of ['明天三点开会提醒我','今天上午九点提醒我开会','2月31日15:00提醒开会'])expect(parseReminder(text,now,id).ok).toBe(false);});
 it('handles relative times and next weekly occurrence',()=>{let r=parseReminder('二十分钟后提醒我喝水',now,id);expect(r.ok&&r.reminder.dueAt).toBe(now+1200000);r=parseReminder('每周一下午三点提醒我开会',now,id);expect(r.ok&&r.reminder.dueAt).toBe(Date.parse('2026-10-12T15:00:00+08:00'));});
});
describe('draft safety',()=>{
 it('never writes to a changed target, stale draft, disconnected target or duplicate request',async()=>{const d=new DraftController();const calls:string[]=[];const write=async(id:string,text:string)=>{calls.push(`${id}:${text}`);};d.select('a');d.append('修复测试');const rev=d.state.revision;d.select('b');await expect(d.submit('1','a',rev,write)).rejects.toThrow();await expect(d.submit('2','b',rev,write)).rejects.toThrow();d.disconnect();await expect(d.submit('3','b',d.state.revision,write)).rejects.toThrow();d.select('a');const r=d.state.revision;await d.submit('4','a',r,write);await d.submit('4','a',r,write);expect(calls).toEqual(['a:修复测试']);expect(d.state.text).toBe('');});
 it('preserves draft on failure without replaying uncertain submissions',async()=>{const d=new DraftController();d.select('a');d.append('hello');const rev=d.state.revision;await expect(d.submit('a','a',rev,async()=>{throw Error('exited');})).rejects.toThrow();expect(d.state.text).toBe('hello');expect(await d.submit('a','a',rev,async()=>{throw Error('must not write');})).toBe(false);});
});
it('only standalone confirm submits',()=>{expect(intent('确认发送').kind).toBe('submit');expect(intent('请发送一个请求到服务器').kind).toBe('unknown');});
it('rejects malformed network messages',()=>{expect(ClientMessageSchema.safeParse({id,type:'audio',payload:{pcm:'x',sampleRate:44100}}).success).toBe(false);});
it('preserves Chinese numerals in reminder content',()=>{const r=parseReminder('明天下午三点提醒我买三本书',now,id);expect(r.ok&&r.reminder.title).toBe('买三本书');});
it('keeps edits made while a terminal submission is pending',async()=>{
 const d=new DraftController();d.select('a');d.append('first');let done:()=>void=()=>{};
 const sending=d.submit('one','a',d.state.revision,()=>new Promise<void>(resolve=>{done=resolve;}));
 await expect(d.submit('two','a',d.state.revision,async()=>{})).rejects.toThrow('正在提交');
 d.update('next draft');done();await sending;expect(d.state.text).toBe('next draft');
});
