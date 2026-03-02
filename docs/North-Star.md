**ARCHITECTURE DOCUMENT**

Pengui Slides MCP Server

_HTML-First Presentation Generation with Design Soul Constraint System_

Version 1.0 | February 2026 | Pengui Canvas Initiative

Confidential - Internal architecture reference for implementation teams.

# **Table of Contents**

# **Executive Summary**

This document describes the architecture of the Pengui Slides MCP Server, a Model Context Protocol server that enables AI agents to generate beautiful, brand-consistent presentations using HTML and CSS as the primary authoring medium, with automated export to PPTX and PDF formats.

The core insight is simple: large language models are exceptionally skilled at generating HTML and CSS but consistently struggle with programmatic presentation APIs (python-pptx, PptxGenJS native). By letting the LLM do what it does best-generate styled HTML-and handling the format conversion mechanically on the server side, we achieve presentation quality that was previously impossible through direct PPTX generation.

The system introduces the concept of a Design Soul: a structured constraint document that defines the complete visual identity of a presentation-color language, typography, spacing, shadows, shape vocabulary, and component patterns. Design Souls serve as both creative direction for the agent and validation rubric for the server, enabling a self-improving generation loop where output is measured against the soul's rules and iteratively corrected.

## **Key Architectural Decisions**

• **Separation of creativity and mechanics.** The LLM (via PenguiFlow orchestration) generates the HTML. The MCP server provides deterministic tools: validation, rendering, export, and slide management. No LLM runs inside the MCP.

• **HTML as interchange format.** Each slide is a self-contained HTML document. The server manages a global deck state, allowing incremental construction of large decks without exceeding context windows.

• **Design Souls as first-class assets.** Registered assets that define brand identity. On approval, the server pre-generates skeleton templates for instant, consistent instantiation.

• **Metadata-enriched slides.** Every slide carries structured metadata in HTML comments-title, data points, narrative, tags. Exported PPTX files embed this metadata in slide notes, making presentations searchable via RAG systems.

• **Format-agnostic export.** One input, many outputs. The server renders HTML to images and assembles into PPTX, PDF, or serves as a static HTML site. Format is an export concern, not an authoring concern.

# **The Breakthrough: HTML → Image → PPTX Pipeline**

This section documents the rendering pipeline that was prototyped and validated during development. This pipeline is the technical foundation that makes the entire system possible. Without it, we would be constrained to python-pptx or PptxGenJS native APIs, which produce visually inferior output.

## **The Problem We Solved**

Every existing approach to AI-generated presentations shares the same fundamental limitation: the LLM must generate code targeting a presentation-specific API (python-pptx, Google Slides API, PptxGenJS programmatic). These APIs are designed for manual authoring, not generative AI. They require precise coordinate math, lack CSS-like layout primitives, have limited gradient and shadow support, and produce inconsistent typography. LLMs struggle with spatial positioning, and debugging involves opaque binary formats.

HTML and CSS, by contrast, are the media LLMs are most fluent in. They can produce sophisticated layouts with flexbox, gradients, rounded corners, layered backgrounds, typographic hierarchy, and responsive spacing-all naturally expressed in a medium they've trained extensively on.

## **The Pipeline Architecture**

The pipeline operates in three stages, each fully deterministic and requiring no LLM involvement:

### **Stage 1: Standalone HTML Per Slide**

Each slide is a complete HTML document with its own DOCTYPE, style block, and body. The slide content is rendered inside a fixed-dimension container (default 1920×1080 pixels for 16:9 widescreen). The HTML uses inline styles or a scoped style block-no external dependencies required. System fonts are used to ensure rendering fidelity across environments (Georgia, Trebuchet MS, Palatino for the design soul aesthetic; any system font stack works).

The key constraint: each slide HTML must be fully self-contained. No external font loading, no CDN dependencies, no JavaScript required for layout. The rendering engine must produce identical output regardless of network availability.

### **Stage 2: HTML to High-Resolution PNG**

The HTML is rendered to a PNG image using a headless rendering engine. Two options were validated:

**wkhtmltoimage** (validated in prototype): Uses the QtWebKit engine. Lightweight, single binary, no browser installation required. Limitations: older WebKit engine does not support CSS Grid (requires float-based layouts), does not load external fonts. Adequate for production with the constraint that CSS must target WebKit compatibility.

**Playwright/Puppeteer** (recommended for production): Uses Chromium. Full support for modern CSS including Grid, custom properties, web fonts, backdrop-filter. Produces pixel-perfect renders. Requires Chromium binary (~150MB). The recommended choice for the production MCP server.

Rendering command (wkhtmltoimage, as validated):

wkhtmltoimage \\

\--width 1920 \\

\--height 1080 \\

\--quality 95 \\

\--enable-local-file-access \\

\--load-error-handling ignore \\

slide.html slide.png

Rendering command (Playwright, recommended for production):

const browser = await chromium.launch();

const page = await browser.newPage();

await page.setViewportSize({ width: 1920, height: 1080 });

await page.setContent(slideHtml);

await page.screenshot({ path: 'slide.png', type: 'png' });

### **Stage 3: PNG Assembly into PPTX**

The rendered PNG images are assembled into a PPTX file using PptxGenJS (Node.js). Each image is placed as a full-bleed slide background at 13.333×7.5 inches (standard widescreen). The assembly is entirely mechanical-no layout logic, no font handling, just image placement.

const PptxGenJS = require('pptxgenjs');

const pptx = new PptxGenJS();

pptx.defineLayout({ name: 'WIDE', width: 13.333, height: 7.5 });

pptx.layout = 'WIDE';

