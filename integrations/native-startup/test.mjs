import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chooseNext, consumeNext, dataDirectory, profileInput, saveSettings, settings } from './state.mjs';
async function overlayHarness({ storage = new Map(), denied = '', instance = 'run-a', failAppend = false } = {}) {
  const { runInNewContext } = await import('node:vm');
  const listeners = new Map(), observers = new Set(), timers = new Map(), frames = [], buttons = [];
  const background = { nodeType: 1, inert: false }, alreadyInert = { nodeType: 1, inert: true };
  let requests = 0, restores = 0, timerId = 0;
  const body = { children: [background, alreadyInert], append(...nodes) {
    if (failAppend) throw new Error('mount failed');
    this.children.push(...nodes);
    for (const observer of observers) observer.callback([{ addedNodes: nodes }]);
  } };
  const make = tag => {
    const events = new Map();
    const node = { tag, nodeType: 1, style: {}, inert: false, contentWindow: {}, setAttribute() {},
      addEventListener(kind, callback) { events.set(kind, callback); }, removeEventListener(kind) { events.delete(kind); },
      focus() {}, remove() { body.children = body.children.filter(child => child !== node); node.removed = true; },
      fire(kind, event = {}) { events.get(kind)?.(event); } };
    (tag === 'iframe' ? frames : buttons).push(node);
    return node;
  };
  const window = {
    addEventListener(kind, callback) { if (!listeners.has(kind)) listeners.set(kind, new Set()); listeners.get(kind).add(callback); },
    removeEventListener(kind, callback) { listeners.get(kind)?.delete(callback); },
  };
  const context = {
    fetch: async () => { requests++; return { ok: true, json: async () => ({ enabled: true, instance }) }; },
    crypto: { randomUUID: () => '01234567-89ab-cdef-0123-456789abcdef' }, URLSearchParams,
    location: { origin: 'http://127.0.0.1:3080' },
    sessionStorage: {
      getItem(key) { if (denied === 'read') throw new Error('storage disabled'); return storage.get(key) ?? null; },
      setItem(key, value) { if (denied === 'write') throw new Error('quota denied'); storage.set(key, value); },
    },
    document: { readyState: 'complete', documentElement: { dataset: {} }, createElement: make, body,
      activeElement: { isConnected: true, inert: false, focus() { restores++; } } },
    MutationObserver: class {
      constructor(callback) { this.callback = callback; }
      observe() { observers.add(this); } disconnect() { observers.delete(this); }
    }, window, console: { warn() {} },
    setTimeout(callback) { const id = ++timerId; timers.set(id, callback); return id; },
    clearTimeout(id) { timers.delete(id); },
  };
  const source = readFileSync(new URL('./overlay.mjs', import.meta.url), 'utf8');
  const run = async () => { runInNewContext(source, context); await new Promise(resolve => setImmediate(resolve)); };
  const send = type => {
    const frame = frames[0], channel = new URL(frame.src, context.location.origin).searchParams.get('channel');
    for (const handler of [...listeners.get('message') ?? []]) handler({ origin: context.location.origin, source: frame.contentWindow, data: { source: 'dsh-startup', channel, type } });
  };
  return { run, send, frames, buttons, background, alreadyInert, observers, timers, listeners, storage,
    requests: () => requests, restores: () => restores };
}

test('duplicate native overlay injection creates only one interactive frame', async () => {
  const h = await overlayHarness();
  await Promise.all([h.run(), h.run()]);
  assert.equal(h.requests(), 1);
  assert.equal(h.frames.length, 1);
  assert.equal(h.frames[0].inert, false);
  assert.equal(h.buttons[0].inert, false);
  h.send('skip');
});

test('an interrupted opening is not replayed by a host-page reload', async () => {
  const first = await overlayHarness();
  await first.run(); first.send('ready');
  const reloaded = await overlayHarness({ storage: first.storage });
  await reloaded.run();
  assert.equal(reloaded.frames.length, 0);
  first.send('complete');
  const completed = await overlayHarness({ storage: first.storage });
  await completed.run(); assert.equal(completed.frames.length, 0);
  const newServer = await overlayHarness({ storage: first.storage, instance: 'run-b' });
  await newServer.run(); assert.equal(newServer.frames.length, 1); newServer.send('skip');
});

test('unavailable tab storage bypasses the optional film instead of reopening it on every reload', async () => {
  for (const denied of ['read', 'write']) {
    const h = await overlayHarness({ denied });
    await h.run();
    assert.equal(h.frames.length, 0);
    assert.equal(h.background.inert, false);
    assert.equal(h.observers.size, 0);
  }
});

