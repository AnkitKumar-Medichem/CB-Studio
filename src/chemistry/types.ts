export type BondOrder = 1 | 2 | 3 | 1.5;

export interface ParsedAtom {
  id: number;
  symbol: string;
  atomicNumber: number;
  isAromatic: boolean;
  formalCharge: number;
  explicitHydrogens: number;
  isotope?: number;
  atomClass?: number;
  isImplicitH?: boolean;
}

export interface ParsedBond {
  id: number;
  from: number;
  to: number;
  order: BondOrder;
  isAromatic: boolean;
}

export type HybridizationType =
  | 's'
  | 'sp'
  | 'sp²'
  | 'sp³'
  | 'sp³d'
  | 'sp³d²'
  | 'sp³d³'
  | 'unhybridized';

export type ElectronGeometryType =
  | 'Terminal'
  | 'Linear'
  | 'Trigonal Planar'
  | 'Tetrahedral'
  | 'Trigonal Bipyramidal'
  | 'Octahedral'
  | 'Pentagonal Bipyramidal';

export type MolecularGeometryType =
  | 'Terminal'
  | 'Linear'
  | 'Bent'
  | 'Trigonal Planar'
  | 'Tetrahedral'
  | 'Trigonal Pyramidal'
  | 'Trigonal Bipyramidal'
  | 'Seesaw'
  | 'T-Shaped'
  | 'Octahedral'
  | 'Square Pyramidal'
  | 'Square Planar'
  | 'Pentagonal Bipyramidal'
  | 'Pentagonal Pyramidal'
  | 'Pentagonal Planar';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface LonePairOrbital {
  direction: Vec3;
  orbitalType: 'localized' | 'pi-delocalized';
  label: string;
}

export interface HybridOrbitalLobe {
  direction: Vec3;
  kind: 'bonding' | 'lone-pair';
  label: string;
}

export interface MeasuredBondAngle {
  atomA: number;
  center: number;
  atomB: number;
  labelA: string;
  labelB: string;
  angleDeg: number;
  idealAngleDeg: number;
}

export interface AnalyzedAtom extends ParsedAtom {
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
  position: Vec3;
  lonePairOrbitals: LonePairOrbital[];
  hybridOrbitals: HybridOrbitalLobe[];
  vseprCageVertices: Vec3[];
  measuredAngles: MeasuredBondAngle[];
  neighborIds: number[];
}

export interface RdkitDescriptors {
  version: string;
  canonicalSmiles: string;
  inchi: string;
  inchiKey: string;
  sanitized: boolean;
  exactMw: number;
  amw: number;
  tpsa: number;
  crippenLogP: number;
  crippenMr: number;
  hbd: number;
  hba: number;
  rotatableBonds: number;
  numRings: number;
  numAromaticRings: number;
  fractionCsp3: number;
  labuteAsa: number;
  atomRings: number[][];
}

export interface MoleculeSummary {
  smiles: string;
  formula: string;
  molecularWeight: number;
  totalAtoms: number;
  heavyAtomCount: number;
  totalBonds: number;
  totalLonePairs: number;
  totalValenceElectrons: number;
  netFormalCharge: number;
  primaryCenterId: number | null;
  hybridizationsPresent: HybridizationType[];
  rdkit?: RdkitDescriptors;
}

export interface MoleculeModel {
  atoms: AnalyzedAtom[];
  bonds: ParsedBond[];
  summary: MoleculeSummary;
  name?: string;
  notes?: string;
}

export interface MoleculePreset {
  id: string;
  name: string;
  formula: string;
  smiles: string;
  category:
    | 'Linear & Trigonal'
    | 'Tetrahedral Family'
    | 'Trigonal Bipyramidal'
    | 'Octahedral Family'
    | 'Organic & Aromatic';
  axNotation: string;
  hybridization: string;
  lonePairsNote: string;
  description: string;
}
