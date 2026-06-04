# Handoff: Split the Check — Claim & Settle Flow

## 0. Read order (for Claude Code)

1. **This README** — product, model, screens, tokens.
2. **[BACKEND.md](./BACKEND.md)** — the existing repo's server/client, and exactly
   how to map the prototype onto it (data model, socket events, file-by-file,
   keep-vs-change). **This is what makes the implementation unambiguous.**
3. **[SCREENS.md](./SCREENS.md)** — per-screen layout/copy/states.
4. **`prototype/`** — run `index.html` and read the `.jsx` to see real behavior.
5. **`existing_app_reference/`** — the actual current `server/index.js` and client
   pages, imported verbatim, so you build on what's really there.

The target: **make the app exactly like the prototype** (UX, visual design, and
claim model), while preserving the extra real capabilities the repo already has
(currency/FX, admin fees, dollar tips, Venmo verification, realtime sync).

---

## Overview

This package specifies the **guest claim flow** and supporting screens for *Split
the Check* — the part of the app where, after a receipt is scanned, each person
picks what they had and pays their fair share. It is the product's hardest and
most important surface: the **item-claiming model** with all its real-world edge
cases (shared dishes, multiples, disputes, covering, unclaimed items).

It also covers the surrounding screens that make the flow whole: **Welcome,
Host Setup, Scan, Tip (with the full scanned itemization), QR share, Join,
Your Share, Settled, and the Host "Who owes what" dashboard.**

> The single most important section is **[§4 The Claim Model](#4-the-claim-model--rules--edge-cases)**.
> If you read nothing else, read that — it encodes weeks of product decisions about
> how splitting should *feel*: fast, opt-in, low-communication, never presumptuous.
>
> **For backend + how this maps onto the real repo, read [BACKEND.md](./BACKEND.md).**
> It reconciles the prototype with the existing `pegg-dot/split-the-check` server
> and client file-by-file, with exact socket events and what to keep vs change —
> so there is zero ambiguity.

---

## About the design files

The files in this bundle are **design references created in HTML/React-via-Babel**
— interactive prototypes that demonstrate the intended look and behavior. They are
**not production code to copy directly.** Your job is to **recreate these designs
in the target codebase's environment** (the live app is **React + Vite**, see
`github.com/pegg-dot/split-the-check`), using its established patterns, state
management, and component conventions. If a piece of environment doesn't exist
yet, choose the idiomatic approach for that codebase.

The prototype cuts production corners deliberately: it fakes the receipt OCR, the
realtime sync between phones, and the Venmo handoff. Those are noted inline below
as **[FAKED]** so you know what needs real implementation.

## Fidelity

