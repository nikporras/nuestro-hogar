#!/usr/bin/env node
// Lightweight smoke test for index.html's inline script.
//
// Two checks, ordered by what kind of breakage they catch:
//   1. Pure syntax parse — `new Function(script)` rejects malformed JS
//      (catches the white-screen v103/v104 class of bug before it ships).
//   2. Mock-runtime execution — eval the IIFE inside a stubbed-out
//      document/window/localStorage/navigator/fetch so any ReferenceError
//      or TypeError thrown during initial render (which is what kills the
//      app on load) surfaces here, not on a user's phone.
//
// No test framework — just process.exit codes. CI consumes those.

const fs = require('fs');
const path = require('path');

const indexPath = path.resolve(__dirname, '..', 'index.html');
const html = fs.readFileSync(indexPath, 'utf8');
const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (!m) {
  console.error('FAIL: no inline <script> block found in index.html');
  process.exit(1);
}
const script = m[1];

// --- 1) Parse check ---
try {
  // Function ctor throws SyntaxError on malformed JS.
  // eslint-disable-next-line no-new, no-new-func
  new Function(script);
  console.log('OK  parse');
} catch (e) {
  console.error('FAIL: parse — ' + e.message);
  process.exit(1);
}

// --- 2) Mock-runtime smoke ---
function makeStubElement() {
  const stub = {
    style: {},
    classList: { toggle() {}, add() {}, remove() {} },
    setAttribute() {},
    addEventListener() {},
    appendChild() { return stub; },
    insertBefore() { return stub; },
    removeChild() {},
    cloneNode() { return stub; },
    firstChild: null,
  };
  return stub;
}

const stubRoot = (() => {
  const r = makeStubElement();
  r.innerHTML = '';
  return r;
})();

global.document = {
  addEventListener() {},
  createElement() { return makeStubElement(); },
  createTextNode() { return makeStubElement(); },
  getElementById() { return stubRoot; },
  querySelectorAll() { return []; },
  body: {
    classList: { toggle() {}, remove() {}, add() {} },
  },
};
global.window = {
  location: { hash: '', protocol: 'http:' },
  addEventListener() {},
  scrollY: 0,
  pageYOffset: 0,
  scrollTo() {},
};
global.localStorage = {
  store: {},
  getItem(k) { return this.store[k] || null; },
  setItem(k, v) { this.store[k] = String(v); },
  removeItem(k) { delete this.store[k]; },
};
global.location = { hash: '', protocol: 'http:', reload() {} };
global.navigator = { serviceWorker: undefined, onLine: true };
global.fetch = () => Promise.resolve({ ok: false, status: 0, json: () => Promise.resolve([]), text: () => Promise.resolve('') });
global.setInterval = () => 0;
global.setTimeout = (fn) => 0;
global.clearInterval = () => {};
global.clearTimeout = () => {};
global.atob = (s) => Buffer.from(s, 'base64').toString('binary');
global.btoa = (s) => Buffer.from(s, 'binary').toString('base64');
global.Notification = undefined;
global.PushManager = undefined;

try {
  // eslint-disable-next-line no-eval
  eval(script);
  console.log('OK  runtime');
} catch (e) {
  console.error('FAIL: runtime — ' + e.message);
  if (e.stack) {
    console.error(e.stack.split('\n').slice(0, 5).join('\n'));
  }
  process.exit(1);
}

console.log('\nAll smoke checks passed.');
