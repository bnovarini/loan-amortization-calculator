export type PaymentFrequency = 'weekly' | 'bi-weekly' | 'semi-monthly' | 'monthly' | 'quarterly';

/**
 * Interest calculation method.
 *
 * - `'actuarial'` (default): Reg Z Appendix J actuarial method.
 *   Interest per period = balance × (APR / periodsPerYear).
 *   All periods of the same frequency are treated as equal; the first period
 *   is expressed as a fraction of a unit-period when the gap from the loan
 *   date to the first payment is not exactly one unit-period.
 *
 * - `'actual365'`: Simple-interest / actual-day method.
 *   Interest per period = balance × (APR / 365) × actual calendar days.
 *   Months are NOT treated as equal; every period is measured in real days.
 */
export type InterestMethod = 'actuarial' | 'actual365';

/**
 * Root-finding method used for solving payment and APR.
 *
 * - `'brent'` (default): Brent's method — fast, reliable bracketed root-finder.
 * - `'cfpb'`: CFPB Appendix J iterative interpolation method (§ (b)(9)).
 */
export type SolverMethod = 'brent' | 'cfpb';

export interface FeeInput {
  amount: number;
  name: string;
  financed?: boolean;
  isPrepaidFinanceCharge?: boolean;
}

export interface LoanInput {
  amount: number;
  months: number;
  apr: number;
  loanDate: string;
  firstPaymentDate: string;
  paymentFrequency?: PaymentFrequency;
  interestMethod?: InterestMethod;
  solverMethod?: SolverMethod;
  balloonAmount?: number;
  paymentProtectionRate?: number;
  showAmortizationSchedule?: boolean;
  equalPayments?: boolean;
  fees?: FeeInput[];
}

export interface ScheduleRow {
  paymentNumber: number;
  date: string;
  paymentAmountCents: number;
  interestCents: number;
  principalCents: number;
  balanceCents: number;
}

export interface LoanOutput {
  paymentPerPeriodCents: number;
  numberOfPayments: number;
  finalPaymentCents: number;
  financeChargeCents: number;
  totalOfPaymentsCents: number;
  calculatedAPR: number;
  faceAmountCents?: number;
  amountFinancedCents?: number;
  totalPaymentProtectionCents?: number;
  fullAmortizationSchedule?: ScheduleRow[];
}

export interface APRInput {
  amount: number;
  months: number;
  loanDate: string;
  firstPaymentDate: string;
  paymentPerPeriodCents: number;
  finalPaymentCents: number;
  paymentFrequency?: PaymentFrequency;
  interestMethod?: InterestMethod;
  solverMethod?: SolverMethod;
  fees?: FeeInput[];
  showAmortizationSchedule?: boolean;
}

export interface APROutput {
  paymentPerPeriodCents: number;
  numberOfPayments: number;
  finalPaymentCents: number;
  financeChargeCents: number;
  totalOfPaymentsCents: number;
  calculatedAPR: number;
  faceAmountCents?: number;
  amountFinancedCents?: number;
  fullAmortizationSchedule?: ScheduleRow[];
}

export interface ResolvedFees {
  financedDollars: number;
  ppfcDollars: number;
  faceAmountDollars: number;
  amountFinancedDollars: number;
  hasFees: boolean;
}
