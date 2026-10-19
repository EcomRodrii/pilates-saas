import Link from 'next/link';
import { ArrowRight, ArrowUpRight, Check, CircleAlert } from 'lucide-react';
import { ANCLA_AYUDA, NO_SE_LLEVA, RUTAS_MIGRACION, SE_LLEVA } from '@/lib/landing/migracion';
import { BotonBloque } from './BotonBloque';

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
// Ronda 3 (19-oct-2026): la sección pasa a contar el cambio en DOS RUTAS, como la
// página de migración de Momence, y a decir «qué se trae y qué no» junto. Las
// dos rutas y las dos listas salen de lib/landing/migracion.ts, que es lo que
// /soluciones/cambiar-de-software ya cuenta (la lista de qué se lleva es la
// MISMA que la de esa página): no hay una tercera ruta ni una promesa nueva. Las
// tres «razones» de antes (importador, sin permanencia, precio) salen de aquí:
// la primera es ahora «Traigo mis datos yo», y las otras dos ya las dicen la
// sección de confianza y la de precios, que van justo detrás.
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

export function SeccionCambiarte() {
  const [yo, ayuda] = RUTAS_MIGRACION;
  return (
    <section id="cambiarte" className="v5-cam" aria-labelledby="v5-cam-h">
      <div className="v5-cam-wrap">
        <header className="v5-cam-cab lp-rv">
          <h2 id="v5-cam-h" className="v5-cam-h2">
            <span className="lp-ante">Alternativa a bsport, Eversports, Mindbody y TIMP</span>{' '}
            ¿Ya usas otro programa? Cámbiate sin perder nada.
          </h2>
          <p className="v5-cam-lede">
            El importador reconoce las exportaciones de bsport, Momence, Eversports, Mindbody, TIMP y Excel. Hay dos
            formas de traer tus datos.
          </p>
        </header>

        {/* Las dos rutas de /soluciones/cambiar-de-software, tal cual: tú misma, o te lo hacemos. */}
        <ul className="v5-cam-rutas">
          <li className="v5-cam-ruta lp-rv">
            <h3 className="v5-cam-ruta-t">{yo.titulo}</h3>
            <p className="v5-cam-ruta-p">{yo.texto}</p>
            {yo.paraQuien && <p className="v5-cam-ruta-q">{yo.paraQuien}</p>}
            <div className="v5-cam-ruta-accion"><BotonBloque /></div>
          </li>
          <li className="v5-cam-ruta lp-rv" style={{ ['--lp-r' as string]: 5 }}>
            <h3 className="v5-cam-ruta-t">{ayuda.titulo}</h3>
            <p className="v5-cam-ruta-p">{ayuda.texto}</p>
            <div className="v5-cam-ruta-accion">
              <Link href={`/soluciones/cambiar-de-software#${ANCLA_AYUDA}`} className="v5-cam-secundario">Pedir que me lo traigáis</Link>
            </div>
          </li>
        </ul>

        <div className="v5-cam-abajo">
          <div className="v5-cam-trae lp-rv">
            <p className="v5-cam-lado-tit">Qué se trae</p>
            <ul className="v5-cam-lista">
              {SE_LLEVA.map((t) => (
                <li key={t}><Check size={16} strokeWidth={2.4} aria-hidden="true" /><span>{t}</span></li>
              ))}
            </ul>
            <p className="v5-cam-lado-tit v5-cam-lado-tit-no">Y qué no</p>
            <div className="v5-cam-no">
              <CircleAlert size={16} strokeWidth={2.2} aria-hidden="true" />
              <p><strong>{NO_SE_LLEVA.titulo}.</strong> {NO_SE_LLEVA.texto}</p>
            </div>
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
      </div>

      <style>{`
        .v5-cam { padding: clamp(72px,8vw,120px) clamp(20px,4vw,48px); background: #F6F6F1; }
        .v5-cam-wrap { max-width: 1240px; margin: 0 auto; }
        .v5-cam-cab { max-width: 760px; margin-bottom: clamp(28px,3.4vw,48px); }
        .v5-cam-h2 { margin: 0 0 18px; font-size: clamp(30px,3.8vw,50px); font-weight: 800; line-height: 1.02; letter-spacing: -.04em;
          color: #1F2216; text-wrap: balance; }
        .v5-cam-lede { margin: 0; font-size: 17px; line-height: 1.55; color: #5A5A52; text-wrap: pretty; }

        .v5-cam-rutas { list-style: none; margin: 0 0 14px; padding: 0; display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 14px; }
        .v5-cam-ruta { display: flex; flex-direction: column; gap: 10px; padding: clamp(22px,2.6vw,34px); border-radius: 28px; background: #fff;
          border: 1px solid #E4E4DC; }
        .v5-cam-ruta-t { margin: 0; font-size: clamp(24px,2.4vw,32px); font-weight: 800; line-height: 1.05; letter-spacing: -.035em; color: #1A1A1A; }
        .v5-cam-ruta-p { margin: 0; font-size: 15.5px; line-height: 1.55; color: #3F3F39; text-wrap: pretty; }
        .v5-cam-ruta-q { margin: 0; font-size: 14px; line-height: 1.5; color: #5A5A52; }
        .v5-cam-ruta-accion { margin-top: auto; padding-top: 14px; }
        /* El secundario del héroe: contorno, sin relleno ni sombra. */
        .v5-cam-secundario { display: inline-block; font-weight: 700; font-size: 15.5px; padding: 14px 26px; border: 1.5px solid #343825;
          border-radius: 999px; color: #343825; white-space: nowrap; transition: background var(--motion-normal); }
        .v5-cam-secundario:hover { background: rgba(52,56,37,.08); }
        .v5-cam-secundario:focus-visible { outline: 2px solid #343825; outline-offset: 3px; }

        .v5-cam-abajo { display: grid; grid-template-columns: minmax(0,.95fr) minmax(0,1.05fr); gap: 14px; align-items: stretch; }
        .v5-cam-trae { display: flex; flex-direction: column; background: #fff; border: 1px solid #E4E4DC; border-radius: 28px; padding: clamp(20px,2.6vw,30px); }
        .v5-cam-lista { list-style: none; margin: 0 0 22px; padding: 0; display: grid; gap: 10px; }
        .v5-cam-lista li { display: flex; gap: 10px; align-items: flex-start; font-size: 15px; line-height: 1.45; color: #2E2E28; }
        .v5-cam-lista svg { flex-shrink: 0; margin-top: 2px; color: #5A6142; }
        .v5-cam-lado-tit-no { margin-top: 4px; padding-top: 20px; border-top: 1px solid #ECECE5; }
        .v5-cam-no { display: flex; gap: 10px; align-items: flex-start; margin-bottom: 22px; }
        .v5-cam-no svg { flex-shrink: 0; margin-top: 3px; color: #8A6A2E; }
        .v5-cam-no p { margin: 0; font-size: 15px; line-height: 1.5; color: #2E2E28; }
        .v5-cam-no strong { font-weight: 800; }
        .v5-cam-trae .v5-cam-enlace { margin-top: auto; }
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
        @media (max-width: 900px) { .v5-cam-rutas, .v5-cam-abajo { grid-template-columns: minmax(0,1fr); } }
        @media (max-width: 600px) { .v5-cam-secundario { display: block; text-align: center; } }
        @media (max-width: 460px) {
          .v5-cam-card { padding: 13px; }
          .v5-cam-dato { font-size: 13px; }
        }
        @media (prefers-reduced-motion: reduce) { .v5-cam-card, .v5-cam-secundario { transition: none; } }
      `}</style>
    </section>
  );
}
