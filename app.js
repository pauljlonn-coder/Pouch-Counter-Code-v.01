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
let deleteTarget = null;    // { type: 'pouch'|'log', id }
let editingPouchId = null;

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

// Gibt YYYY-MM-DD im lokalen Datum zurück (kein UTC-Versatz)
function localDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function todayStr() {
  return localDateStr(new Date());
}

// Parst ein 'YYYY-MM-DD'-String als lokales Datum (nicht UTC)
function parseLocalDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function todayLog() {
  const today = todayStr();
  return state.log.filter(e => localDateStr(new Date(e.timestamp)) === today);
}

function getPouchById(id) {
  return state.pouches.find(p => p.id === id);
}

function formatTime(ms) {
  if (ms < 0) return '–';
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return h + 'h ' + String(m).padStart(2,'0') + 'm';
  if (totalMin < 1) return '< 1 min';
  return m + ' min';
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
  // Menü immer schließen (nicht togglen)
  document.getElementById('hamburger-btn').classList.remove('open');
  document.getElementById('dropdown-menu').classList.remove('open');
  document.getElementById('menu-backdrop').classList.remove('open');
}

// ─── Backfill (vergangenen Tag nachtragen) ────────────────────────────────────
function openBackfill() {
  const now = new Date();
  const dateInput = document.getElementById('bf-date');
  dateInput.max = localDateStr(now);
  dateInput.value = localDateStr(now);

  const timeInput = document.getElementById('bf-time');
  const hh = String(now.getHours()).padStart(2,'0');
  const mm = String(now.getMinutes()).padStart(2,'0');
  timeInput.value = `${hh}:${mm}`;

  initBackfillRows();
  document.getElementById('modal-backfill').classList.add('open');
}

function closeBackfill() {
  document.getElementById('modal-backfill').classList.remove('open');
}

function initBackfillRows() {
  const container = document.getElementById('bf-rows');
  container.innerHTML = '';
  addBackfillRow();
}

function backfillPouchOptions() {
  if (state.pouches.length === 0) return '<option value="">Erst Sorten anlegen</option>';
  return state.pouches.map(p =>
    `<option value="${p.id}">${p.name} (${p.nicotine} mg)</option>`
  ).join('');
}

function addBackfillRow() {
  const container = document.getElementById('bf-rows');
  const row = document.createElement('div');
  row.className = 'backfill-row';
  row.innerHTML = `
    <div class="bf-row-inner">
      <label class="bf-label">
        <span>Pouch</span>
        <select class="bf-pouch-sel" required>
          <option value="" disabled selected>Pouch</option>
          ${backfillPouchOptions()}
        </select>
      </label>
      <label class="bf-label">
        <div class="bf-label-header">
          <span>Anzahl</span>
          <button type="button" class="bf-row-del" onclick="removeBackfillRow(this)" title="Zeile entfernen">×</button>
        </div>
        <input type="number" class="bf-count-inp" placeholder="–" min="1" max="99" required>
      </label>
    </div>
  `;
  container.appendChild(row);
  updateBackfillRowDels();
}

function removeBackfillRow(btn) {
  btn.closest('.backfill-row').remove();
  updateBackfillRowDels();
}

function updateBackfillRowDels() {
  const rows = document.querySelectorAll('.backfill-row');
  rows.forEach(r => {
    r.querySelector('.bf-row-del').style.visibility = rows.length > 1 ? 'visible' : 'hidden';
  });
}

