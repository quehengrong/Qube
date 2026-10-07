package io.qube.companion

object CompanionRules {
 fun audible(quiet:Boolean,category:String)=!quiet||category in setOf("important","timer","preview")
 fun remaining(status:String,paused:Long,end:Long,elapsedEnd:Long,savedBoot:Int,currentBoot:Int,wallNow:Long,elapsedNow:Long):Long = when {
  status=="paused"->paused
  savedBoot==currentBoot->elapsedEnd-elapsedNow
  else->end-wallNow
 }
}
