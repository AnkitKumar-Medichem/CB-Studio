from __future__ import annotations

import io
import logging
import math
import re
import threading
from typing import Any

import rdkit
from rdkit import Chem, RDLogger, rdBase
from rdkit.Chem import AllChem, Crippen, Descriptors, rdCoordGen, rdMolDescriptors

try:
    from rdkit.Chem import inchi as rd_inchi
except Exception:
    rd_inchi = None

from .elements import ELEMENTS, get_element_by_atomic_number, get_element_info

_RDKIT_LOCK = threading.Lock()
_RDKIT_LOG_INITIALIZED = False


def _ensure_rdkit_logger() -> None:
    global _RDKIT_LOG_INITIALIZED
    if _RDKIT_LOG_INITIALIZED:
        return
    try:
        rdBase.LogToPythonLogger()
        RDLogger.EnableLog("rdApp.error")
    except Exception:
        pass
    _RDKIT_LOG_INITIALIZED = True


def _v3(x: float = 0.0, y: float = 0.0, z: float = 0.0) -> dict[str, float]:
    return {"x": float(x), "y": float(y), "z": float(z)}


def _add(a: dict[str, float], b: dict[str, float]) -> dict[str, float]:
    return {"x": a["x"] + b["x"], "y": a["y"] + b["y"], "z": a["z"] + b["z"]}


def _sub(a: dict[str, float], b: dict[str, float]) -> dict[str, float]:
    return {"x": a["x"] - b["x"], "y": a["y"] - b["y"], "z": a["z"] - b["z"]}


def _scale(a: dict[str, float], s: float) -> dict[str, float]:
    return {"x": a["x"] * s, "y": a["y"] * s, "z": a["z"] * s}


def _dot(a: dict[str, float], b: dict[str, float]) -> float:
    return a["x"] * b["x"] + a["y"] * b["y"] + a["z"] * b["z"]


def _cross(a: dict[str, float], b: dict[str, float]) -> dict[str, float]:
    return {
        "x": a["y"] * b["z"] - a["z"] * b["y"],
        "y": a["z"] * b["x"] - a["x"] * b["z"],
        "z": a["x"] * b["y"] - a["y"] * b["x"],
    }


def _len(a: dict[str, float]) -> float:
    return math.sqrt(a["x"] * a["x"] + a["y"] * a["y"] + a["z"] * a["z"])


def _normalize(a: dict[str, float]) -> dict[str, float]:
    l = _len(a)
    if l < 1e-8:
        return {"x": 0.0, "y": 1.0, "z": 0.0}
    return {"x": a["x"] / l, "y": a["y"] / l, "z": a["z"] / l}


def _any_perp(u: dict[str, float]) -> dict[str, float]:
    ref = _v3(0.0, 1.0, 0.0) if abs(u["y"]) < 0.85 else _v3(1.0, 0.0, 0.0)
    return _normalize(_cross(u, ref))


def _rotate_around_axis(
    vec: dict[str, float], axis: dict[str, float], angle_rad: float
) -> dict[str, float]:
    k = _normalize(axis)
    cos_a = math.cos(angle_rad)
    sin_a = math.sin(angle_rad)
    k_dot_v = _dot(k, vec)
    k_cross_v = _cross(k, vec)
    return {
        "x": vec["x"] * cos_a + k_cross_v["x"] * sin_a + k["x"] * k_dot_v * (1.0 - cos_a),
        "y": vec["y"] * cos_a + k_cross_v["y"] * sin_a + k["y"] * k_dot_v * (1.0 - cos_a),
        "z": vec["z"] * cos_a + k_cross_v["z"] * sin_a + k["z"] * k_dot_v * (1.0 - cos_a),
    }


def _align_direction(
    vec: dict[str, float], from_dir: dict[str, float], to_dir: dict[str, float]
) -> dict[str, float]:
    f = _normalize(from_dir)
    t = _normalize(to_dir)
    d = _dot(f, t)
    if d > 0.9999:
        return vec
    if d < -0.9999:
        return _rotate_around_axis(vec, _any_perp(f), math.pi)
    axis = _normalize(_cross(f, t))
    angle = math.acos(max(-1.0, min(1.0, d)))
    return _rotate_around_axis(vec, axis, angle)


def _to_subscript(n: int) -> str:
    digits = "₀₁₂₃₄₅₆₇₈₉"
    return "".join(digits[int(ch)] if ch.isdigit() else ch for ch in str(n))


def _format_rdkit_error(raw_log: str, smiles: str) -> str:
    lines = [
        re.sub(r"^\[\d{2}:\d{2}:\d{2}\]\s*", "", line).strip()
        for line in raw_log.splitlines()
        if line.strip()
    ]
    primary = next(
        (
            line
            for line in lines
            if re.search(r"SMILES Parse Error:", line, re.I)
            and not re.search(r"Failed parsing", line, re.I)
        ),
        None,
    )
    if not primary:
        primary = next(
            (
                line
                for line in lines
                if re.search(r"Explicit valence|Can't kekulize|ring", line, re.I)
            ),
            lines[0] if lines else None,
        )
    if primary:
        return re.sub(r"^SMILES Parse Error:\s*", "RDKit SMILES Error: ", primary, flags=re.I)
    return f'RDKit could not parse SMILES "{smiles}".'


