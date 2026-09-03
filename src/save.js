// localStorage wrapper (options, best times, gamepad maps, odometer). Never throws.
const PREFIX = 'highwayone_';
export function createSave() {
  function get(key, fallback) { try { const v = localStorage.getItem(PREFIX + key); return v == null ? fallback : JSON.parse(v); } catch (e) { return fallback; } }
  function set(key, value) { try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); } catch (e) { /* storage unavailable */ } }
  return { get, set };
}
