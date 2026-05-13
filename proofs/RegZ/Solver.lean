/-
RegZ/Solver.lean

Theorems about NFV as a function of payment `P`:
  - balanceAfter affine recurrence
  - zero-APR balance closed form + root closed form (calculator.ts:120-122)
  - strict antitonicity in P (root uniqueness ⇒ solver well-posed)
-/
import RegZ.Basic
import RegZ.Actuarial

namespace RegZ

open Real

/-- Each recursion step is affine in `P`. -/
lemma balanceAfter_succ (face P i : ℝ) (t : ℕ) (f : ℝ) (k : ℕ) :
    balanceAfter face P i t f (k + 1)
      = balanceAfter face P i t f k * (1 + periodMultiplier i t f k) - P := by
  show balanceAfter face P i t f k + interest i t f _ k - P = _
  simp only [interest]
  ring

/-- At zero APR, the period multiplier is zero for every `k`. -/
lemma periodMultiplier_zero (t : ℕ) (f : ℝ) (k : ℕ) :
    periodMultiplier 0 t f k = 0 := by
  unfold periodMultiplier
  split
  · simp
  · rfl

/-- Period multiplier is non-negative when `i, f ≥ 0`. -/
lemma periodMultiplier_nonneg {i f : ℝ} (hi : 0 ≤ i) (hf : 0 ≤ f)
    (t : ℕ) (k : ℕ) : 0 ≤ periodMultiplier i t f k := by
  unfold periodMultiplier
  split
  · have h1 : 1 ≤ (1 + i) ^ t := one_le_pow₀ (by linarith)
    have h2 : 1 ≤ 1 + f * i := by nlinarith
    nlinarith [mul_le_mul h1 h2 zero_le_one (by linarith : (0:ℝ) ≤ (1 + i) ^ t)]
  · exact hi

/-- Zero-APR balance recurrence: `b_k = face - k * P`. -/
lemma balanceAfter_zero_apr (face P : ℝ) (t : ℕ) (f : ℝ) (k : ℕ) :
    balanceAfter face P 0 t f k = face - k * P := by
  induction k with
  | zero => simp [balanceAfter]
  | succ k ih =>
      rw [balanceAfter_succ, ih, periodMultiplier_zero]
      push_cast
      ring

/-- **Zero-APR closed form.** When `apr = 0` and `n ≥ 1`, the regular
payment that makes NFV vanish is `P = (face - balloon) / n`.
Validates the short-circuit at calculator.ts:120-122. -/
theorem zero_apr_closed_form (face balloon : ℝ) (t : ℕ) (f : ℝ) (n : ℕ)
    (hn : n ≠ 0) :
    nfv face ((face - balloon) / n) balloon 0 t f n = 0 := by
  unfold nfv
  rw [if_neg hn]
  rw [show interest 0 t f (balanceAfter face _ 0 t f (n - 1)) (n - 1) = 0 from by
    simp [interest, periodMultiplier_zero]]
  rw [balanceAfter_zero_apr]
  have hnR : (n : ℝ) ≠ 0 := Nat.cast_ne_zero.mpr hn
  have hsub : ((n - 1 : ℕ) : ℝ) = (n : ℝ) - 1 := by
    have h1 : 1 ≤ n := Nat.one_le_iff_ne_zero.mpr hn
    rw [Nat.cast_sub h1, Nat.cast_one]
  rw [hsub]
  field_simp
  ring

/-- The slope of `balanceAfter` as an affine function of `P`. -/
noncomputable def slope (i : ℝ) (t : ℕ) (f : ℝ) : ℕ → ℝ
  | 0 => 0
  | k + 1 => slope i t f k * (1 + periodMultiplier i t f k) - 1

@[simp] lemma slope_zero (i : ℝ) (t : ℕ) (f : ℝ) : slope i t f 0 = 0 := rfl

@[simp] lemma slope_succ (i : ℝ) (t : ℕ) (f : ℝ) (k : ℕ) :
    slope i t f (k + 1) = slope i t f k * (1 + periodMultiplier i t f k) - 1 := rfl

