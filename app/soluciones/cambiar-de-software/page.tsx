import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, CalendarCheck, CalendarClock, Check, FileText, LayoutGrid, Lock, Receipt, Ticket, Users } from 'lucide-react';
import { Reveal } from '@/components/landing/Reveal';
import { FOTOS, rutaFoto } from '@/components/landing/fotos';
import { PageShell } from '@/components/recursos/PageShell';
import { IslaWeb } from '@/components/web/IslaWeb';
import { PieWeb } from '@/components/web/PieWeb';
import { ArticleFaq } from '@/components/recursos/ArticleFaq';
import { FaqStructuredData, PageBreadcrumb } from '@/components/recursos/ArticleStructuredData';
import { OrganizationStructuredData } from '@/components/OrganizationStructuredData';
import { CTA_ALTA } from '@/lib/landing/founding-gratis';
import { WHATSAPP_SOPORTE } from '@/components/landing/enlaces';
import { enlaceWhatsApp } from '@/lib/decision/mensajes-socia';
import { paginaDe, relacionadasDe, urlDe } from '@/lib/seo/paginas';
import { SE_LLEVA } from '@/lib/landing/migracion';

// ─────────────────────────────────────────────────────────────────────────────
// «Cambiarte a Tentare» (22-oct-2026): la maqueta que mandó el fundador, llevada al
// sistema de la web. Lo que la maqueta traía y aquí NO está, a propósito:
//  · el testimonio de «Clara M.» con cinco estrellas: no es de una clienta real;
//  · la tabla del final con bsport y Mindbody en gris en «Reservas» o «App»: los dos
//    tienen reservas y app, así que sería falso. En su lugar, las comparativas de verdad;
//  · «En pocas horas»: no lo hemos medido;
//  · la lista de espera entre lo que se importa: el importador no la trae.
// Las cifras de las piezas («1.248 filas»…) son de muestra, como en el resto de la web.
// Los logos son los de /comparativa, y lo que dicen es cierto: el importador lee el CSV
// que exporta cualquiera de ellos (lib/migracion/ejemplos.ts, clasificador.ts).
// ─────────────────────────────────────────────────────────────────────────────

const PATH = '/soluciones/cambiar-de-software';
const pagina = paginaDe(PATH)!;

export const metadata: Metadata = {
  title: pagina.titulo,
  description: pagina.descripcion,
  alternates: { canonical: urlDe(PATH) },
  openGraph: {
    siteName: 'Tentare',
    type: 'website',
    title: pagina.titulo,
    description: 'Se hace tú misma en el panel. Nada se importa sin que lo revises antes.',
    url: urlDe(PATH),
  },
};

// Los seis tipos de dato del importador real: el TÍTULO sale de SE_LLEVA
// (lib/landing/migracion.ts, la misma lista que la home), y aquí solo se le pone
// icono y una línea, en el mismo orden.
const DETALLE = [
  { icono: Users, texto: 'Con su historial, su asistencia y sus datos de contacto.' },
  { icono: Ticket, texto: 'Lo que le queda a cada una, cuándo caduca y de qué tipo es.' },
  { icono: LayoutGrid, texto: 'Tu calendario, con sus instructoras, salas y aforos.' },
  { icono: CalendarCheck, texto: 'Quién va a cada clase, y quién vino o canceló.' },
  { icono: CalendarClock, texto: 'Las sesiones privadas, con su servicio y su precio.' },
  { icono: Receipt, texto: 'Lo que pagó cada clienta: fecha, importe y concepto.' },
] as const;
const LO_QUE_TE_LLEVAS = SE_LLEVA.map((titulo, i) => ({ titulo: titulo.split(' — ')[0], ...DETALLE[i] }));

const LOGOS = [
  // Alto de cada uno a ojo, para que pesen lo mismo (las proporciones de /comparativa).
  { src: '/comparativa/logos/bsport.svg', alt: 'bsport', ancho: 69, alto: 24 },
  { src: '/comparativa/logos/momence.svg', alt: 'Momence', ancho: 122, alto: 15 },
  { src: '/comparativa/logos/eversports.svg', alt: 'Eversports', ancho: 118, alto: 24 },
  { src: '/comparativa/logos/mindbody.svg', alt: 'Mindbody', ancho: 115, alto: 24 },
  { src: '/comparativa/logos/timp.webp', alt: 'TIMP', ancho: 89, alto: 24 },
] as const;

