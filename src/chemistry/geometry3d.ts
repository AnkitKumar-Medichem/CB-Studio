import { getElementInfo } from './elements';
import { parseAndCalculateWithRDKit } from './rdkitEngine';
import { ParsedMoleculeGraph, parseSmiles } from './smilesParser';
import {
  AnalyzedAtom,
  BondOrder,
  HybridOrbitalLobe,
  LonePairOrbital,
  MeasuredBondAngle,
  MoleculeModel,
  ParsedBond,
  RdkitDescriptors,
  Vec3,
} from './types';
import { analyzeVsepr, AtomVseprAnalysis } from './vsepr';

// Vector math helpers (pure, allocation-light)
function v3(x = 0, y = 0, z = 0): Vec3 {
  return { x, y, z };
}
function add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}
function sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}
function scale(a: Vec3, s: number): Vec3 {
  return { x: a.x * s, y: a.y * s, z: a.z * s };
}
function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}
function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}
function len(a: Vec3): number {
  return Math.hypot(a.x, a.y, a.z);
}
function normalize(a: Vec3): Vec3 {
  const l = len(a);
  if (l < 1e-8) return { x: 0, y: 1, z: 0 };
  return { x: a.x / l, y: a.y / l, z: a.z / l };
}

function anyPerp(u: Vec3): Vec3 {
  const ref = Math.abs(u.y) < 0.85 ? v3(0, 1, 0) : v3(1, 0, 0);
  return normalize(cross(u, ref));
}

function rotateAroundAxis(vec: Vec3, axis: Vec3, angleRad: number): Vec3 {
  const k = normalize(axis);
  const cosA = Math.cos(angleRad);
  const sinA = Math.sin(angleRad);
  const kDotV = dot(k, vec);
  const kCrossV = cross(k, vec);
  return {
    x: vec.x * cosA + kCrossV.x * sinA + k.x * kDotV * (1 - cosA),
    y: vec.y * cosA + kCrossV.y * sinA + k.y * kDotV * (1 - cosA),
    z: vec.z * cosA + kCrossV.z * sinA + k.z * kDotV * (1 - cosA),
  };
}

function getIdealBondLength(
  rA: number,
  rB: number,
  order: BondOrder,
  isAromatic: boolean
): number {
  const base = Math.max(0.85, rA + rB);
  if (order === 3) return base * 0.79;
  if (order === 2) return base * 0.87;
  if (isAromatic || order === 1.5) return base * 0.91;
  return base;
}

interface VseprTemplate {
  bondDirs: Vec3[];
  lpDirs: Vec3[];
}

function getVseprTemplate(
  stericNumber: number,
  sigmaBonds: number,
  localizedLp: number
): VseprTemplate {
  const deg = (d: number) => (d * Math.PI) / 180;

  if (stericNumber <= 1) {
    return {
      bondDirs: sigmaBonds > 0 ? [v3(1, 0, 0)] : [],
      lpDirs: [],
    };
  }

  if (stericNumber === 2) {
    const all = [v3(1, 0, 0), v3(-1, 0, 0)];
    return {
      bondDirs: all.slice(0, sigmaBonds),
      lpDirs: all.slice(sigmaBonds, sigmaBonds + localizedLp),
    };
  }

  if (stericNumber === 3) {
    if (localizedLp === 1 && sigmaBonds === 2) {
      // Bent ~118°
      const half = deg(59);
      return {
        bondDirs: [
          v3(Math.sin(half), -Math.cos(half), 0),
          v3(-Math.sin(half), -Math.cos(half), 0),
        ],
        lpDirs: [v3(0, 1, 0)],
      };
    }
    const all = [0, 120, 240].map((a) =>
      v3(Math.cos(deg(a)), Math.sin(deg(a)), 0)
    );
    return {
      bondDirs: all.slice(0, sigmaBonds),
      lpDirs: all.slice(sigmaBonds, sigmaBonds + localizedLp),
    };
  }

  if (stericNumber === 4) {
    if (localizedLp === 1 && sigmaBonds === 3) {
      // Trigonal pyramidal ~107°
      const sinAlpha = Math.sqrt((2 * (1 - Math.cos(deg(107)))) / 3);
      const cosAlpha = Math.sqrt(1 - sinAlpha * sinAlpha);
      return {
        bondDirs: [0, 120, 240].map((az) =>
          v3(
            sinAlpha * Math.cos(deg(az)),
            -cosAlpha,
            sinAlpha * Math.sin(deg(az))
          )
        ),
        lpDirs: [v3(0, 1, 0)],
      };
    }
    if (localizedLp === 2 && sigmaBonds === 2) {
      // Bent ~104.5°
      const halfBond = deg(52.25);
      const halfLp = deg(54.735);
      return {
        bondDirs: [
          v3(Math.sin(halfBond), -Math.cos(halfBond), 0),
          v3(-Math.sin(halfBond), -Math.cos(halfBond), 0),
        ],
        lpDirs: [
          v3(0, Math.cos(halfLp), Math.sin(halfLp)),
          v3(0, Math.cos(halfLp), -Math.sin(halfLp)),
        ],
      };
    }
    // Ideal tetrahedral (109.47°)
    const s = 1 / Math.sqrt(3);
    const tet = [
      normalize(v3(s, s, s)),
      normalize(v3(s, -s, -s)),
      normalize(v3(-s, s, -s)),
      normalize(v3(-s, -s, s)),
    ];
    return {
      bondDirs: tet.slice(0, sigmaBonds),
      lpDirs: tet.slice(sigmaBonds, sigmaBonds + localizedLp),
    };
  }

  if (stericNumber === 5) {
    if (localizedLp === 0) {
      return {
        bondDirs: [
          v3(0, 1, 0),
          v3(0, -1, 0),
          v3(1, 0, 0),
          v3(-0.5, 0, Math.sqrt(3) / 2),
          v3(-0.5, 0, -Math.sqrt(3) / 2),
        ],
        lpDirs: [],
      };
    }
    if (localizedLp === 1 && sigmaBonds === 4) {
      // Seesaw: LP along +X, eq bonds ~101.5°, ax bonds ~173° tilted away from +X
      const eqHalf = deg(50.75);
      const axTilt = deg(3.5);
      return {
        bondDirs: [
          v3(-Math.sin(axTilt), Math.cos(axTilt), 0),
          v3(-Math.sin(axTilt), -Math.cos(axTilt), 0),
          v3(-Math.cos(eqHalf), 0, Math.sin(eqHalf)),
          v3(-Math.cos(eqHalf), 0, -Math.sin(eqHalf)),
        ],
        lpDirs: [v3(1, 0, 0)],
      };
    }
    if (localizedLp === 2 && sigmaBonds === 3) {
      // T-Shaped: 2 eq LP at ±60° from +X, 1 eq bond at -X, 2 ax bonds tilted 2.5° toward -X
      const tilt = deg(2.5);
      return {
        bondDirs: [
          v3(-Math.sin(tilt), Math.cos(tilt), 0),
          v3(-Math.sin(tilt), -Math.cos(tilt), 0),
          v3(-1, 0, 0),
        ],
        lpDirs: [
          v3(0.5, 0, Math.sqrt(3) / 2),
          v3(0.5, 0, -Math.sqrt(3) / 2),
        ],
      };
    }
    if (localizedLp === 3 && sigmaBonds === 2) {
      // Linear (AX2E3): 2 axial bonds, 3 equatorial LPs
      return {
        bondDirs: [v3(0, 1, 0), v3(0, -1, 0)],
        lpDirs: [
          v3(1, 0, 0),
          v3(-0.5, 0, Math.sqrt(3) / 2),
          v3(-0.5, 0, -Math.sqrt(3) / 2),
        ],
      };
    }
    const all5 = [
      v3(0, 1, 0),
      v3(0, -1, 0),
      v3(1, 0, 0),
      v3(-0.5, 0, Math.sqrt(3) / 2),
      v3(-0.5, 0, -Math.sqrt(3) / 2),
    ];
    return {
      bondDirs: all5.slice(0, sigmaBonds),
      lpDirs: all5.slice(sigmaBonds, sigmaBonds + localizedLp),
    };
  }

  if (stericNumber === 6) {
    if (localizedLp === 1 && sigmaBonds === 5) {
      // Square pyramidal: LP along -Y, axial +Y, 4 basal tilted upward by 5.2°
      const tilt = deg(5.2);
      const c = Math.cos(tilt);
      const s = Math.sin(tilt);
      return {
        bondDirs: [
          v3(0, 1, 0),
          v3(c, s, 0),
          v3(-c, s, 0),
          v3(0, s, c),
          v3(0, s, -c),
        ],
        lpDirs: [v3(0, -1, 0)],
      };
    }
    if (localizedLp === 2 && sigmaBonds === 4) {
      // Square planar: LPs trans along ±Y
      return {
        bondDirs: [v3(1, 0, 0), v3(-1, 0, 0), v3(0, 0, 1), v3(0, 0, -1)],
        lpDirs: [v3(0, 1, 0), v3(0, -1, 0)],
      };
    }
    if (localizedLp === 3 && sigmaBonds === 3) {
      return {
        bondDirs: [v3(1, 0, 0), v3(-1, 0, 0), v3(0, 0, -1)],
        lpDirs: [v3(0, 1, 0), v3(0, -1, 0), v3(0, 0, 1)],
      };
    }
    const oct = [
      v3(1, 0, 0),
      v3(-1, 0, 0),
      v3(0, 1, 0),
      v3(0, -1, 0),
      v3(0, 0, 1),
      v3(0, 0, -1),
    ];
    return {
      bondDirs: oct.slice(0, sigmaBonds),
      lpDirs: oct.slice(sigmaBonds, sigmaBonds + localizedLp),
    };
  }

  // Steric number 7: Pentagonal bipyramidal
  const pentEq = [0, 72, 144, 216, 288].map((a) =>
    v3(Math.cos(deg(a)), 0, Math.sin(deg(a)))
  );
  if (localizedLp === 1) {
    return {
      bondDirs: [v3(0, 1, 0), ...pentEq],
      lpDirs: [v3(0, -1, 0)],
    };
  }
  if (localizedLp === 2) {
    return {
      bondDirs: pentEq,
      lpDirs: [v3(0, 1, 0), v3(0, -1, 0)],
    };
  }
  const all7 = [v3(0, 1, 0), v3(0, -1, 0), ...pentEq];
  return {
    bondDirs: all7.slice(0, sigmaBonds),
    lpDirs: all7.slice(sigmaBonds, sigmaBonds + localizedLp),
  };
}

