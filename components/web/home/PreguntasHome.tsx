import Link from 'next/link';
import { FAQ_ITEMS } from '@/components/landing/data';
import { LIMITES_GRATIS } from '@/lib/landing/founding-gratis';

// «¿Qué es Tentare?» + preguntas frecuentes (fase 2.2).
//
// La definición es la de antes, palabra por palabra (la que un buscador o una IA
// puede citar tal cual, GEO/AEO): ahora abre la sección de preguntas en vez de
// ir sola en mitad de la página.
//
// ⚠️ Las preguntas son FAQ_ITEMS enteras y con su respuesta en el HTML (un
// <details>, que pliega sin JavaScript): alimentan el JSON-LD `FAQPage` de
// components/landing/StructuredData.tsx, y Google pide que lo marcado esté en la
// página. Nada de botones al alta aquí (e2e/landing-ronda-3.spec.ts).

export function PreguntasHome() {
  return (
    <section id="faq" className="wh-seccion wh-faq" aria-labelledby="wh-faq-h">
      <div className="wh-contenedor wh-faq-rejilla">
        <div className="wh-faq-intro" id="que-es">
          <h2 id="wh-faq-h" className="wh-h2">Lo que se pregunta antes de empezar</h2>
          <h3 className="wh-h3 wh-faq-que">¿Qué es Tentare?</h3>
          <p className="wh-texto">
            Tentare es el software para estudios y centros de Pilates y yoga en España que reúne en un solo panel las{' '}
            <Link href="/funcionalidades/reservas-online">reservas online</Link> con lista de espera, la{' '}
            <Link href="/funcionalidades/app-para-alumnas">app de tus alumnas</Link>, los bonos y los{' '}
            <Link href="/funcionalidades/cobros-recurrentes">cobros recurrentes</Link>, el{' '}
            <Link href="/funcionalidades/calendario-y-salas">calendario</Link> y el equipo. Está hecho para estudios de
            Pilates (<Link href="/soluciones/estudio-de-pilates-reformer">reformer</Link> y mat) y de <Link href="/soluciones/estudio-de-yoga">yoga</Link>, no para gimnasios generalistas.
          </p>
          <dl className="wh-faq-datos">
            <div><dt>Para quién</dt><dd>Estudios y centros de Pilates y yoga, independientes o con varias sedes</dd></div>
            <div><dt>Dónde</dt><dd>España: interfaz y soporte en español, datos en la Unión Europea</dd></div>
            <div><dt>Cuánto</dt><dd><Link href="/precios">Gratis</Link> {LIMITES_GRATIS}, sin permanencia</dd></div>
          </dl>
        </div>
        <div className="wh-faq-lista">
          {FAQ_ITEMS.map((f) => (
            <details key={f.q} className="wh-faq-item">
              <summary className="wh-faq-pregunta">
                <span>{f.q}</span>
                <span className="wh-faq-signo" aria-hidden="true" />
              </summary>
              <p className="wh-faq-respuesta">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
