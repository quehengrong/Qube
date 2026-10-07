import {z} from 'zod';
export const ProjectSchema=z.object({name:z.string().min(1).max(80),cwd:z.string().min(1),environment:z.enum(['wsl','powershell']),distribution:z.string().default(''),agent:z.enum(['codex','claude']),editor:z.string().default(''),playlist:z.string().default('')});
export type SceneStep={name:string;required:boolean;status:'pending'|'running'|'success'|'failed';error?:string};
export class SceneRunner {
 current:{id:string;name:string;status:string;steps:SceneStep[]}|null=null;
 private actions:(()=>Promise<unknown>)[]=[];private busy=false;
 constructor(private change:()=>void){}
 async run(id:string,name:string,steps:{name:string;required:boolean;run:()=>Promise<unknown>}[]){if(this.busy)throw Error('场景正在执行');if(this.current?.id===id)return;this.current={id,name,status:'running',steps:steps.map(s=>({name:s.name,required:s.required,status:'pending'}))};this.actions=steps.map(s=>s.run);await this.execute();}
 async retry(){if(!this.current||this.busy)throw Error('没有可重试的场景');await this.execute();}
 private async execute(){this.busy=true;this.current!.status='running';try{for(let i=0;i<this.current!.steps.length;i++){const s=this.current!.steps[i];if(s.status==='success')continue;s.status='running';delete s.error;this.change();try{await this.actions[i]();s.status='success';}catch(e){s.status='failed';s.error=String(e);if(s.required)break;}finally{this.change();}}this.current!.status=this.current!.steps.every(s=>s.status==='success')?'success':this.current!.steps.some(s=>s.status==='success')?'partial':'failed';}finally{this.busy=false;this.change();}}
}