function saveBackfill(e) {
  e.preventDefault();
  const date = document.getElementById('bf-date').value;
  if (!date) return;

  const timeVal = document.getElementById('bf-time').value;
  const hasTime = !!timeVal;

  const rows = document.querySelectorAll('.backfill-row');
  const entries = [];
  for (const row of rows) {
    const pouchId = row.querySelector('.bf-pouch-sel').value;
    const count = parseInt(row.querySelector('.bf-count-inp').value);
    if (!pouchId || isNaN(count) || count < 1) continue;
    entries.push({ pouchId, count });
  }
  if (entries.length === 0) return;

  const [y, mo, d] = date.split('-').map(Number);

  if (hasTime) {
    // Mit Uhrzeit: alle Einträge exakt zu dieser Zeit speichern
    const [th, tm] = timeVal.split(':').map(Number);
    const flat = entries.flatMap(({ pouchId, count }) =>
      Array.from({ length: count }, () => pouchId)
    );
    flat.forEach(pouchId => {
      const ts = new Date(y, mo - 1, d, th, tm, 0).toISOString();
      state.log.push({ id: uid(), pouchId, timestamp: ts });
    });
  } else {
    // Ohne Uhrzeit: gleichmäßig über den Tag verteilen
    const startHour = 8, endHour = 22;
    const span = (endHour - startHour) * 60;
    const flat = entries.flatMap(({ pouchId, count }) =>
      Array.from({ length: count }, () => pouchId)
    );
    flat.sort(() => Math.random() - 0.5);
    flat.forEach((pouchId, i) => {
      const minuteOffset = Math.round((i / Math.max(flat.length - 1, 1)) * span);
      const h = startHour + Math.floor(minuteOffset / 60);
      const m = minuteOffset % 60;
      const ts = new Date(y, mo - 1, d, h, m, 0).toISOString();
      state.log.push({ id: uid(), pouchId, timestamp: ts });
    });
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
    document.getElementById('header-streak').textContent = `${daysSince} Tage rauchfrei`;
  }
}

// ─── Progress Ring (doppelt) ──────────────────────────────────────────────────
function absorptionFactor(entry) {
  if (!entry.removedAt) return 1;
  const ms = new Date(entry.removedAt) - new Date(entry.timestamp);
  return Math.min(ms / (30 * 60 * 1000), 1);
}

function renderRing() {
  const tl = todayLog();

  // Pouches-Anzahl mit partieller Absorption
  const count = tl.reduce((sum, e) => sum + absorptionFactor(e), 0);
  const countDisplay = count === 0 ? '0'
    : count % 1 < 0.05 ? Math.round(count).toString()
    : count.toFixed(1);

  // Äußerer Ring: Pouches
  const limit = state.dayLimit;
  const circOuter = 2 * Math.PI * 84;
  const pctOuter = Math.min(count / limit, 1);
  const ring = document.getElementById('ring-fill');
  ring.style.strokeDasharray = circOuter;
  ring.style.strokeDashoffset = circOuter * (1 - pctOuter);
  ring.style.opacity = pctOuter === 0 ? 0 : 1;
  ring.classList.remove('warn','danger');
  if (pctOuter >= 1) ring.classList.add('danger');
  else if (pctOuter >= 0.75) ring.classList.add('warn');

  // Innerer Ring: Nikotin mit partieller Absorption
  const nicToday = tl.reduce((sum, e) => {
    const p = getPouchById(e.pouchId);
    return sum + (p ? p.nicotine * absorptionFactor(e) : 0);
  }, 0);
  const nicLimit = state.nicLimit || 100;
  const circInner = 2 * Math.PI * 64;
  const pctInner = Math.min(nicToday / nicLimit, 1);
  const ringInner = document.getElementById('ring-fill-inner');
  ringInner.style.strokeDasharray = circInner;
  ringInner.style.strokeDashoffset = circInner * (1 - pctInner);
  ringInner.style.opacity = pctInner === 0 ? 0 : 1;
  ringInner.classList.remove('warn','danger');
  if (pctInner >= 1) ringInner.classList.add('warn');

  document.getElementById('today-count').textContent = countDisplay;
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
  const btn = document.getElementById('pouch-raus-btn');
  if (tl.length === 0) {
    document.getElementById('timer-display').textContent = '–';
    document.getElementById('timer-nicotine').textContent = '';
    btn.style.display = 'none';
    return;
  }
  const last = tl.reduce((a,b) => a.timestamp > b.timestamp ? a : b);
  const elapsed = Date.now() - new Date(last.timestamp).getTime();
  document.getElementById('timer-display').textContent = formatTime(elapsed);
  const pouch = getPouchById(last.pouchId);
  if (pouch) {
    document.getElementById('timer-nicotine').textContent = `${pouch.name} · ${pouch.nicotine} mg Nikotin`;
  }
  // Button nur zeigen wenn letzte Pouch noch nicht rausgenommen wurde
  btn.style.display = last.removedAt ? 'none' : 'inline-block';
}

