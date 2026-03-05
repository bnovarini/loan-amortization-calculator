# Loan Amortization Calculator

A TypeScript loan payment calculator that computes amortization schedules, payment amounts, finance charges, and APR. Implements the **CFPB Regulation Z actuarial method** (Appendix J) out of the box.

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [How It Works](#how-it-works)
- [Interest Methods](#interest-methods)
- [Solver Methods](#solver-methods)
- [SDK Reference](#sdk-reference)
- [Key Design Decisions](#key-design-decisions)

---

## Installation

```bash
npm install loan-amortization-calculator
```

No runtime dependencies.

---

## Quick Start

```typescript
import { calculateLoan } from 'loan-amortization-calculator';

const result = calculateLoan({
  amount: 10000,
  months: 60,
  apr: 0.0699,
  loanDate: '2025-01-15',
  firstPaymentDate: '2025-02-15',
});

console.log(result.paymentPerPeriodCents); // e.g. 19800 = $198.00
console.log(result.calculatedAPR);         // ≈ 0.0699
```

---

## How It Works

### Core calculation flow

```
Input
 │
 ├─ Resolve fees → faceAmount, amountFinanced
 │
 ├─ Generate payment dates (respects month-end semantics)
 │
 ├─ Solve for regular payment P (Brent's or CFPB iterative method)
 │   └─ computeNFV(P) = 0 when P is correct
 │
 ├─ Build amortization schedule
 │   └─ Interest + Principal per row, final payment absorbs rounding
 │
 └─ Back-calculate APR from amountFinanced + schedule
```

### Payment solving

The regular payment is solved numerically using [Brent's method](https://en.wikipedia.org/wiki/Brent%27s_method), a fast root-finding algorithm that combines bisection, secant, and inverse quadratic interpolation. This handles all cases — balloon payments, irregular first periods, various frequencies — without requiring a closed-form formula.

The solver finds the payment `P` such that the **net future value** (starting from the loan amount, applying interest each period, subtracting each payment) equals exactly zero after the final payment.

### APR back-calculation

The disclosed APR is back-calculated from `amountFinanced` (not the face amount) using the same interest method as the payment calculation. This ensures:

- **Fee-free loans**: back-calculated APR equals the input APR exactly
- **PPFC fees**: back-calculated APR is higher than input APR because `amountFinanced < faceAmount`

### Rounding

All amounts are stored and computed internally in **cents** (integer arithmetic). Interest is computed in fractional cents and rounded at each period boundary. The final payment absorbs any accumulated rounding residual, guaranteeing a zero ending balance.

---

## Interest Methods

The `interestMethod` field controls how interest accrues each period.

### `"actuarial"` (default) — per Reg Z implementation

Implements the **actuarial method** as defined in **CFPB Regulation Z, Appendix J (12 CFR Part 1026)**.

```
Interest per period = balance × (APR / periodsPerYear)
```


| Frequency    | Periods per year | Rate per period |
| ------------ | ---------------- | --------------- |
| Quarterly    | 4                | APR / 4         |
| Monthly      | 12               | APR / 12        |
| Semi-monthly | 24               | APR / 24        |
| Bi-weekly    | 26               | APR / 26        |
| Weekly       | 52               | APR / 52        |


Key properties:

- **All periods are equal** — a February with 28 days accrues the same interest as a March with 31 days. This directly satisfies Reg Z's requirement that *"all months shall be considered equal."*
- **First period compound scaling** — when the gap from loan date to first payment date is not exactly one unit-period, the first period is split into `t` full unit-periods and a fractional remainder `f`. Interest is computed using the Appendix J compound formula: `balance × [(1+i)^t × (1+f×i) − 1]`, where `i = APR / periodsPerYear`. Full calendar months are counted backwards from the payment date; any remaining days are expressed as `days / 30` (Appendix J §(b)(5)(iv)).

### `"actual365"`

Simple-interest method using actual calendar days:

```
Interest per period = balance × (APR / 365) × actual days in the period
```

Months are **not** treated as equal — a 31-day period accrues more interest than a 28-day period. Commonly used for commercial loans and some adjustable-rate products.

### First period and odd days

When a loan originates mid-month or the first payment falls more than one unit-period away, the first period is longer or shorter than a standard period.

**Example** — loan date `2026-02-02`, first payment `2026-04-03`:


| Method      | First period calculation                       | Factor      |
| ----------- | ---------------------------------------------- | ----------- |
| `actuarial` | 2 full months (Feb 2 → Apr 2) + 1 odd day / 30 | **2.0333**  |
| `actual365` | 60 actual days                                 | **60** days |


For `actuarial`, the first period has `t = 2` full unit-periods and `f = 1/30 ≈ 0.0333`. Interest is `balance × [(1 + APR/12)² × (1 + 0.0333 × APR/12) − 1]` — the compound formula per Appendix J.

---

## Solver Methods

The `solverMethod` field controls which root-finding algorithm is used for payment solving and APR back-calculation. Both methods converge to the same result.

### `"brent"` (default)

[Brent's method](https://en.wikipedia.org/wiki/Brent%27s_method) — a bracketed root-finder that combines bisection, secant, and inverse quadratic interpolation. Fast and reliable for all loan structures.

### `"cfpb"`

The iterative interpolation procedure described in **CFPB Regulation Z, Appendix J § (b)(9)**:

1. Start with an estimated rate I₁.
2. Evaluate the general equation at I₁ to get A′.
3. Let I₂ = I₁ + 0.1 (percentage points). Evaluate at I₂ to get A″.
4. Interpolate: `I = I₁ + 0.1 × [(A − A′) / (A″ − A′)]`
5. Set I₁ = I and repeat until convergence.

This is the reference method specified by the CFPB for APR disclosure. It is also used here for payment solving with an analogous step size.

---

## SDK Reference

### `calculateLoan(input: LoanInput): LoanOutput`

**Input fields:**


| Field                      | Type       | Required | Description                                                                                                                     |
| -------------------------- | ---------- | -------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `amount`                   | number     | ✓        | Principal loan amount in dollars                                                                                                |
| `months`                   | integer    | ✓        | Loan term in months                                                                                                             |
| `apr`                      | number     | ✓        | Annual percentage rate as a decimal (e.g., `0.06` = 6%)                                                                         |
| `loanDate`                 | string     | ✓        | Date finance charge begins accruing (`YYYY-MM-DD`)                                                                              |
| `firstPaymentDate`         | string     | ✓        | Date of first payment (`YYYY-MM-DD`)                                                                                            |
| `paymentFrequency`         | string     |          | `"monthly"` (default), `"quarterly"`, `"semi-monthly"`, `"bi-weekly"`, `"weekly"`                                               |
| `interestMethod`           | string     |          | `"actuarial"` (default) or `"actual365"`                                                                                        |
| `solverMethod`             | string     |          | `"brent"` (default) or `"cfpb"`. See [Solver Methods](#solver-methods).                                                         |
| `balloonAmount`            | number     |          | Final balloon payment in dollars. Cannot be combined with `equalPayments`.                                                      |
| `equalPayments`            | boolean    |          | Force all payments (including the last) to be equal.                                                                            |
| `roundUp`                  | boolean    |          | When `true` (default), the regular payment is rounded up (`Math.ceil`). When `false`, standard rounding (`Math.round`) is used. |
| `paymentProtectionRate`    | number     |          | Insurance premium rate in basis points (e.g., `0.5` = 0.05%). Applied to the outstanding balance each period.                   |
| `showAmortizationSchedule` | boolean    |          | Include the full payment-by-payment schedule in the output.                                                                     |
| `fees`                     | FeeInput[] |          | Array of additional fees (see below).                                                                                           |


**Fee object:**


| Field                    | Type    | Description                                                                                      |
| ------------------------ | ------- | ------------------------------------------------------------------------------------------------ |
| `amount`                 | number  | Fee amount in dollars                                                                            |
| `name`                   | string  | Fee label                                                                                        |
| `financed`               | boolean | If `true` (default), added to the face amount (rolled into the loan). Set to `false` to exclude. |
| `isPrepaidFinanceCharge` | boolean | If `true`, subtracted from `amountFinanced` for APR purposes. Defaults to `false`.               |


**Output fields:**


| Field                         | Type           | Description                                            |
| ----------------------------- | -------------- | ------------------------------------------------------ |
| `paymentPerPeriodCents`       | integer        | Regular payment amount in cents                        |
| `numberOfPayments`            | integer        | Count of regular payments (total − 1)                  |
| `finalPaymentCents`           | integer        | Last payment amount in cents                           |
| `financeChargeCents`          | integer        | Total interest + fees (totalPayments − amountFinanced) |
| `totalOfPaymentsCents`        | integer        | Sum of all payments in cents                           |
| `calculatedAPR`               | number         | Back-calculated APR as a decimal                       |
| `faceAmountCents`             | integer?       | Present when fees are provided                         |
| `amountFinancedCents`         | integer?       | Present when fees are provided                         |
| `totalPaymentProtectionCents` | integer?       | Present when `paymentProtectionRate > 0`               |
| `fullAmortizationSchedule`    | ScheduleRow[]? | Present when `showAmortizationSchedule: true`          |


**Schedule row:**


| Field                    | Type     | Description                                                                           |
| ------------------------ | -------- | ------------------------------------------------------------------------------------- |
| `paymentNumber`          | integer  | 1-based payment index                                                                 |
| `date`                   | string   | Payment date (`YYYY-MM-DD`)                                                           |
| `paymentAmountCents`     | integer  | Total payment                                                                         |
| `interestCents`          | integer  | Interest portion                                                                      |
| `principalCents`         | integer  | Principal portion                                                                     |
| `balanceCents`           | integer  | Remaining balance after payment                                                       |
| `paymentProtectionCents` | integer? | Payment protection premium for this period. Present when `paymentProtectionRate > 0`. |


### Examples

**Basic loan:**

```typescript
import { calculateLoan } from 'loan-amortization-calculator';

const result = calculateLoan({
  amount: 15000,
  months: 48,
  apr: 0.0599,
  loanDate: '2025-03-01',
  firstPaymentDate: '2025-04-01',
  paymentFrequency: 'monthly',
  interestMethod: 'actuarial',    // default, according to Reg Z implementation
  showAmortizationSchedule: true,
});

console.log(result.paymentPerPeriodCents); // e.g. 35199 = $351.99
console.log(result.calculatedAPR);         // ≈ 0.0599
```

**With fees:**

```typescript
const result = calculateLoan({
  amount: 10000,
  months: 36,
  apr: 0.08,
  loanDate: '2025-01-01',
  firstPaymentDate: '2025-02-01',
  fees: [
    // Rolled into the loan — raises the payment but not the APR
    { amount: 300, name: 'Origination', financed: true, isPrepaidFinanceCharge: false },
    // Rolled into the loan AND counts as a prepaid finance charge — raises both payment and APR
    { amount: 500, name: 'GAP Insurance', financed: true, isPrepaidFinanceCharge: true },
  ],
});

console.log(result.faceAmountCents);       // 1080000 = $10,800 (amount + financed fees)
console.log(result.amountFinancedCents);   // 1030000 = $10,300 (faceAmount - PPFC)
console.log(result.calculatedAPR);         // > 0.08 because amountFinanced < faceAmount
```

### `calculateAPR(input: APRInput): APROutput`

The inverse of `calculateLoan`: given known payment amounts, solves for the APR.

**Input fields:**


| Field                      | Type       | Required | Description                                                                                                   |
| -------------------------- | ---------- | -------- | ------------------------------------------------------------------------------------------------------------- |
| `amount`                   | number     | ✓        | Principal loan amount in dollars                                                                              |
| `months`                   | integer    | ✓        | Loan term in months                                                                                           |
| `loanDate`                 | string     | ✓        | Date finance charge begins accruing (`YYYY-MM-DD`)                                                            |
| `firstPaymentDate`         | string     | ✓        | Date of first payment (`YYYY-MM-DD`)                                                                          |
| `paymentPerPeriodCents`    | integer    | ✓        | Known regular payment amount in cents                                                                         |
| `finalPaymentCents`        | integer    | ✓        | Known final payment amount in cents                                                                           |
| `paymentFrequency`         | string     |          | `"monthly"` (default), `"quarterly"`, `"semi-monthly"`, `"bi-weekly"`, `"weekly"`                             |
| `interestMethod`           | string     |          | `"actuarial"` (default) or `"actual365"`                                                                      |
| `solverMethod`             | string     |          | `"brent"` (default) or `"cfpb"`. See [Solver Methods](#solver-methods).                                       |
| `paymentProtectionRate`    | number     |          | Insurance premium rate in basis points (e.g., `0.5` = 0.05%). Applied to the outstanding balance each period. |
| `showAmortizationSchedule` | boolean    |          | Include the full payment-by-payment schedule in the output.                                                   |
| `fees`                     | FeeInput[] |          | Array of additional fees (see fee object above).                                                              |


**Output fields:**


| Field                         | Type           | Description                                            |
| ----------------------------- | -------------- | ------------------------------------------------------ |
| `paymentPerPeriodCents`       | integer        | Regular payment amount in cents (echoed from input)    |
| `numberOfPayments`            | integer        | Count of regular payments (total − 1)                  |
| `finalPaymentCents`           | integer        | Last payment amount in cents (echoed from input)       |
| `financeChargeCents`          | integer        | Total interest + fees (totalPayments − amountFinanced) |
| `totalOfPaymentsCents`        | integer        | Sum of all payments in cents                           |
| `calculatedAPR`               | number         | Solved APR as a decimal                                |
| `faceAmountCents`             | integer?       | Present when fees are provided                         |
| `amountFinancedCents`         | integer?       | Present when fees are provided                         |
| `totalPaymentProtectionCents` | integer?       | Present when `paymentProtectionRate > 0`               |
| `fullAmortizationSchedule`    | ScheduleRow[]? | Present when `showAmortizationSchedule: true`          |


**Example:**

```typescript
import { calculateAPR } from 'loan-amortization-calculator';

const result = calculateAPR({
  amount: 10000,
  months: 12,
  loanDate: '2024-01-15',
  firstPaymentDate: '2024-02-15',
  paymentPerPeriodCents: 86066,
  finalPaymentCents: 86080,
});

console.log(result.calculatedAPR); // ≈ 0.06
```

---

## Key Design Decisions

### Why Brent's method as default?

Loan payments under `actual365` or with irregular first periods don't have a simple closed-form solution because period lengths vary. Brent's method reliably converges in under 100 iterations for any well-formed loan, regardless of structure. The solver is also reused for APR back-calculation, keeping the codebase consistent.

The CFPB iterative method (`solverMethod: "cfpb"`) is available as an alternative for users who need to match the exact procedure described in Appendix J § (b)(9). Both methods converge to the same result.

### Why is the final payment treated separately?

Payments 1 through n−1 are all equal (the solved regular payment). The final (nth) payment exists to absorb accumulated **cent-level rounding error** — interest is computed as floating-point and rounded to the nearest cent at every step, so tiny discrepancies build up over the life of the loan. Treating the last payment as a clean-up ensures the ending balance is always exactly zero.

The same pattern applies to `equalPayments` mode: all payments are forced equal and the last payment absorbs the residual against principal.

### How fees affect the APR

The regulation distinguishes two types of finance charges:


| Fee type          | `financed` | `isPrepaidFinanceCharge` | Effect                                                                                                        |
| ----------------- | ---------- | ------------------------ | ------------------------------------------------------------------------------------------------------------- |
| Financed non-PPFC | true       | false                    | Added to `faceAmount` and `amountFinanced`. Increases payment; APR unchanged.                                 |
| Financed PPFC     | true       | true                     | Added to `faceAmount`, subtracted from `amountFinanced`. Increases both payment and disclosed APR.            |
| Upfront PPFC      | false      | true                     | Not financed, but subtracted from `amountFinanced`. Increases disclosed APR.                                  |
| Upfront non-PPFC  | false      | false                    | Not financed, not a finance charge. No effect on any calculation (e.g., a documentation fee paid at closing). |


> **Defaults:** `financed` defaults to `true` (fees are rolled into the loan unless explicitly opted out). `isPrepaidFinanceCharge` defaults to `false`.

The disclosed APR is always back-calculated starting from `amountFinanced`, so any fee that reduces `amountFinanced` relative to `faceAmount` raises the effective cost of credit.

### Month-end date semantics

Generating payment dates for month-end originations requires care: a loan originating on January 31 should produce payments on the last day of every subsequent month (Feb 28/29, Mar 31, Apr 30, …), not on a fixed day-of-month.

This is handled by tracking a `preferredDay`:

- **Non-month-end**: use the literal day number (e.g., the 15th stays the 15th)
- **Month-end (non-February)**: use `preferredDay = 31` so `addMonths` always clamps to the last day of each month
- **Month-end in February**: use the actual day count of that February to preserve the leap-year boundary correctly

### `numberOfPayments` = n − 1

The API returns `numberOfPayments` as the count of **regular** payments, which is one less than the total. The final payment is always surfaced separately as `finalPaymentCents`. For a standard loan with no balloon and `equalPayments: false`, the final payment will differ slightly from the regular payment due to rounding absorption. For `equalPayments: true`, all payments including the last are equal, so `finalPaymentCents === paymentPerPeriodCents`.