def parse_and_calculate_with_rdkit(raw_smiles: str) -> tuple[dict[str, Any], dict[str, Any]]:
    smiles = raw_smiles.strip()
    if not smiles:
        raise ValueError("Please enter a SMILES string.")
    if re.search(r"\s", smiles):
        raise ValueError("SMILES strings cannot contain whitespace.")

    with _RDKIT_LOCK:
        _ensure_rdkit_logger()
        log_stream = io.StringIO()
        handler = logging.StreamHandler(log_stream)
        rdkit_logger = logging.getLogger("rdkit")
        prev_level = rdkit_logger.level
        rdkit_logger.setLevel(logging.ERROR)
        rdkit_logger.addHandler(handler)
        try:
            base_mol = Chem.MolFromSmiles(smiles)
            sanitized = True

            if base_mol is None:
                log_msg = log_stream.getvalue()
                if re.search(r"Explicit valence", log_msg, re.I):
                    log_stream.truncate(0)
                    log_stream.seek(0)
                    base_mol = Chem.MolFromSmiles(smiles, sanitize=False)
                    sanitized = False
                else:
                    raise ValueError(_format_rdkit_error(log_msg, smiles))

            if base_mol is None or base_mol.GetNumAtoms() == 0:
                raise ValueError(_format_rdkit_error(log_stream.getvalue(), smiles))
        finally:
            rdkit_logger.removeHandler(handler)
            rdkit_logger.setLevel(prev_level)

        canonical_smiles = smiles
        try:
            canonical_smiles = Chem.MolToSmiles(base_mol) or smiles
        except Exception:
            canonical_smiles = smiles

        inchi_str = ""
        inchi_key = ""
        if sanitized and rd_inchi is not None and getattr(rd_inchi, "INCHI_AVAILABLE", True):
            try:
                inchi_str = rd_inchi.MolToInchi(base_mol) or ""
                if inchi_str:
                    inchi_key = rd_inchi.InchiToInchiKey(inchi_str) or ""
            except Exception:
                inchi_str = ""
                inchi_key = ""

        target_mol = base_mol
        if sanitized:
            try:
                candidate = Chem.AddHs(base_mol)
                if candidate is not None and candidate.GetNumAtoms() > 0:
                    target_mol = candidate
            except Exception:
                target_mol = base_mol
        else:
            try:
                target_mol.UpdatePropertyCache(strict=False)
                Chem.FastFindRings(target_mol)
            except Exception:
                pass

        # Capture aromatic flags BEFORE Kekulizing a copy
        aromatic_atoms = {
            atom.GetIdx()
            for atom in target_mol.GetAtoms()
            if atom.GetIsAromatic()
        }
        aromatic_bonds = {
            bond.GetIdx()
            for bond in target_mol.GetBonds()
            if bond.GetIsAromatic()
        }

        kekule_mol = None
        try:
            kekule_mol = Chem.Mol(target_mol)
            Chem.Kekulize(kekule_mol, clearAromaticFlags=True)
        except Exception:
            kekule_mol = None

        # Compute 2D coordinates via RDKit CoordGen (fallback to Compute2DCoords)
        rdkit_coords_2d: list[dict[str, float]] | None = None
        try:
            rdCoordGen.AddCoords(target_mol)
        except Exception:
            try:
                AllChem.Compute2DCoords(target_mol)
            except Exception:
                pass

        if target_mol.GetNumConformers() > 0:
            conf = target_mol.GetConformer(0)
            rdkit_coords_2d = []
            for idx in range(target_mol.GetNumAtoms()):
                pt = conf.GetAtomPosition(idx)
                rdkit_coords_2d.append({"x": float(pt.x), "y": float(pt.y)})

        try:
            atom_rings = [list(r) for r in target_mol.GetRingInfo().AtomRings()]
        except Exception:
            atom_rings = []

        atoms: list[dict[str, Any]] = []
        for idx, atom in enumerate(target_mol.GetAtoms()):
            z = atom.GetAtomicNum()
            elem = get_element_by_atomic_number(z)
            isotope = atom.GetIsotope()
            atoms.append(
                {
                    "id": idx,
                    "symbol": elem["symbol"],
                    "atomicNumber": elem["atomicNumber"] or z,
                    "isAromatic": idx in aromatic_atoms,
                    "formalCharge": int(atom.GetFormalCharge()),
                    "explicitHydrogens": 0,
                    "isotope": int(isotope) if isotope > 0 else None,
                }
            )

        bonds: list[dict[str, Any]] = []
        kekule_bond_orders: dict[int, int] = {}
        for idx, bond in enumerate(target_mol.GetBonds()):
            is_arom = idx in aromatic_bonds
            bo_src = kekule_mol.GetBondWithIdx(idx) if kekule_mol is not None else bond
            bo_double = bo_src.GetBondTypeAsDouble()
            if bo_double >= 2.9:
                kekule_order = 3
            elif bo_double >= 1.9:
                kekule_order = 2
            else:
                kekule_order = 1
            display_order: float | int = 1.5 if is_arom else kekule_order
            bonds.append(
                {
                    "id": idx,
                    "from": int(bond.GetBeginAtomIdx()),
                    "to": int(bond.GetEndAtomIdx()),
                    "order": display_order,
                    "isAromatic": is_arom,
                }
            )
            kekule_bond_orders[idx] = kekule_order

        # Descriptors
        fallback_mw = sum(
            get_element_info(a["symbol"])["atomicMass"] for a in atoms
        )
        exact_mw = fallback_mw
        amw = fallback_mw
        tpsa = 0.0
        crippen_logp = 0.0
        crippen_mr = 0.0
        hbd = 0
        hba = 0
        rotatable_bonds = 0
        num_rings = len(atom_rings)
        num_aromatic_rings = 0
        fraction_csp3 = 0.0
        labute_asa = 0.0

        if sanitized:
            try:
                exact_mw = float(Descriptors.ExactMolWt(base_mol))
                amw = float(Descriptors.MolWt(base_mol))
                tpsa = float(rdMolDescriptors.CalcTPSA(base_mol))
                crippen_logp = float(Crippen.MolLogP(base_mol))
                crippen_mr = float(Crippen.MolMR(base_mol))
                hbd = int(rdMolDescriptors.CalcNumHBD(base_mol))
                hba = int(rdMolDescriptors.CalcNumHBA(base_mol))
                rotatable_bonds = int(rdMolDescriptors.CalcNumRotatableBonds(base_mol))
                num_rings = int(rdMolDescriptors.CalcNumRings(base_mol))
                num_aromatic_rings = int(rdMolDescriptors.CalcNumAromaticRings(base_mol))
                fraction_csp3 = float(rdMolDescriptors.CalcFractionCSP3(base_mol))
                labute_asa = float(rdMolDescriptors.CalcLabuteASA(base_mol))
            except Exception:
                pass

        descriptors = {
            "version": getattr(rdkit, "__version__", "RDKit"),
            "canonicalSmiles": canonical_smiles,
            "inchi": inchi_str,
            "inchiKey": inchi_key,
            "sanitized": sanitized,
            "exactMw": exact_mw,
            "amw": amw,
            "tpsa": tpsa,
            "crippenLogP": crippen_logp,
            "crippenMr": crippen_mr,
            "hbd": hbd,
            "hba": hba,
            "rotatableBonds": rotatable_bonds,
            "numRings": num_rings,
            "numAromaticRings": num_aromatic_rings,
            "fractionCsp3": fraction_csp3,
            "labuteAsa": labute_asa,
            "atomRings": atom_rings,
        }

        graph = {
            "atoms": atoms,
            "bonds": bonds,
            "kekuleBondOrders": kekule_bond_orders,
            "rdkitAtomRings": atom_rings if atom_rings else None,
            "rdkitCoords2D": rdkit_coords_2d,
        }
        return graph, descriptors


def get_electron_geometry(steric_number: int) -> str:
    return {
        1: "Terminal",
        2: "Linear",
        3: "Trigonal Planar",
        4: "Tetrahedral",
        5: "Trigonal Bipyramidal",
        6: "Octahedral",
        7: "Pentagonal Bipyramidal",
    }.get(steric_number, "Tetrahedral")


def get_hybridization(
    symbol: str, steric_number: int, sigma_bonds: int, lone_pairs: int
) -> str:
    if symbol in ("H", "He"):
        return "s"
    if steric_number <= 1:
        return "unhybridized"
    if sigma_bonds == 0 and lone_pairs > 0:
        return "unhybridized"
    return {
        2: "sp",
        3: "sp\u00b2",
        4: "sp\u00b3",
        5: "sp\u00b3d",
        6: "sp\u00b3d\u00b2",
        7: "sp\u00b3d\u00b3",
    }.get(steric_number, "sp\u00b3d\u00b2")


def get_molecular_geometry_and_angle(
    steric_number: int, sigma_bonds: int, localized_lp: int
) -> tuple[str, str]:
    if sigma_bonds <= 1:
        return "Terminal", "\u2014"
    if steric_number == 2:
        return "Linear", "180\u00b0"
    if steric_number == 3:
        if localized_lp == 0:
            return "Trigonal Planar", "120\u00b0"
        return "Bent", "~118\u00b0 (<120\u00b0)"
    if steric_number == 4:
        if localized_lp == 0:
            return "Tetrahedral", "109.5\u00b0"
        if localized_lp == 1:
            return "Trigonal Pyramidal", "~107\u00b0 (<109.5\u00b0)"
        return "Bent", "~104.5\u00b0 (<109.5\u00b0)"
    if steric_number == 5:
        if localized_lp == 0:
            return "Trigonal Bipyramidal", "90\u00b0 \u00b7 120\u00b0 \u00b7 180\u00b0"
        if localized_lp == 1:
            return "Seesaw", "~86.5\u00b0 \u00b7 ~101.5\u00b0 \u00b7 ~173\u00b0"
        if localized_lp == 2:
            return "T-Shaped", "~87.5\u00b0 \u00b7 ~175\u00b0"
        return "Linear", "180\u00b0"
    if steric_number == 6:
        if localized_lp == 0:
            return "Octahedral", "90\u00b0 \u00b7 180\u00b0"
        if localized_lp == 1:
            return "Square Pyramidal", "~84.8\u00b0 \u00b7 90\u00b0"
        if localized_lp == 2:
            return "Square Planar", "90\u00b0 \u00b7 180\u00b0"
        if localized_lp == 3:
            return "T-Shaped", "90\u00b0 \u00b7 180\u00b0"
        return "Linear", "180\u00b0"
    if steric_number == 7:
        if localized_lp == 0:
            return "Pentagonal Bipyramidal", "72\u00b0 \u00b7 90\u00b0"
        if localized_lp == 1:
            return "Pentagonal Pyramidal", "~72\u00b0 \u00b7 ~90\u00b0"
        return "Pentagonal Planar", "72\u00b0"
    return "Tetrahedral", "109.5\u00b0"


