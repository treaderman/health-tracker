/**
 * Setup — run this once.
 *
 * In the Apps Script editor, pick "setup" from the function dropdown and
 * press Run. It builds every tab, the headers, the summary formulas, the
 * starter saved foods, your settings, and the Protein Clock calendar,
 * then shows you your secret API token.
 *
 * Running it again later is safe. It never deletes your entries and never
 * overwrites settings or saved foods you have changed.
 */

var TAB_ORDER = [
  'Food', 'Fluids', 'Activity', 'Steps', 'Body', 'Symptoms',
  'SavedFoods', 'Settings', 'TargetHistory', 'DailySummary', 'WeeklySummary'
];

var SETTINGS_DEFAULTS = [
  ['cal_min', '1500'],
  ['protein_min', '60'],
  ['fluid_min', '64'],
  ['activity_min_week', '150'],
  ['strength_min_low', '15'],
  ['strength_min_high', '20'],
  ['strength_sessions_low', '2'],
  ['strength_sessions_high', '3'],

  ['cal_low', '2900'],
  ['cal_high', '3000'],
  ['protein_low', '125'],
  ['protein_high', '185'],
  ['fluid_low', '103'],
  ['fluid_high', '124'],

  ['walks_per_week', '3'],
  ['walk_minutes', '20'],
  ['goals_text', '1. Log food, and eat 1 fruit + 1 vegetable each day.\n2. Walk 20 minutes, 3x/week.'],

  ['coke_zero_counts', 'FALSE'],
  ['day_rollover_hour', '3'],
  ['tz', 'America/New_York'],
  ['under_min_amber_after_hour', '18'],

  ['protein_threshold_g', '10'],
  ['protein_window_hours', '5'],
  ['protein_alert_lead_min', '30'],
  ['quiet_start', '22:00'],
  ['quiet_end', '06:00'],
  ['last_protein_reset', ''],
  ['calendar_id', '']
];

var SAVED_FOOD_SEED = [
  ["Chick-fil-A Grilled Nuggets 12ct", "Lunch", 200, 38, "N", "N"],
  ["Chick-fil-A Grilled Cool Wrap", "Lunch", 345, 43, "N", "N"],
  ["Chick-fil-A Market Salad w/ Grilled Chicken", "Lunch", 330, 27, "Y", "Y"],
  ["Wendy's Small Chili", "Lunch", 250, 17, "N", "N"],
  ["Wendy's Grilled Caesar Salad", "Lunch", 320, 31, "N", "Y"],
  ["McDonald's Grilled Chicken Salad (no dressing)", "Lunch", 140, 26, "N", "Y"],
  ["KFC Kentucky Grilled Chicken Breast x2", "Dinner", 420, 76, "N", "N"],
  ["Popeyes Blackened Tenders 5pc", "Lunch", 300, 43, "N", "N"],
  ["Chipotle Salad Bowl, double chicken, fajita veg, salsa", "Dinner", 525, 65, "N", "Y"],
  ["Subway Salad, double chicken, loaded veg", "Lunch", 400, 50, "N", "Y"],
  ["Panera Grilled Chicken Caesar, no croutons", "Lunch", 375, 32, "N", "Y"],
  ["Raising Cane's 3 Naked Tenders", "Lunch", 210, 39, "N", "N"],
  ["Wingstop 5pc Plain Grilled Tenders + veggie side", "Dinner", 330, 44, "N", "Y"],
  ["Whataburger Grilled Chicken Garden Salad", "Lunch", 290, 32, "N", "Y"],
  ["Panda Express Super Greens + Grilled Teriyaki Chicken", "Dinner", 365, 39, "N", "Y"],
  ["Starbucks Spinach Feta Egg White Wrap", "Breakfast", 290, 20, "N", "Y"],

  ["Plain Greek yogurt cup (5.3 oz)", "Snack", 90, 15, "N", "N"],
  ["Tuna packet (2.6 oz)", "Snack", 80, 17, "N", "N"],
  ["Almonds 1/4 cup", "Snack", 170, 6, "N", "N"],
  ["Hard-boiled egg", "Snack", 70, 6, "N", "N"],
  ["String cheese", "Snack", 80, 7, "N", "N"],
  ["Hummus cup + veggies", "Snack", 150, 4, "N", "Y"],
  ["Apple / banana", "Snack", 100, 1, "Y", "N"],
  ["Protein shake (ready-to-drink)", "Snack", 160, 30, "N", "N"]
];

/* ------------------------------------------------------------------ *
 * The one function you run
 * ------------------------------------------------------------------ */

