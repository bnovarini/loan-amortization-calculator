import { Router } from 'express';
import { z } from 'zod';
import { calculateLoan } from '../sdk';

const FeeSchema = z.object({
  amount: z.number().positive('fee amount must be positive'),
  name: z.string().min(1, 'fee name is required'),
  financed: z.boolean().optional(),
  isPrepaidFinanceCharge: z.boolean().optional(),
});

const LoanInputSchema = z
  .object({
    amount: z.number().positive('amount must be positive'),
    months: z.number().int().min(1).max(600),
    apr: z.number().min(0, 'apr must be >= 0').max(1, 'apr must be <= 1 (100%)'),
    loanDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'loanDate must be YYYY-MM-DD'),
    firstPaymentDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'firstPaymentDate must be YYYY-MM-DD'),
    paymentFrequency: z
      .enum(['weekly', 'bi-weekly', 'semi-monthly', 'monthly'])
      .optional(),
    interestMethod: z.enum(['actuarial', 'actual365']).optional(),
    solverMethod: z.enum(['brent', 'cfpb']).optional(),
    balloonAmount: z.number().min(0).optional(),
    paymentProtectionRate: z.number().min(0).optional(),
    showAmortizationSchedule: z.boolean().optional(),
    equalPayments: z.boolean().optional(),
    fees: z.array(FeeSchema).optional(),
  })
  .refine((d) => !(d.equalPayments === true && (d.balloonAmount ?? 0) > 0), {
    message: 'equalPayments and balloonAmount cannot be combined',
    path: ['equalPayments'],
  });

export const loanRoutes = Router();

loanRoutes.post('/calculate', (req, res): void => {
  const parsed = LoanInputSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({
      error: 'Validation failed',
      details: parsed.error.format(),
    });
    return;
  }

  try {
    const result = calculateLoan(parsed.data);
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    res.status(500).json({ error: message });
  }
});
