#!/usr/bin/env -S npx tsx
/**
 * Galici reference rebuild — re-author the 17-slide
 * `output/real_life_examples/Propuesta Galici - PPT.pdf` from scratch
 * through the pengui engine (the same surface the MCP tools call into).
 *
 * Goal: prove the v4.13–v4.17 catalog can express the design-team
 * reference deck end-to-end, and produce a side-by-side PDF / PPTX /
 * editable-PPTX bundle the boss can compare against the original.
 *
 * Run:  npx tsx scripts/galici-rebuild.mts
 * Out:  output/galici_rebuild/
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Logger } from '../src/infrastructure/logger.js';
import { Clock } from '../src/infrastructure/clock.js';
import { PlaywrightPool } from '../src/domain/rendering/playwright-pool.js';
import { SlideRenderer } from '../src/domain/rendering/slide-renderer.js';
import { PdfExporter } from '../src/domain/rendering/pdf-exporter.js';
import { PptxExporter } from '../src/domain/rendering/pptx-exporter.js';
import { EditablePptxExporter } from '../src/domain/rendering/editable-pptx-exporter.js';
import { SlideDocumentService } from '../src/domain/documents/slide-document-service.js';
import {
  compileSlideIRToHtml,
  lintFlowDensity,
  lintNodesForMode,
} from '../src/domain/ir/index.js';
import { resolveChartRefs } from '../src/domain/rendering/chart-resolver.js';
import { resolveAssetRefs } from '../src/domain/assets/asset-resolver.js';
import { AssetService } from '../src/domain/assets/asset-service.js';
import { InMemoryAssetStore } from '../src/storage/memory/asset-store.js';
import { generateTokens } from '../src/domain/souls/token-generator.js';
import { buildFontFaceCss } from '../src/domain/souls/font-registry.js';
import { getFormat, DEFAULT_FORMAT } from '../src/domain/formats/format-registry.js';
import type { SlideIR, DeckChrome } from '../src/domain/ir/index.js';
import type { Slide } from '../src/types/deck.js';
import type { DeckId, SlideId } from '../src/types/common.js';
import type { SoulLayers, DesignSoul } from '../src/types/design-soul.js';
import { soulId } from '../src/types/common.js';

// ── Galici Soul ─────────────────────────────────────────────────
//
// Palette extracted from the reference PDF: dark navy canvas with a
// subtle radial glow, mint accent for the brand line ("Cuentas
// Provinciales" green), Galicia orange as the warm accent. Inter for
// display + body, JetBrains Mono for chrome chips. Every accent the
// design uses (warm, info, success, error) maps to a soul token so
// agents can reach for it semantically.

const LAYERS: SoulLayers = {
  color: {
    canvas: '#0a0f1f',           // very dark navy
    surface: '#111933',          // card surface
    surfaceAlt: '#1a2547',       // alt card surface
    border: '#2a3667',           // subtle navy border
    textPrimary: '#f5f7ff',
    textSecondary: '#aab4d6',
    textTertiary: '#6b7aa6',
    textInverse: '#0a0f1f',
    accentPrimary: '#5b8def',    // info blue (the section chip)
    accentSecondary: '#5ce0c8',  // mint teal (the brand line accent)
    accentWarm: '#f97316',       // Galician orange
    success: '#5ce0c8',          // mint = success
    warning: '#facc15',          // amber yellow (slide 7 module 03)
    error: '#ef4444',
    info: '#5b8def',
  },
  typography: {
    fontDisplay: "'Inter', sans-serif",
    fontBody: "'Inter', sans-serif",
    fontMono: "'JetBrains Mono', monospace",
    // Reference deck measurements: hero 64px, H1 44px, H2 40px (the
    // big slide titles), H3 24px (card titles), body 18px. The deck
    // is on a 1920×1080 canvas; previous values were calibrated for
    // a smaller render and felt cramped.
    sizeHero: 64, sizeH1: 44, sizeH2: 40, sizeH3: 24,
    sizeBody: 18, sizeLabel: 13, sizeCaption: 12,
    weightNormal: 400, weightMedium: 500, weightBold: 700,
    lineHeightHeading: 1.15, lineHeightBody: 1.55,
    letterSpacingHeading: '-0.02em', letterSpacingBody: '0em',
  },
  spacing: { baseUnit: 8, xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48, xxxl: 64, safeAreaInset: 56 },
  shape: {
    none: '0', sm: '4px', md: '10px', lg: '14px', xl: '20px', full: '9999px',
    buttonRadius: '8px', cardRadius: '14px', inputRadius: '6px', badgeRadius: '9999px',
  },
  depth: {
    shadowNone: 'none', shadowSoft: '0 1px 3px rgba(0,0,0,0.30)',
    shadowMedium: '0 4px 12px rgba(0,0,0,0.35)',
    shadowElevated: '0 8px 24px rgba(0,0,0,0.45)',
    shadowInner: 'inset 0 2px 4px rgba(0,0,0,0.20)',
    borderWidth: '1px', borderOpacity: 0.1,
  },
  components: {
    cardPadding: '20px', cardShadow: '0 1px 3px rgba(0,0,0,0.30)', cardBorderWidth: '1px',
    buttonPaddingX: '20px', buttonPaddingY: '10px',
    inputPaddingX: '12px', inputPaddingY: '8px', inputBorderWidth: '1px',
    badgePaddingX: '8px', badgePaddingY: '2px',
  },
  motion: {
    durationFast: '100ms', durationNormal: '200ms', durationSlow: '400ms',
    easingDefault: 'ease', easingEmphasized: 'ease-in',
    northStar: '', doRules: [], dontRules: [],
  },
};

// ── Logo SVGs ───────────────────────────────────────────────────
//
// Approximations of the Clear Tech and Galicia marks visible in the
// reference deck footer. These travel as v4.16 'logo' role assets and
// flow into the chrome.footer slots.

const CLEAR_TECH_LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 140 32" width="140" height="32">
  <circle cx="16" cy="16" r="14" fill="none" stroke="#ffffff" stroke-width="2.5"/>
  <path d="M16 8 L16 24 M10 14 L22 14 M10 18 L22 18" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round"/>
  <text x="40" y="22" font-family="Helvetica,Arial,sans-serif" font-size="14" font-weight="700" fill="#ffffff" letter-spacing="2">CLEAR TECH</text>
</svg>`;

const GALICIA_LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 32" width="120" height="32">
  <rect x="2" y="4" width="28" height="24" rx="4" fill="#f97316"/>
  <path d="M16 10 L16 22 M11 16 L21 16 M16 14 L18 12 M16 14 L14 12" stroke="#ffffff" stroke-width="1.5" stroke-linecap="round"/>
  <text x="38" y="22" font-family="Helvetica,Arial,sans-serif" font-size="16" font-weight="700" fill="#f5f7ff">Galicia</text>
</svg>`;

// ── Section chip helper ────────────────────────────────────────
//
// Every Galici body slide opens with a full-width pill chip "NN ·
// SECTION NAME" in mono caps with a thin blue outline. We model it as
// a card with `accent: info` — the v4.13 card chrome already gives us
// the rounded border + accent stripe; the centered mono-caps prose
// inside completes the look. Rendering at H6 level keeps the chip
// tight (no oversized padding).

function sectionLabel(text: string): SlideIR['body'][number] {
  return {
    type: 'card',
    accent: 'info',
    body: [
      {
        type: 'heading',
        level: 6,
        align: 'center',
        text: [{ text, color: 'info' }],
      },
    ],
  };
}

// ── Chrome (slides 2-17) ───────────────────────────────────────
//
// Cover suppresses chrome. Every other slide carries the same dual-logo
// footer. Asset IDs filled in at runtime after upload.

function buildChrome(clearLogoId: string, galiciaLogoId: string): DeckChrome {
  return {
    footer: {
      left: { kind: 'logo', asset_id: clearLogoId, height: 'sm' },
      right: { kind: 'logo', asset_id: galiciaLogoId, height: 'md' },
    },
    showOnCover: false,
  };
}

// ── Slide IR builders — one function per reference slide ───────

// 1. Cover.
function slideCover(): SlideIR {
  return {
    layout: 'centered',
    body: [
      // Subtle radial glow centered behind the hero — the reference
      // deck's atmosphere is restrained, not full-canvas.
      {
        type: 'decoration',
        source: { kind: 'preset', name: 'radial_glow' },
        placement: { anchor: 'middle_center', size: { width: 1100, height: 1100 }, opacity: 0.6 },
        layer: 'background',
        accent: 'accent',
      },
      {
        type: 'hero',
        align: 'center',
        eyebrow: [{ text: 'PROPUESTA COMERCIAL · MAYO 2026' }],
        title: [
          { text: 'Sistema de Control de\n' },
          { text: 'Cuentas Provinciales', color: 'success', bold: true },
        ],
      },
    ],
  };
}

// 2. TOC.
function slideToc(): SlideIR {
  const left: Array<[string, string]> = [
    ['01', 'Resumen Ejecutivo'],
    ['02', 'Situación Actual'],
    ['03', 'Sistema de Control de Cuentas'],
    ['04', 'Módulos y Alcance'],
    ['05', 'Prototipo de la Plataforma'],
  ];
  const right: Array<[string, string]> = [
    ['06', 'Forma de Trabajo'],
    ['07', 'Equipo'],
    ['08', 'Propuesta Comercial'],
    ['09', 'Acerca de Clear Tech'],
  ];
  const tocColumn = (entries: Array<[string, string]>) =>
    entries.map(([num, label]) => ({
      type: 'prose' as const,
      body: [
        { text: `${num}  `, color: 'info' as const },
        { text: label },
      ],
    }));
  return {
    body: [
      sectionLabel('ÍNDICE'),
      { type: 'heading', level: 2, text: [{ text: 'Contenido de la propuesta.' }] },
      {
        type: 'two_column',
        ratio: '1:1',
        gap: 'lg',
        left: tocColumn(left),
        right: tocColumn(right),
      },
    ],
  };
}

// 3. Resumen ejecutivo — prose left + glow ring + shield right.
function slideResumen(): SlideIR {
  return {
    body: [
      sectionLabel('01 · RESUMEN EJECUTIVO'),
      {
        type: 'heading', level: 2, text: [
          { text: 'El Poder Judicial necesita operar sus fondos\ncon el control que su responsabilidad exige.' },
        ],
      },
      {
        type: 'two_column', ratio: '2:1', gap: 'xl' as 'lg',
        left: [
          {
            type: 'prose', body: [
              { text: 'El Poder Judicial administra un volumen significativo de fondos de terceros — embargos, depósitos en litigio, garantías y retenciones — distribuidos en cerca de ' },
              { text: '200.000 cuentas bancarias activas', color: 'success', bold: true },
              { text: ', una por cada expediente judicial.' },
            ],
          },
          {
            type: 'prose', body: [
              { text: 'La operatoria actual no cuenta con los instrumentos necesarios para gestionar ese volumen con el nivel de control, trazabilidad y eficiencia que la naturaleza legal de esos fondos exige.' },
            ],
          },
          {
            type: 'prose', body: [
              { text: 'La solución propuesta centraliza la gestión financiera de los juzgados en una plataforma única: visibilidad en tiempo real, trazabilidad estructural entre expediente y cuenta, flujos formales de autorización y capacidad de inversión sistematizada de los fondos inmovilizados.' },
            ],
          },
          {
            type: 'prose', body: [
              { text: 'El resultado es un sistema diseñado para que el Poder Judicial opere con el nivel de ' },
              { text: 'control, transparencia y seguridad', color: 'accent', bold: true },
              { text: ' que su responsabilidad institucional requiere.' },
            ],
          },
        ],
        right: [
          // Centered shield card with eyebrow underneath — the ring
          // glow comes from the slide-level decoration below so it
          // wraps both the card and any breathing room.
          {
            type: 'card',
            accent: 'success',
            icon: 'shield',
            body: [
              {
                type: 'heading', level: 4, align: 'center',
                text: [{ text: 'Control · Trazabilidad · Seguridad', color: 'success' }],
              },
            ],
          },
        ],
      },
      // Glow ring decoration anchored to the right side as a foreground
      // halo around the shield card.
      {
        type: 'decoration',
        source: { kind: 'preset', name: 'glow_ring' },
        placement: {
          anchor: 'middle_right',
          size: { width: 460, height: 460 },
          offset: { x: -280, y: 0 },
        },
        layer: 'foreground',
        accent: 'success',
      },
    ],
  };
}

// 4. Situación 1/2.
function slideSituacion1(): SlideIR {
  return {
    body: [
      sectionLabel('02 · SITUACIÓN ACTUAL · 1/2'),
      {
        type: 'heading', level: 2, text: [
          { text: 'Una operatoria de alto volumen,\ndescentralizada y manual.' },
        ],
      },
      {
        type: 'two_column', ratio: '1:1', gap: 'xl' as 'lg',
        left: [
          {
            type: 'prose', body: [
              { text: 'El Poder Judicial administra hoy cerca de ' },
              { text: '200.000 cuentas bancarias judiciales', color: 'success', bold: true },
              { text: ', una por cada expediente activo. La operatoria está distribuida entre los juzgados de cada localidad, con esquemas de gestión independientes y sin un sistema centralizado de información.' },
            ],
          },
          {
            type: 'prose', body: [
              { text: 'Como resultado, no existe visión consolidada sobre: ', color: 'accent_warm' },
              { text: 'total de fondos administrados · estado de cuentas · movimientos por expediente · rentabilidad generada.' },
            ],
          },
        ],
        right: [
          {
            type: 'heading', level: 6, text: [{ text: 'LA ADMINISTRACIÓN ACTUAL SE APOYA EN', color: 'accent_warm' }],
          },
          {
            type: 'card', accent: 'accent_warm', icon: 'box',
            body: [{ type: 'prose', body: [{ text: 'Registros manuales y en papel' }] }],
          },
          {
            type: 'card', accent: 'accent_warm', icon: 'grid',
            body: [{ type: 'prose', body: [{ text: 'Planillas de cálculo no integradas' }] }],
          },
          {
            type: 'card', accent: 'accent_warm', icon: 'network',
            body: [{ type: 'prose', body: [{ text: 'Interacción directa juzgado–banco' }] }],
          },
        ],
      },
    ],
  };
}

// 5. Situación 2/2 — 5 challenge cards + 1 highlight card.
function slideSituacion2(): SlideIR {
  return {
    body: [
      sectionLabel('02 · SITUACIÓN ACTUAL · 2/2'),
      {
        type: 'heading', level: 2, text: [
          { text: 'Cinco desafíos críticos: control limitado, riesgo\noperativo y baja optimización financiera.' },
        ],
      },
      {
        type: 'grid', columns: 3, gap: 'md',
        cells: [
          [{
            type: 'card', accent: 'accent_warm', icon: 'workflow',
            eyebrow: [{ text: '01 · TRAZABILIDAD', color: 'accent_warm' }],
            body: [
              { type: 'heading', level: 4, text: [{ text: 'Control fragmentado' }] },
              { type: 'prose', body: [{ text: 'La relación entre expediente y cuenta bancaria no está sistematizada ni auditada de punta a punta.' }] },
            ],
          }],
          [{
            type: 'card', accent: 'info', icon: 'eye',
            eyebrow: [{ text: '02 · VISIBILIDAD', color: 'info' }],
            body: [
              { type: 'heading', level: 4, text: [{ text: 'Operación aislada' }] },
              { type: 'prose', body: [{ text: 'Cada juzgado opera de forma aislada, sin visión unificada del volumen total de fondos administrados.' }] },
            ],
          }],
          [{
            type: 'card', accent: 'warning', icon: 'gauge',
            eyebrow: [{ text: '03 · OPTIMIZACIÓN', color: 'warning' }],
            body: [
              { type: 'heading', level: 4, text: [{ text: 'Fondos ociosos' }] },
              { type: 'prose', body: [{ text: 'Los fondos inmovilizados no cuentan con mecanismos sistemáticos de inversión de corto plazo.' }] },
            ],
          }],
          [{
            type: 'card', accent: 'info', icon: 'lock',
            eyebrow: [{ text: '04 · SEGURIDAD', color: 'info' }],
            body: [
              { type: 'heading', level: 4, text: [{ text: 'Sin flujos formales' }] },
              { type: 'prose', body: [{ text: 'Los movimientos no siguen flujos digitales formales de autorización y firma.' }] },
            ],
          }],
          [{
            type: 'card', accent: 'success', icon: 'bar-chart',
            eyebrow: [{ text: '05 · REPORTERÍA', color: 'success' }],
            body: [
              { type: 'heading', level: 4, text: [{ text: 'Sin tablero ejecutivo' }] },
              { type: 'prose', body: [{ text: 'No existe un tablero para visualizar saldos, cuentas activas, rentabilidad acumulada ni vencimientos próximos.' }] },
            ],
          }],
          [{
            // The standout 200K highlight cell — bigger number,
            // orange-warm-tinted card, no eyebrow. The accent stripe
            // gets re-emphasized via the warm color and the heading
            // dominates the space.
            type: 'card', accent: 'accent_warm',
            body: [
              {
                type: 'heading', level: 1,
                text: [{ text: '200K', color: 'accent_warm', bold: true }],
              },
              {
                type: 'prose',
                body: [{ text: 'cuentas activas operadas hoy sin sistema centralizado', color: 'accent_warm' }],
              },
            ],
          }],
        ],
      },
    ],
  };
}

// 6. Sistema de control — 3 EJE cards.
function slideSistema(): SlideIR {
  return {
    body: [
      sectionLabel('03 · SISTEMA DE CONTROL DE CUENTAS PROVINCIALES'),
      {
        type: 'heading', level: 2, text: [
          { text: 'Una plataforma única para gestionar fondos\njudiciales de forma ' },
          { text: 'integral', color: 'success', bold: true },
          { text: '.' },
        ],
      },
      {
        type: 'prose', body: [
          { text: 'Plataforma web centralizada, desarrollada a medida, que conecta cada expediente judicial con su cuenta bancaria en Banco Galicia, centralizando en un único entorno la operación que hoy se realiza de forma manual, aislada y sin trazabilidad sistematizada.' },
        ],
      },
      {
        type: 'grid', columns: 3, gap: 'md',
        cells: [
          [{
            type: 'card', accent: 'accent', icon: 'trending-up',
            eyebrow: [{ text: 'EJE 01', color: 'accent' }],
            body: [
              { type: 'heading', level: 4, text: [{ text: 'Trazabilidad estructural' }] },
              { type: 'prose', body: [{ text: 'Cada movimiento queda vinculado a un expediente, un juzgado y una cuenta bancaria concreta, con registro inmutable.' }] },
            ],
          }],
          [{
            type: 'card', accent: 'success', icon: 'bar-chart',
            eyebrow: [{ text: 'EJE 02', color: 'success' }],
            body: [
              { type: 'heading', level: 4, text: [{ text: 'Gestión financiera activa' }] },
              { type: 'prose', body: [{ text: 'Los fondos inmovilizados se invierten sistemáticamente en instrumentos de corto plazo, generando rentabilidad medible.' }] },
            ],
          }],
          [{
            type: 'card', accent: 'warning', icon: 'network',
            eyebrow: [{ text: 'EJE 03', color: 'warning' }],
            body: [
              { type: 'heading', level: 4, text: [{ text: 'Control distribuido' }] },
              { type: 'prose', body: [{ text: 'Cada juzgado opera dentro de sus expedientes; el Poder Judicial central mantiene visibilidad global en tiempo real.' }] },
            ],
          }],
        ],
      },
    ],
  };
}

// 7. Módulos y alcance — 4 module cards + warm callout.
function slideModulos(): SlideIR {
  // Each module card uses an oversized number heading (level 1) +
  // small heading for the title + bullet list. The reference deck
  // alternates accent colours per module: 01 info, 02 info, 03
  // success, 04 info — emphasizing the auth-flow module visually.
  const moduleCard = (
    num: string,
    accent: 'accent' | 'success' | 'warning',
    title: string,
    items: string[],
  ): SlideIR['body'][number] => ({
    type: 'card',
    accent,
    body: [
      {
        type: 'heading',
        level: 1,
        text: [{ text: num, color: accent, bold: true }],
      },
      { type: 'heading', level: 5, text: [{ text: title }] },
      {
        type: 'list',
        style: 'bullet',
        items: items.map((item) => [{ text: item }]),
      },
    ],
  });
  return {
    body: [
      sectionLabel('04 · MÓDULOS Y ALCANCE'),
      {
        type: 'heading', level: 2, text: [
          { text: 'Cuatro módulos cubren el ciclo de vida\ncompleto de un fondo judicial.' },
        ],
      },
      {
        type: 'grid', columns: 4, gap: 'md',
        cells: [
          [moduleCard('01', 'accent', 'Gestión de expedientes y cuentas', [
            'Alta y administración con vinculación a cuenta bancaria',
            'Saldos y movimientos en tiempo real vía integración Galicia',
            'Búsqueda por expediente, juzgado, CBU, estado y fecha',
          ])],
          [moduleCard('02', 'accent', 'Administración de fondos e inversiones', [
            'Registro y seguimiento de plazos fijos sobre cuentas',
            'Alertas de vencimiento clasificadas por estado',
            'Rentabilidad por expediente y consolidada por juzgado',
          ])],
          [moduleCard('03', 'success', 'Flujos de autorización y firmas', [
            'Workflow de aprobaciones de movimientos y transferencias',
            'Roles: operador, autorizante, administrador del Poder Judicial',
            'Log de auditoría inmutable: acción, usuario, timestamp, estado',
          ])],
          [moduleCard('04', 'accent', 'Panel de control y reporting', [
            'Vista por juzgado y consolidada para Poder Judicial central',
            'KPIs: fondos bajo gestión, rentabilidad, vencimientos, alertas',
            'Exportación de reportes por juzgado y período',
          ])],
        ],
      },
      // Out-of-scope band — reference deck renders this as a wide dark
      // strip with orange "FUERA DEL ALCANCE" eyebrow to its left and
      // the bulleted exclusions inline. Warning callout maps to the
      // orange-edged surface; mono-cap title + comma-joined body
      // approximates the strip layout.
      {
        type: 'callout', kind: 'warning',
        title: [{ text: 'FUERA DEL ALCANCE', color: 'accent_warm' }],
        body: [
          { text: 'Migración de expedientes preexistentes · Desarrollo de APIs bancarias · Integración con sistemas judiciales existentes · Aplicación móvil nativa' },
        ],
      },
    ],
  };
}

// 8. Prototipo intro — 2 interface cards + framed screenshot.
function slidePrototipoIntro(screenshotId: string): SlideIR {
  return {
    body: [
      sectionLabel('05 · PROTOTIPO DE LA PLATAFORMA'),
      {
        type: 'heading', level: 2, text: [
          { text: 'Una experiencia visual concreta,\nantes del primer commit.' },
        ],
      },
      {
        type: 'prose', body: [
          { text: 'Prototipo de alta fidelidad elaborado previo al desarrollo, que traduce los requerimientos funcionales en una experiencia concreta.' },
        ],
      },
      {
        type: 'two_column', ratio: '1:1', gap: 'lg',
        left: [
          {
            type: 'card', accent: 'accent',
            eyebrow: [{ text: 'INTERFAZ DE JUZGADO', color: 'accent' }],
            body: [
              { type: 'list', style: 'bullet', items: [
                [{ text: 'Acceso acotado a expedientes y cuentas propias' }],
                [{ text: 'Operatoria simple: consulta, carga, solicitud de movimientos' }],
                [{ text: 'Mínima curva de adopción, sin formación técnica' }],
              ] },
            ],
          },
          {
            type: 'card', accent: 'success',
            eyebrow: [{ text: 'INTERFAZ DEL PODER JUDICIAL CENTRAL', color: 'success' }],
            body: [
              { type: 'list', style: 'bullet', items: [
                [{ text: 'Visión consolidada en tiempo real del universo de fondos' }],
                [{ text: 'Indicadores clave, alertas y distribución por juzgado' }],
                [{ text: 'Gestión de autorizaciones de mayor jerarquía' }],
              ] },
            ],
          },
          { type: 'prose', body: [{ text: 'Ambas interfaces comparten el mismo backend con separación de acceso por roles y permisos.', color: 'muted' }] },
        ],
        right: [
          { type: 'image', asset_id: screenshotId, frame: 'browser', caption: [{ text: 'Dashboard administrador.', color: 'muted' }] },
        ],
      },
    ],
  };
}

// 9. Prototipo 1/3 — Login + Dashboard.
function slidePrototipo1(loginId: string, dashboardId: string): SlideIR {
  return {
    body: [
      sectionLabel('05 · PROTOTIPO DE LA PLATAFORMA · 1/3'),
      { type: 'heading', level: 2, text: [{ text: 'Login y Dashboard.' }] },
      {
        type: 'two_column', ratio: '1:1', gap: 'lg',
        left: [
          { type: 'image', asset_id: loginId, frame: 'browser' },
          {
            type: 'card', accent: 'info',
            eyebrow: [{ text: 'PANTALLA 1 · LOGIN', color: 'info' }],
            body: [
              { type: 'prose', body: [{ text: 'Acceso con perfil de usuario. Tres niveles: Operador, Autorizante y Administrador del Poder Judicial. Cada sesión queda registrada en el log de auditoría.' }] },
            ],
          },
        ],
        right: [
          { type: 'image', asset_id: dashboardId, frame: 'browser' },
          {
            type: 'card', accent: 'info',
            eyebrow: [{ text: 'PANTALLA 2 · DASHBOARD', color: 'info' }],
            body: [
              { type: 'prose', body: [{ text: 'Vista consolidada para el Administrador: total de fondos, rentabilidad mensual, autorizaciones pendientes, distribución por juzgado y próximos vencimientos.' }] },
            ],
          },
        ],
      },
    ],
  };
}

// 10. Prototipo 2/3 — Cuentas + Autorizaciones.
function slidePrototipo2(cuentasId: string, authsId: string): SlideIR {
  return {
    body: [
      sectionLabel('05 · PROTOTIPO DE LA PLATAFORMA · 2/3'),
      { type: 'heading', level: 2, text: [{ text: 'Cuentas y Autorizaciones.' }] },
      {
        type: 'two_column', ratio: '1:1', gap: 'lg',
        left: [
          { type: 'image', asset_id: cuentasId, frame: 'browser' },
          {
            type: 'card', accent: 'info',
            eyebrow: [{ text: 'PANTALLA 3 · CUENTAS', color: 'info' }],
            body: [
              { type: 'prose', body: [{ text: 'Listado de expedientes judiciales con filtros, y panel de detalle por cuenta: saldo, movimientos, CBU, CUIT del beneficiario y acciones (generar pago, exportar historial).' }] },
            ],
          },
        ],
        right: [
          { type: 'image', asset_id: authsId, frame: 'browser' },
          {
            type: 'card', accent: 'info',
            eyebrow: [{ text: 'PANTALLA 4 · AUTORIZACIONES', color: 'info' }],
            body: [
              { type: 'prose', body: [{ text: 'Kanban con tres columnas — Pendiente de firma · En revisión · Aprobadas. Cada solicitud muestra expediente, monto y progreso de firmas. Acciones: aprobar, rechazar, ver detalle.' }] },
            ],
          },
        ],
      },
    ],
  };
}

// 11. Prototipo 3/3 — Nueva Cuenta + Nuevo Pago.
function slidePrototipo3(newAccountId: string, newPaymentId: string): SlideIR {
  return {
    body: [
      sectionLabel('05 · PROTOTIPO DE LA PLATAFORMA · 3/3'),
      { type: 'heading', level: 2, text: [{ text: 'Nueva Cuenta y Nuevo Pago.' }] },
      {
        type: 'two_column', ratio: '1:1', gap: 'lg',
        left: [
          { type: 'image', asset_id: newAccountId, frame: 'browser' },
          {
            type: 'card', accent: 'info',
            eyebrow: [{ text: 'PANTALLA 5 · NUEVA CUENTA', color: 'info' }],
            body: [
              { type: 'prose', body: [{ text: 'Alta de expediente: número, CUIT del beneficiario, tipo de juzgado y descripción. La cuenta queda vinculada al CUIT — todos los pagos futuros solo se dirigen a cuentas con ese CUIT.' }] },
            ],
          },
        ],
        right: [
          { type: 'image', asset_id: newPaymentId, frame: 'browser' },
          {
            type: 'card', accent: 'info',
            eyebrow: [{ text: 'PANTALLA 6 · NUEVO PAGO', color: 'info' }],
            body: [
              { type: 'prose', body: [{ text: 'Transferencia con CBU de destino (validado contra el CUIT registrado), monto, concepto y referencia judicial. El pago no se ejecuta directamente: requiere firmas del autorizante y del administrador antes de transmitirse al banco.' }] },
            ],
          },
        ],
      },
    ],
  };
}

// 12. Forma de Trabajo — flow node + table.
function slideTrabajo(): SlideIR {
  return {
    body: [
      sectionLabel('06 · FORMA DE TRABAJO'),
      {
        type: 'heading', level: 2, text: [
          { text: 'Conducción estratégica + ejecución técnica\nincremental con metodología Agile.' },
        ],
      },
      {
        type: 'prose', body: [
          { text: 'Trabajamos con ciclos cortos e iterativos de ' },
          { text: '2 semanas', color: 'success', bold: true },
          { text: '. Cada decisión de prioridad y cada entrega está respaldada por una capa de gestión que garantiza visibilidad, trazabilidad y alineación.' },
        ],
      },
      {
        type: 'flow', direction: 'horizontal', connector: 'cycle',
        steps: [
          { label: [{ text: 'Backlog Grooming' }], accent: 'info', badge: '01' },
          { label: [{ text: 'Sprint Planning' }], accent: 'info', badge: '02' },
          { label: [{ text: 'Sprint Execution + Dailies' }], accent: 'accent', badge: '03' },
          { label: [{ text: 'Review & Retro' }], accent: 'success', badge: '04' },
          { label: [{ text: 'Nuevo Sprint' }], accent: 'success', badge: '05' },
        ],
      },
      {
        type: 'table',
        headers: [
          [{ text: 'INSTANCIA', color: 'info' }],
          [{ text: 'FRECUENCIA', color: 'info' }],
          [{ text: 'OBJETIVO', color: 'info' }],
        ],
        rows: [
          [
            [{ text: 'Backlog Grooming' }],
            [{ text: 'Mensual' }],
            [{ text: 'Revisar, priorizar y refinar el backlog funcional y técnico' }],
          ],
          [
            [{ text: 'Sprint Planning' }],
            [{ text: 'Cada 2 semanas' }],
            [{ text: 'Definir objetivos, alcance y entregables del sprint' }],
          ],
          [
            [{ text: 'Daily Meetings' }],
            [{ text: 'Diario' }],
            [{ text: 'Dar seguimiento a avances, bloqueos y próximos pasos' }],
          ],
          [
            [{ text: 'Sprint Review' }],
            [{ text: 'Fin de sprint' }],
            [{ text: 'Presentar avances al Poder Judicial y recoger feedback' }],
          ],
          [
            [{ text: 'Sprint Retrospective' }],
            [{ text: 'Fin de sprint' }],
            [{ text: 'Identificar mejoras para optimizar el siguiente ciclo' }],
          ],
        ],
      },
    ],
  };
}

// 13. Equipo — two_column with two role tables.
function slideEquipo(): SlideIR {
  return {
    body: [
      sectionLabel('07 · EQUIPO'),
      {
        type: 'heading', level: 2, text: [
          { text: 'Equipo multidisciplinario de ' },
          { text: '6 personas', color: 'success', bold: true },
          { text: '.' },
        ],
      },
      {
        type: 'prose', body: [
          { text: 'El Product Owner es designado por el Poder Judicial, con autoridad para priorizar el backlog a lo largo de todo el proyecto.' },
        ],
      },
      {
        type: 'two_column', ratio: '1:1', gap: 'lg',
        left: [
          {
            type: 'card', accent: 'info',
            eyebrow: [{ text: 'EQUIPO DE PROYECTO · 5 MESES', color: 'info' }],
            body: [
              {
                type: 'table',
                rows: [
                  [[{ text: 'PM — BA' }], [{ text: '1', color: 'info' }]],
                  [[{ text: 'Líder Técnico — Full Stack' }], [{ text: '1', color: 'info' }]],
                  [[{ text: 'Arquitecto de Soluciones' }], [{ text: '1', color: 'info' }]],
                  [[{ text: 'Desarrollador Full Stack' }], [{ text: '1', color: 'info' }]],
                  [[{ text: 'UX/UI' }], [{ text: '1', color: 'info' }]],
                  [[{ text: 'DevOps' }], [{ text: '1', color: 'info' }]],
                  [[{ text: 'Total', color: 'success', bold: true }], [{ text: '6', color: 'success', bold: true }]],
                ],
              },
            ],
          },
        ],
        right: [
          {
            type: 'card', accent: 'info',
            eyebrow: [{ text: 'CÉLULA DE MANTENIMIENTO · 12 MESES', color: 'info' }],
            body: [
              {
                type: 'table',
                rows: [
                  [[{ text: 'PM — BA' }], [{ text: '1', color: 'info' }]],
                  [[{ text: 'Desarrollador Full Stack' }], [{ text: '1', color: 'info' }]],
                  [[{ text: 'Total', color: 'success', bold: true }], [{ text: '2', color: 'success', bold: true }]],
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}

// 14. Propuesta Comercial — pricing table.
function slidePropuestaComercial(): SlideIR {
  return {
    body: [
      sectionLabel('08 · PROPUESTA COMERCIAL'),
      {
        type: 'heading', level: 2, text: [
          { text: 'Inversión total: ' },
          { text: 'USD 232.000', color: 'success', bold: true },
          { text: '.' },
        ],
      },
      {
        type: 'card', accent: 'info',
        body: [
          {
            type: 'table',
            headers: [
              [{ text: 'DESCRIPCIÓN DEL SERVICIO', color: 'info' }],
              [{ text: 'DURACIÓN', color: 'info' }],
              [{ text: 'TOTAL', color: 'info' }],
            ],
            rows: [
              [
                [{ text: 'Sistema de Control de Cuentas Provinciales' }],
                [{ text: '5 meses' }],
                [{ text: 'USD 220.000' }],
              ],
              [
                [{ text: 'Célula de mantenimiento post-producción' }],
                [{ text: '12 meses' }],
                [{ text: 'USD 12.000' }],
              ],
              [
                [{ text: 'TOTAL', color: 'success', bold: true }],
                [{ text: '' }],
                [{ text: 'USD 232.000', color: 'success', bold: true }],
              ],
            ],
          },
        ],
      },
    ],
  };
}

// 15. Acerca de Clear Tech — partners + certifications + about.
function slideAcerca(): SlideIR {
  return {
    body: [
      sectionLabel('09 · ACERCA DE CLEAR TECH'),
      {
        type: 'heading', level: 2, text: [
          { text: 'Capacidad global, certificada,\ncon equipos de expertos en ' },
          { text: '+8 países', color: 'success', bold: true },
          { text: '.' },
        ],
      },
      {
        type: 'prose', body: [
          { text: 'Clear Tech es una compañía especializada en estrategia de datos e implementación tecnológica, con headquarters en Denver, Colorado. Trabajamos con organizaciones de alta complejidad operativa para transformar sus datos en activos de negocio concretos.' },
        ],
      },
      {
        type: 'grid', columns: 3, gap: 'md',
        cells: [
          [{
            type: 'card', accent: 'muted',
            eyebrow: [{ text: 'PARTNERS TECNOLÓGICOS', color: 'muted' }],
            body: [
              { type: 'heading', level: 5, align: 'center', text: [{ text: 'Microsoft Partner' }] },
              { type: 'heading', level: 5, align: 'center', text: [{ text: 'AWS' }] },
              { type: 'heading', level: 5, align: 'center', text: [{ text: 'Google Cloud' }] },
              { type: 'heading', level: 5, align: 'center', text: [{ text: 'Databricks' }] },
            ],
          }],
          [{
            type: 'card', accent: 'success', icon: 'shield',
            eyebrow: [{ text: 'CERTIFICACIONES DE SEGURIDAD', color: 'success' }],
            body: [
              { type: 'heading', level: 3, align: 'center', text: [{ text: 'SOC 2 TYPE 2', color: 'success' }] },
              { type: 'prose', align: 'center', body: [{ text: 'Auditoría de seguridad, disponibilidad y confidencialidad.', color: 'muted' }] },
            ],
          }],
          [{
            type: 'card', accent: 'accent_warm',
            eyebrow: [{ text: 'ACERCA DE NOSOTROS', color: 'accent_warm' }],
            body: [
              {
                type: 'heading', level: 1, align: 'center', text: [
                  { text: '+130 ', color: 'success', bold: true },
                  { text: '+8', color: 'accent_warm', bold: true },
                ],
              },
              { type: 'prose', align: 'center', body: [{ text: 'Expertos · Países', color: 'muted' }] },
              { type: 'prose', align: 'center', body: [{ text: 'Presencia en' }] },
              { type: 'prose', align: 'center', body: [{ text: 'Argentina · USA · México · Uruguay', color: 'success' }] },
            ],
          }],
        ],
      },
    ],
  };
}

// 16. Resultados reales — 4 customer metric cards.
function slideResultados(): SlideIR {
  return {
    body: [
      sectionLabel('09 · ACERCA DE CLEAR TECH'),
      {
        type: 'heading', level: 2, text: [
          { text: 'Resultados reales,\nen clientes ' },
          { text: 'de alta complejidad', color: 'success', bold: true },
          { text: '.' },
        ],
      },
      {
        type: 'grid', columns: 4, gap: 'md',
        cells: [
          [{
            type: 'card', accent: 'success',
            eyebrow: [{ text: 'GRUPO BIMBO', color: 'muted' }],
            body: [
              { type: 'heading', level: 1, text: [{ text: '14.885', color: 'success', bold: true }] },
              { type: 'prose', body: [{ text: 'horas anuales recuperadas' }] },
              { type: 'prose', body: [{ text: 'Automatizamos +58 procesos críticos mediante RPA, transformando carga operativa en ejecución estratégica.', color: 'muted' }] },
            ],
          }],
          [{
            type: 'card', accent: 'success',
            eyebrow: [{ text: 'TTEC', color: 'muted' }],
            body: [
              { type: 'heading', level: 1, text: [{ text: 'USD 2.4M', color: 'success', bold: true }] },
              { type: 'prose', body: [{ text: 'ahorrados' }] },
              { type: 'prose', body: [{ text: 'Plataforma de análisis de datos en tiempo real para optimizar procesos y reducir costos operativos.', color: 'muted' }] },
            ],
          }],
          [{
            type: 'card', accent: 'accent',
            eyebrow: [{ text: 'PLUSPETROL', color: 'muted' }],
            body: [
              { type: 'heading', level: 1, text: [{ text: '75%', color: 'accent', bold: true }] },
              { type: 'prose', body: [{ text: 'menos tiempo de actualización' }] },
              { type: 'prose', body: [{ text: 'Ingesta automatizada de 14 fuentes de mercado críticas, con datos precisos en tiempo real.', color: 'muted' }] },
            ],
          }],
          [{
            type: 'card', accent: 'success',
            eyebrow: [{ text: 'LINKEDIN', color: 'muted' }],
            body: [
              { type: 'heading', level: 1, text: [{ text: '21.000', color: 'success', bold: true }] },
              { type: 'prose', body: [{ text: 'empleados con datos unificados' }] },
              { type: 'prose', body: [{ text: '+300 métricas clave bajo una única fuente de verdad en 30 ciudades.', color: 'muted' }] },
            ],
          }],
        ],
      },
    ],
  };
}

// 17. Confían en nosotros — closing slide with logo grid (placeholders).
function slideConfianza(): SlideIR {
  // Logo placeholder — bold heading + thin separator line above. Each
  // sits in a top-level grid cell so they form a 4×3 wall like the
  // reference deck's logo wall (LinkedIn, LG Ad Solutions, …).
  const logoCell = (name: string): SlideIR['body'][number] => ({
    type: 'heading',
    level: 4,
    align: 'center',
    text: [{ text: name, bold: true }],
  });
  return {
    layout: 'centered',
    body: [
      sectionLabel('09 · ACERCA DE CLEAR TECH'),
      {
        type: 'heading', level: 2, align: 'center',
        text: [{ text: 'Confían en nosotros.' }],
      },
      {
        type: 'prose', align: 'center',
        body: [{ text: 'Algunos de los líderes que eligen Clear Tech para construir su capa de datos.', color: 'muted' }],
      },
      {
        type: 'grid', columns: 4, gap: 'lg', align_items: 'center',
        cells: [
          [logoCell('LinkedIn')],
          [logoCell('LG Ad Solutions')],
          [logoCell('Changent')],
          [logoCell('Boats Group')],
          [logoCell('Grupo Bimbo')],
          [logoCell('Pluspetrol')],
          [logoCell('Telus International')],
          [logoCell('Ferring')],
          [logoCell('Century 21')],
          [logoCell('Cammesa')],
          [logoCell('TTEC')],
          [logoCell('Nucleoeléctrica')],
        ],
      },
    ],
  };
}

// ── Main ────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const outDir = process.env.PENGUI_E2E_OUTDIR ?? resolve(process.cwd(), 'output/galici_rebuild');
  mkdirSync(outDir, { recursive: true });

  const logger = new Logger('galici', 'info');
  const clock: Clock = { now: () => new Date().toISOString() };
  const pool = new PlaywrightPool({ headless: true, maxPoolSize: 2 });
  const renderer = new SlideRenderer(pool, logger.child('renderer'));

  // Build the soul.
  console.log('[step] generating Galici soul tokens');
  const tokens = generateTokens(LAYERS);
  const SOUL: DesignSoul = {
    id: soulId('soul-galici'), slug: 'soul-galici', name: 'Galici Soul',
    description: 'Dark navy + mint accent + Galician orange — for Clear Tech / Banco Galicia commercial proposal.',
    status: 'approved', layers: LAYERS, cssTokens: tokens.cssString,
    tokenNames: tokens.tokenNames, allowedFonts: tokens.allowedFonts,
    utilityCss: '', styleGuide: '',
    createdAt: clock.now(), updatedAt: clock.now(),
  };
  console.log(`[ok] soul ready (${tokens.tokenNames.length} tokens)`);

  // Upload chrome logos.
  console.log('\n[step] uploading chrome logo assets');
  const assetStore = new InMemoryAssetStore();
  const assetService = new AssetService(assetStore, clock, logger.child('assets'));
  const clearLogo = await assetService.upload({
    name: 'Clear Tech logo', filename: 'clear-tech.svg',
    mimeType: 'image/svg+xml', scope: 'global', role: 'logo',
    dataBase64: Buffer.from(CLEAR_TECH_LOGO_SVG, 'utf8').toString('base64'),
  });
  const galiciaLogo = await assetService.upload({
    name: 'Galicia logo', filename: 'galicia.svg',
    mimeType: 'image/svg+xml', scope: 'global', role: 'logo',
    dataBase64: Buffer.from(GALICIA_LOGO_SVG, 'utf8').toString('base64'),
  });

  // Mock screenshot assets (placeholder PNGs) for the prototype slides.
  // The reference uses real UI captures; we generate a labelled placeholder
  // so the framed-image chrome renders correctly without requiring real
  // image bytes for this rebuild.
  const placeholderPng = (label: string) =>
    Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 500" width="800" height="500">` +
      `<rect width="800" height="500" fill="#0d1430"/>` +
      `<text x="400" y="260" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" ` +
      `font-size="32" font-weight="700" fill="#5ce0c8">${label}</text>` +
      `<text x="400" y="300" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" ` +
      `font-size="14" fill="#aab4d6">Prototype screenshot placeholder</text>` +
      `</svg>`,
      'utf8',
    );
  const screenshots: Record<string, string> = {};
  for (const key of [
    'dashboard', 'login', 'dashboard2', 'cuentas', 'auths', 'newAccount', 'newPayment',
  ]) {
    const a = await assetService.upload({
      name: `Screenshot ${key}`, filename: `${key}.svg`,
      mimeType: 'image/svg+xml', scope: 'global', role: 'screenshot',
      dataBase64: placeholderPng(key.toUpperCase()).toString('base64'),
    });
    screenshots[key] = a.id as string;
  }
  console.log(`[ok] uploaded ${2 + Object.keys(screenshots).length} assets`);

  const CHROME = buildChrome(clearLogo.id as string, galiciaLogo.id as string);

  // Build slides.
  console.log('\n[step] authoring 17 slides');
  const SLIDES_AUTHORED: Array<{ id: string; ir: SlideIR; title: string }> = [
    { id: 'slide-01-cover',      ir: slideCover(),                                        title: 'Cover' },
    { id: 'slide-02-toc',        ir: slideToc(),                                          title: 'Contenido de la propuesta' },
    { id: 'slide-03-resumen',    ir: slideResumen(),                                      title: '01 · Resumen Ejecutivo' },
    { id: 'slide-04-situacion1', ir: slideSituacion1(),                                   title: '02 · Situación Actual 1/2' },
    { id: 'slide-05-situacion2', ir: slideSituacion2(),                                   title: '02 · Situación Actual 2/2' },
    { id: 'slide-06-sistema',    ir: slideSistema(),                                      title: '03 · Sistema de Control' },
    { id: 'slide-07-modulos',    ir: slideModulos(),                                      title: '04 · Módulos y Alcance' },
    { id: 'slide-08-protointro', ir: slidePrototipoIntro(screenshots.dashboard),          title: '05 · Prototipo intro' },
    { id: 'slide-09-proto1',     ir: slidePrototipo1(screenshots.login, screenshots.dashboard2), title: '05 · Prototipo 1/3' },
    { id: 'slide-10-proto2',     ir: slidePrototipo2(screenshots.cuentas, screenshots.auths),    title: '05 · Prototipo 2/3' },
    { id: 'slide-11-proto3',     ir: slidePrototipo3(screenshots.newAccount, screenshots.newPayment), title: '05 · Prototipo 3/3' },
    { id: 'slide-12-trabajo',    ir: slideTrabajo(),                                      title: '06 · Forma de Trabajo' },
    { id: 'slide-13-equipo',     ir: slideEquipo(),                                       title: '07 · Equipo' },
    { id: 'slide-14-propuesta',  ir: slidePropuestaComercial(),                           title: '08 · Propuesta Comercial' },
    { id: 'slide-15-acerca',     ir: slideAcerca(),                                       title: '09 · Acerca de Clear Tech' },
    { id: 'slide-16-resultados', ir: slideResultados(),                                   title: '09 · Resultados reales' },
    { id: 'slide-17-confianza',  ir: slideConfianza(),                                    title: '09 · Confían en nosotros' },
  ];
  const totalCount = SLIDES_AUTHORED.length;
  const FONT_FACE_CSS = buildFontFaceCss(SOUL);

  // Validate each slide IR through the same gates the MCP tools fire.
  for (let i = 0; i < SLIDES_AUTHORED.length; i++) {
    const { id, ir } = SLIDES_AUTHORED[i];
    const modeIssues = lintNodesForMode(ir.body, 'slide');
    if (modeIssues.length > 0) {
      throw new Error(`${id}: mode lint failed — ${modeIssues.map((m) => m.message).join('; ')}`);
    }
    const flowWarnings = lintFlowDensity(ir.body);
    if (flowWarnings.length > 0) {
      console.log(`  [warn] ${id}: ${flowWarnings.map((w) => w.message).join('; ')}`);
    }
  }
  console.log('[ok] all 17 slide IRs pass mode lint + flow density check');

  // Compile each slide IR → HTML, resolve assets + chart placeholders.
  const slides: Slide[] = [];
  for (let idx = 0; idx < totalCount; idx++) {
    const { id, ir, title } = SLIDES_AUTHORED[idx];
    const geometry = getFormat(DEFAULT_FORMAT).geometry;
    const isCover = idx === 0;
    const chromeArgs =
      CHROME.showOnCover === true || !isCover
        ? { chrome: CHROME, slidePosition: idx + 1, slideCount: totalCount }
        : {};
    const raw = compileSlideIRToHtml({ ir, soul: SOUL, geometry, fontFaceCss: FONT_FACE_CSS, ...chromeArgs });
    const charted = resolveChartRefs(raw, SOUL.layers);
    const html = await resolveAssetRefs(charted, assetService);
    slides.push({
      id: id as SlideId, deckId: 'deck-galici' as DeckId,
      position: idx, ir, html, sourceKind: 'authored_ir',
      metadata: {
        title, type: 'content', narrative: '',
        keyPoints: [], dataPoints: [], tags: [],
        generatedAt: clock.now(), soulId: SOUL.id as string,
        deckId: 'deck-galici', position: idx, metaVersion: '1.0',
        revisionHash: 'rev-' + id,
      },
      createdAt: clock.now(), updatedAt: clock.now(),
    });
  }
  console.log('[ok] all 17 slides compiled to HTML');

  // Compile to SlideDocument so editable PPTX has shape inventory.
  console.log('\n[step] compiling SlideDocument inventory for editable PPTX');
  const slideDocService = new SlideDocumentService(logger.child('slide-doc'), true);
  const editableSlides: Slide[] = [];
  for (const slide of slides) {
    const result = await slideDocService.compileSlideHtml(slide.html, slide.metadata.revisionHash);
    editableSlides.push({
      ...slide, document: result.document, sourceKind: 'authored_ir',
      translationIssues: result.translationIssues,
    });
  }
  // Quick inventory dump.
  for (const s of editableSlides) {
    const native = s.document!.elements.filter((el) => (el.exportDisposition ?? 'native') === 'native');
    const counts: Record<string, number> = {};
    for (const el of native) counts[el.kind] = (counts[el.kind] ?? 0) + 1;
    const bg = s.document!.elements.filter((el) => el.exportDisposition === 'background').length;
    console.log(`  ${s.id}: native=${JSON.stringify(counts)} bg=${bg}`);
  }

  // Export PDF + image PPTX + editable PPTX.
  console.log('\n[step] export PDF + image PPTX + editable PPTX');
  const pdfExporter = new PdfExporter(renderer, pool, logger.child('pdf'));
  const pdf = await pdfExporter.export(slides, 'Propuesta Galici (Pengui rebuild)');
  const pdfPath = resolve(outDir, pdf.filename);
  writeFileSync(pdfPath, pdf.data);
  console.log(`[ok] PDF: ${pdfPath} (${(pdf.fileSizeBytes / 1024).toFixed(1)} KB)`);

  const pptxExporter = new PptxExporter(renderer, logger.child('pptx'));
  const pptx = await pptxExporter.export(slides, 'Propuesta Galici (Pengui rebuild)');
  const pptxPath = resolve(outDir, pptx.filename);
  writeFileSync(pptxPath, pptx.data);
  console.log(`[ok] Static PPTX: ${pptxPath} (${(pptx.fileSizeBytes / 1024).toFixed(1)} KB)`);

  const editableExporter = new EditablePptxExporter(renderer, logger.child('pptx-editable'));
  const ePptx = await editableExporter.export(editableSlides, 'Propuesta Galici (Pengui rebuild) - Editable');
  const ePptxPath = resolve(outDir, ePptx.filename);
  writeFileSync(ePptxPath, ePptx.data);
  console.log(`[ok] Editable PPTX: ${ePptxPath} (${(ePptx.fileSizeBytes / 1024).toFixed(1)} KB)`);

  // Per-slide hybrid mode report.
  console.log('\n[step] per-slide hybrid mode report');
  let hybridCount = 0;
  for (const s of ePptx.slides) {
    const mark = s.usedBackgroundFallback ? '⚠️ ' : '   ';
    console.log(`  ${mark}${s.slideId}: mode=${s.mode} native=${s.nativeObjectCount}`);
    if (s.usedBackgroundFallback) hybridCount += 1;
  }
  console.log(`\n[summary] ${17 - hybridCount}/17 slides ship as native_only; ${hybridCount} fell back to hybrid_background`);

  console.log(`\n[done] Galici rebuild complete. Outputs in ${outDir}`);
  console.log('       Compare against output/real_life_examples/Propuesta Galici - PPT.pdf');
  await pool.shutdown();
}

main().catch((err) => {
  console.error('[fail]', err);
  process.exit(1);
});
