// Manual end-to-end socket smoke test (not part of `npm test`).
// Usage: PORT must already be running. node server/scripts/smoke.cjs <port>
const path = require('path');
const { io } = require(path.join(__dirname, '..', '..', 'client', 'node_modules', 'socket.io-client'));
const PORT = process.argv[2] || '3011';
const URL = `http://localhost:${PORT}`;
const SID = 'smoke_' + Date.now(); // unique per run (sessions persist across runs)
const wait = (ms) => new Promise(r => setTimeout(r, ms));
const conn = () => io(URL, { transports: ['websocket'], forceNew: true });

(async () => {
  const results = [];
  const log = (k, v) => results.push(`${v ? 'PASS' : 'FAIL'}  ${k}`);

  // ─── Host creates a session with unit-shaped items ───────────────────────
  const host = conn(); await new Promise(r => host.on('connect', r));
  host.emit('create-session', {
    sessionId: SID,
    hostName: 'Nate',
    venmoHandle: '@nate',
    hostDisplayName: 'Nate P.',
    items: [
      { id: '0', name: 'Burger', price: 20, quantity: 1,
        units: [{ shared: false, claims: [], dispute: null }] },
      { id: '1', name: 'Wine Bottle', price: 30, quantity: 3,
        units: [
          { shared: false, claims: [], dispute: null },
          { shared: false, claims: [], dispute: null },
          { shared: false, claims: [], dispute: null },
        ] },
    ],
    subtotal: 50, tax: 5, tipPercent: 20, currency: 'USD', exchangeRate: 1,
  });
  await wait(150);

  // ─── Guest joins ─────────────────────────────────────────────────────────
  const alex = conn(); await new Promise(r => alex.on('connect', r));
  let alexState = null;
  alex.on('session-state', s => { alexState = s; });
  alex.emit('join-session', { sessionId: SID, guestName: 'Alex' });
  await wait(200);
  log('guest Alex receives session-state w/ host display name',
    alexState && alexState.hostDisplayName === 'Nate P.');

  // ─── Duplicate name rejected ──────────────────────────────────────────────
  const alex2 = conn(); await new Promise(r => alex2.on('connect', r));
  let dupErr = null; alex2.on('error', e => { dupErr = e; });
  alex2.emit('join-session', { sessionId: SID, guestName: 'alex' });
  await wait(200);
  log('duplicate name rejected', !!dupErr && /taken/i.test(dupErr.message || ''));

  // ─── grab-unit: Alex grabs item 0 unit 0 ─────────────────────────────────
  let lastUpdated = null;
  alex.on('items-updated', p => { lastUpdated = p; });
  host.on('items-updated', p => { lastUpdated = p; });

  alex.emit('grab-unit', { sessionId: SID, itemId: '0', unitIndex: 0 });
  await wait(200);
  log('grab-unit: item 0 unit 0 claims includes Alex',
    lastUpdated && lastUpdated.items &&
    lastUpdated.items[0].units[0].claims.includes('Alex'));

  // ─── split-unit: Alex splits item 1 unit 0 ────────────────────────────────
  lastUpdated = null;
  alex.emit('split-unit', { sessionId: SID, itemId: '1', unitIndex: 0 });
  await wait(200);
  log('split-unit: item 1 unit 0 claims includes Alex + shared=true',
    lastUpdated && lastUpdated.items &&
    lastUpdated.items[1].units[0].claims.includes('Alex') &&
    lastUpdated.items[1].units[0].shared === true);

  // ─── join-unit: Nate joins item 1 unit 0 ─────────────────────────────────
  lastUpdated = null;
  host.emit('join-unit', { sessionId: SID, itemId: '1', unitIndex: 0 });
  await wait(200);
  log('join-unit: item 1 unit 0 now has both Alex and Nate',
    lastUpdated && lastUpdated.items &&
    lastUpdated.items[1].units[0].claims.includes('Alex') &&
    lastUpdated.items[1].units[0].claims.includes('Nate'));

  // ─── cover-unit: Nate covers item 1 unit 1 ───────────────────────────────
  lastUpdated = null;
  host.emit('cover-unit', { sessionId: SID, itemId: '1', unitIndex: 1 });
  await wait(200);
  log('cover-unit: item 1 unit 1 solely claimed by Nate',
    lastUpdated && lastUpdated.items &&
    lastUpdated.items[1].units[1].claims.length === 1 &&
    lastUpdated.items[1].units[1].claims[0] === 'Nate');

  // ─── dispute-unit: Alex disputes item 1 unit 1 (owned solely by Nate) ────
  lastUpdated = null;
  alex.emit('dispute-unit', { sessionId: SID, itemId: '1', unitIndex: 1 });
  await wait(200);
  log('dispute-unit: item 1 unit 1 has dispute.by = Alex',
    lastUpdated && lastUpdated.items &&
    lastUpdated.items[1].units[1].dispute &&
    lastUpdated.items[1].units[1].dispute.by === 'Alex');

  // ─── resolve-dispute: Nate (owner) rejects Alex's dispute ────────────────
  lastUpdated = null;
  // Nate is the current owner; he rejects (accept=false) so unit stays with Nate
  host.emit('resolve-dispute', { sessionId: SID, itemId: '1', unitIndex: 1, accept: false });
  await wait(200);
  log('resolve-dispute(reject): dispute cleared, unit still claimed by Nate',
    lastUpdated && lastUpdated.items &&
    lastUpdated.items[1].units[1].dispute === null &&
    lastUpdated.items[1].units[1].claims.includes('Nate'));

  // ─── payment two-state ────────────────────────────────────────────────────
  alex.emit('mark-paid', { sessionId: SID, guestName: 'Alex' });
  await wait(120);
  host.emit('confirm-paid', { sessionId: SID, guestName: 'Alex' });
  await wait(150);

  let s = await (await fetch(`${URL}/api/session/${SID}`)).json();
  const pay = s.payments.find(p => p.guestName === 'Alex');
  log('payment two-state = confirmed', pay && pay.status === 'confirmed');
  log('pay-time snapshot stored (paidTotal)', pay && typeof pay.paidTotal === 'number');

  // ─── Live sync: host edit broadcasts session-updated to guests ────────────
  let gotUpdate = false;
  alex.on('session-updated', () => { gotUpdate = true; });
  host.emit('create-session', { sessionId: SID, hostName: 'Nate', venmoHandle: '@nate',
    items: s.items, subtotal: 50, tax: 5, tipPercent: 25, currency: 'USD', exchangeRate: 1 });
  await wait(200);
  log('host edit broadcasts session-updated to guests', gotUpdate);

  // ─── resolve-leftover ─────────────────────────────────────────────────────
  // Add an unclaimed unit item and have the host resolve it.
  host.emit('create-session', { sessionId: SID, hostName: 'Nate', venmoHandle: '@nate',
    items: [
      ...s.items,
      { id: '2', name: 'Dessert', price: 8, quantity: 1,
        units: [{ shared: false, claims: [], dispute: null }] },
    ],
    subtotal: 58, tax: 5, tipPercent: 0, currency: 'USD', exchangeRate: 1 });
  await wait(150);

  lastUpdated = null;
  host.emit('resolve-leftover', { mode: 'me', sessionId: SID });
  await wait(200);
  // Check via items-updated broadcast OR REST
  s = await (await fetch(`${URL}/api/session/${SID}`)).json();
  const dessert = s.items.find(i => String(i.id) === '2');
  log('resolve-leftover assigned unclaimed Dessert to host (Nate)',
    dessert && dessert.units && dessert.units[0].claims.includes('Nate'));

  // ─── remove-guest ─────────────────────────────────────────────────────────
  host.emit('remove-guest', { sessionId: SID, guestName: 'Alex' });
  await wait(200);
  s = await (await fetch(`${URL}/api/session/${SID}`)).json();
  const alexInUnits = s.items.some(item =>
    (item.units || []).some(u => u.claims.includes('Alex'))
  );
  log('remove-guest dropped Alex + released unit claims',
    s.guests.length === 0 && !alexInUnits);

  // ─── Authorization: guest CANNOT remove host ──────────────────────────────
  const eve = conn(); await new Promise(r => eve.on('connect', r));
  eve.emit('join-session', { sessionId: SID, guestName: 'Eve' });
  await wait(150);
  eve.emit('remove-guest', { sessionId: SID, guestName: 'Nate' }); // must be ignored
  await wait(200);
  s = await (await fetch(`${URL}/api/session/${SID}`)).json();
  log('guest CANNOT remove host (authorization holds)',
    s.hostName === 'Nate' && s.guests.some(g => g.name === 'Eve'));

  console.log('\n' + results.join('\n'));
  host.close(); alex.close(); alex2.close(); eve.close();
  process.exit(results.some(r => r.startsWith('FAIL')) ? 1 : 0);
})().catch(e => { console.error('SMOKE ERROR', e); process.exit(2); });