test('native return control survives iframe failure after ready and restores the host exactly once', async () => {
  const h = await overlayHarness();
  await h.run(); h.send('ready');
  assert.equal(h.timers.size, 0);
  assert.equal(h.buttons.length, 1);
  assert.equal(h.buttons[0].inert, false);
  h.buttons[0].fire('click');
  h.frames[0].fire('error'); // A late load error must not run cleanup twice.
  assert.equal(h.background.inert, false);
  assert.equal(h.alreadyInert.inert, true);
  assert.equal(h.frames[0].removed, true);
  assert.equal(h.buttons[0].removed, true);
  assert.equal(h.restores(), 1);
  assert.equal(h.observers.size, 0);
});

test('a partially mounted native overlay cannot leave the official page inert', async () => {
  const h = await overlayHarness({ failAppend: true });
  await h.run();
  assert.equal(h.background.inert, false);
  assert.equal(h.alreadyInert.inert, true);
  assert.equal(h.observers.size, 0);
  assert.equal(h.timers.size, 0);
});
import { apply, inventory, localRequest, name, PREFIX } from './plugin.mjs';

test('Laterano-only profile rejects other styles and preserves identity patches', () => {
  assert.deepEqual(profileInput({ visual_style: 'laterano' }), { visual_style: 'laterano' });
  assert.deepEqual(profileInput({ username: 'Operator' }), { username: 'Operator' });
  for (const visual_style of [null, '', 'rhine', 'gold', 1, {}]) assert.throws(() => profileInput({ visual_style }), /only the laterano/);
});
import { prepareArguments } from './cli.mjs';

test('native overlay patch precedes app flags and preserves the official invocation', () => {
  assert.deepEqual(prepareArguments(['web', '--startup', '--port', '3081', '--no-open'], '/patch.json'), {
    args: ['web', '--patch', '/patch.json', '--port', '3081', '--no-open'], override: true, web: true,
  });
  assert.deepEqual(prepareArguments(['--profile', 'web', '--no-startup'], '/patch.json').args, ['--profile', 'web', '--patch', '/patch.json']);
  assert.deepEqual(prepareArguments(['headless', 'say hello'], '/patch.json').args, ['headless', 'say hello']);
  assert.deepEqual(prepareArguments(['web', '--help'], '/patch.json').args, ['web', '--help']);
  assert.deepEqual(prepareArguments(['web', '--dump-config'], '/patch.json').args, ['web', '--dump-config']);
  assert.throws(() => prepareArguments(['web', '--startup', '--no-startup'], '/patch.json'), /mutually exclusive/);
});

