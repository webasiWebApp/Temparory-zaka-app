# design.md — Ride App Redesign

## ⚠️ SCOPE LOCK (read first, overrides everything below)

This is a **visual restyle only**. Change ONLY how things look:

**ALLOWED to change:** typography (font, sizes, weights, line height, letter spacing), spacing (margin, padding, gaps), colors, shadows, border radius, borders, hover/focus/pressed visual states, transitions, icon/button/input *styling*.

**DO NOT change, under any circumstances:**
- **Structure:** component hierarchy, JSX/DOM structure, page layout order, routes, file/folder organization, navigation flow. Do not add, remove, merge, split or reorder components, sections or screens.
- **Functionality:** logic, state, hooks, props, API calls, data handling, validation, event handlers, behavior.
- **Wording:** all text, labels, headings, placeholders, button copy, error messages. Keep every string exactly as it is. (Any example copy in this file is illustrative only; do not apply it.)

If a style in this file seems to require a structural, functional or wording change, **skip it and keep the existing behavior**. When unsure, change less. Apply styles by editing Tailwind classes and `tailwind.config.js` only.

---

> **Instruction to the coding agent (Claude Code / Cursor):**
> Redesign the existing ride-booking web app (React + Tailwind) to follow this spec. Keep all existing structure, functionality, routes, data flow, API calls and wording unchanged. Only change visual styling (typography, spacing, colors, shadows, radius). Read the whole file before editing. Update `tailwind.config.js` first, then shared components, then screens. Do not introduce new dependencies unless listed here.

---

## 1. Design goals

- **Feel:** clean, minimal, lots of white space, confident and fast. Inspired by the Uber Eats web UI: large clear type, generous spacing, soft shadows, pill-shaped buttons, near-black text on pure white.
- **Brand:** primary color `#ff860d` (orange). Background is white.
- **Platforms:** fully responsive, mobile and desktop equally. Design mobile at 375px, desktop at 1280px.
- **Theme:** light mode only. Do not add dark mode, but keep colors as CSS variables / Tailwind tokens so dark mode could be added later.
- **Principles:**
  1. One primary action per screen, always orange.
  2. White space over borders and dividers. Separate with spacing first, hairlines second, shadows last.
  3. Type hierarchy does most of the work. Few colors, few weights.
  4. Large touch targets (min 48px height on interactive elements).
  5. No decoration that does not help the task.

---

## 2. Color tokens

Orange `#ff860d` has only about 2.2:1 contrast on white, so **never use it for body text, small text, or thin icons on white**. Use it for fills and large accents. Text on orange fills is near-black.

| Token | Hex | Use |
|---|---|---|
| `primary` | `#ff860d` | Primary CTA fill, active indicators, selected states, key highlights |
| `primary-hover` | `#e67300` | Hover on primary fill |
| `primary-pressed` | `#cc6600` | Active/pressed on primary fill |
| `primary-50` | `#fff4e8` | Selected row/card background tint |
| `primary-100` | `#ffe6cc` | Chips, subtle badges, focus halo |
| `primary-text` | `#b85c00` | Orange-colored text/links on white (about 4.6:1, AA) |
| `on-primary` | `#111111` | Text/icons placed on orange fill (about 7.8:1) |
| `ink` | `#111111` | Headings, primary text |
| `ink-2` | `#545454` | Secondary text |
| `ink-3` | `#757575` | Tertiary text, placeholders (min size 14px) |
| `line` | `#e8e8e8` | Hairline dividers, input borders |
| `surface` | `#ffffff` | Page background, cards |
| `surface-2` | `#f6f6f6` | Input fill, secondary buttons, skeletons, map overlays |
| `success` | `#1a7f4b` | Success text/icon |
| `danger` | `#d92d20` | Errors, destructive |
| `warning` | `#b54708` | Warnings |

Rules:
- Page background is always `#ffffff`.
- Secondary button = black (`ink`) fill with white text, **or** `surface-2` fill with `ink` text.
- Orange appears at most once as a large fill per viewport (the main CTA), plus small accents (active tab underline, selected ring, progress).
- Focus ring on every interactive element: `2px solid #ff860d` with `2px` offset (visible on white).

