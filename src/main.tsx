import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

if (
  typeof window !== 'undefined' &&
  window.parent !== window &&
  (window.location.pathname.includes('/component/') ||
    window.location.search.includes('streamlit'))
) {
  window.parent.postMessage(
    {
      isStreamlitMessage: true,
      type: 'streamlit:componentReady',
      apiVersion: 1,
    },
    '*'
  );

  const syncStreamlitHeight = () => {
    let targetHeight = window.innerHeight || 760;
    try {
      if (window.parent.innerHeight) {
        targetHeight = window.parent.innerHeight;
      }
    } catch {
      // Fallback to current window height if parent is cross-origin
    }
    window.parent.postMessage(
      {
        isStreamlitMessage: true,
        type: 'streamlit:setFrameHeight',
        height: Math.max(640, targetHeight),
      },
      '*'
    );
  };

  syncStreamlitHeight();
  window.addEventListener('resize', syncStreamlitHeight);
  try {
    window.parent.addEventListener('resize', syncStreamlitHeight);
  } catch {
    // Ignore cross-origin parent listener errors
  }
}

createRoot(document.getElementById('root')!).render(<App />);
