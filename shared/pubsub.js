'use strict'

import type { JSONObject, JSONType } from '~/shared/types.js'

// ====== Types ====== //

/*
 * Flowtype usage notes:
 *
 * - The '+' prefix indicates properties that should not be re-assigned or
 *   deleted after their initialization.
 *
 * - 'TimeoutID' is an opaque type declared in Flow's core definition file,
 *   used as the return type of the core setTimeout() function.
 */

export type Message = {
  [key: string]: JSONType,
  +type: string
}

export type PubSubClient = {
  connectionTimeoutID: TimeoutID | void,
  +customEventHandlers: Object,
  failedConnectionAttempts: number,
  isNew: boolean,
  +listeners: Object,
  +messageHandlers: Object,
  nextConnectionAttemptDelayID: TimeoutID | void,
  +options: Object,
  +pendingSubscriptionSet: Set<string>,
  +pendingUnsubscriptionSet: Set<string>,
  pingTimeoutID: TimeoutID | void,
  shouldReconnect: boolean,
  socket: WebSocket | null,
  +subscriptionSet: Set<string>,
  +url: string,
  // Methods
  clearAllTimers(): void,
  connect(): void,
  destroy(): void,
  emit(type: string, detail?: any): void,
  pub(contractID: string, data: JSONType): void,
  scheduleConnectionAttempt(): void,
  sub(contractID: string): void,
  unsub(contractID: string): void
}

export type SubMessage = {
  [key: string]: JSONType,
  +type: 'sub',
  +contractID: string
}

export type UnsubMessage = {
  [key: string]: JSONType,
  +type: 'unsub',
  +contractID: string
}

// ====== Enums ====== //

export const NOTIFICATION_TYPE = Object.freeze({
  ENTRY: 'entry',
  PING: 'ping',
  PONG: 'pong',
  PUB: 'pub',
  SUB: 'sub',
  UNSUB: 'unsub'
})

export const REQUEST_TYPE = Object.freeze({
  PUB: 'pub',
  SUB: 'sub',
  UNSUB: 'unsub'
})

export const RESPONSE_TYPE = Object.freeze({
  ERROR: 'error',
  SUCCESS: 'success'
})

export type NotificationTypeEnum = $Values<typeof NOTIFICATION_TYPE>
export type RequestTypeEnum = $Values<typeof REQUEST_TYPE>
export type ResponseTypeEnum = $Values<typeof RESPONSE_TYPE>

// ====== API ====== //

/**
 * Creates a pubsub client instance.
 *
 * @param {string} url - A WebSocket URL to connect to.
 * @param {Object?} options
 * {boolean?} debug
 * {object?} handlers - Custom handlers for WebSocket events.
 * {boolean?} manual - Whether the factory should call 'connect()' automatically.
 *   Also named 'autoConnect' or 'startClosed' in other libraries.
 * {object?} messageHandlers - Custom handlers for different message types.
 * {number?} pingTimeout - How long to wait for the server to send a ping, in milliseconds.
 * {boolean?} reconnectOnDisconnection - Whether to reconnect after a server-side disconnection.
 * {boolean?} reconnectOnOnline - Whether to reconnect after coming back online.
 * {boolean?} reconnectOnTimeout - Whether to reconnect after a connection timeout.
 * {number?} timeout - Connection timeout duration in milliseconds.
 * @returns {PubSubClient}
 */
export function createClient (url: string, options?: Object = {}): PubSubClient {
  const client: PubSubClient = {
    customEventHandlers: options.handlers || {},
    // The current number of connection attempts that failed.
    // Reset to 0 upon successful connection.
    // Used to compute how long to wait before the next reconnection attempt.
    failedConnectionAttempts: 0,
    // True if this client has never been connected yet.
    isNew: true,
    listeners: Object.create(null),
    messageHandlers: { ...defaultMessageHandlers, ...options.messageHandlers },
    nextConnectionAttemptDelayID: undefined,
    options: { ...defaultOptions, ...options },
    // Requested subscriptions for which we didn't receive a response yet.
    pendingSubscriptionSet: new Set(),
    pendingUnsubscriptionSet: new Set(),
    pingTimeoutID: undefined,
    shouldReconnect: true,
    // The underlying WebSocket object.
    // A new one is necessary for every connection or reconnection attempt.
    socket: null,
    subscriptionSet: new Set(),
    connectionTimeoutID: undefined,
    url: url.replace(/^http/, 'ws'),
    ...publicMethods
  }
  // Create and save references to reusable event listeners.
  // Every time a new underlying WebSocket object will be created for this
  // client instance, these event listeners will be detached from the older
  // socket then attached to the new one, hereby avoiding both unnecessary
  // allocations and garbage collections of a bunch of functions every time.
  // Another benefit is the ability to patch the client protocol at runtime by
  // updating the client's custom event handler map.
  for (const name of Object.keys(defaultClientEventHandlers)) {
    client.listeners[name] = (event) => {
      const customHandler = client.customEventHandlers[name]
      const defaultHandler = defaultClientEventHandlers[name]
      // Pass the client as the 'this' binding since we are processing client events.
      try {
        if (defaultHandler) {
          defaultHandler.call(client, event)
        }
        if (customHandler) {
          customHandler.call(client, event)
        }
      } catch (error) {
        // Do not throw any error but emit an `error` event instead.
        client.emit('error', error.message)
      }
    }
  }
  // Add global event listeners before the first connection.
  if (typeof window === 'object') {
    globalEventNames.forEach((name) => {
      window.addEventListener(name, client.listeners[name])
    })
  }
  if (!client.options.manual) {
    client.connect()
  }
  return client
}

