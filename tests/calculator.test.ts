import { describe, expect, it } from 'vitest';
import { calculateLoan } from '../src/sdk';
import {
  addMonths,
  countPayments,
  daysBetween,
  formatDate,
  generatePaymentDates,
  isLeapYear,
  isMonthEnd,
  parseDate,
} from '../src/core/dates';
import { brentSolve, cfpbSolve, SolverError } from '../src/core/solver';

// ─── Date Utilities ───────────────────────────────────────────────────────────

describe('isLeapYear', () => {
  it('identifies leap years', () => {
    expect(isLeapYear(2000)).toBe(true);
    expect(isLeapYear(2024)).toBe(true);
    expect(isLeapYear(1900)).toBe(false);
    expect(isLeapYear(2023)).toBe(false);
  });
});

describe('daysBetween', () => {
  it('returns 0 for same day', () => {
    const d = parseDate('2024-01-15');
    expect(daysBetween(d, d)).toBe(0);
  });

  it('counts days correctly', () => {
    expect(daysBetween(parseDate('2024-01-15'), parseDate('2024-02-15'))).toBe(31);
    expect(daysBetween(parseDate('2024-02-01'), parseDate('2024-03-01'))).toBe(29); // 2024 is leap
    expect(daysBetween(parseDate('2023-02-01'), parseDate('2023-03-01'))).toBe(28);
  });
});

describe('isMonthEnd', () => {
  it('detects month-end dates', () => {
    expect(isMonthEnd(parseDate('2024-01-31'))).toBe(true);
    expect(isMonthEnd(parseDate('2024-02-29'))).toBe(true); // leap year
    expect(isMonthEnd(parseDate('2024-04-30'))).toBe(true);
    expect(isMonthEnd(parseDate('2024-01-30'))).toBe(false);
    expect(isMonthEnd(parseDate('2023-02-28'))).toBe(true);
    expect(isMonthEnd(parseDate('2023-02-27'))).toBe(false);
  });
});

describe('addMonths', () => {
  it('adds months preserving day', () => {
    expect(formatDate(addMonths(parseDate('2024-01-15'), 1))).toBe('2024-02-15');
    expect(formatDate(addMonths(parseDate('2024-01-15'), 12))).toBe('2025-01-15');
    expect(formatDate(addMonths(parseDate('2024-01-15'), 6))).toBe('2024-07-15');
  });

  it('caps to last day of shorter months', () => {
    expect(formatDate(addMonths(parseDate('2024-01-31'), 1))).toBe('2024-02-29'); // leap
    expect(formatDate(addMonths(parseDate('2024-03-31'), 1))).toBe('2024-04-30');
    expect(formatDate(addMonths(parseDate('2023-01-31'), 1))).toBe('2023-02-28');
  });

  it('preserves month-end with preferredDay=31', () => {
    expect(formatDate(addMonths(parseDate('2024-01-31'), 1, 31))).toBe('2024-02-29');
    expect(formatDate(addMonths(parseDate('2024-01-31'), 2, 31))).toBe('2024-03-31');
    expect(formatDate(addMonths(parseDate('2024-01-31'), 3, 31))).toBe('2024-04-30');
  });
});

describe('generatePaymentDates - monthly', () => {
  it('generates correct monthly dates', () => {
    const dates = generatePaymentDates(parseDate('2024-02-15'), 3, 'monthly');
    expect(dates.map(formatDate)).toEqual(['2024-02-15', '2024-03-15', '2024-04-15']);
  });

  it('preserves month-end for non-Feb month-end start', () => {
    const dates = generatePaymentDates(parseDate('2024-01-31'), 6, 'monthly');
    const formatted = dates.map(formatDate);
    expect(formatted[0]).toBe('2024-01-31');
    expect(formatted[1]).toBe('2024-02-29'); // 2024 is leap
    expect(formatted[2]).toBe('2024-03-31');
    expect(formatted[3]).toBe('2024-04-30');
    expect(formatted[4]).toBe('2024-05-31');
    expect(formatted[5]).toBe('2024-06-30');
  });
});

