import Link from 'next/link';
import {
  ArrowUpRight, BadgeCheck, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, CircleCheck, CircleDollarSign, Code2, Contact, Layers, Lock,
  Minus, MousePointerClick, Play, Plus, ShieldCheck, Star, Users,
} from 'lucide-react';
import type { LogoCliente } from '@/lib/landing/logos-clientes';
import { BENEFICIOS, CONFIANZA, CONTACTO, CTA, FAQ, FUNCIONES, HERO, NAV, PIE, PRECIOS } from './contenido';
import { FormularioContacto } from './formulario-contacto';

// La maqueta del diseño de Figma, sección a sección. Texto en ./contenido.ts; las FOTOS entran por CSS
// (`background-image` sobre un degradado del color de la foto): si el fichero aún no está en public/landing-figma/, se ve el
// color y no un icono roto. Cada foto tiene su nombre en `FOTOS` de abajo.

// Lo que hay que dejar en public/landing-figma/ (JPG o WebP, 2× del tamaño del diseño).
export const FOTOS = {
  hero: 'hero-hierba.jpg',
  clienteIzq: 'cliente-1.jpg',
  clienteCentro: 'cliente-2.jpg',
  clienteDer: 'cliente-3.jpg',
  pagos: 'pagos-movil.jpg',
  beneficios: 'beneficios.jpg',
  cta: 'cta-yoga.jpg',
  contacto: 'contacto.jpg',
} as const;

const foto = (f: string) => ({ ['--foto' as string]: `url(/landing-figma/${f})` });

function Etiqueta({ icono, children, oscuro }: { icono: React.ReactNode; children: React.ReactNode; oscuro?: boolean }) {
  return <span className={oscuro ? 'lf-etiqueta lf-etiqueta--oscura' : 'lf-etiqueta'}>{icono}{children}</span>;
}

/** Botón pastilla del diseño: texto + círculo con flecha. */
function Boton({ href, children, tipo = 'claro' }: { href: string; children: React.ReactNode; tipo?: 'claro' | 'verde' | 'vidrio' }) {
  if (tipo === 'vidrio') return <Link href={href} className="lf-boton lf-boton--vidrio">{children}</Link>;
  return (
    <Link href={href} className={`lf-boton lf-boton--${tipo}`}>
      <span>{children}</span>
      <span className="lf-boton-flecha" aria-hidden="true"><ArrowUpRight size={18} strokeWidth={1.8} /></span>
    </Link>
  );
}

function Logo({ claro }: { claro?: boolean }) {
  // La marca del diseño: un ave y «Tentare.». ⚠️ Es la marca que dibujó quien hizo el diseño, distinta del isotipo que usa
  // hoy Tentare: hasta decidir cuál va, se pinta con el trazo del diseño (SVG propio, sin imagen).
  return (
    <span className={claro ? 'lf-logo lf-logo--claro' : 'lf-logo'}>
      <svg width="26" height="24" viewBox="0 0 26 24" fill="currentColor" aria-hidden="true">
        <path d="M1 3c6 .6 10.5 3 13 7.2L25 1.5C21.8 8.8 18.7 12.7 14.5 14.6l2.2 8.1c-2.5-3-4.4-5.2-6.3-7C7 14 3.4 9.6 1 3Zm8.4 11.6L6 22.5c.5-2.9 1.9-5.4 3.4-7.9Z" />
      </svg>
      <span>Tentare.</span>
    </span>
  );
}

export function Cabecera() {
  return (
    <header className="lf-cabecera">
      <Link href="/landing-figma" aria-label="Tentare"><Logo /></Link>
      <nav className="lf-menu" aria-label="Principal">
        {NAV.enlaces.map((e, i) => (
          <Link key={e.texto} href={e.href} aria-current={i === 0 ? 'page' : undefined} className={i === 0 ? 'lf-menu-activo' : undefined}>{e.texto}</Link>
        ))}
      </nav>
      <div className="lf-acceso">
        <Link href={NAV.login.href} className="lf-acceso-login">{NAV.login.texto}</Link>
        <Link href={NAV.empezar.href} className="lf-acceso-empezar">{NAV.empezar.texto}</Link>
      </div>
    </header>
  );
}

