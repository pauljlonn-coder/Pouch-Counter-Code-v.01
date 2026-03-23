// ─── State ──────────────────────────────────────────────────────────────────
const DEFAULT_STATE = {
  pouches: [],          // { id, name, nicotine, color }
  log: [],              // { id, pouchId, timestamp }
  dayLimit: 10,
  nicLimit: 100,         // mg Nikotin Tageslimit
  smokeFreeStart: null, // ISO date string
};

let state = loadState();
let timerInterval = null;
let selectedColor = '#3b82f6';
let deleteTargetId = null;

// ─── Persistence ─────────────────────────────────────────────────────────────
function loadState() {
  try {
    const raw = localStorage.getItem('pouchcount_v1');
    return raw ? { ...DEFAULT_STATE, ...JSON.parse(raw) } : {
      ...DEFAULT_STATE,
      smokeFreeStart: new Date().toISOString(),
    };
  } catch { return { ...DEFAULT_STATE, smokeFreeStart: new Date().toISOString() }; }
}

function saveState() {
  localStorage.setItem('pouchcount_v1', JSON.stringify(state));
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function todayLog() {
  const today = todayStr();
  return state.log.filter(e => e.timestamp.startsWith(today));
}

function getPouchById(id) {
  return state.pouches.find(p => p.id === id);
}

function formatTime(ms) {
  // Timer: zeigt nur Minuten und Stunden, keine Sekunden → ruhigere Anzeige
  if (ms < 0) return '–';
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return h + 'h ' + String(m).padStart(2,'0') + 'm';
  if (totalMin < 1) return '< 1 min';
  return m + ' min';
}

function formatTimeHM(ms) {
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m} Minuten`;
}

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// ─── Tab Routing ──────────────────────────────────────────────────────────────
function switchTab(name) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.getElementById('tab-' + name).classList.add('active');
  if (name === 'stats') renderStats();
}

// ─── Hamburger Menu ───────────────────────────────────────────────────────────
function toggleMenu() {
  const btn = document.getElementById('hamburger-btn');
  const menu = document.getElementById('dropdown-menu');
  const backdrop = document.getElementById('menu-backdrop');
  const isOpen = menu.classList.contains('open');
  btn.classList.toggle('open', !isOpen);
  menu.classList.toggle('open', !isOpen);
  backdrop.classList.toggle('open', !isOpen);
}

function selectMenu(tab, label) {
  switchTab(tab);
  document.querySelectorAll('.dropdown-item').forEach(el => {
    el.classList.toggle('active', el.dataset.tab === tab);
  });
  document.getElementById('header-tab-label').textContent = label;
  toggleMenu();
}

// ─── Backfill (vergangenen Tag nachtragen) ────────────────────────────────────
function openBackfill() {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const dateInput = document.getElementById('bf-date');
  dateInput.max = yesterday.toISOString().slice(0,10);
  dateInput.value = yesterday.toISOString().slice(0,10);
  const sel = document.getElementById('bf-pouch');
  if (state.pouches.length === 0) {
    sel.innerHTML = '<option value="">Erst Sorten anlegen</option>';
  } else {
    sel.innerHTML = state.pouches.map(p =>
      '<option value="' + p.id + '">' + p.name + ' (' + p.nicotine + ' mg)</option>'
    ).join('');
  }
  document.getElementById('bf-count').value = '';
  document.getElementById('modal-backfill').classList.add('open');
}

function closeBackfill() {
  document.getElementById('modal-backfill').classList.remove('open');
}

function saveBackfill(e) {
  e.preventDefault();
  const date = document.getElementById('bf-date').value;
  const pouchId = document.getElementById('bf-pouch').value;
  const count = parseInt(document.getElementById('bf-count').value);
  if (!date || !pouchId || isNaN(count) || count < 1) return;
  const startHour = 8, endHour = 22;
  const span = (endHour - startHour) * 60;
  for (let i = 0; i < count; i++) {
    const minuteOffset = Math.round((i / Math.max(count - 1, 1)) * span);
    const h = startHour + Math.floor(minuteOffset / 60);
    const m = minuteOffset % 60;
    const ts = date + 'T' + String(h).padStart(2,'0') + ':' + String(m).padStart(2,'0') + ':00.000Z';
    state.log.push({ id: uid(), pouchId, timestamp: ts });
  }
  saveState();
  closeBackfill();
  renderAll();
  if (document.getElementById('tab-stats').classList.contains('active')) renderStats();
}

// ─── Header ───────────────────────────────────────────────────────────────────
function renderHeader() {
  const now = new Date();
  const days = ['So','Mo','Di','Mi','Do','Fr','Sa'];
  const months = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];
  document.getElementById('header-date').textContent =
    `${days[now.getDay()]}, ${now.getDate()}. ${months[now.getMonth()]} ${now.getFullYear()}`;

  if (state.smokeFreeStart) {
    const daysSince = Math.floor((Date.now() - new Date(state.smokeFreeStart)) / 86400000);
    document.getElementById('header-streak').textContent = ` ${daysSince} Tage) rauchfrei`;
  }
}

// ─── Progress Ring (doppelt) ──────────────────────────────────────────────────
function renderRing() {
  const tl = todayLog();
  const count = tl.length;

  // Äußerer Ring: Pouches
  const limit = state.dayLimit;
  const circOuter = 2 * Math.PI * 84; // r=84
  const pctOuter = Math.min(count / limit, 1);
  const ring = document.getElementById('ring-fill');
  ring.style.strokeDasharray = circOuter;
  ring.style.strokeDashoffset = circOuter * (1 - pctOuter);
  ring.style.opacity = pctOuter === 0 ? 0 : 1;
  ring.classList.remove('warn','danger');
  if (pctOuter >= 1) ring.classList.add('danger');
  else if (pctOuter >= 0.75) ring.classList.add('warn');

  // Innerer Ring: Nikotin
  const nicToday = tl.reduce((sum, e) => {
    const p = getPouchById(e.pouchId);
    return sum + (p ? p.nicotine : 0);
  }, 0);
  const nicLimit = state.nicLimit || 100;
  const circInner = 2 * Math.PI * 64; // r=64
  const pctInner = Math.min(nicToday / nicLimit, 1);
  const ringInner = document.getElementById('ring-fill-inner');
  ringInner.style.strokeDasharray = circInner;
  ringInner.style.strokeDashoffset = circInner * (1 - pctInner);
  ringInner.style.opacity = pctInner === 0 ? 0 : 1;
  ringInner.classList.remove('warn','danger');
  if (pctInner >= 1) ringInner.classList.add('warn');

  // Texte aktualisieren
  document.getElementById('today-count').textContent = count;
  document.getElementById('ring-limit').textContent = limit;
  document.getElementById('limit-display').textContent = limit;
  document.getElementById('ring-nic-val').textContent = nicToday.toFixed(1).replace('.0','') + ' mg';
  document.getElementById('ring-nic-limit').textContent = nicLimit;
  document.getElementById('nic-limit-display').textContent = nicLimit;
}

function changeDayLimit(delta) {
  state.dayLimit = Math.max(1, state.dayLimit + delta);
  saveState();
  renderRing();
}

function changeNicLimit(delta) {
  state.nicLimit = Math.max(10, (state.nicLimit || 100) + delta);
  saveState();
  renderRing();
}

// ─── Timer ────────────────────────────────────────────────────────────────────
function startTimer() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(tickTimer, 1000);
  tickTimer();
}

function tickTimer() {
  const tl = todayLog();
  if (tl.length === 0) {
    document.getElementById('timer-display').textContent = '–';
    document.getElementById('timer-nicotine').textContent = '';
    return;
  }
  const last = tl.reduce((a,b) => a.timestamp > b.timestamp ? a : b);
  const elapsed = Date.now() - new Date(last.timestamp).getTime();
  document.getElementById('timer-display').textContent = formatTime(elapsed);
  const pouch = getPouchById(last.pouchId);
  if (pouch) {
    document.getElementById('timer-nicotine').textContent = `${pouch.name} · ${pouch.nicotine} mg Nikotin`;
  }
}

// ─── Today Log ────────────────────────────────────────────────────────────────
function renderTodayLog() {
  const tl = todayLog().slice().reverse();
  const container = document.getElementById('today-log');
  if (tl.length === 0) {
    container.innerHTML = '<div class="log-empty">Noch keine Einträge heute</div>';
    return;
  }
  container.innerHTML = tl.map(entry => {
    const pouch = getPouchById(entry.pouchId);
    if (!pouch) return '';
    const time = new Date(entry.timestamp);
    const hm = `${String(time.getHours()).padStart(2,'0')}:${String(time.getMinutes()).padStart(2,'0')}`;
    return `
      <div class="log-item">
        <span class="log-dot" style="background:${pouch.color}"></span>
        <div class="log-info">
          <div class="log-name">${pouch.name}</div>
          <div class="log-meta">${pouch.nicotine} mg Nikotin</div>
        </div>
        <span class="log-time">${hm}</span>
        <button class="log-del" onclick="removeLogEntry('${entry.id}')" title="Löschen">×</button>
      </div>
    `;
  }).join('');
}

function removeLogEntry(id) {
  state.log = state.log.filter(e => e.id !== id);
  saveState();
  renderAll();
}

// ─── Pouches Tab ──────────────────────────────────────────────────────────────
function renderPouches() {
  const grid = document.getElementById('pouches-grid');
  if (state.pouches.length === 0) {
    grid.innerHTML = '<div class="no-pouches">Noch keine Sorten angelegt.<br>Tippe auf "+ Sorte" um anzufangen.</div>';
    return;
  }
  const todayL = todayLog();
  grid.innerHTML = state.pouches.map(p => {
    const todayCount = todayL.filter(e => e.pouchId === p.id).length;
    const totalCount = state.log.filter(e => e.pouchId === p.id).length;
    return `
      <div class="pouch-card" style="border-left: 3px solid ${p.color}">
        <div class="pouch-card-color" style="background:${hexToRgba(p.color,0.18)}">
          <span style="font-size:22px">◉</span>
        </div>
        <div class="pouch-card-info">
          <div class="pouch-card-name" style="color:${p.color}">${p.name}</div>
          <div class="pouch-card-meta">${p.nicotine} mg · heute: ${todayCount} · gesamt: ${totalCount}</div>
        </div>
        <div class="pouch-card-actions">
          <button class="pouch-del-btn" onclick="askDelete('${p.id}')" title="Sorte löschen">🗑</button>
          <button class="pouch-add-btn" style="border-color:${p.color};color:${p.color}" onclick="quickAddPouch('${p.id}')">+</button>
        </div>
      </div>
    `;
  }).join('');
}

// ─── Quick Add (FAB Modal) ────────────────────────────────────────────────────
function openQuickAdd() {
  const picker = document.getElementById('pouch-picker');
  if (state.pouches.length === 0) {
    picker.innerHTML = '<div class="picker-empty">Erst Sorten anlegen (Tab "Sorten")</div>';
  } else {
    picker.innerHTML = state.pouches.map(p => `
      <button class="picker-item" onclick="quickAddPouch('${p.id}');closeQuickAdd()">
        <div class="picker-dot" style="background:${hexToRgba(p.color,0.2)};border:2px solid ${p.color}"></div>
        <div class="picker-info">
          <div class="picker-name">${p.name}</div>
          <div class="picker-nic">${p.nicotine} mg Nikotin</div>
        </div>
      </button>
    `).join('');
  }
  document.getElementById('modal-quick').classList.add('open');
}

function closeQuickAdd() {
  document.getElementById('modal-quick').classList.remove('open');
}

function quickAddPouch(pouchId) {
  const entry = { id: uid(), pouchId, timestamp: new Date().toISOString() };
  state.log.push(entry);
  saveState();
  renderAll();
  // haptic feedback on iOS
  if (navigator.vibrate) navigator.vibrate(10);
}

// ─── Add Pouch Type Modal ─────────────────────────────────────────────────────
function openAddPouch() {
  document.getElementById('p-name').value = '';
  document.getElementById('p-nic').value = '';
  selectedColor = '#3b82f6';
  document.querySelectorAll('.color-dot').forEach(d => {
    d.classList.toggle('active', d.dataset.color === selectedColor);
  });
  document.getElementById('modal-add-pouch').classList.add('open');
  setTimeout(() => document.getElementById('p-name').focus(), 300);
}

function closeAddPouch() {
  document.getElementById('modal-add-pouch').classList.remove('open');
}

function selectColor(btn) {
  document.querySelectorAll('.color-dot').forEach(d => d.classList.remove('active'));
  btn.classList.add('active');
  selectedColor = btn.dataset.color;
}

function savePouch(e) {
  e.preventDefault();
  const name = document.getElementById('p-name').value.trim();
  const nicotine = parseFloat(document.getElementById('p-nic').value);
  if (!name || isNaN(nicotine)) return;

  state.pouches.push({ id: uid(), name, nicotine, color: selectedColor });
  saveState();
  closeAddPouch();
  renderPouches();
}

// ─── Delete Pouch ─────────────────────────────────────────────────────────────
function askDelete(id) {
  const p = getPouchById(id);
  if (!p) return;
  deleteTargetId = id;
  document.getElementById('confirm-text').textContent =
    `"${p.name}" löschen? Alle Einträge dieser Sorte bleiben in der Statistik erhalten.`;
  document.getElementById('modal-confirm').classList.add('open');
}

function closeConfirm() {
  deleteTargetId = null;
  document.getElementById('modal-confirm').classList.remove('open');
}

function confirmDelete() {
  if (!deleteTargetId) return;
  state.pouches = state.pouches.filter(p => p.id !== deleteTargetId);
  saveState();
  closeConfirm();
  renderPouches();
}

// ─── Stats ────────────────────────────────────────────────────────────────────
function renderStats() {
  // Group log by day
  const byDay = {};
  state.log.forEach(e => {
    const day = e.timestamp.slice(0,10);
    if (!byDay[day]) byDay[day] = [];
    byDay[day].push(e);
  });

  const days = Object.keys(byDay).sort();
  const numDays = days.length || 1;
  const totalPouches = state.log.length;
  const totalNic = state.log.reduce((sum,e) => {
    const p = getPouchById(e.pouchId);
    return sum + (p ? p.nicotine : 0);
  }, 0);

  const avgPouches = (totalPouches / numDays).toFixed(1);
  const avgNic = (totalNic / numDays).toFixed(1);

  document.getElementById('stat-avg-pouches').textContent = avgPouches;
  document.getElementById('stat-avg-nic').textContent = `${avgNic} mg`;
  document.getElementById('stat-total').textContent = totalPouches;
  document.getElementById('stat-days').textContent = numDays;

  // Best day
  let bestDay = null, bestCount = Infinity;
  days.forEach(d => {
    if (byDay[d].length < bestCount) { bestCount = byDay[d].length; bestDay = d; }
  });
  if (bestDay) {
    const bd = new Date(bestDay);
    document.getElementById('stat-best-day').textContent =
      `${bestCount} Pouches (${bd.toLocaleDateString('de-DE',{day:'numeric',month:'short'})})`;
  }

  // Smoke free
  if (state.smokeFreeStart) {
    const ms = Date.now() - new Date(state.smokeFreeStart).getTime();
    const d = Math.floor(ms / 86400000);
    const h = Math.floor((ms % 86400000) / 3600000);
    document.getElementById('stat-smoke-free').textContent = `${d} Tage`;
    document.getElementById('sf-sub').textContent = `${d} Tage, ${h} Stunden rauchfrei – weiter so!`;
  }

  renderBarChart(byDay);
}

function renderBarChart(byDay) {
  const today = todayStr();
  const last7 = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    last7.push(d.toISOString().slice(0,10));
  }

  const dayNames = ['So','Mo','Di','Mi','Do','Fr','Sa'];

  // Pouch bar
  const maxCount = Math.max(...last7.map(d => (byDay[d]||[]).length), 1);
  document.getElementById('bar-chart').innerHTML = last7.map(d => {
    const count = (byDay[d]||[]).length;
    const pct = count / maxCount;
    const dayName = dayNames[new Date(d).getDay()];
    const isToday = d === today;
    return `
      <div class="bar-col">
        <span style="font-family:var(--font-mono);font-size:9px;color:var(--text2);margin-bottom:2px">${count||''}</span>
        <div class="bar-bar${isToday?' today':''}" style="height:${Math.max(pct*68,count>0?4:0)}px"></div>
        <span class="bar-label" style="color:${isToday?'var(--accent)':'var(--text3)'}">${isToday?'heute':dayName}</span>
      </div>
    `;
  }).join('');

  // Nicotine bar
  const nicByDay = {};
  state.log.forEach(e => {
    const day = e.timestamp.slice(0,10);
    const p = getPouchById(e.pouchId);
    nicByDay[day] = (nicByDay[day]||0) + (p?p.nicotine:0);
  });
  const maxNic = Math.max(...last7.map(d => nicByDay[d]||0), 1);
  document.getElementById('nic-chart').innerHTML = last7.map(d => {
    const nic = nicByDay[d]||0;
    const pct = nic / maxNic;
    const dayName = dayNames[new Date(d).getDay()];
    const isToday = d === today;
    return `
      <div class="bar-col">
        <span style="font-family:var(--font-mono);font-size:9px;color:var(--text2);margin-bottom:2px">${nic?nic.toFixed(0):''}</span>
        <div class="bar-bar nic${isToday?' today':''}" style="height:${Math.max(pct*68,nic>0?4:0)}px"></div>
        <span class="bar-label" style="color:${isToday?'var(--warn)':'var(--text3)'}">${isToday?'heute':dayName}</span>
      </div>
    `;
  }).join('');
}

// ─── Rauchfrei-Datum bearbeiten ──────────────────────────────────────────────
function openSmokeFreeEdit() {
  const input = document.getElementById('sf-date-input');
  // Aktuelles Datum vorausfüllen (oder heute als Fallback)
  const current = state.smokeFreeStart
    ? new Date(state.smokeFreeStart).toISOString().slice(0,10)
    : new Date().toISOString().slice(0,10);
  input.value = current;
  input.max = new Date().toISOString().slice(0,10); // nicht in der Zukunft
  document.getElementById('modal-smokefree').classList.add('open');
}

function closeSmokeFreeEdit() {
  document.getElementById('modal-smokefree').classList.remove('open');
}

function saveSmokeFreeDate(e) {
  e.preventDefault();
  const val = document.getElementById('sf-date-input').value;
  if (!val) return;
  // Datum auf Mitternacht setzen
  state.smokeFreeStart = val + 'T00:00:00.000Z';
  saveState();
  closeSmokeFreeEdit();
  renderAll();
}

// ─── Render All ───────────────────────────────────────────────────────────────
function renderAll() {
  renderHeader();
  renderRing();
  renderTodayLog();
  renderPouches();
  tickTimer();
}

// ─── Midnight Reset ───────────────────────────────────────────────────────────
function scheduleMidnightReset() {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setDate(midnight.getDate() + 1);
  midnight.setHours(0, 0, 0, 0);
  const ms = midnight - now;
  setTimeout(() => {
    renderAll();
    scheduleMidnightReset();
  }, ms);
}

// ─── Init ─────────────────────────────────────────────────────────────────────
renderAll();
startTimer();
scheduleMidnightReset();

// Pre-populate with sample pouches if none exist
if (state.pouches.length === 0) {
  state.pouches = [
    { id: uid(), name: 'Velo Freeze', nicotine: 10, color: '#3b82f6' },
    { id: uid(), name: 'Velo Citrus', nicotine: 10, color: '#f59e0b' },
    { id: uid(), name: 'Nordic Spirit', nicotine: 9, color: '#10b981' },
  ];
  saveState();
  renderAll();
}
