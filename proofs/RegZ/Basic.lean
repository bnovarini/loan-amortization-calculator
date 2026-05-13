/-
RegZ/Basic.lean

Reg Z Appendix J pure-math reference model.

Mirrors src/core/calculator.ts:66-106 (buildPeriodInterest, computeNFV)
over `ℝ`. No I/O. No rounding. Floating-point gap addressed separately
by goldens; this file defines the canonical formula.
-/
import Mathlib.Analysis.SpecialFunctions.Pow.Real

namespace RegZ

open Real

/-- Per-period interest multiplier for the k-th payment period.

For `k = 0` (the irregular first period of length `t + f` unit-periods,
per Appendix J §(b)(5)(iv)):
    multiplier = (1 + i)^t * (1 + f * i) - 1
For `k ≥ 1` (a standard unit-period):
    multiplier = i

Mirror of `buildPeriodInterest` in actuarial mode
(src/core/calculator.ts:73-78). -/
noncomputable def periodMultiplier (i : ℝ) (t : ℕ) (f : ℝ) (k : ℕ) : ℝ :=
  if k = 0 then (1 + i) ^ t * (1 + f * i) - 1 else i

/-- Interest charged on `amount` during period `k`. -/
noncomputable def interest (i : ℝ) (t : ℕ) (f : ℝ) (amount : ℝ) (k : ℕ) : ℝ :=
  amount * periodMultiplier i t f k

/-- Recursive balance after `k` of `n` regular payments of size `P`
applied to a starting `face` amount at periodic rate `i` with
first-period split `(t, f)`.

Matches the loop in `computeNFV` (src/core/calculator.ts:96-104). -/
noncomputable def balanceAfter
    (face : ℝ) (P : ℝ) (i : ℝ) (t : ℕ) (f : ℝ) : ℕ → ℝ
  | 0 => face
  | k + 1 =>
      balanceAfter face P i t f k
        + interest i t f (balanceAfter face P i t f k) k - P

/-- Net Future Value: remaining balance after all `n` payments.

The first `n - 1` payments are regular; the final payment is
`P + balloon` (matching `computeNFV` line 103). Solving `nfv = 0`
for `P` yields the regular payment; solving for `i` yields the APR. -/
noncomputable def nfv
    (face P balloon : ℝ) (i : ℝ) (t : ℕ) (f : ℝ) (n : ℕ) : ℝ :=
  if n = 0 then face - balloon
  else
    balanceAfter face P i t f (n - 1)
      + interest i t f (balanceAfter face P i t f (n - 1)) (n - 1)
      - (P + balloon)

end RegZ
