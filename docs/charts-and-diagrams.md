# Charts & Diagrams — Authoring Reference

This resource provides **copy-paste ready SVG and HTML templates** for every chart and diagram type supported in Pengui Slides print-mode pages. All templates use soul CSS tokens exclusively — no literal hex values, no hardcoded pixel sizes in styling rules. Swap your data in, keep the `var(--token)` references, and the result integrates seamlessly with any approved Design Soul.

---

## Token Quick-Reference

| Token | Usage |
|---|---|
| `var(--color-canvas)` | Page background |
| `var(--color-surface)` | Card / container background |
| `var(--color-border)` | Axis lines, grid lines, node strokes |
| `var(--color-text-primary)` | Main labels |
| `var(--color-text-secondary)` | Sub-labels, value annotations |
| `var(--color-text-tertiary)` | Axis tick labels, captions |
| `var(--color-accent-primary)` | Primary data series, highlights |
| `var(--color-accent-secondary)` | Secondary series |
| `var(--color-accent-warm)` | Tertiary series or warm emphasis |
| `var(--color-category-a)` | Category A nodes (pastel, soul-derived) |
| `var(--color-category-a-tint)` | Category A leaf nodes (paler tint) |
| `var(--color-category-b/c/d)` | Category B/C/D nodes |
| `var(--color-category-b/c/d-tint)` | Category B/C/D leaf tints |
| `var(--color-success/warning/error/info)` | Semantic chart fills |
| `var(--text-h3)` | Node/bar title font-size |
| `var(--text-caption)` | Axis labels, subtitles, legend text |
| `var(--font-display)` | Bold heading font |
| `var(--font-mono)` | Numeric / code labels |
| `var(--font-body)` | Body and legend text |
| `var(--weight-bold)` | Title weight |
| `var(--border-width)` | SVG stroke-width |
| `var(--radius-sm)` | Leaf node corner radius |
| `var(--radius-md)` | Category node corner radius |

> **Rule:** Every `fill`, `stroke`, and `font-size` on a shape or text element must reference a `var(--token)`. The exception is `viewBox`, SVG transform matrices, and geometry coordinates — these are layout, not styling.

---

## 1. Tree / Mind-Map Diagram (Flagship)

### When to use

Use a horizontal tree for hierarchies: topic → subtopics → details. Ideal for concept maps, subject breakdowns, org charts, and taxonomy visualisations.

### Layout

```
[Root] ──┬── [Category A] ──┬── [Leaf A1]
         │                  └── [Leaf A2]
         ├── [Category B] ──┬── [Leaf B1]
         │                  └── [Leaf B2]
         ├── [Category C] ──┬── [Leaf C1]
         │                  └── [Leaf C2]
         └── [Category D] ──┬── [Leaf D1]
                            └── [Leaf D2]
```

Flows left-to-right. Connectors are orthogonal right-angle paths (no diagonals). Category nodes have their own pastel color family from `--color-category-a/b/c/d`; leaf nodes use the paler `*-tint` variant.

### Template