// Compute quaternion-like rotation aligning vector `from` to `to`
function alignDirection(vec: Vec3, fromDir: Vec3, toDir: Vec3): Vec3 {
  const f = normalize(fromDir);
  const t = normalize(toDir);
  const d = dot(f, t);
  if (d > 0.9999) return vec;
  if (d < -0.9999) {
    const axis = anyPerp(f);
    return rotateAroundAxis(vec, axis, Math.PI);
  }
  const axis = normalize(cross(f, t));
  const angle = Math.acos(Math.max(-1, Math.min(1, d)));
  return rotateAroundAxis(vec, axis, angle);
}

// Use RDKit SSSR atomRings when available; otherwise fall back to shortest-cycle detection
function analyzeRings(
  atomCount: number,
  bonds: ParsedBond[],
  rdkitAtomRings?: number[][]
): { ringAtoms: Set<number>; cycles: number[][] } {
  if (rdkitAtomRings && rdkitAtomRings.length > 0) {
    const ringAtoms = new Set<number>();
    const cycles = rdkitAtomRings.map((ring) => {
      for (const id of ring) ringAtoms.add(id);
      return [...ring];
    });
    cycles.sort((a, b) => a.length - b.length);
    return { ringAtoms, cycles };
  }

  const adj = Array.from({ length: atomCount }, () => [] as number[]);
  for (const b of bonds) {
    adj[b.from].push(b.to);
    adj[b.to].push(b.from);
  }
  const ringAtoms = new Set<number>();
  const seenCycleKeys = new Set<string>();
  const cycles: number[][] = [];

  for (const b of bonds) {
    const start = b.from;
    const goal = b.to;
    const dist = new Int32Array(atomCount).fill(-1);
    const parent = new Int32Array(atomCount).fill(-1);
    const q: number[] = [start];
    dist[start] = 0;

    let found = false;
    while (q.length > 0 && !found) {
      const curr = q.shift()!;
      if (dist[curr] >= 8) continue;
      for (const nxt of adj[curr]) {
        if ((curr === start && nxt === goal) || (curr === goal && nxt === start)) {
          continue;
        }
        if (dist[nxt] === -1) {
          dist[nxt] = dist[curr] + 1;
          parent[nxt] = curr;
          if (nxt === goal) {
            found = true;
            break;
          }
          q.push(nxt);
        }
      }
    }

    if (found) {
      const cycle: number[] = [];
      let cur = goal;
      while (cur !== -1) {
        ringAtoms.add(cur);
        cycle.push(cur);
        cur = parent[cur];
      }
      const key = [...cycle].sort((a, b) => a - b).join('-');
      if (!seenCycleKeys.has(key) && cycle.length >= 3 && cycle.length <= 8) {
        seenCycleKeys.add(key);
        cycles.push(cycle);
      }
    }
  }
  cycles.sort((a, b) => a.length - b.length);
  return { ringAtoms, cycles };
}

interface AngleConstraint {
  center: number;
  a: number;
  b: number;
  targetCos: number;
  idealDeg: number;
  k: number;
}

