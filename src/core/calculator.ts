import type {
  APRInput,
  APROutput,
  FeeInput,
  InterestMethod,
  LoanInput,
  LoanOutput,
  PaymentFrequency,
  ResolvedFees,
  ScheduleRow,
  SolverMethod,
} from '../types';
import {
  countPayments,
  daysBetween,
  firstPeriodFactor,
  formatDate,
  generatePaymentDates,
  parseDate,
  periodsPerYear,
} from './dates';
import { brentSolve, cfpbSolve } from './solver';

function resolveFees(loanAmount: number, fees?: FeeInput[]): ResolvedFees {
  if (!fees?.length) {
    return {
      financedDollars: 0,
      ppfcDollars: 0,
      faceAmountDollars: loanAmount,
      amountFinancedDollars: loanAmount,
      hasFees: false,
    };
  }

  const financedDollars = fees
    .filter((f) => f.financed === true)
    .reduce((sum, f) => sum + f.amount, 0);

  const ppfcDollars = fees
    .filter((f) => f.isPrepaidFinanceCharge === true)
    .reduce((sum, f) => sum + f.amount, 0);

  const faceAmountDollars = loanAmount + financedDollars;
  const amountFinancedDollars = faceAmountDollars - ppfcDollars;

  return {
    financedDollars,
    ppfcDollars,
    faceAmountDollars,
    amountFinancedDollars,
    hasFees: true,
  };
}

// Returns a function that computes un-rounded interest for the k-th payment period.
//
// 'actuarial': interest = amount × (APR / periodsPerYear) × firstPeriodFactor (k=0 only).
// 'actual365': interest = amount × (APR / 365) × actual days since the previous date.
//
// The returned function works on any unit (dollars or cents) — apply Math.round()
// at the call site when integer cents are needed.
function buildPeriodInterest(
  method: InterestMethod,
  apr: number,
  frequency: PaymentFrequency,
  loanDate: Date,
  paymentDates: Date[],
): (amount: number, k: number) => number {
  if (method === 'actuarial') {
    const periodicRate = apr / periodsPerYear(frequency);
    const factor0 = firstPeriodFactor(loanDate, paymentDates[0], frequency);
    return (amount, k) => amount * periodicRate * (k === 0 ? factor0 : 1);
  }
  // actual365: prevDate = loanDate for k=0, paymentDates[k-1] for k>0
  const dailyRate = apr / 365;
  return (amount, k) =>
    amount * dailyRate * daysBetween(k === 0 ? loanDate : paymentDates[k - 1], paymentDates[k]);
}

// Returns the remaining balance after all payments — target is 0 when P is correct.
function computeNFV(
  P: number,
  faceAmountDollars: number,
  apr: number,
  loanDate: Date,
  paymentDates: Date[],
  balloonAmountDollars: number,
  frequency: PaymentFrequency,
  method: InterestMethod,
): number {
  const n = paymentDates.length;
  const interest = buildPeriodInterest(method, apr, frequency, loanDate, paymentDates);
  let balance = faceAmountDollars;

  for (let k = 0; k < n - 1; k++) {
    balance = balance + interest(balance, k) - P;
  }
  balance = balance + interest(balance, n - 1) - (P + balloonAmountDollars);

  return balance;
}

function solvePayment(
  faceAmountDollars: number,
  apr: number,
  loanDate: Date,
  paymentDates: Date[],
  balloonAmountDollars: number,
  frequency: PaymentFrequency,
  method: InterestMethod,
  solverMethod: SolverMethod = 'brent',
): number {
  const n = paymentDates.length;

  if (apr === 0) {
    return (faceAmountDollars - balloonAmountDollars) / n;
  }

  const f = (P: number) =>
    computeNFV(P, faceAmountDollars, apr, loanDate, paymentDates, balloonAmountDollars, frequency, method);

  if (solverMethod === 'cfpb') {
    const initialGuess = faceAmountDollars / n;
    return cfpbSolve(f, initialGuess, initialGuess * 0.001);
  }

  return brentSolve(f, 0.01, faceAmountDollars * 2);
}

interface ScheduleResult {
  rows: ScheduleRow[];
  finalPaymentCents: number;
}