// ─── Pouch raus ──────────────────────────────────────────────────────────────
function pouchRaus() {
  const tl = todayLog();
  if (tl.length === 0) return;
  const active = tl.filter(e => !e.removedAt);
  if (active.length === 0) return;
  const last = active.reduce((a, b) => a.timestamp > b.timestamp ? a : b);
  const entry = state.log.find(e => e.id === last.id);
  entry.removedAt = new Date().toISOString();
  saveState();
  renderRing();
  renderTodayLog();
  tickTimer();
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

    // Absorbierte mg berechnen
    const factor = absorptionFactor(entry);
    const absorbed = pouch.nicotine * factor;
    const absorbedStr = absorbed % 1 < 0.05
      ? Math.round(absorbed) + ' mg'
      : absorbed.toFixed(1) + ' mg';

    // Dauer anzeigen wenn rausgenommen
    let durationStr = '';
    if (entry.removedAt) {
      const mins = Math.round((new Date(entry.removedAt) - new Date(entry.timestamp)) / 60000);
      durationStr = ` · ${mins} min`;
    }

    const removed = !!entry.removedAt;
    return `
      <div class="log-item${removed ? ' log-item-removed' : ''}">
        <span class="log-dot" style="background:${pouch.color};opacity:${removed ? 0.5 : 1}"></span>
        <div class="log-info">
          <div class="log-name" style="opacity:${removed ? 0.6 : 1}">${pouch.name}</div>
          <div class="log-meta">${absorbedStr} Nikotin${durationStr}</div>
        </div>
        <span class="log-time">${hm}</span>
        <button class="log-del" onclick="askDeleteLogEntry('${entry.id}')" title="Löschen">×</button>
      </div>
    `;
  }).join('');
}

function askDeleteLogEntry(id) {
  deleteTarget = { type: 'log', id };
  document.getElementById('confirm-title').textContent = 'Eintrag löschen?';
  document.getElementById('confirm-text').textContent = 'Diesen Eintrag aus dem heutigen Protokoll entfernen?';
  document.getElementById('modal-confirm').classList.add('open');
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
          <button class="pouch-edit-btn" onclick="openAddPouch('${p.id}')" title="Sorte bearbeiten">✎</button>
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
  if (navigator.vibrate) navigator.vibrate(10);
}

// ─── Add / Edit Pouch Type Modal ──────────────────────────────────────────────
function openAddPouch(editId) {
  editingPouchId = editId || null;
  const isEdit = !!editingPouchId;
  const p = isEdit ? getPouchById(editingPouchId) : null;

  document.getElementById('modal-add-pouch').querySelector('h3').textContent =
    isEdit ? 'Sorte bearbeiten' : 'Neue Sorte';
  document.getElementById('add-pouch-submit').textContent =
    isEdit ? 'Aktualisieren' : 'Speichern';

  document.getElementById('p-name').value = p ? p.name : '';
  document.getElementById('p-nic').value = p ? p.nicotine : '';
  selectedColor = p ? p.color : '#3b82f6';
  document.querySelectorAll('.color-dot').forEach(d => {
    d.classList.toggle('active', d.dataset.color === selectedColor);
  });
  document.getElementById('modal-add-pouch').classList.add('open');
  setTimeout(() => document.getElementById('p-name').focus(), 300);
}

function closeAddPouch() {
  editingPouchId = null;
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

  if (editingPouchId) {
    const p = getPouchById(editingPouchId);
    if (p) { p.name = name; p.nicotine = nicotine; p.color = selectedColor; }
  } else {
    state.pouches.push({ id: uid(), name, nicotine, color: selectedColor });
  }
  saveState();
  closeAddPouch();
  renderPouches();
}

