import Link from 'next/link';
import { CalendarDays, FileSpreadsheet, Mail, MessageCircle } from 'lucide-react';
import { PLANS } from './data';
import { ALTA } from './enlaces';
import { FotoLanding } from './FotoLanding';
import { FOTOS_BENTO, type ClaveHueco } from './fotos-bento';
import { LogoTentare } from '@/components/marca/logo-tentare';
import { TRIAL_DIAS } from '@/lib/billing/trial';

// «Todo lo que necesita un estudio, en una sola plataforma» — rehecha por
// tercera vez el 6-oct-2026 con el fundador mirando una referencia: tarjetas de
// esquinas muy redondeadas con un TINTE suave, un titular corto, UNA descripción
// de dos líneas, chips pequeños y, de visual, FRAGMENTOS reales del producto
// (recortes apretados de las capturas: un mapa de reformers, un recibo, una
// clase llena, la confirmación del asistente) colocados como pegatinas
// escalonadas que se salen por un borde, más un móvil que asoma, notificaciones
// al estilo de iOS, iconos de app «squircle» y fotos donde pide el diseño.
//
// ORDEN = lo que compra un estudio: 1) reservas y lista de espera (llenar
// clases), 2) la app de la alumna, 3) cobros y bonos, 4) el calendario; después
// Centro de Control y «Pregúntale a Tentare», equipo (con las sustituciones
// como un chip, no como protagonista) y migración. Soporte, en una franja.
//
// IMÁGENES. Los fragmentos son recortes de capturas REALES hechas por
// e2e/landing-capturas.spec.ts con los andamiajes de e2e (datos de MUESTRA:
// nombres inventados, `@example.com`, un estudio ficticio) y recortadas por
// scripts/capturas-landing.mjs. Nunca datos reales: el repo es público. Las
// notificaciones y los iconos son HTML/CSS (genéricos: sin logotipos de
// terceros; el único icono de app con marca es el de Tentare, del isotipo).
// Las fotos salen de `fotos-bento.ts`: cada hueco dice qué foto pide y vale
// `null` hasta que haya una (entonces, un tinte limpio).
//
// Es un Server Component: ni un byte de esto entra en el JavaScript de la home.
// El movimiento es CSS (`animation-timeline: view()`, solo `translate`). Las
// imágenes van con <picture> AVIF+WebP ya generados (FotoLanding.tsx explica por
// qué no next/image), con width/height (CLS 0) y `loading="lazy"`.
//
// En móvil los fragmentos NO se encogen: se reordenan en una columna a su
// tamaño legible, escalonados. Sin Tenti: la web comercial está vetada en
// lib/tenti/donde-vive-tenti.test.ts.
//
// ⚠️ TODA frase de promesa de aquí está cruzada con el código (lista en el PR):
//   · el asistente CONSULTA y PROPONE clases, salas, eventos y citas; nada se
//     crea sin confirmar, y no cobra, borra, edita ni escribe a nadie;
//   · los reintentos de cobro son los de lib/billing/dunning.ts (1, 3 y 7 días);
//   · la sustitución espera tu visto bueno en el modo por defecto; el autónomo,
//     el Centro de Control, plan Estudio; varias sedes, plan Cadena;
//   · los avisos de ejemplo son los que la app manda hoy (recordatorio de clase,
//     bono a punto de agotarse); nada de cifras de clientas.
// Nada de lo congelado (Kiosko, VOD, Chat de equipo, Network).

const PRECIO_DESDE = PLANS[0].price.replace('€', ' €');

/** Fragmentos: nombre del fichero y alto/ancho del recorte (scripts/capturas-landing.mjs). */
const F = {
  mapa: { n: 'fragmento-mapa-reformers-reserva', r: 650 / 1090 },
  pago: { n: 'fragmento-pago-recibo-app', r: 600 / 1090 },
  bono: { n: 'fragmento-bono-sesiones-app', r: 640 / 1090 },
  semana: { n: 'fragmento-semana-calendario', r: 400 / 860 },
  ocupacion: { n: 'fragmento-ocupacion-calendario', r: 80 / 700 },
  llena: { n: 'fragmento-clase-llena-lista-espera', r: 104 / 420 },
  reco: { n: 'fragmento-recomendacion-centro-de-control', r: 322 / 1330 },
  botones: { n: 'fragmento-botones-decision', r: 110 / 700 },
  peticion: { n: 'fragmento-asistente-peticion', r: 140 / 830 },
  confirmacion: { n: 'fragmento-asistente-confirmacion', r: 620 / 1340 },
  acta: { n: 'fragmento-acta-migracion', r: 215 / 1560 },
  actaMovil: { n: 'fragmento-acta-migracion-movil', r: 215 / 830 },
  deshacer: { n: 'fragmento-deshacer-migracion', r: 110 / 780 },
  sustituta: { n: 'fragmento-avisar-sustituta', r: 360 / 740 },
} as const;
type Frag = keyof typeof F;

