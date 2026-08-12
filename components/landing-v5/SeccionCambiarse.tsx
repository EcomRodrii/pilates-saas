import Link from 'next/link';
import { SALIDAS } from './enlaces';

// Sección 10 de la landing v5 — "Si ya usas otro software". Estática:
// cuatro quejas públicas de la categoría (G2/Capterra/Trustpilot, sin cifra
// ni cliente inventado — es lo que se lee en la categoría, no un dato propio)
// contra cómo está construido Tentare en ese mismo punto. Cierra con la
// salida real hacia /comparativa, que es donde vive el detalle plan a plan.

const PUNTOS = [
  { queja: '«Permanencias de 12–24 meses y hasta 500 € por exportar tus propios datos.»', aqui: 'sin permanencia. Exportas todo gratis, cuando quieras.' },
  { queja: '«Subidas del 40–70% a mitad de relación y precios que solo dan en una demo.»', aqui: 'precio público — 29, 59 o 149 €. Si cambia, se avisa antes y se respeta tu plan.' },
  { queja: '«Soporte robotizado: esperas eternas y respuestas de plantilla.»', aqui: 'personas, en español, que saben qué es un reformer.' },
  { queja: '«Migrar da miedo: hay quien perdió las tarjetas guardadas de cientos de clientas.»', aqui: 'migración hecha por nosotros en 48 h, con acta verificable y reversible con un clic.' },
];

export function SeccionCambiarse() {
  return (
    <section id="cambiarse" className="v5-cam" aria-labelledby="v5-cam-h">
      <div className="v5-cam-wrap">
        <div className="v5-cam-cabecera">
          <p className="v5-cam-eyebrow">Si ya usas otro software</p>
          <h2 id="v5-cam-h" className="v5-cam-h2">Cambiarse no debería dar miedo. Quedarse, a veces sí.</h2>
          <p className="v5-cam-lead">
            Lo que se lee en miles de reseñas públicas de la categoría (G2, Capterra, Trustpilot) — y cómo está
            construido Tentare contra cada punto:
          </p>
        </div>
        <div className="v5-cam-grid">
          {PUNTOS.map((p) => (
            <div key={p.queja} className="v5-cam-card">
              <div className="v5-cam-queja">{p.queja}</div>
              <div className="v5-cam-linea" />
              <div className="v5-cam-aqui"><strong>Aquí:</strong> {p.aqui}</div>
            </div>
          ))}
        </div>
        <Link href={SALIDAS.cambiarse.href} className="v5-cam-salida">{SALIDAS.cambiarse.label} →</Link>
      </div>

      <style>{`
        .v5-cam { padding: clamp(72px,11vw,110px) clamp(20px,4vw,48px); }
        .v5-cam-wrap { max-width: 1240px; margin: 0 auto; }
        .v5-cam-cabecera { max-width: 860px; margin-bottom: 40px; }
        .v5-cam-eyebrow { font-size: 12px; font-weight: 700; letter-spacing: .18em; color: #8E8E86; margin: 0 0 18px; text-transform: uppercase; }
        .v5-cam-h2 { font-size: clamp(28px,4.6vw,50px); font-weight: 800; line-height: 1; letter-spacing: -.04em; margin: 0 0 18px; text-wrap: balance; }
        .v5-cam-lead { font-size: 15.5px; line-height: 1.6; color: #5A5A52; max-width: 60ch; margin: 0; }
        .v5-cam-grid { display: grid; grid-template-columns: repeat(auto-fit,minmax(270px,1fr)); gap: 16px; margin-bottom: 28px; }
        .v5-cam-card { background: #fff; border: 1px solid #E7E7E0; border-radius: 20px; padding: 26px; display: flex; flex-direction: column; gap: 13px; }
        .v5-cam-queja { font-size: 14.5px; font-weight: 700; line-height: 1.5; color: #A8442A; }
        .v5-cam-linea { height: 1px; background: #E7E7E0; }
        .v5-cam-aqui { font-size: 14.5px; line-height: 1.6; color: #3B3B34; }
        .v5-cam-aqui strong { color: #2F6B4F; }
        .v5-cam-salida { font-size: 15px; font-weight: 700; color: #55622C; }
        .v5-cam-salida:hover { text-decoration: underline; text-underline-offset: 4px; }
      `}</style>
    </section>
  );
}
