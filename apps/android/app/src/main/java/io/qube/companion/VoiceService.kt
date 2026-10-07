package io.qube.companion

import android.Manifest
import android.app.*
import android.content.Intent
import android.content.pm.PackageManager
import android.media.*
import android.os.*
import android.util.Base64
import com.k2fsa.sherpa.onnx.*
import kotlinx.coroutines.flow.update
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.File
import kotlin.concurrent.thread
import kotlin.math.sqrt

class VoiceService:Service(){
 companion object { @Volatile var instance:VoiceService?=null }
 @Volatile private var running=false
 @Volatile private var manual=false
 @Volatile private var muted=false
 private var recorder:AudioRecord?=null
 private var worker:Thread?=null
 private var wake:PowerManager.WakeLock?=null
 private val app get()=application as QubeApp
 override fun onBind(i:Intent?):IBinder?=null
 fun trigger(){manual=true}
 fun mute(value:Boolean){muted=value;app.ui.update{it.copy(message=if(value)"麦克风已静音" else "唤醒词监听中")}}
 override fun onStartCommand(i:Intent?,flags:Int,startId:Int):Int {
  if(running){if(i?.action=="listen")trigger();return START_NOT_STICKY}
  if(checkSelfPermission(Manifest.permission.RECORD_AUDIO)!=PackageManager.PERMISSION_GRANTED){stopSelf();return START_NOT_STICKY}
  val pending=PendingIntent.getActivity(this,0,Intent(this,MainActivity::class.java),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  startForeground(1,Notification.Builder(this,"voice").setSmallIcon(android.R.drawable.ic_btn_speak_now).setContentTitle("Qube 唤醒词监听中").setContentText("点击打开，随时可停止或静音").setContentIntent(pending).setOngoing(true).build())
  instance=this;running=true;manual=i?.action=="listen";app.ui.update{it.copy(voiceRunning=true)}
  wake=getSystemService(PowerManager::class.java).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK,"Qube:voice").apply{acquire()}
  app.bridge.connect();worker=thread(name="Qube audio"){recordLoop()};return START_NOT_STICKY
 }
 private fun recordLoop(){var kws:KeywordSpotter?=null;var stream:OnlineStream?=null
  try{
   val dir="kws";val keywords=File(filesDir,"keywords.txt");val tokens=app.prefs().getString("keywordTokens","x iǎo j ī x iǎo j ī @小机小机")!!;keywords.writeText(tokens+"\n")
   val config=KeywordSpotterConfig(modelConfig=OnlineModelConfig(transducer=OnlineTransducerModelConfig(encoder="$dir/encoder.onnx",decoder="$dir/decoder.onnx",joiner="$dir/joiner.onnx"),tokens="$dir/tokens.txt",numThreads=2,modelType="zipformer2"),keywordsFile="kws/keywords.txt")
   kws=KeywordSpotter(assets,config);stream=kws.createStream(tokens);require(stream.ptr!=0L){"唤醒词无效"}
   val size=AudioRecord.getMinBufferSize(16000,AudioFormat.CHANNEL_IN_MONO,AudioFormat.ENCODING_PCM_16BIT).coerceAtLeast(6400)
   if(checkSelfPermission(Manifest.permission.RECORD_AUDIO)!=PackageManager.PERMISSION_GRANTED)throw SecurityException("麦克风权限已撤销")
   recorder=AudioRecord(MediaRecorder.AudioSource.VOICE_RECOGNITION,16000,AudioFormat.CHANNEL_IN_MONO,AudioFormat.ENCODING_PCM_16BIT,size)
   check(recorder?.state==AudioRecord.STATE_INITIALIZED){"麦克风无法初始化"};recorder!!.startRecording()
   val buffer=ShortArray(1600);var capture:ByteArrayOutputStream?=null;var elapsed=0;var silence=0;var speech=false;var suppressUntil=0L
   while(running){val n=recorder!!.read(buffer,0,buffer.size);if(n<=0)continue
    if(app.speaking){suppressUntil=System.currentTimeMillis()+600;capture=null;app.ui.update{it.copy(listening=false)};kws.reset(stream);continue}
    if(muted||System.currentTimeMillis()<suppressUntil){manual=false;continue}
    val floats=FloatArray(n){buffer[it]/32768f}
    if(capture==null){
     stream.acceptWaveform(floats,16000);var detected=false
     while(kws.isReady(stream)){kws.decode(stream);if(kws.getResult(stream).keyword.isNotBlank()){detected=true;kws.reset(stream);break}}
     if(manual||detected){manual=false;if(!app.ui.value.connected){app.say("电脑未连接，已有提醒不受影响");continue};capture=ByteArrayOutputStream();elapsed=0;silence=0;speech=false;app.ui.update{it.copy(listening=true,face="listening",message="我在听…")}}
    }else{
     for(index in 0 until n){val sample=buffer[index].toInt();capture.write(sample and 255);capture.write((sample shr 8) and 255)}
     elapsed+=n;val rms=sqrt(floats.sumOf{(it*it).toDouble()}/n);if(rms>0.008){speech=true;silence=0}else silence+=n
     if(elapsed>=960000||(speech&&silence>=19200)||(!speech&&elapsed>=128000)){
      val bytes=capture.toByteArray();capture=null;kws.reset(stream);app.ui.update{it.copy(listening=false,face="thinking")}
      if(speech)app.bridge.send("audio",JSONObject().put("sampleRate",16000).put("pcm",Base64.encodeToString(bytes,Base64.NO_WRAP)))else app.say("没有听清，请再试一次")
     }
    }
   }
  }catch(e:Exception){app.error("语音启动或运行失败：${e.message}")}
  finally{try{recorder?.stop()}catch(_:Exception){};recorder?.release();recorder=null;stream?.release();kws?.release();stopSelf()}
 }
 override fun onDestroy(){running=false;instance=null;wake?.let{if(it.isHeld)it.release()};app.ui.update{it.copy(voiceRunning=false,listening=false)};super.onDestroy()}
}
