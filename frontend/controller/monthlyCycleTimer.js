'use strict'

import sbp from '~/shared/sbp.js'
import { dateToMonthstamp, compareMonthstamps, currentMonthstamp } from '~/frontend/utils/time.js'

// Make the interval faster if we're running cypress so that it doesn't time out:
const monthlyCycleIntervalMilliseconds = process.env.NODE_ENV === 'development' ? 1000 : 5000

let timerStartInterval

export function startMonthlyCycleCheckInterval (store: Object) {
  if (timerStartInterval) clearInterval(timerStartInterval)
  timerStartInterval = setInterval(() => {
    if (store.state.currentGroupId) {
      const events = store.getters.currentGroupState.distributionEvents
      const lastEvent = events[events.length - 1]
      const lastCycle = dateToMonthstamp(lastEvent.data.when)
      const currentCycle = currentMonthstamp()
      // Add 'startCycleEvent' events if a month has passed.
      if (compareMonthstamps(currentCycle, lastCycle) > 0) {
        // Add the missing monthly cycle event
        sbp('gi.actions/group/resetMonth', {
          data: '',
          contractID: store.state.currentGroupId
        })
      }
    }
  }, monthlyCycleIntervalMilliseconds)
}
