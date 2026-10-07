import type { Reminder } from './index.js';
const digits:Record<string,number>={'零':0,'〇':0,'一':1,'二':2,'两':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9};
function number(s:string):number { if(/^\d+$/.test(s))return Number(s);if(s.includes('十')){const [a,b]=s.split('十');return (a?digits[a]:1)*10+(b?digits[b]:0);} return digits[s]??NaN; }
export type TimeResult={ok:true;reminder:Reminder;summary:string}|{ok:false;question:string};
export function parseReminder(input:string,now:number,id:string,defaultAdvance=10):TimeResult {
 let text=input.replace(/[零〇一二两三四五六七八九十]+/g,s=>String(number(s)));
 const advance=text.match(/提前(\d+)分钟/); const advanceMinutes=advance?Number(advance[1]):defaultAdvance;
 if(advanceMinutes>10080)return {ok:false,question:'提前量最多为七天，请重新指定。'};
 text=text.replace(/提前\d+分钟(?:提醒我?)?/g,'');
 const relative=text.match(/(\d+)(分钟|小时)后/);
 const shifted=new Date(now+8*3600000); let dueAt=0; let repeat:Reminder['repeat']='none';
 if(relative){ dueAt=now+Number(relative[1])*(relative[2]==='小时'?3600000:60000);text=text.replace(relative[0],''); }
 else {
  const match=text.match(/(上午|早上|下午|晚上|中午)?\s*(\d{1,2})(?:点|[:：])(半|\d{1,2}分?)?/);
  if(!match)return {ok:false,question:'请说完整时间，例如：明天下午三点开会，提前十分钟提醒。'};
  let hour=Number(match[2]);const minute=match[3]==='半'?30:Number(match[3]?.replace('分','')||0);
  if(hour>23||minute>59)return {ok:false,question:'时间无效，请重新指定小时和分钟。'};
  if(!match[1]&&hour>=1&&hour<=12&&!match[0].includes(':')&&!match[0].includes('：'))return {ok:false,question:'请补充上午或下午，或使用二十四小时制时间。'};
  if(['下午','晚上'].includes(match[1])&&hour<12)hour+=12;
  if(match[1]==='中午'&&hour<11)hour+=12;
  if(['上午','早上'].includes(match[1])&&hour===12)hour=0;
  let y=shifted.getUTCFullYear(),m=shifted.getUTCMonth(),d=shifted.getUTCDate();
  const date=text.match(/(?:(\d{4})年)?(\d{1,2})月(\d{1,2})[日号]/);
  const week=text.match(/每周([1-6日天])/);
  if(date){ y=date[1]?Number(date[1]):y;m=Number(date[2])-1;d=Number(date[3]); const c=new Date(Date.UTC(y,m,d));if(c.getUTCMonth()!==m||c.getUTCDate()!==d)return {ok:false,question:'日期不存在，请重新指定。'};text=text.replace(date[0],''); }
  else if(week){repeat='weekly';const target=/[日天]/.test(week[1])?0:Number(week[1]);d+=(target-shifted.getUTCDay()+7)%7;text=text.replace(week[0],'');}
  else if(text.includes('每天')){repeat='daily';text=text.replace('每天','');}
  else if(text.includes('后天')){d+=2;text=text.replace('后天','');}
  else if(text.includes('明天')){d++;text=text.replace('明天','');}
  else if(text.includes('今天'))text=text.replace('今天','');
  else return {ok:false,question:'请补充哪一天，例如今天、明天或每周一。'};
  dueAt=Date.UTC(y,m,d,hour,minute)-8*3600000;
  if(dueAt<=now&&repeat!=='none')dueAt+=repeat==='daily'?86400000:7*86400000;
  text=text.replace(match[0],'');
 }
 if(dueAt<=now)return {ok:false,question:'这个时间已经过去，请指定未来时间。'};
 const title=text.replace(/设置|新增|创建|一个|备忘录|备忘|提醒我|提醒/g,'').replace(/^[，,\s]+|[，,\s]+$/g,'').trim();
 if(!title)return {ok:false,question:'请补充要提醒的事项。'};
 const r:Reminder={id,title,dueAt,advanceMinutes,repeat,zone:'Asia/Shanghai',status:'active',revision:0};
 const when=new Date(dueAt).toLocaleString('zh-CN',{timeZone:r.zone,hour12:false});
 return {ok:true,reminder:r,summary:`${when}，${title}，提前${advanceMinutes}分钟提醒${repeat==='daily'?'，每天重复':repeat==='weekly'?'，每周重复':''}。请在手机确认。`};
}
