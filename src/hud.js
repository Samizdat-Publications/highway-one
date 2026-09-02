// Minimal DOM HUD: the dashboard is the primary instrument. Built with DOM methods only.
export function createHUD() {
  const $ = (id) => document.getElementById(id);
  const el = { mode: $('mode-name'), obj: $('objective'), timer: $('timer'), clock: $('clock'), street: $('street'), toast: $('toast'), speed: $('speed-hint'), perf: $('perf'), lock: $('lock-hint'), report: $('report') };
  let toastT = 0;
  const S = { showSpeed: false };
  const mk = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const clear = (e) => { while (e.firstChild) e.removeChild(e.firstChild); };

  function setMode(n) { el.mode.textContent = n; }
  function setObjective(t) { el.obj.textContent = t || ''; }
  function setTimer(t) { el.timer.textContent = t || ''; }
  function setClock(t) { el.clock.textContent = t; }
  function setStreet(t) { el.street.textContent = t || ''; }
  function toast(text, kind = '', secs = 2.5) { el.toast.textContent = text; el.toast.className = 'on ' + kind; toastT = secs; }
  function setSpeed(mph, limit) {
    if (!S.showSpeed) { if (el.speed.firstChild) clear(el.speed); return; }
    clear(el.speed);
    el.speed.appendChild(document.createTextNode(String(Math.round(mph))));
    el.speed.appendChild(mk('small', '', 'MPH'));
    if (limit) { const s = mk('small', '', ' / ' + limit); s.style.opacity = '0.6'; el.speed.appendChild(s); }
  }
  function setPerf(text) { el.perf.textContent = text; }
  function togglePerf() { el.perf.style.display = el.perf.style.display === 'block' ? 'none' : 'block'; }
  function setLockHint(t) { el.lock.textContent = t; }
  // report: { title, grade, gradeColor, rows: [[label, value], ...], button: { label, onClick } }
  function showReport(r) {
    clear(el.report);
    el.report.appendChild(mk('h2', '', r.title));
    if (r.grade) { const g = mk('div', 'grade', r.grade); if (r.gradeColor) g.style.color = r.gradeColor; el.report.appendChild(g); }
    const table = mk('table');
    for (const [a, b] of r.rows || []) { const tr = mk('tr'); tr.appendChild(mk('td', '', a)); tr.appendChild(mk('td', '', b)); table.appendChild(tr); }
    el.report.appendChild(table);
    if (r.button) { const b = mk('button', '', r.button.label); b.addEventListener('click', r.button.onClick); el.report.appendChild(b); }
    el.report.classList.remove('hidden');
  }
  function hideReport() { el.report.classList.add('hidden'); }
  function update(dt) { if (toastT > 0) { toastT -= dt; if (toastT <= 0) el.toast.className = ''; } }
  return { S, setMode, setObjective, setTimer, setClock, setStreet, toast, setSpeed, setPerf, togglePerf, setLockHint, showReport, hideReport, update };
}
