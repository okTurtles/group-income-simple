/* eslint-env mocha */

import should from 'should'
import groupIncomeDistribution from './group-income-distribution.js'
import { addMonthsToDate, compareCycles, dateToMonthstamp } from '~/frontend/utils/time.js'
const mincomeAmount = 1000
let setup = []

const defaultStartDate = '2021-01'

// Helper function that returns the date string for a specific number of cycles past a specific start date.
function dateAtCyclesPassed (cycles, startDate = defaultStartDate) {
  return addMonthsToDate(startDate, cycles).toISOString()
}

// Helper fuction that inserts the "startCycleEvent" between each month's set of events.
function insertMonthlyCycleEvents (events: Array<Object>): Array<Object> {
  const newEvents = []
  let lastEvent = null
  for (const event of events) {
    if (!lastEvent) lastEvent = event
    if (compareCycles(event.data.when, lastEvent.data.when) > 0) {
      // Add the missing monthly cycle event
      const monthlyCycleEvent = {
        type: 'startCycleEvent',
        data: {
          latePayments: [], // List to be populated later, by the events-parser
          when: dateToMonthstamp(addMonthsToDate(dateToMonthstamp(lastEvent.data.when), 1))
        }
      }
      newEvents.push(monthlyCycleEvent)
      lastEvent = monthlyCycleEvent
    }

    newEvents.push(event)
  }

  return newEvents
}

// Helper fuction that inserts the "when" of each event.data.
function groupIncomeDistributionWrapper (events, opts, timeSpanMonths = 1.0, startDate = defaultStartDate) {
  events = [{ type: 'startCycleEvent', data: { when: dateToMonthstamp(startDate), latePayments: [] } }].concat(events)
  const eventsWithTimeStamps = insertMonthlyCycleEvents(events.map((v, i) => {
    v.data.when = v.data.when ? v.data.when : dateToMonthstamp(addMonthsToDate(startDate, i * timeSpanMonths / events.length))
    return v
  }))
  console.table(eventsWithTimeStamps) // TODO: for demonstration of commit; REMOVE!!!
  return groupIncomeDistribution(eventsWithTimeStamps, opts)
}