export function Heroe() {
  return (
    <section className="lf-heroe" style={foto(FOTOS.hero)} aria-labelledby="lf-h1">
      <div className="lf-heroe-texto">
        <Etiqueta icono={<Layers size={16} strokeWidth={1.6} />} oscuro>{HERO.etiqueta}</Etiqueta>
        <h1 id="lf-h1">{HERO.titulo}</h1>
        <p>{HERO.texto}</p>
        <div className="lf-heroe-botones">
          <Boton href={HERO.demo.href}>{HERO.demo.texto}</Boton>
          <Boton href={HERO.como.href} tipo="vidrio">{HERO.como.texto}</Boton>
        </div>
      </div>
      <div className="lf-ordenador" role="img" aria-label={HERO.panel}>
        <div className="lf-ordenador-pantalla" />
      </div>
    </section>
  );
}

export function Confianza({ logos }: { logos: readonly LogoCliente[] }) {
  // Los logos del diseño eran de marcas de relleno. Con estudios reales (los que dieron su consentimiento) la frase es
  // cierta; sin ninguno, la sección no se pinta.
  if (logos.length === 0) return null;
  const copias = Math.max(1, Math.ceil(1800 / (logos.length * 250)));
  return (
    <section className="lf-confianza" aria-label={CONFIANZA.titulo}>
      <h2>{CONFIANZA.titulo}</h2>
      <div className="lf-carril">
        <div className="lf-pista">
          {Array.from({ length: 2 * copias }, (_, g) => (
            <ul key={g} className="lf-logos" aria-hidden={g > 0 || undefined}>
              {logos.map(l => (
                <li key={l.logoUrl}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- logos de Supabase Storage de forma libre */}
                  <img src={l.logoUrl} alt={g === 0 ? l.nombre : ''} width={170} height={70} loading="eager" decoding="async" />
                </li>
              ))}
            </ul>
          ))}
        </div>
      </div>
    </section>
  );
}

function Chips({ lista }: { lista: readonly string[] }) {
  return (
    <ul className="lf-chips">
      {lista.map((c, i) => <li key={`${c}-${i}`}>{c}</li>)}
      <li className="lf-chips-mas" aria-hidden="true"><span /><span /><span /></li>
    </ul>
  );
}

