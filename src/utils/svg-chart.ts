/**
 * Shared SVG chart utilities.
 * Extracted from trend-chart.tsx for reuse in sparklines and other charts.
 */

export function niceMax(v: number): number {
  if (v <= 0) return 10;
  const magnitude = Math.pow(10, Math.floor(Math.log10(v)));
  const normalized = v / magnitude;
  if (normalized <= 1.5) return Math.ceil(v / (magnitude * 0.2)) * magnitude * 0.2;
  if (normalized <= 3) return Math.ceil(v / (magnitude * 0.5)) * magnitude * 0.5;
  if (normalized <= 7) return Math.ceil(v / magnitude) * magnitude;
  return Math.ceil(v / (magnitude * 2)) * magnitude * 2;
}

// Fritsch-Carlson monotone cubic Hermite spline — smooth, NO overshoot
export function buildSmoothPath(points: Array<{ x: number; y: number }>): string {
  const n = points.length;
  if (n === 0) return "";
  if (n === 1) return `M${points[0].x},${points[0].y}`;
  if (n === 2) return `M${points[0].x},${points[0].y}L${points[1].x},${points[1].y}`;

  // 1. Secants
  const dx: number[] = [];
  const dy: number[] = [];
  const m: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx[i] = points[i + 1].x - points[i].x;
    dy[i] = dx[i] !== 0 ? (points[i + 1].y - points[i].y) / dx[i] : 0;
  }

  // 2. Initial tangents (flat at sign changes → prevents overshoot)
  m[0] = dy[0];
  for (let i = 1; i < n - 1; i++) {
    m[i] = dy[i - 1] * dy[i] <= 0 ? 0 : (dy[i - 1] + dy[i]) / 2;
  }
  m[n - 1] = dy[n - 2];

  // 3. Fritsch-Carlson: clamp tangents to ensure monotonicity
  for (let i = 0; i < n - 1; i++) {
    if (Math.abs(dy[i]) < 1e-12) {
      m[i] = 0;
      m[i + 1] = 0;
    } else {
      const alpha = m[i] / dy[i];
      const beta = m[i + 1] / dy[i];
      const s = alpha * alpha + beta * beta;
      if (s > 9) {
        const tau = 3 / Math.sqrt(s);
        m[i] = tau * alpha * dy[i];
        m[i + 1] = tau * beta * dy[i];
      }
    }
  }

  // 4. Build SVG cubic bezier path
  let d = `M${points[0].x},${points[0].y}`;
  for (let i = 0; i < n - 1; i++) {
    const t = dx[i] / 3;
    const cp1x = points[i].x + t;
    const cp1y = points[i].y + t * m[i];
    const cp2x = points[i + 1].x - t;
    const cp2y = points[i + 1].y - t * m[i + 1];
    d += `C${cp1x},${cp1y},${cp2x},${cp2y},${points[i + 1].x},${points[i + 1].y}`;
  }
  return d;
}

export function buildSmoothAreaPath(
  points: Array<{ x: number; y: number }>,
  baselineY: number
): string {
  if (points.length === 0) return "";
  const line = buildSmoothPath(points);
  const lastX = points[points.length - 1].x;
  const firstX = points[0].x;
  return `${line} L${lastX},${baselineY} L${firstX},${baselineY} Z`;
}
