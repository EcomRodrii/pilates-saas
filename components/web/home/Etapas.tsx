import Link from 'next/link';
import { FOTOS, rutaFoto, altoDe, type FotoRegistrada } from '@/components/landing/fotos';

// ─────────────────────────────────────────────────────────────────────────────
// «Para cada momento de tu estudio» (fase 2.2): las tres puertas que tienen las
// tres referencias (abrir, cambiar, crecer), cada una a una página que EXISTE.
// Tarjetas grandes con foto y el texto debajo; la del cambio lleva además las
// comparativas (las que antes colgaban de «¿Ya usas otro programa?»: son el
// enlace interno más fuerte que tienen).
// ─────────────────────────────────────────────────────────────────────────────

/** El recorte móvil de una foto del registro, servido tal cual (AVIF + WebP). */
function FotoEtapa({ foto, alt }: { foto: FotoRegistrada; alt: string }) {
  const r = foto.recortes.movil ?? foto.recortes.escritorio;
  const nombre = foto.recortes.movil ? 'movil' : 'escritorio';
  const set = (f: 'avif' | 'webp') => r.anchos.map((a) => `${rutaFoto(foto, nombre, a, f)} ${a}w`).join(', ');
  const ancho = r.anchos[Math.min(1, r.anchos.length - 1)];
  const sizes = '(max-width: 860px) 92vw, 400px';
  return (
    <span className="wh-etapa-foto wh-foto">
      <picture>
        <source type="image/avif" srcSet={set('avif')} sizes={sizes} />
        <img src={rutaFoto(foto, nombre, ancho, 'webp')} srcSet={set('webp')} sizes={sizes} width={ancho} height={altoDe(r, ancho)} alt={alt} loading="lazy" decoding="async" />
      </picture>
    </span>
  );
}

const COMPARATIVAS = [
  ['bsport', 'bsport'], ['eversports', 'Eversports'], ['mindbody', 'Mindbody'], ['timp', 'Timp'], ['momence', 'Momence'], ['lorari', 'Lorari'],
] as const;

export function Etapas() {
  return (
    <section id="etapas" className="wh-seccion wh-etapas" aria-labelledby="wh-etapas-h">
      <div className="wh-contenedor">
        <div className="wh-cabecera lp-rv">
          <h2 id="wh-etapas-h" className="wh-h2">Para cada momento de tu estudio.</h2>
          <p className="wh-lead">Empieces de cero, vengas de otro programa o lleves varias sedes.</p>
        </div>
        <ul className="wh-etapas-rejilla">
          <li className="wh-etapa lp-rv">
            <FotoEtapa foto={FOTOS.selfie} alt={FOTOS.selfie.alt} />
            <div className="wh-etapa-cuerpo">
              <p className="wh-etapa-et">Voy a abrir mi estudio</p>
              <h3 className="wh-h3"><Link href="/recursos/como-abrir-un-estudio-de-pilates">Abre con tus reservas listas desde el primer día.</Link></h3>
              <p className="wh-texto">Empieza gratis y apóyate en las guías: lo que cuesta abrir, lo que pide la ley y cuánto cobrar.</p>
              <p className="wh-etapa-enlaces">
                <Link href="/recursos/como-abrir-un-estudio-de-pilates" className="wh-enlace-flecha">Abrir un estudio de Pilates <span aria-hidden="true">→</span></Link>
                <Link href="/recursos/como-abrir-un-estudio-de-yoga" className="wh-enlace-flecha">Abrir un estudio de yoga <span aria-hidden="true">→</span></Link>
              </p>
            </div>
          </li>
          <li className="wh-etapa lp-rv">
            <FotoEtapa foto={FOTOS.plazas} alt={FOTOS.plazas.alt} />
            <div className="wh-etapa-cuerpo">
              <p className="wh-etapa-et">Ya tengo estudio y quiero cambiar</p>
              <h3 className="wh-h3"><Link href="/soluciones/cambiar-de-software">Trae tus datos y sigue donde estabas.</Link></h3>
              <p className="wh-texto">Alumnas, bonos, horario y reservas desde tu programa actual, tú misma o con nuestra ayuda.</p>
              <p className="wh-etapa-vienes">¿Vienes de…?{' '}
                {COMPARATIVAS.map(([slug, nombre], i) => (
                  <span key={slug}>{i > 0 && <span aria-hidden="true"> · </span>}<Link href={`/comparativa/tentare-vs-${slug}`}>{nombre}</Link></span>
                ))}
              </p>
            </div>
          </li>
          <li className="wh-etapa lp-rv">
            <FotoEtapa foto={FOTOS.anoche} alt={FOTOS.anoche.alt} />
            <div className="wh-etapa-cuerpo">
              <p className="wh-etapa-et">Tengo varias sedes</p>
              <h3 className="wh-h3"><Link href="/funcionalidades/multi-centro">Todas tus sedes, con un solo acceso.</Link></h3>
              <p className="wh-texto">Cambias de sede con un selector y cada una guarda sus datos separados. Con el plan Cadena.</p>
              <p className="wh-etapa-enlaces">
                <Link href="/funcionalidades/multi-centro" className="wh-enlace-flecha">Ver varias sedes <span aria-hidden="true">→</span></Link>
              </p>
            </div>
          </li>
        </ul>
      </div>
    </section>
  );
}