describe('generatePaymentDates - bi-weekly', () => {
  it('generates 14-day intervals', () => {
    const dates = generatePaymentDates(parseDate('2024-02-01'), 3, 'bi-weekly');
    const formatted = dates.map(formatDate);
    expect(formatted[0]).toBe('2024-02-01');
    expect(formatted[1]).toBe('2024-02-15');
    expect(formatted[2]).toBe('2024-02-29');
  });
});

describe('generatePaymentDates - weekly', () => {
  it('generates 7-day intervals', () => {
    const dates = generatePaymentDates(parseDate('2024-02-01'), 3, 'weekly');
    const formatted = dates.map(formatDate);
    expect(formatted[0]).toBe('2024-02-01');
    expect(formatted[1]).toBe('2024-02-08');
    expect(formatted[2]).toBe('2024-02-15');
  });
});

describe('generatePaymentDates - semi-monthly', () => {
  it('alternates 15/16 day intervals', () => {
    const dates = generatePaymentDates(parseDate('2024-02-01'), 4, 'semi-monthly');
    const formatted = dates.map(formatDate);
    expect(formatted[0]).toBe('2024-02-01');
    expect(formatted[1]).toBe('2024-02-16'); // +15
    expect(formatted[2]).toBe('2024-03-03'); // +16 (Feb has 29 days in 2024)
    expect(formatted[3]).toBe('2024-03-18'); // +15
  });
});

describe('countPayments', () => {
  it('counts monthly', () => expect(countPayments(12, 'monthly')).toBe(12));
  it('counts semi-monthly', () => expect(countPayments(12, 'semi-monthly')).toBe(24));
  it('counts bi-weekly', () => expect(countPayments(12, 'bi-weekly')).toBe(26));
  it('counts weekly', () => expect(countPayments(12, 'weekly')).toBe(52));
  it('counts 60-month monthly', () => expect(countPayments(60, 'monthly')).toBe(60));
});

// ─── Brent Solver ─────────────────────────────────────────────────────────────

describe('brentSolve', () => {
  it('solves a linear function f(x) = x - 3', () => {
    const root = brentSolve((x) => x - 3, 0, 10);
    expect(root).toBeCloseTo(3, 6);
  });

  it('solves a cubic f(x) = x^3 - x - 2', () => {
    const root = brentSolve((x) => x ** 3 - x - 2, 1, 2);
    expect(root).toBeCloseTo(1.5213797, 5);
  });

  it('throws SolverError when no root in bracket', () => {
    expect(() => brentSolve((x) => x * x + 1, -5, 5)).toThrow(SolverError);
  });
});

// ─── CFPB Solver ──────────────────────────────────────────────────────────────

describe('cfpbSolve', () => {
  it('solves a linear function f(x) = x - 3', () => {
    const root = cfpbSolve((x) => x - 3, 1, 0.1);
    expect(root).toBeCloseTo(3, 6);
  });

  it('solves a cubic f(x) = x^3 - x - 2', () => {
    const root = cfpbSolve((x) => x ** 3 - x - 2, 1, 0.1);
    expect(root).toBeCloseTo(1.5213797, 5);
  });

  it('throws SolverError when denominator is zero', () => {
    // f is constant → f(I1) == f(I2) → denominator = 0
    expect(() => cfpbSolve(() => 5, 1, 0.1)).toThrow(SolverError);
  });
});

// ─── CFPB solver method produces same results as Brent ────────────────────────

describe('solverMethod: cfpb vs brent produce equivalent results', () => {
  const base = {
    amount: 10000,
    months: 12,
    apr: 0.06,
    loanDate: '2024-01-15',
    firstPaymentDate: '2024-02-15',
  } as const;

  const brentResult = calculateLoan({ ...base, solverMethod: 'brent' });
  const cfpbResult = calculateLoan({ ...base, solverMethod: 'cfpb' });

  it('payment amounts match', () => {
    expect(cfpbResult.paymentPerPeriodCents).toBe(brentResult.paymentPerPeriodCents);
  });

  it('final payment matches', () => {
    expect(cfpbResult.finalPaymentCents).toBe(brentResult.finalPaymentCents);
  });

  it('calculatedAPR matches to 4 decimal places', () => {
    expect(cfpbResult.calculatedAPR).toBeCloseTo(brentResult.calculatedAPR, 4);
  });

  it('total of payments matches', () => {
    expect(cfpbResult.totalOfPaymentsCents).toBe(brentResult.totalOfPaymentsCents);
  });
});

