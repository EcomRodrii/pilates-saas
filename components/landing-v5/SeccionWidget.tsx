'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { SALIDAS } from './enlaces';

// Sección 06 de la landing v5 — "DEMO 4 · Tu web".
//
// La demo más grande e interactiva de la landing: un widget de reservas
// embebido en una web de estudio FICTICIA ("Alma Pilates Studio", no un
// cliente real), con reserva de verdad — clic, cambia de estado, aparece en
// "Mis reservas". Es el mismo widget que existe en el producto
// (`?embed=1` en /reservar/[slug], generado desde Configuración → Enlaces),
// aquí con datos de muestra en vez de los de un estudio real.
//
// Estado 100% derivado de dos objetos: qué se ha reservado y qué bono se ha
// comprado. Nada de temporizadores — cada cambio es un clic de quien mira la
// página, igual que en el producto de verdad.

const W_TABS = ['Clases', 'Bonos', 'Mis reservas', 'Cuenta'] as const;

const W_DAYS = [
  { dow: 'LUN', num: 12 }, { dow: 'MAR', num: 13 }, { dow: 'MIÉ', num: 14 }, { dow: 'JUE', num: 15 },
  { dow: 'VIE', num: 16 }, { dow: 'SÁB', num: 17 }, { dow: 'DOM', num: 18 },
];

interface ClaseDia { h: string; n: string; sub: string; p: number }

const W_CLASES: ClaseDia[][] = [
  [{ h: '09:00', n: 'Pilates Reformer', sub: 'Todos los niveles · Con Laura', p: 3 }, { h: '10:15', n: 'Pilates Flow', sub: 'Nivel intermedio · Con Marta', p: 2 }, { h: '11:30', n: 'Pilates Reformer', sub: 'Nivel avanzado · Con Laura', p: 1 }, { h: '17:00', n: 'Pilates Core', sub: 'Todos los niveles · Con Marta', p: 4 }],
  [{ h: '09:00', n: 'Pilates Reformer', sub: 'Todos los niveles · Con Marta', p: 2 }, { h: '12:00', n: 'Pilates Suelo', sub: 'Iniciación · Con Carmen', p: 5 }, { h: '18:00', n: 'Pilates Reformer', sub: 'Nivel intermedio · Con Laura', p: 0 }, { h: '19:00', n: 'Barre', sub: 'Todos los niveles · Con Sara', p: 3 }],
  [{ h: '09:00', n: 'Pilates Flow', sub: 'Todos los niveles · Con Laura', p: 1 }, { h: '10:15', n: 'Pilates Reformer', sub: 'Nivel intermedio · Con Marta', p: 2 }, { h: '18:00', n: 'Pilates Core', sub: 'Todos los niveles · Con Carmen', p: 4 }],
  [{ h: '09:00', n: 'Pilates Reformer', sub: 'Todos los niveles · Con Laura', p: 3 }, { h: '17:00', n: 'Pilates Reformer', sub: 'Nivel avanzado · Con Marta', p: 0 }, { h: '19:00', n: 'Pilates Suelo', sub: 'Todos los niveles · Con Carmen', p: 2 }],
  [{ h: '09:00', n: 'Pilates Reformer', sub: 'Todos los niveles · Con Laura', p: 2 }, { h: '10:15', n: 'Pilates Flow', sub: 'Nivel intermedio · Con Marta', p: 3 }, { h: '18:00', n: 'Pilates Reformer', sub: 'Todos los niveles · Con Sara', p: 4 }],
  [{ h: '10:00', n: 'Pilates Reformer', sub: 'Todos los niveles · Con Laura', p: 5 }, { h: '11:15', n: 'Barre', sub: 'Todos los niveles · Con Sara', p: 2 }],
  [{ h: '10:30', n: 'Pilates Suelo suave', sub: 'Todos los niveles · Con Carmen', p: 6 }],
];

const W_BONOS = [
  { n: 'Bono 5 sesiones', sub: 'Caduca en 3 meses', precio: '75 €' },
  { n: 'Bono 10 sesiones', sub: 'Caduca en 6 meses', precio: '140 €' },
  { n: 'Mensualidad ilimitada', sub: 'Renovación automática', precio: '119 €/mes' },
];