```html
<svg viewBox="0 0 1040 800" xmlns="http://www.w3.org/2000/svg"
     aria-label="Horizontal tree diagram" role="img">
  <style>
    .connector  { stroke: var(--color-border); stroke-width: var(--border-width); fill: none; }
    .node-root  { fill: var(--color-surface-alt); stroke: var(--color-border); stroke-width: var(--border-width); }
    .cat-a      { fill: var(--color-category-a);      stroke: var(--color-border); stroke-width: var(--border-width); }
    .cat-b      { fill: var(--color-category-b);      stroke: var(--color-border); stroke-width: var(--border-width); }
    .cat-c      { fill: var(--color-category-c);      stroke: var(--color-border); stroke-width: var(--border-width); }
    .cat-d      { fill: var(--color-category-d);      stroke: var(--color-border); stroke-width: var(--border-width); }
    .leaf-a     { fill: var(--color-category-a-tint); stroke: var(--color-border); stroke-width: var(--border-width); }
    .leaf-b     { fill: var(--color-category-b-tint); stroke: var(--color-border); stroke-width: var(--border-width); }
    .leaf-c     { fill: var(--color-category-c-tint); stroke: var(--color-border); stroke-width: var(--border-width); }
    .leaf-d     { fill: var(--color-category-d-tint); stroke: var(--color-border); stroke-width: var(--border-width); }
    .node-title    { font-family: var(--font-display); font-size: var(--text-h3); font-weight: var(--weight-bold); fill: var(--color-text-primary); }
    .node-subtitle { font-family: var(--font-body); font-size: var(--text-caption); font-style: italic; fill: var(--color-text-secondary); }
  </style>

  <!-- CONNECTORS — drawn first (behind nodes) -->
  <!-- Root (centre y=400) → Categories -->
  <path class="connector" d="M 200,400 H 220 V 100 H 240" />  <!-- → Cat A y=100 -->
  <path class="connector" d="M 200,400 H 220 V 300 H 240" />  <!-- → Cat B y=300 -->
  <path class="connector" d="M 200,400 H 220 V 500 H 240" />  <!-- → Cat C y=500 -->
  <path class="connector" d="M 200,400 H 220 V 700 H 240" />  <!-- → Cat D y=700 -->
  <!-- Category A → Leaves -->
  <path class="connector" d="M 440,100 H 500 V  60 H 540" />
  <path class="connector" d="M 440,100 H 500 V 140 H 540" />
  <!-- Category B → Leaves -->
  <path class="connector" d="M 440,300 H 500 V 260 H 540" />
  <path class="connector" d="M 440,300 H 500 V 340 H 540" />
  <!-- Category C → Leaves -->
  <path class="connector" d="M 440,500 H 500 V 460 H 540" />
  <path class="connector" d="M 440,500 H 500 V 540 H 540" />
  <!-- Category D → Leaves -->
  <path class="connector" d="M 440,700 H 500 V 660 H 540" />
  <path class="connector" d="M 440,700 H 500 V 740 H 540" />

  <!-- ROOT NODE — x 40–200, centred y=400, h=80 -->
  <g transform="translate(40, 360)">
    <rect class="node-root" x="0" y="0" width="160" height="80" rx="14" />
    <text class="node-title"    x="80" y="35" text-anchor="middle" dominant-baseline="middle">Root Topic</text>
    <text class="node-subtitle" x="80" y="58" text-anchor="middle">Core concept</text>
  </g>

  <!-- CATEGORY NODES — x 240–440, h=80 -->
  <g transform="translate(240,  60)"><rect class="cat-a" x="0" y="0" width="200" height="80" rx="14" /><text class="node-title" x="100" y="35" text-anchor="middle" dominant-baseline="middle">Category A</text><text class="node-subtitle" x="100" y="58" text-anchor="middle">Descriptor</text></g>
  <g transform="translate(240, 260)"><rect class="cat-b" x="0" y="0" width="200" height="80" rx="14" /><text class="node-title" x="100" y="35" text-anchor="middle" dominant-baseline="middle">Category B</text><text class="node-subtitle" x="100" y="58" text-anchor="middle">Descriptor</text></g>
  <g transform="translate(240, 460)"><rect class="cat-c" x="0" y="0" width="200" height="80" rx="14" /><text class="node-title" x="100" y="35" text-anchor="middle" dominant-baseline="middle">Category C</text><text class="node-subtitle" x="100" y="58" text-anchor="middle">Descriptor</text></g>
  <g transform="translate(240, 660)"><rect class="cat-d" x="0" y="0" width="200" height="80" rx="14" /><text class="node-title" x="100" y="35" text-anchor="middle" dominant-baseline="middle">Category D</text><text class="node-subtitle" x="100" y="58" text-anchor="middle">Descriptor</text></g>

  <!-- LEAF NODES — x 540–860, h=60 -->
  <g transform="translate(540,  30)"><rect class="leaf-a" x="0" y="0" width="300" height="60" rx="10" /><text class="node-title" x="150" y="26" text-anchor="middle" dominant-baseline="middle">Sub-topic A1</text><text class="node-subtitle" x="150" y="45" text-anchor="middle">Detail or example</text></g>
  <g transform="translate(540, 110)"><rect class="leaf-a" x="0" y="0" width="300" height="60" rx="10" /><text class="node-title" x="150" y="26" text-anchor="middle" dominant-baseline="middle">Sub-topic A2</text><text class="node-subtitle" x="150" y="45" text-anchor="middle">Detail or example</text></g>
  <g transform="translate(540, 230)"><rect class="leaf-b" x="0" y="0" width="300" height="60" rx="10" /><text class="node-title" x="150" y="26" text-anchor="middle" dominant-baseline="middle">Sub-topic B1</text><text class="node-subtitle" x="150" y="45" text-anchor="middle">Detail or example</text></g>
  <g transform="translate(540, 310)"><rect class="leaf-b" x="0" y="0" width="300" height="60" rx="10" /><text class="node-title" x="150" y="26" text-anchor="middle" dominant-baseline="middle">Sub-topic B2</text><text class="node-subtitle" x="150" y="45" text-anchor="middle">Detail or example</text></g>
  <g transform="translate(540, 430)"><rect class="leaf-c" x="0" y="0" width="300" height="60" rx="10" /><text class="node-title" x="150" y="26" text-anchor="middle" dominant-baseline="middle">Sub-topic C1</text><text class="node-subtitle" x="150" y="45" text-anchor="middle">Detail or example</text></g>
  <g transform="translate(540, 510)"><rect class="leaf-c" x="0" y="0" width="300" height="60" rx="10" /><text class="node-title" x="150" y="26" text-anchor="middle" dominant-baseline="middle">Sub-topic C2</text><text class="node-subtitle" x="150" y="45" text-anchor="middle">Detail or example</text></g>
  <g transform="translate(540, 630)"><rect class="leaf-d" x="0" y="0" width="300" height="60" rx="10" /><text class="node-title" x="150" y="26" text-anchor="middle" dominant-baseline="middle">Sub-topic D1</text><text class="node-subtitle" x="150" y="45" text-anchor="middle">Detail or example</text></g>
  <g transform="translate(540, 710)"><rect class="leaf-d" x="0" y="0" width="300" height="60" rx="10" /><text class="node-title" x="150" y="26" text-anchor="middle" dominant-baseline="middle">Sub-topic D2</text><text class="node-subtitle" x="150" y="45" text-anchor="middle">Detail or example</text></g>
</svg>
```