def analyze_vsepr(graph: dict[str, Any]) -> list[dict[str, Any]]:
    atoms = graph["atoms"]
    bonds = graph["bonds"]
    kekule_orders = graph["kekuleBondOrders"]

    adj_map: dict[int, list[tuple[dict[str, Any], int]]] = {a["id"]: [] for a in atoms}
    for b in bonds:
        adj_map[b["from"]].append((b, b["to"]))
        adj_map[b["to"]].append((b, b["from"]))

    raw_stats: list[dict[str, Any]] = []
    for atom in atoms:
        elem = get_element_info(atom["symbol"])
        adj = adj_map[atom["id"]]
        sigma_bonds = len(adj)
        bond_order_sum = 0
        pi_bonds = 0
        for bond, _ in adj:
            k_order = kekule_orders.get(bond["id"], 1)
            bond_order_sum += k_order
            if k_order > 1:
                pi_bonds += k_order - 1

        effective_valence = max(0, elem["valenceElectrons"] - atom["formalCharge"])
        non_bonding = max(0, effective_valence - bond_order_sum)
        lone_pairs = non_bonding // 2
        unpaired = non_bonding % 2
        raw_stats.append(
            {
                "atom": atom,
                "elem": elem,
                "adj": adj,
                "sigmaBonds": sigma_bonds,
                "piBonds": pi_bonds,
                "bondOrderSum": bond_order_sum,
                "lonePairs": lone_pairs,
                "unpairedElectrons": unpaired,
            }
        )

    results: list[dict[str, Any]] = []
    for stat in raw_stats:
        atom = stat["atom"]
        elem = stat["elem"]
        adj = stat["adj"]
        sigma_bonds = stat["sigmaBonds"]
        pi_bonds = stat["piBonds"]
        lone_pairs = stat["lonePairs"]
        unpaired = stat["unpairedElectrons"]

        delocalized_lp = 0
        if lone_pairs > 0 and atom["symbol"] != "H" and sigma_bonds >= 2:
            is_second_row_or_p = atom["symbol"] in ("N", "O", "S", "C")
            if atom["isAromatic"] and pi_bonds == 0 and is_second_row_or_p:
                delocalized_lp = 1
            elif pi_bonds == 0 and is_second_row_or_p and atom["symbol"] in ("N", "O"):
                adjacent_pi = any(
                    raw_stats[nid]["piBonds"] > 0 or raw_stats[nid]["atom"]["isAromatic"]
                    for _, nid in adj
                )
                if adjacent_pi and (
                    atom["symbol"] == "N" or (atom["symbol"] == "O" and sigma_bonds == 2)
                ):
                    delocalized_lp = 1

        localized_lp = max(0, lone_pairs - delocalized_lp)
        steric_number = (
            1
            if atom["symbol"] == "H"
            else sigma_bonds + localized_lp + (1 if unpaired > 0 and sigma_bonds <= 3 else 0)
        )

        hybridization = get_hybridization(
            atom["symbol"], steric_number, sigma_bonds, localized_lp
        )
        electron_geom = get_electron_geometry(steric_number)
        molecular_geom, ideal_angle_label = get_molecular_geometry_and_angle(
            steric_number, sigma_bonds, localized_lp
        )

        if sigma_bonds == 0:
            ax_notation = "A"
        elif localized_lp == 0:
            ax_notation = f"AX{_to_subscript(sigma_bonds)}"
        else:
            ax_notation = f"AX{_to_subscript(sigma_bonds)}E{_to_subscript(localized_lp)}"

        lp_plural = "" if lone_pairs == 1 else "s"
        if delocalized_lp > 0:
            lp_text = f"{lone_pairs} lone pair{lp_plural} ({delocalized_lp} conjugated in \u03c0)"
        else:
            lp_text = f"{lone_pairs} lone pair{lp_plural}"

        sigma_plural = "" if sigma_bonds == 1 else "s"
        pi_plural = "" if pi_bonds == 1 else "s"
        orbital_summary = (
            f"{sigma_bonds} \u03c3 bond{sigma_plural} \u00b7 "
            f"{pi_bonds} \u03c0 bond{pi_plural} \u00b7 {lp_text}"
        )

        results.append(
            {
                "atom": atom,
                "name": elem["name"],
                "cpkColor": elem["cpkColor"],
                "covalentRadius": elem["covalentRadius"],
                "vdwRadius": elem["vdwRadius"],
                "valenceElectrons": elem["valenceElectrons"],
                "bondOrderSum": stat["bondOrderSum"],
                "sigmaBonds": sigma_bonds,
                "piBonds": pi_bonds,
                "lonePairs": lone_pairs,
                "localizedLonePairs": localized_lp,
                "delocalizedLonePairs": delocalized_lp,
                "unpairedElectrons": unpaired,
                "stericNumber": steric_number,
                "hybridization": hybridization,
                "electronGeometry": electron_geom,
                "molecularGeometry": molecular_geom,
                "axNotation": ax_notation,
                "idealAngleLabel": ideal_angle_label,
                "orbitalSummary": orbital_summary,
                "neighborIds": [nid for _, nid in adj],
            }
        )
    return results


def _get_ideal_bond_length(
    r_a: float, r_b: float, order: float | int, is_aromatic: bool
) -> float:
    base = max(0.85, r_a + r_b)
    if order == 3:
        return base * 0.79
    if order == 2:
        return base * 0.87
    if is_aromatic or order == 1.5:
        return base * 0.91
    return base


def _get_vsepr_template(
    steric_number: int, sigma_bonds: int, localized_lp: int
) -> tuple[list[dict[str, float]], list[dict[str, float]]]:
    deg = math.radians

    if steric_number <= 1:
        return ([_v3(1, 0, 0)] if sigma_bonds > 0 else []), []

    if steric_number == 2:
        all2 = [_v3(1, 0, 0), _v3(-1, 0, 0)]
        return all2[:sigma_bonds], all2[sigma_bonds : sigma_bonds + localized_lp]

    if steric_number == 3:
        if localized_lp == 1 and sigma_bonds == 2:
            half = deg(59)
            return [
                _v3(math.sin(half), -math.cos(half), 0),
                _v3(-math.sin(half), -math.cos(half), 0),
            ], [_v3(0, 1, 0)]
        all3 = [_v3(math.cos(deg(a)), math.sin(deg(a)), 0) for a in (0, 120, 240)]
        return all3[:sigma_bonds], all3[sigma_bonds : sigma_bonds + localized_lp]

    if steric_number == 4:
        if localized_lp == 1 and sigma_bonds == 3:
            sin_a = math.sqrt((2 * (1 - math.cos(deg(107)))) / 3)
            cos_a = math.sqrt(1 - sin_a * sin_a)
            return [
                _v3(sin_a * math.cos(deg(az)), -cos_a, sin_a * math.sin(deg(az)))
                for az in (0, 120, 240)
            ], [_v3(0, 1, 0)]
        if localized_lp == 2 and sigma_bonds == 2:
            hb = deg(52.25)
            hl = deg(54.735)
            return [
                _v3(math.sin(hb), -math.cos(hb), 0),
                _v3(-math.sin(hb), -math.cos(hb), 0),
            ], [
                _v3(0, math.cos(hl), math.sin(hl)),
                _v3(0, math.cos(hl), -math.sin(hl)),
            ]
        s = 1.0 / math.sqrt(3)
        tet = [
            _normalize(_v3(s, s, s)),
            _normalize(_v3(s, -s, -s)),
            _normalize(_v3(-s, s, -s)),
            _normalize(_v3(-s, -s, s)),
        ]
        return tet[:sigma_bonds], tet[sigma_bonds : sigma_bonds + localized_lp]

    if steric_number == 5:
        if localized_lp == 0:
            return [
                _v3(0, 1, 0),
                _v3(0, -1, 0),
                _v3(1, 0, 0),
                _v3(-0.5, 0, math.sqrt(3) / 2),
                _v3(-0.5, 0, -math.sqrt(3) / 2),
            ], []
        if localized_lp == 1 and sigma_bonds == 4:
            eq_half = deg(50.75)
            ax_tilt = deg(3.5)
            return [
                _v3(-math.sin(ax_tilt), math.cos(ax_tilt), 0),
                _v3(-math.sin(ax_tilt), -math.cos(ax_tilt), 0),
                _v3(-math.cos(eq_half), 0, math.sin(eq_half)),
                _v3(-math.cos(eq_half), 0, -math.sin(eq_half)),
            ], [_v3(1, 0, 0)]
        if localized_lp == 2 and sigma_bonds == 3:
            tilt = deg(2.5)
            return [
                _v3(-math.sin(tilt), math.cos(tilt), 0),
                _v3(-math.sin(tilt), -math.cos(tilt), 0),
                _v3(-1, 0, 0),
            ], [
                _v3(0.5, 0, math.sqrt(3) / 2),
                _v3(0.5, 0, -math.sqrt(3) / 2),
            ]
        if localized_lp == 3 and sigma_bonds == 2:
            return [_v3(0, 1, 0), _v3(0, -1, 0)], [
                _v3(1, 0, 0),
                _v3(-0.5, 0, math.sqrt(3) / 2),
                _v3(-0.5, 0, -math.sqrt(3) / 2),
            ]
        all5 = [
            _v3(0, 1, 0),
            _v3(0, -1, 0),
            _v3(1, 0, 0),
            _v3(-0.5, 0, math.sqrt(3) / 2),
            _v3(-0.5, 0, -math.sqrt(3) / 2),
        ]
        return all5[:sigma_bonds], all5[sigma_bonds : sigma_bonds + localized_lp]

    if steric_number == 6:
        if localized_lp == 1 and sigma_bonds == 5:
            tilt = deg(5.2)
            c = math.cos(tilt)
            s = math.sin(tilt)
            return [
                _v3(0, 1, 0),
                _v3(c, s, 0),
                _v3(-c, s, 0),
                _v3(0, s, c),
                _v3(0, s, -c),
            ], [_v3(0, -1, 0)]
        if localized_lp == 2 and sigma_bonds == 4:
            return [_v3(1, 0, 0), _v3(-1, 0, 0), _v3(0, 0, 1), _v3(0, 0, -1)], [
                _v3(0, 1, 0),
                _v3(0, -1, 0),
            ]
        if localized_lp == 3 and sigma_bonds == 3:
            return [_v3(1, 0, 0), _v3(-1, 0, 0), _v3(0, 0, -1)], [
                _v3(0, 1, 0),
                _v3(0, -1, 0),
                _v3(0, 0, 1),
            ]
        oct6 = [
            _v3(1, 0, 0),
            _v3(-1, 0, 0),
            _v3(0, 1, 0),
            _v3(0, -1, 0),
            _v3(0, 0, 1),
            _v3(0, 0, -1),
        ]
        return oct6[:sigma_bonds], oct6[sigma_bonds : sigma_bonds + localized_lp]

    pent_eq = [_v3(math.cos(deg(a)), 0, math.sin(deg(a))) for a in (0, 72, 144, 216, 288)]
    if localized_lp == 1:
        return [_v3(0, 1, 0), *pent_eq], [_v3(0, -1, 0)]
    if localized_lp == 2:
        return pent_eq, [_v3(0, 1, 0), _v3(0, -1, 0)]
    all7 = [_v3(0, 1, 0), _v3(0, -1, 0), *pent_eq]
    return all7[:sigma_bonds], all7[sigma_bonds : sigma_bonds + localized_lp]