const PASOS = [
  { titulo: 'Sube tus datos', texto: 'Los CSV que exporta tu programa actual.' },
  { titulo: 'Revisa la vista previa', texto: 'Qué se va a crear, qué queda en cuarentena y por qué.' },
  { titulo: 'Confirma', texto: 'Se importa con acta, y cada lote tiene botón de deshacer.' },
  { titulo: 'Empieza a trabajar', texto: 'Tu programa anterior sigue funcionando hasta que tú decidas.' },
] as const;

// La misma puerta que el pie (PieWeb): el WhatsApp de soporte, con la pregunta ya empezada.
const ENLACE_WA = enlaceWhatsApp(WHATSAPP_SOPORTE, 'Hola, tengo una duda sobre cambiarme a Tentare:') ?? `https://wa.me/${WHATSAPP_SOPORTE.replace(/\D/g, '')}`;

const COMPARATIVAS = [
  { slug: 'bsport', nombre: 'bsport' },
  { slug: 'momence', nombre: 'Momence' },
  { slug: 'eversports', nombre: 'Eversports' },
  { slug: 'mindbody', nombre: 'Mindbody' },
  { slug: 'timp', nombre: 'TIMP' },
] as const;

const FAQ = [
  {
    q: '¿En qué formato tengo que exportar mis datos?',
    a: 'CSV — el importador detecta solas comas, punto y coma (el formato habitual de Excel en español) o tabuladores.',
  },
  {
    q: '¿Se pierden las tarjetas guardadas de mis alumnas?',
    a: 'Como en cualquier cambio de proveedor de pagos, las tarjetas guardadas no se migran automáticamente — ningún software puede leer el número de tarjeta que otro tiene tokenizado. Cada alumna tendrá que volver a introducir su tarjeta una vez, la primera vez que le cobres con Tentare.',
  },
  {
    q: '¿Qué pasa si algo se importa mal?',
    a: 'Nada se toca sin que lo revises primero: antes de ejecutar nada ves una muestra de lo que se va a crear, qué filas van en cuarentena (duplicadas o con error) y qué avisos hay. Y todo lote importado tiene un botón de deshacer.',
  },
  {
    q: '¿Tengo que dejar de usar mi software actual mientras migro?',
    a: 'No. Tu software actual sigue funcionando exactamente igual mientras preparas el cambio — no hay un corte ni una ventana de mantenimiento.',
  },
];

// El portátil del héroe: el calendario del panel con el importador encima. Datos de muestra.
const SEMANA = ['Lun 14', 'Mar 15', 'Mié 16', 'Jue 17', 'Vie 18'] as const;
const BLOQUES: { dia: number; fila: number; clase: string; hora: string; tono: 'a' | 'b' | 'c' }[] = [
  { dia: 0, fila: 0, clase: 'Mat Pilates', hora: '8:00 – 9:00', tono: 'a' },
  { dia: 4, fila: 0, clase: 'Yin Pilates', hora: '8:00 – 9:00', tono: 'b' },
  { dia: 0, fila: 1, clase: 'Reformer', hora: '9:00 – 10:00', tono: 'b' },
  { dia: 2, fila: 1, clase: 'Reformer', hora: '9:00 – 10:00', tono: 'a' },
  { dia: 4, fila: 1, clase: 'Mat Pilates', hora: '9:00 – 10:00', tono: 'c' },
  { dia: 0, fila: 2, clase: 'Reformer', hora: '10:00 – 11:00', tono: 'c' },
  { dia: 3, fila: 2, clase: 'Barre', hora: '10:00 – 11:00', tono: 'a' },
];
const IMPORTANDO = ['Clientas (1.248)', 'Bonos y membresías', 'Clases y calendario', 'Historial de pagos'] as const;

