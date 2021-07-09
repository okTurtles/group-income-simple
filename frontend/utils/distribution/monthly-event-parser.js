'use strict'
import incomeDistribution from '~/frontend/utils/distribution/mincome-proportional.js'
import { cycleAtDate } from '~/frontend/utils/time.js'

// Flatten's out multiple payments between unique combinations of users
// for a payment distribution by adding the unique combinations' payment
// amounts based on the direction (from/to) of the payments:
function reduceDistribution (payments: Array<Object>): Array<Object> {
  // Don't modify the payments list/object parameter in-place, as this is not intended:
  payments = JSON.parse(JSON.stringify(payments))
  // Loop through the unique combinations of payments:
  for (let i = 0; i < payments.length; i++) {
    const paymentA = payments[i]
    for (let j = i + 1; j < payments.length; j++) {
      const paymentB = payments[j]

      // Were paymentA and paymentB between the same two users?
      if ((paymentA.from === paymentB.from && paymentA.to === paymentB.to) ||
        (paymentA.to === paymentB.from && paymentA.from === paymentB.to)) {
        // Add or subtract paymentB's amount to paymentA's amount, depending on the relative
        // direction of the two payments:
        paymentA.amount += (paymentA.from === paymentB.from ? 1 : -1) * paymentB.amount

        // Remove paymentB from payments, and decrement the inner sentinal loop variable:
        payments = payments.filter((_, paymentIndex) => { return paymentIndex !== j })
        j--
      }
    }
  }
  return payments
}

// DRYing function meant for accumulating late payments from a previous cycle
function addDistributions (paymentsA: Array<Object>, paymentsB: Array<Object>): Array<Object> {
  return reduceDistribution([paymentsA, paymentsB].flat())
}

// DRYing function meant for chipping away a cycle's todoPayments distribution using that cycle's completedMonthlyPayments:
function subtractDistributions (paymentsA: Array<Object>, paymentsB: Array<Object>): Array<Object> {
  // Don't modify any payment list/objects parameters in-place, as this is not intended:
  paymentsB = JSON.parse(JSON.stringify(paymentsB))

  // Reverse the sign of the second operand's amounts so that the final addition is actually subtraction:
  paymentsB = paymentsB.map((p) => {
    p.amount *= -1
    return p
  })

  return addDistributions(paymentsA, paymentsB)
}