const MOVIL_INICIO = { n: 'app-alumna-inicio-estudio-pilates', r: 844 / 390 };

function Imagen({ n, r, a, alt, sizes, ancho, movil }: { n: string; r: number; a: readonly [number, number]; alt: string; sizes: string; ancho: number; movil?: { n: string; r: number } }) {
  const set = (nombre: string, f: 'avif' | 'webp') => a.map((w) => `/landing/capturas/${nombre}-${w}.${f} ${w}w`).join(', ');
  return (
    <picture>
      {/* Otro recorte en móvil (dirección de arte): una sola <img>, así nunca queda una imagen oculta sin cargar. */}
      {movil && <source type="image/avif" media="(max-width: 700px)" srcSet={set(movil.n, 'avif')} sizes={sizes} width={ancho} height={Math.round(ancho * movil.r)} />}
      {movil && <source type="image/webp" media="(max-width: 700px)" srcSet={set(movil.n, 'webp')} sizes={sizes} width={ancho} height={Math.round(ancho * movil.r)} />}
      <source type="image/avif" srcSet={set(n, 'avif')} sizes={sizes} />
      <img src={`/landing/capturas/${n}-${a[0]}.webp`} srcSet={set(n, 'webp')} sizes={sizes} width={ancho} height={Math.round(ancho * r)} alt={alt} loading="lazy" decoding="async" />
    </picture>
  );
}

/** Un fragmento real, como pegatina: sombra larga y suave, ligeramente girado. */
function Peg({ f, alt, estilo, par = false, sizes = '(max-width: 700px) 92vw, 420px', movil }: {
  f: Frag; alt: string; estilo: React.CSSProperties; par?: boolean; sizes?: string; movil?: Frag;
}) {
  const d = F[f];
  return (
    <div className={`bn-peg${par ? ' bn-par' : ''}`} style={estilo}>
      <Imagen n={d.n} r={d.r} a={[480, 960]} alt={alt} sizes={sizes} ancho={960} movil={movil ? { n: F[movil].n, r: F[movil].r } : undefined} />
    </div>
  );
}

/** El móvil que asoma por el borde: pantalla real dentro de un bisel limpio. */
function Movil({ alt, estilo }: { alt: string; estilo: React.CSSProperties }) {
  return (
    <div className="bn-peg bn-movil bn-par" style={estilo}>
      <div className="bn-movil-isla" aria-hidden="true" />
      <Imagen n={MOVIL_INICIO.n} r={MOVIL_INICIO.r} a={[390, 780]} alt={alt} sizes="(max-width: 700px) 60vw, 260px" ancho={780} />
    </div>
  );
}

/** El hueco de una foto: la foto si ya hay, o un tinte limpio. */
function Hueco({ clave, estilo, alt }: { clave: ClaveHueco; estilo?: React.CSSProperties; alt: string }) {
  const h = FOTOS_BENTO[clave];
  return (
    <div className={`bn-foto bn-foto-${clave}`} style={{ ...estilo, ['--ar-m' as string]: h.proporcion.movil }} data-hueco={clave} data-foto={h.foto ? 'puesta' : 'pendiente'}>
      {h.foto && (
        <FotoLanding foto={h.foto} mediaMovil="(max-width: 700px)" sizes={{ escritorio: '(max-width: 960px) 92vw, 340px', movil: '92vw' }} />
      )}
      {/* alt de reserva para cuando se suelte la foto: lo escribe el que la ponga junto a su registro */}
      <span hidden data-alt-pendiente={alt} />
    </div>
  );
}

/** Notificación al estilo de iOS: icono de app, título + línea y hora. Los textos son avisos que la app manda de verdad. */
function Aviso({ titulo, linea, hora = 'ahora', estilo, par = false }: { titulo: string; linea: string; hora?: string; estilo: React.CSSProperties; par?: boolean }) {
  return (
    <div className={`bn-peg bn-aviso${par ? ' bn-par' : ''}`} style={estilo} role="img" aria-label={`Aviso de ejemplo: ${titulo}. ${linea}`}>
      <span className="bn-squircle bn-aviso-icono" aria-hidden="true"><LogoTentare formato="isotipo" tinta="color" alto={22} decorativo /></span>
      <span className="bn-aviso-texto" aria-hidden="true"><b>{titulo}</b><span>{linea}</span></span>
      <time aria-hidden="true">{hora}</time>
    </div>
  );
}

/** Icono de app «squircle» (superelipse), con su etiqueta. Glifos genéricos, sin marcas de terceros. */
function Tile({ Icono, etiqueta, tono = 'oliva', estilo }: { Icono: typeof Mail; etiqueta?: string; tono?: 'oliva' | 'arena' | 'crema'; estilo?: React.CSSProperties }) {
  return (
    <div className={`bn-peg bn-tile-caja${etiqueta ? '' : ' bn-tile-sin'}`} style={estilo} aria-hidden="true">
      <span className={`bn-squircle bn-tile bn-tile-${tono}`}><Icono size={30} strokeWidth={1.8} /></span>
      {etiqueta && <span className="bn-tile-etiqueta">{etiqueta}</span>}
    </div>
  );
}

