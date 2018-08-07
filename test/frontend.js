/* eslint-env mocha */
/*
 To see how Nightmare does its server stuff see:

 - https://github.com/segmentio/nightmare/blob/2453f7f/test/server.js#L86
 - https://github.com/segmentio/nightmare/blob/2771166/test/index.js#L43-L46
 */

const should = require('should')
const Nightmare = require('nightmare')
const url = require('url')
const exec = require('child_process').execFileSync
const fs = require('fs')

// Access any element by its data-test attribute
function elT (el) {
  return `[data-test="${el}"]`
}

function page (page) {
  return url.resolve(process.env.FRONTEND_URL, `simple/${page}`)
}

// TODO: consider converting these to Nightmare actions that check if we're
//       logged in/logged out and then act appropriately (e.g. instead of
//       `n.use(logout())` we do `n.logoutIfLoggedIn()` or `n.logoutAndLogin()`?)
function logout () {
  return function (n) {
    n.click(elT('logoutBtn'))
  }
}

function login (name) {
  return function (n) {
    n.wait(elT('loginBtn'))
      .click(elT('loginBtn'))
      .wait(elT('modal'))
      .insert(elT('loginName'), name)
      .insert(elT('loginPassword'), 'testtest')
      .click(elT('loginSubmit'))
      // we don't check the specific name because the display name could have been modified
      .wait(elT('profileDisplayName'))
  }
}

function signup (name, email = 'test@test.com', password = '1234567') {
  return function (n) {
    n.goto(page('/'))
      .wait(elT('signupBtn'))
      .click(elT('signupBtn'))
      .wait(elT('modal'))
      .insert(elT('signName'), name)
      .insert(elT('signEmail'), email)
      .insert(elT('signPassword'), password)
      .wait(el => !document.querySelector(el).disabled, elT('signSubmit'))
      .click(elT('signSubmit'))
      .wait((el, name) => {
        var it = document.querySelector(el)
        return it && it.innerText === name
      }, elT('profileDisplayName'), name)
  }
}

// .use() this during debugging to track down which Nightmare action is failing`
function note (message) {
  return function (n) {
    n.wait(msg => { console.error('[NIGHTMARE NOTE]: ' + msg); return true }, message)
  }
}

