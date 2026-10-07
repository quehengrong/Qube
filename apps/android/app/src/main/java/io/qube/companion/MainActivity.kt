package io.qube.companion

import android.Manifest
import android.app.AlarmManager
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.journeyapps.barcodescanner.ScanContract
import com.journeyapps.barcodescanner.ScanOptions
import kotlinx.coroutines.launch
import kotlinx.coroutines.flow.update
import org.json.JSONObject
import java.time.*
import java.time.format.DateTimeFormatter
import java.util.UUID

class MainActivity:ComponentActivity(){
 private val app get()=application as QubeApp
 private var pendingListen=false
 private val permissions=registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()){if(checkSelfPermission(Manifest.permission.RECORD_AUDIO)==PackageManager.PERMISSION_GRANTED)startVoice(pendingListen)else app.error("需要麦克风权限才能语音唤醒")}
 private val scan=registerForActivityResult(ScanContract()){result->result.contents?.let{raw->try{app.bridge.pair(raw)}catch(e:Exception){app.error(e.message?:"二维码无效")}}}
 override fun onCreate(savedInstanceState:Bundle?){super.onCreate(savedInstanceState);window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);app.bridge.connect();setContent{MaterialTheme(colorScheme=darkColorScheme(primary=Color(0xFF73EDD0),background=Color(0xFF080D13),surface=Color(0xFF13202C))){QubeScreen()}}}
 override fun onResume(){super.onResume();app.scope.launch{app.alarms.restore()}}
 private fun startVoice(listen:Boolean=false){pendingListen=listen;val required=mutableListOf(Manifest.permission.RECORD_AUDIO);if(Build.VERSION.SDK_INT>=33)required+=Manifest.permission.POST_NOTIFICATIONS
  if(required.any{checkSelfPermission(it)!=PackageManager.PERMISSION_GRANTED}){permissions.launch(required.toTypedArray());return}
  try{startForegroundService(Intent(this,VoiceService::class.java).setAction(if(listen)"listen" else "start"))}catch(e:Exception){app.error("启动失败：${e.message}")}
 }
 private fun system(action:String,data:Uri?=null){try{startActivity(Intent(action,data))}catch(_:Exception){app.error("请到系统设置中手动配置")}}
 @Composable private fun QubeScreen(){
  val state by app.ui.collectAsStateWithLifecycle();val reminders by app.db.reminders().watch().collectAsStateWithLifecycle(initialValue=emptyList())
  var edit by remember{mutableStateOf<Reminder?>(null)};var creating by remember{mutableStateOf(false)}
  Column(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background).statusBarsPadding().navigationBarsPadding()){
   Row(Modifier.fillMaxWidth().padding(horizontal=12.dp),horizontalArrangement=Arrangement.SpaceBetween){
    Text("Qube",color=MaterialTheme.colorScheme.primary,fontSize=24.sp,modifier=Modifier.padding(8.dp))
    Row{for((page,label) in listOf("eyes" to "眼睛","coding" to "听写","reminders" to "提醒","settings" to "设置")){TextButton(onClick={app.ui.update{it.copy(page=page)}}){Text(label)}}}
   }
   if(state.face=="error")Text(state.message,color=MaterialTheme.colorScheme.error,modifier=Modifier.padding(horizontal=18.dp),maxLines=2)
   Box(Modifier.weight(1f)){
    when(state.page){
     "eyes"->Eyes(state)
     "coding"->Coding(state)
     "reminders"->Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(18.dp)){
      Row{Button(onClick={creating=true}){Text("新增提醒")};Spacer(Modifier.width(12.dp));Text(if(app.alarms.allowed())"手机本地保存 · 电脑关机仍提醒" else "请先在设置中授予精确提醒权限")}
      if(reminders.isEmpty())Text("还没有提醒。可以说：明天下午三点提醒我开会。",modifier=Modifier.padding(20.dp))
      for(r in reminders){Card(Modifier.fillMaxWidth().padding(vertical=6.dp)){Row(Modifier.padding(12.dp),horizontalArrangement=Arrangement.SpaceBetween){Column(Modifier.weight(1f)){Text(r.title);Text("${formatTime(r.dueAt)} · 提前 ${r.advanceMinutes} 分钟 · ${repeatLabel(r.repeat)} · ${statusLabel(r.status)}",fontSize=12.sp)};TextButton(onClick={edit=r}){Text("编辑")};TextButton(onClick={action(r,"snooze")}){Text("稍后10分")};TextButton(onClick={action(r,"done")}){Text("完成")};TextButton(onClick={action(r,"cancel")}){Text("取消")}}}}
     }
     else->SettingsScreen(state)
    }
   }
   Row(Modifier.fillMaxWidth().padding(horizontal=12.dp),horizontalArrangement=Arrangement.SpaceBetween){Text(if(state.connected)"● 电脑已连接" else "○ 电脑离线",color=MaterialTheme.colorScheme.primary,modifier=Modifier.padding(10.dp));Row{if(state.voiceRunning)TextButton(onClick={stopService(Intent(this@MainActivity,VoiceService::class.java))}){Text("停止监听")};TextButton(onClick={startVoice(true)}){Text(if(state.listening)"正在聆听…" else "点击说话")}}}
  }
  state.proposal?.let{p->AlertDialog(onDismissRequest={rejectProposal(state)},title={Text("确认提醒")},text={Text(p.getString("summary"))},confirmButton={TextButton(onClick={app.scope.launch{try{val r=Reminder.fromJson(p.getJSONObject("reminder"));app.alarms.save(r);app.bridge.send("reminder-result",JSONObject().put("ok",true).put("message","提醒已保存到手机"),state.proposalId);app.ui.update{it.copy(proposal=null)}}catch(e:Exception){app.error(e.message?:"保存失败")}}}){Text("确认保存")}},dismissButton={TextButton(onClick={rejectProposal(state)}){Text("取消")}})}
  if(creating||edit!=null)ReminderEditor(edit,onDismiss={creating=false;edit=null},onSave={r->app.scope.launch{try{app.alarms.save(r);creating=false;edit=null;app.say("提醒已保存")}catch(e:Exception){app.error(e.message?:"保存失败")}}})
 }
 private fun rejectProposal(state:UiState){app.bridge.send("reminder-result",JSONObject().put("ok",false).put("message","已取消提醒"),state.proposalId);app.ui.update{it.copy(proposal=null)}}
 private fun action(r:Reminder,action:String){app.scope.launch{try{app.alarms.action(r.id,action)}catch(e:Exception){app.error(e.message?:"操作失败")}}}
 @Composable private fun Coding(state:UiState){
  var text by remember{mutableStateOf(state.draft)};var dirty by remember{mutableStateOf(false)};var revision by remember{mutableIntStateOf(state.revision)};var awaitingText by remember{mutableStateOf<String?>(null)}
  LaunchedEffect(state.draft,state.revision){if(awaitingText!=null&&state.revision>revision&&state.draft==awaitingText){dirty=false;awaitingText=null};if(!dirty){text=state.draft;revision=state.revision}}
  Column(Modifier.fillMaxSize().padding(18.dp).verticalScroll(rememberScrollState())){
   Text("目标会话",fontSize=20.sp);Row{for(s in state.sessions.filter{it.alive}){TextButton(onClick={app.bridge.send("select-session",JSONObject().put("sessionId",s.id))}){Text((if(s.id==state.sessionId)"✓ " else "")+s.name)}}}
   if(state.sessions.none{it.alive})Text("先在电脑 Qube 中启动一个 Codex 或 Claude 会话。")
   OutlinedTextField(value=text,onValueChange={text=it;dirty=true},label={Text("语音草稿 · 确认后发送")},modifier=Modifier.fillMaxWidth(),minLines=3,maxLines=6)
   Row{TextButton(onClick={app.bridge.send("text",JSONObject().put("text",if(state.mode=="dictation")"退出编程听写" else "进入编程听写"))}){Text(if(state.mode=="dictation")"退出听写" else "进入听写")};TextButton(onClick={if(app.bridge.send("draft-update",JSONObject().put("text",text).put("revision",revision)))awaitingText=text}){Text("保存修改")};TextButton(onClick={if(app.bridge.send("draft-update",JSONObject().put("text","").put("revision",state.revision))){awaitingText="";dirty=true;revision=state.revision}}){Text("清空")};Button(enabled=state.canSend&&state.draft.isNotBlank()&&!dirty&&state.connected,onClick={app.bridge.send("draft-submit",JSONObject().put("sessionId",state.sessionId).put("revision",state.revision))}){Text("确认发送")}}
   Text(state.message,color=MaterialTheme.colorScheme.primary);if(state.transcript.isNotBlank())Text("听到：${state.transcript}",fontSize=12.sp)
  }
 }
 @Composable private fun SettingsScreen(state:UiState){
  var pairing by remember{mutableStateOf("")};var tokens by remember{mutableStateOf(app.prefs().getString("keywordTokens","x iǎo j ī x iǎo j ī @小机小机")!!)}
  var mute by remember{mutableStateOf(false)};var bright by remember{mutableFloatStateOf(.5f)};var keep by remember{mutableStateOf(true)}
  Column(Modifier.fillMaxSize().padding(18.dp).verticalScroll(rememberScrollState()),verticalArrangement=Arrangement.spacedBy(10.dp)){
   Text("连接与语音",fontSize=22.sp)
   Row{Button(onClick={scan.launch(ScanOptions().setDesiredBarcodeFormats(ScanOptions.QR_CODE).setPrompt("扫描电脑 Qube 的配对二维码").setBeepEnabled(false).setOrientationLocked(false))}){Text("扫描配对")};TextButton(onClick={app.bridge.connect()}){Text("重新连接")};Button(onClick={startVoice()}){Text("开启唤醒词监听")}}
   OutlinedTextField(value=pairing,onValueChange={pairing=it},label={Text("也可粘贴电脑复制的配对数据")},modifier=Modifier.fillMaxWidth())
   TextButton(onClick={try{app.bridge.pair(pairing);pairing=""}catch(e:Exception){app.error(e.message?:"配对失败")}}){Text("使用配对数据")}
   Row{Text("麦克风静音");Switch(checked=mute,onCheckedChange={mute=it;VoiceService.instance?.mute(it)});Text("保持亮屏");Switch(checked=keep,onCheckedChange={keep=it;if(it)window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)else window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)})}
   Text("屏幕亮度");Slider(value=bright,onValueChange={bright=it;window.attributes=window.attributes.apply{screenBrightness=it.coerceAtLeast(.03f)}})
   OutlinedTextField(value=tokens,onValueChange={tokens=it},label={Text("唤醒词音素（默认：小机小机；高级设置）")},modifier=Modifier.fillMaxWidth())
   TextButton(onClick={try{val valid=assets.open("kws/tokens.txt").bufferedReader().useLines{lines->lines.map{it.substringBeforeLast(' ')}.toSet()};require(tokens.substringBefore('@').trim().split(Regex("\\s+")).all{it in valid}){"存在模型不支持的音素"};app.prefs().edit().putString("keywordTokens",tokens).apply();app.say("唤醒词已保存，请停止并重新开启监听后测试")}catch(e:Exception){app.error(e.message?:"保存失败")}}){Text("保存唤醒词")}
   Row{TextButton(onClick={if(Build.VERSION.SDK_INT>=31)system(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM,Uri.parse("package:$packageName"))}){Text("精确提醒权限")};TextButton(onClick={system(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,Uri.parse("package:$packageName"))}){Text("应用与后台设置")};TextButton(onClick={system("com.android.settings.TTS_SETTINGS")}){Text("中文离线播报")};TextButton(onClick={app.say("你好，我是 Qube，离线语音播报测试")}){Text("测试播报")}}
   Text("HyperOS：请允许通知、后台自启动，将省电策略设为无限制。重启后需打开 Qube 再开启唤醒监听；提醒会自动恢复。强制停止应用后需重新打开。",fontSize=12.sp)
   Text(state.message,color=MaterialTheme.colorScheme.primary)
  }
 }
 @Composable private fun ReminderEditor(old:Reminder?,onDismiss:()->Unit,onSave:(Reminder)->Unit){
  var title by remember{mutableStateOf(old?.title?:"")};var time by remember{mutableStateOf(formatTime(old?.dueAt?:System.currentTimeMillis()+3600000))};var advance by remember{mutableStateOf((old?.advanceMinutes?:10).toString())};var repeat by remember{mutableStateOf(old?.repeat?:"none")};var error by remember{mutableStateOf("")}
  AlertDialog(
   onDismissRequest = onDismiss,
   title = { Text(if (old == null) "新增提醒" else "编辑提醒") },
   text = {
    Column(Modifier.verticalScroll(rememberScrollState())) {
     OutlinedTextField(title, { title = it }, label = { Text("事项") })
     OutlinedTextField(time, { time = it }, label = { Text("上海时间 yyyy-MM-dd HH:mm") })
     OutlinedTextField(advance, { advance = it }, label = { Text("提前分钟") })
     Row {
      for (v in listOf("none", "daily", "weekly")) {
       TextButton(onClick = { repeat = v }) { Text((if (repeat == v) "✓" else "") + repeatLabel(v)) }
      }
     }
     Text(error, color = MaterialTheme.colorScheme.error)
    }
   },
   confirmButton = {
    TextButton(onClick = {
     try {
      val date = LocalDateTime.parse(time, DateTimeFormatter.ofPattern("uuuu-MM-dd HH:mm")
       .withResolverStyle(java.time.format.ResolverStyle.STRICT))
       .atZone(ZoneId.of("Asia/Shanghai")).toInstant().toEpochMilli()
      onSave(Reminder(id = old?.id ?: UUID.randomUUID().toString(), title = title,
       dueAt = date, advanceMinutes = advance.toInt(), repeat = repeat,
       revision = (old?.revision ?: -1) + 1))
     } catch (e: Exception) { error = "请检查日期、时间和提前分钟" }
    }) { Text("保存") }
   },
   dismissButton = { TextButton(onClick = onDismiss) { Text("取消") } }
  )
 }
}
fun formatTime(millis:Long):String=Instant.ofEpochMilli(millis).atZone(ZoneId.of("Asia/Shanghai")).format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm"))
fun repeatLabel(r:String)=when(r){"daily"->"每天";"weekly"->"每周";else->"单次"}
fun statusLabel(s:String)=when(s){"active"->"待提醒";"notified"->"已提醒";"completed"->"已完成";"cancelled"->"已取消";"overdue"->"已逾期";else->"未成功调度"}