export function createMessage (type: string, data: JSONType): string {
  return JSON.stringify({ type, data })
}

export function createRequest (type: RequestTypeEnum, data: JSONObject): string {
  // Had to use Object.assign() instead of object spreading to make Flow happy.
  return JSON.stringify(Object.assign({ type }, data))
}

// These handlers receive the PubSubClient instance through the `this` binding.
const defaultClientEventHandlers = {
  // Emitted when the connection is closed.
  close (event: CloseEvent) {
    console.log('[pubsub] Event: close', event.code, event.reason)
    this.failedConnectionAttempts++

    if (this.socket) {
      // Remove event listeners to avoid memory leaks.
      for (const name of socketEventNames) {
        this.socket.removeEventListener(name, this.listeners[name])
      }
    }
    this.socket = null
    this.clearAllTimers()

    // See "Status Codes" https://tools.ietf.org/html/rfc6455#section-7.4
    switch (event.code) {
      // TODO: verify that this list of codes is correct.
      case 1000: case 1002: case 1003: case 1007: case 1008: {
        this.shouldReconnect = false
        break
      }
      default: break
    }
    if (this.shouldReconnect && this.options.reconnectOnDisconnection) {
      if (this.failedConnectionAttempts <= this.options.maxRetries) {
        this.scheduleConnectionAttempt()
      } else {
        this.destroy()
      }
    }
  },

  // Emitted when an error has occured.
  // The socket will be closed automatically by the engine if necessary.
  error (event: Event) {
    console.error('[pubsub] Event: error', event)
    clearTimeout(this.pingTimeoutID)
  },

  // Emitted when a message is received.
  // The connection will be terminated if the message is malformed or has an
  // unexpected data type (e.g. binary instead of text).
  message (event: MessageEvent) {
    const { data } = event

    if (typeof data !== 'string') {
      this.emit('error', `Critical error! Wrong data type: ${typeof data}`)
      return this.destroy()
    }
    let msg: Message = { type: '' }

    try {
      msg = messageParser(data)
    } catch (error) {
      this.emit('error', `Critical error! Malformed message: ${error.message}`)
      return this.destroy()
    }
    const handler = this.messageHandlers[msg.type]

    if (handler) {
      handler.call(this, msg)
    } else {
      throw new Error(`Unhandled message type: ${msg.type}`)
    }
  },

  offline (event: Event) {
    console.log('[pubsub] Event: offline')
    clearTimeout(this.pingTimeoutID)
    // Reset the connection attempt counter so that we'll start a new
    // reconnection loop when we are back online.
    this.failedConnectionAttempts = 0
    if (this.socket) {
      this.socket.close()
    }
  },

  online (event: Event) {
    console.log('[pubsub] Event: online')
    if (this.options.reconnectOnOnline && this.shouldReconnect) {
      if (!this.socket) {
        this.failedConnectionAttempts = 0
        this.scheduleConnectionAttempt()
      }
    }
  },

  // Emitted when the connection is established.
  open (event: Event) {
    console.log('[pubsub] Event: open')
    if (!this.isNew) {
      this.emit('reconnection-succeeded')
    }
    this.clearAllTimers()
    // Set it to -1 so that it becomes 0 on the next `close` event.
    this.failedConnectionAttempts = -1
    this.isNew = false
    // Setup a ping timeout if required.
    // It will close the connection if we don't get any message from the server.
    if (this.options.pingTimeout > 0 && this.options.pingTimeout < Infinity) {
      this.pingTimeoutID = setTimeout(() => {
        if (this.socket) this.socket.close()
      }, this.options.pingTimeout)
    }
    // Resend any still unacknowledged request.
    this.pendingSubscriptionSet.forEach((contractID) => {
      if (this.socket) {
        this.socket.send(createRequest(REQUEST_TYPE.SUB, { contractID }))
      }
    })
    this.pendingUnsubscriptionSet.forEach((contractID) => {
      if (this.socket) {
        this.socket.send(createRequest(REQUEST_TYPE.UNSUB, { contractID }))
      }
    })
  },

  'reconnection-attempt' (event: CustomEvent) {
    console.log('[pubsub] Trying to reconnect...')
  },

  'reconnection-succeeded' (event: CustomEvent) {
    console.log('[pubsub] Connection re-established')
  },

  'reconnection-failed' (event: CustomEvent) {
    console.log('[pubsub] Reconnection failed')
  },

  'reconnection-scheduled' (event: CustomEvent) {
    const { delay, nth } = event.detail
    console.log(`[pubsub] Scheduled connection attempt ${nth} in ~${delay} ms`)
  }
}

