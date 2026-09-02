// Main menu, pause menu, persisted options.
export function createMenu(hooks) {
  const $ = (id) => document.getElementById(id);
  const opts = { sens: 1, vol: 0.8, fov: 70, seat: 0, trans: 'auto', quality: 'high', hour: 15.5, weather: 'clear', hudspeed: 'off', mode: 'freeroam' };
  try { Object.assign(opts, JSON.parse(localStorage.getItem('highwayone_opts') || '{}')); } catch (e) { /* storage unavailable */ }
  const fmt = { sens: (v) => v.toFixed(2) + 'x', vol: (v) => Math.round(v * 100) + '%', fov: (v) => v + '°', seat: (v) => (v >= 0 ? '+' : '') + Math.round(v * 1000) + 'mm', hour: (v) => { const h = Math.floor(v), m = Math.round((v - h) * 60); return `${h}:${m < 10 ? '0' : ''}${m}`; } };
  const ranges = ['sens', 'vol', 'fov', 'seat', 'hour'], selects = ['trans', 'quality', 'weather', 'hudspeed'];
  function save() { try { localStorage.setItem('highwayone_opts', JSON.stringify(opts)); } catch (e) { /* ignore */ } }
  function refresh() {
    for (const k of ranges) { const el = $('opt-' + k); if (!el) continue; el.value = opts[k]; $('opt-' + k + '-v').textContent = fmt[k](Number(opts[k])); }
    for (const k of selects) { const el = $('opt-' + k); if (el) el.value = opts[k]; }
    document.querySelectorAll('.mode-btn').forEach((b) => b.classList.toggle('on', b.dataset.mode === opts.mode));
  }
  for (const k of ranges) { const el = $('opt-' + k); if (el) el.addEventListener('input', (e) => { opts[k] = parseFloat(e.target.value); refresh(); save(); hooks.onOption && hooks.onOption(k, opts[k]); }); }
  for (const k of selects) { const el = $('opt-' + k); if (el) el.addEventListener('change', (e) => { opts[k] = e.target.value; save(); hooks.onOption && hooks.onOption(k, opts[k]); }); }
  document.querySelectorAll('.mode-btn').forEach((b) => b.addEventListener('click', () => { opts.mode = b.dataset.mode; refresh(); save(); }));
  $('btn-start').addEventListener('click', () => hooks.onStart && hooks.onStart());
  $('btn-resume').addEventListener('click', () => hooks.onResume && hooks.onResume());
  $('btn-menu').addEventListener('click', () => hooks.onMainMenu && hooks.onMainMenu());
  refresh();

  const show = (id, on) => $(id).classList.toggle('hidden', !on);
  return {
    opts, refresh, save,
    setReady(ready, text) { $('btn-start').disabled = !ready; $('loading').textContent = text || ''; },
    setBest(text) { $('best').textContent = text || ''; },
    showMain(on) { show('menu', on); document.body.classList.toggle('menu-open', on); },
    showPause(on) { show('pause', on); },
  };
}
