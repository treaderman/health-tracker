/**
 * Personal Health Tracker — JSON API
 *
 * This file handles requests coming from the phone app.
 * You should not need to edit anything here. Run setup() once (Setup.gs),
 * then deploy this project as a Web app.
 */

var API_VERSION = '1.0.0';
var TOKEN_PROP = 'API_TOKEN';

/** Columns for every data tab, in order. */
var SCHEMA = {
  Food:          ['id', 'timestamp', 'date', 'meal', 'item', 'calories', 'protein_g', 'fruit', 'vegetable', 'note'],
  Fluids:        ['id', 'timestamp', 'date', 'oz', 'type', 'counts_toward_target'],
  Activity:      ['id', 'timestamp', 'date', 'type', 'minutes', 'note'],
  Steps:         ['date', 'steps'],
  Body:          ['id', 'date', 'weight_lb', 'waist_in'],
  Symptoms:      ['id', 'timestamp', 'date', 'symptom', 'note'],
  SavedFoods:    ['name', 'meal_default', 'calories', 'protein_g', 'fruit', 'vegetable', 'times_used'],
  Settings:      ['key', 'value'],
  TargetHistory: ['date_changed', 'calories_low', 'calories_high', 'protein_low', 'protein_high', 'fluid_low', 'fluid_high', 'goals_text']
};

/** Which column makes a row unique, per tab. */
var KEY_COL = {
  Food: 'id', Fluids: 'id', Activity: 'id', Body: 'id', Symptoms: 'id',
  Steps: 'date', SavedFoods: 'name',
  Settings: 'key', TargetHistory: 'date_changed'
};

/**
 * Columns that must stay plain text.
 *
 * Sheets will happily turn "2026-09-22" into a real date on write, which
 * breaks every formula and filter that expects the string. Setting the cell
 * format to plain text immediately before writing is what stops that.
 */
var TEXT_COLUMNS = {
  Food: [2, 3],
  Fluids: [2, 3],
  Activity: [2, 3],
  Steps: [1],
  Body: [2],
  Symptoms: [2, 3],
  Settings: [2],
  TargetHistory: [1]
};

/** The column that makes a row unique, falling back to the first column. */
function keyCol_(name) {
  return KEY_COL[name] || SCHEMA[name][0];
}

/* ------------------------------------------------------------------ *
 * Entry points
 * ------------------------------------------------------------------ */

function doGet(e) {
  var p = (e && e.parameter) || {};
  return respond_(route_(p.action, p, p));
}

function doPost(e) {
  var body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return respond_({ ok: false, error: 'bad_json' });
  }
  return respond_(route_(body.action, body, body.payload || {}));
}

function route_(action, envelope, payload) {
  try {
    if (!checkToken_(envelope && envelope.token)) return { ok: false, error: 'unauthorized' };
    switch (action) {
      case 'ping':              return { ok: true, version: API_VERSION, serverTime: nowIso_() };
      case 'bootstrap':         return bootstrap_(payload);
      case 'log':               return logOps_(payload);
      case 'saveSettings':      return saveSettings_(payload);
      case 'saveTargets':       return saveTargets_(payload);
      case 'saveFavorite':      return saveFavorite_(payload);
      case 'deleteFavorite':    return deleteFavorite_(payload);
      case 'resetProteinClock': return resetProteinClock_();
      case 'report':            return report_(payload);
      default:                  return { ok: false, error: 'unknown_action' };
    }
  } catch (err) {
    return { ok: false, error: String((err && err.message) || err) };
  }
}

function respond_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ------------------------------------------------------------------ *
 * Token check
 * ------------------------------------------------------------------ */

function checkToken_(supplied) {
  var stored = PropertiesService.getScriptProperties().getProperty(TOKEN_PROP);
  if (!stored) return false;
  var given = String(supplied == null ? '' : supplied);
  if (given.length !== stored.length) return false;
  var diff = 0;
  for (var i = 0; i < stored.length; i++) {
    diff |= given.charCodeAt(i) ^ stored.charCodeAt(i);
  }
  return diff === 0;
}

