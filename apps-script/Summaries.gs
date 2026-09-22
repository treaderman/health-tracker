/**
 * DailySummary and WeeklySummary — live formulas.
 *
 * Nothing here writes numbers into the sheet. It writes formulas that
 * recalculate on their own as entries arrive, so the summaries are never
 * stale and never need a "refresh" button.
 *
 * Weeks start on Sunday.
 */

var DAILY_HEADERS = [
  'date', 'calories', 'protein_g', 'fluid_oz', 'fruit', 'vegetable',
  'walk_min', 'strength_min', 'other_min', 'activity_min', 'steps',
  'under_cal_min', 'under_protein_min', 'under_fluid_min', 'week_start'
];

var WEEKLY_HEADERS = [
  'week_start', 'days_logged',
  'avg_calories', 'days_cal_min_hit',
  'avg_protein_g', 'days_protein_min_hit',
  'avg_fluid_oz', 'days_fluid_min_hit',
  'days_fruit', 'days_vegetable',
  'walk_days', 'walk_minutes',
  'strength_days', 'strength_minutes',
  'activity_minutes', 'avg_steps',
  'weight_lb', 'weight_change_lb'
];

/** A setting looked up as a number. */
function setting_(key, fallback) {
  return 'IFERROR(VALUE(VLOOKUP("' + key + '",Settings!$A:$B,2,FALSE)),' + fallback + ')';
}

/** Run a formula once per non-blank date in column A of this tab. */
function perDay_(body) {
  return '=IFERROR(BYROW(FILTER($A$2:$A,$A$2:$A<>""),LAMBDA(d,' + body + ')),"")';
}

/** Run a formula once per non-blank week in column A of this tab. */
function perWeek_(body) {
  return '=IFERROR(BYROW(FILTER($A$2:$A,$A$2:$A<>""),LAMBDA(w,' + body + ')),"")';
}

var SUM_CALORIES = 'SUMIF(Food!$C:$C,d,Food!$F:$F)';
var SUM_PROTEIN  = 'SUMIF(Food!$C:$C,d,Food!$G:$G)';
var SUM_FLUID    = 'SUMIFS(Fluids!$D:$D,Fluids!$C:$C,d,Fluids!$F:$F,"Y")';

/** The last weight recorded inside a date range, or "" if there is none. */
function lastWeightBetween_(fromExpr, toExpr) {
  return 'IFERROR(LOOKUP(2,1/((Body!$B$2:$B>=' + fromExpr + ')*(Body!$B$2:$B<=' + toExpr + ')*(Body!$C$2:$C<>"")),Body!$C$2:$C),"")';
}

function dailyFormulas_() {
  return [
    '=IFERROR(SORT(UNIQUE(TOCOL({Food!C2:C;Fluids!C2:C;Activity!C2:C;Steps!A2:A;Body!B2:B;Symptoms!C2:C},1))),"")',
    perDay_(SUM_CALORIES),
    perDay_(SUM_PROTEIN),
    perDay_(SUM_FLUID),
    perDay_('IF(COUNTIFS(Food!$C:$C,d,Food!$H:$H,"Y")>0,"Y","N")'),
    perDay_('IF(COUNTIFS(Food!$C:$C,d,Food!$I:$I,"Y")>0,"Y","N")'),
    perDay_('SUMIFS(Activity!$E:$E,Activity!$C:$C,d,Activity!$D:$D,"Walk")'),
    perDay_('SUMIFS(Activity!$E:$E,Activity!$C:$C,d,Activity!$D:$D,"Strength")'),
    perDay_('SUMIF(Activity!$C:$C,d,Activity!$E:$E)-SUMIFS(Activity!$E:$E,Activity!$C:$C,d,Activity!$D:$D,"Walk")-SUMIFS(Activity!$E:$E,Activity!$C:$C,d,Activity!$D:$D,"Strength")'),
    perDay_('SUMIF(Activity!$C:$C,d,Activity!$E:$E)'),
    perDay_('SUMIF(Steps!$A:$A,d,Steps!$B:$B)'),
    perDay_('IF(' + SUM_CALORIES + '<' + setting_('cal_min', 0) + ',"Y","N")'),
    perDay_('IF(' + SUM_PROTEIN + '<' + setting_('protein_min', 0) + ',"Y","N")'),
    perDay_('IF(' + SUM_FLUID + '<' + setting_('fluid_min', 0) + ',"Y","N")'),
    perDay_('TEXT(DATEVALUE(d)-WEEKDAY(DATEVALUE(d),1)+1,"yyyy-mm-dd")')
  ];
}

