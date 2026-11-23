import { getElementInfo } from './elements';
import { BondOrder, ParsedAtom, ParsedBond } from './types';

export interface ParsedMoleculeGraph {
  atoms: ParsedAtom[];
  bonds: ParsedBond[];
  kekuleBondOrders: Map<number, 1 | 2 | 3>;
  rdkitAtomRings?: number[][];
  rdkitCoords2D?: { x: number; y: number }[];
}

const ORGANIC_SUBSET = new Set([
  'B',
  'C',
  'N',
  'O',
  'P',
  'S',
  'F',
  'Cl',
  'Br',
  'I',
]);

const AROMATIC_ORGANIC = new Set(['b', 'c', 'n', 'o', 'p', 's']);

function parseBracketAtom(
  content: string,
  id: number
): ParsedAtom {
  let idx = 0;
  let isotope: number | undefined;

  // Optional isotope
  const isoMatch = content.slice(idx).match(/^\d+/);
  if (isoMatch) {
    isotope = parseInt(isoMatch[0], 10);
    idx += isoMatch[0].length;
  }

  // Element symbol (1 or 2 chars)
  if (idx >= content.length) {
    throw new Error(`Invalid bracket atom [${content}]: missing element symbol`);
  }

  let rawSym = content[idx];
  const isAromatic = rawSym >= 'a' && rawSym <= 'z';
  idx += 1;
  if (
    idx < content.length &&
    content[idx] >= 'a' &&
    content[idx] <= 'z' &&
    !(rawSym === 'H' && content[idx] === 'e') && // wait: He IS two letters; check known 2-letter elements
    true
  ) {
    const twoChar =
      rawSym.toUpperCase() + content[idx].toLowerCase();
    // Distinguish e.g. [NH4+] vs [He] vs [Fe] vs [Cl-] vs [As] vs [Se] vs [Xe] vs [Si]
    const twoLetterElements = new Set([
      'He', 'Li', 'Be', 'Ne', 'Na', 'Mg', 'Al', 'Si', 'Cl', 'Ar', 'Ca',
      'Sc', 'Ti', 'Cr', 'Mn', 'Fe', 'Co', 'Ni', 'Cu', 'Zn', 'Ga', 'Ge',
      'As', 'Se', 'Br', 'Kr', 'Rb', 'Sr', 'Ag', 'Cd', 'In', 'Sn', 'Sb',
      'Te', 'Xe', 'Cs', 'Ba', 'Pt', 'Au', 'Hg', 'Pb', 'Bi',
    ]);
    if (twoLetterElements.has(twoChar)) {
      rawSym = content.slice(idx - 1, idx + 1);
      idx += 1;
    }
  }

  const symbol =
    rawSym.length === 1
      ? rawSym.toUpperCase()
      : rawSym[0].toUpperCase() + rawSym.slice(1).toLowerCase();

  // Optional chirality (@ or @@)
  while (idx < content.length && content[idx] === '@') {
    idx += 1;
  }

  // Optional explicit H count (H or H<digit>)
  let explicitHydrogens = 0;
  if (idx < content.length && content[idx] === 'H') {
    idx += 1;
    const hMatch = content.slice(idx).match(/^\d+/);
    if (hMatch) {
      explicitHydrogens = parseInt(hMatch[0], 10);
      idx += hMatch[0].length;
    } else {
      explicitHydrogens = 1;
    }
  }

  // Optional formal charge (+, -, +2, -2, ++, --)
  let formalCharge = 0;
  if (idx < content.length && (content[idx] === '+' || content[idx] === '-')) {
    const sign = content[idx] === '+' ? 1 : -1;
    idx += 1;
    const numMatch = content.slice(idx).match(/^\d+/);
    if (numMatch) {
      formalCharge = sign * parseInt(numMatch[0], 10);
      idx += numMatch[0].length;
    } else {
      let count = 1;
      while (idx < content.length && content[idx] === (sign > 0 ? '+' : '-')) {
        count += 1;
        idx += 1;
      }
      formalCharge = sign * count;
    }
  }

  // Optional atom class (:digits)
  let atomClass: number | undefined;
  if (idx < content.length && content[idx] === ':') {
    idx += 1;
    const clsMatch = content.slice(idx).match(/^\d+/);
    if (clsMatch) {
      atomClass = parseInt(clsMatch[0], 10);
      idx += clsMatch[0].length;
    }
  }

  if (idx < content.length) {
    throw new Error(
      `Unexpected characters "${content.slice(idx)}" in bracket atom [${content}]`
    );
  }

  const elem = getElementInfo(symbol);
  return {
    id,
    symbol: elem.symbol,
    atomicNumber: elem.atomicNumber,
    isAromatic,
    formalCharge,
    explicitHydrogens,
    isotope,
    atomClass,
  };
}

