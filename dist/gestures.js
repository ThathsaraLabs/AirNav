// Pure geometry and dwell logic, shared by the camera controller and tests.
export function isIndexPointing(points, { requireOtherFingersCurled = true } = {}) {
  if (!points || points.length !== 21) return false;
  const distance = (a, b) => Math.hypot(points[a].x - points[b].x, points[a].y - points[b].y);
  const indexExtended = distance(8, 0) > distance(6, 0) * 1.08 && distance(8, 5) > distance(6, 5) * 1.22;
  if (!requireOtherFingersCurled) return indexExtended;
  const othersCurled = [[12, 10], [16, 14], [20, 18]].every(([tip, pip]) => distance(tip, 0) < distance(pip, 0) * 1.12);
  return indexExtended && othersCurled;
}

export function mapPointer(point, width, height, margin = 0.12) {
  const clamp = value => Math.max(0, Math.min(1, value));
  return { x: clamp((1 - point.x - margin) / (1 - 2 * margin)) * (width - 1), y: clamp((point.y - margin) / (1 - 2 * margin)) * (height - 1) };
}

export function isTwoFingerScroll(points, active = false) {
  if (points?.length !== 21) return false;
  const reach = index => Math.hypot(points[index].x - points[0].x, points[index].y - points[0].y);
  const extended = (tip, joint, ratio) => reach(tip) > reach(joint) * ratio;
  const threshold = active ? 1.035 : 1.08;
  return extended(8, 6, threshold) && extended(12, 10, threshold) &&
    !extended(16, 14, 1.14) && !extended(20, 18, 1.14);
}

export function nearestHand(hands, wrist) {
  if (!wrist || !hands.length) return hands[0];
  const distance = hand => Math.hypot(hand[0].x - wrist.x, hand[0].y - wrist.y);
  const closest = hands.reduce((best, hand) => distance(hand) < distance(best) ? hand : best);
  return distance(closest) < .18 ? closest : undefined;
}

// Start each gesture at its current position, then scroll from filtered movement.
export class ScrollMotion {
  get active() { return this.anchor != null; }

  reset() {
    this.anchor = null;
    this.filtered = null;
  }

  update(y, viewportHeight) {
    if (!this.active) {
      this.anchor = this.filtered = y;
      return 0;
    }
    this.filtered += (y - this.filtered) * .55;
    const displacement = this.filtered - this.anchor;
    const deadZone = .004;
    if (Math.abs(displacement) <= deadZone) return 0;
    const movement = displacement - Math.sign(displacement) * deadZone;
    const pixels = Math.max(-90, Math.min(90, Math.round(movement * viewportHeight * 3.2)));
    if (pixels) this.anchor = this.filtered - Math.sign(displacement) * deadZone;
    return pixels;
  }
}

export function mapPointerToCanvas(point, rect, viewportWidth, viewportHeight, topInset = 0) {
  const left = Math.max(0, rect.left);
  const top = Math.max(topInset, rect.top);
  const right = Math.min(viewportWidth, rect.right);
  const bottom = Math.min(viewportHeight, rect.bottom);
  if (right - left < 3 || bottom - top < 3) return null;
  const local = mapPointer(point, right - left - 1, bottom - top - 1, .23);
  return { x: left + 1 + local.x, y: top + 1 + local.y };
}

// Virtual Painter gesture rule: compare each fingertip with its PIP joint.
export function studioGesture(points) {
  if (!points || points.length !== 21 || !(points[8].y < points[6].y)) return 'idle';
  return points[12].y < points[10].y ? 'select' : 'draw';
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
