'use strict'

export function dasherize (s) {
  return s
    .trim()
    .replace(/[_\s]+/g, '-')
    .replace(/([A-Z])/g, '-$1')
    .replace(/-+/g, '-')
    .toLowerCase()
}

export function capitalize (s) {
  return s.substr(0, 1).toUpperCase() + s.substring(1).toLowerCase()
}

export function camelize (s) {
  return s.trim().replace(/(-|_|\s)+(.)?/g, (mathc, sep, c) => {
    return c ? c.toUpperCase() : ''
  })
}

export function startsWith (s, what) {
  return s.indexOf(what) === 0
}

export function endsWith (s, what) {
  const len = s.length - what.length
  return len >= 0 && s.indexOf(what, len) === len
}

export function chompLeft (s, what) {
  return s.indexOf(what) === 0 ? s.slice(what.length) : s
}

export function chompRight (s, what) {
  return endsWith(s, what) ? s.slice(0, s.length - what.length) : s
}
