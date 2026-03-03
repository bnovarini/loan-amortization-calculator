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
