'use strict'
import L from '~/frontend/views/utils/translations.js'

export const MINS_MILLIS = 60000
export const HOURS_MILLIS = 60 * MINS_MILLIS
export const DAYS_MILLIS = 24 * HOURS_MILLIS

export function addMonthsToDate (date: string, months: number): Date {
  const now = new Date(date)
  return new Date(now.setMonth(now.getMonth() + months))
}

export function dateToMonthstamp (date: string | Date): string {
  // we could use Intl.DateTimeFormat but that doesn't support .format() on Android
  // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/DateTimeFormat/format
  return new Date(date).toISOString().slice(0, 7)
}

// TODO: to prevent conflicts among user timezones, we need
//       to use the server's time, and not our time here.
//       https://github.com/okTurtles/group-income-simple/issues/531
export function currentMonthstamp (): string {
  return dateToMonthstamp(new Date())
}

export function ISOStringToMonthstamp (date: string): string {
  return dateToMonthstamp(new Date(date))
}

export function dateFromMonthstamp (monthstamp: string): Date {
  // this is a hack to prevent new Date('2020-01').getFullYear() => 2019
  return new Date(`${monthstamp}-01T00:01`)
}

export function prevMonthstamp (monthstamp: string): string {
  const date = dateFromMonthstamp(monthstamp)
  date.setMonth(date.getMonth() - 1)
  return dateToMonthstamp(date)
}

export function compareMonthstamps (monthstampA: string, monthstampB: string): number {
  const dateA = dateFromMonthstamp(monthstampA)
  const dateB = dateFromMonthstamp(monthstampB)
  const A = dateA.getMonth() + dateA.getFullYear() * 12
  const B = dateB.getMonth() + dateB.getFullYear() * 12
  return A - B
}

export function compareCycles (whenEnd: string, whenStart: string): number {
  return compareMonthstamps(dateToMonthstamp(whenEnd), dateToMonthstamp(whenStart))
}

export function compareISOTimestamps (a: string, b: string): number {
  const A = new Date(a).getTime()
  const B = new Date(b).getTime()
  return A - B
}

export function lastDayOfMonth (date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0)
}

export function firstDayOfMonth (date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

// TODO: Provide locale fallback in case navigator does not exist (e.g. server, Mocha, etc...)
const locale = (typeof navigator === 'undefined' && 'en-US') || (navigator.languages ? navigator.languages[0] : navigator.language)

export function humanDate (
  datems: number,
  opts: Intl$DateTimeFormatOptions = { month: 'short', day: 'numeric' }
): string {
  if (!datems) {
    console.error('humanDate:: 1st arg `datems` is required')
    return ''
  }
  return new Date(datems).toLocaleDateString(locale, opts)
}

export function proximityDate (date: Date): string {
  date = new Date(date)
  const today = new Date()
  const yesterday = (d => new Date(d.setDate(d.getDate() - 1)))(new Date())
  const lastWeek = (d => new Date(d.setDate(d.getDate() - 7)))(new Date())

  for (const toReset of [date, today, yesterday, lastWeek]) {
    toReset.setHours(0)
    toReset.setMinutes(0)
    toReset.setSeconds(0, 0)
  }

  const datems = Number(date)
  let pd = date > lastWeek ? humanDate(datems, { month: 'short', day: 'numeric', year: 'numeric' }) : humanDate(datems)
  if (date.getTime() === yesterday.getTime()) pd = L('Yesterday')
  if (date.getTime() === today.getTime()) pd = L('Today')

  return pd
}

export function getTime (date: Date): string {
  const t = new Date(date)
  return `${t.getHours()}:${t.getMinutes()}`
}

export function cycleAtDate (atDate: string | Date): number {
  const now = new Date(atDate) // Just in case the parameter is a string type.
  const partialCycles = now.getDate() / lastDayOfMonth(now).getDate()
  return partialCycles
}