function weeklyFormulas_() {
  var weekEnd = 'TEXT(DATEVALUE(w)+6,"yyyy-mm-dd")';
  var prevStart = 'TEXT(DATEVALUE(w)-7,"yyyy-mm-dd")';
  var prevEnd = 'TEXT(DATEVALUE(w)-1,"yyyy-mm-dd")';

  return [
    '=IFERROR(SORT(UNIQUE(FILTER(DailySummary!$O$2:$O,DailySummary!$O$2:$O<>""))),"")',
    perWeek_('COUNTIF(DailySummary!$O:$O,w)'),
    perWeek_('ROUND(IFERROR(AVERAGEIF(DailySummary!$O:$O,w,DailySummary!$B:$B),0),0)'),
    perWeek_('COUNTIFS(DailySummary!$O:$O,w,DailySummary!$L:$L,"N")'),
    perWeek_('ROUND(IFERROR(AVERAGEIF(DailySummary!$O:$O,w,DailySummary!$C:$C),0),1)'),
    perWeek_('COUNTIFS(DailySummary!$O:$O,w,DailySummary!$M:$M,"N")'),
    perWeek_('ROUND(IFERROR(AVERAGEIF(DailySummary!$O:$O,w,DailySummary!$D:$D),0),1)'),
    perWeek_('COUNTIFS(DailySummary!$O:$O,w,DailySummary!$N:$N,"N")'),
    perWeek_('COUNTIFS(DailySummary!$O:$O,w,DailySummary!$E:$E,"Y")'),
    perWeek_('COUNTIFS(DailySummary!$O:$O,w,DailySummary!$F:$F,"Y")'),
    perWeek_('COUNTIFS(DailySummary!$O:$O,w,DailySummary!$G:$G,">0")'),
    perWeek_('SUMIF(DailySummary!$O:$O,w,DailySummary!$G:$G)'),
    perWeek_('COUNTIFS(DailySummary!$O:$O,w,DailySummary!$H:$H,">0")'),
    perWeek_('SUMIF(DailySummary!$O:$O,w,DailySummary!$H:$H)'),
    perWeek_('SUMIF(DailySummary!$O:$O,w,DailySummary!$J:$J)'),
    perWeek_('IFERROR(ROUND(AVERAGEIFS(DailySummary!$K:$K,DailySummary!$O:$O,w,DailySummary!$K:$K,">0"),0),"")'),
    perWeek_(lastWeightBetween_('w', weekEnd)),
    perWeek_('LET(cw,' + lastWeightBetween_('w', weekEnd) +
             ',pw,' + lastWeightBetween_(prevStart, prevEnd) +
             ',IF(AND(ISNUMBER(cw),ISNUMBER(pw)),ROUND(cw-pw,1),""))')
  ];
}

function writeSummaryFormulas_() {
  writeSummaryTab_('DailySummary', DAILY_HEADERS, dailyFormulas_(), [1, 15]);
  writeSummaryTab_('WeeklySummary', WEEKLY_HEADERS, weeklyFormulas_(), [1]);
}

function writeSummaryTab_(name, headers, formulas, textColumns) {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(name) || ss.insertSheet(name);

  if (sh.getMaxRows() > 1) sh.getRange(2, 1, sh.getMaxRows() - 1, sh.getMaxColumns()).clear();

  sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
  sh.setFrozenRows(1);

  for (var i = 0; i < textColumns.length; i++) {
    sh.getRange(2, textColumns[i], sh.getMaxRows() - 1, 1).setNumberFormat('@');
  }

  for (var c = 0; c < formulas.length; c++) {
    sh.getRange(2, c + 1).setFormula(formulas[c]);
  }

  sh.autoResizeColumns(1, headers.length);
  return sh;
}
