
/* TODO: adapt distribution.test.js to the following structure/scenarios:
let setup = [
  { type: 'haveNeedEvent', data: { who: 'u1', haveNeed: 100 } },
  { type: 'haveNeedEvent', data: { who: 'u5', haveNeed: 100 } },
  { type: 'haveNeedEvent', data: { who: 'u2', haveNeed: -50 } },
  { type: 'haveNeedEvent', data: { who: 'u3', haveNeed: -50 } },
]
// our current unadjusted non-minimized distribution looks like this:
expect(distribution(setup, { adjusted: false, minimizeTxns: false })).equal([
  { from: 'u1', to: 'u2', amount: 25 },
  { from: 'u1', to: 'u3', amount: 25 },
  { from: 'u5', to: 'u2', amount: 25 },
  { from: 'u5', to: 'u3', amount: 25 }
])
// IMPORTANT!
// The algorithm should be a function that works exactly like this. It should take
// at least two parameters: a list of events, and a list of options.
// It should handle all of these options. We _NEED_ to be able to generate the unadjusted
// non-minimized distribution so that we can draw the graph in the dashboard.
//
// The mocha tests should look very similar to this too.
// We can completely ignore the `cycle` variable to do these tests without pro-rating.
// with transaction minimization enabled it should look like this:
expect(distribution(setup, { adjusted: false, minimizeTxns: true })).equal([
  { from: 'u1', to: 'u2', amount: 50 },
  { from: 'u5', to: 'u3', amount: 50 }
])
// EVENT: a payment of $10 is made from u1 to u2
setup.push({ type: 'payment', data: { from: 'u1', to: 'u2', amount: 10 } })
// the unadjusted distribution should the same as it did before. It should ignore all payment events.
expect(distribution(setup, { adjusted: false, minimizeTxns: false })).equal([
  { from: 'u1', to: 'u2', amount: 25 },
  { from: 'u1', to: 'u3', amount: 25 },
  { from: 'u5', to: 'u2', amount: 25 },
  { from: 'u5', to: 'u3', amount: 25 }
])
// the adjusted non-minimized distribution should *not* ignore payment events
expect(distribution(setup, { adjusted: true, minimizeTxns: false })).equal([
  { from: 'u1', to: 'u2', amount: 15 },
  { from: 'u1', to: 'u3', amount: 25 },
  { from: 'u5', to: 'u2', amount: 25 },
  { from: 'u5', to: 'u3', amount: 25 }
])
// the adjusted minimized distribution should look like this:
expect(distribution(setup, { adjusted: true, minimizeTxns: true })).equal([
  { from: 'u1', to: 'u2', amount: 40 },
  { from: 'u5', to: 'u3', amount: 50 }
])
// EVENT: u4 sets need of 100
setup.push({ type: 'haveNeedEvent', data: { who: 'u4', haveNeed: -100 } })
// the unadjusted non-minimized distribution should look different now:
expect(distribution(setup, { adjusted: false, minimizeTxns: false })).equal([
  { from: 'u1', to: 'u2', amount: 25 },
  { from: 'u1', to: 'u3', amount: 25 },
  { from: 'u1', to: 'u4', amount: 50 },
  { from: 'u5', to: 'u2', amount: 25 },
  { from: 'u5', to: 'u3', amount: 25 },
  { from: 'u5', to: 'u4', amount: 50 }
])
// the adjusted non-minimized distribution should look like this:
expect(distribution(setup, { adjusted: true, minimizeTxns: false })).equal([
  { from: 'u1', to: 'u2', amount: 15 },
  { from: 'u1', to: 'u3', amount: 25 },
  { from: 'u1', to: 'u4', amount: 50 },
  { from: 'u5', to: 'u2', amount: 25 },
  { from: 'u5', to: 'u3', amount: 25 },
  { from: 'u5', to: 'u4', amount: 50 }
])
// the adjusted minimized distribution should look like this:
expect(distribution(setup, { adjusted: true, minimizeTxns: true })).equal([
  { from: 'u1', to: 'u2', amount: 40 },
  { from: 'u1', to: 'u3', amount: 50 },
  { from: 'u5', to: 'u4', amount: 100 }
])
// EVENT: u3 removes themselves from the group. This is equivalent to setting their haveNeed to 0
setup.push({ type: 'haveNeedEvent', data: { who: 'u3', haveNeed: 0 } })
// the 3 main permutations follow:
expect(distribution(setup, { adjusted: false, minimizeTxns: false })).equal([
  { from: 'u1', to: 'u2', amount: 25 },
  { from: 'u1', to: 'u4', amount: 50 },
  { from: 'u5', to: 'u2', amount: 25 },
  { from: 'u5', to: 'u4', amount: 50 }
])
expect(distribution(setup, { adjusted: true, minimizeTxns: false })).equal([
  { from: 'u1', to: 'u2', amount: 15 },
  { from: 'u1', to: 'u4', amount: 50 },
  { from: 'u5', to: 'u2', amount: 25 },
  { from: 'u5', to: 'u4', amount: 50 }
])
expect(distribution(setup, { adjusted: true, minimizeTxns: true })).equal([
  { from: 'u1', to: 'u2', amount: 40 },
  { from: 'u1', to: 'u4', amount: 25 },
  { from: 'u5', to: 'u4', amount: 75 }
])
// EVENT: u1 pays $5 to u4
setup.push({ type: 'payment', data: { from: 'u1', to: 'u4', amount: 5 } })
// the 3 main permutations follow:
expect(distribution(setup, { adjusted: false, minimizeTxns: false })).equal([
  { from: 'u1', to: 'u2', amount: 25 },
  { from: 'u1', to: 'u4', amount: 50 },
  { from: 'u5', to: 'u2', amount: 25 },
  { from: 'u5', to: 'u4', amount: 50 }
])
expect(distribution(setup, { adjusted: true, minimizeTxns: false })).equal([
  { from: 'u1', to: 'u2', amount: 15 },
  { from: 'u1', to: 'u4', amount: 45 },
  { from: 'u5', to: 'u2', amount: 25 },
  { from: 'u5', to: 'u4', amount: 50 }
])
expect(distribution(setup, { adjusted: true, minimizeTxns: true })).equal([
  { from: 'u1', to: 'u2', amount: 40 },
  { from: 'u1', to: 'u4', amount: 20 },
  { from: 'u5', to: 'u4', amount: 75 }
])
// EVENT: u3 sets haveNeed to -100
setup.push({ type: 'haveNeedEvent', data: { who: 'u3', haveNeed: -100 } })
// the 3 main permutations follow
expect(distribution(setup, { adjusted: false, minimizeTxns: false })).equal([
  { from: 'u1', to: 'u2', amount: 20 },
  { from: 'u1', to: 'u3', amount: 40 },
  { from: 'u1', to: 'u4', amount: 40 },
  { from: 'u5', to: 'u2', amount: 20 },
  { from: 'u5', to: 'u3', amount: 40 },
  { from: 'u5', to: 'u4', amount: 40 }
])
expect(distribution(setup, { adjusted: true, minimizeTxns: false })).equal([
  { from: 'u1', to: 'u2', amount: 10 },
  { from: 'u1', to: 'u3', amount: 40 },
  { from: 'u1', to: 'u4', amount: 35 },
  { from: 'u5', to: 'u2', amount: 20 },
  { from: 'u5', to: 'u3', amount: 40 },
  { from: 'u5', to: 'u4', amount: 40 }
])
// something along these lines (could be different! but shouldn't exceed this number of txns!)
expect(distribution(setup, { adjusted: true, minimizeTxns: true })).equal([
  { from: 'u1', to: 'u2', amount: 30 },
  { from: 'u1', to: 'u4', amount: 55 },
  { from: 'u5', to: 'u3', amount: 80 },
  { from: 'u5', to: 'u4', amount: 20 }
])
// EVENT: u5 pays $10 to u2
setup.push({ type: 'payment', data: { from: 'u5', to: 'u2', amount: 10 } })
// the 3 main permutations follow
expect(distribution(setup, { adjusted: false, minimizeTxns: false })).equal([
  { from: 'u1', to: 'u2', amount: 20 },
  { from: 'u1', to: 'u3', amount: 40 },
  { from: 'u1', to: 'u4', amount: 40 },
  { from: 'u5', to: 'u2', amount: 20 },
  { from: 'u5', to: 'u3', amount: 40 },
  { from: 'u5', to: 'u4', amount: 40 }
])
expect(distribution(setup, { adjusted: true, minimizeTxns: false })).equal([
  { from: 'u1', to: 'u2', amount: 10 },
  { from: 'u1', to: 'u3', amount: 40 },
  { from: 'u1', to: 'u4', amount: 35 },
  { from: 'u5', to: 'u2', amount: 10 },
  { from: 'u5', to: 'u3', amount: 40 },
  { from: 'u5', to: 'u4', amount: 40 }
])
expect(distribution(setup, { adjusted: true, minimizeTxns: true })).equal([
  // ERROR IN SIMULATION SETUP!
  // THE TXN MINIMIZATION TODO LIST DID NOT SPECIFY THAT U5 PAY U2 ANYTHING!
  // SO THIS SCENARIO COULDN'T HAPPEN
])
​*/
