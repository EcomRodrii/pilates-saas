import Link from 'next/link';
import { SALIDAS } from './enlaces';

// Sección 10 de la landing v5 — "Si ya usas otro software". Estática:
// cuatro quejas públicas de la categoría (G2/Capterra/Trustpilot, sin cifra
// ni cliente inventado — es lo que se lee en la categoría, no un dato propio)
// contra cómo está construido Tentare en ese mismo punto. Cierra con la
// salida real hacia /soluciones/cambiar-de-software, donde vive el detalle.
//
// Más corta al aligerar la home: sin antetítulo, una frase de entrada y las
// cuatro quejas en tarjetas bajas (la queja arriba, la respuesta debajo).

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
          <h2 id="v5-cam-h" className="v5-cam-h2">Cambiarse no debería dar miedo. Quedarse, a veces sí.</h2>
          <p className="v5-cam-lead">
            Lo que más se repite en las reseñas públicas de la categoría (G2, Capterra, Trustpilot), y cómo está
            hecho Tentare en cada punto.
          </p>
        </div>
        <div className="v5-cam-grid">
          {PUNTOS.map((p) => (
            <div key={p.queja} className="v5-cam-card">
              <div className="v5-cam-queja">{p.queja}</div>
              <div className="v5-cam-aqui"><strong>Aquí:</strong> {p.aqui}</div>
            </div>
          ))}
        </div>
        <Link href={SALIDAS.cambiarse.href} className="v5-cam-salida">{SALIDAS.cambiarse.label} →</Link>
      </div>

      <style>{`
        .v5-cam { padding: clamp(80px,9vw,128px) clamp(20px,4vw,48px); }
        .v5-cam-wrap { max-width: 1240px; margin: 0 auto; }
        .v5-cam-cabecera { max-width: 980px; margin-bottom: 36px; }
        .v5-cam-h2 { font-size: clamp(28px,4vw,52px); font-weight: 800; line-height: 1.02; letter-spacing: -.04em; margin: 0 0 16px; text-wrap: balance; }
        .v5-cam-lead { font-size: 17px; line-height: 1.6; color: #5A5A52; max-width: 60ch; margin: 0; }
        .v5-cam-grid { display: grid; grid-template-columns: repeat(auto-fit,minmax(260px,1fr)); gap: 12px; margin-bottom: 28px; }
        .v5-cam-card { background: #fff; border: 1px solid #E7E7E0; border-radius: 16px; padding: 18px 20px;
          display: flex; flex-direction: column; gap: 10px; }
        .v5-cam-queja { font-size: 14px; font-weight: 700; line-height: 1.45; color: #A8442A; }
        .v5-cam-aqui { padding-top: 10px; border-top: 1px solid #EFEFEA; font-size: 14px; line-height: 1.5; color: #3B3B34; }
        .v5-cam-aqui strong { color: #2F6B4F; }
        .v5-cam-salida { font-size: 15px; font-weight: 700; color: #55622C; }
        .v5-cam-salida:hover { text-decoration: underline; text-underline-offset: 4px; }
      `}</style>
    </section>
  );
}
