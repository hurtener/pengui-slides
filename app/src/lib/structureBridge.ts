/**
 * Shared in-iframe bridge for v4.9 direct-manipulation modes.
 *
 * SlideCanvas (slide IR previews) and DocumentEditor (section IR
 * previews) both render their HTML into a sandboxed iframe with
 * `allow-scripts`. The script here is injected into the iframe's body
 * and provides three behaviours:
 *
 *   1. PIN MODE — clicks postMessage `{ type: 'pintarget', irPath }` to
 *      the parent. Used for the "leave a comment on this block" flow.
 *   2. EDIT-LAYOUT MODE — hover paints a dashed outline on the nearest
 *      `[data-ir-path]` element. Clicks postMessage
 *      `{ type: 'select-block', irPath, preview, siblingIndex, siblingCount }`;
 *      the action bar lives in the parent DOM (BlockActionBar.svelte).
 *      Drag-and-drop reorders inside / across containers; drops emit
 *      `{ type: 'structure-reorder', srcIrPath, destIrPath, position }`.
 *      The bridge also re-emits `selection-info` whenever it (re)applies
 *      the selection outline so the parent can refresh the action bar's
 *      edge state after structural changes re-render the slide.
 *   3. RICH-TEXT TOOLBAR — when a contentEditable selection is active on
 *      a `[data-ir-rt-field]` element, a B / I / S / `</>` / clear row
 *      plus a 9-color semantic swatch row floats above the selection.
 *
 * Mode flags read on every event (set by the parent on documentElement):
 *   - `data-pengui-pin-mode`            — boolean string
 *   - `data-pengui-structure-mode`      — boolean string
 *   - `data-pengui-allow-image-insert`  — boolean string; when 'true'
 *                                          the edit-layout toolbar shows
 *                                          an "Add image" button.
 *   - CSS variable `--pengui-frame-scale` — the parent's CSS scale
 *     applied to the iframe (e.g. 0.5 when the slide canvas is shown at
 *     half size). The floating toolbars inverse-scale themselves so
 *     they appear at a fixed readable size on any canvas zoom.
 *
 * Deactivation: when a mode flips off the parent sets the dataset flag
 * to 'false', and the script clears any decorations (outlines, cursor:
 * grab, `draggable` attributes, drop indicators) so the canvas returns
 * to a clean read-only preview.
 */
