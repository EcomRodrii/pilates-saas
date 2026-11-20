'use client';

// La espera entre «Tu estudio ya existe» y la bienvenida: oscura, con el logo y una barra que avanza, igual que el
// marco de la bienvenida. Sustituye al esqueleto claro del panel mientras se resuelve el estudio (lib/alta/alta-en-curso.ts).

import { LogoTentare } from '@/components/marca/logo-tentare';
import { EstilosFoco } from './marco-foco';

export function PantallaCargaAlta() {
  return (
    <>
      <EstilosFoco />
      <style>{`
@keyframes ob-barra-carga { 0% { transform: translateX(-100%); } 100% { transform: translateX(260%); } }
.ob-carga { position: relative; height: 3px; width: 96px; overflow: hidden; border-radius: 3px; background: rgb(255 255 255 / .14); }
.ob-carga::after { content: ""; position: absolute; inset: 0; width: 40%; border-radius: 3px; background: linear-gradient(90deg, var(--t-blue-500), var(--t-magenta-500)); animation: ob-barra-carga 1.1s cubic-bezier(.4,0,.2,1) infinite; }
@media (prefers-reduced-motion: reduce) { .ob-carga::after { animation: none; width: 100%; } }
`}</style>
      <div className="ob-marco" role="status" aria-live="polite" aria-label="Preparando tu estudio">
        <div className="relative grid min-h-dvh place-content-center justify-items-center gap-8">
          <LogoTentare formato="horizontal" tinta="blanco" alto={40} decorativo className="ob-logo" />
          <div className="ob-carga" aria-hidden />
        </div>
      </div>
    </>
  );
}
