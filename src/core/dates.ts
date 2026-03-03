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

  // Monthly — preserve month-end semantics
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

  return Array.from({ length: totalPayments }, (_, k) =>
    k === 0 ? firstPaymentDate : addMonths(firstPaymentDate, k, preferredDay),
  );
}

export function countPayments(months: number, frequency: PaymentFrequency): number {
  switch (frequency) {
    case 'monthly':
      return months;
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
    case 'semi-monthly':
      return 24;
    case 'bi-weekly':
      return 26;
    case 'weekly':
      return 52;
  }
}

// Count full calendar months from start to end, respecting month-end capping.
// e.g. Jan 31 → Feb 28 (non-leap) = 1 full month (addMonths caps to Feb 28).
function fullMonthsBetween(start: Date, end: Date): number {
  const sy = start.getUTCFullYear(),
    sm = start.getUTCMonth();
  const ey = end.getUTCFullYear(),
    em = end.getUTCMonth();
  let months = (ey - sy) * 12 + (em - sm);
  // If addMonths(start, months) overshoots end, subtract one month.
  if (addMonths(start, months).getTime() > end.getTime()) months--;
  return Math.max(0, months);
}

// Reg Z Appendix J §(b)(5)(iv): express the first period in unit-periods.
//
// For monthly: count full calendar months from loanDate to firstPaymentDate,
// then add remaining odd days / 30 (Reg Z treats 1 month = 30 days for fractions).
// For day-based frequencies: total actual days / days-per-unit-period.
//
// A result of 1.0 means a standard-length first period; < 1.0 is a short first
// period; > 1.0 is a long first period.
export function firstPeriodFactor(
  loanDate: Date,
  firstPaymentDate: Date,
  frequency: PaymentFrequency,
): number {
  const totalDays = daysBetween(loanDate, firstPaymentDate);
  if (frequency === 'weekly') return totalDays / 7;
  if (frequency === 'bi-weekly') return totalDays / 14;
  if (frequency === 'semi-monthly') return totalDays / 15;

  // Monthly: full calendar months + odd days / 30
  const fullMonths = fullMonthsBetween(loanDate, firstPaymentDate);
  const anchor = addMonths(loanDate, fullMonths);
  const oddDays = daysBetween(anchor, firstPaymentDate);
  return fullMonths + oddDays / 30;
}
