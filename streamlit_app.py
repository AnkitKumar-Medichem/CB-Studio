from pathlib import Path
import shutil
import subprocess
import streamlit as st
import streamlit.components.v1 as components

st.set_page_config(
    page_title="CB Studio",
    layout="wide",
    initial_sidebar_state="collapsed",
)

BASE_DIR = Path(__file__).resolve().parent
CANDIDATE_DIRS = [BASE_DIR / "dist", BASE_DIR / "app_dist"]

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


def resolve_bundle_dir() -> Path | None:
    for candidate in CANDIDATE_DIRS:
        if (candidate / "index.html").is_file():
            return candidate
    return None


SERVE_DIR = resolve_bundle_dir()

if SERVE_DIR is None:
    npm_cmd = shutil.which("npm")
    if npm_cmd is not None:
        with st.spinner("Building CB Studio frontend..."):
            if not (BASE_DIR / "node_modules").is_dir():
                subprocess.run([npm_cmd, "install"], cwd=BASE_DIR, check=True)
            subprocess.run([npm_cmd, "run", "build"], cwd=BASE_DIR, check=True)
        SERVE_DIR = resolve_bundle_dir()

if SERVE_DIR is None:
    st.error(
        "Built frontend not found in dist/ or app_dist/. "
        "Run 'npm run build' locally and push app_dist/ to GitHub before deploying."
    )
    st.stop()

_cb_studio_component = components.declare_component("cb_studio", path=str(SERVE_DIR))
_cb_studio_component(key="cb_studio_app")
