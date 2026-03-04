# Pengui Slides - Complete Architecture Overview

## Project Structure

```
pengui-slides/
├── src/
│   ├── types/           # Type definitions
│   │   ├── common.ts    # Branded ID types (SoulId, DeckId, SlideId, RevisionId, TemplateId)
│   │   ├── design-soul.ts   # DesignSoul, SoulLayers (7 layers), LayoutRecipe
│   │   ├── deck.ts      # Deck, Slide, DeckRevision, DeckSummary
│   │   └── export.ts    # RenderOptions, ExportResult, ExportFormat
│   │
│   ├── storage/         # Storage abstraction layer
│   │   ├── interfaces.ts   # ISoulStore, IDeckStore, ISlideStore interfaces
│   │   ├── factory.ts      # createStorage() - returns StorageProvider
│   │   ├── file/           # File-based implementations
│   │   │   ├── soul-store.ts
│   │   │   ├── deck-store.ts
│   │   │   └── slide-store.ts
│   │   └── memory/         # In-memory implementations
│   │       ├── soul-store.ts
│   │       ├── deck-store.ts
│   │       └── slide-store.ts
│   │
│   ├── domain/          # Business logic
│   │   ├── souls/       # Soul management
│   │   │   ├── soul-service.ts
│   │   │   ├── token-generator.ts
│   │   │   ├── utility-css-generator.ts
│   │   │   ├── style-guide-generator.ts
│   │   │   └── recipe-generator.ts
│   │   │
│   │   ├── decks/       # Deck and slide management
│   │   │   ├── deck-service.ts
│   │   │   └── revision-tracker.ts
│   │   │
│   │   ├── validation/  # Slide validation
│   │   ├── metadata/    # Metadata parsing/embedding
│   │   └── rendering/   # Rendering and export
│   │       ├── render-service.ts     # Main orchestrator (lazy initialization)
│   │       ├── slide-renderer.ts     # Individual slide rendering
│   │       ├── preview-renderer.ts   # Preview thumbnails
│   │       ├── html-exporter.ts      # HTML export
│   │       ├── pdf-exporter.ts       # PDF export
│   │       ├── pptx-exporter.ts      # PPTX export
│   │       └── playwright-pool.ts    # Browser pool management
│   │
│   ├── tools/           # MCP tools
│   │   ├── index.ts        # registerAllTools() - exports register function
│   │   ├── _shared/        # Shared utilities
│   │   │   ├── schemas.ts  # Zod schemas for validation
│   │   │   ├── responses.ts  # textResponse(), errorResponse()
│   │   │   └── error-handler.ts
│   │   ├── souls/          # 5 soul tools
│   │   ├── decks/          # 7 deck tools
│   │   ├── validation/     # 1 validation tool
│   │   └── export/         # 4 export tools
│   │
│   ├── infrastructure/   # Utilities
│   │   ├── logger.ts
│   │   ├── id-generator.ts
│   │   ├── hash.ts
│   │   ├── clock.ts
│   │   └── index.ts (re-exports)
│   │
│   ├── container.ts      # Dependency injection container
│   └── config.ts         # Configuration interface and defaults
│
├── tests/
│   ├── unit/
│   ├── integration/
│   └── helpers/
│
└── package.json

```

## Key Type System

### Branded ID Types (src/types/common.ts)
- **SoulId**: Design Soul identifier (string branded type)
- **DeckId**: Presentation deck identifier
- **SlideId**: Individual slide identifier
- **RevisionId**: Deck revision identifier
- **TemplateId**: Layout recipe identifier
- Factory functions: soulId(), deckId(), slideId(), revisionId(), templateId()
- **ISOTimestamp**: string type for ISO 8601 timestamps

### DesignSoul (src/types/design-soul.ts)
- Entity with 7 layers of visual identity:
  1. **ColorLanguage**: Base colors, text colors, accents, semantic colors
  2. **Typography**: Fonts, sizes (hero, h1-h3, body, label, caption), weights, line heights
  3. **Spacing**: Base unit + xs, sm, md, lg, xl, xxl, xxxl + safe area inset
  4. **ShapeRadius**: Border radius for none, sm, md, lg, xl, full + component-specific
  5. **DepthShadow**: Shadows (none, soft, medium, elevated, inner) + border width/opacity
  6. **ComponentTokens**: Padding and sizing for cards, buttons, inputs, badges
  7. **MotionTone**: Animation durations, easing curves, design voice (northStar, do/dont rules)
