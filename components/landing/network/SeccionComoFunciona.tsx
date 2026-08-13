'use client';

import { Reveal, Eyebrow } from '@/components/landing/Reveal';
import { PASOS, NW } from './data';

export function SeccionComoFunciona() {
  return (
    <section id="como-funciona" className="nw-pasos" aria-labelledby="nw-pasos-h">
      <div className="nw-pasos-wrap">
        <Eyebrow color={NW}>Cómo funciona</Eyebrow>
        <Reveal>
          <h2 id="nw-pasos-h" className="nw-pasos-h2">Tres pasos. Nada más.</h2>
        </Reveal>
        <div className="nw-pasos-lista">
          {PASOS.map((paso, i) => (
            <Reveal key={paso.titulo} delay={i * 90} from={i % 2 === 0 ? 'left' : 'right'}>
              <div className="nw-pasos-item">
                <span className="nw-pasos-num">{paso.numero}</span>
                <div>
                  <h3 className="nw-pasos-tit">{paso.titulo}</h3>
                  <p className="nw-pasos-txt">{paso.texto}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>

      <style>{`
        .nw-pasos { padding: clamp(64px,10vw,96px) clamp(20px,4vw,48px); background: #F4F2EC; }
        .nw-pasos-wrap { max-width: 920px; margin: 0 auto; }
        .nw-pasos-h2 { font-size: clamp(28px,4vw,44px); font-weight: 800; line-height: 1.02; letter-spacing: -.04em; margin: 0 0 44px; }
        .nw-pasos-lista { display: flex; flex-direction: column; gap: 0; border-top: 1px solid #DEDED6; }
        .nw-pasos-item { display: flex; gap: 24px; align-items: flex-start; padding: 32px 4px; border-bottom: 1px solid #DEDED6; }
        .nw-pasos-num { flex-shrink: 0; width: 52px; height: 52px; border-radius: 50%; background: ${NW}; color: #fff;
          display: flex; align-items: center; justify-content: center; font-size: 20px; font-weight: 800; }
        .nw-pasos-tit { font-size: clamp(18px,2vw,22px); font-weight: 700; margin: 4px 0 8px; letter-spacing: -.01em; }
        .nw-pasos-txt { font-size: 14.5px; line-height: 1.6; color: #5A5A52; margin: 0; max-width: 56ch; }

        @media (max-width: 640px) {
          .nw-pasos-item { gap: 16px; padding: 24px 2px; }
          .nw-pasos-num { width: 42px; height: 42px; font-size: 17px; }
        }
      `}</style>
    </section>
  );
}
