<template lang='pug'>
  div(:class='variant')
    .c-empty(v-if='!notificationsCount')
      i18n.has-text-1 Nothing to see here... yet!

    .c-loading(v-else-if='ephemeral.isLoading')
      i18n.sr-only Loading...
      .c-skeleton(v-for='i in [0, 1, 2, 3]' :key='i')
        .c-skeleton-circle
        .c-skeleton-line

    template(v-else v-for='(list, type) in notifications')
      span.is-subtitle.c-title {{ title(type) }}
      ul.c-list(
        :aria-label='title(type)'
        @click='() => $emit("select")'
      )
        li(v-for='item of list')
          router-link.c-item(:to='item.linkTo' :class='item.read ? "" : "unread"')
            span.c-thumbCircle
              avatar(:src='item.avatarUrlTODO' size='md')
              i(:class='`icon-${item.icon} ${iconBg(item.level)}`')
            span.c-item-content
              span.c-item-text(v-html='item.body')
              span.c-item-date.has-text-1.has-text-small(v-html='item.date')
</template>

<script>
import { mapGetters } from 'vuex'
import * as templates from '@model/notifications/templates.js'
import { HOURS_MILLIS } from '@utils/time.js'
import fakeDBWithNotifications from '@model/notifications/fakeDB.js'
import Avatar from '@components/Avatar.vue'
import L from '@view-utils/translations.js'

export default {
  name: 'NotificationsList',
  props: {
    variant: {
      type: String,
      validator: (value) => ['compact', 'default'].includes(value),
      default: 'defaut'
    }
  },
  data: () => ({
    config: {
      notifications: null
    },
    ephemeral: {
      isLoading: false
    }
  }),
  components: {
    Avatar
  },
  mounted () {
    // TODO this (All dumb logic for now)

    // Simulate view with no notifications
    if (this.notificationsCount === 0) {
      return null
    }

    // Simulate view with only 1 notification
    if (this.notificationsCount === 1) {
      this.ephemeral.isLoading = true
      setTimeout(() => {
        // handpick a notification that is "MEMBER_ADDED"
        this.config.notifications = {
          3213: fakeDBWithNotifications[3213]
        }
        this.ephemeral.isLoading = false
      }, 500)
      return
    }

    // Load notifications from fake DB
    this.ephemeral.isLoading = true
    setTimeout(() => {
      this.config.notifications = fakeDBWithNotifications
      this.ephemeral.isLoading = false
    }, 1500)
  },
  computed: {
    ...mapGetters([
      'notificationsCount'
    ]),
    dateNow () {
      // Hardcoded so the dummy layout makes sense
      return 1590823007327
    },
    notifications () {
      if (!this.config.notifications) {
        return {}
      }

      const list = {}
      const listNew = []
      const listOlder = []

      for (const nId in this.config.notifications) {
        const { timestamp, type, data } = this.config.notifications[nId]
        const listToPush = this.dateNow - timestamp < HOURS_MILLIS * 2 ? listNew : listOlder
        listToPush.push(templates[type]({ data, timestamp }))
      }

      if (listNew.length > 0) {
        list.new = listNew
      }

      if (listOlder.length > 0) {
        list.older = listOlder
      }

      return list
    }
  },
  methods: {
    title: (type) => {
      return {
        new: L('New'),
        older: L('Older')
      }[type]
    },
    iconBg: (level) => {
      return {
        info: 'has-background-primary has-text-primary',
        success: 'has-background-success has-text-success',
        danger: 'has-background-danger has-text-danger'
      }[level]
    }
  }
}
</script>

<style lang="scss" scoped>
@import "@assets/style/_variables.scss";

.c-empty {
  padding: 3rem 1rem;
  text-align: center;
}

.c-loading {
  .compact & {
    padding: 0 1rem;
  }
}

.c-skeleton {
  display: flex;
  align-items: center;
  padding: 1rem 0;

  &-circle {
    display: block;
    width: 2.5rem;
    height: 2.5rem;
    border-radius: 50%;
    margin-right: 0.5rem;
    background-color: $general_2;
  }

  &-line {
    flex-grow: 1;
    height: 1.5rem;
    border-radius: 0.7rem;
    background-color: $general_2;
  }
}

.c-title {
  display: block;
  padding: 0 0 0.5rem;

  @include tablet {
    padding-left: 0.5rem;
  }

  .compact & {
    padding-left: 1rem;
  }
}

.c-list {
  margin-bottom: 0.5rem;
}

.c-item {
  position: relative;
  display: flex;
  align-items: center;
  min-height: 3rem;

  &:hover,
  &:focus {
    background-color: $general_2;
  }

  &:focus {
    z-index: 1;
    outline: 1px solid $primary_0;
  }

  &.unread {
    background-color: $general_2;

    &:hover,
    &:focus {
      background-color: $general_1;
    }
  }

  .default & {
    padding: 1rem 0.5rem;

    @include tablet {
      .c-item-text {
        display: block;
      }
    }
  }

  .compact & {
    padding: 1rem;

    .c-item-date {
      margin-left: 0.5rem;
    }
  }
}

.c-item-content {
  flex-grow: 1;
  margin-left: 0.5rem;
}

.c-thumbCircle {
  position: relative;
  display: inline-block;

  i {
    position: absolute;
    bottom: 0;
    right: 0;
    width: 1rem;
    height: 1rem;
    font-size: 0.5rem;
    line-height: 1rem;
    text-align: center;
    border-radius: 50%;
  }
}
</style>
