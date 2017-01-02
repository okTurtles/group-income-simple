const Pull = require('pull-stream')
const Notify = require('pull-notify')
export default function (filter) {
  return function (log, name) {
    return {
      since: log.since,
      methods: { stream: 'source' },
      createSink: function (cb) {
        return Pull.filter(filter)
      },
      stream: function () {
        let notify = Notify()
        let stop
        let store = log.store()
        Pull(log.stream({ seqs: true, values: true }), Pull.drain((data) => {
          notify(data)
        }), () => {
          // End stream when log postion changes to the past
          stop = store.watch((state) => {
            return state.offset.length
          }, () => {
            notify.end()
            stop()
          })
          Pull(log.notifier(), Pull.drain((data) => {
            notify(data)
          }))
        })
        return Pull(notify.listen(), Pull.filter(filter))
      },
      close: (cb) => { return cb() },
      destroy: (cb) => { return cb() }
    }
  }
}
