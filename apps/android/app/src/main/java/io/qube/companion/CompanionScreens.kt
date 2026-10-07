package io.qube.companion

import android.graphics.BitmapFactory
import android.util.Base64
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.json.JSONObject
import org.json.JSONArray
import java.time.*
import java.time.format.DateTimeFormatter
import java.util.UUID

fun agentLabel(s:String)=when(s){"running"->"工作中";"waiting_input"->"等待回答";"waiting_approval"->"等待授权";"completed"->"本轮结束";"failed"->"失败";"idle"->"待命";"starting"->"启动中";"exited"->"已退出";else->"状态未知"}
fun feature(app:QubeApp,action:String,text:String?=null,target:String?=null,revision:Int?=null,id:String=UUID.randomUUID().toString()):Boolean{
 if(app.ui.value.protocol<2){app.error("请先升级电脑 Qube");return false};return app.bridge.send("feature",JSONObject().put("action",action).apply{if(text!=null)put("text",text);if(target!=null)put("target",target);if(revision!=null)put("revision",revision)},id)
}
fun localAction(app:QubeApp,action:String,minutes:Int=45,kind:String="focus"){app.scope.launch{try{app.companion.execute(UUID.randomUUID().toString(),JSONObject().put("action",action).put("minutes",minutes).put("kind",kind))}catch(e:Exception){app.error(e.message?:"操作失败")}}}
@Composable fun NotesScreen(app:QubeApp){
 val rows by app.db.companion().watch("note").collectAsStateWithLifecycle(emptyList());var text by remember{mutableStateOf("")};var project by remember{mutableStateOf("")};var search by remember{mutableStateOf("")};var editing by remember{mutableStateOf<String?>(null)};var reminderNote by remember{mutableStateOf<JSONObject?>(null)};var time by remember{mutableStateOf(formatTime(System.currentTimeMillis()+3600000))}
 Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp)){
  Text("灵感 · 手机本地保存",style=MaterialTheme.typography.titleLarge)
  OutlinedTextField(text,{text=it},label={Text("随手记下想法")},modifier=Modifier.fillMaxWidth())
  Row{OutlinedTextField(project,{project=it},label={Text("项目（留空为收件箱）")});Button(onClick={val value=text;val id=editing?:UUID.randomUUID().toString();app.scope.launch{try{app.companion.note(value,project,id);text="";editing=null}catch(e:Exception){app.error(e.message?:"保存失败")}}}){Text(if(editing==null)"保存灵感" else "保存修改")}}
  OutlinedTextField(search,{search=it},label={Text("搜索内容或项目")})
  for(row in rows){val n=JSONObject(row.json);if(n.optBoolean("archived")||!(n.optString("text")+n.optString("project")).contains(search,true))continue
   Card(Modifier.fillMaxWidth().padding(vertical=4.dp)){Column(Modifier.padding(12.dp)){Text(n.optString("text"));Text(n.optString("project").ifBlank{"收件箱"});Row(Modifier.horizontalScroll(rememberScrollState())){
    TextButton(onClick={editing=row.id;text=n.getString("text");project=n.optString("project")}){Text("编辑")}
    TextButton(onClick={reminderNote=n;time=formatTime(System.currentTimeMillis()+3600000)}){Text(if(n.has("reminder"))"已关联提醒" else "转提醒")}
    TextButton(enabled=!n.has("task"),onClick={val id=UUID.nameUUIDFromBytes(("task:"+row.id).toByteArray()).toString();app.prefs().edit().putString("note-task:$id",row.id).apply();feature(app,"note-task",n.getString("text"),id=id)}){Text(if(n.has("task"))"已加入草稿" else "转任务草稿")}
    TextButton(onClick={app.scope.launch{app.companion.archive(row.id)}}){Text("归档")}
   }}}
  }
 }
 reminderNote?.let{n->AlertDialog(onDismissRequest={reminderNote=null},title={Text("将灵感转为提醒")},text={Column{Text(n.getString("text"));OutlinedTextField(time,{time=it},label={Text("上海时间 yyyy-MM-dd HH:mm")})}},confirmButton={TextButton(onClick={app.scope.launch{try{check(!n.has("reminder")){"此灵感已有提醒，请到提醒页修改"};val due=LocalDateTime.parse(time,DateTimeFormatter.ofPattern("uuuu-MM-dd HH:mm").withResolverStyle(java.time.format.ResolverStyle.STRICT)).atZone(ZoneId.of("Asia/Shanghai")).toInstant().toEpochMilli();val r=Reminder(title=n.getString("text"),dueAt=due);app.alarms.save(r);app.companion.link(n.getString("id"),"reminder",r.id);reminderNote=null}catch(e:Exception){app.error(e.message?:"时间无效")}}}){Text("确认保存")}},dismissButton={TextButton(onClick={reminderNote=null}){Text("取消")}})}
}
@Composable fun FocusScreen(app:QubeApp,state:UiState){var minutes by remember{mutableStateOf("45")};var now by remember{mutableLongStateOf(System.currentTimeMillis())};LaunchedEffect(Unit){while(true){delay(1000);now=System.currentTimeMillis()}};val f=runCatching{JSONObject(state.focus)}.getOrNull()
 Column(Modifier.padding(20.dp).verticalScroll(rememberScrollState())){Text("专注与休息",style=MaterialTheme.typography.headlineMedium);Text("计时由手机运行，电脑关机不影响");val left=f?.let{app.companion.remaining(it).coerceAtLeast(0)/1000}?:0;Text(if(f?.optString("status") in listOf("running","paused"))"${left/60}:${(left%60).toString().padStart(2,'0')} · ${f?.optString("status")}" else "准备好再开始",style=MaterialTheme.typography.displayMedium,modifier=Modifier.padding(20.dp));Text("${formatTime(now)}",style=MaterialTheme.typography.bodySmall)
 OutlinedTextField(minutes,{minutes=it},label={Text("分钟")});Row{Button(onClick={localAction(app,"focus-start",minutes.toIntOrNull()?:45)}){Text("开始专注")};TextButton(onClick={localAction(app,"focus-start",5,"rest")}){Text("休息5分钟")};TextButton(onClick={localAction(app,"focus-pause")}){Text("暂停")};TextButton(onClick={localAction(app,"focus-resume")}){Text("继续")};TextButton(onClick={localAction(app,"focus-cancel")}){Text("结束")}}
 Text("专注时，Agent 完成与授权请求只显示通知。重要提醒和计时结束仍可播报。")}
}
@Composable fun StatusScreen(app:QubeApp,state:UiState){LaunchedEffect(state.connected){while(state.connected){feature(app,"metrics");delay(2000)}}
 Column(Modifier.fillMaxSize().padding(18.dp).verticalScroll(rememberScrollState())){Text("电脑状态",style=MaterialTheme.typography.headlineMedium);Text(if(state.connected)"每两秒更新" else "电脑离线，以下为上次采样");val m=runCatching{JSONObject(state.metrics)}.getOrNull();if(m!=null){Text("采样：${formatTime(m.optLong("at"))}");Text("CPU：${m.optDouble("cpu").let{if(it.isNaN())"不可用" else "%.1f%%".format(it)}}");m.optJSONObject("memory")?.let{Text("内存：%.1f / %.1f GB".format(it.optDouble("used")/1073741824,it.optDouble("total")/1073741824))};val gpu=m.optJSONArray("gpu");if(gpu!=null)for(i in 0 until gpu.length()){val g=gpu.getJSONObject(i);Text("GPU $i：${g.optString("utilization")}%，${g.optString("temperature")}℃，显存 ${g.optString("memoryUsedMB")} / ${g.optString("memoryTotalMB")} MB")};Text("CPU 温度：当前接口不支持");Text(m.optString("gpuError").takeUnless{it=="null"}?:"");Text("内存占用前五");m.optJSONArray("processes")?.let{a->for(i in 0 until a.length()){val p=a.getJSONObject(i);Text("${p.optString("name")}：%.0f MB".format(p.optDouble("bytes")/1048576))}}}else Text("尚无采样");TextButton(onClick={app.ui.value=app.ui.value.copy(page="eyes")}){Text("回到眼睛")}}
}
@Composable fun HistoryScreen(app:QubeApp){val rows by app.db.companion().watch("history").collectAsStateWithLifecycle(emptyList());var filter by remember{mutableStateOf("")};var clear by remember{mutableStateOf(false)}
 Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp)){Row{Text("最近操作",style=MaterialTheme.typography.titleLarge);TextButton(onClick={clear=true}){Text("清空")}};OutlinedTextField(filter,{filter=it},label={Text("筛选操作、会话或结果")});for(row in rows.filter{it.json.contains(filter,true)}.take(200)){val e=JSONObject(row.json);Card(Modifier.fillMaxWidth().padding(vertical=4.dp)){Column(Modifier.padding(10.dp)){Text("${e.optString("action")} · ${e.optString("status")}");Text(e.optString("message"));Text("${formatTime(e.optLong("at"))} · ${e.optString("target")} · ${e.optString("source")}",style=MaterialTheme.typography.bodySmall)}}}}
 if(clear)AlertDialog(onDismissRequest={clear=false},title={Text("清空操作历史？")},text={Text("电脑在线时会同时清空电脑历史。")},confirmButton={TextButton(onClick={app.scope.launch{app.db.companion().clearHistory()};if(app.ui.value.connected)feature(app,"clear-history");clear=false}){Text("清空")}},dismissButton={TextButton(onClick={clear=false}){Text("取消")}})
}
@Composable fun DraftExtras(app:QubeApp,state:UiState){
 Row(Modifier.horizontalScroll(rememberScrollState())){for((action,label) in listOf("undo" to "撤销","redo" to "重做","capture" to "截取窗口","clipboard-append" to "加入剪贴板")){TextButton(onClick={feature(app,action,revision=state.revision)}){Text(label)}};TextButton(onClick={feature(app,"helper","用中文解释以下文本","clipboard")}){Text("解释剪贴板")};TextButton(onClick={feature(app,"helper","外文翻译成中文，中文翻译成英文，只返回译文","clipboard")}){Text("翻译剪贴板")}}
 val images=runCatching{JSONArray(state.attachments)}.getOrDefault(JSONArray());Row(Modifier.horizontalScroll(rememberScrollState())){for(i in 0 until images.length()){val a=images.getJSONObject(i);Column{val bitmap=remember(a.optString("id")){runCatching{val data=Base64.decode(a.getString("preview").substringAfter(','),Base64.DEFAULT);BitmapFactory.decodeByteArray(data,0,data.size)}.getOrNull()};bitmap?.let{Image(it.asImageBitmap(),a.optString("name"),Modifier.width(200.dp).height(110.dp))};Text(a.optString("name"));TextButton(onClick={feature(app,"remove-attachment",target=a.getString("id"),revision=state.revision)}){Text("移除")}}}}
 if(state.helperRunning){Text("辅助会话处理中…");TextButton(onClick={feature(app,"helper-cancel")}){Text("取消辅助任务")}}
 if(state.helper.isNotBlank()){Text(state.helper);TextButton(onClick={feature(app,"helper-append",revision=state.revision)}){Text("加入草稿")}}
 if(state.rewrite.isNotBlank()){val r=JSONObject(state.rewrite);Text("原文：${r.optString("before")}\n修改：${r.optString("text")}");Row{TextButton(onClick={feature(app,"apply-rewrite")}){Text("应用修改")};TextButton(onClick={feature(app,"discard-rewrite")}){Text("放弃修改")}}}
}
@Composable fun ProfileSettings(app:QubeApp,state:UiState){
 var name by remember{mutableStateOf(app.prefs().getString("name","Qube")!!)};var phrase by remember{mutableStateOf(app.prefs().getString("wakePhrase","小机小机")!!)};var color by remember{mutableStateOf(app.prefs().getString("eyeColor","#73EDD0")!!)};var speed by remember{mutableFloatStateOf(app.prefs().getFloat("speed",1f))};var volume by remember{mutableFloatStateOf(app.prefs().getFloat("volume",.8f))}
 Text("我的小伙伴",style=MaterialTheme.typography.titleLarge);Row{OutlinedTextField(name,{name=it},label={Text("名字")});OutlinedTextField(color,{color=it},label={Text("眼睛颜色 #RRGGBB")})}
 Row{for(c in listOf("#73EDD0","#82B9FF","#FFBADE","#FFC777"))TextButton(onClick={color=c}){Text(c)}}
 Text("语速");Slider(speed,{speed=it},valueRange=.5f..1.5f);Text("音量");Slider(volume,{volume=it})
 Row(Modifier.horizontalScroll(rememberScrollState())){for(v in app.voices())TextButton(onClick={app.prefs().edit().putString("voice",v).apply();app.say("你好，我是你的桌面伙伴","preview")}){Text(v)}}
 Row{Button(onClick={try{android.graphics.Color.parseColor(color);require(name.isNotBlank());app.prefs().edit().putString("name",name).putString("eyeColor",color).putFloat("speed",speed).putFloat("volume",volume).apply();app.ui.value=app.ui.value.copy(profileRevision=state.profileRevision+1);app.say("角色设置已保存","preview")}catch(e:Exception){app.error("请检查名称和颜色格式")}}){Text("保存角色")};Text("安静模式");Switch(state.quiet,{app.setQuiet(it)})}
 OutlinedTextField(phrase,{phrase=it},label={Text("唤醒词，2～6 个汉字")});TextButton(onClick={feature(app,"wake-config",phrase)}){Text("生成并试唤醒")}
 if(state.wakeCandidate.isNotBlank()){Text(if(state.wakeDetected)"已识别新唤醒词" else "请开启监听，喊出新唤醒词");Row{Button(enabled=state.wakeDetected,onClick={val candidate=JSONObject(state.wakeCandidate);app.prefs().edit().putString("keywordTokens",candidate.getString("tokens")).putString("wakePhrase",candidate.getString("phrase")).remove("candidateTokens").apply();app.ui.value=app.ui.value.copy(wakeCandidate="",wakeDetected=false)}){Text("确认保存")};TextButton(onClick={app.prefs().edit().remove("candidateTokens").apply();app.ui.value=app.ui.value.copy(wakeCandidate="",wakeDetected=false)}){Text("恢复旧词")}}}
}
