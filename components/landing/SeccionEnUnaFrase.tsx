import Link from 'next/link';
import { PLANS } from './data';
import { TRIAL_DIAS } from '@/lib/billing/trial';

// «Tentare, en una frase» — la definición que un buscador (o una IA que
// responde a «¿qué programa uso para un centro de Pilates?») puede citar tal
// cual: qué es, para quién, qué hace y qué no.
//
// Va en la parte alta de la página (tras el primer bloque oscuro) y es TEXTO
// plano en el HTML del servidor, con los datos duros en una lista. Cada
// afirmación sale del mismo sitio que /funcionalidades, /precios y llms.txt
// (los planes, de data.ts; la prueba, de TRIAL_DIAS): si cambian allí, cambian
// aquí. Sin cifras de clientas, sin «n.º 1», sin nombres de otras marcas.
//
// Server Component: no entra en el JavaScript de la home.

const PRECIO_DESDE = PLANS[0].price.replace('€', ' €');

export function SeccionEnUnaFrase() {
  return (
    <section id="que-es" className="v5-frase" aria-labelledby="v5-frase-h">
      <div className="v5-frase-wrap lp-rv">
        <h2 id="v5-frase-h" className="v5-frase-h2">Tentare, en una frase</h2>
        <p className="v5-frase-def">
          Tentare es el software para estudios y centros de Pilates en España que reúne en un solo panel las{' '}
          <Link href="/funcionalidades/reservas-online">reservas online</Link> con lista de espera, la{' '}
          <Link href="/funcionalidades/app-para-alumnas">app de tus alumnas</Link>, los bonos y los{' '}
          <Link href="/funcionalidades/cobros-recurrentes">cobros recurrentes</Link>, el{' '}
          <Link href="/funcionalidades/calendario-y-salas">calendario</Link> y el equipo. Está hecho para estudios de
          reformer y de mat, no para gimnasios generalistas.
        </p>
        <ul className="v5-frase-datos">
          <li><b>Para quién</b>Estudios y centros de Pilates (y de Yoga), independientes o con varias sedes</li>
          <li><b>Dónde</b>España: interfaz y soporte en español, datos en la Unión Europea</li>
          <li><b>Cuánto</b>Desde <Link href="/precios">{PRECIO_DESDE} al mes</Link>, sin permanencia</li>
          <li><b>Cómo empezar</b>{TRIAL_DIAS} días gratis, sin tarjeta</li>
        </ul>
      </div>

      <style>{`
        .v5-frase { padding: clamp(48px,6vw,80px) clamp(20px,4vw,48px) 0; }
        .v5-frase-wrap { max-width: 1000px; margin: 0 auto; }
        .v5-frase-h2 { margin: 0 0 14px; font-size: 13px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: #5A5E48; }
        .v5-frase-def { margin: 0; font-size: clamp(20px,2.3vw,28px); font-weight: 600; line-height: 1.32; letter-spacing: -.025em;
          color: #1F2216; text-wrap: pretty; }
        .v5-frase-def a { color: #343825; text-decoration: underline; text-decoration-color: #D9C29E; text-decoration-thickness: 2px; text-underline-offset: 4px; }
        .v5-frase-def a:hover { text-decoration-color: #343825; }
        .v5-frase-datos { list-style: none; margin: 28px 0 0; padding: 22px 0 0; border-top: 1px solid #DEDED6; display: grid;
          grid-template-columns: repeat(4,minmax(0,1fr)); gap: 20px; font-size: 14.5px; line-height: 1.5; color: #5A5A52; }
        .v5-frase-datos b { display: block; margin-bottom: 4px; font-size: 12px; letter-spacing: .1em; text-transform: uppercase; color: #343825; }
        .v5-frase-datos a { color: #343825; font-weight: 700; text-decoration: underline; text-underline-offset: 3px; }
        @media (max-width: 860px) { .v5-frase-datos { grid-template-columns: repeat(2,minmax(0,1fr)); } }
        @media (max-width: 480px) { .v5-frase-datos { grid-template-columns: minmax(0,1fr); gap: 14px; } }
      `}</style>
    </section>
  );
}
