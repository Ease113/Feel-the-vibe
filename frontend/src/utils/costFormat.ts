export function formatCost(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}
