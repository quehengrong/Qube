import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
export const ConfigSchema=z.object({
 port:z.number().int().min(1024).max(65535).default(19431),
 pythonPath:z.string().default(''),
 defaultAdvance:z.number().int().min(0).max(10080).default(10),
 applications:z.record(z.object({path:z.string().min(1),args:z.array(z.string()).default([])})).default({}),
 music:z.object({path:z.string().default(''),processName:z.string().default('cloudmusic'),dailyName:z.string().default('每日推荐'),playlists:z.record(z.string()).default({}),playName:z.string().default('播放'),pauseName:z.string().default('暂停'),nextName:z.string().default('下一首'),previousName:z.string().default('上一首')}).default({}),
 night:z.object({toggleName:z.string().default('夜间模式')}).default({})
});
export type Config=z.infer<typeof ConfigSchema>;
export function loadConfig(dir:string):Config {mkdirSync(dir,{recursive:true});try{return ConfigSchema.parse(JSON.parse(readFileSync(join(dir,'config.json'),'utf8')));}catch{return ConfigSchema.parse({});}}
export function saveJson(dir:string,name:string,value:unknown){writeFileSync(join(dir,name),JSON.stringify(value,null,2),{mode:0o600});}