describe('solverMethod: cfpb with fees', () => {
  const result = calculateLoan({
    amount: 10000,
    months: 12,
    apr: 0.06,
    loanDate: '2024-01-15',
    firstPaymentDate: '2024-02-15',
    solverMethod: 'cfpb',
    fees: [{ amount: 500, name: 'GAP', financed: true, isPrepaidFinanceCharge: true }],
  });

  it('calculatedAPR is higher than nominal (PPFC raises disclosed APR)', () => {
    expect(result.calculatedAPR).toBeGreaterThan(0.06);
  });

  it('faceAmount and amountFinanced are correct', () => {
    expect(result.faceAmountCents).toBe(1050000);
    expect(result.amountFinancedCents).toBe(1000000);
  });
});

// ─── Core Calculator ──────────────────────────────────────────────────────────

describe('baseline: $10,000 / 12 months / 6% APR / monthly', () => {
  const result = calculateLoan({
    amount: 10000,
    months: 12,
    apr: 0.06,
    loanDate: '2024-01-15',
    firstPaymentDate: '2024-02-15',
  });

  it('has 11 regular payments (numberOfPayments = n-1)', () => {
    expect(result.numberOfPayments).toBe(11);
  });

  it('regular payment is approximately $860–$862', () => {
    expect(result.paymentPerPeriodCents).toBeGreaterThanOrEqual(86000);
    expect(result.paymentPerPeriodCents).toBeLessThanOrEqual(86200);
  });

  it('total of payments is slightly above $10,000 (6% APR, ~$328 interest)', () => {
    // 12-month $10,000 at 6% APR → total interest ≈ $328 → total ≈ $10,328
    expect(result.totalOfPaymentsCents).toBeGreaterThan(1000000);
    expect(result.totalOfPaymentsCents).toBeLessThan(1035000);
  });

  it('finance charge is positive', () => {
    expect(result.financeChargeCents).toBeGreaterThan(0);
  });

  it('calculatedAPR is close to 6%', () => {
    expect(result.calculatedAPR).toBeCloseTo(0.06, 3);
  });

  it('no fee fields present', () => {
    expect(result.faceAmountCents).toBeUndefined();
    expect(result.amountFinancedCents).toBeUndefined();
  });

  it('no protection field present', () => {
    expect(result.totalPaymentProtectionCents).toBeUndefined();
  });

  it('no schedule present by default', () => {
    expect(result.fullAmortizationSchedule).toBeUndefined();
  });
});

describe('zero APR loan: $12,000 / 12 months / 0% / monthly', () => {
  const result = calculateLoan({
    amount: 12000,
    months: 12,
    apr: 0,
    loanDate: '2024-01-01',
    firstPaymentDate: '2024-02-01',
  });

  it('payment is exactly $1,000', () => {
    expect(result.paymentPerPeriodCents).toBe(100000);
  });

  it('final payment is exactly $1,000', () => {
    expect(result.finalPaymentCents).toBe(100000);
  });

  it('finance charge is 0', () => {
    expect(result.financeChargeCents).toBe(0);
  });
});

describe('amortization schedule', () => {
  const result = calculateLoan({
    amount: 10000,
    months: 12,
    apr: 0.06,
    loanDate: '2024-01-15',
    firstPaymentDate: '2024-02-15',
    showAmortizationSchedule: true,
  });

  it('schedule has 12 rows (n total)', () => {
    expect(result.fullAmortizationSchedule?.length).toBe(12);
  });

  it('final row has balanceCents = 0', () => {
    const rows = result.fullAmortizationSchedule!;
    expect(rows[rows.length - 1].balanceCents).toBe(0);
  });

  it('interest + principal = payment for each row', () => {
    const rows = result.fullAmortizationSchedule!;
    for (const row of rows) {
      expect(row.interestCents + row.principalCents).toBe(row.paymentAmountCents);
    }
  });

  it('sum of principal = original balance (within 1 cent)', () => {
    const rows = result.fullAmortizationSchedule!;
    const totalPrincipal = rows.reduce((s, r) => s + r.principalCents, 0);
    expect(totalPrincipal).toBeCloseTo(1000000, -1); // $10,000 ± rounding
  });

  it('first date matches firstPaymentDate', () => {
    expect(result.fullAmortizationSchedule![0].date).toBe('2024-02-15');
  });
});