function generateInitialPositions(
  analyses: AtomVseprAnalysis[],
  bonds: ParsedBond[],
  ringAtoms: Set<number>,
  cycles: number[][],
  rdkitCoords2D?: { x: number; y: number }[]
): { positions: Vec3[]; angleConstraints: AngleConstraint[] } {
  const n = analyses.length;
  const positions: Vec3[] = Array.from({ length: n }, () => v3(0, 0, 0));
  const placed = new Array<boolean>(n).fill(false);

  const bondMap = new Map<string, ParsedBond>();
  const adj = Array.from({ length: n }, () => [] as number[]);
  for (const b of bonds) {
    adj[b.from].push(b.to);
    adj[b.to].push(b.from);
    bondMap.set(`${b.from}-${b.to}`, b);
    bondMap.set(`${b.to}-${b.from}`, b);
  }

  const getBondObj = (u: number, w: number) => bondMap.get(`${u}-${w}`)!;

  // Track which VSEPR template vector was assigned to each neighbor around each atom
  const assignedTemplateSlot = new Map<string, Vec3>();
  const angleConstraints: AngleConstraint[] = [];

  // Process connected components (supports `.` salts / multi-fragment SMILES)
  let compOffsetX = 0;

  for (let root = 0; root < n; root++) {
    if (placed[root]) continue;

    // Collect connected component nodes
    const compNodes: number[] = [];
    const seen = new Set<number>([root]);
    const bfsQ = [root];
    while (bfsQ.length > 0) {
      const cur = bfsQ.shift()!;
      compNodes.push(cur);
      for (const nb of adj[cur]) {
        if (!seen.has(nb)) {
          seen.add(nb);
          bfsQ.push(nb);
        }
      }
    }
    const compSet = new Set(compNodes);

    const queue: { atomId: number; parentId: number | null; planeNormal: Vec3 }[] = [];

    // Pre-embed rings: use RDKit CoordGen 2D layout when available (handles fused/polycyclic rings cleanly)
    const compRingAtoms = compNodes.filter((id) => ringAtoms.has(id));
    const primaryCycle = cycles.find((cyc) => compSet.has(cyc[0]));
    if (compRingAtoms.length >= 3 && rdkitCoords2D) {
      const ringIndexInCycle = new Map<number, number>();
      for (const cyc of cycles) {
        cyc.forEach((id, idx) => {
          if (!ringIndexInCycle.has(id)) ringIndexInCycle.set(id, idx);
        });
      }
      // Compute component ring centroid in CoordGen coordinates and scale (~1.0 -> 1.44 A)
      let rCx = 0;
      let rCy = 0;
      for (const id of compRingAtoms) {
        rCx += rdkitCoords2D[id].x;
        rCy += rdkitCoords2D[id].y;
      }
      rCx /= compRingAtoms.length;
      rCy /= compRingAtoms.length;

      for (const atomId of compRingAtoms) {
        const a = analyses[atomId];
        const isFlat =
          a.hybridization === 'sp²' ||
          a.hybridization === 'sp' ||
          a.atom.isAromatic;
        const cIdx = ringIndexInCycle.get(atomId) ?? 0;
        const puckerZ = isFlat ? 0 : cIdx % 2 === 0 ? 0.24 : -0.24;
        positions[atomId] = v3(
          compOffsetX + (rdkitCoords2D[atomId].x - rCx) * 1.44,
          (rdkitCoords2D[atomId].y - rCy) * 1.44,
          puckerZ
        );
        placed[atomId] = true;
      }

      // Place immediate exocyclic neighbors radially outward and enqueue for 3D VSEPR growth
      for (const atomId of compRingAtoms) {
        const placedNeighbors = analyses[atomId].neighborIds.filter(
          (nid) => placed[nid]
        );
        const unplacedNeighbors = analyses[atomId].neighborIds.filter(
          (nid) => !placed[nid]
        );
        if (unplacedNeighbors.length === 0) continue;

        let outDir = v3(1, 0, 0);
        if (placedNeighbors.length > 0) {
          let sumNb = v3(0, 0, 0);
          for (const pid of placedNeighbors) sumNb = add(sumNb, positions[pid]);
          const avgNb = scale(sumNb, 1 / placedNeighbors.length);
          const diff = sub(positions[atomId], avgNb);
          outDir = len(diff) > 1e-4 ? normalize(diff) : v3(1, 0, 0);
        }

        const aInfo = analyses[atomId];
        if (unplacedNeighbors.length === 1) {
          const cid = unplacedNeighbors[0];
          const bObj = getBondObj(atomId, cid);
          const bLen = getIdealBondLength(
            aInfo.covalentRadius,
            analyses[cid].covalentRadius,
            bObj.order,
            bObj.isAromatic
          );
          positions[cid] = add(positions[atomId], scale(outDir, bLen));
          placed[cid] = true;
          queue.push({ atomId: cid, parentId: atomId, planeNormal: v3(0, 0, 1) });
        } else {
          for (let sIdx = 0; sIdx < unplacedNeighbors.length; sIdx++) {
            const cid = unplacedNeighbors[sIdx];
            const zSign = sIdx % 2 === 0 ? 1 : -1;
            const subDir = normalize(
              add(scale(outDir, 0.72), v3(0, 0, 0.7 * zSign))
            );
            const bObj = getBondObj(atomId, cid);
            const subLen = getIdealBondLength(
              aInfo.covalentRadius,
              analyses[cid].covalentRadius,
              bObj.order,
              bObj.isAromatic
            );
            positions[cid] = add(positions[atomId], scale(subDir, subLen));
            placed[cid] = true;
            queue.push({ atomId: cid, parentId: atomId, planeNormal: v3(0, 0, 1) });
          }
        }
      }
    } else if (primaryCycle && primaryCycle.length >= 3) {
      const kLen = primaryCycle.length;
      const isFlatRing = primaryCycle.every(
        (id) =>
          analyses[id].hybridization === 'sp²' ||
          analyses[id].hybridization === 'sp' ||
          analyses[id].atom.isAromatic
      );
      // Polygon radius from average bond length (~1.42 A)
      const avgBond = 1.44;
      const radius = avgBond / (2 * Math.sin(Math.PI / kLen));
      for (let idx = 0; idx < kLen; idx++) {
        const atomId = primaryCycle[idx];
        const theta = (idx * 2 * Math.PI) / kLen;
        const puckerZ = isFlatRing ? 0 : idx % 2 === 0 ? 0.24 : -0.24;
        positions[atomId] = v3(
          compOffsetX + radius * Math.cos(theta),
          radius * Math.sin(theta),
          puckerZ
        );
        placed[atomId] = true;
      }
      // Enqueue ring atoms with radial outward parent direction so substituents point outward
      for (let idx = 0; idx < kLen; idx++) {
        const atomId = primaryCycle[idx];
        const prevRing = primaryCycle[(idx - 1 + kLen) % kLen];
        const nextRing = primaryCycle[(idx + 1) % kLen];
        const unplacedNeighbors = analyses[atomId].neighborIds.filter(
          (nid) => !placed[nid]
        );
        if (unplacedNeighbors.length > 0) {
          const outDir = normalize(
            sub(
              positions[atomId],
              scale(add(positions[prevRing], positions[nextRing]), 0.5)
            )
          );
          const aInfo = analyses[atomId];
          const bLen = getIdealBondLength(
            aInfo.covalentRadius,
            analyses[unplacedNeighbors[0]].covalentRadius,
            getBondObj(atomId, unplacedNeighbors[0]).order,
            getBondObj(atomId, unplacedNeighbors[0]).isAromatic
          );
          if (unplacedNeighbors.length === 1) {
            const cid = unplacedNeighbors[0];
            positions[cid] = add(positions[atomId], scale(outDir, bLen));
            placed[cid] = true;
            queue.push({ atomId: cid, parentId: atomId, planeNormal: v3(0, 0, 1) });
          } else {
            // e.g. sp3 CH2 on cyclohexane: 2 substituents up/down along Z + outward
            for (let sIdx = 0; sIdx < unplacedNeighbors.length; sIdx++) {
              const cid = unplacedNeighbors[sIdx];
              const zSign = sIdx % 2 === 0 ? 1 : -1;
              const subDir = normalize(add(scale(outDir, 0.72), v3(0, 0, 0.7 * zSign)));
              const subLen = getIdealBondLength(
                aInfo.covalentRadius,
                analyses[cid].covalentRadius,
                getBondObj(atomId, cid).order,
                getBondObj(atomId, cid).isAromatic
              );
              positions[cid] = add(positions[atomId], scale(subDir, subLen));
              placed[cid] = true;
              queue.push({ atomId: cid, parentId: atomId, planeNormal: v3(0, 0, 1) });
            }
          }
        }
      }
    } else {
      // Tree/acyclic component: pick best root atom
      let bestStart = root;
      let bestScore = -1;
      for (const id of compNodes) {
        const a = analyses[id];
        const heavyDeg = a.neighborIds.filter(
          (nid) => analyses[nid].atom.symbol !== 'H'
        ).length;
        const score =
          (a.atom.symbol === 'H' ? 0 : 100) +
          (ringAtoms.has(id) ? 20 : 0) +
          heavyDeg * 10 +
          a.sigmaBonds;
        if (score > bestScore) {
          bestScore = score;
          bestStart = id;
        }
      }

      positions[bestStart] = v3(compOffsetX, 0, 0);
      placed[bestStart] = true;

      const template0 = getVseprTemplate(
        analyses[bestStart].stericNumber,
        analyses[bestStart].sigmaBonds,
        analyses[bestStart].localizedLonePairs
      );

      queue.push({ atomId: bestStart, parentId: null, planeNormal: v3(0, 0, 1) });

      const rootNeighbors = analyses[bestStart].neighborIds;
      for (let i = 0; i < rootNeighbors.length; i++) {
        const nb = rootNeighbors[i];
        const dir =
          template0.bondDirs[i] ?? normalize(v3(Math.cos(i), Math.sin(i), 0.3));
        assignedTemplateSlot.set(`${bestStart}-${nb}`, dir);
        const bObj = getBondObj(bestStart, nb);
        const bLen = getIdealBondLength(
          analyses[bestStart].covalentRadius,
          analyses[nb].covalentRadius,
          bObj.order,
          bObj.isAromatic
        );
        if (!placed[nb]) {
          positions[nb] = add(positions[bestStart], scale(dir, bLen));
          placed[nb] = true;
          queue.push({
            atomId: nb,
            parentId: bestStart,
            planeNormal: anyPerp(dir),
          });
        }
      }
    }

    let stepCounter = 0;
    while (queue.length > 0) {
      const { atomId, parentId, planeNormal } = queue.shift()!;
      if (parentId === null) continue;
      stepCounter += 1;

      const analysis = analyses[atomId];
      const children = analysis.neighborIds.filter((id) => !placed[id]);
      if (children.length === 0) continue;

      const tpl = getVseprTemplate(
        analysis.stericNumber,
        analysis.sigmaBonds,
        analysis.localizedLonePairs
      );

      // Align tpl.bondDirs[0] to the incoming vector (from atomId -> parentId)
      const toParentDir = normalize(sub(positions[parentId], positions[atomId]));
      const slot0 = tpl.bondDirs[0] ?? v3(1, 0, 0);

      // Build rotated template directions
      const rotatedDirs = tpl.bondDirs.map((d) =>
        alignDirection(d, slot0, toParentDir)
      );

      // Twist around toParentDir so substituents are staggered / planar / ring-curved cleanly
      let desiredTwist = stepCounter % 2 === 0 ? 0 : Math.PI / 3;
      if (analysis.hybridization === 'sp²' || analysis.atom.isAromatic) {
        // Keep sp2 systems coplanar with parent planeNormal!
        desiredTwist = 0;
      }

      if (rotatedDirs.length > 1) {
        const currentSecond = normalize(
          sub(rotatedDirs[1], scale(toParentDir, dot(rotatedDirs[1], toParentDir)))
        );
        const parentRef = normalize(
          sub(planeNormal, scale(toParentDir, dot(planeNormal, toParentDir)))
        );
        if (len(currentSecond) > 1e-4 && len(parentRef) > 1e-4) {
          const targetDir =
            analysis.hybridization === 'sp²' || analysis.atom.isAromatic
              ? normalize(cross(toParentDir, parentRef))
              : rotateAroundAxis(parentRef, toParentDir, desiredTwist);
          const cosTw = Math.max(-1, Math.min(1, dot(currentSecond, targetDir)));
          const sinTw = dot(toParentDir, cross(currentSecond, targetDir));
          const twistAngle = Math.atan2(sinTw, cosTw);
          for (let k = 1; k < rotatedDirs.length; k++) {
            rotatedDirs[k] = rotateAroundAxis(
              rotatedDirs[k],
              toParentDir,
              twistAngle
            );
          }
        }
      }

      assignedTemplateSlot.set(`${atomId}-${parentId}`, toParentDir);

      // Sort children so ring atoms / heavy atoms get clean slots first
      const sortedChildren = [...children].sort((a, b) => {
        const aScore =
          (ringAtoms.has(a) ? 2 : 0) + (analyses[a].atom.symbol !== 'H' ? 1 : 0);
        const bScore =
          (ringAtoms.has(b) ? 2 : 0) + (analyses[b].atom.symbol !== 'H' ? 1 : 0);
        return bScore - aScore;
      });

      for (let i = 0; i < sortedChildren.length; i++) {
        const childId = sortedChildren[i];
        let dir =
          rotatedDirs[i + 1] ??
          normalize(
            rotateAroundAxis(anyPerp(toParentDir), toParentDir, (i * Math.PI * 2) / 3)
          );

        // Add subtle non-planar pucker for saturated rings so chair/envelope forms naturally
        if (
          ringAtoms.has(atomId) &&
          ringAtoms.has(childId) &&
          analysis.hybridization === 'sp³'
        ) {
          const puckerSign = stepCounter % 2 === 0 ? 1 : -1;
          dir = normalize(add(dir, scale(planeNormal, 0.25 * puckerSign)));
        }

        assignedTemplateSlot.set(`${atomId}-${childId}`, dir);

        const bObj = getBondObj(atomId, childId);
        const bLen = getIdealBondLength(
          analysis.covalentRadius,
          analyses[childId].covalentRadius,
          bObj.order,
          bObj.isAromatic
        );

        if (!placed[childId]) {
          positions[childId] = add(positions[atomId], scale(dir, bLen));
          placed[childId] = true;
          const nextNormal =
            len(cross(toParentDir, dir)) > 1e-4
              ? normalize(cross(toParentDir, dir))
              : planeNormal;
          queue.push({
            atomId: childId,
            parentId: atomId,
            planeNormal: nextNormal,
          });
        }
      }
    }

    // Build exact VSEPR angle constraints for every pair of neighbors on every atom in component
    for (const centerId of compNodes) {
      const a = analyses[centerId];
      const nbs = a.neighborIds;
      if (nbs.length < 2) continue;

      const tpl = getVseprTemplate(
        a.stericNumber,
        a.sigmaBonds,
        a.localizedLonePairs
      );

      for (let i = 0; i < nbs.length; i++) {
        for (let j = i + 1; j < nbs.length; j++) {
          const u = nbs[i];
          const v = nbs[j];
          const d1 = assignedTemplateSlot.get(`${centerId}-${u}`) ?? tpl.bondDirs[i];
          const d2 = assignedTemplateSlot.get(`${centerId}-${v}`) ?? tpl.bondDirs[j];
          let targetCos = -0.5;
          if (d1 && d2) {
            targetCos = Math.max(-1, Math.min(1, dot(normalize(d1), normalize(d2))));
          } else if (a.stericNumber === 2) {
            targetCos = -1;
          } else if (a.stericNumber === 3) {
            targetCos = Math.cos((120 * Math.PI) / 180);
          } else if (a.stericNumber === 4) {
            targetCos = Math.cos((109.47 * Math.PI) / 180);
          }
          const idealDeg = (Math.acos(targetCos) * 180) / Math.PI;
          angleConstraints.push({
            center: centerId,
            a: u,
            b: v,
            targetCos,
            idealDeg,
            k: a.stericNumber >= 5 ? 0.55 : 0.45,
          });
        }
      }
    }

    // Offset next disconnected component horizontally
    let maxX = compOffsetX;
    for (const id of compNodes) {
      if (positions[id].x > maxX) maxX = positions[id].x;
    }
    compOffsetX = maxX + 4.0;
  }

  return { positions, angleConstraints };
}