function setup() {
  var ss = ss_();
  var notes = [];

  try { ss.setSpreadsheetTimeZone('America/New_York'); } catch (e) {}

  ensureSheets_(ss);
  var settingsAdded = seedSettings_();
  var foodsAdded = seedSavedFoods_();
  writeSummaryFormulas_();

  var token = ensureToken_();

  var calendarNote;
  try {
    var cal = ensureProteinCalendar_();
    calendarNote = 'Protein Clock calendar ready (' + cal.getName() + ').';
  } catch (e) {
    calendarNote = 'Calendar step skipped: ' + ((e && e.message) || e) +
      '\nRun setup() again after approving calendar access.';
  }

  removeDefaultSheet_(ss);
  reorderTabs_(ss);

  notes.push('Tabs ready: ' + TAB_ORDER.join(', '));
  notes.push('Settings keys added: ' + settingsAdded + ' (existing values left alone)');
  notes.push('Saved foods added: ' + foodsAdded);
  notes.push(calendarNote);

  var message =
    'Setup complete.\n\n' +
    notes.join('\n') +
    '\n\nYOUR API TOKEN:\n' + token +
    '\n\nCopy that into the app Settings screen. Keep it private — anyone with ' +
    'the token and your web app link could write to this sheet.';

  Logger.log(message);
  try { SpreadsheetApp.getUi().alert(message); } catch (e) {}
  return token;
}

/** Shows your token again if you lose it. */
function showToken() {
  var token = ensureToken_();
  var message = 'Your API token:\n\n' + token;
  Logger.log(message);
  try { SpreadsheetApp.getUi().alert(message); } catch (e) {}
  return token;
}

/** Makes a brand new token. The old one stops working immediately. */
function resetToken() {
  var token = generateToken_();
  PropertiesService.getScriptProperties().setProperty(TOKEN_PROP, token);
  var message = 'New API token:\n\n' + token +
    '\n\nThe old token no longer works. Update the app Settings screen.';
  Logger.log(message);
  try { SpreadsheetApp.getUi().alert(message); } catch (e) {}
  return token;
}

/* ------------------------------------------------------------------ *
 * Pieces
 * ------------------------------------------------------------------ */

function ensureSheets_(ss) {
  for (var i = 0; i < TAB_ORDER.length; i++) {
    var name = TAB_ORDER[i];
    if (name === 'DailySummary' || name === 'WeeklySummary') continue;

    var sh = ss.getSheetByName(name) || ss.insertSheet(name);
    var headers = SCHEMA[name];

    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sh.setFrozenRows(1);

    var textCols = TEXT_COLUMNS[name] || [];
    for (var c = 0; c < textCols.length; c++) {
      sh.getRange(2, textCols[c], sh.getMaxRows() - 1, 1).setNumberFormat('@');
    }

    sh.autoResizeColumns(1, headers.length);
  }
}

function seedSettings_() {
  var sh = sheet_('Settings');
  var existing = readSettings_();
  var toAdd = [];
  for (var i = 0; i < SETTINGS_DEFAULTS.length; i++) {
    var key = SETTINGS_DEFAULTS[i][0];
    if (!(key in existing)) toAdd.push([key, SETTINGS_DEFAULTS[i][1]]);
  }
  if (toAdd.length) {
    sh.getRange(sh.getLastRow() + 1, 1, toAdd.length, 2).setValues(toAdd);
  }
  return toAdd.length;
}

function seedSavedFoods_() {
  var sh = sheet_('SavedFoods');
  var existing = {};
  readAll_('SavedFoods').forEach(function (r) { existing[String(r.name).trim()] = true; });

  var toAdd = [];
  for (var i = 0; i < SAVED_FOOD_SEED.length; i++) {
    var s = SAVED_FOOD_SEED[i];
    if (existing[s[0]]) continue;
    toAdd.push([s[0], s[1], s[2], s[3], s[4], s[5], 0]);
  }
  if (toAdd.length) {
    sh.getRange(sh.getLastRow() + 1, 1, toAdd.length, 7).setValues(toAdd);
    sh.autoResizeColumns(1, 7);
  }
  return toAdd.length;
}

function ensureToken_() {
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty(TOKEN_PROP);
  if (!token) {
    token = generateToken_();
    props.setProperty(TOKEN_PROP, token);
  }
  return token;
}