def _analyze_rings(
    atom_count: int,
    bonds: list[dict[str, Any]],
    rdkit_atom_rings: list[list[int]] | None = None,
) -> tuple[set[int], list[list[int]]]:
    if rdkit_atom_rings:
        ring_atoms: set[int] = set()
        cycles = []
        for ring in rdkit_atom_rings:
            ring_atoms.update(ring)
            cycles.append(list(ring))
        cycles.sort(key=len)
        return ring_atoms, cycles

    adj: list[list[int]] = [[] for _ in range(atom_count)]
    for b in bonds:
        adj[b["from"]].append(b["to"])
        adj[b["to"]].append(b["from"])

    ring_atoms = set()
    seen_keys: set[str] = set()
    cycles: list[list[int]] = []

    for b in bonds:
        start = b["from"]
        goal = b["to"]
        dist = [-1] * atom_count
        parent = [-1] * atom_count
        q = [start]
        dist[start] = 0
        found = False
        while q and not found:
            curr = q.pop(0)
            if dist[curr] >= 8:
                continue
            for nxt in adj[curr]:
                if (curr == start and nxt == goal) or (curr == goal and nxt == start):
                    continue
                if dist[nxt] == -1:
                    dist[nxt] = dist[curr] + 1
                    parent[nxt] = curr
                    if nxt == goal:
                        found = True
                        break
                    q.append(nxt)
        if found:
            cycle = []
            cur = goal
            while cur != -1:
                ring_atoms.add(cur)
                cycle.append(cur)
                cur = parent[cur]
            key = "-".join(str(x) for x in sorted(cycle))
            if key not in seen_keys and 3 <= len(cycle) <= 8:
                seen_keys.add(key)
                cycles.append(cycle)

    cycles.sort(key=len)
    return ring_atoms, cycles