- Generated content: cssTokens string, tokenNames array, allowedFonts, utilityCss, styleGuide
- Status: 'draft' | 'approved' | 'archived'
- **LayoutRecipe**: Reusable slide templates with HTML, metadata, source tracking

### Deck and Slide (src/types/deck.ts)
- **Deck**: soulId, title, author, slideIds[], timestamps
- **Slide**: deckId, position, html, metadata, lastValidation, timestamps
- **DeckRevision**: Tracks mutations (deck_created, slide_added/updated/removed, slides_reordered)
- **DeckSummary**: Lightweight version without HTML bodies
- **SlideSummary**: Position, title, type, validation status, style score

### Export Types (src/types/export.ts)
- **ExportFormat**: 'pptx' | 'pdf' | 'html'
- **ImageFormat**: 'png' | 'jpeg'
- **PdfMode**: 'image' (render to PNG first) | 'direct' (use page.pdf())
- **RenderOptions**: width, height, deviceScaleFactor, format, quality
- **PreviewOptions**: width, height, format, quality (defaults 480x270)
- **ExportResult**: format, data (Buffer), mimeType, filename, slideCount, fileSizeBytes, exportedAt

## Storage Architecture

### Interfaces (src/storage/interfaces.ts)
All methods return Promises for abstraction:
- **ISoulStore**: save, get, list(filter), delete, saveRecipes, getRecipes, addRecipe
- **IDeckStore**: save, get, list, delete, addRevision, getRevisions(limit)
- **ISlideStore**: save, get, getByDeck, delete, deleteByDeck

### Factory (src/storage/factory.ts)
- `createStorage(persistDir?)` returns StorageProvider
- If persistDir provided → file-based stores
- Otherwise → in-memory stores

### File-Based Implementations
**FileSoulStore**:
- Stores souls: `<baseDir>/souls/<soulId>.json`
- Stores recipes: `<baseDir>/souls/<soulId>.recipes.json`
- Falls back to legacy `.skeletons.json`
- Uses JSON serialization with deep cloning

**FileDeckStore**:
- Stores decks: `<baseDir>/decks/<deckId>.json`
- Stores revisions: `<baseDir>/decks/<deckId>.revisions.json`
- Revisions sorted by createdAt descending

**FileSlideStore**:
- Stores slides: `<baseDir>/slides/<slideId>.json`
- Similar pattern to others

### In-Memory Implementations
- **InMemorySoulStore**, **InMemoryDeckStore**, **InMemorySlideStore**
- Use Map<string, T> internally
- Deep clone on read/write to prevent mutation bugs
- Same interface as file-based versions

## Dependency Injection Container (src/container.ts)

### ServiceContainer interface
```typescript
{
  config: PenguiConfig
  logger: Logger
  clock: Clock
  
  // Stores
  soulStore: ISoulStore
  deckStore: IDeckStore
  slideStore: ISlideStore
  
  // Services
  soulService: SoulService
  deckService: DeckService
  validationService: ValidationService
  metadataParser: MetadataParser
  metadataEmbedder: MetadataEmbedder
  metadataExporter: MetadataExporter
  renderService: RenderService
}
```

### createContainer(config)
- Creates Logger (with child loggers for each component)
- Creates Clock (system or fixed)
- Initializes storage layer via factory (uses config.persistDir)
- Instantiates all domain services with their dependencies
- Returns fully wired container

## Domain Services

### SoulService (src/domain/souls/soul-service.ts)
- `register(input)`: Creates draft soul, generates tokens/CSS/styleGuide
- `approve(soulId)`: Validates soul is draft, generates layout recipes, transitions to approved
- `list(statusFilter?)`: List souls by status
- `get(soulId, includeRecipes?)`: Retrieve soul ± recipes
- `saveAsTemplate(soulId, slideId, name, tags, description)`: Save validated slide as reusable recipe

**Token Generation**:
- Converts soul layers to CSS custom properties
- Generates utility CSS library
- Generates LLM-consumable style guide
- Extracts allowed fonts

### DeckService (src/domain/decks/deck-service.ts)
- `createDeck(input)`: Create empty deck linked to soul
- `addSlide(input)`: Add slide at position, auto-fills metadata provenance
- `updateSlide(input)`: Update HTML and/or metadata
- `getSlide(id)`: Retrieve single slide
- `removeSlide(deckId, slideId)`: Remove and delete slide
- `reorderSlides(deckId, newOrder)`: Reorder all slides
- `getDeckSummary(deckId)`: Lightweight summary without HTML