// ─── Delete Pouch ─────────────────────────────────────────────────────────────
function askDelete(id) {
  const p = getPouchById(id);
  if (!p) return;
  deleteTarget = { type: 'pouch', id };
  document.getElementById('confirm-title').textContent = 'Sorte löschen?';
  document.getElementById('confirm-text').textContent =
    `"${p.name}" löschen? Alle Einträge dieser Sorte bleiben in der Statistik erhalten.`;
  document.getElementById('modal-confirm').classList.add('open');
}

function closeConfirm() {
  deleteTarget = null;
  document.getElementById('modal-confirm').classList.remove('open');
}

function confirmDelete() {
  if (!deleteTarget) return;
  if (deleteTarget.type === 'pouch') {
    state.pouches = state.pouches.filter(p => p.id !== deleteTarget.id);
    saveState();
    closeConfirm();
    renderPouches();
  } else if (deleteTarget.type === 'log') {
    state.log = state.log.filter(e => e.id !== deleteTarget.id);
    saveState();
    closeConfirm();
    renderAll();
  }
}

// ─── Stats ────────────────────────────────────────────────────────────────────
function renderStats() {
  // Gruppierung nach lokalem Datum (kein UTC-Versatz)
  const byDay = {};
  state.log.forEach(e => {
    const day = localDateStr(new Date(e.timestamp));
    if (!byDay[day]) byDay[day] = [];
    byDay[day].push(e);
  });

  const days = Object.keys(byDay).sort();
  const totalPouches = state.log.reduce((sum, e) => sum + absorptionFactor(e), 0);
  const totalNic = state.log.reduce((sum, e) => {
    const p = getPouchById(e.pouchId);
    return sum + (p ? p.nicotine * absorptionFactor(e) : 0);
  }, 0);

  // Ø Tragedauer (nur Einträge mit removedAt)
  const removed = state.log.filter(e => e.removedAt);
  const avgDurationEl = document.getElementById('stat-avg-duration');
  if (removed.length > 0) {
    const avgMs = removed.reduce((sum, e) =>
      sum + (new Date(e.removedAt) - new Date(e.timestamp)), 0) / removed.length;
    const avgMin = Math.round(avgMs / 60000);
    avgDurationEl.textContent = avgMin >= 60
      ? `${Math.floor(avgMin/60)}h ${avgMin%60}min`
      : `${avgMin} min`;
  } else {
    avgDurationEl.textContent = '–';
  }

  // Ø über gesamte Zeitspanne (erste Nutzung bis heute), nicht nur aktive Tage
  const numDaysWithEntries = days.length || 1;
  const numDaysRange = days.length === 0 ? 1
    : Math.floor((parseLocalDate(todayStr()) - parseLocalDate(days[0])) / 86400000) + 1;

  document.getElementById('stat-avg-pouches').textContent = (totalPouches / numDaysRange).toFixed(1);
  document.getElementById('stat-avg-nic').textContent = `${(totalNic / numDaysRange).toFixed(1)} mg`;
  document.getElementById('stat-total').textContent = totalPouches;
  document.getElementById('stat-days').textContent = numDaysWithEntries;

  // Bester Tag
  let bestDay = null, bestCount = Infinity;
  days.forEach(d => {
    if (byDay[d].length < bestCount) { bestCount = byDay[d].length; bestDay = d; }
  });
  if (bestDay) {
    const bd = parseLocalDate(bestDay);
    document.getElementById('stat-best-day').textContent =
      `${bestCount} Pouches (${bd.toLocaleDateString('de-DE',{day:'numeric',month:'short'})})`;
  }

  // Rauchfrei
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
    last7.push(localDateStr(d));
  }

  const dayNames = ['So','Mo','Di','Mi','Do','Fr','Sa'];

  // Pouch-Balken
  const maxCount = Math.max(...last7.map(d => (byDay[d]||[]).length), 1);
  document.getElementById('bar-chart').innerHTML = last7.map(d => {
    const count = (byDay[d]||[]).length;
    const pct = count / maxCount;
    const dayName = dayNames[parseLocalDate(d).getDay()];
    const isToday = d === today;
    return `
      <div class="bar-col">
        <span style="font-family:var(--font-mono);font-size:9px;color:var(--text2);margin-bottom:2px">${count||''}</span>
        <div class="bar-bar${isToday?' today':''}" style="height:${Math.max(pct*68,count>0?4:0)}px"></div>
        <span class="bar-label" style="color:${isToday?'var(--accent)':'var(--text3)'}">${isToday?'heute':dayName}</span>
      </div>
    `;
  }).join('');

  // Nikotin-Balken
  const nicByDay = {};
  state.log.forEach(e => {
    const day = localDateStr(new Date(e.timestamp));
    const p = getPouchById(e.pouchId);
    nicByDay[day] = (nicByDay[day]||0) + (p?p.nicotine:0);
  });
  const maxNic = Math.max(...last7.map(d => nicByDay[d]||0), 1);
  document.getElementById('nic-chart').innerHTML = last7.map(d => {
    const nic = nicByDay[d]||0;
    const pct = nic / maxNic;
    const dayName = dayNames[parseLocalDate(d).getDay()];
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

// ─── Rauchfrei-Datum bearbeiten ───────────────────────────────────────────────
function openSmokeFreeEdit() {
  const input = document.getElementById('sf-date-input');
  const current = state.smokeFreeStart
    ? localDateStr(new Date(state.smokeFreeStart))
    : todayStr();
  input.value = current;
  input.max = todayStr();
  document.getElementById('modal-smokefree').classList.add('open');
}

function closeSmokeFreeEdit() {
  document.getElementById('modal-smokefree').classList.remove('open');
}

function saveSmokeFreeDate(e) {
  e.preventDefault();
  const val = document.getElementById('sf-date-input').value;
  if (!val) return;
  // Lokale Mitternacht speichern
  const [y, m, d] = val.split('-').map(Number);
  state.smokeFreeStart = new Date(y, m - 1, d, 0, 0, 0).toISOString();
  saveState();
  closeSmokeFreeEdit();
  renderAll();
}

// ─── Export / Import ──────────────────────────────────────────────────────────
function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `pouchcount_backup_${todayStr()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  toggleMenu();
}

function triggerImport() {
  document.getElementById('import-file-input').click();
}

function importData(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(ev) {
    try {
      const imported = JSON.parse(ev.target.result);
      if (!imported.log || !imported.pouches) {
        alert('Ungültige Backup-Datei.');
        return;
      }
      state = { ...DEFAULT_STATE, ...imported };
      saveState();
      renderAll();
      if (document.getElementById('tab-stats').classList.contains('active')) renderStats();
      alert('Daten erfolgreich importiert!');
    } catch {
      alert('Fehler beim Lesen der Datei.');
    }
  };
  reader.readAsText(file);
  input.value = '';
  toggleMenu();
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

// ─── Keyboard scroll fix (iOS: Eingabefeld nicht hinter Tastatur verstecken) ──
document.querySelectorAll('.modal').forEach(modal => {
  modal.addEventListener('focusin', e => {
    if (e.target.matches('input, select, textarea')) {
      setTimeout(() => e.target.scrollIntoView({ behavior: 'smooth', block: 'center' }), 350);
    }
  });
});

// ─── Service Worker registrieren ─────────────────────────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js')
      .catch(err => console.warn('SW registration failed:', err));
  });
}

// ─── Init ─────────────────────────────────────────────────────────────────────
renderAll();
startTimer();
scheduleMidnightReset();

// Beispiel-Sorten wenn noch keine vorhanden
if (state.pouches.length === 0) {
  state.pouches = [
    { id: uid(), name: 'Velo Freeze', nicotine: 10, color: '#3b82f6' },
    { id: uid(), name: 'Velo Citrus', nicotine: 10, color: '#f59e0b' },
    { id: uid(), name: 'Nordic Spirit', nicotine: 9, color: '#10b981' },
  ];
  saveState();
  renderAll();
}
