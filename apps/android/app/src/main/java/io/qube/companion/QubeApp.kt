package io.qube.companion

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

data class Session(val id:String,val name:String,val alive:Boolean)
data class UiState(val connected:Boolean=false,val face:String="offline",val message:String="连接电脑，认识 Qube",val transcript:String="",val draft:String="",val revision:Int=0,val sessionId:String?=null,val canSend:Boolean=false,val sessions:List<Session> = emptyList(),val mode:String="command",val page:String="eyes",val proposal:JSONObject?=null,val proposalId:String="",val listening:Boolean=false,val voiceRunning:Boolean=false)
class QubeApp:Application(){
 companion object { lateinit var instance:QubeApp; private set }
 val scope=CoroutineScope(SupervisorJob()+Dispatchers.IO)
 val ui=MutableStateFlow(UiState())
 lateinit var db:ReminderDb;lateinit var alarms:ReminderScheduler;lateinit var bridge:PhoneBridge
 private var tts:TextToSpeech?=null
 @Volatile var speaking=false
 @Volatile var ttsReady=false
 override fun onCreate(){super.onCreate();instance=this
  val nm=getSystemService(NotificationManager::class.java)
  nm.createNotificationChannel(NotificationChannel("voice","Qube 语音伙伴",NotificationManager.IMPORTANCE_LOW))
  nm.createNotificationChannel(NotificationChannel("reminders","Qube 提醒",NotificationManager.IMPORTANCE_HIGH))
  db=ReminderDb.open(this);alarms=ReminderScheduler(this,db);bridge=PhoneBridge(this)
  tts=TextToSpeech(this){status->if(status==TextToSpeech.SUCCESS){val engine=tts;val voice=engine?.voices?.firstOrNull{it.locale.language=="zh"&&!it.isNetworkConnectionRequired};if(voice!=null){engine.voice=voice;ttsReady=true}else{ui.update{it.copy(message="请在系统文字转语音设置中下载中文离线语音")}}}}
  tts?.setOnUtteranceProgressListener(object:UtteranceProgressListener(){override fun onStart(id:String?){speaking=true};override fun onDone(id:String?){speaking=false};@Deprecated("Legacy TTS") override fun onError(id:String?){speaking=false}})
  scope.launch{alarms.restore()}
 }
 fun say(text:String){ui.update{it.copy(message=text)};if(ttsReady){speaking=true;tts?.speak(text,TextToSpeech.QUEUE_FLUSH,null,UUID.randomUUID().toString())}}
 fun error(text:String){ui.update{it.copy(face="error",message=text)};say(text)}
 fun prefs()=getSharedPreferences("qube",Context.MODE_PRIVATE)
}
