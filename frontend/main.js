import Vue from 'vue'
// import SBP stuff before anything else so that domains register themselves before called
import sbp from '~/shared/sbp.js'
import '~/shared/domains/okTurtles/data.js'
import '~/shared/domains/okTurtles/events.js'
import './controller/namespace.js'
import router from './controller/router.js'
import { createWebSocket } from './controller/backend.js'
import store from './model/state.js'
import { SETTING_CURRENT_USER } from './model/database.js'
import { LOGOUT } from './utils/events'
import './utils/autofocus.js'
import './utils/lazyLoadedView.js'
import Navigation from './views/containers/sidebar/Navigation.vue'
import AppStyles from './views/components/AppStyles.vue'
import Modal from './views/components/Modal/Modal.vue'
import './views/utils/translations.js'
import './views/utils/vStyle.js'

console.log('NODE_ENV:', process.env.NODE_ENV)

// NOTE: we setup this global SBP filter and domain regs here
//       to get logging for all subsequent SBP calls.
//       In the future we might move it elsewhere.
if (process.env.NODE_ENV !== 'production') {
  sbp('sbp/filters/global/add', (domain, selector, data) => {
    if (domain !== 'okTurtles.data') {
      console.log(`[sbp] ${selector}`, data)
    }
  })
}

async function startApp () {
  // TODO: handle any socket errors?
  createWebSocket(process.env.API_URL, {
    // TODO: verify these are good defaults
    timeout: 3000,
    strategy: ['disconnect', 'online', 'timeout']
  })

  let user = await sbp('gi/settings/load', SETTING_CURRENT_USER)
  if (user) {
    try {
      let identityContractId = await sbp('namespace/lookup', user)
      await store.dispatch('login', { name: user, identityContractId })
    } catch (err) {
      console.log('lookup failed!')
      store.dispatch('logout')
      if (err.status === 404) {
        console.warn(`It looks like the local user does not exist anymore on the server 😱 If this is unexpected, contact us at https://gitter.im/okTurtles/group-income`)
        sbp('gi/settings/delete', user)
      }
    }
  }
  /* eslint-disable no-new */
  new Vue({
    router: router,
    components: {
      AppStyles,
      Navigation,
      Modal
    },
    computed: {
      showNav () {
        return this.$store.state.loggedIn
      }
    },
    store // make this and all child components aware of the new store
  }).$mount('#app')
  sbp('okTurtles.events/on', LOGOUT, () => router.push({ path: '/' }))
}

startApp()
