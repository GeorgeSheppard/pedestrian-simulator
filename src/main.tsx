import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/global.css';
import { Scene } from './scene/Scene';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Scene />
  </StrictMode>
);
