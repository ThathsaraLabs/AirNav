// Pure geometry and dwell logic, shared by the camera controller and tests.
export function isIndexPointing(points) {
  if (!points || points.length !== 21) return false;
  const distance = (a, b) => Math.hypot(points[a].x - points[b].x, points[a].y - points[b].y);
  const indexExtended = distance(8, 0) > distance(6, 0) * 1.13 && distance(8, 5) > distance(6, 5) * 1.35;
  const othersCurled = [[12, 10], [16, 14], [20, 18]].every(([tip, pip]) => distance(tip, 0) < distance(pip, 0) * 1.12);
  return indexExtended && othersCurled;
}

export function mapPointer(point, width, height, margin = 0.12) {
  const clamp = value => Math.max(0, Math.min(1, value));
  return { x: clamp((1 - point.x - margin) / (1 - 2 * margin)) * (width - 1), y: clamp((point.y - margin) / (1 - 2 * margin)) * (height - 1) };
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
