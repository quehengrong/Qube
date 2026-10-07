package io.qube.companion
import org.junit.Assert.*
import org.junit.Test
class ReminderTimeTest {
 @Test fun missedOccurrencesSkipForward(){val due=100000L;val now=due+3*86400000L+1000;assertEquals(due+4*86400000L,ReminderTime.next(due,"daily",now))}
 @Test fun earlyAlertCannotScheduleInPast(){val r=Reminder(title="meeting",dueAt=500000,advanceMinutes=10);assertEquals(101000,ReminderTime.trigger(r,100000))}
 @Test fun weeklyKeepsWallClockInShanghai(){val due=100000L;assertEquals(due+604800000L,ReminderTime.next(due,"weekly",due))}
}