**How to adapt:**
- Replace all label text in `<text class="node-title">` and `<text class="node-subtitle">` elements.
- Add or remove category/leaf groups. For 3 categories, remove the Cat D `<g>` blocks and their connector `<path>` elements. Rebalance the Y coordinates so categories remain evenly spaced (800px / N categories).
- For more leaves per category, extend the connector fan pattern and add more leaf `<g>` blocks.
- Never change the fill/stroke to a literal hex — always use a `var(--color-*)` token.

---

## 2. Flow Diagram

### When to use

Sequential processes where order matters: A → B → C → D. Good for workflows, decision pipelines, and step-by-step procedures.

### Template

```html
<svg viewBox="0 0 860 240" xmlns="http://www.w3.org/2000/svg"
     aria-label="Four-step flow diagram" role="img">
  <style>
    .flow-node    { fill: var(--color-surface); stroke: var(--color-border); stroke-width: var(--border-width); }
    .flow-node-hl { fill: var(--color-category-a); stroke: var(--color-border); stroke-width: var(--border-width); }
    .flow-arrow   { stroke: var(--color-border); stroke-width: var(--border-width); fill: none; marker-end: url(#arrow); }
    .node-label   { font-family: var(--font-display); font-size: var(--text-h3); font-weight: var(--weight-bold); fill: var(--color-text-primary); }
    .node-sub     { font-family: var(--font-body); font-size: var(--text-caption); font-style: italic; fill: var(--color-text-secondary); }
    .step-num     { font-family: var(--font-mono); font-size: var(--text-caption); fill: var(--color-accent-primary); font-weight: 700; }
  </style>
  <defs>
    <marker id="arrow" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
      <polygon points="0 0, 10 3.5, 0 7" fill="var(--color-border)" />
    </marker>
  </defs>

  <!-- Step connectors (drawn first) -->
  <line class="flow-arrow" x1="190" y1="120" x2="220" y2="120" />
  <line class="flow-arrow" x1="400" y1="120" x2="430" y2="120" />
  <line class="flow-arrow" x1="610" y1="120" x2="640" y2="120" />

  <!-- Step 1 -->
  <g transform="translate(20, 60)">
    <rect class="flow-node-hl" x="0" y="0" width="170" height="120" rx="14" />
    <text class="step-num"   x="85" y="28" text-anchor="middle">01</text>
    <text class="node-label" x="85" y="65" text-anchor="middle" dominant-baseline="middle">Step One</text>
    <text class="node-sub"   x="85" y="95" text-anchor="middle">Brief description</text>
  </g>

  <!-- Step 2 -->
  <g transform="translate(230, 60)">
    <rect class="flow-node" x="0" y="0" width="170" height="120" rx="14" />
    <text class="step-num"   x="85" y="28" text-anchor="middle">02</text>
    <text class="node-label" x="85" y="65" text-anchor="middle" dominant-baseline="middle">Step Two</text>
    <text class="node-sub"   x="85" y="95" text-anchor="middle">Brief description</text>
  </g>

  <!-- Step 3 -->
  <g transform="translate(440, 60)">
    <rect class="flow-node" x="0" y="0" width="170" height="120" rx="14" />
    <text class="step-num"   x="85" y="28" text-anchor="middle">03</text>
    <text class="node-label" x="85" y="65" text-anchor="middle" dominant-baseline="middle">Step Three</text>
    <text class="node-sub"   x="85" y="95" text-anchor="middle">Brief description</text>
  </g>

  <!-- Step 4 -->
  <g transform="translate(650, 60)">
    <rect class="flow-node" x="0" y="0" width="170" height="120" rx="14" />
    <text class="step-num"   x="85" y="28" text-anchor="middle">04</text>
    <text class="node-label" x="85" y="65" text-anchor="middle" dominant-baseline="middle">Step Four</text>
    <text class="node-sub"   x="85" y="95" text-anchor="middle">Brief description</text>
  </g>
</svg>
```

**How to adapt:**
- Add steps by extending the viewBox width by 210px per step and adding another `<g>` + connector.
- Highlight a specific step by replacing `flow-node` with `flow-node-hl` on that group's `<rect>`.
- For optional branches, add a vertical connector `M x,180 V 220 H x2 V 180` from a decision node.

---

## 3. Bar Chart (Vertical)

### When to use

Compare magnitudes across categories. Use vertical orientation when category names are short. 3–8 bars recommended.

### Template