// These handlers receive the PubSubClient instance through the `this` binding.
const defaultMessageHandlers = {
  [NOTIFICATION_TYPE.PING] ({ data }) {
    console.debug(`[pubsub] Ping received in ${Date.now() - Number(data)} ms`)
    // Reply with a pong message using the same data.
    if (this.socket) {
      this.socket.send(createMessage(NOTIFICATION_TYPE.PONG, data))
    }
    // Refresh the ping timer, waiting for the next ping.
    clearTimeout(this.pingTimeoutID)
    this.pingTimeoutID = setTimeout(() => {
      if (this.socket) {
        this.socket.close()
      }
    }, this.options.pingTimeout)
  },

  // PUB can be used to send ephemeral messages outside of any contract log.
  [NOTIFICATION_TYPE.PUB] (msg) {
    console.debug(`[pubsub] Ignoring ${msg.type} message:`, msg.data)
  },

  [NOTIFICATION_TYPE.SUB] (msg) {
    console.debug(`[pubsub] Ignoring ${msg.type} message:`, msg.data)
  },

  [NOTIFICATION_TYPE.UNSUB] (msg) {
    console.debug(`[pubsub] Ignoring ${msg.type} message:`, msg.data)
  },

  [RESPONSE_TYPE.ERROR] ({ data: { type, contractID } }) {
    console.log(`[pubsub] Received ERROR response for ${type} request to ${contractID}`)
  },

  [RESPONSE_TYPE.SUCCESS] ({ data: { type, contractID } }) {
    const client = this
    switch (type) {
      case REQUEST_TYPE.SUB: {
        console.log(`[pubsub] Subscribed to ${contractID}`)
        client.pendingSubscriptionSet.delete(contractID)
        client.subscriptionSet.add(contractID)
        break
      }
      case REQUEST_TYPE.UNSUB: {
        console.log(`[pubsub] Unsubscribed from ${contractID}`)
        client.pendingUnsubscriptionSet.delete(contractID)
        client.subscriptionSet.delete(contractID)
        break
      }
      default: {
        console.error(`[pubsub] Malformed response: invalid request type ${type}`)
      }
    }
  }
}

// TODO: verify these are good defaults
const defaultOptions = {
  debug: process.env.NODE_ENV === 'development',
  pingTimeout: 45_000,
  maxReconnectionDelay: 60_000,
  maxRetries: 10,
  minReconnectionDelay: 500,
  reconnectOnDisconnection: true,
  reconnectOnOnline: true,
  // Defaults to false to avoid reconnection attempts in case the server doesn't
  // respond because of a failed authentication.
  reconnectOnTimeout: false,
  reconnectionDelayGrowFactor: 2,
  timeout: 5_000
}

const customEventNames = [
  'reconnection-attempt',
  'reconnection-failed',
  'reconnection-scheduled',
  'reconnection-succeeded'
]
const globalEventNames = ['offline', 'online']
const socketEventNames = ['close', 'error', 'message', 'open']

// Parses and validates a received message.
export const messageParser = (data: string): Message => {
  const msg = JSON.parse(data)

  if (typeof msg !== 'object' || msg === null) {
    throw new TypeError('Message is null or not an object')
  }
  const { type } = msg

  if (typeof type !== 'string' || type === '') {
    throw new TypeError('Message type must be a non-empty string')
  }
  return msg
}