// This algorithm is responsible for calculating the monthly-rated distribution of
// payments. monthlyRated = True if time-weighted monthly, false if purely pro-rated.
function parseMonthlyDistributionFromEvents (distributionEvents: Array<Object>, minCome: number, monthlyRated: Boolean, adjusted: Boolean): Array<Object> {
  distributionEvents = JSON.parse(JSON.stringify(distributionEvents))

  const newLastEvent = {
    type: 'startCycleEvent',
    data: {
      latePayments: [] // List to be populated later, by the events-parser
    }
  }
  // Add blank 'startCycleEvent's in after the distributionEvents
  distributionEvents.push(newLastEvent)

  // The following list variable is for DRYing out our calculations of the each cycle's final
  // income distributions.
  let groupMembers = []

  // Convenience function for retreiving a user by name:
  const getUser = name => groupMembers.find(member => member.name === name)

  const proRateHaveNeeds = function (proRatedMembers, cyclesIntoMonth = 1) {
    for (const member of proRatedMembers) {
      // Calculate the time-step of the integral of our constant haveNeed function (ignored when monthlyRated is true)
      const deltaCycle = (cyclesIntoMonth - member.cyclicalIncomeVariable)

      // Update the existing user's pro-rated income (cyclicalIncomeIntegral), time-variable (cyclicalIncomeVariable), and currently declared income:
      member.cyclicalIncomeVariable = cyclesIntoMonth

      // Integrate the constant function with respect to whether it is pro-rated monthly, or down to the day (or millisecond):
      member.cyclicalIncomeIntegral = monthlyRated ? member.haveNeed : member.cyclicalIncomeIntegral + deltaCycle * member.haveNeed
    }
    return proRatedMembers
  }

  const redistributeOverToLatePayments = function (overPayments, latePayments) {
    const adjustingPayments = []
    const needers = groupMembers.filter((m) => m.cyclicalIncomeIntegral < 0)
    for (const overPayment of overPayments) {
      const totalNeedByOthers = needers.reduce((acc, m) => m.name !== overPayment.to ? acc + m.cyclicalIncomeIntegral : 0, 0)
      for (const needer of needers) {
        if (needer.name !== overPayment.to) {
          adjustingPayments.push({
            from: overPayment.from,
            to: needer.name,
            amount: -overPayment.amount * needer.cyclicalIncomeIntegral / totalNeedByOthers
          })
        } else {
          adjustingPayments.push({
            from: overPayment.from,
            to: needer.name,
            amount: -overPayment.amount
          })
        }
      }
    }
    return reduceDistribution([latePayments, adjustingPayments].flat())
  }

  // Make a place to store the previous cycle's startCycleEvent (where over/under-payments are stored)
  // so that they can be included in the next cycle's payment distribution calculations:
  let lastStartCycleEvent = {}
  let monthlyDistribution = [] // For each cycle's monthly distribution calculation
  let completedMonthlyPayments = [] // For accumulating the payment events of each month's cycle.

  // Create a helper function for calculating each cycle's payment distribution:
  const paymentsDistribution = function (groupMembers, minCome) {
    const groupIncomes = groupMembers.map((user) => {
      return {
        name: user.name,
        amount: minCome + user.cyclicalIncomeIntegral
      }
    })
    return incomeDistribution(groupIncomes, minCome)
  }
  // Loop through the events, pro-rating each user's monthly pledges/needs:
  for (const event of distributionEvents) {
    if (event.type === 'startCycleEvent') {
      monthlyDistribution = paymentsDistribution(proRateHaveNeeds(groupMembers), minCome)

      // Check if it is the last event (the next month after monthstamps cycle event), or if the
      // final distribution should be adjusted, anyway:
      monthlyDistribution = subtractDistributions(monthlyDistribution, completedMonthlyPayments)

      const overPayments = monthlyDistribution.filter((p) => {
        return p.amount < 0
      }).map((p) => {
        p.amount = Math.abs(p.amount)
        return p
      })

      const latePayments = monthlyDistribution.filter((p) => {
        return p.amount > 0
      })

      lastStartCycleEvent = event
      lastStartCycleEvent.data.latePayments = redistributeOverToLatePayments(overPayments, latePayments)

      // Reset the income distribution calcuulation at the start of each cycle...
      for (const member of groupMembers) {
        member.cyclicalIncomeVariable = 0
        member.cyclicalIncomeIntegral = 0
      }

      // Unadjust last
      if (!adjusted) {
        lastStartCycleEvent.data.latePayments = reduceDistribution(addDistributions(completedMonthlyPayments, lastStartCycleEvent.data.latePayments))
      }
      completedMonthlyPayments = [] // and the monthly payments, too...
    } else if (event.type === 'haveNeedEvent') {
      const oldUser = getUser(event.data.name)
      const cyclesIntoMonth = monthlyRated ? 1 : cycleAtDate(event.data.when)
      if (oldUser) {
        proRateHaveNeeds([oldUser], cyclesIntoMonth)
        oldUser.haveNeed = event.data.haveNeed
      } else {
        // Add the user who declared their income to our groupMembers list variable
        groupMembers.push({
          name: event.data.name,
          haveNeed: event.data.haveNeed,
          cyclicalIncomeVariable: cyclesIntoMonth,
          cyclicalIncomeIntegral: 0
        })
      }
    } else if (event.type === 'paymentEvent') {
      completedMonthlyPayments.push({
        from: event.data.from,
        to: event.data.to,
        amount: event.data.amount
      })
    } else if (event.type === 'userExitsGroupEvent') {
      groupMembers = groupMembers.filter((v) => { return v.name !== event.data.name })
    }
  }

  return lastStartCycleEvent.data.latePayments.filter((payment) => {
    return payment.from !== payment.to // This happens when a haver switches to being a needer; remove neutral distribution payments.
  }) // TODO: return late-payments as well.
}

export default parseMonthlyDistributionFromEvents