function relaxGeometry(
  positions: Vec3[],
  analyses: AtomVseprAnalysis[],
  bonds: ParsedBond[],
  angleConstraints: AngleConstraint[]
): Vec3[] {
  const n = positions.length;
  if (n <= 1) return positions;

  const pos = positions.map((p) => ({ ...p }));
  const forces: Vec3[] = Array.from({ length: n }, () => v3(0, 0, 0));

  const bondedPairs = new Set<string>();
  const bondSpecs = bonds.map((b) => {
    bondedPairs.add(`${b.from}-${b.to}`);
    bondedPairs.add(`${b.to}-${b.from}`);
    return {
      from: b.from,
      to: b.to,
      targetLen: getIdealBondLength(
        analyses[b.from].covalentRadius,
        analyses[b.to].covalentRadius,
        b.order,
        b.isAromatic
      ),
    };
  });

  // Identify 1-3 pairs (so non-bonded repulsion doesn't fight angle constraints)
  const oneThreePairs = new Set<string>();
  for (const ac of angleConstraints) {
    oneThreePairs.add(`${ac.a}-${ac.b}`);
    oneThreePairs.add(`${ac.b}-${ac.a}`);
  }

  // Identify sp2 centers for out-of-plane planarity
  const sp2Centers = analyses
    .filter(
      (a) =>
        (a.hybridization === 'sp²' || a.atom.isAromatic) &&
        a.neighborIds.length === 3
    )
    .map((a) => ({
      center: a.atom.id,
      nbs: a.neighborIds,
    }));

  // Double-bond torsion planarity (for A-C=C-B type systems)
  const doubleBonds = bonds.filter((b) => b.order === 2 || b.isAromatic);

  const iterations = n > 40 ? 220 : 320;
  const stepSize = 0.14;

  for (let iter = 0; iter < iterations; iter++) {
    for (let i = 0; i < n; i++) {
      forces[i].x = 0;
      forces[i].y = 0;
      forces[i].z = 0;
    }

    // 1. Harmonic bond stretching
    for (const b of bondSpecs) {
      const dx = pos[b.to].x - pos[b.from].x;
      const dy = pos[b.to].y - pos[b.from].y;
      const dz = pos[b.to].z - pos[b.from].z;
      const dist = Math.hypot(dx, dy, dz) || 1e-4;
      const diff = (dist - b.targetLen) / dist;
      const kBond = 1.6;
      const fx = dx * diff * kBond;
      const fy = dy * diff * kBond;
      const fz = dz * diff * kBond;
      forces[b.from].x += fx;
      forces[b.from].y += fy;
      forces[b.from].z += fz;
      forces[b.to].x -= fx;
      forces[b.to].y -= fy;
      forces[b.to].z -= fz;
    }

    // 2. VSEPR Angle bending: F = -dE/dp where E = 0.5 * k * (cos(theta) - targetCos)^2
    for (const ac of angleConstraints) {
      const c = pos[ac.center];
      const pa = pos[ac.a];
      const pb = pos[ac.b];
      const va = sub(pa, c);
      const vb = sub(pb, c);
      const la = len(va) || 1e-4;
      const lb = len(vb) || 1e-4;
      const ua = scale(va, 1 / la);
      const ub = scale(vb, 1 / lb);
      const curCos = Math.max(-1, Math.min(1, dot(ua, ub)));
      const dCos = curCos - ac.targetCos;

      // Negative gradient pulls curCos -> targetCos
      const gradA = scale(sub(ub, scale(ua, curCos)), (-ac.k * dCos) / la);
      const gradB = scale(sub(ua, scale(ub, curCos)), (-ac.k * dCos) / lb);

      forces[ac.a].x += gradA.x;
      forces[ac.a].y += gradA.y;
      forces[ac.a].z += gradA.z;

      forces[ac.b].x += gradB.x;
      forces[ac.b].y += gradB.y;
      forces[ac.b].z += gradB.z;

      forces[ac.center].x -= gradA.x + gradB.x;
      forces[ac.center].y -= gradA.y + gradB.y;
      forces[ac.center].z -= gradA.z + gradB.z;
    }

    // 3. sp2 planarity enforcement (keep center inside triangle of its 3 neighbors)
    for (const sp2 of sp2Centers) {
      const p0 = pos[sp2.nbs[0]];
      const p1 = pos[sp2.nbs[1]];
      const p2 = pos[sp2.nbs[2]];
      const e1 = sub(p1, p0);
      const e2 = sub(p2, p0);
      const normal = cross(e1, e2);
      const area = len(normal);
      if (area < 1e-5) continue;
      const unitN = scale(normal, 1 / area);
      const pc = pos[sp2.center];
      const outOfPlane = dot(sub(pc, p0), unitN);
      const kPlanar = 0.6;
      const push = scale(unitN, -outOfPlane * kPlanar);
      forces[sp2.center].x += push.x;
      forces[sp2.center].y += push.y;
      forces[sp2.center].z += push.z;
      for (const nid of sp2.nbs) {
        forces[nid].x -= push.x / 3;
        forces[nid].y -= push.y / 3;
        forces[nid].z -= push.z / 3;
      }
    }

    // 4. Double/aromatic bond coplanarity between neighboring sp2 planes
    for (const db of doubleBonds) {
      const aInfo = analyses[db.from];
      const bInfo = analyses[db.to];
      if (aInfo.neighborIds.length < 2 || bInfo.neighborIds.length < 2) continue;
      const aOther = aInfo.neighborIds.filter((id) => id !== db.to);
      const bOther = bInfo.neighborIds.filter((id) => id !== db.from);
      if (aOther.length === 0 || bOther.length === 0) continue;

      const axis = normalize(sub(pos[db.to], pos[db.from]));
      const va = sub(pos[aOther[0]], pos[db.from]);
      const vb = sub(pos[bOther[0]], pos[db.to]);
      const na = cross(axis, va);
      const nb = cross(axis, vb);
      const la = len(na);
      const lb = len(nb);
      if (la < 1e-4 || lb < 1e-4) continue;
      const una = scale(na, 1 / la);
      const unb = scale(nb, 1 / lb);
      // Align planes (dot = ±1)
      const sign = dot(una, unb) >= 0 ? 1 : -1;
      const diffN = sub(scale(unb, sign), una);
      const kTors = 0.16;
      const fA = scale(cross(diffN, axis), kTors);
      forces[aOther[0]].x += fA.x;
      forces[aOther[0]].y += fA.y;
      forces[aOther[0]].z += fA.z;
      forces[bOther[0]].x -= fA.x;
      forces[bOther[0]].y -= fA.y;
      forces[bOther[0]].z -= fA.z;
    }

    // 5. Non-bonded steric repulsion (soft sphere)
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (bondedPairs.has(`${i}-${j}`) || oneThreePairs.has(`${i}-${j}`)) {
          continue;
        }
        const dx = pos[j].x - pos[i].x;
        const dy = pos[j].y - pos[i].y;
        const dz = pos[j].z - pos[i].z;
        const d2 = dx * dx + dy * dy + dz * dz;
        const minDist =
          (analyses[i].vdwRadius + analyses[j].vdwRadius) * 0.62;
        if (d2 < minDist * minDist) {
          const d = Math.sqrt(d2) || 1e-3;
          const overlap = (minDist - d) / d;
          const kRep = 0.28;
          const fx = dx * overlap * kRep;
          const fy = dy * overlap * kRep;
          const fz = dz * overlap * kRep;
          forces[i].x -= fx;
          forces[i].y -= fy;
          forces[i].z -= fz;
          forces[j].x += fx;
          forces[j].y += fy;
          forces[j].z += fz;
        }
      }
    }

    // Apply capped displacements
    const cooling = 1 - (iter / iterations) * 0.45;
    for (let i = 0; i < n; i++) {
      let fx = forces[i].x * stepSize * cooling;
      let fy = forces[i].y * stepSize * cooling;
      let fz = forces[i].z * stepSize * cooling;
      const mag = Math.hypot(fx, fy, fz);
      if (mag > 0.25) {
        const s = 0.25 / mag;
        fx *= s;
        fy *= s;
        fz *= s;
      }
      pos[i].x += fx;
      pos[i].y += fy;
      pos[i].z += fz;
    }
  }

  // Center molecule at origin
  let cx = 0;
  let cy = 0;
  let cz = 0;
  for (const p of pos) {
    cx += p.x;
    cy += p.y;
    cz += p.z;
  }
  cx /= n;
  cy /= n;
  cz /= n;
  for (const p of pos) {
    p.x -= cx;
    p.y -= cy;
    p.z -= cz;
  }

  return pos;
}