function Portatil() {
  return (
    <div className="cs-portatil" aria-hidden="true">
      <div className="cs-pantalla">
        <div className="cs-lateral">{Array.from({ length: 6 }, (_, i) => <span key={i} />)}</div>
        <div className="cs-cal">
          <p className="cs-cal-tit">Clases de Pilates</p>
          <div className="cs-cal-rejilla">
            {SEMANA.map((d) => <span key={d} className="cs-cal-dia">{d}</span>)}
            {BLOQUES.map((b) => (
              <span key={`${b.dia}-${b.fila}`} className={`cs-cal-clase cs-tono-${b.tono}`} style={{ gridColumn: b.dia + 1, gridRow: b.fila + 2 }}>
                <b>{b.clase}</b>{b.hora}
              </span>
            ))}
          </div>
        </div>
      </div>
      <div className="cs-base" />
      <div className="cs-ficha cs-ficha-importa">
        <p className="cs-ficha-tit">Importando tus datos…</p>
        <div className="cs-barra"><span className="cs-barra-pista"><span style={{ width: '78%' }} /></span><b>78 %</b></div>
        <ul>
          {IMPORTANDO.map((t) => <li key={t}><Check size={13} strokeWidth={2.6} />{t}</li>)}
          <li className="cs-pendiente"><span />Listo para revisar</li>
        </ul>
      </div>
      <div className="cs-ficha cs-ficha-segura">
        <span className="cs-candado"><Lock size={16} /></span>
        <span><b>Tus datos, aislados</b>Cada estudio ve solo los suyos.</span>
      </div>
    </div>
  );
}

function ActaCsv() {
  const filas = [['Clientas', '1.248'], ['Bonos', '320'], ['Clases', '185'], ['Pagos', '2.341']] as const;
  return (
    <div className="cs-acta" aria-hidden="true">
      <div className="cs-acta-cab">
        <span className="cs-acta-doc"><FileText size={18} /></span>
        <span><b>clientas.csv</b>CSV · 2,4 MB</span>
        <span className="cs-acta-ok"><Check size={13} strokeWidth={2.8} /></span>
      </div>
      <ul>
        {filas.map(([n, f]) => <li key={n}><span>{n}</span><span>{f} filas</span><Check size={14} strokeWidth={2.6} /></li>)}
      </ul>
      <span className="cs-acta-boton">Confirmar e importar</span>
    </div>
  );
}

