#!/usr/bin/env node
/**
 * End-to-end test: LG Ad Solutions Household Graph deck.
 *
 * Usage:
 *   node scripts/test-lg-ads.mjs
 *
 * Expects the server running at http://127.0.0.1:3000
 */

import fs from 'node:fs';
import path from 'node:path';

const BASE = 'http://127.0.0.1:3000/mcp';
let SESSION_ID = null;
let reqId = 0;

// ── Helpers ──────────────────────────────────────────────────────

async function mcp(method, params = {}) {
  reqId++;
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
  };
  if (SESSION_ID) headers['mcp-session-id'] = SESSION_ID;

  const res = await fetch(BASE, {
    method: 'POST',
    headers,
    body: JSON.stringify({ jsonrpc: '2.0', method, params, id: reqId }),
  });

  // Capture session ID from initialize
  const sid = res.headers.get('mcp-session-id');
  if (sid) SESSION_ID = sid;

  const text = await res.text();

  // Handle SSE responses
  if (text.startsWith('event:') || text.startsWith('data:')) {
    const lines = text.split('\n');
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const parsed = JSON.parse(line.slice(6));
          if (parsed.result) return parsed.result;
          if (parsed.error) throw new Error(JSON.stringify(parsed.error));
        } catch (e) {
          if (e.message.startsWith('{')) throw e;
        }
      }
    }
    throw new Error('No result in SSE response');
  }

  const json = JSON.parse(text);
  if (json.error) throw new Error(JSON.stringify(json.error));
  return json.result;
}

async function callTool(name, args) {
  const result = await mcp('tools/call', { name, arguments: args });
  const text = result.content?.[0]?.text;
  if (!text) return result;
  const parsed = JSON.parse(text);
  if (parsed.error) throw new Error(`${name} failed: ${parsed.message}`);
  return parsed;
}

function log(label, data) {
  console.log(`\n✅ ${label}`);
  if (data) console.log(JSON.stringify(data, null, 2).slice(0, 500));
}

// ── 1. Initialize MCP Session ────────────────────────────────────

async function initialize() {
  await mcp('initialize', {
    protocolVersion: '2025-03-26',
    capabilities: {},
    clientInfo: { name: 'lg-ads-test', version: '1.0.0' },
  });
  log('Session initialized', { sessionId: SESSION_ID });
}

// ── 2. Register Design Soul ──────────────────────────────────────

async function registerSoul() {
  const soul = await callTool('register_design_soul', {
    name: 'LG Ad Solutions',
    description:
      'Premium dark-first brand identity for LG Ad Solutions. Uses Active Red (#FD312E) and Heritage Red (#A50034) as primary accents against deep black canvases. Secondary palette includes Magenta, Plum, Electric Purple, and OneTeam Purple. Typography is clean sans-serif (Inter), optimized for data storytelling and CTV advertising narratives.',
    layers: {
      colorLanguage: {
        canvas: '#1D1D1B',
        surface: '#2A2A28',
        surfaceAlt: '#F5F5F5',
        border: 'rgba(255,255,255,0.12)',
        textPrimary: '#FFFFFF',
        textSecondary: 'rgba(255,255,255,0.70)',
        textTertiary: 'rgba(255,255,255,0.50)',
        textInverse: '#1D1D1B',
        accentPrimary: '#FD312E',
        accentSecondary: '#A50034',
        accentWarm: '#890665',
        success: '#57CAAA',
        warning: '#E8B901',
        error: '#E14047',
        info: '#4400D2',
      },
      typography: {
        fontDisplay: 'Inter',
        fontBody: 'Inter',
        fontMono: 'JetBrains Mono',
        sizeHero: 72,
        sizeH1: 48,
        sizeH2: 36,
        sizeH3: 28,
        sizeBody: 18,
        sizeLabel: 14,
        sizeCaption: 12,
        weightNormal: 400,
        weightMedium: 500,
        weightBold: 700,
        lineHeightHeading: 1.15,
        lineHeightBody: 1.6,
        letterSpacingHeading: '-0.02em',
        letterSpacingBody: '0em',
      },
      spacing: {
        baseUnit: 8,
        xs: 4,
        sm: 8,
        md: 16,
        lg: 24,
        xl: 32,
        xxl: 48,
        xxxl: 64,
        safeAreaInset: 48,
      },
      shapeRadius: {
        none: '0',
        sm: '4px',
        md: '8px',
        lg: '12px',
        xl: '16px',
        full: '9999px',
        buttonRadius: '8px',
        cardRadius: '12px',
        inputRadius: '8px',
        badgeRadius: '9999px',
      },
      depthShadow: {
        shadowNone: 'none',
        shadowSoft: '0 2px 8px rgba(0,0,0,0.25)',
        shadowMedium: '0 4px 16px rgba(0,0,0,0.35)',
        shadowElevated: '0 8px 32px rgba(0,0,0,0.45)',
        shadowInner: 'inset 0 2px 4px rgba(0,0,0,0.15)',
        borderWidth: '1px',
        borderOpacity: 0.12,
      },
      componentTokens: {
        cardPadding: '32px',
        cardShadow: '0 2px 8px rgba(0,0,0,0.25)',
        cardBorderWidth: '0',
        buttonPaddingX: '28px',
        buttonPaddingY: '14px',
        inputPaddingX: '16px',
        inputPaddingY: '12px',
        inputBorderWidth: '1px',
        badgePaddingX: '12px',
        badgePaddingY: '4px',
      },
      motionTone: {
        durationFast: '100ms',
        durationNormal: '250ms',
        durationSlow: '400ms',
        easingDefault: 'cubic-bezier(0.4, 0, 0.2, 1)',
        easingEmphasized: 'cubic-bezier(0.0, 0, 0.2, 1)',
        northStar:
          'Bold data storytelling powered by LG\'s Household Graph — clean, confident, premium. Every slide should feel like a screen on an LG TV: vivid, precise, and immersive. Dark backgrounds dominate. Red accents punctuate. Data leads the narrative.',
        doRules: [
          'Use Active Red (#FD312E) for CTAs, key metrics, and data highlights',
          'Maintain generous whitespace on dark layouts — let content breathe',
          'Lead with big numbers and clean charts — data is the hero',
          'Use gradient red-to-heritage-red for section dividers and accent shapes',
          'Place the LG Ad Solutions logo in the bottom-right corner of every slide',
          'Use Electric Purple (#4400D2) and Magenta (#890665) sparingly as accent colors in charts',
        ],
        dontRules: [
          'Never use more than 3 accent colors per slide',
          'Avoid busy backgrounds that compete with data visualizations',
          'Don\'t use thin, decorative, or serif typefaces',
          'Never distort the logo or change its brand colors',
          'Avoid gradients on text — only on backgrounds, dividers, and shapes',
          'Don\'t crowd slides — if it needs more than 6 data points, split into two slides',
        ],
      },
    },
  });
  log('Soul registered', soul);
  return soul.soul_id;
}

