'use client';

import { useState } from 'react';
import Link from 'next/link';
import { SALIDAS } from './enlaces';

// Sección 05 de la landing v5 — "DEMO 3 · Tu app de alumnas".
//
// A diferencia de sustituciones/calendario, esta demo NO tiene ciclo
// automático en el original: los tres temas se cambian con un clic, y así se
// queda hasta que alguien toque otro. Aquí igual — sin useDemo, un useState
// simple con el primer tema como valor inicial.
//
// El editor de temas es real (Configuración → Apariencia), y estos tres son
// los que trae de fábrica.

interface Tema {
  name: string; dot: string; bd: string;
  frame: string; bg: string; card: string; borde: string; ink: string; mut: string;
  btnBg: string; btnFg: string; avBg: string; avFg: string; avIni: string;
  top: string; user: string; sub: string;
  headline: boolean; accesos: boolean; retos: boolean; progreso: boolean; floating: boolean;
  tabBg: string; tabActive: string; tabInactive: string;
}

const TEMAS: Tema[] = [
  {
    name: 'Oliva', dot: '#3A4028', bd: '#3A4028',
    frame: '#DCDAD0', bg: '#EFEDE6', card: '#FFFFFF', borde: '#E7E4D9', ink: '#2A2A22', mut: '#8E8E86',
    btnBg: '#3A4028', btnFg: '#FFFFFF', avBg: '#DCE0CB', avFg: '#55622C', avIni: 'L',
    top: '', user: 'Hola, Laura', sub: '¿Lista para tu sesión de hoy?',
    headline: false, accesos: true, retos: false, progreso: false, floating: false,
    tabBg: '#FFFFFF', tabActive: '#3A4028', tabInactive: '#8E8E86',
  },
  {
    name: 'Bloom', dot: '#7B61FF', bd: '#7B61FF',
    frame: '#F0A57C', bg: '#FFFFFF', card: '#FFFFFF', borde: '#ECEAF2', ink: '#1D1B33', mut: '#8A87A0',
    btnBg: '#7B61FF', btnFg: '#FFFFFF', avBg: '#EFEBFF', avFg: '#7B61FF', avIni: 'L',
    top: 'Buenos días', user: 'Laura Ortega', sub: '',
    headline: true, accesos: false, retos: true, progreso: false, floating: true,
    tabBg: '#FFFFFF', tabActive: '#7B61FF', tabInactive: '#8A87A0',
  },
  {
    name: 'Noir', dot: '#20241C', bd: '#20241C',
    frame: '#20241C', bg: '#F4F2EC', card: '#FFFFFF', borde: '#E7E4D9', ink: '#20241C', mut: '#8E8E86',
    btnBg: '#232B20', btnFg: '#FFFFFF', avBg: '#D9DEC8', avFg: '#55622C', avIni: 'C',
    top: 'Buenos días', user: 'Clara', sub: '',
    headline: false, accesos: true, retos: false, progreso: true, floating: false,
    tabBg: '#232B20', tabActive: '#D9A94E', tabInactive: '#A9AC9A',
  },
];

