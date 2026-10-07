package io.qube.companion

import androidx.compose.animation.core.*
import androidx.compose.foundation.Canvas
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
 val transition=rememberInfiniteTransition(label="eyes")
 val clock by transition.animateFloat(0f,1f,infiniteRepeatable(tween(6000,easing=LinearEasing)),label="clock")
 val color=when(state.face){"error"->Color(0xFFFFB098);"offline"->Color(0xFF77B1BD);else->Color(0xFF73EDD0)}
 Box(Modifier.fillMaxSize().background(Color(0xFF080D13))){
  Canvas(Modifier.fillMaxSize().padding(bottom=50.dp)){
   val w=size.width*.115f;val h=size.height*.38f;val cx=size.width/2+sin(clock*6.28f)*size.width*.012f;val cy=size.height/2+sin(clock*12.56f)*4
   val blink=if(clock in .44f.. .49f) .12f else 1f
   val height=h*blink*if(state.face=="thinking")(.6f+.15f*sin(clock*50)) else if(state.face=="success") .8f else 1f
   for(sign in listOf(-1,1)){val x=cx+sign*w*.95f-w/2;drawRoundRect(color.copy(alpha=.05f),Offset(x-18,cy-height/2-18),Size(w+36,height+36),CornerRadius(w*.45f));drawRoundRect(color,Offset(x,cy-height/2),Size(w,height),CornerRadius(w*.35f))}
   if(state.listening){for(i in -8..8){val bh=8+18*kotlin.math.abs(sin(clock*100+i));drawRoundRect(color,Offset(cx+i*12-3,cy+h*.8f-bh/2),Size(6f,bh),CornerRadius(3f))}}
  }
  Column(Modifier.align(Alignment.BottomCenter).padding(12.dp),horizontalAlignment=Alignment.CenterHorizontally){Text(if(state.listening)"我在听" else if(state.connected)"小机小机 · 随时叫我" else "电脑离线 · 提醒仍在",color=color,fontSize=13.sp);Text(state.message,color=Color(0xFF9DB0C0),fontSize=12.sp,maxLines=2)}
 }
}