for (const imgPath of slidePngs) {

const imgData = fs.readFileSync(imgPath).toString('base64');

const slide = pptx.addSlide();

slide.addImage({

data: \`image/png;base64,\${imgData}\`,

x: 0, y: 0, w: 13.333, h: 7.5

});

// Metadata injected into slide notes (see Section 6)

slide.addNotes(slideMetadata);

}

await pptx.writeFile({ fileName: 'output.pptx' });

## **Pipeline Performance Characteristics**

| **Metric** | **wkhtmltoimage** | **Playwright** |
| --- | --- | --- |
| **Render time per slide** | ~1.5 seconds | ~0.8 seconds |
| **Image size (1920×1080)** | ~8 MB PNG | ~4 MB PNG (optimized) |
| **CSS Grid support** | No (use floats) | Full support |
| **Web fonts** | No (system fonts only) | Full support |
| **5-slide deck total** | ~8 seconds | ~5 seconds |
| **PPTX file size (5 slides)** | ~40 MB | ~20 MB (JPEG export) |

## **Tradeoffs and Mitigations**

**Non-editable text in PPTX.** Since slides are rasterized images, text cannot be selected or edited in PowerPoint. **Mitigation:** For v1, this is acceptable-the iteration loop happens in the agent/preview cycle, not in PowerPoint. For future versions, a hybrid approach can overlay editable PptxGenJS text boxes on top of image backgrounds, combining visual richness with text editability.

**File size.** Image-based slides produce larger files than native PPTX. **Mitigation:** Use JPEG at 85% quality instead of PNG for photographic backgrounds. Use PNG only for slides with text on solid backgrounds where compression artifacts would be visible. Optionally run pngquant or similar lossy PNG compression. A 20-slide deck at JPEG quality is ~25 MB, well within email and sharing limits.

## **The Slide HTML Contract**

For the pipeline to be reliable at scale-across many souls, many agents, and decks of 70+ slides-every slide must conform to a strict HTML contract. The contract defines what "valid Slide HTML" means. Think of it as: a deterministic, hermetic document that renders identically on a cold server with zero internet access.

### **Contract Rules**

**1\. Self-contained document.** Each slide is a complete HTML document with DOCTYPE, head, style block, and body. No partials, no fragments, no external template references.

**2\. No external network dependencies.** No external font loading (Google Fonts, Typekit). No CDN-hosted scripts or stylesheets. No image URLs pointing to external servers. All assets must be inline (base64 data URIs for images) or rely on system-installed fonts. The renderer operates with network disabled.

**3\. No JavaScript for layout.** No JavaScript may be required for layout computation. JavaScript may be present for animation or interactivity in preview, but the static HTML/CSS must produce the correct layout without script execution. The server renderer runs with JS disabled by default.

**4\. Fixed-dimension root container with safe area.** The body must contain a single root container with explicit dimensions matching the target resolution (default: 1920×1080px). All content is positioned within this container. A safe-area inset of 48px from all edges ensures no content is clipped during format conversion.

**5\. Token-only CSS (see Section 4).** All visual properties (colors, spacing, border-radius, shadows, font sizes) must reference Design Soul tokens via CSS custom properties (var(--token-name)). Arbitrary hex values, pixel values, and font declarations outside the soul's token system are flagged by the validator. This is the single most important rule for enabling reliable validation and brand consistency.

**6\. Required metadata block.** Each slide must include a structured metadata comment block (&lt;!-- @slide-meta {...} --&gt;) as the first element before the root container. See Section 6 for the schema.

**7\. Scoped CSS only.** The root :root selector must declare all soul tokens as CSS custom properties. The style block must be self-contained (no @import). Media queries are not permitted (slides render at a fixed resolution).

This contract is enforced at two levels: the static lint stage of validation checks structural compliance (metadata present, no external URLs, token usage), and the render-truth stage checks visual compliance (contrast, spacing, layout). Slides that violate the contract are rejected before rendering, saving compute.

## **Editability Staged Plan**

The non-editable nature of image-based PPTX slides is an intentional v1 tradeoff. The iteration loop happens in the agent/preview cycle, not in PowerPoint. However, a staged plan addresses editability progressively:

**v1 (current):** Pure image slides. Highest visual fidelity. PPTX is a delivery/viewing format. All iteration happens through natural language in the agent loop.

**v1.5:** Editable titles and bullets only. The pipeline identifies top-level heading and bullet text elements, renders a text-free background image, and overlays native PptxGenJS text boxes for those specific elements. Limited font matching scope (headings only) makes this tractable.

**v2:** Full editable text overlay. All text elements are extracted, background rendered without text, and native text boxes placed at computed positions. Requires solving font metrics matching (line-height, letter-spacing, wrapping equivalence between browser and PowerPoint), baseline alignment, and emoji/CJK rendering differences.

**v3:** Partial structural export. Where feasible, export shapes, charts, and grouped elements as native PowerPoint objects rather than images. Token-only CSS makes this more tractable because tokens map to a finite set of PowerPoint style primitives.

# **System Architecture**

## **Architectural Principles**

• **The MCP is the hands, the LLM is the brain.** The MCP server exposes tools. The LLM in PenguiFlow is the reasoning engine. The MCP never makes creative decisions; it validates, renders, and exports.

• **Incremental construction.** The agent generates one slide at a time and calls an MCP tool to add it to the deck. The global deck state lives in the MCP server, not in the LLM's context window. This enables 70+ slide decks without context overflow.

• **Design Souls as constraint documents.** Design Souls are registered assets stored in the MCP. The LLM receives the soul as context; the MCP validates output against the soul's rules.

• **HTML as the single source of truth.** Each slide is a self-contained HTML document. The deck is an ordered collection of slides with metadata. Export is a format transformation, not a creative act.

## **Component Overview**

The system consists of five components that interact through the MCP protocol:

**PenguiFlow Agent** (external, not part of MCP): The orchestrating LLM that receives user briefs, holds Design Soul context, generates HTML slide content, interprets validation results, and iterates. This is where all creativity and reasoning happens.

**Design Soul Registry:** Persistent storage for Design Soul documents and their pre-generated skeleton templates. Handles registration, approval, listing, and retrieval of souls.

**Deck State Manager:** In-memory (with optional persistence) manager for active deck sessions. Maintains the ordered collection of slide HTMLs, their metadata, and deck-level properties. Enables incremental construction and random-access editing.

**Validation Engine:** Deterministic HTML analyzer that checks slide output against Design Soul constraints. Parses the DOM, extracts colors, measures contrast ratios, checks spacing values, verifies font usage, and flags violations. No LLM required-pure rule-based validation.

**Rendering and Export Pipeline:** The HTML → Image → PPTX pipeline documented in Section 2. Also handles PDF export (via the same image pipeline or direct HTML-to-PDF) and HTML bundle export.

## **Data Flow**

The complete flow for generating a presentation, showing the interaction between PenguiFlow (the agent) and the MCP server (the tools):

**1\. User brief.** User provides a brief to the PenguiFlow agent: "Make a 10-slide deck about our Q1 results."

**2\. Soul retrieval.** The agent calls the MCP's list_design_souls or get_design_soul tool to retrieve the appropriate Design Soul and its skeleton templates.

**3\. Deck initialization.** The agent calls create_deck to initialize a new deck session in the MCP. Returns a deck_id.

**4\. Slide generation (iterative).** The agent generates HTML for one slide, using the skeleton template as a starting point and filling in content from the brief. It calls add_slide with the HTML and structured metadata.

**5\. Validation.** The MCP's validation engine checks the submitted HTML against the Design Soul rules. Returns a list of issues (contrast violations, spacing errors, palette deviations) or an empty list if compliant.

**6\. Agent self-correction.** If issues exist, the agent reads them, fixes the HTML in its own reasoning, and resubmits. This loop repeats until validation passes. This is the self-improving loop.

**7\. Repeat for all slides.** Steps 4-6 repeat for each slide. The agent only holds one slide in context at a time. The MCP manages the full deck state server-side.

**8\. Export.** Once all slides are added, the agent calls render_preview to get a thumbnail overview, optionally adjusts, then calls export_pptx (or export_pdf, export_html).

**9\. Pipeline execution.** The pipeline renders each slide's HTML to a high-resolution PNG, assembles the PPTX with PptxGenJS, injects metadata into slide notes, and returns the file.

# **Design Soul System**

The Design Soul is the central innovation of the architecture. It solves the fundamental problem of AI-generated visual content: consistency. Without a soul, every generation is a roll of the dice-different color choices, inconsistent spacing, drifting typography. The Design Soul provides the constraint layer that ensures every slide from any agent, across any session, looks like it belongs to the same brand.

## **Design Soul Document Structure**

A Design Soul is a structured document (stored as JSON with embedded prose) that defines seven layers of visual identity:

| **Layer** | **What It Defines** |
| --- | --- |
| **Color Language** | Base neutrals (canvas, surface, border), accent system (primary, secondary, warm), text colors (primary, secondary, tertiary, inverse), semantic colors (success, warning, error). Includes CSS custom property names and hex values. |
| **Typography** | Font families (display, body), size scale (headline, body, label, caption), weight rules, line height values, letter spacing, text color strategy. Specifies both web fonts and system font fallbacks. |
| **Spacing** | Spacing scale (4px base, multiples), margin rules, padding rules, gap values for cards, sections, and elements. Defines minimum margins from slide edges. |
| **Shape and Radius** | Corner radius signature (small controls, cards, floating elements), geometry guidelines (rounded rectangles vs circles), border style (hairline, warm, low opacity). |
| **Depth and Shadow** | Shadow definitions (soft, medium, elevated) with exact CSS box-shadow values. Rules for when elevation is appropriate. Border opacity and color. |
| **Components** | Patterns for cards, buttons, inputs, pills/chips, icons. Defines how each component should look, including hover and active states. Establishes the visual vocabulary of the system. |
| **Motion and Tone** | Animation style (smooth, understated), transition durations, easing curves. Also includes do/don't rules and a north star sentence that captures the soul in one phrase. |

## **Skeleton Templates**

When a Design Soul is approved (via the approve_design_soul tool), the MCP server triggers a one-time skeleton generation process. The server uses the soul's design tokens to produce a set of base HTML slide templates-complete with the full CSS theme, layout structure, and slot placeholders, but no content.

Standard skeleton types generated per soul:

• **Title slide.** Full-bleed styled background with title, subtitle, tag, bottom bar with date and logo.

• **Two-column layout.** Split layout (configurable ratio) with section label, heading, description on one side, and content cards on the other.

• **Metrics / Numbers slide.** Dark or light variant with 3-column metric card grid (large number, label, description).

• **Features / Cards grid.** Header row (section label + heading + optional description) with 3-column feature cards including icon slots, titles, descriptions, and pill labels.

• **Closing / CTA slide.** Centered CTA with icon, heading, description text, and button row. Bottom info bar with contact and confidentiality.

• **Blank themed slide.** Blank slide with only the CSS theme, page number, and background. For custom content.

Skeletons use HTML comments as slot markers that the LLM replaces with content:

&lt;!-- @slot:title --&gt;Placeholder Heading&lt;!-- @endslot --&gt;

&lt;!-- @slot:subtitle --&gt;Placeholder subtitle text&lt;!-- @endslot --&gt;

&lt;!-- @slot:tag --&gt;Section Label&lt;!-- @endslot --&gt;

&lt;!-- @slot:metric-1-value --&gt;XX%&lt;!-- @endslot --&gt;

&lt;!-- @slot:metric-1-label --&gt;Metric Name&lt;!-- @endslot --&gt;

The agent reads the skeleton, replaces slot content, and optionally adds new elements or modifies the structure. The skeleton guarantees that the CSS theme, layout grid, and component patterns are correct from the start-the agent only needs to provide content, not design.

## **Token-Only CSS Enforcement**

This is the single highest-leverage architectural decision for validation reliability and brand consistency. All visual properties in slide HTML must reference Design Soul tokens via CSS custom properties. Arbitrary literal values are not permitted.

The rule is simple: if a value controls how the slide looks, it must come from a var(--token). This applies to colors, spacing, border-radius, shadows, font families, and font sizes. The skeleton templates ship with all tokens pre-declared in the :root selector, and the agent fills content into the existing token-based system.

### **What This Means in Practice**

/\* ✓ ALLOWED - all values reference soul tokens \*/

.metric-card {

background: var(--surface);

border-radius: var(--radius-card);

padding: var(--space-lg) var(--space-md);

border: 1px solid var(--border);

box-shadow: var(--shadow-soft);

}

.metric-card h4 {

font-family: var(--font-body);

font-size: var(--text-body);

color: var(--text-primary);

}

/\* ✗ REJECTED - literal values bypass the soul \*/

.metric-card {

background: #F3EDE4; /\* literal hex \*/

border-radius: 22px; /\* literal px \*/

padding: 36px 32px; /\* literal px \*/

color: rgb(107, 98, 89); /\* literal rgb \*/

}

### **Why This Matters**

• **Validation becomes trivial.** Color checking becomes a token lookup, not computed style analysis. If the stylesheet only uses var(--accent-mint) and that token maps to #5B9E8F in the soul, the validator confirms the token is in the allowed set without needing to compute backgrounds, gradients, or stacking contexts.

• **Soul evolution becomes safe.** Changing a brand color means updating one token value in the soul. Every slide using that token updates automatically. No find-and-replace across HTML files.

• **Hybrid export becomes feasible.** Tokens map to a finite set of PowerPoint style primitives. var(--text-primary) maps to a specific RGB value in a PptxGenJS text box. var(--radius-card) tells the hybrid exporter what corner radius to apply to a native shape. The token vocabulary becomes a bridge between HTML and PPTX worlds.

• **Consistency is automatic.** If the agent starts from a skeleton that already uses tokens, and the validator rejects any literal values, every slide automatically uses the soul's design system. No drift, no inconsistency, no "slide 34 looks different from slide 3" problems.

The token vocabulary for a typical soul defines approximately 30-40 tokens across color (12-15), typography (6-8), spacing (6-8), radius (3-4), and shadow (3-4) categories. This is a small, learnable surface that agents master quickly, especially when starting from skeleton templates that demonstrate correct usage.

## **Validation Rules Engine**

The validation engine is a deterministic checker that parses slide HTML and measures it against the Design Soul's constraints. It returns structured issue reports that the agent uses for self-correction. Validation categories:

**Color compliance:** Extracts all color values from inline styles and CSS rules. Checks each against the soul's allowed palette (with configurable tolerance for opacity variations). Flags any color not in the palette.

**Contrast validation:** Calculates WCAG contrast ratios between text elements and their backgrounds. Minimum 4.5:1 for body text, 3:1 for large text (per soul configuration). Returns exact ratio and required minimum for each violation.

**Typography check:** Verifies font-family declarations match the soul's allowed fonts. Checks font sizes against the defined scale. Flags unauthorized weights or styles.

**Spacing audit:** Measures padding and margin values against the soul's spacing scale. Checks minimum edge margins. Flags values that don't align with the defined steps.

**Border-radius consistency:** Verifies corner radius values match the soul's radius signature for each element type.

**Structural rules:** Checks for soul-specific do/don't violations such as "no pure white backgrounds," "no hard shadows," or "no more than one primary accent per slide."

Validation response structure:

{

"valid": false,

"issues": \[

{

"severity": "error",

"category": "contrast",

"element": ".metric-desc",

"message": "Text contrast 2.8:1, minimum 4.5:1",

"current": "rgba(250,247,242,0.45) on #2C2825",

"expected": "Minimum contrast ratio 4.5:1"

},

{

"severity": "warning",

"category": "color",

"element": ".accent-badge",

"message": "Color #FF6B35 not in soul palette",

"suggestion": "Nearest palette color: --accent-coral (#C4816A)"

}

\],

"score": 0.72

}

### **Tiered Rule System**

Not all validation failures are equal. To prevent overly strict souls from causing the agent to burn tokens on endless correction loops, the validation engine uses a three-tier severity model:

**Hard errors (must never ship):** Content outside safe-area margins, text contrast below WCAG 3:1, non-approved palette colors (literal hex values bypassing tokens), missing metadata block, external network dependencies, font families not in the soul's approved set. Slides with hard errors are rejected from export.

**Soft warnings (allowed but scored):** Accent color used more than the soul's recommended frequency, more than two font weights on a single slide, inconsistent corner radius across sibling elements, spacing values that exist in the token system but don't match the soul's recommendation for the element type. Warnings reduce the compliance score but don't block export.

**Style score (drives auto-iteration):** A 0.0-1.0 score computed from the weighted sum of warnings and positive signals (correct token usage, good contrast headroom, consistent component patterns). The agent receives this score and can decide whether to iterate further or accept the current quality. A configurable threshold (default 0.8) determines when the agent stops self-correcting.

This tiered approach prevents a common failure mode: souls that grow into "everything rules" documents where the agent fights 15 soft preferences on every slide, burning context and time. Hard errors catch real problems; soft warnings guide quality; the score provides a clear stopping point.

### **Two-Stage Validation Architecture**

The validation engine operates in two stages, balancing speed with accuracy. Not every slide needs the expensive second stage.

**Stage 1: Static Lint (fast, ∼50ms per slide).** Uses jsdom to parse the HTML into a DOM tree and a CSS parser to extract all declared styles. Checks are purely structural and token-based:

• **Token compliance.** All color properties reference var(--token) from the soul's approved token set.

• **Font-family constraints.** font-family declarations match the soul's allowed fonts.

• **Spacing scale.** Spacing values (padding, margin, gap) use soul tokens or approved multiples.

• **Structural checks.** Metadata comment block is present and parseable.

• **Network isolation.** No external URLs (href, src, @import, url()) pointing outside the document.

• **Safe-area compliance.** Root container has correct fixed dimensions.

**Stage 2: Render-Truth Sampling (slower, ∼800ms per slide).** Uses Playwright to render the slide in a real browser context and extract computed styles. This stage catches issues that static analysis misses:

• **Computed contrast ratios.** Calls getComputedStyle() on text elements to determine actual rendered color, then checks against the actual rendered background (accounting for stacking contexts, gradients, and opacity layers). Returns exact WCAG contrast ratios.

• **Overflow and clipping detection.** Screenshots the rendered slide and checks that no content extends beyond the safe-area boundaries. Detects elements clipped by overflow:hidden or pushed outside the viewport.

• **Rendered color sampling.** Compares the rendered pixel at key element positions against expected soul token colors, catching CSS specificity and inheritance issues that static analysis can't resolve.

• **Visual legibility verification.** Checks whether text elements are actually visible at their computed size against their computed background, catching cases where inherited opacity or z-index stacking makes text unreadable.

Stage 2 is opt-in per tool call: validate_slide and add_slide always run Stage 1. Stage 2 runs by default on export (export_pptx, export_pdf) and can be requested explicitly via a validate_depth parameter. This keeps iteration fast while ensuring export quality.

# **MCP Tool Definitions**

The MCP server exposes the following tools, organized by domain. Each tool is deterministic and stateless relative to the LLM-all state is managed server-side.

## **Design Soul Management**

### **register_design_soul**

Registers a new Design Soul document. Parses the soul, extracts color tokens, typography rules, spacing scale, and component patterns. Stores it in the registry with status "draft."

Input: { name: string, soul: DesignSoulDocument }

Output: { soul_id: string, status: 'draft', token_count: number }

### **approve_design_soul**

Marks a Design Soul as approved and triggers skeleton generation. The server generates the standard set of slide templates (title, two-column, metrics, cards, closing, blank) using the soul's design tokens. This is a potentially long-running operation (10-30 seconds for skeleton generation).

Input: { soul_id: string }

Output: { soul_id: string, status: 'approved',

skeletons: string\[\] // IDs of generated templates }

### **list_design_souls**

Returns all registered Design Souls with their status and skeleton availability.

Input: { status_filter?: 'draft' | 'approved' | 'all' }

Output: { souls: \[{ soul_id, name, status, skeleton_count }\] }

### **get_design_soul**

Retrieves a Design Soul document and optionally its skeleton templates. When include_skeletons is true, returns the full HTML of each skeleton template for the agent to use as a starting point.

Input: { soul_id: string, include_skeletons?: boolean }

Output: { soul: DesignSoulDocument, skeletons?: SlideTemplate\[\] }

## **Deck Management**

### **create_deck**

Initializes a new deck session. Associates it with a Design Soul for validation. Returns a deck_id used in all subsequent operations.

Input: { soul_id: string, title?: string, author?: string }

Output: { deck_id: string, soul_id: string, slide_count: 0 }

### **add_slide**

Adds a slide to the deck at the specified position (default: append). The HTML is stored server-side. Automatically triggers validation against the deck's associated Design Soul. Returns validation results inline so the agent can self-correct in the same turn.

Input: { deck_id: string, html: string, metadata: SlideMetadata,

position?: number // 0-indexed, default append }

Output: { slide_id: string, position: number, slide_count: number,

validation: ValidationResult }

### **update_slide**

Replaces the HTML and/or metadata of an existing slide. Re-triggers validation.

Input: { deck_id: string, slide_id: string,

html?: string, metadata?: SlideMetadata }

Output: { slide_id: string, validation: ValidationResult }

### **get_slide**

Retrieves a single slide's HTML and metadata. Used by the agent to read existing slides for modification or to understand context when adding related slides.

Input: { deck_id: string, slide_id: string }

Output: { html: string, metadata: SlideMetadata, position: number }

### **remove_slide**

Removes a slide from the deck. Remaining slides are re-indexed.

Input: { deck_id: string, slide_id: string }

Output: { removed: true, slide_count: number }

### **reorder_slides**

Changes the order of slides in the deck.

Input: { deck_id: string, slide_ids: string\[\] // new order }

Output: { slide_count: number, order: string\[\] }

### **get_deck_summary**

Returns a lightweight overview of the deck: slide count, titles, positions, validation status per slide. Does not return HTML (to keep context usage low).

Input: { deck_id: string }

Output: { deck_id, title, slide_count, soul_id,

slides: \[{ slide_id, position, title, valid }\] }

## **Deck State Versioning**

Every mutation to the deck state (add_slide, update_slide, remove_slide, reorder_slides) creates an immutable revision entry. This is critical for debugging regressions, enabling collaborative workflows, and tracking export provenance.

The versioning model:

• **Slide-level revision hashes.** Every update_slide call stores the previous HTML as a revision, keyed by a content hash. The server maintains a linked list of revisions per slide, enabling "what did slide 12 look like yesterday?" queries.

• **Export provenance.** Each export operation records which slide revision hashes were included. This answers "which version of each slide went into the PPTX we sent to investors?" and enables reproducible exports.

• **Conflict detection (future).** When multi-agent or multi-user editing is introduced (post-v1), the revision system provides the foundation for merge conflict detection. Two agents editing the same slide produce a fork in the revision chain; the orchestrator can diff and resolve.

• **Storage strategy.** For v1, revisions are stored in memory with optional SQLite persistence. Revision depth is configurable (default: last 10 revisions per slide) to prevent unbounded storage growth.

The data model:

interface SlideRevision {

revision_id: string; // UUID

slide_id: string;

html_hash: string; // SHA-256 of the HTML content

html: string; // Full HTML at this revision

metadata: SlideMetadata;

created_at: string; // ISO timestamp

created_by: string; // Agent ID or user ID

validation_result: ValidationResult;

parent_revision?: string; // Previous revision ID

}

## **Validation**

### **validate_slide**

Runs the validation engine on a single slide's HTML against a Design Soul. Can be called standalone (without a deck) for testing during soul development. Supports two-stage validation: Stage 1 (static lint, ∼50ms) runs by default; Stage 2 (render-truth sampling, ∼800ms) can be requested explicitly and runs automatically during export.

Input: { html: string, soul_id: string,

depth?: 'lint' | 'full' // default 'lint' }

Output: { ValidationResult }

## **Export**

### **render_preview**

Renders all slides (or a subset) to low-resolution thumbnail images and returns them as base64-encoded PNGs. Used by the agent and frontend for quick visual review before full export.

Input: { deck_id: string, slides?: string\[\],

thumbnail_width?: number // default 480 }

Output: { previews: \[{ slide_id, image_base64, position }\] }

### **export_pptx**

Executes the full HTML → Image → PPTX pipeline. Renders each slide at full resolution (1920×1080), assembles into a PPTX file with PptxGenJS, injects metadata into slide notes. Returns a file path or download URL.

Input: { deck_id: string, resolution?: '1080p' | '4k',

image_format?: 'png' | 'jpeg',

jpeg_quality?: number // 0-100, default 90 }

Output: { file_path: string, file_size_bytes: number,

slide_count: number }

### **export_pdf**

Exports the deck as a PDF. Either renders via the image pipeline (same quality as PPTX) or uses direct HTML-to-PDF rendering via Playwright for smaller file sizes.

Input: { deck_id: string, mode?: 'image' | 'direct' }

Output: { file_path: string, file_size_bytes: number }

### **export_html**

Exports the deck as a self-contained HTML file with all slides, navigation, and optional slide transition animations. Can be served as a static site or opened locally.

Input: { deck_id: string, include_navigation?: boolean }

Output: { file_path: string }

# **Metadata System and RAG Integration**

Every slide in the system carries structured metadata that serves three purposes: it informs the agent during deck construction (context about what each slide contains), it gets embedded in exported files for downstream searchability, and it enables RAG-based retrieval across the organization's presentation history.

## **Slide Metadata Schema**

interface SlideMetadata {

// Required

title: string; // Human-readable slide title

type: SlideType; // 'title' | 'content' | 'metrics' | 'comparison'

// | 'features' | 'timeline' | 'closing' | 'custom'

// Content extraction

narrative: string; // 1-2 sentence summary of slide's message

key_points: string\[\]; // Bullet-point takeaways

// Structured data (when applicable)

data_points?: {

label: string;

value: string | number;

unit?: string;

source?: string; // Attribution for the data

period?: string; // e.g., 'Q1 2026', '2024 FY'

}\[\];

// Taxonomy

tags: string\[\]; // Semantic tags for retrieval

audience?: string; // 'executive' | 'technical' | 'investor' | 'general'

confidentiality?: string; // 'public' | 'internal' | 'confidential'

// Provenance

generated_at: string; // ISO timestamp

soul_id: string; // Design Soul used

deck_id: string; // Parent deck

position: number; // Slide position in deck

// Schema versioning (for future-safe RAG ingestion)

meta_version: '1.0'; // Schema version for migrations

revision_hash: string; // Content hash of the slide HTML

// Source attribution (for data lineage and compliance)

sources?: {

url?: string; // Source URL or document ID

title?: string; // Human-readable source name

quote_span?: string; // Specific excerpt referenced

confidence?: number; // 0.0-1.0, agent's confidence in accuracy

retrieved_at?: string; // When the source was accessed

}\[\];

}

## **Metadata in HTML Slides**

Metadata is embedded in the slide HTML as a structured comment block. This ensures it travels with the HTML through all processing stages and is easily extractable by any parser:

<!-- @slide-meta

{

"title": "The cost of noisy software",

"type": "metrics",

"narrative": "Quantifying the productivity cost of complexity",

"data_points": \[

{

"label": "Deep work disruption",

"value": "68%",

"source": "2024 Workplace Focus Study"

}

\],

"tags": \["productivity", "metrics", "cost-analysis"\]

}

\-->

&lt;div class="slide slide-3"&gt;

... slide content ...

&lt;/div&gt;

## **Metadata in Exported PPTX**

When exporting to PPTX, the metadata is injected into the slide notes field as formatted Markdown. This makes it human-readable when someone opens the PPTX in PowerPoint, and machine-parseable for RAG ingestion:

slide.addNotes(

\`# \${metadata.title}\\n\\n\` +

\`\*\*Type:\*\* \${metadata.type}\\n\` +

\`\*\*Narrative:\*\* \${metadata.narrative}\\n\\n\` +

\`## Key Points\\n\` +

metadata.key_points.map(p => \`- \${p}\`).join('\\n') +

\`\\n\\n## Data\\n\` +

JSON.stringify(metadata.data_points, null, 2) +

\`\\n\\n---\\n\` +

\`Tags: \${metadata.tags.join(', ')}\\n\` +

\`Generated: \${metadata.generated_at}\\n\` +

\`Soul: \${metadata.soul_id}\`

);

## **RAG Integration Pattern**

The metadata system transforms presentations from opaque visual artifacts into searchable knowledge. The ingestion pattern for a RAG system:

**1\. Ingestion.** When a PPTX is exported or saved, extract all slide notes.

**2\. Parsing.** Parse the structured metadata from each slide's notes. Each slide becomes one document in the vector store with its metadata as structured fields.

**3\. Embedding.** Generate embeddings from the narrative and key_points fields. Store data_points as filterable structured data.

**4\. Retrieval.** "What metrics did we present to investors about productivity?" → semantic search retrieves the slide, returns the exact data points and their sources.

**5\. Cross-deck intelligence.** When building a new deck, the agent can query: "Find slides from previous decks with tag 'Q1' and type 'metrics'." It receives the metadata, understands the structure, and creates updated versions using the same layout patterns.

This closes the knowledge loop: presentations generate structured metadata, metadata feeds RAG, RAG informs future presentations. Institutional knowledge accumulates instead of rotting in inaccessible PPTX files.

# **Integration with PenguiFlow**

## **Frontend Rendering via Html.svelte**

PenguiFlow's playground UI already contains a dedicated HTML renderer (Html.svelte) registered in the renderer registry under the key "html." This component uses an iframe with srcdoc to render arbitrary HTML, CSS, and JavaScript in a sandboxed environment.

This is the live preview surface for slide development. The integration is straightforward:

**1\.** The agent generates slide HTML or retrieves it from the MCP server.

**2\.** The HTML is passed to the Html.svelte renderer via the standard renderer interface.

**3\.** The user sees the rendered slide in the playground UI.

**4\.** The user provides natural language feedback.

**5\.** The agent modifies the HTML and the renderer updates in real time.

No new frontend components are required for v1. The existing renderer infrastructure handles everything. The sandboxed iframe provides security isolation and prevents slide CSS from affecting the playground UI.

## **Html.svelte Configuration for Slides**

The renderer accepts separate html, css, and js props. For slide preview, the recommended configuration:

<Html

html={slideHtml}

css={slideCss}

js=""

height="540px"

sandbox="allow-scripts"

/>

The height is set to maintain the 16:9 aspect ratio at preview width. The slide HTML includes internal CSS transforms to scale from 1920×1080 native resolution to the preview container width.

## **Agent Orchestration Pattern**

The PenguiFlow agent orchestrates the deck creation using a structured workflow. The agent's system prompt includes the Design Soul (retrieved via get_design_soul), and the agent follows this high-level pattern:

1\. Analyze user brief → determine slide count and structure

2\. Call create_deck(soul_id) → get deck_id

3\. For each slide:

a. Call get_design_soul(include_skeletons=true) if needed

b. Generate HTML using skeleton as base + brief content

c. Construct SlideMetadata

d. Call add_slide(deck_id, html, metadata)

e. Read validation result

f. If issues: fix HTML and call update_slide

g. Render preview via Html.svelte for user review

4\. Call render_preview(deck_id) for full-deck thumbnail view

5\. Accept user feedback, iterate on specific slides

6\. Call export_pptx(deck_id) for final output

## **Multi-Agent Coordination (Future)**

PenguiFlow's orchestration layer enables multi-agent workflows for complex decks. Potential agent specializations:

• **Layout architect.** Determines slide count, selects slide types, defines the narrative arc across the deck.

• **Content designer.** Generates the HTML for individual slides, fills content, handles typography and composition.

• **Data visualizer.** Takes data from the brief (numbers, charts, comparisons) and creates appropriate visualizations using ECharts or native HTML/CSS.

• **Brand consistency auditor.** Runs cross-slide checks: consistent use of accent colors, no repeated layouts in adjacent slides, progressive narrative flow, consistent terminology.

# **Technical Implementation Guide**

## **Technology Stack**

| **Component** | **Technology** | **Rationale** |
| --- | --- | --- |
| **MCP Server Runtime** | Node.js (TypeScript) | MCP SDK is TypeScript-native; PptxGenJS is JS |
| **HTML Rendering** | Playwright (Chromium) | Full modern CSS; reliable cross-platform |
| **PPTX Assembly** | PptxGenJS | Proven JS library; runs in same Node runtime |
| **HTML Validation** | jsdom + custom rules | DOM parsing without a browser; fast, lightweight |
| **Design Soul Storage** | File system (JSON) or SQLite | Simple persistence; no external DB dependency |
| **Deck State** | In-memory Map + optional SQLite | Fast access; persistence optional for long sessions |

## **Project Structure**

pengui-slides-mcp/

├── src/

│ ├── server.ts # MCP server entry point

│ ├── tools/

│ │ ├── soul-management.ts # Design Soul CRUD tools

│ │ ├── deck-management.ts # Deck/slide CRUD tools

│ │ ├── validation.ts # validate_slide tool

│ │ └── export.ts # render, export_pptx/pdf/html

│ ├── engine/

│ │ ├── validator.ts # HTML validation against soul

│ │ ├── renderer.ts # Playwright HTML→PNG rendering

│ │ ├── assembler.ts # PptxGenJS PPTX assembly

│ │ └── skeleton.ts # Skeleton generation from soul

│ ├── state/

│ │ ├── soul-registry.ts # Design Soul persistence

│ │ └── deck-store.ts # Deck session management

│ ├── types/

│ │ ├── design-soul.ts # Soul schema types

│ │ ├── slide.ts # Slide and metadata types

│ │ └── validation.ts # Validation result types

│ └── utils/

│ ├── color.ts # Color parsing, contrast calc

│ └── css-parser.ts # CSS value extraction

├── souls/ # Design Soul storage

├── skeletons/ # Generated skeleton templates

├── output/ # Rendered images and exports

├── package.json

└── tsconfig.json

## **Key Implementation Details**

### **Validation Engine (validator.ts)**

The validator uses jsdom to parse slide HTML into a DOM tree, then walks the tree extracting computed styles. It does not execute JavaScript or load external resources-it operates on the static HTML structure.

// Core validation loop

function validateSlide(html: string, soul: DesignSoul): ValidationResult {

const dom = new JSDOM(html);

const doc = dom.window.document;

const issues: Issue\[\] = \[\];

// 1. Extract all color values from inline styles and &lt;style&gt; rules

const colors = extractColors(doc);

issues.push(...checkPalette(colors, soul.colorLanguage));

// 2. Check contrast ratios for text elements

const textElements = doc.querySelectorAll('h1,h2,h3,h4,p,span,div');

issues.push(...checkContrast(textElements, soul.contrast));

// 3. Verify typography

issues.push(...checkTypography(doc, soul.typography));

// 4. Check spacing values

issues.push(...checkSpacing(doc, soul.spacing));

// 5. Verify border-radius consistency

issues.push(...checkRadius(doc, soul.shape));

return {

valid: issues.filter(i => i.severity === 'error').length === 0,

issues,

score: calculateScore(issues)

};

}

### **Renderer (renderer.ts)**

The renderer manages a Playwright browser instance pool for concurrent slide rendering. Each slide is rendered in an isolated browser context.

class SlideRenderer {

private browser: Browser;

async initialize() {

this.browser = await chromium.launch();

}

async renderSlide(html: string, opts: RenderOptions): Promise&lt;Buffer&gt; {

const context = await this.browser.newContext({

viewport: {

width: opts.width || 1920,

height: opts.height || 1080

}

});

const page = await context.newPage();

await page.setContent(html, { waitUntil: 'networkidle' });

const buffer = await page.screenshot({

type: opts.format || 'png',

quality: opts.format === 'jpeg' ? (opts.quality || 90) : undefined

});

await context.close();

return buffer;

}

async renderDeck(slides: string\[\], opts: RenderOptions)

: Promise&lt;Buffer\[\]&gt; {

// Parallel rendering for performance

return Promise.all(

slides.map(html => this.renderSlide(html, opts))

);

}

}

## **Renderer Security Hardening**

Rendering arbitrary HTML in a Chromium process is effectively running untrusted code in a browser engine. Even when the agent is "trusted," the content may include user-provided data, RAG-retrieved snippets, or third-party templates. The following hardening measures are non-negotiable for v1, not post-v1.

### **Network Isolation**

The Playwright browser context must have all network access disabled. Every request is intercepted and aborted. This prevents Server-Side Request Forgery (SSRF) where a malicious image tag or CSS url() could probe internal network endpoints.

const context = await browser.newContext();

await context.route('\*\*/\*', route => route.abort());

// Alternatively, use Playwright's offline mode:

// await context.setOffline(true);

### **Resource Limits**

• **Max HTML size.** Maximum 500KB of HTML per slide. Reject before rendering.

• **Max DOM nodes.** Maximum 5,000 DOM nodes per slide. Prevents exponential layout computation.

• **Max base64 assets.** Maximum 2MB of base64-encoded image data per slide.

• **Render timeout.** 10-second maximum per slide render. Kill the browser context if exceeded. Prevents SVG filter bombs and recursive CSS layout exploits.

• **Memory ceiling.** Maximum 512MB memory per browser context. Prevents intentional memory exhaustion.

### **Container Isolation**

In production, the renderer runs in a dedicated container with restricted capabilities: no filesystem access beyond the output directory, no capability to spawn child processes, and tight seccomp/AppArmor profiles. The container has no access to the MCP server's internal state beyond the rendering API.

The Slide HTML Contract's prohibition on external network dependencies and JavaScript for layout means that a fully sandboxed render produces identical output to an unsandboxed one. Security doesn't degrade quality.

## **Performance: Caching and Browser Pooling**

For real usage, re-rendering all slides on every change is wasteful. Users iterate on 2-5 slides at a time, and the rest are stable. The caching and pooling strategies below turn the pipeline from a demo into a daily-driver tool.

### **Slide-Level Render Cache**

Every rendered image is cached using a composite key:

cache_key = sha256(

slide_html +

soul_id +

render_width +

render_height +

image_format +

quality_setting

);

When a slide is unchanged (same HTML hash), its cached image is reused for preview and export. When the agent updates a slide, only that slide is re-rendered. A 70-slide deck where 3 slides are modified re-renders 3 slides, not 70. Cache entries are evicted on an LRU basis with a configurable maximum size (default 500MB).

### **Incremental Preview**

The render_preview tool maintains a deck-level thumbnail strip composed from cached per-slide thumbnails. When a single slide is updated, only its thumbnail is re-rendered and spliced into the strip. The agent receives a complete deck overview without waiting for a full re-render.

### **Browser Instance Pooling**

Chromium instances are memory-heavy (~80-150MB each). The renderer maintains a fixed pool of browser contexts (default: 4 concurrent) with a queue for overflow. This prevents memory exhaustion during large deck exports while allowing parallel rendering for throughput.

class BrowserPool {

private pool: BrowserContext\[\] = \[\];

private maxSize = 4;

private queue: Array&lt;{ resolve, reject }&gt; = \[\];

async acquire(): Promise&lt;BrowserContext&gt; {

if (this.pool.length < this.maxSize) {

const ctx = await this.browser.newContext();

this.pool.push(ctx);

return ctx;

}

// Queue the request until a context is released

return new Promise((resolve, reject) => {

this.queue.push({ resolve, reject });

});

}

release(ctx: BrowserContext) {

if (this.queue.length > 0) {

const { resolve } = this.queue.shift()!;

resolve(ctx);

}

}

}

### **Image Format Heuristics**

Not all slides benefit from the same image format. The exporter selects automatically:

• **PNG.** For slides with flat backgrounds, text, and vector-like elements (cards, shapes, icons). Produces sharp edges and readable text. Larger file size but no compression artifacts.

• **JPEG.** For slides with photographic backgrounds, complex gradients, or embedded raster images. At 85-90% quality, file size is 50-70% smaller than PNG with negligible visual difference.

• **WebP.** Available in preview-only mode for faster thumbnail transmission.

The heuristic analyzes the slide HTML: if the stylesheet contains linear-gradient, radial-gradient, or base64-encoded images larger than 50KB, JPEG is selected. Otherwise PNG. The agent or user can override with an explicit format parameter.

# **Success Criteria**

These metrics determine whether the Pengui Slides MCP Server transitions from prototype to core infrastructure. They should be measured during the integration testing phase (Phase 5) and continuously after launch.

## **Iteration Loop Speed**

**Target:** Under 5 seconds from user feedback to updated preview. This includes agent reasoning (∼2-3s for LLM completion), MCP validation (∼50ms for Stage 1), and preview rendering (∼800ms for one slide). If the loop exceeds 10 seconds, users will perceive the system as sluggish rather than collaborative.

## **Soul Compliance Rate**

**Target:** 80%+ of slides pass validation on the first attempt; 95%+ by the second attempt. This is the most important metric for the Design Soul concept. If the agent is burning 5+ validation loops per slide, either the soul is too strict (too many hard errors on reasonable output), the skeleton isn't giving enough structure, or the token system is poorly designed. A first-attempt compliance rate below 60% signals a fundamental problem.

## **Deck Consistency Score**

**Target:** Variance in validation score across all slides in a deck should be below 0.1 (on a 0.0-1.0 scale). A 30-slide deck should look like one coherent document, not a collection of individually generated pages. Low variance indicates the soul + skeleton system is producing consistent output.

## **Export Acceptance**

**Target:** Users accept the non-editable PPTX format for 80%+ of use cases. If users consistently request editable text, accelerate the hybrid export roadmap (v1.5). If they accept image-based slides because the visual quality is worth the tradeoff, the core bet is validated.

## **Reuse Loop**

**Target:** Within 3 months of production use, at least 20% of new slides should incorporate content retrieved from previous decks via RAG. This measures whether the metadata system creates genuine compounding value or whether it's inert data. The metric also validates the metadata schema's usefulness for semantic retrieval.

## **Rendering Quality**

**Target:** When shown an AI-generated PPTX alongside a designer-created PPTX (both using the same soul), evaluators should be unable to distinguish which is which at least 40% of the time. This is the ultimate quality bar: the pipeline must produce output that reads as "professionally designed," not "AI-generated."

# **v1 Implementation Roadmap**

The v1 scope focuses on the core loop: design soul registration, slide generation with validation, preview rendering, and PPTX export. No WYSIWYG editor, no interactivity, no multi-agent coordination. Those are post-v1 expansions documented in the final section.

## **Implementation Phases**

### **Phase 1: Core MCP Server (Days 1-2)**

• TypeScript MCP server with @modelcontextprotocol/sdk

• Tool registration for all defined tools

• In-memory state management for decks and slides

• File-system-based Design Soul storage

• Basic add_slide, get_slide, get_deck_summary tools working end-to-end

### **Phase 2: Design Soul System (Days 2-3)**

• Design Soul JSON schema definition and parser

• register_design_soul and get_design_soul tools

• Skeleton template generation on soul approval

• At least one production-quality soul (the "cozy-premium" soul from this document)

### **Phase 3: Validation Engine (Days 3-4)**

• jsdom-based HTML parser with style extraction

• Color palette compliance checker

• WCAG contrast ratio calculator

• Typography and spacing validators

• Structured issue reporting with severity levels

### **Phase 4: Rendering, Export, and Security (Days 4-5)**

• Playwright integration for HTML-to-PNG rendering

• PptxGenJS assembly with metadata injection into slide notes

• render_preview tool for thumbnail generation

• export_pptx tool with configurable resolution and format

• export_pdf via Playwright's page.pdf()

• Renderer security hardening: network disabled, resource limits, render timeouts

• Slide-level render cache keyed by (html_hash, soul_id, render_opts)

• Browser instance pooling with concurrency limits

### **Phase 5: Integration Testing and Success Criteria (Days 5-6)**

• End-to-end test: PenguiFlow agent creates a 5-slide deck using the MCP

• Validation loop test: agent receives issues and self-corrects

• Html.svelte preview rendering verification

• Export quality verification across PPTX, PDF, HTML

• Performance benchmarks: time per slide, total deck generation time

• Baseline measurement of all success criteria (iteration speed, compliance rate, consistency variance)

### **Phase 6: Polish and Documentation (Days 6-7)**

• Error handling for all edge cases (malformed HTML, missing souls, empty decks)

• Logging and observability

• README with setup instructions and example usage

• Design Soul authoring guide for non-technical users

# **Post-v1 Scratchpad: Future Expansions**

_This section is an intentionally informal collection of ideas, architectures, and exploration paths for versions beyond v1. These are not commitments-they're documented here so the thinking doesn't get lost and so future implementation can build on validated hypotheses._

## **Interactivity via MCP Apps**

MCP Apps allow the MCP server to serve interactive HTML interfaces directly within the PenguiFlow playground. Instead of the static srcdoc preview, the MCP could serve a lightweight slide editor that communicates back to the server.

The vision: the agent generates a slide, it appears in an MCP App iframe. The user clicks on a text element and types directly. They drag a card to reposition it. Each edit sends a structured message back to the MCP server (via postMessage or WebSocket), which updates the slide HTML in the deck state. The agent can then be re-invoked with the updated HTML as context.

Key technical considerations for this approach:

• **Communication model.** MCP App iframes communicate with the server, not the agent directly. Edits update server-side state; the agent reads updated state on next invocation.

• **State synchronization.** Each edit must produce valid HTML that the agent can understand. If the user drags an element, the inline style positions must be updated in a way the agent can reason about.

• **Undo/redo.** Undo/redo must be managed in the MCP App client-side (command stack pattern), with the server only storing the latest committed state.

• **Progressive enhancement.** Start with text-only editing (click to edit, contenteditable). Add drag/resize later. Don't try to build a full WYSIWYG in the first pass.

## **Full WYSIWYG in Svelte**

Beyond MCP Apps, the ultimate vision is a dedicated Svelte-based slide editor that replaces the iframe entirely. This would be a first-class PenguiFlow component, not a sandboxed iframe.

Recommended technology stack for the editor:

• **Moveable.js (by daybrush).** Framework-agnostic drag/resize/rotate/snap library. Wraps cleanly into Svelte actions or components.

• **TipTap or Lexical.** Headless rich text editor with Svelte bindings. Handles bold, italic, font size, color, alignment inside slide text elements.

• **Element model.** Each slide is an array of elements: { id, type, x, y, width, height, rotation, content, style }. This is the shared state between the visual editor and the agent. Both read and write the same model.

• **Svelte stores.** The slide model lives in a Svelte writable store. The canvas, property panel, toolbar, and layer list all subscribe. Agent tool calls write to the same store.

Estimated effort with agentic development velocity: 5-7 days for a functional MVP (canvas, drag, resize, text editing, property panel, slide navigation, agent integration, PPTX export).

## **Design Soul Marketplace / Creator UI**

Currently, Design Souls are authored as JSON documents by technical users. A creator UI would allow business users (designers, brand managers) to build souls visually:

• **Color picker with palette generation.** Live color picker with auto-generated palette variations, contrast ratio preview, and dark/light mode toggling.

• **Typography studio.** Font selection from a curated library with real-time preview on a sample slide. Shows the complete type scale (headline, body, label, caption) side by side.

• **Spacing configurator.** Visual spacing scale builder. Drag sliders for margin, padding, gaps. Preview updates a sample slide in real time.

• **Preview gallery.** Apply the soul to 3-4 sample slide layouts and see how it looks before approving. Compare two souls side by side.

• **Marketplace.** Share souls with a URL or embed code. Rate and discover community souls. Fork and customize.

## **Hybrid PPTX Export (Editable Text)**

The v1 pipeline produces image-based slides-beautiful but non-editable. The hybrid approach layers editable PptxGenJS text boxes on top of image backgrounds:

**1\.** Render the full slide to PNG (as in v1).

**2\.** Remove text elements from the HTML (replace with transparent placeholders).

**3\.** Re-render to get a text-free background image.

**4\.** Use PptxGenJS to place the background image, then add native text boxes at the same coordinates and with matching font properties.

**5\.** The result: beautiful CSS backgrounds, gradients, and shapes rendered as images; text remains editable in PowerPoint.

Challenge: coordinate mapping between CSS pixel positions and PowerPoint's inch-based system. Solvable with a conversion factor (1920px = 13.333 inches, so 1px = 0.00694 inches).

## **Multi-Format Templates**

Once the skeleton system is in place, it generalizes beyond presentations:

• **PDF reports.** Same Design Soul, different skeleton. The soul defines colors, typography, and spacing; the skeleton defines the page layout (margins, columns, header/footer). Export via Playwright page.pdf().

• **Email templates.** Design Soul applied to email-safe HTML. Skeletons with table-based layouts for email client compatibility. Export as HTML or via MJML.

• **Landing pages.** Design Soul becomes a website theme. Skeletons for hero sections, feature grids, pricing tables. Export as static HTML/CSS.

• **Social media cards.** Design Soul applied to social media canvas sizes (1080×1080 for Instagram, 1200×628 for LinkedIn). Single-slide decks exported as PNG/JPEG.

In every case, the architecture is identical: Design Soul (brand) + Skeleton (structure) + Agent (content) + Export Pipeline (format). One system, unlimited outputs.

## **RAG-Powered Deck Continuity**

Once the metadata system is ingesting slides into a RAG store, new possibilities open:

• **Slide versioning.** "Update Q4 deck with Q1 numbers" → agent retrieves Q4 slide metadata, understands the structure and data points, generates new slides with updated values using the same Design Soul.

• **Cross-deck search.** Agent searches the RAG store for relevant slides from past decks and suggests reusing or adapting them. "We presented similar metrics in the October investor deck-want me to use the same layout?"

• **Data lineage tracking.** When the user updates a data point that appears across multiple decks, the system can identify all affected slides and suggest batch updates.

• **Presentation analytics.** Analyze which slide types, layouts, and color choices generate the most engagement (based on user feedback or view metrics). Feed insights back into skeleton selection.

## **Collaborative Workflows**

The MCP server's deck state management naturally extends to multi-user scenarios:

• **Concurrent editing.** Multiple agents or users can work on different slides of the same deck concurrently. The MCP server handles slide-level locking and merge conflict resolution.

• **Review workflows.** Before export, route the deck through an approval flow: designer reviews brand compliance, stakeholder reviews content, legal reviews claims. Each reviewer can annotate slides with feedback that the agent incorporates.

• **Version branching.** Different users generate slide variants (e.g., three different opening slides). The team picks the best one. The agent learns from the selection.

_End of Document_

Pengui Slides MCP Server - Architecture v1.0 - February 2026