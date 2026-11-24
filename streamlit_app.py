from __future__ import annotations

import hashlib
import importlib
import os
from pathlib import Path
import shutil
import tempfile

import streamlit as st
import streamlit.components.v1 as components

import cb_studio.chemistry as _cb_chemistry
import cb_studio.frontend as _cb_frontend
import cb_studio.presets as _cb_presets
import cb_studio.styles as _cb_styles

st.set_page_config(
    page_title="CB Studio",
    layout="wide",
    initial_sidebar_state="collapsed",
)

st.markdown(
    """
    <style>
      html, body, [data-testid="stAppViewContainer"], [data-testid="stMain"], .main {
        background-color: #ffffff;
        overflow: hidden;
        height: 100vh;
        height: 100dvh;
      }
      header[data-testid="stHeader"],
      [data-testid="stToolbar"],
      [data-testid="stDecoration"],
      [data-testid="stStatusWidget"],
      #MainMenu,
      footer {
        display: none !important;
      }
      [data-testid="stMainBlockContainer"],
      [data-testid="stAppViewBlockContainer"],
      section.main > div.block-container,
      .block-container {
        padding: 0 !important;
        margin: 0 !important;
        max-width: 100% !important;
      }
      [data-testid="stVerticalBlock"] {
        gap: 0 !important;
      }
      [data-testid="stCustomComponentV1"],
      [data-testid="stIFrame"] {
        width: 100% !important;
        height: 100vh !important;
        height: 100dvh !important;
      }
      iframe[title*="cb_studio"],
      [data-testid="stCustomComponentV1"] iframe,
      [data-testid="stIFrame"] iframe {
        width: 100vw !important;
        height: 100vh !important;
        height: 100dvh !important;
        min-height: 480px !important;
        border: none !important;
        display: block !important;
      }
    </style>
    """,
    unsafe_allow_html=True,
)


def _compute_asset_version() -> str:
    pkg_dir = Path(__file__).resolve().parent / "cb_studio"
    hasher = hashlib.sha256()
    for rel in (
        "__init__.py",
        "chemistry.py",
        "elements.py",
        "frontend.py",
        "presets.py",
        "styles.py",
        "component/three.bundle.js",
    ):
        p = pkg_dir / rel
        if p.is_file():
            hasher.update(rel.encode("utf-8"))
            hasher.update(p.read_bytes())
    return hasher.hexdigest()[:12]


def _atomic_write_text(target: Path, content: str) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(prefix=".tmp_", suffix=target.suffix, dir=str(target.parent))
    tmp_path = Path(tmp_name)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            fh.write(content)
        os.replace(tmp_path, target)
    except Exception:
        try:
            tmp_path.unlink(missing_ok=True)
        except OSError:
            pass
        raise


@st.cache_data(max_entries=128, show_spinner=False)
def _build_molecule_cached(smiles: str, name: str | None = None, notes: str | None = None) -> dict:
    return _cb_chemistry.build_molecule_with_rdkit(smiles, name=name, notes=notes)


@st.cache_resource(show_spinner=False)
def _prepare_component_assets(asset_version: str):
    importlib.reload(_cb_styles)
    importlib.reload(_cb_presets)
    importlib.reload(_cb_frontend)

    presets = _cb_presets.MOLECULE_PRESETS
    default_preset = next(
        (p for p in presets if p["id"] == "sf4"),
        presets[0],
    )
    default_molecule = _cb_chemistry.build_molecule_with_rdkit(
        default_preset["smiles"],
        name=default_preset["name"],
        notes=default_preset["description"],
    )
    pkg_comp_dir = Path(__file__).resolve().parent / "cb_studio" / "component"
    html = _cb_frontend.build_frontend_html(default_molecule)
    comp_dir = Path(tempfile.gettempdir()) / f"cb_studio_py_component_{asset_version}"
    try:
        comp_dir.mkdir(parents=True, exist_ok=True)
        bundle_src = pkg_comp_dir / "three.bundle.js"
        bundle_dst = comp_dir / "three.bundle.js"
        if bundle_src.is_file() and (
            not bundle_dst.is_file() or bundle_dst.stat().st_size != bundle_src.stat().st_size
        ):
            fd, tmp_name = tempfile.mkstemp(prefix=".tmp_bundle_", suffix=".js", dir=str(comp_dir))
            os.close(fd)
            tmp_bundle = Path(tmp_name)
            try:
                shutil.copy2(bundle_src, tmp_bundle)
                os.replace(tmp_bundle, bundle_dst)
            except Exception:
                tmp_bundle.unlink(missing_ok=True)
                raise
        _atomic_write_text(comp_dir / "index.html", html)
    except OSError:
        pkg_comp_dir.mkdir(parents=True, exist_ok=True)
        _atomic_write_text(pkg_comp_dir / "index.html", html)
        comp_dir = pkg_comp_dir

    return str(comp_dir), default_molecule


_asset_version = _compute_asset_version()
_comp_dir, _default_molecule = _prepare_component_assets(_asset_version)
cb_studio_component = components.declare_component(
    f"cb_studio_{_asset_version}",
    path=_comp_dir,
)

if "cb_molecule" not in st.session_state:
    st.session_state.cb_molecule = _default_molecule
if "cb_error" not in st.session_state:
    st.session_state.cb_error = None
if "cb_last_req_id" not in st.session_state:
    st.session_state.cb_last_req_id = None

event = cb_studio_component(
    molecule=st.session_state.cb_molecule,
    error=st.session_state.cb_error,
    req_id=st.session_state.cb_last_req_id,
    key="cb_studio_app",
)

if isinstance(event, dict):
    req_id = event.get("reqId")
    if req_id is not None and req_id != st.session_state.cb_last_req_id:
        st.session_state.cb_last_req_id = req_id
        smiles = str(event.get("smiles") or "").strip()
        name = event.get("name")
        notes = event.get("notes")
        try:
            st.session_state.cb_molecule = _build_molecule_cached(
                smiles,
                name=name,
                notes=notes,
            )
            st.session_state.cb_error = None
        except Exception as exc:
            st.session_state.cb_error = str(exc) or "Invalid SMILES string."
        st.rerun()