**Metadata Auto-filling**:
- Generates: generatedAt, soulId, deckId, position, metaVersion, revisionHash (SHA256 of HTML)
- Preserves: title, type, narrative, keyPoints, dataPoints, tags, audience, confidentiality, sources

**Revision Tracking**:
- Every mutation (deck_created, slide_added/updated/removed, slides_reordered) creates DeckRevision
- Revisions store contentHash and slideIdsSnapshot
- Revisions retrieved sorted by createdAt descending

## Rendering Architecture (src/domain/rendering/)

### RenderService (render-service.ts) - Main Orchestrator
- Lazy initialization of sub-components (created on-demand)
- `renderPreview(slides, options?)`: Render thumbnails
- `exportPptx(slides, deckTitle, options?)`: Export to PowerPoint
- `exportPdf(slides, deckTitle, mode?)`: Export to PDF
- `exportHtml(slides, deckTitle, includeNavigation?)`: Export to HTML
- `shutdown()`: Release browser resources

Lazy-initialized components:
- PlaywrightPool
- SlideRenderer
- PreviewRenderer
- PptxExporter
- PdfExporter
- HtmlExporter

### SlideRenderer (slide-renderer.ts)
- Renders single HTML slide to screenshot buffer
- Uses Playwright page from pool
- `render(html, slideId, options?)`: Returns SlideRenderResult
- Waits 100ms for CSS/fonts to resolve
- Supports PNG/JPEG with optional quality setting

### HtmlExporter (html-exporter.ts)
- Produces self-contained HTML file with keyboard navigation
- `export(slides, deckTitle, includeNavigation?)`: Returns ExportResult
- Features:
  - Extracts styles/links from each slide's full HTML
  - Scopes CSS to individual slide sections (prevents collisions)
  - Generates JavaScript for arrow/space key navigation
  - Optional slide counter overlay (bottom-right)
  - Responsive scaling to viewport
  - Deduplicates <link> tags (Google Fonts, etc.)

### PdfExporter (pdf-exporter.ts)
- Two export modes:
  - **'image'**: Render each slide to PNG → combine into PDF with full-bleed images
  - **'direct'**: Combine HTML with CSS page breaks → use page.pdf()
- `export(slides, deckTitle, mode?)`: Returns ExportResult
- Slide dimensions: 1920x1080
- Margin: 0 (full bleed)

### PreviewRenderer (preview-renderer.ts)
- Renders slides as preview thumbnails (default 480x270)
- Returns PreviewResult with base64-encoded images

### PlaywrightPool (playwright-pool.ts)
- Browser pool management for efficient resource usage
- `getPage()`: Obtain page from pool or create new one
- `releasePage(page)`: Return page to pool
- `shutdown()`: Close browser context

## MCP Tools Structure

### Tools Index (src/tools/index.ts)
- `registerAllTools(server, container)`: Registers all 17 tools
- Tools organized by domain:
  - 5 soul tools
  - 7 deck tools
  - 1 validation tool
  - 4 export tools

### Tool Registration Pattern
Each tool file exports `register<ToolName>Tool(server, container)` function:
1. Calls `server.registerTool(name, { title, description, inputSchema }, handler)`
2. inputSchema is Zod schema with descriptions
3. Handler receives parsed input, calls services via container
4. Returns `textResponse(data)` or `handleToolError(error)`

### Soul Tools
1. **register_design_soul**: Register draft soul with 7 layers
2. **approve_design_soul**: Approve draft → approved, generate recipes
3. **list_design_souls**: List souls with optional status filter
4. **get_design_soul**: Get soul with optional recipes
5. **save_as_template**: Save validated slide as reusable recipe

### Deck Tools
1. **create_deck**: Create empty deck linked to soul
2. **add_slide**: Add slide to deck
3. **update_slide**: Update slide HTML/metadata
4. **get_slide**: Retrieve slide
5. **remove_slide**: Delete slide from deck
6. **reorder_slides**: Reorder all slides
7. **get_deck_summary**: Get lightweight deck summary

### Export Tools
1. **render_preview**: Render slide thumbnails
2. **export_pptx**: Export to PowerPoint
3. **export_pdf**: Export to PDF (image or direct mode)
4. **export_html**: Export to self-contained HTML

