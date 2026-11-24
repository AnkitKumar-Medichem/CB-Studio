import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Box,
  Camera,
  ChevronRight,
  CircleDot,
  Compass,
  Crosshair,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  Tag,
  X,
} from 'lucide-react';
import {
  buildMoleculeFromSmiles,
  buildMoleculeWithRDKit,
} from './chemistry/geometry3d';
import { MOLECULE_PRESETS } from './chemistry/presets';
import { AnalyzedAtom, MoleculeModel, MoleculePreset } from './chemistry/types';
import {
  MoleculeViewport3D,
  MoleculeViewportHandle,
  RenderStyle,
} from './components/MoleculeViewport3D';
import { VseprReferenceModal } from './components/VseprReferenceModal';

type InspectorTab = 'atom' | 'atoms-table' | 'presets';
type PresetCategoryFilter = 'All' | MoleculePreset['category'];

function getVseprExplanation(atom: AnalyzedAtom): string {
  if (atom.symbol === 'H') {
    return 'Hydrogen forms 1 σ bond using its 1s orbital with 0 lone pairs.';
  }
  if (atom.sigmaBonds <= 1) {
    if (atom.lonePairs > 0) {
      return `Terminal ${atom.name.toLowerCase()} with ${atom.lonePairs} lone pair${
        atom.lonePairs === 1 ? '' : 's'
      } and ${atom.sigmaBonds} σ bond${atom.sigmaBonds === 1 ? '' : 's'}.`;
    }
    return `Terminal atom with ${atom.sigmaBonds} σ bond.`;
  }

  const lp = atom.localizedLonePairs;
  const sn = atom.stericNumber;

  if (sn === 2) {
    return 'Two electron domains separate at 180° using collinear sp hybrid orbitals.';
  }
  if (sn === 3) {
    if (lp === 0) {
      return 'Three bonding domains arrange symmetrically in a plane at 120° (sp²).';
    }
    return 'One sp² lone pair compresses the bond angle slightly below 120° (~118°).';
  }
  if (sn === 4) {
    if (lp === 0) {
      return 'Four sp³ bonding domains point toward regular tetrahedral vertices (109.5°).';
    }
    if (lp === 1) {
      return 'One sp³ lone pair compresses the three bonds into a ~107° trigonal pyramid.';
    }
    return 'Two sp³ lone pairs repel the bonding pairs, compressing the bond angle to ~104.5°.';
  }
  if (sn === 5) {
    if (lp === 0) {
      return 'Five sp³d bonding domains occupy 2 axial (180°) and 3 equatorial (120°) sites.';
    }
    if (lp === 1) {
      return 'One equatorial sp³d lone pair minimizes 90° repulsions, forming a seesaw shape.';
    }
    if (lp === 2) {
      return 'Two equatorial sp³d lone pairs leave a slightly bent T-shaped molecular arrangement.';
    }
    return 'Three equatorial lone pairs force the two bonded atoms into a 180° linear axis.';
  }
  if (sn === 6) {
    if (lp === 0) {
      return 'Six sp³d² hybrid orbitals point along orthogonal ±X, ±Y, ±Z octahedral axes (90°).';
    }
    if (lp === 1) {
      return 'One sp³d² lone pair nudges the four basal ligands slightly upward (~84.8°).';
    }
    return 'Two trans (180°) sp³d² lone pairs leave a flat square planar geometry.';
  }
  return `Steric number ${sn} (${atom.hybridization}) balances ${atom.sigmaBonds} σ bonds and ${lp} localized lone pairs.`;
}

const DEFAULT_PRESET =
  MOLECULE_PRESETS.find((p) => p.id === 'sf4') ?? MOLECULE_PRESETS[0];

