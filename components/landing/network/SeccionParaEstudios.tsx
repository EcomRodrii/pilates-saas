'use client';

import Link from 'next/link';
import { Search } from 'lucide-react';
import { Reveal } from '@/components/landing/Reveal';
import { NW } from './data';

// Puente hacia el otro lado del marketplace (app/network/instructoras,
// #1039) — esta landing solo habla a la instructora, así que un estudio que
// aterriza aquí por error (o por curiosidad) necesita una salida clara en
// vez de un formulario de alta que no es para él.

export function SeccionParaEstudios() {
  return (
    <section id="para-estudios" className="nw-est" aria-labelledby="nw-est-h">
      <Reveal>
        <div className="nw-est-card">
          <div className="nw-est-icono"><Search size={22} /></div>
          <div className="nw-est-texto">
            <h2 id="nw-est-h">¿Diriges un estudio?</h2>
            <p>Busca instructoras disponibles por ciudad, especialidad y horario — sin publicar una oferta ni esperar candidaturas.</p>
          </div>
          <Link href="/network/instructoras" className="nw-est-cta">Buscar instructoras →</Link>
        </div>
      </Reveal>

      <style>{`
        .nw-est { padding: 0 clamp(20px,4vw,48px) clamp(64px,10vw,96px); }
        .nw-est-card { max-width: 1040px; margin: 0 auto; background: #0F0F0F; border-radius: 24px;
          padding: clamp(28px,4vw,40px); display: flex; align-items: center; gap: 24px; flex-wrap: wrap; }
        .nw-est-icono { width: 52px; height: 52px; border-radius: 14px; background: rgba(79,138,91,.22); color: #9FCBA8;
          display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .nw-est-texto { flex: 1; min-width: 240px; }
        .nw-est-texto h2 { font-size: clamp(18px,2.2vw,24px); font-weight: 800; color: #fff; margin: 0 0 6px; letter-spacing: -.02em; }
        .nw-est-texto p { font-size: 14px; line-height: 1.55; color: rgba(255,255,255,.7); margin: 0; max-width: 52ch; }
        .nw-est-cta { flex-shrink: 0; background: ${NW}; color: #fff; font-weight: 700; font-size: 14.5px;
          padding: 13px 24px; border-radius: 999px; white-space: nowrap; transition: filter .2s; }
        .nw-est-cta:hover { filter: brightness(1.1); }
      `}</style>
    </section>
  );
}
