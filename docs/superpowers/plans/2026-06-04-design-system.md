# Design-System Foundation (Phase 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Bring the canonical organic-clay visual system into the real React/Vite client — fonts, the full `organic.css` class library + tokens (adapted from the prototype's phone frame to a responsive mobile column), Lucide icons, and the reusable primitive components — so the screen rebuilds (Plans 3–6) can port the prototype JSX nearly directly using these classes/components.

**Architecture:** A single global stylesheet `client/src/styles/organic.css` (ported from `design_handoff_claim_flow/prototype/organic.css`, phone-frame swapped for an `.app-shell` centered column) holds all visual classes + CSS-variable tokens. Thin React primitives in `client/src/components/ui/` (`Icon`, `Avatar`/`AvatarStack`, `Button`, `BottomSheet`, `Toast`, hand-drawn accents) emit those classes. Bottom sheets portal into a viewport-pinned `#sheet-root`. The prototype files in `design_handoff_claim_flow/prototype/` are the visual source of truth — port faithfully; do not invent.

**Tech Stack:** React 19, Vite 8, Vitest 3, `lucide-react` (new dep), `qrcode.react` (already present). Fonts: Inter (loaded) + Newsreader (add) via Google Fonts.

**Spec:** `docs/superpowers/specs/2026-06-04-claim-settle-flow-design.md` §5 (design system), README §7 (tokens), ICONOGRAPHY.md (Lucide). Canonical kit: `design_handoff_claim_flow/prototype/` (= `ui_kits/app-organic`).

---

## File structure
| File | Responsibility | Action |
|---|---|---|
| `client/index.html` | Add Newsreader font link; add `#sheet-root` node | Modify |
| `client/src/styles/organic.css` | Ported organic class library + tokens + app-shell layout | Create |
| `client/src/main.jsx` | Import the organic stylesheet | Modify |
| `client/src/components/ui/Icon.jsx` | Lucide icon wrapper | Create |
| `client/src/components/ui/Avatar.jsx` | `Avatar` + `AvatarStack` (fixed identity tones) | Create |
| `client/src/components/ui/accents.jsx` | `Squiggle`, `SketchCheck`, `Blob`, `ReceiptDoodle` | Create |
| `client/src/components/ui/Button.jsx` | `Button` (clay/soft/ghost/outline, pill, icon) | Create |
| `client/src/components/ui/BottomSheet.jsx` | `SheetPortal` + `BottomSheet` (scrim + grip, viewport-pinned) | Create |
| `client/src/components/ui/Toast.jsx` | transient bottom pill | Create |
| `client/src/components/ui/index.js` | barrel re-export of the primitives | Create |
| `client/src/components/ui/*.test.jsx` | render assertions | Create |

---

## Task 1: Stylesheet, fonts, app shell, sheet-root

**Files:** Modify `client/index.html`, `client/src/main.jsx`; Create `client/src/styles/organic.css`.

- [ ] **Step 1 — port the stylesheet.** Copy `design_handoff_claim_flow/prototype/organic.css` verbatim to `client/src/styles/organic.css`. Then adapt ONLY the device-frame pieces:
  - Remove the `.ph`, `.ph-screen`, `.ph-sb`, `.ph-sb::before`, `.ph-body`, `.restart` rules (the fake phone bezel + status bar + restart button — prototype-only).
  - Add an app shell so the product is a centered responsive mobile column (design README §4: `max-width: 480px`, centered, warm cream background):
    ```css
    html, body { margin: 0; background: var(--bg); }
    .app-shell { max-width: 480px; margin: 0 auto; min-height: 100dvh; background: var(--bg);
      position: relative; display: flex; flex-direction: column; overflow-x: hidden; }
    .app-body { flex: 1; display: flex; flex-direction: column; position: relative; }
    /* viewport-pinned sheet layer (replaces the prototype's #sheet-root inside .ph-screen) */
    #sheet-root { position: fixed; inset: 0; z-index: 50; pointer-events: none; }
    #sheet-root > * { pointer-events: auto; }
    ```
  - Keep ALL other rules (`.scene`, `.pg`, `.h1/.h2/.lead/.cap/.mono`, `.btn*`, `.av*`, `.icard*`, `.fbar*`, `.sum-card`, `.plate`, `.settled*`, `.toast`, `.scrim`, `.sheet*`, `.squiggle/.blob/.doodle`, `@keyframes rise/pop/wv`, the `:root` token block, the `.theme-*` variants) exactly as in the prototype. These are the classes the screen ports depend on.
  - Confirm the `:root` token block (the `--clay`, `--clay-soft/deep/edge`, `--panel`, `--warm`, `--bg`, `--bg-2`, `--line`, `--line-2`, `--ink/-2/-3`, `--sage/-soft`, `--font-serif`, `--font-mono`, `--ease`, `--spring`, `--sh-soft/card/float`, `--r-*` ) is present at the top (it is, near the top of the source). `--font-serif` must be `'Newsreader', Georgia, serif`; `--font-mono` a monospace stack.

