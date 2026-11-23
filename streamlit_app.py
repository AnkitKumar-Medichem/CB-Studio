from pathlib import Path
import streamlit as st
import streamlit.components.v1 as components

st.set_page_config(
    page_title="CB Studio",
    layout="wide",
    initial_sidebar_state="collapsed",
)

DIST_DIR = Path(__file__).resolve().parent / "dist"

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

if not (DIST_DIR / "index.html").is_file():
    st.error("Build output not found in dist/. Run 'npm run build' and commit dist/ before deploying.")
    st.stop()

_cb_studio_component = components.declare_component("cb_studio", path=str(DIST_DIR))
_cb_studio_component(key="cb_studio_app")