/* ------------------------------------------------------------------ *
 * Sheet helpers
 * ------------------------------------------------------------------ */

/**
 * The spreadsheet this script writes to.
 *
 * Paste your sheet's id between the quotes. You find it in the sheet's own
 * web address, the long jumble between "/d/" and "/edit":
 *
 *   docs.google.com/spreadsheets/d/THIS_PART_RIGHT_HERE/edit
 *
 * This is not a password — it is just the sheet's name in Google's filing
 * system. Your sheet stays private either way.
 *
 * Leave it blank ('') only if you move this code into a script attached to
 * the sheet itself, in which case it uses whichever sheet it is attached to.
 */
var SPREADSHEET_ID = '';

var _ssCache = null;

function ss_() {
  if (_ssCache) return _ssCache;
  if (SPREADSHEET_ID) {
    _ssCache = SpreadsheetApp.openById(SPREADSHEET_ID);
    return _ssCache;
  }
  _ssCache = SpreadsheetApp.getActive();
  if (!_ssCache) {
    throw new Error('No spreadsheet found. Open Code.gs and set SPREADSHEET_ID ' +
                    'near the top to your sheet id.');
  }
  return _ssCache;
}

function sheet_(name) {
  var sh = ss_().getSheetByName(name);
  if (!sh) throw new Error('Missing tab "' + name + '". Run setup() first.');
  return sh;
}

function setRowTextFormats_(sh, name, rowIndex) {
  var cols = TEXT_COLUMNS[name];
  if (!cols) return;
  for (var i = 0; i < cols.length; i++) {
    sh.getRange(rowIndex, cols[i]).setNumberFormat('@');
  }
}

/** Append a row, keeping date and timestamp columns as plain text. */
function appendRow_(name, values) {
  var sh = sheet_(name);
  var rowIndex = sh.getLastRow() + 1;
  setRowTextFormats_(sh, name, rowIndex);
  sh.getRange(rowIndex, 1, 1, values.length).setValues([values]);
  return rowIndex;
}

/**
 * Turn a real date back into the string we expect.
 *
 * Rows written before the text-format fix, or typed straight into the sheet
 * by hand, come back as Date objects. This makes reads behave the same way
 * whichever happened.
 */
function normalizeCell_(header, v) {
  if (Object.prototype.toString.call(v) !== '[object Date]') return v;
  if (header === 'timestamp') return Utilities.formatDate(v, tz_(), "yyyy-MM-dd'T'HH:mm:ssXXX");
  if (header === 'date' || header === 'date_changed') return Utilities.formatDate(v, tz_(), 'yyyy-MM-dd');
  return v;
}

function readAll_(name) {
  var sh = sheet_(name);
  var last = sh.getLastRow();
  if (last < 2) return [];
  var headers = SCHEMA[name];
  var values = sh.getRange(2, 1, last - 1, headers.length).getValues();
  var key = keyCol_(name);
  var out = [];
  for (var i = 0; i < values.length; i++) {
    var row = { _row: i + 2 };
    for (var c = 0; c < headers.length; c++) row[headers[c]] = normalizeCell_(headers[c], values[i][c]);
    if (String(row[key] == null ? '' : row[key]) !== '') out.push(row);
  }
  return out;
}

function stripRow_(r) {
  var o = {};
  for (var k in r) if (k !== '_row') o[k] = r[k];
  return o;
}

function getIndex_(name, cache) {
  if (cache[name]) return cache[name];
  var sh = sheet_(name);
  var last = sh.getLastRow();
  var map = {};
  if (last >= 2) {
    var col = SCHEMA[name].indexOf(keyCol_(name)) + 1;
    var vals = sh.getRange(2, col, last - 1, 1).getValues();
    for (var i = 0; i < vals.length; i++) {
      var k = String(vals[i][0] == null ? '' : vals[i][0]);
      if (k) map[k] = i + 2;
    }
  }
  cache[name] = map;
  return map;
}

