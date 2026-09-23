/* Local storage that survives with no signal.
 *
 * Two stores:
 *   queue  — things you logged that the sheet has not accepted yet
 *   cache  — the last copy of the sheet we managed to download
 *
 * Nothing here talks to the network. Logging writes to the queue and returns
 * immediately, which is what makes an entry feel instant in a dead zone.
 */

const DB = (() => {
  const NAME = 'health-tracker';
  const VERSION = 1;
  let dbp = null;

  function open() {
    if (dbp) return dbp;
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(NAME, VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('queue')) {
          db.createObjectStore('queue', { keyPath: 'qid' });
        }
        if (!db.objectStoreNames.contains('cache')) {
          db.createObjectStore('cache', { keyPath: 'key' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbp;
  }

  function tx(store, mode, fn) {
    return open().then(db => new Promise((resolve, reject) => {
      const t = db.transaction(store, mode);
      const s = t.objectStore(store);
      let out;
      try { out = fn(s); } catch (e) { reject(e); return; }
      t.oncomplete = () => resolve(out && out.result !== undefined ? out.result : out);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    }));
  }

  return {
    /** Add one operation to the outbox. */
    enqueue(op) {
      op.qid = op.qid || (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()));
      op.createdAt = op.createdAt || Date.now();
      op.attempts = op.attempts || 0;
      return tx('queue', 'readwrite', s => s.put(op)).then(() => op);
    },

    /** Everything still waiting, oldest first. */
    queue() {
      return tx('queue', 'readonly', s => s.getAll())
        .then(rows => (rows || []).sort((a, b) => a.createdAt - b.createdAt));
    },

    queueCount() {
      return tx('queue', 'readonly', s => s.count());
    },

    remove(qid) {
      return tx('queue', 'readwrite', s => s.delete(qid));
    },

    update(op) {
      return tx('queue', 'readwrite', s => s.put(op));
    },

    get(key) {
      return tx('cache', 'readonly', s => s.get(key)).then(r => (r ? r.value : null));
    },

    set(key, value) {
      return tx('cache', 'readwrite', s => s.put({ key, value }));
    }
  };
})();
