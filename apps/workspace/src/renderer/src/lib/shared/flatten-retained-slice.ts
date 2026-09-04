export function flattenRetainedSlice(value: string): string {
  return value.length === 0 ? value : `${value} `.slice(0, -1);
}