// ── 3. Approve Soul ──────────────────────────────────────────────

async function approveSoul(soulId) {
  const result = await callTool('approve_design_soul', { soul_id: soulId });
  log('Soul approved', { soul_id: soulId, recipes: result.recipe_count });
  return result;
}

// ── 4. Upload Logos ──────────────────────────────────────────────

async function uploadLogos(soulId) {
  const whiteLogo = fs.readFileSync(
    path.resolve('files/LG Ads Solutions Logo White PNG.png'),
  );
  const blackLogo = fs.readFileSync(
    path.resolve('files/LG Ads Solutions Logo Black PNG.png'),
  );

  const white = await callTool('upload_asset', {
    name: 'LG Ad Solutions Logo (White)',
    filename: 'lg-ads-logo-white.png',
    mime_type: 'image/png',
    scope_type: 'soul',
    soul_id: soulId,
    role: 'logo',
    data_base64: whiteLogo.toString('base64'),
  });
  log('White logo uploaded', white);

  const black = await callTool('upload_asset', {
    name: 'LG Ad Solutions Logo (Black)',
    filename: 'lg-ads-logo-black.png',
    mime_type: 'image/png',
    scope_type: 'soul',
    soul_id: soulId,
    role: 'logo',
    data_base64: blackLogo.toString('base64'),
  });
  log('Black logo uploaded', black);

  return { whiteRef: white.ref, blackRef: black.ref };
}

// ── 5. Create Deck ───────────────────────────────────────────────

async function createDeck(soulId) {
  const deck = await callTool('create_deck', {
    soulId: soulId,
    title: 'LG Household Graph — Powering Precision CTV Advertising',
    author: 'LG Ad Solutions Data Intelligence',
  });
  log('Deck created', deck);
  return deck.deck_id;
}

// ── 6. Add 10 Slides ─────────────────────────────────────────────

