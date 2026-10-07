import { FAQ_ITEMS } from '@/components/landing/data';

// Sección 12 de la landing v5 — "FAQ". El diseño traía una selección de 7
// preguntas orientadas a "antes de cambiarse", con texto ligeramente distinto
// al de producción. Aquí se usa FAQ_ITEMS entero (13, la fuente real que ya
// usa /precios y la landing en producción) en vez de retipear una variante
// del mismo contenido: dos copias del mismo texto solo pueden desincronizarse.
// Desde el 6-oct son 10, en formato citable (respuesta primero) y cruzadas con
// el código (ver data.ts).
//
// ⚠️ Están TODAS en el HTML, con su respuesta: alimentan el JSON-LD `FAQPage`
// de StructuredData, y Google pide que ese contenido esté en la página. Hasta el
// 7-oct-2026 la respuesta solo se pintaba al pulsar (un estado de React), así que
// el HTML llevaba las preguntas sin ninguna respuesta. Ahora es un <details>:
// el navegador pliega y despliega, y sin JavaScript también funciona.
//
// En escritorio va en dos columnas (al aligerar la home: en una sola eran 13
// filas seguidas); cada columna es su propia lista, así que abrir una pregunta
// no estira la fila de al lado.

const MITAD = Math.ceil(FAQ_ITEMS.length / 2);
const COLUMNAS = [FAQ_ITEMS.slice(0, MITAD), FAQ_ITEMS.slice(MITAD)];

export function SeccionFaq() {
  return (
    <section id="faq" className="v5-faq" aria-labelledby="v5-faq-h">
      <div className="v5-faq-wrap">
        <h2 id="v5-faq-h" className="v5-faq-h2 lp-rv">Lo que se pregunta antes de empezar</h2>
        <div className="v5-faq-columnas lp-rv" style={{ ['--lp-r' as string]: 6 }}>
          {COLUMNAS.map((columna, c) => (
            <div key={c} className="v5-faq-lista">
              {columna.map((f) => (
                <details key={f.q} className="v5-faq-item">
                  <summary className="v5-faq-pregunta">
                    <span>{f.q}</span>
                    <span className="v5-faq-signo" aria-hidden>+</span>
                  </summary>
                  <p className="v5-faq-respuesta">{f.a}</p>
                </details>
              ))}
            </div>
          ))}
        </div>
      </div>

      <style>{`
        .v5-faq { padding: clamp(64px,7vw,104px) clamp(20px,4vw,48px); }
        .v5-faq-wrap { max-width: 1240px; margin: 0 auto; }
        .v5-faq-h2 { font-size: clamp(28px,4vw,52px); font-weight: 800; line-height: 1.02; letter-spacing: -.04em;
          margin: 0 0 36px; text-wrap: balance; }
        .v5-faq-columnas { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 0 clamp(28px,4vw,56px);
          align-items: start; }
        .v5-faq-lista { border-bottom: 1px solid #DEDED6; }
        .v5-faq-item { border-top: 1px solid #DEDED6; }
        .v5-faq-pregunta { list-style: none; width: 100%; display: flex; align-items: baseline; justify-content: space-between; gap: 20px;
          padding: 18px 4px; cursor: pointer; }
        .v5-faq-pregunta::-webkit-details-marker { display: none; }
        .v5-faq-pregunta span:first-child { font-size: 16.5px; font-weight: 700; line-height: 1.4; color: #1A1A1A; }
        .v5-faq-pregunta:focus-visible { outline: 2px solid #343825; outline-offset: 2px; }
        .v5-faq-signo { font-size: 20px; font-weight: 600; color: #6B6B63; flex-shrink: 0; }
        .v5-faq-item[open] .v5-faq-signo { transform: rotate(45deg); }
        .v5-faq-respuesta { font-size: 15px; line-height: 1.7; color: #5A5A52; margin: 0; padding: 0 4px 22px; max-width: 64ch; }
        @keyframes v5-faq-abre { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }
        @media (prefers-reduced-motion: no-preference) {
          .v5-faq-respuesta { animation: v5-faq-abre var(--motion-slow) var(--motion-ease) both; }
          .v5-faq-signo { transition: transform var(--motion-medium) var(--motion-ease); }
        }

        @media (max-width: 860px) {
          .v5-faq-columnas { grid-template-columns: minmax(0,1fr); }
          /* En una columna, la raya de abajo de la primera lista y la de arriba de
             la segunda serían dos seguidas. */
          .v5-faq-lista:first-child { border-bottom: 0; }
        }
      `}</style>
    </section>
  );
}
