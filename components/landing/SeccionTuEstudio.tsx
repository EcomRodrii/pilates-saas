'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

// «¿En qué punto está tu estudio?» — bloque 03 del rediseño (23-sep).
//
// Tres perfiles con problemas distintos (quien empieza, quien ya tiene estudio
// y quien tiene varios centros) sin hacer tres landings: un selector, con «Ya
// tengo estudio» por defecto porque es el perfil que más llega. Cada pestaña
// enlaza a la página que profundiza en su caso (el árbol SEO de alrededor).
//
// ⚠️ Cada frase está cruzada contra el código (registro de afirmaciones de la
// Fase 1): el importador reconoce Excel, Timp, Momence, bsport, Eversports y
// Mindbody, deja un acta y se deshace; varias sedes es un acceso con selector
// de sede en el plan Cadena, NO una vista consolidada. No prometer más.
//
// Las tres vistas van en el HTML (ocultas con `hidden` las que no tocan): el
// texto de las tres es contenido de la página, no solo de quien pulsa.

type Perfil = 'empezando' | 'ya-tengo' | 'varias';

const PERFILES: { id: Perfil; pestana: string; titular: string; texto: string; enlace: { href: string; label: string } }[] = [
  {
    id: 'empezando',
    pestana: 'Estoy empezando',
    titular: 'Empieza con todo en su sitio.',
    texto:
      'Reservas, cobros, bonos y tu horario desde el primer día, sin juntar cinco herramientas. Tu horario y tu página de reservas, listos en tu primera sesión.',
    enlace: { href: '/recursos/checklist-elegir-software-estudio', label: 'Cómo elegir el software de tu estudio' },
  },
  {
    id: 'ya-tengo',
    pestana: 'Ya tengo estudio',
    titular: 'Trae lo que ya tienes.',
    texto:
      'Importa tus alumnas, tus bonos y tu horario desde Excel, Timp, Momence, bsport, Eversports o Mindbody. Ves qué ha entrado antes de seguir y puedes deshacerlo. Y si lo prefieres, te ayudamos nosotros.',
    enlace: { href: '/soluciones/cambiar-de-software', label: 'Cómo es cambiarte a Tentare' },
  },
  {
    id: 'varias',
    pestana: 'Tengo varios centros',
    titular: 'Cada sede con lo suyo. Tú, con todo.',
    texto:
      'Cada centro con su horario, sus salas y su equipo, y tú entras en todos con un solo acceso. Es el plan Cadena.',
    enlace: { href: '/funcionalidades/multi-centro', label: 'Tentare para varios centros' },
  },
];

