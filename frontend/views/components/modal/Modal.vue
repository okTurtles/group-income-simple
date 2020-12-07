<template lang='pug'>
  div
    component(:is='content' ref='content')
    component(:is='subcontent[subcontent.length-1]')
</template>
<script>
import sbp from '~/shared/sbp.js'
import { OPEN_MODAL, REPLACE_MODAL, CLOSE_MODAL, SET_MODAL_QUERIES } from '@utils/events.js'

export default {
  name: 'Modal',
  data () {
    return {
      content: null, // Main modal
      subcontent: [], // Collection of modal on top of modals
      queries: { // Queries to be used by modals
        // [modalName]: { queryKey: queryValue }
      },
      replacement: null, // Replace the modal once the first one is close without updating the url
      lastFocus: null // Record element that open the modal
    }
  },
  created () {
    sbp('okTurtles.events/on', OPEN_MODAL, this.openModal)
    sbp('okTurtles.events/on', CLOSE_MODAL, this.unloadModal)
    sbp('okTurtles.events/on', REPLACE_MODAL, this.replaceModal)
    sbp('okTurtles.events/on', SET_MODAL_QUERIES, this.setModalQueries)
    // When press escape it should close the modal
    window.addEventListener('keyup', this.handleKeyUp)
  },
  mounted () {
    const { modal, subcontent } = this.$route.query
    if (modal) this.openModal(modal)
    if (subcontent) this.openModal(subcontent)
  },
  beforeDestroy () {
    sbp('okTurtles.events/off', OPEN_MODAL)
    sbp('okTurtles.events/off', CLOSE_MODAL)
    sbp('okTurtles.events/off', REPLACE_MODAL)
    sbp('okTurtles.events/off', SET_MODAL_QUERIES)
    window.removeEventListener('keyup', this.handleKeyUp)
  },
  watch: {
    '$route' (to, from) {
      if (to.query.modal) {
        // We reset the modals with no animation for simplicity
        if (to.query.modal !== this.content) this.content = to.query.modal
        const subcontent = to.query.subcontent ? to.query.subcontent.split('+').pop() : []
        if (subcontent !== this.activeSubcontent()) {
          // Try to find the new subcontent in the list of subcontent
          const i = this.subcontent.indexOf(subcontent)
          if (i !== -1) {
            this.subcontent = this.subcontent.slice(0, i)
          } else this.subcontent = subcontent
        }
      } else {
        // Prevent a bug where we click to close a modal at the same time we
        // redirect a page (ex: setting modal -> logout). Sometimes the logout
        // and redirect would happen before the modal closes. At this moment
        // from.query.modal doesn't exist anymore. But the modal should be closed,
        // so we force the unloadModal.
        if (this.content) {
          this.unloadModal()
        }
      }
    }
  },
  methods: {
    handleKeyUp (e) {
      if (this.content && e.key === 'Escape') {
        e.preventDefault()
        this.unloadModal()
      }
    },
    activeSubcontent () {
      return this.subcontent[this.subcontent.length - 1]
    },
    updateUrl () {
      if (this.content) {
        const contentQueries = this.queries[this.content] || {}
        const subContentQueries = this.queries[this.subcontent[this.subcontent.length - 1]] || {}
        this.$router.push({
          query: {
            ...this.$route.query,
            modal: this.content,
            ...contentQueries,
            subcontent: this.subcontent.length ? this.subcontent.join('+') : undefined,
            ...subContentQueries
          }
        }).catch(console.error)
      } else if (this.$route.query.modal) {
        const rQueries = { ...this.$route.query }
        const queriesToDelete = {
          modal: true,
          subcontent: true,
          ...this.queries[rQueries.modal]
        }

        for (const mQuery in queriesToDelete) {
          delete rQueries[mQuery]
        }

        this.$router.push({ rQueries }).catch(console.error)
      }
    },
    openModal (componentName, queries = {}) {
      // Don't open the same kind of modal twice.
      if (this.content === componentName) return

      this.lastFocus = document.activeElement
      if (this.content) {
        this.subcontent.push(componentName)
      } else {
        this.content = componentName
      }
      this.queries[componentName] = queries
      this.updateUrl()
    },
    unloadModal () {
      if (this.subcontent.length) {
        this.subcontent.pop()
      } else {
        this.content = null
        // Refocus on button that open the modal if it exists.
        // TODO - find a way to support lastFocus when opened through profile|notifications card.
        this.lastFocus && this.lastFocus.focus()
      }
      if (this.replacement) {
        this.openModal(this.replacement)
        this.replacement = null
      } else {
        this.updateUrl()
      }
    },
    replaceModal (componentName) {
      this.replacement = componentName
      // At the moment you can only replace a modal if it's the main one by design
      // Use direct children instead of sbp to wait for animation out
      this.$refs['content'].$children[0].close()
    },
    setModalQueries (componentName, queries) {
      this.queries[componentName] = queries
    }
  }
}
</script>