export default function CambiarDeSoftwarePage() {
  const relacionadas = relacionadasDe(PATH);
  return (
    <PageShell>
      <OrganizationStructuredData />
      <FaqStructuredData items={FAQ} />
      <PageBreadcrumb path={PATH} name="Cambiarte de software" />
      <IslaWeb />

      <header className="cs-heroe">
        <div className="cs-ancho cs-heroe-rejilla">
          <div>
            <p className="cs-pildora">Cambiarte de software</p>
            <h1 className="cs-h1">Cámbiate a Tentare, <span>sin perder nada.</span></h1>
            <p className="cs-entrada">
              Tu <strong>estudio de Pilates</strong> se lleva sus clientas, sus bonos, su calendario y su historial. Lo haces tú misma en
              el panel, sin parar el estudio.
            </p>
            <div className="cs-acciones">
              <Link href="/crear-estudio" className="cs-boton cs-boton-oscuro">{CTA_ALTA} <ArrowRight size={16} /></Link>
              <Link href="/comparativa" className="cs-boton cs-boton-borde">Ver la comparativa</Link>
            </div>
            <ul className="cs-sellos">
              <li><Check size={14} />Sin parar tu estudio</li>
              <li><Check size={14} />Tus datos, siempre exportables</li>
              <li><Check size={14} />Te responde una persona</li>
            </ul>
          </div>
          <Portatil />
        </div>
        <div className="cs-ancho cs-logos">
          <p>Trae el CSV que exporta tu programa actual</p>
          <ul>
            {LOGOS.map((l) => (
              // eslint-disable-next-line @next/next/no-img-element
              <li key={l.alt}><img src={l.src} alt={l.alt} width={l.ancho} height={l.alto} style={{ width: l.ancho, height: l.alto }} loading="lazy" /></li>
            ))}
            <li className="cs-logos-mas">y más</li>
          </ul>
        </div>
      </header>

      <section className="cs-seccion">
        <div className="cs-ancho cs-llevas">
          <div>
            <p className="cs-pildora">Todo lo que te llevas</p>
            <h2 className="cs-h2">Misma información. <span>Más control.</span></h2>
            <p className="cs-lead">Trae tus datos y empieza a trabajar desde el primer día.</p>
            <ul className="cs-llevas-lista">
              {LO_QUE_TE_LLEVAS.map(({ titulo, texto, icono: Icono }) => (
                <li key={titulo}>
                  <span className="cs-icono"><Icono size={19} /></span>
                  <span><b>{titulo}</b>{texto}</span>
                </li>
              ))}
            </ul>
          </div>
          <figure className="cs-foto">
            <picture>
              <source type="image/avif" srcSet={`${rutaFoto(FOTOS.anoche, 'movil', 828, 'avif')} 828w, ${rutaFoto(FOTOS.anoche, 'movil', 480, 'avif')} 480w`} sizes="(max-width: 900px) 92vw, 420px" />
              <img
                src={rutaFoto(FOTOS.anoche, 'movil', 828, 'webp')}
                srcSet={`${rutaFoto(FOTOS.anoche, 'movil', 828, 'webp')} 828w, ${rutaFoto(FOTOS.anoche, 'movil', 480, 'webp')} 480w`}
                sizes="(max-width: 900px) 92vw, 420px"
                width={828}
                height={1035}
                alt={FOTOS.anoche.alt}
                loading="lazy"
                decoding="async"
              />
            </picture>
            <figcaption className="cs-foto-ficha">
              <span className="cs-candado"><Check size={16} strokeWidth={2.6} /></span>
              <span><b>Nada se importa sin tu visto bueno</b>Primero ves la muestra; luego confirmas.</span>
            </figcaption>
          </figure>
        </div>
      </section>

      <section className="cs-seccion cs-seccion-corta">
        <div className="cs-ancho">
          <Reveal className="cs-panel">
            <div>
              <h2 className="cs-h3">Tú misma, en el panel.</h2>
              <p>
                Subes tus exports en CSV y el sistema te enseña el plan antes de tocar nada: una muestra de lo que va a crear, qué filas
                quedan en cuarentena y qué avisos hay. Solo cuando lo confirmas, se ejecuta — con acta y botón de deshacer.
              </p>
              <Link href="/ayuda/clientes/importar-clientes" className="cs-boton cs-boton-oscuro">Ver cómo funciona <ArrowRight size={16} /></Link>
            </div>
            <ActaCsv />
          </Reveal>
        </div>
      </section>

      <section className="cs-seccion">
        <div className="cs-ancho">
          <h2 className="cs-h2 cs-h2-medio">Un proceso simple, sin complicaciones.</h2>
          <p className="cs-lead">Cuatro pasos, y tu estudio sigue abierto mientras tanto.</p>
          <ol className="cs-pasos">
            {PASOS.map((p, i) => (
              <li key={p.titulo}>
                <span className="cs-paso-n">{i + 1}</span>
                <b>{p.titulo}</b>
                <span>{p.texto}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="cs-seccion cs-seccion-corta">
        <div className="cs-ancho">
          <p className="cs-pildora">Preguntas frecuentes</p>
          <div className="cs-faq-cab">
            <h2 className="cs-h2 cs-h2-medio">Resolvemos tus dudas.</h2>
            <a href={ENLACE_WA} target="_blank" rel="noopener noreferrer" className="cs-enlace">¿Tienes otra pregunta? Escríbenos <ArrowRight size={15} /></a>
          </div>
          <ArticleFaq items={FAQ} />
        </div>
      </section>

      <section className="cs-seccion-corta cs-final-zona">
        <div className="cs-ancho">
          <div className="cs-final">
            <div>
              <h2 className="cs-h2">¿Prefieres verlo antes de decidir?</h2>
              <p>Compara Tentare con tu software actual, punto por punto.</p>
              <Link href="/comparativa" className="cs-boton cs-boton-claro">Ver la comparativa <ArrowRight size={16} /></Link>
            </div>
            <ul className="cs-comparativas">
              {COMPARATIVAS.map((c) => (
                <li key={c.slug}>
                  <Link href={`/comparativa/tentare-vs-${c.slug}`}>
                    <span>Tentare <i>vs</i> {c.nombre}</span>
                    <ArrowRight size={16} />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {relacionadas.length > 0 && (
        <section className="cs-seccion-corta">
          <div className="cs-ancho">
            <h2 className="cs-sigue">Sigue por aquí</h2>
            <div className="cs-rel">
              {relacionadas.map((r) => (
                <Link key={r.path} href={r.path} className="cs-rel-card">
                  <span className="cs-rel-nombre">{r.etiqueta}</span>
                  <span className="cs-rel-resumen">{r.resumen ?? r.descripcion}</span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      <PieWeb />

      <style>{`
        .cs-ancho { max-width: 1180px; margin: 0 auto; padding: 0 var(--w-margen); }
        .cs-seccion { padding: clamp(56px,7vw,96px) 0; }
        .cs-seccion-corta { padding: clamp(28px,4vw,48px) 0; }
        .cs-pildora { display: inline-block; margin: 0 0 18px; padding: 6px 13px; border-radius: 999px; background: var(--w-papel);
          border: 1px solid var(--w-linea); font-size: 13px; font-weight: 600; color: var(--w-olive); }
        .cs-h1 { margin: 0 0 20px; font-weight: var(--w-peso-titular); font-size: clamp(38px,4.3vw,58px); line-height: 1.02; letter-spacing: var(--w-track-h1); color: var(--w-texto); }
        .cs-h1 span, .cs-h2 span { color: var(--w-olive); display: block; }
        .cs-h2 { margin: 0 0 14px; font-weight: var(--w-peso-titular); font-size: var(--w-fs-h2); line-height: 1.06; letter-spacing: var(--w-track-h2); color: var(--w-texto); }
        .cs-h2-medio { font-size: clamp(26px,2.8vw,38px); }
        .cs-h3 { margin: 0 0 12px; font-weight: var(--w-peso-titular); font-size: clamp(24px,2.4vw,32px); letter-spacing: -.025em; color: var(--w-texto); }
        .cs-entrada, .cs-lead { margin: 0; font-size: clamp(17px,1.4vw,19px); line-height: 1.55; color: var(--w-texto-2); max-width: 560px; }
        .cs-entrada strong { color: var(--w-texto); }
        .cs-lead { margin-bottom: 34px; }

        .cs-heroe { padding: clamp(40px,6vw,80px) 0 clamp(32px,4vw,48px); background: linear-gradient(180deg, var(--w-cream), #EFEBE2); }
        .cs-heroe-rejilla { display: grid; grid-template-columns: minmax(0,1.1fr) minmax(0,1fr); gap: clamp(28px,5vw,72px); align-items: center; }
        .cs-acciones { display: flex; flex-wrap: wrap; gap: 12px; margin: 30px 0 22px; }
        .cs-boton { display: inline-flex; align-items: center; gap: 8px; min-height: 50px; padding: 0 24px; border-radius: 999px; font-size: 15.5px;
          font-weight: 600; text-decoration: none; transition: background .2s, border-color .2s; }
        .cs-boton-oscuro { background: var(--w-olive); color: var(--w-sand); }
        .cs-boton-oscuro:hover { background: var(--w-olive-hondo); }
        .cs-boton-borde { border: 1.5px solid var(--w-linea-fuerte); color: var(--w-texto); background: transparent; }
        .cs-boton-borde:hover { border-color: var(--w-texto); }
        .cs-boton-claro { background: var(--w-cream); color: var(--w-olive); }
        .cs-sellos { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 8px 20px; font-size: 14px; color: var(--w-texto-2); }
        .cs-sellos li { display: inline-flex; align-items: center; gap: 6px; }
        .cs-sellos svg { color: var(--w-olive); }

        .cs-portatil { position: relative; padding: 40px 0 30px 18px; margin-right: calc(-1 * var(--w-margen) - 80px); }
        .cs-heroe { overflow-x: clip; }
        .cs-pantalla { display: grid; grid-template-columns: 44px minmax(0,1fr); aspect-ratio: 16 / 10.4; border: 10px solid #1F211C; border-bottom-width: 14px;
          border-radius: 18px 18px 6px 6px; background: var(--w-papel); overflow: hidden; box-shadow: var(--w-sombra-suave); }
        .cs-lateral { display: flex; flex-direction: column; align-items: center; gap: 14px; padding: 18px 0; border-right: 1px solid var(--w-linea); }
        .cs-lateral span { width: 16px; height: 16px; border-radius: 5px; border: 1.5px solid var(--w-texto-3); opacity: .55; }
        .cs-lateral span:first-child { background: var(--w-olive); border-color: var(--w-olive); opacity: 1; }
        .cs-cal { padding: 16px 16px 10px; min-width: 0; }
        .cs-cal-tit { margin: 0 0 12px; font-size: 13px; font-weight: 600; color: var(--w-texto); }
        .cs-cal-rejilla { display: grid; grid-template-columns: repeat(5, minmax(0,1fr)); grid-auto-rows: minmax(0, auto); gap: 6px; }
        .cs-cal-dia { font-size: 10px; color: var(--w-texto-3); padding-bottom: 4px; border-bottom: 1px solid var(--w-linea); }
        .cs-cal-clase { display: flex; flex-direction: column; gap: 2px; padding: 7px 8px; min-height: 44px; border-radius: 8px; font-size: 9.5px; color: var(--w-texto-2); }
        .cs-cal-clase b { font-size: 10.5px; color: var(--w-texto); font-weight: 600; }
        .cs-tono-a { background: #E6EDDD; } .cs-tono-b { background: #E9E3F1; } .cs-tono-c { background: #F4E6DC; }
        .cs-base { height: 14px; margin: 0 -26px; border-radius: 0 0 22px 22px; background: linear-gradient(180deg, #C9C6BE, #A9A69E); }
        .cs-ficha { position: absolute; background: var(--w-papel); border: 1px solid var(--w-linea); border-radius: 16px; box-shadow: var(--w-sombra-suave); }
        .cs-ficha-importa { top: 0; left: 26%; width: 240px; padding: 16px 18px; }
        .cs-ficha-tit { margin: 0 0 10px; font-size: 13.5px; font-weight: 600; color: var(--w-texto); }
        .cs-barra { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; font-size: 12px; }
        .cs-barra-pista { flex: 1; height: 6px; border-radius: 999px; background: var(--w-piedra); overflow: hidden; }
        .cs-barra-pista span { display: block; height: 100%; border-radius: 999px; background: var(--w-olive); }
        .cs-ficha ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 7px; font-size: 12px; color: var(--w-texto-2); }
        .cs-ficha li { display: flex; align-items: center; gap: 7px; }
        .cs-ficha li svg { flex-shrink: 0; width: 16px; height: 16px; padding: 2px; border-radius: 999px; background: #E6EDDD; color: var(--w-olive); }
        .cs-pendiente span { width: 16px; height: 16px; border-radius: 999px; border: 1.5px solid var(--w-linea-fuerte); }
        .cs-ficha-segura { right: -6px; bottom: 10px; display: flex; gap: 12px; align-items: center; max-width: 250px; padding: 14px 16px; font-size: 12px; color: var(--w-texto-2); }
        .cs-ficha-segura b, .cs-foto-ficha b { display: block; font-size: 13.5px; color: var(--w-texto); margin-bottom: 2px; }
        .cs-candado { flex-shrink: 0; display: grid; place-items: center; width: 38px; height: 38px; border-radius: 10px; background: var(--w-olive); color: var(--w-sand); }

        .cs-logos { display: flex; flex-wrap: wrap; align-items: center; gap: 14px 40px; margin-top: clamp(36px,5vw,56px); }
        .cs-logos p { margin: 0; font-size: 13.5px; font-weight: 600; color: var(--w-texto-3); }
        .cs-logos ul { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; align-items: center; gap: 18px 40px; }
        .cs-logos img { display: block; max-width: none; filter: brightness(0); opacity: .72; }
        .cs-logos-mas { font-size: 14px; color: var(--w-texto-3); }

        .cs-llevas { display: grid; grid-template-columns: minmax(0,1.35fr) minmax(0,1fr); gap: clamp(32px,6vw,88px); align-items: center; }
        .cs-llevas-lista { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 26px 28px; }
        .cs-llevas-lista li { display: flex; gap: 14px; align-items: flex-start; font-size: 14.5px; line-height: 1.5; color: var(--w-texto-2); }
        .cs-llevas-lista b { display: block; font-size: 16px; color: var(--w-texto); margin-bottom: 3px; font-weight: 600; }
        .cs-icono { flex-shrink: 0; display: grid; place-items: center; width: 44px; height: 44px; border-radius: 999px; background: var(--w-papel);
          border: 1px solid var(--w-linea); color: var(--w-olive); }
        .cs-foto { position: relative; margin: 0; }
        .cs-foto picture, .cs-foto img { display: block; width: 100%; height: auto; border-radius: var(--w-r-tarjeta); }
        .cs-foto img { aspect-ratio: 4 / 5; object-fit: cover; }
        .cs-foto-ficha { position: absolute; left: -24px; right: 24px; bottom: -28px; display: flex; gap: 12px; align-items: center; padding: 16px 18px;
          background: var(--w-papel); border: 1px solid var(--w-linea); border-radius: 18px; box-shadow: var(--w-sombra-suave); font-size: 13px; color: var(--w-texto-2); }

        .cs-panel { display: grid; grid-template-columns: minmax(0,1.3fr) minmax(0,1fr); gap: clamp(28px,5vw,64px); align-items: center;
          padding: clamp(28px,4vw,48px); border-radius: 28px; background: #EFEBE2; }
        .cs-panel p { margin: 0 0 26px; font-size: 16px; line-height: 1.6; color: var(--w-texto-2); max-width: 560px; }
        .cs-acta { padding: 18px; border-radius: 18px; background: var(--w-papel); border: 1px solid var(--w-linea); box-shadow: var(--w-sombra-suave); }
        .cs-acta-cab { display: flex; align-items: center; gap: 12px; padding: 4px 4px 14px; border-bottom: 1px solid var(--w-linea); font-size: 12px; color: var(--w-texto-3); }
        .cs-acta-cab b { display: block; font-size: 14px; color: var(--w-texto); }
        .cs-acta-doc { display: grid; place-items: center; width: 36px; height: 36px; border-radius: 9px; border: 1px solid var(--w-linea); color: var(--w-texto-2); }
        .cs-acta-ok { margin-left: auto; display: grid; place-items: center; width: 22px; height: 22px; border-radius: 999px; background: var(--w-exito); color: #fff; }
        .cs-acta ul { list-style: none; margin: 0; padding: 8px 4px; }
        .cs-acta li { display: grid; grid-template-columns: 1fr auto 18px; gap: 12px; align-items: center; padding: 9px 0; font-size: 13.5px; color: var(--w-texto); }
        .cs-acta li + li { border-top: 1px solid var(--w-linea); }
        .cs-acta li span:nth-child(2) { color: var(--w-texto-3); font-size: 12.5px; }
        .cs-acta li svg { color: var(--w-exito); }
        .cs-acta-boton { display: block; margin-top: 6px; padding: 12px; border-radius: 12px; background: var(--w-olive); color: var(--w-sand); text-align: center; font-size: 14px; font-weight: 600; }

        .cs-pasos { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: 28px; counter-reset: paso; }
        .cs-pasos li { position: relative; display: flex; flex-direction: column; gap: 6px; font-size: 14.5px; line-height: 1.5; color: var(--w-texto-2); }
        .cs-pasos li:not(:last-child)::after { content: ''; position: absolute; top: 18px; left: 52px; right: -16px; border-top: 1.5px dashed var(--w-linea-fuerte); }
        .cs-pasos b { margin-top: 12px; font-size: 16.5px; color: var(--w-texto); font-weight: 600; }
        .cs-paso-n { display: grid; place-items: center; width: 36px; height: 36px; border-radius: 999px; background: var(--w-sand-claro); color: var(--w-olive); font-weight: 600; }

        .cs-faq-cab { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 12px; }
        .cs-enlace { display: inline-flex; align-items: center; gap: 6px; font-size: 15px; font-weight: 600; color: var(--w-olive); text-decoration: none; }
        .cs-enlace:hover { text-decoration: underline; text-underline-offset: 4px; }

        .cs-final-zona { padding-bottom: clamp(48px,6vw,80px); }
        .cs-final { display: grid; grid-template-columns: minmax(0,1fr) minmax(0,1fr); gap: clamp(28px,5vw,64px); align-items: center;
          padding: clamp(32px,5vw,56px); border-radius: 28px; background: var(--w-olive); color: var(--w-sobre-noche); }
        .cs-final .cs-h2 { color: var(--w-sobre-noche); }
        .cs-final p { margin: 0 0 26px; font-size: 17px; line-height: 1.55; color: var(--w-sobre-noche-2); }
        .cs-comparativas { list-style: none; margin: 0; padding: 8px; border-radius: 20px; background: var(--w-papel); }
        .cs-comparativas a { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 16px; border-radius: 12px;
          font-size: 15.5px; font-weight: 600; color: var(--w-texto); text-decoration: none; }
        .cs-comparativas a:hover { background: var(--w-cream); }
        .cs-comparativas i { font-style: normal; font-weight: 400; color: var(--w-texto-3); }
        .cs-comparativas li + li { border-top: 1px solid var(--w-linea); }
        .cs-comparativas svg { color: var(--w-olive); }

        .cs-sigue { margin: 0 0 18px; font-size: 14px; font-weight: 600; color: var(--w-olive); }
        .cs-rel { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 16px; }
        .cs-rel-card { display: block; background: var(--w-papel); border: 1px solid var(--w-linea); border-radius: 20px; padding: 20px; text-decoration: none;
          transition: border-color .18s ease, box-shadow .18s ease; }
        .cs-rel-card:hover { border-color: var(--w-linea-fuerte); box-shadow: var(--w-sombra-suave); }
        .cs-rel-nombre { display: block; font-size: 15.5px; font-weight: 600; color: var(--w-texto); margin-bottom: 6px; }
        .cs-rel-resumen { display: block; font-size: 13.5px; line-height: 1.5; color: var(--w-texto-2); }

        @media (max-width: 960px) {
          .cs-heroe-rejilla, .cs-llevas, .cs-panel, .cs-final { grid-template-columns: minmax(0,1fr); }
          .cs-portatil { padding-left: 0; margin-right: 0; }
          .cs-foto { max-width: 460px; }
          .cs-foto-ficha { left: 16px; right: 16px; }
          .cs-pasos { grid-template-columns: repeat(2,minmax(0,1fr)); }
          .cs-pasos li::after { display: none; }
          .cs-rel { grid-template-columns: minmax(0,1fr); }
        }
        @media (max-width: 600px) {
          .cs-llevas-lista, .cs-pasos { grid-template-columns: minmax(0,1fr); }
          .cs-ficha-importa { left: auto; right: 0; width: 210px; top: -6px; }
          .cs-ficha-segura { display: none; }
          .cs-cal-clase { font-size: 8px; min-height: 36px; padding: 5px; }
          .cs-cal-clase b { font-size: 9px; }
          .cs-logos ul { gap: 16px 28px; }
          .cs-logos img { transform: scale(.85); transform-origin: left center; }
        }
        @media (prefers-reduced-motion: reduce) { .cs-boton, .cs-rel-card { transition: none; } }
      `}</style>
    </PageShell>
  );
}