function computeLonePairDirections(
  atomIdx: number,
  positions: Vec3[],
  analyses: AtomVseprAnalysis[]
): LonePairOrbital[] {
  const a = analyses[atomIdx];
  if (a.lonePairs === 0) return [];

  const pos = positions[atomIdx];
  const neighborDirs = a.neighborIds.map((nid) =>
    normalize(sub(positions[nid], pos))
  );

  const result: LonePairOrbital[] = [];

  // Helper to get an adjacent atom's molecular plane normal (useful for =O, -N, etc.)
  const getAdjacentPlaneNormal = (): Vec3 => {
    for (const nid of a.neighborIds) {
      const nb = analyses[nid];
      if (nb.neighborIds.length >= 2) {
        const otherId = nb.neighborIds.find((id) => id !== atomIdx);
        if (otherId !== undefined) {
          const v1 = normalize(sub(positions[nid], pos));
          const v2 = normalize(sub(positions[otherId], positions[nid]));
          const cr = cross(v1, v2);
          if (len(cr) > 1e-4) return normalize(cr);
        }
      }
    }
    return v3(0, 0, 1);
  };

  // 1. Delocalized lone pair (occupies unhybridized p orbital perpendicular to ring / pi plane)
  if (a.delocalizedLonePairs > 0) {
    let normal = v3(0, 1, 0);
    if (neighborDirs.length >= 2) {
      const cr = cross(neighborDirs[0], neighborDirs[1]);
      if (len(cr) > 1e-4) {
        normal = normalize(cr);
      } else {
        normal = getAdjacentPlaneNormal();
      }
    } else {
      normal = getAdjacentPlaneNormal();
    }
    result.push({
      direction: normal,
      orbitalType: 'pi-delocalized',
      label: 'p orbital (π-conjugated)',
    });
  }

  // 2. Localized lone pairs in hybrid orbitals
  const k = neighborDirs.length;
  const L = a.localizedLonePairs;
  if (L <= 0) return result;

  if (k === 0) {
    // Isolated atom/ion (e.g., [Cl-])
    const oct = [
      v3(0, 1, 0),
      v3(0, -1, 0),
      v3(1, 0, 0),
      v3(-1, 0, 0),
    ];
    for (let i = 0; i < L; i++) {
      result.push({
        direction: oct[i % oct.length],
        orbitalType: 'localized',
        label: `${a.hybridization} lone pair`,
      });
    }
    return result;
  }

  if (k === 1) {
    const u = neighborDirs[0];
    const opp = scale(u, -1);
    const planeN = getAdjacentPlaneNormal();
    const inPlanePerp =
      len(cross(opp, planeN)) > 1e-4
        ? normalize(cross(opp, planeN))
        : anyPerp(opp);

    if (L === 1) {
      result.push({
        direction: opp,
        orbitalType: 'localized',
        label: `${a.hybridization} lone pair`,
      });
    } else if (L === 2) {
      // e.g., carbonyl =O or CO2 =O: two sp2 lobes at ±60° in the local plane
      const angle = (60 * Math.PI) / 180;
      const d1 = normalize(
        add(scale(opp, Math.cos(angle)), scale(inPlanePerp, Math.sin(angle)))
      );
      const d2 = normalize(
        add(scale(opp, Math.cos(angle)), scale(inPlanePerp, -Math.sin(angle)))
      );
      result.push(
        { direction: d1, orbitalType: 'localized', label: `${a.hybridization} lone pair` },
        { direction: d2, orbitalType: 'localized', label: `${a.hybridization} lone pair` }
      );
    } else {
      // L === 3 (e.g. terminal -F, -Cl, [OH-])
      const coneAngle = (70.53 * Math.PI) / 180; // 180 - 109.47
      for (let i = 0; i < L; i++) {
        const az = (i * 2 * Math.PI) / L;
        const radial = rotateAroundAxis(inPlanePerp, opp, az);
        const dir = normalize(
          add(scale(opp, Math.cos(coneAngle)), scale(radial, Math.sin(coneAngle)))
        );
        result.push({
          direction: dir,
          orbitalType: 'localized',
          label: `${a.hybridization} lone pair`,
        });
      }
    }
    return result;
  }

  if (k === 2) {
    const u1 = neighborDirs[0];
    const u2 = neighborDirs[1];
    const dDot = dot(u1, u2);
    const sumVec = add(u1, u2);
    const bisector =
      len(sumVec) > 1e-3
        ? normalize(scale(sumVec, -1))
        : anyPerp(u1);
    const planeN =
      len(cross(u1, u2)) > 1e-3 ? normalize(cross(u1, u2)) : anyPerp(u1);

    if (L === 1) {
      // e.g., SO2, O3, pyridine N
      result.push({
        direction: bisector,
        orbitalType: 'localized',
        label: `${a.hybridization} lone pair`,
      });
    } else if (L === 2) {
      // e.g., H2O, -OH, ether -O- (in plane perpendicular to H-O-H plane)
      const half = (54.735 * Math.PI) / 180;
      const d1 = normalize(
        add(scale(bisector, Math.cos(half)), scale(planeN, Math.sin(half)))
      );
      const d2 = normalize(
        add(scale(bisector, Math.cos(half)), scale(planeN, -Math.sin(half)))
      );
      result.push(
        { direction: d1, orbitalType: 'localized', label: `${a.hybridization} lone pair` },
        { direction: d2, orbitalType: 'localized', label: `${a.hybridization} lone pair` }
      );
    } else if (L === 3 && dDot < -0.7) {
      // Linear AX2E3 (e.g., XeF2): 3 equatorial lone pairs at 120° around bond axis
      const perp = anyPerp(u1);
      for (let i = 0; i < 3; i++) {
        result.push({
          direction: rotateAroundAxis(perp, u1, (i * 2 * Math.PI) / 3),
          orbitalType: 'localized',
          label: `${a.hybridization} eq. lone pair`,
        });
      }
    } else {
      result.push({
        direction: bisector,
        orbitalType: 'localized',
        label: `${a.hybridization} lone pair`,
      });
    }
    return result;
  }

  if (k === 3) {
    const [u1, u2, u3] = neighborDirs;
    if (L === 1) {
      // Trigonal pyramidal (NH3, H3O+): opposite sum of 3 bonds
      const sum = add(add(u1, u2), u3);
      const dir =
        len(sum) > 1e-3 ? normalize(scale(sum, -1)) : normalize(cross(u1, u2));
      result.push({
        direction: dir,
        orbitalType: 'localized',
        label: `${a.hybridization} lone pair`,
      });
    } else if (L === 2) {
      // T-Shaped AX3E2 (ClF3): identify the two opposite axial bonds vs 1 equatorial bond
      const d01 = dot(u1, u2);
      const d02 = dot(u1, u3);
      const d12 = dot(u2, u3);
      let ax1 = u1;
      let ax2 = u2;
      let eq = u3;
      if (d02 <= d01 && d02 <= d12) {
        ax1 = u1;
        ax2 = u3;
        eq = u2;
      } else if (d12 <= d01 && d12 <= d02) {
        ax1 = u2;
        ax2 = u3;
        eq = u1;
      }
      const axAxis = normalize(sub(ax1, ax2));
      const oppEq = normalize(scale(eq, -1));
      const eqNormal =
        len(cross(axAxis, oppEq)) > 1e-4
          ? normalize(cross(axAxis, oppEq))
          : anyPerp(oppEq);
      const ang = (60 * Math.PI) / 180;
      result.push(
        {
          direction: normalize(
            add(scale(oppEq, Math.cos(ang)), scale(eqNormal, Math.sin(ang)))
          ),
          orbitalType: 'localized',
          label: `${a.hybridization} eq. lone pair`,
        },
        {
          direction: normalize(
            add(scale(oppEq, Math.cos(ang)), scale(eqNormal, -Math.sin(ang)))
          ),
          orbitalType: 'localized',
          label: `${a.hybridization} eq. lone pair`,
        }
      );
    }
    return result;
  }

  if (k === 4) {
    if (L === 1) {
      // Seesaw AX4E1 (SF4): find most opposite pair (axial), remaining two are equatorial
      let bestPair: [number, number] = [0, 1];
      let minDot = 2;
      for (let i = 0; i < 4; i++) {
        for (let j = i + 1; j < 4; j++) {
          const dp = dot(neighborDirs[i], neighborDirs[j]);
          if (dp < minDot) {
            minDot = dp;
            bestPair = [i, j];
          }
        }
      }
      const eqIdxs = [0, 1, 2, 3].filter(
        (idx) => idx !== bestPair[0] && idx !== bestPair[1]
      );
      const eqSum = add(neighborDirs[eqIdxs[0]], neighborDirs[eqIdxs[1]]);
      const lpDir =
        len(eqSum) > 1e-3 ? normalize(scale(eqSum, -1)) : anyPerp(neighborDirs[bestPair[0]]);
      result.push({
        direction: lpDir,
        orbitalType: 'localized',
        label: `${a.hybridization} eq. lone pair`,
      });
    } else if (L === 2) {
      // Square planar AX4E2 (XeF4): two lone pairs along ±plane normal
      let planeN = v3(0, 1, 0);
      for (let i = 1; i < 4; i++) {
        const cr = cross(neighborDirs[0], neighborDirs[i]);
        if (len(cr) > 0.3) {
          planeN = normalize(cr);
          break;
        }
      }
      result.push(
        {
          direction: planeN,
          orbitalType: 'localized',
          label: `${a.hybridization} ax. lone pair`,
        },
        {
          direction: scale(planeN, -1),
          orbitalType: 'localized',
          label: `${a.hybridization} ax. lone pair`,
        }
      );
    }
    return result;
  }

  // k >= 5 (e.g., BrF5 square pyramidal)
  let sumAll = v3(0, 0, 0);
  for (const u of neighborDirs) sumAll = add(sumAll, u);
  const dir = len(sumAll) > 1e-3 ? normalize(scale(sumAll, -1)) : v3(0, -1, 0);
  result.push({
    direction: dir,
    orbitalType: 'localized',
    label: `${a.hybridization} lone pair`,
  });
  return result;
}

