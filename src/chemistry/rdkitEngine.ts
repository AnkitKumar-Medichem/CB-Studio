import type { MainModule, Mol } from '@rdkit/rdkit';
import { getElementByAtomicNumber } from './elements';
import type { ParsedMoleculeGraph } from './smilesParser';
import type {
  BondOrder,
  ParsedAtom,
  ParsedBond,
  RdkitDescriptors,
} from './types';

interface CommonChemAtom {
  z?: number;
  impHs?: number;
  chg?: number;
  nRad?: number;
  isotope?: number;
}

interface CommonChemBond {
  bo?: number;
  atoms: [number, number];
}

interface CommonChemExtension {
  name: string;
  aromaticAtoms?: number[];
  aromaticBonds?: number[];
  atomRings?: number[][];
}

interface CommonChemConformer {
  dim: number;
  coords: number[][];
}

interface CommonChemMolecule {
  atoms: CommonChemAtom[];
  bonds?: CommonChemBond[];
  extensions?: CommonChemExtension[];
  conformers?: CommonChemConformer[];
}

interface CommonChemJson {
  defaults?: {
    atom?: CommonChemAtom;
    bond?: { bo?: number };
  };
  molecules?: CommonChemMolecule[];
}

declare global {
  interface Window {
    initRDKitModule?: (options?: {
      locateFile?: (path: string) => string;
    }) => Promise<MainModule>;
  }
}

let rdkitPromise: Promise<MainModule> | null = null;