def _generate_initial_positions(
    analyses: list[dict[str, Any]],
    bonds: list[dict[str, Any]],
    ring_atoms: set[int],
    cycles: list[list[int]],
    rdkit_coords_2d: list[dict[str, float]] | None = None,
) -> tuple[list[dict[str, float]], list[dict[str, Any]]]:
    n = len(analyses)
    positions = [_v3(0, 0, 0) for _ in range(n)]
    placed = [False] * n

    bond_map: dict[tuple[int, int], dict[str, Any]] = {}
    adj: list[list[int]] = [[] for _ in range(n)]
    for b in bonds:
        adj[b["from"]].append(b["to"])
        adj[b["to"]].append(b["from"])
        bond_map[(b["from"], b["to"])] = b
        bond_map[(b["to"], b["from"])] = b

    assigned_slot: dict[tuple[int, int], dict[str, float]] = {}
    angle_constraints: list[dict[str, Any]] = []
    comp_offset_x = 0.0

    for root in range(n):
        if placed[root]:
            continue

        comp_nodes: list[int] = []
        seen = {root}
        bfs_q = [root]
        while bfs_q:
            cur = bfs_q.pop(0)
            comp_nodes.append(cur)
            for nb in adj[cur]:
                if nb not in seen:
                    seen.add(nb)
                    bfs_q.append(nb)
        comp_set = set(comp_nodes)

        queue: list[tuple[int, int | None, dict[str, float]]] = []
        comp_ring_atoms = [aid for aid in comp_nodes if aid in ring_atoms]
        primary_cycle = next((c for c in cycles if c and c[0] in comp_set), None)

        if len(comp_ring_atoms) >= 3 and rdkit_coords_2d is not None:
            ring_index_in_cycle: dict[int, int] = {}
            for cyc in cycles:
                for idx, aid in enumerate(cyc):
                    if aid not in ring_index_in_cycle:
                        ring_index_in_cycle[aid] = idx

            r_cx = sum(rdkit_coords_2d[aid]["x"] for aid in comp_ring_atoms) / len(comp_ring_atoms)
            r_cy = sum(rdkit_coords_2d[aid]["y"] for aid in comp_ring_atoms) / len(comp_ring_atoms)

            for atom_id in comp_ring_atoms:
                a = analyses[atom_id]
                is_flat = (
                    a["hybridization"] in ("sp\u00b2", "sp")
                    or a["atom"]["isAromatic"]
                )
                c_idx = ring_index_in_cycle.get(atom_id, 0)
                pucker_z = 0.0 if is_flat else (0.24 if c_idx % 2 == 0 else -0.24)
                positions[atom_id] = _v3(
                    comp_offset_x + (rdkit_coords_2d[atom_id]["x"] - r_cx) * 1.44,
                    (rdkit_coords_2d[atom_id]["y"] - r_cy) * 1.44,
                    pucker_z,
                )
                placed[atom_id] = True

            for atom_id in comp_ring_atoms:
                placed_nbs = [nid for nid in analyses[atom_id]["neighborIds"] if placed[nid]]
                unplaced_nbs = [nid for nid in analyses[atom_id]["neighborIds"] if not placed[nid]]
                if not unplaced_nbs:
                    continue
                out_dir = _v3(1, 0, 0)
                if placed_nbs:
                    sum_nb = _v3(0, 0, 0)
                    for pid in placed_nbs:
                        sum_nb = _add(sum_nb, positions[pid])
                    avg_nb = _scale(sum_nb, 1.0 / len(placed_nbs))
                    diff = _sub(positions[atom_id], avg_nb)
                    out_dir = _normalize(diff) if _len(diff) > 1e-4 else _v3(1, 0, 0)

                a_info = analyses[atom_id]
                if len(unplaced_nbs) == 1:
                    cid = unplaced_nbs[0]
                    b_obj = bond_map[(atom_id, cid)]
                    b_len = _get_ideal_bond_length(
                        a_info["covalentRadius"],
                        analyses[cid]["covalentRadius"],
                        b_obj["order"],
                        b_obj["isAromatic"],
                    )
                    positions[cid] = _add(positions[atom_id], _scale(out_dir, b_len))
                    placed[cid] = True
                    queue.append((cid, atom_id, _v3(0, 0, 1)))
                else:
                    for s_idx, cid in enumerate(unplaced_nbs):
                        z_sign = 1.0 if s_idx % 2 == 0 else -1.0
                        sub_dir = _normalize(_add(_scale(out_dir, 0.72), _v3(0, 0, 0.7 * z_sign)))
                        b_obj = bond_map[(atom_id, cid)]
                        sub_len = _get_ideal_bond_length(
                            a_info["covalentRadius"],
                            analyses[cid]["covalentRadius"],
                            b_obj["order"],
                            b_obj["isAromatic"],
                        )
                        positions[cid] = _add(positions[atom_id], _scale(sub_dir, sub_len))
                        placed[cid] = True
                        queue.append((cid, atom_id, _v3(0, 0, 1)))

        elif primary_cycle and len(primary_cycle) >= 3:
            k_len = len(primary_cycle)
            is_flat_ring = all(
                analyses[aid]["hybridization"] in ("sp\u00b2", "sp")
                or analyses[aid]["atom"]["isAromatic"]
                for aid in primary_cycle
            )
            radius = 1.44 / (2.0 * math.sin(math.pi / k_len))
            for idx, atom_id in enumerate(primary_cycle):
                theta = (idx * 2.0 * math.pi) / k_len
                pucker_z = 0.0 if is_flat_ring else (0.24 if idx % 2 == 0 else -0.24)
                positions[atom_id] = _v3(
                    comp_offset_x + radius * math.cos(theta),
                    radius * math.sin(theta),
                    pucker_z,
                )
                placed[atom_id] = True

            for idx, atom_id in enumerate(primary_cycle):
                prev_ring = primary_cycle[(idx - 1 + k_len) % k_len]
                next_ring = primary_cycle[(idx + 1) % k_len]
                unplaced_nbs = [nid for nid in analyses[atom_id]["neighborIds"] if not placed[nid]]
                if not unplaced_nbs:
                    continue
                out_dir = _normalize(
                    _sub(
                        positions[atom_id],
                        _scale(_add(positions[prev_ring], positions[next_ring]), 0.5),
                    )
                )
                a_info = analyses[atom_id]
                if len(unplaced_nbs) == 1:
                    cid = unplaced_nbs[0]
                    b_obj = bond_map[(atom_id, cid)]
                    b_len = _get_ideal_bond_length(
                        a_info["covalentRadius"],
                        analyses[cid]["covalentRadius"],
                        b_obj["order"],
                        b_obj["isAromatic"],
                    )
                    positions[cid] = _add(positions[atom_id], _scale(out_dir, b_len))
                    placed[cid] = True
                    queue.append((cid, atom_id, _v3(0, 0, 1)))
                else:
                    for s_idx, cid in enumerate(unplaced_nbs):
                        z_sign = 1.0 if s_idx % 2 == 0 else -1.0
                        sub_dir = _normalize(_add(_scale(out_dir, 0.72), _v3(0, 0, 0.7 * z_sign)))
                        b_obj = bond_map[(atom_id, cid)]
                        sub_len = _get_ideal_bond_length(
                            a_info["covalentRadius"],
                            analyses[cid]["covalentRadius"],
                            b_obj["order"],
                            b_obj["isAromatic"],
                        )
                        positions[cid] = _add(positions[atom_id], _scale(sub_dir, sub_len))
                        placed[cid] = True
                        queue.append((cid, atom_id, _v3(0, 0, 1)))
        else:
            best_start = root
            best_score = -1
            for aid in comp_nodes:
                a = analyses[aid]
                heavy_deg = sum(
                    1 for nid in a["neighborIds"] if analyses[nid]["atom"]["symbol"] != "H"
                )
                score = (
                    (0 if a["atom"]["symbol"] == "H" else 100)
                    + (20 if aid in ring_atoms else 0)
                    + heavy_deg * 10
                    + a["sigmaBonds"]
                )
                if score > best_score:
                    best_score = score
                    best_start = aid

            positions[best_start] = _v3(comp_offset_x, 0, 0)
            placed[best_start] = True
            bond_dirs0, _ = _get_vsepr_template(
                analyses[best_start]["stericNumber"],
                analyses[best_start]["sigmaBonds"],
                analyses[best_start]["localizedLonePairs"],
            )
            queue.append((best_start, None, _v3(0, 0, 1)))

            for i, nb in enumerate(analyses[best_start]["neighborIds"]):
                d = bond_dirs0[i] if i < len(bond_dirs0) else _normalize(_v3(math.cos(i), math.sin(i), 0.3))
                assigned_slot[(best_start, nb)] = d
                b_obj = bond_map[(best_start, nb)]
                b_len = _get_ideal_bond_length(
                    analyses[best_start]["covalentRadius"],
                    analyses[nb]["covalentRadius"],
                    b_obj["order"],
                    b_obj["isAromatic"],
                )
                if not placed[nb]:
                    positions[nb] = _add(positions[best_start], _scale(d, b_len))
                    placed[nb] = True
                    queue.append((nb, best_start, _any_perp(d)))

        step_counter = 0
        while queue:
            atom_id, parent_id, plane_normal = queue.pop(0)
            if parent_id is None:
                continue
            step_counter += 1
            analysis = analyses[atom_id]
            children = [cid for cid in analysis["neighborIds"] if not placed[cid]]
            if not children:
                continue

            tpl_bonds, _ = _get_vsepr_template(
                analysis["stericNumber"],
                analysis["sigmaBonds"],
                analysis["localizedLonePairs"],
            )
            to_parent_dir = _normalize(_sub(positions[parent_id], positions[atom_id]))
            slot0 = tpl_bonds[0] if tpl_bonds else _v3(1, 0, 0)
            rotated_dirs = [_align_direction(d, slot0, to_parent_dir) for d in tpl_bonds]

            is_sp2_or_arom = analysis["hybridization"] == "sp\u00b2" or analysis["atom"]["isAromatic"]
            desired_twist = 0.0 if is_sp2_or_arom else (0.0 if step_counter % 2 == 0 else math.pi / 3.0)

            if len(rotated_dirs) > 1:
                cur_second = _normalize(
                    _sub(rotated_dirs[1], _scale(to_parent_dir, _dot(rotated_dirs[1], to_parent_dir)))
                )
                parent_ref = _normalize(
                    _sub(plane_normal, _scale(to_parent_dir, _dot(plane_normal, to_parent_dir)))
                )
                if _len(cur_second) > 1e-4 and _len(parent_ref) > 1e-4:
                    target_dir = (
                        _normalize(_cross(to_parent_dir, parent_ref))
                        if is_sp2_or_arom
                        else _rotate_around_axis(parent_ref, to_parent_dir, desired_twist)
                    )
                    cos_tw = max(-1.0, min(1.0, _dot(cur_second, target_dir)))
                    sin_tw = _dot(to_parent_dir, _cross(cur_second, target_dir))
                    twist_angle = math.atan2(sin_tw, cos_tw)
                    for k in range(1, len(rotated_dirs)):
                        rotated_dirs[k] = _rotate_around_axis(
                            rotated_dirs[k], to_parent_dir, twist_angle
                        )

            assigned_slot[(atom_id, parent_id)] = to_parent_dir

            sorted_children = sorted(
                children,
                key=lambda cid: (
                    (2 if cid in ring_atoms else 0)
                    + (1 if analyses[cid]["atom"]["symbol"] != "H" else 0)
                ),
                reverse=True,
            )

            for i, child_id in enumerate(sorted_children):
                if i + 1 < len(rotated_dirs):
                    d = rotated_dirs[i + 1]
                else:
                    d = _normalize(
                        _rotate_around_axis(
                            _any_perp(to_parent_dir), to_parent_dir, (i * math.pi * 2.0) / 3.0
                        )
                    )
                if (
                    atom_id in ring_atoms
                    and child_id in ring_atoms
                    and analysis["hybridization"] == "sp\u00b3"
                ):
                    pucker_sign = 1.0 if step_counter % 2 == 0 else -1.0
                    d = _normalize(_add(d, _scale(plane_normal, 0.25 * pucker_sign)))

                assigned_slot[(atom_id, child_id)] = d
                b_obj = bond_map[(atom_id, child_id)]
                b_len = _get_ideal_bond_length(
                    analysis["covalentRadius"],
                    analyses[child_id]["covalentRadius"],
                    b_obj["order"],
                    b_obj["isAromatic"],
                )
                if not placed[child_id]:
                    positions[child_id] = _add(positions[atom_id], _scale(d, b_len))
                    placed[child_id] = True
                    cr = _cross(to_parent_dir, d)
                    next_normal = _normalize(cr) if _len(cr) > 1e-4 else plane_normal
                    queue.append((child_id, atom_id, next_normal))

        for center_id in comp_nodes:
            a = analyses[center_id]
            nbs = a["neighborIds"]
            if len(nbs) < 2:
                continue
            tpl_bonds, _ = _get_vsepr_template(
                a["stericNumber"], a["sigmaBonds"], a["localizedLonePairs"]
            )
            for i in range(len(nbs)):
                for j in range(i + 1, len(nbs)):
                    u, v = nbs[i], nbs[j]
                    d1 = assigned_slot.get((center_id, u)) or (
                        tpl_bonds[i] if i < len(tpl_bonds) else None
                    )
                    d2 = assigned_slot.get((center_id, v)) or (
                        tpl_bonds[j] if j < len(tpl_bonds) else None
                    )
                    target_cos = -0.5
                    if d1 and d2:
                        target_cos = max(-1.0, min(1.0, _dot(_normalize(d1), _normalize(d2))))
                    elif a["stericNumber"] == 2:
                        target_cos = -1.0
                    elif a["stericNumber"] == 3:
                        target_cos = math.cos(math.radians(120))
                    elif a["stericNumber"] == 4:
                        target_cos = math.cos(math.radians(109.47))

                    ideal_deg = math.degrees(math.acos(target_cos))
                    angle_constraints.append(
                        {
                            "center": center_id,
                            "a": u,
                            "b": v,
                            "targetCos": target_cos,
                            "idealDeg": ideal_deg,
                            "k": 0.55 if a["stericNumber"] >= 5 else 0.45,
                        }
                    )

        max_x = max([comp_offset_x] + [positions[nid]["x"] for nid in comp_nodes])
        comp_offset_x = max_x + 4.0

    return positions, angle_constraints