- [ ] **Step 2 — fonts.** In `client/index.html`, replace the existing Inter `<link href="...Inter...">` with one that ALSO loads Newsreader italic:
  ```html
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;1,6..72,400;1,6..72,500&display=swap" rel="stylesheet" />
  ```
- [ ] **Step 3 — sheet-root.** In `client/index.html`, add `<div id="sheet-root"></div>` immediately AFTER `<div id="root"></div>` in the body.
- [ ] **Step 4 — import the stylesheet.** In `client/src/main.jsx`, add `import './styles/organic.css'` AFTER the existing `import './index.css'` (keep index.css for now; old un-rebuilt screens still use it).
- [ ] **Step 5 — verify build:** `cd client && npm run build` → success. Then `cd client && npx vitest run` → existing tests still pass.
- [ ] **Step 6 — commit:**
  ```bash
  git add client/index.html client/src/main.jsx client/src/styles/organic.css
  git commit -m "feat(ui): port organic-clay stylesheet + fonts + app-shell + sheet-root"
  ```

---

## Task 2: Icon, Avatar, hand-drawn accents

**Files:** Create `client/src/components/ui/Icon.jsx`, `Avatar.jsx`, `accents.jsx`, and tests. Add `lucide-react`.

- [ ] **Step 1 — add the icon dep:** `cd client && npm install lucide-react`.
- [ ] **Step 2 — write the test** `client/src/components/ui/accents.test.jsx`:
  ```jsx
  import { describe, it, expect } from 'vitest';
  import { renderToStaticMarkup } from 'react-dom/server';
  import { Avatar, AvatarStack } from './Avatar';
  import { Squiggle, SketchCheck } from './accents';

  describe('Avatar', () => {
    it('renders the first initial and a fixed tone for a known name', () => {
      const html = renderToStaticMarkup(<Avatar name="Sarah" tone="clay" />);
      expect(html).toContain('S');
      expect(html).toContain('av');
    });
    it('AvatarStack renders one avatar per name', () => {
      const html = renderToStaticMarkup(<AvatarStack names={['Sarah', 'Mia']} />);
      expect((html.match(/class="av"/g) || []).length).toBe(2);
    });
  });
  describe('accents', () => {
    it('Squiggle and SketchCheck render svg', () => {
      expect(renderToStaticMarkup(<Squiggle />)).toContain('<svg');
      expect(renderToStaticMarkup(<SketchCheck />)).toContain('<svg');
    });
  });
  ```
