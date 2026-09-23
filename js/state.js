/* What the screens read from.
 *
 * Everything is worked out from the last copy of the sheet plus whatever is
 * still sitting in the outbox, so the numbers are right whether or not you
 * have bars. An entry you just logged counts immediately.
 */

const State = (() => {
  const SHEET_OF = {
    food: 'Food', fluids: 'Fluids', activity: 'Activity',
    steps: 'Steps', body: 'Body', symptoms: 'Symptoms',
    savedFoods: 'SavedFoods'
  };

  // What makes a row unique, per kind.
  const KEY_FIELD = {
    food: 'id', fluids: 'id', activity: 'id', body: 'id', symptoms: 'id',
    steps: 'date', savedFoods: 'name'
  };

  const DEFAULTS = {
    cal_min: 1500, protein_min: 60, fluid_min: 64,
    cal_low: 2900, cal_high: 3000,
    protein_low: 125, protein_high: 185,
    fluid_low: 103, fluid_high: 124,
    activity_min_week: 150,
    walks_per_week: 3, walk_minutes: 20,
    strength_sessions_low: 2, strength_sessions_high: 3,
    coke_zero_counts: 'FALSE',
    day_rollover_hour: 3,
    protein_threshold_g: 10,
    protein_window_hours: 5,
    under_min_amber_after_hour: 18,
    goals_text: ''
  };

  let snapshot = null;   // last bootstrap from the sheet
  let pending = [];      // outbox

  function pad(n) { return String(n).padStart(2, '0'); }

  function num(v, fallback) {
    if (v === '' || v === null || v === undefined) return fallback;
    const n = parseFloat(String(v).replace(/,/g, ''));
    return isNaN(n) ? fallback : n;
  }

  function settings() {
    const s = Object.assign({}, DEFAULTS, (snapshot && snapshot.settings) || {});
    return s;
  }

  function setting(key) { return num(settings()[key], DEFAULTS[key]); }

  /** The day an entry belongs to, with the 3 a.m. rollover applied. */
  function dayKey(when) {
    const d = when ? new Date(when.getTime()) : new Date();
    d.setHours(d.getHours() - setting('day_rollover_hour'));
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  /** An ISO timestamp that carries this phone's offset, e.g. 2026-09-22T19:20:11-04:00. */
  function stamp(when) {
    const d = when || new Date();
    const off = -d.getTimezoneOffset();
    const sign = off >= 0 ? '+' : '-';
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
      `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` +
      `${sign}${pad(Math.floor(Math.abs(off) / 60))}:${pad(Math.abs(off) % 60)}`;
  }

  function shiftDay(key, delta) {
    const [y, m, d] = key.split('-').map(Number);
    const x = new Date(Date.UTC(y, m - 1, d));
    x.setUTCDate(x.getUTCDate() + delta);
    return x.toISOString().slice(0, 10);
  }

  /** Sunday that starts the week containing this day. */
  function weekStart(key) {
    const [y, m, d] = key.split('-').map(Number);
    const x = new Date(Date.UTC(y, m - 1, d));
    return shiftDay(key, -x.getUTCDay());
  }

  function setSnapshot(data) { snapshot = data; }
  function getSnapshot() { return snapshot; }
  function setPending(ops) { pending = ops || []; }
  function pendingCount() { return pending.length; }

  /** Rows from the sheet with the outbox applied on top. */
  function rows(kind) {
    const sheet = SHEET_OF[kind];
    const field = KEY_FIELD[kind] || 'id';
    const base = (snapshot && snapshot[kind]) || [];
    const map = new Map();
    base.forEach(r => map.set(String(r[field] == null ? '' : r[field]), r));

    pending.forEach(op => {
      if (op.sheet !== sheet) return;
      const key = String(op.id != null ? op.id : op.key);
      if (op.op === 'delete') { map.delete(key); return; }
      const row = Object.assign({}, op.row || {});
      if (op.id != null) row.id = op.id;
      row._pending = true;
      map.set(key, row);
    });

    return Array.from(map.values());
  }

  function onDay(kind, key) {
    return rows(kind).filter(r => String(r.date) === key);
  }

  function isY(v) {
    return String(v == null ? '' : v).trim().toUpperCase() === 'Y';
  }

  function totals(key) {
    const food = onDay('food', key);
    const fluids = onDay('fluids', key);
    const act = onDay('activity', key);
    const steps = onDay('steps', key);

    let calories = 0, protein = 0, fruit = false, veg = false;
    food.forEach(r => {
      calories += num(r.calories, 0);
      protein += num(r.protein_g, 0);
      if (isY(r.fruit)) fruit = true;
      if (isY(r.vegetable)) veg = true;
    });

    let oz = 0;
    fluids.forEach(r => { if (isY(r.counts_toward_target)) oz += num(r.oz, 0); });

    let walk = 0, strength = 0, other = 0;
    act.forEach(r => {
      const m = num(r.minutes, 0);
      const t = String(r.type || '').toLowerCase();
      if (t === 'walk') walk += m;
      else if (t === 'strength') strength += m;
      else other += m;
    });

    return {
      calories, protein, oz, fruit, veg,
      walk, strength, other,
      activity: walk + strength + other,
      steps: steps.reduce((t, r) => t + num(r.steps, 0), 0)
    };
  }

  /** This week so far: walk days, strength days, total activity minutes. */
  function week(key) {
    const start = weekStart(key);
    let walkDays = 0, strengthDays = 0, minutes = 0;
    for (let i = 0; i < 7; i++) {
      const d = shiftDay(start, i);
      if (d > key) break;
      const t = totals(d);
      if (t.walk > 0) walkDays++;
      if (t.strength > 0) strengthDays++;
      minutes += t.activity;
    }
    return { start, walkDays, strengthDays, minutes };
  }

  /** Most recent protein meal, counting entries still in the outbox. */
  function lastProteinMs() {
    const threshold = setting('protein_threshold_g');
    let best = 0;
    const fromSheet = snapshot && snapshot.lastProtein && snapshot.lastProtein.timestamp;
    if (fromSheet) {
      const ms = Date.parse(fromSheet);
      if (!isNaN(ms)) best = ms;
    }
    rows('food').forEach(r => {
      if (num(r.protein_g, 0) < threshold) return;
      const ms = Date.parse(String(r.timestamp || ''));
      if (!isNaN(ms) && ms > best) best = ms;
    });
    return best || null;
  }

  function sinceText(ms) {
    if (!ms) return 'not yet today';
    const mins = Math.max(0, Math.round((Date.now() - ms) / 60000));
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h <= 0) return `${m}m ago`;
    return `${h}h ${m}m ago`;
  }

  /** Does this drink count toward the fluid target? */
  function drinkCounts(type) {
    if (type === 'Coke Zero') {
      return String(settings().coke_zero_counts).trim().toUpperCase() === 'TRUE' ? 'Y' : 'N';
    }
    return 'Y';
  }

  function mealForNow(d) {
    const h = (d || new Date()).getHours();
    if (h < 10) return 'Breakfast';
    if (h < 15) return 'Lunch';
    if (h < 21) return 'Dinner';
    return 'Snack';
  }

  function savedFoods() {
    return rows('savedFoods')
      .filter(f => String(f.name || '').trim())
      .sort((a, b) => num(b.times_used, 0) - num(a.times_used, 0));
  }

  /** When the sheet says the next protein nudge is due. */
  function proteinAlert() {
    return (snapshot && snapshot.proteinAlert) || null;
  }

  return {
    SHEET_OF, num, isY,
    settings, setting, dayKey, stamp, shiftDay, weekStart,
    setSnapshot, getSnapshot, setPending, pendingCount,
    rows, onDay, totals, week, lastProteinMs, sinceText, proteinAlert,
    drinkCounts, mealForNow, savedFoods
  };
})();
