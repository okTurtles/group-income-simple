<template lang='pug'>
modal-base-template.has-background(ref='modal' :fullscreen='true' :a11yTitle='L("Group members")')
  .c-container
    .c-header
      i18n.is-title-2.c-title(tag='h2') Notifications
      button.is-small.is-outlined.c-btnSettings(@click='clickSettings')
        i.icon-cog.is-prefix
        i18n Settings

    .card.c-card
      notifications-list(variant='default')
</template>

<script>
import sbp from '~/shared/sbp.js'
import { OPEN_MODAL } from '@utils/events.js'
import ModalBaseTemplate from '@components/modal/ModalBaseTemplate.vue'
import NotificationsList from './NotificationsList.vue'

export default {
  name: 'NotificationsModal',
  components: {
    ModalBaseTemplate,
    NotificationsList
  },
  data () {
    return {
      searchText: ''
    }
  },
  methods: {
    clickSettings () {
      // BUG - Section notification does not open. Fixed at #946
      sbp('okTurtles.events/emit', OPEN_MODAL, 'UserSettingsModal', {
        section: 'notifications'
      })
    }
  }
}
</script>

<style lang="scss" scoped>
@import "@assets/style/_variables.scss";

.c-container {
  height: 100%;
  width: 100%;
  background-color: $general_2;
}

.c-header,
.c-container {
  @include tablet {
    width: 50rem;
    max-width: 100%;
  }
}

.c-header {
  display: flex;
  min-height: 4.75rem;
  padding: 0 1rem;
  justify-content: flex-start;
  align-items: center;
  background-color: $background_0;
  margin: 0 -1rem;

  @include tablet {
    padding: 2rem 0 0;
    justify-content: space-between;
    align-items: baseline;
    background-color: transparent;
    margin: 0;
  }
}

.c-card {
  margin-top: 1.5rem;
}

@include phone {
  .c-btnSettings {
    position: absolute;
    left: 1rem;
    margin-top: 8rem;
  }

  .c-card {
    margin-top: 3.5rem;
  }
}
</style>
