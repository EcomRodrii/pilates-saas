'use client';

import { X, Check } from 'lucide-react';
import { Reveal, Eyebrow } from '@/components/landing/Reveal';
import { PROBLEMA_ITEMS, NW } from './data';

// Contraste "sin / con" — mismo propósito narrativo que SeccionMartes en la
// landing principal (nombrar el dolor real antes de explicar la solución),
// pero aquí el dolor es el de una instructora buscando trabajo, no el de
// una propietaria dirigiendo un estudio.

export function SeccionProblema() {
  return (
    <section id="problema" className="nw-prob" aria-labelledby="nw-prob-h">
      <div className="nw-prob-wrap">
        <Eyebrow color={NW}>Buscar trabajo como instructora</Eyebrow>
        <Reveal>
          <h2 id="nw-prob-h" className="nw-prob-h2">Esto es lo que hay hoy.</h2>
        </Reveal>
        <div className="nw-prob-lista">
          {PROBLEMA_ITEMS.map((item, i) => (
            <Reveal key={item.sin} delay={i * 70}>
              <div className="nw-prob-fila">
                <div className="nw-prob-col nw-prob-sin">
                  <X size={16} className="nw-prob-icono" aria-hidden />
                  <p>{item.sin}</p>
                </div>
                <div className="nw-prob-col nw-prob-con">
                  <Check size={16} className="nw-prob-icono" aria-hidden />
                  <p>{item.con}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>

      <style>{`
        .nw-prob { padding: clamp(64px,10vw,96px) clamp(20px,4vw,48px); }
        .nw-prob-wrap { max-width: 920px; margin: 0 auto; }
        .nw-prob-h2 { font-size: clamp(28px,4vw,44px); font-weight: 800; line-height: 1.02; letter-spacing: -.04em;
          margin: 0 0 40px; max-width: 16ch; text-wrap: balance; }
        .nw-prob-lista { display: flex; flex-direction: column; gap: 14px; }
        .nw-prob-fila { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
        .nw-prob-col { display: flex; align-items: flex-start; gap: 10px; padding: 18px 20px; border-radius: 16px; }
        .nw-prob-col p { margin: 0; font-size: 14.5px; line-height: 1.55; }
        .nw-prob-sin { background: #F4F2EC; color: #6B6B62; }
        .nw-prob-sin .nw-prob-icono { color: #B0AFA4; margin-top: 2px; flex-shrink: 0; }
        .nw-prob-con { background: #E7F0E6; color: #1F2E23; font-weight: 500; }
        .nw-prob-con .nw-prob-icono { color: ${NW}; margin-top: 2px; flex-shrink: 0; }

        @media (max-width: 720px) {
          .nw-prob-fila { grid-template-columns: 1fr; gap: 8px; }
        }
      `}</style>
    </section>
  );
}
