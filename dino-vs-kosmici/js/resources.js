import { WORLD } from './config.js';
import { clamp, damp } from './util.js';

// Advance one dropped material. Returns true when Dino reaches its pickup
// radius; the caller owns inventory, sound and HUD feedback.
export function stepResourceDrop(m, p, dt) {
  m.collectDelay -= dt;
  m.x = clamp(m.x + m.vx * dt, 18, WORLD.w - 18);
  m.y = clamp(m.y + m.vy * dt, 18, WORLD.h - 18);

  if (!m.settled) {
    m.lift += m.vz * dt;
    m.vz -= 520 * dt;
    m.rot += m.spin * dt;
    const d = damp(0.88, dt);
    m.vx *= d;
    m.vy *= d;
    if (m.lift <= 0) {
      m.lift = 0;
      if (!m.bounced && m.vz < -80) {
        m.vz = -m.vz * 0.24;
        m.spin *= 0.45;
        m.bounced = true;
      } else {
        m.vz = 0;
        m.vx = 0;
        m.vy = 0;
        m.settled = true;
      }
    }
  }

  if (m.collectDelay > 0) return false;
  const dx = p.x - m.x, dy = p.y - m.y;
  const distance = Math.hypot(dx, dy);
  if (distance <= p.r + 42) return true;
  if (distance < 175 && distance > 0.001) {
    // Pull even during the last bounce, including from behind a former trunk.
    const pull = 160 + (1 - distance / 175) * 120;
    const step = Math.min(distance, pull * dt);
    m.x += dx / distance * step;
    m.y += dy / distance * step;
    return distance - step <= p.r + 42;
  }
  return false;
}
