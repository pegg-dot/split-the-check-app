/* global React, Icon, Avatar, Button, Squiggle, SketchCheck, Blob, ReceiptDoodle, money, SheetPortal */
const { useState: useS, useEffect: useE } = React;

const TONE_FOR = { Sarah: 'clay', Mia: 'plum', Diego: 'sage', Jordan: 'gold' };
const toneFor = (n) => TONE_FOR[n] || 'sky';

/* ============================ WELCOME ============================ */
function Welcome({ onStart, onJoin }) {
  return (
    <div className="pg wel">
      <Blob tone="var(--clay-soft)" size={320} style={{ top: -70, right: -110, opacity: .75 }} />
      <Blob tone="var(--sage-soft)" size={240} style={{ bottom: 20, left: -100, opacity: .6 }} />
      <div className="wel-mark"><img src="logo-mark.svg" width="48" height="48" alt="" /></div>
      <h1 className="h1" style={{ fontSize: '2.5rem', position: 'relative', zIndex: 2 }}>
        Split the{' '}
        <span style={{ position: 'relative', display: 'inline-block' }}>
          check
          <Squiggle width={118} style={{ position: 'absolute', left: -2, bottom: -11 }} />
        </span>
      </h1>
      <p className="lead wel-sub" style={{ position: 'relative', zIndex: 2 }}>
        Pay for exactly what you ordered.<br /><span className="serif-i" style={{ fontSize: '1.15rem' }}>Nothing more, nothing less.</span>
      </p>
      <div className="wel-actions">
        <Button icon="camera" onClick={onStart}>Snap the receipt</Button>
        <Button variant="soft" icon="qr-code" onClick={onJoin}>Join with a code</Button>
      </div>
    </div>
  );
}

