# CB Studio

Interactive 3D molecular bonding visualizer based on VSEPR theory, hybridization, lone-pair geometry, CPK atom coloring, and SMILES input.

## Running with Python and Streamlit

```bash
pip install -r requirements.txt
streamlit run streamlit_app.py
```

## Deploying to Streamlit Community Cloud

1. Push the repository (`streamlit_app.py`, `cb_studio/`, `requirements.txt`, and `.streamlit/config.toml`) to GitHub.
2. On Streamlit Community Cloud, create a new app connected to your GitHub repository and set the main file path to `streamlit_app.py`.
3. No Node.js build step or committed `dist/` folder is required.

## Local Web Development (React / Vite)

```bash
npm install
npm run dev
```