test('profile and one-shot data are isolated under the native DSH home', () => {
  const home = mkdtempSync(join(tmpdir(), 'laterano-ui-state-test-'));
  const previous = process.env.DSH_HOME; process.env.DSH_HOME = home;
  try {
    const oldDirectory = join(home, 'startup-animation');
    mkdirSync(oldDirectory);
    const oldSettings = JSON.stringify({ username: 'ExistingNativeUser', visual_style: 'rhine', enabled: true });
    writeFileSync(join(oldDirectory, 'settings.json'), oldSettings, 'utf8');
    writeFileSync(join(oldDirectory, 'next.json'), '{"enabled":true}', 'utf8');
    assert.equal(dataDirectory(), join(home, 'laterano-ui'));
    assert.equal(settings().enabled, false);
    assert.notEqual(settings().username, 'ExistingNativeUser');
    assert.equal(settings().visual_style, 'laterano');
    saveSettings(profileInput({ username: 'CatShark', badge_id: 'DSH-7391' }));
    assert.equal(settings().username, 'CatShark');
    chooseNext(true);
    assert.equal(consumeNext(), true);
    assert.equal(consumeNext(), undefined);
    chooseNext(false);
    assert.equal(consumeNext(), false);
    assert.equal(settings().enabled, false);
    saveSettings({ visual_style: 'rhine' });
    assert.equal(settings().visual_style, 'laterano');
    writeFileSync(join(dataDirectory(), 'settings.json'), '{"username":"ManualName","visual_style":"rhine"}', 'utf8');
    assert.equal(settings().visual_style, 'laterano');
    saveSettings(profileInput({ badge_id: 'DSH-NEW' }));
    assert.equal(settings().username, 'ManualName');
    assert.equal(JSON.parse(readFileSync(join(dataDirectory(), 'settings.json'), 'utf8')).visual_style, 'laterano');
    assert.equal(readFileSync(join(oldDirectory, 'settings.json'), 'utf8'), oldSettings);
    assert.equal(readFileSync(join(oldDirectory, 'next.json'), 'utf8'), '{"enabled":true}');
    assert.throws(() => profileInput({ username: '\u001b[31m', badge_id: 'OK' }), /printable/);
    assert.throws(() => profileInput({ username: 'x'.repeat(65), badge_id: 'OK' }), /maximum/);
  } finally { if (previous === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = previous; rmSync(home, { recursive: true, force: true }); }
});

test('native registry adapter reports only live fibers and true scoped skill observations', async () => {
  const events = [];
  let released = false;
  const ctx = {
    skills: { snapshot: async options => { assert.equal(options.cwd, process.cwd()); assert.equal(options.scope, 'actual-default'); return { complete: false, skills: [{ name: 'real-file', path: '/work/.dsh/skills/real-file/SKILL.md' }] }; } },
    agentPresets: {
      acquireScope: async () => ({ key: 'actual-default', [Symbol.asyncDispose]: async () => { released = true; } }),
      compositionInventory: async () => [
        { id: 'active', isDefault: true, rows: [
          { entryId: 'ready', moduleName: 'preset-ready', enabled: true, fiberState: 2 },
          { entryId: 'waiting', moduleName: 'preset-waiting', enabled: true, fiberState: 0 },
          { entryId: 'off', moduleName: 'preset-disabled', enabled: false, fiberState: 2 },
        ] },
        { id: 'other', isDefault: false, rows: [{ entryId: 'ready', moduleName: 'not-selected', enabled: true, fiberState: 2 }] },
      ],
    },
    loader: { entries: () => [
      { id: 'mounted', options: { name: 'actual-plugin' }, fiber: { state: 2 } },
      { id: 'disabled', disabled: true, options: { name: 'disabled-plugin' }, fiber: { state: 2 } },
      { id: 'pending', options: { name: 'pending-plugin' }, fiber: { state: 0 } },
      { id: 'failed', options: { name: 'failed-plugin' }, fiber: { state: 3 } },
    ] },
  };
  const result = await inventory(ctx, event => events.push(event));
  assert.deepEqual(result.skills.map(item => item.name), ['real-file']);
  assert.deepEqual(result.plugins.map(item => item.name), ['actual-plugin', 'preset-ready']);
  assert.equal(released, true);
  assert.equal(result.issues.length, 2);
  assert.equal(events.at(-1).type, 'complete');
  const request = { headers: { host: '127.0.0.1:3000', origin: 'http://127.0.0.1:3000', 'x-dsh-token': 'token' }, socket: { remoteAddress: '127.0.0.1' } };
  assert.equal(localRequest(request, 3000, 'token', true), true);
  assert.equal(localRequest(request, 3000, 'wrong', true), false);
  request.socket.remoteAddress = '192.168.1.2';
  assert.equal(localRequest(request, 3000, 'token'), false);
  request.socket.remoteAddress = '127.0.0.1';
  request.headers.origin = 'https://attacker.example';
  assert.equal(localRequest(request, 3000, 'token', true), false);
  request.headers.origin = 'http://127.0.0.1:3000'; request.headers.host = 'attacker.example';
  assert.equal(localRequest(request, 3000, 'token'), false);
});

test('only matching iframe completion closes the native overlay', async () => {
  const { runInNewContext } = await import('node:vm');
  const listeners = new Map(); let appended = false, removed = false, remembered = false;
  const frame = { style: {}, nodeType: 1, contentWindow: {}, setAttribute() {}, addEventListener() {}, focus() {}, remove() { removed = true; } };
  const exit = { style: {}, nodeType: 1, setAttribute() {}, addEventListener() {}, removeEventListener() {}, remove() {} };
  const background = { nodeType: 1, inert: false }, alreadyInert = { nodeType: 1, inert: true };
  runInNewContext(readFileSync(new URL('./overlay.mjs', import.meta.url), 'utf8'), {
    fetch: async () => ({ ok: true, json: async () => ({ enabled: true, instance: 'a' }) }),
    crypto: { randomUUID: () => 'channel-123' }, URLSearchParams,
    location: { origin: 'http://127.0.0.1:3080' },
    sessionStorage: { getItem: () => null, setItem: () => { remembered = true; } },
    document: { readyState: 'complete', documentElement: { dataset: { theme: 'dark' } }, createElement: tag => tag === 'iframe' ? frame : exit, body: { children: [background, alreadyInert], append() { appended = true; } } },
    MutationObserver: class { observe() {} disconnect() {} },
    window: { addEventListener: (kind, fn) => listeners.set(kind, fn), removeEventListener: kind => listeners.delete(kind) },
    console, setTimeout, clearTimeout,
  });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(appended, true);
  const iframeUrl = new URL(frame.src, 'http://127.0.0.1:3080');
  assert.equal(iframeUrl.pathname, '/__laterano_ui/startup-preview.html');
  assert.equal(iframeUrl.searchParams.get('style'), 'laterano');
  assert.equal(iframeUrl.searchParams.get('theme'), 'dark');
  assert.equal(background.inert, true);
  const event = { origin: 'http://127.0.0.1:3080', source: frame.contentWindow, data: { source: 'dsh-startup', channel: 'channel123', type: 'complete' } };
  const complete = listeners.get('message');
  complete({ ...event, source: {} }); assert.equal(removed, false);
  complete({ ...event, origin: 'https://other.example' }); assert.equal(removed, false);
  complete({ ...event, data: { ...event.data, channel: 'wrong' } }); assert.equal(removed, false);
  complete(event); assert.equal(removed, true); assert.equal(remembered, true);
  assert.equal(background.inert, false); assert.equal(alreadyInert.inert, true);
});

test('optional Rust access checks stay inside the startup namespace on official DSH', async () => {
  const { runInNewContext } = await import('node:vm');
  const calls = [];
  const window = { fetch: async (input) => { calls.push(input); return { status: 404 }; } };
  runInNewContext(readFileSync(new URL('./bridge.mjs', import.meta.url), 'utf8'), { window, document: { addEventListener() {} } });
  await window.fetch('/api/access');
  await window.fetch('/api/profile');
  await window.fetch('/assets/voice/phase-0.wav');
  await window.fetch('/api/official-session');
  assert.deepEqual(calls, ['/__laterano_ui/api/access', '/__laterano_ui/api/profile', '/__laterano_ui/assets/voice/phase-0.wav', '/api/official-session']);
});

test('package keeps its own launcher and the exact official dependency', () => {
  const manifest = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
  assert.equal(manifest.name, '@laterano-ui/native-startup');
  assert.deepEqual(manifest.bin, { 'dsh-laterano': 'cli.mjs' });
  assert.equal(manifest.dependencies['@deepseek-ai/dsh'], '0.2.0-rc.2');
  assert.equal(name, 'laterano-ui-startup');
  assert.equal(PREFIX, '/__laterano_ui');
});

test('official login and mutation token protect the isolated profile and one-shot choice', async () => {
  const home = mkdtempSync(join(tmpdir(), 'laterano-ui-route-test-'));
  const previous = process.env.DSH_HOME; process.env.DSH_HOME = home;
  try {
    let route;
    const ctx = {
      effect: effect => effect(), on() {},
      webServer: { port: 3000, register: value => { route = value; } },
      connection: { requestRejection: req => req.headers.authorization === 'fixture-login' ? undefined : 401 },
    };
    apply(ctx);
    chooseNext(true);
    const request = async (path, { loggedIn = true, method = 'GET', payload, token, launch = false } = {}) => {
      const headers = { host: '127.0.0.1:3000', origin: 'http://127.0.0.1:3000' };
      if (loggedIn) headers.authorization = 'fixture-login';
      if (token) headers['x-dsh-token'] = token;
      if (launch) headers['x-dsh-startup'] = 'launch';
      const req = { url: PREFIX + path, method, headers, socket: { remoteAddress: '127.0.0.1' }, async *[Symbol.asyncIterator]() { if (payload !== undefined) yield JSON.stringify(payload); } };
      let status, result;
      const res = { writeHead(value) { status = value; }, end(value) { result = value && JSON.parse(value); } };
      await route.handler(req, res);
      return { status, result };
    };
    assert.equal(route.path, PREFIX);
    assert.equal((await request('/api/profile', { loggedIn: false })).status, 401);
    assert.equal((await request('/launch', { loggedIn: false, launch: true })).status, 401);
    assert.equal(existsSync(join(dataDirectory(), 'next.json')), true);
    assert.equal((await request('/launch')).status, 403);
    const { result: profile } = await request('/api/profile');
    assert.equal(profile.visual_style, 'laterano');
    assert.equal(profile.runtime, 'native');
    assert.equal(profile.inventory_mode, 'mounted');
    assert.equal((await request('/api/profile', { method: 'POST', payload: { username: 'Bad' }, token: 'wrong' })).status, 403);
    assert.equal((await request('/api/profile', { method: 'POST', payload: { visual_style: 'rhine' }, token: profile.token })).status, 400);
    const saved = await request('/api/profile', { method: 'POST', payload: { username: 'Verified', badge_id: 'DSH-REAL' }, token: profile.token });
    assert.equal(saved.result.username, 'Verified');
    assert.equal(saved.result.visual_style, 'laterano');
    assert.equal((await request('/launch', { launch: true })).result.enabled, true);
    assert.equal(existsSync(join(dataDirectory(), 'next.json')), false);
    assert.equal((await request('/api/access')).status, 404);
  } finally { if (previous === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = previous; rmSync(home, { recursive: true, force: true }); }
});
