import { getElementInfo } from './elements';
import { ParsedMoleculeGraph } from './smilesParser';
import {
  ElectronGeometryType,
  HybridizationType,
  MolecularGeometryType,
  ParsedAtom,
  ParsedBond,
} from './types';

export interface AtomVseprAnalysis {
  atom: ParsedAtom;
  name: string;
  cpkColor: string;
  covalentRadius: number;
  vdwRadius: number;
  valenceElectrons: number;
  bondOrderSum: number;
  sigmaBonds: number;
  piBonds: number;
  lonePairs: number;
  localizedLonePairs: number;
  delocalizedLonePairs: number;
  unpairedElectrons: number;
  stericNumber: number;
  hybridization: HybridizationType;
  electronGeometry: ElectronGeometryType;
  molecularGeometry: MolecularGeometryType;
  axNotation: string;
  idealAngleLabel: string;
  orbitalSummary: string;
  neighborIds: number[];
}

export function getElectronGeometry(stericNumber: number): ElectronGeometryType {
  switch (stericNumber) {
    case 1:
      return 'Terminal';
    case 2:
      return 'Linear';
    case 3:
      return 'Trigonal Planar';
    case 4:
      return 'Tetrahedral';
    case 5:
      return 'Trigonal Bipyramidal';
    case 6:
      return 'Octahedral';
    case 7:
      return 'Pentagonal Bipyramidal';
    default:
      return 'Tetrahedral';
  }
}

export function getHybridization(
  symbol: string,
  stericNumber: number,
  sigmaBonds: number,
  lonePairs: number
): HybridizationType {
  if (symbol === 'H' || symbol === 'He') {
    return 's';
  }
  if (stericNumber <= 1) {
    return 'unhybridized';
  }
  // Terminal monovalent halogen (e.g. -F, -Cl, -Br, -I with 1 sigma bond and 3 lone pairs)
  // In strict orbital theory, terminal halogens can be viewed as sp3 (or unhybridized p).
  // Reporting sp3 for SN=4 keeps steric-number consistency crystal clear for VSEPR learners.
  if (sigmaBonds === 0 && lonePairs > 0) {
    return 'unhybridized';
  }
  switch (stericNumber) {
    case 2:
      return 'sp';
    case 3:
      return 'sp²';
    case 4:
      return 'sp³';
    case 5:
      return 'sp³d';
    case 6:
      return 'sp³d²';
    case 7:
      return 'sp³d³';
    default:
      return 'sp³d²';
  }
}

export function getMolecularGeometryAndAngle(
  stericNumber: number,
  sigmaBonds: number,
  localizedLonePairs: number
): { shape: MolecularGeometryType; angleLabel: string } {
  if (sigmaBonds <= 1) {
    return {
      shape: sigmaBonds === 1 ? 'Terminal' : 'Terminal',
      angleLabel: '—',
    };
  }

  // Exact VSEPR AXmEn table
  if (stericNumber === 2) {
    return { shape: 'Linear', angleLabel: '180°' };
  }
  if (stericNumber === 3) {
    if (localizedLonePairs === 0) {
      return { shape: 'Trigonal Planar', angleLabel: '120°' };
    }
    return { shape: 'Bent', angleLabel: '~118° (<120°)' };
  }
  if (stericNumber === 4) {
    if (localizedLonePairs === 0) {
      return { shape: 'Tetrahedral', angleLabel: '109.5°' };
    }
    if (localizedLonePairs === 1) {
      return { shape: 'Trigonal Pyramidal', angleLabel: '~107° (<109.5°)' };
    }
    return { shape: 'Bent', angleLabel: '~104.5° (<109.5°)' };
  }
  if (stericNumber === 5) {
    if (localizedLonePairs === 0) {
      return { shape: 'Trigonal Bipyramidal', angleLabel: '90° · 120° · 180°' };
    }
    if (localizedLonePairs === 1) {
      return { shape: 'Seesaw', angleLabel: '~86.5° · ~101.5° · ~173°' };
    }
    if (localizedLonePairs === 2) {
      return { shape: 'T-Shaped', angleLabel: '~87.5° · ~175°' };
    }
    return { shape: 'Linear', angleLabel: '180°' };
  }
  if (stericNumber === 6) {
    if (localizedLonePairs === 0) {
      return { shape: 'Octahedral', angleLabel: '90° · 180°' };
    }
    if (localizedLonePairs === 1) {
      return { shape: 'Square Pyramidal', angleLabel: '~84.8° · 90°' };
    }
    if (localizedLonePairs === 2) {
      return { shape: 'Square Planar', angleLabel: '90° · 180°' };
    }
    if (localizedLonePairs === 3) {
      return { shape: 'T-Shaped', angleLabel: '90° · 180°' };
    }
    return { shape: 'Linear', angleLabel: '180°' };
  }
  if (stericNumber === 7) {
    if (localizedLonePairs === 0) {
      return { shape: 'Pentagonal Bipyramidal', angleLabel: '72° · 90°' };
    }
    if (localizedLonePairs === 1) {
      return { shape: 'Pentagonal Pyramidal', angleLabel: '~72° · ~90°' };
    }
    return { shape: 'Pentagonal Planar', angleLabel: '72°' };
  }

  return { shape: 'Tetrahedral', angleLabel: '109.5°' };
}