describe('Test group-income-distribution.js', function () {
  it('Test empty distirbution event list for un-adjusted distribution.', function () {
    should(groupIncomeDistributionWrapper(setup, { adjusted: false, minimizeTxns: false, mincomeAmount })).eql([])
  })
  it('EVENTS: [u1, u5, u2 and u3] join the group and set haveNeeds of [100, 100, -50, and -50], respectively. Test unadjusted.', function () {
    setup = setup.concat([{ type: 'haveNeedEvent', data: { name: 'u1', haveNeed: 100 } },
      { type: 'haveNeedEvent', data: { name: 'u5', haveNeed: 100 } },
      { type: 'haveNeedEvent', data: { name: 'u2', haveNeed: -50 } },
      { type: 'haveNeedEvent', data: { name: 'u3', haveNeed: -50 } }
    ])
    should(groupIncomeDistributionWrapper(setup, { adjusted: false, minimizeTxns: false, mincomeAmount })).eql([
      { from: 'u1', to: 'u2', amount: 25 },
      { from: 'u1', to: 'u3', amount: 25 },
      { from: 'u5', to: 'u2', amount: 25 },
      { from: 'u5', to: 'u3', amount: 25 }
    ])
  })
  it('Test the adjusted version of the previous event-list. Should be unchanged.', function () {
    should(groupIncomeDistributionWrapper(setup, { adjusted: true, minimizeTxns: false, mincomeAmount })).eql([
      { from: 'u1', to: 'u2', amount: 25 },
      { from: 'u1', to: 'u3', amount: 25 },
      { from: 'u5', to: 'u2', amount: 25 },
      { from: 'u5', to: 'u3', amount: 25 }
    ])
  })
  it('EVENT: a payment of $10 is made from u1 to u2. Test unadjusted first (again, unchanged)', function () {
    setup.push({ type: 'paymentEvent', data: { from: 'u1', to: 'u2', amount: 10 } })
    should(groupIncomeDistributionWrapper(setup, { adjusted: false, minimizeTxns: false, mincomeAmount })).eql([
      { from: 'u1', to: 'u2', amount: 25 },
      { from: 'u1', to: 'u3', amount: 25 },
      { from: 'u5', to: 'u2', amount: 25 },
      { from: 'u5', to: 'u3', amount: 25 }
    ])
  })
  // With transaction minimization enabled it should look like this:
  // expect(groupIncomeDistributionWrapper(setup, { adjusted: false, minimizeTxns: true })).eql([
  //   { from: 'u1', to: 'u2', amount: 50 },
  //   { from: 'u5', to: 'u3', amount: 50 }
  // ])
  it('Test the adjusted version of the previous event-list. Should *not* ignore payment events!', function () {
    should(groupIncomeDistributionWrapper(setup, { adjusted: true, minimizeTxns: false, mincomeAmount })).eql([
      { from: 'u1', to: 'u2', amount: 15 },
      { from: 'u1', to: 'u3', amount: 25 },
      { from: 'u5', to: 'u2', amount: 25 },
      { from: 'u5', to: 'u3', amount: 25 }
    ])
  })
  // With transaction minimization enabled it should look like this:
  // expect(groupIncomeDistributionWrapper(setup, { adjusted: true, minimizeTxns: true })).eql([
  //   { from: 'u1', to: 'u2', amount: 40 },
  //   { from: 'u5', to: 'u3', amount: 50 }
  // ])
  it('EVENT: u4 joins and sets a need of 100. Test un-adjsuted first.', function () {
    setup.push({ type: 'haveNeedEvent', data: { name: 'u4', haveNeed: -100 } })
    should(groupIncomeDistributionWrapper(setup, { adjusted: false, minimizeTxns: false, mincomeAmount })).eql([
      { from: 'u1', to: 'u2', amount: 25 },
      { from: 'u1', to: 'u3', amount: 25 },
      { from: 'u1', to: 'u4', amount: 50 },
      { from: 'u5', to: 'u2', amount: 25 },
      { from: 'u5', to: 'u3', amount: 25 },
      { from: 'u5', to: 'u4', amount: 50 }
    ])
  })
  it('Test the adjusted version of the previous event-list. Should *not* ignore payment events!', function () {
    should(groupIncomeDistributionWrapper(setup, { adjusted: true, minimizeTxns: false, mincomeAmount })).eql([
      { from: 'u1', to: 'u2', amount: 15 },
      { from: 'u1', to: 'u3', amount: 25 },
      { from: 'u1', to: 'u4', amount: 50 },
      { from: 'u5', to: 'u2', amount: 25 },
      { from: 'u5', to: 'u3', amount: 25 },
      { from: 'u5', to: 'u4', amount: 50 }
    ])
  })
  // With transaction minimization enabled it should look like this:
  // expect(groupIncomeDistributionWrapper(setup, { adjusted: true, minimizeTxn\s: true })).eql([
  //   { from: 'u1', to: 'u2', amount: 40 },
  //   { from: 'u1', to: 'u3', amount: 50 },
  //   { from: 'u5', to: 'u4', amount: 100 }
  // ])
  it('EVENT: u3 removes themselves from the group. Test un-adjsuted first.', function () {
    setup.push({ type: 'userExitsGroupEvent', data: { name: 'u3' } })
    should(groupIncomeDistributionWrapper(setup, { adjusted: false, minimizeTxns: false, mincomeAmount })).eql([
      { from: 'u1', to: 'u2', amount: 25 },
      { from: 'u1', to: 'u4', amount: 50 },
      { from: 'u5', to: 'u2', amount: 25 },
      { from: 'u5', to: 'u4', amount: 50 }
    ])
  })
  it('Test the adjusted version of the previous event-list. Should *not* ignore payment events!', function () {
    should(groupIncomeDistributionWrapper(setup, { adjusted: true, minimizeTxns: false, mincomeAmount })).eql([
      { from: 'u1', to: 'u2', amount: 15 },
      { from: 'u1', to: 'u4', amount: 50 },
      { from: 'u5', to: 'u2', amount: 25 },
      { from: 'u5', to: 'u4', amount: 50 }
    ])
  })
  // With transaction minimization enabled it should look like this:
  // expect(groupIncomeDistributionWrapper(setup, { adjusted: true, minimizeTxns: true })).eql([
  //   { from: 'u1', to: 'u2', amount: 40 },
  //   { from: 'u1', to: 'u4', amount: 25 },
  //   { from: 'u5', to: 'u4', amount: 75 }
  // ])
  it('EVENT: u1 pays $5 to u4. Test un-adjsuted first.', function () {
    setup.push({ type: 'paymentEvent', data: { from: 'u1', to: 'u4', amount: 5 } })
    should(groupIncomeDistributionWrapper(setup, { adjusted: false, minimizeTxns: false, mincomeAmount })).eql([
      { from: 'u1', to: 'u2', amount: 25 },
      { from: 'u1', to: 'u4', amount: 50 },
      { from: 'u5', to: 'u2', amount: 25 },
      { from: 'u5', to: 'u4', amount: 50 }
    ])
  })
  it('Test the adjusted version of the previous event-list. Should *not* ignore payment events!', function () {
    should(groupIncomeDistributionWrapper(setup, { adjusted: true, minimizeTxns: false, mincomeAmount })).eql([
      { from: 'u1', to: 'u2', amount: 15 },
      { from: 'u1', to: 'u4', amount: 45 },
      { from: 'u5', to: 'u2', amount: 25 },
      { from: 'u5', to: 'u4', amount: 50 }
    ])
  })
  // With transaction minimization enabled it should look like this:
  // expect(groupIncomeDistributionWrapper(setup, { adjusted: true, minimizeTxns: true })).eql([
  //   { from: 'u1', to: 'u2', amount: 40 },
  //   { from: 'u1', to: 'u4', amount: 20 },
  //   { from: 'u5', to: 'u4', amount: 75 }
  // ])
  it('EVENT: u3 rejoins and sets haveNeed to -100. Test un-adjuusted first.', function () {
    setup.push({ type: 'haveNeedEvent', data: { name: 'u3', haveNeed: -100 } })
    should(groupIncomeDistributionWrapper(setup, { adjusted: false, minimizeTxns: false, mincomeAmount })).eql([
      { from: 'u1', to: 'u2', amount: 20 },
      { from: 'u1', to: 'u4', amount: 40 },
      { from: 'u1', to: 'u3', amount: 40 },
      { from: 'u5', to: 'u2', amount: 20 },
      { from: 'u5', to: 'u4', amount: 40 },
      { from: 'u5', to: 'u3', amount: 40 }
    ])
  })
  it('Test the adjusted version of the previous event-list. Should *not* ignore payment events!', function () {
    should(groupIncomeDistributionWrapper(setup, { adjusted: true, minimizeTxns: false, mincomeAmount })).eql([
      { from: 'u1', to: 'u2', amount: 10 },
      { from: 'u1', to: 'u4', amount: 35 },
      { from: 'u1', to: 'u3', amount: 40 },
      { from: 'u5', to: 'u2', amount: 20 },
      { from: 'u5', to: 'u4', amount: 40 },
      { from: 'u5', to: 'u3', amount: 40 }
    ])
  })
  // Something along these lines (could be different! but shouldn't exceed this number of txns!)
  // expect(groupIncomeDistributionWrapper(setup, { adjusted: true, minimizeTxns: true })).eql([
  //   { from: 'u1', to: 'u2', amount: 30 },
  //   { from: 'u1', to: 'u4', amount: 55 },
  //   { from: 'u5', to: 'u3', amount: 80 },
  //   { from: 'u5', to: 'u4', amount: 20 }
  // ])
  it('EVENT: u5 pays $10 to u2. Test un-adjusted first.', function () {
    setup.push({ type: 'paymentEvent', data: { from: 'u5', to: 'u2', amount: 10 } })
    should(groupIncomeDistributionWrapper(setup, { adjusted: false, minimizeTxns: false, mincomeAmount })).eql([
      { from: 'u1', to: 'u2', amount: 20 },
      { from: 'u1', to: 'u4', amount: 40 },
      { from: 'u5', to: 'u2', amount: 20 },
      { from: 'u1', to: 'u3', amount: 40 },
      { from: 'u5', to: 'u4', amount: 40 },
      { from: 'u5', to: 'u3', amount: 40 }
    ])
  })
  it('Test the adjusted version of the previous event-list. Should *not* ignore payment events!', function () {
    should(groupIncomeDistributionWrapper(setup, { adjusted: true, minimizeTxns: false, mincomeAmount })).eql([
      { from: 'u1', to: 'u2', amount: 10 },
      { from: 'u1', to: 'u4', amount: 35 },
      { from: 'u1', to: 'u3', amount: 40 },
      { from: 'u5', to: 'u2', amount: 10 },
      { from: 'u5', to: 'u4', amount: 40 },
      { from: 'u5', to: 'u3', amount: 40 }
    ])
  })
  // Setup:
  // Every month u1 sends u2 $20
  // Last month u1 only sent u2 $10
  // So this month u1 has to send u2 $10 (Late Payment) + $20 for this month
  // So, u1 sends u2 $20
  // BUT, then u2 adjusts their income details (or maybe someone else does), and u1's TODO list for u2 has now changed from $20 / month, to $10 / month
  // So, since u1 sent u2 $20 this month, then the late payment of $10 has already been knocked out, plus u1 has paid for this month too
  it('Test the adjusted version of the previous event-list. Should *not* ignore payment events!', function () {
    setup = [
      { type: 'haveNeedEvent', data: { name: 'u1', haveNeed: 20, when: dateAtCyclesPassed(0.21) } },
      { type: 'haveNeedEvent', data: { name: 'u2', haveNeed: -20, when: dateAtCyclesPassed(0.1) } },
      { type: 'paymentEvent', data: { from: 'u1', to: 'u2', amount: 20, when: dateAtCyclesPassed(0.2) } },
      { type: 'paymentEvent', data: { from: 'u1', to: 'u2', amount: 10, when: dateAtCyclesPassed(1.1) } },
      { type: 'paymentEvent', data: { from: 'u1', to: 'u2', amount: 20, when: dateAtCyclesPassed(2.1) } },
      { type: 'haveNeedEvent', data: { name: 'u2', haveNeed: -10, when: dateAtCyclesPassed(2.2) } }
    ]
    should(groupIncomeDistributionWrapper(setup, { adjusted: true, minimizeTxns: false, mincomeAmount })).eql([])
  })
})
