import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useSession, calculatePersonTotal, formatPrice as fmtPrice, unitPrice } from '../context/SessionContext';
import { Avatar, AvatarStack, toneFor, Icon, Button, SketchCheck, SheetPortal } from '../components/ui/index.js';
import { socket, BACKEND_URL } from '../context/socket';

// ── Pure helpers (no socket, no context — safe to unit-test in isolation) ───

/** @pure */
function UnitRow({ item, u, idx, up, me, onUnit, onMenu, currency = 'USD' }) {
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
  const each = u.claims.length ? up / u.claims.length : up;

  let tgt;
  if (disputeByMe) {
    tgt = <span className="utgt-av"><Avatar name={others[0] || '?'} tone={toneFor(others[0])} size={22} /></span>;
  } else if (mineIn) {
    tgt = <span className="utgt" style={{ background: 'var(--clay)', borderColor: 'var(--clay)' }}><SketchCheck size={13} /></span>;
  } else if (others.length) {
    tgt = <span className="utgt-av">{u.claims.slice(0, 2).map((n) => <Avatar key={n} name={n} tone={toneFor(n)} size={22} />)}</span>;
  } else {
    tgt = <span className="utgt" />;
  }

  // When a dispute is active: not tappable, no ⋯ menu
  const canTap = !disp && (open || soloMine || sharedNotIn);
  function tap() {
    if (open) onUnit(idx, 'grab');
    else if (soloMine) onUnit(idx, 'release');
    else if (sharedNotIn) onUnit(idx, 'join');
  }

  let label;
  if (open) label = <span className="muted">Tap to grab · {fmtPrice(up, currency)}</span>;
  else if (soloMine) label = <span className="u-mine">Yours · {fmtPrice(up, currency)}</span>;
  else if (heldByOther) label = <span>{others[0]}'s · {fmtPrice(up, currency)}</span>;
  else if (sharedNotIn) label = <span>{fmtPrice(up / (u.claims.length + 1), currency)} ea if you join</span>;
  else if (disp) label = null; // dispute affordance rendered below
  else label = <span className="u-mine">You + {others.length} · {fmtPrice(each, currency)} ea</span>;

  return (
    <div
      className={`urow ${mineIn && !disp ? 'mine' : ''} ${heldByOther ? 'held' : ''}`}
      style={{ cursor: canTap ? 'pointer' : 'default' }}
      onClick={() => { if (canTap) tap(); }}
    >
      {tgt}
      <span className="urow-label">{label}</span>
      {!disp && (
        <span className="urow-act">
          {sharedNotIn && (
            <button
              className="chip-btn chip-join sm"
              onClick={(e) => { e.stopPropagation(); onUnit(idx, 'join'); }}
            >
              <Icon name="plus" size={13} stroke={2.6} /> I’m in
            </button>
          )}
          <button
            className="u-menu"
            onClick={(e) => { e.stopPropagation(); onMenu(idx); }}
            title="Options"
          >
            <Icon name="ellipsis" size={18} stroke={2.2} />
          </button>
        </span>
      )}
      {disputeByMe && (
        <span className="urow-disp ec-wait">
          Asking {others[0] || 'them'}…
          <button className="lk" onClick={(e) => { e.stopPropagation(); onUnit(idx, 'cancel'); }}>
            Never mind
          </button>
        </span>
      )}
      {disputeOnMine && (
        <span className="urow-disp ec-mine">
          <strong>{disp.by}</strong> wants this
          <button className="lk" onClick={(e) => { e.stopPropagation(); onUnit(idx, 'resolveAccept'); }}>
            Give it up
          </button>
          <button className="solid" onClick={(e) => { e.stopPropagation(); onUnit(idx, 'resolveReject'); }}>
            No, mine
          </button>
        </span>
      )}
    </div>
  );
}

/**
 * Pure, exported card component — safe to render in isolation (no useSession,
 * no socket calls). All data comes in via props.
 */