export const STRUCTURE_BRIDGE_SCRIPT = `<script>(function(){
  var root = document.documentElement;

  function getInverseScale(){
    var raw = getComputedStyle(root).getPropertyValue('--pengui-frame-scale');
    var s = parseFloat(raw);
    if (!isFinite(s) || s <= 0) return 1;
    // Clamp inverse to [1, 5] so we never make the toolbar microscopic
    // (scale > 1) or absurdly huge (scale near 0).
    var inv = 1 / s;
    if (inv < 1) inv = 1;
    if (inv > 5) inv = 5;
    return inv;
  }

  // Mode-aware cursor + hover affordances injected as a single style
  // sheet. The CSS keys off the dataset flags so the visual state is
  // always in sync without the script having to mutate inline styles
  // on every block.
  (function injectAffordances(){
    var s = document.createElement('style');
    s.id = 'pengui-affordance-cursors';
    s.textContent = [
      // Default mode: every rich-text field invites text editing.
      'html:not([data-pengui-pin-mode="true"]):not([data-pengui-structure-mode="true"]) ' +
        '[data-ir-rt-field]{cursor:text;transition:outline-color .12s ease}',
      // Hover hint so the click target is discoverable.
      'html:not([data-pengui-pin-mode="true"]):not([data-pengui-structure-mode="true"]) ' +
        '[data-ir-rt-field]:hover{outline:1px dashed rgba(47,184,166,0.55);outline-offset:3px}',
      'html:not([data-pengui-pin-mode="true"]):not([data-pengui-structure-mode="true"]) ' +
        '[data-ir-rt-field][data-editing="true"]{outline:2px solid rgba(47,184,166,0.85);outline-offset:3px}',
      // Edit-layout: every block invites drag.
      'html[data-pengui-structure-mode="true"] [data-ir-path]{cursor:grab}',
      'html[data-pengui-structure-mode="true"] [data-ir-path]:active{cursor:grabbing}',
      // Selected block during edit-layout — solid mint outline that
      // persists until selection changes (separate from hover).
      'html[data-pengui-structure-mode="true"] [data-ir-path][data-pengui-selected="true"]' +
        '{outline:2px solid rgba(47,184,166,0.95);outline-offset:3px}',
      // Pin mode: every block invites a click to leave a comment.
      'html[data-pengui-pin-mode="true"] [data-ir-path]{cursor:crosshair}'
    ].join('\\n');
    document.head.appendChild(s);
  })();

  function isOverlayDescendant(el){
    while (el && el.nodeType === 1) {
      if (el.dataset && el.dataset.penguiOverlay) return true;
      el = el.parentNode;
    }
    return false;
  }

  function resolveIrPath(e){
    var t = e.target && e.target.closest ? e.target.closest('[data-ir-path]') : null;
    if (t) return t;
    var stack = document.elementsFromPoint(e.clientX, e.clientY) || [];
    for (var i = 0; i < stack.length; i++) {
      if (stack[i].dataset && stack[i].dataset.irPath) return stack[i];
    }
    return null;
  }
  function preview(t){
    if (!t) return '';
    var raw = (t.innerText || t.textContent || '').replace(/\\s+/g, ' ').trim();
    return raw.length > 60 ? raw.slice(0, 57) + '…' : raw;
  }
  // Compute sibling-position info for a given IR path by walking all
  // [data-ir-path] elements in the slide and counting those that share
  // the same parent prefix. Used to disable Move-up at index 0 and
  // Move-down at the last sibling.
  function siblingInfoFor(irPath){
    var info = { index: -1, count: 0 };
    if (!irPath) return info;
    var segs = irPath.split(',');
    if (segs.length < 2) return info;
    var parentPrefix = segs.slice(0, -1).join(',') + ',';
    var nodes = document.querySelectorAll('[data-ir-path]');
    for (var i = 0; i < nodes.length; i++) {
      var p = nodes[i].dataset && nodes[i].dataset.irPath;
      if (!p || p.indexOf(parentPrefix) !== 0) continue;
      var rest = p.slice(parentPrefix.length);
      // A direct child has a single numeric segment after the prefix
      // (e.g., parent "body," + "0"). Skip deeper descendants.
      if (rest.indexOf(',') !== -1) continue;
      if (!/^\\d+$/.test(rest)) continue;
      info.count++;
    }
    var lastSeg = segs[segs.length - 1];
    if (/^\\d+$/.test(lastSeg)) info.index = parseInt(lastSeg, 10);
    return info;
  }

  document.addEventListener('click', function(e){
    if (isOverlayDescendant(e.target)) return;
    var t = resolveIrPath(e);
    var irPath = t ? t.dataset.irPath : null;
    var text = preview(t);
    var pinMode = root.dataset.penguiPinMode === 'true';
    var structureMode = root.dataset.penguiStructureMode === 'true';
    window.parent.postMessage({
      source: 'pengui-slide',
      type: 'click-debug',
      pinMode: pinMode,
      irPath: irPath,
      preview: text,
      targetTag: e.target ? (e.target.tagName || '') : '',
      clientX: e.clientX, clientY: e.clientY,
      ts: Date.now()
    }, '*');
    if (pinMode && irPath) {
      e.preventDefault();
      e.stopPropagation();
      window.parent.postMessage({
        source: 'pengui-slide',
        type: 'pintarget',
        irPath: irPath,
        preview: text
      }, '*');
    }
    if (structureMode) {
      // v4.9c: clicks in edit-layout mode SELECT a block. The action
      // bar lives in the parent DOM (outside the iframe), so we stop
      // here and just notify the parent of the selection. Empty
      // clicks (no IR target) clear the selection.
      e.preventDefault();
      e.stopPropagation();
      var info = siblingInfoFor(irPath);
      // v4.9e: a block is morphable iff it carries at least one
      // [data-ir-rt-field] (rich-text-bearing) descendant. Image and
      // divider blocks have no rt-fields, so Change ▾ stays hidden
      // for them. The compiler emits these attributes on every text
      // role (eyebrow / title / body / text / items[N] / etc.).
      var morphable = !!(t && t.querySelector && t.querySelector('[data-ir-rt-field]'));
      window.parent.postMessage({
        source: 'pengui-slide',
        type: 'select-block',
        irPath: irPath,
        preview: text,
        siblingIndex: info.index,
        siblingCount: info.count,
        morphable: morphable
      }, '*');
    }
  }, true);

  // Paint a persistent selection outline on the chosen block. The
  // parent writes the path into documentElement.dataset.penguiSelectedPath
  // (mirrored from selectedIrPath state) and we apply the
  // [data-pengui-selected=true] flag to the matching block. CSS
  // (in injectAffordances above) draws the outline.
  function applySelectedFlag(){
    var marked = document.querySelectorAll('[data-pengui-selected="true"]');
    for (var i = 0; i < marked.length; i++) {
      marked[i].removeAttribute('data-pengui-selected');
    }
    var path = root.dataset.penguiSelectedPath;
    if (!path) return;
    var found = null;
    var nodes = document.querySelectorAll('[data-ir-path]');
    for (var j = 0; j < nodes.length; j++) {
      if (nodes[j].dataset.irPath === path) {
        nodes[j].setAttribute('data-pengui-selected', 'true');
        found = nodes[j];
      }
    }
    // Re-emit sibling-info so the parent action bar can refresh
    // canMoveUp/canMoveDown/canChangeType after a structural change
    // re-rendered the slide HTML (the parent's selectedIrPath survives
    // across reloads but the cached info goes stale).
    if (found) {
      var info = siblingInfoFor(path);
      var morphable = !!(found.querySelector && found.querySelector('[data-ir-rt-field]'));
      window.parent.postMessage({
        source: 'pengui-slide',
        type: 'selection-info',
        irPath: path,
        siblingIndex: info.index,
        siblingCount: info.count,
        morphable: morphable
      }, '*');
    }
  }

  // ── Edit-layout (a.k.a. structure-mode) ────────────────────────────
  // The action toolbar lives in the parent DOM (outside the iframe)
  // — see BlockActionBar.svelte. The bridge here only handles:
  //   - Painting a hover outline on the candidate block (light dashed)
  //   - Painting a selection outline on the chosen block (solid mint)
  //   - Making every block draggable
  //   - Drag-and-drop reorder (postMessages structure-reorder)
  //
  // Selection is driven by clicks (postMessage select-block above).
  var hoveredEl = null;

  function clearHoverDecoration(){
    if (hoveredEl) {
      hoveredEl.style.outline = '';
      hoveredEl.style.outlineOffset = '';
      hoveredEl.style.cursor = '';
      hoveredEl = null;
    }
  }

  function deactivateStructureMode(){
    clearHoverDecoration();
    var marked = document.querySelectorAll('[data-ir-path]');
    for (var i = 0; i < marked.length; i++) {
      var el = marked[i];
      if (el.getAttribute('draggable') === 'true') el.removeAttribute('draggable');
      el.style.cursor = '';
      el.style.boxShadow = '';
      el.style.opacity = '';
      if (el.dataset.penguiDropTarget) delete el.dataset.penguiDropTarget;
      if (el.dataset.penguiSelected) el.removeAttribute('data-pengui-selected');
    }
  }

  function activateStructureMode(){
    var nodes = document.querySelectorAll('[data-ir-path]');
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].setAttribute('draggable', 'true');
    }
    if (rtToolbarEl) rtToolbarEl.style.display = 'none';
    applySelectedFlag();
  }

  var lastStructureFlag = root.dataset.penguiStructureMode === 'true';
  if (lastStructureFlag) activateStructureMode();
  var moObserver = new MutationObserver(function(mutations){
    var on = root.dataset.penguiStructureMode === 'true';
    var modeChanged = on !== lastStructureFlag;
    if (modeChanged) {
      lastStructureFlag = on;
      if (on) activateStructureMode();
      else deactivateStructureMode();
    }
    // Selection might have changed even when mode didn't.
    for (var i = 0; i < mutations.length; i++) {
      if (mutations[i].attributeName === 'data-pengui-selected-path') {
        applySelectedFlag();
        break;
      }
    }
  });
  moObserver.observe(root, { attributes: true });

  // Light dashed hover outline so users see what they will click.
  // The solid outline is drawn by data-pengui-selected CSS.
  document.addEventListener('mouseover', function(e){
    if (root.dataset.penguiStructureMode !== 'true') return;
    if (isOverlayDescendant(e.target)) return;
    var t = e.target && e.target.closest ? e.target.closest('[data-ir-path]') : null;
    if (!t) return;
    if (t === hoveredEl) return;
    if (hoveredEl && hoveredEl.dataset.penguiSelected !== 'true') {
      hoveredEl.style.outline = '';
      hoveredEl.style.outlineOffset = '';
    }
    hoveredEl = t;
    if (t.dataset.penguiSelected !== 'true') {
      t.style.outline = '1px dashed rgba(47,184,166,0.6)';
      t.style.outlineOffset = '2px';
    }
  }, true);

  // Re-running parent-side scale sync triggers an iframe resize too.
  window.addEventListener('resize', function(){
    positionRtToolbar();
  });

  // ── Drag-and-drop reorder ──────────────────────────────────────────
  var dragSrcEl = null;
  // Custom drag image so the browser doesn't snapshot the full
  // (potentially 1500px-wide) block as the drag preview.
  var dragChip = null;

  function clearAllDropIndicators(){
    var marked = document.querySelectorAll('[data-pengui-drop-target="1"]');
    for (var i = 0; i < marked.length; i++) {
      marked[i].removeAttribute('data-pengui-drop-target');
      marked[i].removeAttribute('data-pengui-drop-side');
      marked[i].style.boxShadow = '';
    }
  }

  function makeDragChip(label){
    var chip = document.createElement('div');
    chip.dataset.penguiOverlay = '1';
    chip.textContent = 'Moving: ' + (label || 'block');
    chip.style.cssText = [
      'position:fixed',
      'top:-9999px',
      'left:-9999px',
      'padding:6px 10px',
      'background:rgba(18,18,18,0.95)',
      'color:#fff',
      'border-radius:6px',
      'font:13px/1 system-ui,-apple-system,Segoe UI,Roboto,sans-serif',
      'pointer-events:none',
      'box-shadow:0 4px 12px rgba(0,0,0,0.3)',
      'max-width:240px',
      'overflow:hidden',
      'text-overflow:ellipsis',
      'white-space:nowrap'
    ].join(';');
    document.body.appendChild(chip);
    return chip;
  }

  document.addEventListener('dragstart', function(e){
    if (root.dataset.penguiStructureMode !== 'true') return;
    if (isOverlayDescendant(e.target)) {
      e.preventDefault();
      return;
    }
    var t = e.target && e.target.closest ? e.target.closest('[data-ir-path]') : null;
    if (!t || !t.dataset.irPath) return;
    dragSrcEl = t;
    if (e.dataTransfer) {
      try {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/x-pengui-ir-path', t.dataset.irPath);
        if (e.dataTransfer.setDragImage) {
          dragChip = makeDragChip(preview(t));
          e.dataTransfer.setDragImage(dragChip, 12, 12);
        }
      } catch (err) { /* some browsers refuse custom MIME / drag images */ }
    }
    t.style.opacity = '0.4';
  }, true);

  document.addEventListener('dragend', function(){
    if (dragSrcEl) {
      dragSrcEl.style.opacity = '';
      dragSrcEl = null;
    }
    if (dragChip) {
      dragChip.remove();
      dragChip = null;
    }
    clearAllDropIndicators();
  }, true);

  document.addEventListener('dragover', function(e){
    if (root.dataset.penguiStructureMode !== 'true') return;
    if (!dragSrcEl) return;
    var t = e.target && e.target.closest ? e.target.closest('[data-ir-path]') : null;
    if (!t || t === dragSrcEl) return;
    if (dragSrcEl.contains(t)) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';

    // Decide above-vs-below based on cursor's Y relative to the
    // target's vertical midline, so users see exactly where their
    // block will land.
    var rect = t.getBoundingClientRect();
    var midY = rect.top + rect.height / 2;
    var side = e.clientY < midY ? 'above' : 'below';

    if (t.dataset.penguiDropTarget !== '1' || t.dataset.penguiDropSide !== side) {
      clearAllDropIndicators();
      t.dataset.penguiDropTarget = '1';
      t.dataset.penguiDropSide = side;
      var bar = side === 'above'
        ? 'inset 0 4px 0 rgba(47,184,166,0.95)'
        : 'inset 0 -4px 0 rgba(47,184,166,0.95)';
      t.style.boxShadow = bar;
    }
  }, true);

  document.addEventListener('drop', function(e){
    if (root.dataset.penguiStructureMode !== 'true') return;
    if (!dragSrcEl) return;
    var srcPath = dragSrcEl.dataset.irPath;
    var t = e.target && e.target.closest ? e.target.closest('[data-ir-path]') : null;
    if (!t || t === dragSrcEl || !t.dataset.irPath) return;
    if (dragSrcEl.contains(t)) return;
    e.preventDefault();
    e.stopPropagation();
    var rect = t.getBoundingClientRect();
    var side = e.clientY < (rect.top + rect.height / 2) ? 'above' : 'below';
    var destPath = t.dataset.irPath;
    window.parent.postMessage({
      source: 'pengui-slide',
      type: 'structure-reorder',
      srcIrPath: srcPath,
      destIrPath: destPath,
      position: side
    }, '*');
  }, true);

  // ── Rich-text selection toolbar ────────────────────────────────────
  var rtToolbarEl = null;

  // 9 semantic text-color roles (matches the TextColor enum). Class
  // suffixes use dashes; the IR stores underscored values (parser
  // restores the underscores). Swatch CSS vars come from the soul.
  var COLOR_ROLES = [
    { id: 'accent',      label: 'Accent',     varName: '--color-accent-primary' },
    { id: 'accent-alt',  label: 'Accent alt', varName: '--color-accent-secondary' },
    { id: 'accent-warm', label: 'Accent warm', varName: '--color-accent-warm' },
    { id: 'success',     label: 'Success',    varName: '--color-success' },
    { id: 'warning',     label: 'Warning',    varName: '--color-warning' },
    { id: 'error',       label: 'Error',      varName: '--color-error' },
    { id: 'info',        label: 'Info',       varName: '--color-info' },
    { id: 'muted',       label: 'Muted',      varName: '--color-text-muted' },
    { id: 'inverse',     label: 'Inverse',    varName: '--color-text-inverse' }
  ];

  function applyColorToSelection(roleClassSuffix){
    // Strip any pengui-text-* spans in the selection first, then if a
    // role was passed, wrap in a fresh span. roleClassSuffix === null
    // is "clear color" (Default). Works on collapsed-or-expanded
    // ranges; collapsed ranges no-op silently.
    var sel = document.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    var range = sel.getRangeAt(0);
    if (range.collapsed) return;
    try {
      // Pull the contents out so we can scrub child color-spans, then
      // re-insert. extractContents preserves nested formatting.
      var contents = range.extractContents();
      var walker = document.createTreeWalker(contents, NodeFilter.SHOW_ELEMENT, null);
      var toUnwrap = [];
      var n = walker.nextNode();
      while (n) {
        if (n.nodeName === 'SPAN' && n.className &&
            typeof n.className === 'string' &&
            n.className.indexOf('pengui-text-') !== -1) {
          toUnwrap.push(n);
        }
        n = walker.nextNode();
      }
      for (var u = 0; u < toUnwrap.length; u++) {
        var sp = toUnwrap[u];
        var p = sp.parentNode;
        if (!p) continue;
        while (sp.firstChild) p.insertBefore(sp.firstChild, sp);
        p.removeChild(sp);
      }
      var inserted;
      if (roleClassSuffix) {
        var span = document.createElement('span');
        span.className = 'pengui-text-' + roleClassSuffix;
        span.appendChild(contents);
        range.insertNode(span);
        inserted = span;
      } else {
        range.insertNode(contents);
        inserted = null;
      }
      sel.removeAllRanges();
      var after = document.createRange();
      if (inserted) after.selectNodeContents(inserted);
      else after.setStart(range.startContainer, range.startOffset);
      sel.addRange(after);
    } catch (e) { /* ignore — execCommand-style failures are best-effort */ }
  }

  function ensureRtToolbar(){
    if (rtToolbarEl) return rtToolbarEl;
    rtToolbarEl = document.createElement('div');
    rtToolbarEl.id = 'pengui-rt-toolbar';
    rtToolbarEl.dataset.penguiOverlay = '1';
    rtToolbarEl.style.cssText = [
      'position:fixed',
      'z-index:99999',
      'display:none',
      'flex-direction:column',
      'gap:4px',
      'padding:6px',
      'background:rgba(18,18,18,0.96)',
      'border-radius:8px',
      'box-shadow:0 8px 22px rgba(0,0,0,0.32)',
      'font:14px/1 system-ui,-apple-system,Segoe UI,Roboto,sans-serif',
      'color:#f5f5f5',
      'user-select:none',
      'pointer-events:auto',
      'transform-origin:top left'
    ].join(';');

    var topRow = document.createElement('div');
    topRow.dataset.penguiOverlay = '1';
    topRow.style.cssText = 'display:flex;gap:4px;align-items:center';
    var actions = [
      { cmd: 'bold',          label: 'B',   title: 'Bold (⌘B)',   weight: 700 },
      { cmd: 'italic',        label: 'I',   title: 'Italic (⌘I)', italic: true },
      { cmd: 'strikeThrough', label: 'S',   title: 'Strikethrough', strike: true },
      { cmd: 'wrap-code',     label: '</>', title: 'Inline code' },
      { cmd: 'unwrap-all',    label: '⌫',   title: 'Clear formatting' }
    ];
    for (var i = 0; i < actions.length; i++) {
      var a = actions[i];
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.cmd = a.cmd;
      btn.dataset.penguiOverlay = '1';
      btn.title = a.title;
      btn.textContent = a.label;
      var styleParts = [
        'all:unset',
        'cursor:pointer',
        'padding:8px 12px',
        'border-radius:6px',
        'background:rgba(255,255,255,0.10)',
        'color:#f5f5f5',
        'font:inherit',
        'min-width:24px',
        'text-align:center',
        'line-height:1'
      ];
      if (a.weight) styleParts.push('font-weight:' + a.weight);
      if (a.italic) styleParts.push('font-style:italic');
      if (a.strike) styleParts.push('text-decoration:line-through');
      btn.style.cssText = styleParts.join(';');
      btn.addEventListener('mousedown', function(ev){ ev.preventDefault(); });
      btn.addEventListener('mouseenter', function(){ this.style.background = 'rgba(47,184,166,0.55)'; });
      btn.addEventListener('mouseleave', function(){ this.style.background = 'rgba(255,255,255,0.10)'; });
      btn.addEventListener('click', function(ev){
        ev.preventDefault();
        ev.stopPropagation();
        var cmd = this.dataset.cmd;
        var sel = document.getSelection();
        if (!sel || sel.rangeCount === 0) return;
        try {
          if (cmd === 'wrap-code') {
            var range = sel.getRangeAt(0);
            var anchor = sel.anchorNode;
            var existingCode = anchor && anchor.nodeType === 1
              ? anchor.closest('code')
              : (anchor && anchor.parentNode && anchor.parentNode.closest)
                ? anchor.parentNode.closest('code') : null;
            if (existingCode) {
              var parent = existingCode.parentNode;
              while (existingCode.firstChild) parent.insertBefore(existingCode.firstChild, existingCode);
              parent.removeChild(existingCode);
            } else {
              var contents = range.extractContents();
              var code = document.createElement('code');
              code.appendChild(contents);
              range.insertNode(code);
              sel.removeAllRanges();
              var afterRange = document.createRange();
              afterRange.selectNodeContents(code);
              sel.addRange(afterRange);
            }
          } else if (cmd === 'unwrap-all') {
            var range2 = sel.getRangeAt(0);
            var plain = range2.toString();
            range2.deleteContents();
            range2.insertNode(document.createTextNode(plain));
          } else {
            document.execCommand(cmd, false);
          }
        } catch (e) { /* execCommand may throw in odd contexts */ }
        positionRtToolbar();
      });
      topRow.appendChild(btn);
    }
    rtToolbarEl.appendChild(topRow);

    // Color row: 9 semantic swatches + a "default" (clear-color)
    // chip. Swatches read from soul CSS vars so they always match
    // the active theme.
    var colorRow = document.createElement('div');
    colorRow.dataset.penguiOverlay = '1';
    colorRow.style.cssText =
      'display:flex;gap:4px;align-items:center;padding-top:2px;' +
      'border-top:1px solid rgba(255,255,255,0.12)';

    var colorLabel = document.createElement('span');
    colorLabel.dataset.penguiOverlay = '1';
    colorLabel.textContent = 'Color';
    colorLabel.style.cssText =
      'font-size:11px;color:rgba(245,245,245,0.7);padding:0 6px 0 2px;letter-spacing:0.04em';
    colorRow.appendChild(colorLabel);

    function makeColorSwatch(role){
      var sw = document.createElement('button');
      sw.type = 'button';
      sw.dataset.penguiOverlay = '1';
      sw.dataset.cmd = 'color';
      sw.dataset.colorId = role.id;
      sw.title = role.label;
      sw.style.cssText = [
        'all:unset',
        'cursor:pointer',
        'width:18px',
        'height:18px',
        'border-radius:50%',
        'background:var(' + role.varName + ', #888)',
        'border:1.5px solid rgba(255,255,255,0.35)',
        'box-shadow:0 0 0 1px rgba(0,0,0,0.4) inset'
      ].join(';');
      sw.addEventListener('mousedown', function(ev){ ev.preventDefault(); });
      sw.addEventListener('mouseenter', function(){
        this.style.transform = 'scale(1.18)';
        this.style.borderColor = 'rgba(255,255,255,0.85)';
      });
      sw.addEventListener('mouseleave', function(){
        this.style.transform = 'scale(1)';
        this.style.borderColor = 'rgba(255,255,255,0.35)';
      });
      sw.addEventListener('click', function(ev){
        ev.preventDefault();
        ev.stopPropagation();
        applyColorToSelection(this.dataset.colorId);
        positionRtToolbar();
      });
      return sw;
    }
    for (var c = 0; c < COLOR_ROLES.length; c++) {
      colorRow.appendChild(makeColorSwatch(COLOR_ROLES[c]));
    }

    var clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.dataset.penguiOverlay = '1';
    clearBtn.title = 'Default color';
    clearBtn.textContent = '⊘';
    clearBtn.style.cssText = [
      'all:unset',
      'cursor:pointer',
      'width:20px',
      'height:20px',
      'border-radius:50%',
      'background:rgba(255,255,255,0.06)',
      'border:1px dashed rgba(255,255,255,0.45)',
      'color:rgba(245,245,245,0.85)',
      'font-size:13px',
      'text-align:center',
      'line-height:18px',
      'margin-left:2px'
    ].join(';');
    clearBtn.addEventListener('mousedown', function(ev){ ev.preventDefault(); });
    clearBtn.addEventListener('mouseenter', function(){
      this.style.background = 'rgba(255,255,255,0.18)';
    });
    clearBtn.addEventListener('mouseleave', function(){
      this.style.background = 'rgba(255,255,255,0.06)';
    });
    clearBtn.addEventListener('click', function(ev){
      ev.preventDefault();
      ev.stopPropagation();
      applyColorToSelection(null);
      positionRtToolbar();
    });
    colorRow.appendChild(clearBtn);

    rtToolbarEl.appendChild(colorRow);
    document.body.appendChild(rtToolbarEl);
    return rtToolbarEl;
  }

  function positionRtToolbar(){
    var bar = ensureRtToolbar();
    var sel = document.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
      bar.style.display = 'none';
      return;
    }
    var anchor = sel.anchorNode;
    var host = anchor && (anchor.nodeType === 1 ? anchor : anchor.parentNode);
    var editable = host && host.closest ? host.closest('[contenteditable="true"]') : null;
    if (!editable) {
      bar.style.display = 'none';
      return;
    }
    var rect = sel.getRangeAt(0).getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      bar.style.display = 'none';
      return;
    }
    var inv = getInverseScale();
    bar.style.transform = inv === 1 ? 'none' : 'scale(' + inv + ')';
    // Use block-level flex so the column direction baked into
    // ensureRtToolbar (top button row + color swatch row) renders.
    bar.style.display = 'flex';
    var barW = (bar.offsetWidth || 220) * inv;
    var barH = (bar.offsetHeight || 40) * inv;
    var top = rect.top - barH - 6;
    if (top < 4) top = rect.bottom + 6;
    var left = rect.left;
    var maxLeft = (window.innerWidth || document.documentElement.clientWidth) - barW - 4;
    if (left > maxLeft) left = Math.max(4, maxLeft);
    bar.style.top = top + 'px';
    bar.style.left = left + 'px';
  }

  function hideRtToolbar(){
    if (rtToolbarEl) rtToolbarEl.style.display = 'none';
  }

  document.addEventListener('selectionchange', function(){
    if (root.dataset.penguiPinMode === 'true' || root.dataset.penguiStructureMode === 'true') {
      hideRtToolbar();
      return;
    }
    positionRtToolbar();
  });

  // ── Rich-text inline edit start / commit (v4.9c) ───────────────────
  // Click any [data-ir-rt-field] in default mode → make it editable.
  // On blur (or Cmd+Enter / Esc) → postMessage rt-field-commit with
  // the addressed irPath, field name, and raw innerHTML. The parent
  // parses (parseRichText) and routes through apply_*_field_edit.
  var rtActiveEl = null;
  var rtOriginalHtml = '';
  var rtKeyHandler = null;
  var rtBlurHandler = null;

  function teardownRtEdit(){
    if (!rtActiveEl) return;
    if (rtKeyHandler) rtActiveEl.removeEventListener('keydown', rtKeyHandler);
    if (rtBlurHandler) rtActiveEl.removeEventListener('blur', rtBlurHandler);
    rtKeyHandler = null;
    rtBlurHandler = null;
    rtActiveEl.contentEditable = 'false';
    delete rtActiveEl.dataset.editing;
    rtActiveEl = null;
    rtOriginalHtml = '';
  }

  function startRtEdit(target){
    if (rtActiveEl === target) return;
    teardownRtEdit();
    rtActiveEl = target;
    rtOriginalHtml = target.innerHTML;
    target.contentEditable = 'true';
    target.dataset.editing = 'true';

    rtKeyHandler = function(ev){
      if (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey)) {
        ev.preventDefault();
        target.blur();
      } else if (ev.key === 'Escape') {
        ev.preventDefault();
        target.innerHTML = rtOriginalHtml;
        target.blur();
      }
    };

    rtBlurHandler = function(){
      var owner = target.closest('[data-ir-path]');
      var irPath = owner ? owner.dataset.irPath : null;
      var field = target.dataset.irRtField;
      var html = target.innerHTML;
      var changed = html !== rtOriginalHtml;
      teardownRtEdit();
      if (!changed || !irPath || !field) return;
      window.parent.postMessage({
        source: 'pengui-slide',
        type: 'rt-field-commit',
        irPath: irPath,
        field: field,
        html: html
      }, '*');
    };

    target.addEventListener('keydown', rtKeyHandler);
    target.addEventListener('blur', rtBlurHandler, { once: true });

    setTimeout(function(){
      target.focus();
      var sel = document.getSelection();
      var range = document.createRange();
      range.selectNodeContents(target);
      sel && sel.removeAllRanges();
      sel && sel.addRange(range);
    }, 0);
  }

  document.addEventListener('click', function(e){
    // Only the bridge owns click-to-edit in default mode (no pin, no
    // structure). Pin / structure handlers fired in capture phase
    // already; this is bubble-phase.
    if (root.dataset.penguiPinMode === 'true') return;
    if (root.dataset.penguiStructureMode === 'true') return;
    if (isOverlayDescendant(e.target)) return;
    var t = e.target && e.target.closest ? e.target.closest('[data-ir-rt-field]') : null;
    if (!t) return;
    // If a different rich-text element is already active, the blur on
    // that one will have fired already (from the focus shift).
    if (rtActiveEl === t) return;
    startRtEdit(t);
  });
})();<\/script>`;
