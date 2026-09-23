'use client';

import Link from 'next/link';
import { useDemo } from './use-demo';
import { SALIDAS } from './enlaces';

// Sección 03 de la landing v5 — la demo de sustituciones.
//
// Cuatro fotogramas de un caso concreto: una baja entra a las 16:42 y el
// sistema la resuelve. Los textos y los estados son los del producto en su
// modo por defecto, asistido (buscando → tu visto bueno → contactando →
// cubierta), no una ilustración de lo que podría pasar. ⚠️ En asistido NO se
// escribe a ninguna candidata hasta que la propietaria da el visto bueno
// (lib/sustituciones/baja.ts), y cuando la candidata acepta la clase se
// reasigna sola (responder.ts). Esta demo contaba antes el orden al revés:
// contactaba sola a dos a la vez y pedía la aprobación al final.
//
// El título fue «Deja de dirigir tu estudio desde WhatsApp» hasta el rediseño
// del 23-sep: WhatsApp pasa a ser un síntoma (bloque «¿Te suena?») y aquí el
// titular es lo que hace la demo. La baja de las 16:42 SOLO se cuenta aquí;
// ningún otro bloque la repite. El registro no dice «también por WhatsApp»:
// eso solo pasa si el estudio conecta su propia cuenta de Meta.
//
// Se puede avanzar a mano: el ciclo automático es un acompañamiento, no la
// única forma de verlo. Con `prefers-reduced-motion` arranca directamente en
// "Cubierta", que es el fotograma que cuenta el resultado.

interface Fotograma {
  badge: string;
  badgeBg: string;
  badgeFg: string;
  /** Estado de la candidata principal (Julia). */
  c1: string;
  c1fg: string;
  /** Estado de la segunda candidata (Juana). */
  c2: string;
  c2fg: string;
  /** Pie de la tarjeta: lo que el sistema está haciendo ahora mismo. */
  btn: string;
  btnBg: string;
  btnFg: string;
  /** Resalta la fila de Julia cuando ya es la elegida. */
  hl: boolean;
}

const FOTOGRAMAS: Fotograma[] = [
  {
    badge: 'Buscando', badgeBg: 'rgba(143,98,21,.12)', badgeFg: '#8F6215',
    c1: 'Encaja con esta clase', c1fg: '#2F6B4F',
    c2: 'Comprobando…', c2fg: '#8E8E86',
    btn: 'Calculando candidatas…', btnBg: '#F5F5F1', btnFg: '#8E8E86', hl: false,
  },
  {
    badge: 'Esperando tu visto bueno', badgeBg: 'rgba(52,56,37,.1)', badgeFg: '#5A6142',
    c1: 'Propuesta ✓', c1fg: '#2F6B4F',
    c2: 'Siguiente en la lista', c2fg: '#8E8E86',
    btn: 'Avisar a Julia Ramos', btnBg: '#343825', btnFg: '#D9C29E', hl: true,
  },
  {
    badge: 'Contactando', badgeBg: 'rgba(143,98,21,.12)', badgeFg: '#8F6215',
    c1: 'Email enviado · 16:45', c1fg: '#8F6215',
    c2: 'Siguiente en la lista', c2fg: '#8E8E86',
    btn: 'Esperando respuesta · si no contesta, recordatorio', btnBg: '#F5F5F1', btnFg: '#8E8E86', hl: false,
  },
  {
    badge: 'Cubierta', badgeBg: 'rgba(47,107,79,.12)', badgeFg: '#2F6B4F',
    c1: 'Ha aceptado ✓', c1fg: '#2F6B4F',
    c2: '—', c2fg: '#8E8E86',
    btn: 'Cubierta por Julia · 8 alumnas avisadas', btnBg: 'rgba(47,107,79,.12)', btnFg: '#2F6B4F', hl: false,
  },
];

/** Las 7 acciones del registro. Son las que el motor hace de verdad. */
const REGISTRO: [string, string][] = [
  ['16:42', 'Marta avisa de que no puede dar la clase'],
  ['16:43', 'Se calculan las candidatas que pueden darla'],
  ['16:45', 'Tu visto bueno: avisar a Julia'],
  ['16:45', 'Email a Julia con un enlace para aceptar'],
  ['17:30', 'Recordatorio automático a Julia'],
  ['17:52', 'Julia acepta · la clase se reasigna sola'],
  ['17:52', 'Las 8 alumnas reciben el cambio'],
];