function buildSchedule(
  faceAmountDollars: number,
  apr: number,
  loanDate: Date,
  paymentDates: Date[],
  regularPaymentCents: number,
  balloonAmountDollars: number,
  equalPayments: boolean,
  frequency: PaymentFrequency,
  method: InterestMethod,
): ScheduleResult {
  const n = paymentDates.length;
  const interest = buildPeriodInterest(method, apr, frequency, loanDate, paymentDates);
  let balanceCents = Math.round(faceAmountDollars * 100);
  const rows: ScheduleRow[] = [];

  for (let k = 0; k < n; k++) {
    const isLast = k === n - 1;
    const interestCents = Math.round(interest(balanceCents, k));

    let paymentCents: number;
    let principalCents: number;

    if (isLast && equalPayments) {
      // All payments equal — final payment is same as regular, absorb any rounding residual
      paymentCents = regularPaymentCents;
      principalCents = balanceCents; // absorb remaining balance exactly
      balanceCents = 0;
    } else if (isLast) {
      const balloonCents = Math.round(balloonAmountDollars * 100);
      if (balloonCents === 0) {
        // No balloon: final payment clears the exact remaining balance
        paymentCents = balanceCents + interestCents;
        principalCents = balanceCents;
      } else {
        // Balloon: final payment = regular payment + balloon.
        // The solver ensures balance before this period ≈ P + balloon - interest,
        // so payment - interest ≈ balance and it nets to zero.
        paymentCents = regularPaymentCents + balloonCents;
        principalCents = paymentCents - interestCents;
      }
      balanceCents = 0; // force exact zero (absorb any rounding residual)
    } else {
      paymentCents = regularPaymentCents;
      principalCents = paymentCents - interestCents;
      balanceCents -= principalCents;
    }

    rows.push({
      paymentNumber: k + 1,
      date: formatDate(paymentDates[k]),
      paymentAmountCents: paymentCents,
      interestCents,
      principalCents,
      balanceCents,
    });
  }

  return { rows, finalPaymentCents: rows[n - 1].paymentAmountCents };
}

// Mirror of computeNFV, solving for APR instead of payment.
// Uses the same Reg Z actuarial method (periodic rates), starting from
// amountFinancedDollars (not faceAmount) so that PPFC fees raise the disclosed APR.
//
// For fee-free loans: returns exactly the input APR (perfect consistency).
// For PPFC-fee loans: returns a higher APR (amountFinanced < faceAmount → higher cost).
//
// Bracket [0, 10]: at r=0, nfv = amountFinanced - totalPayments < 0;
// at r=10 (1000%), massive interest → nfv >> 0.
function solveAPR(
  amountFinancedDollars: number,
  loanDate: Date,
  paymentDates: Date[],
  regularPaymentCents: number,
  finalPaymentCents: number,
  frequency: PaymentFrequency,
  method: InterestMethod,
  solverMethod: SolverMethod = 'brent',
  aprHint = 0,
): number {
  if (amountFinancedDollars <= 0) return 0;

  const n = paymentDates.length;
  const regularPayment = regularPaymentCents / 100;
  const finalPayment = finalPaymentCents / 100;

  function nfv(r: number): number {
    const interest = buildPeriodInterest(method, r, frequency, loanDate, paymentDates);
    let balance = amountFinancedDollars;
    for (let k = 0; k < n - 1; k++) {
      balance = balance + interest(balance, k) - regularPayment;
    }
    balance = balance + interest(balance, n - 1) - finalPayment;
    return balance;
  }

  try {
    if (solverMethod === 'cfpb') {
      // CFPB § (b)(9): step = 0.1 percentage points = 0.001 in decimal
      const initialGuess = aprHint > 0 ? aprHint : 0.05;
      return cfpbSolve(nfv, initialGuess, 0.001);
    }
    return brentSolve(nfv, 0, 10, 1e-8);
  } catch {
    return 0;
  }
}

function computePaymentProtection(
  faceAmountCents: number,
  rows: ScheduleRow[],
  paymentProtectionRate: number,
): number {
  let total = 0;
  for (let k = 0; k < rows.length; k++) {
    const balanceBeforePayment = k === 0 ? faceAmountCents : rows[k - 1].balanceCents;
    const premium = Math.round(balanceBeforePayment * paymentProtectionRate * 0.001);
    total += premium;
  }
  return total;
}

