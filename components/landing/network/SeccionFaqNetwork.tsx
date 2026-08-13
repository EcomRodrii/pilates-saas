'use client';

import { useState } from 'react';
import { FAQ_ITEMS_NETWORK } from './data';

export function SeccionFaqNetwork() {
  const [abierta, setAbierta] = useState(-1);

  return (
    <section id="faq" className="nw-faq" aria-labelledby="nw-faq-h">
      <div className="nw-faq-wrap">
        <h2 id="nw-faq-h" className="nw-faq-h2">Antes de crear tu perfil</h2>
        <div className="nw-faq-lista">
          {FAQ_ITEMS_NETWORK.map((f, i) => {
            const open = abierta === i;
            return (
              <div key={f.q} className="nw-faq-item">
                <button
                  type="button"
                  className="nw-faq-pregunta"
                  onClick={() => setAbierta(open ? -1 : i)}
                  aria-expanded={open}
                >
                  <span>{f.q}</span>
                  <span className="nw-faq-signo" aria-hidden>{open ? '−' : '+'}</span>
                </button>
                {open && <p className="nw-faq-respuesta">{f.a}</p>}
              </div>
            );
          })}
        </div>
      </div>

      <style>{`
        .nw-faq { padding: clamp(64px,10vw,96px) clamp(20px,4vw,48px); }
        .nw-faq-wrap { max-width: 780px; margin: 0 auto; }
        .nw-faq-h2 { font-size: clamp(26px,3.8vw,38px); font-weight: 800; line-height: 1.02; letter-spacing: -.04em; margin: 0 0 32px; }
        .nw-faq-lista { border-bottom: 1px solid #DEDED6; }
        .nw-faq-item { border-top: 1px solid #DEDED6; }
        .nw-faq-pregunta { width: 100%; display: flex; align-items: baseline; justify-content: space-between; gap: 20px;
          padding: 20px 4px; cursor: pointer; background: none; border: none; text-align: left; font-family: inherit; }
        .nw-faq-pregunta span:first-child { font-size: 16px; font-weight: 700; line-height: 1.4; color: #1A1A1A; }
        .nw-faq-signo { font-size: 20px; font-weight: 600; color: #8E8E86; flex-shrink: 0; }
        .nw-faq-respuesta { font-size: 14.5px; line-height: 1.65; color: #5A5A52; margin: 0; padding: 0 4px 22px; max-width: 62ch; }
      `}</style>
    </section>
  );
}