describe('Frontend', function () {
  const n = Nightmare({
    openDevTools: { mode: 'detach' },
    show: !!process.env.SHOW_BROWSER,
    // these need to be short, definitely much shorter than mocha timeouts
    // in order to get useful debugging information
    // NOTE: you can change the wait and execution timeouts to higher numbers
    //       like 60000 to facility with SHOW_BROWSER based debugging
    // waitTimeout: 60000,
    waitTimeout: 2000,
    executionTimeout: 1000,
    height: 900
  })
  n.on('page', (type, msg, stack) => {
    if (type === 'error') {
      console.error('\x1b[31m', '!! [NIGHTMARE] page error:', msg, 'stack:', stack, '\x1b[0m')
    }
  })
  n.on('console', (type, args) => {
    if (type === 'error') {
      var idx = -1
      if (args.indexOf) idx = args.indexOf('[NIGHTMARE NOTE]: ')
      if (idx !== -1) {
        console.warn('\x1b[34m', '!! ' + args.slice(idx), '\x1b[0m')
      } else {
        console.error('\x1b[31m', '!! [NIGHTMARE] console error:', args, '\x1b[0m')
      }
    }
  })

  after(() => { n.end() })

  before(() => {
    return require('../backend/index.js')
  })

  let username = `User`

  describe('Sign up Test', function () {
    it('Should register User', async function () {
      this.timeout(10000)
      const signedup = await n
        .use(signup(username, 'test@testgroupincome.com', 'testtest'))
        .evaluate((el) => !!document.querySelector(el), elT('homeLogo'))
      should(signedup).equal(true)
    })

    it('Test Global Profile Change', function () {
      this.timeout(10000)
      return n
        .click(elT('profileLink'))
        .wait(elT('profilePicture'))
        .insert(elT('bio'), 'Born in a test case')
        .insert(elT('displayName'), 'Tester T Test')
        .insert(elT('bio'), 'Born in a test case')
        .insert(elT('profilePicture')) // clear
        .insert(elT('profilePicture'), 'http://testing.rocks')
        .insert(elT('profileEmail')) // clear
        .insert(elT('profileEmail'), 'email@testing.rocks')
        .click(elT('submit'))
        .wait(elT('profileSaveSuccess'))
        .exists(elT('profileSaveSuccess'))
    })
    it('Test Logout and Login', async function () {
      this.timeout(10000)
      return n.use(logout()).use(note('logout -> login to: ' + username)).use(login(username))
    })

    it('Test Validation', async function () {
      this.timeout(4000)
      const badUsername = 't e s t'
      const badEmail = '@fail'
      const badPassword = '789'// six is so afraid
      const denied = await n
        .use(logout())
        .goto(page('signup'))
        .wait(elT('signName'))
        .insert(elT('signName'), badUsername)
        .insert(elT('signEmail'), badEmail)
        .insert(elT('signPassword'), badPassword)
        .evaluate(
          (el) => document.querySelector(el) && document.querySelector(el).disabled,
          elT('signSubmit')
        )
      should(denied).equal(true)

      const usernameMsg = await n
        .wait(elT('badUsername'))
        .exists(elT('badUsername'))
      should(usernameMsg).equal(true)

      const emailMsg = await n
        .wait(elT('badEmail'))
        .exists(elT('badEmail'))
      should(emailMsg).equal(true)

      const passwordMsg = await n
        .wait(elT('badPassword'))
        .exists(elT('badPassword'))
      should(passwordMsg).equal(true)
      // clear inputs
      n.insert(elT('signName')).insert(elT('signEmail')).insert(elT('signPassword'))
    })
  })

  describe('Group Creation Test', function () {
    it('Create Users for new group', async function () {
      this.timeout(4 * 8000)
      await n
        .goto(page('signup'))
        .use(signup(username + '2')).use(logout())
        .use(signup(username + '3')).use(logout())
        .use(signup(username + '4')).use(logout())
        .use(signup(username + '5'))
    })

    it('Should create a group', async function () {
      const testName = 'Test Group'
      const testValues = 'Testing this software'
      const testIncome = 200
      const testSetting = 80
      this.timeout(10000)
      await n
        .click(elT('createGroup'))
        // fill group data
        .wait(elT('groupName'))
        .insert(elT('groupName'), testName)
        .click(elT('nextBtn'))
        .wait('textarea[name="sharedValues"]')
        .insert('textarea[name="sharedValues"]', testValues)
        .click(elT('nextBtn'))
        .wait('input[name="incomeProvided"]')
        .insert('input[name="incomeProvided"]', testIncome)
        .click(elT('nextBtn'))
        .wait(elT('rulesStep'))
        // set rules step skipped for now
        .click(elT('nextBtn'))
        .wait(elT('privacyStep'))
        .click(elT('nextBtn'))
        // invite members
        .wait(elT('searchUser'))
        .insert(elT('searchUser'), username + '4')
        .click(elT('addButton'))
        .wait(elT('member'))

      const invited = await n.evaluate(el => document.querySelectorAll(el).length, elT('member'))
      should(invited).equal(1)

      await n.click(elT('nextBtn')).wait(elT('summaryStep'))
      // summary page sees group as valid
      const valid = await n.exists(`${elT('finishBtn')}:not(:disabled)`)
      should(valid).equal(true)
      // submit group
      await n.click(elT('finishBtn')).wait(elT('dashboard'))

      const created = await n.evaluate(() => ({
        groupName: document.querySelector('[data-test="groupName"]').innerText,
        sharedValues: document.querySelector('[data-test="sharedValues"]').innerText,
        incomeProvided: document.querySelector('[data-test="minIncome"]').innerText,
        changePercentage: document.querySelector('[data-test="changePercentage"]').innerText,
        memberApprovalPercentage: document.querySelector('[data-test="approvePercentage"]').innerText,
        memberRemovalPercentage: document.querySelector('[data-test="removePercentage"]').innerText
      }))
      should(created.groupName).equal(testName)
      should(created.sharedValues).equal(testValues)
      // BUG: TODO: this field should not include the currency
      //      TODO: the currency should be checked separately via data-test="incomeCurrency"
      should(created.incomeProvided).equal('$' + testIncome)
      should(created.changePercentage).equal(testSetting + '%')
      should(created.memberApprovalPercentage).equal(testSetting + '%')
      should(created.memberRemovalPercentage).equal(testSetting + '%')
    })

    it('Should invite members to group', async function () {
      this.timeout(4000)

      const count = await n
        .click(elT('inviteButton'))
        .wait(elT('addButton'))
        .insert(elT('searchUser'), username)
        .click(elT('addButton'))
        .wait(el => document.querySelectorAll(el).length > 0, elT('member'))
        .wait(elT('deleteMember'))
        .click(elT('deleteMember'))
        .wait(el => document.querySelectorAll(el).length < 1, elT('member'))
        .evaluate(el => +document.querySelectorAll(el).length, elT('member'))
      should(count).equal(0)

      const created = await n
        .insert(elT('searchUser'), username)
        .click(elT('addButton'))
        .wait(el => document.querySelectorAll(el).length > 0, elT('member'))
        .insert(elT('searchUser'), username + '2')
        .click(elT('addButton'))
        .wait(el => document.querySelectorAll(el).length > 1, elT('member'))
        .click(elT('submit'))
        .wait(el => !!document.querySelector(el), elT('notifyInvitedSuccess'))
        .evaluate(el => !!document.querySelector(el), elT('notifyInvitedSuccess'))
      should(created).equal(true)
    })

    it('Should Receive Message and Invite', async function () {
      this.timeout(10000)
      await n
        // .goto(page('mailbox'))
        // TODO: navigation gets redirected on login guard but nav click doesn't?
        // we might have logged in state problems
        // Tracking here:
        // https://github.com/okTurtles/group-income-simple/issues/440
        .wait(elT('mailboxLink'))
        .click(elT('mailboxLink'))
        .wait(elT('inbox'))
        .click(elT('composeLink'))
        .wait(elT('addRecipient'))
        .insert(elT('addRecipient'), username)
        .insert(elT('composedMessage'), 'Best test ever!!')
        .click(elT('sendButton'))
        .wait(elT('inbox'))
        .use(logout())
        .use(login(username))
        .wait(elT('mailboxLink'))
        .click(elT('mailboxLink'))

      const alert = await n.exists(elT('alertNotification'))

      should(alert).equal(true)

      const unread = await n.evaluate(
        el => document.querySelector(el) && +document.querySelector(el).innerText,
        elT('inboxUnread')
      )
      should(unread).equal(2)
      const hasInvite = await n.exists(elT('inviteMessage'))
      should(hasInvite).equal(true)
      const hasMessage = await n.exists(elT('inboxMessage'))
      should(hasMessage).equal(true)
      const accept = await n
        .click(elT('inviteMessage'))
        .wait(elT('acceptLink'))
        .exists(elT('acceptLink'))
      should(accept).equal(true)
    })

    it('Should Accept Invite', async function () {
      this.timeout(30000)
      // Accept invitation
      let success = await n.click(elT('acceptLink'))
        .wait(elT('inbox'))
        .exists(elT('inbox'))
      should(success).equal(true)
      // Logout
      success = await n
        .use(logout())
        .use(login(username + '2'))
        .wait(elT('mailboxLink'))
        // Accept invitation
        .click(elT('mailboxLink'))
        .wait(elT('inviteMessage'))
        .click(elT('inviteMessage'))
        .wait(elT('acceptLink'))
        .click(elT('acceptLink'))
        .wait(elT('inbox'))
        .exists(elT('inbox'))
      should(success).equal(true)
    })

    it('Should Vote on Additional Members', async function () {
      this.timeout(10000)
      await n
        .use(logout())
        .use(login(username + '5'))
        .goto(page('invite'))
        .wait(elT('searchUser'))
        .insert(elT('searchUser'), username + '3')
        .click(elT('addButton'))
        .wait(el => document.querySelectorAll(el).length > 0, elT('member'))
        .click(elT('submit'))
        .wait(elT('notifyInvitedSuccess'))
      // Check vote banner on dashboard
      await n
        .use(logout())
        .use(login(username))
        .goto(page('dashboard'))
        .wait(elT('proposal'))
      let proposalText = await n
        .wait(elT('voteText'))
        .evaluate(
          (el) => document.querySelector(el) && document.querySelector(el).innerText,
          elT('voteText')
        )
      // TODO: make usernames more explicit
      should(proposalText).containEql(username + '5')
      should(proposalText).containEql(username + '3')
      // cast votes on dashboard
      await n
        .goto(page('dashboard'))
        .wait(elT('forButton'))
        .click(elT('forButton'))
        .use(note('first vote clicked'))
        .wait(elT('proposalsAlreadyVoted'))
      let proposals = await n
        .use(logout())
        .use(login(username + '2'))
        .goto(page('dashboard'))
        .wait(elT('proposal'))
        .evaluate(
          (el) => document.querySelectorAll(el) && document.querySelectorAll(el).length,
          elT('proposal')
        )
      should(proposals).equal(1, 'no. of proposal msgs on dashboard')
      await n
        .wait(elT('forButton'))
        .click(elT('forButton'))
        .use(note('second vote clicked'))
        .wait(
          (el) => !document.querySelector(el),
          elT('proposal')
        )
      // Accept invitation
      let invite = await n
        .use(logout())
        .use(login(username + '3'))
        .wait(elT('mailboxLink'))
        .click(elT('mailboxLink'))
        .use(note('in mailbox'))
        .wait(elT('inviteMessage'))
        .exists(elT('inviteMessage'))
      should(invite).equal(true, 'invite message exists')

      let success = await n
        .click(elT('inviteMessage'))
        .wait(elT('acceptLink'))
        .use(note('in invite message'))
        .click(elT('acceptLink'))
        .wait(elT('inbox'))
        .exists(elT('inbox'))
      should(success).equal(true, 'redirect to inbox after invite accept')
    })

    it('Should See Member List on Dashboard', async function () {
      this.timeout(4000)

      await n
        .use(logout())
        .use(login(username + '5'))
        .goto(page('dashboard'))
        .wait(elT('groupMembers'))

      const memberCount = await n
        .wait(elT('member'))
        .evaluate(
          (el) => +document.querySelectorAll(el).length,
          elT('member')
        )
      should(memberCount).equal(4)

      const memberNames = await n
        .wait(elT('username'))
        .evaluate(
          (el) => Array.prototype.map.call(document.querySelectorAll(el), (item) => item.innerText),
          elT('username')
        )
      should(memberNames[0]).equal(username + '5')
      should(memberNames[1]).equal(username)
      should(memberNames[2]).equal(username + '2')
    })
  })

  describe('Test Local Group Related Functions', function () {
    it('Test Group Profile Attributes Change', async function () {
      this.timeout(4000)

      await n
        .use(logout())
        .use(login(username))
        .click(elT('profileLink'))
        .wait(elT('profilePicture'))
        .wait(elT('GroupProfileContributionAmount'))
        .insert(elT('GroupProfileContributionAmount'), 100)
        .wait(elT('GroupProfileReceivingAmount'))
        .insert(elT('GroupProfileReceivingAmount'), 50)
        .click(elT('GroupProfileSubmitBtn'))
        .wait(elT('GroupProfileSaved'))
        .exists(elT('GroupProfileSaved'))
    })
  })

  describe.skip('Test Localization Gathering Function', function () {
    it('Verify output of transform functions', function () {
      const script = `
        <template>
            <i18n comment = "Amazing Test">A test of sorts</i18n>
            <i18n comment="Amazing Test2">A test of wit</i18n>
            <i18n>A test of strength</i18n>
        </template>
        <script>
            L('this is some translatable Text','this is relevant commentary')
            L('this text lacks a comment')
        </script>

         `
      const path = 'script.vue'
      fs.writeFileSync(path, script)
      const output = 'translation.json'
      const args = ['scripts/i18n.js', path, output]
      exec('node', args)
      const json = fs.readFileSync(output, 'utf8')
      const localeObject = JSON.parse(json)
      should(localeObject).have.property('A test of sorts')
      should(localeObject).have.property('A test of wit')
      should(localeObject).have.property('A test of strength')
      should(localeObject).have.property('this is some translatable Text')
      should(localeObject).have.property('this text lacks a comment')
      should(localeObject['A test of sorts']).have.property('comment', 'Amazing Test')
      should(localeObject['A test of wit']).have.property('comment', 'Amazing Test2')
      should(localeObject['this is some translatable Text']).have.property('comment', 'this is relevant commentary')
      should(localeObject['this is some translatable Text']).have.property('text', 'this is some translatable Text')
      should(localeObject['this text lacks a comment']).have.property('text', 'this text lacks a comment')
      should(localeObject['A test of sorts']).have.property('text', 'A test of sorts')
      should(localeObject['A test of wit']).have.property('text', 'A test of wit')
      should(localeObject['A test of strength']).have.property('text', 'A test of strength')
      fs.unlinkSync(path)
      fs.unlinkSync(output)
    })
  })
})