function Pildora({ iniciales, nombre, nota, estilo }: { iniciales: string; nombre: string; nota: string; estilo: React.CSSProperties }) {
  return (
    <div className="bn-peg bn-pildora" style={estilo} aria-hidden="true">
      <span className="bn-pildora-av">{iniciales}</span>
      <span className="bn-pildora-tx"><b>{nombre}</b><i>{nota}</i></span>
    </div>
  );
}

function Chips({ lista }: { lista: string[] }) {
  return <ul className="bn-chips">{lista.map((c) => <li key={c}>{c}</li>)}</ul>;
}

/** Encabezado de una tarjeta: el titular ES el enlace (anclas descriptivas para el SEO, sin una fila de «ver más»). */
function Cabeza({ id, href, titulo, texto, chips }: { id: string; href: string; titulo: string; texto: string; chips: string[] }) {
  return (
    <div className="bn-texto">
      <h3 id={id} className="bn-h3"><Link href={href}>{titulo}</Link></h3>
      <p className="bn-p">{texto}</p>
      <Chips lista={chips} />
    </div>
  );
}

const MAS: { href: string; label: string }[] = [
  { href: '/funcionalidades', label: 'Todas las funcionalidades' },
  { href: '/precios', label: 'Planes y precios' },
  { href: '/soluciones/estudio-de-pilates-reformer', label: 'Software para estudios de Pilates reformer' },
  { href: '/recursos', label: 'Guías para dueñas de estudios' },
  { href: '/comparativa', label: 'Comparativa de programas' },
  { href: '/glosario', label: 'Glosario de gestión de estudios' },
];

