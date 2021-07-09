'use strict'

// import SBP stuff before anything else so that domains register themselves before called
import sbp from '~/shared/sbp.js'
import '~/shared/domains/okTurtles/data.js'
import '~/shared/domains/okTurtles/events.js'
import '~/shared/domains/okTurtles/eventQueue.js'
import '~/shared/domains/chelonia/chelonia.js'
import './controller/namespace.js'
import './controller/actions/index.js'
import Vue from 'vue'
import { mapMutations } from 'vuex'
import router from './controller/router.js'
import { startMonthlyCycleCheckInterval } from './controller/monthlyCycleTimer.js'
import { createGIPubSubClient } from './controller/backend.js'
import { PUBSUB_INSTANCE } from './controller/instance-keys.js'
import { randomHexString } from './utils/giLodash.js'
import store from './model/state.js'
import { SETTING_CURRENT_USER } from './model/database.js'
import { LOGIN, LOGOUT, CONTRACT_IS_SYNCING } from './utils/events.js'
import BannerGeneral from './views/components/banners/BannerGeneral.vue'
import Navigation from './views/containers/navigation/Navigation.vue'
import AppStyles from './views/components/AppStyles.vue'
import Modal from './views/components/modal/Modal.vue'
import CypressBypassUi from './views/containers/navigation/CypressBypassUI.vue'
import './views/utils/allowedUrls.js'
import './views/utils/translations.js'
import './views/utils/avatar.js'
import './views/utils/vFocus.js'
import './views/utils/vError.js'
import './views/utils/vSafeHtml.js'
import './views/utils/vStyle.js'
import './utils/touchInteractions.js'
import 'wicg-inert'

console.log('NODE_ENV:', process.env.NODE_ENV)

Vue.config.errorHandler = function (err, vm, info) {
  console.error(`uncaught Vue error in ${info}:`, err)
}

