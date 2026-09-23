// «Y por la mañana, solo lo que necesita tu decisión» — la segunda mitad del
// bloque 06 del rediseño (23-sep), justo después de SeccionParteNoche.
//
// El calendario semanal es un MOCKUP ESTÁTICO (el producto dibujado en HTML,
// no datos que cambian) con la alerta de la única clase que necesita a la
// propietaria. Hasta el 23-sep llevaba debajo dos micro-demos (la lista de
// espera y «elige su reformer» sobre una foto): salieron al recortar la home —
// la lista de espera ya la cuenta «Mientras cerrabas» y la elección de reformer
// vive en /funcionalidades/plazas-fijas y en la app de la alumna.

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

export function SeccionCalendarioReservas() {
  return (
    <section id="calendario" className="v5-cal" aria-labelledby="v5-cal-h">
      <div className="v5-cal-wrap">
        <header className="v5-cal-head lp-rv">
          <h2 id="v5-cal-h" className="v5-cal-h2">Y por la mañana, solo lo que necesita tu decisión.</h2>
          <p className="v5-cal-lead">
            Semana, día o mes, con capacidad por reformer. Cuando una clase necesita algo de ti, el calendario te
            lo dice; lo demás ya está resuelto.
          </p>
        </header>

        {/* ── El mockup del calendario: estático a propósito ── */}
        <div className="v5-cal-mock lp-rv" style={{ ['--lp-r' as string]: 6 }}>
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
        </div>

      </div>

      <style>{`
        /* Va justo después de «Mientras cerrabas» (la noche) y es su mañana: mismo
           fondo y poco aire arriba, para que se lean como un solo bloque. */
        .v5-cal { padding: clamp(32px,4vw,48px) clamp(20px,4vw,48px) clamp(64px,7vw,104px); }
        .v5-cal-wrap { max-width: 1240px; margin: 0 auto; }
        .v5-cal-head { max-width: 980px; margin-bottom: 40px; }
        .v5-cal-h2 { margin: 0 0 18px; font-size: clamp(30px,4.4vw,60px); font-weight: 800; line-height: 1.02;
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
        .v5-cal-grid { display: grid; grid-template-columns: repeat(5,1fr); gap: 10px; padding: 16px 22px 20px;
          overflow-x: auto; }
        .v5-cal-col { display: flex; flex-direction: column; gap: 8px; min-width: 108px; }
        .v5-cal-dia { font-size: 11.5px; font-weight: 800; color: #8E8E86; text-align: center; padding-bottom: 2px; }
        .v5-cal-clase { border-radius: 11px; padding: 10px 12px; background: #fff; }
        .v5-cal-clase-alerta { background: #fff; border: 1.5px solid #C2503A; }
        .v5-cal-clase-h { font-size: 10.5px; font-weight: 700; color: #A8442A; }
        .v5-cal-clase-n { font-size: 12.5px; font-weight: 800; }
        .v5-cal-clase-o { font-size: 11px; color: #5A5A52; margin-top: 2px; }

      `}</style>
    </section>
  );
}