function num_(v, fallback) {
  if (v === '' || v === null || v === undefined) return fallback;
  var n = parseFloat(String(v).replace(/,/g, ''));
  return isNaN(n) ? fallback : n;
}

function yn_(v) {
  var s = String(v == null ? '' : v).trim().toUpperCase();
  return (s === 'Y' || s === 'YES' || s === 'TRUE') ? 'Y' : 'N';
}

var _tzCache = null;

function tz_() {
  if (_tzCache) return _tzCache;
  _tzCache = Session.getScriptTimeZone();
  try {
    var s = readSettings_();
    if (s.tz) _tzCache = String(s.tz);
  } catch (e) {}
  return _tzCache;
}

function nowIso_() {
  return Utilities.formatDate(new Date(), tz_(), "yyyy-MM-dd'T'HH:mm:ssXXX");
}

function todayIso_() {
  return Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd');
}

/** Add days to a "YYYY-MM-DD" string without any timezone drift. */
function shiftDate_(iso, deltaDays) {
  var p = String(iso).split('-');
  var d = new Date(Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2])));
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

/* ------------------------------------------------------------------ *
 * Settings
 * ------------------------------------------------------------------ */

function readSettings_() {
  var sh = ss_().getSheetByName('Settings');
  if (!sh) return {};
  var last = sh.getLastRow();
  if (last < 2) return {};
  var vals = sh.getRange(2, 1, last - 1, 2).getValues();
  var out = {};
  for (var i = 0; i < vals.length; i++) {
    var k = String(vals[i][0] == null ? '' : vals[i][0]).trim();
    if (k) out[k] = vals[i][1];
  }
  return out;
}

function writeSetting_(key, value) {
  var sh = sheet_('Settings');
  var last = sh.getLastRow();
  if (last >= 2) {
    var vals = sh.getRange(2, 1, last - 1, 1).getValues();
    for (var i = 0; i < vals.length; i++) {
      if (String(vals[i][0]).trim() === key) {
        sh.getRange(i + 2, 2).setValue(value);
        return;
      }
    }
  }
  appendRow_('Settings', [key, value]);
}

function saveSettings_(payload) {
  var incoming = (payload && payload.settings) || {};
  var n = 0;
  for (var k in incoming) {
    if (k === 'calendar_id') continue;
    writeSetting_(k, incoming[k]);
    n++;
  }
  return { ok: true, updated: n, settings: readSettings_() };
}

var TARGET_KEYS = ['cal_low', 'cal_high', 'protein_low', 'protein_high', 'fluid_low', 'fluid_high'];

function saveTargets_(payload) {
  var t = (payload && payload.targets) || {};
  for (var i = 0; i < TARGET_KEYS.length; i++) {
    var k = TARGET_KEYS[i];
    if (t[k] !== undefined && t[k] !== null && t[k] !== '') writeSetting_(k, t[k]);
  }
  if (t.goals_text !== undefined) writeSetting_('goals_text', t.goals_text);

  var current = readSettings_();
  var when = String((payload && payload.date) || todayIso_());
  appendRow_('TargetHistory', [
    when,
    current.cal_low, current.cal_high,
    current.protein_low, current.protein_high,
    current.fluid_low, current.fluid_high,
    current.goals_text
  ]);
  return { ok: true, settings: current, historyDate: when };
}

/* ------------------------------------------------------------------ *
 * Saved foods
 * ------------------------------------------------------------------ */

function saveFavorite_(payload) {
  var f = (payload && payload.food) || {};
  var name = String(f.name || '').trim();
  if (!name) return { ok: false, error: 'missing_name' };
  var cache = {};
  applyOp_({
    op: 'upsert', sheet: 'SavedFoods', key: name,
    row: {
      name: name,
      meal_default: f.meal_default || 'Snack',
      calories: num_(f.calories, 0),
      protein_g: num_(f.protein_g, 0),
      fruit: yn_(f.fruit),
      vegetable: yn_(f.vegetable),
      times_used: num_(f.times_used, 0)
    }
  }, cache);
  return { ok: true, savedFoods: readAll_('SavedFoods').map(stripRow_) };
}

