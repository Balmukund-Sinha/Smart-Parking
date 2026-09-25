---
name: SmartPark Intelligence
colors:
  surface: '#0b1325'
  surface-dim: '#0b1325'
  surface-bright: '#31394d'
  surface-container-lowest: '#060e1f'
  surface-container-low: '#131b2d'
  surface-container: '#171f32'
  surface-container-high: '#222a3d'
  surface-container-highest: '#2d3448'
  on-surface: '#dbe2fb'
  on-surface-variant: '#bcc9cd'
  inverse-surface: '#dbe2fb'
  inverse-on-surface: '#283043'
  outline: '#869397'
  outline-variant: '#3d494c'
  surface-tint: '#4cd7f6'
  primary: '#4cd7f6'
  on-primary: '#003640'
  primary-container: '#06b6d4'
  on-primary-container: '#00424f'
  inverse-primary: '#00687a'
  secondary: '#4fdbc8'
  on-secondary: '#003731'
  secondary-container: '#04b4a2'
  on-secondary-container: '#003f38'
  tertiary: '#4edea3'
  on-tertiary: '#003824'
  tertiary-container: '#1bbd85'
  on-tertiary-container: '#00452e'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#acedff'
  primary-fixed-dim: '#4cd7f6'
  on-primary-fixed: '#001f26'
  on-primary-fixed-variant: '#004e5c'
  secondary-fixed: '#71f8e4'
  secondary-fixed-dim: '#4fdbc8'
  on-secondary-fixed: '#00201c'
  on-secondary-fixed-variant: '#005048'
  tertiary-fixed: '#6ffbbe'
  tertiary-fixed-dim: '#4edea3'
  on-tertiary-fixed: '#002113'
  on-tertiary-fixed-variant: '#005236'
  background: '#0b1325'
  on-background: '#dbe2fb'
  surface-variant: '#2d3448'
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 3rem
    fontWeight: '700'
    lineHeight: 3.5rem
    letterSpacing: -0.03em
  display-lg-mobile:
    fontFamily: Inter
    fontSize: 2rem
    fontWeight: '700'
    lineHeight: 2.5rem
    letterSpacing: -0.02em
  headline-xl:
    fontFamily: Inter
    fontSize: 2rem
    fontWeight: '600'
    lineHeight: 2.5rem
    letterSpacing: -0.02em
  headline-xl-mobile:
    fontFamily: Inter
    fontSize: 1.5rem
    fontWeight: '600'
    lineHeight: 2rem
    letterSpacing: -0.015em
  headline-lg:
    fontFamily: Inter
    fontSize: 1.5rem
    fontWeight: '600'
    lineHeight: 2rem
    letterSpacing: -0.015em
  headline-md:
    fontFamily: Inter
    fontSize: 1.25rem
    fontWeight: '600'
    lineHeight: 1.75rem
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Inter
    fontSize: 1rem
    fontWeight: '600'
    lineHeight: 1.5rem
    letterSpacing: 0em
  body-lg:
    fontFamily: Inter
    fontSize: 1.125rem
    fontWeight: '400'
    lineHeight: 1.75rem
    letterSpacing: -0.01em
  body-md:
    fontFamily: Inter
    fontSize: 0.875rem
    fontWeight: '400'
    lineHeight: 1.375rem
    letterSpacing: 0em
  body-sm:
    fontFamily: Inter
    fontSize: 0.75rem
    fontWeight: '400'
    lineHeight: 1.125rem
    letterSpacing: 0.01em
  metric-xl:
    fontFamily: JetBrains Mono
    fontSize: 2.25rem
    fontWeight: '700'
    lineHeight: 2.5rem
    letterSpacing: -0.04em
  metric-lg:
    fontFamily: JetBrains Mono
    fontSize: 1.5rem
    fontWeight: '600'
    lineHeight: 1.75rem
    letterSpacing: -0.03em
  label-md:
    fontFamily: JetBrains Mono
    fontSize: 0.75rem
    fontWeight: '500'
    lineHeight: 1rem
    letterSpacing: 0.04em
  label-sm:
    fontFamily: JetBrains Mono
    fontSize: 0.6875rem
    fontWeight: '500'
    lineHeight: 0.875rem
    letterSpacing: 0.06em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  space-3xs: 0.125rem
  space-2xs: 0.25rem
  space-xs: 0.5rem
  space-sm: 0.75rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2rem
  space-2xl: 3rem
  space-3xl: 4rem
  gutter-mobile: 1rem
  gutter-desktop: 1.5rem
  margin-mobile: 1rem
  margin-tablet: 1.5rem
  margin-desktop: 2rem
