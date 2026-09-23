/* Boot.
 *
 * Draw from the phone's own copy first so the Today screen is up instantly,
 * even in a dead zone, then quietly catch up with the sheet.
 */

(async function boot() {
  // Ask the browser to hang on to the outbox rather than evicting it.
  if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persist().catch(() => {});
  }

  UI.init();

  try {
    const cached = await DB.get('snapshot');
    if (cached) State.setSnapshot(cached);
    await Sync.refreshPending();
  } catch (e) {
    // A blocked or full IndexedDB should not stop the app from opening.
  }

  UI.go(API.configured() ? 'today' : 'settings');
  if (!API.configured()) {
    UI.toast('Add your link and token to get started');
  }

  Sync.start();

  if (API.configured()) {
    Sync.flush();
    Sync.refresh().then(() => UI.render());
  }

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  }
})();
