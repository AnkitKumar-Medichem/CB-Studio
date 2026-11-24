from __future__ import annotations

import json
from typing import Any

from .presets import (
    MOLECULE_PRESETS,
    QUICK_TRY_EXAMPLES,
    SMILES_GUIDE_CARDS,
    VSEPR_MATRIX,
)
from .styles import APP_CSS


def build_frontend_html(initial_molecule: dict[str, Any]) -> str:
    boot_data = json.dumps(
        {
            "initialMolecule": initial_molecule,
            "presets": MOLECULE_PRESETS,
            "quickTry": QUICK_TRY_EXAMPLES,
            "vseprMatrix": VSEPR_MATRIX,
            "smilesGuide": SMILES_GUIDE_CARDS,
        },
        ensure_ascii=False,
    ).replace("</", "<\\/")

    return f"""<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>CB Studio</title>
    <link
      href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap"
      rel="stylesheet"
      media="print"
      onload="this.media='all'"
    />
    <style>{APP_CSS}</style>
  </head>
  <body class="bg-white text-slate-900 antialiased selection:bg-sky-500/20 selection:text-slate-900">
    <div id="root" class="h-screen w-screen overflow-hidden">
      <div class="flex h-screen w-screen flex-col md:flex-row overflow-hidden bg-white text-slate-900">
        <!-- Left Minimalist SMILES & VSEPR Rail -->
        <aside class="flex w-full md:w-[276px] lg:w-[308px] xl:w-[324px] shrink-0 flex-col border-b md:border-b-0 md:border-r border-slate-200 bg-[#FAFAFA] max-h-[34vh] md:max-h-none overflow-hidden">
            <!-- SMILES Input -->
            <div class="border-b border-slate-200 bg-white p-3.5">
              <label for="smiles-input" class="block text-xs font-medium text-slate-700 mb-1.5">
                SMILES Input
              </label>

              <form id="smiles-form" class="flex items-center gap-2">
                <input
                  id="smiles-input"
                  type="text"
                  placeholder="e.g. O, N, O=S=O, S(F)(F)(F)F"
                  spellcheck="false"
                  autocomplete="off"
                  class="min-w-0 flex-1 h-8 rounded-lg border border-slate-200 bg-white px-3 font-mono text-xs text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none"
                />
                <button
                  type="submit"
                  class="h-8 rounded-lg bg-slate-900 px-3.5 text-xs font-medium text-white hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Build
                </button>
              </form>

              <div id="quick-try-row" class="mt-2 flex items-center gap-1.5 overflow-x-auto pb-0.5 lab-scroll text-[11px]"></div>

              <div
                id="smiles-error-box"
                role="alert"
                class="hidden mt-2.5 flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 px-2.5 py-2 text-xs text-rose-700"
              >
                <svg class="h-4 w-4 shrink-0 text-rose-500 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                <span id="smiles-error-text"></span>
              </div>
            </div>

            <!-- Minimal Segmented Tabs -->
            <div class="border-b border-slate-200 bg-white px-3.5 py-2">
              <div id="rail-tabs" class="grid grid-cols-3 gap-1 rounded-lg bg-slate-100 p-0.5">
                <button type="button" data-tab="atom" class="rounded-md px-2 py-1 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer bg-white text-slate-900 shadow-xs">Inspector</button>
                <button type="button" data-tab="atoms-table" class="rounded-md px-2 py-1 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer text-slate-500 hover:text-slate-900">Atoms</button>
                <button type="button" data-tab="presets" class="rounded-md px-2 py-1 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer text-slate-500 hover:text-slate-900">Library</button>
              </div>
            </div>

            <!-- Rail Content -->
            <div id="rail-content" class="flex-1 overflow-y-auto lab-scroll p-3.5 space-y-3.5"></div>
          </aside>

          <!-- Main Pure White 3D Molecular Viewport Stage -->
          <main class="relative flex-1 min-h-[340px] md:min-h-0 overflow-hidden bg-white">
            <div id="viewport-container" class="relative w-full h-full overflow-hidden bg-white select-none">
              <div id="webgl-mount" class="w-full h-full"></div>

              <div id="context-lost-banner" class="hidden absolute inset-0 z-30 flex items-center justify-center bg-white text-slate-600 text-sm">
                3D rendering context paused. Restoring WebGL viewport...
              </div>

              <!-- Top-Left Minimal Molecule Readout -->
              <div id="top-left-readout" class="pointer-events-none absolute top-3.5 left-4 z-10 max-w-[calc(100%-2rem)]"></div>

              <!-- Projected 3D Atom Labels Layer -->
              <div id="atom-label-layer" class="pointer-events-none absolute inset-0 z-10 overflow-hidden"></div>

              <!-- Projected 3D Bond Angle Labels Layer -->
              <div id="angle-label-layer" class="pointer-events-none absolute inset-0 z-10 overflow-hidden"></div>

              <!-- Hover Tooltip -->
              <div id="hover-tooltip" class="hidden pointer-events-none absolute z-20 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 shadow-sm"></div>
            </div>
          </main>

          <!-- Fixed Right-Docked Display & Reference Options Rail -->
          <aside
            id="right-control-panel"
            class="flex w-full md:w-[196px] lg:w-[216px] xl:w-[228px] shrink-0 flex-col border-t md:border-t-0 md:border-l border-slate-200 bg-[#FAFAFA] max-h-[30vh] md:max-h-none overflow-hidden"
          >
            <div class="flex-1 overflow-y-auto lab-scroll p-3.5 space-y-3.5">
              <!-- Render Style -->
              <div>
                <div class="text-xs font-medium text-slate-700 mb-2">
                  Render Style
                </div>
                <div class="flex flex-col gap-0.5 rounded-lg border border-slate-200 bg-slate-100 p-0.5">
                  <button type="button" data-style="ball-stick" class="flex h-7 w-full items-center px-2.5 text-left text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer bg-white text-slate-900 shadow-xs">Ball &amp; Stick</button>
                  <button type="button" data-style="space-fill" class="flex h-7 w-full items-center px-2.5 text-left text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer text-slate-600 hover:text-slate-900">Space-Fill</button>
                  <button type="button" data-style="wireframe" class="flex h-7 w-full items-center px-2.5 text-left text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer text-slate-600 hover:text-slate-900">Wireframe</button>
                </div>
              </div>

              <!-- Chemistry Overlays -->
              <div class="border-t border-slate-200 pt-3">
                <div class="text-xs font-medium text-slate-700 mb-2">
                  Overlays
                </div>
                <div class="flex flex-col gap-1.5">
                  <button id="toggle-lp-btn" type="button" class="flex h-7 w-full items-center gap-2 rounded-md px-2.5 text-xs font-medium border transition-colors whitespace-nowrap cursor-pointer bg-amber-50 border-amber-300 text-amber-900">
                    <svg class="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="1"/></svg>
                    <span>Lone Pairs</span>
                  </button>
                  <button id="toggle-orbitals-btn" type="button" class="flex h-7 w-full items-center gap-2 rounded-md px-2.5 text-xs font-medium border transition-colors whitespace-nowrap cursor-pointer bg-white border-slate-200 text-slate-500 hover:text-slate-900">
                    <svg class="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/></svg>
                    <span>Orbitals</span>
                  </button>
                  <button id="toggle-angles-btn" type="button" class="flex h-7 w-full items-center gap-2 rounded-md px-2.5 text-xs font-medium border transition-colors whitespace-nowrap cursor-pointer bg-sky-50 border-sky-300 text-sky-900">
                    <svg class="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>
                    <span>Angles</span>
                  </button>
                  <button id="toggle-cage-btn" type="button" class="flex h-7 w-full items-center gap-2 rounded-md px-2.5 text-xs font-medium border transition-colors whitespace-nowrap cursor-pointer bg-sky-50 border-sky-300 text-sky-900">
                    <svg class="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>
                    <span>Cage</span>
                  </button>
                  <button id="toggle-vdw-btn" type="button" class="flex h-7 w-full items-center gap-2 rounded-md px-2.5 text-xs font-medium border transition-colors whitespace-nowrap cursor-pointer bg-white border-slate-200 text-slate-500 hover:text-slate-900">
                    <svg class="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.1 2.182a10 10 0 0 1 3.8 0"/><path d="M13.9 21.818a10 10 0 0 1-3.8 0"/><path d="M17.609 3.721a10 10 0 0 1 2.69 2.7"/><path d="M2.182 13.9a10 10 0 0 1 0-3.8"/><path d="M20.279 17.609a10 10 0 0 1-2.7 2.69"/><path d="M21.818 10.1a10 10 0 0 1 0 3.8"/><path d="M3.721 6.391a10 10 0 0 1 2.7-2.69"/><path d="M6.391 20.279a10 10 0 0 1-2.69-2.7"/></svg>
                    <span>VdW Spheres</span>
                  </button>
                  <button id="toggle-labels-btn" type="button" class="flex h-7 w-full items-center gap-2 rounded-md px-2.5 text-xs font-medium border transition-colors whitespace-nowrap cursor-pointer bg-slate-900 border-slate-900 text-white">
                    <svg class="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/></svg>
                    <span>Labels</span>
                  </button>
                </div>

                <!-- Lone-Pair Color Key -->
                <div class="mt-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2 space-y-1 text-[11px] text-slate-600">
                  <div class="flex items-center gap-2 whitespace-nowrap">
                    <span class="inline-block h-2 w-2 rounded-full bg-amber-600 shrink-0"></span>
                    <span>Localized LP</span>
                  </div>
                  <div class="flex items-center gap-2 whitespace-nowrap">
                    <span class="inline-block h-2 w-2 rounded-full bg-violet-600 shrink-0"></span>
                    <span>&#960;-conjugated LP</span>
                  </div>
                </div>
              </div>

              <!-- Motion & Camera -->
              <div class="border-t border-slate-200 pt-3">
                <div class="text-xs font-medium text-slate-700 mb-2">
                  View
                </div>
                <div class="grid grid-cols-2 gap-1.5">
                  <button id="toggle-spin-btn" type="button" class="flex h-7 w-full items-center justify-center gap-1.5 rounded-md px-2 text-xs font-medium border transition-colors whitespace-nowrap cursor-pointer bg-white border-slate-200 text-slate-600 hover:text-slate-900">
                    <svg class="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="6 3 20 12 6 21 6 3"/></svg>
                    <span>Spin</span>
                  </button>
                  <button id="reset-camera-btn" type="button" class="flex h-7 w-full items-center justify-center gap-1.5 rounded-md px-2 text-xs font-medium border border-slate-200 bg-white text-slate-600 hover:text-slate-900 transition-colors whitespace-nowrap cursor-pointer">
                    <svg class="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
                    <span>Reset</span>
                  </button>
                </div>
              </div>

              <!-- Reference Guides -->
              <div class="border-t border-slate-200 pt-3">
                <div class="text-xs font-medium text-slate-700 mb-2">
                  Reference
                </div>
                <div class="flex flex-col gap-1.5">
                  <button id="nav-vsepr" type="button" class="flex h-7 w-full items-center justify-between rounded-md border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 hover:border-slate-300 hover:text-slate-900 transition-colors whitespace-nowrap cursor-pointer">
                    <span>VSEPR Table</span>
                    <svg class="h-3.5 w-3.5 text-slate-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
                  </button>
                  <button id="nav-guide" type="button" class="flex h-7 w-full items-center justify-between rounded-md border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 hover:border-slate-300 hover:text-slate-900 transition-colors whitespace-nowrap cursor-pointer">
                    <span>SMILES Guide</span>
                    <svg class="h-3.5 w-3.5 text-slate-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
                  </button>
                </div>
              </div>
            </div>

            <!-- Export Action -->
            <div class="border-t border-slate-200 bg-white p-3.5 shrink-0">
              <button
                id="export-png-btn"
                type="button"
                class="flex h-8 w-full items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-3 text-xs font-medium text-white hover:bg-slate-800 transition-colors whitespace-nowrap cursor-pointer"
              >
                <svg class="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>
                <span>Export PNG</span>
              </button>
            </div>
          </aside>

        <!-- VSEPR Reference Modal -->
        <div id="vsepr-modal" class="hidden fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 p-4" role="dialog" aria-modal="true" aria-labelledby="vsepr-ref-title">
          <div class="w-full max-w-5xl max-h-[86vh] flex flex-col rounded-xl border border-slate-200 bg-white text-slate-900 shadow-lg" onclick="event.stopPropagation()">
            <div class="flex items-center justify-between gap-4 border-b border-slate-200 px-6 py-4">
              <div>
                <h2 id="vsepr-ref-title" class="text-base font-semibold tracking-tight text-slate-900">
                  VSEPR Theory &amp; Hybridization Reference
                </h2>
                <p class="mt-0.5 text-xs text-slate-500">
                  Select any geometry row to load its 3D structure with lone-pair orbitals.
                </p>
              </div>
              <button id="vsepr-modal-close" type="button" class="rounded-lg border border-slate-200 bg-white p-2 text-slate-500 hover:text-slate-900 transition-colors cursor-pointer" aria-label="Close reference">
                <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
              </button>
            </div>
            <div class="flex-1 overflow-auto lab-scroll px-6 py-4">
              <table class="w-full text-left border-collapse text-xs">
                <thead>
                  <tr class="border-b border-slate-200 text-slate-500 font-medium">
                    <th class="py-2.5 pr-3">SN</th>
                    <th class="py-2.5 pr-3">Hybrid</th>
                    <th class="py-2.5 pr-3">Notation</th>
                    <th class="py-2.5 pr-3">Bonds / LP</th>
                    <th class="py-2.5 pr-3">Electron Geometry</th>
                    <th class="py-2.5 pr-3">Molecular Shape</th>
                    <th class="py-2.5 pr-3">Bond Angles</th>
                    <th class="py-2.5 text-right">3D Example</th>
                  </tr>
                </thead>
                <tbody id="vsepr-matrix-body" class="divide-y divide-slate-100"></tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- SMILES Quick Syntax Guide Modal -->
        <div id="smiles-modal" class="hidden fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 p-4" role="dialog" aria-modal="true" aria-labelledby="smiles-guide-title">
          <div class="w-full max-w-2xl max-h-[86vh] flex flex-col rounded-xl border border-slate-200 bg-white text-slate-900 shadow-lg" onclick="event.stopPropagation()">
            <div class="flex items-center justify-between gap-4 border-b border-slate-200 px-6 py-4 shrink-0">
              <div>
                <h2 id="smiles-guide-title" class="text-base font-semibold text-slate-900">
                  SMILES Notation Guide
                </h2>
                <p class="mt-0.5 text-xs text-slate-500">
                  Enter molecular graphs using standard SMILES syntax.
                </p>
              </div>
              <button id="smiles-modal-close" type="button" class="rounded-lg border border-slate-200 bg-white p-2 text-slate-500 hover:text-slate-900 transition-colors cursor-pointer shrink-0" aria-label="Close guide">
                <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
              </button>
            </div>
            <div class="flex-1 overflow-y-auto lab-scroll p-6 space-y-4 text-xs">
              <div id="smiles-guide-grid" class="grid grid-cols-1 sm:grid-cols-2 gap-3"></div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <script id="cb-boot-data" type="application/json">{boot_data}</script>

    <script>
      (function () {{
        window.__cbPendingRender = null;
        window.__cbOnRender = null;

        window.addEventListener('message', function (event) {{
          var data = event.data;
          if (!data || data.type !== 'streamlit:render') return;
          if (typeof window.__cbOnRender === 'function') {{
            window.__cbOnRender(data.args || {{}});
          }} else {{
            window.__cbPendingRender = data.args || {{}};
          }}
        }});

        if (window.parent && window.parent !== window) {{
          var syncHeight = function () {{
            var h = window.innerHeight || 760;
            try {{
              if (window.parent.innerHeight) h = window.parent.innerHeight;
            }} catch (e) {{}}
            window.parent.postMessage(
              {{ isStreamlitMessage: true, type: 'streamlit:setFrameHeight', height: Math.max(480, h) }},
              '*'
            );
          }};
          window.parent.postMessage(
            {{ isStreamlitMessage: true, type: 'streamlit:componentReady', apiVersion: 1 }},
            '*'
          );
          syncHeight();
          window.addEventListener('resize', syncHeight);
          try {{
            window.parent.addEventListener('resize', syncHeight);
          }} catch (e) {{}}
        }}
      }})();
    </script>

    <script type="module">
      import * as THREE from './three.bundle.js';
      import {{ OrbitControls }} from './three.bundle.js';

      const BOOT = JSON.parse(document.getElementById('cb-boot-data').textContent);

      const state = {{
        molecule: BOOT.initialMolecule,
        selectedAtomId: BOOT.initialMolecule?.summary?.primaryCenterId ?? null,
        smilesInput: BOOT.initialMolecule?.summary?.smiles ?? 'S(F)(F)(F)F',
        errorMsg: null,
        activeTab: 'atom',
        presetCategory: 'All',
        showAllHydrogensInTable: false,
        renderStyle: 'ball-stick',
        showLonePairs: true,
        showHybridOrbitals: false,
        showBondAngles: true,
        showVseprCage: true,
        showVdwSpheres: false,
        showLabels: true,
        autoSpin: false,
        referenceOpen: false,
        smilesGuideOpen: false,
        reqSeq: 0,
        lastHandledReqId: null,
      }};

      function escapeHtml(str) {{
        return String(str ?? '')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');
      }}

      function getContrastText(hex) {{
        const clean = String(hex || '#FFFFFF').replace('#', '');
        if (clean.length < 6) return '#0F172A';
        const r = parseInt(clean.slice(0, 2), 16) / 255;
        const g = parseInt(clean.slice(2, 4), 16) / 255;
        const b = parseInt(clean.slice(4, 6), 16) / 255;
        const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        return lum < 0.45 ? '#FFFFFF' : '#0F172A';
      }}

      function getVseprExplanation(atom) {{
        if (atom.symbol === 'H') {{
          return 'Hydrogen forms 1 \u03c3 bond using its 1s orbital with 0 lone pairs.';
        }}
        if (atom.sigmaBonds <= 1) {{
          if (atom.lonePairs > 0) {{
            return `Terminal ${{atom.name.toLowerCase()}} with ${{atom.lonePairs}} lone pair${{atom.lonePairs === 1 ? '' : 's'}} and ${{atom.sigmaBonds}} \u03c3 bond${{atom.sigmaBonds === 1 ? '' : 's'}}.`;
          }}
          return `Terminal atom with ${{atom.sigmaBonds}} \u03c3 bond.`;
        }}
        const lp = atom.localizedLonePairs;
        const sn = atom.stericNumber;
        if (sn === 2) return 'Two electron domains separate at 180\u00b0 using collinear sp hybrid orbitals.';
        if (sn === 3) {{
          return lp === 0
            ? 'Three bonding domains arrange symmetrically in a plane at 120\u00b0 (sp\u00b2).'
            : 'One sp\u00b2 lone pair compresses the bond angle slightly below 120\u00b0 (~118\u00b0).';
        }}
        if (sn === 4) {{
          if (lp === 0) return 'Four sp\u00b3 bonding domains point toward regular tetrahedral vertices (109.5\u00b0).';
          if (lp === 1) return 'One sp\u00b3 lone pair compresses the three bonds into a ~107\u00b0 trigonal pyramid.';
          return 'Two sp\u00b3 lone pairs repel the bonding pairs, compressing the bond angle to ~104.5\u00b0.';
        }}
        if (sn === 5) {{
          if (lp === 0) return 'Five sp\u00b3d bonding domains occupy 2 axial (180\u00b0) and 3 equatorial (120\u00b0) sites.';
          if (lp === 1) return 'One equatorial sp\u00b3d lone pair minimizes 90\u00b0 repulsions, forming a seesaw shape.';
          if (lp === 2) return 'Two equatorial sp\u00b3d lone pairs leave a slightly bent T-shaped molecular arrangement.';
          return 'Three equatorial lone pairs force the two bonded atoms into a 180\u00b0 linear axis.';
        }}
        if (sn === 6) {{
          if (lp === 0) return 'Six sp\u00b3d\u00b2 hybrid orbitals point along orthogonal \u00b1X, \u00b1Y, \u00b1Z octahedral axes (90\u00b0).';
          if (lp === 1) return 'One sp\u00b3d\u00b2 lone pair nudges the four basal ligands slightly upward (~84.8\u00b0).';
          return 'Two trans (180\u00b0) sp\u00b3d\u00b2 lone pairs leave a flat square planar geometry.';
        }}
        return `Steric number ${{sn}} (${{atom.hybridization}}) balances ${{atom.sigmaBonds}} \u03c3 bonds and ${{lp}} localized lone pairs.`;
      }}

      function getSelectedAtom() {{
        const mol = state.molecule;
        if (!mol || !mol.atoms || !mol.atoms.length) return null;
        return (
          mol.atoms.find((a) => a.id === state.selectedAtomId) ||
          mol.atoms.find((a) => a.id === mol.summary.primaryCenterId) ||
          mol.atoms[0]
        );
      }}

      function getFocusAtom() {{
        const mol = state.molecule;
        if (!mol || !mol.atoms) return null;
        return (
          mol.atoms.find((a) => a.id === state.selectedAtomId) ||
          mol.atoms.find((a) => a.id === mol.summary.primaryCenterId) ||
          null
        );
      }}

      // Request Python RDKit backend to build a molecule
      function requestSmilesFromPython(raw, meta) {{
        const trimmed = String(raw || '').trim();
        state.smilesInput = trimmed;
        document.getElementById('smiles-input').value = trimmed;

        if (!trimmed) {{
          state.errorMsg = 'Please enter a SMILES string.';
          renderErrorBox();
          return;
        }}
        if (/\\s/.test(trimmed)) {{
          state.errorMsg = 'SMILES strings cannot contain whitespace.';
          renderErrorBox();
          return;
        }}

        const matchedPreset = BOOT.presets.find((p) => p.smiles === trimmed);
        const resolvedMeta = meta || (matchedPreset ? {{ name: matchedPreset.name, notes: matchedPreset.description }} : {{}});
        const reqId = ++state.reqSeq;

        if (window.parent && window.parent !== window) {{
          window.parent.postMessage(
            {{
              isStreamlitMessage: true,
              type: 'streamlit:setComponentValue',
              value: {{
                smiles: trimmed,
                name: resolvedMeta.name || null,
                notes: resolvedMeta.notes || null,
                reqId,
              }},
              dataType: 'json',
            }},
            '*'
          );
        }}
      }}

      // Three.js Viewport Controller
      const viewport = (() => {{
        const container = document.getElementById('viewport-container');
        const mount = document.getElementById('webgl-mount');
        const labelLayer = document.getElementById('atom-label-layer');
        const angleLabelLayer = document.getElementById('angle-label-layer');
        const tooltipEl = document.getElementById('hover-tooltip');
        const contextLostBanner = document.getElementById('context-lost-banner');

        const _vecA = new THREE.Vector3();
        const _vecB = new THREE.Vector3();
        const _vecMid = new THREE.Vector3();
        const _vecDir = new THREE.Vector3();
        const _vecUp = new THREE.Vector3(0, 1, 0);
        const _vecPerp = new THREE.Vector3();
        const _vecPerp2 = new THREE.Vector3();
        const _quat = new THREE.Quaternion();
        const _projVec = new THREE.Vector3();
        const _camRight = new THREE.Vector3();
        const _camUp = new THREE.Vector3();
        const _rotQuat = new THREE.Quaternion();

        function detectSoftwareWebGL() {{
          try {{
            const canvas = document.createElement('canvas');
            const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
            if (!gl) return true;
            const ext = gl.getExtension('WEBGL_debug_renderer_info');
            const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
            const gpu = String(gl.getParameter(param) || '');
            gl.getExtension('WEBGL_lose_context')?.loseContext();
            return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
          }} catch {{
            return true;
          }}
        }}

        function createTeardropLobeGeometry(length = 1.05, maxRadius = 0.28) {{
          const pts = [];
          const steps = 24;
          for (let i = 0; i <= steps; i++) {{
            const t = i / steps;
            const y = t * length;
            const profile = Math.sin(Math.pow(t, 0.72) * Math.PI) * (0.28 + 0.85 * t);
            pts.push(new THREE.Vector2(Math.max(0.001, profile * maxRadius), y));
          }}
          pts.push(new THREE.Vector2(0.001, length));
          return new THREE.LatheGeometry(pts, 24);
        }}

        function needsLightOutline(hex) {{
          const c = new THREE.Color(hex);
          const lum = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
          return lum > 0.78;
        }}

        function disposeObject3D(obj) {{
          obj.traverse((child) => {{
            if (child instanceof THREE.Mesh || child instanceof THREE.Line || child instanceof THREE.LineSegments) {{
              child.geometry?.dispose();
              if (Array.isArray(child.material)) {{
                child.material.forEach((m) => m.dispose());
              }} else {{
                child.material?.dispose();
              }}
            }}
          }});
        }}

        function computeIdealCamera(mol) {{
          if (!mol || !mol.atoms || mol.atoms.length === 0) return 6.5;
          let maxR = 1.5;
          for (const a of mol.atoms) {{
            const d = Math.hypot(a.position.x, a.position.y, a.position.z) + 1.3;
            if (d > maxR) maxR = d;
          }}
          return Math.max(4.6, Math.min(26, maxR * 2.25));
        }}

        let renderer;
        try {{
          const isSoftwareGl = detectSoftwareWebGL();
          const width = container.clientWidth || 800;
          const height = container.clientHeight || 600;

          renderer = new THREE.WebGLRenderer({{
            antialias: !isSoftwareGl,
            powerPreference: 'high-performance',
            preserveDrawingBuffer: false,
          }});
          renderer.outputColorSpace = THREE.SRGBColorSpace;
          renderer.toneMapping = THREE.NoToneMapping;
          renderer.toneMappingExposure = 1.0;
          renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
          renderer.setSize(width, height);
          renderer.shadowMap.enabled = false;
          renderer.domElement.style.display = 'block';
          renderer.domElement.style.width = '100%';
          renderer.domElement.style.height = '100%';
          mount.appendChild(renderer.domElement);

          renderer.domElement.addEventListener('webglcontextlost', (e) => {{
            e.preventDefault();
            contextLostBanner.classList.remove('hidden');
          }});
          renderer.domElement.addEventListener('webglcontextrestored', () => {{
            contextLostBanner.classList.add('hidden');
          }});

          const scene = new THREE.Scene();
          scene.background = new THREE.Color(0xffffff);

          const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 150);
          camera.position.set(2.8, 2.2, 5.5);

          const controls = new OrbitControls(camera, renderer.domElement);
          controls.enableDamping = !isSoftwareGl;
          controls.dampingFactor = 0.065;
          controls.minDistance = 2.0;
          controls.maxDistance = 38;
          controls.enablePan = true;

        const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
        scene.add(ambientLight);
        const keyLight = new THREE.DirectionalLight(0xffffff, 0.36);
        keyLight.position.set(3, 5, 6);
        keyLight.castShadow = false;
        scene.add(keyLight);

        const moleculeGroup = new THREE.Group();
        const overlayGroup = new THREE.Group();
        scene.add(moleculeGroup);
        scene.add(overlayGroup);

        const raycaster = new THREE.Raycaster();
        raycaster.layers.set(1);
        const pointer = new THREE.Vector2();

        let atomMeshes = [];
        let angleLabelAnchors = [];
        let cameraGoal = null;
        let idealDistance = 6.5;
        let prevSmiles = null;
        let frameId = 0;
        let renderBusy = false;
        let renderDirty = false;
        let lastClockTime = performance.now();
        const pressedArrowKeys = new Set();

        function updateDomLabels() {{
          const mol = state.molecule;
          const w = container.clientWidth || 1;
          const h = container.clientHeight || 1;

          if (mol && state.showLabels) {{
            const children = labelLayer.children;
            for (let i = 0; i < mol.atoms.length; i++) {{
              const el = children[i];
              if (!el) continue;
              const a = mol.atoms[i];
              _projVec.set(a.position.x, a.position.y, a.position.z);
              _projVec.applyMatrix4(moleculeGroup.matrixWorld);
              _projVec.project(camera);
              if (_projVec.z > 1 || _projVec.z < -1) {{
                el.style.opacity = '0';
                continue;
              }}
              const sx = ((_projVec.x + 1) / 2) * w;
              const sy = ((-_projVec.y + 1) / 2) * h;
              el.style.opacity = '1';
              el.style.transform = `translate3d(${{sx.toFixed(1)}}px, ${{(sy - 20).toFixed(1)}}px, 0) translate(-50%, -100%)`;
            }}
          }}

          if (state.showBondAngles) {{
            const children = angleLabelLayer.children;
            for (let i = 0; i < angleLabelAnchors.length; i++) {{
              const el = children[i];
              if (!el) continue;
              const anc = angleLabelAnchors[i];
              _projVec.set(anc.pos.x, anc.pos.y, anc.pos.z);
              _projVec.applyMatrix4(moleculeGroup.matrixWorld);
              _projVec.project(camera);
              if (_projVec.z > 1 || _projVec.z < -1) {{
                el.style.opacity = '0';
                continue;
              }}
              const sx = ((_projVec.x + 1) / 2) * w;
              const sy = ((-_projVec.y + 1) / 2) * h;
              el.style.opacity = '1';
              el.style.transform = `translate3d(${{sx.toFixed(1)}}px, ${{sy.toFixed(1)}}px, 0) translate(-50%, -50%)`;
            }}
          }}
        }}

        function afterDraw(cb) {{
          const gl = renderer.getContext();
          if (!gl || typeof gl.fenceSync !== 'function') {{
            frameId = window.setTimeout(cb, 80);
            return;
          }}
          const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
          gl.flush();
          const poll = () => {{
            const st = sync ? gl.getSyncParameter(sync, gl.SYNC_STATUS) : gl.SIGNALED;
            if (st === gl.UNSIGNALED) {{
              frameId = window.setTimeout(poll, 5);
            }} else {{
              if (sync) gl.deleteSync(sync);
              frameId = window.setTimeout(cb, 80);
            }}
          }};
          frameId = window.setTimeout(poll, 5);
        }}

        function requestRender() {{
          if (renderBusy) {{
            renderDirty = true;
            return;
          }}
          renderBusy = true;
          frameId = requestAnimationFrame(() => {{
            renderDirty = false;
            const now = performance.now();
            const delta = Math.min(0.05, Math.max(0.001, (now - lastClockTime) / 1000));
            lastClockTime = now;

            let needsAnotherFrame = false;

            if (cameraGoal) {{
              const factor = 1 - Math.exp(-8 * delta);
              camera.position.lerp(cameraGoal.pos, factor);
              controls.target.lerp(cameraGoal.target, factor);
              if (
                camera.position.distanceTo(cameraGoal.pos) < 0.02 &&
                controls.target.distanceTo(cameraGoal.target) < 0.02
              ) {{
                camera.position.copy(cameraGoal.pos);
                controls.target.copy(cameraGoal.target);
                cameraGoal = null;
              }} else {{
                needsAnotherFrame = true;
              }}
            }}

            if (pressedArrowKeys.size > 0) {{
              const rotStep = delta * 1.75;
              _camUp.set(0, 1, 0).applyQuaternion(camera.quaternion).normalize();
              _camRight.set(1, 0, 0).applyQuaternion(camera.quaternion).normalize();

              let yaw = 0;
              if (pressedArrowKeys.has('ArrowRight')) yaw += rotStep;
              if (pressedArrowKeys.has('ArrowLeft')) yaw -= rotStep;
              if (yaw !== 0) {{
                _rotQuat.setFromAxisAngle(_camUp, yaw);
                moleculeGroup.quaternion.premultiply(_rotQuat);
              }}

              let pitch = 0;
              if (pressedArrowKeys.has('ArrowDown')) pitch += rotStep;
              if (pressedArrowKeys.has('ArrowUp')) pitch -= rotStep;
              if (pitch !== 0) {{
                _rotQuat.setFromAxisAngle(_camRight, pitch);
                moleculeGroup.quaternion.premultiply(_rotQuat);
              }}

              overlayGroup.quaternion.copy(moleculeGroup.quaternion);
              needsAnotherFrame = true;
            }}

            if (state.autoSpin) {{
              _rotQuat.setFromAxisAngle(_vecUp, delta * 0.42);
              moleculeGroup.quaternion.premultiply(_rotQuat);
              overlayGroup.quaternion.copy(moleculeGroup.quaternion);
              needsAnotherFrame = true;
            }}

            controls.update();
            renderer.render(scene, camera);
            updateDomLabels();

            const done = () => {{
              renderBusy = false;
              if (renderDirty || needsAnotherFrame) {{
                requestRender();
              }}
            }};
            if (isSoftwareGl) afterDraw(done);
            else done();
          }});
        }}

        controls.addEventListener('start', () => {{
          cameraGoal = null;
        }});
        controls.addEventListener('change', requestRender);

        const resizeObserver = new ResizeObserver(() => {{
          const w = container.clientWidth;
          const h = container.clientHeight;
          if (w <= 0 || h <= 0) return;
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
          renderer.setSize(w, h);
          requestRender();
        }});
        resizeObserver.observe(container);

        let pointerDownPos = {{ x: 0, y: 0 }};
        let lastHoverCheck = 0;

        renderer.domElement.addEventListener('pointerdown', (e) => {{
          pointerDownPos = {{ x: e.clientX, y: e.clientY }};
        }});

        renderer.domElement.addEventListener('pointerup', (e) => {{
          const distMoved = Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y);
          if (distMoved > 6) return;
          const rect = renderer.domElement.getBoundingClientRect();
          pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
          pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
          raycaster.setFromCamera(pointer, camera);
          const hits = raycaster.intersectObjects(atomMeshes, false);
          if (hits.length > 0) {{
            const atomId = hits[0].object.userData.atomId;
            state.selectedAtomId = atomId;
            state.activeTab = 'atom';
          }} else {{
            state.selectedAtomId = null;
          }}
          syncUI();
        }});

        renderer.domElement.addEventListener('pointermove', (e) => {{
          const now = performance.now();
          if (now - lastHoverCheck < 40) return;
          lastHoverCheck = now;
          const mol = state.molecule;
          if (!mol) return;
          const rect = renderer.domElement.getBoundingClientRect();
          pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
          pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
          raycaster.setFromCamera(pointer, camera);
          const hits = raycaster.intersectObjects(atomMeshes, false);
          if (hits.length > 0) {{
            const atomId = hits[0].object.userData.atomId;
            const found = mol.atoms.find((a) => a.id === atomId);
            if (found) {{
              renderer.domElement.style.cursor = 'pointer';
              const x = Math.min((e.clientX - rect.left) + 14, Math.max(12, (container.clientWidth || 600) - 310));
              const y = Math.max(12, (e.clientY - rect.top) - 54);
              tooltipEl.style.left = `${{x}}px`;
              tooltipEl.style.top = `${{y}}px`;
              tooltipEl.innerHTML = `
                <div class="font-semibold text-slate-900">${{escapeHtml(found.name)}} (${{escapeHtml(found.symbol)}}${{found.id + 1}})</div>
                <div class="mt-0.5 font-mono text-[11px] text-slate-600">${{escapeHtml(found.hybridization)}} \u00b7 ${{escapeHtml(found.molecularGeometry)}} \u00b7 ${{found.lonePairs}} LP</div>
              `;
              tooltipEl.classList.remove('hidden');
              return;
            }}
          }}
          renderer.domElement.style.cursor = 'grab';
          tooltipEl.classList.add('hidden');
        }});

        renderer.domElement.addEventListener('pointerleave', () => {{
          tooltipEl.classList.add('hidden');
        }});

        const ARROW_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
        const isEditableTarget = (target) => {{
          if (!(target instanceof HTMLElement)) return false;
          const tag = target.tagName;
          return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
        }};

        window.addEventListener('keydown', (e) => {{
          if (!ARROW_KEYS.has(e.key)) return;
          if (e.ctrlKey || e.metaKey || e.altKey) return;
          if (isEditableTarget(e.target)) return;
          if (state.referenceOpen || state.smilesGuideOpen) return;
          e.preventDefault();
          if (!pressedArrowKeys.has(e.key)) {{
            const wasEmpty = pressedArrowKeys.size === 0;
            pressedArrowKeys.add(e.key);
            if (wasEmpty) lastClockTime = performance.now() - 16;
            requestRender();
          }}
        }});

        window.addEventListener('keyup', (e) => {{
          if (pressedArrowKeys.delete(e.key)) requestRender();
        }});

        window.addEventListener('blur', () => {{
          pressedArrowKeys.clear();
        }});

        function rebuildScene() {{
          while (moleculeGroup.children.length > 0) {{
            const c = moleculeGroup.children[0];
            moleculeGroup.remove(c);
            disposeObject3D(c);
          }}
          while (overlayGroup.children.length > 0) {{
            const c = overlayGroup.children[0];
            overlayGroup.remove(c);
            disposeObject3D(c);
          }}
          atomMeshes = [];
          angleLabelAnchors = [];

          const molecule = state.molecule;
          if (!molecule || !molecule.atoms || molecule.atoms.length === 0) {{
            requestRender();
            return;
          }}

          idealDistance = computeIdealCamera(molecule);

          const sphereGeoHigh = new THREE.SphereGeometry(1, 36, 26);
          const atomMatCache = new Map();
          const outlineMat = new THREE.MeshBasicMaterial({{ color: 0x64748b, side: THREE.BackSide }});

          for (const atom of molecule.atoms) {{
            let radius = 0.28 + atom.covalentRadius * 0.24;
            if (state.renderStyle === 'space-fill') radius = atom.vdwRadius * 0.96;
            else if (state.renderStyle === 'wireframe') radius = 0.14 + atom.covalentRadius * 0.08;

            let mat = atomMatCache.get(atom.cpkColor);
            if (!mat) {{
              mat = new THREE.MeshLambertMaterial({{ color: new THREE.Color(atom.cpkColor) }});
              atomMatCache.set(atom.cpkColor, mat);
            }}
            const mesh = new THREE.Mesh(sphereGeoHigh, mat);
            mesh.position.set(atom.position.x, atom.position.y, atom.position.z);
            mesh.scale.setScalar(radius);
            mesh.layers.enable(1);
            mesh.userData = {{ atomId: atom.id }};
            moleculeGroup.add(mesh);
            atomMeshes.push(mesh);

            if (needsLightOutline(atom.cpkColor)) {{
              const outlineMesh = new THREE.Mesh(sphereGeoHigh, outlineMat);
              outlineMesh.position.copy(mesh.position);
              outlineMesh.scale.setScalar(radius * 1.055);
              moleculeGroup.add(outlineMesh);
            }}
          }}

          if (state.renderStyle !== 'space-fill') {{
            const cylGeo = new THREE.CylinderGeometry(1, 1, 1, 18, 1);
            const resolveBondHex = (hex) => (hex.toUpperCase() === '#FFFFFF' ? '#CBD5E1' : hex);
            const addSplitBondCylinder = (pA, pB, r, colA, colB) => {{
              _vecMid.addVectors(pA, pB).multiplyScalar(0.5);
              const halfLen = pA.distanceTo(_vecMid);
              if (halfLen < 1e-4) return;
              _vecDir.subVectors(pB, pA).normalize();
              _quat.setFromUnitVectors(_vecUp, _vecDir);

              const matA = new THREE.MeshLambertMaterial({{ color: new THREE.Color(resolveBondHex(colA)) }});
              const meshA = new THREE.Mesh(cylGeo, matA);
              meshA.position.lerpVectors(pA, _vecMid, 0.5);
              meshA.quaternion.copy(_quat);
              meshA.scale.set(r, halfLen, r);
              moleculeGroup.add(meshA);

              const matB = new THREE.MeshLambertMaterial({{ color: new THREE.Color(resolveBondHex(colB)) }});
              const meshB = new THREE.Mesh(cylGeo, matB);
              meshB.position.lerpVectors(_vecMid, pB, 0.5);
              meshB.quaternion.copy(_quat);
              meshB.scale.set(r, halfLen, r);
              moleculeGroup.add(meshB);
            }};

            const isWire = state.renderStyle === 'wireframe';
            for (const bond of molecule.bonds) {{
              const a1 = molecule.atoms[bond.from];
              const a2 = molecule.atoms[bond.to];
              _vecA.set(a1.position.x, a1.position.y, a1.position.z);
              _vecB.set(a2.position.x, a2.position.y, a2.position.z);
              _vecDir.subVectors(_vecB, _vecA);
              const totalLen = _vecDir.length();
              if (totalLen < 1e-4) continue;
              _vecDir.normalize();

              let foundPlane = false;
              for (const nid of a1.neighborIds) {{
                if (nid !== a2.id) {{
                  const nb = molecule.atoms[nid];
                  _vecPerp.set(nb.position.x - a1.position.x, nb.position.y - a1.position.y, nb.position.z - a1.position.z);
                  _vecPerp.addScaledVector(_vecDir, -_vecPerp.dot(_vecDir));
                  if (_vecPerp.length() > 0.05) {{
                    _vecPerp.normalize();
                    foundPlane = true;
                    break;
                  }}
                }}
              }}
              if (!foundPlane) {{
                _vecPerp.set(Math.abs(_vecDir.y) < 0.85 ? 0 : 1, Math.abs(_vecDir.y) < 0.85 ? 1 : 0, 0).cross(_vecDir).normalize();
              }}
              _vecPerp2.crossVectors(_vecDir, _vecPerp).normalize();

              const baseR = isWire ? 0.045 : 0.085;
              if (bond.isAromatic) {{
                const offset = isWire ? 0.06 : 0.08;
                addSplitBondCylinder(_vecA.clone().addScaledVector(_vecPerp, offset * 0.5), _vecB.clone().addScaledVector(_vecPerp, offset * 0.5), baseR * 0.72, a1.cpkColor, a2.cpkColor);
                for (let d = 0; d < 3; d++) {{
                  const t0 = 0.16 + (d / 3) * 0.68;
                  const t1 = t0 + 0.14;
                  const dA = _vecA.clone().lerp(_vecB, t0).addScaledVector(_vecPerp, -offset * 0.85);
                  const dB = _vecA.clone().lerp(_vecB, t1).addScaledVector(_vecPerp, -offset * 0.85);
                  addSplitBondCylinder(dA, dB, baseR * 0.48, '#38BDF8', '#38BDF8');
                }}
              }} else if (bond.order === 2) {{
                const offset = isWire ? 0.065 : 0.095;
                const r2 = baseR * 0.66;
                addSplitBondCylinder(_vecA.clone().addScaledVector(_vecPerp, offset), _vecB.clone().addScaledVector(_vecPerp, offset), r2, a1.cpkColor, a2.cpkColor);
                addSplitBondCylinder(_vecA.clone().addScaledVector(_vecPerp, -offset), _vecB.clone().addScaledVector(_vecPerp, -offset), r2, a1.cpkColor, a2.cpkColor);
              }} else if (bond.order === 3) {{
                const offset = isWire ? 0.075 : 0.11;
                const r3 = baseR * 0.54;
                for (let k = 0; k < 3; k++) {{
                  const ang = (k * Math.PI * 2) / 3;
                  const off = _vecPerp.clone().multiplyScalar(Math.cos(ang) * offset).addScaledVector(_vecPerp2, Math.sin(ang) * offset);
                  addSplitBondCylinder(_vecA.clone().add(off), _vecB.clone().add(off), r3, a1.cpkColor, a2.cpkColor);
                }}
              }} else {{
                addSplitBondCylinder(_vecA.clone(), _vecB.clone(), baseR, a1.cpkColor, a2.cpkColor);
              }}
            }}
          }}

          if (state.showLonePairs && state.renderStyle !== 'space-fill') {{
            const lobeGeo = createTeardropLobeGeometry(1.02, 0.29);
            const electronGeo = new THREE.SphereGeometry(0.055, 14, 12);
            for (const atom of molecule.atoms) {{
              if (!atom.lonePairOrbitals || atom.lonePairOrbitals.length === 0) continue;
              const isSmallMol = molecule.summary.heavyAtomCount <= 12;
              const isSel = atom.id === state.selectedAtomId;
              const isTerminal = atom.sigmaBonds <= 1;
              if (!isSmallMol && isTerminal && !isSel) continue;

              const baseScale = isSel ? 1.15 : isTerminal ? 0.85 : 1.04;
              const atomPos = new THREE.Vector3(atom.position.x, atom.position.y, atom.position.z);

              for (const lp of atom.lonePairOrbitals) {{
                const isDeloc = lp.orbitalType === 'pi-delocalized';
                const dir = new THREE.Vector3(lp.direction.x, lp.direction.y, lp.direction.z).normalize();
                const lobeMat = new THREE.MeshBasicMaterial({{
                  color: isDeloc ? 0x7c3aed : 0xd97706,
                  transparent: true,
                  opacity: isSel ? 0.28 : 0.2,
                  depthWrite: false,
                  side: THREE.DoubleSide,
                }});
                const q = new THREE.Quaternion().setFromUnitVectors(_vecUp, dir);
                const lobeMesh = new THREE.Mesh(lobeGeo, lobeMat);
                lobeMesh.position.copy(atomPos);
                lobeMesh.quaternion.copy(q);
                lobeMesh.scale.setScalar(baseScale);
                lobeMesh.renderOrder = 5;
                overlayGroup.add(lobeMesh);

                if (isDeloc) {{
                  const qOpp = new THREE.Quaternion().setFromUnitVectors(_vecUp, dir.clone().negate());
                  const lobeOpp = new THREE.Mesh(lobeGeo, lobeMat);
                  lobeOpp.position.copy(atomPos);
                  lobeOpp.quaternion.copy(qOpp);
                  lobeOpp.scale.setScalar(baseScale * 0.92);
                  lobeOpp.renderOrder = 5;
                  overlayGroup.add(lobeOpp);
                }}

                const eMat = new THREE.MeshBasicMaterial({{ color: isDeloc ? 0x6d28d9 : 0xb45309 }});
                const perp = new THREE.Vector3(Math.abs(dir.y) < 0.85 ? 0 : 1, Math.abs(dir.y) < 0.85 ? 1 : 0, 0).cross(dir).normalize();
                const bulbCenter = atomPos.clone().addScaledVector(dir, 0.68 * baseScale);
                const eSep = 0.088 * baseScale;
                const e1 = new THREE.Mesh(electronGeo, eMat);
                e1.position.copy(bulbCenter).addScaledVector(perp, eSep);
                const e2 = new THREE.Mesh(electronGeo, eMat);
                e2.position.copy(bulbCenter).addScaledVector(perp, -eSep);
                overlayGroup.add(e1, e2);
              }}
            }}
          }}

          const focusAtom = getFocusAtom();
          if (state.showHybridOrbitals && focusAtom && focusAtom.hybridOrbitals.length >= 2) {{
            const hybGeo = createTeardropLobeGeometry(1.18, 0.25);
            const centerPos = new THREE.Vector3(focusAtom.position.x, focusAtom.position.y, focusAtom.position.z);
            for (const orb of focusAtom.hybridOrbitals) {{
              const dir = new THREE.Vector3(orb.direction.x, orb.direction.y, orb.direction.z).normalize();
              const isBonding = orb.kind === 'bonding';
              const mat = new THREE.MeshBasicMaterial({{
                color: isBonding ? 0x0284c7 : 0xd97706,
                wireframe: true,
                transparent: true,
                opacity: isBonding ? 0.28 : 0.36,
                depthWrite: false,
              }});
              const mesh = new THREE.Mesh(hybGeo, mat);
              mesh.position.copy(centerPos);
              mesh.quaternion.setFromUnitVectors(_vecUp, dir);
              mesh.renderOrder = 4;
              overlayGroup.add(mesh);
            }}
          }}

          if (state.showVseprCage && focusAtom && focusAtom.vseprCageVertices.length >= 3) {{
            const cageR = 1.65;
            const centerPos = new THREE.Vector3(focusAtom.position.x, focusAtom.position.y, focusAtom.position.z);
            const verts = focusAtom.vseprCageVertices.map((v) =>
              centerPos.clone().add(new THREE.Vector3(v.x, v.y, v.z).normalize().multiplyScalar(cageR))
            );
            const linePts = [];
            for (let i = 0; i < verts.length; i++) {{
              for (let j = i + 1; j < verts.length; j++) {{
                const d1 = verts[i].clone().sub(centerPos).normalize();
                const d2 = verts[j].clone().sub(centerPos).normalize();
                if (d1.dot(d2) > -0.65) linePts.push(verts[i], verts[j]);
              }}
            }}
            if (linePts.length > 0) {{
              const lineGeo = new THREE.BufferGeometry().setFromPoints(linePts);
              const lineMat = new THREE.LineBasicMaterial({{ color: 0x0284c7, transparent: true, opacity: 0.34 }});
              overlayGroup.add(new THREE.LineSegments(lineGeo, lineMat));
            }}
            const vGeo = new THREE.SphereGeometry(0.042, 10, 8);
            const vMat = new THREE.MeshBasicMaterial({{ color: 0x0369a1, transparent: true, opacity: 0.72 }});
            for (const vp of verts) {{
              const dotMesh = new THREE.Mesh(vGeo, vMat);
              dotMesh.position.copy(vp);
              overlayGroup.add(dotMesh);
            }}
          }}

          if (state.showBondAngles && focusAtom && focusAtom.measuredAngles.length > 0) {{
            const centerPos = new THREE.Vector3(focusAtom.position.x, focusAtom.position.y, focusAtom.position.z);
            const anglesToShow = focusAtom.measuredAngles.slice(0, 4);
            const arcMat = new THREE.LineBasicMaterial({{ color: 0x0284c7, transparent: true, opacity: 0.8 }});
            for (const ang of anglesToShow) {{
              const aAtom = molecule.atoms[ang.atomA];
              const bAtom = molecule.atoms[ang.atomB];
              const va = new THREE.Vector3(aAtom.position.x - centerPos.x, aAtom.position.y - centerPos.y, aAtom.position.z - centerPos.z).normalize();
              const vb = new THREE.Vector3(bAtom.position.x - centerPos.x, bAtom.position.y - centerPos.y, bAtom.position.z - centerPos.z).normalize();
              const arcRadius = 0.72;
              const arcPts = [];
              const steps = 20;
              const totalAngle = Math.acos(Math.max(-1, Math.min(1, va.dot(vb))));
              const rotAxis = new THREE.Vector3().crossVectors(va, vb);
              if (rotAxis.length() < 1e-4) {{
                rotAxis.set(0, 1, 0).cross(va);
                if (rotAxis.length() < 1e-4) rotAxis.set(1, 0, 0).cross(va);
              }}
              rotAxis.normalize();
              for (let k = 0; k <= steps; k++) {{
                const ptDir = va.clone().applyAxisAngle(rotAxis, (k / steps) * totalAngle);
                arcPts.push(centerPos.clone().addScaledVector(ptDir, arcRadius));
              }}
              overlayGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(arcPts), arcMat));
              const midPt = arcPts[Math.floor(arcPts.length / 2)];
              const labelOffset = midPt.clone().sub(centerPos).normalize().multiplyScalar(arcRadius + 0.18).add(centerPos);
              angleLabelAnchors.push({{ pos: {{ x: labelOffset.x, y: labelOffset.y, z: labelOffset.z }}, text: `${{ang.angleDeg.toFixed(1)}}\u00b0` }});
            }}
          }}

          if (state.showVdwSpheres && state.renderStyle !== 'space-fill') {{
            const vdwGeo = new THREE.SphereGeometry(1, 32, 24);
            const vdwMatCache = new Map();
            for (const atom of molecule.atoms) {{
              const tintHex = needsLightOutline(atom.cpkColor) ? '#94A3B8' : atom.cpkColor;
              let vdwMat = vdwMatCache.get(tintHex);
              if (!vdwMat) {{
                vdwMat = new THREE.MeshLambertMaterial({{
                  color: new THREE.Color(tintHex),
                  transparent: true,
                  opacity: 0.22,
                  depthWrite: false,
                  side: THREE.FrontSide,
                }});
                vdwMatCache.set(tintHex, vdwMat);
              }}
              const vdwMesh = new THREE.Mesh(vdwGeo, vdwMat);
              vdwMesh.position.set(atom.position.x, atom.position.y, atom.position.z);
              vdwMesh.scale.setScalar(atom.vdwRadius * 0.96);
              vdwMesh.renderOrder = 2;
              overlayGroup.add(vdwMesh);
            }}
          }}

          // Sync projected label DOM nodes
          if (state.showLabels && molecule) {{
            labelLayer.innerHTML = molecule.atoms.map((a) => {{
              const isSel = a.id === state.selectedAtomId;
              if (a.symbol === 'H' && !isSel && molecule.atoms.length > 10) {{
                return '<div class="hidden"></div>';
              }}
              return `<div style="opacity:0" class="absolute top-0 left-0 whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-mono leading-none border ${{isSel ? 'bg-sky-50 border-sky-500 text-sky-900 font-medium' : 'bg-white/95 border-slate-200 text-slate-800'}}">${{escapeHtml(a.symbol)}}${{a.symbol !== 'H' ? `<span class="text-sky-700 ml-1">${{escapeHtml(a.hybridization)}}</span>` : ''}}${{a.lonePairs > 0 ? `<span class="text-amber-700 ml-1">\u00b7 ${{a.lonePairs}}LP</span>` : ''}}</div>`;
            }}).join('');
          }} else {{
            labelLayer.innerHTML = '';
          }}

          if (state.showBondAngles && focusAtom) {{
            angleLabelLayer.innerHTML = focusAtom.measuredAngles.slice(0, 4).map((ang) =>
              `<div style="opacity:0" class="absolute top-0 left-0 whitespace-nowrap rounded bg-white/95 border border-sky-300 px-1.5 py-0.5 font-mono text-[11px] tabular-nums text-sky-800">${{ang.angleDeg.toFixed(1)}}\u00b0</div>`
            ).join('');
          }} else {{
            angleLabelLayer.innerHTML = '';
          }}

          if (prevSmiles !== molecule.summary.smiles) {{
            prevSmiles = molecule.summary.smiles;
            moleculeGroup.rotation.set(0, 0, 0);
            overlayGroup.rotation.set(0, 0, 0);
            if (isSoftwareGl) {{
              camera.position.set(idealDistance * 0.45, idealDistance * 0.35, idealDistance * 0.88);
              controls.target.set(0, 0, 0);
              controls.update();
            }} else {{
              cameraGoal = {{
                pos: new THREE.Vector3(idealDistance * 0.45, idealDistance * 0.35, idealDistance * 0.88),
                target: new THREE.Vector3(0, 0, 0),
              }};
            }}
          }}

          requestRender();
        }}

        function resetCamera() {{
          const d = idealDistance;
          moleculeGroup.rotation.set(0, 0, 0);
          overlayGroup.rotation.set(0, 0, 0);
          if (isSoftwareGl) {{
            camera.position.set(d * 0.45, d * 0.35, d * 0.88);
            controls.target.set(0, 0, 0);
            controls.update();
            requestRender();
          }} else {{
            cameraGoal = {{
              pos: new THREE.Vector3(d * 0.45, d * 0.35, d * 0.88),
              target: new THREE.Vector3(0, 0, 0),
            }};
            requestRender();
          }}
        }}

        function focusAtom(atomId) {{
          const mol = state.molecule;
          if (!mol) return;
          const atom = mol.atoms.find((a) => a.id === atomId);
          if (!atom) return;
          const target = new THREE.Vector3(atom.position.x, atom.position.y, atom.position.z);
          const offset = camera.position.clone().sub(controls.target);
          if (offset.length() < 2.2) offset.setLength(3.6);
          if (isSoftwareGl) {{
            controls.target.copy(target);
            camera.position.copy(target).add(offset);
            controls.update();
            requestRender();
          }} else {{
            cameraGoal = {{ pos: target.clone().add(offset), target }};
            requestRender();
          }}
        }}

        function exportPng() {{
          renderer.render(scene, camera);
          const dataUrl = renderer.domElement.toDataURL('image/png');
          const link = document.createElement('a');
          const nameSlug = (state.molecule?.name || 'molecule').toLowerCase().replace(/[^a-z0-9]+/g, '-');
          link.download = `${{nameSlug}}-vsepr-3d.png`;
          link.href = dataUrl;
          link.click();
        }}

        if (!isSoftwareGl) renderer.compile(scene, camera);
        return {{ rebuildScene, resetCamera, focusAtom, exportPng, requestRender }};
        }} catch (err) {{
          contextLostBanner.textContent = 'WebGL 3D viewport unavailable in this browser context.';
          contextLostBanner.classList.remove('hidden');
          const noop = () => {{}};
          return {{ rebuildScene: noop, resetCamera: noop, focusAtom: noop, exportPng: noop, requestRender: noop }};
        }}
      }})();

      function renderErrorBox() {{
        const box = document.getElementById('smiles-error-box');
        const txt = document.getElementById('smiles-error-text');
        if (state.errorMsg) {{
          txt.textContent = state.errorMsg;
          box.classList.remove('hidden');
        }} else {{
          box.classList.add('hidden');
        }}
      }}

      function renderQuickTry() {{
        const row = document.getElementById('quick-try-row');
        row.innerHTML = BOOT.quickTry.map((ex) => {{
          const active = state.molecule?.summary?.smiles === ex.smiles;
          return `<button type="button" data-quick-smiles="${{escapeHtml(ex.smiles)}}" class="rounded px-2 py-1 font-mono leading-none transition-colors whitespace-nowrap shrink-0 cursor-pointer border ${{active ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900'}}">${{escapeHtml(ex.label)}}</button>`;
        }}).join('');
      }}

      function renderTopLeftReadout() {{
        const el = document.getElementById('top-left-readout');
        const mol = state.molecule;
        if (!mol) {{
          el.innerHTML = '';
          return;
        }}
        const title = mol.name || mol.summary.formula;
        const lpPlural = mol.summary.totalLonePairs === 1 ? '' : 's';
        el.innerHTML = `
          <div class="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
            <h2 class="text-lg font-semibold tracking-tight text-slate-900">${{escapeHtml(title)}}</h2>
            ${{mol.name ? `<span class="font-mono text-sm font-medium text-sky-700">${{escapeHtml(mol.summary.formula)}}</span>` : ''}}
          </div>
          <div class="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500 font-mono">
            <span class="text-slate-700">${{escapeHtml(mol.summary.smiles)}}</span>
            <span aria-hidden="true">\u00b7</span>
            <span class="tabular-nums">${{mol.summary.molecularWeight.toFixed(2)}} g/mol</span>
            <span aria-hidden="true">\u00b7</span>
            <span class="tabular-nums text-amber-700">${{mol.summary.totalLonePairs}} lone pair${{lpPlural}}</span>
          </div>
        `;
      }}

      function renderHeaderAndTabs() {{
        document.querySelectorAll('#rail-tabs button').forEach((btn) => {{
          const active = btn.dataset.tab === state.activeTab;
          btn.className = `rounded-md px-2 py-1 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${{active ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-900'}}`;
        }});
      }}

      function renderRightControls() {{
        document.querySelectorAll('#right-control-panel [data-style]').forEach((btn) => {{
          const active = btn.dataset.style === state.renderStyle;
          btn.className = `flex h-7 w-full items-center px-2.5 text-left text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${{active ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'}}`;
        }});

        const setBtn = (id, active, activeCls, inactiveCls) => {{
          const btn = document.getElementById(id);
          btn.className = `flex h-7 w-full items-center gap-2 rounded-md px-2.5 text-xs font-medium border transition-colors whitespace-nowrap cursor-pointer ${{active ? activeCls : inactiveCls}}`;
        }};

        setBtn('toggle-lp-btn', state.showLonePairs, 'bg-amber-50 border-amber-300 text-amber-900', 'bg-white border-slate-200 text-slate-500 hover:text-slate-900');
        setBtn('toggle-orbitals-btn', state.showHybridOrbitals, 'bg-sky-50 border-sky-300 text-sky-900', 'bg-white border-slate-200 text-slate-500 hover:text-slate-900');
        setBtn('toggle-angles-btn', state.showBondAngles, 'bg-sky-50 border-sky-300 text-sky-900', 'bg-white border-slate-200 text-slate-500 hover:text-slate-900');
        setBtn('toggle-cage-btn', state.showVseprCage, 'bg-sky-50 border-sky-300 text-sky-900', 'bg-white border-slate-200 text-slate-500 hover:text-slate-900');
        setBtn('toggle-vdw-btn', state.showVdwSpheres, 'bg-sky-50 border-sky-300 text-sky-900', 'bg-white border-slate-200 text-slate-500 hover:text-slate-900');
        setBtn('toggle-labels-btn', state.showLabels, 'bg-slate-900 border-slate-900 text-white', 'bg-white border-slate-200 text-slate-500 hover:text-slate-900');

        const spinBtn = document.getElementById('toggle-spin-btn');
        spinBtn.className = `flex h-7 w-full items-center justify-center gap-1.5 rounded-md px-2 text-xs font-medium border transition-colors whitespace-nowrap cursor-pointer ${{state.autoSpin ? 'bg-slate-900 border-slate-900 text-white' : 'bg-white border-slate-200 text-slate-600 hover:text-slate-900'}}`;
        spinBtn.innerHTML = state.autoSpin
          ? '<svg class="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="14" y="4" width="4" height="16" rx="1"/><rect x="6" y="4" width="4" height="16" rx="1"/></svg><span>Pause</span>'
          : '<svg class="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="6 3 20 12 6 21 6 3"/></svg><span>Spin</span>';
      }}

      function renderRailContent() {{
        const container = document.getElementById('rail-content');
        const mol = state.molecule;
        const selectedAtom = getSelectedAtom();

        if (state.activeTab === 'atom' && selectedAtom) {{
          const chargeBadge = selectedAtom.formalCharge !== 0
            ? `<span class="font-mono text-xs font-medium text-sky-700 shrink-0">${{selectedAtom.formalCharge > 0 ? '+' : ''}}${{selectedAtom.formalCharge}}</span>`
            : '';
          const lpSub = selectedAtom.delocalizedLonePairs > 0
            ? `${{selectedAtom.localizedLonePairs}} local \u00b7 ${{selectedAtom.delocalizedLonePairs}} \u03c0`
            : `${{selectedAtom.lonePairs * 2}} non-bonding e\u207b`;

          const anglesHtml = selectedAtom.measuredAngles.length > 0
            ? `<div class="border-t border-slate-200 pt-3">
                <div class="text-xs font-medium text-slate-700 mb-2">3D Bond Angles</div>
                <div class="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white text-xs">
                  ${{selectedAtom.measuredAngles.map((ang) => `
                    <div class="flex items-center justify-between px-3 py-1.5">
                      <span class="font-mono text-slate-600">${{escapeHtml(ang.labelA)}}\u2013${{escapeHtml(selectedAtom.symbol)}}${{selectedAtom.id + 1}}\u2013${{escapeHtml(ang.labelB)}}</span>
                      <span class="font-mono tabular-nums font-medium text-sky-700">${{ang.angleDeg.toFixed(1)}}\u00b0</span>
                    </div>
                  `).join('')}}
                </div>
              </div>`
            : '';

          const rd = mol.summary.rdkit;
          const rdkitHtml = rd
            ? `<div class="border-t border-slate-200 pt-3">
                <div class="flex items-center justify-between mb-2">
                  <span class="text-xs font-medium text-slate-700">RDKit Properties</span>
                  <span class="font-mono text-[10px] text-slate-400">v${{escapeHtml(rd.version)}}</span>
                </div>
                <div class="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white text-xs">
                  <div class="flex items-center justify-between px-3 py-1.5">
                    <span class="text-slate-500">Exact Mass</span>
                    <span class="font-mono tabular-nums text-slate-900">${{rd.exactMw.toFixed(4)}} Da</span>
                  </div>
                  <div class="flex items-center justify-between px-3 py-1.5">
                    <span class="text-slate-500">TPSA / LogP</span>
                    <span class="font-mono tabular-nums text-slate-900">${{rd.tpsa.toFixed(1)}} \u00c5\u00b2 \u00b7 ${{rd.crippenLogP.toFixed(2)}}</span>
                  </div>
                  <div class="flex items-center justify-between px-3 py-1.5">
                    <span class="text-slate-500">HBD / HBA / Rot</span>
                    <span class="font-mono tabular-nums text-slate-900">${{rd.hbd}} / ${{rd.hba}} / ${{rd.rotatableBonds}}</span>
                  </div>
                  <div class="flex items-center justify-between px-3 py-1.5">
                    <span class="text-slate-500">Rings / Fsp\u00b3</span>
                    <span class="font-mono tabular-nums text-slate-900">${{rd.numRings}} (${{rd.numAromaticRings}} arom) \u00b7 ${{rd.fractionCsp3.toFixed(2)}}</span>
                  </div>
                  <div class="flex items-center justify-between gap-2 px-3 py-1.5">
                    <span class="text-slate-500 shrink-0">Canonical</span>
                    <span class="font-mono text-[11px] text-slate-800 truncate" title="${{escapeHtml(rd.canonicalSmiles)}}">${{escapeHtml(rd.canonicalSmiles)}}</span>
                  </div>
                  ${{rd.inchiKey ? `
                    <div class="flex items-center justify-between gap-2 px-3 py-1.5">
                      <span class="text-slate-500 shrink-0">InChIKey</span>
                      <span class="font-mono text-[10px] text-slate-600 truncate" title="${{escapeHtml(rd.inchiKey)}}">${{escapeHtml(rd.inchiKey)}}</span>
                    </div>` : ''}}
                </div>
              </div>`
            : '';

          container.innerHTML = `
            <div class="flex items-center justify-between gap-3">
              <div class="flex items-center gap-2.5 min-w-0 flex-1">
                <span class="h-7 w-7 rounded-full border border-slate-300 shrink-0 flex items-center justify-center font-mono text-[11px] font-bold" style="background-color: ${{escapeHtml(selectedAtom.cpkColor)}}; color: ${{getContrastText(selectedAtom.cpkColor)}};">
                  ${{escapeHtml(selectedAtom.symbol)}}
                </span>
                <div class="min-w-0">
                  <div class="flex items-baseline gap-2">
                    <h3 class="text-sm font-semibold text-slate-900 truncate">${{escapeHtml(selectedAtom.name)}} (${{escapeHtml(selectedAtom.symbol)}}${{selectedAtom.id + 1}})</h3>
                    ${{chargeBadge}}
                  </div>
                  <p class="text-xs text-slate-500 mt-0.5 leading-snug">${{escapeHtml(selectedAtom.orbitalSummary)}}</p>
                </div>
              </div>
              <button id="focus-selected-atom-btn" type="button" class="rounded-md border border-slate-200 bg-white p-1.5 text-slate-500 hover:text-slate-900 transition-colors shrink-0 cursor-pointer" title="Center camera on this atom">
                <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="22" y1="12" x2="18" y2="12"/><line x1="6" y1="12" x2="2" y2="12"/><line x1="12" y1="6" x2="12" y2="2"/><line x1="12" y1="22" x2="12" y2="18"/></svg>
              </button>
            </div>

            <div class="grid grid-cols-2 gap-2">
              <div class="flex flex-col justify-between min-h-[76px] rounded-lg border border-slate-200 bg-white p-2.5">
                <div class="text-[11px] font-medium text-slate-500">Hybridization</div>
                <div class="mt-1 font-mono text-base font-semibold leading-tight text-sky-700">${{escapeHtml(selectedAtom.hybridization)}}</div>
                <div class="mt-1 font-mono text-[11px] text-slate-400 tabular-nums">SN ${{selectedAtom.stericNumber}}</div>
              </div>
              <div class="flex flex-col justify-between min-h-[76px] rounded-lg border border-slate-200 bg-white p-2.5">
                <div class="text-[11px] font-medium text-slate-500">Lone Pairs</div>
                <div class="mt-1 font-mono text-base font-semibold leading-tight tabular-nums ${{selectedAtom.lonePairs > 0 ? 'text-amber-700' : 'text-slate-700'}}">${{selectedAtom.lonePairs}}</div>
                <div class="mt-1 font-mono text-[11px] text-slate-400 tabular-nums">${{escapeHtml(lpSub)}}</div>
              </div>
              <div class="flex flex-col justify-between min-h-[76px] rounded-lg border border-slate-200 bg-white p-2.5">
                <div class="text-[11px] font-medium text-slate-500">Molecular Shape</div>
                <div class="mt-1 text-[13px] font-semibold leading-snug text-slate-900">${{escapeHtml(selectedAtom.molecularGeometry)}}</div>
                <div class="mt-1 font-mono text-[11px] text-slate-400">${{escapeHtml(selectedAtom.axNotation)}}</div>
              </div>
              <div class="flex flex-col justify-between min-h-[76px] rounded-lg border border-slate-200 bg-white p-2.5">
                <div class="text-[11px] font-medium text-slate-500">Electron Geometry</div>
                <div class="mt-1 text-[13px] font-semibold leading-snug text-slate-900">${{escapeHtml(selectedAtom.electronGeometry)}}</div>
                <div class="mt-1 font-mono text-[11px] text-slate-400 tabular-nums">${{escapeHtml(selectedAtom.idealAngleLabel)}}</div>
              </div>
            </div>

            <div class="border-t border-slate-200 pt-3">
              <p class="text-xs leading-relaxed text-slate-600">${{escapeHtml(getVseprExplanation(selectedAtom))}}</p>
            </div>
            ${{anglesHtml}}
            ${{rdkitHtml}}
          `;

          document.getElementById('focus-selected-atom-btn')?.addEventListener('click', () => {{
            viewport.focusAtom(selectedAtom.id);
          }});
          return;
        }}

        if (state.activeTab === 'atoms-table') {{
          const tableAtoms = state.showAllHydrogensInTable
            ? mol.atoms
            : mol.atoms.filter((a) => a.symbol !== 'H');

          container.innerHTML = `
            <div>
              <div class="flex items-center justify-between mb-2.5">
                <span class="text-xs text-slate-500">Select atom to focus</span>
                <button id="toggle-h-btn" type="button" class="text-[11px] font-medium text-sky-700 hover:text-sky-900 cursor-pointer">
                  ${{state.showAllHydrogensInTable ? 'Hide H' : 'Show H'}}
                </button>
              </div>
              <div class="overflow-hidden rounded-lg border border-slate-200 bg-white">
                <table class="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr class="border-b border-slate-200 text-slate-500">
                      <th class="py-2 pl-3 pr-2 font-medium">Atom</th>
                      <th class="py-2 px-2 font-medium">Hybrid</th>
                      <th class="py-2 px-2 font-medium">LP</th>
                      <th class="py-2 pl-2 pr-3 font-medium">Shape</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-slate-100">
                    ${{tableAtoms.map((a) => {{
                      const isSel = a.id === selectedAtom?.id;
                      return `<tr data-atom-row="${{a.id}}" class="cursor-pointer transition-colors ${{isSel ? 'bg-sky-50 text-slate-900' : 'hover:bg-slate-50 text-slate-700'}}">
                        <td class="py-2 pl-3 pr-2 font-mono font-medium">
                          <span class="inline-flex items-center gap-1.5">
                            <span class="inline-block h-2.5 w-2.5 rounded-full border border-slate-300" style="background-color: ${{escapeHtml(a.cpkColor)}};"></span>
                            <span>${{escapeHtml(a.symbol)}}${{a.id + 1}}</span>
                          </span>
                        </td>
                        <td class="py-2 px-2 font-mono text-sky-700">${{escapeHtml(a.hybridization)}}</td>
                        <td class="py-2 px-2 font-mono tabular-nums ${{a.lonePairs > 0 ? 'text-amber-700 font-medium' : 'text-slate-400'}}">${{a.lonePairs}}</td>
                        <td class="py-2 pl-2 pr-2.5 truncate max-w-[100px]">${{escapeHtml(a.molecularGeometry)}}</td>
                      </tr>`;
                    }}).join('')}}
                  </tbody>
                </table>
              </div>
            </div>
          `;
          document.getElementById('toggle-h-btn')?.addEventListener('click', () => {{
            state.showAllHydrogensInTable = !state.showAllHydrogensInTable;
            renderRailContent();
          }});
          container.querySelectorAll('[data-atom-row]').forEach((row) => {{
            row.addEventListener('click', () => {{
              const id = Number(row.dataset.atomRow);
              state.selectedAtomId = id;
              viewport.focusAtom(id);
              syncUI();
            }});
          }});
          return;
        }}

        if (state.activeTab === 'presets') {{
          const cats = ['All', 'Linear & Trigonal', 'Tetrahedral Family', 'Trigonal Bipyramidal', 'Octahedral Family', 'Organic & Aromatic'];
          const filtered = state.presetCategory === 'All'
            ? BOOT.presets
            : BOOT.presets.filter((p) => p.category === state.presetCategory);

          container.innerHTML = `
            <div class="space-y-3">
              <div class="flex flex-wrap gap-1">
                ${{cats.map((cat) => `
                  <button type="button" data-cat="${{escapeHtml(cat)}}" class="rounded-md px-2 py-1 text-[11px] font-medium border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${{state.presetCategory === cat ? 'bg-slate-900 border-slate-900 text-white' : 'bg-white border-slate-200 text-slate-600 hover:text-slate-900'}}">
                    ${{escapeHtml(cat)}}
                  </button>
                `).join('')}}
              </div>
              <div class="space-y-1.5">
                ${{filtered.map((p) => {{
                  const isAct = mol.summary.smiles === p.smiles;
                  return `<button type="button" data-preset-id="${{escapeHtml(p.id)}}" class="w-full text-left rounded-lg border p-2.5 transition-colors cursor-pointer ${{isAct ? 'border-slate-900 bg-white' : 'border-slate-200 bg-white hover:border-slate-300'}}">
                    <div class="flex items-center justify-between gap-2">
                      <div class="flex items-baseline gap-2 min-w-0">
                        <span class="text-xs font-semibold text-slate-900 truncate">${{escapeHtml(p.name)}}</span>
                        <span class="font-mono text-xs text-sky-700 shrink-0">${{escapeHtml(p.formula)}}</span>
                      </div>
                      <svg class="h-3.5 w-3.5 text-slate-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
                    </div>
                    <div class="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 font-mono text-[11px] text-slate-500">
                      <span class="text-slate-700">${{escapeHtml(p.axNotation)}}</span>
                      <span aria-hidden="true">\u00b7</span>
                      <span class="text-sky-700">${{escapeHtml(p.hybridization)}}</span>
                      <span aria-hidden="true">\u00b7</span>
                      <span class="text-amber-700">${{escapeHtml(p.lonePairsNote)}}</span>
                    </div>
                  </button>`;
                }}).join('')}}
              </div>
            </div>
          `;

          container.querySelectorAll('[data-cat]').forEach((btn) => {{
            btn.addEventListener('click', () => {{
              state.presetCategory = btn.dataset.cat;
              renderRailContent();
            }});
          }});
          container.querySelectorAll('[data-preset-id]').forEach((btn) => {{
            btn.addEventListener('click', () => {{
              const preset = BOOT.presets.find((p) => p.id === btn.dataset.presetId);
              if (!preset) return;
              state.activeTab = 'atom';
              requestSmilesFromPython(preset.smiles, {{ name: preset.name, notes: preset.description }});
              renderHeaderAndTabs();
              renderRailContent();
            }});
          }});
        }}
      }}

      function renderModals() {{
        const vseprModal = document.getElementById('vsepr-modal');
        const smilesModal = document.getElementById('smiles-modal');
        vseprModal.classList.toggle('hidden', !state.referenceOpen);
        smilesModal.classList.toggle('hidden', !state.smilesGuideOpen);
      }}

      function initModalStaticContent() {{
        document.getElementById('vsepr-matrix-body').innerHTML = BOOT.vseprMatrix.map((row) => `
          <tr class="hover:bg-slate-50 transition-colors">
            <td class="py-2.5 pr-3 font-mono tabular-nums text-slate-700">${{row.stericNumber}}</td>
            <td class="py-2.5 pr-3 font-mono font-semibold text-sky-700">${{escapeHtml(row.hybridization)}}</td>
            <td class="py-2.5 pr-3 font-mono text-slate-800">${{escapeHtml(row.axNotation)}}</td>
            <td class="py-2.5 pr-3 font-mono tabular-nums text-slate-700">${{row.bondingPairs}}\u03c3 \u00b7 <span class="${{row.lonePairs > 0 ? 'text-amber-700 font-medium' : 'text-slate-400'}}">${{row.lonePairs}} LP</span></td>
            <td class="py-2.5 pr-3 text-slate-600">${{escapeHtml(row.electronGeometry)}}</td>
            <td class="py-2.5 pr-3 font-medium text-slate-900">${{escapeHtml(row.molecularGeometry)}}</td>
            <td class="py-2.5 pr-3 font-mono tabular-nums text-slate-600">${{escapeHtml(row.idealAngles)}}</td>
            <td class="py-2.5 text-right">
              <button type="button" data-vsepr-smiles="${{escapeHtml(row.smiles)}}" data-vsepr-name="${{escapeHtml(row.exampleName)}}" class="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-sky-700 hover:border-sky-400 hover:bg-sky-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer">
                <span>${{escapeHtml(row.exampleFormula)}}</span>
                <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 7h10v10"/><path d="M7 17 17 7"/></svg>
              </button>
            </td>
          </tr>
        `).join('');

        document.querySelectorAll('[data-vsepr-smiles]').forEach((btn) => {{
          btn.addEventListener('click', () => {{
            state.referenceOpen = false;
            state.activeTab = 'atom';
            renderModals();
            renderHeaderAndTabs();
            requestSmilesFromPython(btn.dataset.vseprSmiles, {{ name: btn.dataset.vseprName }});
          }});
        }});

        document.getElementById('smiles-guide-grid').innerHTML = BOOT.smilesGuide.map((item) => `
          <div class="rounded-lg border border-slate-200 bg-[#FAFAFA] p-3 flex flex-col justify-between gap-2">
            <div>
              <div class="font-semibold text-slate-900">${{escapeHtml(item.title)}}</div>
              <div class="mt-1 font-mono text-sky-700">${{escapeHtml(item.example)}}</div>
              <p class="mt-1 text-slate-600 leading-relaxed">${{escapeHtml(item.desc)}}</p>
            </div>
            <button type="button" data-guide-smiles="${{escapeHtml(item.trySmiles)}}" class="self-start rounded border border-slate-200 bg-white px-2.5 py-1 font-mono text-[11px] text-sky-700 hover:border-sky-400 cursor-pointer">
              Load ${{escapeHtml(item.trySmiles)}}
            </button>
          </div>
        `).join('');

        document.querySelectorAll('[data-guide-smiles]').forEach((btn) => {{
          btn.addEventListener('click', () => {{
            state.smilesGuideOpen = false;
            renderModals();
            requestSmilesFromPython(btn.dataset.guideSmiles);
          }});
        }});
      }}

      function syncUI() {{
        renderHeaderAndTabs();
        renderQuickTry();
        renderErrorBox();
        renderTopLeftReadout();
        renderRailContent();
        renderRightControls();
        renderModals();
        viewport.rebuildScene();
      }}

      // Wire events
      document.getElementById('smiles-input').value = state.smilesInput;
      document.getElementById('nav-vsepr').addEventListener('click', () => {{
        state.referenceOpen = true;
        renderModals();
      }});
      document.getElementById('nav-guide').addEventListener('click', () => {{
        state.smilesGuideOpen = true;
        renderModals();
      }});
      document.getElementById('export-png-btn').addEventListener('click', () => viewport.exportPng());

      document.getElementById('vsepr-modal').addEventListener('click', () => {{
        state.referenceOpen = false;
        renderModals();
      }});
      document.getElementById('vsepr-modal-close').addEventListener('click', () => {{
        state.referenceOpen = false;
        renderModals();
      }});
      document.getElementById('smiles-modal').addEventListener('click', () => {{
        state.smilesGuideOpen = false;
        renderModals();
      }});
      document.getElementById('smiles-modal-close').addEventListener('click', () => {{
        state.smilesGuideOpen = false;
        renderModals();
      }});

      document.getElementById('smiles-form').addEventListener('submit', (e) => {{
        e.preventDefault();
        requestSmilesFromPython(document.getElementById('smiles-input').value);
      }});

      document.getElementById('quick-try-row').addEventListener('click', (e) => {{
        const btn = e.target.closest('[data-quick-smiles]');
        if (!btn) return;
        requestSmilesFromPython(btn.dataset.quickSmiles);
      }});

      document.querySelectorAll('#rail-tabs button').forEach((btn) => {{
        btn.addEventListener('click', () => {{
          state.activeTab = btn.dataset.tab;
          renderHeaderAndTabs();
          renderRailContent();
        }});
      }});

      document.querySelectorAll('#right-control-panel [data-style]').forEach((btn) => {{
        btn.addEventListener('click', () => {{
          state.renderStyle = btn.dataset.style;
          renderRightControls();
          viewport.rebuildScene();
        }});
      }});
      document.getElementById('toggle-lp-btn').addEventListener('click', () => {{
        state.showLonePairs = !state.showLonePairs;
        renderRightControls();
        viewport.rebuildScene();
      }});
      document.getElementById('toggle-orbitals-btn').addEventListener('click', () => {{
        state.showHybridOrbitals = !state.showHybridOrbitals;
        renderRightControls();
        viewport.rebuildScene();
      }});
      document.getElementById('toggle-angles-btn').addEventListener('click', () => {{
        state.showBondAngles = !state.showBondAngles;
        renderRightControls();
        viewport.rebuildScene();
      }});
      document.getElementById('toggle-cage-btn').addEventListener('click', () => {{
        state.showVseprCage = !state.showVseprCage;
        renderRightControls();
        viewport.rebuildScene();
      }});
      document.getElementById('toggle-vdw-btn').addEventListener('click', () => {{
        state.showVdwSpheres = !state.showVdwSpheres;
        renderRightControls();
        viewport.rebuildScene();
      }});
      document.getElementById('toggle-labels-btn').addEventListener('click', () => {{
        state.showLabels = !state.showLabels;
        renderRightControls();
        viewport.rebuildScene();
      }});
      document.getElementById('toggle-spin-btn').addEventListener('click', () => {{
        state.autoSpin = !state.autoSpin;
        renderRightControls();
        viewport.requestRender();
      }});
      document.getElementById('reset-camera-btn').addEventListener('click', () => {{
        viewport.resetCamera();
      }});

      // Receive molecule updates computed in Python RDKit via Streamlit render messages
      function handleStreamlitRender(args) {{
        args = args || {{}};
        const reqId = args.req_id ?? null;

        if (reqId !== null && reqId === state.lastHandledReqId) {{
          return;
        }}
        if (reqId !== null) {{
          state.lastHandledReqId = reqId;
        }}

        if (args.error) {{
          state.errorMsg = args.error;
          renderErrorBox();
          return;
        }}

        if (args.molecule && args.molecule.summary) {{
          const changed = state.molecule?.summary?.smiles !== args.molecule.summary.smiles;
          const hadError = Boolean(state.errorMsg);
          state.molecule = args.molecule;
          state.errorMsg = null;
          if (changed) {{
            state.selectedAtomId = args.molecule.summary.primaryCenterId ?? null;
            state.smilesInput = args.molecule.summary.smiles;
            document.getElementById('smiles-input').value = state.smilesInput;
          }}
          if (reqId === null && !changed && !hadError) {{
            return;
          }}
          if (!changed && hadError) {{
            renderErrorBox();
            return;
          }}
          syncUI();
        }}
      }}

      window.__cbOnRender = handleStreamlitRender;
      initModalStaticContent();
      syncUI();
      if (window.__cbPendingRender) {{
        const pending = window.__cbPendingRender;
        window.__cbPendingRender = null;
        handleStreamlitRender(pending);
      }}
    </script>
  </body>
</html>
"""
