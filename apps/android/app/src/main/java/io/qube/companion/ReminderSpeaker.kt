package io.qube.companion

import android.app.*
import android.content.Intent
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.net.Uri
import android.os.IBinder
import android.os.Handler
import android.os.Looper
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import java.util.UUID

class ReminderSpeaker:Service(){
 private var tts:TextToSpeech?=null
 private val handler=Handler(Looper.getMainLooper())
 private var utterance=""
 override fun onBind(i:Intent?):IBinder?=null
 override fun onStartCommand(i:Intent?,flags:Int,startId:Int):Int{
  val title=i?.getStringExtra("title")?:return START_NOT_STICKY
  val id=i.getStringExtra("id")?:UUID.randomUUID().toString()
  fun action(name:String)=PendingIntent.getBroadcast(this,0,Intent(this,AlarmReceiver::class.java).setAction(name).setData(Uri.parse("qube://$name/$id")).putExtra("id",id),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  val open=PendingIntent.getActivity(this,0,Intent(this,MainActivity::class.java),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  val notification=Notification.Builder(this,"reminders").setSmallIcon(android.R.drawable.ic_lock_idle_alarm).setContentTitle("Qube 提醒").setContentText(title).setContentIntent(open).setAutoCancel(true).addAction(Notification.Action.Builder(null,"完成",action("done")).build()).addAction(Notification.Action.Builder(null,"稍后十分钟",action("snooze")).build()).build()
  startForeground(2,Notification.Builder(this,"voice").setSmallIcon(android.R.drawable.ic_lock_idle_alarm).setContentTitle("Qube 正在播报提醒").build())
  getSystemService(NotificationManager::class.java).notify(id.hashCode(),notification)
  utterance=UUID.randomUUID().toString();val current=utterance
  QubeApp.instance.speaking=true
  val tone=RingtoneManager.getRingtone(this,RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION));tone?.play()
  tts?.shutdown();tts=TextToSpeech(this){status->
   val engine=tts
   if(status==TextToSpeech.SUCCESS&&current==utterance){val voice=engine?.voices?.firstOrNull{it.locale.language=="zh"&&!it.isNetworkConnectionRequired};if(voice!=null){engine.voice=voice;engine.setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build());engine.speak("提醒你，$title",TextToSpeech.QUEUE_FLUSH,null,current)}else stopSelf(startId)}else stopSelf(startId)
  }
  tts?.setOnUtteranceProgressListener(object:UtteranceProgressListener(){override fun onStart(id:String?){};override fun onDone(id:String?){if(id==utterance)stopSelf(startId)};@Deprecated("Legacy TTS") override fun onError(id:String?){if(id==utterance)stopSelf(startId)}})
  handler.postDelayed({if(current==utterance)stopSelf(startId)},30000)
  return START_NOT_STICKY
 }
 override fun onDestroy(){tts?.stop();tts?.shutdown();handler.removeCallbacksAndMessages(null);QubeApp.instance.speaking=false;stopForeground(STOP_FOREGROUND_REMOVE);super.onDestroy()}
}
