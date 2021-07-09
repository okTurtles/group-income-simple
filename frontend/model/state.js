'use strict'

// This file handles application-level state (as opposed to component-level
// state) per: http://vuex.vuejs.org/en/intro.html

import type { GIOpContract } from '~/shared/domains/chelonia/GIMessage.js'

import sbp from '~/shared/sbp.js'
import Vue from 'vue'
import Vuex from 'vuex'
import L from '~/frontend/views/utils/translations.js'
// import incomeDistribution from '~/frontend/utils/distribution/mincome-proportional.js'
import { GIMessage } from '~/shared/domains/chelonia/GIMessage.js'
import { SETTING_CURRENT_USER } from './database.js'
import { ErrorDBBadPreviousHEAD, ErrorDBConnection } from '~/shared/domains/gi/db.js'
import Colors from './colors.js'
import { TypeValidatorError } from '~/frontend/utils/flowTyper.js'
import { GIErrorUnrecoverable, GIErrorIgnoreAndBanIfGroup, GIErrorDropAndReprocess } from './errors.js'
import { STATUS_OPEN, PROPOSAL_REMOVE_MEMBER } from './contracts/voting/constants.js'
// import { PAYMENT_COMPLETED } from '~/frontend/model/contracts/payments/index.js'
import { VOTE_FOR } from '~/frontend/model/contracts/voting/rules.js'
import * as _ from '~/frontend/utils/giLodash.js'
import * as EVENTS from '~/frontend/utils/events.js'
import './contracts/group.js'
import './contracts/mailbox.js'
import './contracts/identity.js'
import { captureLogsStart, captureLogsPause } from '~/frontend/model/captureLogs.js'
import { THEME_LIGHT, THEME_DARK } from '~/frontend/utils/themes.js'
import groupIncomeDistribution from '~/frontend/utils/distribution/group-income-distribution.js'
import { currentMonthstamp, prevMonthstamp, dateFromMonthstamp, lastDayOfMonth, dateToMonthstamp } from '~/frontend/utils/time.js'
import currencies from '~/frontend/views/utils/currencies.js'

Vue.use(Vuex)
// let store // this is set and made the default export at the bottom of the file.
// we have it declared here to make it accessible in mutations
// 'state' is the Vuex state object, and it can only store JSON-like data
let dropAllMessagesUntilRefresh = false
let attemptToReprocessMessageID = ''
const contractIsSyncing: {[string]: boolean} = {}

let defaultTheme = THEME_LIGHT
if (typeof (window) !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
  defaultTheme = THEME_DARK
}

const initialState = {
  currentGroupId: null,
  contracts: {}, // contractIDs => { type:string, HEAD:string } (for contracts we've successfully subscribed to)
  pending: [], // contractIDs we've just published but haven't received back yet
  loggedIn: false, // false | { username: string, identityContractID: string }
  theme: defaultTheme,
  reducedMotion: false,
  increasedContrast: false,
  fontSize: 16,
  appLogsFilter: process.env.NODE_ENV === 'development'
    ? ['error', 'warn', 'debug', 'log']
    : ['error', 'warn']
}

sbp('okTurtles.events/on', EVENTS.CONTRACT_IS_SYNCING, (contractID, isSyncing) => {
  contractIsSyncing[contractID] = isSyncing
})

sbp('sbp/selectors/register', {
  'state/latestContractState': async (contractID: string) => {
    const events = await sbp('backend/eventsSince', contractID, contractID)
    let state = {}
    for (const e of events.map(e => GIMessage.deserialize(e))) {
      const stateCopy = _.cloneDeep(state)
      try {
        sbp('chelonia/in/processMessage', e, state)
      } catch (err) {
        if (!(err instanceof GIErrorUnrecoverable)) {
          console.warn(`latestContractState: ignoring mutation ${e.description()} because of ${err.name}`)
          state = stateCopy
        } else {
          // TODO: make sure every location that calls latestContractState can handle this
          throw err
        }
      }
    }
    return state
  },
  'state/enqueueContractSync': function (contractID: string) {
    // enqueue this invocation in a serial queue to ensure
    // handleEvent does not get called on contractID while it's syncing,
    // but after it's finished. This is used in tandem with
    // 'state/enqueueHandleEvent' defined below. This is all to prevent
    // handleEvent getting called with the wrong previousHEAD for an event.
    return sbp('okTurtles.eventQueue/queueEvent', contractID, [
      'state/vuex/dispatch', 'syncContractWithServer', contractID
    ])
  },
  'state/enqueueHandleEvent': function (event: GIMessage) {
    // make sure handleEvent is called AFTER any currently-running invocations
    // to syncContractWithServer(), to prevent gi.db from throwing
    // "bad previousHEAD" errors
    return sbp('okTurtles.eventQueue/queueEvent', event.contractID(), [
      'state/vuex/dispatch', 'handleEvent', event
    ])
  },
  'state/vuex/state': () => store.state,
  'state/vuex/commit': (id, payload) => store.commit(id, payload),
  'state/vuex/dispatch': (...args) => store.dispatch(...args)
})

