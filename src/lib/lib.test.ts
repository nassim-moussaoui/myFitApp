import { describe, expect, it } from 'vitest';
import { addDays, ageOn, diffDays, isValidISODate, relativeDayLabel, toISODate } from './date';
import { fmtInt, fmtSigned, parseDecimal, toInputString } from './format';
import { isValidBarcode, mapProduct } from './off/api';
import { RateLimiter } from './off/rateLimit';
import { normalizeQuery } from './off/search';

describe('date helpers', () => {
  it('uses local dates', () => {
    expect(toISODate(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });
  it('adds days across months and years', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(diffDays('2026-01-01', '2026-03-01')).toBe(59);
  });
  it('validates dates', () => {
    expect(isValidISODate('2026-02-29')).toBe(false);
    expect(isValidISODate('2028-02-29')).toBe(true);
    expect(isValidISODate('hello')).toBe(false);
  });
  it('computes age', () => {
    expect(ageOn('2000-02-29', '2026-02-28')).toBe(25);
  });
  it('labels days', () => {
    expect(relativeDayLabel('2026-03-10', '2026-03-10')).toBe("Aujourd'hui");
    expect(relativeDayLabel('2026-03-09', '2026-03-10')).toBe('Hier');
  });
});

describe('number helpers', () => {
  it('parses French decimals', () => {
    expect(parseDecimal('72,5')).toBe(72.5);
    expect(parseDecimal(' 72.5 ')).toBe(72.5);
    expect(parseDecimal('abc')).toBeNull();
    expect(parseDecimal('')).toBeNull();
    expect(parseDecimal('1,2,3')).toBeNull();
  });
  it('formats', () => {
    expect(fmtInt(2100).replace(/\s/g, ' ')).toBe('2 100');
    expect(fmtSigned(-0.34)).toBe('-0,3');
    expect(fmtSigned(0.25)).toBe('+0,3');
    expect(toInputString(72.45)).toBe('72,5');
  });
});

describe('Open Food Facts mapping', () => {
  it('maps a complete product', () => {
    const m = mapProduct({
      code: '3017620422003',
      product_name: 'Nutella',
      brands: 'Ferrero, Nutella',
      serving_quantity: 15,
      serving_size: '15 g',
      image_front_small_url: 'https://images.openfoodfacts.org/x.jpg',
      nutriments: {
        'energy-kcal_100g': 539,
        proteins_100g: 6.3,
        carbohydrates_100g: 57.5,
        fat_100g: 30.9,
        sugars_100g: 56.3,
        salt_100g: 0.107,
      },
    });
    expect(m?.missing).toEqual([]);
    expect(m?.food).toMatchObject({
      id: 'off:3017620422003',
      name: 'Nutella',
      brand: 'Ferrero',
      servingGrams: 15,
      per100: { kcal: 539, protein: 6.3, carbs: 57.5, fat: 30.9, sugars: 56.3, salt: 0.11 },
    });
  });
  it('falls back to kJ and reports missing values', () => {
    const m = mapProduct({ code: '123', product_name_fr: 'Truc', nutriments: { 'energy-kj_100g': 418.4, fat_100g: '2,5' } });
    expect(m?.food.per100.kcal).toBe(100);
    expect(m?.food.per100.fat).toBe(2.5);
    expect(m?.missing).toEqual(['protein', 'carbs']);
  });
  it('rejects products without a code', () => {
    expect(mapProduct({ product_name: 'x' })).toBeNull();
  });
  it('checks barcodes', () => {
    expect(isValidBarcode('3017620422003')).toBe(true);
    expect(isValidBarcode('3017620422004')).toBe(false);
    expect(isValidBarcode('96385074')).toBe(true);
    expect(isValidBarcode('036000291452')).toBe(true);
  });
});

describe('RateLimiter', () => {
  it('allows max calls per window then waits', () => {
    let t = 0;
    const rl = new RateLimiter(2, 1000, () => t);
    expect(rl.take()).toBe(true);
    t = 100;
    expect(rl.take()).toBe(true);
    expect(rl.take()).toBe(false);
    expect(rl.waitTime()).toBe(900);
    t = 1000;
    expect(rl.take()).toBe(true);
  });
  it('honours a server cooldown', () => {
    let t = 0;
    const rl = new RateLimiter(10, 1000, () => t);
    rl.block(5000);
    expect(rl.waitTime()).toBe(5000);
    t = 5000;
    expect(rl.take()).toBe(true);
  });
});

it('normalizes queries', () => {
  expect(normalizeQuery('  Skyr   NATURE ')).toBe('skyr nature');
});
