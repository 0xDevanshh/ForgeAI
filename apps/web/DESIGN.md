# Blueprint — design system

The visual language for AI Codebase Copilot. The product reads your codebase and
explains it, so the UI should feel like **an architect's workspace**: structured,
gridded, quietly confident. A precision developer instrument — not a playful
consumer app, not a generic dashboard template.

Every token lives in [`src/app/globals.css`](src/app/globals.css) and is exposed
to Tailwind in [`tailwind.config.ts`](tailwind.config.ts). **No ad-hoc colors,
sizes, or spacing in screens** — if something isn't expressible in these tokens,
add a token rather than a one-off value.

---

## How tokens are wired

Colors are authored as space-separated **RGB channel triplets**:

```css
--accent-rgb: 76 141 255;          /* the single source of truth */
--accent: rgb(var(--accent-rgb));  /* ready-to-use, for handwritten CSS */
```

Tailwind consumes the triplet as `rgb(var(--accent-rgb) / <alpha-value>)`, which
is what keeps opacity modifiers (`bg-surface/60`, `border-strong/40`) working.
Change a color in **one** place — the `-rgb` triplet.

Dark is the default (`:root`); light overrides live in `.light`.

---

## Color

### Surfaces — a three-step ladder

| Token | Tailwind | Dark | Light | Use |
| --- | --- | --- | --- | --- |
| `--bg-base` | `bg-canvas` | `#0D1117` | `#F5F7FA` | Page canvas |
| `--bg-surface` | `bg-surface` | `#161B22` | `#FFFFFF` | Cards, panels |
| `--bg-elevated` | `bg-elevated` | `#1C2128` | `#FFFFFF` | Modals, dropdowns |
| `--border-subtle` | `border-subtle` | `#21262D` | `#E3E8EF` | Default hairline |
| `--border-strong` | `border-strong` | `#30363D` | `#C6D0DC` | Inputs, emphasis |

> ⚠️ **`bg-canvas`, not `bg-base`.** A Tailwind color key named `base` collides
> with the `text-base` font-size utility — the color wins, and every
> `text-base` string silently renders in the page background color. The CSS
> variable keeps the spec name `--bg-base`; only the Tailwind key differs.

In light mode `--bg-elevated` and `--bg-surface` are both white by design —
elevation there is carried by shadow, not hue.

### Text

| Token | Tailwind | Dark | Light |
| --- | --- | --- | --- |
| `--text-primary` | `text-foreground` | `#E6EDF3` | `#0D1117` |
| `--text-secondary` | `text-foreground-secondary` | `#8B949E` | `#4A5561` |
| `--text-muted` | `text-foreground-muted` | `#6E7681` | `#6E7681` |

### Accent & status

Used **sparingly** — the accent marks primary actions and active state, nothing
else.

| Token | Tailwind | Dark | Light | Meaning |
| --- | --- | --- | --- | --- |
| `--accent` | `bg-brand` / `text-brand` | `#4C8DFF` | `#1F6FEB` | Primary action, active state |
| `--accent-hover` | `bg-brand-hover` | `#3B7DF5` | `#1A5FD0` | Accent hover |
| `--on-accent` | `text-brand-foreground` | `#0D1117` | `#FFFFFF` | Text on accent fills |
| `--success` | `text-success` | `#3FB950` | `#1A7F37` | Index complete |
| `--warning` | `text-warning` | `#D29922` | `#9A6700` | Reviewer "may be incomplete" |
| `--danger` | `text-danger` | `#F85149` | `#CF222E` | Index failed |

Two accessibility notes, both deliberate:

- **`--on-accent` is near-black in dark mode.** White on `#4C8DFF` is only
  3.2:1 — below AA. `#0D1117` on `#4C8DFF` is 5.9:1, and reads sharper.
- **The light accent is darker than the dark one.** `#4C8DFF` on white is
  2.9:1; `#1F6FEB` clears AA at 4.9:1.

All text/background pairs in both themes meet WCAG AA (≥4.5:1).

### Agent identity

A ramp kept **separate from status colors**, so "this came from the docs agent"
never reads as "something succeeded."

| Agent | Token | Dark | Light |
| --- | --- | --- | --- |
| `architecture` | `--agent-architecture-rgb` | `#4C8DFF` | `#1F6FEB` |
| `bug_investigation` | `--agent-bug-rgb` | `#F85149` | `#CF222E` |
| `pr_summary` | `--agent-pr-rgb` | `#A371F7` | `#8250DF` |
| `documentation` | `--agent-docs-rgb` | `#39C5CF` | `#1B7C83` |

---

## Typography

| Role | Family | Loaded via |
| --- | --- | --- |
| Display / headings | **Instrument Sans** | `next/font/google` |
| Body / UI | **Geist** | `geist/font/sans` |
| Code, file paths, SHAs | **Geist Mono** | `geist/font/mono` |

Deliberately **not Inter** — it's the default-tell of every AI-generated SaaS
page. Monospace is not decoration here: in a tool that reads code, it marks
things meant to be read literally.

### Scale — 1.25 ratio

