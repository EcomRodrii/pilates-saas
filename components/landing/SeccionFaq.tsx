'use client';

import { useState } from 'react';
import { FAQ_ITEMS } from '@/components/landing/data';

// Sección 12 de la landing v5 — "FAQ". El diseño traía una selección de 7
// preguntas orientadas a "antes de cambiarse", con texto ligeramente distinto
// al de producción. Aquí se usa FAQ_ITEMS entero (13, la fuente real que ya
// usa /precios y la landing en producción) en vez de retipear una variante
// del mismo contenido: dos copias del mismo texto solo pueden desincronizarse.
//
// Acordeón real: un índice abierto a la vez, como el original
// (`f.toggle`/`f.open`/`f.sign`).

export function SeccionFaq() {
  const [abierta, setAbierta] = useState(-1);

  return (
    <section id="faq" className="v5-faq" aria-labelledby="v5-faq-h">
      <div className="v5-faq-wrap">
        <h2 id="v5-faq-h" className="v5-faq-h2">Lo que preguntan antes de cambiarse</h2>
        <div className="v5-faq-lista">
          {FAQ_ITEMS.map((f, i) => {
            const open = abierta === i;
            return (
              <div key={f.q} className="v5-faq-item">
                <button
                  type="button"
                  className="v5-faq-pregunta"
                  onClick={() => setAbierta(open ? -1 : i)}
                  aria-expanded={open}
                >
                  <span>{f.q}</span>
                  <span className="v5-faq-signo" aria-hidden>{open ? '−' : '+'}</span>
                </button>
                {open && <p className="v5-faq-respuesta">{f.a}</p>}
              </div>
            );
          })}
        </div>
      </div>

      <style>{`
        .v5-faq { padding: clamp(64px,10vw,96px) clamp(20px,4vw,48px); }
        .v5-faq-wrap { max-width: 880px; margin: 0 auto; }
        .v5-faq-h2 { font-size: clamp(26px,3.8vw,42px); font-weight: 800; line-height: 1.02; letter-spacing: -.04em; margin: 0 0 36px; }
        .v5-faq-lista { border-bottom: 1px solid #DEDED6; }
        .v5-faq-item { border-top: 1px solid #DEDED6; }
        .v5-faq-pregunta { width: 100%; display: flex; align-items: baseline; justify-content: space-between; gap: 20px;
          padding: 22px 4px; cursor: pointer; background: none; border: none; text-align: left; font-family: inherit; }
        .v5-faq-pregunta span:first-child { font-size: 17px; font-weight: 700; line-height: 1.4; color: #1A1A1A; }
        .v5-faq-signo { font-size: 20px; font-weight: 600; color: #8E8E86; flex-shrink: 0; }
        .v5-faq-respuesta { font-size: 15px; line-height: 1.7; color: #5A5A52; margin: 0; padding: 0 4px 24px; max-width: 64ch; }
      `}</style>
    </section>
  );
}
