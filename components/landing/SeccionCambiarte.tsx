import Link from 'next/link';
import { ArrowRight, ArrowUpRight, FileDown, Receipt, Unlock } from 'lucide-react';
import { PLAN_INFO } from '@/lib/billing/entitlements';

// «¿Ya usas otro programa?» (7-oct-2026). La mayoría de estudios ya paga un
// software (feedback del fundador, 1-oct): esta sección le habla a ese segmento
// justo antes del precio. Dos cosas a la vez:
//  · por qué cambiar es poco arriesgado (importador con acta y botón de
//    deshacer, sin permanencia, precio publicado), con frases ya publicadas en
//    /soluciones/cambiar-de-software, la sección de confianza y /precios;
//  · y la puerta a cada comparativa, que hasta hoy no tenía ni un enlace desde
//    la página con más autoridad del dominio.
//
// ⚠️ La línea de cada competidor sale de SU comparativa (app/comparativa/
// tentare-vs-*), revisada en su web pública el 7-oct-2026: si cambia allí,
// cambia aquí. Nada que no conste en su web.
//
// Server Component: no entra en el JavaScript de la home.

// `logo: null` cuando el único logo que hay es un icono con fondo (Lorari): a
// una tinta sería un cuadrado negro, así que va su nombre.
const COMPETIDORES: { slug: string; nombre: string; logo: string | null; ancho: number; alto: number; dato: string }[] = [
  { slug: 'bsport', nombre: 'bsport', logo: '/comparativa/logos/bsport.svg', ancho: 69, alto: 24, dato: 'No publica precios: hay que pedir presupuesto' },
  { slug: 'eversports', nombre: 'Eversports', logo: '/comparativa/logos/eversports.svg', ancho: 118, alto: 24, dato: 'Cobra según tus reservas al mes, más IVA' },
  { slug: 'mindbody', nombre: 'Mindbody', logo: '/comparativa/logos/mindbody.svg', ancho: 115, alto: 24, dato: 'Desde 99 €/mes + IVA por local' },
  { slug: 'timp', nombre: 'TIMP', logo: '/comparativa/logos/timp.webp', ancho: 89, alto: 24, dato: 'Precio por profesional; mínimo de 3 meses en la mayoría de planes' },
  { slug: 'momence', nombre: 'Momence', logo: '/comparativa/logos/momence.svg', ancho: 122, alto: 15, dato: 'Precio a consultar y web en inglés' },
  { slug: 'lorari', nombre: 'Lorari', logo: null, ancho: 0, alto: 0, dato: 'Cobra por alumnos activos, más IVA' },
];

const PRECIOS = `${PLAN_INFO.BASE.precioMes}, ${PLAN_INFO.ESTUDIO.precioMes} o ${PLAN_INFO.CADENA.precioMes} €`;

const RAZONES = [
  {
    Icono: FileDown,
    titulo: 'Te traemos tus datos',
    texto: 'El importador reconoce las exportaciones de bsport, Momence, Eversports, Mindbody, TIMP y Excel. Te enseña lo que va a entrar y lo deshaces con un botón. O te lo hacemos nosotros.',
  },
  {
    Icono: Unlock,
    titulo: 'Sin permanencia',
    texto: 'Pagas mes a mes. Si un día te vas, exportas tus alumnas, tus reservas y tus cobros cuando quieras.',
  },
  {
    Icono: Receipt,
    titulo: 'Precio publicado',
    texto: `${PRECIOS} al mes, IVA incluido. Sin cuota de alta y sin comisión de Tentare sobre tus cobros.`,
  },
];

