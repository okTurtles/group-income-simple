import L from '@view-utils/translations.js'
import { timeSince } from '@utils/time.js'

// Notification templates based on issue #663
// TODO/REVIEW - list might be stale / incomplete.

// Hardcoded so the dummy layout makes sense
const dateNow = 1590823007327

// TODO - add/improve logic to needed keys:
// - avatar, name, linkTo, read
export const MEMBER_ADDED = ({ timestamp, data }) => {
  const name = data.username // getDisplayName()
  const avatar = ''
  return {
    avatar,
    icon: 'user-plus',
    level: 'info',
    body: L('The group has a new member. Say hi to {name}!', {
      name: `<strong>${name}</strong>`
    }),
    linkTo: '/group-chat/XXXX',
    date: timeSince(timestamp, dateNow),
    read: false
  }
}

export const MEMBER_REMOVED = ({ timestamp, data }) => {
  const name = data.username
  const avatar = ''
  return {
    avatar,
    icon: 'user-minus',
    level: 'danger',
    // REVIEW @mmbotelho - Not only contributions, but also proposals.
    body: L('{name} was kicked out of the group. Contributions were updated accordingly.', {
      name: `<strong>${name}</strong>`
    }),
    linkTo: '/contributions',
    date: timeSince(timestamp, dateNow),
    read: true
  }
}

export const MEMBER_LEFT = ({ timestamp, data }) => {
  const name = data.username
  const avatar = ''
  return {
    avatar,
    icon: 'icon-minus',
    level: 'info',
    body: L('{name} has left your group. Contributions were updated accordingly.', {
      name: `<strong>${name}</strong>`
    }),
    linkTo: '/contributions',
    date: timeSince(timestamp, dateNow),
    read: true
  }
}

export const INCOME_DETAILS_OLD = ({ timestamp }) => {
  const avatar = ''
  return {
    avatar,
    icon: 'coins',
    level: 'info',
    body: L("You haven't updated your income details in more than 6 months. Would you like to review them now?"),
    linkTo: '/contributions/TODO-LINK-MODAL',
    date: timeSince(timestamp, dateNow),
    read: true
  }
}

export const SEND_CONTRIBUTION = ({ timestamp, data }) => {
  const month = 'June'
  const avatar = ''
  return {
    avatar,
    icon: 'coins',
    level: 'info',
    // REVIEW @mmbotelho - ranem contribution to payments?
    body: L('Do not forget to send your {month} contributions.', {
      month: `<strong>${month}</strong>`
    }),
    linkTo: '/payments',
    date: timeSince(timestamp, dateNow),
    read: true
  }
}

export const PROPOSAL_NEW = ({ timestamp, data }) => {
  const avatar = ''
  const member = `<strong>${data.creator}</strong>`

  const bodyMap = {
    MINCOME: L('{member} proposed to change the group mincome. Vote now!', { member }), // @mmbotelho copy changed
    ADD_MEMBER: L('{member} proposed to add members to the group. Vote now!', { member }),
    REMOVE_MEMBER: L('{member} proposed to remove a member from the group. Vote now!', { member }),
    VOTING_RULE: L('{member} proposed to change the group voting system. Vote now!', { member })
  }

  const iconMap = {
    MINCOME: 'coins',
    ADD_MEMBER: 'user-plus',
    REMOVE_MEMBER: 'user-minus',
    VOTING_RULE: 'vote-yea'
  }

  return {
    avatar,
    icon: iconMap[data.type],
    level: 'info',
    body: bodyMap[data.type],
    linkTo: '/dashboard#TODO-proposals',
    date: timeSince(timestamp, dateNow),
    read: true
  }
}
