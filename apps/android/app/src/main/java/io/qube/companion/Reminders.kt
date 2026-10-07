package io.qube.companion

import android.app.*
import android.content.*
import android.net.Uri
import android.os.Build
import androidx.room.*
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.time.*
import java.util.UUID

@Entity(tableName="reminders")
data class Reminder(@PrimaryKey val id:String=UUID.randomUUID().toString(),val title:String,val dueAt:Long,val advanceMinutes:Int=10,val repeat:String="none",val zone:String="Asia/Shanghai",val status:String="active",val revision:Int=0,val lastNotified:Long=0){
 companion object {fun fromJson(j:JSONObject)=Reminder(id=j.getString("id"),title=j.getString("title"),dueAt=j.getLong("dueAt"),advanceMinutes=j.getInt("advanceMinutes"),repeat=j.getString("repeat"),zone=j.getString("zone"),status=j.getString("status"),revision=j.getInt("revision"))}
}
@Dao interface ReminderDao {
 @Query("SELECT * FROM reminders ORDER BY dueAt") fun watch():Flow<List<Reminder>>
 @Query("SELECT * FROM reminders WHERE status='active'") suspend fun active():List<Reminder>
 @Query("SELECT * FROM reminders WHERE id=:id") suspend fun get(id:String):Reminder?
 @Insert(onConflict=OnConflictStrategy.REPLACE) suspend fun put(r:Reminder)
}
@Database(entities=[Reminder::class],version=1,exportSchema=false)
abstract class ReminderDb:RoomDatabase(){abstract fun reminders():ReminderDao;companion object{fun open(c:Context)=Room.databaseBuilder(c,ReminderDb::class.java,"qube-reminders.db").build()}}
object ReminderTime {
 fun next(due:Long,repeat:String,now:Long):Long {val step=if(repeat=="daily")86400000L else if(repeat=="weekly")604800000L else return due;return if(due>now)due else due+((now-due)/step+1)*step}
 fun trigger(r:Reminder,now:Long)=maxOf(now+1000,r.dueAt-r.advanceMinutes*60000L)
}
class ReminderScheduler(private val c:Context,private val db:ReminderDb){
 private val manager=c.getSystemService(AlarmManager::class.java)
 fun allowed()=Build.VERSION.SDK_INT<31||manager.canScheduleExactAlarms()
 private fun pending(r:Reminder)=PendingIntent.getBroadcast(c,0,Intent(c,AlarmReceiver::class.java).setAction("fire").setData(Uri.parse("qube://reminder/${r.id}")).putExtra("id",r.id).putExtra("revision",r.revision).putExtra("dueAt",r.dueAt),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
 fun schedule(r:Reminder){manager.cancel(pending(r));if(r.status=="active"){check(allowed()){"请先授予“闹钟和提醒”权限"};manager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,ReminderTime.trigger(r,System.currentTimeMillis()),pending(r))}}
 suspend fun save(r:Reminder){require(r.title.isNotBlank()&&r.title.length<=500){"请填写提醒内容"};require(r.advanceMinutes in 0..10080&&r.repeat in listOf("none","daily","weekly")&&r.zone=="Asia/Shanghai"){"提醒参数无效"};check(r.status!="active"||allowed()){ "请先授予“闹钟和提醒”权限" };require(r.dueAt>System.currentTimeMillis()||r.status!="active"){"请选择未来时间"}
  val old=db.reminders().get(r.id);require(old==null||r.revision>old.revision){"提醒已变化，请重新编辑"};db.reminders().put(r);try{schedule(r)}catch(e:Exception){if(old!=null)db.reminders().put(old)else db.reminders().put(r.copy(status="unscheduled"));throw e}
 }
 suspend fun restore(){for(r in db.reminders().active()){var next=r;if(r.dueAt<System.currentTimeMillis()-60000){if(r.repeat=="none"){db.reminders().put(r.copy(status="overdue"));continue};next=r.copy(dueAt=ReminderTime.next(r.dueAt,r.repeat,System.currentTimeMillis()),revision=r.revision+1);db.reminders().put(next)};if(allowed())schedule(next)}}
 suspend fun fire(id:String,revision:Int,dueAt:Long):Reminder?=db.withTransaction{
  val r=db.reminders().get(id)?:return@withTransaction null
  if(r.status!="active"||r.revision!=revision||r.dueAt!=dueAt||r.lastNotified==dueAt)return@withTransaction null
  if(r.repeat=="none")db.reminders().put(r.copy(lastNotified=dueAt,status="notified"))
  else {val next=r.copy(dueAt=ReminderTime.next(dueAt,r.repeat,maxOf(dueAt,System.currentTimeMillis())),revision=r.revision+1,lastNotified=dueAt);db.reminders().put(next);schedule(next)}
  r
 }
 suspend fun action(id:String,action:String){val r=db.reminders().get(id)?:return;if(r.repeat!="none"&&r.status=="active"&&action!="cancel"){if(action=="snooze")save(Reminder(title=r.title,dueAt=System.currentTimeMillis()+600000,advanceMinutes=0));c.getSystemService(NotificationManager::class.java).cancel(id.hashCode());return};val next=if(action=="snooze")r.copy(dueAt=System.currentTimeMillis()+600000,advanceMinutes=0,status="active",revision=r.revision+1,lastNotified=0)else r.copy(status=if(action=="done")"completed" else "cancelled",revision=r.revision+1);save(next);c.getSystemService(NotificationManager::class.java).cancel(id.hashCode())}
}
class RestoreReceiver:BroadcastReceiver(){override fun onReceive(c:Context,i:Intent){val pending=goAsync();val app=c.applicationContext as QubeApp;app.scope.launch{try{app.alarms.restore()}finally{pending.finish()}}}}
class AlarmReceiver:BroadcastReceiver(){override fun onReceive(c:Context,i:Intent){val pending=goAsync();val app=c.applicationContext as QubeApp;app.scope.launch{try{val id=i.getStringExtra("id")?:return@launch;if(i.action!="fire"){app.alarms.action(id,i.action?:"done");return@launch};val r=app.alarms.fire(id,i.getIntExtra("revision",-1),i.getLongExtra("dueAt",0))?:return@launch
 val service=Intent(c,ReminderSpeaker::class.java).putExtra("title",r.title).putExtra("id",r.id);c.startForegroundService(service)
 }catch(e:Exception){app.error("提醒执行失败：${e.message}")}finally{pending.finish()}}}}
