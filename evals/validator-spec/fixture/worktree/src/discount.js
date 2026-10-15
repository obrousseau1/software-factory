const CODES = { SAVE10: 0.1 };

export function applyDiscount(total, code) {
  const rate = CODES[code] ?? 0;
  return Math.round(total * (1 - rate) * 100) / 100;
}
