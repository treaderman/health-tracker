/* The screens.
 *
 * Plain DOM, no framework. Every screen redraws from State, which already
 * blends the sheet with anything still waiting to sync.
 */

const UI = (() => {
  const $ = sel => document.querySelector(sel);
  const $$ = sel => Array.from(document.querySelectorAll(sel));

  let screen = 'today';
  let editingFoodId = null;
  let symptomPicks = new Set();

  const SYMPTOMS = ['None', 'Nausea', 'Low appetite', 'Fatigue', 'Constipation', 'Other'];

  /* ---------------- helpers ---------------- */

  function go(name) {
    screen = name;
    $$('.screen').forEach(s => { s.hidden = s.dataset.screen !== name; });
    window.scrollTo(0, 0);
    render();
  }

  let toastTimer = null;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 2200);
  }

  function round(n) { return Math.round(n * 10) / 10; }
  function whole(n) { return Math.round(n); }

  function uuid() {
    return crypto.randomUUID ? crypto.randomUUID()
      : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
          const r = Math.random() * 16 | 0;
          return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        });
  }

  /* ---------------- progress bars ---------------- */

  function bar(name, value, unit, min, low, high) {
    const hour = new Date().getHours();
    const amberAfter = State.setting('under_min_amber_after_hour');
    const max = Math.max(high * 1.1, min * 1.2, value * 1.05, 1);

    const pct = v => Math.max(0, Math.min(100, (v / max) * 100));
    let cls = '';
    if (value >= low) cls = 'good';
    else if (value < min && hour >= amberAfter) cls = 'warn';

    const bandLeft = pct(low);
    const bandWidth = Math.max(pct(high) - bandLeft, 1.5);

    return `
      <div class="metric">
        <div class="top">
          <span class="name">${name}</span>
          <span><span class="value">${whole(value).toLocaleString()}</span><span class="unit">${unit ? ' ' + unit : ''}</span></span>
        </div>
        <div class="track">
          <div class="fill ${cls}" style="width:${pct(value)}%"></div>
          <div class="band" style="left:${bandLeft}%;width:${bandWidth}%"></div>
          <div class="tick" style="left:${pct(min)}%"></div>
        </div>
        <div class="scale">min ${min.toLocaleString()} · target ${low.toLocaleString()}–${high.toLocaleString()}</div>
      </div>`;
  }

  /* ---------------- today ---------------- */

  function renderToday() {
    const key = State.dayKey();
    const t = State.totals(key);
    const s = State.settings();

    const d = new Date();
    $('#today-date').textContent = d.toLocaleDateString(undefined, {
      weekday: 'long', month: 'short', day: 'numeric'
    }) + ' · ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

    $('#bars').innerHTML =
      bar('Calories', t.calories, '', State.setting('cal_min'), State.setting('cal_low'), State.setting('cal_high')) +
      bar('Protein', t.protein, 'g', State.setting('protein_min'), State.setting('protein_low'), State.setting('protein_high')) +
      bar('Fluids', t.oz, 'oz', State.setting('fluid_min'), State.setting('fluid_low'), State.setting('fluid_high'));

    $('#protein-since').textContent = State.sinceText(State.lastProteinMs());
    $('#mark-fruit').className = 'mark' + (t.fruit ? ' on' : '');
    $('#mark-veg').className = 'mark' + (t.veg ? ' on' : '');

    const w = State.week(key);
    $('#week-tiles').innerHTML = `
      <div class="tile"><div class="k">Walks</div><div class="v">${w.walkDays}<span class="of"> of ${whole(State.setting('walks_per_week'))}</span></div></div>
      <div class="tile"><div class="k">Strength</div><div class="v">${w.strengthDays}<span class="of"> of ${whole(State.setting('strength_sessions_low'))}</span></div></div>
      <div class="tile"><div class="k">Minutes</div><div class="v">${whole(w.minutes)}<span class="of"> of ${whole(State.setting('activity_min_week'))}</span></div></div>`;

    const goals = String(s.goals_text || '').trim();
    $('#goals-card').hidden = !goals;
    $('#goals-text').textContent = goals;

    const snap = State.getSnapshot();
    $('#today-foot').textContent = API.configured()
      ? (snap ? '' : 'No data downloaded yet — pull down Settings › Refresh.')
      : 'Not connected yet. Tap the gear to finish setup.';
  }

  /* ---------------- food ---------------- */

  function foodFormValues() {
    return {
      item: $('#f-item').value.trim(),
      calories: State.num($('#f-cal').value, 0),
      protein_g: State.num($('#f-pro').value, 0),
      meal: $('#f-meal').value,
      fruit: $('#f-fruit').getAttribute('aria-pressed') === 'true' ? 'Y' : 'N',
      vegetable: $('#f-veg').getAttribute('aria-pressed') === 'true' ? 'Y' : 'N',
      favorite: $('#f-fav').getAttribute('aria-pressed') === 'true'
    };
  }

  function clearFoodForm() {
    $('#f-item').value = '';
    $('#f-cal').value = '';
    $('#f-pro').value = '';
    $('#f-meal').value = State.mealForNow();
    $('#f-fruit').setAttribute('aria-pressed', 'false');
    $('#f-veg').setAttribute('aria-pressed', 'false');
    $('#f-fav').setAttribute('aria-pressed', 'false');
    editingFoodId = null;
    $('#f-log').textContent = 'Log it';
    $('#f-cancel').hidden = true;
    $$('#food-chips .chip').forEach(c => c.classList.remove('on'));
  }

  function fillFromSaved(f) {
    $('#f-item').value = f.name || '';
    $('#f-cal').value = State.num(f.calories, '') === '' ? '' : State.num(f.calories, 0);
    $('#f-pro').value = State.num(f.protein_g, '') === '' ? '' : State.num(f.protein_g, 0);
    $('#f-meal').value = f.meal_default || State.mealForNow();
    $('#f-fruit').setAttribute('aria-pressed', State.isY(f.fruit) ? 'true' : 'false');
    $('#f-veg').setAttribute('aria-pressed', State.isY(f.vegetable) ? 'true' : 'false');
  }

  function renderFood() {
    const term = $('#food-search').value.trim().toLowerCase();
    const list = State.savedFoods().filter(f => !term || String(f.name).toLowerCase().includes(term));

    $('#food-chips').innerHTML = list.length
      ? list.map((f, i) => `<button class="chip" data-saved="${i}">${escapeHtml(f.name)}<span class="macro">${whole(State.num(f.calories, 0))} cal · ${whole(State.num(f.protein_g, 0))}g</span></button>`).join('')
      : '<p class="empty">No saved foods match.</p>';
    $('#food-chips')._list = list;

    const key = State.dayKey();
    const rows = State.onDay('food', key).sort(sortByStamp);
    $('#food-list').innerHTML = rows.length
      ? rows.map(r => itemRow(r, `${whole(State.num(r.calories, 0))} cal · ${whole(State.num(r.protein_g, 0))}g protein · ${escapeHtml(r.meal || '')}`, escapeHtml(r.item || '(no name)'))).join('')
      : '<div class="item"><div class="main"><div class="s">Nothing logged yet today.</div></div></div>';
  }

  /* ---------------- water ---------------- */

  function currentDrink() {
    const on = $('#w-type button.on');
    return on ? on.dataset.type : 'Water';
  }

  function renderWater() {
    const type = currentDrink();
    const counts = State.drinkCounts(type) === 'Y';
    $('#w-counts').textContent = counts
      ? `${type} counts toward your fluid target.`
      : `${type} does not count toward your target. You can change that in your sheet's Settings tab.`;

    const rows = State.onDay('fluids', State.dayKey()).sort(sortByStamp);
    $('#water-list').innerHTML = rows.length
      ? rows.map(r => itemRow(r, `${escapeHtml(r.type || '')}${State.isY(r.counts_toward_target) ? '' : ' · not counted'}`, `${whole(State.num(r.oz, 0))} oz`)).join('')
      : '<div class="item"><div class="main"><div class="s">Nothing logged yet today.</div></div></div>';
  }

  /* ---------------- activity ---------------- */

  function currentActivity() {
    const on = $('#a-type button.on');
    return on ? on.dataset.type : 'Walk';
  }

  function renderActivity() {
    const key = State.dayKey();

    $('#a-weigh-prompt').hidden = new Date().getDay() !== 0;

    const steps = State.onDay('steps', key)[0];
    if (steps && document.activeElement !== $('#a-steps')) {
      $('#a-steps').value = State.num(steps.steps, '');
    }

    const body = State.onDay('body', key)[0];
    if (body && document.activeElement !== $('#a-weight')) {
      $('#a-weight').value = State.num(body.weight_lb, '');
      $('#a-waist').value = State.num(body.waist_in, '') || '';
    }

    $('#a-symptoms').innerHTML = SYMPTOMS.map(s =>
      `<button class="chip${symptomPicks.has(s) ? ' on' : ''}" data-symptom="${escapeHtml(s)}">${escapeHtml(s)}</button>`).join('');

    const rows = State.onDay('activity', key).sort(sortByStamp);
    $('#activity-list').innerHTML = rows.length
      ? rows.map(r => itemRow(r, escapeHtml(r.type || ''), `${whole(State.num(r.minutes, 0))} min`)).join('')
      : '<div class="item"><div class="main"><div class="s">Nothing logged yet today.</div></div></div>';
  }

  /* ---------------- settings ---------------- */

  function renderSettings() {
    $('#s-url').value = API.getUrl();
    $('#s-token').value = API.getToken();

    const n = State.pendingCount();
    $('#s-sync').textContent = !API.configured()
      ? 'Not connected yet.'
      : (n ? `${n} ${n === 1 ? 'entry' : 'entries'} waiting to sync.` : 'Everything is synced.');

    const s = State.settings();
    const snap = State.getSnapshot();
    $('#s-targets').innerHTML = snap ? `
      <div><span>Calories</span><span>${s.cal_low}–${s.cal_high} (min ${s.cal_min})</span></div>
      <div><span>Protein</span><span>${s.protein_low}–${s.protein_high} g (min ${s.protein_min})</span></div>
      <div><span>Fluids</span><span>${s.fluid_low}–${s.fluid_high} oz (min ${s.fluid_min})</span></div>
      <div><span>Activity</span><span>${s.activity_min_week} min/week</span></div>
      <div><span>Coke Zero counts</span><span>${String(s.coke_zero_counts).toUpperCase() === 'TRUE' ? 'Yes' : 'No'}</span></div>
      <div><span>Protein window</span><span>${s.protein_window_hours} h, alert ${s.protein_alert_lead_min || 30} min early</span></div>
    ` : '<p class="note">Nothing downloaded yet.</p>';

    $('#s-version').textContent = 'Health Tracker · phase 2';
  }

  /* ---------------- shared bits ---------------- */

  function sortByStamp(a, b) {
    return String(a.timestamp || '').localeCompare(String(b.timestamp || ''));
  }

  function itemRow(r, sub, title) {
    const pending = r._pending ? '<span class="pending"> · waiting</span>' : '';
    const id = escapeHtml(String(r.id || r.date || ''));
    const sheet = r.oz !== undefined ? 'Fluids' : (r.minutes !== undefined ? 'Activity' : 'Food');
    return `<div class="item" data-id="${id}" data-sheet="${sheet}">
      <div class="main"><div class="t">${title}</div><div class="s">${sub}${pending}</div></div>
      ${sheet === 'Food' ? '<button class="edit">Edit</button>' : ''}
      <button class="del">Delete</button>
    </div>`;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function renderBadge() {
    const n = State.pendingCount();
    const b = $('#sync-badge');
    b.hidden = n === 0;
    b.textContent = n === 1 ? '1 waiting to sync' : `${n} waiting to sync`;
  }

  function render() {
    renderBadge();
    if (screen === 'today') renderToday();
    else if (screen === 'food') renderFood();
    else if (screen === 'water') renderWater();
    else if (screen === 'activity') renderActivity();
    else if (screen === 'settings') renderSettings();
  }

  /* ---------------- logging ---------------- */

  async function logFood() {
    const v = foodFormValues();
    if (!v.item) { toast('Give it a name first'); $('#f-item').focus(); return; }

    const id = editingFoodId || uuid();
    await Sync.log({
      op: editingFoodId ? 'update' : 'create',
      sheet: 'Food',
      id,
      row: {
        timestamp: State.stamp(),
        date: State.dayKey(),
        meal: v.meal,
        item: v.item,
        calories: v.calories,
        protein_g: v.protein_g,
        fruit: v.fruit,
        vegetable: v.vegetable,
        note: ''
      }
    });

    if (v.favorite) {
      await Sync.log({
        op: 'upsert', sheet: 'SavedFoods', key: v.item,
        row: {
          name: v.item, meal_default: v.meal,
          calories: v.calories, protein_g: v.protein_g,
          fruit: v.fruit, vegetable: v.vegetable, times_used: 0
        }
      });
    }

    const wasEdit = !!editingFoodId;
    clearFoodForm();
    toast(wasEdit ? 'Updated' : `Logged ${v.item}`);
    go('today');
  }

  async function logWater(oz) {
    if (!oz || oz <= 0) { toast('Enter an amount'); return; }
    const type = currentDrink();
    await Sync.log({
      op: 'create', sheet: 'Fluids', id: uuid(),
      row: {
        timestamp: State.stamp(), date: State.dayKey(),
        oz, type, counts_toward_target: State.drinkCounts(type)
      }
    });
    toast(`Logged ${oz} oz`);
    go('today');
  }

  async function logActivity(minutes) {
    if (!minutes || minutes <= 0) { toast('Enter some minutes'); return; }
    const type = currentActivity();
    await Sync.log({
      op: 'create', sheet: 'Activity', id: uuid(),
      row: { timestamp: State.stamp(), date: State.dayKey(), type, minutes, note: '' }
    });
    toast(`Logged ${minutes} min ${type.toLowerCase()}`);
    go('today');
  }

  async function remove(sheet, id) {
    await Sync.log({ op: 'delete', sheet, id });
    toast('Deleted');
    render();
  }

  /* ---------------- wiring ---------------- */

  function init() {
    $$('[data-go]').forEach(b => b.addEventListener('click', () => go(b.dataset.go)));

    $('#sync-badge').addEventListener('click', async () => {
      toast('Syncing…');
      await Sync.flush();
    });

    // --- food ---
    $('#food-search').addEventListener('input', renderFood);
    $('#food-chips').addEventListener('click', e => {
      const chip = e.target.closest('[data-saved]');
      if (!chip) return;
      const list = $('#food-chips')._list || [];
      const f = list[Number(chip.dataset.saved)];
      if (!f) return;
      if (chip.classList.contains('on')) { logFood(); return; }
      $$('#food-chips .chip').forEach(c => c.classList.remove('on'));
      chip.classList.add('on');
      fillFromSaved(f);
      toast('Tap again to log it');
    });

    ['#f-fruit', '#f-veg', '#f-fav'].forEach(sel => {
      $(sel).addEventListener('click', () => {
        const el = $(sel);
        el.setAttribute('aria-pressed', el.getAttribute('aria-pressed') === 'true' ? 'false' : 'true');
      });
    });

    $('#f-log').addEventListener('click', logFood);
    $('#f-cancel').addEventListener('click', () => { clearFoodForm(); renderFood(); });

    $('#food-list').addEventListener('click', e => {
      const row = e.target.closest('.item');
      if (!row) return;
      const id = row.dataset.id;
      if (e.target.classList.contains('del')) { remove('Food', id); return; }
      if (e.target.classList.contains('edit')) {
        const r = State.onDay('food', State.dayKey()).find(x => String(x.id) === id);
        if (!r) return;
        editingFoodId = id;
        $('#f-item').value = r.item || '';
        $('#f-cal').value = State.num(r.calories, 0);
        $('#f-pro').value = State.num(r.protein_g, 0);
        $('#f-meal').value = r.meal || State.mealForNow();
        $('#f-fruit').setAttribute('aria-pressed', State.isY(r.fruit) ? 'true' : 'false');
        $('#f-veg').setAttribute('aria-pressed', State.isY(r.vegetable) ? 'true' : 'false');
        $('#f-log').textContent = 'Save changes';
        $('#f-cancel').hidden = false;
        window.scrollTo(0, 0);
      }
    });

    // --- water ---
    $('#w-type').addEventListener('click', e => {
      const b = e.target.closest('[data-type]');
      if (!b) return;
      $$('#w-type button').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
      try { localStorage.setItem('ht.drink', b.dataset.type); } catch (err) {}
      renderWater();
    });
    $('#w-quick').addEventListener('click', e => {
      const b = e.target.closest('[data-oz]');
      if (b) logWater(Number(b.dataset.oz));
    });
    $('#w-log').addEventListener('click', () => {
      const oz = State.num($('#w-custom').value, 0);
      $('#w-custom').value = '';
      logWater(oz);
    });
    $('#water-list').addEventListener('click', e => {
      const row = e.target.closest('.item');
      if (row && e.target.classList.contains('del')) remove('Fluids', row.dataset.id);
    });

    // --- activity ---
    $('#a-type').addEventListener('click', e => {
      const b = e.target.closest('[data-type]');
      if (!b) return;
      $$('#a-type button').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
    });
    $('#a-quick').addEventListener('click', e => {
      const b = e.target.closest('[data-min]');
      if (b) logActivity(Number(b.dataset.min));
    });
    $('#a-log').addEventListener('click', () => {
      const m = State.num($('#a-custom').value, 0);
      $('#a-custom').value = '';
      logActivity(m);
    });
    $('#activity-list').addEventListener('click', e => {
      const row = e.target.closest('.item');
      if (row && e.target.classList.contains('del')) remove('Activity', row.dataset.id);
    });

    $('#a-steps-save').addEventListener('click', async () => {
      const steps = State.num($('#a-steps').value, 0);
      if (steps <= 0) { toast('Enter a step count'); return; }
      const key = State.dayKey();
      await Sync.log({ op: 'upsert', sheet: 'Steps', key, row: { date: key, steps } });
      toast('Steps saved');
      go('today');
    });

    $('#a-weight-save').addEventListener('click', async () => {
      const w = State.num($('#a-weight').value, 0);
      if (w <= 0) { toast('Enter a weight'); return; }
      const key = State.dayKey();
      const existing = State.onDay('body', key)[0];
      await Sync.log({
        op: existing ? 'update' : 'create',
        sheet: 'Body',
        id: existing ? existing.id : uuid(),
        row: { date: key, weight_lb: w, waist_in: State.num($('#a-waist').value, '') }
      });
      toast('Weight saved');
      go('today');
    });

    $('#a-symptoms').addEventListener('click', e => {
      const b = e.target.closest('[data-symptom]');
      if (!b) return;
      const s = b.dataset.symptom;
      if (s === 'None') { symptomPicks = new Set(symptomPicks.has('None') ? [] : ['None']); }
      else {
        symptomPicks.delete('None');
        if (symptomPicks.has(s)) symptomPicks.delete(s); else symptomPicks.add(s);
      }
      renderActivity();
    });

    $('#a-sym-save').addEventListener('click', async () => {
      if (!symptomPicks.size) { toast('Pick one first'); return; }
      const key = State.dayKey();
      for (const s of symptomPicks) {
        await Sync.log({
          op: 'create', sheet: 'Symptoms', id: uuid(),
          row: { timestamp: State.stamp(), date: key, symptom: s, note: '' }
        });
      }
      symptomPicks = new Set();
      toast('Symptoms saved');
      go('today');
    });

    // --- settings ---
    $('#s-save').addEventListener('click', async () => {
      const url = $('#s-url').value.trim();
      const token = $('#s-token').value.trim();
      if (!url || !token) { $('#s-result').textContent = 'Both boxes are needed.'; return; }
      if (!/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec$/.test(url)) {
        $('#s-result').textContent = 'That link should start with https://script.google.com/macros/s/ and end with /exec';
        return;
      }
      API.setConfig(url, token);
      $('#s-result').textContent = 'Checking…';
      try {
        const res = await API.ping();
        if (res && res.ok) {
          $('#s-result').textContent = 'Connected. Downloading your sheet…';
          await Sync.refresh();
          await Sync.flush();
          $('#s-result').textContent = 'Connected and up to date.';
          toast('Connected');
          render();
        } else {
          $('#s-result').textContent = 'The sheet answered, but not with an OK. Check the token.';
        }
      } catch (err) {
        $('#s-result').textContent = friendlyError(err.message);
      }
    });

    $('#s-sync-now').addEventListener('click', async () => {
      const r = await Sync.flush();
      toast(r.error ? friendlyError(r.error) : 'Synced');
      render();
    });

    $('#s-refresh').addEventListener('click', async () => {
      const r = await Sync.refresh();
      toast(r.error ? friendlyError(r.error) : 'Refreshed');
      render();
    });

    // restore the drink type you used last
    try {
      const last = localStorage.getItem('ht.drink');
      if (last) {
        $$('#w-type button').forEach(b => b.classList.toggle('on', b.dataset.type === last));
      }
    } catch (e) {}

    $('#f-meal').value = State.mealForNow();

    $('#reset-protein').addEventListener('click', async () => {
      if (!API.configured()) { toast('Connect in Settings first'); return; }
      toast('Resetting…');
      try {
        await API.resetProteinClock();
        await Sync.refresh();
        render();
        toast('Protein clock reset');
      } catch (err) {
        toast(friendlyError(err.message));
      }
    });

    Sync.onChange(() => render());
    setInterval(() => { if (screen === 'today' && !document.hidden) renderToday(); }, 30000);
  }

  function friendlyError(code) {
    if (code === 'unauthorized') return 'The token was refused. Check it in Settings.';
    if (code === 'not_configured') return 'Add your link and token in Settings.';
    if (code === 'bad_response') return 'Got a sign-in page instead of data. The deployment needs "Who has access: Anyone".';
    if (code === 'The user aborted a request.' || code === 'AbortError') return 'Timed out. It will retry when you have signal.';
    if (/Failed to fetch|NetworkError|Load failed/i.test(code || '')) return 'No connection. Your entries are saved and will sync later.';
    return code || 'Something went wrong.';
  }

  return { init, go, render, toast, friendlyError };
})();