**High-fidelity.** Colors, typography, spacing, radii, shadows, motion, and copy
are all final and intentional. Recreate the UI faithfully using the codebase's
libraries. Exact tokens are in [§7 Design Tokens](#7-design-tokens) and in
`organic.css` / `colors_and_type.css`.

---

## 1. The two roles & the realtime premise

Every screen belongs to one of two roles:

- **Host** — sets up (name + Venmo + currency), scans the receipt, sets the tip,
  shows a QR code, and watches a live **payment-tracker dashboard**.
- **Guest** — joins by scanning the QR (no app, no signup — runs in the mobile
  browser), claims their items, sees their share, and pays the host via Venmo.

**[FAKED in prototype → must be real]** The whole table operates on **one shared
bill in realtime.** When any guest claims/splits/covers an item, every other
phone updates live. The prototype simulates this with a single local state tree
and a "simulate friends joining" timer; production needs a realtime backend
(the live repo uses socket.io) where each claim is broadcast to all participants.
Treat each item's `claims` as **shared, concurrently-edited state**.

---

## 2. Data model

The claim flow is cleanest with a **unit-based** item model. This is the key
architectural decision — it makes single dishes, shared dishes, and multi-quantity
line items ("×3") all behave consistently.

```ts
type Claim = { name: string };               // one participant on a unit

type Unit = {
  shared: boolean;                            // true = a declared split pool others can join
  claims: string[];                           // participant names on THIS unit
  dispute?: { by: string } | null;            // someone contesting this unit
};

type Item = {
  id: string;
  name: string;                               // e.g. "Bottle of Wine"
  price: number;                              // TOTAL price of the line item
  units: Unit[];                              // length 1 for a normal dish; N for a "×N"
  covered?: boolean;                          // someone declared they're paying the whole item
};
```

**Why units?** A receipt line like "Aperol Spritz ×3 — $36.00" is **three
independently-claimable units** of $12 each. A normal dish is just an item with
**one** unit. Everything in the claim UI operates per-unit, then aggregates.

### Derived math (pure functions — see `organic-kit.jsx`)

```ts
unitCount(item)        = item.units.length
unitPrice(item)        = item.price / unitCount(item)

// What ONE person owes for an item = sum over units they're on,
// each unit's cost split evenly among that unit's claimants.
shareOf(item, name)    = Σ over units where name ∈ unit.claims of
                           ( unitPrice(item) / unit.claims.length )

itemClaimed(item)      = some unit has ≥1 claim
myUnitCount(item,name) = # of units `name` appears on
```

### Tax & tip are proportional — NOT split evenly

This is a core fairness promise. After someone's item subtotal is known:

```ts
myItemsSubtotal = Σ items shareOf(item, me)
proportion      = myItemsSubtotal / billSubtotal
myTaxShare      = tax  * proportion
myTipShare      = (billSubtotal * tipPercent) * proportion
myTotal         = myItemsSubtotal + myTaxShare + myTipShare
```

Tip percentage always applies to the **pre-tax subtotal**.

---

## 3. The screen flow

```
Welcome ──▶ (Host) Setup ──▶ Scan ──▶ Tip ──▶ QR ──┐
   │                                                │
   └──▶ (Guest) Join ◀──────── scans QR ────────────┘
                  │
                  ▼
               CLAIM  ──▶  Your Share  ──▶  Settled
                              (pay)
   Host, anytime after Tip:  "Who owes what" dashboard (live)
```

The prototype is navigable both ways from Welcome: "Snap the receipt" enters the
host path; "Join with a code" enters the guest path. The QR sheet has a "Join as a
guest (demo)" shortcut that crosses over to the guest path **[FAKED]**.

---

## 4. THE CLAIM MODEL — rules & edge cases

> This is the spec that matters most. The guiding philosophy: **fast, opt-in,
> low-communication, and never presumptuous about how many people shared
> something.** A tap does the one safe/obvious thing; everything nuanced lives in a
> single per-item options menu. There are NO group-approval gates — every action
> takes effect immediately and is reversible.

### 4.1 The five states a unit can be in (from the current user's POV, "me")

| State | Meaning | Visual |
|---|---|---|
| **Open** | `claims=[]` | empty circle target, "Tap if you ordered this" |
| **Mine (solo)** | `!shared`, `claims=[me]` | clay-filled check, clay card tint, "All yours" |
| **Held by other** | `!shared`, `claims=[X]`, X≠me | that person's avatar, "X ordered this" |
| **A split, I'm in** | `shared`, me ∈ claims | avatar stack + "$X each · split N ways" |
| **A split, I'm NOT in** | `shared`, me ∉ claims | avatar stack + **visible "I'm in" button** |
| *(+ dispute overlay on any of the above)* | `dispute.by` set | banner, see §4.4 |

### 4.2 Tap behavior (the fast path)

A tap does **only the one safe, obvious thing** for the current state. Anything
destructive or ambiguous is NOT on tap — it's in the ⋯ menu, to prevent fat-finger
mistakes:

| Tap on… | Does |
|---|---|
| Open unit | Claim it solo (becomes Mine) |
| My solo unit | Release it (back to Open) |
| A split I'm not in | **Join it** ("I'm in") |
| Held by someone else | **Nothing** (you can't grab someone's dish by tapping) |
| A split I'm in | **Nothing** (leaving is deliberate, via menu) |
| Anything mid-dispute | **Nothing** |

### 4.3 The one menu — `⋯` options per item/unit

Every card (and every unit row of a "×N") has exactly **one** entry point to all
verbs: a `⋯` button top-right. No scattered buttons. The **only** action shown
inline outside the menu is the **"I'm in"** button on a split-you're-not-in (so
people discover they can join without opening the menu). The menu adapts to state:

