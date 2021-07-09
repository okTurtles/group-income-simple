
// TODO: the time.js file SEEMS like a good place to put the following two
// functions, however, this needs to be discussed with the team.
export function addMonths (startDate: Date, months: number): Date {
    startDate = new Date(startDate)
    const thisMonth = startDate.getMonth()
    startDate.setMonth(thisMonth + months)
    if (startDate.getMonth() !== thisMonth + months && startDate.getMonth() !== 0) {
      startDate.setDate(0)
    }
    return startDate
  }
  
  export function cycleAtDate (startOfCyclesDate: string | Date, atDate: string | Date): any | {|cycleNowDate: Date, cycleStartDate: Date, cycleNow: number, cycleStart: number, cycleEnd: number|} {
    const cycleNowDate = new Date(atDate)
  
    const cycleStartDateInitial = new Date(startOfCyclesDate)
    const cycleEndDateInitial = addMonths(cycleStartDateInitial, 1)
  
    let cycleStartDate = new Date(cycleStartDateInitial)
    let cycleEndDate = new Date(cycleEndDateInitial)
  
    let monthIteration = 0
    while (cycleEndDate - cycleNowDate <= 0) {
      monthIteration++
      cycleStartDate = addMonths(cycleStartDateInitial, monthIteration)
      cycleEndDate = addMonths(cycleStartDateInitial, monthIteration + 1)
    }
  
    const cycleNow = (cycleNowDate - cycleStartDate) / (cycleEndDate - cycleStartDate) + monthIteration
    const cycleStart = Math.floor(cycleNow)
    const cycleEnd = cycleStart + 1
  
    return { cycleNowDate, cycleStartDate, cycleEndDate, cycleNow, cycleStart, cycleEnd }
  }
  