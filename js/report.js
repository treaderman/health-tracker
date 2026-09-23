/* Week view and the visit report.
 *
 * The week is worked out on the phone from what it already has, so it opens
 * with no signal. The visit report asks the sheet, because it can cover any
 * range you like and the phone only keeps the recent days.
 */

const Report = (() => {
  const $ = sel => document.querySelector(sel);

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function whole(n) { return Math.round(Number(n) || 0); }
  function comma(n) { return whole(n).toLocaleString(); }

  /** "Tue Sep 22" from "2026-09-22", without timezone surprises. */
  function dayLabel(key, opts) {
    const [y, m, d] = String(key).split('-').map(Number);
    const date = new Date(y, m - 1, d);
    return date.toLocaleDateString(undefined, opts || { weekday: 'short', month: 'short', day: 'numeric' });
  }

  function rangeLabel(from, to) {
    return dayLabel(from, { month: 'short', day: 'numeric' }) + ' – ' +
           dayLabel(to, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  /* ---------------- week ---------------- */

  function renderWeek() {
    const today = State.dayKey();
    const s = State.settings();
    const calMin = State.setting('cal_min');
    const proMin = State.setting('protein_min');
    const fluMin = State.setting('fluid_min');

    // the Sunday-start week, for the summary
    const start = State.weekStart(today);
    const weekDays = [];
    for (let i = 0; i < 7; i++) {
      const d = State.shiftDay(start, i);
      if (d > today) break;
      weekDays.push(d);
    }

    let logged = 0, cal = 0, pro = 0, oz = 0;
    let calHit = 0, proHit = 0, fluHit = 0, fruit = 0, veg = 0;
    let walkDays = 0, strengthDays = 0, minutes = 0;

    weekDays.forEach(d => {
      const t = State.totals(d);
      const any = t.calories || t.protein || t.oz || t.activity || t.steps;
      if (!any) return;
      logged++;
      cal += t.calories; pro += t.protein; oz += t.oz;
      if (t.calories >= calMin) calHit++;
      if (t.protein >= proMin) proHit++;
      if (t.oz >= fluMin) fluHit++;
      if (t.fruit) fruit++;
      if (t.veg) veg++;
      if (t.walk > 0) walkDays++;
      if (t.strength > 0) strengthDays++;
      minutes += t.activity;
    });

    const n = logged || 1;
    const walkTarget = whole(State.setting('walks_per_week'));
    const strengthTarget = whole(State.setting('strength_sessions_low'));
    const minTarget = whole(State.setting('activity_min_week'));

    $('#week-summary').innerHTML =
      '<span class="label">This week so far</span>' +
      '<p class="note">Since ' + esc(dayLabel(start)) + ' · ' + logged + (logged === 1 ? ' day' : ' days') + ' logged</p>' +
      '<div class="tiles" style="margin:10px 0 4px">' +
        tile('Calories', comma(cal / n), 'avg') +
        tile('Protein', comma(pro / n) + 'g', 'avg') +
        tile('Fluids', comma(oz / n) + 'oz', 'avg') +
      '</div>' +
      '<div class="kv">' +
        kv('Days at or above calorie minimum', calHit + ' of ' + logged) +
        kv('Days at or above protein minimum', proHit + ' of ' + logged) +
        kv('Days at or above fluid minimum', fluHit + ' of ' + logged) +
        kv('Days with a fruit', fruit + ' of ' + logged) +
        kv('Days with a vegetable', veg + ' of ' + logged) +
        kv('Walks', walkDays + ' of ' + walkTarget) +
        kv('Strength sessions', strengthDays + ' of ' + strengthTarget) +
        kv('Activity minutes', whole(minutes) + ' of ' + minTarget) +
      '</div>';

    // last seven days, newest first
    const rows = [];
    for (let i = 0; i < 7; i++) rows.push(State.shiftDay(today, -i));

    $('#week-days').innerHTML = rows.map(d => {
      const t = State.totals(d);
      const any = t.calories || t.protein || t.oz || t.activity || t.steps;
      if (!any) {
        return '<div class="card day"><div class="row"><span class="d">' + esc(dayLabel(d)) +
               '</span><span class="note">nothing logged</span></div></div>';
      }

      const under = [];
      if (t.calories < calMin) under.push('calories');
      if (t.protein < proMin) under.push('protein');
      if (t.oz < fluMin) under.push('fluids');

      const marks = [
        '<span class="mark' + (t.fruit ? ' on' : '') + '">Fruit</span>',
        '<span class="mark' + (t.veg ? ' on' : '') + '">Veg</span>'
      ].join(' ');

      const bits = [];
      if (t.walk) bits.push(whole(t.walk) + ' min walk');
      if (t.strength) bits.push(whole(t.strength) + ' min strength');
      if (t.other) bits.push(whole(t.other) + ' min other');
      if (t.steps) bits.push(comma(t.steps) + ' steps');

      return '<div class="card day">' +
        '<div class="row"><span class="d">' + esc(dayLabel(d)) + '</span>' +
        (under.length ? '<span class="under">under ' + esc(under.join(', ')) + '</span>' : '') +
        '</div>' +
        '<div class="nums">' + comma(t.calories) + ' cal &middot; ' + comma(t.protein) + ' g &middot; ' + comma(t.oz) + ' oz</div>' +
        '<div class="row tight"><div class="marks">' + marks + '</div></div>' +
        (bits.length ? '<div class="note">' + esc(bits.join(' · ')) + '</div>' : '') +
        '</div>';
    }).join('');
  }

  function tile(k, v, of) {
    return '<div class="tile"><div class="k">' + esc(k) + '</div><div class="v">' + esc(v) +
           '<span class="of"> ' + esc(of) + '</span></div></div>';
  }

  function kv(k, v) {
    return '<div><span>' + esc(k) + '</span><span>' + esc(v) + '</span></div>';
  }

  /* ---------------- visit report ---------------- */

  let lastReport = null;

  function defaultRange() {
    const to = State.dayKey();
    return { from: State.shiftDay(to, -13), to };
  }

  function setRange(days) {
    const to = State.dayKey();
    $('#rp-from').value = State.shiftDay(to, -(days - 1));
    $('#rp-to').value = to;
  }

  async function run() {
    const from = $('#rp-from').value;
    const to = $('#rp-to').value;
    if (!from || !to) { UI.toast('Pick both dates'); return; }
    if (from > to) { UI.toast('The first date is after the second'); return; }
    if (!API.configured()) { UI.toast('Connect in Settings first'); return; }

    $('#rp-out').innerHTML = '<p class="note">Asking the sheet…</p>';
    $('#rp-actions').hidden = true;

    try {
      const data = await API.get('report', { from, to });
      if (!data || !data.ok) { $('#rp-out').innerHTML = '<p class="note">The sheet could not build that.</p>'; return; }
      lastReport = data;
      $('#rp-out').innerHTML = build(data);
      $('#rp-actions').hidden = false;
    } catch (err) {
      lastReport = null;
      $('#rp-out').innerHTML = '<p class="note">' + esc(UI.friendlyError(err.message)) + '</p>';
    }
  }

  function build(d) {
    const s = d.settings || {};
    const n = d.daysWithData || 0;
    const a = d.averages || {};
    const hit = d.daysHit || {};
    const w = d.weight || {};

    const target = (low, high, unit) =>
      low && high ? ' <span class="t">target ' + comma(low) + '–' + comma(high) + (unit ? ' ' + unit : '') + '</span>' : '';

    const avgRows =
      line('Calories', comma(a.calories), target(s.cal_low, s.cal_high)) +
      line('Protein', comma(a.protein_g) + ' g', target(s.protein_low, s.protein_high, 'g')) +
      line('Fluids', comma(a.fluid_oz) + ' oz', target(s.fluid_low, s.fluid_high, 'oz')) +
      line('Steps', comma(a.steps), '') +
      line('Activity', comma(a.activity_min) + ' min/day', '');

    const ofN = v => (v == null ? '—' : v + ' of ' + n);
    const hitRows =
      line('Calories at or above ' + comma(s.cal_min || 0), ofN(hit.calories_min), '') +
      line('Protein at or above ' + comma(s.protein_min || 0) + ' g', ofN(hit.protein_min), '') +
      line('Fluids at or above ' + comma(s.fluid_min || 0) + ' oz', ofN(hit.fluid_min), '') +
      line('Calories inside target range', ofN(hit.calories_in_range), '') +
      line('Protein inside target range', ofN(hit.protein_in_range), '') +
      line('Fluids inside target range', ofN(hit.fluid_in_range), '') +
      line('A fruit', ofN(hit.fruit), '') +
      line('A vegetable', ofN(hit.vegetable), '') +
      line('A walk', ofN(hit.walk), '') +
      line('A strength session', ofN(hit.strength), '');

    const t = d.totals || {};
    const activityRows =
      line('Total activity', comma(t.activity_min) + ' min', '') +
      line('Walking', comma(t.walk_min) + ' min', '') +
      line('Strength', comma(t.strength_min) + ' min', '') +
      line('Weekly activity target', comma(s.activity_min_week || 150) + ' min', '');

    let weightBlock = '<p class="note">No weigh-ins in this range.</p>';
    if (w.start != null && w.end != null) {
      const change = w.change;
      const arrow = change == null ? '' : (change < 0 ? 'down ' : (change > 0 ? 'up ' : ''));
      weightBlock = '<div class="rp-kv">' +
        line('First', comma(w.start) + ' lb', '') +
        line('Latest', comma(w.end) + ' lb', '') +
        line('Change', change == null ? '—' : arrow + Math.abs(change) + ' lb', '') +
        '</div>';
    }

    const symptoms = (d.symptoms || []).length
      ? '<div class="rp-kv">' + d.symptoms.map(x => line(x.symptom, x.count + (x.count === 1 ? ' day' : ' days'), '')).join('') + '</div>'
      : '<p class="note">None recorded.</p>';

    const dayRows = (d.days || []).map(day =>
      '<tr><td>' + esc(dayLabel(day.date, { month: 'short', day: 'numeric' })) + '</td>' +
      '<td>' + comma(day.calories) + '</td>' +
      '<td>' + comma(day.protein_g) + '</td>' +
      '<td>' + comma(day.fluid_oz) + '</td>' +
      '<td>' + (day.fruit ? 'Y' : '–') + '</td>' +
      '<td>' + (day.vegetable ? 'Y' : '–') + '</td>' +
      '<td>' + comma(day.walk_min + day.strength_min + day.other_min) + '</td>' +
      '<td>' + (day.steps ? comma(day.steps) : '–') + '</td></tr>').join('');

    return '<article class="rp">' +
      '<header class="rp-head"><h2>Health Tracker &mdash; visit report</h2>' +
      '<p>' + esc(rangeLabel(d.from, d.to)) + ' &middot; ' + n + (n === 1 ? ' day' : ' days') + ' with entries</p></header>' +

      '<section><h3>Daily averages</h3><div class="rp-kv">' + avgRows + '</div></section>' +
      '<section><h3>Days on target</h3><div class="rp-kv">' + hitRows + '</div></section>' +
      '<section><h3>Activity</h3><div class="rp-kv">' + activityRows + '</div></section>' +
      '<section><h3>Weight</h3>' + weightBlock + '</section>' +
      '<section><h3>Symptoms</h3>' + symptoms + '</section>' +

      (dayRows ? '<section class="rp-table"><h3>Day by day</h3><table>' +
        '<thead><tr><th>Date</th><th>Cal</th><th>Pro</th><th>Oz</th><th>Fr</th><th>Vg</th><th>Min</th><th>Steps</th></tr></thead>' +
        '<tbody>' + dayRows + '</tbody></table></section>' : '') +
      '</article>';
  }

  function line(k, v, extra) {
    return '<div><span>' + esc(k) + '</span><span>' + esc(v) + (extra || '') + '</span></div>';
  }

  /** The same report as plain text, for pasting into an email or Notes. */
  function asText() {
    if (!lastReport) return '';
    const d = lastReport, a = d.averages || {}, hit = d.daysHit || {}, w = d.weight || {};
    const n = d.daysWithData || 0;
    const L = [];
    L.push('HEALTH TRACKER - VISIT REPORT');
    L.push(rangeLabel(d.from, d.to) + '  (' + n + ' days with entries)');
    L.push('');
    L.push('DAILY AVERAGES');
    L.push('  Calories   ' + comma(a.calories));
    L.push('  Protein    ' + comma(a.protein_g) + ' g');
    L.push('  Fluids     ' + comma(a.fluid_oz) + ' oz');
    L.push('  Steps      ' + comma(a.steps));
    L.push('  Activity   ' + comma(a.activity_min) + ' min/day');
    L.push('');
    L.push('DAYS ON TARGET (of ' + n + ')');
    L.push('  Calories at or above minimum   ' + hit.calories_min);
    L.push('  Protein at or above minimum    ' + hit.protein_min);
    L.push('  Fluids at or above minimum     ' + hit.fluid_min);
    L.push('  Fruit                          ' + hit.fruit);
    L.push('  Vegetable                      ' + hit.vegetable);
    L.push('  A walk                         ' + hit.walk);
    L.push('  A strength session             ' + hit.strength);
    L.push('');
    if (w.start != null && w.end != null) {
      L.push('WEIGHT');
      L.push('  ' + comma(w.start) + ' lb -> ' + comma(w.end) + ' lb  (change ' +
             (w.change == null ? '-' : w.change) + ' lb)');
      L.push('');
    }
    if ((d.symptoms || []).length) {
      L.push('SYMPTOMS');
      d.symptoms.forEach(x => L.push('  ' + x.symptom + ' - ' + x.count));
      L.push('');
    }
    return L.join('\n');
  }

  function init() {
    const r = defaultRange();
    if ($('#rp-from')) { $('#rp-from').value = r.from; $('#rp-to').value = r.to; }

    $('#rp-presets').addEventListener('click', e => {
      const b = e.target.closest('[data-days]');
      if (b) setRange(Number(b.dataset.days));
    });

    $('#rp-run').addEventListener('click', run);

    $('#rp-print').addEventListener('click', () => {
      // Works in a browser tab. A home-screen app has no print menu of its
      // own, so the text copy below is the dependable route there.
      try { window.print(); } catch (e) { UI.toast('Use "Copy as text" instead'); }
    });

    $('#rp-share').addEventListener('click', async () => {
      const text = asText();
      if (!text) { UI.toast('Build the report first'); return; }
      try {
        if (navigator.share) {
          await navigator.share({ title: 'Health Tracker visit report', text });
        } else {
          await navigator.clipboard.writeText(text);
          UI.toast('Copied');
        }
      } catch (err) {
        try { await navigator.clipboard.writeText(text); UI.toast('Copied'); }
        catch (e2) { UI.toast('Could not copy'); }
      }
    });
  }

  return { renderWeek, init, run, asText };
})();