def _relax_geometry(
    positions: list[dict[str, float]],
    analyses: list[dict[str, Any]],
    bonds: list[dict[str, Any]],
    angle_constraints: list[dict[str, Any]],
) -> list[dict[str, float]]:
    n = len(positions)
    if n <= 1:
        return positions

    pos = [dict(p) for p in positions]
    forces = [_v3(0, 0, 0) for _ in range(n)]

    bonded_pairs: set[tuple[int, int]] = set()
    bond_specs = []
    for b in bonds:
        f_id, t_id = b["from"], b["to"]
        bonded_pairs.add((f_id, t_id))
        bonded_pairs.add((t_id, f_id))
        bond_specs.append(
            {
                "from": f_id,
                "to": t_id,
                "targetLen": _get_ideal_bond_length(
                    analyses[f_id]["covalentRadius"],
                    analyses[t_id]["covalentRadius"],
                    b["order"],
                    b["isAromatic"],
                ),
            }
        )

    one_three_pairs: set[tuple[int, int]] = set()
    for ac in angle_constraints:
        one_three_pairs.add((ac["a"], ac["b"]))
        one_three_pairs.add((ac["b"], ac["a"]))

    sp2_centers = [
        {"center": a["atom"]["id"], "nbs": a["neighborIds"]}
        for a in analyses
        if (a["hybridization"] == "sp\u00b2" or a["atom"]["isAromatic"])
        and len(a["neighborIds"]) == 3
    ]
    double_bonds = [b for b in bonds if b["order"] == 2 or b["isAromatic"]]

    iterations = 220 if n > 40 else 320
    step_size = 0.14

    for it in range(iterations):
        for f in forces:
            f["x"] = 0.0
            f["y"] = 0.0
            f["z"] = 0.0

        for b in bond_specs:
            f_i, t_i = b["from"], b["to"]
            dx = pos[t_i]["x"] - pos[f_i]["x"]
            dy = pos[t_i]["y"] - pos[f_i]["y"]
            dz = pos[t_i]["z"] - pos[f_i]["z"]
            dist = math.sqrt(dx * dx + dy * dy + dz * dz) or 1e-4
            diff = (dist - b["targetLen"]) / dist
            k_bond = 1.6
            fx, fy, fz = dx * diff * k_bond, dy * diff * k_bond, dz * diff * k_bond
            forces[f_i]["x"] += fx
            forces[f_i]["y"] += fy
            forces[f_i]["z"] += fz
            forces[t_i]["x"] -= fx
            forces[t_i]["y"] -= fy
            forces[t_i]["z"] -= fz

        for ac in angle_constraints:
            c = pos[ac["center"]]
            pa = pos[ac["a"]]
            pb = pos[ac["b"]]
            va = _sub(pa, c)
            vb = _sub(pb, c)
            la = _len(va) or 1e-4
            lb = _len(vb) or 1e-4
            ua = _scale(va, 1.0 / la)
            ub = _scale(vb, 1.0 / lb)
            cur_cos = max(-1.0, min(1.0, _dot(ua, ub)))
            d_cos = cur_cos - ac["targetCos"]
            grad_a = _scale(_sub(ub, _scale(ua, cur_cos)), (-ac["k"] * d_cos) / la)
            grad_b = _scale(_sub(ua, _scale(ub, cur_cos)), (-ac["k"] * d_cos) / lb)
            forces[ac["a"]]["x"] += grad_a["x"]
            forces[ac["a"]]["y"] += grad_a["y"]
            forces[ac["a"]]["z"] += grad_a["z"]
            forces[ac["b"]]["x"] += grad_b["x"]
            forces[ac["b"]]["y"] += grad_b["y"]
            forces[ac["b"]]["z"] += grad_b["z"]
            forces[ac["center"]]["x"] -= grad_a["x"] + grad_b["x"]
            forces[ac["center"]]["y"] -= grad_a["y"] + grad_b["y"]
            forces[ac["center"]]["z"] -= grad_a["z"] + grad_b["z"]

        for sp2 in sp2_centers:
            nbs = sp2["nbs"]
            p0, p1, p2 = pos[nbs[0]], pos[nbs[1]], pos[nbs[2]]
            normal = _cross(_sub(p1, p0), _sub(p2, p0))
            area = _len(normal)
            if area < 1e-5:
                continue
            unit_n = _scale(normal, 1.0 / area)
            pc = pos[sp2["center"]]
            out_of_plane = _dot(_sub(pc, p0), unit_n)
            push = _scale(unit_n, -out_of_plane * 0.6)
            forces[sp2["center"]]["x"] += push["x"]
            forces[sp2["center"]]["y"] += push["y"]
            forces[sp2["center"]]["z"] += push["z"]
            for nid in nbs:
                forces[nid]["x"] -= push["x"] / 3.0
                forces[nid]["y"] -= push["y"] / 3.0
                forces[nid]["z"] -= push["z"] / 3.0

        for db in double_bonds:
            a_info = analyses[db["from"]]
            b_info = analyses[db["to"]]
            if len(a_info["neighborIds"]) < 2 or len(b_info["neighborIds"]) < 2:
                continue
            a_other = [nid for nid in a_info["neighborIds"] if nid != db["to"]]
            b_other = [nid for nid in b_info["neighborIds"] if nid != db["from"]]
            if not a_other or not b_other:
                continue
            axis = _normalize(_sub(pos[db["to"]], pos[db["from"]]))
            na = _cross(axis, _sub(pos[a_other[0]], pos[db["from"]]))
            nb = _cross(axis, _sub(pos[b_other[0]], pos[db["to"]]))
            la, lb = _len(na), _len(nb)
            if la < 1e-4 or lb < 1e-4:
                continue
            una, unb = _scale(na, 1.0 / la), _scale(nb, 1.0 / lb)
            sign = 1.0 if _dot(una, unb) >= 0 else -1.0
            diff_n = _sub(_scale(unb, sign), una)
            f_a = _scale(_cross(diff_n, axis), 0.16)
            forces[a_other[0]]["x"] += f_a["x"]
            forces[a_other[0]]["y"] += f_a["y"]
            forces[a_other[0]]["z"] += f_a["z"]
            forces[b_other[0]]["x"] -= f_a["x"]
            forces[b_other[0]]["y"] -= f_a["y"]
            forces[b_other[0]]["z"] -= f_a["z"]

        for i in range(n):
            vdw_i = analyses[i]["vdwRadius"]
            pi = pos[i]
            for j in range(i + 1, n):
                if (i, j) in bonded_pairs or (i, j) in one_three_pairs:
                    continue
                pj = pos[j]
                dx = pj["x"] - pi["x"]
                dy = pj["y"] - pi["y"]
                dz = pj["z"] - pi["z"]
                d2 = dx * dx + dy * dy + dz * dz
                min_dist = (vdw_i + analyses[j]["vdwRadius"]) * 0.62
                if d2 < min_dist * min_dist:
                    d = math.sqrt(d2) or 1e-3
                    overlap = (min_dist - d) / d
                    k_rep = 0.28
                    fx, fy, fz = dx * overlap * k_rep, dy * overlap * k_rep, dz * overlap * k_rep
                    forces[i]["x"] -= fx
                    forces[i]["y"] -= fy
                    forces[i]["z"] -= fz
                    forces[j]["x"] += fx
                    forces[j]["y"] += fy
                    forces[j]["z"] += fz

        cooling = 1.0 - (it / iterations) * 0.45
        for i in range(n):
            fx = forces[i]["x"] * step_size * cooling
            fy = forces[i]["y"] * step_size * cooling
            fz = forces[i]["z"] * step_size * cooling
            mag = math.sqrt(fx * fx + fy * fy + fz * fz)
            if mag > 0.25:
                s = 0.25 / mag
                fx *= s
                fy *= s
                fz *= s
            pos[i]["x"] += fx
            pos[i]["y"] += fy
            pos[i]["z"] += fz

    cx = sum(p["x"] for p in pos) / n
    cy = sum(p["y"] for p in pos) / n
    cz = sum(p["z"] for p in pos) / n
    for p in pos:
        p["x"] -= cx
        p["y"] -= cy
        p["z"] -= cz
    return pos


