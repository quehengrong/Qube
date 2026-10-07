import {describe,it,expect} from 'vitest';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {SceneRunner} from './scenes.js';
import {Store} from './store.js';
import {command} from './agent.js';
describe('scene execution',()=>{
 it('stops dependencies, retries only unfinished steps, ignores duplicate run ids',async()=>{const s=new SceneRunner(()=>{});let count=0,fail=true,last=0;const steps=[{name:'first',required:true,run:async()=>{count++;}},{name:'second',required:true,run:async()=>{if(fail)throw Error('failed');}},{name:'third',required:false,run:async()=>{last++;}}];await s.run('a','work',steps);expect(count).toBe(1);expect(last).toBe(0);expect(s.current?.status).toBe('partial');fail=false;await s.retry();expect(count).toBe(1);expect(last).toBe(1);expect(s.current?.status).toBe('success');await s.run('a','work',steps);expect(count).toBe(1);});
 it('continues after optional failure',async()=>{const s=new SceneRunner(()=>{});let called=false;await s.run('b','rest',[{name:'music',required:false,run:async()=>{throw Error('not available');}},{name:'timer',required:true,run:async()=>{called=true;}}]);expect(called).toBe(true);expect(s.current?.status).toBe('partial');});
});
it('persists events and documents without leaking full task contents to history',()=>{const dir=mkdtempSync(join(tmpdir(),'qube-store-'));let s=new Store(join(dir,'db'));s.put('draft',{text:'private'});s.event('submit','success','sent','session','request');s.close();s=new Store(join(dir,'db'));expect(s.get('draft')).toEqual({text:'private'});expect(s.history()[0].target).toBe('session');expect(JSON.stringify(s.history())).not.toContain('private');s.clearHistory();expect(s.history()).toEqual([]);s.close();rmSync(dir,{recursive:true});});
it('quotes shell arguments without expanding command substitutions',()=>{const c=command({environment:'wsl',cwd:'/tmp',distribution:'Ubuntu'},'codex',["a'$(touch nope)"]);expect(c.args.at(-1)).toContain("'a'\\''$(touch nope)'");expect(c.args).toContain('Ubuntu');});
