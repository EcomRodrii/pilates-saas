// «¿Te suena?» — el bloque de identificación, justo después del hero.
//
// La landing prometía y enseñaba producto, pero en ningún momento le decía a
// la propietaria «esto te pasa a ti». Aquí van cuatro momentos de un día
// cualquiera, con su hora, sin producto: el reconocimiento tiene que llegar
// antes que la solución (rediseño por fases, 23-sep, bloque 02).
//
// WhatsApp aparece como SÍNTOMA («un mensaje…»), no como eje: el fundador no
// quiere que la propuesta de Tentare se quede en «deja WhatsApp».
//
// ⚠️ Nada de cifras («pierdes 10 h a la semana»): no hay dato que las
// respalde. Son escenas, no estadísticas.

const MOMENTOS: { hora: string; escena: string; coste: string }[] = [
  {
    hora: '07:10',
    escena: '«¿Me puedes pasar a la de las 19?»',
    coste: 'Un mensaje, un cambio a mano y otro mensaje para confirmar.',
  },
  {
    hora: '12:30',
    escena: 'A Lucía le caducó el bono y nadie la avisó.',
    coste: 'Ahora toca explicárselo, o regalarle la clase.',
  },
  {
    hora: '16:42',
    escena: 'Marta no puede dar su clase de mañana.',
    coste: 'Empiezas a escribir al equipo, una por una.',
  },
  {
    hora: '21:00',
    escena: 'Cuadrar quién ha pagado este mes.',
    coste: 'Entre transferencias, efectivo y el Excel de los bonos.',
  },
];

export function SeccionTeSuena() {
  return (
    <section id="te-suena" className="v5-suena" aria-labelledby="v5-suena-h">
      <div className="v5-suena-wrap">
        <h2 id="v5-suena-h" className="v5-suena-h2 lp-rv">
          El estudio no te quita tiempo en clase. <span className="v5-suena-h2-b">Te lo quita todo lo demás.</span>
        </h2>

        <ol className="v5-suena-lista">
          {MOMENTOS.map((m, n) => (
            <li key={m.hora} className="v5-suena-momento lp-rv" style={{ ['--lp-r' as string]: n * 7 }}>
              <time className="v5-suena-hora">{m.hora}</time>
              <p className="v5-suena-escena">{m.escena}</p>
              <p className="v5-suena-coste">{m.coste}</p>
            </li>
          ))}
        </ol>

        <p className="v5-suena-cierre lp-rv">Nada de esto es difícil. Es que no se acaba nunca.</p>
      </div>

      <style>{`
        /* El vídeo de producto va justo encima y monta sobre el final del héroe;
           el oscuro empieza detrás de él, así que sube un poco para abrazarlo. */
        .v5-suena { background: #131313; color: #fff; margin-top: calc(-1 * clamp(120px,14vw,220px));
          padding: calc(clamp(120px,14vw,220px) + clamp(64px,7vw,104px)) clamp(20px,4vw,48px) clamp(64px,7vw,104px); }
        .v5-suena-wrap { max-width: 1240px; margin: 0 auto; }
        .v5-suena-h2 { margin: 0; max-width: 20ch; font-size: clamp(30px,4.4vw,58px); font-weight: 800; line-height: 1.02;
          letter-spacing: -.04em; text-wrap: balance; color: #fff; }
        .v5-suena-h2-b { color: #D9C29E; }

        .v5-suena-lista { list-style: none; margin: clamp(40px,5vw,64px) 0 0; padding: 0; display: grid;
          grid-template-columns: repeat(4,minmax(0,1fr)); gap: 12px; }
        .v5-suena-momento { display: flex; flex-direction: column; gap: 10px; padding: 22px 22px 24px; border-radius: 20px;
          background: rgba(255,255,255,.045); border: 1px solid rgba(255,255,255,.08);
          transition: background var(--motion-medium), border-color var(--motion-medium); }
        /* Sin transform en :hover: el <li> ya lleva la entrada al hacer scroll. */
        .v5-suena-momento:hover { background: rgba(255,255,255,.07); border-color: rgba(217,194,158,.3); }
        .v5-suena-hora { font-family: var(--font-plex-mono, ui-monospace, monospace); font-size: 13px; font-weight: 600;
          letter-spacing: .04em; color: #D9C29E; font-variant-numeric: tabular-nums; }
        .v5-suena-escena { margin: 0; font-size: 18px; font-weight: 700; line-height: 1.3; letter-spacing: -.01em;
          color: #fff; text-wrap: balance; }
        .v5-suena-coste { margin: auto 0 0; padding-top: 6px; font-size: 14.5px; line-height: 1.5; color: #A6A69E; }

        .v5-suena-cierre { margin: clamp(32px,4vw,48px) 0 0; font-size: clamp(18px,1.6vw,22px); font-weight: 700;
          letter-spacing: -.01em; color: #EAE8DE; }

        @media (max-width: 1080px) { .v5-suena-lista { grid-template-columns: repeat(2,minmax(0,1fr)); } }
        /* En el móvil, dos por fila y más compactas: una debajo de otra eran
           cuatro pantallas de tarjetas. */
        @media (max-width: 560px) {
          .v5-suena-lista { gap: 8px; }
          .v5-suena-momento { padding: 14px 14px 16px; gap: 6px; border-radius: 16px; }
          .v5-suena-hora { font-size: 12px; }
          .v5-suena-escena { font-size: 15px; line-height: 1.28; }
          .v5-suena-coste { font-size: 12.5px; line-height: 1.45; padding-top: 2px; }
        }
      `}</style>
    </section>
  );
}