export function Funciones() {
  const f = FUNCIONES;
  const maxBarra = Math.max(...f.datos.barras.map(b => b.v));
  return (
    <section id="funciones" className="lf-funciones" aria-labelledby="lf-funciones-t">
      <div className="lf-cabeza">
        <Etiqueta icono={<Star size={15} strokeWidth={1.6} />}>{f.etiqueta}</Etiqueta>
        <h2 id="lf-funciones-t">{f.titulo}</h2>
      </div>

      <div className="lf-rejilla-3">
        <article className="lf-tarjeta">
          <h3>{f.reservas.titulo}</h3>
          <p>{f.reservas.texto}</p>
          <Chips lista={f.reservas.chips} />
          <div className="lf-v-calendario" aria-hidden="true">
            <span className="lf-flota lf-flota--arriba"><CalendarDays size={20} strokeWidth={1.6} />{f.reservas.instantanea}</span>
            <div className="lf-calendario">
              <div className="lf-calendario-cab"><ChevronLeft size={16} /><b>{f.reservas.mes}</b><ChevronRight size={16} /></div>
              <div className="lf-calendario-dias">{f.reservas.dias.map(d => <span key={d}>{d}</span>)}</div>
              <div className="lf-calendario-nums">
                {f.reservas.numeros.map(n => <span key={n} className={n === f.reservas.elegido ? 'lf-dia-elegido' : undefined}>{n}</span>)}
              </div>
            </div>
            <span className="lf-flota lf-flota--abajo"><CalendarDays size={20} strokeWidth={1.6} />{f.reservas.recordatorios}</span>
          </div>
        </article>

        <article className="lf-tarjeta">
          <h3>{f.clases.titulo}</h3>
          <p>{f.clases.texto}</p>
          <Chips lista={f.clases.chips} />
          <div className="lf-v-clases" aria-hidden="true">
            <b>{f.clases.panel}</b>
            <div className="lf-pestanas">{f.clases.pestanas.map((p, i) => <span key={p} className={i === 0 ? 'lf-pestana-activa' : undefined}>{p}</span>)}</div>
            <ul>
              {f.clases.filas.map((c, i) => (
                <li key={c.nombre}>
                  <span className="lf-fila-icono">{i === 0 ? <Play size={15} fill="currentColor" /> : i === 1 ? <Code2 size={15} /> : <Layers size={15} />}</span>
                  <span>{c.nombre}</span>
                  <em className={c.hoy ? 'lf-hoy' : undefined}>{c.cuando}</em>
                </li>
              ))}
            </ul>
            <span className="lf-mas">{f.clases.mas}</span>
          </div>
        </article>

        <article className="lf-tarjeta">
          <h3>{f.clientes.titulo}</h3>
          <p>{f.clientes.texto}</p>
          <Chips lista={f.clientes.chips} />
          <div className="lf-v-clientes" aria-hidden="true">
            <div className="lf-cliente lf-cliente--izq" style={foto(FOTOS.clienteIzq)}><span>{f.clientes.lateral}</span></div>
            <div className="lf-cliente lf-cliente--der" style={foto(FOTOS.clienteDer)}><span>{f.clientes.lateral}</span></div>
            <div className="lf-cliente lf-cliente--centro" style={foto(FOTOS.clienteCentro)}><span>{f.clientes.central}</span></div>
            <span className="lf-v-clientes-icono"><Users size={26} strokeWidth={1.8} /></span>
          </div>
        </article>
      </div>

      <div className="lf-rejilla-2">
        <article className="lf-tarjeta lf-tarjeta--pagos">
          <h3>{f.pagos.titulo}</h3>
          <p>{f.pagos.texto}</p>
          <Chips lista={f.pagos.chips} />
          <div className="lf-v-pagos" aria-hidden="true">
            <div className="lf-v-pagos-foto" style={foto(FOTOS.pagos)} />
            <div className="lf-recibido">
              <span className="lf-recibido-candado"><Lock size={20} strokeWidth={1.8} /></span>
              <span><small>{f.pagos.recibido}</small><b>{f.pagos.importe}</b></span>
              <span className="lf-recibido-ok"><CircleCheck size={24} fill="currentColor" stroke="#fff" /></span>
            </div>
            <div className="lf-ingresos"><small>{f.pagos.ingresos}</small><b>{f.pagos.total}</b><em>{f.pagos.variacion}</em></div>
          </div>
        </article>

        <article className="lf-tarjeta lf-tarjeta--datos">
          <h3>{f.datos.titulo}</h3>
          <p>{f.datos.texto}</p>
          <Chips lista={f.datos.chips} />
          <div className="lf-v-datos" aria-hidden="true">
            <div className="lf-grafica">
              <div className="lf-grafica-cab"><b>{f.datos.panel}</b><span>{f.datos.periodo} <ChevronDown size={14} /></span></div>
              <div className="lf-barras">
                {f.datos.barras.map((b, i) => (
                  <div key={b.h} className={i === 3 ? 'lf-barra lf-barra--alta' : 'lf-barra'}>
                    <span style={{ height: `${Math.round((b.v / maxBarra) * 100)}%` }}><em>{b.v}</em></span>
                    <small>{b.h}</small>
                  </div>
                ))}
              </div>
            </div>
            <div className="lf-actividad">
              <span className="lf-anillo" />
              <span><b>{f.datos.actividad}</b><small>{f.datos.actividadEtiqueta}</small></span>
            </div>
          </div>
        </article>
      </div>
    </section>
  );
}

