/** Credits charged per successful generation based on requested output count. */
export function creditCostForNumImages(numImages) {
  const n = Number(numImages);
  if (!Number.isFinite(n) || n < 3) {
    return 1;
  }
  // 3 variants ≈ 3× API cost; charge 2 credits (~40 ₽ at 20 ₽/credit).
  return 2;
}

export function normalizeCreditCost(value) {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n > 0 ? n : 1;
}