```html
<!--
  Y scale: 0–100, each unit = 3.6px (chart height 360px)
  Chart area: x 60–860, y 20–380 (baseline y=380)
  5 bars, width=100, gap=60: centres at x 130,270,410,550,690
  Bar formula: height = value * 3.6; y = 380 - height
-->
<svg viewBox="0 0 920 460" xmlns="http://www.w3.org/2000/svg"
     aria-label="Vertical bar chart" role="img">
  <style>
    .chart-axis   { stroke: var(--color-border); stroke-width: var(--border-width); }
    .chart-grid   { stroke: var(--color-border); stroke-width: var(--border-width); stroke-dasharray: 4 4; opacity: 0.6; }
    .axis-label   { font-family: var(--font-mono); font-size: var(--text-caption); fill: var(--color-text-tertiary); }
    .value-label  { font-family: var(--font-mono); font-size: var(--text-caption); fill: var(--color-text-secondary); font-weight: 700; }
    .legend-label { font-family: var(--font-body); font-size: var(--text-caption); fill: var(--color-text-secondary); }
    .bar-1 { fill: var(--color-category-a); }
    .bar-2 { fill: var(--color-category-b); }
    .bar-3 { fill: var(--color-category-c); }
    .bar-4 { fill: var(--color-category-d); }
    .bar-5 { fill: var(--color-accent-primary); }
  </style>

  <!-- Gridlines -->
  <line class="chart-grid" x1="60" y1="290" x2="860" y2="290" /> <!-- 25 -->
  <line class="chart-grid" x1="60" y1="200" x2="860" y2="200" /> <!-- 50 -->
  <line class="chart-grid" x1="60" y1="110" x2="860" y2="110" /> <!-- 75 -->
  <line class="chart-grid" x1="60" y1=" 20" x2="860" y2=" 20" /> <!-- 100 -->

  <!-- Axes -->
  <line class="chart-axis" x1="60" y1="20"  x2="60"  y2="380" />
  <line class="chart-axis" x1="60" y1="380" x2="860" y2="380" />

  <!-- Y axis labels -->
  <text class="axis-label" x="52" y="384" text-anchor="end">0</text>
  <text class="axis-label" x="52" y="294" text-anchor="end">25</text>
  <text class="axis-label" x="52" y="204" text-anchor="end">50</text>
  <text class="axis-label" x="52" y="114" text-anchor="end">75</text>
  <text class="axis-label" x="52" y=" 24" text-anchor="end">100</text>

  <!-- Bars — height = value * 3.6, y = 380 - height -->
  <rect class="bar-1" x=" 80" y=" 84" width="100" height="296" rx="4" /> <!-- 82% -->
  <text class="value-label" x="130" y=" 74" text-anchor="middle">82%</text>
  <text class="axis-label"  x="130" y="400" text-anchor="middle">Alpha</text>

  <rect class="bar-2" x="220" y="149" width="100" height="231" rx="4" /> <!-- 64% -->
  <text class="value-label" x="270" y="139" text-anchor="middle">64%</text>
  <text class="axis-label"  x="270" y="400" text-anchor="middle">Beta</text>

  <rect class="bar-3" x="360" y=" 52" width="100" height="328" rx="4" /> <!-- 91% -->
  <text class="value-label" x="410" y=" 42" text-anchor="middle">91%</text>
  <text class="axis-label"  x="410" y="400" text-anchor="middle">Gamma</text>

  <rect class="bar-4" x="500" y="211" width="100" height="169" rx="4" /> <!-- 47% -->
  <text class="value-label" x="550" y="201" text-anchor="middle">47%</text>
  <text class="axis-label"  x="550" y="400" text-anchor="middle">Delta</text>

  <rect class="bar-5" x="640" y="117" width="100" height="263" rx="4" /> <!-- 73% -->
  <text class="value-label" x="690" y="107" text-anchor="middle">73%</text>
  <text class="axis-label"  x="690" y="400" text-anchor="middle">Epsilon</text>

  <!-- Legend (required) -->
  <g class="legend" transform="translate(60, 425)">
    <rect class="bar-1" x="0"   y="0" width="12" height="12" rx="2" /><text class="legend-label" x="18" y="11">Alpha</text>
    <rect class="bar-2" x="80"  y="0" width="12" height="12" rx="2" /><text class="legend-label" x="98" y="11">Beta</text>
    <rect class="bar-3" x="160" y="0" width="12" height="12" rx="2" /><text class="legend-label" x="178" y="11">Gamma</text>
    <rect class="bar-4" x="250" y="0" width="12" height="12" rx="2" /><text class="legend-label" x="268" y="11">Delta</text>
    <rect class="bar-5" x="336" y="0" width="12" height="12" rx="2" /><text class="legend-label" x="354" y="11">Epsilon</text>
  </g>
</svg>
```

---

## 4. Horizontal Bar Chart

### When to use

Prefer horizontal bars when category names are long, when you have many categories (6–12), or when you are ranking items.

### Template

