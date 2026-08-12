'use client';

import Link from 'next/link';
import { useDemo } from './use-demo';
import { SALIDAS } from './enlaces';

// Sección 04 de la landing v5 — "DEMO 2 · Calendario y reservas".
//
// Tres piezas, y solo dos son animadas:
//
//  1. El calendario semanal es un MOCKUP ESTÁTICO (una foto del producto
//     dibujada en HTML, no datos que cambian). El diseño original no lo anima
//     tampoco — solo hay 12 bindings `{{ }}` en toda la sección y ninguno cae
//     dentro de esta rejilla. Se porta tal cual.
//  2. La lista de espera (`PLAZA`) — 4 fotogramas: clase llena → se libera un
//     hueco → se avisa a quien tocaba → confirmada. El "radar 48h" es el
//     mismo mecanismo que ya existe en producto.
//  3. El aforo por reformer (`SPOTS`) — 3 fotogramas de cómo una alumna elige
//     su máquina, "como en el cine".

const CLASE = { n: 'Reformer Avanzado', sub: 'Mañana · 08:30 · Sala 1', dia: 'LUN 10', ocup: '6/8' };

const RESTO_SEMANA: { dia: string; clases: { h: string; n: string; sub: string; bg: string }[] }[] = [
  { dia: 'MAR 11', clases: [
    { h: '09:00', n: 'Reformer Flow', sub: 'Marta · 10/10', bg: '#FBD3E2' },
    { h: '18:00', n: 'Pilates Suelo', sub: 'Carmen · 5/8', bg: '#E1ECD8' },
  ] },
  { dia: 'MIÉ 12', clases: [
    { h: '08:30', n: 'Pilates Mat', sub: 'Sara · 7/12', bg: '#E4E1F4' },
    { h: '13:00', n: 'Mat + Circuito', sub: 'Julia · 9/10', bg: '#F4EAE1' },
  ] },
  { dia: 'JUE 13', clases: [
    { h: '09:00', n: 'Reformer Flow', sub: 'Lucía · 10/10', bg: '#FBD3E2' },
    { h: '19:00', n: 'Barre', sub: 'Sara · 12/12 · +2 en espera', bg: '#E1ECD8' },
  ] },
  { dia: 'VIE 14', clases: [
    { h: '09:15', n: 'Mat + Circuito', sub: 'Julia · 8/10', bg: '#F4EAE1' },
    { h: '17:00', n: 'Reformer Flow', sub: 'Lucía · 9/10', bg: '#FBD3E2' },
  ] },
];

interface FotogramaPlaza {
  count: string; countFg: string; llenas: number;
  waitTxt: string; waitFg: string; waitBg: string; waitBd: string;
  radar: string;
}
const PLAZA: FotogramaPlaza[] = [
  { count: '8 / 10', countFg: '#2F6B4F', llenas: 8, waitTxt: 'Lista de espera · nº 1', waitFg: '#8E8E86', waitBg: 'transparent', waitBd: 'transparent', radar: 'vigilando las próximas 48 h. Esta clase va bien.' },
  { count: '7 / 10', countFg: '#A8442A', llenas: 7, waitTxt: 'Lista de espera · nº 1', waitFg: '#8E8E86', waitBg: 'transparent', waitBd: 'transparent', radar: 'Ana cancela a las 17:40 · plaza libre detectada. Avisando a la lista…' },
  { count: '7 / 10', countFg: '#8F6215', llenas: 7, waitTxt: 'Avisada · confirmando…', waitFg: '#8F6215', waitBg: 'rgba(143,98,21,.08)', waitBd: '#E5CE9C', radar: 'aviso solo a socias con bono activo que ya han hecho esta clase.' },
  { count: '8 / 10', countFg: '#2F6B4F', llenas: 7, waitTxt: 'Confirmada ✓', waitFg: '#2F6B4F', waitBg: 'rgba(47,107,79,.08)', waitBd: 'rgba(47,107,79,.35)', radar: 'plaza recuperada a las 17:44. Sin mensajes tuyos, sin spam.' },
];

interface FotogramaSpot { sel: number; msg: string; dot: string; }
const SPOTS_FASES: FotogramaSpot[] = [
  { sel: -1, msg: 'Plazas libres en blanco · ocupadas en gris', dot: '#8E8E86' },
  { sel: 2, msg: 'Claudia elige el reformer 3, junto al espejo', dot: '#8F6215' },
  { sel: 2, msg: 'Confirmado · guardado como su favorito', dot: '#2F6B4F' },
];
// 8 puestos, 2 ya ocupados por otras alumnas (independiente del que elige Claudia).
const OCUPADOS = new Set([1, 5]);