### Shared Utilities (src/tools/_shared/)
- **schemas.ts**: Zod schemas for all layer types and IDs
- **responses.ts**: `textResponse(data)`, `errorResponse(message, code)`
- **error-handler.ts**: `handleToolError(error)` - catches errors, returns error response

## Configuration (src/config.ts)

### PenguiConfig interface
```typescript
{
  serverName: string          // "pengui-slides"
  version: string             // "0.1.0"
  slideWidth: number          // 1920
  slideHeight: number         // 1080
  safeAreaInset: number       // 48
  previewWidth: number        // 480
  previewHeight: number       // 270
  styleScoreThreshold: number // 0.8
  maxRevisionsPerSlide: number // 10
  logLevel: 'debug'|'info'|'warn'|'error'
  outputDir: string           // "./output"
  headless: boolean           // true
  persistDir?: string         // Optional file persistence
  transport: 'stdio'|'http'   // "stdio"
  httpHost: string            // "127.0.0.1"
  httpPort: number            // 3000
}
```

### Default config + loadConfig()
- `defaultConfig`: All defaults listed above
- `loadConfig(overrides?)`: Merges overrides with defaults

## Infrastructure

### Logger (src/infrastructure/logger.ts)
- Singleton instance per component
- `logger.child(component)`: Create child logger
- Methods: debug(), info(), warn(), error()
- Accepts structured data as second argument

### ID Generation (src/infrastructure/id-generator.ts)
- `generateSoulId()`, `generateDeckId()`, `generateSlideId()`, `generateRevisionId()`, `generateTemplateId()`
- UUIDs are cast to branded types
- Re-exported from index.ts

### Hashing (src/infrastructure/hash.ts)
- `sha256(content)`: Hash string to hex
- `hashSlideContents(contents)`: Hash combined HTML

### Clock (src/infrastructure/clock.ts)
- `Clock` interface: `now()` returns ISOTimestamp
- `SystemClock`: Uses actual system time
- `FixedClock`: Fixed time for testing
- `systemClock`: Singleton instance
- Re-exported from index.ts

## Key Design Patterns

### 1. Branded Types
- Compile-time type safety without runtime overhead
- `declare const __brand: unique symbol`
- `type SoulId = Brand<string, 'SoulId'>`

### 2. Storage Abstraction
- Interfaces decouple domain from implementation
- Factory pattern switches between file/memory at startup
- All methods return Promises for async-first design

### 3. Deep Cloning
- Every store read/write clones via JSON serialization
- Prevents external mutation of stored objects

### 4. Lazy Initialization
- RenderService creates sub-components on-demand
- Reduces startup time and resource usage
- Proper cleanup via shutdown()

### 5. MCP Tool Pattern
- Each tool is self-contained with validation schema
- Shared error handling and response formatting
- Container injection of all services

### 6. Revision Tracking
- Every mutation creates immutable revision snapshot
- Enables history/rollback capability
- Content hash enables diff detection

### 7. Metadata Provenance
- Auto-fills slide metadata on creation/update
- Tracks soulId, deckId, position, generation time
- Revision hash of HTML for content tracking

## Configuration Patterns

### Persistence
- `persistDir` determines storage backend
- If set: file-based with JSON serialization
- If undefined: in-memory with Maps

### Rendering
- `headless: true` for CI/server
- Preview dimensions: 480x270 (16:9 aspect)
- Slide dimensions: 1920x1080

### Logging
- Four levels: debug, info, warn, error
- Child loggers per component for context
- Structured logging with data objects

## Summary

**Pengui Slides** is a well-architected MCP server for presentation management built on:

1. **Type Safety**: Branded types prevent ID confusion at compile time
2. **Abstraction**: Storage interfaces decouple domain from persistence
3. **Modularity**: Clear separation between domain/infrastructure/tools
4. **DI Container**: ServiceContainer wires all components together
5. **MCP Tools**: 17 tools (souls, decks, validation, export) with Zod validation
6. **Rendering**: SlideRenderer + HtmlExporter/PdfExporter/PptxExporter for exports
7. **Lazy Loading**: RenderService initializes components on-demand
8. **Revision Tracking**: Every deck mutation creates immutable revision snapshot
9. **Metadata**: Auto-fills provenance and revision hashes on slide operations
10. **Configuration**: Unified config object controls behavior across components

The architecture supports both in-memory and file-based persistence, enabling use as a sidecar (stdio) or remote server (http) with full flexibility in deployment.
