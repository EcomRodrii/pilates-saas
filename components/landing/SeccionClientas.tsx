'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';

// Secciones 07-09 de la landing v5: "Clientas, equipo y automatizaciones",
// "Hecho para entenderse" y "La cuenta". Las tres van en un solo fichero
// porque son un mismo tramo de la página (cierre del recorrido de producto,
// sin ancla propia ni enlace de navegación que las separe) y solo la primera
// tiene estado: un aviso de dos frases que se alterna solo, igual que el
// original (ciclo de 3,2 s, congelado en la segunda frase — la más
// informativa — con prefers-reduced-motion).

const NORA_TXT = [
  'Nora S. · bono agotado hoy → renovación enviada',
  'Nora S. · renovado en un toque ✓',
];

// useSyncExternalStore y no un `matchMedia(...)` leído directo en el cuerpo:
// el snapshot de servidor es `false`, así que leerlo directo en el cliente
// desajustaría la hidratación en cuanto el sistema pidiera menos movimiento.
function useMenosMovimiento(): boolean {
  return useSyncExternalStore(
    (avisar) => {
      const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
      mq.addEventListener('change', avisar);
      return () => mq.removeEventListener('change', avisar);
    },
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    () => false,
  );
}

export function SeccionClientas() {
  const reduce = useMenosMovimiento();
  const [n, setN] = useState(0);

  useEffect(() => {
    if (reduce) return;
    const t = setInterval(() => setN((x) => (x + 1) % NORA_TXT.length), 3200);
    return () => clearInterval(t);
  }, [reduce]);

  const i = reduce ? 1 : n;

  return (
    <>
      <section id="clientas" className="v5-cli" aria-labelledby="v5-cli-h">
        <div className="v5-cli-wrap">
          <div className="v5-cli-cabecera">
            <p className="v5-cli-eyebrow">Clientas, equipo y automatizaciones</p>
            <h2 id="v5-cli-h" className="v5-cli-h2">El software debería trabajar para ti. No al revés.</h2>
          </div>

          <div className="v5-cli-grid">
            <div className="v5-cli-tarjeta">
              <div className="v5-cli-cuerpo">
                <div className="v5-cli-fila">
                  <span className="v5-cli-av" style={{ background: '#E4D9CB', color: '#8A6D4C' }}>N</span>
                  <span className="v5-cli-nombre-zona">
                    <span className="v5-cli-nombre">Nora S. <span className="v5-cli-badge">Activa</span></span>
                    <span className="v5-cli-sub">Alta el 8 de abril · domiciliación SEPA activa</span>
                  </span>
                  <span className="v5-cli-boton">Enviar email</span>
                </div>
                <div className="v5-cli-bono">
                  <div className="v5-cli-bono-fila"><span>Bono 10 clases</span><span className="v5-cli-bono-estado">10 de 10 · renovación enviada</span></div>
                  <div className="v5-cli-barra"><div className="v5-cli-barra-rel" /></div>
                </div>
                <div className="v5-cli-dosgrid">
                  <div className="v5-cli-mini"><div className="v5-cli-mini-tit">PLAZA FIJA</div><div className="v5-cli-mini-val">Mar 09:00 · Reformer 3</div></div>
                  <div className="v5-cli-mini"><div className="v5-cli-mini-tit">RECUPERACIONES</div><div className="v5-cli-mini-val">1 pendiente</div></div>
                </div>
                <div className="v5-cli-cuatrogrid">
                  {[['7', 'CLASES'], ['3', 'ESTE MES'], ['1', 'CANCELACIÓN'], ['68€', 'ESTE MES']].map(([v, l], i) => (
                    <div key={i} className="v5-cli-stat"><div className="v5-cli-stat-v">{v}</div><div className="v5-cli-stat-l">{l}</div></div>
                  ))}
                </div>
              </div>
              <div className="v5-cli-pie">
                <div className="v5-cli-pie-tit">Cada clienta, entera, en una ficha</div>
                <div className="v5-cli-pie-txt">
                  Bonos, plaza fija, recuperaciones, pagos y SEPA, comunicaciones, salud. Y la señal a tiempo:{' '}
                  <strong className="v5-cli-nora">{NORA_TXT[i]}</strong>
                </div>
              </div>
            </div>

            <div className="v5-cli-tarjeta">
              <div className="v5-cli-cuerpo">
                <div className="v5-cli-tresgrid">
                  <div className="v5-cli-mini"><div className="v5-cli-mini-tit">MIEMBROS</div><div className="v5-cli-mini-v2">8</div></div>
                  <div className="v5-cli-mini"><div className="v5-cli-mini-tit">CLASES / SEMANA</div><div className="v5-cli-mini-v2">13</div></div>
                  <div className="v5-cli-mini"><div className="v5-cli-mini-tit">HORAS ESTE MES</div><div className="v5-cli-mini-v2">41 h</div></div>
                </div>
                <div className="v5-cli-persona">
                  <div className="v5-cli-fila">
                    <span className="v5-cli-av" style={{ background: '#F7E3EA', color: '#B4537E' }}>J</span>
                    <span><span className="v5-cli-nombre">Julia Ramos</span><span className="v5-cli-sub">Activa · Instructora · 10,3 h este mes</span></span>
                  </div>
                  <div className="v5-cli-alerta">Atención: sus clases se están quedando vacías · 8% de ocupación media → Revisar</div>
                </div>
                <div className="v5-cli-persona">
                  <div className="v5-cli-fila">
                    <span className="v5-cli-av" style={{ background: '#E0EAF2', color: '#3F5A7A' }}>M</span>
                    <span><span className="v5-cli-nombre">María</span><span className="v5-cli-sub">Recepción · ahora mismo en el mostrador</span></span>
                    <span className="v5-cli-boton">Escribirle</span>
                  </div>
                </div>
              </div>
              <div className="v5-cli-pie">
                <div className="v5-cli-pie-tit">Tu equipo, sin hojas de cálculo</div>
                <div className="v5-cli-pie-txt">Disponibilidad, horas, liquidaciones y avisos («sus clases se están quedando vacías»). Por eso las sustituciones saben a quién llamar.</div>
              </div>
            </div>
          </div>

          <div className="v5-cli-cuando">
            <div><div className="v5-cli-cuando-tit" style={{ color: '#8E8E86' }}>CUANDO</div><div className="v5-cli-cuando-txt">Un recibo falla a las 18:05</div></div>
            <div className="v5-cli-cuando-col"><div className="v5-cli-cuando-tit" style={{ color: '#55622C' }}>TENTARE</div><div className="v5-cli-cuando-txt">Reintenta el cobro solo y avisa a la alumna por su canal, con su consentimiento</div></div>
            <div className="v5-cli-cuando-col"><div className="v5-cli-cuando-tit" style={{ color: '#2F6B4F' }}>RESULTADO</div><div className="v5-cli-cuando-txt">Cobrado esa noche. Tú no perseguiste a nadie</div></div>
          </div>
        </div>
      </section>

      <section className="v5-hpe" aria-labelledby="v5-hpe-h">
        <div className="v5-hpe-wrap">
          <div className="v5-hpe-cabecera">
            <p className="v5-hpe-eyebrow">Hecho para entenderse</p>
            <h2 id="v5-hpe-h" className="v5-hpe-h2">Si necesitas un manual para usar tu software, algo ha fallado.</h2>
            <p className="v5-hpe-lead">Las tareas de todos los días, contadas en lo que cuestan de verdad. Sin formación, sin consultor, sin vídeo de 40 minutos.</p>
          </div>
          <div className="v5-hpe-grid">
            {[
              ['3 campos', 'Crear una clase', 'Tipo, sala, hora. La capacidad la hereda de la sala.'],
              ['1 minuto', 'Alta de una alumna', 'Con su bono y su domiciliación. Queda guardada al momento.'],
              ['1 toque', 'Cubrir una baja', 'Lo acabas de ver arriba. Tu parte es aprobar.'],
              ['2 pasos', 'Crear un bono', 'Sesiones y precio. Se vende solo en tu app y tu widget.'],
            ].map(([n2, tit, desc]) => (
              <div key={tit} className="v5-hpe-card">
                <div className="v5-hpe-n">{n2}</div>
                <div className="v5-hpe-tit">{tit}</div>
                <div className="v5-hpe-desc">{desc}</div>
              </div>
            ))}
          </div>
          <div className="v5-hpe-cierre">
            <span className="v5-hpe-preg">¿Tu software actual te obliga a hacer más pasos para esto?</span>
            <span className="v5-hpe-resp">Esa es la comparación que importa. Pruébalo con tus propias tareas.</span>
          </div>
        </div>
      </section>

      <section className="v5-cuenta" aria-labelledby="v5-cuenta-h">
        <div className="v5-cuenta-wrap">
          <h2 id="v5-cuenta-h" className="v5-cuenta-h2">Tentare no te vende más horas delante del ordenador. Te las devuelve.</h2>
          <div className="v5-cuenta-lista">
            <span>Las bajas se cubren solas.</span>
            <span>Los huecos se llenan solos.</span>
            <span>Los recibos se reintentan solos.</span>
            <span>Las alumnas se avisan solas.</span>
          </div>
          <p className="v5-cuenta-cierre">Más tiempo para enseñar. Más tiempo para crecer.<br />Y las tardes, otra vez tuyas.</p>
        </div>
      </section>

      <style>{`
        .v5-cli { background: #F3F3EF; border-top: 1px solid #E7E7E0; border-bottom: 1px solid #E7E7E0;
          padding: clamp(72px,11vw,120px) clamp(20px,4vw,48px); }
        .v5-cli-wrap { max-width: 1240px; margin: 0 auto; }
        .v5-cli-cabecera { max-width: 880px; margin-bottom: 40px; }
        .v5-cli-eyebrow { font-size: 12px; font-weight: 700; letter-spacing: .18em; color: #8E8E86; margin: 0 0 18px; text-transform: uppercase; }
        .v5-cli-h2 { font-size: clamp(30px,4.6vw,56px); font-weight: 800; line-height: 1; letter-spacing: -.04em; margin: 0; text-wrap: balance; }
        .v5-cli-grid { display: grid; grid-template-columns: repeat(auto-fit,minmax(320px,1fr)); gap: 16px; align-items: stretch; }
        .v5-cli-tarjeta { border-radius: 18px; overflow: hidden; border: 1px solid #E7E7E0; background: #fff; box-shadow: 0 30px 70px rgba(26,26,26,.08); }
        .v5-cli-cuerpo { padding: 20px 20px 6px; }
        .v5-cli-fila { display: flex; align-items: center; gap: 11px; margin-bottom: 12px; }
        .v5-cli-av { width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 800; flex-shrink: 0; }
        .v5-cli-nombre-zona { flex: 1; min-width: 0; }
        .v5-cli-nombre { display: block; font-size: 15px; font-weight: 800; }
        .v5-cli-badge { font-size: 10.5px; font-weight: 800; color: #2F6B4F; background: rgba(47,107,79,.1); padding: 3px 8px; border-radius: 999px; margin-left: 4px; }
        .v5-cli-sub { display: block; font-size: 11.5px; color: #8E8E86; }
        .v5-cli-boton { font-size: 11px; font-weight: 700; color: #5A5A52; border: 1px solid #E7E7E0; border-radius: 999px; padding: 5px 11px; white-space: nowrap; }
        .v5-cli-bono { border: 1px solid #EFEFEA; border-radius: 12px; padding: 12px 14px; }
        .v5-cli-bono-fila { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; font-size: 13px; font-weight: 800; }
        .v5-cli-bono-estado { font-size: 11px; font-weight: 700; color: #8F6215; }
        .v5-cli-barra { height: 6px; border-radius: 3px; background: #EFEFEA; margin-top: 8px; }
        .v5-cli-barra-rel { width: 100%; height: 100%; border-radius: 3px; background: #8F6215; }
        .v5-cli-dosgrid { display: flex; gap: 8px; margin-top: 8px; }
        .v5-cli-tresgrid { display: grid; grid-template-columns: repeat(3,1fr); gap: 8px; margin-bottom: 10px; }
        .v5-cli-mini { flex: 1; border: 1px solid #EFEFEA; border-radius: 12px; padding: 10px 12px; }
        .v5-cli-mini-tit { font-size: 10px; font-weight: 700; color: #8E8E86; }
        .v5-cli-mini-val { font-size: 12.5px; font-weight: 800; }
        .v5-cli-mini-v2 { font-size: 16px; font-weight: 800; }
        .v5-cli-cuatrogrid { display: grid; grid-template-columns: repeat(4,1fr); gap: 6px; margin-top: 8px; text-align: center; }
        .v5-cli-stat { background: #F5F5F1; border-radius: 10px; padding: 9px 4px; }
        .v5-cli-stat-v { font-size: 15px; font-weight: 800; }
        .v5-cli-stat-l { font-size: 9.5px; font-weight: 700; color: #8E8E86; }
        .v5-cli-persona { border: 1px solid #EFEFEA; border-radius: 12px; padding: 12px 14px; margin-top: 8px; }
        .v5-cli-persona .v5-cli-fila { margin-bottom: 0; }
        .v5-cli-persona .v5-cli-av { width: 34px; height: 34px; font-size: 12px; }
        .v5-cli-alerta { margin-top: 9px; background: rgba(194,80,58,.07); border: 1px solid rgba(194,80,58,.25);
          border-radius: 10px; padding: 8px 11px; font-size: 11.5px; font-weight: 700; color: #A8442A; }
        .v5-cli-pie { padding: 6px 22px 22px; }
        .v5-cli-pie-tit { font-size: 16px; font-weight: 800; }
        .v5-cli-pie-txt { font-size: 13.5px; line-height: 1.6; color: #5A5A52; margin-top: 4px; }
        .v5-cli-nora { color: #8F6215; }
        .v5-cli-cuando { margin-top: 16px; background: #fff; border: 1px solid #E7E7E0; border-radius: 18px; padding: 26px;
          display: grid; grid-template-columns: repeat(auto-fit,minmax(240px,1fr)); gap: 18px; align-items: center; }
        .v5-cli-cuando-col { border-left: 2px solid #E7E7E0; padding-left: 18px; }
        .v5-cli-cuando-tit { font-size: 11px; font-weight: 800; letter-spacing: .14em; margin-bottom: 8px; }
        .v5-cli-cuando-txt { font-size: 15px; font-weight: 700; line-height: 1.5; }

        .v5-hpe { padding: clamp(72px,11vw,120px) clamp(20px,4vw,48px); }
        .v5-hpe-wrap { max-width: 1240px; margin: 0 auto; }
        .v5-hpe-cabecera { max-width: 880px; margin-bottom: 40px; }
        .v5-hpe-eyebrow { font-size: 12px; font-weight: 700; letter-spacing: .18em; color: #8E8E86; margin: 0 0 18px; text-transform: uppercase; }
        .v5-hpe-h2 { font-size: clamp(30px,4.6vw,56px); font-weight: 800; line-height: 1; letter-spacing: -.04em; margin: 0 0 18px; text-wrap: balance; }
        .v5-hpe-lead { font-size: 16.5px; line-height: 1.6; color: #5A5A52; max-width: 56ch; margin: 0; }
        .v5-hpe-grid { display: grid; grid-template-columns: repeat(auto-fit,minmax(220px,1fr)); gap: 14px; }
        .v5-hpe-card { background: #fff; border: 1px solid #E7E7E0; border-radius: 18px; padding: 24px; }
        .v5-hpe-n { font-size: 26px; font-weight: 800; letter-spacing: -.03em; color: #55622C; }
        .v5-hpe-tit { font-size: 15px; font-weight: 800; margin-top: 6px; }
        .v5-hpe-desc { font-size: 13px; color: #8E8E86; margin-top: 3px; }
        .v5-hpe-cierre { margin-top: 26px; display: flex; gap: 16px; align-items: baseline; flex-wrap: wrap;
          border-top: 1px solid #DEDED6; padding-top: 22px; }
        .v5-hpe-preg { font-size: 15px; font-weight: 800; }
        .v5-hpe-resp { font-size: 14.5px; color: #5A5A52; }

        .v5-cuenta { background: #0F0F0F; padding: clamp(72px,11vw,120px) clamp(20px,4vw,48px); }
        .v5-cuenta-wrap { max-width: 900px; margin: 0 auto; text-align: center; }
        .v5-cuenta-h2 { font-size: clamp(28px,4.4vw,52px); font-weight: 800; line-height: 1.05; letter-spacing: -.04em; color: #fff; margin: 0 0 26px; text-wrap: balance; }
        .v5-cuenta-lista { display: flex; flex-direction: column; gap: 10px; font-size: 16px; font-weight: 600; color: #A6A69E; max-width: 520px; margin: 0 auto; }
        .v5-cuenta-cierre { font-size: clamp(17px,2vw,22px); font-weight: 800; color: #D9C29E; letter-spacing: -.02em; margin: 32px 0 0; line-height: 1.35; }
      `}</style>
    </>
  );
}