export function SeccionCambiarte() {
  return (
    <section id="cambiarte" className="v5-cam" aria-labelledby="v5-cam-h">
      <div className="v5-cam-wrap">
        <div className="v5-cam-texto lp-rv">
          <h2 id="v5-cam-h" className="v5-cam-h2">
            <span className="lp-ante">Alternativa a bsport, Eversports, Mindbody y TIMP</span>{' '}
            ¿Ya usas otro programa? Cámbiate sin perder nada.
          </h2>
          <ul className="v5-cam-razones">
            {RAZONES.map(({ Icono, titulo, texto }) => (
              <li key={titulo}>
                <span className="v5-cam-icono" aria-hidden><Icono size={18} strokeWidth={2} /></span>
                <span>
                  <strong>{titulo}</strong>
                  {texto}
                </span>
              </li>
            ))}
          </ul>
          <Link href="/soluciones/cambiar-de-software" className="v5-cam-enlace lp-flecha">
            Cómo es cambiarte a Tentare <ArrowRight size={16} aria-hidden />
          </Link>
        </div>

        <div className="v5-cam-lado lp-rv" style={{ ['--lp-r' as string]: 6 }}>
          <p className="v5-cam-lado-tit">Compáralo con el tuyo</p>
          <ul className="v5-cam-grid">
            {COMPETIDORES.map((c) => (
              <li key={c.slug}>
                <Link href={`/comparativa/tentare-vs-${c.slug}`} className="v5-cam-card" aria-label={`Tentare frente a ${c.nombre}: ${c.dato}`}>
                  <span className="v5-cam-logo">
                    {c.logo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.logo} alt="" width={c.ancho} height={c.alto} loading="lazy" decoding="async" />
                    ) : (
                      <span className="v5-cam-nombre" aria-hidden>{c.nombre}</span>
                    )}
                  </span>
                  <span className="v5-cam-dato">{c.dato}</span>
                  <span className="v5-cam-ir">Tentare vs {c.nombre} <ArrowUpRight size={14} aria-hidden /></span>
                </Link>
              </li>
            ))}
          </ul>
          <Link href="/comparativa" className="v5-cam-todas lp-flecha">
            Ver la comparativa con 13 programas <ArrowRight size={15} aria-hidden />
          </Link>
        </div>
      </div>

      <style>{`
        .v5-cam { padding: clamp(72px,8vw,120px) clamp(20px,4vw,48px); background: #F6F6F1; }
        .v5-cam-wrap { max-width: 1240px; margin: 0 auto; display: grid; grid-template-columns: minmax(0,.95fr) minmax(0,1.05fr);
          gap: clamp(36px,5vw,80px); align-items: start; }
        .v5-cam-h2 { margin: 0 0 30px; font-size: clamp(30px,3.8vw,50px); font-weight: 800; line-height: 1.02; letter-spacing: -.04em;
          color: #1F2216; text-wrap: balance; }
        .v5-cam-razones { list-style: none; margin: 0 0 28px; padding: 0; display: grid; gap: 22px; }
        .v5-cam-razones li { display: flex; gap: 14px; align-items: flex-start; }
        .v5-cam-icono { flex-shrink: 0; width: 38px; height: 38px; border-radius: 12px; display: flex; align-items: center; justify-content: center;
          background: #fff; border: 1px solid #E2E2DA; color: #343825; }
        .v5-cam-razones strong { display: block; margin-bottom: 3px; font-size: 16.5px; font-weight: 800; letter-spacing: -.01em; color: #1A1A1A; }
        .v5-cam-razones li > span:last-child { font-size: 15px; line-height: 1.55; color: #5A5A52; }
        .v5-cam-enlace, .v5-cam-todas { display: inline-flex; align-items: center; gap: 8px; font-size: 15px; font-weight: 700; color: #343825; }
        .v5-cam-enlace:hover, .v5-cam-todas:hover { text-decoration: underline; text-underline-offset: 3px; }

        .v5-cam-lado { background: #fff; border: 1px solid #E4E4DC; border-radius: 28px; padding: clamp(20px,2.6vw,30px);
          box-shadow: 0 40px 80px -56px rgba(26,26,26,.4); }
        .v5-cam-lado-tit { margin: 0 0 16px; font-size: 12px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: #6E7259; }
        .v5-cam-grid { list-style: none; margin: 0 0 18px; padding: 0; display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 10px; }
        .v5-cam-card { height: 100%; display: flex; flex-direction: column; gap: 10px; padding: 16px; border-radius: 16px; border: 1px solid #ECECE5;
          background: #FBFBF8; text-decoration: none;
          transition: border-color var(--motion-normal) var(--motion-ease), background var(--motion-normal) var(--motion-ease), transform var(--motion-normal) var(--motion-ease); }
        .v5-cam-card:hover { border-color: #C9CBB8; background: #fff; transform: translateY(-2px); }
        .v5-cam-logo { height: 26px; display: flex; align-items: center; }
        /* Todos los logos a una sola tinta: una fila de colores ajenos le quita
           el protagonismo a la marca propia (y el de Momence es blanco). */
        .v5-cam-logo img { height: 20px; width: auto; max-width: 110px; object-fit: contain; filter: grayscale(1) brightness(0); opacity: .72; }
        .v5-cam-nombre { font-size: 19px; font-weight: 800; letter-spacing: -.02em; color: #1A1A1A; opacity: .72; }
        .v5-cam-dato { font-size: 14px; line-height: 1.45; color: #3A3A34; }
        .v5-cam-ir { margin-top: auto; display: inline-flex; align-items: center; gap: 5px; font-size: 13px; font-weight: 700; color: #343825; }
        @media (max-width: 900px) { .v5-cam-wrap { grid-template-columns: minmax(0,1fr); } }
        @media (max-width: 460px) {
          .v5-cam-card { padding: 13px; }
          .v5-cam-dato { font-size: 13px; }
        }
        @media (prefers-reduced-motion: reduce) { .v5-cam-card { transition: none; } }
      `}</style>
    </section>
  );
}
