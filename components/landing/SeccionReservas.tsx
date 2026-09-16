'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { SALIDAS } from './enlaces';
import { DemoWidget } from './DemoWidget';

// «Tus alumnas reservan»: la app de alumnas y el widget de la web del estudio en
// un solo bloque, con un selector para ver una u otra. Antes eran dos secciones
// seguidas (SeccionApp y SeccionWidget) y, juntas, casi 2.600 px de home; las
// dos demos siguen, pero solo una a la vez.
//
// ⚠️ La que no se ve NO se monta (no basta con ocultarla): la foto del móvil es
// perezosa, y una <img loading=lazy> oculta nunca carga — e2e/landing-imagenes
// la daría por rota. A cambio, el widget vuelve a empezar al cambiar de vista.
//
// Ancla: `#app` (la sección). `#widget` ya no existe; nada en la web enlazaba a
// ninguna de las dos (comprobado con git grep al fusionarlas).

type Vista = 'app' | 'web';

const VISTAS: { id: Vista; etiqueta: string; texto: string; salida: { href: string; label: string } }[] = [
  {
    id: 'app',
    etiqueta: 'En su app',
    texto: 'Reservan, compran bonos y reciben los avisos por su canal. Con tu nombre, tu logo y tus colores desde el plan Estudio.',
    salida: SALIDAS.app,
  },
  {
    id: 'web',
    etiqueta: 'En tu web',
    texto: 'El widget va dentro de la web del estudio, con tu marca. Este funciona: cambia de día, reserva o mira los bonos.',
    salida: SALIDAS.widget,
  },
];

export function SeccionReservas() {
  const [vista, setVista] = useState<Vista>('app');
  const actual = VISTAS.find((v) => v.id === vista)!;

  return (
    <section id="app" className="v5-res" aria-labelledby="v5-res-h">
      <div className="v5-res-wrap">
        <div className="v5-res-cabecera">
          <header className="v5-res-head">
            <h2 id="v5-res-h" className="v5-res-h2">Tus alumnas reservan en su app o en tu web.</h2>
            <p className="v5-res-lead">Desde su móvil o desde la web de tu estudio, sin mandarlas a otra plataforma.</p>
          </header>

          <div className="v5-res-barra">
            <div className="v5-res-selector" role="tablist" aria-label="Dónde reservan tus alumnas">
              {VISTAS.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  role="tab"
                  id={`v5-res-tab-${v.id}`}
                  aria-selected={vista === v.id}
                  aria-controls="v5-res-panel"
                  onClick={() => setVista(v.id)}
                  className={vista === v.id ? 'v5-res-opcion v5-res-opcion-on' : 'v5-res-opcion'}
                >
                  {v.etiqueta}
                </button>
              ))}
            </div>
            <p className="v5-res-texto">
              {actual.texto} <Link href={actual.salida.href} className="v5-res-salida">{actual.salida.label} →</Link>
            </p>
          </div>
        </div>

        <div id="v5-res-panel" role="tabpanel" aria-labelledby={`v5-res-tab-${vista}`} className="v5-res-escenario">
          {vista === 'app' ? (
            <div className="v5-res-app">
              <Image
                src="/landing/app-mockup.png"
                alt="Pantalla de inicio de la app de alumnas de Tentare, con saludo, buscador, bono de sesiones, racha semanal y horario del estudio"
                width={452}
                height={1111}
                className="v5-res-movil"
                sizes="(max-width: 760px) 200px, 236px"
              />
            </div>
          ) : (
            <DemoWidget />
          )}
        </div>
      </div>

      <style>{`
        .v5-res { background: #F3F3EF; border-top: 1px solid #E7E7E0; border-bottom: 1px solid #E7E7E0;
          padding: clamp(80px,9vw,128px) clamp(20px,4vw,48px); }
        .v5-res-wrap { max-width: 1240px; margin: 0 auto; }
        /* En escritorio, título a la izquierda y selector a la derecha, en la misma
           fila: el escenario empieza antes y el bloque no crece por el selector. */
        .v5-res-cabecera { display: grid; grid-template-columns: minmax(0,1.15fr) minmax(0,.85fr); gap: 20px 56px;
          align-items: end; margin-bottom: 28px; }
        .v5-res-h2 { margin: 0 0 18px; font-size: clamp(30px,4.4vw,60px); font-weight: 800; line-height: 1.02;
          letter-spacing: -.04em; text-wrap: balance; color: #1A1A1A; }
        .v5-res-lead { margin: 0; max-width: 58ch; font-size: 17px; line-height: 1.6; color: #5A5A52; }

        .v5-res-barra { display: flex; flex-direction: column; align-items: flex-start; gap: 14px; }
        .v5-res-selector { display: inline-flex; flex: none; padding: 4px; gap: 4px; border-radius: 999px;
          background: #E6E4DA; }
        .v5-res-opcion { padding: 10px 20px; border: 0; border-radius: 999px; background: transparent; cursor: pointer;
          font: inherit; font-size: 14.5px; font-weight: 700; color: #4A4E3A; transition: background .2s, color .2s; }
        .v5-res-opcion:hover { color: #1F2216; }
        .v5-res-opcion-on { background: #343825; color: #D9C29E; }
        .v5-res-opcion-on:hover { color: #D9C29E; }
        .v5-res-opcion:focus-visible { outline: 2px solid #343825; outline-offset: 2px; }
        .v5-res-texto { margin: 0; min-height: 3.1em; font-size: 15px; line-height: 1.55; color: #5A5A52; }
        .v5-res-salida { font-weight: 700; color: #343825; white-space: nowrap; }
        .v5-res-salida:hover { text-decoration: underline; text-underline-offset: 4px; }

        /* Mismo alto para las dos vistas (medido con el widget en su pestaña más
           larga): al cambiar, la página no salta. */
        .v5-res-escenario { min-height: 680px; }
        .v5-res-app { display: flex; align-items: center; justify-content: center; min-height: 680px;
          border-radius: 20px; background: radial-gradient(70% 80% at 50% 45%, #E9E0CE, #E3DFD2 70%); }
        .v5-res-movil { width: 236px; height: auto; filter: drop-shadow(0 30px 40px rgba(34,37,26,.25)); }

        @media (max-width: 980px) {
          .v5-res-cabecera { grid-template-columns: minmax(0,1fr); }
        }
        @media (max-width: 760px) {
          .v5-res-escenario, .v5-res-app { min-height: 520px; }
          .v5-res-movil { width: 200px; }
        }
        @media (prefers-reduced-motion: reduce) {
          .v5-res-opcion { transition: none; }
        }
      `}</style>
    </section>
  );
}
