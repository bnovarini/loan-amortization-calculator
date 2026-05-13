/-
RegZ/Actuarial.lean

Theorems about the actuarial period multiplier.

Reference: Reg Z, 12 CFR Pt. 1026, Appendix J §(b)(5).
-/
import RegZ.Basic

namespace RegZ

open Real

/-- For a standard (non-irregular) first period (`t = 1`, `f = 0`),
the actuarial first-period multiplier collapses to the simple
periodic rate `i`. This is the sanity check at calculator.ts:77
("For standard periods (t=1, f=0) this simplifies to amount × i"). -/
theorem actuarial_standard_period (i : ℝ) :
    periodMultiplier i 1 0 0 = i := by
  simp [periodMultiplier]

/-- For any later period (`k ≥ 1`), the multiplier is exactly `i`,
regardless of the first-period split. -/
theorem periodMultiplier_regular (i : ℝ) (t : ℕ) (f : ℝ) (k : ℕ) (hk : k ≠ 0) :
    periodMultiplier i t f k = i := by
  simp [periodMultiplier, hk]

/-- Interest on a standard period is `amount * i`. -/
theorem interest_standard_period (i amount : ℝ) (t : ℕ) (f : ℝ) (k : ℕ) (hk : k ≠ 0) :
    interest i t f amount k = amount * i := by
  simp [interest, periodMultiplier_regular i t f k hk]

end RegZ