- **Open** → `I ordered this` · `I split this` · `I'm covering this`
- **Mine (solo)** → `I split this` · `Remove me`
- **Held by someone else** → `I split this` *(keeps them on it, opens it up — see 4.5)* · `I'm covering this` · `Actually, this is mine`
- **A split, I'm in** → `Leave the split` · `I'm covering it all instead`
- **A split, I'm NOT in** → `I'm in` · `I'm covering it all instead`
- **Multi-quantity item (top-level menu adds)** → `I had all N` (cover every unit)

Each verb's exact effect on state:

| Verb | Effect |
|---|---|
| **I ordered this** | unit → `{shared:false, claims:[me], dispute:null}` |
| **I split this** | unit → `{shared:true, claims:[...claims, me]}` — a *declaration*; others can now opt in |
| **I'm in** | add me to a shared unit's `claims` |
| **Leave the split** | remove me; if `claims.length` drops to ≤1, set `shared:false` |
| **Remove me** | remove me from the unit (back to Open) |
| **I'm covering this / it all** | unit → `{shared:false, claims:[me]}` — takes the whole unit, drops everyone else (see 4.6) |
| **I had all N** | every unit → `{shared:false, claims:[me]}`, set `item.covered=true` |
| **Actually, this is mine** | set `unit.dispute={by:me}` (see 4.4) |

### 4.4 "I split this" is a DECLARATION, not an assignment — the opt-in rule

**Critical rule:** you never specify *how many* people split something or *who*.
When you hit **"I split this"**, the unit becomes a `shared` pool with just you in
it. On everyone else's phone that unit now shows a visible **"I'm in"** button.
Each person opts in individually; the per-person price is always
`unitPrice / claims.length` and updates live as people join or leave.

- Don't auto-split when two people tap the same item — you have *no idea* how many
  shared it. Make it explicit opt-in instead.
- A split-you're-not-in shows "$X.XX each if you join" where
  `X = unitPrice / (claims.length + 1)` — i.e. what you'd pay *after* joining.
- While only the declarer is in, the card honestly reads **"waiting for others to
  tap in."** Never invent a count.

### 4.5 Splitting someone else's solo claim

If a dish is **held by someone else** (they tapped it solo), you have a soft
middle option besides taking it: **"I split this"** keeps them on it and adds you,
converting it to a shared pool — then others can tap "I'm in" too. This means you
never have to use the heavier **"Actually, this is mine"** override just to get
yourself onto a shared dish someone else claimed first.

### 4.6 Covering & overriding (NO group approval)

- **I'm covering this / it all**: you take the whole item/unit and pay for it.
  Anyone else who was on it is silently dropped — they just see it's no longer
  theirs. No vote, no confirmation from them. Covering is **reversible**: the
  coverer can "Remove me" (in case of a mis-tap), and others can dispute it.
- **Actually, this is mine** (dispute): used on a dish someone else claimed solo
  when it's genuinely yours. It flags the unit (`dispute.by = me`). The current
  owner sees a banner (§4.7) and can hand it over or push back. There is **no
  multi-party approval** — disputes resolve between the two people involved.
- On a **split**, there is intentionally **no "Actually this is mine"** — the
  honest verb is "I'm covering it all" (take it whole, others drop off). This
  avoids the "do all three people have to agree?" problem entirely.

### 4.7 Dispute states & resolution

- **I disputed someone's item** (`dispute.by = me`, I'm not yet a claimant): my
  card shows a waiting banner — *"Asking {owner} to hand it over…"* with a **Never
  mind** link (clears the dispute). **[FAKED]** In the prototype, an `autoRelease`
  timer resolves it to me after ~1.9s ("{owner} let you have it"). In production
  this is the owner acting on their device.
- **Someone disputed MY item** (`dispute.by = X`, I'm the claimant): my card shows
  *"{X} says this one's theirs"* with two choices:
  - **You're right — it's {X}'s** → hand over: unit → `{claims:[X], dispute:null}`
  - **No, it's mine** → dismiss: `dispute = null`

### 4.8 Multi-quantity items ("×N")

A line item with `units.length > 1` renders as a header row plus **one row per
unit**. Each unit is independently Open / Mine / Held / Split — so two people can
share **one** of three spritzes while a third person takes a whole one and the
last stays open. Each unit row has its own `⋯` and (when it's a split you're not
in) its own "I'm in" button. The top-level `⋯` adds **"I had all N"** to cover
every unit at once. The footer shows e.g. *"$12.00 each · 2 still open."*

### 4.9 Finishing — the unclaimed-items guard

The screen has a sticky bottom bar showing **"Your share so far"** (live `myTotal`)
and an **"I'm done"** button (disabled until you've claimed ≥1 thing). If you tap
"I'm done" while **any item is still completely unclaimed**, raise a bottom-sheet:

> **"A few things are unclaimed."** Lists the orphan items. Two choices: **Keep
> claiming** (dismiss) or **Leave on {host}'s tab** (proceed — the host eats the
> remainder). This prevents money silently going missing.

---

## 5. Screen-by-screen spec

See **[SCREENS.md](./SCREENS.md)** for the detailed per-screen layout, components,
copy, and states. Summary:

1. **Welcome** — logo mark, hand-drawn underline on "check", two CTAs ("Snap the receipt" / "Join with a code").
2. **Host Setup** — name, Venmo (with a validated "✓ Sarah Jones" confirmation state), currency select. CTA "Snap the receipt".
3. **Scan** — "Use camera" / "Upload a photo" tiles → a faux receipt preview → "Read it with AI" → a ~1.9s shimmer/scan loading state. **[FAKED]** receipt OCR; production calls the AI extractor.
4. **Tip** — **shows the full scanned itemization** (every line item the AI pulled, with ×N), then Subtotal / Tax / Tip / Total under a dashed "tear" divider. Tip presets (No tip / 15 / 18 / 20%) each show the dollar amount. CTAs "Show the QR code" / "Track who's paid".
5. **QR** — bottom-sheet with a real QR (encodes the join URL), the short URL, and a "Join as a guest (demo)" crossover.
6. **Join** — guest enters their name; "{host} wants to split the bill with you."
7. **Claim** — §4. The heart.
8. **Your Share** — Stripe-clean itemized summary on a tinted "plate", "You owe $X", a warm (non-Venmo-blue) **"Pay {host} $X"** button, "Sent instantly via Venmo" note. **[FAKED]** Venmo handoff.
9. **Settled** — celebratory "All squared up." with a hand-drawn check + a who's-paid list (Paid/Pending per person).
10. **Host Dashboard** — "Who owes what": a live **Collected $X / $Y** progress meter, per-person cards with their items + tax/tip + Paid/Pending pill, and "All settled up." when everyone's paid. **[FAKED]** live updates.

---

## 6. Interactions, motion & states

- **Entrance:** screens/scenes translate up ~10–12px on `cubic-bezier(.22,1,.36,1)`
  over ~0.42–0.5s. **Never animate from `opacity:0`** — start visible and only
  translate, so print/reduced-motion/first-paint always show content.
- **Tap feedback:** buttons scale to `0.975` on `:active` over 0.14s with a gentle
  spring `cubic-bezier(.34,1.5,.6,1)`.
- **Claim check fill:** the target "pops" (scale 0.5→1.18→1) on the spring when claimed.
- **Bottom sheets:** slide up ~28px; a dimming scrim (`rgba(40,24,12,.5)`) covers
  the screen. **Sheets must be pinned to the phone/screen viewport**, not anchored
  to scrolling content — see §8. Dismiss by tapping the scrim or choosing an action.
- **Toasts:** small pill at the bottom, spring-in, auto-dismiss ~1.8s ("You're in
  — Bottle of Wine", "Sarah jumped in too", etc.).
- **Progress meter:** width transitions over 0.5s.
- Honor `prefers-reduced-motion`. No infinite/looping decorative animation except a
  subtle waving-hand emoji-style accent in the claim header (purely optional).

---

## 7. Design tokens

Full set in `colors_and_type.css` and `organic.css`. Essentials:

**Color (warm "clay" / Claude-organic palette — deliberately NOT Venmo blue):**
| Token | Hex | Use |
|---|---|---|
| `--clay` | `#D4774E` | primary accent (claimed, CTAs, brand) |
| `--clay-deep` | `#BC5F39` | pressed/hover accent, accent text |
| `--clay-soft` | `#F2DECE` | claimed-card tint fill |
| `--clay-edge` | `#E6C3A9` | claimed-card border |
| `--bg` | `#FBF7F0` | app background |
| `--bg-2` | `#F6EFE4` | held-item tint |
| `--panel` | `#FFFFFF` | cards/sheets |
| `--warm` | `#F5EEE2` | soft fills, secondary buttons |
| `--ink` | `#2B2620` | primary text (never pure black) |
| `--ink-2` | `#6F665A` | secondary text |
| `--ink-3` | `#A89E8F` | muted/hints |
| `--line` / `--line-2` | `#EBE2D3` / `#F1EADD` | borders / faint dividers |
| `--sage` | `#7C9B73` | success / paid |
| Avatar tones | clay `#C96F4C`, gold `#D29A3C`, sage `#7C9B73`, plum `#A8748A`, sky `#7E97AE` | person identity (fixed, NOT theme-derived) |