function deleteFavorite_(payload) {
  var name = String((payload && payload.name) || '').trim();
  if (!name) return { ok: false, error: 'missing_name' };
  var cache = {};
  var r = applyOp_({ op: 'delete', sheet: 'SavedFoods', key: name }, cache);
  return { ok: true, status: r.status, savedFoods: readAll_('SavedFoods').map(stripRow_) };
}

function bumpFavoriteUse_(itemName) {
  var name = String(itemName || '').trim();
  if (!name) return;
  var sh = ss_().getSheetByName('SavedFoods');
  if (!sh) return;
  var last = sh.getLastRow();
  if (last < 2) return;
  var names = sh.getRange(2, 1, last - 1, 1).getValues();
  for (var i = 0; i < names.length; i++) {
    if (String(names[i][0]).trim() === name) {
      var cell = sh.getRange(i + 2, 7);
      cell.setValue(num_(cell.getValue(), 0) + 1);
      return;
    }
  }
}

/* ------------------------------------------------------------------ *
 * Writing entries
 * ------------------------------------------------------------------ */

function logOps_(payload) {
  var ops = (payload && payload.ops) || [];
  if (!ops.length) return { ok: true, results: [] };

  var lock = LockService.getScriptLock();
  lock.waitLock(25000);

  var results = [];
  var touchedFood = false;
  var newFoodItems = [];

  try {
    var cache = {};
    for (var i = 0; i < ops.length; i++) {
      var op = ops[i];
      try {
        var r = applyOp_(op, cache);
        results.push(r);
        if (op.sheet === 'Food') {
          touchedFood = true;
          if (r.status === 'created' && op.row && op.row.item) newFoodItems.push(op.row.item);
        }
      } catch (err) {
        results.push({
          id: (op && (op.id || op.key)) || null,
          status: 'error',
          error: String((err && err.message) || err)
        });
      }
    }
  } finally {
    lock.releaseLock();
  }

  for (var j = 0; j < newFoodItems.length; j++) {
    try { bumpFavoriteUse_(newFoodItems[j]); } catch (e) {}
  }

  var clock = null;
  if (touchedFood) {
    try { clock = rescheduleProteinClock_(); }
    catch (e) { clock = { scheduled: false, reason: 'error', error: String((e && e.message) || e) }; }
  }

  return { ok: true, results: results, proteinClock: clock, serverTime: nowIso_() };
}

function applyOp_(op, cache) {
  var name = op && op.sheet;
  if (!SCHEMA[name]) throw new Error('unknown_sheet:' + name);

  var keyCol = keyCol_(name);
  var key = String(
    op.id != null ? op.id :
    op.key != null ? op.key :
    (op.row && op.row[keyCol] != null ? op.row[keyCol] : '')
  ).trim();
  if (!key) throw new Error('missing_key');

  var mode = op.op || 'create';
  var index = getIndex_(name, cache);
  var existingRow = index[key];
  var sh = sheet_(name);

  if (mode === 'delete') {
    if (!existingRow) return { id: key, status: 'missing' };
    sh.deleteRow(existingRow);
    delete cache[name];
    return { id: key, status: 'deleted' };
  }

  if (mode === 'create' && existingRow) return { id: key, status: 'duplicate' };
  if (mode === 'update' && !existingRow) return { id: key, status: 'missing' };

  var row = buildRow_(name, op.row || {}, keyCol, key);

  if (existingRow) {
    setRowTextFormats_(sh, name, existingRow);
    sh.getRange(existingRow, 1, 1, row.length).setValues([row]);
    return { id: key, status: 'updated' };
  }

  index[key] = appendRow_(name, row);
  return { id: key, status: 'created' };
}