export function parseSmiles(rawSmiles: string): ParsedMoleculeGraph {
  const smiles = rawSmiles.trim();
  if (!smiles) {
    throw new Error('Please enter a SMILES string.');
  }

  const atoms: ParsedAtom[] = [];
  const bonds: ParsedBond[] = [];
  const bracketAtomSet = new Set<number>();
  const ringOpenings = new Map<
    string,
    { atomId: number; bondOrder: BondOrder | null; isAromaticBond: boolean }
  >();
  const branchStack: (number | null)[] = [];

  let prevAtomId: number | null = null;
  let pendingBondOrder: BondOrder | null = null;
  let pendingAromatic = false;

  const addBond = (
    fromId: number,
    toId: number,
    explicitOrder: BondOrder | null,
    explicitAromatic: boolean
  ) => {
    if (fromId === toId) {
      throw new Error('Self-loop bond is not valid.');
    }
    const existing = bonds.find(
      (b) =>
        (b.from === fromId && b.to === toId) ||
        (b.from === toId && b.to === fromId)
    );
    if (existing) return;

    const a1 = atoms[fromId];
    const a2 = atoms[toId];
    const bothAromatic = a1.isAromatic && a2.isAromatic;
    const isAromatic =
      explicitAromatic || (explicitOrder === null && bothAromatic);
    const order: BondOrder =
      explicitOrder !== null ? explicitOrder : isAromatic ? 1.5 : 1;

    bonds.push({
      id: bonds.length,
      from: fromId,
      to: toId,
      order,
      isAromatic,
    });
  };

  let i = 0;
  while (i < smiles.length) {
    const ch = smiles[i];

    // Whitespace ends SMILES if separated, or reject internal spaces
    if (/\s/.test(ch)) {
      throw new Error('SMILES strings cannot contain spaces.');
    }

    // Disconnected fragment
    if (ch === '.') {
      prevAtomId = null;
      pendingBondOrder = null;
      pendingAromatic = false;
      i += 1;
      continue;
    }

    // Branches
    if (ch === '(') {
      branchStack.push(prevAtomId);
      i += 1;
      continue;
    }
    if (ch === ')') {
      if (branchStack.length === 0) {
        throw new Error('Unmatched closing parenthesis ")" in SMILES.');
      }
      prevAtomId = branchStack.pop() ?? null;
      pendingBondOrder = null;
      pendingAromatic = false;
      i += 1;
      continue;
    }

    // Bond symbols
    if (ch === '-') {
      pendingBondOrder = 1;
      pendingAromatic = false;
      i += 1;
      continue;
    }
    if (ch === '=') {
      pendingBondOrder = 2;
      pendingAromatic = false;
      i += 1;
      continue;
    }
    if (ch === '#') {
      pendingBondOrder = 3;
      pendingAromatic = false;
      i += 1;
      continue;
    }
    if (ch === ':') {
      pendingBondOrder = 1.5;
      pendingAromatic = true;
      i += 1;
      continue;
    }
    if (ch === '/' || ch === '\\') {
      pendingBondOrder = 1;
      pendingAromatic = false;
      i += 1;
      continue;
    }

    // Ring closure (%nn or single digit)
    if (ch === '%' || (ch >= '0' && ch <= '9')) {
      if (prevAtomId === null) {
        throw new Error(`Ring closure "${ch}" must follow an atom.`);
      }
      let ringKey = ch;
      if (ch === '%') {
        const twoDigits = smiles.slice(i + 1, i + 3);
        if (!/^\d{2}$/.test(twoDigits)) {
          throw new Error('Invalid multi-digit ring closure after "%".');
        }
        ringKey = twoDigits;
        i += 3;
      } else {
        i += 1;
      }

      const open = ringOpenings.get(ringKey);
      if (!open) {
        ringOpenings.set(ringKey, {
          atomId: prevAtomId,
          bondOrder: pendingBondOrder,
          isAromaticBond: pendingAromatic,
        });
      } else {
        const resolvedOrder = pendingBondOrder ?? open.bondOrder;
        const resolvedArom = pendingAromatic || open.isAromaticBond;
        addBond(open.atomId, prevAtomId, resolvedOrder, resolvedArom);
        ringOpenings.delete(ringKey);
      }
      pendingBondOrder = null;
      pendingAromatic = false;
      continue;
    }

    // Bracket atom
    if (ch === '[') {
      const closeIdx = smiles.indexOf(']', i + 1);
      if (closeIdx === -1) {
        throw new Error('Unclosed "[" bracket atom in SMILES.');
      }
      const content = smiles.slice(i + 1, closeIdx);
      const atomId = atoms.length;
      const atom = parseBracketAtom(content, atomId);
      atoms.push(atom);
      bracketAtomSet.add(atomId);
      if (prevAtomId !== null) {
        addBond(prevAtomId, atomId, pendingBondOrder, pendingAromatic);
      }
      prevAtomId = atomId;
      pendingBondOrder = null;
      pendingAromatic = false;
      i = closeIdx + 1;
      continue;
    }

    // Two-letter organic subset: Cl, Br
    const two = smiles.slice(i, i + 2);
    if (two === 'Cl' || two === 'Br') {
      const elem = getElementInfo(two);
      const atomId = atoms.length;
      atoms.push({
        id: atomId,
        symbol: elem.symbol,
        atomicNumber: elem.atomicNumber,
        isAromatic: false,
        formalCharge: 0,
        explicitHydrogens: 0,
      });
      if (prevAtomId !== null) {
        addBond(prevAtomId, atomId, pendingBondOrder, pendingAromatic);
      }
      prevAtomId = atomId;
      pendingBondOrder = null;
      pendingAromatic = false;
      i += 2;
      continue;
    }

    // Single-letter organic subset or aromatic atom
    if (ORGANIC_SUBSET.has(ch) || AROMATIC_ORGANIC.has(ch)) {
      const isArom = AROMATIC_ORGANIC.has(ch);
      const elem = getElementInfo(ch.toUpperCase());
      const atomId = atoms.length;
      atoms.push({
        id: atomId,
        symbol: elem.symbol,
        atomicNumber: elem.atomicNumber,
        isAromatic: isArom,
        formalCharge: 0,
        explicitHydrogens: 0,
      });
      if (prevAtomId !== null) {
        addBond(prevAtomId, atomId, pendingBondOrder, pendingAromatic);
      }
      prevAtomId = atomId;
      pendingBondOrder = null;
      pendingAromatic = false;
      i += 1;
      continue;
    }

    throw new Error(`Unsupported or unexpected SMILES token "${ch}" at position ${i + 1}.`);
  }

  if (branchStack.length > 0) {
    throw new Error('Unclosed "(" branch parenthesis in SMILES.');
  }
  if (ringOpenings.size > 0) {
    const keys = Array.from(ringOpenings.keys()).join(', ');
    throw new Error(`Unclosed ring closure(s): ${keys}.`);
  }
  if (atoms.length === 0) {
    throw new Error('No atoms found in SMILES.');
  }

  // Build adjacency for Kekulization & implicit H calculation
  const atomBonds = new Map<number, ParsedBond[]>();
  for (const a of atoms) atomBonds.set(a.id, []);
  for (const b of bonds) {
    atomBonds.get(b.from)!.push(b);
    atomBonds.get(b.to)!.push(b);
  }

  // Kekulize aromatic bonds so exact electron-pair bond orders (1 or 2) are known
  const kekuleBondOrders = new Map<number, 1 | 2 | 3>();
  for (const b of bonds) {
    if (b.order === 3) kekuleBondOrders.set(b.id, 3);
    else if (b.order === 2) kekuleBondOrders.set(b.id, 2);
    else kekuleBondOrders.set(b.id, 1);
  }

  // Determine which aromatic atoms participate in an aromatic pi-bond (Kekule double bond)
  const aromaticNeedsPi = new Set<number>();
  for (const a of atoms) {
    if (!a.isAromatic) continue;
    const adj = atomBonds.get(a.id)!;
    const hasExocyclicDouble = adj.some((b) => !b.isAromatic && b.order === 2);
    const totalExplicitSigma = adj.length + a.explicitHydrogens;

    if (a.symbol === 'C') {
      if (!hasExocyclicDouble && totalExplicitSigma <= 3) {
        aromaticNeedsPi.add(a.id);
      }
    } else if (a.symbol === 'N') {
      // Pyridine-like N (degree 2, no explicit H, charge 0) needs a pi bond; pyrrole [nH] (degree 3) does not
      if (!hasExocyclicDouble && a.explicitHydrogens === 0 && adj.length === 2 && a.formalCharge === 0) {
        aromaticNeedsPi.add(a.id);
      } else if (a.formalCharge === 1 && !hasExocyclicDouble && adj.length + a.explicitHydrogens === 3) {
        aromaticNeedsPi.add(a.id);
      }
    } else if (a.symbol === 'P' || a.symbol === 'As') {
      if (!hasExocyclicDouble && a.explicitHydrogens === 0 && adj.length === 2) {
        aromaticNeedsPi.add(a.id);
      }
    }
    // O, S, Se in aromatic rings donate a lone pair and stay single-bonded in Kekule form
  }

  // Maximum matching over aromatic bonds between atoms in aromaticNeedsPi
  const matchAdj = new Map<number, { neighbor: number; bondId: number }[]>();
  for (const id of aromaticNeedsPi) matchAdj.set(id, []);
  for (const b of bonds) {
    if (b.isAromatic && aromaticNeedsPi.has(b.from) && aromaticNeedsPi.has(b.to)) {
      matchAdj.get(b.from)!.push({ neighbor: b.to, bondId: b.id });
      matchAdj.get(b.to)!.push({ neighbor: b.from, bondId: b.id });
    }
  }

  const mate = new Map<number, number>();
  const mateBond = new Map<number, number>();

  // Greedy initial pass
  for (const u of aromaticNeedsPi) {
    if (mate.has(u)) continue;
    for (const edge of matchAdj.get(u)!) {
      if (!mate.has(edge.neighbor)) {
        mate.set(u, edge.neighbor);
        mate.set(edge.neighbor, u);
        mateBond.set(u, edge.bondId);
        mateBond.set(edge.neighbor, edge.bondId);
        break;
      }
    }
  }

  // Augmenting alternating-path search for any remaining unmatched aromatic atoms
  const findAugmenting = (start: number) => {
    const visited = new Set<number>([start]);
    const dfs = (u: number): boolean => {
      for (const edge of matchAdj.get(u)!) {
        const v = edge.neighbor;
        if (visited.has(v)) continue;
        visited.add(v);
        if (!mate.has(v)) {
          mate.set(u, v);
          mate.set(v, u);
          mateBond.set(u, edge.bondId);
          mateBond.set(v, edge.bondId);
          return true;
        }
        const w = mate.get(v)!;
        if (!visited.has(w)) {
          visited.add(w);
          const oldBond = mateBond.get(v)!;
          if (dfs(w)) {
            mate.set(u, v);
            mate.set(v, u);
            mateBond.set(u, edge.bondId);
            mateBond.set(v, edge.bondId);
            return true;
          } else {
            // restore if needed
            mateBond.set(v, oldBond);
          }
        }
      }
      return false;
    };
    dfs(start);
  };

  for (const u of aromaticNeedsPi) {
    if (!mate.has(u)) {
      findAugmenting(u);
    }
  }

  for (const bondId of mateBond.values()) {
    kekuleBondOrders.set(bondId, 2);
  }

  // Expand implicit and bracket-explicit hydrogens into explicit H atom nodes
  const originalAtomCount = atoms.length;
  for (let idx = 0; idx < originalAtomCount; idx++) {
    const atom = atoms[idx];
    const adj = atomBonds.get(atom.id)!;
    let kekuleSum = 0;
    for (const b of adj) {
      kekuleSum += kekuleBondOrders.get(b.id) ?? 1;
    }

    let hToAdd = 0;
    if (bracketAtomSet.has(atom.id)) {
      // Bracket atom: only add explicitly specified H count (unless it's [H] itself)
      hToAdd = atom.symbol === 'H' ? 0 : atom.explicitHydrogens;
    } else {
      // Organic subset atom: fill to lowest standard valence >= kekuleSum
      const elem = getElementInfo(atom.symbol);
      if (atom.isAromatic) {
        const targetValence = elem.smilesValences[0] ?? 4;
        hToAdd = Math.max(0, targetValence - kekuleSum);
      } else {
        const matchingValence =
          elem.smilesValences.find((v) => v >= kekuleSum) ??
          elem.smilesValences[elem.smilesValences.length - 1] ??
          kekuleSum;
        hToAdd = Math.max(0, matchingValence - kekuleSum);
      }
    }

    // Add explicit H atoms and single bonds
    for (let h = 0; h < hToAdd; h++) {
      const hId = atoms.length;
      const hInfo = getElementInfo('H');
      atoms.push({
        id: hId,
        symbol: 'H',
        atomicNumber: hInfo.atomicNumber,
        isAromatic: false,
        formalCharge: 0,
        explicitHydrogens: 0,
        isImplicitH: true,
      });
      const bId = bonds.length;
      bonds.push({
        id: bId,
        from: atom.id,
        to: hId,
        order: 1,
        isAromatic: false,
      });
      kekuleBondOrders.set(bId, 1);
    }
  }

  return { atoms, bonds, kekuleBondOrders };
}
