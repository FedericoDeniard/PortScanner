# Design

Visual system inspired by a Linux terminal interface with a **Tokyo Night** aesthetic, reinterpreted with pastel accents, soft transparencies, and a very dark blue-gray base.

The interface should feel **technical, compact, sober and personal**, avoiding overly bright surfaces or saturated colors. Pastel colors work primarily as semantics and hierarchy, while dark neutrals sustain the composition.

---

## Color palette

Palette inspired by the "Tokyo Night" style / soft pastel themes on a dark background.

| Hex       | Preview       | Description                |
| --------- | ------------- | -------------------------- |
| `#51576c` | ▇▇▇          | Dark blue-gray             |
| `#e98186` | ▇▇▇          | Coral red                  |
| `#a6d28a` | ▇▇▇          | Sage green                 |
| `#e6c890` | ▇▇▇          | Golden / sand yellow       |
| `#8caaec` | ▇▇▇          | Sky blue                   |
| `#f2b9e5` | ▇▇▇          | Pastel pink                |
| `#82c8be` | ▇▇▇          | Blue-green (teal)          |
| `#b5bfe2` | ▇▇▇          | Light lavender blue        |

### Definitions (CSS / TS)

```ts
export const colors = {
  base:    "#51576c", // dark blue-gray - neutral / borders / secondary text
  red:     "#e98186", // coral red - errors / closed / danger
  green:   "#a6d28a", // sage green - success / open / ok
  yellow:  "#e6c890", // golden yellow - warnings / filtered / pending
  blue:    "#8caaec", // sky blue - info / primary / accent
  pink:    "#f2b9e5", // pastel pink - highlight / decorative
  teal:    "#82c8be", // teal - secondary info / categories
  lavender:"#b5bfe2", // lavender blue - light text / soft backgrounds
} as const;
```

> The entire UI is composed exclusively from these 8 colors. No additional neutrals, grays, or extra shades are introduced.

---

## Semantic roles

Colors are chosen by intent, not just for decoration.

| Role | Color | Application |
| --- | ----- | ---------- |
| Primary / action | `#8caaec` | Links, main actions, focus |
| Success | `#a6d28a` | OK states, online, completed |
| Warning | `#e6c890` | Pending, attention, limited resources |
| Error / danger | `#e98186` | Error, failure, destructive actions |
| Secondary information | `#82c8be` | Tags, categories, technical data |
| Highlight | `#f2b9e5` | Headings, keywords, important values |
| Light text / soft emphasis | `#b5bfe2` | Values, prominent subtitles |
| Neutral | `#51576c` | Borders, separators, disabled state |

### Usage rule

Pastel accents must appear in **small doses**. As a reference:

- 60–75% of the visual area: `colors.base` and its opacity variants.
- 15–25%: `colors.lavender` for soft text and values.
- 5–15%: semantic accent colors.

Do not use all saturated colors simultaneously within the same component unless it is a deliberately multicolored visualization.

---

## Typography

The reference uses an unmistakably **monospaced** aesthetic, similar to a modern terminal.

### Family

Prefer:

```css
font-family:
  "JetBrains Mono",
  "Fira Code",
  "IBM Plex Mono",
  "SFMono-Regular",
  Consolas,
  "Liberation Mono",
  monospace;
```

The typography must preserve:

- monospaced width;
- good differentiation between `0/O`, `1/l/I`;
- clearly legible numbers;
- correct support for technical symbols;
- compact appearance.

### Typographic scale

| Token | Size | Usage |
| ----- | ---- | ----- |
| `xs` | `11px` | Microcopy, indicators |
| `sm` | `12px` | Metadata and navigation |
| `md` | `14px` | Main text |
| `lg` | `16px` | Small headings |
| `xl` | `20px` | Section titles |
| `2xl` | `24px` | Main titles |

In interfaces inspired by the screenshot, `12px–14px` should be the predominant range.

### Weight

```ts
export const fontWeights = {
  regular: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
} as const;
```

Use `600–700` for names, headings and information keys. Avoid large bold blocks.

### Line height

```ts
export const lineHeights = {
  tight: 1.2,
  normal: 1.45,
  relaxed: 1.65,
} as const;
```

For terminal-like content or dense data, prefer `1.35–1.5`.

---

## Spacing

The system uses a small, consistent grid to preserve a compact feel.

```ts
export const spacing = {
  0: 0,
  1: "4px",
  2: "8px",
  3: "12px",
  4: "16px",
  5: "20px",
  6: "24px",
  8: "32px",
  10: "40px",
  12: "48px",
  16: "64px",
} as const;
```

### Recommended use

- `4px`: separation between closely related elements.
- `8px`: separation of labels, icons and values.
- `12px`: compact internal padding.
- `16px`: standard component padding.
- `24px`: separation between blocks.
- `32px+`: separation between sections.

The interface should feel **dense but breathable**, not overly spacious.

---

## Borders and radii

The visual reference favors thin borders and relatively straight geometry.

```ts
export const radius = {
  none: "0px",
  sm: "2px",
  md: "4px",
  lg: "8px",
  pill: "999px",
} as const;

export const borders = {
  thin: "1px",
  medium: "2px",
} as const;
```

### Rules

- Cards and panels: `4–8px`.
- Inputs: `4px`.
- Chips/status: `999px` only when emphasizing the badge nature.
- Avoid very large radii like `16–24px` because they move away from the terminal aesthetic.
- Borders must be discreet and low-contrast using `colors.base` with low opacity.

---

## Iconography

Iconography must complement the technical aesthetic.

Prefer:

- linear icons;
- thin/medium stroke;
- geometric shapes;
- little fill;
- size between `14px` and `18px`.

Colors:

