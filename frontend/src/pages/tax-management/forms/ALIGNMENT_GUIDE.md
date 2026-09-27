# BIR Form Field Alignment — Measurement Guide

## Overview

This document captures the methodology and tools used to align field overlays on BIR form background images. Use this whenever adjusting `fieldPositions.js` for any BIR form (1604E, 2307, 0619E, etc.).

## Setup

- **Form rendering**: Each form page is a `<div>` with `position: relative`, sized in mm (`width: 215.9mm; height: 330.2mm` for long bond).
- **Background image**: An `<img>` with `position: absolute; top:0; left:0; width:100%; height:100%` stretches to fill.
- **Field overlays**: Absolutely-positioned `<div>` elements placed using mm coordinates from `fieldPositions.js`.
- **Rendering scale**: At 100% zoom, 1mm ≈ 3.78px (816px / 215.9mm).

## Measurement Method

### Step 1: Navigate to the Form View

1. Log in at `http://localhost:5173` (superadmin@geek / admin@123)
2. Go to Tax Management → BIR Forms → select the form
3. Click "BIR Form View" tab
4. Set browser to 1920×1080 for consistent screenshots

### Step 2: Take Element Screenshots (not viewport)

Use Playwright to screenshot the form element directly (avoids viewport clipping):

```js
const formEl = page.locator('[style*="215.9mm"]').first(); // or .nth(1) for page 2
await formEl.screenshot({ path: './form-page1.png', scale: 'css' });
```

For cropped sections:
```js
await formEl.screenshot({ 
  path: './form-section.png', 
  scale: 'css',
  clip: { x: 0, y: startPx, width: 816, height: heightPx }
});
```

Convert mm to px: `px = mm * 3.78`

### Step 3: Add Measurement Lines via JS

Inject colored vertical/horizontal lines to compare positions against the background:

```js
const formEl = document.querySelector('[style*="215.9mm"]');
const lines = [
  { type: 'v', pos: 32, color: 'blue' },   // vertical at x=32mm
  { type: 'h', pos: 128, color: 'red' },    // horizontal at y=128mm
];
lines.forEach(l => {
  const el = document.createElement('div');
  if (l.type === 'v') {
    el.style.cssText = `position:absolute; left:${l.pos}mm; top:0; width:1px; height:100%; background:${l.color}; opacity:0.5; z-index:9999; pointer-events:none;`;
  } else {
    el.style.cssText = `position:absolute; top:${l.pos}mm; left:0; height:1px; width:100%; background:${l.color}; opacity:0.5; z-index:9999; pointer-events:none;`;
  }
  el.className = 'alignment-line';
  formEl.appendChild(el);
});
```

Remove them: `document.querySelectorAll('.alignment-line').forEach(el => el.remove());`

### Step 4: Get Field Pixel Positions

Inspect currently rendered field positions vs background:

```js
const formEl = document.querySelector('[style*="215.9mm"]');
const formRect = formEl.getBoundingClientRect();
const fields = formEl.querySelectorAll('[style*="position: absolute"]');
fields.forEach(el => {
  if (el.tagName === 'IMG') return;
  const rect = el.getBoundingClientRect();
  console.log(el.textContent?.trim().substring(0, 20), {
    leftMm: ((rect.left - formRect.left) / formRect.width * 215.9).toFixed(1),
    topMm: ((rect.top - formRect.top) / formRect.height * 330.2).toFixed(1),
  });
});
```

### Step 5: Compare Against Background Image

Open the raw background image (`frontend/src/assets/bir{formId}-p{page}.png`) to identify exact coordinate of form features (boxes, lines, labels). The image maps 1:1 to the 215.9×330.2mm space.

Key reference points for a BIR form:
- Left margin of form content: ~12mm
- Right edge of form content: ~207mm
- Usable width: ~195mm

## Common Pitfalls

| Issue | Cause | Fix |
|-------|-------|-----|
| Text clipped on left | x position too close to 0 (outside printable area) | Move x rightward (~12mm minimum) |
| Data overlaps column headers | START_Y too high | Increase START_Y by one header row height |
| Year shows wrong chars | Full year passed but only last 2 digits should render | Slice to last 2 digits, or adjust x/spacing |
| Letter-spacing too wide | Chars overshoot their boxes | Reduce LETTER_SPACING value |
| Checkbox misaligned | x/y off from the box center | Fine-tune by 1-2mm increments |
| Fields overlap labels | Data positioned where the label text is | Move data x past the label's end position |

## Form-Specific Notes

### BIR 1604-E (Long Bond 8.5"×13", 2 pages)

**Page dimensions**: 215.9mm × 330.2mm

**Key measurements verified (July 2026):**
- Schedule column x-positions: date=32, bank=59, tra=86, taxes=116, penalties=144, total=172 ✓
- Year boxes: last 2 digits start at x≈46mm (pre-printed "20" is before this)
- TIN digit boxes: first segment starts x≈57mm, segments spaced 16mm apart
- Contact Number input: starts after label at x≈68mm
- Email Address input: starts after label at x≈115mm  
- Schedule 1 header is ~2 rows tall; first data row starts at y≈135mm (not 128)
- Schedule 2 header is ~2 rows tall; first data row starts at y≈184mm (not 179)
- Row heights: Sched1 ≈ 6.8mm, Sched2 ≈ 5.5mm

**Field position adjustments made:**
- YEAR_DIGITS: Only render last 2 digits of year, reduce letter spacing
- CONTACT_NUMBER: x moved from 9.5 → 68, reduced width
- EMAIL_ADDRESS: x moved from 63 → 115, reduced width  
- SCHED1_START_Y: 128 → 135 (below header)
- SCHED2_START_Y: 179 → 184 (below header)
- AGENT_NAME: x moved from 9.5 → 12 (inside form border)
- ADDRESS: x moved from 9.5 → 12

## Iteration Workflow

1. Make changes to `fieldPositions.js`
2. Wait for Vite HMR to reload
3. Re-screenshot the form element
4. Compare — repeat until aligned
5. Final full-page screenshot for sign-off
