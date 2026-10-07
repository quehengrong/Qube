export type Intent =
 | {kind:'mode';mode:'dictation'|'command'} | {kind:'submit'|'clear'|'cancel'|'reminders'}
 | {kind:'night';enabled:boolean} | {kind:'music';action:'play'|'pause'|'next'|'previous'|'daily'|'playlist';name?:string}
 | {kind:'open';name:string} | {kind:'reminder';text:string} | {kind:'unknown'};
export function intent(text:string):Intent {
 const s=text.trim().replace(/[。！!，,？?]+$/g,'');
 if (['进入编程听写','开始听写','编程听写'].includes(s)) return {kind:'mode',mode:'dictation'};
 if (['退出编程听写','退出听写','控制模式'].includes(s)) return {kind:'mode',mode:'command'};
 if(s==='确认发送') return {kind:'submit'};
 if(s==='清空草稿') return {kind:'clear'};
 if(s==='取消') return {kind:'cancel'};
 if(/^(查看|列出|打开)(提醒|备忘录|提醒清单)$/.test(s)) return {kind:'reminders'};
 if(/^(打开|开启|切换到?)?夜间模式$/.test(s)) return {kind:'night',enabled:true};
 if(/^(关闭夜间模式|(打开|开启|切换到?)?白天模式)$/.test(s)) return {kind:'night',enabled:false};
 if(/提醒|备忘/.test(s)) return {kind:'reminder',text:s};
 if(/^(播放|打开)(每日推荐)$/.test(s)) return {kind:'music',action:'daily'};
 if(/^(暂停|暂停音乐)$/.test(s)) return {kind:'music',action:'pause'};
 if(/^(播放音乐|继续播放)$/.test(s)) return {kind:'music',action:'play'};
 if(/^(下一首|上一首)$/.test(s)) return {kind:'music',action:s==='下一首'?'next':'previous'};
 const list=s.match(/^播放(?:我的)?(?:收藏)?歌单(.+)$/) ?? s.match(/^播放(?:我的)?收藏(.*)$/);
 if(list) return {kind:'music',action:'playlist',name:list[1].trim()||'我的收藏'};
 const app=s.match(/^打开(.+)$/); if(app) return {kind:'open',name:app[1].trim()};
 return {kind:'unknown'};
}