export function calculateAPR(input: APRInput): APROutput {
  const {
    amount,
    months,
    loanDate: loanDateStr,
    firstPaymentDate: firstPaymentDateStr,
    paymentPerPeriodCents,
    finalPaymentCents,
    paymentFrequency = 'monthly',
    interestMethod = 'actuarial',
    solverMethod = 'brent',
    showAmortizationSchedule = false,
    fees,
  } = input;

  const loanDate = parseDate(loanDateStr);
  const firstPaymentDate = parseDate(firstPaymentDateStr);

  const resolvedFees = resolveFees(amount, fees);
  const { faceAmountDollars, amountFinancedDollars, hasFees } = resolvedFees;

  const n = countPayments(months, paymentFrequency);
  const paymentDates = generatePaymentDates(firstPaymentDate, n, paymentFrequency);

  const calculatedAPR = solveAPR(
    amountFinancedDollars,
    loanDate,
    paymentDates,
    paymentPerPeriodCents,
    finalPaymentCents,
    paymentFrequency,
    interestMethod,
    solverMethod,
  );

  const totalOfPaymentsCents = paymentPerPeriodCents * (n - 1) + finalPaymentCents;
  const amountFinancedCents = Math.round(amountFinancedDollars * 100);
  const financeChargeCents = totalOfPaymentsCents - amountFinancedCents;

  const output: APROutput = {
    paymentPerPeriodCents,
    numberOfPayments: n - 1,
    finalPaymentCents,
    financeChargeCents,
    totalOfPaymentsCents,
    calculatedAPR,
  };

  if (hasFees) {
    output.faceAmountCents = Math.round(faceAmountDollars * 100);
    output.amountFinancedCents = amountFinancedCents;
  }

  if (showAmortizationSchedule) {
    const { rows } = buildSchedule(
      faceAmountDollars,
      calculatedAPR,
      loanDate,
      paymentDates,
      paymentPerPeriodCents,
      0,
      false,
      paymentFrequency,
      interestMethod,
    );
    output.fullAmortizationSchedule = rows;
  }

  return output;
}

export function calculateLoan(input: LoanInput): LoanOutput {
  const {
    amount,
    months,
    apr,
    loanDate: loanDateStr,
    firstPaymentDate: firstPaymentDateStr,
    paymentFrequency = 'monthly',
    interestMethod = 'actuarial',
    solverMethod = 'brent',
    balloonAmount = 0,
    paymentProtectionRate = 0,
    showAmortizationSchedule = false,
    equalPayments = false,
    fees,
  } = input;

  if (equalPayments && balloonAmount > 0) {
    throw new Error('equalPayments and balloonAmount cannot be combined');
  }

  const loanDate = parseDate(loanDateStr);
  const firstPaymentDate = parseDate(firstPaymentDateStr);

  const resolvedFees = resolveFees(amount, fees);
  const { faceAmountDollars, amountFinancedDollars, hasFees } = resolvedFees;

  const n = countPayments(months, paymentFrequency);
  const paymentDates = generatePaymentDates(firstPaymentDate, n, paymentFrequency);

  const rawPayment = solvePayment(
    faceAmountDollars,
    apr,
    loanDate,
    paymentDates,
    balloonAmount,
    paymentFrequency,
    interestMethod,
    solverMethod,
  );
  const regularPaymentCents = Math.round(rawPayment * 100);

  const { rows, finalPaymentCents } = buildSchedule(
    faceAmountDollars,
    apr,
    loanDate,
    paymentDates,
    regularPaymentCents,
    balloonAmount,
    equalPayments,
    paymentFrequency,
    interestMethod,
  );

  const totalOfPaymentsCents = regularPaymentCents * (n - 1) + finalPaymentCents;
  const amountFinancedCents = Math.round(amountFinancedDollars * 100);
  const financeChargeCents = totalOfPaymentsCents - amountFinancedCents;

  const calculatedAPR = solveAPR(
    amountFinancedDollars,
    loanDate,
    paymentDates,
    regularPaymentCents,
    finalPaymentCents,
    paymentFrequency,
    interestMethod,
    solverMethod,
    apr,
  );

  const output: LoanOutput = {
    paymentPerPeriodCents: regularPaymentCents,
    numberOfPayments: n - 1,
    finalPaymentCents,
    financeChargeCents,
    totalOfPaymentsCents,
    calculatedAPR,
  };

  if (hasFees) {
    output.faceAmountCents = Math.round(faceAmountDollars * 100);
    output.amountFinancedCents = amountFinancedCents;
  }

  if (paymentProtectionRate > 0) {
    const faceAmountCents = Math.round(faceAmountDollars * 100);
    output.totalPaymentProtectionCents = computePaymentProtection(
      faceAmountCents,
      rows,
      paymentProtectionRate,
    );
  }

  if (showAmortizationSchedule) {
    output.fullAmortizationSchedule = rows;
  }

  return output;
}
