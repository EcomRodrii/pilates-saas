'use client';

import { Mail, BadgeCheck, Clock3 } from 'lucide-react';
import { Reveal, Eyebrow } from '@/components/landing/Reveal';
import { CONFIANZA_ITEMS, NW } from './data';

const ICONOS = [Mail, BadgeCheck, Clock3];

export function SeccionConfianza() {
  return (
    <section id="confianza" className="nw-conf" aria-labelledby="nw-conf-h">
      <div className="nw-conf-wrap">
        <Eyebrow color={NW}>Confianza</Eyebrow>
        <Reveal>
          <h2 id="nw-conf-h" className="nw-conf-h2">No es solo un perfil bonito.</h2>
          <p className="nw-conf-lead">
            Un estudio que te contacta se juega su clase. Estas tres señales están en tu perfil para que decida
            con datos, no a ciegas.
          </p>
        </Reveal>
        <div className="nw-conf-grid">
          {CONFIANZA_ITEMS.map((item, i) => {
            const Icono = ICONOS[i];
            return (
              <Reveal key={item.titulo} delay={i * 80}>
                <div className="nw-conf-card">
                  <div className="nw-conf-icono"><Icono size={20} /></div>
                  <h3>{item.titulo}</h3>
                  <p>{item.texto}</p>
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>

      <style>{`
        .nw-conf { padding: clamp(64px,10vw,96px) clamp(20px,4vw,48px); }
        .nw-conf-wrap { max-width: 1040px; margin: 0 auto; }
        .nw-conf-h2 { font-size: clamp(28px,4vw,44px); font-weight: 800; line-height: 1.02; letter-spacing: -.04em; margin: 0 0 14px; max-width: 18ch; }
        .nw-conf-lead { font-size: 15.5px; line-height: 1.6; color: #5A5A52; max-width: 56ch; margin: 0 0 44px; }
        .nw-conf-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 20px; }
        .nw-conf-card { background: #fff; border: 1px solid #E7E7E0; border-radius: 18px; padding: 26px; height: 100%; }
        .nw-conf-icono { width: 44px; height: 44px; border-radius: 12px; background: ${'#E7F0E6'}; color: ${NW};
          display: flex; align-items: center; justify-content: center; margin-bottom: 16px; }
        .nw-conf-card h3 { font-size: 15.5px; font-weight: 700; margin: 0 0 8px; }
        .nw-conf-card p { font-size: 13.5px; line-height: 1.6; color: #5A5A52; margin: 0; }

        @media (max-width: 780px) {
          .nw-conf-grid { grid-template-columns: 1fr; }
        }
      `}</style>
    </section>
  );
}