---

## Brand & Style

This design system embodies the operational precision of an advanced municipal command center merged with the visual clarity of modern enterprise data telemetry. Tailored for urban planners, mobility operators, and municipal directors, the aesthetic conveys total situational awareness, high-throughput data reliability, and executive polish.

The interface bridges technical telemetry with cinematic utility. By fusing deep obsidian surfaces with vibrant luminous signal accents, information architecture remains hyper-legible under sustained operational monitoring. Subtle glassmorphism establishes physical spatial layering without degrading data density, yielding an environment that feels mission-critical, authoritative, and decisively modern.

## Colors

The system uses a structured dark-mode palette engineered for low cognitive fatigue during 24/7 monitoring, reinforced by functional status signaling.

### Canvas & Structural Surfaces
- **Canvas Base (`#090D16`)**: The global deep void canvas.
- **Surface Level 1 (`#0D1527`)**: Structural modules, persistent side navigation, and docked panels.
- **Surface Level 2 (`#111C35`)**: Secondary groupings, filter bars, and header elements.
- **Elevated Card Surface (`#152238`)**: Primary data cards, KPI tiles, and contextual popovers, paired with an 8% translucent white rim (`rgba(255, 255, 255, 0.08)`).

### Accents & Signal Anchors
- **Primary Accent (`#06B6D4`)**: Cyber Cyan for interactive triggers, focused inputs, active tabs, and primary telemetry vectors.
- **Secondary Accent (`#14B8A6`)**: Electric Teal for supporting system telemetry, historical trends, and analytical overlays.

### Operational Threshold Signals
- **Success / Nominal (`#10B981`)**: Emerald for occupancy levels under 60%, sensor health, and steady-state flows.
- **Warning / Elevated (`#F59E0B`)**: Vibrant Amber for occupancy between 60% and 84%, impending congestion, and gateway latency.
- **Critical / Risk (`#EF4444`)**: Vivid Crimson for capacity thresholds at or above 85%, sensor failure, and emergency lockouts.

### Typography & Contrast
- **Heading Crisp (`#F8FAFC`)**: High-contrast, glare-free pure legible light for metrics, primary titles, and critical figures.
- **Body Slate (`#94A3B8`)**: Mid-tone slate for supporting descriptions, tabular metadata, and secondary reads.
- **Muted Label (`#64748B`)**: Low-contrast metadata, structural timestamps, units of measure, and axis marks.

## Typography

The typographic hierarchy balances structural scannability with numeric precision.

- **Interface Typography (`Inter`)**: Applied across all contextual headings, body descriptions, interactive triggers, and navigational components. Variable weight transitions (400 to 700) preserve clarity against high-density data visualizations.
- **Telemetry Typography (`JetBrains Mono`)**: Mandated for raw metrics, occupancy ratios, sensor readings, system timestamps, and tabular data. Tabular figures prevent layout shifting during real-time streaming updates.

Monospaced labels (`label-md`, `label-sm`) default to uppercase tracking for micro-headers, field classifications, and hardware diagnostic states.

## Layout & Spacing

The design system uses a strict 8-point spatial cadence (with 4px half-steps for dense controls) across a fluid, responsive 12-column grid.

### Screen Adaptations & Breakpoints
- **Desktop (>= 1280px)**: 12-column grid, 24px gutters, 32px safe margins. Multi-pane operations display concurrent map feeds, live data streams, and summary analytics.
- **Tablet (768px – 1279px)**: 8-column grid, 16px gutters, 24px safe margins. Side inspection docks collapse into overlays or sliding drawer sheets.
- **Mobile (<= 767px)**: 4-column grid, 16px gutters, 16px safe margins. Complex multi-metric cards stack vertically with horizontal scrollers for high-frequency telemetry.

Grid layouts prioritize dashboard card modularity: cards conform to spans of 3, 4, 6, or 12 columns to guarantee structured visual alignment across varied screen resolutions.

## Elevation & Depth

Visual hierarchy is maintained via surface luminance, translucent borders, and soft atmospheric backdrops rather than conventional high-contrast drop shadows.