def _compute_lone_pair_directions(
    atom_idx: int,
    positions: list[dict[str, float]],
    analyses: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    a = analyses[atom_idx]
    if a["lonePairs"] == 0:
        return []

    pos = positions[atom_idx]
    neighbor_dirs = [_normalize(_sub(positions[nid], pos)) for nid in a["neighborIds"]]
    result: list[dict[str, Any]] = []

    def get_adjacent_plane_normal() -> dict[str, float]:
        for nid in a["neighborIds"]:
            nb = analyses[nid]
            if len(nb["neighborIds"]) >= 2:
                other_id = next((oid for oid in nb["neighborIds"] if oid != atom_idx), None)
                if other_id is not None:
                    v1 = _normalize(_sub(positions[nid], pos))
                    v2 = _normalize(_sub(positions[other_id], positions[nid]))
                    cr = _cross(v1, v2)
                    if _len(cr) > 1e-4:
                        return _normalize(cr)
        return _v3(0, 0, 1)

    if a["delocalizedLonePairs"] > 0:
        normal = _v3(0, 1, 0)
        if len(neighbor_dirs) >= 2:
            cr = _cross(neighbor_dirs[0], neighbor_dirs[1])
            normal = _normalize(cr) if _len(cr) > 1e-4 else get_adjacent_plane_normal()
        else:
            normal = get_adjacent_plane_normal()
        result.append(
            {
                "direction": normal,
                "orbitalType": "pi-delocalized",
                "label": "p orbital (\u03c0-conjugated)",
            }
        )

    k = len(neighbor_dirs)
    l_cnt = a["localizedLonePairs"]
    if l_cnt <= 0:
        return result

    hyb = a["hybridization"]

    if k == 0:
        oct4 = [_v3(0, 1, 0), _v3(0, -1, 0), _v3(1, 0, 0), _v3(-1, 0, 0)]
        for i in range(l_cnt):
            result.append(
                {
                    "direction": oct4[i % len(oct4)],
                    "orbitalType": "localized",
                    "label": f"{hyb} lone pair",
                }
            )
        return result

    if k == 1:
        u = neighbor_dirs[0]
        opp = _scale(u, -1.0)
        plane_n = get_adjacent_plane_normal()
        cr_op = _cross(opp, plane_n)
        in_plane_perp = _normalize(cr_op) if _len(cr_op) > 1e-4 else _any_perp(opp)

        if l_cnt == 1:
            result.append(
                {"direction": opp, "orbitalType": "localized", "label": f"{hyb} lone pair"}
            )
        elif l_cnt == 2:
            ang = math.radians(60)
            for sgn in (1.0, -1.0):
                d = _normalize(
                    _add(_scale(opp, math.cos(ang)), _scale(in_plane_perp, sgn * math.sin(ang)))
                )
                result.append(
                    {"direction": d, "orbitalType": "localized", "label": f"{hyb} lone pair"}
                )
        else:
            cone_ang = math.radians(70.53)
            for i in range(l_cnt):
                az = (i * 2.0 * math.pi) / l_cnt
                radial = _rotate_around_axis(in_plane_perp, opp, az)
                d = _normalize(
                    _add(_scale(opp, math.cos(cone_ang)), _scale(radial, math.sin(cone_ang)))
                )
                result.append(
                    {"direction": d, "orbitalType": "localized", "label": f"{hyb} lone pair"}
                )
        return result

    if k == 2:
        u1, u2 = neighbor_dirs[0], neighbor_dirs[1]
        d_dot = _dot(u1, u2)
        sum_vec = _add(u1, u2)
        bisector = _normalize(_scale(sum_vec, -1.0)) if _len(sum_vec) > 1e-3 else _any_perp(u1)
        cr12 = _cross(u1, u2)
        plane_n = _normalize(cr12) if _len(cr12) > 1e-3 else _any_perp(u1)

        if l_cnt == 1:
            result.append(
                {"direction": bisector, "orbitalType": "localized", "label": f"{hyb} lone pair"}
            )
        elif l_cnt == 2:
            half = math.radians(54.735)
            for sgn in (1.0, -1.0):
                d = _normalize(
                    _add(_scale(bisector, math.cos(half)), _scale(plane_n, sgn * math.sin(half)))
                )
                result.append(
                    {"direction": d, "orbitalType": "localized", "label": f"{hyb} lone pair"}
                )
        elif l_cnt == 3 and d_dot < -0.7:
            perp = _any_perp(u1)
            for i in range(3):
                result.append(
                    {
                        "direction": _rotate_around_axis(perp, u1, (i * 2.0 * math.pi) / 3.0),
                        "orbitalType": "localized",
                        "label": f"{hyb} eq. lone pair",
                    }
                )
        else:
            result.append(
                {"direction": bisector, "orbitalType": "localized", "label": f"{hyb} lone pair"}
            )
        return result

    if k == 3:
        u1, u2, u3 = neighbor_dirs[0], neighbor_dirs[1], neighbor_dirs[2]
        if l_cnt == 1:
            s_vec = _add(_add(u1, u2), u3)
            d = _normalize(_scale(s_vec, -1.0)) if _len(s_vec) > 1e-3 else _normalize(_cross(u1, u2))
            result.append(
                {"direction": d, "orbitalType": "localized", "label": f"{hyb} lone pair"}
            )
        elif l_cnt == 2:
            d01, d02, d12 = _dot(u1, u2), _dot(u1, u3), _dot(u2, u3)
            ax1, ax2, eq = u1, u2, u3
            if d02 <= d01 and d02 <= d12:
                ax1, ax2, eq = u1, u3, u2
            elif d12 <= d01 and d12 <= d02:
                ax1, ax2, eq = u2, u3, u1
            ax_axis = _normalize(_sub(ax1, ax2))
            opp_eq = _normalize(_scale(eq, -1.0))
            cr_ae = _cross(ax_axis, opp_eq)
            eq_normal = _normalize(cr_ae) if _len(cr_ae) > 1e-4 else _any_perp(opp_eq)
            ang = math.radians(60)
            for sgn in (1.0, -1.0):
                d = _normalize(
                    _add(_scale(opp_eq, math.cos(ang)), _scale(eq_normal, sgn * math.sin(ang)))
                )
                result.append(
                    {"direction": d, "orbitalType": "localized", "label": f"{hyb} eq. lone pair"}
                )
        return result

    if k == 4:
        if l_cnt == 1:
            best_pair = (0, 1)
            min_dot = 2.0
            for i in range(4):
                for j in range(i + 1, 4):
                    dp = _dot(neighbor_dirs[i], neighbor_dirs[j])
                    if dp < min_dot:
                        min_dot = dp
                        best_pair = (i, j)
            eq_idxs = [idx for idx in range(4) if idx not in best_pair]
            eq_sum = _add(neighbor_dirs[eq_idxs[0]], neighbor_dirs[eq_idxs[1]])
            lp_dir = (
                _normalize(_scale(eq_sum, -1.0))
                if _len(eq_sum) > 1e-3
                else _any_perp(neighbor_dirs[best_pair[0]])
            )
            result.append(
                {"direction": lp_dir, "orbitalType": "localized", "label": f"{hyb} eq. lone pair"}
            )
        elif l_cnt == 2:
            plane_n = _v3(0, 1, 0)
            for i in range(1, 4):
                cr = _cross(neighbor_dirs[0], neighbor_dirs[i])
                if _len(cr) > 0.3:
                    plane_n = _normalize(cr)
                    break
            result.append(
                {"direction": plane_n, "orbitalType": "localized", "label": f"{hyb} ax. lone pair"}
            )
            result.append(
                {
                    "direction": _scale(plane_n, -1.0),
                    "orbitalType": "localized",
                    "label": f"{hyb} ax. lone pair",
                }
            )
        return result

    sum_all = _v3(0, 0, 0)
    for u in neighbor_dirs:
        sum_all = _add(sum_all, u)
    lp_dir = _normalize(_scale(sum_all, -1.0)) if _len(sum_all) > 1e-3 else _v3(0, -1, 0)
    result.append({"direction": lp_dir, "orbitalType": "localized", "label": f"{hyb} lone pair"})
    return result


def build_molecule_from_parsed_graph(
    parsed: dict[str, Any],
    raw_smiles: str,
    name: str | None = None,
    notes: str | None = None,
    rdkit_descriptors: dict[str, Any] | None = None,
) -> dict[str, Any]:
    analyses = analyze_vsepr(parsed)
    ring_atoms, cycles = _analyze_rings(
        len(parsed["atoms"]), parsed["bonds"], parsed.get("rdkitAtomRings")
    )
    initial_positions, angle_constraints = _generate_initial_positions(
        analyses, parsed["bonds"], ring_atoms, cycles, parsed.get("rdkitCoords2D")
    )
    positions = _relax_geometry(initial_positions, analyses, parsed["bonds"], angle_constraints)

    angle_constraint_map: dict[tuple[int, int, int], float] = {}
    for ac in angle_constraints:
        angle_constraint_map[(ac["center"], ac["a"], ac["b"])] = ac["idealDeg"]
        angle_constraint_map[(ac["center"], ac["b"], ac["a"])] = ac["idealDeg"]

    analyzed_atoms: list[dict[str, Any]] = []
    for idx, a in enumerate(analyses):
        pos = positions[idx]
        lp_orbitals = _compute_lone_pair_directions(idx, positions, analyses)

        hybrid_orbitals: list[dict[str, Any]] = []
        for nid in a["neighborIds"]:
            d = _normalize(_sub(positions[nid], pos))
            hybrid_orbitals.append(
                {
                    "direction": d,
                    "kind": "bonding",
                    "label": f'{a["hybridization"]} \u03c3-bonding',
                }
            )
        for lp in lp_orbitals:
            if lp["orbitalType"] == "localized":
                hybrid_orbitals.append(
                    {
                        "direction": lp["direction"],
                        "kind": "lone-pair",
                        "label": lp["label"],
                    }
                )

        vsepr_cage_vertices = [h["direction"] for h in hybrid_orbitals]

        measured_angles: list[dict[str, Any]] = []
        nbs = a["neighborIds"]
        for i in range(len(nbs)):
            for j in range(i + 1, len(nbs)):
                na, nb = nbs[i], nbs[j]
                va = _normalize(_sub(positions[na], pos))
                vb = _normalize(_sub(positions[nb], pos))
                cos_a = max(-1.0, min(1.0, _dot(va, vb)))
                angle_deg = math.degrees(math.acos(cos_a))
                ideal_deg = angle_constraint_map.get((idx, na, nb), angle_deg)
                measured_angles.append(
                    {
                        "atomA": na,
                        "center": idx,
                        "atomB": nb,
                        "labelA": f'{analyses[na]["atom"]["symbol"]}{na + 1}',
                        "labelB": f'{analyses[nb]["atom"]["symbol"]}{nb + 1}',
                        "angleDeg": round(angle_deg * 10) / 10,
                        "idealAngleDeg": round(ideal_deg * 10) / 10,
                    }
                )

        atom_record = dict(a["atom"])
        atom_record.update(
            {
                "name": a["name"],
                "cpkColor": a["cpkColor"],
                "covalentRadius": a["covalentRadius"],
                "vdwRadius": a["vdwRadius"],
                "valenceElectrons": a["valenceElectrons"],
                "bondOrderSum": a["bondOrderSum"],
                "sigmaBonds": a["sigmaBonds"],
                "piBonds": a["piBonds"],
                "lonePairs": a["lonePairs"],
                "localizedLonePairs": a["localizedLonePairs"],
                "delocalizedLonePairs": a["delocalizedLonePairs"],
                "unpairedElectrons": a["unpairedElectrons"],
                "stericNumber": a["stericNumber"],
                "hybridization": a["hybridization"],
                "electronGeometry": a["electronGeometry"],
                "molecularGeometry": a["molecularGeometry"],
                "axNotation": a["axNotation"],
                "idealAngleLabel": a["idealAngleLabel"],
                "orbitalSummary": a["orbitalSummary"],
                "position": pos,
                "lonePairOrbitals": lp_orbitals,
                "hybridOrbitals": hybrid_orbitals,
                "vseprCageVertices": vsepr_cage_vertices,
                "measuredAngles": measured_angles,
                "neighborIds": nbs,
            }
        )
        analyzed_atoms.append(atom_record)

    counts: dict[str, int] = {}
    total_weight = 0.0
    total_lone_pairs = 0
    total_valence_electrons = 0
    net_formal_charge = 0
    heavy_atom_count = 0
    hyb_set: list[str] = []

    for at in analyzed_atoms:
        sym = at["symbol"]
        counts[sym] = counts.get(sym, 0) + 1
        total_weight += get_element_info(sym)["atomicMass"]
        total_lone_pairs += at["lonePairs"]
        total_valence_electrons += at["valenceElectrons"] - at["formalCharge"]
        net_formal_charge += at["formalCharge"]
        if sym != "H":
            heavy_atom_count += 1
            if at["hybridization"] != "unhybridized" and at["hybridization"] not in hyb_set:
                hyb_set.append(at["hybridization"])

    def sub_digits(num: int) -> str:
        return "" if num == 1 else _to_subscript(num)

    formula_parts: list[str] = []
    if "C" in counts:
        formula_parts.append(f'C{sub_digits(counts.pop("C"))}')
        if "H" in counts:
            formula_parts.append(f'H{sub_digits(counts.pop("H"))}')
    for sym in sorted(counts.keys()):
        formula_parts.append(f"{sym}{sub_digits(counts[sym])}")
    formula = "".join(formula_parts)

    if net_formal_charge != 0:
        abs_q = abs(net_formal_charge)
        sign = "\u207a" if net_formal_charge > 0 else "\u207b"
        sup_digits = "\u2070\u00b9\u00b2\u00b3\u2074\u2075\u2076\u2077\u2078\u2079"
        sup_count = "".join(sup_digits[int(d)] for d in str(abs_q)) if abs_q > 1 else ""
        formula += f"{sup_count}{sign}"

    primary_center_id: int | None = None
    best_center_score = -1
    for at in analyzed_atoms:
        if at["symbol"] == "H":
            continue
        heavy_nbs = sum(1 for nid in at["neighborIds"] if analyzed_atoms[nid]["symbol"] != "H")
        is_hetero = 4 if at["symbol"] != "C" else 0
        terminal_penalty = -50 if at["sigmaBonds"] <= 1 else 0
        score = (
            heavy_nbs * 12
            + at["sigmaBonds"] * 5
            + at["piBonds"] * 8
            + at["stericNumber"] * 3
            + (4 if at["lonePairs"] > 0 else 0)
            + is_hetero
            + terminal_penalty
        )
        if score > best_center_score:
            best_center_score = score
            primary_center_id = at["id"]

    if primary_center_id is None and analyzed_atoms:
        primary_center_id = analyzed_atoms[0]["id"]

    computed_weight = (
        round(rdkit_descriptors["amw"] * 100) / 100
        if rdkit_descriptors and rdkit_descriptors.get("amw", 0) > 0
        else round(total_weight * 100) / 100
    )

    return {
        "atoms": analyzed_atoms,
        "bonds": parsed["bonds"],
        "summary": {
            "smiles": raw_smiles.strip(),
            "formula": formula,
            "molecularWeight": computed_weight,
            "totalAtoms": len(analyzed_atoms),
            "heavyAtomCount": heavy_atom_count,
            "totalBonds": len(parsed["bonds"]),
            "totalLonePairs": total_lone_pairs,
            "totalValenceElectrons": total_valence_electrons,
            "netFormalCharge": net_formal_charge,
            "primaryCenterId": primary_center_id,
            "hybridizationsPresent": hyb_set,
            "rdkit": rdkit_descriptors,
        },
        "name": name,
        "notes": notes,
    }


def build_molecule_with_rdkit(
    raw_smiles: str,
    name: str | None = None,
    notes: str | None = None,
) -> dict[str, Any]:
    graph, descriptors = parse_and_calculate_with_rdkit(raw_smiles)
    return build_molecule_from_parsed_graph(
        graph,
        raw_smiles,
        name=name,
        notes=notes,
        rdkit_descriptors=descriptors,
    )