There are also `theme-coral` and `theme-sage` palette variants (a tweak) — clay is
the default and canonical.

**Type:**
- UI/body: **Inter** (400–800), tight negative tracking on headings (-0.02 to -0.03em).
- Display accents: **Newsreader** italic (the warm, hand-drawn voice — used on
  "you", "tip", "what", "squared up").
- Numerals/money: a **monospace** stack, tabular figures, slight negative tracking.

**Radii:** card `24px`, lg `20px`, md `14px`, pill `999px`.
**Shadows:** soft, warm-tinted, low-opacity (`rgba(60,40,24,…)`), three steps
(`--sh-soft` resting, `--sh-card` floating, `--sh-float` sheets/modals).
**Spacing:** comfortable; cards `16–17px` padding, page `14–22px`, gaps `10–14px`.

**Voice/copy:** calm, plain, first-name, sentence case for body, Title Case for
buttons; itemize money transparently; never scold late payers. Examples throughout
the prototype copy.

---

## 8. Implementation notes & gotchas (learned the hard way)

- **Bottom sheets must overlay the viewport, not the scroll content.** A naive
  `position:absolute; inset:0` scrim anchored to tall scrolling content puts the
  sheet at the bottom of the *content* (you have to scroll to find it). Pin it to
  the screen/scroll-viewport instead. *In the prototype this is solved by
  portaling the scrim into a node that's a direct child of the phone frame
  (`#sheet-root`), outside the scrolling body — see `SheetPortal` in
  `organic-kit.jsx`. In production, use your framework's modal/portal that fixes to
  the viewport.*