```ts
export const iconColors = {
  default: colors.lavender,
  primary: colors.blue,
  success: colors.green,
  warning: colors.yellow,
  danger: colors.red,
  info: colors.teal,
  accent: colors.pink,
  muted: colors.base,
} as const;
```

Do not use icons with arbitrary colors outside the system.

---

## Components

### Syntax highlighting

```ts
export const syntax = {
  keyword: colors.pink,
  string: colors.green,
  number: colors.yellow,
  function: colors.blue,
  variable: colors.lavender,
  comment: colors.base,
  type: colors.teal,
  error: colors.red,
} as const;
```

The screenshot shows that the visual language works especially well when **different types of information receive different colors, but all belong to the same muted pastel**.

---

### Badge / Status

A status should quickly communicate operational information.

```css
.status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border-radius: 999px;
  padding: 4px 8px;
  font-size: 12px;
  line-height: 1;
}
```

Variants (background with alpha derived from the palette color, text in solid color):

| Variant | Recommended background | Text |
| ------- | ---------------------- | ---- |
| Success | `rgba(166, 210, 138, .14)` | `#a6d28a` |
| Warning | `rgba(230, 200, 144, .14)` | `#e6c890` |
| Error | `rgba(233, 129, 134, .14)` | `#e98186` |
| Info | `rgba(130, 200, 190, .14)` | `#82c8be` |
| Primary | `rgba(140, 170, 236, .14)` | `#8caaec` |

---

### Buttons

Buttons must be compact and functional.

#### Primary

- background `colors.blue`;
- text `colors.base` (dark, high contrast on blue);
- hover with higher luminosity / reduced opacity;
- focus with outline `colors.blue`.

#### Secondary

- background `colors.base`;
- text `colors.lavender`;
- subtle border.

#### Ghost

- transparent background;
- text `colors.lavender`;
- hover with semi-transparent `colors.base`.

Avoid huge, rounded, highly saturated buttons.

---

## Layout

The reference composition uses large visual surfaces with blocks of compact information.

### Principles

- use `colors.base` as the background canvas;
- keep main content within a reading column;
- reserve wide spaces around content;
- combine a dominant area with secondary blocks;
- avoid overly dense grids.

### Widths

```ts
export const layout = {
  contentSm: "640px",
  contentMd: "840px",
  contentLg: "1100px",
  contentXl: "1280px",
} as const;
```

For mainly textual/technical content, `640–840px` is usually enough.

---

## Alignment

The interface benefits from strict alignments.

Prefer:

- aligned borders and texts;
- columns with consistent width;
- aligned numeric values;
- icons aligned to the center of the text;
- data lists with constant separation.

For `label/value` pairs:

```text
OS:         Gentoo Linux ppc
Host:       PowerMac6,1
Kernel:     Linux 6.18.43
Uptime:     18 hours, 18 mins
Packages:   62 (emerge)
```

The value can use a lighter tone (`colors.lavender`) or a semantic color depending on its importance.

---

## Motion

Motion must be functional and discreet.

```ts
export const duration = {
  fast: "120ms",
  normal: "180ms",
  slow: "280ms",
} as const;

export const easing = {
  standard: "cubic-bezier(0.2, 0, 0, 1)",
  emphasized: "cubic-bezier(0.2, 0, 0, 1.15)",
} as const;
```

Uses:

- hover: `120–180ms`;
- panel opening: `180–280ms`;
- content changes: `180–280ms`.

Avoid bounces, exaggerated scaling, and constant animations.

---

## Accessibility

The pastel aesthetic must not compromise legibility.

### Minimum rules

- main text with high contrast (`colors.lavender` on `colors.base`);
- do not rely exclusively on color for states;
- errors and warnings accompanied by icon, label or description;
- visible focus;
- reasonable minimum touch size;
- respect `prefers-reduced-motion`.

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

---

## Responsive

The aesthetic must be preserved on small screens, reducing density before losing legibility.

### Desktop

- parallel panels when it makes sense;
- `12–14px` typography;
- plenty of space around the composition.

### Tablet

- reduce margins;
- switch multi-column grids to `2`;
- keep panels with `12–16px` padding.

### Mobile

- a single column;
- hide secondary information before reducing text too much;
- `12–16px` padding;
- fonts never smaller than `12px` for relevant content.

---

## Example of complete tokens

```ts
export const designTokens = {
  colors,
  spacing,
  radius,
  fontWeights,
  lineHeights,
  layout,

  typography: {
    xs: "11px",
    sm: "12px",
    md: "14px",
    lg: "16px",
    xl: "20px",
    "2xl": "24px",
  },

  duration: {
    fast: "120ms",
    normal: "180ms",
    slow: "280ms",
  },
} as const;
```

---

## Design principles

1. **Dark first**  
   The base of the interface is `colors.base`. Pastel colors are accents.

2. **Terminal, not corporate dashboard**  
   The UI should feel technical, direct, and information-oriented, avoiding giant cards and excessive gradients.

3. **Pastels with purpose**  
   Every color must have a consistent semantic meaning.

4. **High density, good legibility**  
   A lot of information can coexist in a small space as long as there is a clear typographic hierarchy.

5. **Contrast by layers**  
   Depth is built with `colors.base` at different intensities and subtle borders, not with strong shadows or new colors.

6. **Monospaced as identity**  
   Monospaced typography is not just decorative: it defines the technical character of the system.

7. **Visual precision**  
   Alignments, spacing and sizes must follow a predictable scale.

8. **Sober interactivity**  
   Hover, focus and active must be visible but discreet.

9. **Only the defined palette**  
   A new component must reuse the 8 existing tokens. Never introduce an additional color.

10. **Information leads**  
    The aesthetic must help read and understand data, not compete with them.