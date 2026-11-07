# DESIGN.md: TAO Group OS

Design system for `tao-group-os.html`, the TAO Group member and operations app. Read this before changing anything visual. It follows the DESIGN.md convention: a portable description of the look, written for people and coding agents.

## Brief

- **Product**: a member app for the TAO Group venue portfolio (nightclubs, restaurants, lounges, hotels), with an operations dashboard for venue managers.
- **Audience**: high-spending members on their phone at night; general managers and VIP hosts on a laptop.
- **Primary job**: book a table, get in, order from the table, pay. Everything else supports that.
- **Direction**: old-money elegance that feels fresh. Monaco harbour at dusk, a private members' club, a dress watch dial. Not Asian-themed, not neon, not crypto.

## Colour

| Token | Hex | Role |
|---|---|---|
| Night | `#050C0A` | Page background (body, `theme-color`) |
| Deep emerald | `#0F5E49` | Brand ground, active tab, seals, hero light |
| Emerald | `#2FA37F` | Live and positive states, progress |
| Champagne | `#D9BE86` | Primary action, prices, key numbers |
| Champagne light | `#F3E6C4` | Links, highlights on dark |
| Pearl | `#F5F1E8` | Primary text |
| Ruby | `#B4233C` | Alerts only: allergies, full venues, errors |

Surfaces use the Tailwind `neutral` scale, retinted green-black (`neutral-950 #07100D` to `neutral-700 #22362E`). Secondary text uses `gray-300 #D3DCD6`, `gray-400 #A9B9B1`, and `gray-500 #8C9E95`. Every text colour is at least 5.1:1 on its surface.

Rules:
- One primary action per screen is champagne. Everything else is outline, text link, or neutral.
- Ruby never decorates. If it is on screen, something needs attention.
- No gradients as decoration. The only gradients are light (hero scrim, the emerald glow in the page background) and the gold of the member card.

## Typography

| Role | Face | Notes |
|---|---|---|
| Display (`.font-display`) | Bodoni Moda, optical size on | Headlines, venue names, large numbers. Weight 500. Mixed case. |
| Text | Jost 300–700 | Everything else. Geometric, mid-century Riviera. |

- Hero: `clamp(46px, 6.4vw, 88px)`, line-height 0.98, tracking -0.02em.
- Section titles: Bodoni 28–48px.
- Body 15–17px, line-height 1.6, measure under 80 characters.
- Small text never below 11.5px (the `text-[10px]` utility is bumped to 11.5px).
- Small `font-display` sizes fall back to Jost, because Bodoni breaks up below 16px.
- Numbers in tables and counters use `tabular-nums`.
- Sentence case everywhere. The `.uppercase` utility is neutralised. The only tracked capitals are the TAO wordmark and the intro lockup.

## Layout

```
┌──────────────────────── header (sticky) ────────────────────────┐
├──────────────────────── tab nav (sticky) ───────────────────────┤
│ ┌───────────────────── hero (photo) ─────────────────────────┐  │
│ │ Malam ini di TAO.              ┌ Paling ramai malam ini ┐  │  │
│ │ one paragraph                  │ 5 live venues, tap one │  │  │
│ │ [Pesan meja]  Kartu member     └────────────────────────┘  │  │
│ └────────────────────────────────────────────────────────────┘  │
│  venue directory, then each tab is one focused workspace        │
└─────────────────────────────────────────────────────────────────┘
```

- Left aligned. Content max width 1280px with 16–24px gutters.
- Radius follows hierarchy: hero 28px, panels 16–20px, rows and inputs 10–12px, chips and primary buttons full.
- The hero opens with the subject itself: a venue photograph and the live list of busiest venues. No stat row, no decorative rings.

## Motion

- **One orchestrated moment**: the opening intro (monogram, bezel, curtain lift, once per session), then the hero copy rises in sequence.
- **Everything else answers the user**: a tab fades in at 220ms, modals pop, rows highlight on hover, linked cards lift 2px, photos zoom 1.03 inside their frame.
- **Not used**: tilt, auto-playing sheens, Ken Burns, cursor-following light, staggered card entrances, pulsing decoration. Live indicators may pulse because they carry meaning.
- `prefers-reduced-motion` turns off the intro and every non-essential animation.

## Components

- **Primary button** `.lux-cta`: champagne pill, Jost 600 15px, verb and object ("Pesan meja").
- **Text link** `.lux-link`: champagne-light underline, offset 6px.
- **Panel** `.glass-panel`: `rgba(10,22,18,.82)`, 1px champagne border at 18%, blur.
- **Seal** `.tao-seal`: 44px emerald tile for section icons.
- **Status**: always icon plus word ("Daftar tunggu", "Diterima"), never colour alone.

## Copy

- Bahasa Indonesia, second person, active voice.
- Headings name the thing; buttons say what happens ("Kirim pesanan", not "Lanjut").
- No eyebrow labels above headings, no "A · B · C" meta strings, no arrows appended to buttons, no single word accented in a headline.
- Ellipsis is `…`, not `...`.

## Accessibility

- Skip link to `#main`; `color-scheme: dark`; `theme-color` set.
- Visible `:focus-visible` ring on every interactive element.
- Clickable `div`s get `role="button"`, `tabindex="0"`, and Enter/Space via the `tao-a11y` script.
- Icon-only buttons carry `aria-label`; live updates use `aria-live="polite"`.
- Modals, drawers, and lists use `overscroll-behavior: contain`.