- **Person/avatar colors are fixed per identity**, not derived from the theme
  accent — so identities stay stable if the palette changes.
- **Re-resolve `var()`-based backgrounds on state change.** In the prototype,
  claim cards key off their claim signature so CSS-variable backgrounds re-resolve
  reliably; in a real framework this is a non-issue if you bind styles to state.
- **No group-approval gates anywhere.** Every claim/cover/dispute action is
  immediate and reversible. This is a deliberate product stance (low friction).
- **Tip on pre-tax subtotal; tax & tip proportional to each person's items** (§2).
- **"I'm done" guard**: never let a fully-unclaimed item slip through silently.

---

## 9. Files in this bundle

| File | What it is |
|---|---|
| `README.md` | This spec (product, claim model, screens, tokens) |
| `BACKEND.md` | **Backend + integration: existing repo reconciliation, socket events, keep-vs-change** |
| `SCREENS.md` | Per-screen layout/component/copy detail |
| `existing_app_reference/server/index.js` | The **real current backend** (Express + socket.io + OCR), verbatim |
| `existing_app_reference/client_src/` | The **real current client** pages/components/context, verbatim |
| `prototype/index.html` | Runnable prototype entry (open in a browser) |
| `prototype/organic-kit.jsx` | Primitives + math helpers (`shareOf`, `unitPrice`, …) + `SheetPortal` |
| `prototype/organic-screens.jsx` | `Welcome`, `ClaimScreen` + `ItemCard` + `UnitRow`, `ShareScreen`, `SettledScreen` — **the claim model lives here** |
| `prototype/organic-host.jsx` | `Setup`, `Scan` + `FauxReceipt`, `TipShare`, `QRSheet`, `Join`, `HostDashboard` |
| `prototype/organic-app.jsx` | Scene state machine, seed data, the proportional split math wiring |
| `prototype/organic.css` | All component styling |
| `prototype/colors_and_type.css` | Color + type tokens |
| `prototype/tweaks-panel.jsx` | (Dev-only) the tweak panel; not part of the product |

**Source of truth for the real app:** `github.com/pegg-dot/split-the-check`
(React + Vite client, Express + socket.io + AI-extraction server). Recreate these
designs within that codebase's conventions.

---

*Read §4 closely. The claim model's rules are subtle and were arrived at
deliberately — implement them exactly, especially the opt-in "I split this" /
"I'm in" loop and the no-approval override behavior.*
