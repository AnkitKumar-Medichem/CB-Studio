import React from 'react';
import { X, ArrowUpRight } from 'lucide-react';

interface VseprRow {
  stericNumber: number;
  hybridization: string;
  electronGeometry: string;
  axNotation: string;
  bondingPairs: number;
  lonePairs: number;
  molecularGeometry: string;
  idealAngles: string;
  exampleName: string;
  exampleFormula: string;
  smiles: string;
}

const VSEPR_MATRIX: VseprRow[] = [
  {
    stericNumber: 2,
    hybridization: 'sp',
    electronGeometry: 'Linear',
    axNotation: 'AX₂',
    bondingPairs: 2,
    lonePairs: 0,
    molecularGeometry: 'Linear',
    idealAngles: '180°',
    exampleName: 'Carbon Dioxide',
    exampleFormula: 'CO₂',
    smiles: 'O=C=O',
  },
  {
    stericNumber: 3,
    hybridization: 'sp²',
    electronGeometry: 'Trigonal Planar',
    axNotation: 'AX₃',
    bondingPairs: 3,
    lonePairs: 0,
    molecularGeometry: 'Trigonal Planar',
    idealAngles: '120°',
    exampleName: 'Boron Trifluoride',
    exampleFormula: 'BF₃',
    smiles: 'B(F)(F)F',
  },
  {
    stericNumber: 3,
    hybridization: 'sp²',
    electronGeometry: 'Trigonal Planar',
    axNotation: 'AX₂E₁',
    bondingPairs: 2,
    lonePairs: 1,
    molecularGeometry: 'Bent',
    idealAngles: '~118° (<120°)',
    exampleName: 'Sulfur Dioxide',
    exampleFormula: 'SO₂',
    smiles: 'O=S=O',
  },
  {
    stericNumber: 4,
    hybridization: 'sp³',
    electronGeometry: 'Tetrahedral',
    axNotation: 'AX₄',
    bondingPairs: 4,
    lonePairs: 0,
    molecularGeometry: 'Tetrahedral',
    idealAngles: '109.5°',
    exampleName: 'Methane',
    exampleFormula: 'CH₄',
    smiles: 'C',
  },
  {
    stericNumber: 4,
    hybridization: 'sp³',
    electronGeometry: 'Tetrahedral',
    axNotation: 'AX₃E₁',
    bondingPairs: 3,
    lonePairs: 1,
    molecularGeometry: 'Trigonal Pyramidal',
    idealAngles: '~107° (<109.5°)',
    exampleName: 'Ammonia',
    exampleFormula: 'NH₃',
    smiles: 'N',
  },
  {
    stericNumber: 4,
    hybridization: 'sp³',
    electronGeometry: 'Tetrahedral',
    axNotation: 'AX₂E₂',
    bondingPairs: 2,
    lonePairs: 2,
    molecularGeometry: 'Bent',
    idealAngles: '~104.5° (<109.5°)',
    exampleName: 'Water',
    exampleFormula: 'H₂O',
    smiles: 'O',
  },
  {
    stericNumber: 5,
    hybridization: 'sp³d',
    electronGeometry: 'Trigonal Bipyramidal',
    axNotation: 'AX₅',
    bondingPairs: 5,
    lonePairs: 0,
    molecularGeometry: 'Trigonal Bipyramidal',
    idealAngles: '90° · 120° · 180°',
    exampleName: 'Phosphorus Pentachloride',
    exampleFormula: 'PCl₅',
    smiles: 'P(Cl)(Cl)(Cl)(Cl)Cl',
  },
  {
    stericNumber: 5,
    hybridization: 'sp³d',
    electronGeometry: 'Trigonal Bipyramidal',
    axNotation: 'AX₄E₁',
    bondingPairs: 4,
    lonePairs: 1,
    molecularGeometry: 'Seesaw',
    idealAngles: '~86.5° · ~101.5°',
    exampleName: 'Sulfur Tetrafluoride',
    exampleFormula: 'SF₄',
    smiles: 'S(F)(F)(F)F',
  },
  {
    stericNumber: 5,
    hybridization: 'sp³d',
    electronGeometry: 'Trigonal Bipyramidal',
    axNotation: 'AX₃E₂',
    bondingPairs: 3,
    lonePairs: 2,
    molecularGeometry: 'T-Shaped',
    idealAngles: '~87.5° · ~175°',
    exampleName: 'Chlorine Trifluoride',
    exampleFormula: 'ClF₃',
    smiles: 'Cl(F)(F)F',
  },
  {
    stericNumber: 5,
    hybridization: 'sp³d',
    electronGeometry: 'Trigonal Bipyramidal',
    axNotation: 'AX₂E₃',
    bondingPairs: 2,
    lonePairs: 3,
    molecularGeometry: 'Linear',
    idealAngles: '180°',
    exampleName: 'Xenon Difluoride',
    exampleFormula: 'XeF₂',
    smiles: '[Xe](F)F',
  },
  {
    stericNumber: 6,
    hybridization: 'sp³d²',
    electronGeometry: 'Octahedral',
    axNotation: 'AX₆',
    bondingPairs: 6,
    lonePairs: 0,
    molecularGeometry: 'Octahedral',
    idealAngles: '90° · 180°',
    exampleName: 'Sulfur Hexafluoride',
    exampleFormula: 'SF₆',
    smiles: 'S(F)(F)(F)(F)(F)F',
  },
  {
    stericNumber: 6,
    hybridization: 'sp³d²',
    electronGeometry: 'Octahedral',
    axNotation: 'AX₅E₁',
    bondingPairs: 5,
    lonePairs: 1,
    molecularGeometry: 'Square Pyramidal',
    idealAngles: '~84.8° · 90°',
    exampleName: 'Bromine Pentafluoride',
    exampleFormula: 'BrF₅',
    smiles: 'Br(F)(F)(F)(F)F',
  },
  {
    stericNumber: 6,
    hybridization: 'sp³d²',
    electronGeometry: 'Octahedral',
    axNotation: 'AX₄E₂',
    bondingPairs: 4,
    lonePairs: 2,
    molecularGeometry: 'Square Planar',
    idealAngles: '90° · 180°',
    exampleName: 'Xenon Tetrafluoride',
    exampleFormula: 'XeF₄',
    smiles: '[Xe](F)(F)(F)F',
  },
];