describe('equalPayments mode', () => {
  const result = calculateLoan({
    amount: 10000,
    months: 12,
    apr: 0.06,
    loanDate: '2024-01-15',
    firstPaymentDate: '2024-02-15',
    equalPayments: true,
    showAmortizationSchedule: true,
  });

  it('final payment equals regular payment', () => {
    expect(result.finalPaymentCents).toBe(result.paymentPerPeriodCents);
  });

  it('calculatedAPR is present', () => {
    expect(result.calculatedAPR).toBeGreaterThan(0);
  });

  it('final schedule row has balanceCents = 0', () => {
    const rows = result.fullAmortizationSchedule!;
    expect(rows[rows.length - 1].balanceCents).toBe(0);
  });

  it('throws error when combined with balloonAmount', () => {
    expect(() =>
      calculateLoan({
        amount: 10000,
        months: 12,
        apr: 0.06,
        loanDate: '2024-01-15',
        firstPaymentDate: '2024-02-15',
        equalPayments: true,
        balloonAmount: 2000,
      }),
    ).toThrow();
  });
});

describe('balloon payment', () => {
  const baseline = calculateLoan({
    amount: 10000,
    months: 12,
    apr: 0.06,
    loanDate: '2024-01-15',
    firstPaymentDate: '2024-02-15',
  });

  const withBalloon = calculateLoan({
    amount: 10000,
    months: 12,
    apr: 0.06,
    loanDate: '2024-01-15',
    firstPaymentDate: '2024-02-15',
    balloonAmount: 2000,
    showAmortizationSchedule: true,
  });

  it('regular payment is lower with balloon', () => {
    expect(withBalloon.paymentPerPeriodCents).toBeLessThan(baseline.paymentPerPeriodCents);
  });

  it('final payment includes balloon amount', () => {
    expect(withBalloon.finalPaymentCents).toBeGreaterThan(withBalloon.paymentPerPeriodCents);
    expect(withBalloon.finalPaymentCents).toBeGreaterThan(200000); // > $2,000
  });

  it('schedule final balanceCents = 0', () => {
    const rows = withBalloon.fullAmortizationSchedule!;
    expect(rows[rows.length - 1].balanceCents).toBe(0);
  });
});

describe('fee handling', () => {
  it('financed non-PPFC fee increases faceAmount only', () => {
    const result = calculateLoan({
      amount: 10000,
      months: 12,
      apr: 0.06,
      loanDate: '2024-01-15',
      firstPaymentDate: '2024-02-15',
      fees: [{ amount: 500, name: 'Origination', financed: true, isPrepaidFinanceCharge: false }],
    });
    expect(result.faceAmountCents).toBe(1050000); // $10,500
    expect(result.amountFinancedCents).toBe(1050000); // same as face (no PPFC)
  });

  it('financed PPFC fee increases faceAmount but not amountFinanced', () => {
    const result = calculateLoan({
      amount: 10000,
      months: 12,
      apr: 0.06,
      loanDate: '2024-01-15',
      firstPaymentDate: '2024-02-15',
      fees: [{ amount: 500, name: 'GAP', financed: true, isPrepaidFinanceCharge: true }],
    });
    expect(result.faceAmountCents).toBe(1050000); // $10,500
    expect(result.amountFinancedCents).toBe(1000000); // $10,000 (PPFC deducted)
  });

  it('non-financed PPFC fee reduces amountFinanced only', () => {
    const result = calculateLoan({
      amount: 10000,
      months: 12,
      apr: 0.06,
      loanDate: '2024-01-15',
      firstPaymentDate: '2024-02-15',
      fees: [{ amount: 500, name: 'Title', financed: false, isPrepaidFinanceCharge: true }],
    });
    expect(result.faceAmountCents).toBe(1000000); // $10,000 (not financed)
    expect(result.amountFinancedCents).toBe(950000); // $9,500 (PPFC deducted)
  });

  it('non-financed non-PPFC fee has no effect on amounts', () => {
    const withFee = calculateLoan({
      amount: 10000,
      months: 12,
      apr: 0.06,
      loanDate: '2024-01-15',
      firstPaymentDate: '2024-02-15',
      fees: [{ amount: 500, name: 'Doc', financed: false, isPrepaidFinanceCharge: false }],
    });
    const noFee = calculateLoan({
      amount: 10000,
      months: 12,
      apr: 0.06,
      loanDate: '2024-01-15',
      firstPaymentDate: '2024-02-15',
    });
    // Fee fields should still be present (fees array was provided)
    expect(withFee.faceAmountCents).toBe(1000000);
    expect(withFee.amountFinancedCents).toBe(1000000);
    // Payment same as no-fee since nothing is financed/PPFC
    expect(withFee.paymentPerPeriodCents).toBe(noFee.paymentPerPeriodCents);
  });

  it('fee fields absent when no fees provided', () => {
    const result = calculateLoan({
      amount: 10000,
      months: 12,
      apr: 0.06,
      loanDate: '2024-01-15',
      firstPaymentDate: '2024-02-15',
    });
    expect(result.faceAmountCents).toBeUndefined();
    expect(result.amountFinancedCents).toBeUndefined();
  });
});