export function SeccionSustituciones() {
  const { i, ref, ir } = useDemo(FOTOGRAMAS.length, 2600);
  const f = FOTOGRAMAS[i];

  return (
    <section
      id="sustituciones"
      ref={ref as React.Ref<HTMLElement>}
      className="v5-sust"
      aria-labelledby="v5-sust-h"
    >
      <div className="v5-sust-wrap">
        <header className="v5-sust-head lp-rv">
          <h2 id="v5-sust-h" className="v5-sust-h2">La baja se cubre sola.</h2>
          <p className="v5-sust-lead">
            Una instructora cancela a las 16:42: Tentare sabe quién puede dar esa clase, te la propone y, con tu
            visto bueno, la contacta, insiste por ti y te lo trae resuelto. Si nadie puede, te avisa y decides tú.
          </p>
        </header>

        <div className="v5-sust-grid lp-rv" style={{ ['--lp-r' as string]: 6 }}>
          {/* ── La tarjeta que cambia ── */}
          <div className="v5-card">
            <div className="v5-card-top">
              <span className="v5-card-tit">Sustituciones</span>
              <span key={f.badge} className="v5-badge v5-cambia" style={{ background: f.badgeBg, color: f.badgeFg }}>{f.badge}</span>
            </div>

            <div className="v5-card-body">
              <div className="v5-clase">
                <div>
                  <div className="v5-clase-n">Reformer Avanzado</div>
                  <div className="v5-clase-s">Mañana · 08:30 · Sala 1</div>
                </div>
                <div className="v5-baja">Baja: Marta G. · 16:42</div>
              </div>

              <div className="v5-sep" />

              <div className="v5-cands">
                <div className="v5-cand" style={{ background: f.hl ? 'rgba(47,107,79,.07)' : 'transparent', borderColor: f.hl ? 'rgba(47,107,79,.3)' : 'transparent' }}>
                  <span className="v5-ini">J</span>
                  <span className="v5-cand-n">
                    <strong>Julia Ramos</strong>
                    <span className="v5-cand-s"> · ★ 4,9 · da Reformer Avanzado</span>
                  </span>
                  <span key={f.c1} className="v5-cand-e v5-cambia" style={{ color: f.c1fg }}>{f.c1}</span>
                </div>
                <div className="v5-cand" style={{ borderColor: 'transparent' }}>
                  <span className="v5-ini">J</span>
                  <span className="v5-cand-n">
                    <strong>Juana</strong>
                    <span className="v5-cand-s"> · ★ 4,9 · disponible ese día</span>
                  </span>
                  <span key={f.c2} className="v5-cand-e v5-cambia" style={{ color: f.c2fg }}>{f.c2}</span>
                </div>
              </div>

              <div className="v5-accion" style={{ background: f.btnBg, color: f.btnFg }}><span key={f.btn} className="v5-cambia">{f.btn}</span></div>
              <p className="v5-nota">Aviso a las alumnas activado en tu estudio</p>
            </div>

            {/* Controles de verdad: se puede parar la demo y mirar un paso
                concreto, con teclado incluido. Al pulsar uno, el ciclo
                automático se detiene — que te cambien el paso mientras lo
                lees es justo lo que hace insufribles estas demos. */}
            <div className="v5-pasos" role="group" aria-label="Pasos de la sustitución">
              {FOTOGRAMAS.map((p, n) => (
                <button
                  key={p.badge}
                  type="button"
                  onClick={() => ir(n)}
                  aria-current={n === i ? 'step' : undefined}
                  aria-label={`Paso ${n + 1} de ${FOTOGRAMAS.length}: ${p.badge}`}
                  className={n === i ? 'v5-paso v5-paso-on' : 'v5-paso'}
                />
              ))}
            </div>
          </div>

          {/* ── Lo que ha hecho, por escrito ── */}
          <div className="v5-registro">
            <p className="v5-registro-t">Lo que ha hecho por ti · 7 acciones</p>
            <ol className="v5-registro-l">
              {REGISTRO.map(([hora, que]) => (
                <li key={hora + que}>
                  <span className="v5-hora">{hora}</span>
                  <span>{que}</span>
                </li>
              ))}
            </ol>
            <Link href={SALIDAS.sustituciones.href} className="v5-salida">
              {SALIDAS.sustituciones.label} <span aria-hidden>→</span>
            </Link>
          </div>
        </div>
      </div>

      <style>{`
        .v5-sust { background: #131313; padding: clamp(64px,7vw,104px) clamp(20px,4vw,48px); }
        .v5-sust-wrap { max-width: 1240px; margin: 0 auto; }
        .v5-sust-head { max-width: 820px; margin-bottom: clamp(36px,4.5vw,56px); }
        .v5-sust-h2 { margin: 0 0 18px; font-size: clamp(30px,4.4vw,60px); font-weight: 800;
          line-height: 1.02; letter-spacing: -.04em; color: #fff; text-wrap: balance; }
        .v5-sust-lead { margin: 0; max-width: 58ch; font-size: 17px; line-height: 1.6; color: #A6A69E; }

        .v5-sust-grid { display: grid; grid-template-columns: repeat(auto-fit,minmax(min(340px,100%),1fr));
          gap: clamp(28px,4vw,60px); align-items: center; }

        .v5-card { background: #EEEEE8; border-radius: 20px; padding: 18px;
          box-shadow: 0 60px 120px rgba(0,0,0,.5); }
        .v5-card-top { display: flex; align-items: center; justify-content: space-between; padding: 4px 6px 14px; }
        .v5-card-tit { font-size: 15px; font-weight: 800; color: #1A1A1A; }
        .v5-badge { font-size: 12.5px; font-weight: 700; padding: 6px 12px; border-radius: 999px;
          transition: background var(--motion-slow), color var(--motion-slow); }
        .v5-card-body { background: #fff; border: 1px solid #E7E7E0; border-radius: 16px; padding: 20px; }
        .v5-clase { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; flex-wrap: wrap; }
        .v5-clase-n { font-size: 16.5px; font-weight: 800; color: #1A1A1A; }
        .v5-clase-s { margin-top: 2px; font-size: 13.5px; color: #8E8E86; }
        .v5-baja { font-size: 13px; font-weight: 700; color: #A8442A; }
        .v5-sep { height: 1px; background: #E7E7E0; margin: 16px 0; }
        .v5-cands { display: flex; flex-direction: column; gap: 10px; }
        .v5-cand { display: flex; align-items: center; gap: 12px; padding: 10px 12px;
          border-radius: 12px; border: 1px solid transparent; transition: background var(--motion-slow), border-color var(--motion-slow); }
        .v5-ini { flex: none; width: 34px; height: 34px; border-radius: 50%; background: #F1F2EA;
          display: flex; align-items: center; justify-content: center;
          font-weight: 800; font-size: 12px; color: #55622C; }
        .v5-cand-n { flex: 1; min-width: 0; font-size: 14.5px; color: #1A1A1A; }
        .v5-cand-s { font-size: 12.5px; color: #8E8E86; }
        .v5-cand-e { flex: none; font-size: 12px; font-weight: 700; transition: color var(--motion-slow); }
        .v5-accion { margin-top: 16px; border-radius: 12px; padding: 13px 16px; text-align: center;
          font-size: 14px; font-weight: 700; transition: background var(--motion-slow), color var(--motion-slow); }
        .v5-nota { margin: 10px 0 0; text-align: center; font-size: 12px; color: #8E8E86; }
        .v5-pasos { display: flex; gap: 6px; justify-content: center; padding: 14px 0 4px; }
        .v5-paso { width: 30px; height: 10px; border: 0; padding: 0; border-radius: 2px;
          background: transparent; cursor: pointer; position: relative; }
        .v5-paso::after { content: ''; position: absolute; inset: 3.5px 3px;
          border-radius: 2px; background: rgba(26,26,26,.16); transition: background var(--motion-slow); }
        .v5-paso:hover::after { background: rgba(26,26,26,.34); }
        .v5-paso:focus-visible { outline: 2px solid #5A6142; outline-offset: 2px; border-radius: 4px; }
        .v5-paso-on::after { background: #5A6142; }

        .v5-registro-t { margin: 0 0 16px; font-size: 12px; font-weight: 700; letter-spacing: .14em;
          text-transform: uppercase; color: #8E8E86; }
        .v5-registro-l { margin: 0 0 22px; padding: 0; list-style: none;
          display: flex; flex-direction: column; gap: 11px; }
        .v5-registro-l li { display: flex; gap: 14px; font-size: 14.5px; line-height: 1.5; color: #C9C9C2; }
        .v5-hora { flex: none; width: 46px; font-variant-numeric: tabular-nums; color: #8E8E86; }
        .v5-salida { display: inline-flex; align-items: center; gap: 8px; font-size: 15px;
          font-weight: 700; color: #D9C29E; }
        .v5-salida:hover { text-decoration: underline; text-underline-offset: 4px; }

        /* En el móvil, del registro se quedan la primera y las tres últimas
           líneas (la baja, el recordatorio y el cierre): la tarjeta de arriba
           ya cuenta el paso a paso y las siete seguidas eran media pantalla. */
        @media (max-width: 560px) {
          .v5-registro-l li:nth-child(2), .v5-registro-l li:nth-child(3), .v5-registro-l li:nth-child(4) { display: none; }
          .v5-registro-l li { font-size: 14px; }
        }
        /* Al pasar de paso, el texto que cambia entra en vez de sustituirse de
           golpe (la key remonta el span y reinicia la animación): el ojo ve
           QUÉ ha cambiado en la tarjeta, no un parpadeo de la tarjeta entera. */
        @keyframes v5-cambia { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
        @media (prefers-reduced-motion: no-preference) {
          .v5-cambia { display: inline-block; animation: v5-cambia var(--motion-slow) var(--motion-ease) both; }
        }
        @media (prefers-reduced-motion: reduce) {
          .v5-badge, .v5-cand, .v5-cand-e, .v5-accion, .v5-paso::after { transition: none; }
        }
      `}</style>
    </section>
  );
}