export function Beneficios() {
  return (
    <section className="lf-beneficios" aria-labelledby="lf-beneficios-t">
      <div className="lf-beneficios-foto" style={foto(FOTOS.beneficios)} role="img" aria-label="Una alumna de pilates en una postura sobre su esterilla" />
      <div className="lf-beneficios-texto">
        <Etiqueta icono={<BadgeCheck size={16} strokeWidth={1.6} />}>{BENEFICIOS.etiqueta}</Etiqueta>
        <h2 id="lf-beneficios-t">{BENEFICIOS.titulo}</h2>
        <p>{BENEFICIOS.texto}</p>
        <ul>
          {BENEFICIOS.lista.map(b => (
            <li key={b.titulo}>
              <span className="lf-check"><CircleCheck size={18} strokeWidth={1.6} /></span>
              <div><h3>{b.titulo}</h3>{b.detalle && <p>{b.detalle}</p>}</div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function LlamadaFinal() {
  return (
    <section className="lf-cta" aria-labelledby="lf-cta-t">
      <svg className="lf-flor lf-flor--1" viewBox="0 0 100 100" aria-hidden="true"><path d="M50 50C50 20 70 0 100 0c0 30-20 50-50 50Zm0 0c30 0 50 20 50 50-30 0-50-20-50-50Zm0 0c0 30-20 50-50 50 0-30 20-50 50-50Zm0 0C20 50 0 30 0 0c30 0 50 20 50 50Z" /></svg>
      <svg className="lf-flor lf-flor--2" viewBox="0 0 100 100" aria-hidden="true"><path d="M50 50C50 20 70 0 100 0c0 30-20 50-50 50Zm0 0c30 0 50 20 50 50-30 0-50-20-50-50Zm0 0c0 30-20 50-50 50 0-30 20-50 50-50Zm0 0C20 50 0 30 0 0c30 0 50 20 50 50Z" /></svg>
      <div className="lf-cta-texto">
        <Etiqueta icono={<MousePointerClick size={16} strokeWidth={1.6} />} oscuro>{CTA.etiqueta}</Etiqueta>
        <h2 id="lf-cta-t">{CTA.titulo}</h2>
        <p>{CTA.texto}</p>
        <Boton href={CTA.boton.href}>{CTA.boton.texto}</Boton>
      </div>
      <div className="lf-cta-foto" style={foto(FOTOS.cta)} role="img" aria-label="Dos alumnas meditando en una sala de yoga con luz natural" />
    </section>
  );
}

export function Precios() {
  return (
    <section id="precios" className="lf-precios" aria-labelledby="lf-precios-t">
      <div className="lf-cabeza">
        <Etiqueta icono={<CircleDollarSign size={15} strokeWidth={1.6} />}>{PRECIOS.etiqueta}</Etiqueta>
        <h2 id="lf-precios-t">{PRECIOS.titulo}</h2>
      </div>
      <div className="lf-planes">
        {PRECIOS.planes.map(p => (
          <article key={p.nombre} className={p.destacado ? 'lf-plan lf-plan--destacado' : 'lf-plan'}>
            {p.destacado && <p className="lf-plan-cinta">{PRECIOS.etiquetaDestacado}</p>}
            <div className="lf-plan-cuerpo">
              <h3>{p.nombre}</h3>
              <p>{p.texto}</p>
              <p className="lf-plan-precio"><b>{p.precio}</b> <span>{p.periodo}</span></p>
              <Link href={p.nombre === 'Cadena' ? 'mailto:hola@tentare.app?subject=Plan%20Cadena' : '/crear-estudio'} className={p.destacado ? 'lf-plan-boton lf-plan-boton--verde' : 'lf-plan-boton'}>{p.boton} <ArrowUpRight size={16} strokeWidth={1.8} aria-hidden="true" /></Link>
            </div>
            <ul className="lf-plan-lista">
              {p.lista.map(l => (
                <li key={l}>{p.destacado ? <BadgeCheck size={18} fill="currentColor" stroke="#fff" aria-hidden="true" /> : <BadgeCheck size={18} strokeWidth={1.4} aria-hidden="true" />}{l}</li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </section>
  );
}

export function Preguntas() {
  return (
    <section id="faq" className="lf-faq" aria-labelledby="lf-faq-t">
      <div className="lf-faq-izq">
        <Etiqueta icono={<ShieldCheck size={15} strokeWidth={1.6} />}>{FAQ.etiqueta}</Etiqueta>
        <h2 id="lf-faq-t">{FAQ.titulo}</h2>
        <p>{FAQ.texto}</p>
        <Link href={FAQ.boton.href} className="lf-faq-boton">{FAQ.boton.texto}<span aria-hidden="true"><ArrowUpRight size={16} strokeWidth={1.8} /></span></Link>
      </div>
      <div className="lf-faq-lista">
        {FAQ.preguntas.map((p, i) => (
          <details key={p.q} open={i === FAQ.abierta}>
            <summary>
              <span>{p.q}</span>
              <span className="lf-faq-mas" aria-hidden="true"><Plus className="lf-mas-icono" size={20} strokeWidth={1.4} /><Minus className="lf-menos-icono" size={20} strokeWidth={1.4} /></span>
            </summary>
            <p>{p.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

export function Contacto() {
  return (
    <section id="contacto" className="lf-contacto" style={foto(FOTOS.contacto)} aria-labelledby="lf-contacto-t">
      <div className="lf-contacto-texto">
        <Etiqueta icono={<Contact size={15} strokeWidth={1.6} />} oscuro>{CONTACTO.etiqueta}</Etiqueta>
        <h2 id="lf-contacto-t">{CONTACTO.titulo}</h2>
        <p>{CONTACTO.texto}</p>
        <div className="lf-contacto-pie">
          <p>{CONTACTO.listos}</p>
          <Boton href={CONTACTO.boton.href}>{CONTACTO.boton.texto}</Boton>
        </div>
      </div>
      <FormularioContacto />
    </section>
  );
}

function Facebook() { return (<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M13.5 22v-8h2.7l.5-3.3h-3.2V8.6c0-.9.4-1.7 1.8-1.7h1.5V4.1c-.3 0-1.2-.1-2.2-.1-2.6 0-4.3 1.6-4.3 4.4v2.3H7v3.3h2.8v8h3.7Z" /></svg>); }
function Linkedin() { return (<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M4.98 3.5A2.5 2.5 0 1 1 5 8.5a2.5 2.5 0 0 1-.02-5ZM3 9.75h4V21H3V9.75Zm6.5 0h3.8v1.6h.1c.5-1 1.8-2 3.7-2 4 0 4.7 2.6 4.7 6V21h-4v-5c0-1.2 0-2.7-1.7-2.7s-1.9 1.3-1.9 2.6V21h-4V9.75Z" /></svg>); }
function Equis() { return (<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.8 3h3.1l-6.8 7.7L22 21h-6.2l-4.9-6.3L5.3 21H2.2l7.3-8.3L2 3h6.4l4.4 5.8L17.8 3Zm-1.1 16.2h1.7L7.4 4.7H5.6l11.1 14.5Z" /></svg>); }
function Instagram() { return (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" /></svg>); }

export function Pie() {
  return (
    <footer className="lf-pie">
      <div className="lf-pie-rejilla">
        <div className="lf-pie-marca">
          <Logo claro />
          <p className="lf-pie-lema">{PIE.lema}</p>
          <p className="lf-pie-texto">{PIE.texto}</p>
        </div>
        {PIE.columnas.map(c => (
          <nav key={c.titulo} className="lf-pie-col" aria-label={c.titulo}>
            <h3>{c.titulo}</h3>
            <ul>{c.enlaces.map(e => <li key={e.t}><Link href={e.h}>{e.t}</Link></li>)}</ul>
          </nav>
        ))}
      </div>
      <div className="lf-pie-base">
        <p>{PIE.copyright}</p>
        <p className="lf-pie-legal">{PIE.legal.map((l, i) => <span key={l.t}>{i > 0 && ' · '}<Link href={l.h}>{l.t}</Link></span>)}</p>
        {/* Del diseño: Facebook, LinkedIn, X e Instagram. Hoy Tentare solo tiene Instagram y LinkedIn: los otros dos se
            quedan sin enlace hasta que existan las cuentas. */}
        <ul className="lf-redes">
          <li><span aria-hidden="true" className="lf-red lf-red--sin"><Facebook /></span></li>
          <li><a className="lf-red" href="https://www.linkedin.com/company/tentare/" target="_blank" rel="noopener noreferrer" aria-label="Tentare en LinkedIn"><Linkedin /></a></li>
          <li><span aria-hidden="true" className="lf-red lf-red--sin"><Equis /></span></li>
          <li><a className="lf-red" href="https://www.instagram.com/tentareapp/" target="_blank" rel="noopener noreferrer" aria-label="Tentare en Instagram"><Instagram /></a></li>
        </ul>
      </div>
    </footer>
  );
}
