import type { Point, Stroke } from './letters.ts';
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
export function sample(stroke: Stroke, spacing = 4): Stroke {
  if (!stroke.length) return [];
  const result = [stroke[0]];
  for (let i = 1; i < stroke.length; i++) {
    const a = stroke[i - 1], b = stroke[i], steps = Math.max(1, Math.ceil(distance(a, b) / spacing));
    for (let j = 1; j <= steps; j++) result.push({ x: a.x + (b.x - a.x) * j / steps, y: a.y + (b.y - a.y) * j / steps });
  }
  return result;
}
const length = (s: Stroke) => s.slice(1).reduce((n, p, i) => n + distance(s[i], p), 0);
// Re-sample by arc length so device event frequency cannot inflate accuracy.
function uniform(stroke: Stroke): Stroke {
  if (!stroke.length) return [];
  const out = [stroke[0]];
  let remaining = 4;
  for (let i = 1; i < stroke.length; i++) {
    let a = stroke[i - 1]; const b = stroke[i]; let d = distance(a, b);
    while (d >= remaining && d > 0) {
      a = { x: a.x + (b.x - a.x) * remaining / d, y: a.y + (b.y - a.y) * remaining / d };
      out.push(a); d = distance(a, b); remaining = 4;
    }
    remaining -= d;
  }
  out.push(stroke[stroke.length - 1]);
  return out;
}
export function scoreTrace(ink: Stroke[], guide: Stroke[]) {
  const targetStrokes = guide.map(uniform), target = targetStrokes.flat(), drawn = ink.map(uniform).flat();
  const inkLength = ink.reduce((n, s) => n + length(s), 0), targetLength = guide.reduce((n, s) => n + length(s), 0);
  const empty = { score: 0, coverage: 0, precision: 0, passed: false };
  if (!drawn.length || !target.length || inkLength < targetLength * 0.35) return empty;
  const near = (p: Point, points: Point[]) => points.some(q => distance(p, q) <= 17);
  const coverage = target.filter(p => near(p, drawn)).length / target.length;
  const precision = drawn.filter(p => near(p, target)).length / drawn.length;
  const weakestStroke = Math.min(...targetStrokes.map(s => s.filter(p => near(p, drawn)).length / s.length));
  const excessPenalty = Math.min(1, targetLength * 1.65 / inkLength);
  const score = Math.round(100 * Math.sqrt(coverage * precision) * excessPenalty);
  return { score, coverage, precision, passed: coverage >= 0.82 && precision >= 0.78 && weakestStroke >= 0.6 && excessPenalty >= 0.8 && score >= 80 };
}
