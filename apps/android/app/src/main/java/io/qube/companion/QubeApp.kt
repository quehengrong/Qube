package io.qube.companion

import android.app.Notification
import android.app.PendingIntent
import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.update
import org.json.JSONObject
import java.util.Locale
import java.util.UUID

data class Session(val id:String,val name:String,val alive:Boolean,val status:String="unknown",val detail:String="")
data class UiState(val connected:Boolean=false,val face:String="offline",val message:String="连接电脑，认识 Qube",val transcript:String="",val draft:String="",val revision:Int=0,val sessionId:String?=null,val canSend:Boolean=false,val sessions:List<Session> = emptyList(),val mode:String="command",val page:String="eyes",val proposal:JSONObject?=null,val proposalId:String="",val listening:Boolean=false,val voiceRunning:Boolean=false,val protocol:Int=1,val focus:String="",val quiet:Boolean=false,val metrics:String="",val history:String="[]",val attachments:String="[]",val helper:String="",val helperRunning:Boolean=false,val rewrite:String="",val wakeCandidate:String="",val wakeDetected:Boolean=false,val profileRevision:Int=0)
class QubeApp:Application(){
 companion object { lateinit var instance:QubeApp; private set }
 val scope=CoroutineScope(SupervisorJob()+Dispatchers.IO)
 val ui=MutableStateFlow(UiState())
 lateinit var db:ReminderDb;lateinit var alarms:ReminderScheduler;lateinit var bridge:PhoneBridge;lateinit var companion:CompanionManager
 private var tts:TextToSpeech?=null
 private val speechQueue=java.util.ArrayDeque<SpeechItem>()
 private data class SpeechItem(val id:String,val text:String,val category:String,val done:()->Unit)
 private var active:SpeechItem?=null
 private val handler=android.os.Handler(android.os.Looper.getMainLooper())
 @Volatile var speaking=false
 @Volatile var ttsReady=false
 private var ttsInitialized=false
 override fun onCreate(){super.onCreate();instance=this
  val nm=getSystemService(NotificationManager::class.java)
  nm.createNotificationChannel(NotificationChannel("voice","Qube 语音伙伴",NotificationManager.IMPORTANCE_LOW))
  nm.createNotificationChannel(NotificationChannel("reminders-v2","Qube 提醒",NotificationManager.IMPORTANCE_HIGH).apply{setSound(null,null)})
  nm.createNotificationChannel(NotificationChannel("silent","Qube 无声通知",NotificationManager.IMPORTANCE_LOW).apply{setSound(null,null)})
  db=ReminderDb.open(this);alarms=ReminderScheduler(this,db);bridge=PhoneBridge(this);companion=CompanionManager(this);ui.update{it.copy(quiet=prefs().getBoolean("quiet",false))};scope.launch{companion.restore()}
  handler.postDelayed({ttsInitialized=true;nextSpeech()},8000)
  tts=TextToSpeech(this){status->ttsInitialized=true;if(status==TextToSpeech.SUCCESS){val engine=tts;val voice=engine?.voices?.firstOrNull{it.locale.language=="zh"&&!it.isNetworkConnectionRequired};if(voice!=null){engine.voice=voice;ttsReady=true;handler.post{nextSpeech()}}else{ui.update{it.copy(message="请在系统文字转语音设置中下载中文离线语音")}}};handler.post{nextSpeech()}}
  tts?.setOnUtteranceProgressListener(object:UtteranceProgressListener(){override fun onStart(id:String?){speaking=true};override fun onDone(id:String?){handler.post{finishSpeech(id)}};@Deprecated("Legacy TTS") override fun onError(id:String?){handler.post{finishSpeech(id)}}})
 }
 fun quietNow():Boolean {val f=runCatching{JSONObject(ui.value.focus)}.getOrNull();return prefs().getBoolean("quiet",false)||(f?.optString("status")=="running"&&f.optString("kind")=="focus")}
 fun setQuiet(value:Boolean){prefs().edit().putBoolean("quiet",value).apply();ui.update{it.copy(quiet=value,message=if(value)"安静模式已开启" else "安静模式已关闭")};handler.post{if(value&&active?.category !in listOf("important","timer")){tts?.stop();finishSpeech(active?.id)}}}
 fun voices():List<String> = tts?.voices?.filter{it.locale.language=="zh"&&!it.isNetworkConnectionRequired}?.map{it.name}?.sorted()?:emptyList()
 fun say(text:String,category:String="normal",done:()->Unit={}){ui.update{it.copy(message=text)};handler.post{
  if(!CompanionRules.audible(quietNow(),category)){done();return@post}
  val item=SpeechItem(UUID.randomUUID().toString(),text,category,done)
  if(category in listOf("important","timer")){speechQueue.addFirst(item);if(active!=null&&active!!.category !in listOf("important","timer")){tts?.stop();finishSpeech(active?.id)}}else speechQueue.add(item)
  nextSpeech()
 }}
 private fun nextSpeech(){if(active!=null||!ttsInitialized)return;val item=speechQueue.poll()?:return;if(!ttsReady||!CompanionRules.audible(quietNow(),item.category)){item.done();nextSpeech();return};active=item;speaking=true
  val voice=prefs().getString("voice","");tts?.voices?.firstOrNull{it.name==voice}?.let{tts?.voice=it};tts?.setSpeechRate(prefs().getFloat("speed",1f))
  val audio=getSystemService(android.media.AudioManager::class.java);if(audio.ringerMode!=android.media.AudioManager.RINGER_MODE_NORMAL){finishSpeech(item.id);return}
  tts?.setAudioAttributes(android.media.AudioAttributes.Builder().setUsage(android.media.AudioAttributes.USAGE_NOTIFICATION).setContentType(android.media.AudioAttributes.CONTENT_TYPE_SPEECH).build())
  val options=android.os.Bundle().apply{putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME,prefs().getFloat("volume",.8f))};if(tts?.speak(item.text,TextToSpeech.QUEUE_FLUSH,options,item.id)==TextToSpeech.ERROR)finishSpeech(item.id)
  handler.postDelayed({finishSpeech(item.id)},30000)
 }
 private fun finishSpeech(id:String?){val item=active?:return;if(item.id!=id)return;tts?.stop();active=null;speaking=false;item.done();nextSpeech()}
 fun notice(id:String,text:String,category:String){val nm=getSystemService(NotificationManager::class.java);val open=PendingIntent.getActivity(this,0,android.content.Intent(this,MainActivity::class.java),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE);nm.notify(id.hashCode(),Notification.Builder(this,if(quietNow()&&category !in listOf("important","timer"))"silent" else "reminders-v2").setSmallIcon(android.R.drawable.ic_dialog_info).setContentTitle("Qube").setContentText(text).setContentIntent(open).setAutoCancel(true).build());say(text,category)}
 fun error(text:String){ui.update{it.copy(face="error",message=text)};say(text)}
 fun prefs()=getSharedPreferences("qube",Context.MODE_PRIVATE)
}