```html
<!--
  X scale: 0–100 maps to x 160–860 (700px wide)
  8 bars, height=40, gap=20: first bar top at y=20
  Bar formula: width = value * 7; x start = 160
-->
<svg viewBox="0 0 920 420" xmlns="http://www.w3.org/2000/svg"
     aria-label="Horizontal bar chart" role="img">
  <style>
    .chart-axis   { stroke: var(--color-border); stroke-width: var(--border-width); }
    .chart-grid   { stroke: var(--color-border); stroke-width: var(--border-width); stroke-dasharray: 4 4; opacity: 0.6; }
    .axis-label   { font-family: var(--font-mono); font-size: var(--text-caption); fill: var(--color-text-tertiary); }
    .cat-label    { font-family: var(--font-body);  font-size: var(--text-caption); fill: var(--color-text-primary); }
    .value-label  { font-family: var(--font-mono);  font-size: var(--text-caption); fill: var(--color-text-secondary); font-weight: 700; }
    .h-bar { fill: var(--color-category-a); }
  </style>

  <!-- Vertical gridlines at 25/50/75/100 -->
  <line class="chart-grid" x1="335" y1="0" x2="335" y2="380" /> <!-- 25 -->
  <line class="chart-grid" x1="510" y1="0" x2="510" y2="380" /> <!-- 50 -->
  <line class="chart-grid" x1="685" y1="0" x2="685" y2="380" /> <!-- 75 -->
  <line class="chart-grid" x1="860" y1="0" x2="860" y2="380" /> <!-- 100 -->

  <!-- Axes -->
  <line class="chart-axis" x1="160" y1="0"   x2="160" y2="380" />
  <line class="chart-axis" x1="160" y1="380" x2="860" y2="380" />

  <!-- X axis labels -->
  <text class="axis-label" x="160" y="398" text-anchor="middle">0</text>
  <text class="axis-label" x="335" y="398" text-anchor="middle">25</text>
  <text class="axis-label" x="510" y="398" text-anchor="middle">50</text>
  <text class="axis-label" x="685" y="398" text-anchor="middle">75</text>
  <text class="axis-label" x="860" y="398" text-anchor="middle">100</text>

  <!-- Bars — y increments by 60px per bar (40 bar + 20 gap) -->
  <!-- Bar 1: 82% → width=574 -->
  <rect class="h-bar" x="160" y=" 20" width="574" height="40" rx="4" />
  <text class="cat-label"   x="150" y=" 45" text-anchor="end">Category A</text>
  <text class="value-label" x="744" y=" 45">82%</text>

  <!-- Bar 2: 64% → width=448 -->
  <rect class="h-bar" x="160" y=" 80" width="448" height="40" rx="4" />
  <text class="cat-label"   x="150" y="105" text-anchor="end">Category B</text>
  <text class="value-label" x="618" y="105">64%</text>

  <!-- Bar 3: 91% → width=637 -->
  <rect class="h-bar" x="160" y="140" width="637" height="40" rx="4" />
  <text class="cat-label"   x="150" y="165" text-anchor="end">Category C</text>
  <text class="value-label" x="807" y="165">91%</text>

  <!-- Bar 4: 47% → width=329 -->
  <rect class="h-bar" x="160" y="200" width="329" height="40" rx="4" />
  <text class="cat-label"   x="150" y="225" text-anchor="end">Category D</text>
  <text class="value-label" x="499" y="225">47%</text>

  <!-- Bar 5: 73% → width=511 -->
  <rect class="h-bar" x="160" y="260" width="511" height="40" rx="4" />
  <text class="cat-label"   x="150" y="285" text-anchor="end">Category E</text>
  <text class="value-label" x="681" y="285">73%</text>

  <!-- Legend -->
  <g class="legend" transform="translate(160, 408)">
    <rect class="h-bar" x="0" y="0" width="12" height="12" rx="2" />
    <text style="font-family: var(--font-body); font-size: var(--text-caption); fill: var(--color-text-secondary);" x="18" y="11">Value (%)</text>
  </g>
</svg>
```

---

## 5. Line Chart

### When to use

Trends over time or continuous relationships between two variables. Up to 2 series recommended for readability.

### Template

