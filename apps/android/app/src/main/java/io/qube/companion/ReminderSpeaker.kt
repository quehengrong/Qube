package io.qube.companion

import android.app.*
import android.content.Intent
import android.net.Uri
import android.os.IBinder
import android.os.PowerManager

/** One application-wide speech queue handles alarms and assistant announcements. */
class ReminderSpeaker:Service(){
 private var outstanding=0
 private var wake:PowerManager.WakeLock?=null
 override fun onBind(i:Intent?):IBinder?=null
 override fun onCreate(){super.onCreate();wake=getSystemService(PowerManager::class.java).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK,"Qube:announcement")}
 override fun onStartCommand(i:Intent?,flags:Int,startId:Int):Int{
  val app=application as QubeApp;val title=i?.getStringExtra("title")?:run{stopSelf(startId);return START_NOT_STICKY};val id=i.getStringExtra("id")?:"reminder";val category=i.getStringExtra("category")?:"reminder"
  startForeground(2,Notification.Builder(this,"voice").setSmallIcon(android.R.drawable.ic_lock_idle_alarm).setContentTitle("Qube 提醒").build())
  val open=PendingIntent.getActivity(this,0,Intent(this,MainActivity::class.java),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  val n=Notification.Builder(this,if(app.quietNow()&&category !in listOf("important","timer"))"silent" else "reminders-v2").setSmallIcon(android.R.drawable.ic_lock_idle_alarm).setContentTitle("Qube 提醒").setContentText(title).setContentIntent(open).setAutoCancel(true)
  if(category!="timer"){for((action,label) in listOf("done" to "完成","snooze" to "稍后十分钟")){val pending=PendingIntent.getBroadcast(this,0,Intent(this,AlarmReceiver::class.java).setAction(action).setData(Uri.parse("qube://$action/$id")).putExtra("id",id),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE);n.addAction(Notification.Action.Builder(null,label,pending).build())}}
  getSystemService(NotificationManager::class.java).notify(id.hashCode(),n.build());wake?.let{if(it.isHeld)it.release();it.acquire(120000)}
  outstanding++;app.say(title,category){outstanding--;if(outstanding==0)stopSelf()};return START_NOT_STICKY
 }
 override fun onDestroy(){wake?.let{if(it.isHeld)it.release()};stopForeground(STOP_FOREGROUND_REMOVE);super.onDestroy()}
}
