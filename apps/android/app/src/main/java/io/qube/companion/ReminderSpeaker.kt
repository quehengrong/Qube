package io.qube.companion

import android.app.*
import android.content.Intent
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.net.Uri
import android.os.IBinder
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import java.util.UUID
import java.util.ArrayDeque

/** Queue simultaneous reminders; one alarm must not cut off the preceding announcement. */
class ReminderSpeaker : Service() {
 private data class Announcement(val title:String,val startId:Int,val utterance:String=UUID.randomUUID().toString())
 private var tts:TextToSpeech?=null
 private var ready=false
 private var unavailable=false
 private val handler=Handler(Looper.getMainLooper())
 private val queue=ArrayDeque<Announcement>()
 private var active:Announcement?=null
 private var wake:PowerManager.WakeLock?=null
 override fun onBind(i:Intent?):IBinder?=null
 override fun onCreate(){
  super.onCreate()
  wake=getSystemService(PowerManager::class.java).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK,"Qube:reminder")
  tts=TextToSpeech(this){status->
   val engine=tts
   val voice=if(status==TextToSpeech.SUCCESS)engine?.voices?.firstOrNull{it.locale.language=="zh"&&!it.isNetworkConnectionRequired}else null
   if(engine!=null&&voice!=null){engine.voice=voice;engine.setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build());ready=true}else unavailable=true
   next()
  }
  tts?.setOnUtteranceProgressListener(object:UtteranceProgressListener(){
   override fun onStart(id:String?){}
   override fun onDone(id:String?){handler.post{finish(id)}}
   @Deprecated("Legacy TTS") override fun onError(id:String?){handler.post{finish(id)}}
  })
 }
 override fun onStartCommand(i:Intent?,flags:Int,startId:Int):Int {
  val title=i?.getStringExtra("title")?:run{stopSelf(startId);return START_NOT_STICKY}
  val id=i.getStringExtra("id")?:UUID.randomUUID().toString()
  fun action(name:String)=PendingIntent.getBroadcast(this,0,Intent(this,AlarmReceiver::class.java).setAction(name).setData(Uri.parse("qube://$name/$id")).putExtra("id",id),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  val open=PendingIntent.getActivity(this,0,Intent(this,MainActivity::class.java),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  val notification=Notification.Builder(this,"reminders").setSmallIcon(android.R.drawable.ic_lock_idle_alarm).setContentTitle("Qube 提醒").setContentText(title).setContentIntent(open).setAutoCancel(true).addAction(Notification.Action.Builder(null,"完成",action("done")).build()).addAction(Notification.Action.Builder(null,"稍后十分钟",action("snooze")).build()).build()
  startForeground(2,Notification.Builder(this,"voice").setSmallIcon(android.R.drawable.ic_lock_idle_alarm).setContentTitle("Qube 正在播报提醒").build())
  getSystemService(NotificationManager::class.java).notify(id.hashCode(),notification)
  RingtoneManager.getRingtone(this,RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION))?.play()
  queue.add(Announcement(title,startId));next()
  return START_NOT_STICKY
 }
 private fun next(){
  if(active!=null||(!ready&&!unavailable))return
  val item=queue.poll()?:return
  active=item;QubeApp.instance.speaking=true
  wake?.let{if(it.isHeld)it.release();it.acquire(35000)}
  if(unavailable){finish(item.utterance);return}
  val result=tts?.speak("提醒你，${item.title}",TextToSpeech.QUEUE_ADD,null,item.utterance)
  if(result==TextToSpeech.ERROR){finish(item.utterance);return}
  handler.postDelayed({finish(item.utterance)},30000)
 }
 private fun finish(id:String?){
  val item=active?:return
  if(item.utterance!=id)return
  active=null
  if(queue.isEmpty()){QubeApp.instance.speaking=false;stopSelf(item.startId)}else next()
 }
 override fun onDestroy(){tts?.stop();tts?.shutdown();handler.removeCallbacksAndMessages(null);wake?.let{if(it.isHeld)it.release()};QubeApp.instance.speaking=false;stopForeground(STOP_FOREGROUND_REMOVE);super.onDestroy()}
}