export function SeccionApp() {
  const [n, setN] = useState(0);
  const T = TEMAS[n];

  return (
    <section id="app" className="v5-app" aria-labelledby="v5-app-h">
      <div className="v5-app-wrap">
        <div className="v5-app-texto">
          <p className="v5-app-eyebrow">Tu app de alumnas</p>
          <h2 id="v5-app-h" className="v5-app-h2">Tu app debería parecerse a tu estudio.</h2>
          <p className="v5-app-lead">
            Con Tentare la experiencia de tus alumnas la diseñas tú, sin diseñador: eliges tema, y cambian
            los colores, los bloques del inicio y hasta la navegación. Este editor es el de verdad — pruébalo:
          </p>

          <div className="v5-temas" role="group" aria-label="Elegir tema">
            {TEMAS.map((t, i) => (
              <button
                key={t.name}
                type="button"
                onClick={() => setN(i)}
                aria-pressed={i === n}
                className={i === n ? 'v5-tema v5-tema-on' : 'v5-tema'}
                style={{ borderColor: i === n ? t.bd : 'rgba(255,255,255,.2)', background: i === n ? 'rgba(255,255,255,.08)' : 'transparent' }}
              >
                <span className="v5-tema-dot" style={{ background: t.dot }} />
                {t.name}
              </button>
            ))}
          </div>

          <ul className="v5-app-lista">
            <li><strong>Reserva, bonos, retos y progreso</strong> — con su reformer favorito guardado.</li>
            <li><strong>Avisos por su canal</strong>: app, email o WhatsApp. Sin que tú escribas.</li>
            <li><strong>White-label completo</strong> en el plan Cadena — ni rastro de Tentare.</li>
          </ul>

          <Link href={SALIDAS.app.href} className="v5-salida">{SALIDAS.app.label} →</Link>
        </div>

        {/* ── El móvil ── */}
        <div className="v5-telefono-zona">
          <div className="v5-telefono" style={{ background: T.frame }}>
            <div className="v5-pantalla" style={{ background: T.bg }}>
              <div className="v5-status" style={{ color: T.ink }}>
                <span>9:41</span>
                <span className="v5-notch" style={{ background: T.ink }} />
                <span>•••</span>
              </div>

              <div className="v5-cuerpo">
                <div className="v5-cabecera">
                  <span className="v5-avatar" style={{ background: T.avBg, color: T.avFg }}>{T.avIni}</span>
                  <span className="v5-nombre-zona">
                    {T.top && <span className="v5-top" style={{ color: T.mut }}>{T.top}</span>}
                    <span className="v5-user" style={{ color: T.ink }}>{T.user}</span>
                    {T.sub && <span className="v5-sub" style={{ color: T.mut }}>{T.sub}</span>}
                  </span>
                  <span className="v5-campana" style={{ borderColor: T.borde }}><span style={{ background: T.mut }} /></span>
                </div>

                {T.headline && <div className="v5-headline" style={{ color: T.ink }}>Bienvenida a tu sesión de Pilates</div>}

                <div className="v5-seccion-tit" style={{ color: T.ink }}>Tu semana</div>
                <div className="v5-tarjeta" style={{ background: T.card, borderColor: T.borde }}>
                  <div className="v5-tarjeta-tit" style={{ color: T.ink }}>No tienes clases reservadas</div>
                  <div className="v5-tarjeta-sub" style={{ color: T.mut }}>Mira el horario de esta semana y guarda tu sitio.</div>
                  <div className="v5-tarjeta-btn" style={{ background: T.btnBg, color: T.btnFg }}>Ver horario</div>
                </div>

                {T.accesos && (
                  <>
                    <div className="v5-seccion-tit" style={{ color: T.ink }}>Mis accesos rápidos</div>
                    <div className="v5-accesos">
                      {['Reservar', 'Mis reservas', 'Favoritas', 'Mi bono'].map((a) => (
                        <div key={a} className="v5-acceso" style={{ background: T.card, borderColor: T.borde }}>
                          <span className="v5-acceso-icono" style={{ borderColor: T.mut }} />
                          <span style={{ color: T.ink }}>{a}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {T.retos && (
                  <>
                    <div className="v5-fila-tit"><span style={{ color: T.ink }}>Retos</span><span style={{ color: T.mut }}>Ver todos</span></div>
                    <div className="v5-retos">
                      <div className="v5-reto" style={{ background: '#CBE8C4' }}>
                        <div className="v5-reto-tit">Core Pilates <span className="v5-reto-badge">14 días</span></div>
                        <div className="v5-reto-n">156 K apuntadas</div>
                        <div className="v5-reto-btn">Apuntarme</div>
                      </div>
                      <div className="v5-reto" style={{ background: '#F9D3DE', flexBasis: '48%' }}>
                        <div className="v5-reto-tit">Face Yoga</div>
                        <div className="v5-reto-n">42 K apuntadas</div>
                        <div className="v5-reto-btn">Apuntarme</div>
                      </div>
                    </div>
                  </>
                )}

                {T.progreso && (
                  <>
                    <div className="v5-seccion-tit" style={{ color: T.ink }}>Progreso semanal</div>
                    <div className="v5-progreso" style={{ background: T.card, borderColor: T.borde }}>
                      <span className="v5-progreso-c"><span style={{ color: T.ink }}>0%</span></span>
                      <span style={{ color: T.mut, fontSize: 11.5 }}>0 de 4 clases · aún sin reservas</span>
                    </div>
                  </>
                )}

                {T.floating ? (
                  <div className="v5-tabs-flot">
                    <span className="v5-tab-flot-on">Inicio</span>
                    <span className="v5-tab-flot-hueco" /><span className="v5-tab-flot-hueco" /><span className="v5-tab-flot-hueco" />
                  </div>
                ) : (
                  <div className="v5-tabs-clas" style={{ background: T.tabBg }}>
                    <span style={{ color: T.tabActive, fontWeight: 800 }}>Inicio</span>
                    <span style={{ color: T.tabInactive }}>Clases</span>
                    <span style={{ color: T.tabInactive }}>Reservas</span>
                    <span style={{ color: T.tabInactive }}>Perfil</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .v5-app { background: #131313; padding: clamp(72px,11vw,150px) clamp(20px,4vw,48px); }
        .v5-app-wrap { max-width: 1160px; margin: 0 auto; display: grid;
          grid-template-columns: 1.05fr .95fr; gap: clamp(32px,5vw,64px); align-items: center; }
        .v5-app-eyebrow { margin: 0 0 18px; font-size: 12px; font-weight: 700; letter-spacing: .18em;
          text-transform: uppercase; color: #D9C29E; }
        .v5-app-h2 { margin: 0 0 24px; font-size: clamp(28px,4.6vw,66px); font-weight: 800; line-height: 1.01;
          letter-spacing: -.04em; color: #fff; text-wrap: balance; }
        .v5-app-lead { margin: 0 0 26px; max-width: 46ch; font-size: 17px; line-height: 1.6; color: #A6A69E; }

        .v5-temas { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 26px; }
        .v5-tema { display: flex; align-items: center; gap: 8px; padding: 11px 20px; border-radius: 999px;
          border: 1.5px solid rgba(255,255,255,.2); background: transparent; color: #E8E8E4;
          font-size: 14px; font-weight: 700; cursor: pointer;
          transition: background .25s, color .25s, border-color .25s; font-family: inherit; }
        .v5-tema-dot { width: 12px; height: 12px; border-radius: 50%; }
        .v5-tema:focus-visible { outline: 2px solid #D9C29E; outline-offset: 2px; }

        .v5-app-lista { margin: 0 0 26px; padding: 0; list-style: none; display: flex; flex-direction: column;
          gap: 10px; font-size: 14.5px; color: #A6A69E; line-height: 1.5; }
        .v5-app-lista strong { color: #E8E8E4; }
        .v5-salida { font-size: 15px; font-weight: 700; color: #D9C29E; }
        .v5-salida:hover { text-decoration: underline; text-underline-offset: 4px; }

        .v5-telefono-zona { display: flex; justify-content: center; }
        .v5-telefono { width: 300px; max-width: 100%; border-radius: 42px; padding: 9px;
          box-shadow: 0 60px 130px rgba(0,0,0,.6); transition: background .4s; }
        .v5-pantalla { border-radius: 34px; overflow: hidden; transition: background .4s; }
        .v5-status { display: flex; justify-content: space-between; align-items: center;
          padding: 12px 20px 4px; font-size: 11.5px; font-weight: 700; transition: color .4s; }
        .v5-notch { width: 56px; height: 15px; border-radius: 999px; transition: background .4s; }
        .v5-cuerpo { padding: 12px 16px 16px; }
        .v5-cabecera { display: flex; align-items: center; gap: 10px; }
        .v5-avatar { flex: none; width: 36px; height: 36px; border-radius: 50%; display: flex;
          align-items: center; justify-content: center; font-weight: 800; font-size: 13px; transition: background .4s, color .4s; }
        .v5-nombre-zona { flex: 1; min-width: 0; }
        .v5-top { display: block; font-size: 11px; font-weight: 600; transition: color .4s; }
        .v5-user { display: block; font-size: 17px; font-weight: 800; letter-spacing: -.02em; transition: color .4s; }
        .v5-sub { display: block; font-size: 10.5px; transition: color .4s; }
        .v5-campana { flex: none; width: 32px; height: 32px; border-radius: 50%; border: 1px solid;
          display: flex; align-items: center; justify-content: center; transition: border-color .4s; }
        .v5-campana span { width: 6px; height: 6px; border-radius: 50%; transition: background .4s; }
        .v5-headline { font-size: 21px; font-weight: 800; line-height: 1.12; letter-spacing: -.025em; margin-top: 12px; }
        .v5-seccion-tit { font-size: 13.5px; font-weight: 800; margin-top: 14px; }
        .v5-tarjeta { margin-top: 8px; border-radius: 16px; border: 1px solid; padding: 14px; transition: background .4s, border-color .4s; }
        .v5-tarjeta-tit { font-size: 14px; font-weight: 800; }
        .v5-tarjeta-sub { font-size: 11px; line-height: 1.5; margin-top: 4px; }
        .v5-tarjeta-btn { display: inline-block; margin-top: 11px; font-size: 11.5px; font-weight: 800;
          padding: 9px 18px; border-radius: 999px; transition: background .4s, color .4s; }
        .v5-fila-tit { display: flex; justify-content: space-between; align-items: baseline; margin-top: 14px;
          font-size: 13px; }
        .v5-fila-tit span:first-child { font-weight: 800; } .v5-fila-tit span:last-child { font-weight: 600; }
        .v5-accesos { display: grid; grid-template-columns: repeat(4,1fr); gap: 7px; margin-top: 8px; }
        .v5-acceso { border-radius: 13px; border: 1px solid; padding: 10px 3px; display: flex; flex-direction: column;
          align-items: center; gap: 5px; font-size: 8.5px; font-weight: 600; transition: background .4s, border-color .4s; }
        .v5-acceso-icono { width: 14px; height: 14px; border-radius: 4px; border: 1.5px solid; }
        .v5-retos { display: flex; gap: 8px; margin-top: 8px; }
        .v5-reto { flex-basis: 58%; border-radius: 15px; padding: 11px; color: #1D1B33; }
        .v5-reto-tit { font-size: 12px; font-weight: 800; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
        .v5-reto-badge { font-size: 8.5px; font-weight: 700; background: #fff; border-radius: 999px; padding: 2px 6px; }
        .v5-reto-n { font-size: 9.5px; font-weight: 600; margin-top: 5px; opacity: .72; }
        .v5-reto-btn { margin-top: 8px; text-align: center; background: #1D1B33; color: #fff; font-size: 10.5px;
          font-weight: 800; padding: 7px; border-radius: 999px; }
        .v5-progreso { display: flex; align-items: center; gap: 12px; margin-top: 8px; border-radius: 16px;
          border: 1px solid; padding: 12px; transition: background .4s, border-color .4s; }
        .v5-progreso-c { flex: none; width: 46px; height: 46px; border-radius: 50%; border: 5px solid #E5E2D6;
          display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 800; }

        .v5-tabs-flot { margin-top: 14px; display: flex; align-items: center; gap: 7px; background: #fff;
          border-radius: 999px; padding: 6px; box-shadow: 0 14px 34px rgba(29,27,51,.18); }
        .v5-tab-flot-on { background: #7B61FF; color: #fff; font-size: 11px; font-weight: 800; padding: 9px 16px; border-radius: 999px; }
        .v5-tab-flot-hueco { flex: 1; height: 12px; }
        .v5-tabs-clas { margin-top: 14px; display: flex; justify-content: space-around; border-radius: 14px;
          padding: 12px 5px; font-size: 10.5px; transition: background .4s; }

        @media (max-width: 860px) {
          .v5-app-wrap { grid-template-columns: 1fr; }
          .v5-telefono-zona { order: -1; margin-bottom: 8px; }
        }
      `}</style>
    </section>
  );
}