export function SeccionBento() {
  return (
    <section id="plataforma" className="bn" aria-labelledby="bn-h">
      {/* Superelipse de los iconos de app: una sola definición, sin dibujar nada. */}
      <svg width="0" height="0" aria-hidden="true" focusable="false" style={{ position: 'absolute' }}>
        <defs>
          <clipPath id="bn-squircle" clipPathUnits="objectBoundingBox">
            <path d="M0.5,0 C0.82,0 1,0.18 1,0.5 C1,0.82 0.82,1 0.5,1 C0.18,1 0,0.82 0,0.5 C0,0.18 0.18,0 0.5,0 Z" />
          </clipPath>
        </defs>
      </svg>

      <div className="bn-wrap">
        <header className="bn-head lp-rv">
          <h2 id="bn-h" className="bn-h2">Todo lo que necesita tu estudio de Pilates, en una sola plataforma.</h2>
          <p className="bn-lead">
            Reservas, app para tus alumnas, bonos y cobros. Un programa para centros de Pilates pensado para quien lleva el estudio, da clase y contesta mensajes a la vez.
          </p>
        </header>

        <div className="bn-rejilla">
          {/* 1 · Reservas y lista de espera */}
          <article className="bn-card bn-w7 bn-t1 lp-rv" aria-labelledby="bn-res-h">
            <Cabeza id="bn-res-h" href="/funcionalidades/reservas-online" titulo="Que tus alumnas llenen las clases solas"
              texto="Reservan desde el móvil, eligen su reformer y, si la clase está llena, entran en la lista de espera."
              chips={['Elige su reformer', 'Lista de espera', 'Reservas en tu web']} />
            <div className="bn-vis bn-vis-res">
              <Hueco clave="reservas" alt="Alumna haciendo Pilates en un reformer en un estudio luminoso" estilo={{ right: 0, top: 0, bottom: 0, width: '46%' }} />
              <Peg f="mapa" par alt="Fragmento de la app de la alumna: mapa de reformers de la sala con unos ocupados y el 4 elegido" estilo={{ ['--l' as string]: '10%', ['--b' as string]: '-30px', ['--w' as string]: '56%', ['--rot' as string]: '-1.6deg', ['--mw' as string]: '88%', ['--ma' as string]: 'flex-start' }} />
              <Peg f="llena" alt="Fragmento del calendario: clase de Reformer de las 9:00 completa, 8 de 8, con 2 alumnas en lista de espera" estilo={{ ['--l' as string]: '6%', ['--t' as string]: '18px', ['--w' as string]: '30%', ['--rot' as string]: '-2deg', ['--mw' as string]: '64%', ['--ma' as string]: 'flex-end' }} sizes="(max-width: 700px) 64vw, 200px" />
            </div>
          </article>

          {/* 2 · La app de la alumna */}
          <article className="bn-card bn-w5 bn-t2 lp-rv" style={{ ['--lp-r' as string]: 6 }} aria-labelledby="bn-app-h">
            <Cabeza id="bn-app-h" href="/funcionalidades/app-para-alumnas" titulo="Tu app, con el nombre de tu estudio"
              texto="Tus alumnas reservan, ven su bono y pagan sus recibos desde el móvil, y te escriben menos para preguntarlo."
              chips={['Tu logo y tus colores', 'Avisos en el móvil']} />
            <div className="bn-vis bn-vis-app">
              <Hueco clave="app" alt="Alumna sonriendo con el móvil en la mano tras la clase" estilo={{ inset: 0 }} />
              <Movil alt="Inicio de la app de una alumna: su próxima clase de hoy y accesos rápidos a clases, instructoras, su plan y favoritos" estilo={{ ['--l' as string]: '50%', ['--b' as string]: '-150px', ['--w' as string]: '52%', ['--mw' as string]: '58%', ['--ma' as string]: 'center' }} />
              <Aviso titulo="Recordatorio de clase" linea="Reformer Flow, hoy a las 19:00 · Sala Norte" estilo={{ ['--l' as string]: '6%', ['--t' as string]: '4px', ['--w' as string]: '88%', ['--mw' as string]: '100%' }} par />
              <Tile Icono={CalendarDays} tono="oliva" etiqueta="Estudio Alma" estilo={{ ['--l' as string]: '7%', ['--t' as string]: '170px', ['--mw' as string]: 'auto', ['--ma' as string]: 'flex-start' }} />
            </div>
          </article>

          {/* 3 · Bonos y cobros */}
          <article className="bn-card bn-w5 bn-t3 lp-rv" aria-labelledby="bn-cob-h">
            <Cabeza id="bn-cob-h" href="/funcionalidades/cobros-recurrentes" titulo="Cobra sin perseguir a nadie"
              texto="Bonos y cuotas con tarjeta o SEPA. Si un cobro falla, se reintenta a los 1, 3 y 7 días."
              chips={['Tarjeta y SEPA', 'Bizum en pagos sueltos', 'Facturas']} />
            <div className="bn-vis bn-vis-cob">
              <Peg f="pago" par alt="Fragmento de la app de la alumna: «Te queda por pagar 120 euros» con el botón Pagar 120 euros" estilo={{ ['--l' as string]: '6%', ['--t' as string]: '0px', ['--w' as string]: '68%', ['--rot' as string]: '-1.4deg', ['--mw' as string]: '90%', ['--ma' as string]: 'flex-start' }} />
              <Peg f="bono" alt="Fragmento de la app de la alumna: su bono de 10 clases con 6 sesiones disponibles" estilo={{ ['--rt' as string]: '-5%', ['--t' as string]: '150px', ['--w' as string]: '64%', ['--rot' as string]: '1.6deg', ['--mw' as string]: '88%', ['--ma' as string]: 'flex-end' }} />
              <Aviso titulo="Tu recibo vence pronto" linea="Bono 10 · 120 € · vence el 8 oct" hora="9:41" estilo={{ ['--l' as string]: '4%', ['--b' as string]: '14px', ['--w' as string]: '84%', ['--mw' as string]: '100%' }} par />
            </div>
          </article>

          {/* 4 · El calendario */}
          <article className="bn-card bn-w7 bn-t1 lp-rv" style={{ ['--lp-r' as string]: 6 }} aria-labelledby="bn-cal-h">
            <Cabeza id="bn-cal-h" href="/funcionalidades/calendario-y-salas" titulo="Tu semana, de un vistazo"
              texto="Clases, salas y ocupación en un solo calendario, sin Excel ni mensajes cruzados."
              chips={['Calendario por salas', 'Clases recurrentes', 'Pasar lista']} />
            <div className="bn-vis bn-vis-cal">
              <Peg f="semana" par alt="Fragmento del calendario semanal: las clases del martes y el miércoles con su ocupación" estilo={{ ['--rt' as string]: '-6%', ['--t' as string]: '20px', ['--w' as string]: '78%', ['--rot' as string]: '1deg', ['--mw' as string]: '96%', ['--ma' as string]: 'flex-end' }} sizes="(max-width: 700px) 96vw, 480px" />
              <Peg f="ocupacion" alt="Fragmento del calendario: 13 clases, 74 por ciento de ocupación y 3 por pasar lista" estilo={{ ['--l' as string]: '3%', ['--b' as string]: '40px', ['--w' as string]: '46%', ['--rot' as string]: '-1.8deg', ['--mw' as string]: '86%', ['--ma' as string]: 'flex-start' }} sizes="(max-width: 700px) 86vw, 330px" />
            </div>
          </article>

          {/* 5 · Centro de Control */}
          <article className="bn-card bn-w7 bn-t3 lp-rv" aria-labelledby="bn-cc-h">
            <Cabeza id="bn-cc-h" href="/funcionalidades/informes-y-rentabilidad" titulo="Cada mañana, una sola cosa que mirar"
              texto="El Centro de Control te propone lo que merece tu atención, con su porqué, y tú decides."
              chips={['Recomendaciones', 'Tú decides', 'Plan Estudio']} />
            <div className="bn-vis bn-vis-cc">
              <Peg f="reco" par alt="Fragmento del Centro de Control: recomendación para abrir una segunda clase de Reformer los martes a las 11:00, con su explicación" estilo={{ ['--l' as string]: '5%', ['--t' as string]: '10px', ['--w' as string]: '76%', ['--rot' as string]: '-1deg', ['--mw' as string]: '100%', ['--ma' as string]: 'flex-start' }} sizes="(max-width: 700px) 100vw, 540px" />
              <Peg f="botones" alt="Fragmento del Centro de Control: botones Hecho, Ya lo sé y Recuérdamelo" estilo={{ ['--l' as string]: '14%', ['--t' as string]: '124px', ['--w' as string]: '40%', ['--rot' as string]: '1.4deg', ['--mw' as string]: '72%', ['--ma' as string]: 'flex-start' }} sizes="(max-width: 700px) 72vw, 290px" />
              <Pildora iniciales="BO" nombre="Bea" nota="6 semanas sin venir" estilo={{ ['--rt' as string]: '5%', ['--b' as string]: '30px', ['--mw' as string]: 'auto', ['--ma' as string]: 'flex-end' }} />
            </div>
          </article>

          {/* 6 · Pregúntale a Tentare */}
          <article className="bn-card bn-w5 bn-t2 lp-rv" style={{ ['--lp-r' as string]: 6 }} aria-labelledby="bn-as-h">
            <Cabeza id="bn-as-h" href="/precios" titulo="Pregúntale a Tentare"
              texto="Consulta tus datos y prepara clases, salas, eventos y citas. Nada se crea sin tu confirmación."
              chips={['Consulta tus datos', 'Con tu confirmación']} />
            <div className="bn-vis bn-vis-as">
              <Peg f="peticion" par alt="Fragmento del chat: «Crea una clase de Reformer el miércoles a las 18:00»" estilo={{ ['--rt' as string]: '-3%', ['--t' as string]: '0px', ['--w' as string]: '78%', ['--rot' as string]: '1deg', ['--mw' as string]: '100%', ['--ma' as string]: 'flex-end' }} sizes="(max-width: 700px) 100vw, 400px" />
              <Peg f="confirmacion" alt="Fragmento del chat: tarjeta «Crear una clase» con los datos de la clase y los botones Confirmar, Cambiar algo y Cancelar" estilo={{ ['--l' as string]: '5%', ['--t' as string]: '70px', ['--w' as string]: '86%', ['--rot' as string]: '-1deg', ['--mw' as string]: '100%', ['--ma' as string]: 'flex-start' }} sizes="(max-width: 700px) 100vw, 440px" />
            </div>
          </article>

          {/* 7 · Equipo (las sustituciones, un chip) */}
          <article className="bn-card bn-w5 bn-t3 lp-rv" aria-labelledby="bn-eq-h">
            <Cabeza id="bn-eq-h" href="/funcionalidades/gestion-de-instructoras" titulo="Tu equipo, con su horario"
              texto="Cada instructora ve su agenda y marca su disponibilidad. Si una no puede dar su clase, tú das el visto bueno a la sustituta."
              chips={['Disponibilidad y ausencias', 'App de la instructora', 'Sustituciones con tu visto bueno']} />
            <div className="bn-vis bn-vis-eq">
              <Hueco clave="equipo" alt="Instructora y alumna charlando en la recepción de un estudio de Pilates" estilo={{ left: 0, right: 0, top: 0, height: '62%' }} />
              <Peg f="sustituta" alt="Fragmento del calendario: botón «Avisar a Irene Sanz» con la explicación de que se espera tu visto bueno" estilo={{ ['--l' as string]: '8%', ['--b' as string]: '-14px', ['--w' as string]: '58%', ['--rot' as string]: '-1.2deg', ['--mw' as string]: '78%', ['--ma' as string]: 'flex-start' }} sizes="(max-width: 700px) 78vw, 300px" />
            </div>
          </article>

          {/* 8 · Migración */}
          <article className="bn-card bn-w7 bn-t1 lp-rv" style={{ ['--lp-r' as string]: 6 }} aria-labelledby="bn-mig-h">
            <Cabeza id="bn-mig-h" href="/soluciones/cambiar-de-software" titulo="Cámbiate sin empezar de cero"
              texto="Trae tus alumnas y tus bonos desde Excel u otro programa. Ves los números y, si algo no cuadra, lo deshaces con un botón."
              chips={['Excel y otros programas', 'Botón para deshacer', 'Te ayudamos']} />
            <div className="bn-vis bn-vis-mig">
              <Peg f="acta" movil="actaMovil" par alt="Fragmento del acta de migración: bonos y membresías, 38 importadas y 0 que ya existían" estilo={{ ['--l' as string]: '5%', ['--t' as string]: '14px', ['--w' as string]: '72%', ['--rot' as string]: '-1deg', ['--mw' as string]: '100%', ['--ma' as string]: 'flex-start' }} sizes="(max-width: 700px) 100vw, 520px" />
              <Peg f="deshacer" alt="Fragmento del acta de migración: botón Deshacer migración" estilo={{ ['--l' as string]: '30%', ['--t' as string]: '124px', ['--w' as string]: '36%', ['--rot' as string]: '1.6deg', ['--mw' as string]: '64%', ['--ma' as string]: 'flex-start' }} sizes="(max-width: 700px) 64vw, 260px" />
              <Tile Icono={FileSpreadsheet} tono="arena" etiqueta="bonos.csv" estilo={{ ['--rt' as string]: '8%', ['--b' as string]: '28px', ['--mw' as string]: 'auto', ['--ma' as string]: 'flex-end' }} />
            </div>
          </article>
        </div>

        {/* Soporte y precio: una franja, no una tarjeta más */}
        <div className="bn-persona lp-rv">
          <div>
            <h3 className="bn-h3 bn-h3-grande">Una persona al otro lado, desde el primer día</h3>
            <p className="bn-p">Escribes por WhatsApp o por email y te responde alguien que conoce un estudio.</p>
            <div className="bn-persona-acc">
              <Link href={ALTA} className="bn-cta">Probar {TRIAL_DIAS} días gratis</Link>
              <Link href="/sobre-tentare" className="bn-salida lp-flecha">Quién está detrás de Tentare</Link>
            </div>
          </div>
          <div className="bn-persona-tiles" aria-hidden="true">
            <Tile Icono={MessageCircle} tono="oliva" etiqueta="Chat" estilo={{}} />
            <Tile Icono={Mail} tono="arena" etiqueta="Email" estilo={{}} />
          </div>
          <ul className="bn-datos">
            <li><b>{TRIAL_DIAS} días</b><span>gratis, sin tarjeta</span></li>
            <li><b>Sin permanencia</b><span>mes a mes</span></li>
            <li><b>Desde {PRECIO_DESDE}</b><span>al mes, con IVA</span></li>
          </ul>
        </div>

        <p className="bn-nota">Las pantallas son recortes del producto con datos de muestra.</p>

        <nav className="bn-mas-nav" aria-label="Seguir explorando Tentare">
          {MAS.map((l) => (
            <Link key={l.href} href={l.href} className="bn-salida lp-flecha">{l.label}</Link>
          ))}
        </nav>
      </div>

      <style>{`
        .bn { padding: clamp(64px,7vw,104px) clamp(20px,4vw,48px); --pad: clamp(26px,3vw,42px); }
        .bn-wrap { max-width: 1240px; margin: 0 auto; }
        .bn-head { max-width: 780px; margin: 0 auto clamp(32px,4vw,52px); text-align: center; }
        .bn-h2 { margin: 0 0 16px; font-size: clamp(28px,4vw,52px); font-weight: 800; line-height: 1.04; letter-spacing: -.04em; text-wrap: balance; color: #1F2216; }
        .bn-lead { margin: 0 auto; max-width: 56ch; font-size: clamp(16px,1.4vw,18px); line-height: 1.6; color: #5A5A52; text-wrap: pretty; }

        .bn-rejilla { display: grid; grid-template-columns: repeat(12,minmax(0,1fr)); gap: 16px; }
        .bn-w7 { grid-column: span 7; } .bn-w5 { grid-column: span 5; }

        /* Tarjetas: esquinas muy redondeadas, tinte suave de una sola familia, aire. */
        .bn-card { position: relative; display: flex; flex-direction: column; overflow: hidden; border-radius: 36px; padding: var(--pad) var(--pad) 0; min-height: 540px; }
        .bn-t1 { background: #E6EADA; } .bn-t2 { background: #F1E9D8; } .bn-t3 { background: #EEEFE4; }
        .bn-texto { position: relative; z-index: 3; }
        .bn-h3 { margin: 0 0 10px; font-size: clamp(24px,2.4vw,32px); font-weight: 800; line-height: 1.08; letter-spacing: -.035em; color: #1F2216; text-wrap: balance; }
        .bn-h3 a:hover { text-decoration: underline; text-decoration-thickness: 2px; text-underline-offset: 5px; }
        .bn-h3 a:focus-visible, .bn-salida:focus-visible, .bn-cta:focus-visible { outline: 2px solid #343825; outline-offset: 3px; border-radius: 6px; }
        .bn-p { margin: 0 0 14px; max-width: 42ch; font-size: 15.5px; line-height: 1.55; color: #55584A; text-wrap: pretty; }
        .bn-chips { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 7px; }
        .bn-chips li { padding: 5px 12px; border-radius: 999px; background: rgba(255,255,255,.62); border: 1px solid rgba(52,56,37,.1); font-size: 12px; font-weight: 600; color: #3B3F2C; }

        /* El visual ocupa todo el ancho de la tarjeta (sin el relleno) y por abajo se sale. */
        .bn-vis { position: relative; flex: 1; min-height: var(--vh, 340px); margin: 24px calc(-1 * var(--pad)) 0; }
        .bn-vis-res { --vh: 360px; } .bn-vis-app { --vh: 440px; } .bn-vis-cob { --vh: 470px; } .bn-vis-cal { --vh: 330px; }
        .bn-vis-cc { --vh: 290px; } .bn-vis-as { --vh: 380px; } .bn-vis-eq { --vh: 400px; } .bn-vis-mig { --vh: 290px; }

        /* Pegatina: un fragmento real, sombra larga y suave, un pelín girado. */
        .bn-peg { position: absolute; left: var(--l, auto); right: var(--rt, auto); top: var(--t, auto); bottom: var(--b, auto); width: var(--w, auto);
          rotate: var(--rot, 0deg); z-index: 2; border-radius: 18px; overflow: hidden; background: #fff;
          box-shadow: 0 44px 80px -34px rgba(34,37,26,.3), 0 10px 22px -10px rgba(34,37,26,.1); }
        .bn-peg img { display: block; width: 100%; height: auto; }
        .bn-foto { position: absolute; overflow: hidden; background: transparent; z-index: 1; }
        .bn-foto picture, .bn-foto img { display: block; width: 100%; height: 100%; }
        .bn-foto img { object-fit: cover; }
        .bn-foto-reservas { border-radius: 28px 0 0 0; }
        .bn-foto-equipo { border-radius: 0; }

        /* Móvil que asoma: bisel limpio y pantalla real. */
        .bn-movil { translate: -50% 0; padding: 22px 6px 6px; border-radius: 40px 40px 0 0; background: #1F2216; overflow: visible; aspect-ratio: auto; }
        .bn-movil img { border-radius: 33px 33px 0 0; }
        .bn-movil-isla { position: absolute; top: 7px; left: 50%; width: 26%; height: 9px; border-radius: 99px; background: #0E0F0A; transform: translateX(-50%); }

        /* Notificación al estilo de iOS: esquinas de 22, fondo translúcido con desenfoque, icono a la izquierda, hora a la derecha. */
        .bn-aviso { display: flex; align-items: center; gap: 11px; padding: 11px 14px 11px 11px; border-radius: 22px; background: rgba(255,255,255,.74);
          -webkit-backdrop-filter: blur(22px) saturate(1.6); backdrop-filter: blur(22px) saturate(1.6); border: 1px solid rgba(255,255,255,.7);
          font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", var(--font-ui), system-ui, sans-serif; }
        @supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) { .bn-aviso { background: #FBFAF5; } }
        .bn-aviso-icono { flex-shrink: 0; display: grid; place-items: center; width: 40px; height: 40px; background: #fff; filter: drop-shadow(0 1px 2px rgba(34,37,26,.18)); }
        .bn-aviso-icono svg { width: 24px; height: auto; }
        .bn-aviso-texto { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; line-height: 1.25; }
        .bn-aviso-texto b { font-size: 13.5px; font-weight: 600; color: #1A1A1A; }
        .bn-aviso-texto span { font-size: 13px; color: #3C3C43; }
        .bn-aviso time { align-self: flex-start; margin-top: 2px; font-size: 12px; color: #6B6B73; }

        /* Icono de app «squircle» (superelipse) con degradado sutil y glifo. La sombra va en la caja: clip-path la cortaría. */
        .bn-squircle { clip-path: url(#bn-squircle); }
        .bn-tile-caja { background: none; box-shadow: none; overflow: visible; display: flex; flex-direction: column; align-items: center; gap: 7px; font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", var(--font-ui), system-ui, sans-serif; }
        .bn-tile { display: grid; place-items: center; width: 68px; height: 68px; filter: drop-shadow(0 8px 14px rgba(34,37,26,.2)); color: #fff; }
        .bn-tile-oliva { background: linear-gradient(160deg,#6E7B55,#454E33); }
        .bn-tile-arena { background: linear-gradient(160deg,#EBD9B4,#D2B887); color: #2B2F1E; }
        .bn-tile-crema { background: linear-gradient(160deg,#FFFFFF,#E9E7DA); color: #343825; }
        .bn-tile-etiqueta { font-size: 12px; font-weight: 500; color: #3B3F2C; }

        /* Etiqueta con avatar de iniciales, como los chips con persona de las referencias de producto. */
        .bn-pildora { display: flex; align-items: center; gap: 9px; padding: 7px 14px 7px 7px; border-radius: 999px; background: #fff; }
        .bn-pildora-av { display: grid; place-items: center; width: 30px; height: 30px; border-radius: 99px; background: #D9C29E; color: #2B2F1E; font-size: 11.5px; font-weight: 800; }
        .bn-pildora-tx { display: flex; flex-direction: column; line-height: 1.2; font-size: 12.5px; color: #1F2216; }
        .bn-pildora-tx b { font-weight: 700; } .bn-pildora-tx i { font-style: normal; font-size: 11.5px; color: #8F6215; font-weight: 600; }

        /* Movimiento suave al hacer scroll: solo translate, sin «reducir movimiento» y con soporte. */
        @media (prefers-reduced-motion: no-preference) {
          @supports (animation-timeline: view()) {
            @keyframes bn-par { from { translate: 0 22px; } to { translate: 0 -12px; } }
            @keyframes bn-par-movil { from { translate: -50% 26px; } to { translate: -50% -10px; } }
            .bn-par { animation: bn-par linear both; animation-timeline: view(); animation-range: cover; }
            .bn-movil.bn-par { animation-name: bn-par-movil; }
          }
        }

        .bn-persona { display: grid; grid-template-columns: minmax(0,1.3fr) auto minmax(0,1fr); gap: clamp(24px,4vw,56px); align-items: center; margin-top: 16px; padding: clamp(30px,4vw,52px) clamp(26px,3.4vw,46px); border-radius: 36px; background: #E6EADA; }
        .bn-persona .bn-p { max-width: 44ch; }
        .bn-h3-grande { font-size: clamp(26px,3vw,38px); }
        .bn-persona-acc { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 26px; }
        .bn-persona-tiles { display: flex; gap: 22px; }
        .bn-persona-tiles .bn-peg { position: static; rotate: none; }
        .bn-cta { display: inline-flex; align-items: center; min-height: 48px; padding: 0 26px; border-radius: 999px; background: #343825; color: #D9C29E; font-weight: 800; font-size: 15.5px; }
        .bn-cta:hover { background: #22251A; }
        .bn-datos { list-style: none; margin: 0; padding: 0; display: grid; gap: 12px; }
        .bn-datos li { display: flex; align-items: baseline; gap: 12px; }
        .bn-datos b { font-size: clamp(20px,2.2vw,26px); font-weight: 800; letter-spacing: -.035em; color: #1F2216; white-space: nowrap; }
        .bn-datos span { font-size: 14px; color: #55584A; }

        .bn-nota { margin: 18px 0 0; text-align: center; font-size: 12.5px; color: #6B6B63; }
        .bn-mas-nav { display: flex; flex-wrap: wrap; justify-content: center; gap: 4px 28px; margin-top: 14px; padding-top: 14px; border-top: 1px solid #DEDED6; }
        .bn-salida { display: inline-flex; align-items: center; min-height: 44px; font-size: 14.5px; font-weight: 700; color: #343825; }
        .bn-salida:hover { text-decoration: underline; text-underline-offset: 4px; }

        @media (max-width: 960px) {
          .bn-w7, .bn-w5 { grid-column: span 12; }
          .bn-persona { grid-template-columns: minmax(0,1fr); }
          .bn-persona-tiles { justify-content: flex-start; }
        }

        /* Móvil: los fragmentos NO se encogen; se reordenan en columna, a un tamaño legible, escalonados y solapados. */
        @media (max-width: 700px) {
          .bn-card { border-radius: 28px; min-height: 0; padding-bottom: 28px; }
          .bn-vis { min-height: 0; margin: 22px 0 0; display: flex; flex-direction: column; gap: 0; }
          .bn-peg { position: relative; left: auto; right: auto; top: auto; bottom: auto; width: var(--mw, 100%); align-self: var(--ma, center); rotate: var(--rot, 0deg); margin-top: -10px; }
          .bn-vis > .bn-peg:first-child { margin-top: 0; }
          .bn-par, .bn-movil.bn-par { animation: none; }
          /* La foto, arriba y a todo lo ancho de la tarjeta; el resto se le solapa. */
          .bn-foto { position: relative !important; inset: auto !important; left: auto !important; right: auto !important; top: auto !important; bottom: auto !important; width: calc(100% + 2 * var(--pad)) !important; height: auto !important; margin: -22px calc(-1 * var(--pad)) 22px; aspect-ratio: var(--ar-m, 4 / 3); border-radius: 0 !important; order: -1; }
          .bn-foto[data-foto="pendiente"] { display: none; }
          .bn-movil { translate: none; align-self: center; margin-bottom: -150px; width: min(220px, 62%); }
          .bn-movil.bn-par { translate: none; }
          .bn-vis-app .bn-aviso { order: -1; margin-top: 0; }
          .bn-vis-app .bn-tile-caja { display: none; }
          .bn-vis-app { padding-bottom: 150px; overflow: hidden; margin-bottom: calc(-1 * var(--pad) - 28px); }
          .bn-vis-app .bn-movil { margin-top: 10px; }
          .bn-pildora { margin-top: 12px; }
          .bn-vis-eq { }
          .bn-tile-caja { margin-top: 14px; }
          .bn-persona-tiles .bn-peg { margin-top: 0; }
          .bn-datos b { white-space: normal; }
        }
      `}</style>
    </section>
  );
}