function slideHtml(body, cssTokens = '') {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<style>
:root {
  --canvas: #1D1D1B;
  --surface: #2A2A28;
  --surface-alt: #F5F5F5;
  --text-primary: #FFFFFF;
  --text-secondary: rgba(255,255,255,0.70);
  --text-tertiary: rgba(255,255,255,0.50);
  --text-inverse: #1D1D1B;
  --accent-primary: #FD312E;
  --accent-secondary: #A50034;
  --accent-warm: #890665;
  --electric-purple: #4400D2;
  --success: #57CAAA;
  --warning: #E8B901;
  --info: #4400D2;
  --red-80: #FD5A58;
  --red-60: #FE7573;
  --red-40: #FEA09F;
  --red-20: #FEBFBE;
  --red-10: #FFEAEA;
  --magenta: #890665;
  --plum: #540070;
  --oneteam-purple: #3C008D;
}
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body {
  width: 1920px; height: 1080px;
  font-family: 'Inter', system-ui, -apple-system, sans-serif;
  background: var(--canvas);
  color: var(--text-primary);
  overflow: hidden;
}
${cssTokens}
</style>
</head>
<body>
${body}
</body>
</html>`;
}

async function addSlides(deckId, logoWhiteRef, logoBlackRef) {
  const slides = [];

  // ── Slide 1: Title Slide ────────────────────────────────────
  slides.push({
    html: slideHtml(`
<div style="width:100%;height:100%;position:relative;background:linear-gradient(135deg, #1D1D1B 0%, #1D1D1B 50%, #A50034 70%, #FD312E 100%);">
  <div style="position:absolute;top:0;right:0;width:50%;height:100%;opacity:0.08;">
    <svg viewBox="0 0 800 800" style="width:100%;height:100%;">
      <circle cx="400" cy="400" r="350" fill="none" stroke="white" stroke-width="1"/>
      <circle cx="400" cy="400" r="280" fill="none" stroke="white" stroke-width="0.5"/>
      <circle cx="400" cy="400" r="210" fill="none" stroke="white" stroke-width="0.5"/>
      <circle cx="400" cy="400" r="140" fill="none" stroke="white" stroke-width="0.5"/>
    </svg>
  </div>
  <div style="padding:80px 96px;height:100%;display:flex;flex-direction:column;justify-content:center;position:relative;z-index:1;">
    <div style="font-size:14px;font-weight:500;letter-spacing:0.15em;text-transform:uppercase;color:var(--red-40);margin-bottom:24px;">LG Ad Solutions &middot; Data Intelligence</div>
    <h1 style="font-size:68px;font-weight:700;line-height:1.1;letter-spacing:-0.03em;max-width:1000px;">The Household Graph</h1>
    <p style="font-size:28px;font-weight:300;color:var(--text-secondary);margin-top:24px;max-width:800px;line-height:1.4;">Powering Precision CTV Advertising at Scale</p>
    <div style="margin-top:56px;display:flex;gap:12px;align-items:center;">
      <div style="width:48px;height:3px;background:var(--accent-primary);border-radius:2px;"></div>
      <span style="font-size:14px;color:var(--text-tertiary);">Q1 2026 Overview</span>
    </div>
  </div>
  <img src="${logoWhiteRef}" style="position:absolute;bottom:40px;right:56px;height:28px;opacity:0.9;" />
</div>`),
    metadata: { title: 'Title Slide', type: 'title', narrative: 'Opening slide introducing the Household Graph as the backbone of precision CTV advertising.' },
  });

  // ── Slide 2: What is the Household Graph? ───────────────────
  slides.push({
    html: slideHtml(`
<div style="width:100%;height:100%;position:relative;background:var(--canvas);">
  <div style="position:absolute;left:0;top:0;width:4px;height:100%;background:linear-gradient(to bottom,var(--accent-primary),var(--accent-secondary));"></div>
  <div style="padding:80px 96px;height:100%;display:flex;flex-direction:column;">
    <div style="font-size:13px;font-weight:500;letter-spacing:0.12em;text-transform:uppercase;color:var(--accent-primary);margin-bottom:16px;">Overview</div>
    <h2 style="font-size:48px;font-weight:700;letter-spacing:-0.02em;line-height:1.15;">What Is the Household Graph?</h2>
    <div style="margin-top:48px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:32px;flex:1;align-content:start;">
      <div style="background:var(--surface);border-radius:12px;padding:32px;border:1px solid rgba(255,255,255,0.06);">
        <div style="width:48px;height:48px;border-radius:50%;background:rgba(253,49,46,0.15);display:flex;align-items:center;justify-content:center;margin-bottom:20px;">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="#FD312E" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </div>
        <h3 style="font-size:22px;font-weight:600;margin-bottom:12px;">Identity Resolution</h3>
        <p style="font-size:16px;color:var(--text-secondary);line-height:1.6;">Maps devices, IPs, and viewing signals to real households — not cookies, not probabilistic guessing.</p>
      </div>
      <div style="background:var(--surface);border-radius:12px;padding:32px;border:1px solid rgba(255,255,255,0.06);">
        <div style="width:48px;height:48px;border-radius:50%;background:rgba(68,0,210,0.15);display:flex;align-items:center;justify-content:center;margin-bottom:20px;">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" stroke="#4400D2" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="9" cy="7" r="4" stroke="#4400D2" stroke-width="2"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" stroke="#4400D2" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </div>
        <h3 style="font-size:22px;font-weight:600;margin-bottom:12px;">Household-Level Targeting</h3>
        <p style="font-size:16px;color:var(--text-secondary);line-height:1.6;">Reaches the right household across CTV, mobile, desktop, and tablet with a single unified view.</p>
      </div>
      <div style="background:var(--surface);border-radius:12px;padding:32px;border:1px solid rgba(255,255,255,0.06);">
        <div style="width:48px;height:48px;border-radius:50%;background:rgba(137,6,101,0.15);display:flex;align-items:center;justify-content:center;margin-bottom:20px;">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M22 12h-4l-3 9L9 3l-3 9H2" stroke="#890665" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </div>
        <h3 style="font-size:22px;font-weight:600;margin-bottom:12px;">Deterministic Data</h3>
        <p style="font-size:16px;color:var(--text-secondary);line-height:1.6;">Built on opt-in ACR data from 60M+ LG Smart TVs — first-party, privacy-compliant, and always-on.</p>
      </div>
    </div>
  </div>
  <img src="${logoWhiteRef}" style="position:absolute;bottom:40px;right:56px;height:24px;opacity:0.7;" />
</div>`),
    metadata: { title: 'What Is the Household Graph?', type: 'content', narrative: 'Introduces the three pillars: identity resolution, household targeting, and deterministic ACR data.' },
  });

  // ── Slide 3: Scale & Reach (Big Numbers) ────────────────────
  slides.push({
    html: slideHtml(`
<div style="width:100%;height:100%;position:relative;background:var(--canvas);">
  <div style="position:absolute;left:0;top:0;width:4px;height:100%;background:linear-gradient(to bottom,var(--accent-primary),var(--accent-secondary));"></div>
  <div style="padding:80px 96px;height:100%;display:flex;flex-direction:column;">
    <div style="font-size:13px;font-weight:500;letter-spacing:0.12em;text-transform:uppercase;color:var(--accent-primary);margin-bottom:16px;">Scale</div>
    <h2 style="font-size:44px;font-weight:700;letter-spacing:-0.02em;">Household Graph by the Numbers</h2>
    <div style="margin-top:56px;display:grid;grid-template-columns:repeat(4,1fr);gap:28px;flex:1;align-content:start;">
      <div style="text-align:center;padding:40px 24px;background:var(--surface);border-radius:12px;border:1px solid rgba(255,255,255,0.06);">
        <div style="font-size:64px;font-weight:700;color:var(--accent-primary);line-height:1;">60M+</div>
        <div style="font-size:15px;color:var(--text-secondary);margin-top:12px;">LG Smart TVs</div>
      </div>
      <div style="text-align:center;padding:40px 24px;background:var(--surface);border-radius:12px;border:1px solid rgba(255,255,255,0.06);">
        <div style="font-size:64px;font-weight:700;color:var(--electric-purple);line-height:1;">40M+</div>
        <div style="font-size:15px;color:var(--text-secondary);margin-top:12px;">US Households Mapped</div>
      </div>
      <div style="text-align:center;padding:40px 24px;background:var(--surface);border-radius:12px;border:1px solid rgba(255,255,255,0.06);">
        <div style="font-size:64px;font-weight:700;color:var(--magenta);line-height:1;">150M+</div>
        <div style="font-size:15px;color:var(--text-secondary);margin-top:12px;">Connected Devices</div>
      </div>
      <div style="text-align:center;padding:40px 24px;background:var(--surface);border-radius:12px;border:1px solid rgba(255,255,255,0.06);">
        <div style="font-size:64px;font-weight:700;color:var(--success);line-height:1;">3B+</div>
        <div style="font-size:15px;color:var(--text-secondary);margin-top:12px;">Monthly Data Points</div>
      </div>
    </div>
    <p style="font-size:14px;color:var(--text-tertiary);margin-top:auto;">Source: LG Ad Solutions internal data, Q1 2026. US market only.</p>
  </div>
  <img src="${logoWhiteRef}" style="position:absolute;bottom:40px;right:56px;height:24px;opacity:0.7;" />
</div>`),
    metadata: { title: 'Household Graph by the Numbers', type: 'content', narrative: 'Four key scale metrics showcasing reach: 60M+ TVs, 40M+ households, 150M+ devices, 3B+ data points.' },
  });

  // ── Slide 4: How It Works (Flow Diagram) ────────────────────
  slides.push({
    html: slideHtml(`
<div style="width:100%;height:100%;position:relative;background:var(--canvas);">
  <div style="position:absolute;left:0;top:0;width:4px;height:100%;background:linear-gradient(to bottom,var(--accent-primary),var(--accent-secondary));"></div>
  <div style="padding:80px 96px;height:100%;display:flex;flex-direction:column;">
    <div style="font-size:13px;font-weight:500;letter-spacing:0.12em;text-transform:uppercase;color:var(--accent-primary);margin-bottom:16px;">Architecture</div>
    <h2 style="font-size:44px;font-weight:700;letter-spacing:-0.02em;">How the Household Graph Works</h2>
    <div style="margin-top:48px;display:flex;align-items:center;justify-content:center;gap:0;flex:1;">
      <div style="text-align:center;width:200px;">
        <div style="width:100px;height:100px;margin:0 auto;border-radius:50%;background:linear-gradient(135deg,var(--accent-primary),var(--accent-secondary));display:flex;align-items:center;justify-content:center;">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none"><rect x="2" y="7" width="20" height="15" rx="2" stroke="white" stroke-width="1.5"/><path d="M17 2l-5 5-5-5" stroke="white" stroke-width="1.5" stroke-linecap="round"/></svg>
        </div>
        <div style="font-size:16px;font-weight:600;margin-top:16px;">ACR Data</div>
        <div style="font-size:13px;color:var(--text-tertiary);margin-top:4px;">60M+ LG TVs</div>
      </div>
      <div style="width:80px;display:flex;align-items:center;justify-content:center;">
        <svg width="48" height="24"><path d="M0 12h40m-8-8l8 8-8 8" stroke="var(--accent-primary)" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </div>
      <div style="text-align:center;width:200px;">
        <div style="width:100px;height:100px;margin:0 auto;border-radius:50%;background:linear-gradient(135deg,var(--electric-purple),var(--plum));display:flex;align-items:center;justify-content:center;">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none"><path d="M12 2L2 7l10 5 10-5-10-5z" stroke="white" stroke-width="1.5"/><path d="M2 17l10 5 10-5M2 12l10 5 10-5" stroke="white" stroke-width="1.5"/></svg>
        </div>
        <div style="font-size:16px;font-weight:600;margin-top:16px;">Graph Engine</div>
        <div style="font-size:13px;color:var(--text-tertiary);margin-top:4px;">Identity resolution</div>
      </div>
      <div style="width:80px;display:flex;align-items:center;justify-content:center;">
        <svg width="48" height="24"><path d="M0 12h40m-8-8l8 8-8 8" stroke="var(--electric-purple)" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </div>
      <div style="text-align:center;width:200px;">
        <div style="width:100px;height:100px;margin:0 auto;border-radius:50%;background:linear-gradient(135deg,var(--magenta),var(--oneteam-purple));display:flex;align-items:center;justify-content:center;">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" stroke="white" stroke-width="1.5"/><path d="M9 22V12h6v10" stroke="white" stroke-width="1.5"/></svg>
        </div>
        <div style="font-size:16px;font-weight:600;margin-top:16px;">Household Profile</div>
        <div style="font-size:13px;color:var(--text-tertiary);margin-top:4px;">Unified HH view</div>
      </div>
      <div style="width:80px;display:flex;align-items:center;justify-content:center;">
        <svg width="48" height="24"><path d="M0 12h40m-8-8l8 8-8 8" stroke="var(--magenta)" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </div>
      <div style="text-align:center;width:200px;">
        <div style="width:100px;height:100px;margin:0 auto;border-radius:50%;background:linear-gradient(135deg,var(--success),#2a9d8f);display:flex;align-items:center;justify-content:center;">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none"><path d="M22 12h-4l-3 9L9 3l-3 9H2" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </div>
        <div style="font-size:16px;font-weight:600;margin-top:16px;">Activation</div>
        <div style="font-size:13px;color:var(--text-tertiary);margin-top:4px;">Target & measure</div>
      </div>
    </div>
    <div style="text-align:center;color:var(--text-tertiary);font-size:14px;margin-top:auto;">Deterministic, privacy-compliant pipeline from TV glass to campaign activation</div>
  </div>
  <img src="${logoWhiteRef}" style="position:absolute;bottom:40px;right:56px;height:24px;opacity:0.7;" />
</div>`),
    metadata: { title: 'How the Household Graph Works', type: 'content', narrative: 'Four-step pipeline: ACR data collection, graph engine identity resolution, household profiling, campaign activation.' },
  });

  // ── Slide 5: Audience Segments (Data Chart) ─────────────────
  slides.push({
    html: slideHtml(`
<div style="width:100%;height:100%;position:relative;background:var(--canvas);">
  <div style="position:absolute;left:0;top:0;width:4px;height:100%;background:linear-gradient(to bottom,var(--accent-primary),var(--accent-secondary));"></div>
  <div style="padding:80px 96px;height:100%;display:flex;flex-direction:column;">
    <div style="font-size:13px;font-weight:500;letter-spacing:0.12em;text-transform:uppercase;color:var(--accent-primary);margin-bottom:16px;">Audiences</div>
    <h2 style="font-size:44px;font-weight:700;letter-spacing:-0.02em;">Top Household Segments</h2>
    <div style="margin-top:48px;display:flex;gap:48px;flex:1;">
      <div style="flex:1;display:flex;flex-direction:column;gap:20px;">
        ${[
          { label: 'Streaming-First Households', pct: 78, color: 'var(--accent-primary)' },
          { label: 'Sports Enthusiasts', pct: 64, color: 'var(--electric-purple)' },
          { label: 'Premium Content Viewers', pct: 57, color: 'var(--magenta)' },
          { label: 'Cord-Cutters (No Linear)', pct: 52, color: 'var(--oneteam-purple)' },
          { label: 'Family Households (3+ members)', pct: 45, color: 'var(--accent-secondary)' },
          { label: 'Gaming Households', pct: 38, color: 'var(--success)' },
        ].map(s => `
        <div>
          <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
            <span style="font-size:15px;font-weight:500;">${s.label}</span>
            <span style="font-size:15px;font-weight:700;color:${s.color};">${s.pct}%</span>
          </div>
          <div style="height:10px;background:var(--surface);border-radius:5px;overflow:hidden;">
            <div style="width:${s.pct}%;height:100%;background:${s.color};border-radius:5px;"></div>
          </div>
        </div>`).join('')}
      </div>
      <div style="width:380px;background:var(--surface);border-radius:12px;padding:32px;border:1px solid rgba(255,255,255,0.06);display:flex;flex-direction:column;justify-content:center;">
        <div style="font-size:14px;font-weight:500;color:var(--accent-primary);margin-bottom:16px;">KEY INSIGHT</div>
        <div style="font-size:20px;font-weight:600;line-height:1.4;">78% of mapped households are streaming-first — linear TV alone misses the majority of your audience.</div>
        <div style="margin-top:24px;padding-top:24px;border-top:1px solid rgba(255,255,255,0.08);">
          <div style="font-size:13px;color:var(--text-tertiary);">Compared to industry average</div>
          <div style="font-size:28px;font-weight:700;color:var(--success);margin-top:4px;">+23% reach</div>
        </div>
      </div>
    </div>
  </div>
  <img src="${logoWhiteRef}" style="position:absolute;bottom:40px;right:56px;height:24px;opacity:0.7;" />
</div>`),
    metadata: { title: 'Top Household Segments', type: 'content', narrative: 'Horizontal bar chart showing six key audience segments with streaming-first households at 78%.' },
  });

  // ── Slide 6: Section Divider ────────────────────────────────
  slides.push({
    html: slideHtml(`
<div style="width:100%;height:100%;background:linear-gradient(135deg, #FD312E 0%, #A50034 60%, #890665 100%);display:flex;flex-direction:column;justify-content:center;padding:80px 96px;position:relative;">
  <div style="font-size:14px;font-weight:500;letter-spacing:0.15em;text-transform:uppercase;color:rgba(255,255,255,0.7);margin-bottom:20px;">Section 02</div>
  <h2 style="font-size:64px;font-weight:700;line-height:1.1;letter-spacing:-0.02em;max-width:900px;">Campaign Performance & Measurement</h2>
  <img src="${logoWhiteRef}" style="position:absolute;bottom:40px;right:56px;height:28px;opacity:0.9;" />
</div>`),
    metadata: { title: 'Section: Campaign Performance', type: 'section', narrative: 'Section divider introducing the campaign performance and measurement chapter.' },
  });

  // ── Slide 7: Cross-Device Attribution ───────────────────────
  slides.push({
    html: slideHtml(`
<div style="width:100%;height:100%;position:relative;background:var(--canvas);">
  <div style="position:absolute;left:0;top:0;width:4px;height:100%;background:linear-gradient(to bottom,var(--accent-primary),var(--accent-secondary));"></div>
  <div style="padding:80px 96px;height:100%;display:grid;grid-template-columns:1fr 1fr;gap:48px;">
    <div style="display:flex;flex-direction:column;">
      <div style="font-size:13px;font-weight:500;letter-spacing:0.12em;text-transform:uppercase;color:var(--accent-primary);margin-bottom:16px;">Measurement</div>
      <h2 style="font-size:40px;font-weight:700;letter-spacing:-0.02em;line-height:1.15;">Cross-Device Attribution</h2>
      <p style="font-size:17px;color:var(--text-secondary);margin-top:20px;line-height:1.6;">The Household Graph connects the dots between a CTV ad exposure and actions on any device in the home — delivering true closed-loop measurement.</p>
      <div style="margin-top:auto;display:grid;grid-template-columns:1fr 1fr;gap:20px;">
        <div style="background:var(--surface);border-radius:12px;padding:24px;text-align:center;">
          <div style="font-size:40px;font-weight:700;color:var(--accent-primary);">3.2x</div>
          <div style="font-size:13px;color:var(--text-secondary);margin-top:8px;">Higher conversion rate vs. linear TV</div>
        </div>
        <div style="background:var(--surface);border-radius:12px;padding:24px;text-align:center;">
          <div style="font-size:40px;font-weight:700;color:var(--electric-purple);">87%</div>
          <div style="font-size:13px;color:var(--text-secondary);margin-top:8px;">Attribution accuracy</div>
        </div>
      </div>
    </div>
    <div style="display:flex;align-items:center;justify-content:center;">
      <div style="position:relative;width:400px;height:400px;">
        <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:120px;height:120px;border-radius:50%;background:linear-gradient(135deg,var(--accent-primary),var(--accent-secondary));display:flex;align-items:center;justify-content:center;z-index:3;">
          <span style="font-size:14px;font-weight:700;text-align:center;line-height:1.2;">Household<br>Graph</span>
        </div>
        ${[
          { label: 'CTV', angle: 0, color: 'var(--accent-primary)' },
          { label: 'Mobile', angle: 72, color: 'var(--electric-purple)' },
          { label: 'Desktop', angle: 144, color: 'var(--magenta)' },
          { label: 'Tablet', angle: 216, color: 'var(--oneteam-purple)' },
          { label: 'Audio', angle: 288, color: 'var(--success)' },
        ].map(d => {
          const r = 160;
          const rad = (d.angle - 90) * Math.PI / 180;
          const x = 200 + r * Math.cos(rad);
          const y = 200 + r * Math.sin(rad);
          return `<div style="position:absolute;left:${x-40}px;top:${y-40}px;width:80px;height:80px;border-radius:50%;background:var(--surface);border:2px solid ${d.color};display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:600;z-index:2;">${d.label}</div>`;
        }).join('')}
        <svg style="position:absolute;top:0;left:0;width:400px;height:400px;z-index:1;" viewBox="0 0 400 400">
          <circle cx="200" cy="200" r="160" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="1" stroke-dasharray="4 4"/>
        </svg>
      </div>
    </div>
  </div>
  <img src="${logoWhiteRef}" style="position:absolute;bottom:40px;right:56px;height:24px;opacity:0.7;" />
</div>`),
    metadata: { title: 'Cross-Device Attribution', type: 'content', narrative: 'Hub-and-spoke diagram showing the Household Graph connecting CTV, mobile, desktop, tablet, and audio.' },
  });

  // ── Slide 8: Campaign Results Table ─────────────────────────
  slides.push({
    html: slideHtml(`
<div style="width:100%;height:100%;position:relative;background:var(--canvas);">
  <div style="position:absolute;left:0;top:0;width:4px;height:100%;background:linear-gradient(to bottom,var(--accent-primary),var(--accent-secondary));"></div>
  <div style="padding:80px 96px;height:100%;display:flex;flex-direction:column;">
    <div style="font-size:13px;font-weight:500;letter-spacing:0.12em;text-transform:uppercase;color:var(--accent-primary);margin-bottom:16px;">Results</div>
    <h2 style="font-size:44px;font-weight:700;letter-spacing:-0.02em;">Household Graph Campaign Benchmarks</h2>
    <div style="margin-top:40px;flex:1;">
      <table style="width:100%;border-collapse:collapse;font-size:16px;">
        <thead>
          <tr style="border-bottom:2px solid var(--accent-primary);">
            <th style="text-align:left;padding:16px 20px;font-weight:600;color:var(--text-secondary);font-size:13px;text-transform:uppercase;letter-spacing:0.08em;">Vertical</th>
            <th style="text-align:right;padding:16px 20px;font-weight:600;color:var(--text-secondary);font-size:13px;text-transform:uppercase;letter-spacing:0.08em;">Impressions</th>
            <th style="text-align:right;padding:16px 20px;font-weight:600;color:var(--text-secondary);font-size:13px;text-transform:uppercase;letter-spacing:0.08em;">HH Reach</th>
            <th style="text-align:right;padding:16px 20px;font-weight:600;color:var(--text-secondary);font-size:13px;text-transform:uppercase;letter-spacing:0.08em;">VCR</th>
            <th style="text-align:right;padding:16px 20px;font-weight:600;color:var(--text-secondary);font-size:13px;text-transform:uppercase;letter-spacing:0.08em;">Lift</th>
          </tr>
        </thead>
        <tbody>
          ${[
            { vert: 'Automotive', imp: '24.5M', reach: '8.2M', vcr: '96.4%', lift: '+18%' },
            { vert: 'CPG / Retail', imp: '31.2M', reach: '11.7M', vcr: '94.8%', lift: '+22%' },
            { vert: 'Financial Services', imp: '18.9M', reach: '6.4M', vcr: '97.1%', lift: '+15%' },
            { vert: 'Pharma / Health', imp: '14.3M', reach: '5.1M', vcr: '95.6%', lift: '+19%' },
            { vert: 'Entertainment', imp: '42.8M', reach: '14.9M', vcr: '93.2%', lift: '+27%' },
            { vert: 'QSR / Dining', imp: '19.7M', reach: '7.3M', vcr: '96.0%', lift: '+21%' },
          ].map((r, i) => `
          <tr style="border-bottom:1px solid rgba(255,255,255,0.06);${i % 2 ? 'background:rgba(255,255,255,0.02);' : ''}">
            <td style="padding:16px 20px;font-weight:500;">${r.vert}</td>
            <td style="padding:16px 20px;text-align:right;color:var(--text-secondary);">${r.imp}</td>
            <td style="padding:16px 20px;text-align:right;color:var(--text-secondary);">${r.reach}</td>
            <td style="padding:16px 20px;text-align:right;font-weight:600;">${r.vcr}</td>
            <td style="padding:16px 20px;text-align:right;font-weight:700;color:var(--success);">${r.lift}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
    <p style="font-size:13px;color:var(--text-tertiary);margin-top:auto;">VCR = Video Completion Rate. Lift = incremental brand awareness lift vs. control. Q4 2025 aggregate data.</p>
  </div>
  <img src="${logoWhiteRef}" style="position:absolute;bottom:40px;right:56px;height:24px;opacity:0.7;" />
</div>`),
    metadata: { title: 'Campaign Benchmarks by Vertical', type: 'content', narrative: 'Data table showing impressions, household reach, VCR, and brand lift across six industry verticals.' },
  });

  // ── Slide 9: Privacy & Compliance ───────────────────────────
  slides.push({
    html: slideHtml(`
<div style="width:100%;height:100%;position:relative;background:var(--canvas);">
  <div style="position:absolute;left:0;top:0;width:4px;height:100%;background:linear-gradient(to bottom,var(--accent-primary),var(--accent-secondary));"></div>
  <div style="padding:80px 96px;height:100%;display:flex;flex-direction:column;">
    <div style="font-size:13px;font-weight:500;letter-spacing:0.12em;text-transform:uppercase;color:var(--accent-primary);margin-bottom:16px;">Trust & Privacy</div>
    <h2 style="font-size:44px;font-weight:700;letter-spacing:-0.02em;">Privacy by Design</h2>
    <div style="margin-top:48px;display:grid;grid-template-columns:1fr 1fr;gap:32px;flex:1;align-content:start;">
      ${[
        { icon: '🔒', title: 'Opt-In Only', desc: 'All data sourced from users who actively consent through LG\'s privacy settings.' },
        { icon: '🏠', title: 'Household-Level', desc: 'No individual-level tracking — insights are aggregated at the household level.' },
        { icon: '🛡️', title: 'CCPA & GDPR Compliant', desc: 'Full compliance with US and EU privacy regulations, with regular third-party audits.' },
        { icon: '🔐', title: 'No PII Exposure', desc: 'Advertisers never receive personally identifiable information — only anonymized segments.' },
      ].map(item => `
      <div style="background:var(--surface);border-radius:12px;padding:32px;border:1px solid rgba(255,255,255,0.06);display:flex;gap:20px;align-items:flex-start;">
        <div style="font-size:32px;flex-shrink:0;margin-top:4px;">${item.icon}</div>
        <div>
          <h3 style="font-size:20px;font-weight:600;margin-bottom:8px;">${item.title}</h3>
          <p style="font-size:15px;color:var(--text-secondary);line-height:1.6;">${item.desc}</p>
        </div>
      </div>`).join('')}
    </div>
  </div>
  <img src="${logoWhiteRef}" style="position:absolute;bottom:40px;right:56px;height:24px;opacity:0.7;" />
</div>`),
    metadata: { title: 'Privacy by Design', type: 'content', narrative: 'Four privacy pillars: opt-in data, household-level aggregation, CCPA/GDPR compliance, no PII exposure.' },
  });

  // ── Slide 10: Closing / CTA ─────────────────────────────────
  slides.push({
    html: slideHtml(`
<div style="width:100%;height:100%;position:relative;background:linear-gradient(135deg, #1D1D1B 0%, #1D1D1B 40%, #A50034 80%, #FD312E 100%);">
  <div style="position:absolute;top:0;right:0;width:60%;height:100%;opacity:0.06;">
    <svg viewBox="0 0 800 800" style="width:100%;height:100%;">
      <circle cx="400" cy="400" r="380" fill="none" stroke="white" stroke-width="0.8"/>
      <circle cx="400" cy="400" r="300" fill="none" stroke="white" stroke-width="0.5"/>
      <circle cx="400" cy="400" r="220" fill="none" stroke="white" stroke-width="0.5"/>
      <circle cx="400" cy="400" r="140" fill="none" stroke="white" stroke-width="0.5"/>
      <circle cx="400" cy="400" r="60" fill="none" stroke="white" stroke-width="0.5"/>
    </svg>
  </div>
  <div style="padding:80px 96px;height:100%;display:flex;flex-direction:column;justify-content:center;position:relative;z-index:1;">
    <h2 style="font-size:56px;font-weight:700;line-height:1.15;letter-spacing:-0.02em;max-width:900px;">Ready to Unlock the Power of the Household Graph?</h2>
    <p style="font-size:22px;font-weight:300;color:var(--text-secondary);margin-top:24px;max-width:700px;line-height:1.5;">Connect with our team to explore custom audience segments, attribution solutions, and campaign strategies powered by deterministic CTV data.</p>
    <div style="margin-top:48px;display:flex;gap:16px;">
      <div style="background:var(--accent-primary);color:white;padding:16px 36px;border-radius:8px;font-size:16px;font-weight:600;">Contact Sales</div>
      <div style="background:transparent;color:white;padding:16px 36px;border-radius:8px;font-size:16px;font-weight:500;border:1px solid rgba(255,255,255,0.3);">lgads.tv</div>
    </div>
    <div style="margin-top:56px;display:flex;gap:32px;color:var(--text-tertiary);font-size:14px;">
      <span>sales@lgads.tv</span>
      <span>lgads.tv</span>
    </div>
  </div>
  <img src="${logoWhiteRef}" style="position:absolute;bottom:40px;right:56px;height:28px;opacity:0.9;" />
</div>`),
    metadata: { title: 'Get Started with the Household Graph', type: 'closing', narrative: 'Closing CTA slide inviting the audience to connect with LG Ad Solutions for campaign solutions.' },
  });

  // ── Submit All Slides ───────────────────────────────────────
  for (let i = 0; i < slides.length; i++) {
    const s = slides[i];
    const result = await callTool('add_slide', {
      deckId: deckId,
      html: s.html,
      metadata: s.metadata,
    });
    log(`Slide ${i + 1}/10 added: ${s.metadata.title}`, { slide_id: result.slide_id, position: result.position });
  }
}

// ── 7. Export HTML ────────────────────────────────────────────────

async function exportHtml(deckId) {
  const result = await callTool('export_html', {
    deck_id: deckId,
    include_navigation: true,
  });
  log('HTML exported', {
    filename: result.filename,
    size: result.file_size_bytes,
    slides: result.slide_count,
  });
  return result;
}

// ── Main ──────────────────────────────────────────────────────────

async function main() {
  console.log('🚀 LG Ad Solutions — Household Graph Deck\n');

  await initialize();
  const soulId = await registerSoul();
  await approveSoul(soulId);
  const { whiteRef, blackRef } = await uploadLogos(soulId);
  const deckId = await createDeck(soulId);
  await addSlides(deckId, whiteRef, blackRef);
  await exportHtml(deckId);

  console.log('\n🎉 Done! Check the output directory for the exported HTML file.');
  console.log(`   Soul ID: ${soulId}`);
  console.log(`   Deck ID: ${deckId}`);
}

main().catch((err) => {
  console.error('❌ Fatal error:', err.message);
  process.exit(1);
});
