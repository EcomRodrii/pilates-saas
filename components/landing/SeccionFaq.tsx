'use client';

import { useState } from 'react';
import { FAQ_ITEMS } from '@/components/landing/data';

// Sección 12 de la landing v5 — "FAQ". El diseño traía una selección de 7
// preguntas orientadas a "antes de cambiarse", con texto ligeramente distinto
// al de producción. Aquí se usa FAQ_ITEMS entero (13, la fuente real que ya
// usa /precios y la landing en producción) en vez de retipear una variante
// del mismo contenido: dos copias del mismo texto solo pueden desincronizarse.
// Desde el 23-sep son 8 (eran 14), cruzadas con el código (ver data.tsx).
//
// ⚠️ Están TODAS y a la vista (plegadas, pero en la página): alimentan el
// JSON-LD `FAQPage` de StructuredData, y Google pide que ese contenido se vea.
//
// Acordeón real: un índice abierto a la vez, como el original
// (`f.toggle`/`f.open`/`f.sign`). En escritorio va en dos columnas (al aligerar
// la home: en una sola eran 13 filas seguidas); cada columna es su propia
// lista, así que abrir una pregunta no estira la fila de al lado.

const MITAD = Math.ceil(FAQ_ITEMS.length / 2);
const COLUMNAS = [FAQ_ITEMS.slice(0, MITAD), FAQ_ITEMS.slice(MITAD)].map((items, c) =>
  items.map((f, i) => ({ ...f, indice: c === 0 ? i : MITAD + i })),
);

export function SeccionFaq() {
  const [abierta, setAbierta] = useState(-1);

  return (
    <section id="faq" className="v5-faq" aria-labelledby="v5-faq-h">
      <div className="v5-faq-wrap">
        <h2 id="v5-faq-h" className="v5-faq-h2 lp-rv">Lo que se pregunta antes de empezar</h2>
        <div className="v5-faq-columnas lp-rv" style={{ ['--lp-r' as string]: 6 }}>
          {COLUMNAS.map((columna, c) => (
            <div key={c} className="v5-faq-lista">
              {columna.map((f) => {
                const open = abierta === f.indice;
                return (
                  <div key={f.q} className="v5-faq-item">
                    <button
                      type="button"
                      className="v5-faq-pregunta"
                      onClick={() => setAbierta(open ? -1 : f.indice)}
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
          ))}
        </div>
      </div>

      <style>{`
        .v5-faq { padding: clamp(64px,7vw,104px) clamp(20px,4vw,48px); }
        .v5-faq-wrap { max-width: 1240px; margin: 0 auto; }
        .v5-faq-h2 { font-size: clamp(28px,4vw,52px); font-weight: 800; line-height: 1.02; letter-spacing: -.04em;
          margin: 0 0 36px; text-wrap: balance; }
        .v5-faq-columnas { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 0 clamp(28px,4vw,56px);
          align-items: start; }
        .v5-faq-lista { border-bottom: 1px solid #DEDED6; }
        .v5-faq-item { border-top: 1px solid #DEDED6; }
        .v5-faq-pregunta { width: 100%; display: flex; align-items: baseline; justify-content: space-between; gap: 20px;
          padding: 18px 4px; cursor: pointer; background: none; border: none; text-align: left; font-family: inherit; }
        .v5-faq-pregunta span:first-child { font-size: 16.5px; font-weight: 700; line-height: 1.4; color: #1A1A1A; }
        .v5-faq-pregunta:focus-visible { outline: 2px solid #343825; outline-offset: 2px; }
        .v5-faq-signo { font-size: 20px; font-weight: 600; color: #8E8E86; flex-shrink: 0; }
        .v5-faq-respuesta { font-size: 15px; line-height: 1.7; color: #5A5A52; margin: 0; padding: 0 4px 22px; max-width: 64ch; }
        @keyframes v5-faq-abre { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }
        @media (prefers-reduced-motion: no-preference) {
          .v5-faq-respuesta { animation: v5-faq-abre .3s cubic-bezier(.2,.8,.2,1) both; }
          .v5-faq-signo { transition: transform .25s cubic-bezier(.2,.8,.2,1); }
          .v5-faq-pregunta[aria-expanded="true"] .v5-faq-signo { transform: rotate(180deg); }
        }

        @media (max-width: 860px) {
          .v5-faq-columnas { grid-template-columns: minmax(0,1fr); }
          /* En una columna, la raya de abajo de la primera lista y la de arriba de
             la segunda serían dos seguidas. */
          .v5-faq-lista:first-child { border-bottom: 0; }
        }
      `}</style>
    </section>
  );
}