async function loadScriptOnce(src: string): Promise<void> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }
  if (typeof window.initRDKitModule === 'function') {
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[data-rdkit-loader="true"]`
    );
    if (existing) {
      if (typeof window.initRDKitModule === 'function') {
        resolve();
        return;
      }
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener(
        'error',
        () => reject(new Error('Failed to load RDKit WASM script.')),
        { once: true }
      );
      return;
    }

    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.dataset.rdkitLoader = 'true';
    script.onload = () => resolve();
    script.onerror = () =>
      reject(new Error('Failed to load RDKit WASM runtime.'));
    document.head.appendChild(script);
  });
}

export async function getRDKit(): Promise<MainModule> {
  if (!rdkitPromise) {
    rdkitPromise = (async () => {
      if (typeof window !== 'undefined' && typeof document !== 'undefined') {
        const rdkitScriptUrl = new URL(
          'rdkit/RDKit_minimal.js',
          document.baseURI
        ).href;
        await loadScriptOnce(rdkitScriptUrl);
        if (typeof window.initRDKitModule !== 'function') {
          throw new Error('RDKit WASM initializer was not found on window.');
        }
        return await window.initRDKitModule({
          locateFile: (file: string) =>
            new URL(`rdkit/${file}`, document.baseURI).href,
        });
      }

      // Node.js fallback (e.g., tsx test runner)
      const mod = await import('@rdkit/rdkit');
      const factory =
        typeof mod.default === 'function'
          ? mod.default
          : (mod as unknown as (opts?: unknown) => Promise<MainModule>);
      return await factory();
    })();
  }
  return rdkitPromise;
}

export function isRDKitReady(): boolean {
  return rdkitPromise !== null;
}

function formatRDKitParseError(rawLog: string, smiles: string): string {
  const lines = rawLog
    .split(/\r?\n/)
    .map((l) => l.replace(/^\[\d{2}:\d{2}:\d{2}\]\s*/, '').trim())
    .filter(Boolean);

  const primary =
    lines.find((l) => /SMILES Parse Error:/i.test(l) && !/Failed parsing/i.test(l)) ??
    lines.find((l) => /Explicit valence|Can't kekulize|ring/i.test(l)) ??
    lines[0];

  if (primary) {
    return primary.replace(/^SMILES Parse Error:\s*/i, 'RDKit SMILES Error: ');
  }
  return `RDKit could not parse SMILES "${smiles}".`;
}

export interface RdkitCalculationResult {
  graph: ParsedMoleculeGraph;
  descriptors: RdkitDescriptors;
}

export async function parseAndCalculateWithRDKit(
  rawSmiles: string
): Promise<RdkitCalculationResult> {
  const smiles = rawSmiles.trim();
  if (!smiles) {
    throw new Error('Please enter a SMILES string.');
  }
  if (/\s/.test(smiles)) {
    throw new Error('SMILES strings cannot contain whitespace.');
  }

  const RDKit = await getRDKit();
  const errorLog = RDKit.set_log_capture('rdApp.error');

  let baseMol: Mol | null = null;
  let expandedMol: Mol | null = null;

  try {
    errorLog?.clear_buffer();
    baseMol = RDKit.get_mol(smiles);
    let sanitized = true;

    if (!baseMol || !baseMol.is_valid()) {
      const logMsg = errorLog?.get_buffer() ?? '';
      if (baseMol) {
        baseMol.delete();
        baseMol = null;
      }

      // Allow expanded-octet hypervalent species like Cl(F)(F)F or Br(F)(F)(F)(F)F
      // when RDKit rejects only because of Daylight organic-subset default valence.
      if (/Explicit valence/i.test(logMsg)) {
        errorLog?.clear_buffer();
        baseMol = RDKit.get_mol(smiles, JSON.stringify({ sanitize: false }));
        sanitized = false;
      } else {
        throw new Error(formatRDKitParseError(logMsg, smiles));
      }
    }

    if (!baseMol || !baseMol.is_valid()) {
      const logMsg = errorLog?.get_buffer() ?? '';
      throw new Error(formatRDKitParseError(logMsg, smiles));
    }

    // Canonical SMILES & descriptors from base RDKit molecule
    let canonicalSmiles = smiles;
    try {
      canonicalSmiles = baseMol.get_smiles() || smiles;
    } catch {
      canonicalSmiles = smiles;
    }

    let rawDesc: Record<string, number> = {};
    try {
      rawDesc = JSON.parse(baseMol.get_descriptors() || '{}') as Record<
        string,
        number
      >;
    } catch {
      rawDesc = {};
    }

    let inchi = '';
    let inchiKey = '';
    if (sanitized) {
      try {
        inchi = baseMol.get_inchi() || '';
        if (inchi) {
          inchiKey = RDKit.get_inchikey_for_inchi(inchi) || '';
        }
      } catch {
        inchi = '';
        inchiKey = '';
      }
    }

    // Expand explicit hydrogens in RDKit and generate CoordGen 2D layout
    let targetMol: Mol = baseMol;
    if (sanitized) {
      try {
        const hMolblock = baseMol.add_hs();
        if (hMolblock) {
          const candidate = RDKit.get_mol(
            hMolblock,
            JSON.stringify({ sanitize: true, removeHs: false })
          );
          if (candidate && candidate.is_valid()) {
            expandedMol = candidate;
            targetMol = expandedMol;
          } else if (candidate) {
            candidate.delete();
          }
        }
      } catch {
        targetMol = baseMol;
      }
    }

    try {
      targetMol.set_new_coords(true);
    } catch {
      // CoordGen optional if unsanitized fragment fails
    }

    const commonChem = JSON.parse(targetMol.get_json()) as CommonChemJson;
    const ccMol = commonChem.molecules?.[0];
    if (!ccMol || !ccMol.atoms || ccMol.atoms.length === 0) {
      throw new Error(`RDKit returned an empty molecular graph for "${smiles}".`);
    }

    const defaultAtom = commonChem.defaults?.atom ?? {};
    const defaultBond = commonChem.defaults?.bond ?? {};
    const rdkitExt = ccMol.extensions?.find(
      (ext) => ext.name === 'rdkitRepresentation'
    );

    const aromaticAtomSet = new Set<number>(rdkitExt?.aromaticAtoms ?? []);
    const aromaticBondSet = new Set<number>(rdkitExt?.aromaticBonds ?? []);
    const atomRings: number[][] = rdkitExt?.atomRings ?? [];

    const atoms: ParsedAtom[] = ccMol.atoms.map((a, idx) => {
      const z = a.z ?? defaultAtom.z ?? 6;
      const chg = a.chg ?? defaultAtom.chg ?? 0;
      const isotope = a.isotope ?? defaultAtom.isotope ?? 0;
      const elem = getElementByAtomicNumber(z);
      return {
        id: idx,
        symbol: elem.symbol,
        atomicNumber: elem.atomicNumber || z,
        isAromatic: aromaticAtomSet.has(idx),
        formalCharge: chg,
        explicitHydrogens: 0,
        isotope: isotope > 0 ? isotope : undefined,
      };
    });

    const bonds: ParsedBond[] = [];
    const kekuleBondOrders = new Map<number, 1 | 2 | 3>();

    (ccMol.bonds ?? []).forEach((b, idx) => {
      const boRaw = b.bo ?? defaultBond.bo ?? 1;
      const kekuleOrder: 1 | 2 | 3 = boRaw === 3 ? 3 : boRaw === 2 ? 2 : 1;
      const isAromatic = aromaticBondSet.has(idx);
      const displayOrder: BondOrder = isAromatic ? 1.5 : kekuleOrder;

      bonds.push({
        id: idx,
        from: b.atoms[0],
        to: b.atoms[1],
        order: displayOrder,
        isAromatic,
      });
      kekuleBondOrders.set(idx, kekuleOrder);
    });

    // Extract RDKit CoordGen coordinates if dim >= 2 and count matches atoms
    let rdkitCoords2D: { x: number; y: number }[] | undefined;
    const conf = ccMol.conformers?.[0];
    if (conf && conf.coords && conf.coords.length === atoms.length) {
      rdkitCoords2D = conf.coords.map((pt) => ({
        x: pt[0] ?? 0,
        y: pt[1] ?? 0,
      }));
    }

    const descriptors: RdkitDescriptors = {
      version: RDKit.version(),
      canonicalSmiles,
      inchi,
      inchiKey,
      sanitized,
      exactMw: Number.isFinite(rawDesc.exactmw) ? rawDesc.exactmw : 0,
      amw: Number.isFinite(rawDesc.amw) ? rawDesc.amw : 0,
      tpsa: Number.isFinite(rawDesc.tpsa) ? rawDesc.tpsa : 0,
      crippenLogP: Number.isFinite(rawDesc.CrippenClogP)
        ? rawDesc.CrippenClogP
        : 0,
      crippenMr: Number.isFinite(rawDesc.CrippenMR) ? rawDesc.CrippenMR : 0,
      hbd: Number.isFinite(rawDesc.NumHBD) ? rawDesc.NumHBD : 0,
      hba: Number.isFinite(rawDesc.NumHBA) ? rawDesc.NumHBA : 0,
      rotatableBonds: Number.isFinite(rawDesc.NumRotatableBonds)
        ? rawDesc.NumRotatableBonds
        : 0,
      numRings: Number.isFinite(rawDesc.NumRings)
        ? rawDesc.NumRings
        : atomRings.length,
      numAromaticRings: Number.isFinite(rawDesc.NumAromaticRings)
        ? rawDesc.NumAromaticRings
        : 0,
      fractionCsp3: Number.isFinite(rawDesc.FractionCSP3)
        ? rawDesc.FractionCSP3
        : 0,
      labuteAsa: Number.isFinite(rawDesc.labuteASA) ? rawDesc.labuteASA : 0,
      atomRings,
    };

    return {
      graph: {
        atoms,
        bonds,
        kekuleBondOrders,
        rdkitAtomRings: atomRings.length > 0 ? atomRings : undefined,
        rdkitCoords2D,
      },
      descriptors,
    };
  } finally {
    if (expandedMol) expandedMol.delete();
    if (baseMol) baseMol.delete();
    if (errorLog) errorLog.delete();
  }
}
