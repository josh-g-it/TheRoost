export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function intersects(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

/**
 * Given a candidate rect and a list of other rects, adjust the candidate's
 * position so it doesn't overlap any of the others. Uses shortest-penetration
 * push (bump to the nearest non-overlapping edge).
 */
export function resolveCollision(
  candidate: Rect,
  others: Rect[],
): { x: number; y: number } {
  let { x, y } = candidate;

  for (const other of others) {
    const rect: Rect = { x, y, width: candidate.width, height: candidate.height };
    if (!intersects(rect, other)) continue;

    // Calculate penetration on each axis
    const pushLeft = rect.x + rect.width - other.x; // push candidate left
    const pushRight = other.x + other.width - rect.x; // push candidate right
    const pushUp = rect.y + rect.height - other.y; // push candidate up
    const pushDown = other.y + other.height - rect.y; // push candidate down

    const minPush = Math.min(pushLeft, pushRight, pushUp, pushDown);

    if (minPush === pushLeft) {
      x = other.x - candidate.width;
    } else if (minPush === pushRight) {
      x = other.x + other.width;
    } else if (minPush === pushUp) {
      y = other.y - candidate.height;
    } else {
      y = other.y + other.height;
    }
  }

  // Clamp to viewport
  x = Math.max(0, Math.min(window.innerWidth - candidate.width, x));
  y = Math.max(0, Math.min(window.innerHeight - 36, y));

  return { x, y };
}

/**
 * During a resize, ensure the candidate rect doesn't grow into any other panel.
 * Returns adjusted width/height.
 */
export function resolveResizeCollision(
  candidate: Rect,
  others: Rect[],
  minWidth: number,
  minHeight: number,
): { width: number; height: number } {
  let { width, height } = candidate;

  for (const other of others) {
    const rect: Rect = { x: candidate.x, y: candidate.y, width, height };
    if (!intersects(rect, other)) continue;

    // Shrink width or height to not overlap
    const overlapRight = rect.x + rect.width - other.x;
    const overlapBottom = rect.y + rect.height - other.y;

    if (overlapRight > 0 && overlapRight < overlapBottom) {
      width = Math.max(minWidth, other.x - candidate.x);
    } else {
      height = Math.max(minHeight, other.y - candidate.y);
    }
  }

  // Clamp to viewport
  width = Math.min(width, window.innerWidth - candidate.x);
  height = Math.min(height, window.innerHeight - candidate.y);

  return { width, height };
}