// Mutations must be synchronous! Never call these directly, instead use commit()
// http://vuex.vuejs.org/en/mutations.html
const mutations = {
  login (state, user) {
    state.loggedIn = user
  },
  logout (state) {
    state.loggedIn = false
    state.currentGroupId = null
  },
  processMessage (state, { message }) {
    sbp('chelonia/in/processMessage', message, state)
  },
  registerContract (state, { contractID, type }) {
    const firstTimeRegistering = !state[contractID]
    const vuexModule = {
      // vuex module namespaced under this contract's hash
      // see details: https://vuex.vuejs.org/en/modules.html
      namespaced: true,
      state: {},
      mutations: { processMessage: mutations.processMessage }
    }
    // we set preserveState because 'login' action does 'replaceState'
    store.registerModule(contractID, vuexModule, { preserveState: !firstTimeRegistering })
    // NOTE: we modify state.contracts __AFTER__ calling registerModule, to
    //       ensure that any reactive Vue components that depend on
    //       `state.contracts` for their reactivity (e.g. `groupsByName` getter)
    //       will not result in errors like "state[contractID] is undefined"
    // 'Mutations Follow Vue's Reactivity Rules' - important for modifying objects
    // See: https://vuex.vuejs.org/en/mutations.html
    if (firstTimeRegistering) {
      // this if block will get called when we first subscribe to a contract
      // and won't get called upon login (becase replaceState will have been called)
      Vue.set(state.contracts, contractID, { type, HEAD: contractID })
    }
    // we've successfully received it back, so remove it from expectation pending
    const index = state.pending.indexOf(contractID)
    index !== -1 && state.pending.splice(index, 1)
    // calling this will make pubsub subscribe for events on `contractID`!
    sbp('okTurtles.events/emit', EVENTS.CONTRACTS_MODIFIED, state.contracts)
  },
  setContractHEAD (state, { contractID, HEAD }) {
    const contract = state.contracts[contractID]
    if (!contract) {
      console.error(`This contract ${contractID} doesn't exist anymore. Probably you left the group just now.`)
      return
    }
    state.contracts[contractID].HEAD = HEAD
  },
  removeContract (state, contractID) {
    try {
      store.unregisterModule(contractID)
      Vue.delete(state.contracts, contractID)
    } catch (e) {
      // it's possible this could get triggered if 'removeContract' gets called multiple times
      // with the same contractID
      console.warn(`removeContract: ${e.name} attempting to remove ${contractID}:`, e.message)
    }
    // calling this will make pubsub unsubscribe for events on `contractID`!
    sbp('okTurtles.events/emit', EVENTS.CONTRACTS_MODIFIED, state.contracts)
  },
  deleteMessage (state, hash) {
    const mailboxContract = store.getters.mailboxContract
    const index = mailboxContract && mailboxContract.messages.findIndex(msg => msg.hash === hash)
    if (index > -1) { mailboxContract.messages.splice(index, 1) }
  },
  markMessageAsRead (state, hash) {
    const mailboxContract = store.getters.mailboxContract
    const index = mailboxContract && mailboxContract.messages.findIndex(msg => msg.hash === hash)
    if (index > -1) { mailboxContract.messages[index].read = true }
  },
  setCurrentGroupId (state, currentGroupId) {
    // TODO: unsubscribe from events for all members who are not in this group
    state.currentGroupId = currentGroupId
  },
  pending (state, contractID) {
    if (!state.contracts[contractID] && !state.pending.includes(contractID)) {
      state.pending.push(contractID)
    }
  },
  setTheme (state, color) {
    state.theme = color
  },
  setReducedMotion (state, isChecked) {
    state.reducedMotion = isChecked
  },
  setTemporaryReducedMotion (state) {
    const tempSettings = state.reducedMotion
    state.reducedMotion = true
    setTimeout(() => {
      state.reducedMotion = tempSettings
    }, 300)
  },
  setIncreasedContrast (state, isChecked) {
    state.increasedContrast = isChecked
  },
  setFontSize (state, fontSize) {
    state.fontSize = fontSize
  },
  setAppLogsFilters (state, filters) {
    state.appLogsFilter = filters
  }
}

