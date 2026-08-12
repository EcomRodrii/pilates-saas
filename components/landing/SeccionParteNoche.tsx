// "Anoche, mientras tú cerrabas" — el parte de lo que el estudio resolvió sin
// nadie delante.
//
// Estaba en el hero y ahí llegaba demasiado pronto: demostraba automatización
// a alguien que todavía no sabía qué era Tentare. Ahora va DESPUÉS de que se
// haya visto el producto funcionando, que es cuando "esto lo hizo solo"
// significa algo — ya se sabe qué es "esto".
//
// Las cuatro líneas son funciones reales, cada una con su propia página:
// sustituciones, avisos a alumnas, reservas 24/7 y la app.

const LINEAS: { hora: string; texto: React.ReactNode }[] = [
  { hora: '21:04', texto: <>Marta avisa: mañana no puede</> },
  { hora: '21:41', texto: <>Julia acepta — <strong>clase cubierta</strong></> },
  { hora: '21:41', texto: <>8 alumnas avisadas del cambio</> },
  { hora: '23:52', texto: <>2 reservas nuevas desde la app</> },
];

export function SeccionParteNoche() {
  return (
    <section className="v5-noche" aria-labelledby="v5-noche-h">
      <div className="v5-noche-wrap">
        <div className="v5-noche-texto">
          <p className="v5-noche-eyebrow">Mientras tú haces otras cosas</p>
          <h2 id="v5-noche-h" className="v5-noche-h2">Tentare sigue trabajando.</h2>
          <p className="v5-noche-lead">
            No es una bandeja de avisos esperando a que los leas. Cuando una instructora falla, busca quién la
            cubre y avisa a las alumnas — y tú te enteras cuando ya está hecho.
          </p>
        </div>

        <div className="v5-noche-parte">
          <p className="v5-noche-tit">Anoche, mientras tú cerrabas</p>
          <ul className="v5-noche-lista">
            {LINEAS.map((l) => (
              <li key={l.hora + String(l.texto)}>
                <span className="v5-noche-hora">{l.hora}</span>
                <span className="v5-noche-txt">{l.texto}</span>
              </li>
            ))}
          </ul>
          <p className="v5-noche-pie">Ni una llamada tuya.</p>
        </div>
      </div>

      <style>{`
        .v5-noche { background: #131313; padding: clamp(72px,11vw,132px) clamp(20px,4vw,48px); }
        .v5-noche-wrap { max-width: 1180px; margin: 0 auto; display: grid;
          grid-template-columns: 1fr 1fr; gap: clamp(32px,5vw,72px); align-items: center; }
        .v5-noche-eyebrow { margin: 0 0 16px; font-size: 12px; font-weight: 700; letter-spacing: .18em;
          text-transform: uppercase; color: #D9C29E; }
        .v5-noche-h2 { margin: 0 0 18px; font-size: clamp(30px,4.6vw,56px); font-weight: 800; line-height: 1.02;
          letter-spacing: -.04em; color: #fff; text-wrap: balance; }
        .v5-noche-lead { margin: 0; font-size: 16.5px; line-height: 1.6; color: #A6A69E; max-width: 46ch; }

        .v5-noche-parte { border-radius: 18px; padding: 22px 22px 18px;
          background: rgba(252,251,246,.05); border: 1px solid rgba(252,251,246,.14); }
        .v5-noche-tit { margin: 0 0 16px; font-size: 11.5px; font-weight: 700; letter-spacing: .12em;
          text-transform: uppercase; color: #D9C29E; }
        .v5-noche-lista { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 12px; }
        .v5-noche-lista li { display: flex; gap: 14px; align-items: baseline; }
        .v5-noche-hora { flex: none; width: 46px; font-size: 12.5px; font-weight: 700;
          color: rgba(234,232,222,.5); font-variant-numeric: tabular-nums; }
        .v5-noche-txt { font-size: 15px; line-height: 1.4; color: #EAE8DE; }
        .v5-noche-txt strong { color: #fff; font-weight: 800; }
        .v5-noche-pie { margin: 16px 0 0; padding-top: 14px; border-top: 1px solid rgba(252,251,246,.12);
          font-size: 15px; font-weight: 800; color: #D9C29E; }

        @media (max-width: 860px) {
          .v5-noche-wrap { grid-template-columns: 1fr; gap: 28px; }
        }
      `}</style>
    </section>
  );
}