export async function buildMoleculeWithRDKit(
  rawSmiles: string,
  meta?: { name?: string; notes?: string }
): Promise<MoleculeModel> {
  const { graph, descriptors } = await parseAndCalculateWithRDKit(rawSmiles);
  return buildMoleculeFromParsedGraph(graph, rawSmiles, meta, descriptors);
}

export function buildMoleculeFromSmiles(
  rawSmiles: string,
  meta?: { name?: string; notes?: string }
): MoleculeModel {
  const parsed: ParsedMoleculeGraph = parseSmiles(rawSmiles);
  return buildMoleculeFromParsedGraph(parsed, rawSmiles, meta);
}

export function buildMoleculeFromParsedGraph(
  parsed: ParsedMoleculeGraph,
  rawSmiles: string,
  meta?: { name?: string; notes?: string },
  rdkitDescriptors?: RdkitDescriptors
): MoleculeModel {
  const analyses = analyzeVsepr(parsed);
  const { ringAtoms, cycles } = analyzeRings(
    parsed.atoms.length,
    parsed.bonds,
    parsed.rdkitAtomRings
  );
  const { positions: initialPositions, angleConstraints } =
    generateInitialPositions(
      analyses,
      parsed.bonds,
      ringAtoms,
      cycles,
      parsed.rdkitCoords2D
    );
  const positions = relaxGeometry(
    initialPositions,
    analyses,
    parsed.bonds,
    angleConstraints
  );

  // Build per-atom measured bond angles & lone pair orbitals & hybrid orbitals & VSEPR cage
  const angleConstraintMap = new Map<string, number>();
  for (const ac of angleConstraints) {
    angleConstraintMap.set(`${ac.center}:${ac.a}:${ac.b}`, ac.idealDeg);
    angleConstraintMap.set(`${ac.center}:${ac.b}:${ac.a}`, ac.idealDeg);
  }

  const analyzedAtoms: AnalyzedAtom[] = analyses.map((a, idx) => {
    const pos = positions[idx];
    const lpOrbitals = computeLonePairDirections(idx, positions, analyses);

    const hybridOrbitals: HybridOrbitalLobe[] = [];
    for (const nid of a.neighborIds) {
      const dir = normalize(sub(positions[nid], pos));
      hybridOrbitals.push({
        direction: dir,
        kind: 'bonding',
        label: `${a.hybridization} σ-bonding`,
      });
    }
    for (const lp of lpOrbitals) {
      if (lp.orbitalType === 'localized') {
        hybridOrbitals.push({
          direction: lp.direction,
          kind: 'lone-pair',
          label: lp.label,
        });
      }
    }

    const vseprCageVertices = hybridOrbitals.map((h) => h.direction);

    // Measure actual 3D bond angles around this atom
    const measuredAngles: MeasuredBondAngle[] = [];
    for (let i = 0; i < a.neighborIds.length; i++) {
      for (let j = i + 1; j < a.neighborIds.length; j++) {
        const na = a.neighborIds[i];
        const nb = a.neighborIds[j];
        const va = normalize(sub(positions[na], pos));
        const vb = normalize(sub(positions[nb], pos));
        const cosA = Math.max(-1, Math.min(1, dot(va, vb)));
        const angleDeg = (Math.acos(cosA) * 180) / Math.PI;
        const idealAngleDeg =
          angleConstraintMap.get(`${idx}:${na}:${nb}`) ?? angleDeg;
        measuredAngles.push({
          atomA: na,
          center: idx,
          atomB: nb,
          labelA: `${analyses[na].atom.symbol}${na + 1}`,
          labelB: `${analyses[nb].atom.symbol}${nb + 1}`,
          angleDeg: Math.round(angleDeg * 10) / 10,
          idealAngleDeg: Math.round(idealAngleDeg * 10) / 10,
        });
      }
    }

    return {
      ...a.atom,
      name: a.name,
      cpkColor: a.cpkColor,
      covalentRadius: a.covalentRadius,
      vdwRadius: a.vdwRadius,
      valenceElectrons: a.valenceElectrons,
      bondOrderSum: a.bondOrderSum,
      sigmaBonds: a.sigmaBonds,
      piBonds: a.piBonds,
      lonePairs: a.lonePairs,
      localizedLonePairs: a.localizedLonePairs,
      delocalizedLonePairs: a.delocalizedLonePairs,
      unpairedElectrons: a.unpairedElectrons,
      stericNumber: a.stericNumber,
      hybridization: a.hybridization,
      electronGeometry: a.electronGeometry,
      molecularGeometry: a.molecularGeometry,
      axNotation: a.axNotation,
      idealAngleLabel: a.idealAngleLabel,
      orbitalSummary: a.orbitalSummary,
      position: pos,
      lonePairOrbitals: lpOrbitals,
      hybridOrbitals,
      vseprCageVertices,
      measuredAngles,
      neighborIds: a.neighborIds,
    };
  });

  // Compute molecular formula in Hill system (C first, H second, alphabetical rest)
  const counts = new Map<string, number>();
  let totalWeight = 0;
  let totalLonePairs = 0;
  let totalValenceElectrons = 0;
  let netFormalCharge = 0;
  let heavyAtomCount = 0;
  const hybSet = new Set<AnalyzedAtom['hybridization']>();

  for (const at of analyzedAtoms) {
    counts.set(at.symbol, (counts.get(at.symbol) ?? 0) + 1);
    totalWeight += getElementInfo(at.symbol).atomicMass;
    totalLonePairs += at.lonePairs;
    totalValenceElectrons += at.valenceElectrons - at.formalCharge;
    netFormalCharge += at.formalCharge;
    if (at.symbol !== 'H') {
      heavyAtomCount += 1;
      if (at.hybridization !== 'unhybridized') {
        hybSet.add(at.hybridization);
      }
    }
  }

  const subDigits = (num: number) =>
    num === 1
      ? ''
      : String(num)
          .split('')
          .map((c) => '₀₁₂₃₄₅₆₇₈₉'[Number(c)] ?? c)
          .join('');

  const formulaParts: string[] = [];
  if (counts.has('C')) {
    formulaParts.push(`C${subDigits(counts.get('C')!)}`);
    counts.delete('C');
    if (counts.has('H')) {
      formulaParts.push(`H${subDigits(counts.get('H')!)}`);
      counts.delete('H');
    }
  }
  for (const sym of Array.from(counts.keys()).sort()) {
    formulaParts.push(`${sym}${subDigits(counts.get(sym)!)}`);
  }
  let formula = formulaParts.join('');
  if (netFormalCharge !== 0) {
    const absQ = Math.abs(netFormalCharge);
    const sign = netFormalCharge > 0 ? '⁺' : '⁻';
    const supMap: Record<string, string> = {
      '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
      '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
    };
    const supCount =
      absQ > 1
        ? String(absQ)
            .split('')
            .map((d) => supMap[d] ?? d)
            .join('')
        : '';
    formula += `${supCount}${sign}`;
  }

  // Pick primary central atom for initial inspector selection
  let primaryCenterId: number | null = null;
  let bestCenterScore = -1;
  for (const at of analyzedAtoms) {
    if (at.symbol === 'H') continue;
    const heavyNeighbors = at.neighborIds.filter(
      (nid) => analyzedAtoms[nid].symbol !== 'H'
    ).length;
    const isHetero = at.symbol !== 'C' ? 4 : 0;
    const terminalPenalty = at.sigmaBonds <= 1 ? -50 : 0;
    const score =
      heavyNeighbors * 12 +
      at.sigmaBonds * 5 +
      at.piBonds * 8 +
      at.stericNumber * 3 +
      (at.lonePairs > 0 ? 4 : 0) +
      isHetero +
      terminalPenalty;
    if (score > bestCenterScore) {
      bestCenterScore = score;
      primaryCenterId = at.id;
    }
  }
  if (primaryCenterId === null && analyzedAtoms.length > 0) {
    primaryCenterId = analyzedAtoms[0].id;
  }

  const computedWeight =
    rdkitDescriptors && rdkitDescriptors.amw > 0
      ? Math.round(rdkitDescriptors.amw * 100) / 100
      : Math.round(totalWeight * 100) / 100;

  return {
    atoms: analyzedAtoms,
    bonds: parsed.bonds,
    summary: {
      smiles: rawSmiles.trim(),
      formula,
      molecularWeight: computedWeight,
      totalAtoms: analyzedAtoms.length,
      heavyAtomCount,
      totalBonds: parsed.bonds.length,
      totalLonePairs,
      totalValenceElectrons,
      netFormalCharge,
      primaryCenterId,
      hybridizationsPresent: Array.from(hybSet),
      rdkit: rdkitDescriptors,
    },
    name: meta?.name,
    notes: meta?.notes,
  };
}