// https://vuex.vuejs.org/en/getters.html
// https://vuex.vuejs.org/en/modules.html
const getters = {
  // !!  IMPORTANT  !!
  //
  // For getters that get data from only contract state, write them
  // under the 'getters' key of the object passed to DefineContract.
  // See for example: frontend/model/contracts/group.js
  //
  // For convenience, we've defined the same getter, `currentGroupState`,
  // twice, so that we can reuse the same getter definitions both here with Vuex,
  // and inside of the contracts (e.g. in group.js).
  //
  // The one here is based off the value of `state.currentGroupId` — a user
  // preference that does not exist in the group contract state.
  //
  // The getters in DefineContract are designed to be compatible with Vuex!
  // When they're used in the context of DefineContract, their 'state' always refers
  // to the state of the contract whose messages are being processed, regardless
  // of what group we're in. That is why the definition of 'currentGroupState' in
  // group.js simply returns the state.
  //
  // Since the getter functions are compatible between Vuex and our contract chain
  // library, we can simply import them here, while excluding the getter for
  // `currentGroupState`, and redefining it here based on the Vuex rootState.
  ..._.omit(sbp('gi.contracts/group/getters'), ['currentGroupState']),
  currentGroupState (state) {
    return state[state.currentGroupId] || {} // avoid "undefined" vue errors at inoportune times
  },
  mailboxContract (state, getters) {
    const contract = getters.ourUserIdentityContract
    return (contract.attributes && state[contract.attributes.mailbox]) || {}
  },
  mailboxMessages (state, getters) {
    const mailboxContract = getters.mailboxContract
    return (mailboxContract && mailboxContract.messages) || []
  },
  unreadMessageCount (state, getters) {
    return getters.mailboxMessages.filter(msg => !msg.read).length
  },
  ourUsername (state) {
    return state.loggedIn && state.loggedIn.username
  },
  ourGroupProfile (state, getters) {
    return getters.groupProfile(getters.ourUsername)
  },
  ourUserDisplayName (state, getters) {
    // TODO - refactor Profile and Welcome and any other component that needs this
    const userContract = getters.ourUserIdentityContract || {}
    return (userContract.attributes && userContract.attributes.displayName) || getters.ourUsername
  },
  ourIdentityContractId (state) {
    return state.loggedIn && state.loggedIn.identityContractID
  },
  // Logged In user's identity contract
  ourUserIdentityContract (state) {
    return (state.loggedIn && state[state.loggedIn.identityContractID]) || {}
  },
  // NOTE: since this getter is written using `getters.ourUsername`, which is based
  //       on vuexState.loggedIn (a user preference), we cannot use this getter
  //       into group.js
  ourContributionSummary (state, getters) {
    const groupProfiles = getters.groupProfiles
    const ourUsername = getters.ourUsername
    const ourGroupProfile = getters.ourGroupProfile

    if (!ourGroupProfile || !ourGroupProfile.incomeDetailsType) {
      return {}
    }

    const doWeNeedIncome = ourGroupProfile.incomeDetailsType === 'incomeAmount'
    const distribution = getters.groupIncomeDistribution

    const nonMonetaryContributionsOf = (username) => groupProfiles[username].nonMonetaryContributions || []
    const getDisplayName = (username) => getters.globalProfile(username).displayName || username

    return {
      givingMonetary: (() => {
        if (doWeNeedIncome) { return null }
        const who = []
        const total = distribution
          .filter(p => p.from === ourUsername)
          .reduce((acc, payment) => {
            who.push(getDisplayName(payment.to))
            return acc + payment.amount
          }, 0)

        return { who, total, pledged: ourGroupProfile.pledgeAmount }
      })(),
      receivingMonetary: (() => {
        if (!doWeNeedIncome) { return null }
        const needed = getters.groupSettings.mincomeAmount - ourGroupProfile.incomeAmount
        const who = []
        const total = distribution
          .filter(p => p.to === ourUsername)
          .reduce((acc, payment) => {
            who.push(getDisplayName(payment.from))
            return acc + payment.amount
          }, 0)

        return { who, total, needed }
      })(),
      receivingNonMonetary: (() => {
        const listWho = Object.keys(groupProfiles)
          .filter(username => username !== ourUsername && nonMonetaryContributionsOf(username).length > 0)
        const listWhat = listWho.reduce((contr, username) => {
          const displayName = getDisplayName(username)
          const userContributions = nonMonetaryContributionsOf(username)

          userContributions.forEach((what) => {
            const contributionIndex = contr.findIndex(c => c.what === what)
            contributionIndex >= 0
              ? contr[contributionIndex].who.push(displayName)
              : contr.push({ who: [displayName], what })
          })
          return contr
        }, [])

        return listWho.length > 0 ? { what: listWhat, who: listWho } : null
      })(),
      givingNonMonetary: (() => {
        const contributions = ourGroupProfile.nonMonetaryContributions

        return contributions.length > 0 ? contributions : null
      })()
    }
  },
  userDisplayName (state, getters) {
    return (username) => {
      const profile = getters.globalProfile(username) || {}
      return profile.displayName || username
    }
  },
  // used with graphs like those in the dashboard and in the income details modal
  groupIncomeDistribution (state, getters) {
    return groupIncomeDistribution(getters.currentGroupState.distributionEvents, { mincomeAmount: getters.groupMincomeAmount })
  },
  // adjusted version of groupIncomeDistribution, used by the payments system
  groupIncomeAdjustedDistribution (state, getters) {
    return getters.groupIncomeAdjustedDistributionForMonth()
  },
  groupIncomeAdjustedDistributionForMonth (state, getters) {
    return () => groupIncomeDistribution(getters.currentGroupState.distributionEvents, { mincomeAmount: getters.groupMincomeAmount, adjusted: true })
  },
  // TODO: this is insane, rewrite it and make it cleaner/better
  ourPayments (state, getters) {
    // Payments relative to the current month only
    const monthlyPayments = getters.groupMonthlyPayments
    if (!monthlyPayments || Object.keys(monthlyPayments).length === 0) return
    const currency = currencies[getters.groupSettings.mincomeCurrency]
    const ourUsername = getters.ourUsername
    const cMonthstamp = currentMonthstamp()
    const pDate = dateFromMonthstamp(cMonthstamp)
    const dueIn = lastDayOfMonth(pDate)
    const allPayments = getters.currentGroupState.payments
    const thisMonthPayments = monthlyPayments[cMonthstamp]
    const paymentsFrom = thisMonthPayments && thisMonthPayments.paymentsFrom

    const sent = (() => {
      const payments = []

      if (paymentsFrom) {
        for (const toUser in paymentsFrom[getters.ourUsername]) {
          for (const paymentHash of paymentsFrom[getters.ourUsername][toUser]) {
            const { data, meta } = allPayments[paymentHash]
            payments.push({ hash: paymentHash, data, meta, amount: data.amount, username: toUser })
          }
        }
      }
      return payments
    })()
    const received = (() => {
      const payments = []

      if (paymentsFrom) {
        for (const fromUser in paymentsFrom) {
          for (const toUser in paymentsFrom[fromUser]) {
            if (toUser === getters.ourUsername) {
              for (const paymentHash of paymentsFrom[fromUser][toUser]) {
                const { data, meta } = allPayments[paymentHash]
                payments.push({ hash: paymentHash, data, meta, amount: data.amount, username: toUser })
              }
            }
          }
        }
      }
      return payments
    })()
    const todo = (() => {
      const payments = []
      const unadjusted = getters.groupIncomeDistribution.filter(p => p.from === ourUsername)

      for (const p of getters.groupIncomeAdjustedDistribution) {
        if (p.from === ourUsername) {
          const existPayment = unadjusted.find(({ to }) => to === p.to) || { amount: 0 }
          const amount = +currency.displayWithoutCurrency(p.amount)
          const existingAmount = +currency.displayWithoutCurrency(existPayment.amount)

          if (amount > 0) {
            const partialAmount = existingAmount - amount
            const existingPayment = {}
            if (partialAmount > 0) {
              // TODO/BUG this only work if the payment is done in 2 parts. if done in >=3 won't work.
              const sentPartial = sent.find((s) => s.username === p.to && s.amount === partialAmount)
              if (sentPartial) {
                existingPayment.hash = sentPartial.hash
              }
            }

            payments.push({
              ...existingPayment,
              ...p,
              total: existingAmount,
              partial: partialAmount > 0,
              dueIn
            })
          }
        }
      }
      return payments
    })()
    const late = (() => {
      const currentDistribution = getters.groupIncomeAdjustedDistribution
      const { pledgeAmount } = getters.ourGroupProfile
      const pMonthstamp = prevMonthstamp(cMonthstamp)
      const latePayments = []
      const pastMonth = monthlyPayments[pMonthstamp]
      if (pastMonth) {
        const pDate = dateFromMonthstamp(pMonthstamp)
        const dueIn = lastDayOfMonth(pDate)

        // This "for loop" logic is wrong (based on cypress tests).
        for (const payment of pastMonth.lastAdjustedDistribution) {
          if (payment.from === ourUsername && payment.amount > 0) {
            // Let A = the amount we owe from the previous distribution.
            // Let B = the total we've sent to payment.to from the current
            //         month's paymentsFrom.
            // Let C = the total amount we "owe" to payment.to from the
            //         current month's distribution.
            // Let D = the amount we're pledging this month
            // Let E = the amount still unpaid for the previous month's distribution,
            //         calculated as: C > 0 ? A : A + D - B
            //
            // If E > 0, then display a row for the late payment.
            const A = payment.amount
            const B = getters.paymentTotalFromUserToUser(ourUsername, payment.to, cMonthstamp)
            let C = currentDistribution
              .filter(a => a.from === payment.from && a.to === payment.to)
            C = C.length > 0 ? C[0].amount : 0
            const D = pledgeAmount
            const E = C > 0 ? A : A + D - B
            if (E > 0) {
              latePayments.push({
                username: payment.to,
                displayName: getters.userDisplayName(payment.to),
                amount: payment.amount, // TODO: include currency (what if it was changed?)
                // partiaL: TODO add this info as it is in this.paymentsTodo
                isLate: true,
                date: dueIn
              })
            }
          }
        }

        // If we comment the "for loop" above and and uncomment this block of code, it seems to work as expected.
        /*
        const adjusted = getters.groupIncomeAdjustedDistributionForMonth(pMonthstamp)
        for (const payment of adjusted) {
          if (payment.from !== ourUsername) {
            continue
          }

          latePayments.push({
            ...payment,
            // partial: TODO add this info, but what's the cleanest way to do it?
            date: dueIn
          })
        }
        */
      }
      return latePayments
    })()
    const toBeReceived = (() => {
      const unadjusted = getters.groupIncomeDistribution.filter(p => p.to === ourUsername)
      const payments = []
      for (const p of getters.groupIncomeAdjustedDistribution) {
        if (p.to === ourUsername) {
          const existPayment = unadjusted.find(({ from }) => from === p.from) || { amount: 0 }
          const amount = +currency.displayWithoutCurrency(p.amount)
          const existingAmount = +currency.displayWithoutCurrency(existPayment.amount)

          if (amount > 0) {
            const partialAmount = existingAmount - amount
            const existingPayment = {}
            if (partialAmount > 0) {
              // TODO/BUG this only work if the payment is done in 2 parts. if done in >=3 won't work.
              const receivePartial = received.find((r) => r.amount === partialAmount)
              if (receivePartial) {
                existingPayment.hash = receivePartial.hash
              }
            }
            payments.push({
              ...existingPayment,
              ...p,
              total: existingAmount,
              partial: partialAmount > 0
            })
          }
        }
      }
      return payments
    })()

    return { sent, todo, late, received, toBeReceived }
  },
  ourPaymentsSummary (state, getters) {
    const currentCycle = currentMonthstamp()
    const recentEvents = JSON.parse(JSON.stringify(getters.currentGroupState.distributionEvents))
    const events = recentEvents.filter((event) => { return dateToMonthstamp(event.data.when) === currentCycle })
    const paymentEvents = events.filter((event) => { return event.type === 'paymentEvent' })
    const isNeeder = getters.ourGroupProfile.incomeDetailsType === 'incomeAmount'
    const ourUsername = getters.ourUsername
    const ourPaymentEvents = paymentEvents.filter((event) => {
      return isNeeder ? event.data.to === ourUsername : event.data.from === ourUsername
    })
    const isOurPayment = (payment) => {
      return isNeeder ? payment.to === ourUsername : payment.from === ourUsername
    }
    const ourUnadjustedPayments = getters.groupIncomeDistribution.filter(isOurPayment)
    const ourAdjustedPayments = getters.groupIncomeAdjustedDistribution.filter(isOurPayment)
    const paymentsDone = ourUnadjustedPayments.length - ourAdjustedPayments.length
    const hasPartials = ourPaymentEvents.length > paymentsDone
    const paymentsTotal = ourUnadjustedPayments.length
    const amountTotal = ourUnadjustedPayments.reduce((acc, payment) => acc + payment.amount, 0)
    const amountDone = amountTotal - ourAdjustedPayments.reduce((acc, payment) => acc + payment.amount, 0)
    return {
      paymentsDone,
      hasPartials,
      paymentsTotal,
      amountDone,
      amountTotal
    }
  },
  // list of group names and contractIDs
  groupsByName (state) {
    const contracts = state.contracts
    // The code below was originally Object.entries(...) but changed to .keys()
    // due to the same flow issue as https://github.com/facebook/flow/issues/5838
    return Object.keys(contracts || {})
      .filter(contractID => contracts[contractID].type === 'gi.contracts/group' && state[contractID].settings)
      .map(contractID => ({ groupName: state[contractID].settings.groupName, contractID }))
  },
  groupMembersSorted (state, getters) {
    const profiles = getters.currentGroupState.profiles
    if (!profiles) return
    const weJoinedMs = new Date(profiles[getters.ourUsername].joinedDate).getTime()
    const isNewMember = (username) => {
      if (username === getters.ourUsername) { return false }
      const memberProfile = profiles[username]
      if (!memberProfile) return false
      const memberJoinedMs = new Date(memberProfile.joinedDate).getTime()
      const joinedAfterUs = weJoinedMs <= memberJoinedMs
      return joinedAfterUs && Date.now() - memberJoinedMs < 604800000 // joined less than 1w (168h) ago.
    }

    return Object.keys({ ...getters.groupMembersPending, ...getters.groupProfiles })
      .map(username => {
        const { displayName } = getters.globalProfile(username) || {}
        return {
          username,
          displayName: displayName || username,
          invitedBy: getters.groupMembersPending[username],
          isNew: isNewMember(username)
        }
      })
      .sort((userA, userB) => {
        const nameA = userA.displayName.toUpperCase()
        const nameB = userB.displayName.toUpperCase()
        // Show pending members first
        if (userA.invitedBy && !userB.invitedBy) { return -1 }
        if (!userA.invitedBy && userB.invitedBy) { return 1 }
        // Then new members...
        if (userA.isNew && !userB.isNew) { return -1 }
        if (!userA.isNew && userB.isNew) { return 1 }
        // and sort them all by A-Z
        return nameA < nameB ? -1 : 1
      })
  },
  globalProfile (state, getters) {
    return username => {
      const groupProfile = getters.groupProfile(username)
      const identityState = groupProfile && state[groupProfile.contractID]
      return identityState && identityState.attributes
    }
  },

  colors (state) {
    return Colors[state.theme]
  },
  fontSize (state) {
    return state.fontSize
  },
  isDarkTheme (state) {
    return Colors[state.theme].theme === THEME_DARK
  }
}

