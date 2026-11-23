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

## Running with Streamlit Locally

```bash
npm run build
pip install -r requirements.txt
streamlit run streamlit_app.py
```

## Deploying to Streamlit Community Cloud

1. Build the static frontend so the `dist/` directory is up to date:
   ```bash
   npm run build
   ```
2. Commit all files, including `dist/`, `streamlit_app.py`, `requirements.txt`, and `.streamlit/config.toml`, and push to GitHub.
3. On Streamlit Community Cloud, create a new app connected to your GitHub repository and set the main file path to `streamlit_app.py`.