export default function App() {
  const viewportRef = useRef<MoleculeViewportHandle | null>(null);

  const initialModel = useMemo(
    () =>
      buildMoleculeFromSmiles(DEFAULT_PRESET.smiles, {
        name: DEFAULT_PRESET.name,
        notes: DEFAULT_PRESET.description,
      }),
    []
  );

  const [smilesInput, setSmilesInput] = useState(DEFAULT_PRESET.smiles);
  const [molecule, setMolecule] = useState<MoleculeModel>(initialModel);
  const [selectedAtomId, setSelectedAtomId] = useState<number | null>(
    initialModel.summary.primaryCenterId
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<InspectorTab>('atom');
  const [presetCategory, setPresetCategory] =
    useState<PresetCategoryFilter>('All');
  const [showAllHydrogensInTable, setShowAllHydrogensInTable] = useState(false);

  // 3D Viewport display states
  const [renderStyle, setRenderStyle] = useState<RenderStyle>('ball-stick');
  const [showLonePairs, setShowLonePairs] = useState(true);
  const [showHybridOrbitals, setShowHybridOrbitals] = useState(false);
  const [showBondAngles, setShowBondAngles] = useState(true);
  const [showVseprCage, setShowVseprCage] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [autoSpin, setAutoSpin] = useState(false);

  // Modals
  const [referenceOpen, setReferenceOpen] = useState(false);
  const [smilesGuideOpen, setSmilesGuideOpen] = useState(false);

  const requestSeqRef = useRef(0);

  // Immediately upgrade initial molecule calculation through RDKit WASM on mount
  useEffect(() => {
    let active = true;
    const seq = ++requestSeqRef.current;
    buildMoleculeWithRDKit(DEFAULT_PRESET.smiles, {
      name: DEFAULT_PRESET.name,
      notes: DEFAULT_PRESET.description,
    })
      .then((built) => {
        if (!active || seq !== requestSeqRef.current) return;
        setMolecule(built);
        setSelectedAtomId(built.summary.primaryCenterId);
      })
      .catch(() => {
        // Keep synchronous initial model if WASM fails to load
      });
    return () => {
      active = false;
    };
  }, []);

  const loadSmiles = async (
    raw: string,
    meta?: { name?: string; notes?: string }
  ) => {
    const seq = ++requestSeqRef.current;
    const trimmed = raw.trim();
    const matchedPreset = MOLECULE_PRESETS.find((p) => p.smiles === trimmed);
    const resolvedMeta =
      meta ??
      (matchedPreset
        ? { name: matchedPreset.name, notes: matchedPreset.description }
        : undefined);

    try {
      const built = await buildMoleculeWithRDKit(trimmed, resolvedMeta);
      if (seq !== requestSeqRef.current) return;
      setMolecule(built);
      setSelectedAtomId(built.summary.primaryCenterId);
      setSmilesInput(trimmed);
      setErrorMsg(null);
    } catch (err) {
      if (seq !== requestSeqRef.current) return;
      setErrorMsg(
        err instanceof Error ? err.message : 'Unable to parse SMILES string.'
      );
    }
  };

  const handleSmilesSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadSmiles(smilesInput);
  };

  const selectedAtom =
    molecule.atoms.find((a) => a.id === selectedAtomId) ??
    molecule.atoms.find((a) => a.id === molecule.summary.primaryCenterId) ??
    molecule.atoms[0] ??
    null;

  const filteredPresets =
    presetCategory === 'All'
      ? MOLECULE_PRESETS
      : MOLECULE_PRESETS.filter((p) => p.category === presetCategory);

  const tableAtoms = showAllHydrogensInTable
    ? molecule.atoms
    : molecule.atoms.filter((a) => a.symbol !== 'H');

  return (
    <div className="flex h-screen w-screen flex-col lg:flex-row overflow-hidden bg-white text-slate-900">
      {/* Left Minimalist SMILES & VSEPR Rail */}
      <aside className="flex w-full lg:w-[308px] xl:w-[324px] shrink-0 flex-col border-b lg:border-b-0 lg:border-r border-slate-200 bg-[#FAFAFA] max-h-[34vh] lg:max-h-none overflow-hidden">
          {/* SMILES Input */}
          <div className="border-b border-slate-200 bg-white p-3.5">
            <label
              htmlFor="smiles-input"
              className="block text-xs font-medium text-slate-700 mb-1.5"
            >
              SMILES Input
            </label>

            <form onSubmit={handleSmilesSubmit} className="flex items-center gap-2">
              <input
                id="smiles-input"
                type="text"
                value={smilesInput}
                onChange={(e) => setSmilesInput(e.target.value)}
                placeholder="e.g. O, N, O=S=O, S(F)(F)(F)F"
                spellCheck={false}
                autoComplete="off"
                className="min-w-0 flex-1 h-8 rounded-lg border border-slate-200 bg-white px-3 font-mono text-xs text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none"
              />
              <button
                type="submit"
                className="h-8 rounded-lg bg-slate-900 px-3.5 text-xs font-medium text-white hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Build
              </button>
            </form>

            {/* Compact Quick-Try Row */}
            <div className="mt-2 flex items-center gap-1.5 overflow-x-auto pb-0.5 lab-scroll text-[11px]">
              {[
                { label: 'H₂O', smiles: 'O' },
                { label: 'NH₃', smiles: 'N' },
                { label: 'CH₄', smiles: 'C' },
                { label: 'SF₄', smiles: 'S(F)(F)(F)F' },
                { label: 'ClF₃', smiles: 'Cl(F)(F)F' },
                { label: 'XeF₄', smiles: '[Xe](F)(F)(F)F' },
                { label: 'SF₆', smiles: 'S(F)(F)(F)(F)(F)F' },
                { label: 'C₆H₆', smiles: 'c1ccccc1' },
              ].map((ex) => {
                const active = molecule.summary.smiles === ex.smiles;
                return (
                  <button
                    key={ex.smiles}
                    type="button"
                    onClick={() => loadSmiles(ex.smiles)}
                    className={`rounded px-2 py-1 font-mono leading-none transition-colors whitespace-nowrap shrink-0 cursor-pointer border ${
                      active
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900'
                    }`}
                  >
                    {ex.label}
                  </button>
                );
              })}
            </div>

            {errorMsg && (
              <div
                role="alert"
                className="mt-2.5 flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 px-2.5 py-2 text-xs text-rose-700"
              >
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-500 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}
          </div>

          {/* Minimal Segmented Tabs */}
          <div className="border-b border-slate-200 bg-white px-3.5 py-2">
            <div className="grid grid-cols-3 gap-1 rounded-lg bg-slate-100 p-0.5">
              {(
                [
                  ['atom', 'Inspector'],
                  ['atoms-table', 'Atoms'],
                  ['presets', 'Library'],
                ] as const
              ).map(([tab, label]) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={`rounded-md px-2 py-1 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                    activeTab === tab
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Rail Content */}
          <div className="flex-1 overflow-y-auto lab-scroll p-3.5 space-y-3.5">
            {activeTab === 'atom' && selectedAtom && (
              <>
                {/* Selected Atom Identity */}
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <span
                      className="h-7 w-7 rounded-full border border-slate-300 shrink-0 flex items-center justify-center font-mono text-[11px] font-bold text-slate-900"
                      style={{
                        backgroundColor: selectedAtom.cpkColor,
                        color: (() => {
                          const hex = selectedAtom.cpkColor.replace('#', '');
                          const r = parseInt(hex.slice(0, 2), 16) / 255;
                          const g = parseInt(hex.slice(2, 4), 16) / 255;
                          const b = parseInt(hex.slice(4, 6), 16) / 255;
                          const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
                          return lum < 0.45 ? '#FFFFFF' : '#0F172A';
                        })(),
                      }}
                    >
                      {selectedAtom.symbol}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-baseline gap-2">
                        <h3 className="text-sm font-semibold text-slate-900 truncate">
                          {selectedAtom.name} ({selectedAtom.symbol}
                          {selectedAtom.id + 1})
                        </h3>
                        {selectedAtom.formalCharge !== 0 && (
                          <span className="font-mono text-xs font-medium text-sky-700 shrink-0">
                            {selectedAtom.formalCharge > 0 ? '+' : ''}
                            {selectedAtom.formalCharge}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5 leading-snug">
                        {selectedAtom.orbitalSummary}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      viewportRef.current?.focusAtom(selectedAtom.id)
                    }
                    className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-500 hover:text-slate-900 transition-colors shrink-0 cursor-pointer"
                    title="Center camera on this atom"
                  >
                    <Crosshair className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* 2x2 Minimal VSEPR & Hybridization Grid */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex flex-col justify-between min-h-[76px] rounded-lg border border-slate-200 bg-white p-2.5">
                    <div className="text-[11px] font-medium text-slate-500">
                      Hybridization
                    </div>
                    <div className="mt-1 font-mono text-base font-semibold leading-tight text-sky-700">
                      {selectedAtom.hybridization}
                    </div>
                    <div className="mt-1 font-mono text-[11px] text-slate-400 tabular-nums">
                      SN {selectedAtom.stericNumber}
                    </div>
                  </div>

                  <div className="flex flex-col justify-between min-h-[76px] rounded-lg border border-slate-200 bg-white p-2.5">
                    <div className="text-[11px] font-medium text-slate-500">
                      Lone Pairs
                    </div>
                    <div
                      className={`mt-1 font-mono text-base font-semibold leading-tight tabular-nums ${
                        selectedAtom.lonePairs > 0
                          ? 'text-amber-700'
                          : 'text-slate-700'
                      }`}
                    >
                      {selectedAtom.lonePairs}
                    </div>
                    <div className="mt-1 font-mono text-[11px] text-slate-400 tabular-nums">
                      {selectedAtom.delocalizedLonePairs > 0
                        ? `${selectedAtom.localizedLonePairs} local · ${selectedAtom.delocalizedLonePairs} π`
                        : `${selectedAtom.lonePairs * 2} non-bonding e⁻`}
                    </div>
                  </div>

                  <div className="flex flex-col justify-between min-h-[76px] rounded-lg border border-slate-200 bg-white p-2.5">
                    <div className="text-[11px] font-medium text-slate-500">
                      Molecular Shape
                    </div>
                    <div className="mt-1 text-[13px] font-semibold leading-snug text-slate-900">
                      {selectedAtom.molecularGeometry}
                    </div>
                    <div className="mt-1 font-mono text-[11px] text-slate-400">
                      {selectedAtom.axNotation}
                    </div>
                  </div>

                  <div className="flex flex-col justify-between min-h-[76px] rounded-lg border border-slate-200 bg-white p-2.5">
                    <div className="text-[11px] font-medium text-slate-500">
                      Electron Geometry
                    </div>
                    <div className="mt-1 text-[13px] font-semibold leading-snug text-slate-900">
                      {selectedAtom.electronGeometry}
                    </div>
                    <div className="mt-1 font-mono text-[11px] text-slate-400 tabular-nums">
                      {selectedAtom.idealAngleLabel}
                    </div>
                  </div>
                </div>

                {/* Concise VSEPR Note */}
                <div className="border-t border-slate-200 pt-3">
                  <p className="text-xs leading-relaxed text-slate-600">
                    {getVseprExplanation(selectedAtom)}
                  </p>
                </div>

                {/* Measured 3D Bond Angles */}
                {selectedAtom.measuredAngles.length > 0 && (
                  <div className="border-t border-slate-200 pt-3">
                    <div className="text-xs font-medium text-slate-700 mb-2">
                      3D Bond Angles
                    </div>
                    <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white text-xs">
                      {selectedAtom.measuredAngles.map((ang, idx) => (
                        <div
                          key={`${ang.atomA}-${ang.atomB}-${idx}`}
                          className="flex items-center justify-between px-3 py-1.5"
                        >
                          <span className="font-mono text-slate-600">
                            {ang.labelA}–{selectedAtom.symbol}
                            {selectedAtom.id + 1}–{ang.labelB}
                          </span>
                          <span className="font-mono tabular-nums font-medium text-sky-700">
                            {ang.angleDeg.toFixed(1)}°
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* RDKit Molecular Descriptors & Identifiers */}
                {molecule.summary.rdkit && (
                  <div className="border-t border-slate-200 pt-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium text-slate-700">
                        RDKit Properties
                      </span>
                      <span className="font-mono text-[10px] text-slate-400">
                        v{molecule.summary.rdkit.version}
                      </span>
                    </div>
                    <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white text-xs">
                      <div className="flex items-center justify-between px-3 py-1.5">
                        <span className="text-slate-500">Exact Mass</span>
                        <span className="font-mono tabular-nums text-slate-900">
                          {molecule.summary.rdkit.exactMw.toFixed(4)} Da
                        </span>
                      </div>
                      <div className="flex items-center justify-between px-3 py-1.5">
                        <span className="text-slate-500">TPSA / LogP</span>
                        <span className="font-mono tabular-nums text-slate-900">
                          {molecule.summary.rdkit.tpsa.toFixed(1)} Å² ·{' '}
                          {molecule.summary.rdkit.crippenLogP.toFixed(2)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between px-3 py-1.5">
                        <span className="text-slate-500">HBD / HBA / Rot</span>
                        <span className="font-mono tabular-nums text-slate-900">
                          {molecule.summary.rdkit.hbd} /{' '}
                          {molecule.summary.rdkit.hba} /{' '}
                          {molecule.summary.rdkit.rotatableBonds}
                        </span>
                      </div>
                      <div className="flex items-center justify-between px-3 py-1.5">
                        <span className="text-slate-500">Rings / Fsp³</span>
                        <span className="font-mono tabular-nums text-slate-900">
                          {molecule.summary.rdkit.numRings} (
                          {molecule.summary.rdkit.numAromaticRings} arom) ·{' '}
                          {molecule.summary.rdkit.fractionCsp3.toFixed(2)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2 px-3 py-1.5">
                        <span className="text-slate-500 shrink-0">Canonical</span>
                        <span
                          className="font-mono text-[11px] text-slate-800 truncate"
                          title={molecule.summary.rdkit.canonicalSmiles}
                        >
                          {molecule.summary.rdkit.canonicalSmiles}
                        </span>
                      </div>
                      {molecule.summary.rdkit.inchiKey && (
                        <div className="flex items-center justify-between gap-2 px-3 py-1.5">
                          <span className="text-slate-500 shrink-0">InChIKey</span>
                          <span
                            className="font-mono text-[10px] text-slate-600 truncate"
                            title={molecule.summary.rdkit.inchiKey}
                          >
                            {molecule.summary.rdkit.inchiKey}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}

            {activeTab === 'atoms-table' && (
              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <span className="text-xs text-slate-500">
                    Select atom to focus
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowAllHydrogensInTable((v) => !v)}
                    className="text-[11px] font-medium text-sky-700 hover:text-sky-900 cursor-pointer"
                  >
                    {showAllHydrogensInTable ? 'Hide H' : 'Show H'}
                  </button>
                </div>

                <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500">
                        <th className="py-2 pl-3 pr-2 font-medium">Atom</th>
                        <th className="py-2 px-2 font-medium">Hybrid</th>
                        <th className="py-2 px-2 font-medium">LP</th>
                        <th className="py-2 pl-2 pr-3 font-medium">Shape</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {tableAtoms.map((a) => {
                        const isSel = a.id === selectedAtom?.id;
                        return (
                          <tr
                            key={a.id}
                            onClick={() => {
                              setSelectedAtomId(a.id);
                              viewportRef.current?.focusAtom(a.id);
                            }}
                            className={`cursor-pointer transition-colors ${
                              isSel
                                ? 'bg-sky-50 text-slate-900'
                                : 'hover:bg-slate-50 text-slate-700'
                            }`}
                          >
                            <td className="py-2 pl-3 pr-2 font-mono font-medium">
                              <span className="inline-flex items-center gap-1.5">
                                <span
                                  className="inline-block h-2.5 w-2.5 rounded-full border border-slate-300"
                                  style={{ backgroundColor: a.cpkColor }}
                                />
                                <span>
                                  {a.symbol}
                                  {a.id + 1}
                                </span>
                              </span>
                            </td>
                            <td className="py-2 px-2 font-mono text-sky-700">
                              {a.hybridization}
                            </td>
                            <td
                              className={`py-2 px-2 font-mono tabular-nums ${
                                a.lonePairs > 0
                                  ? 'text-amber-700 font-medium'
                                  : 'text-slate-400'
                              }`}
                            >
                              {a.lonePairs}
                            </td>
                            <td className="py-2 pl-2 pr-2.5 truncate max-w-[100px]">
                              {a.molecularGeometry}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === 'presets' && (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-1">
                  {(
                    [
                      'All',
                      'Linear & Trigonal',
                      'Tetrahedral Family',
                      'Trigonal Bipyramidal',
                      'Octahedral Family',
                      'Organic & Aromatic',
                    ] as const
                  ).map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setPresetCategory(cat)}
                      className={`rounded-md px-2 py-1 text-[11px] font-medium border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        presetCategory === cat
                          ? 'bg-slate-900 border-slate-900 text-white'
                          : 'bg-white border-slate-200 text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>

                <div className="space-y-1.5">
                  {filteredPresets.map((preset) => {
                    const isActive = molecule.summary.smiles === preset.smiles;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => {
                          loadSmiles(preset.smiles, {
                            name: preset.name,
                            notes: preset.description,
                          });
                          setActiveTab('atom');
                        }}
                        className={`w-full text-left rounded-lg border p-2.5 transition-colors cursor-pointer ${
                          isActive
                            ? 'border-slate-900 bg-white'
                            : 'border-slate-200 bg-white hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-baseline gap-2 min-w-0">
                            <span className="text-xs font-semibold text-slate-900 truncate">
                              {preset.name}
                            </span>
                            <span className="font-mono text-xs text-sky-700 shrink-0">
                              {preset.formula}
                            </span>
                          </div>
                          <ChevronRight className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 font-mono text-[11px] text-slate-500">
                          <span className="text-slate-700">{preset.axNotation}</span>
                          <span aria-hidden="true">·</span>
                          <span className="text-sky-700">{preset.hybridization}</span>
                          <span aria-hidden="true">·</span>
                          <span className="text-amber-700">{preset.lonePairsNote}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </aside>

        {/* Main Pure White 3D Molecular Viewport Stage */}
        <main className="relative flex-1 min-h-[340px] lg:min-h-0 overflow-hidden bg-white">
          <MoleculeViewport3D
            ref={viewportRef}
            molecule={molecule}
            selectedAtomId={selectedAtom?.id ?? null}
            onSelectAtom={(id) => {
              setSelectedAtomId(id);
              if (id !== null) setActiveTab('atom');
            }}
            renderStyle={renderStyle}
            showLonePairs={showLonePairs}
            showHybridOrbitals={showHybridOrbitals}
            showBondAngles={showBondAngles}
            showVseprCage={showVseprCage}
            showLabels={showLabels}
            autoSpin={autoSpin}
          />
        </main>

        {/* Fixed Right-Docked Display & Reference Options Rail */}
        <aside className="flex w-full lg:w-[216px] xl:w-[228px] shrink-0 flex-col border-t lg:border-t-0 lg:border-l border-slate-200 bg-[#FAFAFA] max-h-[30vh] lg:max-h-none overflow-hidden">
          <div className="flex-1 overflow-y-auto lab-scroll p-3.5 space-y-3.5">
            {/* Render Style */}
            <div>
              <div className="text-xs font-medium text-slate-700 mb-2">
                Render Style
              </div>
              <div className="flex flex-col gap-0.5 rounded-lg border border-slate-200 bg-slate-100 p-0.5">
                {(
                  [
                    ['ball-stick', 'Ball & Stick'],
                    ['space-fill', 'Space-Fill'],
                    ['wireframe', 'Wireframe'],
                  ] as const
                ).map(([mode, label]) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setRenderStyle(mode)}
                    className={`flex h-7 w-full items-center px-2.5 text-left text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                      renderStyle === mode
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Chemistry Overlays */}
            <div className="border-t border-slate-200 pt-3">
              <div className="text-xs font-medium text-slate-700 mb-2">
                Overlays
              </div>
              <div className="flex flex-col gap-1.5">
                <button
                  type="button"
                  onClick={() => setShowLonePairs((v) => !v)}
                  className={`flex h-7 w-full items-center gap-2 rounded-md px-2.5 text-xs font-medium border transition-colors whitespace-nowrap cursor-pointer ${
                    showLonePairs
                      ? 'bg-amber-50 border-amber-300 text-amber-900'
                      : 'bg-white border-slate-200 text-slate-500 hover:text-slate-900'
                  }`}
                >
                  <CircleDot className="h-3.5 w-3.5 shrink-0" />
                  <span>Lone Pairs</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowHybridOrbitals((v) => !v)}
                  className={`flex h-7 w-full items-center gap-2 rounded-md px-2.5 text-xs font-medium border transition-colors whitespace-nowrap cursor-pointer ${
                    showHybridOrbitals
                      ? 'bg-sky-50 border-sky-300 text-sky-900'
                      : 'bg-white border-slate-200 text-slate-500 hover:text-slate-900'
                  }`}
                >
                  <Sparkles className="h-3.5 w-3.5 shrink-0" />
                  <span>Orbitals</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowBondAngles((v) => !v)}
                  className={`flex h-7 w-full items-center gap-2 rounded-md px-2.5 text-xs font-medium border transition-colors whitespace-nowrap cursor-pointer ${
                    showBondAngles
                      ? 'bg-sky-50 border-sky-300 text-sky-900'
                      : 'bg-white border-slate-200 text-slate-500 hover:text-slate-900'
                  }`}
                >
                  <Compass className="h-3.5 w-3.5 shrink-0" />
                  <span>Angles</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowVseprCage((v) => !v)}
                  className={`flex h-7 w-full items-center gap-2 rounded-md px-2.5 text-xs font-medium border transition-colors whitespace-nowrap cursor-pointer ${
                    showVseprCage
                      ? 'bg-sky-50 border-sky-300 text-sky-900'
                      : 'bg-white border-slate-200 text-slate-500 hover:text-slate-900'
                  }`}
                >
                  <Box className="h-3.5 w-3.5 shrink-0" />
                  <span>Cage</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowLabels((v) => !v)}
                  className={`flex h-7 w-full items-center gap-2 rounded-md px-2.5 text-xs font-medium border transition-colors whitespace-nowrap cursor-pointer ${
                    showLabels
                      ? 'bg-slate-900 border-slate-900 text-white'
                      : 'bg-white border-slate-200 text-slate-500 hover:text-slate-900'
                  }`}
                >
                  <Tag className="h-3.5 w-3.5 shrink-0" />
                  <span>Labels</span>
                </button>
              </div>

              {/* Lone-Pair Color Key */}
              <div className="mt-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2 space-y-1 text-[11px] text-slate-600">
                <div className="flex items-center gap-2 whitespace-nowrap">
                  <span className="inline-block h-2 w-2 rounded-full bg-amber-600 shrink-0" />
                  <span>Localized LP</span>
                </div>
                <div className="flex items-center gap-2 whitespace-nowrap">
                  <span className="inline-block h-2 w-2 rounded-full bg-violet-600 shrink-0" />
                  <span>π-conjugated LP</span>
                </div>
              </div>
            </div>

            {/* Motion & Camera */}
            <div className="border-t border-slate-200 pt-3">
              <div className="text-xs font-medium text-slate-700 mb-2">
                View
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => setAutoSpin((v) => !v)}
                  className={`flex h-7 w-full items-center justify-center gap-1.5 rounded-md px-2 text-xs font-medium border transition-colors whitespace-nowrap cursor-pointer ${
                    autoSpin
                      ? 'bg-slate-900 border-slate-900 text-white'
                      : 'bg-white border-slate-200 text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {autoSpin ? (
                    <Pause className="h-3.5 w-3.5 shrink-0" />
                  ) : (
                    <Play className="h-3.5 w-3.5 shrink-0" />
                  )}
                  <span>{autoSpin ? 'Pause' : 'Spin'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => viewportRef.current?.resetCamera()}
                  className="flex h-7 w-full items-center justify-center gap-1.5 rounded-md px-2 text-xs font-medium border border-slate-200 bg-white text-slate-600 hover:text-slate-900 transition-colors whitespace-nowrap cursor-pointer"
                >
                  <RotateCcw className="h-3.5 w-3.5 shrink-0" />
                  <span>Reset</span>
                </button>
              </div>
            </div>

            {/* Reference Guides */}
            <div className="border-t border-slate-200 pt-3">
              <div className="text-xs font-medium text-slate-700 mb-2">
                Reference
              </div>
              <div className="flex flex-col gap-1.5">
                <button
                  type="button"
                  onClick={() => setReferenceOpen(true)}
                  className="flex h-7 w-full items-center justify-between rounded-md border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 hover:border-slate-300 hover:text-slate-900 transition-colors whitespace-nowrap cursor-pointer"
                >
                  <span>VSEPR Table</span>
                  <ChevronRight className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                </button>
                <button
                  type="button"
                  onClick={() => setSmilesGuideOpen(true)}
                  className="flex h-7 w-full items-center justify-between rounded-md border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 hover:border-slate-300 hover:text-slate-900 transition-colors whitespace-nowrap cursor-pointer"
                >
                  <span>SMILES Guide</span>
                  <ChevronRight className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                </button>
              </div>
            </div>
          </div>

          {/* Export Action */}
          <div className="border-t border-slate-200 bg-white p-3.5 shrink-0">
            <button
              type="button"
              onClick={() => viewportRef.current?.exportPng()}
              className="flex h-8 w-full items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-3 text-xs font-medium text-white hover:bg-slate-800 transition-colors whitespace-nowrap cursor-pointer"
            >
              <Camera className="h-3.5 w-3.5 shrink-0" />
              <span>Export PNG</span>
            </button>
          </div>
        </aside>

      {/* Interactive VSEPR Reference Table Modal */}
      <VseprReferenceModal
        open={referenceOpen}
        onClose={() => setReferenceOpen(false)}
        onSelectExample={(smiles, name) => {
          loadSmiles(smiles, { name });
          setActiveTab('atom');
        }}
      />

      {/* SMILES Quick Syntax Guide Modal */}
      {smilesGuideOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="smiles-guide-title"
          onClick={() => setSmilesGuideOpen(false)}
        >
          <div
            className="w-full max-w-2xl max-h-[86vh] flex flex-col rounded-xl border border-slate-200 bg-white text-slate-900 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-6 py-4 shrink-0">
              <div>
                <h2
                  id="smiles-guide-title"
                  className="text-base font-semibold text-slate-900"
                >
                  SMILES Notation Guide
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Enter molecular graphs using standard SMILES syntax.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSmilesGuideOpen(false)}
                className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500 hover:text-slate-900 cursor-pointer shrink-0"
                aria-label="Close guide"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto lab-scroll p-6 space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  {
                    title: 'Implicit Hydrogens',
                    example: 'C, N, O',
                    desc: 'Organic atoms auto-fill valence with hydrogens (CH₄, NH₃, H₂O).',
                    trySmiles: 'N',
                  },
                  {
                    title: 'Multiple Bonds',
                    example: 'O=C=O · C#N',
                    desc: 'Use "=" for double bonds and "#" for triple bonds.',
                    trySmiles: 'C#N',
                  },
                  {
                    title: 'Branches',
                    example: 'CC(=O)O · S(F)(F)(F)F',
                    desc: 'Enclose side chains or ligands in parentheses "(...)".',
                    trySmiles: 'CC(=O)O',
                  },
                  {
                    title: 'Aromatic Rings',
                    example: 'c1ccccc1 · n1ccccc1',
                    desc: 'Lowercase atoms and matching digits close aromatic rings.',
                    trySmiles: 'n1ccccc1',
                  },
                  {
                    title: 'Expanded Octets',
                    example: '[Xe](F)(F)(F)F · Cl(F)(F)F',
                    desc: 'Bracket non-organic elements like [Xe] or [Be] for hypervalent shapes.',
                    trySmiles: '[Xe](F)(F)(F)F',
                  },
                  {
                    title: 'Formal Charges & Ions',
                    example: '[NH4+] · [OH3+] · [I-](I)I',
                    desc: 'Specify charges inside brackets to inspect ion lone pairs.',
                    trySmiles: '[OH3+]',
                  },
                ].map((item) => (
                  <div
                    key={item.title}
                    className="rounded-lg border border-slate-200 bg-[#FAFAFA] p-3 flex flex-col justify-between gap-2"
                  >
                    <div>
                      <div className="font-semibold text-slate-900">
                        {item.title}
                      </div>
                      <div className="mt-1 font-mono text-sky-700">
                        {item.example}
                      </div>
                      <p className="mt-1 text-slate-600 leading-relaxed">
                        {item.desc}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        loadSmiles(item.trySmiles);
                        setSmilesGuideOpen(false);
                      }}
                      className="self-start rounded border border-slate-200 bg-white px-2.5 py-1 font-mono text-[11px] text-sky-700 hover:border-sky-400 cursor-pointer"
                    >
                      Load {item.trySmiles}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