export function analyzeVsepr(graph: ParsedMoleculeGraph): AtomVseprAnalysis[] {
  const { atoms, bonds, kekuleBondOrders } = graph;

  const adjMap = new Map<number, { bond: ParsedBond; neighborId: number }[]>();
  for (const a of atoms) adjMap.set(a.id, []);
  for (const b of bonds) {
    adjMap.get(b.from)!.push({ bond: b, neighborId: b.to });
    adjMap.get(b.to)!.push({ bond: b, neighborId: b.from });
  }

  // First pass: bond order sums & raw lone pairs
  const rawStats = atoms.map((atom) => {
    const elem = getElementInfo(atom.symbol);
    const adj = adjMap.get(atom.id)!;
    const sigmaBonds = adj.length;

    let bondOrderSum = 0;
    let piBonds = 0;
    for (const { bond } of adj) {
      const kOrder = kekuleBondOrders.get(bond.id) ?? 1;
      bondOrderSum += kOrder;
      if (kOrder > 1) {
        piBonds += kOrder - 1;
      }
    }

    const effectiveValence = Math.max(0, elem.valenceElectrons - atom.formalCharge);
    const nonBondingElectrons = Math.max(0, effectiveValence - bondOrderSum);
    const lonePairs = Math.floor(nonBondingElectrons / 2);
    const unpairedElectrons = nonBondingElectrons % 2;

    return {
      atom,
      elem,
      adj,
      sigmaBonds,
      piBonds,
      bondOrderSum,
      lonePairs,
      unpairedElectrons,
    };
  });

  // Second pass: resonance delocalization check for lone pairs adjacent to pi systems
  // (e.g., pyrrole [nH]1cccc1, furan o1cccc1, amide N in CC(=O)N, ester/acid O in CC(=O)O, aniline Nc1ccccc1)
  return rawStats.map((stat) => {
    const {
      atom,
      elem,
      adj,
      sigmaBonds,
      piBonds,
      bondOrderSum,
      lonePairs,
      unpairedElectrons,
    } = stat;

    let delocalizedLonePairs = 0;
    if (lonePairs > 0 && atom.symbol !== 'H' && sigmaBonds >= 2) {
      const isSecondRowOrP =
        atom.symbol === 'N' ||
        atom.symbol === 'O' ||
        atom.symbol === 'S' ||
        atom.symbol === 'C';

      if (atom.isAromatic && piBonds === 0 && isSecondRowOrP) {
        // Pyrrole N, furan O, thiophene S: one lone pair is part of the aromatic 6-pi sextet (p orbital)
        delocalizedLonePairs = 1;
      } else if (piBonds === 0 && isSecondRowOrP && (atom.symbol === 'N' || atom.symbol === 'O')) {
        // Check if bonded to an sp2 / pi-bonded atom (e.g., C=O, C=N, aromatic C)
        const adjacentToPiSystem = adj.some(({ neighborId }) => {
          const nb = rawStats[neighborId];
          return nb.piBonds > 0 || nb.atom.isAromatic;
        });
        if (adjacentToPiSystem && (atom.symbol === 'N' || (atom.symbol === 'O' && sigmaBonds === 2))) {
          delocalizedLonePairs = 1;
        }
      }
    }

    const localizedLonePairs = Math.max(0, lonePairs - delocalizedLonePairs);
    const stericNumber =
      atom.symbol === 'H'
        ? 1
        : sigmaBonds + localizedLonePairs + (unpairedElectrons > 0 && sigmaBonds <= 3 ? 1 : 0);

    const hybridization = getHybridization(
      atom.symbol,
      stericNumber,
      sigmaBonds,
      localizedLonePairs
    );
    const electronGeometry = getElectronGeometry(stericNumber);
    const { shape: molecularGeometry, angleLabel: idealAngleLabel } =
      getMolecularGeometryAndAngle(stericNumber, sigmaBonds, localizedLonePairs);

    const axNotation =
      sigmaBonds === 0
        ? 'A'
        : localizedLonePairs === 0
        ? `AX${toSubscript(sigmaBonds)}`
        : `AX${toSubscript(sigmaBonds)}E${toSubscript(localizedLonePairs)}`;

    const lpText =
      delocalizedLonePairs > 0
        ? `${lonePairs} lone pair${lonePairs === 1 ? '' : 's'} (${delocalizedLonePairs} conjugated in π)`
        : `${lonePairs} lone pair${lonePairs === 1 ? '' : 's'}`;

    const orbitalSummary = `${sigmaBonds} σ bond${sigmaBonds === 1 ? '' : 's'} · ${piBonds} π bond${
      piBonds === 1 ? '' : 's'
    } · ${lpText}`;

    return {
      atom,
      name: elem.name,
      cpkColor: elem.cpkColor,
      covalentRadius: elem.covalentRadius,
      vdwRadius: elem.vdwRadius,
      valenceElectrons: elem.valenceElectrons,
      bondOrderSum,
      sigmaBonds,
      piBonds,
      lonePairs,
      localizedLonePairs,
      delocalizedLonePairs,
      unpairedElectrons,
      stericNumber,
      hybridization,
      electronGeometry,
      molecularGeometry,
      axNotation,
      idealAngleLabel,
      orbitalSummary,
      neighborIds: adj.map((item) => item.neighborId),
    };
  });
}

function toSubscript(n: number): string {
  const map: Record<string, string> = {
    '0': '₀',
    '1': '₁',
    '2': '₂',
    '3': '₃',
    '4': '₄',
    '5': '₅',
    '6': '₆',
    '7': '₇',
    '8': '₈',
    '9': '₉',
  };
  return String(n)
    .split('')
    .map((d) => map[d] ?? d)
    .join('');
}
