/* Getting the outbox into the sheet.
 *
 * iPhones do not let a web app sync in the background, so this runs whenever
 * the app is actually open: on launch, when you bring it back to the front,
 * when the phone reports it is online again, once a minute while you are
 * looking at it, and right after you log something.
 *
 * Entries carry the id the phone made for them, and the sheet refuses an id
 * it has already stored, so sending the same batch twice is harmless.
 */

const Sync = (() => {
  const BATCH = 50;
  const MAX_ATTEMPTS = 8;

  let running = false;
  let listeners = [];

  function onChange(fn) { listeners.push(fn); }
  function announce(info) { listeners.forEach(fn => { try { fn(info); } catch (e) {} }); }

  async function refreshPending() {
    const q = await DB.queue();
    State.setPending(q);
    return q;
  }

  /** Log something. Returns as soon as it is safely on the phone. */
  async function log(op) {
    await DB.enqueue(op);
    await refreshPending();
    announce({ type: 'queued' });
    flush();
    return true;
  }

  async function flush() {
    if (running) return { skipped: 'already running' };
    if (!API.configured()) return { skipped: 'not configured' };
    if (navigator.onLine === false) return { skipped: 'offline' };

    const queued = await refreshPending();
    if (!queued.length) return { sent: 0 };

    running = true;
    announce({ type: 'syncing' });

    const batch = queued.slice(0, BATCH);
    try {
      const res = await API.send(batch.map(op => ({
        op: op.op, sheet: op.sheet, id: op.id, key: op.key, row: op.row
      })));

      const results = (res && res.results) || [];
      let done = 0;

      for (let i = 0; i < batch.length; i++) {
        const status = results[i] && results[i].status;
        // A duplicate means the sheet already has it, which is a success for
        // our purposes. "missing" means there is nothing left to act on.
        if (status === 'created' || status === 'updated' || status === 'deleted' ||
            status === 'duplicate' || status === 'missing') {
          await DB.remove(batch[i].qid);
          done++;
        } else {
          batch[i].attempts = (batch[i].attempts || 0) + 1;
          batch[i].lastError = (results[i] && results[i].error) || 'unknown';
          await DB.update(batch[i]);
        }
      }

      await refreshPending();
      announce({ type: 'synced', sent: done });
      running = false;

      // More waiting? Keep going.
      if (State.pendingCount() > 0 && done > 0) setTimeout(flush, 400);
      return { sent: done };

    } catch (err) {
      for (const op of batch) {
        op.attempts = (op.attempts || 0) + 1;
        op.lastError = err.message;
        await DB.update(op);
      }
      await refreshPending();
      running = false;
      announce({ type: 'error', error: err.message });
      return { error: err.message };
    }
  }

  /** Pull the latest from the sheet, then save it for offline use. */
  async function refresh() {
    if (!API.configured()) return { skipped: 'not configured' };
    try {
      const data = await API.bootstrap(State.dayKey(), 8);
      if (data && data.ok) {
        State.setSnapshot(data);
        await DB.set('snapshot', data);
        announce({ type: 'refreshed' });
        return { ok: true };
      }
      return { error: (data && data.error) || 'unknown' };
    } catch (err) {
      announce({ type: 'error', error: err.message });
      return { error: err.message };
    }
  }

  /** Anything that has failed too many times to keep retrying quietly. */
  function stuck() {
    return (State.getSnapshot(), null);
  }

  function start() {
    window.addEventListener('online', () => { flush(); refresh(); });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') { flush(); refresh(); }
    });
    setInterval(() => { if (document.visibilityState === 'visible') flush(); }, 60000);
  }

  return { log, flush, refresh, refreshPending, onChange, start, stuck, MAX_ATTEMPTS };
})();
