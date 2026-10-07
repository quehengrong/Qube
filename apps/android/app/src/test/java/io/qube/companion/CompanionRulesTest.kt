package io.qube.companion

import org.junit.Assert.*
import org.junit.Test

class CompanionRulesTest {
 @Test fun focusAllowsOnlyImportantAndTimerAnnouncements(){for(category in listOf("agent","normal","reminder"))assertFalse(CompanionRules.audible(true,category));assertTrue(CompanionRules.audible(true,"important"));assertTrue(CompanionRules.audible(true,"timer"));assertTrue(CompanionRules.audible(false,"agent"))}
 @Test fun wallClockChangesDoNotAffectRunningTimer(){val a=CompanionRules.remaining("running",0,100000,60000,2,2,10000,30000);val b=CompanionRules.remaining("running",0,100000,60000,2,2,9000000,30000);assertEquals(30000L,a);assertEquals(a,b)}
 @Test fun rebootUsesPersistedWallDeadline(){assertEquals(25000L,CompanionRules.remaining("running",0,100000,60000,2,3,75000,2000))}
 @Test fun pauseDoesNotCountBackgroundTime(){assertEquals(15000L,CompanionRules.remaining("paused",15000,100000,60000,2,3,9000000,50000))}
}
