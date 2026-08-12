// Sección 02 de la landing v5 — "El martes de una propietaria". Estática: solo
// texto y una columna de avisos con hora, sin estado ni demo. Cada aviso remite
// a la demo que lo resuelve más abajo en la misma página.

const AVISOS: { hora: string; color: string; texto: React.ReactNode }[] = [
  { hora: '16:42', color: '#A8442A', texto: <><strong>Marta:</strong> «No puedo dar la clase de mañana» <span className="v5-mar-nota">→ resuelto en Sustituciones</span></> },
  { hora: '17:40', color: '#8F6215', texto: <><strong>Ana cancela</strong> la clase de las 19:00 <span className="v5-mar-nota">→ Calendario y reservas</span></> },
  { hora: '18:05', color: '#8F6215', texto: <><strong>Un recibo devuelto</strong> — otra vez perseguir <span className="v5-mar-nota">→ Clientas y equipo</span></> },
  { hora: '23:10', color: '#5A5A52', texto: <><strong>«¿Puedo cambiar mi clase?»</strong> — y tú contestando de noche <span className="v5-mar-nota">→ Tu app de alumnas</span></> },
];

export function SeccionMartes() {
  return (
    <section className="v5-mar" aria-labelledby="v5-mar-h">
      <div className="v5-mar-wrap">
        <div>
          <p className="v5-mar-eyebrow">El martes de una propietaria</p>
          <h2 id="v5-mar-h" className="v5-mar-h2">Deja de dirigir tu estudio desde WhatsApp.</h2>
          <p className="v5-mar-lead">
            Cada aviso son diez minutos: buscar, escribir, esperar, cuadrar. Diez minutos que salen de tus clases y de
            tus tardes. Estos son los de un martes cualquiera — y luego mira lo que Tentare hace con cada uno.
          </p>
        </div>
        <div className="v5-mar-lista">
          {AVISOS.map((a) => (
            <div key={a.hora} className="v5-mar-item">
              <span className="v5-mar-hora" style={{ color: a.color }}>{a.hora}</span>
              <span className="v5-mar-texto">{a.texto}</span>
            </div>
          ))}
          <div className="v5-mar-cierre">Nada de esto es grave por separado. Junto, es tu semana entera.</div>
        </div>
      </div>

      <style>{`
        .v5-mar { padding: clamp(64px,10vw,110px) clamp(20px,4vw,48px); }
        .v5-mar-wrap { max-width: 1240px; margin: 0 auto; display: grid;
          grid-template-columns: repeat(auto-fit,minmax(340px,1fr)); gap: clamp(32px,6vw,90px); align-items: center; }
        .v5-mar-eyebrow { font-size: 12px; font-weight: 700; letter-spacing: .18em; color: #8E8E86; margin: 0 0 18px; text-transform: uppercase; }
        .v5-mar-h2 { font-size: clamp(30px,4.4vw,56px); font-weight: 800; line-height: 1.02; letter-spacing: -.04em; margin: 0 0 22px; text-wrap: balance; }
        .v5-mar-lead { font-size: 16.5px; line-height: 1.6; color: #5A5A52; max-width: 46ch; margin: 0; }
        .v5-mar-lista { display: flex; flex-direction: column; gap: 12px; }
        .v5-mar-item { background: #fff; border: 1px solid #E7E7E0; border-radius: 16px; padding: 15px 20px;
          display: flex; gap: 14px; align-items: center; box-shadow: 0 10px 30px rgba(26,26,26,.05); }
        .v5-mar-hora { flex-shrink: 0; font-size: 12px; font-weight: 800; width: 44px; }
        .v5-mar-texto { font-size: 14.5px; line-height: 1.45; }
        .v5-mar-nota { color: #8E8E86; }
        .v5-mar-cierre { border: 1.5px dashed #C9C5B4; border-radius: 16px; padding: 15px 20px;
          font-size: 14.5px; font-weight: 700; color: #3B3B34; }
      `}</style>
    </section>
  );
}
