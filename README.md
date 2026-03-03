# Loan Amortization Calculator

A TypeScript loan payment calculator that computes amortization schedules, payment amounts, finance charges, and APR. Implements the **CFPB Regulation Z actuarial method** (Appendix J) out of the box.

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [How It Works](#how-it-works)
- [Interest Methods](#interest-methods)
- [SDK Reference](#sdk-reference)
- [REST API Reference](#rest-api-reference)
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
 ├─ Solve for regular payment P (Brent's method)
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

### `"actuarial"` (default) — Reg Z compliant

Implements the **actuarial method** as defined in **CFPB Regulation Z, Appendix J (12 CFR Part 1026)**.

```
Interest per period = balance × (APR / periodsPerYear)
```

| Frequency    | Periods per year | Rate per period |
|-------------|-----------------|-----------------|
| Monthly      | 12              | APR / 12        |
| Semi-monthly | 24              | APR / 24        |
| Bi-weekly    | 26              | APR / 26        |
| Weekly       | 52              | APR / 52        |

Key compliance properties:

- **All periods are equal** — a February with 28 days accrues the same interest as a March with 31 days. This directly satisfies Reg Z's requirement that *"all months shall be considered equal."*
- **First period scaling** — when the gap from loan date to first payment date is not exactly one unit-period, the first period's interest is scaled proportionally. Full calendar months are counted first; any remaining days are expressed as `days / 30` (Reg Z's fractional period convention per Appendix J §(b)(5)(iv)).

### `"actual365"`

Simple-interest method using actual calendar days:

```
Interest per period = balance × (APR / 365) × actual days in the period
```

Months are **not** treated as equal — a 31-day period accrues more interest than a 28-day period. Commonly used for commercial loans and some adjustable-rate products.

### First period and odd days

When a loan originates mid-month or the first payment falls more than one unit-period away, the first period is longer or shorter than a standard period.

**Example** — loan date `2026-02-02`, first payment `2026-04-03`:

| Method | First period calculation | Factor |
|--------|--------------------------|--------|
| `actuarial` | 2 full months (Feb 2 → Apr 2) + 1 odd day / 30 | **2.0333** |
| `actual365` | 60 actual days | **60** days |

For `actuarial`, the interest on that first period is `balance × (APR/12) × 2.0333` — reflecting the extended gap before the first payment.

---

## SDK Reference

### `calculateLoan(input: LoanInput): LoanOutput`

**Input fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `amount` | number | ✓ | Principal loan amount in dollars |
| `months` | integer | ✓ | Loan term in months |
| `apr` | number | ✓ | Annual percentage rate as a decimal (e.g., `0.06` = 6%) |
| `loanDate` | string | ✓ | Date finance charge begins accruing (`YYYY-MM-DD`) |
| `firstPaymentDate` | string | ✓ | Date of first payment (`YYYY-MM-DD`) |
| `paymentFrequency` | string | | `"monthly"` (default), `"semi-monthly"`, `"bi-weekly"`, `"weekly"` |
| `interestMethod` | string | | `"actuarial"` (default) or `"actual365"` |
| `balloonAmount` | number | | Final balloon payment in dollars. Cannot be combined with `equalPayments`. |
| `equalPayments` | boolean | | Force all payments (including the last) to be equal. |
| `paymentProtectionRate` | number | | Insurance premium rate in basis points (e.g., `0.5` = 0.05%). Applied to the outstanding balance each period. |
| `showAmortizationSchedule` | boolean | | Include the full payment-by-payment schedule in the output. |
| `fees` | FeeInput[] | | Array of additional fees (see below). |

**Fee object:**

| Field | Type | Description |
|-------|------|-------------|
| `amount` | number | Fee amount in dollars |
| `name` | string | Fee label |
| `financed` | boolean | If `true`, added to the face amount (rolled into the loan) |
| `isPrepaidFinanceCharge` | boolean | If `true`, subtracted from `amountFinanced` for APR purposes |

**Output fields:**

| Field | Type | Description |
|-------|------|-------------|
| `paymentPerPeriodCents` | integer | Regular payment amount in cents |
| `numberOfPayments` | integer | Count of regular payments (total − 1) |
| `finalPaymentCents` | integer | Last payment amount in cents |
| `financeChargeCents` | integer | Total interest + fees (totalPayments − amountFinanced) |
| `totalOfPaymentsCents` | integer | Sum of all payments in cents |
| `calculatedAPR` | number | Back-calculated APR as a decimal |
| `faceAmountCents` | integer? | Present when fees are provided |
| `amountFinancedCents` | integer? | Present when fees are provided |
| `totalPaymentProtectionCents` | integer? | Present when `paymentProtectionRate > 0` |
| `fullAmortizationSchedule` | ScheduleRow[]? | Present when `showAmortizationSchedule: true` |

**Schedule row:**

| Field | Type | Description |
|-------|------|-------------|
| `paymentNumber` | integer | 1-based payment index |
| `date` | string | Payment date (`YYYY-MM-DD`) |
| `paymentAmountCents` | integer | Total payment |
| `interestCents` | integer | Interest portion |
| `principalCents` | integer | Principal portion |
| `balanceCents` | integer | Remaining balance after payment |

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
  interestMethod: 'actuarial',    // Reg Z compliant default
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

---

## REST API Reference

This repo also includes an Express server for HTTP access to the same calculation logic.

### Running locally

```bash
git clone https://github.com/your-org/loan-amortization-calculator.git
cd loan-amortization-calculator
npm install
npm run dev   # starts on port 3000
npm test
```

### `POST /api/calculate`

Request and response shapes match the SDK input/output above.

**Example:**

```bash
curl -X POST http://localhost:3000/api/calculate \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 10000,
    "months": 60,
    "apr": 0.0699,
    "loanDate": "2025-01-15",
    "firstPaymentDate": "2025-02-15"
  }'
```

**Error response (400):**

```json
{
  "error": "Validation failed",
  "details": { ... }
}
```

---

## Key Design Decisions

### Why Brent's method for payment solving?

Loan payments under `actual365` or with irregular first periods don't have a simple closed-form solution because period lengths vary. Brent's method reliably converges in under 100 iterations for any well-formed loan, regardless of structure. The solver is also reused for APR back-calculation, keeping the codebase consistent.

### Why is the final payment treated separately?

Payments 1 through n−1 are all equal (the solved regular payment). The final (nth) payment exists to absorb accumulated **cent-level rounding error** — interest is computed as floating-point and rounded to the nearest cent at every step, so tiny discrepancies build up over the life of the loan. Treating the last payment as a clean-up ensures the ending balance is always exactly zero.

The same pattern applies to `equalPayments` mode: all payments are forced equal and the last payment absorbs the residual against principal.

### How fees affect the APR

The regulation distinguishes two types of finance charges:

| Fee type | `financed` | `isPrepaidFinanceCharge` | Effect |
|----------|-----------|--------------------------|--------|
| Financed non-PPFC | true | false | Added to `faceAmount` and `amountFinanced`. Increases payment; APR unchanged. |
| Financed PPFC | true | true | Added to `faceAmount`, subtracted from `amountFinanced`. Increases both payment and disclosed APR. |
| Upfront PPFC | false | true | Not financed, but subtracted from `amountFinanced`. Increases disclosed APR. |
| Upfront non-PPFC | false | false | No effect on any calculation (e.g., a documentation fee paid at closing). |

The disclosed APR is always back-calculated starting from `amountFinanced`, so any fee that reduces `amountFinanced` relative to `faceAmount` raises the effective cost of credit.

### Month-end date semantics

Generating payment dates for month-end originations requires care: a loan originating on January 31 should produce payments on the last day of every subsequent month (Feb 28/29, Mar 31, Apr 30, …), not on a fixed day-of-month.

This is handled by tracking a `preferredDay`:

- **Non-month-end**: use the literal day number (e.g., the 15th stays the 15th)
- **Month-end (non-February)**: use `preferredDay = 31` so `addMonths` always clamps to the last day of each month
- **Month-end in February**: use the actual day count of that February to preserve the leap-year boundary correctly

### `numberOfPayments` = n − 1

The API returns `numberOfPayments` as the count of **regular** payments, which is one less than the total. The final payment is always surfaced separately as `finalPaymentCents`. For a standard loan with no balloon and `equalPayments: false`, the final payment will differ slightly from the regular payment due to rounding absorption. For `equalPayments: true`, all payments including the last are equal, so `finalPaymentCents === paymentPerPeriodCents`.
