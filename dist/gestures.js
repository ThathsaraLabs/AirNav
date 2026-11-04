// Pure geometry and dwell logic, shared by the camera controller and tests.
export function isIndexPointing(points, { requireOtherFingersCurled = true } = {}) {
  if (!points || points.length !== 21) return false;
  const distance = (a, b) => Math.hypot(points[a].x - points[b].x, points[a].y - points[b].y);
  const indexExtended = distance(8, 0) > distance(6, 0) * 1.13 && distance(8, 5) > distance(6, 5) * 1.35;
  if (!requireOtherFingersCurled) return indexExtended;
  const othersCurled = [[12, 10], [16, 14], [20, 18]].every(([tip, pip]) => distance(tip, 0) < distance(pip, 0) * 1.12);
  return indexExtended && othersCurled;
}

export function mapPointer(point, width, height, margin = 0.12) {
  const clamp = value => Math.max(0, Math.min(1, value));
  return { x: clamp((1 - point.x - margin) / (1 - 2 * margin)) * (width - 1), y: clamp((point.y - margin) / (1 - 2 * margin)) * (height - 1) };
}

export function isDrawingFingerExtended(points) {
  if (!points || points.length !== 21) return false;
  const [base, joint, tip] = [points[5], points[6], points[8]];
  const first = [joint.x - base.x, joint.y - base.y, (joint.z ?? 0) - (base.z ?? 0)];
  const second = [tip.x - joint.x, tip.y - joint.y, (tip.z ?? 0) - (joint.z ?? 0)];
  const lengths = Math.hypot(...first) * Math.hypot(...second);
  const dot = first.reduce((sum, value, i) => sum + value * second[i], 0);
  return lengths > 0 && dot / lengths > .6;
}

export function smoothDrawingPointer(previous, next, elapsed, smoothing) {
  if (!previous || elapsed <= 0 || elapsed > 250) return next;
  const distance = Math.hypot(next.x - previous.x, next.y - previous.y);
  // Suppress small landmark fluctuations without lagging behind deliberate moves.
  const responsiveness = smoothing + (1 - smoothing) * Math.min(distance / 100, .9);
  const blend = 1 - (1 - responsiveness) ** (elapsed / (1000 / 30));
  return {
    x: previous.x + (next.x - previous.x) * blend,
    y: previous.y + (next.y - previous.y) * blend,
  };
}

export class DwellController {
  constructor(duration = 1100) { this.duration = duration; this.reset(); }
  reset() { this.target = null; this.started = 0; this.activated = false; }
  update(target, now) {
    if (target !== this.target) { this.target = target; this.started = now; this.activated = false; }
    if (!target || this.activated) return { progress: 0, activate: false };
    const progress = Math.min(1, Math.max(0, (now - this.started) / this.duration));
    if (progress === 1) { this.activated = true; return { progress: 1, activate: true }; }
    return { progress, activate: false };
  }
}