---

## 3. Typography

Uber uses a proprietary geometric sans. Use **Inter** as the free equivalent, loaded via `@fontsource/inter` or Google Fonts (weights 400, 500, 600, 700). Fallback stack: `Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`.

| Style | Mobile | Desktop | Weight | Line height | Letter spacing |
|---|---|---|---|---|---|
| Display (hero) | 32px | 52px | 700 | 1.1 | -0.02em |
| H1 | 28px | 36px | 700 | 1.15 | -0.015em |
| H2 | 22px | 28px | 600 | 1.2 | -0.01em |
| H3 | 18px | 20px | 600 | 1.3 | 0 |
| Body L | 16px | 18px | 400 | 1.5 | 0 |
| Body | 14px | 16px | 400 | 1.5 | 0 |
| Label / button | 16px | 16px | 600 | 1.2 | 0 |
| Caption | 12px | 13px | 500 | 1.4 | 0.01em |
| Price / big number | 24px | 28px | 700 | 1.1 | -0.01em, tabular-nums |

Rules:
- Sentence case everywhere. No ALL CAPS except tiny captions if essential.
- Max two weights per screen section.
- Use `tabular-nums` for prices, ETAs, distances.
- Body text max width 65ch.

---

## 4. Spacing, layout, radius

**Spacing scale (4px base):** 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 96. Use Tailwind's default scale; do not invent odd values.

- Mobile page padding: `16px` horizontal. Desktop: `24px` up to `max-w-7xl` (1280px) centered.
- Vertical section spacing: 32px mobile, 64px desktop.
- Gap between cards in a list: 12px mobile, 16px desktop.
- Inside cards: 16px padding (mobile), 20–24px (desktop).

**Border radius:**
| Element | Radius |
|---|---|
| Buttons, chips, search/address pills | `9999px` (full pill) |
| Inputs | `12px` |
| Cards, ride option rows | `16px` |
| Bottom sheets / modals | `24px` top corners (sheet), `20px` (modal) |
| Avatars, icon buttons | `9999px` |

**Layout patterns:**
- **Mobile:** single column. Map fills the top; a bottom sheet holds the booking form/content. Sticky bottom action bar for the primary CTA (with `env(safe-area-inset-bottom)` padding).
- **Desktop (≥1024px):** two panes. Left fixed panel 420px wide (white, shadow) holds forms and lists; right fills with the map. Top header 72px.
- Breakpoints: Tailwind defaults (`sm 640`, `md 768`, `lg 1024`, `xl 1280`).

---

## 5. Shadows and elevation

Shadows are soft, large-blur and low-opacity, like Uber Eats cards. Never use hard or dark shadows.

| Token | Value | Use |
|---|---|---|
| `shadow-card` | `0 2px 8px rgba(0,0,0,0.08)` | Resting cards that need lift |
| `shadow-raised` | `0 4px 16px rgba(0,0,0,0.12)` | Hover cards, dropdowns, floating buttons |
| `shadow-sheet` | `0 -4px 24px rgba(0,0,0,0.12)` | Bottom sheets, sticky bottom bar |
| `shadow-panel` | `4px 0 24px rgba(0,0,0,0.10)` | Desktop left panel over map |
| `shadow-modal` | `0 12px 40px rgba(0,0,0,0.20)` | Modals, popovers |

Rules: prefer no shadow + generous spacing for list items; use a `1px #e8e8e8` border OR a shadow, never both on the same element. Hover on cards: transition from `shadow-card` to `shadow-raised`, 150ms ease-out.

---

## 6. Tailwind config (implement exactly)

