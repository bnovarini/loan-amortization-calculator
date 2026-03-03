export class SolverError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SolverError';
  }
}

export function brentSolve(
  f: (x: number) => number,
  a: number,
  b: number,
  tolerance = 1e-8,
  maxIterations = 100,
): number {
  let fa = f(a);
  let fb = f(b);

  if (fa * fb >= 0) {
    throw new SolverError('No root in bracket: f(a) and f(b) same sign');
  }

  if (Math.abs(fa) < Math.abs(fb)) {
    [a, b] = [b, a];
    [fa, fb] = [fb, fa];
  }

  let c = a;
  let fc = fa;
  let mflag = true;
  let d = 0.0;

  for (let iter = 0; iter < maxIterations; iter++) {
    let s: number;

    if (fa !== fc && fb !== fc) {
      // Inverse quadratic interpolation
      s =
        (a * fb * fc) / ((fa - fb) * (fa - fc)) +
        (b * fa * fc) / ((fb - fa) * (fb - fc)) +
        (c * fa * fb) / ((fc - fa) * (fc - fb));
    } else {
      // Secant method
      s = b - (fb * (b - a)) / (fb - fa);
    }

    const useBisection =
      (s - b) * (s - (3 * a + b) / 4) >= 0 ||
      (mflag && Math.abs(s - b) >= Math.abs(b - c) / 2) ||
      (!mflag && Math.abs(s - b) >= Math.abs(c - d) / 2) ||
      (mflag && Math.abs(b - c) < tolerance) ||
      (!mflag && Math.abs(c - d) < tolerance);

    if (useBisection) {
      s = (a + b) / 2;
      mflag = true;
    } else {
      mflag = false;
    }

    const fs = f(s);
    d = c;
    c = b;
    fc = fb;

    if (fa * fs < 0) {
      b = s;
      fb = fs;
    } else {
      a = s;
      fa = fs;
    }

    if (Math.abs(fa) < Math.abs(fb)) {
      [a, b] = [b, a];
      [fa, fb] = [fb, fa];
    }

    if (Math.abs(fs) < tolerance) {
      return s;
    }
  }

  throw new SolverError(`Brent solver did not converge within ${maxIterations} iterations`);
}

/**
 * CFPB Appendix J iterative method for root-finding.
 *
 * Mirrors the procedure described in Reg Z Appendix J § (b)(9):
 *   1. Evaluate f at an initial guess I₁.
 *   2. Evaluate f at I₂ = I₁ + step.
 *   3. Interpolate: I_new = I₁ − step × f(I₁) / (f(I₂) − f(I₁)).
 *   4. Set I₁ = I_new and repeat until convergence.
 */
export function cfpbSolve(
  f: (x: number) => number,
  initialGuess: number,
  step: number,
  tolerance = 1e-8,
  maxIterations = 100,
): number {
  let I1 = initialGuess;

  for (let iter = 0; iter < maxIterations; iter++) {
    const fI1 = f(I1);

    if (Math.abs(fI1) < tolerance) {
      return I1;
    }

    const I2 = I1 + step;
    const fI2 = f(I2);

    const denominator = fI2 - fI1;
    if (Math.abs(denominator) < 1e-15) {
      throw new SolverError('CFPB solver: interpolation failed (denominator too small)');
    }

    const Inew = I1 - step * fI1 / denominator;

    if (Math.abs(Inew - I1) < tolerance) {
      return Inew;
    }

    I1 = Inew;
  }

  throw new SolverError(`CFPB solver did not converge within ${maxIterations} iterations`);
}
