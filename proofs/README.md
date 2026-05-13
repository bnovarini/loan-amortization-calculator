# Reg Z Formal Proofs (Lean 4)

Machine-checked proofs of the Reg Z Appendix J actuarial math used by
`src/core/calculator.ts`. Independent reference model in Lean 4, no
dependency on the TypeScript code.

> **Not shipped to npm consumers.** This directory is excluded from the
> published tarball by the `files` allowlist in `package.json`. It exists
> only as developer-facing assurance.

## What's proven

| Theorem | Statement |
|---|---|
| `actuarial_standard_period` | t=1, f=0 ⇒ multiplier = i |
| `periodMultiplier_zero` | apr=0 ⇒ multiplier = 0 |
| `balanceAfter_zero_apr` | b_k = face − k·P at zero APR |
| `zero_apr_closed_form` | P = (face − balloon)/n satisfies nfv = 0 |
| `balanceAfter_affine` | b_k(P) affine in P with explicit slope |
| `slope_le_neg_one_of_succ` | slope ≤ −1 for k ≥ 1 when i, f ≥ 0 |
| `nfv_strict_anti` | NFV strictly decreasing in P → unique root |

`nfv_strict_anti` is the headline: it guarantees there is exactly one
regular payment that zeros the NFV, so any correct root-finder (brent,
CFPB Appendix J) converges to the same answer.

Reference: Reg Z, 12 CFR Pt. 1026, Appendix J § (b)(5).

## Install Lean 4

This is a one-time setup. The proofs build against `mathlib` pinned to
the version in `lean-toolchain`.

### macOS / Linux

```bash
curl -sSf https://raw.githubusercontent.com/leanprover/elan/master/elan-init.sh \
  | sh -s -- -y --default-toolchain none --no-modify-path
export PATH="$HOME/.elan/bin:$PATH"   # add to ~/.zshrc or ~/.bashrc if you want it permanent
```

Verify:

```bash
elan --version
```

The first `lake build` will install the toolchain pinned in
`proofs/lean-toolchain` automatically.

### Editor

Lean has first-class support in VS Code via the
[lean4 extension](https://marketplace.visualstudio.com/items?itemName=leanprover.lean4).
Open the `proofs/` directory as a workspace.

## Build

From the repo root:

```bash
cd proofs
lake exe cache get   # download pre-built mathlib oleans (first time, ~1 GB)
lake build           # build the RegZ proofs (~10 s incremental, ~5 min cold)
```

A clean build prints:

```
Build completed successfully (1975 jobs).
```

Any `sorry` warning means a theorem is incomplete — treat as a CI
failure even though the build technically succeeds.

## Layout

```
proofs/
├── lakefile.toml          # mathlib dep
├── lean-toolchain         # Lean version pin (mirrors mathlib master)
├── lake-manifest.json     # transitive dep lockfile (committed for reproducibility)
├── RegZ.lean              # top-level import
└── RegZ/
    ├── Basic.lean         # periodMultiplier, interest, balanceAfter, nfv
    ├── Actuarial.lean     # first-period theorems
    └── Solver.lean        # affine recurrence, zero-APR root, monotonicity
```

`.lake/` is the build directory and is gitignored.

## Updating mathlib

```bash
cd proofs
lake update
lake exe cache get
lake build
```

Commit the updated `lake-manifest.json` and (if it changed)
`lean-toolchain` together with any proof adjustments.

## Scope and limits

Proven:

- Reg Z Appendix J actuarial method, over the reals (`ℝ`).
- Recurrence in `src/core/calculator.ts:96-104` matches the Lean model.

Not proven (deliberately out of scope):

- `actual365` interest method — outside Reg Z Appendix J.
- Brent / CFPB numerical convergence — research-grade and not
  load-bearing once `nfv_strict_anti` guarantees a unique root.
- IEEE-754 ↔ ℝ gap — the existing vitest goldens cover float behavior.
- Date arithmetic (`addMonths`, leap year) — secondary.