function generateToken_() {
  var alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  var raw = Utilities.getUuid() + Utilities.getUuid() + String(new Date().getTime());
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, raw);
  var out = '';
  for (var i = 0; i < 32; i++) {
    out += alphabet.charAt((digest[i] & 0xFF) % alphabet.length);
  }
  return out;
}

function ensureProteinCalendar_() {
  var found = CalendarApp.getCalendarsByName(PROTEIN_CALENDAR_NAME);
  var cal = (found && found.length) ? found[0] : CalendarApp.createCalendar(PROTEIN_CALENDAR_NAME);
  writeSetting_('calendar_id', cal.getId());
  return cal;
}

function removeDefaultSheet_(ss) {
  var sheets = ss.getSheets();
  if (sheets.length <= 1) return;
  for (var i = 0; i < sheets.length; i++) {
    var name = sheets[i].getName();
    if (name !== 'Sheet1' && name !== 'Sheet 1') continue;
    if (TAB_ORDER.indexOf(name) !== -1) continue;
    if (sheets[i].getLastRow() === 0 && sheets[i].getLastColumn() === 0) {
      ss.deleteSheet(sheets[i]);
      return;
    }
  }
}

function reorderTabs_(ss) {
  for (var i = 0; i < TAB_ORDER.length; i++) {
    var sh = ss.getSheetByName(TAB_ORDER[i]);
    if (!sh) continue;
    ss.setActiveSheet(sh);
    ss.moveActiveSheet(i + 1);
  }
  var first = ss.getSheetByName(TAB_ORDER[0]);
  if (first) ss.setActiveSheet(first);
}

/**
 * Prints what the summary tabs currently show.
 *
 * Run this if a total on the phone ever disagrees with the sheet — it shows
 * exactly what DailySummary and WeeklySummary have worked out.
 */
function checkSummaries() {
  var lines = [];
  var tabs = [
    { name: 'DailySummary', width: DAILY_HEADERS.length },
    { name: 'WeeklySummary', width: WEEKLY_HEADERS.length }
  ];

  for (var t = 0; t < tabs.length; t++) {
    var sh = sheet_(tabs[t].name);
    var lastRow = sh.getLastRow();
    lines.push('== ' + tabs[t].name + ' — ' + Math.max(0, lastRow - 1) + ' row(s) ==');
    if (lastRow < 2) {
      lines.push('(nothing logged yet)');
      lines.push('');
      continue;
    }
    var values = sh.getRange(1, 1, lastRow, tabs[t].width).getValues();
    for (var r = 0; r < values.length; r++) lines.push(values[r].join(' | '));
    lines.push('');
  }

  var out = lines.join('\n');
  Logger.log(out);
  try { SpreadsheetApp.getUi().alert(out); } catch (e) {}
  return out;
}

/* ------------------------------------------------------------------ *
 * Self test — run this to prove the API works before you touch a phone
 * ------------------------------------------------------------------ */

function runSelfTest() {
  var lines = [];
  var id = Utilities.getUuid();
  var today = todayIso_();

  var op = {
    op: 'create',
    sheet: 'Food',
    id: id,
    row: {
      timestamp: nowIso_(),
      date: today,
      meal: 'Snack',
      item: 'SELF TEST — protein shake',
      calories: 160,
      protein_g: 30,
      fruit: 'N',
      vegetable: 'N',
      note: 'created by runSelfTest'
    }
  };

  var first = logOps_({ ops: [op] });
  lines.push('1. First write  -> ' + first.results[0].status + '   (expected: created)');

  var second = logOps_({ ops: [op] });
  lines.push('2. Same id again -> ' + second.results[0].status + '   (expected: duplicate)');

  var clock = first.proteinClock || {};
  lines.push('3. Protein clock -> ' + (clock.scheduled
    ? 'event at ' + clock.atLocal
    : 'not scheduled (' + clock.reason + ')'));

  var boot = bootstrap_({ date: today, days: 7 });
  lines.push('4. Bootstrap     -> ' + boot.food.length + ' food rows, ' +
             boot.savedFoods.length + ' saved foods, ' +
             Object.keys(boot.settings).length + ' settings');

  var cleanup = logOps_({ ops: [{ op: 'delete', sheet: 'Food', id: id }] });
  lines.push('5. Cleanup       -> ' + cleanup.results[0].status + '   (expected: deleted)');

  var report = '\nSELF TEST RESULTS\n\n' + lines.join('\n') +
    '\n\nIf lines 1, 2 and 5 match the expected values, the API is working.';

  Logger.log(report);
  try { SpreadsheetApp.getUi().alert(report); } catch (e) {}
  return report;
}