```html
<!--
  Chart area: x 60–860, y 20–380 (800×360px)
  X axis: 6 time periods, evenly at x 60,220,380,540,700,860
  Y scale: 0–100, each unit = 3.6px. baseline y=380.
  Point formula: cy = 380 - value * 3.6
-->
<svg viewBox="0 0 920 460" xmlns="http://www.w3.org/2000/svg"
     aria-label="Line chart — two data series" role="img">
  <style>
    .chart-axis    { stroke: var(--color-border); stroke-width: var(--border-width); }
    .chart-grid    { stroke: var(--color-border); stroke-width: var(--border-width); stroke-dasharray: 4 4; opacity: 0.6; }
    .axis-label    { font-family: var(--font-mono); font-size: var(--text-caption); fill: var(--color-text-tertiary); }
    .series-1-line { stroke: var(--color-accent-primary);   stroke-width: 2; fill: none; }
    .series-2-line { stroke: var(--color-accent-secondary); stroke-width: 2; fill: none; stroke-dasharray: 6 3; }
    .series-1-dot  { fill: var(--color-accent-primary);   stroke: var(--color-surface); stroke-width: 2; }
    .series-2-dot  { fill: var(--color-accent-secondary); stroke: var(--color-surface); stroke-width: 2; }
    .legend-label  { font-family: var(--font-body); font-size: var(--text-caption); fill: var(--color-text-secondary); }
  </style>

  <!-- Gridlines -->
  <line class="chart-grid" x1="60" y1="290" x2="860" y2="290" />
  <line class="chart-grid" x1="60" y1="200" x2="860" y2="200" />
  <line class="chart-grid" x1="60" y1="110" x2="860" y2="110" />
  <line class="chart-grid" x1="60" y1=" 20" x2="860" y2=" 20" />

  <!-- Axes -->
  <line class="chart-axis" x1="60" y1="20"  x2="60"  y2="380" />
  <line class="chart-axis" x1="60" y1="380" x2="860" y2="380" />

  <!-- Y labels -->
  <text class="axis-label" x="52" y="384" text-anchor="end">0</text>
  <text class="axis-label" x="52" y="294" text-anchor="end">25</text>
  <text class="axis-label" x="52" y="204" text-anchor="end">50</text>
  <text class="axis-label" x="52" y="114" text-anchor="end">75</text>
  <text class="axis-label" x="52" y=" 24" text-anchor="end">100</text>

  <!-- X labels -->
  <text class="axis-label" x=" 60" y="400" text-anchor="middle">Jan</text>
  <text class="axis-label" x="220" y="400" text-anchor="middle">Feb</text>
  <text class="axis-label" x="380" y="400" text-anchor="middle">Mar</text>
  <text class="axis-label" x="540" y="400" text-anchor="middle">Apr</text>
  <text class="axis-label" x="700" y="400" text-anchor="middle">May</text>
  <text class="axis-label" x="860" y="400" text-anchor="middle">Jun</text>

  <!-- Series 1 line (values: 45, 58, 72, 65, 80, 88) -->
  <polyline class="series-1-line"
    points="60,218 220,171 380,121 540,146 700,92 860,63" />
  <circle class="series-1-dot" cx=" 60" cy="218" r="5" />
  <circle class="series-1-dot" cx="220" cy="171" r="5" />
  <circle class="series-1-dot" cx="380" cy="121" r="5" />
  <circle class="series-1-dot" cx="540" cy="146" r="5" />
  <circle class="series-1-dot" cx="700" cy=" 92" r="5" />
  <circle class="series-1-dot" cx="860" cy=" 63" r="5" />

  <!-- Series 2 line (values: 30, 42, 55, 48, 60, 70) -->
  <polyline class="series-2-line"
    points="60,272 220,229 380,182 540,207 700,164 860,128" />
  <circle class="series-2-dot" cx=" 60" cy="272" r="5" />
  <circle class="series-2-dot" cx="220" cy="229" r="5" />
  <circle class="series-2-dot" cx="380" cy="182" r="5" />
  <circle class="series-2-dot" cx="540" cy="207" r="5" />
  <circle class="series-2-dot" cx="700" cy="164" r="5" />
  <circle class="series-2-dot" cx="860" cy="128" r="5" />

  <!-- Legend -->
  <g class="legend" transform="translate(60, 430)">
    <line x1="0" y1="6" x2="24" y2="6" stroke="var(--color-accent-primary)"   stroke-width="2" />
    <circle cx="12" cy="6" r="4" fill="var(--color-accent-primary)" />
    <text class="legend-label" x="32" y="11">Series A</text>

    <line x1="120" y1="6" x2="144" y2="6" stroke="var(--color-accent-secondary)" stroke-width="2" stroke-dasharray="6 3" />
    <circle cx="132" cy="6" r="4" fill="var(--color-accent-secondary)" />
    <text class="legend-label" x="152" y="11">Series B</text>
  </g>
</svg>
```

**How to adapt:** Replace the `points` attribute values on `<polyline>` using the formula `cy = 380 - value * 3.6`. Update X-axis labels for your time periods.

---

## 6. Pie Chart

### When to use

Part-to-whole relationships with 3–8 slices. Each slice gets a distinct soul color token. Always include a legend.

### Template