- **Base Layer (Elevation 0)**: Unadorned canvas `#090D16`. Used strictly as the layout foundation.
- **Mid-Tier Docking (Elevation 1)**: Flat `#0D1527` with a subtle 1px border (`rgba(255, 255, 255, 0.05)`). Designed for static panels and navigational chrome.
- **Standard Card (Elevation 2)**: Background set to `#152238` with `backdrop-filter: blur(16px)` and a crisp perimeter highlight of `1px solid rgba(255, 255, 255, 0.08)`. Shadow: `0 8px 32px -4px rgba(0, 0, 0, 0.45)`.
- **Hover & Interacting Card**: Elevates border contrast to `rgba(6, 182, 212, 0.35)` with an ambient cyan glow: `0 0 24px -4px rgba(6, 182, 212, 0.20), 0 12px 40px -8px rgba(0, 0, 0, 0.6)`.
- **Floating Modals & Flyouts (Elevation 3)**: Background set to `#111C35` at 90% opacity, bordered by `rgba(255, 255, 255, 0.14)`, cast over a `rgba(9, 13, 22, 0.80)` backdrop blur. Shadow: `0 24px 64px -12px rgba(0, 0, 0, 0.8)`.

## Shapes

The design uses a rounded aesthetic calibrated to soften dense data presentation while maintaining a clean, technical frame.

- **Main Dashboard Cards**: Built with `16px` border radii (scale allowance: `14px` to `18px`). This curve anchors large data grids and map viewports.
- **Controls, Action Items, & Form Fields**: Fixed at `8px` to `10px` radii to preserve space efficiency and sharp focus boundaries.
- **Status Badges & Micro Tags**: Styled with `8px` roundedness or full capsule geometry for distinct category tagging.
- **Interactive Icon Containers**: Styled with matching `8px` radii for uniform tactile targets.

## Components

### Buttons
- **Primary**: Solid background `#06B6D4` with text `#090D16` (`font-weight: 600`). On hover, transition to `#14B8A6` with an outer soft cyan bloom (`box-shadow: 0 0 16px rgba(6, 182, 212, 0.35)`). Active state applies a slight scale step (`0.98`).
- **Secondary / Ghost**: Semi-transparent background `rgba(21, 34, 56, 0.6)` with a 1px `rgba(255, 255, 255, 0.1)` boundary and `#F8FAFC` label. Hover transitions the stroke to `rgba(6, 182, 212, 0.4)`.

### Cards & Container Panels
- Primary telemetry units use `#152238` with `16px` corner rounding, wrapped in a 1px border of `rgba(255, 255, 255, 0.08)`.
- Standard padding follows a 24px internal inset (`space-lg`), reducing to 16px (`space-md`) on mobile viewports.
- Header bars within cards run with distinct bottoms: 1px divider lines composed of `rgba(255, 255, 255, 0.04)`.

### Chips & Badges
- **Nominal / Open (<60%)**: Background `rgba(16, 185, 129, 0.12)`, border `rgba(16, 185, 129, 0.3)`, text `#10B981`. Includes an optional 6px pulsing emerald indicator dot.
- **Warning / Moderate (60%–84%)**: Background `rgba(245, 158, 11, 0.12)`, border `rgba(245, 158, 11, 0.3)`, text `#F59E0B`.
- **Critical / At Capacity (>=85%)**: Background `rgba(239, 68, 68, 0.15)`, border `rgba(239, 68, 68, 0.4)`, text `#EF4444`. Accompanied by a 2-second glowing strobe animation on critical operational pages.

### Inputs & Selectors
- Container fills leverage `#0D1527` with an inset boundary of `rgba(255, 255, 255, 0.1)`. Height matches 40px for dense telemetry filters, 48px for global searches.
- Focused inputs illuminate with a 1px `#06B6D4` border and a localized focus ring of `0 0 0 3px rgba(6, 182, 212, 0.2)`.
- Placeholder values rely on `#64748B`, switching to `#F8FAFC` upon entry.

### Checkboxes & Radio Elements
- Base box dimensions run at 18x18px with `4px` corner radii on checkboxes and circular form on radios. Base color is `#0D1527` with an inactive border of `rgba(255, 255, 255, 0.2)`.
- Checked states transition instantly to `#06B6D4` fill carrying `#090D16` indicator iconography.

### Data Tables & Telemetry Lists
- Table headers use monospaced uppercase typography (`label-sm`), styled with `#64748B` text, `0.75rem` vertical padding, and a persistent bottom rule of `rgba(255, 255, 255, 0.08)`.
- Alternating row zebra-striping is forbidden; depth separation relies instead on clean hover transitions: table rows shift backplate color to `rgba(255, 255, 255, 0.03)` on hover.
- Live metric cells feature right-aligned `JetBrains Mono` figures paired with fractional micro-bars visualizing delta variance.

### Specialized Elements: Telemetry Gauge & Capacity Meter
- Segmented linear tracks rendered in `rgba(255, 255, 255, 0.06)` base fills.
- Progressive capacity fills transition dynamically across thresholds: Emerald (<60%), Amber (60%–84%), and Crimson (>=85%) with a softened trailing gradient cap.