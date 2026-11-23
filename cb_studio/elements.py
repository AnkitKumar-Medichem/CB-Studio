from __future__ import annotations

ELEMENTS: dict[str, dict] = {
    "H": {"atomicNumber": 1, "symbol": "H", "name": "Hydrogen", "atomicMass": 1.008, "valenceElectrons": 1, "smilesValences": [1], "covalentRadius": 0.31, "vdwRadius": 1.2, "cpkColor": "#FFFFFF", "electronegativity": 2.2},
    "He": {"atomicNumber": 2, "symbol": "He", "name": "Helium", "atomicMass": 4.0026, "valenceElectrons": 2, "smilesValences": [0], "covalentRadius": 0.28, "vdwRadius": 1.4, "cpkColor": "#D9FFFF", "electronegativity": 0.0},
    "Li": {"atomicNumber": 3, "symbol": "Li", "name": "Lithium", "atomicMass": 6.94, "valenceElectrons": 1, "smilesValences": [1], "covalentRadius": 1.28, "vdwRadius": 1.82, "cpkColor": "#CC80FF", "electronegativity": 0.98},
    "Be": {"atomicNumber": 4, "symbol": "Be", "name": "Beryllium", "atomicMass": 9.0122, "valenceElectrons": 2, "smilesValences": [2], "covalentRadius": 0.96, "vdwRadius": 1.53, "cpkColor": "#C2FF00", "electronegativity": 1.57},
    "B": {"atomicNumber": 5, "symbol": "B", "name": "Boron", "atomicMass": 10.81, "valenceElectrons": 3, "smilesValences": [3], "covalentRadius": 0.84, "vdwRadius": 1.92, "cpkColor": "#FFB5B5", "electronegativity": 2.04},
    "C": {"atomicNumber": 6, "symbol": "C", "name": "Carbon", "atomicMass": 12.011, "valenceElectrons": 4, "smilesValences": [4], "covalentRadius": 0.76, "vdwRadius": 1.7, "cpkColor": "#333333", "electronegativity": 2.55},
    "N": {"atomicNumber": 7, "symbol": "N", "name": "Nitrogen", "atomicMass": 14.007, "valenceElectrons": 5, "smilesValences": [3, 5], "covalentRadius": 0.71, "vdwRadius": 1.55, "cpkColor": "#3050F8", "electronegativity": 3.04},
    "O": {"atomicNumber": 8, "symbol": "O", "name": "Oxygen", "atomicMass": 15.999, "valenceElectrons": 6, "smilesValences": [2], "covalentRadius": 0.66, "vdwRadius": 1.52, "cpkColor": "#FF0D0D", "electronegativity": 3.44},
    "F": {"atomicNumber": 9, "symbol": "F", "name": "Fluorine", "atomicMass": 18.998, "valenceElectrons": 7, "smilesValences": [1], "covalentRadius": 0.57, "vdwRadius": 1.47, "cpkColor": "#90E050", "electronegativity": 3.98},
    "Ne": {"atomicNumber": 10, "symbol": "Ne", "name": "Neon", "atomicMass": 20.18, "valenceElectrons": 8, "smilesValences": [0], "covalentRadius": 0.58, "vdwRadius": 1.54, "cpkColor": "#B3E3F5", "electronegativity": 0.0},
    "Na": {"atomicNumber": 11, "symbol": "Na", "name": "Sodium", "atomicMass": 22.99, "valenceElectrons": 1, "smilesValences": [1], "covalentRadius": 1.66, "vdwRadius": 2.27, "cpkColor": "#AB5CF2", "electronegativity": 0.93},
    "Mg": {"atomicNumber": 12, "symbol": "Mg", "name": "Magnesium", "atomicMass": 24.305, "valenceElectrons": 2, "smilesValences": [2], "covalentRadius": 1.41, "vdwRadius": 1.73, "cpkColor": "#8AFF00", "electronegativity": 1.31},
    "Al": {"atomicNumber": 13, "symbol": "Al", "name": "Aluminum", "atomicMass": 26.982, "valenceElectrons": 3, "smilesValences": [3], "covalentRadius": 1.21, "vdwRadius": 1.84, "cpkColor": "#BFA6A6", "electronegativity": 1.61},
    "Si": {"atomicNumber": 14, "symbol": "Si", "name": "Silicon", "atomicMass": 28.085, "valenceElectrons": 4, "smilesValences": [4], "covalentRadius": 1.11, "vdwRadius": 2.1, "cpkColor": "#F0C8A0", "electronegativity": 1.9},
    "P": {"atomicNumber": 15, "symbol": "P", "name": "Phosphorus", "atomicMass": 30.974, "valenceElectrons": 5, "smilesValences": [3, 5], "covalentRadius": 1.07, "vdwRadius": 1.8, "cpkColor": "#FF8000", "electronegativity": 2.19},
    "S": {"atomicNumber": 16, "symbol": "S", "name": "Sulfur", "atomicMass": 32.06, "valenceElectrons": 6, "smilesValences": [2, 4, 6], "covalentRadius": 1.05, "vdwRadius": 1.8, "cpkColor": "#FFFF30", "electronegativity": 2.58},
    "Cl": {"atomicNumber": 17, "symbol": "Cl", "name": "Chlorine", "atomicMass": 35.45, "valenceElectrons": 7, "smilesValences": [1, 3, 5, 7], "covalentRadius": 1.02, "vdwRadius": 1.75, "cpkColor": "#1FF01F", "electronegativity": 3.16},
    "Ar": {"atomicNumber": 18, "symbol": "Ar", "name": "Argon", "atomicMass": 39.948, "valenceElectrons": 8, "smilesValences": [0], "covalentRadius": 1.06, "vdwRadius": 1.88, "cpkColor": "#80D1E3", "electronegativity": 0.0},
    "K": {"atomicNumber": 19, "symbol": "K", "name": "Potassium", "atomicMass": 39.098, "valenceElectrons": 1, "smilesValences": [1], "covalentRadius": 2.03, "vdwRadius": 2.75, "cpkColor": "#8F40D4", "electronegativity": 0.82},
    "Ca": {"atomicNumber": 20, "symbol": "Ca", "name": "Calcium", "atomicMass": 40.078, "valenceElectrons": 2, "smilesValences": [2], "covalentRadius": 1.76, "vdwRadius": 2.31, "cpkColor": "#3DFF00", "electronegativity": 1.0},
    "Fe": {"atomicNumber": 26, "symbol": "Fe", "name": "Iron", "atomicMass": 55.845, "valenceElectrons": 8, "smilesValences": [2, 3], "covalentRadius": 1.32, "vdwRadius": 2.0, "cpkColor": "#E06633", "electronegativity": 1.83},
    "Cu": {"atomicNumber": 29, "symbol": "Cu", "name": "Copper", "atomicMass": 63.546, "valenceElectrons": 11, "smilesValences": [1, 2], "covalentRadius": 1.32, "vdwRadius": 1.4, "cpkColor": "#C88033", "electronegativity": 1.9},
    "Zn": {"atomicNumber": 30, "symbol": "Zn", "name": "Zinc", "atomicMass": 65.38, "valenceElectrons": 2, "smilesValences": [2], "covalentRadius": 1.22, "vdwRadius": 1.39, "cpkColor": "#7D80B0", "electronegativity": 1.65},
    "Ga": {"atomicNumber": 31, "symbol": "Ga", "name": "Gallium", "atomicMass": 69.723, "valenceElectrons": 3, "smilesValences": [3], "covalentRadius": 1.22, "vdwRadius": 1.87, "cpkColor": "#C28F8F", "electronegativity": 1.81},
    "Ge": {"atomicNumber": 32, "symbol": "Ge", "name": "Germanium", "atomicMass": 72.63, "valenceElectrons": 4, "smilesValences": [4], "covalentRadius": 1.2, "vdwRadius": 2.11, "cpkColor": "#668F8F", "electronegativity": 2.01},
    "As": {"atomicNumber": 33, "symbol": "As", "name": "Arsenic", "atomicMass": 74.922, "valenceElectrons": 5, "smilesValences": [3, 5], "covalentRadius": 1.19, "vdwRadius": 1.85, "cpkColor": "#BD80E3", "electronegativity": 2.18},
    "Se": {"atomicNumber": 34, "symbol": "Se", "name": "Selenium", "atomicMass": 78.971, "valenceElectrons": 6, "smilesValences": [2, 4, 6], "covalentRadius": 1.2, "vdwRadius": 1.9, "cpkColor": "#FFA100", "electronegativity": 2.55},
    "Br": {"atomicNumber": 35, "symbol": "Br", "name": "Bromine", "atomicMass": 79.904, "valenceElectrons": 7, "smilesValences": [1, 3, 5, 7], "covalentRadius": 1.2, "vdwRadius": 1.85, "cpkColor": "#A62929", "electronegativity": 2.96},
    "Kr": {"atomicNumber": 36, "symbol": "Kr", "name": "Krypton", "atomicMass": 83.798, "valenceElectrons": 8, "smilesValences": [0, 2, 4], "covalentRadius": 1.16, "vdwRadius": 2.02, "cpkColor": "#5CB8D1", "electronegativity": 3.0},
    "Sn": {"atomicNumber": 50, "symbol": "Sn", "name": "Tin", "atomicMass": 118.71, "valenceElectrons": 4, "smilesValences": [2, 4], "covalentRadius": 1.39, "vdwRadius": 2.17, "cpkColor": "#668080", "electronegativity": 1.96},
    "Sb": {"atomicNumber": 51, "symbol": "Sb", "name": "Antimony", "atomicMass": 121.76, "valenceElectrons": 5, "smilesValences": [3, 5], "covalentRadius": 1.39, "vdwRadius": 2.06, "cpkColor": "#9E63B5", "electronegativity": 2.05},
    "Te": {"atomicNumber": 52, "symbol": "Te", "name": "Tellurium", "atomicMass": 127.6, "valenceElectrons": 6, "smilesValences": [2, 4, 6], "covalentRadius": 1.38, "vdwRadius": 2.06, "cpkColor": "#D47A00", "electronegativity": 2.1},
    "I": {"atomicNumber": 53, "symbol": "I", "name": "Iodine", "atomicMass": 126.9, "valenceElectrons": 7, "smilesValences": [1, 3, 5, 7], "covalentRadius": 1.39, "vdwRadius": 1.98, "cpkColor": "#940094", "electronegativity": 2.66},
    "Xe": {"atomicNumber": 54, "symbol": "Xe", "name": "Xenon", "atomicMass": 131.29, "valenceElectrons": 8, "smilesValences": [0, 2, 4, 6], "covalentRadius": 1.4, "vdwRadius": 2.16, "cpkColor": "#429EB0", "electronegativity": 2.6},
    "Pt": {"atomicNumber": 78, "symbol": "Pt", "name": "Platinum", "atomicMass": 195.08, "valenceElectrons": 10, "smilesValences": [2, 4], "covalentRadius": 1.36, "vdwRadius": 1.75, "cpkColor": "#D0D0E0", "electronegativity": 2.28},
    "Au": {"atomicNumber": 79, "symbol": "Au", "name": "Gold", "atomicMass": 196.97, "valenceElectrons": 11, "smilesValences": [1, 3], "covalentRadius": 1.36, "vdwRadius": 1.66, "cpkColor": "#FFD123", "electronegativity": 2.54},
    "Hg": {"atomicNumber": 80, "symbol": "Hg", "name": "Mercury", "atomicMass": 200.59, "valenceElectrons": 2, "smilesValences": [1, 2], "covalentRadius": 1.32, "vdwRadius": 1.55, "cpkColor": "#B8B8D0", "electronegativity": 2.0},
    "Pb": {"atomicNumber": 82, "symbol": "Pb", "name": "Lead", "atomicMass": 207.2, "valenceElectrons": 4, "smilesValences": [2, 4], "covalentRadius": 1.46, "vdwRadius": 2.02, "cpkColor": "#575961", "electronegativity": 2.33},
    "Bi": {"atomicNumber": 83, "symbol": "Bi", "name": "Bismuth", "atomicMass": 208.98, "valenceElectrons": 5, "smilesValences": [3, 5], "covalentRadius": 1.48, "vdwRadius": 2.07, "cpkColor": "#9E4FB5", "electronegativity": 2.02},
}

