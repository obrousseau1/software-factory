const CODES = { SAVE10: 0.1 };

export function applyDiscount(total, code) {
  if (!(code in CODES)) throw new Error(`Unknown code: ${code}`);
  return Math.round(total * (1 - CODES[code]) * 100) / 100;
}
