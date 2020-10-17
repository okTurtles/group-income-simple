/* eslint-env mocha */

// Run with:
// ./node_modules/.bin/mocha -w --require Gruntfile.js frontend/utils/distribution/mincome-proportional.test.js

import should from 'should'
import incomeDistribution from './mincome-proportional.js'

describe('proportionalMincomeDistributionTest', function () {
  it('distribute income above mincome proportionally', function () {
    const members = [
      { name: 'a', amount: 10 },
      { name: 'b', amount: 20 },
      { name: 'c', amount: 40 },
      { name: 'd', amount: 50 },
      { name: 'e', amount: 70 },
      { name: 'f', amount: 100 }
    ]
    const expected = [
      { amount: 3, from: 'd', to: 'a' },
      { amount: 2, from: 'd', to: 'b' },
      { amount: 9, from: 'e', to: 'a' },
      { amount: 6, from: 'e', to: 'b' },
      { amount: 18, from: 'f', to: 'a' },
      { amount: 12, from: 'f', to: 'b' }
    ]

    should(incomeDistribution(members, 40)).eql(expected)
  })

  it('distribute income above mincome proportionally when extra won\'t cover need', function () {
    const members = [
      { name: 'a', amount: 10 },
      { name: 'b', amount: 20 },
      { name: 'c', amount: 40 },
      { name: 'd', amount: 44 },
      { name: 'e', amount: 44 },
      { name: 'f', amount: 50 }
    ]
    const expected = [
      { amount: 2.4, from: 'd', to: 'a' },
      { amount: 1.6, from: 'd', to: 'b' },
      { amount: 2.4, from: 'e', to: 'a' },
      { amount: 1.6, from: 'e', to: 'b' },
      { amount: 6, from: 'f', to: 'a' },
      { amount: 4, from: 'f', to: 'b' }
    ]
    should(incomeDistribution(members, 40)).eql(expected)
  })

  it('don\'t distribute anything if no one is above mincome', function () {
    const members = [
      { name: 'a', amount: 10 },
      { name: 'b', amount: 20 },
      { name: 'c', amount: 40 },
      { name: 'd', amount: 35 },
      { name: 'e', amount: 20 },
      { name: 'f', amount: 10 }
    ]
    const expected = []
    should(incomeDistribution(members, 40)).eql(expected)
  })

  it('don\'t distribute anything if everyone is above mincome', function () {
    const members = [
      { name: 'a', amount: 40 },
      { name: 'b', amount: 45 },
      { name: 'c', amount: 40 },
      { name: 'd', amount: 50 },
      { name: 'e', amount: 100 },
      { name: 'f', amount: 52 }
    ]
    const expected = []
    should(incomeDistribution(members, 40)).eql(expected)
  })

  it('works with very imprecise splits', function () {
    const members = [
      { name: 'u1', amount: 1075 },
      { name: 'u2', amount: 975 },
      { name: 'u3', amount: 700 }
    ]
    const expected = [
      { amount: 5.769230769230769, from: 'u1', to: 'u2' },
      { amount: 69.23076923076924, from: 'u1', to: 'u3' }
    ]
    should(incomeDistribution(members, 1000)).eql(expected)
  })

  // Used to come up with https://github.com/okTurtles/group-income-simple/issues/763#issuecomment-711029706
  it('splits money evenly', function () {
    const members = [
      { name: 'u1', amount: 1009 },
      { name: 'u2', amount: 920 },
      { name: 'u3', amount: 960 }
    ]
    const expected = [
      { amount: 6, from: 'u1', to: 'u2' },
      { amount: 3, from: 'u1', to: 'u3' }
    ]
    should(incomeDistribution(members, 1000)).eql(expected)
  })
})