- [ ] **Step 3 — implement `Icon.jsx`** (Lucide wrapper; replaces the prototype's DOM-manipulation `Icon`):
  ```jsx
  import { icons } from 'lucide-react';
  // Map kebab-case Lucide names (as used in the prototype, e.g. "qr-code") to the
  // PascalCase export (QrCode). stroke ~2, round caps — matches the design system.
  function toPascal(name) { return name.split('-').map(s => s[0].toUpperCase() + s.slice(1)).join(''); }
  export function Icon({ name, size = 20, stroke = 2, color, style }) {
    const Cmp = icons[toPascal(name)];
    if (!Cmp) return null;
    return <Cmp size={size} strokeWidth={stroke} color={color} style={style} aria-hidden="true" />;
  }
  ```
- [ ] **Step 4 — implement `Avatar.jsx`** porting the prototype's `Avatar` (organic-kit.jsx) + the `toneFor` identity map (organic-screens.jsx) + an `AvatarStack`:
  ```jsx
  const TONES = { clay: '#C96F4C', gold: '#D29A3C', sage: '#7C9B73', plum: '#A8748A', sky: '#7E97AE', ink: 'var(--ink-2)' };
  const NAMED = { Sarah: 'clay', Mia: 'plum', Diego: 'sage', Jordan: 'gold' };
  export function toneFor(name) { // stable per identity, NOT theme-derived
    if (NAMED[name]) return NAMED[name];
    const tones = ['clay', 'gold', 'sage', 'plum', 'sky'];
    let h = 0; for (const c of (name || '')) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return tones[h % tones.length];
  }
  export function Avatar({ name, tone, size = 30 }) {
    const t = tone || toneFor(name);
    return (
      <span className="av" style={{ width: size, height: size, background: TONES[t] || t, fontSize: size * 0.42, color: '#fff', fontWeight: 700 }}>
        {(name || '?').trim()[0].toUpperCase()}
      </span>
    );
  }
  export function AvatarStack({ names = [], me, size = 22 }) {
    return <span className="av-stack">{names.map(n => <Avatar key={n} name={n} tone={n === me ? 'gold' : undefined} size={size} />)}</span>;
  }
  ```
- [ ] **Step 5 — implement `accents.jsx`**: port `Squiggle`, `SketchCheck`, `Blob`, `ReceiptDoodle` from `design_handoff_claim_flow/prototype/organic-kit.jsx` verbatim (they are already plain React SVG components; keep the same paths/props/classNames).
- [ ] **Step 6 — run:** `cd client && npx vitest run src/components/ui/accents.test.jsx` → pass. `cd client && npm run build` → success.
- [ ] **Step 7 — commit:**
  ```bash
  git add client/package.json client/package-lock.json client/src/components/ui/Icon.jsx client/src/components/ui/Avatar.jsx client/src/components/ui/accents.jsx client/src/components/ui/accents.test.jsx
  git commit -m "feat(ui): Lucide Icon, fixed-tone Avatar/AvatarStack, hand-drawn accents"
  ```

---

## Task 3: Button, BottomSheet, Toast, barrel

**Files:** Create `client/src/components/ui/Button.jsx`, `BottomSheet.jsx`, `Toast.jsx`, `index.js`, and a test.

- [ ] **Step 1 — write the test** `client/src/components/ui/Button.test.jsx`:
  ```jsx
  import { describe, it, expect, vi } from 'vitest';
  import { renderToStaticMarkup } from 'react-dom/server';
  import { Button } from './Button';

  describe('Button', () => {
    it('renders the clay variant by default with its label', () => {
      const html = renderToStaticMarkup(<Button>Pay Sarah</Button>);
      expect(html).toContain('btn');
      expect(html).toContain('btn-clay');
      expect(html).toContain('Pay Sarah');
    });
    it('applies the soft variant and disabled state', () => {
      const html = renderToStaticMarkup(<Button variant="soft" disabled>Track</Button>);
      expect(html).toContain('btn-soft');
      expect(html).toContain('disabled');
    });
  });
  ```
- [ ] **Step 2 — implement `Button.jsx`** (port organic-kit.jsx `Button`; uses `Icon`):
  ```jsx
  import { Icon } from './Icon';
  export function Button({ variant = 'clay', icon, children, onClick, disabled, full = true, type = 'button', style }) {
    return (
      <button type={type} className={`btn btn-${variant}`} onClick={disabled ? undefined : onClick}
        disabled={disabled} style={{ width: full ? '100%' : 'auto', ...style }}>
        {icon && <Icon name={icon} size={19} stroke={2.1} />}{children}
      </button>
    );
  }
  ```
- [ ] **Step 3 — implement `BottomSheet.jsx`** (port `SheetPortal` to portal into `#sheet-root`; add a `BottomSheet` wrapper with scrim + grip, dismiss on scrim click):
  ```jsx
  import { useEffect, useState } from 'react';
  import { createPortal } from 'react-dom';
  export function SheetPortal({ children }) {
    const [el, setEl] = useState(null);
    useEffect(() => { setEl(document.getElementById('sheet-root')); }, []);
    if (!el) return null;
    return createPortal(children, el);
  }
  export function BottomSheet({ open, onClose, children }) {
    if (!open) return null;
    return (
      <SheetPortal>
        <div className="scrim" onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
          <div className="sheet"><div className="sheet-grip" />{children}</div>
        </div>
      </SheetPortal>
    );
  }
  ```
  (If the ported `organic.css` lacks `.scrim`/`.sheet`/`.sheet-grip` rules, add them from the prototype `organic.css` — search it for those selectors and copy the rules into `organic.css`.)
- [ ] **Step 4 — implement `Toast.jsx`** (port the prototype's toast pill; controlled by a `message` prop, auto-dismiss handled by the caller or a `useToast` hook):
  ```jsx
  import { SheetPortal } from './BottomSheet';
  export function Toast({ message }) {
    if (!message) return null;
    return <SheetPortal><div className="toast">{message}</div></SheetPortal>;
  }
  ```
- [ ] **Step 5 — barrel** `client/src/components/ui/index.js`:
  ```js
  export { Icon } from './Icon';
  export { Avatar, AvatarStack, toneFor } from './Avatar';
  export { Squiggle, SketchCheck, Blob, ReceiptDoodle } from './accents';
  export { Button } from './Button';
  export { SheetPortal, BottomSheet } from './BottomSheet';
  export { Toast } from './Toast';
  ```
- [ ] **Step 6 — run:** `cd client && npx vitest run src/components/ui/Button.test.jsx` → pass. `cd client && npx vitest run` → all pass. `cd client && npm run build` → success.
- [ ] **Step 7 — commit:**
  ```bash
  git add client/src/components/ui/Button.jsx client/src/components/ui/BottomSheet.jsx client/src/components/ui/Toast.jsx client/src/components/ui/index.js client/src/components/ui/Button.test.jsx
  git commit -m "feat(ui): Button, viewport-pinned BottomSheet, Toast + primitives barrel"
  ```

---

## Self-review checklist
- [ ] §5 design-system items (tokens, Inter/Newsreader, Lucide, hand-drawn accents, viewport-pinned sheets, fixed avatar tones) → Tasks 1–3. ✓
- [ ] Primitives emit the SAME classNames the prototype uses (`btn btn-clay`, `av`, `av-stack`, `scrim`, `sheet`, `toast`) so screen ports drop in. ✓
- [ ] No placeholders; all component code provided or pointed at an exact prototype file to port. ✓

## Done when
`cd client && npm run build` succeeds, `cd client && npx vitest run` is green, and the primitives render the prototype's classes. Screens that consume them come in Plans 3–6.