BY_ATOMIC_NUMBER: dict[int, dict] = {
    info["atomicNumber"]: info
    for info in ELEMENTS.values()
    if info["atomicNumber"] > 0
}

FALLBACK_SYMBOLS: dict[int, str] = {
    21: "Sc", 22: "Ti", 23: "V", 24: "Cr", 25: "Mn", 27: "Co", 28: "Ni",
    37: "Rb", 38: "Sr", 39: "Y", 40: "Zr", 41: "Nb", 42: "Mo", 43: "Tc",
    44: "Ru", 45: "Rh", 46: "Pd", 47: "Ag", 48: "Cd", 49: "In",
    55: "Cs", 56: "Ba", 72: "Hf", 73: "Ta", 74: "W", 75: "Re", 76: "Os",
    77: "Ir", 81: "Tl", 86: "Rn", 87: "Fr", 88: "Ra",
}


def get_element_by_atomic_number(z: int) -> dict:
    found = BY_ATOMIC_NUMBER.get(z)
    if found:
        return found
    sym = FALLBACK_SYMBOLS.get(z, f"Z{z}")
    return {
        "atomicNumber": z,
        "symbol": sym,
        "name": sym,
        "atomicMass": max(1.0, z * 2.1),
        "valenceElectrons": 4,
        "smilesValences": [2, 4],
        "covalentRadius": 1.35,
        "vdwRadius": 1.85,
        "cpkColor": "#94A3B8",
        "electronegativity": 1.9,
    }


def get_element_info(symbol: str) -> dict:
    normalized = (
        symbol[0].upper() + symbol[1:].lower()
        if len(symbol) > 1
        else symbol.upper()
    )
    return ELEMENTS.get(
        normalized,
        {
            "atomicNumber": 0,
            "symbol": normalized,
            "name": normalized,
            "atomicMass": 12.0,
            "valenceElectrons": 4,
            "smilesValences": [4],
            "covalentRadius": 0.95,
            "vdwRadius": 1.75,
            "cpkColor": "#94A3B8",
            "electronegativity": 2.0,
        },
    )
