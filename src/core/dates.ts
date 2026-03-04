import type { PaymentFrequency } from '../types';

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInUTCMonth(year: number, month: number): number {
  if (month === 1) return isLeapYear(year) ? 29 : 28; // February (0-based month 1)
  return DAYS_IN_MONTH[month];
}

export function parseDate(s: string): Date {
  const [year, month, day] = s.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

export function formatDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function daysBetween(start: Date, end: Date): number {
  return Math.abs((end.getTime() - start.getTime()) / 86400000);
}

export function isMonthEnd(date: Date): boolean {
  return date.getUTCDate() === daysInUTCMonth(date.getUTCFullYear(), date.getUTCMonth());
}

// Uses 0-based month arithmetic internally.
export function addMonths(date: Date, months: number, preferredDay?: number): Date {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth(); // 0-based
  const pDay = preferredDay ?? date.getUTCDate();

  const targetIdx = month + months;
  const newYear = year + Math.floor(targetIdx / 12);
  const newMonth = ((targetIdx % 12) + 12) % 12; // handles negative modulo

  const newDay = Math.min(pDay, daysInUTCMonth(newYear, newMonth));
  return new Date(Date.UTC(newYear, newMonth, newDay));
}

export function generatePaymentDates(
  firstPaymentDate: Date,
  totalPayments: number,
  frequency: PaymentFrequency,
): Date[] {
  if (totalPayments === 0) return [];
  if (totalPayments === 1) return [firstPaymentDate];

  if (frequency === 'weekly') {
    return Array.from(
      { length: totalPayments },
      (_, k) => new Date(firstPaymentDate.getTime() + k * 7 * 86400000),
    );
  }

  if (frequency === 'bi-weekly') {
    return Array.from(
      { length: totalPayments },
      (_, k) => new Date(firstPaymentDate.getTime() + k * 14 * 86400000),
    );
  }

  if (frequency === 'semi-monthly') {
    // Alternate +15 / +16 days from the first payment date.
    // Odd steps (k=1,3,...): +15 days; even steps (k=2,4,...): +16 days.
    const dates: Date[] = [firstPaymentDate];
    let current = firstPaymentDate;
    for (let k = 1; k < totalPayments; k++) {
      const stride = k % 2 === 1 ? 15 : 16;
      current = new Date(current.getTime() + stride * 86400000);
      dates.push(current);
    }
    return dates;
  }

  // Month-based (monthly or quarterly) — preserve month-end semantics
  const isFeb = firstPaymentDate.getUTCMonth() === 1; // February is month index 1
  const daysInFeb = isLeapYear(firstPaymentDate.getUTCFullYear()) ? 29 : 28;
  let preferredDay: number;

  if (isMonthEnd(firstPaymentDate)) {
    // Feb month-end: use exact Feb day count so it rolls forward correctly
    // Non-Feb month-end: use 31 so every future month-end is also a month-end
    preferredDay = isFeb ? daysInFeb : 31;
  } else {
    preferredDay = firstPaymentDate.getUTCDate();
  }

  const monthStep = frequency === 'quarterly' ? 3 : 1;
  return Array.from({ length: totalPayments }, (_, k) =>
    k === 0 ? firstPaymentDate : addMonths(firstPaymentDate, k * monthStep, preferredDay),
  );
}

export function countPayments(months: number, frequency: PaymentFrequency): number {
  switch (frequency) {
    case 'monthly':
      return months;
    case 'quarterly':
      return Math.round(months / 3);
    case 'semi-monthly':
      return months * 2;
    case 'bi-weekly':
      return Math.round((months * 26) / 12);
    case 'weekly':
      return Math.round((months * 52) / 12);
  }
}

// Reg Z Appendix J: number of unit-periods per year for each payment frequency.
export function periodsPerYear(frequency: PaymentFrequency): number {
  switch (frequency) {
    case 'monthly':
      return 12;
    case 'quarterly':
      return 4;
    case 'semi-monthly':
      return 24;
    case 'bi-weekly':
      return 26;
    case 'weekly':
      return 52;
  }
}


// Determine the preferredDay for backward month stepping from a payment date.
// For month-end dates, use 31 so addMonths always lands on the last day of each month.
// For non-month-end, use the payment date's day-of-month.
function backwardPreferredDay(date: Date): number {
  return isMonthEnd(date) ? 31 : date.getUTCDate();
}

// Count full unit-periods (each `stepMonths` months long) backwards from
// firstPaymentDate, then express the remaining gap as a fraction of a unit-period
// using Reg Z conventions (full months × 30 + odd days, divided by stepMonths × 30).
//
// Per Appendix J, boundaries are anchored on the payment date's day-of-month
// (not the loan date's), which matters when they differ.
//
// Returns { t, f } where t = full unit-periods, f = fractional remainder.
function monthBasedComponents(
  loanDate: Date,
  firstPaymentDate: Date,
  stepMonths: number,
): { t: number; f: number } {
  const pDay = backwardPreferredDay(firstPaymentDate);

  // Count full unit-periods (each stepMonths months) backwards from firstPaymentDate
  let t = 0;
  while (addMonths(firstPaymentDate, -stepMonths * (t + 1), pDay).getTime() >= loanDate.getTime()) {
    t++;
  }
  const boundary = t === 0 ? firstPaymentDate : addMonths(firstPaymentDate, -stepMonths * t, pDay);

  // Count remaining full months backwards from boundary
  const bDay = backwardPreferredDay(boundary);
  let remainingMonths = 0;
  while (addMonths(boundary, -(remainingMonths + 1), bDay).getTime() >= loanDate.getTime()) {
    remainingMonths++;
  }
  const innerBoundary =
    remainingMonths === 0 ? boundary : addMonths(boundary, -remainingMonths, bDay);
  const oddDays = daysBetween(loanDate, innerBoundary);

  const daysPerUnitPeriod = stepMonths * 30;
  return { t, f: (remainingMonths * 30 + oddDays) / daysPerUnitPeriod };
}

// Reg Z Appendix J §(b)(5)(iv): split the first period into { t, f } where
// t = full unit-periods and f = fractional remainder.
//
// For month-based frequencies: count backwards from firstPaymentDate.
// For day-based frequencies: total actual days / days-per-unit-period.
export function firstPeriodComponents(
  loanDate: Date,
  firstPaymentDate: Date,
  frequency: PaymentFrequency,
): { t: number; f: number } {
  const totalDays = daysBetween(loanDate, firstPaymentDate);

  if (frequency === 'weekly') {
    const t = Math.floor(totalDays / 7);
    return { t, f: (totalDays - t * 7) / 7 };
  }
  if (frequency === 'bi-weekly') {
    const t = Math.floor(totalDays / 14);
    return { t, f: (totalDays - t * 14) / 14 };
  }
  if (frequency === 'semi-monthly') {
    const t = Math.floor(totalDays / 15);
    return { t, f: (totalDays - t * 15) / 15 };
  }
  if (frequency === 'quarterly') return monthBasedComponents(loanDate, firstPaymentDate, 3);

  // Monthly
  return monthBasedComponents(loanDate, firstPaymentDate, 1);
}

// Convenience wrapper: returns t + f as a single number.
export function firstPeriodFactor(
  loanDate: Date,
  firstPaymentDate: Date,
  frequency: PaymentFrequency,
): number {
  const { t, f } = firstPeriodComponents(loanDate, firstPaymentDate, frequency);
  return t + f;
}