export function SeccionWidget() {
  const [tab, setTab] = useState(0);
  const [dia, setDia] = useState(0);
  const [reservado, setReservado] = useState<Record<string, boolean>>({});
  const [comprado, setComprado] = useState<Record<number, boolean>>({});

  const toggleReserva = (clave: string) =>
    setReservado((r) => { const n = { ...r }; if (n[clave]) delete n[clave]; else n[clave] = true; return n; });

  const filas = useMemo(() => W_CLASES[dia].map((w, i) => {
    const clave = `${dia}-${i}`;
    const hecho = !!reservado[clave];
    const llena = w.p === 0;
    const libres = llena ? 0 : w.p - (hecho ? 1 : 0);
    return {
      ...w, clave, hecho, llena,
      btn: llena ? (hecho ? 'En lista · nº 1' : 'Lista de espera') : (hecho ? 'Reservada ✓' : 'Reservar'),
      btnBg: llena ? (hecho ? 'rgba(143,98,21,.14)' : '#F5F5F1') : (hecho ? 'rgba(47,107,79,.14)' : '#4A5330'),
      btnFg: llena ? (hecho ? '#8F6215' : '#5A5A52') : (hecho ? '#2F6B4F' : '#fff'),
      plazasTxt: llena || libres === 0 ? 'completa' : `${libres} ${libres === 1 ? 'plaza disponible' : 'plazas disponibles'}`,
      plazasFg: llena || libres === 0 ? '#A8442A' : libres === 1 ? '#8F6215' : '#8E8E86',
    };
  }), [dia, reservado]);

  const misReservas = useMemo(() => Object.keys(reservado).map((clave) => {
    const [di, ci] = clave.split('-').map(Number);
    const d = W_DAYS[di]; const c = W_CLASES[di]?.[ci];
    if (!c) return null;
    const dow = d.dow.charAt(0) + d.dow.slice(1).toLowerCase();
    return { clave, n: c.n, sub: `${dow} ${d.num} · ${c.h} · ${c.sub.split('· ')[1]}` };
  }).filter((x): x is NonNullable<typeof x> => x !== null), [reservado]);

  return (
    <section id="widget" className="v5-w" aria-labelledby="v5-w-h">
      <div className="v5-w-wrap">
        <header className="v5-w-head">
          <p className="v5-w-eyebrow">Tu web</p>
          <h2 id="v5-w-h" className="v5-w-h2">Tu web debería vender tus clases. No mandar a tus alumnas a otra plataforma.</h2>
          <p className="v5-w-lead">
            El widget de reservas se integra en cualquier web con tu marca. Este es funcional — cambia de
            día, reserva, apúntate a una lista de espera, mira los bonos:
          </p>
        </header>

        <div className="v5-navegador">
          <div className="v5-navegador-top">
            <span /><span /><span />
            <span className="v5-navegador-url">almapilates.es — la web del estudio, no la nuestra</span>
          </div>
          <div className="v5-navegador-body">
            {/* ── La web ficticia del estudio ── */}
            <div className="v5-web">
              <div className="v5-web-marca">ALMA<span className="v5-web-sub">PILATES STUDIO</span></div>
              <div className="v5-web-h1">Movimiento que te hace sentir bien.</div>
              <p className="v5-web-p">
                Pilates consciente en el corazón de la ciudad. Grupos reducidos, atención personalizada y
                un espacio para ti.
              </p>
              <div className="v5-web-cta">Reserva tu clase</div>
              <ul className="v5-web-lista">
                <li><strong>La web del estudio</strong> — su diseño, su contenido.</li>
                <li><strong>El widget de Tentare</strong> — horario, reserva y bonos, sin salir.</li>
                <li><strong>La reserva</strong> — en segundos, con su marca. Más conversión.</li>
              </ul>
            </div>

            {/* ── El widget ── */}
            <div className="v5-widget">
              <div className="v5-widget-tit">Reserva tu clase</div>
              <div className="v5-w-tabs" role="tablist">
                {W_TABS.map((t, i) => (
                  <button
                    key={t}
                    type="button"
                    role="tab"
                    aria-selected={tab === i}
                    onClick={() => setTab(i)}
                    className={tab === i ? 'v5-w-tab v5-w-tab-on' : 'v5-w-tab'}
                  >
                    {t}
                  </button>
                ))}
              </div>

              {tab === 0 && (
                <>
                  <div className="v5-w-semana">
                    <button type="button" onClick={() => setDia((d) => Math.max(0, d - 1))} aria-label="Semana anterior" className="v5-w-flecha">‹</button>
                    <span>12 – 18 mayo</span>
                    <button type="button" onClick={() => setDia((d) => Math.min(6, d + 1))} aria-label="Semana siguiente" className="v5-w-flecha">›</button>
                  </div>
                  <div className="v5-w-dias" role="tablist" aria-label="Elegir día">
                    {W_DAYS.map((d, i) => (
                      <button
                        key={d.dow}
                        type="button"
                        role="tab"
                        aria-selected={dia === i}
                        onClick={() => setDia(i)}
                        className={dia === i ? 'v5-w-dia v5-w-dia-on' : 'v5-w-dia'}
                      >
                        {d.dow}<br /><span>{d.num}</span>
                      </button>
                    ))}
                  </div>
                  <div className="v5-w-filas">
                    {filas.map((w) => (
                      <div key={w.clave} className="v5-w-fila" style={{ background: w.hecho ? 'rgba(47,107,79,.05)' : '#fff' }}>
                        <span className="v5-w-hora"><strong>{w.h}</strong><span>50 min</span></span>
                        <span className="v5-w-clase">
                          <strong>{w.n}</strong>
                          <span>{w.sub}</span>
                        </span>
                        <span className="v5-w-accion">
                          <button type="button" onClick={() => toggleReserva(w.clave)} className="v5-w-reservar" style={{ background: w.btnBg, color: w.btnFg }}>
                            {w.btn}
                          </button>
                          <span className="v5-w-plazas" style={{ color: w.plazasFg }}>{w.plazasTxt}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {tab === 1 && (
                <div className="v5-w-filas">
                  {W_BONOS.map((b, i) => {
                    const hecho = !!comprado[i];
                    return (
                      <div key={b.n} className="v5-w-bono">
                        <span className="v5-w-clase"><strong>{b.n}</strong><span>{b.sub}</span></span>
                        <span className="v5-w-precio">{b.precio}</span>
                        <button
                          type="button"
                          onClick={() => setComprado((c) => ({ ...c, [i]: !c[i] }))}
                          className="v5-w-comprar"
                          style={{ background: hecho ? 'rgba(47,107,79,.14)' : '#4A5330', color: hecho ? '#2F6B4F' : '#fff' }}
                        >
                          {hecho ? 'Añadido ✓' : 'Comprar'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {tab === 2 && (
                misReservas.length > 0 ? (
                  <div className="v5-w-filas">
                    {misReservas.map((r) => (
                      <div key={r.clave} className="v5-w-reserva">
                        <span className="v5-w-clase"><strong>{r.n}</strong><span>{r.sub}</span></span>
                        <span className="v5-w-confirmada">Confirmada ✓</span>
                        <button type="button" onClick={() => toggleReserva(r.clave)} className="v5-w-cancelar">Cancelar</button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="v5-w-vacio">Aún no tienes reservas.<br />Reserva desde la pestaña Clases.</p>
                )
              )}

              {tab === 3 && (
                <div className="v5-w-cuenta">
                  <div className="v5-w-perfil">
                    <span className="v5-w-avatar">L</span>
                    <span><strong>Laura Ortega</strong><span>laura@email.com</span></span>
                  </div>
                  <div className="v5-w-fila-cuenta">
                    <span>Bono 10 sesiones</span>
                    <span className="v5-w-bono-restante">Quedan {Math.max(0, 8 - misReservas.length)}</span>
                  </div>
                  <div className="v5-w-fila-cuenta">
                    <span>Método de pago</span>
                    <span>Visa ···· 4021</span>
                  </div>
                </div>
              )}

              <p className="v5-w-seguro">Reservas seguras con Tentare</p>
            </div>
          </div>
        </div>

        <div className="v5-w-beneficios">
          {[
            ['Más reservas', 'menos fricción'],
            ['Mejor experiencia', 'para tus alumnas'],
            ['100% integrado', 'con tu marca'],
            ['Más conversión', 'en tu propia web'],
          ].map(([t, s]) => (
            <div key={t} className="v5-beneficio"><strong>{t}</strong><span>{s}</span></div>
          ))}
        </div>

        <div className="v5-w-salidas">
          <Link href={SALIDAS.widget.href} className="v5-salida-clara">{SALIDAS.widget.label} →</Link>
        </div>
      </div>

      <style>{`
        .v5-w { padding: clamp(72px,11vw,150px) clamp(20px,4vw,48px); }
        .v5-w-wrap { max-width: 1240px; margin: 0 auto; }
        .v5-w-head { max-width: 880px; margin-bottom: 40px; }
        .v5-w-eyebrow { margin: 0 0 18px; font-size: 12px; font-weight: 700; letter-spacing: .18em;
          text-transform: uppercase; color: #8E8E86; }
        .v5-w-h2 { margin: 0 0 18px; font-size: clamp(28px,4.8vw,68px); font-weight: 800; line-height: 1.02;
          letter-spacing: -.04em; text-wrap: balance; color: #1A1A1A; }
        .v5-w-lead { margin: 0; max-width: 58ch; font-size: 17px; line-height: 1.6; color: #5A5A52; }

        .v5-navegador { border-radius: 20px; overflow: hidden; border: 1px solid #E7E7E0;
          box-shadow: 0 60px 130px rgba(26,26,26,.14); background: #FBFAF7; }
        .v5-navegador-top { display: flex; align-items: center; gap: 8px; padding: 12px 18px;
          background: #fff; border-bottom: 1px solid #E7E7E0; }
        .v5-navegador-top span:not(.v5-navegador-url) { width: 10px; height: 10px; border-radius: 50%; background: #E7E7E0; }
        .v5-navegador-url { flex: 1; text-align: center; font-size: 12px; font-weight: 600; color: #8E8E86; }
        .v5-navegador-body { display: grid; grid-template-columns: repeat(auto-fit,minmax(min(320px,100%),1fr));
          gap: clamp(24px,4vw,56px); padding: clamp(24px,4vw,56px); align-items: start; }

        .v5-web { padding-top: 10px; }
        .v5-web-marca { font-family: 'Newsreader', serif; font-size: 15px; letter-spacing: .3em; font-weight: 500;
          margin-bottom: 26px; color: #1A1A1A; }
        .v5-web-sub { font-size: 10px; letter-spacing: .24em; color: #8E8E86; display: block; margin-top: 3px; }
        .v5-web-h1 { font-family: 'Newsreader', serif; font-size: clamp(28px,3.6vw,48px); line-height: 1.08;
          font-weight: 500; letter-spacing: -.01em; max-width: 12ch; color: #1A1A1A; }
        .v5-web-p { font-size: 15px; line-height: 1.65; color: #5A5A52; max-width: 36ch; margin: 18px 0 26px; }
        .v5-web-cta { display: inline-block; white-space: nowrap; background: #4A5330; color: #fff;
          font-size: 14px; font-weight: 700; padding: 13px 26px; border-radius: 10px; }
        .v5-web-lista { margin: 34px 0 0; padding-top: 22px; border-top: 1px solid #E7E7E0; list-style: none;
          display: flex; flex-direction: column; gap: 10px; font-size: 13.5px; color: #5A5A52; }
        .v5-web-lista strong { color: #1A1A1A; }

        .v5-widget { background: #fff; border: 1px solid #E7E7E0; border-radius: 18px; padding: 20px;
          box-shadow: 0 24px 60px rgba(26,26,26,.1); }
        .v5-widget-tit { font-size: 18px; font-weight: 800; margin-bottom: 14px; }
        .v5-w-tabs { display: flex; gap: 7px; margin-bottom: 16px; }
        .v5-w-tab { flex: 1; text-align: center; font-size: 12px; font-weight: 700; padding: 9px 4px;
          border-radius: 10px; background: #F5F5F1; color: #5A5A52; border: 0; cursor: pointer;
          transition: background .2s, color .2s; white-space: nowrap; font-family: inherit; }
        .v5-w-tab-on { background: #343825; color: #fff; }
        .v5-w-tab:focus-visible { outline: 2px solid #343825; outline-offset: 2px; }

        .v5-w-semana { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;
          font-size: 13px; font-weight: 700; }
        .v5-w-flecha { background: none; border: 0; color: #5A5A52; cursor: pointer; padding: 2px 10px;
          font-size: 16px; font-family: inherit; }
        .v5-w-dias { display: grid; grid-template-columns: repeat(7,1fr); gap: 6px; margin-bottom: 16px; }
        .v5-w-dia { text-align: center; padding: 8px 0; border-radius: 10px; background: #F5F5F1; color: #5A5A52;
          font-size: 11px; font-weight: 700; line-height: 1.3; cursor: pointer; border: 0;
          transition: background .2s, color .2s; font-family: inherit; }
        .v5-w-dia span { font-size: 14px; }
        .v5-w-dia-on { background: #4A5330; color: #fff; }

        .v5-w-filas { display: flex; flex-direction: column; gap: 9px; }
        .v5-w-fila, .v5-w-bono, .v5-w-reserva { display: flex; align-items: center; gap: 12px; border: 1px solid #EFEFEA;
          border-radius: 14px; padding: 12px 14px; transition: background .3s; }
        .v5-w-hora { width: 46px; flex-shrink: 0; display: flex; flex-direction: column; }
        .v5-w-hora strong { font-size: 13.5px; } .v5-w-hora span { font-size: 10.5px; color: #8E8E86; }
        .v5-w-clase { flex: 1; min-width: 0; display: flex; flex-direction: column; }
        .v5-w-clase strong { font-size: 13.5px; } .v5-w-clase span { font-size: 11.5px; color: #8E8E86; }
        .v5-w-accion { flex-shrink: 0; text-align: right; display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }
        .v5-w-reservar { font-size: 12px; font-weight: 700; padding: 8px 12px; border-radius: 9px; border: 0;
          cursor: pointer; white-space: nowrap; font-family: inherit; }
        .v5-w-plazas { font-size: 10.5px; font-weight: 700; }

        .v5-w-precio { font-size: 14.5px; font-weight: 800; white-space: nowrap; }
        .v5-w-comprar { font-size: 12px; font-weight: 800; padding: 9px 14px; border-radius: 9px; border: 0;
          cursor: pointer; transition: background .3s, color .3s; white-space: nowrap; font-family: inherit; }
        .v5-w-reserva { border-color: rgba(47,107,79,.25); background: rgba(47,107,79,.04); }
        .v5-w-confirmada { font-size: 11.5px; font-weight: 700; color: #2F6B4F; white-space: nowrap; }
        .v5-w-cancelar { font-size: 11.5px; font-weight: 700; color: #A8442A; cursor: pointer; padding: 6px 2px;
          background: none; border: 0; font-family: inherit; }
        .v5-w-vacio { text-align: center; padding: 30px 10px; color: #8E8E86; font-size: 13px; font-weight: 600; line-height: 1.6; }

        .v5-w-cuenta { display: flex; flex-direction: column; gap: 9px; }
        .v5-w-perfil { display: flex; align-items: center; gap: 12px; border: 1px solid #EFEFEA; border-radius: 14px; padding: 14px; }
        .v5-w-avatar { width: 40px; height: 40px; border-radius: 50%; background: #EDEFE3; display: flex;
          align-items: center; justify-content: center; font-weight: 800; color: #4A5330; flex: none; }
        .v5-w-perfil span:last-child { display: flex; flex-direction: column; }
        .v5-w-perfil span:last-child strong { font-size: 14px; } .v5-w-perfil span:last-child span { font-size: 11.5px; color: #8E8E86; }
        .v5-w-fila-cuenta { display: flex; justify-content: space-between; align-items: center; border: 1px solid #EFEFEA;
          border-radius: 14px; padding: 14px; font-size: 13px; font-weight: 700; }
        .v5-w-bono-restante { color: #4A5330; font-weight: 800; }

        .v5-w-seguro { margin: 16px 0 0; text-align: center; font-size: 11px; color: #A8A89F; }

        .v5-w-beneficios { margin-top: 40px; display: grid; grid-template-columns: repeat(auto-fit,minmax(180px,1fr));
          gap: 20px; }
        .v5-beneficio { display: flex; flex-direction: column; gap: 3px; }
        .v5-beneficio strong { font-size: 15px; color: #1A1A1A; }
        .v5-beneficio span { font-size: 13px; color: #8E8E86; }

        .v5-w-salidas { margin-top: 30px; }
        .v5-salida-clara { font-size: 15px; font-weight: 700; color: #343825; }
        .v5-salida-clara:hover { text-decoration: underline; text-underline-offset: 4px; }
      `}</style>
    </section>
  );
}
