from __future__ import annotations

from pathlib import Path
import tempfile

import streamlit as st
import streamlit.components.v1 as components

from cb_studio.chemistry import build_molecule_with_rdkit
from cb_studio.frontend import build_frontend_html
from cb_studio.presets import MOLECULE_PRESETS

st.set_page_config(
    page_title="CB Studio",
    layout="wide",
    initial_sidebar_state="collapsed",
)

st.markdown(
    """
    <style>
      html, body, [data-testid="stAppViewContainer"], .main {
        background-color: #ffffff;
        overflow: hidden;
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
      .block-container {
        padding: 0 !important;
        margin: 0 !important;
        max-width: 100% !important;
      }
      [data-testid="stVerticalBlock"] {
        gap: 0 !important;
      }
      iframe[title*="cb_studio"] {
        width: 100vw !important;
        height: 100vh !important;
        height: 100dvh !important;
        border: none !important;
        display: block !important;
      }
    </style>
    """,
    unsafe_allow_html=True,
)


@st.cache_resource
def _init_cb_studio_component():
    default_preset = next(
        (p for p in MOLECULE_PRESETS if p["id"] == "sf4"),
        MOLECULE_PRESETS[0],
    )
    default_molecule = build_molecule_with_rdkit(
        default_preset["smiles"],
        name=default_preset["name"],
        notes=default_preset["description"],
    )
    comp_dir = Path(tempfile.gettempdir()) / "cb_studio_py_component"
    comp_dir.mkdir(parents=True, exist_ok=True)
    (comp_dir / "index.html").write_text(
        build_frontend_html(default_molecule),
        encoding="utf-8",
    )
    component = components.declare_component("cb_studio", path=str(comp_dir))
    return component, default_molecule


cb_studio_component, default_molecule = _init_cb_studio_component()

if "cb_molecule" not in st.session_state:
    st.session_state.cb_molecule = default_molecule
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
            st.session_state.cb_molecule = build_molecule_with_rdkit(
                smiles,
                name=name,
                notes=notes,
            )
            st.session_state.cb_error = None
        except Exception as exc:
            st.session_state.cb_error = str(exc) or "Invalid SMILES string."
        st.rerun()

