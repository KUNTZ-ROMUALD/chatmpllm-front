export interface ScrollMetrics {
  scrollHeight: number;
  clientHeight: number;
  scrollTop: number;
}

export const DEFAULT_NEAR_BOTTOM_THRESHOLD_PX = 96;
const SCROLL_ROUNDING_TOLERANCE_PX = 1;

export function getDistanceFromBottom(metrics: ScrollMetrics): number {
  const values = [
    metrics.scrollHeight,
    metrics.clientHeight,
    metrics.scrollTop,
  ];

  if (!values.every(Number.isFinite)) {
    return Number.POSITIVE_INFINITY;
  }

  const maximumScrollTop = Math.max(
    0,
    metrics.scrollHeight - metrics.clientHeight,
  );

  // Le scrollTop peut dépasser la limite lors du rebond tactile, par exemple sur iOS.
  return Math.max(0, maximumScrollTop - metrics.scrollTop);
}

export function isNearBottom(
  metrics: ScrollMetrics,
  thresholdPx = DEFAULT_NEAR_BOTTOM_THRESHOLD_PX,
): boolean {
  if (!Number.isFinite(thresholdPx) || thresholdPx < 0) {
    return false;
  }

  return (
    getDistanceFromBottom(metrics) <=
    thresholdPx + SCROLL_ROUNDING_TOLERANCE_PX
  );
}

const USER_SCROLL_DELTA_TOLERANCE_PX = 1;

export function nextAutoScrollEnabled(
  currentAutoScrollEnabled: boolean,
  previousScrollTop: number,
  currentScrollTop: number,
  nearBottom: boolean,
): boolean {
  if (
    !Number.isFinite(previousScrollTop) ||
    !Number.isFinite(currentScrollTop)
  ) {
    return currentAutoScrollEnabled;
  }

  if (nearBottom) {
    return true;
  }

  const userMovedUp =
    currentScrollTop < previousScrollTop - USER_SCROLL_DELTA_TOLERANCE_PX;

  return userMovedUp ? false : currentAutoScrollEnabled;
}
