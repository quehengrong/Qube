package io.qube.companion

import androidx.room.withTransaction
import org.json.JSONArray
import org.json.JSONObject

object Backup {
 suspend fun export(app:QubeApp):String {
  val reminders=JSONArray();for(r in app.db.reminders().all())reminders.put(JSONObject().put("id",r.id).put("title",r.title).put("dueAt",r.dueAt).put("advanceMinutes",r.advanceMinutes).put("repeat",r.repeat).put("zone",r.zone).put("status",r.status).put("revision",r.revision).put("lastNotified",r.lastNotified).put("important",r.important))
  val records=JSONArray();for(kind in listOf("note","focus"))for(r in app.db.companion().list(kind))records.put(JSONObject().put("id",r.id).put("kind",r.kind).put("json",r.json).put("updatedAt",r.updatedAt))
  val profile=JSONObject();for(key in listOf("name","eyeColor","voice","wakePhrase","keywordTokens"))app.prefs().getString(key,null)?.let{profile.put(key,it)}
  profile.put("quiet",app.prefs().getBoolean("quiet",false)).put("speed",app.prefs().getFloat("speed",1f).toDouble()).put("volume",app.prefs().getFloat("volume",.8f).toDouble())
  return JSONObject().put("version",2).put("reminders",reminders).put("records",records).put("profile",profile).toString(2)
 }
 suspend fun restore(app:QubeApp,raw:String){
  require(raw.length<=2_000_000){"备份文件过大"};val data=JSONObject(raw);require(data.getInt("version")==2){"备份版本不支持"};val array=data.getJSONArray("reminders");val reminders=(0 until array.length()).map{val j=array.getJSONObject(it);Reminder.fromJson(j).copy(lastNotified=j.optLong("lastNotified"))};for(r in reminders){java.util.UUID.fromString(r.id);require(r.title.isNotBlank()&&r.title.length<=500&&r.advanceMinutes in 0..10080&&r.repeat in listOf("none","daily","weekly")&&r.zone=="Asia/Shanghai")}
  val records=data.getJSONArray("records");val rows=(0 until records.length()).map{val r=records.getJSONObject(it);val kind=r.getString("kind");require(kind in listOf("note","focus"));val j=JSONObject(r.getString("json"));if(kind=="note")require(j.getString("text").length<=16000) else j.put("boot",-1);CompanionRecord(r.getString("id"),kind,j.toString(),r.getLong("updatedAt"))}
  // Merge missing records only: importing a backup never overwrites a newer on-device edit.
  app.db.withTransaction{for(r in reminders)if(app.db.reminders().get(r.id)==null)app.db.reminders().put(r);for(r in rows)if(app.db.companion().get(r.id)==null)app.db.companion().put(r)}
  val profile=data.optJSONObject("profile")
  if(profile!=null){val edit=app.prefs().edit();for(key in listOf("name","eyeColor","voice","wakePhrase","keywordTokens")){if(!app.prefs().contains(key)&&profile.has(key)){val value=profile.getString(key);require(value.length<=500);if(key=="eyeColor")android.graphics.Color.parseColor(value);edit.putString(key,value)}};if(!app.prefs().contains("speed"))edit.putFloat("speed",profile.optDouble("speed",1.0).toFloat().coerceIn(.5f,1.5f));if(!app.prefs().contains("volume"))edit.putFloat("volume",profile.optDouble("volume",.8).toFloat().coerceIn(0f,1f));if(!app.prefs().contains("quiet"))edit.putBoolean("quiet",profile.optBoolean("quiet"));edit.apply()}
  app.alarms.restore();app.companion.restore();app.companion.log("导入备份","已合并备份中的提醒、灵感和计时")
 }
}