// TODO: convert all these to SBP... and/or call dispatch through SBP only!
const actions = {
  // Used to update contracts to the current state that the server is aware of
  async syncContractWithServer (
    { dispatch, commit, state }: {dispatch: Function, commit: Function, state: Object},
    contractID: string
  ) {
    const latest = await sbp('backend/latestHash', contractID)
    console.log(`syncContractWithServer(): ${contractID} latestHash is: ${latest}`)
    // there is a chance two users are logged in to the same machine and must check their contracts before syncing
    let recent
    if (state.contracts[contractID]) {
      recent = state.contracts[contractID].HEAD
    } else {
      // we're syncing a contract for the first time, make sure to add to pending
      // so that handleEvents knows to expect events from this contract
      commit('pending', contractID)
    }
    if (latest !== recent) {
      console.log(`Now Synchronizing Contract: ${contractID} its most recent was ${recent || 'undefined'} but the latest is ${latest}`)
      sbp('okTurtles.events/emit', EVENTS.CONTRACT_IS_SYNCING, contractID, true)
      // TODO: fetch events from localStorage instead of server if we have them
      const events = await sbp('backend/eventsSince', contractID, recent || contractID)
      // remove the first element in cases where we are not getting the contract for the first time
      state.contracts[contractID] && events.shift()
      for (let i = 0; i < events.length; i++) {
        // this must be called directly, instead of via enqueueHandleEvent
        await dispatch('handleEvent', GIMessage.deserialize(events[i]))
      }
    } else {
      console.debug(`Contract ${contractID} was already synchronized`)
    }
    sbp('okTurtles.events/emit', EVENTS.CONTRACT_IS_SYNCING, contractID, false)
  },
  // TODO: Move this into controller/actions/identity? See #804
  async login (
    { dispatch, commit, state }: {dispatch: Function, commit: Function, state: Object},
    user: Object
  ) {
    const settings = await sbp('gi.db/settings/load', user.username)
    // NOTE: login can be called when no settings are saved (e.g. from Signup.vue)
    if (settings) {
      console.debug('loadSettings:', settings)
      store.replaceState(settings)
      captureLogsStart(user.username)
      // This may seem unintuitive to use the store.state from the global store object
      // but the state object in scope is a copy that becomes stale if something modifies it
      // like an outside dispatch
      const contracts = store.state.contracts
      for (const contractID in contracts) {
        const { type } = contracts[contractID]
        commit('registerContract', { contractID, type })
        await sbp('state/enqueueContractSync', contractID)
      }
      // it's insane, and I'm not sure how this can happen, but it did... and
      // the following steps actually fixed it...
      // TODO: figure out what happened and prevent it from happening again
      //       maybe move this recovery stuff to a recovery page and redirect
      //       us there instead of doing it here.
      // TODO: fetch events from localStorage instead of server if we have them
      const currentGroupId = store.state.currentGroupId
      if (currentGroupId && !contracts[currentGroupId]) {
        console.error(`login: lost current group state somehow for ${currentGroupId}! attempting resync...`)
        await sbp('state/enqueueContractSync', currentGroupId)
      }
      if (!contracts[user.identityContractID]) {
        console.error(`login: lost current identity state somehow for ${user.username} / ${user.identityContractID}! attempting resync...`)
        await sbp('state/enqueueContractSync', user.identityContractID)
      }
    } else {
      captureLogsStart(user.username)
    }
    await sbp('gi.db/settings/save', SETTING_CURRENT_USER, user.username)
    commit('login', user)
    Vue.nextTick(() => sbp('okTurtles.events/emit', EVENTS.LOGIN, user))
  },
  // TODO: Move this into controller/actions/identity? See #804
  async logout (
    { dispatch, commit, state }: {dispatch: Function, commit: Function, state: Object}
  ) {
    debouncedSave.clear()
    await dispatch('saveSettings')
    await sbp('gi.db/settings/save', SETTING_CURRENT_USER, null)
    for (const contractID in state.contracts) {
      commit('removeContract', contractID)
    }
    commit('logout')
    Vue.nextTick(() => {
      sbp('okTurtles.events/emit', EVENTS.LOGOUT)
      captureLogsPause({
        // Let's clear all stored logs to prevent someone else
        // accessing sensitve data after the user logs out.
        wipeOut: true
      })
    })
  },
  // persisting the state
  async saveSettings (
    { state }: {state: Object}
  ) {
    if (state.loggedIn) {
      // TODO: encrypt this
      await sbp('gi.db/settings/save', state.loggedIn.username, state)
    }
  },
  // this function is called from ../controller/utils/pubsub.js and is the entry point
  // for getting events into the log.
  async handleEvent (
    { dispatch, commit, state }: {dispatch: Function, commit: Function, state: Object},
    message: GIMessage
  ) {
    // prepare for any errors
    const cachedState = _.cloneDeep(state)
    const contractID = message.contractID()
    try {
      // TODO: verify each message is signed by a group member
      // verify we're expecting to hear from this contract
      if (!state.pending.includes(contractID) && !state.contracts[contractID]) {
        console.error('[CRITICAL ERROR] NOT EXPECTING EVENT!', contractID, message)
        throw new GIErrorUnrecoverable(`not expecting ${message.description()}: ${message.serialize()}`)
      }
      // the order the following actions are done is critically important!
      // first we make sure we save this message to the db
      await handleEvent.addMessageToDB(message)
      // process the mutation on the state (everything here must be synchronous)
      handleEvent.processMutation(message)
      // process any side-effects (these must never result in any mutation to this contract state)
      await handleEvent.processSideEffects(message)

      if (attemptToReprocessMessageID === message.hash()) {
        console.warn(`Successfully re-processed ${attemptToReprocessMessageID}!`)
        attemptToReprocessMessageID = ''
      }
    } catch (e) {
      // For details about the rationale for how error handling works here see these links:
      // https://gitlab.okturtles.org/okturtles/group-income-simple/snippets/9
      // https://github.com/okTurtles/group-income-simple/issues/610
      // https://github.com/okTurtles/group-income-simple/issues/602
      // TODO: use a global notification system to both display a notification
      console.error(`[ERROR] exception ${e.name} in handleEvent while processing ${message.description()}!`, e.message, e)
      let updateContractHEAD = false
      let banUser = false
      let enterUnrecoverableState = false
      // handle all error types defined in ./errors.js + ErrorDBConnection
      if (e instanceof GIErrorUnrecoverable) {
        console.error('[CRITICAL ERROR] handleEvent:', e.message, e.stack)
        enterUnrecoverableState = true
        // TODO: allow the GIErrorUnrecoverable class a way to specify a potential manual recovery method
        //       that can be displayed on the recovery page?
      } else if (e instanceof GIErrorIgnoreAndBanIfGroup) {
        banUser = true
        updateContractHEAD = true
      } else if (e instanceof GIErrorDropAndReprocess) {
        dropAllMessagesUntilRefresh = true
      } else {
        console.error(`[CRITICAL ERROR] handleEvent: UNKNOWN ERROR ${e.name} SHOULD NEVER HAPPEN:`, e.message, e.stack)
        enterUnrecoverableState = true
      }
      // Take action based on the type of error.
      // The order of the statements below is very important
      handleEvent.restoreCachedState(cachedState)
      // do these after restoreCachedState, to ensure the modifications make it in
      if (updateContractHEAD) {
        commit('setContractHEAD', { contractID, HEAD: message.hash() })
      }
      if (enterUnrecoverableState) {
        // TODO: set state machine critical error state
        console.error('handleEvent: unrecoverable state unimplemented!')
        dropAllMessagesUntilRefresh = true
      }
      if (banUser) {
        if (contractIsSyncing[contractID]) {
          console.warn(`handleEvent: skipping autoBanSenderOfMessage since we're syncing ${contractID}`)
        } else {
          // NOTE: this random delay is here for multiple reasons:
          const randomDelay = _.randomIntFromRange(0, 1500)
          // 1. to avoid backend throwing 'bad previousHEAD' error
          // https://github.com/okTurtles/group-income-simple/issues/608
          // 2. because we need to make sure that if a proposal has been cast by someone,
          // then we are likely to find it in store.state, so we have this random delay
          // here a the top, before we iterate store.state[groupID].proposals, and
          // 3. to avoid weird errors like 'TypeError: "state[(intermediate value)] is undefined"'
          setTimeout(() => handleEvent.autoBanSenderOfMessage(message, e), randomDelay)
        }
      }
    }
  }
}

