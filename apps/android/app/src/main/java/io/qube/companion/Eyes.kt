package io.qube.companion

import androidx.compose.animation.core.*
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.ui.input.pointer.pointerInput
import kotlinx.coroutines.delay
import org.json.JSONObject
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlin.math.sin

@Composable fun Eyes(state:UiState){
 val app=QubeApp.instance
 var gesture by remember{mutableStateOf("")};var lastTap by remember{mutableLongStateOf(0)};var taps by remember{mutableIntStateOf(0)}
 LaunchedEffect(gesture){if(gesture.isNotBlank()){delay(700);gesture=""}}
 val selected=state.sessions.find{it.id==state.sessionId};val face=if(state.listening)"listening" else if(selected?.status in listOf("waiting_input","waiting_approval"))"attention" else if(selected?.status=="running")"thinking" else state.face
 val transition=rememberInfiniteTransition(label="eyes")
 val clock by transition.animateFloat(0f,1f,infiniteRepeatable(tween(6000,easing=LinearEasing)),label="clock")
 val color=when(face){"error"->Color(0xFFFFB098);"offline"->Color(0xFF77B1BD);else->runCatching{Color(android.graphics.Color.parseColor(app.prefs().getString("eyeColor","#73EDD0")))}.getOrDefault(Color(0xFF73EDD0))}
 Box(Modifier.fillMaxSize().background(Color(0xFF080D13)).pointerInput(Unit){detectTapGestures(onTap={val now=System.currentTimeMillis();taps=if(now-lastTap<1000)taps+1 else 1;lastTap=now;gesture=if(taps>=3)"confused" else "blink"},onLongPress={app.setQuiet(!app.prefs().getBoolean("quiet",false))})}){
  Canvas(Modifier.fillMaxSize().padding(bottom=50.dp)){
   val w=size.width*.115f;val h=size.height*.38f;val cx=size.width/2+sin(clock*6.28f)*size.width*.012f;val cy=size.height/2+sin(clock*12.56f)*4
   val blink=if(gesture=="blink") .12f else if(clock in .44f.. .49f) .12f else 1f
   val height=h*blink*if(face=="thinking")(.6f+.15f*sin(clock*50)) else if(face=="success") .8f else 1f
   for(sign in listOf(-1,1)){val x=cx+sign*w*.95f-w/2;drawRoundRect(color.copy(alpha=.05f),Offset(x-18,cy-height/2-18),Size(w+36,height+36),CornerRadius(w*.45f));drawRoundRect(color,Offset(x,cy-height/2),Size(w,if((gesture=="confused"||face=="attention")&&sign==1)height*.6f else height),CornerRadius(w*.35f))}
   if(state.listening){for(i in -8..8){val bh=8+18*kotlin.math.abs(sin(clock*100+i));drawRoundRect(color,Offset(cx+i*12-3,cy+h*.8f-bh/2),Size(6f,bh),CornerRadius(3f))}}
  }
  Column(Modifier.align(Alignment.BottomCenter).padding(12.dp),horizontalAlignment=Alignment.CenterHorizontally){if(state.quiet)Text("安静模式",color=color,fontSize=12.sp)
   val f=runCatching{JSONObject(state.focus)}.getOrNull();var tick by remember{mutableLongStateOf(0)};LaunchedEffect(state.focus){while(f?.optString("status")=="running"){tick++;delay(1000)}};if(f?.optString("status") in listOf("running","paused")){val remaining=app.companion.remaining(f!!).coerceAtLeast(0)/1000;Text("${if(f.optString("kind")=="focus")"专注" else "休息"} ${remaining/60}:${(remaining%60).toString().padStart(2,'0')}",color=color,fontSize=18.sp);@Suppress("UNUSED_EXPRESSION") tick}
   Text(if(state.listening)"我在听" else if(state.connected)"${app.prefs().getString("wakePhrase","小机小机")} · 随时叫我" else "电脑离线 · 提醒仍在",color=color,fontSize=13.sp);Text(state.message,color=Color(0xFF9DB0C0),fontSize=12.sp,maxLines=2)}
 }
}