/* ============================ CLAIM (the heart) ============================ */
function ClaimScreen({ items, setItems, me, host, roster, tip, subtotal, tax, autoRelease, simulateJoins, onDone }) {
  const [toast, setToast] = useS(null);
  const [menu, setMenu] = useS(null);        // {id, idx} whose options sheet is open
  const [confirm, setConfirm] = useS(false); // unclaimed-items confirm sheet
  const simRef = React.useRef(new Set());
  function flash(m) { setToast(m); clearTimeout(window.__ot); window.__ot = setTimeout(() => setToast(null), 1800); }
  function updItem(id, fn) { setItems((p) => p.map((it) => (it.id === id ? fn(it) : it))); }
  function updUnit(id, idx, fn) { setItems((p) => p.map((it) => (it.id !== id ? it : { ...it, units: it.units.map((u, i) => (i === idx ? fn(u) : u)) }))); }

  // ---- the one verb dispatcher for a unit ----
  function unit(id, idx, verb) {
    const it = items.find((x) => x.id === id); if (!it) return;
    if (verb === 'grab') { updUnit(id, idx, () => ({ shared: false, claims: [me], dispute: undefined })); flash(`Yours — ${it.name}`); }
    else if (verb === 'release') updUnit(id, idx, (u) => { const c = u.claims.filter((n) => n !== me); return { shared: c.length > 1 ? u.shared : false, claims: c, dispute: undefined }; });
    else if (verb === 'split') { updUnit(id, idx, (u) => ({ shared: true, dispute: undefined, claims: u.claims.includes(me) ? u.claims : [...u.claims, me] })); flash(`You split it — others can jump in`); }
    else if (verb === 'join') { updUnit(id, idx, (u) => ({ ...u, shared: true, claims: u.claims.includes(me) ? u.claims : [...u.claims, me] })); flash(`You're in — ${it.name}`); }
    else if (verb === 'splitWith') { const o = it.units[idx].claims.filter((n) => n !== me)[0]; updUnit(id, idx, (u) => ({ shared: true, dispute: undefined, claims: u.claims.includes(me) ? u.claims : [...u.claims, me] })); flash(`Split with ${o || 'them'} — others can jump in`); }
    else if (verb === 'leave') updUnit(id, idx, (u) => { const c = u.claims.filter((n) => n !== me); return { shared: c.length > 1, claims: c, dispute: undefined }; });
    else if (verb === 'cover') { updItem(id, (x) => ({ ...x, covered: true, units: x.units.map(() => ({ shared: false, claims: [me], dispute: undefined })) })); flash(`You're covering the ${it.name}`); }
    else if (verb === 'coverUnit') { const had = it.units[idx].claims.filter((n) => n !== me).length; updUnit(id, idx, () => ({ shared: false, claims: [me], dispute: undefined })); flash(had ? `You're covering the whole ${it.name} — others are off it` : `You've got this one`); }
    else if (verb === 'clear') updItem(id, (x) => ({ ...x, covered: false, units: x.units.map((u) => ({ ...u, claims: u.claims.filter((n) => n !== me), shared: u.claims.filter((n) => n !== me).length > 1 ? u.shared : false })) }));
    else if (verb === 'dispute') updUnit(id, idx, (u) => ({ ...u, dispute: { by: me } }));
    else if (verb === 'cancel') updUnit(id, idx, (u) => ({ ...u, dispute: undefined }));
    else if (verb === 'accept') updUnit(id, idx, (u) => ({ shared: false, claims: u.dispute ? [u.dispute.by] : u.claims, dispute: undefined })); // "you're right, it's theirs"
  }

  // ---- simulated friend opting into a split I just declared (demo realism) ----
  useE(() => {
    if (!simulateJoins) return;
    const timers = [];
    items.forEach((it) => (it.units || []).forEach((u, i) => {
      const key = it.id + ':' + i;
      if (u.shared && u.claims.includes(me) && u.claims.length === 1 && !simRef.current.has(key)) {
        simRef.current.add(key);
        const friend = (roster || []).find((n) => !u.claims.includes(n));
        if (friend) timers.push(setTimeout(() => { updUnit(it.id, i, (uu) => (uu.claims.includes(friend) || !uu.shared ? uu : { ...uu, claims: [...uu.claims, friend] })); flash(`${friend} jumped in too`); }, 1900));
      }
    }));
    return () => timers.forEach(clearTimeout);
  }, [items, simulateJoins, roster, me]);

  // ---- a friend I disputed auto-releases to me ----
  useE(() => {
    if (!autoRelease) return;
    let timer;
    items.forEach((it) => (it.units || []).forEach((u, i) => {
      if (u.dispute && u.dispute.by === me) {
        const owner = u.claims.find((n) => n !== me);
        timer = setTimeout(() => { updUnit(it.id, i, () => ({ shared: false, claims: [me], dispute: undefined })); flash(`${owner || 'They'} let you have it`); }, 1900);
      }
    }));
    return () => clearTimeout(timer);
  }, [items, autoRelease, me]);

  const myTotalRaw = items.reduce((s, it) => s + shareOf(it, me), 0);
  const prop = subtotal ? myTotalRaw / subtotal : 0;
  const myTotal = myTotalRaw + (tax + subtotal * (tip / 100)) * prop;
  const count = items.filter((it) => myUnitCount(it, me) > 0).length;
  const unclaimedItems = items.filter((it) => !itemClaimed(it));

  function done() { if (unclaimedItems.length > 0) setConfirm(true); else onDone(myTotal); }

  // contextual options for a (item, unit) — used by both single cards and per-unit menus
  function actionsFor(it, idx) {
    const u = it.units[idx];
    const mineIn = u.claims.includes(me);
    const others = u.claims.filter((n) => n !== me);
    const isShared = !!u.shared;
    const A = [];
    if (others.length && !isShared && !mineIn) {           // someone's solo claim
      A.push({ icon: 'users', label: `I split this`, sub: `Keeps ${others[0]} on it — others can tap “I’m in”`, onClick: () => unit(it.id, idx, 'splitWith') });
      A.push({ icon: 'gift', label: `I'm covering this`, sub: `Pay ${others[0]}'s ${money(unitPrice(it))} myself`, onClick: () => unit(it.id, idx, 'coverUnit') });
      A.push({ icon: 'hand', label: 'Actually, this is mine', sub: `Ask ${others[0]} to hand it over`, onClick: () => unit(it.id, idx, 'dispute') });
    } else if (isShared && mineIn) {                        // I'm in a split
      A.push({ icon: 'user-minus', label: 'Leave the split', onClick: () => unit(it.id, idx, 'leave') });
      A.push({ icon: 'gift', label: `I'm covering it all instead`, sub: `Pay the whole ${money(unitPrice(it))}`, onClick: () => unit(it.id, idx, 'coverUnit') });
    } else if (isShared && !mineIn) {                       // a split I'm not in
      A.push({ icon: 'plus', label: `I'm in`, sub: `Split it ${u.claims.length + 1} ways`, onClick: () => unit(it.id, idx, 'join') });
      A.push({ icon: 'gift', label: `I'm covering it all instead`, sub: 'Takes everyone else off it', onClick: () => unit(it.id, idx, 'coverUnit') });
    } else if (mineIn) {                                    // my solo claim
      A.push({ icon: 'users', label: 'I split this', sub: 'Others can tap “I’m in”', onClick: () => unit(it.id, idx, 'split') });
      A.push({ icon: 'x', label: 'Remove me', danger: true, onClick: () => unit(it.id, idx, 'release') });
    } else {                                                // open
      A.push({ icon: 'check', label: 'I ordered this', onClick: () => unit(it.id, idx, 'grab') });
      A.push({ icon: 'users', label: 'I split this', sub: 'Others can tap “I’m in”', onClick: () => unit(it.id, idx, 'split') });
      A.push({ icon: 'gift', label: `I'm covering this`, sub: 'Pay for it entirely', onClick: () => unit(it.id, idx, 'coverUnit') });
    }
    return A;
  }

  const menuItem = menu && items.find((it) => it.id === menu.id);

  return (
    <div className="pg">
      <div className="claim-head">
        <div className="h1">Hey {me} <span className="wave-em"><Icon name="hand" size={24} color="var(--clay)" stroke={2} /></span></div>
        <p className="lead" style={{ marginTop: 4 }}>Tap what you ordered. Shared it? Hit the <b style={{ color: 'var(--clay-deep)' }}>⋯</b> for every way to split.</p>
      </div>

      <div className="icards">
        {items.map((it) => {
          const sig = it.units.map((u) => (u.shared ? 's' : '') + u.claims.join('.') + (u.dispute ? 'D' + u.dispute.by : '')).join('|');
          return <ItemCard key={it.id + ':' + sig} item={it} me={me} onUnit={(idx, v) => unit(it.id, idx, v)} onMenu={(idx) => setMenu({ id: it.id, idx })} />;
        })}
      </div>
      {unclaimedItems.length > 0 && (
        <p className="unclaimed-hint"><Icon name="hand-coins" size={15} stroke={2} /> {unclaimedItems.length} item{unclaimedItems.length > 1 ? 's' : ''} no one's grabbed yet</p>
      )}

      <div className="fbar">
        <div className="fbar-card">
          <div className="fbar-tot">
            <div className="l">Your share so far</div>
            <div className="v mono">{money(myTotal)}</div>
          </div>
          <Button variant="clay" icon="arrow-right" full={false} disabled={count === 0} onClick={done}>I'm done</Button>
        </div>
      </div>
      {toast && <div className="toast">{toast}</div>}

      {/* options action sheet */}
      {menuItem && (
        <SheetPortal>
        <div className="scrim" onClick={(e) => e.target === e.currentTarget && setMenu(null)}>
          <div className="sheet" style={{ textAlign: 'left' }}>
            <div className="sheet-grip" />
            <div className="menu-title">{menuItem.name}{menuItem.units.length > 1 ? ` · one of ${menuItem.units.length}` : ''}</div>
            <p className="cap menu-sub" style={{ marginBottom: 14 }}>{money(unitPrice(menuItem))}{menuItem.units.length > 1 ? ' each' : ''}</p>
            {actionsFor(menuItem, menu.idx).map((a, i) => (
              <button key={i} className={`act-row ${a.danger ? 'danger' : ''}`} onClick={() => { a.onClick(); setMenu(null); }}>
                <span className="ai"><Icon name={a.icon} size={19} stroke={2} /></span>
                <span><span>{a.label}</span>{a.sub && <span className="as">{a.sub}</span>}</span>
              </button>
            ))}
            {menuItem.units.length > 1 && (
              <button className="act-row" onClick={() => { unit(menuItem.id, 0, 'cover'); setMenu(null); }}>
                <span className="ai"><Icon name="hand-coins" size={19} stroke={2} /></span>
                <span><span>I had all {menuItem.units.length}</span><span className="as">Put the whole {money(menuItem.price)} on me</span></span>
              </button>
            )}
          </div>
        </div>
        </SheetPortal>
      )}

      {/* edge case: items nobody claimed */}
      {confirm && (
        <SheetPortal>
        <div className="scrim" onClick={(e) => e.target === e.currentTarget && setConfirm(false)}>
          <div className="sheet" style={{ textAlign: 'left' }}>
            <div className="sheet-grip" />
            <div className="h2" style={{ textAlign: 'center' }}>A few things are unclaimed</div>
            <p className="cap" style={{ textAlign: 'center', marginBottom: 16 }}>Nobody tapped these yet. Leave them and they stay on {host}'s tab.</p>
            <div className="unclaimed-list">
              {unclaimedItems.map((it) => (
                <div className="srow" key={it.id} style={{ borderColor: 'var(--line-2)' }}>
                  <span className="nm">{it.name}{it.units.length > 1 ? ` ×${it.units.length}` : ''}</span><span className="pr mono">{money(it.price)}</span>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 18 }}>
              <Button variant="soft" icon="hand-coins" onClick={() => setConfirm(false)}>Keep claiming</Button>
              <Button variant="clay" icon="arrow-right" onClick={() => { setConfirm(false); onDone(myTotal); }}>Leave on {host}'s tab</Button>
            </div>
          </div>
        </div>
        </SheetPortal>
      )}
    </div>
  );
}

/* a single dish renders its lone unit in the card body; a "×N" renders unit rows */
function ItemCard({ item, me, onUnit, onMenu }) {
  const multi = item.units.length > 1;
  const up = unitPrice(item);
  const anyDispute = item.units.some((u) => u.dispute);

  if (multi) {
    const mineUnits = item.units.filter((u) => u.claims.includes(me)).length;
    const openUnits = item.units.filter((u) => u.claims.length === 0).length;
    return (
      <div className="icard multi">
        <div className="icard-top">
          <span className={`tgt ${mineUnits ? '' : 'empty-tgt'}`} style={mineUnits ? { background: 'var(--clay)', borderColor: 'var(--clay)' } : {}}>{mineUnits ? <span className="tgt-n">{mineUnits}</span> : <Icon name="layers" size={15} stroke={2} color="var(--ink-3)" />}</span>
          <span className="icard-name">{item.name}<span className="icard-qty">×{item.units.length}</span></span>
          <span className="icard-price mono">{money(item.price)}</span>
        </div>
        <div className="ulist">
          {item.units.map((u, i) => (
            <UnitRow key={i} item={item} u={u} idx={i} up={up} me={me} onUnit={onUnit} onMenu={onMenu} multi />
          ))}
          <div className="ulist-foot">
            <span className="split-meta">{money(up)} each · {openUnits > 0 ? `${openUnits} still open` : 'all spoken for'}</span>
          </div>
        </div>
      </div>
    );
  }

  // ---------- single ----------
  const u = item.units[0];
  const mineIn = u.claims.includes(me);
  const others = u.claims.filter((n) => n !== me);
  const isShared = !!u.shared;
  const disp = u.dispute;
  const disputeByMe = disp && disp.by === me;
  const disputeOnMine = disp && mineIn && disp.by !== me;
  const open = u.claims.length === 0 && !disp;
  const heldByOther = !isShared && others.length > 0 && !mineIn && !disp;
  const sharedNotIn = isShared && !mineIn && !disp;
  const sharedIn = isShared && mineIn && !disp;
  const soloMine = !isShared && mineIn && !disp;
  const each = u.claims.length ? item.price / u.claims.length : item.price;

  let target;
  if (disputeByMe) target = <span key="d"><Avatar name={others[0] || '?'} tone={toneFor(others[0])} size={30} /></span>;
  else if (mineIn) target = <span key="m" className="tgt" style={{ background: 'var(--clay)', borderColor: 'var(--clay)' }}><SketchCheck size={17} /></span>;
  else if (others.length) target = <span key="o"><Avatar name={others[0]} tone={toneFor(others[0])} size={30} /></span>;
  else target = <span key="e" className="tgt" />;

  const canTap = open || soloMine || sharedNotIn;
  function tapCard() {
    if (open) onUnit(0, 'grab');
    else if (soloMine) onUnit(0, 'release');
    else if (sharedNotIn) onUnit(0, 'join');
  }

  const cardStyle = { cursor: canTap ? 'pointer' : 'default' };
  if (mineIn && !disp) { cardStyle.background = 'var(--clay-soft)'; cardStyle.borderColor = 'var(--clay-edge)'; }
  else if (heldByOther) { cardStyle.background = 'var(--bg-2)'; }

  return (
    <div className={`icard ${mineIn && !disp ? 'mine' : ''} ${heldByOther ? 'held' : ''}`} style={cardStyle} onClick={() => { if (canTap) tapCard(); }}>
      <div className="icard-top">
        {target}
        <span className="icard-name">{item.name}{item.covered && mineIn ? <span className="cover-tag"><Icon name="gift" size={12} stroke={2.2} /> covering</span> : null}</span>
        <span className="icard-price mono">{money(item.price)}</span>
        {!disp && <button className="menu-btn" onClick={(e) => { e.stopPropagation(); onMenu(0); }} title="Options"><Icon name="ellipsis" size={20} stroke={2.2} /></button>}
      </div>

      {open && (
        <div className="icard-sub"><span className="split-meta muted">Tap if you ordered this</span></div>
      )}

      {soloMine && (
        <div className="icard-sub"><span className="split-meta">All yours</span></div>
      )}

      {heldByOther && (
        <div className="icard-sub">
          <span className="split-meta" style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{others[0]} ordered this</span>
        </div>
      )}

      {sharedNotIn && (
        <div className="icard-sub">
          <span className="split-meta" style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            <span className="av-stack">{u.claims.map((n) => <Avatar key={n} name={n} tone={toneFor(n)} size={22} />)}</span>
            {money(item.price / (u.claims.length + 1))} each if you join
          </span>
          <button className="chip-btn chip-join" onClick={(e) => { e.stopPropagation(); onUnit(0, 'join'); }}><Icon name="plus" size={14} stroke={2.4} /> I'm in</button>
        </div>
      )}

      {sharedIn && (
        <div className="icard-sub">
          <span className="split-meta">
            <span className="av-stack">{u.claims.map((n) => <Avatar key={n} name={n} tone={n === me ? 'gold' : toneFor(n)} size={22} />)}</span>
            · {money(each)} each {u.claims.length === 1 ? '· waiting for others to tap in' : `· split ${u.claims.length} ways`}
          </span>
        </div>
      )}

      {disputeByMe && (
        <div className="ec ec-wait">
          Asking {others[0] || 'them'} to hand it over…
          <div className="ec-row"><span /><button className="lk" onClick={(e) => { e.stopPropagation(); onUnit(0, 'cancel'); }}>Never mind</button></div>
        </div>
      )}

      {disputeOnMine && (
        <div className="ec ec-mine">
          <strong>{disp.by}</strong> says this one's theirs.
          <div className="ec-row">
            <button className="lk" onClick={(e) => { e.stopPropagation(); onUnit(0, 'accept'); }}>You're right — it's {disp.by}'s</button>
            <button className="solid" onClick={(e) => { e.stopPropagation(); onUnit(0, 'cancel'); }}>No, it's mine</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* one unit of a multi-quantity item */
function UnitRow({ item, u, idx, up, me, onUnit, onMenu }) {
  const mineIn = u.claims.includes(me);
  const others = u.claims.filter((n) => n !== me);
  const isShared = !!u.shared;
  const open = u.claims.length === 0;
  const heldByOther = !isShared && others.length > 0 && !mineIn;
  const sharedNotIn = isShared && !mineIn;
  const sharedIn = isShared && mineIn;
  const soloMine = !isShared && mineIn;
  const each = u.claims.length ? up / u.claims.length : up;

  let tgt;
  if (mineIn) tgt = <span className="utgt" style={{ background: 'var(--clay)', borderColor: 'var(--clay)' }}><SketchCheck size={13} /></span>;
  else if (others.length) tgt = <span className="utgt-av">{u.claims.slice(0, 2).map((n) => <Avatar key={n} name={n} tone={toneFor(n)} size={22} />)}</span>;
  else tgt = <span className="utgt" />;

  const canTap = open || soloMine || sharedNotIn;
  function tap() { if (open) onUnit(idx, 'grab'); else if (soloMine) onUnit(idx, 'release'); else if (sharedNotIn) onUnit(idx, 'join'); }

  let label;
  if (open) label = <span className="muted">Tap to grab · {money(up)}</span>;
  else if (soloMine) label = <span className="u-mine">Yours · {money(up)}</span>;
  else if (heldByOther) label = <span>{others[0]}'s · {money(up)}</span>;
  else if (sharedNotIn) label = <span>{money(up / (u.claims.length + 1))} ea if you join</span>;
  else label = <span className="u-mine">You + {others.length} · {money(each)} ea</span>;

  return (
    <div className={`urow ${mineIn ? 'mine' : ''} ${heldByOther ? 'held' : ''}`} style={{ cursor: canTap ? 'pointer' : 'default' }} onClick={() => { if (canTap) tap(); }}>
      {tgt}
      <span className="urow-label">{label}</span>
      <span className="urow-act">
        {sharedNotIn && <button className="chip-btn chip-join sm" onClick={(e) => { e.stopPropagation(); onUnit(idx, 'join'); }}><Icon name="plus" size={13} stroke={2.6} /> I'm in</button>}
        <button className="u-menu" onClick={(e) => { e.stopPropagation(); onMenu(idx); }} title="Options"><Icon name="ellipsis" size={18} stroke={2.2} /></button>
      </span>
    </div>
  );
}

/* ============================ YOUR SHARE (Stripe-clean) ============================ */
function ShareScreen({ items, me, host, tip, subtotal, tax, onPaid }) {
  const mine = items.map((it) => { const n = myUnitCount(it, me); return n > 0 ? { name: it.name + (it.units.length > 1 && n > 1 ? ` ×${n}` : ''), share: shareOf(it, me) } : null; }).filter(Boolean);
  const itemsTotal = mine.reduce((s, i) => s + i.share, 0);
  const prop = subtotal ? itemsTotal / subtotal : 0;
  const taxShare = tax * prop, tipShare = subtotal * (tip / 100) * prop;
  const total = itemsTotal + taxShare + tipShare;
  return (
    <div className="pg">
      <div className="sum-hero">
        <div className="disp" style={{ fontSize: '2.15rem' }}>Your share, <span className="serif-i">{me}</span></div>
        <p className="cap" style={{ marginTop: 6 }}>Just what you ordered — split fair.</p>
      </div>
      <div className="plate">
        <div className="sum-card">
          {mine.map((i, k) => (
            <div className="srow" key={k}><span className="nm">{i.name}</span><span className="pr mono">{money(i.share)}</span></div>
          ))}
          <div className="srow sub"><span>Tax</span><span className="mono">{money(taxShare)}</span></div>
          <div className="srow sub"><span>Tip · {tip}%</span><span className="mono">{money(tipShare)}</span></div>
          <div className="srow tot"><span className="nm">You owe</span><span className="pr mono">{money(total)}</span></div>
        </div>
      </div>
      <div style={{ flex: 1 }} />
      <Button variant="clay" icon="arrow-right" onClick={() => onPaid(total)}>Pay {host} {money(total)}</Button>
      <p className="pay-note">Sent instantly <b>via Venmo</b> · you both get a receipt</p>
    </div>
  );
}

/* ============================ SETTLED ============================ */
function SettledScreen({ me, host, paidAmount, people, onRestart }) {
  return (
    <div className="pg settled">
      <Blob tone="var(--sage-soft)" size={300} style={{ top: 30, right: -110, opacity: .7 }} />
      <div className="settled-mark">
        <div className="disc"><SketchCheck size={34} /></div>
        <Squiggle width={120} color="var(--sage)" style={{ position: 'absolute', bottom: -4, left: '50%', transform: 'translateX(-50%)' }} />
      </div>
      <div className="disp" style={{ fontSize: '2.2rem', position: 'relative', zIndex: 2 }}>All <span className="serif-i" style={{ color: 'var(--sage)' }}>squared up.</span></div>
      <p className="lead" style={{ marginTop: 12, position: 'relative', zIndex: 2 }}>
        You paid {host} {money(paidAmount)}. The whole table can see it's handled.
      </p>
      <div className="settled-list">
        {people.map((p) => (
          <div className="srow" key={p.name} style={{ borderColor: 'var(--line-2)' }}>
            <span className="split-meta"><Avatar name={p.name} tone={p.name === me ? 'gold' : toneFor(p.name)} size={28} />
              <span style={{ fontWeight: 600, color: 'var(--ink)', whiteSpace: 'nowrap' }}>{p.name === me ? 'You' : p.name}{p.host ? <span style={{ color: 'var(--ink-3)', fontWeight: 500 }}> · host</span> : ''}</span></span>
            {p.paid
              ? <span className="split-meta" style={{ color: 'var(--sage)', fontWeight: 700 }}><Icon name="check" size={15} stroke={2.6} /> Paid</span>
              : <span className="cap">Pending</span>}
          </div>
        ))}
      </div>
      <div style={{ flex: 1 }} />
      <Button variant="soft" icon="rotate-ccw" onClick={onRestart}>Start a new check</Button>
    </div>
  );
}

window.OScreens = { Welcome, ClaimScreen, ShareScreen, SettledScreen, toneFor };
