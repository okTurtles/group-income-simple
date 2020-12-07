<template lang='pug'>
tooltip(
  direction='right'
  :manual='true'
  ref='tooltip'
  :opacity='1'
  :aria-label='L("Show notifications")'
)
  slot

  template(slot='tooltip')
    .card.c-card(role='dialog' :aria-label='L("Notifications")')
      .c-header
        i18n.is-title-4(tag='h2') Notifications
        i18n.link(tag='button' @click='handleSettingsClick') Settings

      .c-body
        notifications-list(variant='compact' @select='toggleTooltip')
      .c-footer(v-if='notificationsCount')
        router-link.link(:to='{ query: { modal: "NotificationsModal" }}' @click.native='toggleTooltip')
          i18n See all

      modal-close.c-close(:aria-label='L("Close profile")' @close='toggleTooltip')
</template>

<script>
import { mapGetters } from 'vuex'
import sbp from '~/shared/sbp.js'
import { OPEN_MODAL } from '@utils/events.js'
import ModalClose from '@components/modal/ModalClose.vue'
import Tooltip from '@components/Tooltip.vue'
import NotificationsList from './NotificationsList.vue'

export default {
  name: 'NotificationsCard',
  components: {
    ModalClose,
    NotificationsList,
    Tooltip
  },
  methods: {
    toggleTooltip () {
      this.$refs.tooltip.toggle()
    },
    handleSettingsClick () {
      // BUG - Section notification does not open. Fixed at #946
      sbp('okTurtles.events/emit', OPEN_MODAL, 'UserSettingsModal', {
        section: 'notifications'
      })
      this.toggleTooltip()
    }
  },
  computed: {
    ...mapGetters([
      'notificationsCount'
    ])
  }
}
</script>

<style lang="scss" scoped>
@import "@assets/style/_variables.scss";

.c-card {
  position: relative;
  padding: 0 0 4rem;
  color: $text_0;
  max-width: 100vw;
  border-radius: 3px;
  width: 100vw;
  box-shadow: none;

  &:last-child {
    margin-bottom: 0;
  }

  // is-active is from tooltip
  .is-active & {
    animation: zoom 100ms both cubic-bezier(0.165, 0.84, 0.44, 1);
    @include phone {
      animation-name: enterFromBottom;
    }
  }

  @include tablet {
    margin-top: -0.5rem; // better aligned with bell icon
    box-shadow: 0 0.5rem 1.25rem rgba(54, 54, 54, 0.3);
    width: 25rem;
    padding: 0;

    // triangle corner
    &::before {
      content: "";
      position: absolute;
      top: 1rem;
      left: -0.5rem;
      display: block;
      width: 0;
      z-index: 0;
      border-top: 0.5rem solid transparent;
      border-right: 0.5rem solid $background;
      border-bottom: 0.5rem solid transparent;
    }
  }
}

.c-close {
  left: calc(100vw - 4rem);
  top: 1.5rem;

  @include tablet {
    left: auto;
    right: 1rem;
    opacity: 0;
    pointer-events: none;

    &:focus {
      opacity: 1;
    }
  }
}

.c-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 1rem 0.5rem;
}

.c-body {
  height: 18rem;
  overflow: auto;
  overscroll-behavior-y: contain;
}

.c-footer {
  border-top: 1px solid $general_1;
  padding: 0.5rem 1rem 1rem;
  text-align: center;
}
</style>