export function SeccionTuEstudio() {
  const [perfil, setPerfil] = useState<Perfil>('ya-tengo');

  return (
    <section id="tu-estudio" className="v5-perfil" aria-labelledby="v5-perfil-h">
      <div className="v5-perfil-wrap">
        <div className="v5-perfil-cabecera lp-rv">
          <h2 id="v5-perfil-h" className="v5-perfil-h2">¿En qué punto está tu estudio?</h2>
          <p className="v5-perfil-lead">Tentare se adapta a donde estás hoy, y no tienes que cambiar de herramienta cuando crezcas.</p>
        </div>

        <div className="v5-perfil-caja lp-rv" style={{ ['--lp-r' as string]: 10 }}>
          <div className="v5-perfil-pestanas" role="tablist" aria-label="Tu situación">
            {PERFILES.map((p) => (
              <button
                key={p.id}
                type="button"
                role="tab"
                id={`v5-perfil-tab-${p.id}`}
                aria-selected={perfil === p.id}
                aria-controls={`v5-perfil-panel-${p.id}`}
                onClick={() => setPerfil(p.id)}
                className={perfil === p.id ? 'v5-perfil-pestana v5-perfil-pestana-on' : 'v5-perfil-pestana'}
              >
                {p.pestana}
              </button>
            ))}
          </div>

          {PERFILES.map((p) => (
            <div
              key={p.id}
              id={`v5-perfil-panel-${p.id}`}
              role="tabpanel"
              aria-labelledby={`v5-perfil-tab-${p.id}`}
              hidden={perfil !== p.id}
              className="v5-perfil-panel"
            >
              <p className="v5-perfil-titular">{p.titular}</p>
              <p className="v5-perfil-texto">{p.texto}</p>
              <Link href={p.enlace.href} className="v5-perfil-enlace">
                {p.enlace.label} <ArrowRight size={15} aria-hidden />
              </Link>
            </div>
          ))}
        </div>
      </div>

      <style>{`
        .v5-perfil { padding: clamp(64px,7vw,104px) clamp(20px,4vw,48px); }
        .v5-perfil-wrap { max-width: 1240px; margin: 0 auto; display: grid;
          grid-template-columns: minmax(0,.9fr) minmax(0,1.1fr); gap: clamp(32px,5vw,72px); align-items: center; }
        .v5-perfil-h2 { margin: 0 0 16px; font-size: clamp(30px,4.2vw,56px); font-weight: 800; line-height: 1.02;
          letter-spacing: -.04em; text-wrap: balance; color: #1A1A1A; }
        .v5-perfil-lead { margin: 0; max-width: 42ch; font-size: 17px; line-height: 1.6; color: #5A5A52; }

        .v5-perfil-caja { padding: clamp(20px,2.4vw,32px); border-radius: 24px; background: #fff; border: 1px solid #E7E7E0;
          box-shadow: 0 40px 80px -52px rgba(34,37,26,.4); }
        .v5-perfil-pestanas { display: flex; flex-wrap: wrap; gap: 4px; padding: 4px; border-radius: 999px;
          background: #F1F1EB; width: fit-content; max-width: 100%; }
        .v5-perfil-pestana { padding: 10px 18px; border: 0; border-radius: 999px; background: transparent; cursor: pointer;
          font: inherit; font-size: 14.5px; font-weight: 700; color: #4A4E3A; transition: background .2s, color .2s; }
        .v5-perfil-pestana:hover { color: #1F2216; }
        .v5-perfil-pestana:active { transform: scale(.97); }
        .v5-perfil-pestana-on, .v5-perfil-pestana-on:hover { background: #343825; color: #D9C29E; }
        .v5-perfil-pestana:focus-visible { outline: 2px solid #343825; outline-offset: 2px; }

        .v5-perfil-panel { padding: clamp(22px,2.6vw,32px) 4px 4px; }
        .v5-perfil-titular { margin: 0 0 10px; font-size: clamp(22px,2vw,28px); font-weight: 800; letter-spacing: -.03em;
          line-height: 1.15; color: #1F2216; }
        .v5-perfil-texto { margin: 0; max-width: 56ch; font-size: 16px; line-height: 1.6; color: #5A5A52; }
        .v5-perfil-enlace { display: inline-flex; align-items: center; gap: 7px; margin-top: 18px; font-size: 15px;
          font-weight: 700; color: #343825; }
        .v5-perfil-enlace:hover { text-decoration: underline; text-underline-offset: 4px; }
        .v5-perfil-enlace:focus-visible { outline: 2px solid #343825; outline-offset: 3px; border-radius: 4px; }

        @media (max-width: 900px) {
          .v5-perfil-wrap { grid-template-columns: minmax(0,1fr); gap: 28px; }
        }
        @media (max-width: 480px) {
          .v5-perfil-pestanas { border-radius: 18px; width: 100%; }
          .v5-perfil-pestana { flex: 1 1 auto; padding: 10px 12px; font-size: 13.5px; }
        }
        /* Al cambiar de perfil, el texto nuevo entra en vez de aparecer de golpe. */
        @keyframes v5-perfil-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
        @media (prefers-reduced-motion: no-preference) {
          .v5-perfil-panel:not([hidden]) { animation: v5-perfil-in .42s cubic-bezier(.2,.8,.2,1) both; }
          .v5-perfil-pestana { transition: background .25s, color .25s, transform .18s cubic-bezier(.2,.8,.2,1); }
        }
        @media (prefers-reduced-motion: reduce) { .v5-perfil-pestana { transition: none; } }
      `}</style>
    </section>
  );
}