/-- Affine decomposition: `b_k(P) = b_k(0) + slope_k * P`. -/
lemma balanceAfter_affine (face i : ℝ) (t : ℕ) (f : ℝ) (k : ℕ) (P : ℝ) :
    balanceAfter face P i t f k
      = balanceAfter face 0 i t f k + slope i t f k * P := by
  induction k with
  | zero => simp [balanceAfter]
  | succ k ih =>
      rw [balanceAfter_succ, balanceAfter_succ, ih, slope_succ]
      ring

/-- Slope ≤ -1 for `k ≥ 1` when `i, f ≥ 0`. By induction:
  slope_1 = slope_0 * (1 + m_0) - 1 = -1
  slope_{k+2} = slope_{k+1} * (1 + m_{k+1}) - 1, and since slope_{k+1} ≤ -1 ≤ 0
  and (1 + m_{k+1}) ≥ 1, we get slope_{k+1} * (1 + m_{k+1}) ≤ slope_{k+1} ≤ -1,
  so slope_{k+2} ≤ -2 ≤ -1. -/
lemma slope_le_neg_one_of_succ {i f : ℝ} (hi : 0 ≤ i) (hf : 0 ≤ f)
    (t : ℕ) (k : ℕ) : slope i t f (k + 1) ≤ -1 := by
  induction k with
  | zero =>
      simp [slope_succ, slope_zero]
  | succ k ih =>
      rw [slope_succ]
      have hm : 0 ≤ periodMultiplier i t f (k + 1) :=
        periodMultiplier_nonneg hi hf t (k + 1)
      have h1 : (1 : ℝ) ≤ 1 + periodMultiplier i t f (k + 1) := by linarith
      have hsnp : slope i t f (k + 1) ≤ 0 := by linarith
      have h2 : slope i t f (k + 1) * (1 + periodMultiplier i t f (k + 1))
                  ≤ slope i t f (k + 1) := by
        nlinarith
      linarith

/-- nfv at `n ≠ 0` collapses to `balanceAfter face P i t f n - balloon`. -/
lemma nfv_eq_balanceAfter_sub_balloon
    (face P balloon i : ℝ) (t : ℕ) (f : ℝ) (n : ℕ) (hn : n ≠ 0) :
    nfv face P balloon i t f n = balanceAfter face P i t f n - balloon := by
  have hn1 : (n - 1) + 1 = n := Nat.sub_add_cancel (Nat.one_le_iff_ne_zero.mpr hn)
  unfold nfv
  rw [if_neg hn]
  have heq : balanceAfter face P i t f n
        = balanceAfter face P i t f (n - 1)
            + interest i t f (balanceAfter face P i t f (n - 1)) (n - 1)
            - P := by
    conv_lhs => rw [← hn1]
    show balanceAfter face P i t f (n - 1)
          + interest i t f _ (n - 1) - P = _
    rfl
  linarith

/-- **NFV strictly antitone in `P`** for `i ≥ 0`, `f ≥ 0`, `n ≥ 1`.

Implies the root of `P ↦ nfv(P) = 0` is unique: any correct
root-finder converges to the same answer. Solver well-posed. -/
theorem nfv_strict_anti {face balloon i : ℝ} {t : ℕ} {f : ℝ} {n : ℕ}
    (hi : 0 ≤ i) (hf : 0 ≤ f) (hn : n ≠ 0) :
    StrictAnti (fun P => nfv face P balloon i t f n) := by
  intro P₁ P₂ hP
  show nfv face P₂ balloon i t f n < nfv face P₁ balloon i t f n
  rw [nfv_eq_balanceAfter_sub_balloon face P₂ balloon i t f n hn,
      nfv_eq_balanceAfter_sub_balloon face P₁ balloon i t f n hn,
      balanceAfter_affine face i t f n P₁,
      balanceAfter_affine face i t f n P₂]
  have hslope : slope i t f n ≤ -1 := by
    rcases Nat.exists_eq_succ_of_ne_zero hn with ⟨k, rfl⟩
    exact slope_le_neg_one_of_succ hi hf t k
  have hslopeneg : slope i t f n < 0 := by linarith
  have hpos : 0 < P₂ - P₁ := by linarith
  nlinarith [mul_lt_mul_of_neg_left hpos hslopeneg]

end RegZ
