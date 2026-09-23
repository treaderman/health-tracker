/* Talking to the Google Sheet.
 *
 * Two details here are not style choices, they are what makes Apps Script
 * work from a web page at all:
 *
 *  - POST as text/plain. Any other content type makes the browser send a
 *    preflight request first, and Apps Script cannot answer one.
 *  - No custom headers, for the same reason. The token rides in the body
 *    on a POST and in the query string on a GET.
 *
 * The link and token live only on this phone, in localStorage.
 */

const API = (() => {
  const LS_URL = 'ht.url';
  const LS_TOKEN = 'ht.token';
  const TIMEOUT_MS = 25000;

  function read(k) {
    try { return localStorage.getItem(k) || ''; } catch (e) { return ''; }
  }
  function write(k, v) {
    try { localStorage.setItem(k, v); } catch (e) { /* private mode */ }
  }

  function getUrl() { return read(LS_URL).trim(); }
  function getToken() { return read(LS_TOKEN).trim(); }
  function configured() { return !!(getUrl() && getToken()); }

  function setConfig(url, token) {
    write(LS_URL, (url || '').trim());
    write(LS_TOKEN, (token || '').trim());
  }

  async function withTimeout(promiseFn) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      return await promiseFn(ctrl.signal);
    } finally {
      clearTimeout(timer);
    }
  }

  async function get(action, params = {}) {
    if (!configured()) throw new Error('not_configured');
    const q = new URLSearchParams({ action, token: getToken(), ...params });
    return withTimeout(async signal => {
      const res = await fetch(getUrl() + '?' + q.toString(), { method: 'GET', signal, redirect: 'follow' });
      const text = await res.text();
      return parse(text);
    });
  }

  async function post(action, payload = {}) {
    if (!configured()) throw new Error('not_configured');
    const body = JSON.stringify({ token: getToken(), action, payload });
    return withTimeout(async signal => {
      const res = await fetch(getUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body,
        signal,
        redirect: 'follow'
      });
      const text = await res.text();
      return parse(text);
    });
  }

  function parse(text) {
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      // Almost always a Google sign-in page, which means the deployment's
      // "Who has access" is not set to Anyone.
      throw new Error('bad_response');
    }
    if (data && data.ok === false && data.error === 'unauthorized') throw new Error('unauthorized');
    return data;
  }

  return {
    configured, getUrl, getToken, setConfig, get, post,
    ping: () => get('ping'),
    bootstrap: (date, days) => get('bootstrap', { date, days: String(days || 8) }),
    send: ops => post('log', { ops }),
    resetProteinClock: () => post('resetProteinClock', {})
  };
})();