| Token | Tailwind | Size |
| --- | --- | --- |
| `--text-xs` | `text-xs` | 12px |
| `--text-sm` | `text-sm` | 14px |
| `--text-base` | `text-base` | 16px |
| `--text-lg` | `text-lg` | 20px |
| `--text-xl` | `text-xl` | 25px |
| `--text-2xl` | `text-2xl` | 31.25px |
| `--text-3xl` | `text-3xl` | 39.06px |
| `--text-4xl` | `text-4xl` | 48.83px |

The ratio is exact from `--text-base` upward, where heading hierarchy depends on
it. **`xs`/`sm` are rounded up off-ratio** to 12/14px — a true 1.25 step down
lands at 10.24px, unreadable for the file paths and SHAs this UI leans on.

- Headings: `-0.02em` tracking, applied automatically to `h1`–`h6`.
- Body: `1.6` line-height (`--leading-body`) for long AI responses.
- Reading areas cap at **768px** (`--measure` / `max-w-measure`). AI answers
  stretched edge-to-edge are measurably harder to read.

---

## Spacing — 8px grid

`--space-1` (4px) → `--space-16` (64px). Tailwind's native scale already matches
(`p-2` = 8px, `p-4` = 16px), so use it directly.

**Even steps land on the 8px grid; odd steps (`space-3`, `space-5`) are for tight
spots like icon gaps and badge padding — keep them the exception.**

---

## Radius & elevation

| Token | Tailwind | Size | Use |
| --- | --- | --- | --- |
| `--radius-sm` | `rounded-sm` | 6px | Inputs, buttons, badges |
| `--radius-md` | `rounded-md` | 10px | Cards, panels, dropdowns |
| `--radius-lg` | `rounded-lg` | 14px | Modals |

Fully rounded pills are reserved for **status badges** (`<Badge shape="pill">`).

**Subtle 1px borders over heavy shadows** — this is the blueprint discipline.
Shadows (`shadow-sm/md/lg`) are only for genuinely floating elements: modals,
dropdowns, tooltips, toasts. Cards, buttons, inputs, and tabs carry no resting
shadow.

---

## Motion

| Token | Value |
| --- | --- |
| `--duration-fast` | 120ms |
| `--duration-base` | 150ms |
| `--duration-slow` | 240ms |
| `--ease-out` | `cubic-bezier(0.16, 1, 0.3, 1)` |

Tailwind: `duration-fast/base/slow`, `ease-out`.

- Route/content entrance: `.animate-enter` — 150ms fade + 4px slide.
- Streaming agent status: `<StreamingIndicator />` — a quiet three-dot pulse.
  **Not a spinner**: a spinner reads as "blocked, wait"; this reads as
  "thinking, text is coming."
- `prefers-reduced-motion: reduce` disables all non-essential motion globally.
  The streaming indicator degrades to a static visible state so it still
  signals activity.

---

## Signature elements

### Blueprint grid

`.bp-grid` on the app shell paints a fixed 32px line grid in `--border-subtle`,
radially masked from the top so it fades before it can crowd the reading
column. `.bp-dots` is a dotted variant for dense panels. It's the thing that
makes the product recognizable — present, never distracting.

### Agent tags

```tsx
<AgentTag agent="bug_investigation" />
```

Small monospace tags with a colored **left border** — code-editor gutter
markers, not emoji + pill badges. More professional and on-brand for a dev tool.
Values mirror the planner's `intent` in `apps/ai-service`.

---

## shadcn/ui

Components live in `src/components/ui/` and are wired through
[`components.json`](components.json). `npx shadcn@latest add <component>` works
and will inherit these tokens.

The theme is overridden at the Tailwind layer — shadcn's semantic names are
**aliased onto Blueprint tokens** rather than given their own values, so stock
components pick up this identity automatically:

| shadcn | maps to |
| --- | --- |
| `background` | `--bg-base` |
| `card` | `--bg-surface` |
| `popover` | `--bg-elevated` |
| `primary` | `--accent` |
| `secondary` | `--bg-elevated` |
| `muted` | `--bg-surface` / `--text-secondary` |
| `accent` | `--hover-surface` (**not** the brand accent) |
| `destructive` | `--danger` |
| `border` / `input` / `ring` | `--border-subtle` / `--border-strong` / `--accent` |

> ⚠️ **shadcn's `accent` means "subtle hover background", not a brand accent.**
> Mapping the brand blue there would light up every menu row on hover. The brand
> blue is `primary`; use `bg-brand` / `text-brand` when you want it explicitly.

Installed: `button` `input` `card` `dialog` `dropdown-menu` `sonner` `skeleton`
`badge` `avatar` `scroll-area` `tooltip` `separator` `tabs`.

Beyond the token aliasing, the generated sources were adjusted to remove stock
New York tells: `rounded-xl` cards → `rounded-md`, resting shadows removed,
blue-tinted skeletons → neutral, and the solid-blue tooltip → a quiet elevated
surface with a 1px border.

---

## Theming

`next-themes` with `attribute="class"`, `defaultTheme="dark"`,
`enableSystem={false}`. Dark is the product's identity, not the OS's call —
`enableSystem` would hand a light-mode OS user a light app on first load.
`<ThemeToggle />` flips between the two.

---

## Reference

`/` renders a live style guide of every token and component in
[`src/app/page.tsx`](src/app/page.tsx). Check changes against it.
