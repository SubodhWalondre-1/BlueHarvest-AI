// Spawn batch price calculation: single spawn price = 0.025 INR, flat packing cost = 50 INR
export const calculateBatchPrice = (count) => {
  const num = Number(count);
  if (!Number.isFinite(num) || num < 0) return 50.0;
  return (num * 0.025) + 50.0;
};

export const formatPriceINR = (count) => {
  const price = calculateBatchPrice(count);
  return '₹' + price.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