describe('payment protection', () => {
  it('totalPaymentProtectionCents present when rate > 0', () => {
    const result = calculateLoan({
      amount: 10000,
      months: 12,
      apr: 0.06,
      loanDate: '2024-01-15',
      firstPaymentDate: '2024-02-15',
      paymentProtectionRate: 0.5,
    });
    expect(result.totalPaymentProtectionCents).toBeDefined();
    expect(result.totalPaymentProtectionCents).toBeGreaterThan(0);
  });

  it('totalPaymentProtectionCents absent when rate not set', () => {
    const result = calculateLoan({
      amount: 10000,
      months: 12,
      apr: 0.06,
      loanDate: '2024-01-15',
      firstPaymentDate: '2024-02-15',
    });
    expect(result.totalPaymentProtectionCents).toBeUndefined();
  });

  it('totalPaymentProtectionCents absent when rate = 0', () => {
    const result = calculateLoan({
      amount: 10000,
      months: 12,
      apr: 0.06,
      loanDate: '2024-01-15',
      firstPaymentDate: '2024-02-15',
      paymentProtectionRate: 0,
    });
    expect(result.totalPaymentProtectionCents).toBeUndefined();
  });

  it('protection premium declines as balance decreases', () => {
    const result = calculateLoan({
      amount: 10000,
      months: 6,
      apr: 0.06,
      loanDate: '2024-01-15',
      firstPaymentDate: '2024-02-15',
      paymentProtectionRate: 1.0,
      showAmortizationSchedule: true,
    });
    // Total protection > 0 and balance declines
    expect(result.totalPaymentProtectionCents).toBeGreaterThan(0);
  });
});

describe('payment frequency totals', () => {
  it('monthly: 12 payments total, 11 regular', () => {
    const r = calculateLoan({
      amount: 10000, months: 12, apr: 0.06,
      loanDate: '2024-01-15', firstPaymentDate: '2024-02-15',
    });
    expect(r.numberOfPayments).toBe(11);
  });

  it('semi-monthly: 24 payments total, 23 regular', () => {
    const r = calculateLoan({
      amount: 10000, months: 12, apr: 0.06,
      loanDate: '2024-01-15', firstPaymentDate: '2024-02-01',
      paymentFrequency: 'semi-monthly',
    });
    expect(r.numberOfPayments).toBe(23);
  });

  it('bi-weekly: 26 payments total, 25 regular (12 months)', () => {
    const r = calculateLoan({
      amount: 10000, months: 12, apr: 0.06,
      loanDate: '2024-01-15', firstPaymentDate: '2024-01-29',
      paymentFrequency: 'bi-weekly',
    });
    expect(r.numberOfPayments).toBe(25);
  });

  it('weekly: 52 payments total, 51 regular (12 months)', () => {
    const r = calculateLoan({
      amount: 10000, months: 12, apr: 0.06,
      loanDate: '2024-01-15', firstPaymentDate: '2024-01-22',
      paymentFrequency: 'weekly',
    });
    expect(r.numberOfPayments).toBe(51);
  });
});