// to make handleEvent() easier to read and reason about, it has been split up into
// the following functions below, each of which must throw one of the error types
// defined in ./errors.js if there is any error, with the exception of functions
// called from within the handleEvent catch() error handler (like restoreCachedState()
// and autoBanSenderOfMessage() functions).
const handleEvent = {
  async addMessageToDB (message: GIMessage) {
    if (dropAllMessagesUntilRefresh) {
      throw new GIErrorDropAndReprocess(`ignoring message until page refresh: ${message.description()}`)
    }
    try {
      return await sbp('gi.db/log/addEntry', message)
    } catch (e) {
      if (e instanceof ErrorDBBadPreviousHEAD) {
        // sometimes we simply miss messages, it's not clear why, but it happens
        // in rare cases. So we attempt to re-sync this contract once
        if (!attemptToReprocessMessageID) {
          // keep track of what message we're trying to reprocess
          // so that if we're able to fix ourselves we can go back to normal
          attemptToReprocessMessageID = message.hash()
          console.warn(`addMessageToDB: going to attempt to resync ${message.contractID()} to re-process ${message.description()}`)
          setTimeout(() => {
            // re-enable message processing
            dropAllMessagesUntilRefresh = false
            sbp('state/enqueueContractSync', message.contractID())
          }, 1000)
        } else {
          console.error(`addMessageToDB: already attempted to re-process ${attemptToReprocessMessageID} ${message.description()}, will not attempt again!`)
        }
        // the server should never send us a bad previousHEAD (because)
        // it verifies that before adding it to its db. So if we receive
        // this error it means somehow we're getting valid messages out of order
        throw new GIErrorDropAndReprocess(e.message)
      } else if (e instanceof ErrorDBConnection) {
        // TODO: handle QuotaExceededError from localStorage!
        // we cannot throw GIErrorDropAndReprocess because saving is clearly broken
        // so we re-throw this special error condition that means we can't do anything
        throw new GIErrorUnrecoverable(`${e.name} during addMessageToDB!`)
      } else {
        // we should never get here, but if we do...
        throw new GIErrorUnrecoverable(`${e.name} during addMessageToDB! SHOULD NEVER HAPPEN! ${e.message}`)
      }
    }
  },
  processMutation (message: GIMessage) {
    try {
      const contractID = message.contractID()
      const hash = message.hash()
      if (message.isFirstMessage()) {
        // Flow doesn't understand that a first message must be a contract,
        // so we have to help it a bit in order to acces the 'type' property.
        const { type } = ((message.opValue(): any): GIOpContract)
        store.commit('registerContract', { contractID, type })
      }
      store.commit(`${contractID}/processMessage`, { message })
      store.commit('setContractHEAD', { contractID, HEAD: hash })
    } catch (e) {
      console.error(`processMutation: error ${e.name}`, e)
      if (e.name.indexOf('GIError') === 0) {
        throw e // simply rethrow whatever error the contract has decided should be thrown
      } else if (!(e instanceof TypeValidatorError) && !(e instanceof TypeError)) {
        // this is likely a GUI-related error/bug, so it's safe to save and reprocess later
        throw new GIErrorDropAndReprocess(`${e.name} during processMutation: ${e.message}`)
      }
      // BUG/TODO: we can get into an auto ban loop when the proposal made
      //       to autoban a member has itself a problem (e.g. because
      //       it requires a 'member' field in but the proposal created to
      //       ban the user didn't have one in its proposalData). The original
      //       proposal will be accepted into the chain, but each subsequent
      //       /proposalVote will throw the exception because /removeMember
      //       validation will break.
      throw new GIErrorIgnoreAndBanIfGroup(`${e.name} during processMutation: ${e.message}`)
    }
  },
  async processSideEffects (message: GIMessage) {
    try {
      if ([GIMessage.OP_ACTION_ENCRYPTED, GIMessage.OP_ACTION_UNENCRYPTED].includes(message.opType())) {
        const contractID = message.contractID()
        const hash = message.hash()
        const { action, data, meta } = message.decryptedValue()
        const mutation = { data, meta, hash, contractID }
        // this selector is created by Contract.js
        await sbp(`${action}/sideEffect`, mutation)
        // let any listening components know that we've received, processed, and stored the event
        sbp('okTurtles.events/emit', hash, contractID, message)
        sbp('okTurtles.events/emit', EVENTS.EVENT_HANDLED, contractID, message)
      }
    } catch (e) {
      console.error(`processSideEffects: ${e.name}:`, e)
      // if an error happens at this point, it's almost certainly not due to malformed data
      // (since all of the validations successfully passed in processMutation)
      if (e.name.indexOf('GIError') === 0) {
        // unlikely to happen but this most likely means the contract's side effect is deciding
        // for us how to handle the error, so rethrow
        throw e
      } else {
        throw new GIErrorDropAndReprocess(`${e.name} during processSideEffects: ${e.message}`)
      }
    }
  },
  restoreCachedState (cachedState: Object) {
    try {
      console.error('reverting to previous state!', {
        corrupt: JSON.stringify(store.state),
        reverted: JSON.stringify(cachedState)
      })
      store.replaceState(cachedState)
      // if replaceState resulted in any contracts being added or removed
      // make sure our web sockets are either subscribed or unsubscribed as needed
      try {
        sbp('okTurtles.events/emit', EVENTS.CONTRACTS_MODIFIED, store.state.contracts)
      } catch (e) {
        console.error(e.message, e.stack)
      }
    } catch (e) {
      // pretty much f*'d here
      console.error(`[CRITICAL ERROR] ${e.name} couldn't revert state!`, e.message, e)
      // TODO: set state machine critical error state
    }
  },
  async autoBanSenderOfMessage (message: GIMessage, error: Object, attempt = 1) {
    const contractID = message.contractID()
    try {
      // If we just joined, we're likely witnessing an old error that was handled
      // by the existing members, so we shouldn't attempt to participate in voting
      // in a proposal that has long since passed.
      //
      // TODO: we should still autoban them after the sync is finished
      //       if the proposal is still open. See #731
      if (contractIsSyncing[contractID]) {
        console.warn(`skipping autoBanSenderOfMessage since we're syncing ${contractID}`)
        return // don't do anything, assume the existing users handled this event
      }
      // NOTE: we cast to 'any' to work around flow errors
      //       see: https://stackoverflow.com/a/41329247/1781435
      const meta: Object = (message.opValue(): any).meta
      const username = meta && meta.username
      // TODO: this code below doesn't make any sense, we shouldn't
      //       leave the group just because we banned someone.
      //       Also, we should handle things differently depending on
      //       whether this is a malformed message received from a group
      //       contract or another contract.
      // if (message.type().indexOf('gi.contracts/group/') !== 0) {
      //   console.warn(`autoBanSenderOfMessage: removing & unsubscribing from ${username} contractID: ${contractID}`)
      //   store.commit('removeContract', contractID)
      // }
      if (username && store.getters.groupProfile(username)) {
        console.warn(`autoBanSenderOfMessage: autobanning ${username}`)
        const groupID = store.state.currentGroupId
        let proposal
        let proposalHash
        // find existing proposal if it exists
        for (const hash in store.state[groupID].proposals) {
          const prop = store.state[groupID].proposals[hash]
          if (prop.status === STATUS_OPEN &&
            prop.data.proposalType === PROPOSAL_REMOVE_MEMBER &&
            prop.data.proposalData.member === username
          ) {
            proposal = prop
            proposalHash = hash
            break
          }
        }
        if (proposal) {
          // cast our vote if we haven't already cast it
          if (!proposal.votes[store.getters.ourUsername]) {
            await sbp('gi.actions/group/proposalVote', {
              contractID: groupID,
              data: { proposalHash, vote: VOTE_FOR },
              publishOptions: { maxAttempts: 3 }
            })
          }
        } else {
          // create our proposal to ban the user
          try {
            proposal = await sbp('gi.actions/group/proposal', {
              contractID: groupID,
              data: {
                proposalType: PROPOSAL_REMOVE_MEMBER,
                proposalData: {
                  member: username,
                  reason: L("Automated ban because they're sending malformed messages resulting in: {error}", { error: error.message })
                },
                votingRule: store.getters.groupSettings.proposals[PROPOSAL_REMOVE_MEMBER].rule,
                expires_date_ms: Date.now() + store.getters.groupSettings.proposals[PROPOSAL_REMOVE_MEMBER].expires_ms
              },
              publishOptions: { maxAttempts: 1 }
            })
          } catch (e) {
            if (attempt > 2) {
              console.error(`autoBanSenderOfMessage: max attempts reached. Error ${e.message} attempting to ban ${username}`, message, e)
            } else {
              const randDelay = _.randomIntFromRange(0, 1500)
              console.warn(`autoBanSenderOfMessage: ${e.message} attempting to ban ${username}, retrying in ${randDelay} ms...`, e)
              setTimeout(() => {
                handleEvent.autoBanSenderOfMessage(message, error, attempt + 1)
              }, randDelay)
            }
          }
        }
      }
    } catch (e) {
      console.error(`${e.name} during autoBanSenderOfMessage!`, message, e)
      // we really can't do much at this point since this is an exception
      // inside of the exception handler :-(
    }
  }
}

const store: any = new Vuex.Store({
  state: _.cloneDeep(initialState),
  mutations,
  getters,
  actions,
  strict: process.env.VUEX_STRICT === 'true'
})
const debouncedSave = _.debounce(() => store.dispatch('saveSettings'), 500)
store.subscribe(debouncedSave)

export default store
