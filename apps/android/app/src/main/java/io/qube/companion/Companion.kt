package io.qube.companion

import android.app.*
import android.content.*
import android.net.Uri
import android.os.SystemClock
import android.provider.Settings
import androidx.room.*
import androidx.room.Entity
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import org.json.JSONObject
import java.util.UUID

@Entity(tableName="companion")
data class CompanionRecord(@PrimaryKey val id:String,val kind:String,val json:String,val updatedAt:Long=System.currentTimeMillis())
@Dao interface CompanionDao {
 @Query("SELECT * FROM companion WHERE kind=:kind ORDER BY updatedAt DESC") fun watch(kind:String):Flow<List<CompanionRecord>>
 @Query("SELECT * FROM companion WHERE id=:id") suspend fun get(id:String):CompanionRecord?
 @Query("SELECT * FROM companion WHERE kind=:kind ORDER BY updatedAt DESC") suspend fun list(kind:String):List<CompanionRecord>
 @Insert(onConflict=OnConflictStrategy.REPLACE) suspend fun put(value:CompanionRecord)
 @Query("DELETE FROM companion WHERE id=:id") suspend fun delete(id:String)
 @Query("DELETE FROM companion WHERE kind='history'") suspend fun clearHistory()
 @Query("DELETE FROM companion WHERE kind IN ('history','receipt') AND (updatedAt<:cutoff OR id IN (SELECT id FROM companion WHERE kind='history' ORDER BY updatedAt DESC LIMIT -1 OFFSET 10000))") suspend fun prune(cutoff:Long)
}
class CompanionManager(private val app:QubeApp){
 private val lock=Mutex();private val dao get()=app.db.companion()
 private val alarms get()=app.getSystemService(AlarmManager::class.java)
 private fun boot()=Settings.Global.getInt(app.contentResolver,Settings.Global.BOOT_COUNT,0)
 private fun pending(id:String)=PendingIntent.getBroadcast(app,0,Intent(app,FocusReceiver::class.java).setData(Uri.parse("qube://focus/$id")).putExtra("id",id),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
 suspend fun log(action:String,message:String,status:String="success",id:String=UUID.randomUUID().toString()){
  val j=JSONObject().put("id",id).put("at",System.currentTimeMillis()).put("source","phone").put("action",action).put("message",message).put("status",status)
  dao.put(CompanionRecord(id,"history",j.toString()));if(app.ui.value.connected)app.bridge.send("phone-events",JSONObject().put("events",org.json.JSONArray().put(j)));dao.prune(System.currentTimeMillis()-30L*86400000)
 }
 suspend fun syncHistory(){if(app.ui.value.connected){val events=org.json.JSONArray();dao.list("history").filter{JSONObject(it.json).optString("source")=="phone"}.take(100).forEach{events.put(JSONObject(it.json))};app.bridge.send("phone-events",JSONObject().put("events",events))}}
 suspend fun importHistory(events:org.json.JSONArray){for(i in 0 until events.length()){val e=events.getJSONObject(i);dao.put(CompanionRecord(e.getString("id"),"history",e.toString(),e.getLong("at")))};dao.prune(System.currentTimeMillis()-30L*86400000)}
 suspend fun note(text:String,project:String="",id:String=UUID.randomUUID().toString()){
  require(text.isNotBlank()&&text.length<=16000){"请填写 1～16000 字的灵感"};val old=dao.get(id)?.let{JSONObject(it.json)};val j=(old?:JSONObject().put("id",id).put("createdAt",System.currentTimeMillis())).put("text",text).put("project",project).put("archived",false);dao.put(CompanionRecord(id,"note",j.toString()));log("灵感","灵感已保存到手机")
 }
 suspend fun archive(id:String){val row=dao.get(id)?:return;val j=JSONObject(row.json).put("archived",true);dao.put(row.copy(json=j.toString(),updatedAt=System.currentTimeMillis()))}
 suspend fun link(id:String,key:String,value:String){val row=dao.get(id)?:return;dao.put(row.copy(json=JSONObject(row.json).put(key,value).toString()))}
 suspend fun focus():JSONObject?=dao.get("focus")?.let{JSONObject(it.json)}
 fun remaining(f:JSONObject):Long=if(f.optString("status")=="paused")f.optLong("remaining") else if(f.optInt("boot")==boot())f.optLong("elapsedEnd")-SystemClock.elapsedRealtime() else f.optLong("end")-System.currentTimeMillis()
 private suspend fun saveFocus(f:JSONObject){dao.put(CompanionRecord("focus","focus",f.toString()));app.ui.update{it.copy(focus=f.toString())}}
 private fun schedule(f:JSONObject){check(app.alarms.allowed()){"请先授予精确提醒权限"};alarms.setExactAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP,SystemClock.elapsedRealtime()+remaining(f).coerceAtLeast(1000),pending(f.getString("id")))}
 private suspend fun startFocus(minutes:Int,kind:String){require(minutes in 1..1440&&kind in listOf("focus","rest")){"计时须为 1～1440 分钟"};check(app.alarms.allowed()){"请先授予精确提醒权限"};check(app.getSystemService(NotificationManager::class.java).areNotificationsEnabled()){"请先允许 Qube 通知"};val old=focus();check(old==null||old.optString("status") !in listOf("running","paused")){"已有计时，请先结束后再开始"};val duration=minutes*60000L;val f=JSONObject().put("id",UUID.randomUUID().toString()).put("kind",kind).put("status","running").put("end",System.currentTimeMillis()+duration).put("elapsedEnd",SystemClock.elapsedRealtime()+duration).put("boot",boot());schedule(f);saveFocus(f);log("计时","已开始 $minutes 分钟${if(kind=="focus")"专注" else "休息"}")}
 private suspend fun changeFocus(action:String){val f=focus()?:error("没有计时");check(f.optString("status") in listOf("running","paused")){"计时已经结束"};when(action){
  "focus-pause"->{check(f.getString("status")=="running"){"计时已暂停"};f.put("remaining",remaining(f).coerceAtLeast(0)).put("status","paused");alarms.cancel(pending(f.getString("id")))}
  "focus-resume"->{check(f.getString("status")=="paused"){"计时正在运行"};val left=f.getLong("remaining");f.put("status","running").put("end",System.currentTimeMillis()+left).put("elapsedEnd",SystemClock.elapsedRealtime()+left).put("boot",boot());schedule(f)}
  else->{alarms.cancel(pending(f.getString("id")));f.put("status","cancelled")}
 };saveFocus(f);log("计时",when(action){"focus-pause"->"已暂停";"focus-resume"->"已继续";else->"已结束"})}
 suspend fun restore(){lock.withLock{val f=focus()?:return@withLock;app.ui.update{it.copy(focus=f.toString())};if(f.optString("status")=="running"){if(remaining(f)<=0)finish(f.getString("id"))else if(app.alarms.allowed())schedule(f)}}}
 suspend fun fire(id:String){lock.withLock{val f=focus()?:return@withLock;if(f.optString("id")==id&&f.optString("status")=="running"){if(remaining(f)>1000)schedule(f)else finish(id)}}}
 private suspend fun finish(id:String){val f=focus()?:return;f.put("status","completed");saveFocus(f);val title=if(f.optString("kind")=="focus")"专注结束，休息一下吧" else "休息结束，准备好再开始";log("计时结束",title);app.startForegroundService(Intent(app,ReminderSpeaker::class.java).putExtra("id",id).putExtra("title",title).putExtra("category","timer"))}
 suspend fun execute(id:String,p:JSONObject):String=lock.withLock{
  dao.get("receipt:$id")?.let{return@withLock JSONObject(it.json).getString("message")}
  val message=when(p.getString("action")){
   "note-add"->{note(p.getString("text"),p.optString("project"),id);"灵感已保存到手机"}
   "focus-start"->{startFocus(p.getInt("minutes"),p.optString("kind","focus"));"计时已在手机开始"}
   "focus-pause","focus-resume","focus-cancel"->{changeFocus(p.getString("action"));"计时已更新"}
   "quiet"->{app.setQuiet(p.getBoolean("enabled"));"播报设置已更新"}
   "page"->{require(p.getString("page") in listOf("eyes","coding","reminders","notes","focus","status","history","settings"));app.ui.update{it.copy(page=p.getString("page"))};"已切换页面"}
   else->error("不支持的手机操作")
  };dao.put(CompanionRecord("receipt:$id","receipt",JSONObject().put("message",message).toString()));message
 }
}
class FocusReceiver:BroadcastReceiver(){override fun onReceive(c:Context,i:Intent){val pending=goAsync();val app=c.applicationContext as QubeApp;app.scope.launch{try{app.companion.fire(i.getStringExtra("id")?:"")}catch(e:Exception){app.error(e.message?:"计时失败")}finally{pending.finish()}}}}