export function SeccionCalendarioReservas() {
  // Identificadores directos y no `plaza.ref` / `spot.ref`: el compilador de
  // React exige que un ref pasado a JSX sea un binding de primer nivel, no un
  // acceso a propiedad — con el acceso, lo trata como lectura durante el
  // render y lo rechaza.
  const { i: iPlaza, ref: refPlaza } = useDemo(PLAZA.length, 2500);
  const { i: iSpot, ref: refSpot } = useDemo(SPOTS_FASES.length, 2900);
  const P = PLAZA[iPlaza];
  const barras = Array.from({ length: 10 }, (_, n) => n < P.llenas);
  const SP = SPOTS_FASES[iSpot];

  return (
    <section id="calendario" ref={refPlaza as React.Ref<HTMLElement>} className="v5-cal" aria-labelledby="v5-cal-h">
      <div className="v5-cal-wrap">
        <header className="v5-cal-head">
          <p className="v5-cal-eyebrow">Calendario y reservas</p>
          <h2 id="v5-cal-h" className="v5-cal-h2">Tu estudio entero, organizado. Y avisándote solo.</h2>
          <p className="v5-cal-lead">
            Semana, día o mes; salas y capacidad por máquina. Cuando una clase necesita una decisión, el
            calendario te lo dice — no lo descubres tú a las 20:55.
          </p>
        </header>

        {/* ── El mockup del calendario: estático a propósito ── */}
        <div className="v5-cal-mock">
          <div className="v5-cal-mock-top">
            <div>
              <div className="v5-cal-mock-tit">Calendario</div>
              <div className="v5-cal-mock-sub">10 – 16 de agosto</div>
            </div>
            <div className="v5-cal-mock-tabs">
              <span className="v5-tab">Día</span>
              <span className="v5-tab v5-tab-on">Semana</span>
              <span className="v5-tab">Mes</span>
              <span className="v5-tab v5-tab-add">+ Nueva clase</span>
            </div>
          </div>
          <div className="v5-cal-alerta">
            <span className="v5-cal-punto" aria-hidden />
            <span className="v5-cal-alerta-t">1 clase necesita una decisión — Reformer Avanzado · lun 08:30 · sin instructora</span>
            <span className="v5-cal-alerta-b">Ver 08:30</span>
          </div>
          <div className="v5-cal-grid">
            <div className="v5-cal-col">
              <span className="v5-cal-dia">{CLASE.dia}</span>
              <div className="v5-cal-clase v5-cal-clase-alerta">
                <div className="v5-cal-clase-h">08:30 · sin instructora</div>
                <div className="v5-cal-clase-n">{CLASE.n}</div>
                <div className="v5-cal-clase-o">{CLASE.ocup}</div>
              </div>
              <div className="v5-cal-clase" style={{ background: '#F4EAE1' }}>
                <div className="v5-cal-clase-h" style={{ color: '#5A5A52' }}>12:15</div>
                <div className="v5-cal-clase-n">Mat + Circuito</div>
                <div className="v5-cal-clase-o">Julia · 8/10</div>
              </div>
            </div>
            {RESTO_SEMANA.map((col) => (
              <div className="v5-cal-col" key={col.dia}>
                <span className="v5-cal-dia">{col.dia}</span>
                {col.clases.map((c) => (
                  <div className="v5-cal-clase" style={{ background: c.bg }} key={c.h}>
                    <div className="v5-cal-clase-h" style={{ color: '#5A5A52' }}>{c.h}</div>
                    <div className="v5-cal-clase-n">{c.n}</div>
                    <div className="v5-cal-clase-o">{c.sub}</div>
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div className="v5-cal-pie">
            <span><strong>Arrastra una clase para moverla</strong> — los conflictos de sala avisan solos</span>
            <span>Capacidad por reformer, no solo aforo · multi-sala · citas privadas incluidas</span>
          </div>
        </div>

        {/* ── Las dos micro-demos ── */}
        <div className="v5-micro-grid">
          <div className="v5-micro">
            <div className="v5-micro-top">
              <div>
                <div className="v5-micro-tit">Mat + Circuito · 19:00</div>
                <div className="v5-micro-sub">La cancelación de Ana, de la sección anterior</div>
              </div>
              <span className="v5-micro-count" style={{ color: P.countFg }}>{P.count}</span>
            </div>
            <div className="v5-barras" aria-hidden>
              {barras.map((llena, n) => (
                <span key={n} className="v5-barra" style={{ background: llena ? '#4A5330' : '#E7E7E0' }} />
              ))}
            </div>
            <div className="v5-fila-espera" style={{ background: P.waitBg, borderColor: P.waitBd }}>
              <span className="v5-micro-ini">C</span>
              <span className="v5-fila-nombre">Carmen V. · lista de espera</span>
              <span className="v5-fila-estado" style={{ color: P.waitFg }}>{P.waitTxt}</span>
            </div>
            <p className="v5-radar"><strong>Radar 48 h:</strong> {P.radar}</p>
          </div>

          <div className="v5-micro" ref={refSpot as React.Ref<HTMLDivElement>}>
            <div className="v5-micro-top">
              <span className="v5-micro-tit">Y tus alumnas eligen su reformer</span>
              <span className="v5-micro-como">como en el cine</span>
            </div>
            <div className="v5-espejo"><span /><span className="v5-espejo-t">ESPEJO</span><span /></div>
            <div className="v5-spots" role="img" aria-label={SP.msg}>
              {Array.from({ length: 8 }, (_, n) => {
                const ocupado = OCUPADOS.has(n);
                const elegido = SP.sel === n;
                return (
                  <div
                    key={n}
                    className="v5-spot"
                    style={{
                      borderColor: elegido ? '#8F6215' : ocupado ? '#DDDBD0' : '#E7E7E0',
                      background: elegido ? 'rgba(143,98,21,.06)' : '#fff',
                    }}
                  >
                    <span className="v5-spot-m" style={{ background: ocupado ? '#C9C7BB' : elegido ? '#8F6215' : '#DCE0CB' }} />
                    <span className="v5-spot-n">{n + 1}</span>
                  </div>
                );
              })}
            </div>
            <p className="v5-spot-msg"><span className="v5-spot-dot" style={{ background: SP.dot }} />{SP.msg}</p>
          </div>
        </div>

        <div className="v5-cal-salidas">
          <Link href={SALIDAS.funcionalidades.href} className="v5-salida-clara">{SALIDAS.funcionalidades.label} →</Link>
        </div>
      </div>

      <style>{`
        .v5-cal { padding: clamp(72px,11vw,150px) clamp(20px,4vw,48px); }
        .v5-cal-wrap { max-width: 1240px; margin: 0 auto; }
        .v5-cal-head { max-width: 880px; margin-bottom: 48px; }
        .v5-cal-eyebrow { margin: 0 0 18px; font-size: 12px; font-weight: 700; letter-spacing: .18em;
          text-transform: uppercase; color: #8E8E86; }
        .v5-cal-h2 { margin: 0 0 18px; font-size: clamp(30px,4.8vw,68px); font-weight: 800; line-height: 1.02;
          letter-spacing: -.04em; text-wrap: balance; color: #1A1A1A; }
        .v5-cal-lead { margin: 0; max-width: 58ch; font-size: 17px; line-height: 1.6; color: #5A5A52; }

        .v5-cal-mock { border-radius: 18px; overflow: hidden; border: 1px solid #E7E7E0; background: #fff;
          box-shadow: 0 50px 110px rgba(26,26,26,.14); }
        .v5-cal-mock-top { display: flex; justify-content: space-between; align-items: center; gap: 14px;
          flex-wrap: wrap; padding: 18px 22px; border-bottom: 1px solid #F0F0EA; }
        .v5-cal-mock-tit { font-size: 17px; font-weight: 800; }
        .v5-cal-mock-sub { font-size: 12px; color: #8E8E86; }
        .v5-cal-mock-tabs { display: flex; gap: 8px; font-size: 12px; font-weight: 700; flex-wrap: wrap; }
        .v5-tab { padding: 7px 14px; border-radius: 999px; background: #F5F5F1; color: #5A5A52; }
        .v5-tab-on { background: #343825; color: #D9C29E; }
        .v5-tab-add { background: #131313; color: #fff; padding: 7px 16px; }
        .v5-cal-alerta { display: flex; align-items: center; gap: 10px; margin: 14px 22px 0;
          background: rgba(194,80,58,.07); border: 1px solid rgba(194,80,58,.3); border-radius: 12px; padding: 10px 14px; }
        .v5-cal-punto { flex: none; width: 8px; height: 8px; border-radius: 50%; background: #C2503A; }
        .v5-cal-alerta-t { flex: 1; font-size: 12.5px; font-weight: 700; color: #A8442A; }
        .v5-cal-alerta-b { flex: none; font-size: 11.5px; font-weight: 800; background: #A8442A; color: #fff;
          padding: 6px 12px; border-radius: 999px; white-space: nowrap; }
        .v5-cal-grid { display: grid; grid-template-columns: repeat(5,1fr); gap: 10px; padding: 16px 22px 10px;
          overflow-x: auto; }
        .v5-cal-col { display: flex; flex-direction: column; gap: 8px; min-width: 108px; }
        .v5-cal-dia { font-size: 11.5px; font-weight: 800; color: #8E8E86; text-align: center; padding-bottom: 2px; }
        .v5-cal-clase { border-radius: 11px; padding: 10px 12px; background: #fff; }
        .v5-cal-clase-alerta { background: #fff; border: 1.5px solid #C2503A; }
        .v5-cal-clase-h { font-size: 10.5px; font-weight: 700; color: #A8442A; }
        .v5-cal-clase-n { font-size: 12.5px; font-weight: 800; }
        .v5-cal-clase-o { font-size: 11px; color: #5A5A52; margin-top: 2px; }
        .v5-cal-pie { display: flex; justify-content: space-between; gap: 14px; flex-wrap: wrap;
          padding: 14px 22px; border-top: 1px solid #F0F0EA; font-size: 12px; color: #8E8E86; }
        .v5-cal-pie strong { color: #343825; }

        .v5-micro-grid { display: grid; grid-template-columns: repeat(auto-fit,minmax(min(320px,100%),1fr));
          gap: 16px; margin-top: 18px; align-items: stretch; }
        .v5-micro { background: #fff; border: 1px solid #E7E7E0; border-radius: 20px; padding: 24px;
          box-shadow: 0 30px 70px rgba(26,26,26,.08); }
        .v5-micro-top { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; flex-wrap: wrap; }
        .v5-micro-tit { font-size: 16px; font-weight: 800; }
        .v5-micro-sub { font-size: 13px; color: #8E8E86; margin-top: 2px; }
        .v5-micro-count { font-size: 13px; font-weight: 800; transition: color .4s; }
        .v5-micro-como { font-size: 12px; font-weight: 700; color: #8E8E86; }
        .v5-barras { display: flex; gap: 5px; margin: 14px 0 16px; }
        .v5-barra { flex: 1; height: 8px; border-radius: 4px; transition: background .45s; }
        .v5-fila-espera { display: flex; align-items: center; gap: 12px; padding: 9px 12px; border-radius: 12px;
          border: 1px solid transparent; transition: background .4s, border-color .4s; }
        .v5-micro-ini { flex: none; width: 30px; height: 30px; border-radius: 50%; background: #F1F2EA;
          display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 11px; color: #55622C; }
        .v5-fila-nombre { flex: 1; font-size: 14px; font-weight: 600; }
        .v5-fila-estado { flex: none; font-size: 12px; font-weight: 700; transition: color .4s; }
        .v5-radar { margin: 14px 0 0; padding: 11px 14px; border-radius: 12px; background: #F1F2EA;
          font-size: 13px; line-height: 1.55; color: #4A5330; }

        .v5-espejo { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
        .v5-espejo span:not(.v5-espejo-t) { flex: 1; height: 2px; background: #E7E7E0; }
        .v5-espejo-t { font-size: 10px; font-weight: 800; letter-spacing: .18em; color: #B4B0A5; }
        .v5-spots { display: grid; grid-template-columns: repeat(4,1fr); gap: 8px; }
        .v5-spot { border-radius: 11px; border: 1.5px solid #E7E7E0; padding: 8px 0 6px; display: flex;
          flex-direction: column; align-items: center; gap: 4px; transition: background .4s, border-color .4s; }
        .v5-spot-m { width: 22px; height: 29px; border-radius: 5px; transition: background .4s; }
        .v5-spot-n { font-size: 10.5px; font-weight: 700; color: #8E8E86; }
        .v5-spot-msg { display: flex; align-items: center; gap: 8px; margin: 12px 0 0; font-size: 12.5px;
          color: #5A5A52; }
        .v5-spot-dot { flex: none; width: 7px; height: 7px; border-radius: 50%; transition: background .4s; }

        .v5-cal-salidas { margin-top: 30px; }
        .v5-salida-clara { font-size: 15px; font-weight: 700; color: #343825; }
        .v5-salida-clara:hover { text-decoration: underline; text-underline-offset: 4px; }

        @media (prefers-reduced-motion: reduce) {
          .v5-barra, .v5-fila-espera, .v5-fila-estado, .v5-spot, .v5-spot-m, .v5-spot-dot { transition: none; }
        }
      `}</style>
    </section>
  );
}
