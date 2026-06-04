# Screens — detailed spec

Layout, components, copy, and states for each screen. All screens are a centered
mobile column (the prototype frames it at **392 × 812** inside a device bezel; in
production it's a full-width responsive mobile page). Page padding ~`14–22px`.
Scenes enter with a translate-up (never opacity:0). Refer to README §7 for tokens.

Legend: **[FAKED]** = simulated in prototype, needs real implementation.

---

## 1. Welcome
- **Purpose:** entry; choose host or guest path.
- **Layout:** vertically centered. Two soft organic background "blobs" (clay-soft,
  sage-soft) behind content. Logo mark (78×78 rounded-24 white tile, `--sh-card`).
- **Components:**
  - H1 `Split the check` (Inter 800, ~2.5rem, -0.025em). The word **"check"** has a
    hand-drawn clay underline squiggle (SVG) under it.
  - Subtitle: "Pay for exactly what you ordered." + a Newsreader-italic clay line
    "Nothing more, nothing less."
  - Primary button (clay, pill): **"Snap the receipt"** (camera icon) → Host Setup.
  - Soft button: **"Join with a code"** (qr icon) → Join.

## 2. Host Setup
- **Purpose:** capture who gets paid.
- **Layout:** top-aligned, back button, header.
- **Components:**
  - H1 "First, *you*." ("you" Newsreader italic clay). Lead "So friends know who to pay."
  - Field **Your name** (default "Sarah").
  - Field **Venmo username, phone, or email** — with a **valid** state: clay/green
    check + resolved name "✓ Sarah Jones" below. **[FAKED]** validation.
  - **Receipt currency** select (USD/EUR/GBP), chevron-down affordance, hint "The AI
    auto-detects this from your receipt too."
  - Primary button **"Snap the receipt"** → Scan.

## 3. Scan
- **Purpose:** capture the receipt; AI extracts items. **[FAKED]** OCR.
- **States:** `choose` → `preview` → `scanning`.
  - **choose:** two large tiles — **Use camera** ("Point at the receipt") and
    **Upload a photo** ("From your camera roll"), each an icon tile + two-line label.
  - **preview:** a **faux receipt card** (monospace, "TRATTORIA VERDE / 123 Mulberry
    St · Table 7", line items, subtotal/tax/total). Buttons: **"Read it with AI"**
    (sparkles) and ghost "Use a different photo".
  - **scanning:** a shimmer sweep over the receipt + spinner + "Reading your
    receipt…" / "Claude is pulling out every item." Auto-advances (~1.9s) to Tip.
- The seed receipt: Margherita Pizza 18, Burrata 14, Negroni 14, Aperol Spritz ×3
  36, Bottle of Wine 48, Tiramisu 9 · Subtotal 139.00 · Tax 11.82 · Total 150.82.

## 4. Tip
- **Purpose:** set tip AND review everything the AI scanned.
- **Layout:** back, header H1 "Set the *tip*", lead "Here's everything the AI pulled
  off your receipt."
- **Components:**
  - **Scanned itemization card** (white, soft border): **one row per line item** —
    name (with a muted "×3" on multi-qty) + mono price. Then a **dashed "tear-line"
    divider**, then `Subtotal`, `Tax`, and (when tip>0) `Tip · N%`, then a heavy
    `Total` row with a top border.
  - Caption "Tip is on the $139.00 subtotal (pre-tax)."
  - **Tip selector:** 4 segments — `No tip`, `15%`, `18%` (default on), `20%`. Each
    non-zero shows the dollar amount beneath (e.g. "$25.02"). Active = clay outline +
    soft tint.
  - Buttons: **"Show the QR code"** (→ QR sheet) and soft **"Track who's paid"** (→ Dashboard).

## 5. QR sheet
- Bottom-sheet (pinned to viewport — see README §8). Title "Scan to join", sub
  "Everyone at the table — no app, no sign-up." A real QR (encodes
  `https://splitcheck.app/s/<code>`), the short URL text, then **"Join as a guest
  (demo)"** (crossover to guest path) and ghost "Close". **[FAKED]** the join link.

## 6. Join (guest)
- Centered, one organic blob, back button. Hand icon in a clay-soft circle. H1 "Join
  the split", lead "{host} wants to split the bill with you." Field **Your name**
  (default "Jordan"). Primary **"Join the table"** → Claim.

## 7. Claim — see README §4 for the full model
- **Header:** "Hey {name} 👋" (waving-hand accent), lead "Tap what you got. Shared a
  dish? Hit **I split this** — the rest tap **I'm in**."
- **Item cards** (one per receipt item): see README §4.1 for states. Card top row =
  target (circle/check/avatar) + name (+ "covering" tag if applicable) + mono price +
  `⋯`. Below a faint dashed divider, a **status sub-row** (e.g. "Sarah ordered this",
  "All yours", avatars + "$16.00 each if you join" + **I'm in** button).
  - **Mine** cards get a clay-soft background + clay-edge border; **held** cards get a
    bg-2 tint.
  - **Multi-qty** cards (README §4.8): header with a count badge (how many units are
    mine) + per-unit rows + a "$X each · N still open" footer.
- **Sticky bottom bar:** floating pill card — "Your share so far" + live mono total,
  and an **"I'm done"** button (disabled until ≥1 claim).
- **Options sheet** (the single `⋯` menu) and **unclaimed-items confirm sheet**:
  README §4.3 / §4.9. Both are viewport-pinned bottom sheets.
- **Toasts** for feedback (README §6).

## 8. Your Share
- **Purpose:** show what I owe; pay.
- **Layout:** hero "Your share, *{name}*" (Newsreader italic name), sub "Just what
  you ordered — split fair."
- **Components:**
  - A tinted **"plate"** (clay-soft, rounded) with a white summary card sitting on it
    (Stripe-clean overlap motif): my item rows (with ×N if I had multiples), then
    muted `Tax` and `Tip · N%` rows, then a heavy **"You owe $X"** total.
  - Primary button **"Pay {host} $X"** — warm **clay** (NOT Venmo blue; Venmo is the
    rail, not the brand). Caption "Sent instantly **via Venmo** · you both get a
    receipt." **[FAKED]** Venmo handoff.

## 9. Settled
- Centered celebration. A sage disc with a **hand-drawn check** (SVG, pops in) + a
  clay/sage underline squiggle. Display "All *squared up.*" (italic sage). Lead "You
  paid {host} $X. The whole table can see it's handled."
- **Who's-paid list** card: each person = avatar + name (+ "· host"), and a status —
  **✓ Paid** (sage) or muted **Pending**. Soft "Start a new check" button.

## 10. Host Dashboard — "Who owes what"
- **Purpose:** host watches money come in live. **[FAKED]** realtime.
- **Layout:** back, centered header "Who owes *what*", sub "Updates live as people
  pay you."
- **Components:**
  - **Collected meter card:** "Collected" + mono **"$X / $Y"** (collected / expected —
    keep on ONE line), a sage progress bar (`width = collected/expected`).
  - **Per-person cards:** avatar + name (host shows "· host", inline) + a Paid/Pending
    **pill** (guests only) + mono total. Below: that person's item rows + a muted
    "Tax + tip" row. Paid guests' cards get a sage-soft tint.
  - When all guests paid: "All *settled up.*" flourish. Soft "Start a new check".
- **Layout gotchas (fixed):** the "$X / $Y" value and "· host" tag must not wrap —
  give the value `white-space:nowrap` and keep the name tag inline.

---

## Component inventory (reusable pieces)

- **Button** — variants: `clay` (primary), `soft`, `ghost`, `outline`; pill, icon+label, scale-on-press.
- **Avatar** — initial in a fixed-tone circle; **AvatarStack** overlaps several.
- **Icon** — Lucide line icons, stroke ~2, round caps (see design system ICONOGRAPHY).
- **Field** — label + input, with `ok`/valid and hint sub-states.
- **Card / sum-card / plate** — white panel; tinted plate behind for the overlap motif.
- **Item card / Unit row** — the claim primitives (README §4).
- **Bottom sheet** — viewport-pinned scrim + sheet with a grip handle; used for
  options, unclaimed-confirm, and QR.
- **Tip selector** — segmented presets with dollar sub-amounts.
- **Progress meter** — label + fraction + animated bar.
- **Status pill** — Paid (sage) / Pending (muted).
- **Toast** — transient bottom pill.
- **Hand-drawn accents** — `Squiggle` underline, `SketchCheck`, organic `Blob`,
  `ReceiptDoodle` (all simple inline SVG; decorative, gate behind reduced-motion).
- **Phone frame** — prototype-only device bezel; drop in production.