async function startApp () {
  // NOTE: we setup this global SBP filter and domain regs here
  //       to get logging for all subsequent SBP calls.
  //       In the future we might move it elsewhere.
  if (process.env.NODE_ENV !== 'production') {
    const reducer = (o, v) => { o[v] = true; return o }
    const domainBlacklist = [
      'sbp',
      'okTurtles.data'
    ].reduce(reducer, {})
    const selBlacklist = [
      'gi.db/get',
      'gi.db/log/logHEAD',
      'gi.db/set'
    ].reduce(reducer, {})
    sbp('sbp/filters/global/add', (domain, selector, data) => {
      if (domainBlacklist[domain] || selBlacklist[selector]) return
      console.debug(`[sbp] ${selector}`, data)
    })
  }

  // this is to ensure compatibility between frontend and test/backend.test.js
  sbp('okTurtles.data/set', 'API_URL', window.location.origin)

  // URL used to connect to the pubsub server. May include query parameters.
  let pubsubURL = sbp('okTurtles.data/get', 'API_URL')

  if (process.env.NODE_ENV === 'development') {
    // This is temporarily used in development mode to help the server improve
    // its console output until we have a better solution. Do not use for auth.
    pubsubURL += `?debugID=${randomHexString(6)}`
  }
  sbp('okTurtles.data/set', PUBSUB_INSTANCE, createGIPubSubClient(
    pubsubURL, {
      // This option can be enabled since we are not doing auth via web sockets.
      reconnectOnTimeout: true,
      timeout: 5000
    }
  ))

  await sbp('translations/init', navigator.language)

  const username = await sbp('gi.db/settings/load', SETTING_CURRENT_USER)
  if (username) {
    const identityContractID = await sbp('namespace/lookup', username)
    if (identityContractID) {
      await sbp('state/vuex/dispatch', 'login', { username, identityContractID })
    } else {
      await sbp('state/vuex/dispatch', 'logout')
      console.warn(`It looks like the local user '${username}' does not exist anymore on the server 😱 If this is unexpected, contact us at https://gitter.im/okTurtles/group-income`)
      // TODO: do not delete the username like this! handle this better!
      //       because of how await works, this exception handler can be triggered
      //       even by random errors from Vue.js, example:
      //
      //         lookup failed! TypeError: "state[state.currentGroupId] is undefined"
      //         memberUsernames state.js:231
      //
      //       Which doesn't mean that the lookup actually failed!
      await sbp('gi.db/settings/delete', username)
    }
  }
  /* eslint-disable no-new */
  new Vue({
    router: router,
    components: {
      AppStyles,
      BannerGeneral,
      CypressBypassUi,
      Navigation,
      Modal
    },
    data () {
      return {
        ephemeral: {
          syncs: [],
          // TODO/REVIEW page can load with already loggedin. -> this.$store.state.loggedIn ? 'yes' : 'no'
          finishedLogin: 'no',
          isCorrupted: false // TODO #761
        }
      }
    },
    mounted () {
      const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)') || {}
      if (reducedMotionQuery.matches || this.isInCypress) {
        this.setReducedMotion(true)
      }
      sbp('okTurtles.events/on', CONTRACT_IS_SYNCING, (contractID, isSyncing) => {
        // make it possible for Cypress to wait for contracts to finish syncing
        if (isSyncing) {
          this.ephemeral.syncs.push(contractID)
        } else {
          this.ephemeral.syncs = this.ephemeral.syncs.filter(id => id !== contractID)
        }
      })
      sbp('okTurtles.events/on', LOGIN, () => {
        this.ephemeral.finishedLogin = 'yes'
      })
      sbp('okTurtles.events/on', LOGOUT, () => {
        this.ephemeral.finishedLogin = 'no'
        router.currentRoute.path !== '/' && router.push({ path: '/' }).catch(console.error)
      })
      sbp('okTurtles.data/set', 'BANNER', this.$refs.bannerGeneral)
      // call from anywhere in the app:
      // sbp('okTurtles.data/get', 'BANNER').show(L('Trying to reconnect...'), 'wifi')
      // sbp('okTurtles.data/get', 'BANNER').danger(L('message'), 'icon-type')
      // sbp('okTurtles.data/get', 'BANNER').clean()
      sbp('okTurtles.data/apply', PUBSUB_INSTANCE, (instance) => {
        const banner = this.$refs.bannerGeneral
        // Allow to access `L` inside event handlers.
        const L = this.L.bind(this)

        Object.assign(instance.customEventHandlers, {
          offline () {
            banner.show(L('Your device appears to be offline.'), 'wifi')
          },
          online () {
            banner.clean()
          },
          'reconnection-attempt' () {
            banner.show(L('Trying to reconnect...'), 'wifi')
          },
          'reconnection-failed' () {
            banner.show(L('Cannot connect to the server.'), 'wifi')
          },
          'reconnection-succeeded' () {
            banner.clean()
          }
        })
      })
      // Useful in case the app is started in offline mode.
      if (navigator.onLine === false) {
        this.$refs.bannerGeneral.show(
          this.L('Your device appears to be offline.'), 'wifi'
        )
      }
      if (this.ephemeral.isCorrupted) {
        this.$refs.bannerGeneral.danger(
          this.L('Your app seems to be corrupted. Please {a_}re-sync your app data.{_a}', {
            'a_': `<a class="link" href="${window.location.pathname}?modal=UserSettingsModal&section=troubleshooting">`,
            '_a': '</a>'
          }),
          'times-circle'
        )
      }
      startMonthlyCycleCheckInterval(this.$store)
    },
    computed: {
      showNav () {
        return this.$store.state.loggedIn && this.$store.getters.groupsByName.length > 0 && this.$route.path !== '/join'
      },
      appClasses () {
        return {
          'l-with-navigation': this.showNav,
          'l-no-navigation': !this.showNav,
          'js-reducedMotion': this.$store.state.reducedMotion,
          'is-dark-theme': this.$store.getters.isDarkTheme
        }
      },
      isInCypress () {
        return !!window.Cypress
      }
    },
    methods: {
      ...mapMutations([
        'setReducedMotion'
      ])
    },
    store // make this and all child components aware of the new store
  }).$mount('#app')
}

startApp()