const publicMethods = {
  clearAllTimers () {
    clearTimeout(this.connectionTimeoutID)
    clearTimeout(this.nextConnectionAttemptDelayID)
    clearTimeout(this.pingTimeoutID)
    this.connectionTimeoutID = undefined
    this.nextConnectionAttemptDelayID = undefined
    this.pingTimeoutID = undefined
  },

  // Performs a connection or reconnection attempt.
  connect () {
    if (this.socket !== null) {
      throw new Error('connect() can only be called if there is no current socket.')
    }
    if (this.nextConnectionAttemptDelayID) {
      throw new Error('connect() must not be called during a reconnection delay.')
    }
    if (!this.shouldReconnect) {
      throw new Error('connect() should no longer be called on this instance.')
    }
    this.socket = new WebSocket(this.url)

    if (this.options.timeout) {
      this.connectionTimeoutID = setTimeout(() => {
        this.connectionTimeoutID = undefined
        if (this.socket) {
          this.socket.close(4000, 'timeout')
        }
      }, this.options.timeout)
    }
    // Attach WebSocket event listeners.
    for (const name of socketEventNames) {
      this.socket.addEventListener(name, this.listeners[name])
    }
  },

  /**
   * Immediately close the socket, stop listening for events and clear any cache.
   *
   * This method is used in unit tests.
   * - In particular, no 'close' event handler will be called.
   * - Any incoming or outgoing buffered data will be discarded.
   * - Any pending messages will be discarded.
   */
  destroy () {
    this.clearAllTimers()
    // Update property values.
    // Note: do not clear 'this.options'.
    this.pendingSubscriptionSet.clear()
    this.pendingUnsubscriptionSet.clear()
    this.subscriptionSet.clear()
    // Remove global event listeners.
    if (typeof window === 'object') {
      for (const name of globalEventNames) {
        window.removeEventListener(name, this.listeners[name])
      }
    }
    // Remove WebSocket event listeners.
    if (this.socket) {
      for (const name of socketEventNames) {
        this.socket.removeEventListener(name, this.listeners[name])
      }
      this.socket.close()
    }
    this.listeners = {}
    this.socket = null
    this.shouldReconnect = false
  },

  // Emits a custom event or an `error` event.
  // Other fake native events are not allowed so as to not break things.
  emit (type: string, detail?: mixed) {
    if (!customEventNames.includes(type) && type !== 'error') {
      throw new Error(`emit(): argument 'type' must not be '${type}'.`)
    }
    // This event object partially implements the `CustomEvent` interface.
    const event = { type, detail }
    const listener = this.listeners[type]
    if (listener) {
      listener(event)
    }
  },

  getNextRandomDelay (): number {
    const {
      maxReconnectionDelay,
      minReconnectionDelay,
      reconnectionDelayGrowFactor
    } = this.options

    const minDelay = minReconnectionDelay * reconnectionDelayGrowFactor ** this.failedConnectionAttempts
    const maxDelay = minDelay * reconnectionDelayGrowFactor

    return Math.min(maxReconnectionDelay, Math.round(minDelay + Math.random() * (maxDelay - minDelay)))
  },

  // Schedules a connection attempt to happen after a delay computed according to
  // a randomized exponential backoff algorithm variant.
  scheduleConnectionAttempt () {
    if (!this.shouldReconnect) {
      throw new Error('Cannot call `scheduleConnectionAttempt()` when `shouldReconnect` is false.')
    }
    const delay = this.getNextRandomDelay()
    const nth = this.failedConnectionAttempts + 1

    this.nextConnectionAttemptDelayID = setTimeout(() => {
      this.emit('reconnection-attempt')
      this.nextConnectionAttemptDelayID = undefined
      this.connect()
    }, delay)
    this.emit('reconnection-scheduled', { delay, nth })
  },

  // Unused for now.
  pub (contractID: string, data: JSONType) {
  },

  /**
   * Sends a SUB request to the server as soon as possible.
   *
   * - The given contract ID will be cached until we get a relevant server
   * response, allowing us to resend the same request if necessary.
   * - Any identical UNSUB request that has not been sent yet will be cancelled.
   * - Calling this method again before the server has responded has no effect.
   * @param contractID - The ID of the contract whose updates we want to subscribe to.
   */
  sub (contractID: string) {
    const { socket } = this

    if (!this.pendingSubscriptionSet.has(contractID)) {
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(createRequest(REQUEST_TYPE.SUB, { contractID }))
      }
    }
    this.pendingSubscriptionSet.add(contractID)
    this.pendingUnsubscriptionSet.delete(contractID)
  },

  /**
   * Sends an UNSUB request to the server as soon as possible.
   *
   * - The given contract ID will be cached until we get a relevant server
   * response, allowing us to resend the same request if necessary.
   * - Any identical SUB request that has not been sent yet will be cancelled.
   * - Calling this method again before the server has responded has no effect.
   * @param contractID - The ID of the contract whose updates we want to unsubscribe from.
   */
  unsub (contractID: string) {
    const { socket } = this

    if (!this.pendingUnsubscriptionSet.has(contractID)) {
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(createRequest(REQUEST_TYPE.UNSUB, { contractID }))
      }
    }
    this.pendingSubscriptionSet.delete(contractID)
    this.pendingUnsubscriptionSet.add(contractID)
  }
}

export default {
  NOTIFICATION_TYPE,
  REQUEST_TYPE,
  RESPONSE_TYPE,
  createClient,
  createMessage,
  createRequest
}
