// src/main.tsx

 import { StrictMode } from 'react'
 import { createRoot } from 'react-dom/client'
 import './index.css'
 import './styles/responsive.css'
 import JumpAnalyzer from './JumpAnalyzer.tsx'

 createRoot(document.getElementById('root')!).render(
   <StrictMode>
        <JumpAnalyzer />
   </StrictMode>,
 )