```js
// tailwind.config.js
module.exports = {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#ff860d",
          hover: "#e67300",
          pressed: "#cc6600",
          50: "#fff4e8",
          100: "#ffe6cc",
          text: "#b85c00",
        },
        "on-primary": "#111111",
        ink: { DEFAULT: "#111111", 2: "#545454", 3: "#757575" },
        line: "#e8e8e8",
        surface: { DEFAULT: "#ffffff", 2: "#f6f6f6" },
        success: "#1a7f4b",
        danger: "#d92d20",
        warning: "#b54708",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
      },
      borderRadius: { card: "16px", input: "12px", sheet: "24px" },
      boxShadow: {
        card: "0 2px 8px rgba(0,0,0,0.08)",
        raised: "0 4px 16px rgba(0,0,0,0.12)",
        sheet: "0 -4px 24px rgba(0,0,0,0.12)",
        panel: "4px 0 24px rgba(0,0,0,0.10)",
        modal: "0 12px 40px rgba(0,0,0,0.20)",
      },
      transitionTimingFunction: { out: "cubic-bezier(0.2, 0, 0, 1)" },
    },
  },
  plugins: [],
};
```

Set `body { @apply bg-white text-ink font-sans antialiased; }`.

---

## 7. Component specs

### Buttons
- Height 48px (default), 40px (small), 56px (large/hero). Horizontal padding 24px. Fully rounded. Label 16px / 600.
- **Primary:** `bg-primary text-on-primary`, hover `bg-primary-hover`, pressed `bg-primary-pressed`.
- **Secondary:** `bg-ink text-white`, hover `bg-black/85`.
- **Tertiary:** `bg-surface-2 text-ink`, hover `bg-[#eeeeee]`.
- **Ghost / link:** `text-primary-text`, underline on hover.
- Disabled: `bg-surface-2 text-ink-3`, no shadow, `cursor-not-allowed`.
- Loading: inline spinner (20px, `currentColor`), keep width stable.
- Full width on mobile for main CTAs.

### Inputs (address, search, promo)
- Height 56px, `bg-surface-2`, radius 12px, no border by default, 16px padding, 16px text (prevents iOS zoom).
- Focus: `bg-white` + `2px` primary ring. Error: `2px` danger ring + 14px danger helper text below.
- Pickup/drop-off fields: stacked, joined by a thin vertical line with a filled dot (pickup, ink) and square (drop-off, ink). Leading icons 20px, `ink`.
- Address suggestions list: white, `shadow-raised`, 16px radius, rows 56px with 20px icon + two-line text (name 16/500, address 14/`ink-2`).

### Cards / ride option rows
- White, radius 16px, padding 16px, `shadow-card` or 1px `line` (pick one).
- Selected state: `bg-primary-50` + `2px` primary border. Unselected: transparent border same width (no layout shift).
- Ride option row layout: vehicle illustration/image 64px left, name (H3) + ETA/seats caption center, price (big number) right-aligned.

### Chips / tags
- Height 32–40px, pill, `bg-surface-2` text `ink`; active chip `bg-ink text-white` or `bg-primary-100 text-ink`.

### Header
- 72px desktop / 56px mobile, white, bottom 1px `line` (or `shadow-card` on scroll).
- Left: logo/wordmark. Right: avatar button (40px) and menu. Nav links 16/500, active indicator = 3px orange underline.
- Mobile: hamburger opens a full-height white drawer (`shadow-modal`).

### Bottom sheet (mobile)
- White, top radius 24px, `shadow-sheet`, 40×4px `line` grab handle centered, 16px padding. Snap points: 30%, 60%, 90%.

### Modals
- White, radius 20px, `shadow-modal`, max-w 480px, 24px padding, backdrop `rgba(0,0,0,0.4)`. On mobile, render as bottom sheet.

### Lists (trip history, payment methods)
- Rows 72px min height, 16px padding, 1px `line` divider inset 16px from left. Hover `bg-surface-2` (desktop).

### Map
- Neutral, light, desaturated style. Route line 4px `ink` (or primary when active trip). Pickup marker: ink circle with white center. Drop-off marker: ink square. Driver marker: orange circle with ink car icon.
- Floating map controls: 48px white circles with `shadow-raised`.

### Toasts / banners
- White card, `shadow-raised`, radius 12px, 4px left accent in success/danger/warning. Auto-dismiss 4s.

