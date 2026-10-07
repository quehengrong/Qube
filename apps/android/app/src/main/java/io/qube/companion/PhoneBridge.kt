package io.qube.companion

import okhttp3.*
import org.json.JSONObject
import java.security.MessageDigest
import java.security.SecureRandom
import java.security.cert.X509Certificate
import java.net.URI
import java.util.UUID
import javax.net.ssl.*
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.update

class PhoneBridge(private val app:QubeApp){
 private var socket:WebSocket?=null
 private var client:OkHttpClient?=null
 private var reconnect:Job?=null
 private var generation=0
 fun pair(raw:String){
  val p=JSONObject(raw);require(p.getInt("version")==1){"配对版本不匹配"}
  val u=URI(p.getString("url"));require(u.scheme=="wss"&&u.host!=null&&u.path=="/bridge"){"无效配对地址"}
  require(p.getString("fingerprint").matches(Regex("[a-fA-F0-9]{64}"))&&p.getString("token").length>=32){"配对凭据不完整"}
  app.prefs().edit().putString("pairing",raw).apply();connect(true)
 }
 @Synchronized fun connect(force:Boolean=false){
  if(!force&&app.ui.value.connected)return
  val raw=app.prefs().getString("pairing",null)?:return
  app.ui.update{it.copy(connected=false,canSend=false,face="offline")}
  reconnect?.cancel();generation++;val current=generation;socket?.cancel();client?.dispatcher?.executorService?.shutdown()
  val p=JSONObject(raw);val host=URI(p.getString("url")).host
  val expected=p.getString("fingerprint").lowercase()
  val trust=object:X509TrustManager{
   override fun getAcceptedIssuers()=emptyArray<X509Certificate>()
   override fun checkClientTrusted(chain:Array<X509Certificate>,authType:String){throw java.security.cert.CertificateException("Not a client trust manager")}
   override fun checkServerTrusted(chain:Array<X509Certificate>,authType:String){
    if(chain.isEmpty())throw java.security.cert.CertificateException("Missing certificate")
    chain[0].checkValidity();val digest=MessageDigest.getInstance("SHA-256").digest(chain[0].encoded).joinToString(""){"%02x".format(it)}
    if(digest!=expected)throw java.security.cert.CertificateException("Qube certificate changed; pair again")
   }
  }
  val ssl=SSLContext.getInstance("TLS");ssl.init(null,arrayOf(trust),SecureRandom())
  client=OkHttpClient.Builder().sslSocketFactory(ssl.socketFactory,trust).hostnameVerifier{hostname,_->hostname==host}.pingInterval(15,java.util.concurrent.TimeUnit.SECONDS).build()
  socket=client!!.newWebSocket(Request.Builder().url(p.getString("url")).build(),object:WebSocketListener(){
   override fun onOpen(ws:WebSocket,response:Response){if(current!=generation)return;ws.send(envelope("hello",JSONObject().put("token",p.getString("token")).put("version",1)))}
   override fun onMessage(ws:WebSocket,text:String){if(current!=generation)return;try{receive(JSONObject(text))}catch(e:Exception){app.error("消息处理失败：${e.message}")}}
   override fun onFailure(ws:WebSocket,t:Throwable,response:Response?){if(current==generation)lost()}
   override fun onClosing(ws:WebSocket,code:Int,reason:String){ws.close(code,reason)}
   override fun onClosed(ws:WebSocket,code:Int,reason:String){if(current==generation){if(code==1008){app.prefs().edit().remove("pairing").apply();app.error("配对已失效，请重新扫描")};lost()}}
  })
 }
 private fun lost(){app.ui.update{it.copy(connected=false,canSend=false,face="offline",message="电脑离线，已有提醒仍会准时提醒")};reconnect?.cancel();reconnect=app.scope.launch{delay(5000);connect()}}
 fun send(type:String,payload:JSONObject=JSONObject(),id:String=UUID.randomUUID().toString()):Boolean{
  if(!app.ui.value.connected){app.error("电脑未连接；可在手机手动设置提醒");return false}
  val ok=socket?.send(envelope(type,payload,id))==true;if(!ok)lost();return ok
 }
 private fun envelope(type:String,payload:JSONObject,id:String=UUID.randomUUID().toString())=JSONObject().put("id",id).put("type",type).put("payload",payload).toString()
 private fun receive(m:JSONObject){val p=m.getJSONObject("payload");when(m.getString("type")){
  "state"->{val d=p.getJSONObject("draft");val a=p.getJSONArray("sessions");val sessions=(0 until a.length()).map{val s=a.getJSONObject(it);Session(s.getString("id"),s.getString("name"),s.getBoolean("alive"))};app.ui.update{it.copy(connected=true,face=p.getString("face"),message=p.getString("message"),draft=d.getString("text"),revision=d.getInt("revision"),sessionId=d.optString("sessionId").takeUnless{v->v=="null"||v.isEmpty()},canSend=d.getBoolean("confirmedConnection"),sessions=sessions,mode=d.getString("mode"))}}
  "result"->app.say(p.getString("message"))
  "error"->app.error(p.getString("message"))
  "transcript"->app.ui.update{it.copy(transcript=p.getString("text"))}
  "reminder-proposal"->{app.ui.update{it.copy(proposal=p,proposalId=m.getString("id"),page="reminders")};app.say(p.getString("summary"))}
  "reminder-action"->app.ui.update{it.copy(page="reminders")}
 }}
}