```html
<!--
  Centre: cx=280, cy=220, r=200
  Slice angles computed from percentages (clockwise from top):
    A: 30% → 108°
    B: 25% → 90°
    C: 20% → 72°
    D: 15% → 54°
    E: 10% → 36°
  Arc formula in SVG:
    startAngle → endAngle (degrees, 0 = top, clockwise)
    x = cx + r * sin(angle_rad)
    y = cy - r * cos(angle_rad)
    large-arc-flag = 1 if angle > 180° else 0
-->
<svg viewBox="0 0 820 460" xmlns="http://www.w3.org/2000/svg"
     aria-label="Pie chart: five slices" role="img">
  <style>
    .slice-a { fill: var(--color-category-a); stroke: var(--color-surface); stroke-width: 2; }
    .slice-b { fill: var(--color-category-b); stroke: var(--color-surface); stroke-width: 2; }
    .slice-c { fill: var(--color-category-c); stroke: var(--color-surface); stroke-width: 2; }
    .slice-d { fill: var(--color-category-d); stroke: var(--color-surface); stroke-width: 2; }
    .slice-e { fill: var(--color-accent-primary); stroke: var(--color-surface); stroke-width: 2; }
    .pct-label  { font-family: var(--font-mono); font-size: var(--text-caption); font-weight: 700; fill: var(--color-text-primary); }
    .legend-label { font-family: var(--font-body); font-size: var(--text-caption); fill: var(--color-text-secondary); }
  </style>

  <!--
    Pre-computed slice paths (r=200, centre=280,220):
    A: 0°–108°   (30%)
    B: 108°–198° (25%)
    C: 198°–270° (20%)
    D: 270°–324° (15%)
    E: 324°–360° (10%)
  -->
  <!-- Slice A: 0→108° -->
  <path class="slice-a" d="M280,220 L280,20 A200,200 0 0,1 470.3,350.4 Z" />
  <!-- Slice B: 108→198° -->
  <path class="slice-b" d="M280,220 L470.3,350.4 A200,200 0 0,1 89.7,282.2 Z" />
  <!-- Slice C: 198→270° -->
  <path class="slice-c" d="M280,220 L89.7,282.2 A200,200 0 0,1 80,220 Z" />
  <!-- Slice D: 270→324° -->
  <path class="slice-d" d="M280,220 L80,220 A200,200 0 0,1 161.7,55.4 Z" />
  <!-- Slice E: 324→360° -->
  <path class="slice-e" d="M280,220 L161.7,55.4 A200,200 0 0,1 280,20 Z" />

  <!-- Percentage labels at slice midpoints (r≈130 from centre) -->
  <text class="pct-label" x="320" y="150" text-anchor="middle">30%</text>
  <text class="pct-label" x="360" y="295" text-anchor="middle">25%</text>
  <text class="pct-label" x="160" y="310" text-anchor="middle">20%</text>
  <text class="pct-label" x="145" y="190" text-anchor="middle">15%</text>
  <text class="pct-label" x="215" y="100" text-anchor="middle">10%</text>

  <!-- Legend -->
  <g class="legend" transform="translate(510, 100)">
    <rect class="slice-a" x="0"  y="0"   width="14" height="14" rx="2" /><text class="legend-label" x="22" y="12">Category A — 30%</text>
    <rect class="slice-b" x="0"  y="30"  width="14" height="14" rx="2" /><text class="legend-label" x="22" y="42">Category B — 25%</text>
    <rect class="slice-c" x="0"  y="60"  width="14" height="14" rx="2" /><text class="legend-label" x="22" y="72">Category C — 20%</text>
    <rect class="slice-d" x="0"  y="90"  width="14" height="14" rx="2" /><text class="legend-label" x="22" y="102">Category D — 15%</text>
    <rect class="slice-e" x="0"  y="120" width="14" height="14" rx="2" /><text class="legend-label" x="22" y="132">Category E — 10%</text>
  </g>
</svg>
```

**How to adapt:** Recompute arc paths using the formula: `x = cx + r × sin(angle_rad)`, `y = cy − r × cos(angle_rad)`. Update percentage labels and legend text. A calculator or the LLM can compute the paths for you; provide the values and ask for updated `d=` attributes.

---

## 7. Comparison Matrix

### When to use

Side-by-side feature/property comparison of two or more items. Use an HTML table (not SVG) for this pattern — it's more readable and semantically appropriate.

### Template

```html
<style>
  .matrix-table {
    width: 100%;
    border-collapse: collapse;
    font-family: var(--font-body);
    font-size: var(--text-caption);
    color: var(--color-text-primary);
  }
  .matrix-table th {
    background: var(--color-surface-alt);
    color: var(--color-text-primary);
    font-family: var(--font-display);
    font-size: var(--text-h3);
    font-weight: var(--weight-bold);
    padding: var(--space-md) var(--space-lg);
    border-bottom: var(--border-width) solid var(--color-border);
    text-align: left;
  }
  .matrix-table th:first-child {
    width: 35%;
    color: var(--color-text-secondary);
    font-size: var(--text-caption);
    font-family: var(--font-mono);
    text-transform: uppercase;
    letter-spacing: var(--letter-spacing-heading);
  }
  .matrix-table th.col-highlight {
    background: var(--color-category-a);
  }
  .matrix-table td {
    padding: var(--space-sm) var(--space-lg);
    border-bottom: var(--border-width) solid var(--color-border);
    vertical-align: top;
    line-height: var(--leading-body);
  }
  .matrix-table td:first-child {
    font-family: var(--font-body);
    font-weight: var(--weight-medium);
    color: var(--color-text-secondary);
    font-size: var(--text-caption);
  }
  .matrix-table tr:last-child td { border-bottom: none; }
  .matrix-check { color: var(--color-success); font-weight: var(--weight-bold); }
  .matrix-cross { color: var(--color-error); }
  .matrix-partial { color: var(--color-warning); }
</style>

<table class="matrix-table">
  <thead>
    <tr>
      <th>Feature / Property</th>
      <th class="col-highlight">Option A</th>
      <th>Option B</th>
      <th>Option C</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Performance</td>
      <td><span class="matrix-check">✓ High</span></td>
      <td><span class="matrix-partial">~ Medium</span></td>
      <td><span class="matrix-cross">✗ Low</span></td>
    </tr>
    <tr>
      <td>Cost</td>
      <td>$$$</td>
      <td>$$</td>
      <td>$</td>
    </tr>
    <tr>
      <td>Ease of use</td>
      <td><span class="matrix-partial">~ Moderate</span></td>
      <td><span class="matrix-check">✓ Easy</span></td>
      <td><span class="matrix-check">✓ Easy</span></td>
    </tr>
    <tr>
      <td>Scalability</td>
      <td><span class="matrix-check">✓ Excellent</span></td>
      <td><span class="matrix-partial">~ Good</span></td>
      <td><span class="matrix-cross">✗ Limited</span></td>
    </tr>
    <tr>
      <td>Support</td>
      <td>24/7 enterprise</td>
      <td>Business hours</td>
      <td>Community only</td>
    </tr>
  </tbody>
</table>
```