interface VseprReferenceModalProps {
  open: boolean;
  onClose: () => void;
  onSelectExample: (smiles: string, name: string) => void;
}

export function VseprReferenceModal({
  open,
  onClose,
  onSelectExample,
}: VseprReferenceModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="vsepr-ref-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-5xl max-h-[86vh] flex flex-col rounded-xl border border-slate-200 bg-white text-slate-900 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-6 py-4">
          <div>
            <h2
              id="vsepr-ref-title"
              className="text-base font-semibold tracking-tight text-slate-900"
            >
              VSEPR Theory &amp; Hybridization Reference
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Select any geometry row to load its 3D structure with lone-pair orbitals.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500 hover:text-slate-900 transition-colors cursor-pointer"
            aria-label="Close reference"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-auto lab-scroll px-6 py-4">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500 font-medium">
                <th className="py-2.5 pr-3">SN</th>
                <th className="py-2.5 pr-3">Hybrid</th>
                <th className="py-2.5 pr-3">Notation</th>
                <th className="py-2.5 pr-3">Bonds / LP</th>
                <th className="py-2.5 pr-3">Electron Geometry</th>
                <th className="py-2.5 pr-3">Molecular Shape</th>
                <th className="py-2.5 pr-3">Bond Angles</th>
                <th className="py-2.5 text-right">3D Example</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {VSEPR_MATRIX.map((row) => (
                <tr
                  key={row.axNotation}
                  className="hover:bg-slate-50 transition-colors"
                >
                  <td className="py-2.5 pr-3 font-mono tabular-nums text-slate-700">
                    {row.stericNumber}
                  </td>
                  <td className="py-2.5 pr-3 font-mono font-semibold text-sky-700">
                    {row.hybridization}
                  </td>
                  <td className="py-2.5 pr-3 font-mono text-slate-800">
                    {row.axNotation}
                  </td>
                  <td className="py-2.5 pr-3 font-mono tabular-nums text-slate-700">
                    {row.bondingPairs}σ ·{' '}
                    <span
                      className={
                        row.lonePairs > 0 ? 'text-amber-700 font-medium' : 'text-slate-400'
                      }
                    >
                      {row.lonePairs} LP
                    </span>
                  </td>
                  <td className="py-2.5 pr-3 text-slate-600">
                    {row.electronGeometry}
                  </td>
                  <td className="py-2.5 pr-3 font-medium text-slate-900">
                    {row.molecularGeometry}
                  </td>
                  <td className="py-2.5 pr-3 font-mono tabular-nums text-slate-600">
                    {row.idealAngles}
                  </td>
                  <td className="py-2.5 text-right">
                    <button
                      type="button"
                      onClick={() => {
                        onSelectExample(row.smiles, row.exampleName);
                        onClose();
                      }}
                      className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-sky-700 hover:border-sky-400 hover:bg-sky-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <span>{row.exampleFormula}</span>
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
