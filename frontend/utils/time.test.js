/* eslint-env mocha */
import {
  DAYS_MILLIS,
  HOURS_MILLIS,
  MINS_MILLIS,
  timeSince
} from './time.js'
const should = require('should')

describe('timeSince', function () {
  const currentDate = 1590823007327
  it('Current date is "May 30, 7:16 AM"', () => {
    const humanDate = new Date(currentDate).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', hour: 'numeric', minute: 'numeric' })
    should(humanDate).equal('May 30, 7:16 AM')
  })

  it('should return "1m" when 30sec have passed', () => {
    should(timeSince(
      currentDate - MINS_MILLIS * 0.5,
      currentDate
    )).equal('1m')
  })

  it('should return "11m" when 11min have passed', () => {
    should(timeSince(
      currentDate - MINS_MILLIS * 11,
      currentDate
    )).equal('11m')
  })

  it('should return "1h" when 60min have passed', () => {
    should(timeSince(
      currentDate - MINS_MILLIS * 60,
      currentDate
    )).equal('1h')
  })

  it('should return "4h" when 4h25m have passed', () => {
    should(timeSince(
      currentDate - HOURS_MILLIS * 4.25,
      currentDate
    )).equal('4h')
  })

  it('should return "1d" when 24h have passed', () => {
    should(timeSince(
      currentDate - HOURS_MILLIS * 24,
      currentDate
    )).equal('1d')
  })

  it('should return "1d" when 40h have passed', () => {
    should(timeSince(
      currentDate - HOURS_MILLIS * 40,
      currentDate
    )).equal('1d')
  })

  it('should return current day when +48h have passed', () => {
    should(timeSince(
      currentDate - DAYS_MILLIS * 23,
      currentDate
    )).equal('May 7')
  })
})