---

## 8. Horizontal Timeline

### When to use

Chronological sequences, project roadmaps, or historical events along a single axis. Best for 4–8 events.

### Template

```html
<!--
  Timeline axis: y=120, x 60–860
  6 events evenly spaced: x 60, 220, 380, 540, 700, 860
  Events alternate: odd above axis (label y≈60), even below (label y≈180)
  Node circles: r=10
-->
<svg viewBox="0 0 920 240" xmlns="http://www.w3.org/2000/svg"
     aria-label="Horizontal timeline" role="img">
  <style>
    .tl-axis   { stroke: var(--color-border); stroke-width: var(--border-width); }
    .tl-stem   { stroke: var(--color-border); stroke-width: var(--border-width); stroke-dasharray: 3 3; }
    .tl-node   { fill: var(--color-category-a); stroke: var(--color-surface); stroke-width: 2; }
    .tl-node-b { fill: var(--color-category-b); stroke: var(--color-surface); stroke-width: 2; }
    .tl-date   { font-family: var(--font-mono);    font-size: var(--text-caption); fill: var(--color-text-tertiary); }
    .tl-label  { font-family: var(--font-display); font-size: var(--text-caption); font-weight: var(--weight-bold); fill: var(--color-text-primary); }
    .tl-sub    { font-family: var(--font-body);    font-size: var(--text-caption); font-style: italic; fill: var(--color-text-secondary); }
  </style>

  <!-- Main axis line -->
  <line class="tl-axis" x1="60" y1="120" x2="860" y2="120" />

  <!-- Event 1 — above axis (x=60) -->
  <line class="tl-stem" x1="60" y1="110" x2="60" y2="60" />
  <circle class="tl-node" cx="60" cy="120" r="10" />
  <text class="tl-date"  x="60" y="45" text-anchor="middle">2020</text>
  <text class="tl-label" x="60" y="30" text-anchor="middle">Event One</text>

  <!-- Event 2 — below axis (x=220) -->
  <line class="tl-stem" x1="220" y1="130" x2="220" y2="180" />
  <circle class="tl-node-b" cx="220" cy="120" r="10" />
  <text class="tl-label" x="220" y="200" text-anchor="middle">Event Two</text>
  <text class="tl-date"  x="220" y="215" text-anchor="middle">2021</text>

  <!-- Event 3 — above axis (x=380) -->
  <line class="tl-stem" x1="380" y1="110" x2="380" y2="60" />
  <circle class="tl-node" cx="380" cy="120" r="10" />
  <text class="tl-date"  x="380" y="45" text-anchor="middle">2022</text>
  <text class="tl-label" x="380" y="30" text-anchor="middle">Event Three</text>

  <!-- Event 4 — below axis (x=540) -->
  <line class="tl-stem" x1="540" y1="130" x2="540" y2="180" />
  <circle class="tl-node-b" cx="540" cy="120" r="10" />
  <text class="tl-label" x="540" y="200" text-anchor="middle">Event Four</text>
  <text class="tl-date"  x="540" y="215" text-anchor="middle">2023</text>

  <!-- Event 5 — above axis (x=700) -->
  <line class="tl-stem" x1="700" y1="110" x2="700" y2="60" />
  <circle class="tl-node" cx="700" cy="120" r="10" />
  <text class="tl-date"  x="700" y="45" text-anchor="middle">2024</text>
  <text class="tl-label" x="700" y="30" text-anchor="middle">Event Five</text>

  <!-- Event 6 — below axis (x=860) -->
  <line class="tl-stem" x1="860" y1="130" x2="860" y2="180" />
  <circle class="tl-node-b" cx="860" cy="120" r="10" />
  <text class="tl-label" x="860" y="200" text-anchor="middle">Event Six</text>
  <text class="tl-date"  x="860" y="215" text-anchor="middle">2025</text>
</svg>
```

---

## General Authoring Rules

1. **`viewBox` is required** on every SVG. Without it the diagram-legibility validator will warn.
2. **No literal hex in fills.** Always `fill="var(--color-*)"`. The same applies to `stroke`.
3. **No literal px on `font-size`.** Always `font-size="var(--text-*)"` or set via `font-size` in the `<style>` block with a token reference.
4. **Legend for multi-series.** Any chart with more than 2 data elements must include `<g class="legend">`.
5. **Connectors first.** In all node diagrams, draw `<path>` connector elements before the node `<g>` groups so nodes appear on top.
6. **Token list.** See `pengui://docs/design-souls` for the full token inventory. See `pengui://docs/print-mode` for print-mode geometry rules.