export function ItemCard({ item, me, onUnit, onMenu, currency = 'USD' }) {
  const multi = item.units.length > 1;
  const up = unitPrice(item);

  if (multi) {
    const mineUnits = item.units.filter((u) => u.claims.includes(me)).length;
    const openUnits = item.units.filter((u) => u.claims.length === 0).length;
    return (
      <div className="icard multi">
        <div className="icard-top">
          <span
            className={`tgt ${mineUnits ? '' : 'empty-tgt'}`}
            style={mineUnits ? { background: 'var(--clay)', borderColor: 'var(--clay)' } : {}}
          >
            {mineUnits
              ? <span className="tgt-n">{mineUnits}</span>
              : <Icon name="layers" size={15} stroke={2} color="var(--ink-3)" />}
          </span>
          <span className="icard-name">
            {item.name}<span className="icard-qty">×{item.units.length}</span>
          </span>
          <span className="icard-price mono">{fmtPrice(item.price, currency)}</span>
        </div>
        <div className="ulist">
          {item.units.map((u, i) => (
            <UnitRow
              key={i}
              item={item}
              u={u}
              idx={i}
              up={up}
              me={me}
              onUnit={onUnit}
              onMenu={onMenu}
              currency={currency}
            />
          ))}
          <div className="ulist-foot">
            <span className="split-meta">
              {fmtPrice(up, currency)} each · {openUnits > 0 ? `${openUnits} still open` : 'all spoken for'}
            </span>
          </div>
        </div>
      </div>
    );
  }

  // ── Single unit ─────────────────────────────────────────────────────
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
  if (disputeByMe) {
    target = <span key="d"><Avatar name={others[0] || '?'} tone={toneFor(others[0])} size={30} /></span>;
  } else if (mineIn) {
    target = <span key="m" className="tgt" style={{ background: 'var(--clay)', borderColor: 'var(--clay)' }}><SketchCheck size={17} /></span>;
  } else if (others.length) {
    target = <span key="o"><Avatar name={others[0]} tone={toneFor(others[0])} size={30} /></span>;
  } else {
    target = <span key="e" className="tgt" />;
  }

  const canTap = open || soloMine || sharedNotIn;
  function tapCard() {
    if (open) onUnit(0, 'grab');
    else if (soloMine) onUnit(0, 'release');
    else if (sharedNotIn) onUnit(0, 'join');
  }

  const cardStyle = { cursor: canTap ? 'pointer' : 'default' };
  if (mineIn && !disp) {
    cardStyle.background = 'var(--clay-soft)';
    cardStyle.borderColor = 'var(--clay-edge)';
  } else if (heldByOther) {
    cardStyle.background = 'var(--bg-2)';
  }

  return (
    <div
      className={`icard ${mineIn && !disp ? 'mine' : ''} ${heldByOther ? 'held' : ''}`}
      style={cardStyle}
      onClick={() => { if (canTap) tapCard(); }}
    >
      <div className="icard-top">
        {target}
        <span className="icard-name">
          {item.name}
          {item.covered && mineIn
            ? <span className="cover-tag"><Icon name="gift" size={12} stroke={2.2} /> covering</span>
            : null}
        </span>
        <span className="icard-price mono">{fmtPrice(item.price, currency)}</span>
        {!disp && (
          <button
            className="menu-btn"
            onClick={(e) => { e.stopPropagation(); onMenu(0); }}
            title="Options"
          >
            <Icon name="ellipsis" size={20} stroke={2.2} />
          </button>
        )}
      </div>

      {open && (
        <div className="icard-sub">
          <span className="split-meta muted">Tap if you ordered this</span>
        </div>
      )}

      {soloMine && (
        <div className="icard-sub">
          <span className="split-meta">All yours</span>
        </div>
      )}

      {heldByOther && (
        <div className="icard-sub">
          <span className="split-meta" style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {others[0]} ordered this
          </span>
        </div>
      )}

      {sharedNotIn && (
        <div className="icard-sub">
          <span className="split-meta" style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            <AvatarStack names={u.claims} me={me} size={22} />
            {' '}{fmtPrice(item.price / (u.claims.length + 1), currency)} each if you join
          </span>
          <button
            className="chip-btn chip-join"
            onClick={(e) => { e.stopPropagation(); onUnit(0, 'join'); }}
          >
            <Icon name="plus" size={14} stroke={2.4} /> I’m in
          </button>
        </div>
      )}

      {sharedIn && (
        <div className="icard-sub">
          <span className="split-meta">
            <AvatarStack names={u.claims} me={me} size={22} />
            {' '}· {fmtPrice(each, currency)} each{' '}
            {u.claims.length === 1 ? '· waiting for others to tap in' : `· split ${u.claims.length} ways`}
          </span>
        </div>
      )}

      {disputeByMe && (
        <div className="ec ec-wait">
          Asking {others[0] || 'them'} to hand it over…
          <div className="ec-row">
            <span />
            <button className="lk" onClick={(e) => { e.stopPropagation(); onUnit(0, 'cancel'); }}>
              Never mind
            </button>
          </div>
        </div>
      )}

      {disputeOnMine && (
        <div className="ec ec-mine">
          <strong>{disp.by}</strong> says this one's theirs.
          <div className="ec-row">
            <button className="lk" onClick={(e) => { e.stopPropagation(); onUnit(0, 'resolveAccept'); }}>
              You're right — it's {disp.by}'s
            </button>
            <button className="solid" onClick={(e) => { e.stopPropagation(); onUnit(0, 'resolveReject'); }}>
              No, it's mine
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Route component ─────────────────────────────────────────────────────────

export default function ClaimItems() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const { state, dispatch } = useSession();

  const myName = state.currentUser?.name;
  const host = state.hostName;
  const isHost = state.currentUser?.isHost;
  // The host collects rather than pays, so "done" returns them to the dashboard;
  // guests go to their pay summary.
  const doneDest = isHost ? `/host/${sessionId}` : `/summary/${sessionId}`;
  const [toastMsg, setToastMsg] = useState(null);
  const [menu, setMenu] = useState(null);     // { id, idx } whose options sheet is open
  const [confirm, setConfirm] = useState(false); // unclaimed-items guard sheet
  const toastTimer = useRef(null);

  const fmt = (p) => fmtPrice(p, state.currency || 'USD');

  // Flash feedback — timer stored in ref so it is cleared on unmount
  function flash(m) {
    setToastMsg(m);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(null), 1800);
  }

  // Clear toast timer on unmount
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  // ── Verb → socket event dispatcher ──────────────────────────────────
  function act(itemId, unitIndex, verb) {
    if (!socket) return;
    if (verb === 'coverItem') {
      socket.emit('cover-item', { sessionId, itemId });
      return;
    }
    if (verb === 'resolveAccept') {
      socket.emit('resolve-dispute', { sessionId, itemId, unitIndex, accept: true });
      return;
    }
    if (verb === 'resolveReject') {
      socket.emit('resolve-dispute', { sessionId, itemId, unitIndex, accept: false });
      return;
    }
    if (verb === 'clear') {
      const it = state.items.find((i) => String(i.id) === String(itemId));
      (it?.units || []).forEach((u, i) => {
        if (u.claims.includes(myName)) socket.emit('release-unit', { sessionId, itemId, unitIndex: i });
      });
      return;
    }
    const EV = {
      grab: 'grab-unit',
      release: 'release-unit',
      leave: 'release-unit',
      split: 'split-unit',
      splitWith: 'split-unit',
      join: 'join-unit',
      coverUnit: 'cover-unit',
      dispute: 'dispute-unit',
      cancel: 'cancel-dispute',
    };
    if (EV[verb]) socket.emit(EV[verb], { sessionId, itemId, unitIndex });

    // Flash messages for immediate feedback
    const it = state.items.find((i) => String(i.id) === String(itemId));
    if (verb === 'grab') flash(`Yours — ${it?.name || ''}`);
    else if (verb === 'split') flash(`You split it — others can jump in`);
    else if (verb === 'join') flash(`You're in — ${it?.name || ''}`);
    else if (verb === 'coverUnit') flash(`You're covering the whole ${it?.name || ''}`);
  }

  // ── Socket setup ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;
    if (!socket.connected) socket.connect();

    const identity = {
      sessionId,
      guestName: myName,
      isHost: state.currentUser?.isHost,
    };
    socket.emit('rejoin-room', identity);

    fetch(`${BACKEND_URL}/api/session/${sessionId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((session) => { if (session) dispatch({ type: 'LOAD_SESSION', session }); })
      .catch(() => {});

    function onSyncItems({ items }) { dispatch({ type: 'SYNC_ITEMS', items }); }
    function onGuestJoined({ guests }) { dispatch({ type: 'SYNC_GUESTS', guests }); }
    function onSessionUpdated(session) { if (session) dispatch({ type: 'LOAD_SESSION', session }); }
    function onReconnect() { socket.emit('rejoin-room', identity); }

    socket.on('items-updated', onSyncItems);
    socket.on('session-updated', onSessionUpdated);
    socket.on('guest-joined', onGuestJoined);
    socket.on('connect', onReconnect);

    return () => {
      socket.off('items-updated', onSyncItems);
      socket.off('session-updated', onSessionUpdated);
      socket.off('guest-joined', onGuestJoined);
      socket.off('connect', onReconnect);
    };
  }, [dispatch, sessionId, myName]);

  // ── Contextual options per (item, unit) ──────────────────────────────
  function actionsFor(it, idx) {
    const u = it.units[idx];
    const mineIn = u.claims.includes(myName);
    const others = u.claims.filter((n) => n !== myName);
    const isShared = !!u.shared;
    const A = [];

    if (others.length && !isShared && !mineIn) {
      // Held by someone else
      A.push({ icon: 'users', label: 'I split this', sub: `Keeps ${others[0]} on it — others can tap "I'm in"`, onClick: () => act(it.id, idx, 'splitWith') });
      A.push({ icon: 'gift', label: "I'm covering this", sub: `Pay ${others[0]}'s ${fmt(unitPrice(it))} myself`, onClick: () => act(it.id, idx, 'coverUnit') });
      A.push({ icon: 'hand', label: 'Actually, this is mine', sub: `Ask ${others[0]} to hand it over`, onClick: () => act(it.id, idx, 'dispute') });
    } else if (isShared && mineIn) {
      // I'm in a split
      A.push({ icon: 'user-minus', label: 'Leave the split', onClick: () => act(it.id, idx, 'leave') });
      A.push({ icon: 'gift', label: "I'm covering it all instead", sub: `Pay the whole ${fmt(unitPrice(it))}`, onClick: () => act(it.id, idx, 'coverUnit') });
    } else if (isShared && !mineIn) {
      // A split I'm not in
      A.push({ icon: 'plus', label: "I'm in", sub: `Split it ${u.claims.length + 1} ways`, onClick: () => act(it.id, idx, 'join') });
      A.push({ icon: 'gift', label: "I'm covering it all instead", sub: 'Takes everyone else off it', onClick: () => act(it.id, idx, 'coverUnit') });
    } else if (mineIn) {
      // My solo claim
      A.push({ icon: 'users', label: 'I split this', sub: 'Others can tap "I\'m in"', onClick: () => act(it.id, idx, 'split') });
      A.push({ icon: 'x', label: 'Remove me', danger: true, onClick: () => act(it.id, idx, 'release') });
    } else {
      // Open
      A.push({ icon: 'check', label: 'I ordered this', onClick: () => act(it.id, idx, 'grab') });
      A.push({ icon: 'users', label: 'I split this', sub: 'Others can tap "I\'m in"', onClick: () => act(it.id, idx, 'split') });
      A.push({ icon: 'gift', label: "I'm covering this", sub: 'Pay for it entirely', onClick: () => act(it.id, idx, 'coverUnit') });
    }
    return A;
  }

  // ── Derived state ────────────────────────────────────────────────────
  const myTotal = calculatePersonTotal(state, myName).total;
  const items = state.items;
  const unclaimedItems = items.filter((it) => it.units.every((u) => u.claims.length === 0));
  const hasMyClaim = items.some((it) => it.units.some((u) => u.claims.includes(myName)));
  const menuItem = menu && items.find((it) => String(it.id) === String(menu.id));

  // ── Done handler ─────────────────────────────────────────────────────
  function handleDone() {
    if (unclaimedItems.length > 0) {
      setConfirm(true);
    } else {
      if (socket) socket.emit('done-claiming', { sessionId });
      navigate(doneDest);
    }
  }

  // ── Loading state ────────────────────────────────────────────────────
  if (items.length === 0) {
    return (
      <div className="app-shell">
        <div className="app-body pg" style={{ justifyContent: 'center', alignItems: 'center' }}>
          <div style={{ textAlign: 'center' }}>
            <div className="spinner spinner-lg" style={{ margin: '0 auto 16px' }} />
            <h2>Hang tight, {myName} 👋</h2>
            <p style={{ color: 'var(--ink-3)', marginTop: 8 }}>
              {host || 'The host'} is still adding items. This screen updates automatically.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────
  return (
    <div className="app-shell">
      <div className="app-body pg">

        {/* Header */}
        <div className="claim-head">
          {isHost && (
            <button className="back" onClick={() => navigate(`/host/${sessionId}`)}>
              <Icon name="arrow-left" size={18} stroke={2.2} /> Dashboard
            </button>
          )}
          <div className="h1">
            Hey {myName}{' '}
            <span className="wave-em">
              <Icon name="hand" size={24} color="var(--clay)" stroke={2} />
            </span>
          </div>
          <p className="lead" style={{ marginTop: 4 }}>
            Tap what you ordered. Shared it? Hit the{' '}
            <b style={{ color: 'var(--clay-deep)' }}>⋯</b>{' '}
            for every way to split.
          </p>
        </div>

        {/* Item cards */}
        <div className="icards">
          {items.map((it) => {
            const sig = it.units
              .map((u) => (u.shared ? 's' : '') + u.claims.join('.') + (u.dispute ? 'D' + u.dispute.by : ''))
              .join('|');
            return (
              <ItemCard
                key={it.id + ':' + sig}
                item={it}
                me={myName}
                onUnit={(idx, v) => act(it.id, idx, v)}
                onMenu={(idx) => setMenu({ id: it.id, idx })}
                currency={state.currency || 'USD'}
              />
            );
          })}
        </div>

        {/* Unclaimed hint */}
        {unclaimedItems.length > 0 && (
          <p className="unclaimed-hint">
            <Icon name="hand-coins" size={15} stroke={2} />{' '}
            {unclaimedItems.length} item{unclaimedItems.length === 1 ? '' : 's'} no one's grabbed yet
          </p>
        )}

        {/* Sticky footer bar */}
        <div className="fbar">
          <div className="fbar-card">
            <div className="fbar-tot">
              <div className="l">Your share so far</div>
              <div className="v mono">{fmt(myTotal)}</div>
            </div>
            <Button
              variant="clay"
              icon="arrow-right"
              full={false}
              disabled={!hasMyClaim}
              onClick={handleDone}
            >
              I'm done
            </Button>
          </div>
        </div>

        {/* Toast */}
        {toastMsg && <div className="toast">{toastMsg}</div>}

        {/* Options action sheet */}
        {menuItem && (
          <SheetPortal>
            <div className="scrim" onClick={(e) => e.target === e.currentTarget && setMenu(null)}>
              <div className="sheet" style={{ textAlign: 'left' }}>
                <div className="sheet-grip" />
                <div className="menu-title">
                  {menuItem.name}{menuItem.units.length > 1 ? ` · one of ${menuItem.units.length}` : ''}
                </div>
                <p className="cap menu-sub" style={{ marginBottom: 14 }}>
                  {fmt(unitPrice(menuItem))}{menuItem.units.length > 1 ? ' each' : ''}
                </p>
                {actionsFor(menuItem, menu.idx).map((a, i) => (
                  <button
                    key={i}
                    className={`act-row ${a.danger ? 'danger' : ''}`}
                    onClick={() => { a.onClick(); setMenu(null); }}
                  >
                    <span className="ai"><Icon name={a.icon} size={19} stroke={2} /></span>
                    <span>
                      <span>{a.label}</span>
                      {a.sub && <span className="as">{a.sub}</span>}
                    </span>
                  </button>
                ))}
                {menuItem.units.length > 1 && (
                  <button
                    className="act-row"
                    onClick={() => { act(menuItem.id, 0, 'coverItem'); setMenu(null); }}
                  >
                    <span className="ai"><Icon name="hand-coins" size={19} stroke={2} /></span>
                    <span>
                      <span>I had all {menuItem.units.length}</span>
                      <span className="as">Put the whole {fmt(menuItem.price)} on me</span>
                    </span>
                  </button>
                )}
              </div>
            </div>
          </SheetPortal>
        )}

        {/* Unclaimed-items guard sheet */}
        {confirm && (
          <SheetPortal>
            <div className="scrim" onClick={(e) => e.target === e.currentTarget && setConfirm(false)}>
              <div className="sheet" style={{ textAlign: 'left' }}>
                <div className="sheet-grip" />
                <div className="h2" style={{ textAlign: 'center' }}>A few things are unclaimed</div>
                <p className="cap" style={{ textAlign: 'center', marginBottom: 16 }}>
                  Nobody tapped these yet. Leave them and they stay on {host}'s tab.
                </p>
                <div className="unclaimed-list">
                  {unclaimedItems.map((it) => (
                    <div className="srow" key={it.id} style={{ borderColor: 'var(--line-2)' }}>
                      <span className="nm">
                        {it.name}{it.units.length > 1 ? ` ×${it.units.length}` : ''}
                      </span>
                      <span className="pr mono">{fmt(it.price)}</span>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 18 }}>
                  <Button variant="soft" icon="hand-coins" onClick={() => setConfirm(false)}>
                    Keep claiming
                  </Button>
                  <Button
                    variant="clay"
                    icon="arrow-right"
                    onClick={() => { setConfirm(false); if (socket) socket.emit('done-claiming', { sessionId }); navigate(doneDest); }}
                  >
                    Leave on {host}'s tab
                  </Button>
                </div>
              </div>
            </div>
          </SheetPortal>
        )}

      </div>
    </div>
  );
}
