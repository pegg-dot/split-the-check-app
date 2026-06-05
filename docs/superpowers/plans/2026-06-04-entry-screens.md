# Entry & Flow Screens (Phase 6) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Rebuild the remaining screens to the organic prototype — **Welcome** (new), **Host Setup** (Home), **Scan**, **Tip**, **QR sheet**, **Join** — preserving all real logic (Venmo verify, OCR, currency/FX, tip modes, QR generation, join/identity), and update routing so `/` is Welcome.

**Architecture:** Faithful React ports of the prototype `Welcome`/`Setup`/`Scan`/`TipShare`/`QRSheet`/`Join` (`organic-screens.jsx`, `organic-host.jsx`) over the existing page logic. Routing: `/` → Welcome; host setup moves to `/setup`. Use the Phase-2 primitives + organic classes. All money via `formatPrice`.

**Spec:** prototype `organic-screens.jsx` (Welcome, Join) + `organic-host.jsx` (Setup, Scan, TipShare, QRSheet); SCREENS.md §1–6; the current pages (logic to preserve); the screenshots.

---

## Task 1: Routing + Welcome + Join

**Files:** Modify `client/src/App.jsx`; Create `client/src/pages/Welcome.jsx`; Rewrite `client/src/pages/JoinSession.jsx`; tests.

- [ ] **Step 1 — read:** prototype `Welcome` + `Join` (`organic-screens.jsx`), current `client/src/App.jsx`, current `client/src/pages/JoinSession.jsx` (preserve the join logic: name input → `join-session`, duplicate-name error handling, navigate to `/claim/:id`), `client/src/components/ui/index.js`.
- [ ] **Step 2 — routing (`App.jsx`):** set `/` → `Welcome`; add `/setup` → `Home` (the existing host setup); keep `/scan`, `/review`, `/tip`, `/host/:sessionId`, `/session/:sessionId` (Join), `/claim/:sessionId`, `/summary/:sessionId`. Keep `<QROverlay />` mounted.
- [ ] **Step 3 — `Welcome.jsx`** (port prototype `Welcome`): logo mark (`/logo-mark.svg` — copy `design_handoff_claim_flow/prototype/logo-mark.svg` into `client/public/logo-mark.svg`), H1 "Split the **check**" with the `Squiggle` under "check", subtitle "Pay for exactly what you ordered." + serif-italic "Nothing more, nothing less.", organic `Blob`s, clay `Button` "Snap the receipt" (camera) → `navigate('/setup')`, soft `Button` "Join with a code" (qr-code) → `navigate('/join-code')`. Add a minimal `/join-code` route + tiny inline view (a code input → `navigate('/session/' + code.trim())`) OR, simpler, have "Join with a code" reveal an inline code input on Welcome that navigates to `/session/${code}`. (Guests normally arrive via the QR link straight to `/session/:id`; this is the manual fallback.)
- [ ] **Step 4 — `JoinSession.jsx`** (port prototype `Join`): one organic `Blob`, hand icon in a clay-soft circle, H1 "Join the split", lead "{host} wants to split the bill with you." (host name from the fetched session), `Field` "Your name" (default empty/placeholder), clay `Button` "Join the table" → existing join flow (`join-session`, on success navigate `/claim/:id`; show the duplicate-name error inline). PRESERVE the existing socket join + error handling + session fetch.
- [ ] **Step 5 — tests:** `client/src/pages/Welcome.test.jsx` (renders the two CTAs + the "check" word) and keep/adjust any Join test (render the heading). Pure-render via `renderToStaticMarkup` where the component has no socket side-effects at module load (guard `if (socket)`).
- [ ] **Step 6 — verify + commit:** `cd client && npx vitest run` + `npm run build` green. `git commit -m "feat(ui): Welcome screen + routing (/ → Welcome) + organic Join"`.

## Task 2: Host Setup (Home)

**Files:** Rewrite `client/src/pages/Home.jsx`; test.