### Skeletons & empty states
- Skeletons: `bg-surface-2`, radius matches element, subtle shimmer. Empty states: centered illustration (simple line art in `ink`), H3 title, Body in `ink-2`, one primary or tertiary button.

---

## 8. Screens

### 8.1 Home / book a ride
- **Mobile:** map top, bottom sheet with H1 "Where to?" then stacked pickup/drop-off inputs, then recent/saved places list (3 rows), sticky orange "Search rides" button once both fields are filled.
- **Desktop:** left 420px panel: H1 "Go anywhere, anytime", the inputs, "Search rides" primary button full-width, recent places below. Right: map.
- Optional chip row: "Now" / "Schedule" (pill chips).

### 8.2 Choose ride type & price
- Replaces the sheet/panel content. Back arrow (icon button) + H2 "Choose a ride".
- List of ride option rows (see Cards). Selected row highlighted. Payment method row below the list (icon, masked card, chevron).
- Sticky bottom bar (`shadow-sheet`): primary button "Confirm {Ride name}" showing price on the right of the label if space allows.

### 8.3 Live trip tracking
- Status headline H2 ("Driver arriving in 3 min"), tabular ETA in Display/H1.
- Driver card: avatar 56px, name H3, rating caption, car + plate, call and message icon buttons (48px circles, `surface-2`).
- Trip progress: 4px bar, orange fill over `line`.
- Secondary actions as tertiary buttons: "Share trip", "Cancel ride" (danger text on tertiary).

### 8.4 Trip history, account, payments
- Account page: H1 name, avatar, vertical list of settings rows with chevrons (no cards, just rows and dividers).
- Trip history: list rows with small map thumbnail 56px (radius 12px), date/time, route (two lines), price right.
- Payments: list of method rows + tertiary "Add payment method" button with plus icon.

---

## 9. Motion

- Durations: 150ms (hover, press), 250ms (sheets, modals, route transitions). Easing `cubic-bezier(0.2, 0, 0, 1)`.
- Button press: scale 0.98. Sheet: translate-y with ease-out. Page content: fade in, 8px upward, 200ms.
- Respect `prefers-reduced-motion`: disable translate/scale, keep opacity fades.

---

## 10. Accessibility

- All text meets WCAG AA (4.5:1; 3:1 for 18px+ bold). Orange only as fill with `on-primary` text.
- Visible focus rings (see section 2). Full keyboard navigation. Escape closes modals/sheets.
- Hit targets min 48×48px (mobile), 40×40px (desktop icon buttons).
- Icons paired with labels or `aria-label`. Map has a text alternative: the trip summary is always available as text.
- Never rely on color alone for state (use icon/text plus color).

---

## 11. Icons & imagery

- Use `lucide-react` (stroke 1.75–2px, 20–24px, `currentColor`). Keep existing icon library if one is already installed.
- Vehicle images: transparent PNG/SVG, top-down or 3/4 view, consistent size and lighting.
- No stock-photo backgrounds on functional screens. Hero imagery is allowed only on the logged-out landing page.

---

## 12. Implementation checklist for the agent

1. Install Inter (`@fontsource/inter`) and apply the Tailwind config from section 6.
2. Refactor shared components first: `Button`, `Input`, `Card`, `Chip`, `Header`, `BottomSheet`, `Modal`, `Toast`, `ListRow`.
3. Replace hard-coded colors, radii and shadows across the codebase with tokens. Search for hex values and inline styles.
4. Restyle the four screen groups in section 8 using these tokens. Do NOT restructure layouts, reorder elements or change any text; section 8 and the layout patterns in section 4 are visual guidance only, applied where the existing structure allows.
5. Remove unused CSS and old theme code.
6. Verify at 375px, 768px, 1280px. Run lint and existing tests. Confirm no functionality or routes changed.
7. Final pass: contrast check on all orange usages, focus rings, tap target sizes.

**Do not:** add dark mode, use orange for body text, add gradients, use heavy or colored shadows, add new libraries beyond Inter, or alter business logic.