function buildRow_(name, data, keyCol, key) {
  var headers = SCHEMA[name];
  var row = [];
  for (var i = 0; i < headers.length; i++) {
    var h = headers[i];
    if (h === keyCol) { row.push(key); continue; }
    var v = data[h];
    row.push((v === undefined || v === null) ? '' : v);
  }
  return row;
}

/* ------------------------------------------------------------------ *
 * Reading for the app
 * ------------------------------------------------------------------ */

function bootstrap_(p) {
  var days = Math.max(1, Math.min(90, parseInt((p && p.days) || 7, 10) || 7));
  var today = String((p && p.date) || todayIso_());
  var from = shiftDate_(today, -(days - 1));
  var settings = readSettings_();

  function recent(name) {
    var rows = readAll_(name);
    var out = [];
    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i].date) >= from) out.push(stripRow_(rows[i]));
    }
    return out;
  }

  return {
    ok: true,
    version: API_VERSION,
    serverTime: nowIso_(),
    from: from,
    to: today,
    settings: settings,
    savedFoods: readAll_('SavedFoods').map(stripRow_),
    food: recent('Food'),
    fluids: recent('Fluids'),
    activity: recent('Activity'),
    steps: recent('Steps'),
    body: recent('Body'),
    symptoms: recent('Symptoms'),
    lastProtein: lastProteinInfo_(settings)
  };
}

function lastProteinInfo_(settings) {
  settings = settings || readSettings_();
  var threshold = num_(settings.protein_threshold_g, 10);
  var rows = readAll_('Food');
  var bestMs = 0;
  var bestIso = '';
  for (var i = 0; i < rows.length; i++) {
    if (num_(rows[i].protein_g, 0) < threshold) continue;
    var iso = String(rows[i].timestamp || '');
    var ms = Date.parse(iso);
    if (!isNaN(ms) && ms > bestMs) { bestMs = ms; bestIso = iso; }
  }
  var resetIso = String(settings.last_protein_reset || '');
  var resetMs = Date.parse(resetIso);
  if (!isNaN(resetMs) && resetMs > bestMs) { bestMs = resetMs; bestIso = resetIso; }
  return {
    timestamp: bestIso || null,
    thresholdG: threshold,
    windowHours: num_(settings.protein_window_hours, 5)
  };
}

/* ------------------------------------------------------------------ *
 * Visit report
 * ------------------------------------------------------------------ */

