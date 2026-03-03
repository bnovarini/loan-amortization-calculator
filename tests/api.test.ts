import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/api/server';

const app = createApp();

const validPayload = {
  amount: 10000,
  months: 12,
  apr: 0.06,
  loanDate: '2024-01-15',
  firstPaymentDate: '2024-02-15',
};

describe('POST /api/calculate', () => {
  it('returns 200 with valid payload', async () => {
    const res = await request(app).post('/api/calculate').send(validPayload);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('paymentPerPeriodCents');
    expect(res.body).toHaveProperty('numberOfPayments');
    expect(res.body).toHaveProperty('finalPaymentCents');
    expect(res.body).toHaveProperty('financeChargeCents');
    expect(res.body).toHaveProperty('totalOfPaymentsCents');
    expect(res.body).toHaveProperty('calculatedAPR');
  });

  it('returns 400 when amount is missing', async () => {
    const { amount: _, ...body } = validPayload;
    const res = await request(app).post('/api/calculate').send(body);
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'Validation failed');
  });

  it('returns 400 when amount is negative', async () => {
    const res = await request(app)
      .post('/api/calculate')
      .send({ ...validPayload, amount: -100 });
    expect(res.status).toBe(400);
  });

  it('returns 400 when apr is negative', async () => {
    const res = await request(app)
      .post('/api/calculate')
      .send({ ...validPayload, apr: -0.01 });
    expect(res.status).toBe(400);
  });

  it('returns 400 when apr exceeds 1', async () => {
    const res = await request(app)
      .post('/api/calculate')
      .send({ ...validPayload, apr: 1.5 });
    expect(res.status).toBe(400);
  });

  it('returns 400 when loanDate format is wrong', async () => {
    const res = await request(app)
      .post('/api/calculate')
      .send({ ...validPayload, loanDate: '01/15/2024' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when firstPaymentDate format is wrong', async () => {
    const res = await request(app)
      .post('/api/calculate')
      .send({ ...validPayload, firstPaymentDate: '2024/02/15' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when equalPayments + balloonAmount combined', async () => {
    const res = await request(app).post('/api/calculate').send({
      ...validPayload,
      equalPayments: true,
      balloonAmount: 2000,
    });
    expect(res.status).toBe(400);
  });

  it('fullAmortizationSchedule absent when showAmortizationSchedule not set', async () => {
    const res = await request(app).post('/api/calculate').send(validPayload);
    expect(res.status).toBe(200);
    expect(res.body.fullAmortizationSchedule).toBeUndefined();
  });

  it('fullAmortizationSchedule present when showAmortizationSchedule=true', async () => {
    const res = await request(app).post('/api/calculate').send({
      ...validPayload,
      showAmortizationSchedule: true,
    });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.fullAmortizationSchedule)).toBe(true);
    expect(res.body.fullAmortizationSchedule.length).toBe(12);
  });

  it('totalPaymentProtectionCents absent when paymentProtectionRate not set', async () => {
    const res = await request(app).post('/api/calculate').send(validPayload);
    expect(res.status).toBe(200);
    expect(res.body.totalPaymentProtectionCents).toBeUndefined();
  });

  it('totalPaymentProtectionCents present when paymentProtectionRate > 0', async () => {
    const res = await request(app).post('/api/calculate').send({
      ...validPayload,
      paymentProtectionRate: 0.5,
    });
    expect(res.status).toBe(200);
    expect(res.body.totalPaymentProtectionCents).toBeGreaterThan(0);
  });

  it('faceAmountCents and amountFinancedCents absent when no fees', async () => {
    const res = await request(app).post('/api/calculate').send(validPayload);
    expect(res.status).toBe(200);
    expect(res.body.faceAmountCents).toBeUndefined();
    expect(res.body.amountFinancedCents).toBeUndefined();
  });

  it('faceAmountCents and amountFinancedCents present when fees provided', async () => {
    const res = await request(app).post('/api/calculate').send({
      ...validPayload,
      fees: [{ amount: 500, name: 'Origination', financed: true }],
    });
    expect(res.status).toBe(200);
    expect(res.body.faceAmountCents).toBe(1050000);
    expect(res.body.amountFinancedCents).toBe(1050000);
  });

  it('accepts all payment frequencies', async () => {
    for (const freq of ['weekly', 'bi-weekly', 'semi-monthly', 'monthly']) {
      const res = await request(app).post('/api/calculate').send({
        ...validPayload,
        paymentFrequency: freq,
      });
      expect(res.status).toBe(200);
    }
  });

  it('calculatedAPR is close to apr when no fees', async () => {
    const res = await request(app).post('/api/calculate').send(validPayload);
    expect(res.status).toBe(200);
    expect(res.body.calculatedAPR).toBeCloseTo(0.06, 3);
  });
});
