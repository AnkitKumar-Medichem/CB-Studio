# CB Studio

Interactive 3D molecular bonding visualizer based on VSEPR theory, hybridization, lone-pair geometry, CPK atom coloring, and SMILES input powered by RDKit WebAssembly and Three.js.

## Local Web Development

```bash
npm install
npm run dev
```

## Production Build

```bash
npm run lint
npm run build
```

Running `npm run build` outputs to `dist/` and automatically syncs the static bundle to `app_dist/` for Streamlit deployment.

## Running with Streamlit Locally

```bash
npm run build
pip install -r requirements.txt
streamlit run streamlit_app.py
```

## Deploying to Streamlit Community Cloud

1. Run `npm run build` so `app_dist/` is up to date.
2. Push the repository (including `app_dist/`, `streamlit_app.py`, `requirements.txt`, and `.streamlit/config.toml`) to GitHub.
3. On Streamlit Community Cloud, create a new app connected to your GitHub repository and set the main file path to `streamlit_app.py`.