function report_(p) {
  var to = String((p && p.to) || todayIso_());
  var from = String((p && p.from) || shiftDate_(to, -13));
  var settings = readSettings_();

  function within(d) { var s = String(d); return s >= from && s <= to; }

  var food = readAll_('Food').filter(function (r) { return within(r.date); });
  var fluids = readAll_('Fluids').filter(function (r) { return within(r.date); });
  var activity = readAll_('Activity').filter(function (r) { return within(r.date); });
  var steps = readAll_('Steps').filter(function (r) { return within(r.date); });
  var body = readAll_('Body').filter(function (r) { return within(r.date); });
  var symptoms = readAll_('Symptoms').filter(function (r) { return within(r.date); });

  var days = {};
  function day(d) {
    var k = String(d);
    if (!days[k]) days[k] = { date: k, calories: 0, protein_g: 0, fluid_oz: 0, fruit: false, vegetable: false, walk_min: 0, strength_min: 0, other_min: 0, steps: 0 };
    return days[k];
  }

  food.forEach(function (r) {
    var d = day(r.date);
    d.calories += num_(r.calories, 0);
    d.protein_g += num_(r.protein_g, 0);
    if (yn_(r.fruit) === 'Y') d.fruit = true;
    if (yn_(r.vegetable) === 'Y') d.vegetable = true;
  });
  fluids.forEach(function (r) {
    if (yn_(r.counts_toward_target) === 'Y') day(r.date).fluid_oz += num_(r.oz, 0);
  });
  activity.forEach(function (r) {
    var d = day(r.date);
    var t = String(r.type || '').toLowerCase();
    var m = num_(r.minutes, 0);
    if (t === 'walk') d.walk_min += m;
    else if (t === 'strength') d.strength_min += m;
    else d.other_min += m;
  });
  steps.forEach(function (r) { day(r.date).steps += num_(r.steps, 0); });

  var list = Object.keys(days).sort().map(function (k) { return days[k]; });
  var n = list.length || 1;

  function avg(f) {
    var t = 0;
    list.forEach(function (d) { t += f(d); });
    return t / n;
  }
  function count(f) {
    var c = 0;
    list.forEach(function (d) { if (f(d)) c++; });
    return c;
  }

  var calMin = num_(settings.cal_min, 1500);
  var proMin = num_(settings.protein_min, 60);
  var fluMin = num_(settings.fluid_min, 64);

  var weights = body
    .filter(function (r) { return num_(r.weight_lb, 0) > 0; })
    .sort(function (a, b) { return String(a.date) < String(b.date) ? -1 : 1; });

  var symptomCounts = {};
  symptoms.forEach(function (r) {
    var s = String(r.symptom || '').trim();
    if (!s) return;
    symptomCounts[s] = (symptomCounts[s] || 0) + 1;
  });

  return {
    ok: true,
    from: from,
    to: to,
    daysWithData: list.length,
    days: list,
    averages: {
      calories: Math.round(avg(function (d) { return d.calories; })),
      protein_g: Math.round(avg(function (d) { return d.protein_g; })),
      fluid_oz: Math.round(avg(function (d) { return d.fluid_oz; })),
      steps: Math.round(avg(function (d) { return d.steps; })),
      activity_min: Math.round(avg(function (d) { return d.walk_min + d.strength_min + d.other_min; }))
    },
    daysHit: {
      calories_min: count(function (d) { return d.calories >= calMin; }),
      protein_min: count(function (d) { return d.protein_g >= proMin; }),
      fluid_min: count(function (d) { return d.fluid_oz >= fluMin; }),
      calories_in_range: count(function (d) { return d.calories >= num_(settings.cal_low, 0) && d.calories <= num_(settings.cal_high, 1e9); }),
      protein_in_range: count(function (d) { return d.protein_g >= num_(settings.protein_low, 0) && d.protein_g <= num_(settings.protein_high, 1e9); }),
      fluid_in_range: count(function (d) { return d.fluid_oz >= num_(settings.fluid_low, 0) && d.fluid_oz <= num_(settings.fluid_high, 1e9); }),
      fruit: count(function (d) { return d.fruit; }),
      vegetable: count(function (d) { return d.vegetable; }),
      walk: count(function (d) { return d.walk_min > 0; }),
      strength: count(function (d) { return d.strength_min > 0; })
    },
    totals: {
      activity_min: list.reduce(function (t, d) { return t + d.walk_min + d.strength_min + d.other_min; }, 0),
      walk_min: list.reduce(function (t, d) { return t + d.walk_min; }, 0),
      strength_min: list.reduce(function (t, d) { return t + d.strength_min; }, 0)
    },
    weight: {
      start: weights.length ? num_(weights[0].weight_lb, null) : null,
      end: weights.length ? num_(weights[weights.length - 1].weight_lb, null) : null,
      change: weights.length > 1
        ? Math.round((num_(weights[weights.length - 1].weight_lb, 0) - num_(weights[0].weight_lb, 0)) * 10) / 10
        : null,
      entries: weights.map(function (r) { return { date: String(r.date), weight_lb: num_(r.weight_lb, null), waist_in: num_(r.waist_in, null) }; })
    },
    symptoms: Object.keys(symptomCounts).map(function (k) { return { symptom: k, count: symptomCounts[k] }; })
      .sort(function (a, b) { return b.count - a.count; }),
    settings: settings
  };
}