- [ ] **Step 1 — read:** prototype `Setup` (`organic-host.jsx`), current `client/src/pages/Home.jsx` (PRESERVE: name + Venmo + `/api/verify-venmo` with the "✓ Sarah Jones" valid state, currency select, the in-progress/resume localStorage logic, `SET_HOST`). 
- [ ] **Step 2 — implement:** back button → `/`, H1 "First, *you*." (serif-italic "you"), lead "So friends know who to pay.", `Field` "Your name" (default "Sarah"? no — keep empty with the real value), `Field` "Venmo username, phone, or email" with the validated state (clay/green check + resolved "✓ {displayName}" below) wired to the existing `verifyVenmo` debounce, "Receipt currency" select (chevron) + hint "The AI auto-detects this from your receipt too.", sticky clay `Button` "Snap the receipt" (disabled until name+venmo valid) → `SET_HOST` + `navigate('/scan')`. Preserve the resume-in-progress banner. Use organic `field`/input classes (check `organic.css`; if missing, port the prototype's field styles).
- [ ] **Step 3 — verify + commit:** tests + build green. `git commit -m "feat(ui): organic Host Setup (Home) preserving Venmo verify + currency + resume"`.

## Task 3: Scan

**Files:** Rewrite `client/src/pages/ScanReceipt.jsx`; test.

- [ ] **Step 1 — read:** prototype `Scan` + `FauxReceipt` (`organic-host.jsx`), current `client/src/pages/ScanReceipt.jsx` (PRESERVE the REAL camera/upload → `POST /api/scan-receipt` call, the data-URL handling, the result → `SET_ITEMS`/`SET_TAX`/`SET_SCAN_EXTRAS`/`SET_CURRENCY`/tip-included/admin-fee dispatches, error handling, and the OCR prompt is server-side — DO NOT touch it). 
- [ ] **Step 2 — implement the three states** (`choose` → `preview` → `scanning`): `choose` = two big tiles "Use camera" / "Upload a photo" (icon tile + two-line label) wired to the real file inputs/camera; `preview` = the captured image in a rounded hairline frame (replace the prototype's faux receipt with the actual photo) + clay `Button` "Read it with AI" (sparkles) + ghost "Use a different photo"; `scanning` = a shimmer/spinner over the image + "Reading your receipt…" / "Claude is pulling out every item." — this is the REAL OCR latency, then navigate to `/tip` (or `/review`) on success. Header "Snap the receipt" / "One photo. The AI reads the rest." Keep existing currency/FX handling from the scan result.
- [ ] **Step 3 — verify + commit:** tests + build green. `git commit -m "feat(ui): organic Scan screen over real OCR (camera/upload/scanning states)"`.

## Task 4: Tip

**Files:** Rewrite `client/src/pages/TipAndShare.jsx`; test.

- [ ] **Step 1 — read:** prototype `TipShare` (`organic-host.jsx`), current `client/src/pages/TipAndShare.jsx` (PRESERVE: tip mode percent/dollar, tipIncluded gratuity, adminFee, currency display, the create-session/`create-session` socket emit that starts the live session, and navigation to QR/Dashboard).
- [ ] **Step 2 — implement:** back, H1 "Set the *tip*", lead "Here's everything the AI pulled off your receipt.", a white **scanned itemization card** = one row per line item (name + muted "×N" for multi-qty + mono price via `formatPrice`), a dashed tear-line divider, then `Subtotal` / `Tax` / (when tip>0) `Tip · N%` / heavy `Total` (top border). Caption "Tip is on the {formatPrice(subtotal)} subtotal (pre-tax)." Tip selector = 4 segments `No tip`/`15%`/`18%`(default)/`20%`, each non-zero showing its dollar amount; active = clay outline + soft tint. Clay `Button` "Show the QR code" (opens the QR overlay) + soft `Button` "Track who's paid" (→ `/host/:sessionId`). Preserve the existing logic that creates/sends the session live (so guests can join) and the percent/dollar/included tip handling.
- [ ] **Step 3 — verify + commit:** tests + build green. `git commit -m "feat(ui): organic Tip screen (itemization + tear-line + tip selector) preserving tip modes"`.

## Task 5: QR sheet

**Files:** Rewrite `client/src/components/QROverlay.jsx`; test.

- [ ] **Step 1 — read:** prototype `QRSheet` (`organic-host.jsx`), current `client/src/components/QROverlay.jsx` (PRESERVE: the real join-URL construction incl. the LAN-IP resolve via `/api/server-ip` in dev, the `QRCodeSVG` usage, the open/close trigger).
- [ ] **Step 2 — implement:** a viewport-pinned `BottomSheet` (use the Phase-2 `BottomSheet`/`SheetPortal`) titled "Scan to join", sub "Everyone at the table — no app, no sign-up.", the real `QRCodeSVG` of the join URL in a rounded white tile, the short URL text below, and a ghost "Close". (Drop the prototype's "Join as a guest (demo)" crossover — that's demo-only; keep it out of production.) Keep the existing trigger/open state.
- [ ] **Step 3 — verify + commit:** tests + build green. `git commit -m "feat(ui): organic QR join sheet (real join URL + LAN-IP) on viewport-pinned BottomSheet"`.

## Self-review (whole plan)
- [ ] `/` is Welcome; setup at `/setup`; all real logic preserved (Venmo verify, OCR + prompt untouched, currency/FX, tip modes, QR/LAN-IP, join/identity). ✓
- [ ] Every screen matches its screenshot; money via `formatPrice`; primitives + organic classes used. ✓
- [ ] No demo-only affordances shipped (faux receipt replaced by real photo; "Join as guest (demo)" dropped). ✓

## Done when
Full `cd client && npx vitest run` + `npm run build` green, `node server/scripts/smoke.cjs 3001` still 16/16, and the whole flow renders in the organic system. After this, the app is feature-complete on the branch → final review + finish.
