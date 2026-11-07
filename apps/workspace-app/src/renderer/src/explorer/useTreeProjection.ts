export const TREE_ROW_HEIGHT = 24;
const OVERSCAN = 4;

export interface TreeProjection<T> {
  rows: T[];
  startIndex: number;
  paddingTop: number;
  paddingBottom: number;
  totalHeight: number;
}

/** Window visible tree rows for large directories (~80 rows visible). */
export function projectVisibleRows<T>(
  flatList: T[],
  scrollTop: number,
  viewportHeight: number,
): TreeProjection<T> {
  const totalHeight = flatList.length * TREE_ROW_HEIGHT;
  if (viewportHeight <= 0 || flatList.length === 0) {
    return { rows: flatList, startIndex: 0, paddingTop: 0, paddingBottom: 0, totalHeight };
  }
  const start = Math.max(0, Math.floor(scrollTop / TREE_ROW_HEIGHT) - OVERSCAN);
  const visibleCount = Math.ceil(viewportHeight / TREE_ROW_HEIGHT) + OVERSCAN * 2;
  const end = Math.min(flatList.length, start + visibleCount);
  return {
    rows: flatList.slice(start, end),
    startIndex: start,
    paddingTop: start * TREE_ROW_HEIGHT,
    paddingBottom: Math.max(0, (flatList.length - end) * TREE_ROW_HEIGHT),
    totalHeight,
  };
}
