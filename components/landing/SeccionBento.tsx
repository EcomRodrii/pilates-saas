import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { PLANS } from './data';
import { ALTA } from './enlaces';
import { FOTOS } from './fotos';
import { FotoLanding } from './FotoLanding';
import { TRIAL_DIAS } from '@/lib/billing/trial';
import { OFFSETS_REINTENTO_DIAS } from '@/lib/billing/dunning';

// «Todo lo que necesita un estudio, en una sola plataforma» — el producto, a la
// vista (encargo del fundador, 6-oct-2026; rehecha el mismo día tras ver la
// primera versión: «muy genérica, quiero capturas e imágenes reales»).
//
// DÓNDE VA y por qué: entre el calendario («y por la mañana, solo lo que
// necesita tu decisión») y «Detrás de Tentare hay personas». Hasta ahí la
// página cuenta la historia en profundidad; esto la resume con el producto de
// verdad justo antes de pedir confianza (personas, precio, dudas).
//
// QUÉ SON LAS IMÁGENES. Capturas REALES del panel y de la app de la alumna,
// hechas por e2e/landing-capturas.spec.ts con los andamiajes de e2e (datos de
// MUESTRA: nombres inventados, `@example.com`, un estudio ficticio con su color)
// y recortadas por scripts/capturas-landing.mjs. Nunca datos reales: el repo es
// público. Los marcos (ventana, iPhone), los anillos y los números son HTML/CSS
// encima de la captura; la captura no lleva nada dibujado. Las fotos son las
// de siempre de la home (components/landing/fotos.ts, con su crédito y licencia).
// Sin Tenti: la web comercial está vetada en lib/tenti/donde-vive-tenti.test.ts.
//
// Es un Server Component y el movimiento es CSS (`animation-timeline: view()`,
// solo `translate`): no entra JavaScript de esta sección en la home. Las
// imágenes van con <picture> AVIF+WebP ya generados, como el resto de la home
// (FotoLanding explica por qué no next/image: la cuota de transformaciones de
// Vercel), con width/height (CLS 0) y `loading="lazy"`.
//
// En móvil las ventanas del panel se ENCUADRAN a lo importante (`--z`, `--fx`,
// `--fy`): una captura de escritorio entera a 390 px no se lee. Los números y
// anillos van dentro del lienzo y se encuadran con la imagen.
//
// ⚠️ TODA frase de promesa de aquí está cruzada con el código (lista en el PR):
//   · el asistente CONSULTA y PROPONE clases, salas, eventos y citas; nada se
//     crea sin confirmar, y no cobra, borra, edita ni escribe a nadie;
//   · la sustitución espera tu visto bueno en el modo por defecto (asistido);
//     el autónomo es del plan Estudio; el Centro de Control, también;
//   · los reintentos de cobro son los de OFFSETS_REINTENTO_DIAS (1, 3 y 7 días);
//   · varias sedes, plan Cadena, sin vista que las sume;
//   · nada de cifras de clientas ni de «automático» donde hay visto bueno.
// Nada de lo congelado (Kiosko, VOD, Chat de equipo, Network).

const PRECIO_DESDE = PLANS[0].price.replace('€', ' €');

// Medidas de cada captura (ancho/alto del recorte) para width/height → CLS 0.
const CAP = {
  calendario: { n: 'calendario-sustitucion-visto-bueno-estudio-pilates', r: 622 / 960, a: [960, 1600] },
  control: { n: 'centro-de-control-recomendacion-del-dia', r: 377 / 960, a: [960, 1600] },
  cobros: { n: 'cobros-quien-me-debe-estudio-pilates', r: 327 / 960, a: [960, 1600] },
  asistente: { n: 'asistente-confirmar-clase-pregunta-a-tentare', r: 602 / 960, a: [960, 1600] },
  migracion: { n: 'migracion-acta-deshacer-importacion', r: 443 / 960, a: [960, 1600] },
  reformer: { n: 'app-alumna-elegir-reformer-estudio-pilates', r: 844 / 390, a: [390, 780] },
  inicio: { n: 'app-alumna-inicio-estudio-pilates', r: 844 / 390, a: [390, 780] },
  plan: { n: 'app-alumna-mi-plan-bono-pagar-recibo', r: 844 / 390, a: [390, 780] },
  recibos: { n: 'app-alumna-recibos-pagar', r: 844 / 390, a: [390, 780] },
} as const;
type Cap = keyof typeof CAP;

function Captura({ cap, alt, sizes }: { cap: Cap; alt: string; sizes: string }) {
  const { n, r, a } = CAP[cap];
  const mayor = a[1];
  const set = (f: 'avif' | 'webp') => a.map((w) => `/landing/capturas/${n}-${w}.${f} ${w}w`).join(', ');
  return (
    <picture>
      <source type="image/avif" srcSet={set('avif')} sizes={sizes} />
      <img
        src={`/landing/capturas/${n}-${a[0]}.webp`} srcSet={set('webp')} sizes={sizes}
        width={mayor} height={Math.round(mayor * r)} alt={alt} loading="lazy" decoding="async"
      />
    </picture>
  );
}

/** Un círculo y/o un número encima de la captura, en % del lienzo. */
interface Marca { n: number; x: number; y: number; w: number; h: number }

function Ventana({ cap, alt, marcas = [], z = 2, fx = 0, fy = 0, ar = 1, titulo, sizes = '(max-width: 700px) 620px, (max-width: 1100px) 90vw, 760px' }: {
  cap: Cap; alt: string; marcas?: Marca[]; z?: number; fx?: number; fy?: number; ar?: number; titulo?: string; sizes?: string;
}) {
  return (
    <div className="bn-ventana">
      <div className="bn-ventana-barra" aria-hidden="true"><i /><i /><i />{titulo && <span>{titulo}</span>}</div>
      <div className="bn-vista" style={{ ['--z' as string]: z, ['--fx' as string]: fx, ['--fy' as string]: fy, ['--ar' as string]: ar }}>
        <div className="bn-lienzo">
          <Captura cap={cap} alt={alt} sizes={sizes} />
          {marcas.map((m) => (
            <span key={m.n} className="bn-anillo" aria-hidden="true" style={{ left: `${m.x}%`, top: `${m.y}%`, width: `${m.w}%`, height: `${m.h}%` }}>
              <b>{m.n}</b>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function Iphone({ cap, alt, clase = '', sizes = '(max-width: 700px) 56vw, 230px' }: { cap: Cap; alt: string; clase?: string; sizes?: string }) {
  return (
    <div className={`bn-iphone ${clase}`}>
      <div className="bn-iphone-isla" aria-hidden="true" />
      <Captura cap={cap} alt={alt} sizes={sizes} />
    </div>
  );
}

function Chips({ lista }: { lista: string[] }) {
  return <ul className="bn-chips">{lista.map((c) => <li key={c}>{c}</li>)}</ul>;
}
function Mas({ href, label }: { href: string; label: string }) {
  return <Link href={href} className="bn-mas lp-flecha">{label} <ArrowRight size={14} aria-hidden /></Link>;
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
      <div className="bn-wrap">
        <header className="bn-head lp-rv">
          <h2 id="bn-h" className="bn-h2">Todo lo que necesita tu estudio de Pilates, en una sola plataforma.</h2>
          <p className="bn-lead">
            Reservas, app para tus alumnas, cobros, equipo y un asistente que conoce tus datos. Un programa para
            centros de Pilates pensado para quien lleva el estudio, da clase y contesta mensajes a la vez.
          </p>
        </header>

        <div className="bn-rejilla">
          {/* 1 · Sustituciones — la ventana grande, a sangre */}
          <article className="bn-card bn-w8 lp-rv" aria-labelledby="bn-sust-h">
            <div className="bn-texto">
              <h3 id="bn-sust-h" className="bn-h3">A las 16:42 una instructora cancela. A las 17:05 la clase tiene quien la dé.</h3>
              <p className="bn-p">
                Tentare propone a quién avisar según su disponibilidad y su costumbre horaria. Tú das el visto bueno
                con un toque, la candidata acepta y las alumnas siguen con su reserva. Si nadie acepta, te lo dice
                para que decidas tú.
              </p>
              <Chips lista={['Ranking de candidatas', 'Con tu visto bueno', 'Modo autónomo (plan Estudio)', 'Aviso si nadie acepta']} />
              <ol className="bn-leyenda">
                <li className="bn-solo-escritorio"><b>1</b> La clase queda marcada sin instructora, a la espera de tu visto bueno.</li>
                <li><b>2</b> Un toque para avisar a la candidata que mejor encaja.</li>
              </ol>
              <Mas href="/funcionalidades/sustituciones" label="Cómo funcionan las sustituciones" />
            </div>
            <div className="bn-sangre">
              <Ventana
                cap="calendario" titulo="Calendario"
                alt="Calendario semanal de un estudio de Pilates con una clase de Reformer sin instructora marcada como «Por aprobar» y, a la derecha, el botón para avisar a la sustituta propuesta"
                marcas={[{ n: 1, x: 18, y: 63.2, w: 10.6, h: 9.2 }, { n: 2, x: 65.5, y: 48.4, w: 28.7, h: 5.8 }]}
                z={2.6} fx={0.6} fy={0.17} ar={1}
              />
            </div>
          </article>

          {/* 2 · Reservas — foto + iPhone encima */}
          <article className="bn-card bn-w4 lp-rv" style={{ ['--lp-r' as string]: 6 }} aria-labelledby="bn-res-h">
            <div className="bn-texto">
              <h3 id="bn-res-h" className="bn-h3">Cada alumna elige su reformer</h3>
              <p className="bn-p">
                Desde el móvil ve el mapa de la sala, escoge su sitio y reserva con su bono. Si la clase se llena,
                entra en la lista de espera y la plaza que se libera pasa a la siguiente.
              </p>
              <Chips lista={['Elige su reformer', 'Lista de espera', 'Clase fija', 'Reservas en tu web']} />
              <Mas href="/funcionalidades/reservas-online" label="Cómo funcionan las reservas online" />
            </div>
            <div className="bn-escena bn-escena-foto">
              <div className="bn-foto" aria-hidden={false}>
                <FotoLanding foto={FOTOS.plazas} mediaMovil="(max-width: 700px)" sizes={{ escritorio: '(max-width: 960px) 90vw, 420px', movil: '90vw' }} />
              </div>
              <Iphone cap="reformer" clase="bn-par bn-iphone-centro" alt="App de la alumna: pantalla «Confirma tu plaza» con el mapa de reformers de la sala; unos están ocupados y ella ha elegido el 4" />
            </div>
          </article>

          {/* 3 · App de la alumna — dos iPhones escalonados */}
          <article className="bn-card bn-w5 lp-rv" aria-labelledby="bn-app-h">
            <div className="bn-texto">
              <h3 id="bn-app-h" className="bn-h3">Una app con el nombre de tu estudio, no con el nuestro</h3>
              <p className="bn-p">
                Tus alumnas la añaden a la pantalla de inicio del móvil. Ven sus clases, su bono y sus recibos, y
                reservan en un momento. Con tu nombre, tu logo y tus colores.
              </p>
              <Chips lista={['Tu logo y tus colores', 'Bono y recibos a mano', 'Avisos en el móvil']} />
              <Mas href="/funcionalidades/app-para-alumnas" label="Ver la app para alumnas" />
            </div>
            <div className="bn-escena bn-escena-dos">
              <Iphone cap="inicio" clase="bn-iphone-a" alt="Inicio de la app de una alumna de un estudio de Pilates: su próxima clase de hoy, accesos rápidos a clases, instructoras, su plan y favoritos" />
              <Iphone cap="plan" clase="bn-par bn-iphone-b" alt="Pantalla «Mi plan» de la app de la alumna: un pago pendiente con botón para pagar y su bono de 10 clases con 6 sesiones disponibles" />
            </div>
          </article>

          {/* 4 · Cobros — ventana + iPhone solapado */}
          <article className="bn-card bn-w7 lp-rv" style={{ ['--lp-r' as string]: 6 }} aria-labelledby="bn-cob-h">
            <div className="bn-texto">
              <h3 id="bn-cob-h" className="bn-h3">Si un cobro falla, se reintenta solo</h3>
              <p className="bn-p">
                Cobra cuotas y bonos con tarjeta o domiciliación SEPA. Si un cobro no pasa, Tentare lo reintenta
                a los {OFFSETS_REINTENTO_DIAS[0]}, {OFFSETS_REINTENTO_DIAS[1]} y {OFFSETS_REINTENTO_DIAS[2]} días de su vencimiento, y la alumna puede
                pagarlo desde su app. Cada cobro tiene su recibo y su factura.
              </p>
              <p className="bn-dato"><b>{OFFSETS_REINTENTO_DIAS.join(' · ')}</b><span>días tras el vencimiento: los tres intentos de cobro</span></p>
              <Chips lista={['Tarjeta y SEPA', 'Bizum en pagos sueltos', 'Facturas con numeración legal']} />
              <Mas href="/funcionalidades/cobros-recurrentes" label="Cómo funcionan los cobros recurrentes" />
            </div>
            <div className="bn-escena bn-escena-cobros">
              <div className="bn-cobros-ventana">
                <Ventana
                  cap="cobros" titulo="Cobros" z={1.9} fx={0.0} fy={0.0} ar={1.1}
                  alt="Pantalla de Cobros del panel: dos alumnas con un recibo de 89 euros que no se pudo cobrar, y el botón Cobrar en cada una"
                />
              </div>
              <Iphone cap="recibos" clase="bn-par bn-iphone-cobro" alt="App de la alumna: pantalla de Recibos con 120 euros por pagar y un botón negro «Pagar 120 euros»" />
            </div>
          </article>

          {/* 5 · Centro de Control */}
          <article className="bn-card bn-w7 lp-rv" aria-labelledby="bn-cc-h">
            <div className="bn-texto">
              <h3 id="bn-cc-h" className="bn-h3">Cada mañana, una sola cosa que mirar</h3>
              <p className="bn-p">
                El Centro de Control revisa tu estudio y te propone lo que merece tu atención —abrir una clase que
                se llena, recuperar a una alumna que lleva semanas sin venir— con su porqué. Tú decides: hecho, ya
                lo sé o recuérdamelo.
              </p>
              <p className="bn-dato"><b>1</b><span>aviso al día, como mucho, y solo si merece la pena</span></p>
              <Chips lista={['Recomendaciones con su porqué', 'Tú decides', 'Plan Estudio']} />
              <Mas href="/funcionalidades/informes-y-rentabilidad" label="Ver informes y rentabilidad" />
            </div>
            <div className="bn-sangre">
              <Ventana
                cap="control" titulo="Centro de Control" z={1.9} fx={0.0} fy={0.1} ar={1.55}
                alt="Centro de Control del panel: una recomendación para abrir una segunda clase de Reformer, con su explicación y los botones Hecho, Ya lo sé y Recuérdamelo"
                marcas={[{ n: 1, x: 1.9, y: 59, w: 27.4, h: 6.5 }]}
              />
            </div>
          </article>

          {/* 6 · Asistente — tarjeta oscura */}
          <article className="bn-card bn-w5 bn-oscura lp-rv" style={{ ['--lp-r' as string]: 6 }} aria-labelledby="bn-as-h">
            <div className="bn-texto">
              <h3 id="bn-as-h" className="bn-h3">Pregúntale a Tentare</h3>
              <p className="bn-p">
                Un asistente que responde con los datos de tu estudio —quién lleva semanas sin venir, qué clases
                tienen huecos— y prepara clases, salas, eventos y citas. Siempre te enseña lo que va a crear y espera
                tu confirmación. No cobra, no borra, no edita y no escribe a tus alumnas.
              </p>
              <Chips lista={['Consulta tus datos', 'Crea clases, salas, eventos y citas', 'Siempre con tu confirmación']} />
              <Mas href="/precios" label="Qué incluye cada plan" />
            </div>
            <div className="bn-sangre">
              <Ventana
                cap="asistente" titulo="Pregúntale a Tentare" z={2.0} fx={0.0} fy={0.22} ar={1}
                alt="Chat de «Pregúntale a Tentare»: una petición para crear una clase de Reformer y la tarjeta «Crear una clase» con sus datos y los botones Confirmar, Cambiar algo y Cancelar"
                marcas={[{ n: 1, x: 4.7, y: 77.2, w: 13, h: 10 }]}
              />
              <p className="bn-pie-oscuro"><b>1</b> No se crea nada hasta que pulsas Confirmar.</p>
            </div>
          </article>

          {/* 7 · Migración */}
          <article className="bn-card bn-w6 lp-rv" aria-labelledby="bn-mig-h">
            <div className="bn-texto">
              <h3 id="bn-mig-h" className="bn-h3">Cambiarte de programa, sin empezar de cero</h3>
              <p className="bn-p">
                Trae tus alumnas, tus bonos, tus reservas y tu horario desde Excel o desde el programa que usas
                ahora. Antes de dar nada por bueno ves los números, y si algo no te convence lo deshaces con un
                botón. Si lo prefieres, lo hacemos contigo.
              </p>
              <Chips lista={['Excel y otros programas', 'Acta con los números', 'Botón para deshacer', 'Te ayudamos']} />
              <Mas href="/soluciones/cambiar-de-software" label="Cómo es cambiarte a Tentare" />
            </div>
            <div className="bn-sangre">
              <Ventana
                cap="migracion" titulo="Traer mis datos" z={2.0} fx={0.5} fy={0.3} ar={1.9}
                alt="Acta de migración tras importar los bonos y membresías de un estudio: 38 importadas y 0 que ya existían, con los botones Deshacer migración y Hacer otra importación"
                marcas={[{ n: 1, x: 1.2, y: 75.6, w: 48.2, h: 12.6 }]}
              />
            </div>
          </article>

          {/* 8 · Equipo — foto */}
          <article className="bn-card bn-w6 lp-rv" style={{ ['--lp-r' as string]: 6 }} aria-labelledby="bn-eq-h">
            <div className="bn-texto">
              <h3 id="bn-eq-h" className="bn-h3">Tu equipo, cada una con su horario</h3>
              <p className="bn-p">
                Cada instructora ve su agenda, marca cuándo puede dar clase y cuándo no, y avisa de una baja con su
                motivo desde su app. Con varias sedes, un solo acceso y un selector de sede (plan Cadena).
              </p>
              <Chips lista={['Disponibilidad y ausencias', 'App de la instructora', 'Pasar lista', 'Varias sedes (plan Cadena)']} />
              <Mas href="/funcionalidades/gestion-de-instructoras" label="Ver la gestión de instructoras" />
            </div>
            <div className="bn-foto bn-foto-ancha">
              <FotoLanding foto={FOTOS.cierre} mediaMovil="(max-width: 700px)" sizes={{ escritorio: '(max-width: 960px) 90vw, 600px', movil: '90vw' }} />
            </div>
          </article>
        </div>

        {/* Una persona al otro lado: tipografía, no tarjeta */}
        <div className="bn-persona lp-rv">
          <div>
            <h3 className="bn-h3 bn-h3-grande">Una persona al otro lado, desde el primer día</h3>
            <p className="bn-p">
              Si algo no sale, escribes por WhatsApp o por email y te responde alguien que conoce un estudio. Pruebas
              sin tarjeta, pagas mes a mes y te vas cuando quieras.
            </p>
            <div className="bn-persona-acc">
              <Link href={ALTA} className="bn-cta">Probar {TRIAL_DIAS} días gratis</Link>
              <Mas href="/sobre-tentare" label="Quién está detrás de Tentare" />
            </div>
          </div>
          <ul className="bn-datos">
            <li><b>{TRIAL_DIAS} días</b><span>gratis, sin tarjeta</span></li>
            <li><b>Sin permanencia</b><span>mes a mes, te vas cuando quieras</span></li>
            <li><b>Desde {PRECIO_DESDE}</b><span>al mes, con IVA</span></li>
          </ul>
        </div>

        <p className="bn-nota">Las pantallas son capturas del producto con datos de muestra.</p>

        <nav className="bn-mas-nav" aria-label="Seguir explorando Tentare">
          {MAS.map((l) => (
            <Link key={l.href} href={l.href} className="bn-salida lp-flecha">{l.label} <ArrowRight size={14} aria-hidden /></Link>
          ))}
        </nav>
      </div>

      <style>{`
        .bn { padding: clamp(64px,7vw,104px) clamp(20px,4vw,48px); }
        .bn-wrap { max-width: 1240px; margin: 0 auto; }
        .bn-head { max-width: 780px; margin: 0 auto clamp(32px,4vw,52px); text-align: center; }
        .bn-h2 { margin: 0 0 16px; font-size: clamp(28px,4vw,52px); font-weight: 800; line-height: 1.04; letter-spacing: -.04em; text-wrap: balance; color: #1F2216; }
        .bn-lead { margin: 0 auto; max-width: 60ch; font-size: clamp(16px,1.4vw,18px); line-height: 1.6; color: #5A5A52; text-wrap: pretty; }

        .bn-rejilla { display: grid; grid-template-columns: repeat(12,minmax(0,1fr)); gap: 16px; }
        .bn-w8 { grid-column: span 8; } .bn-w7 { grid-column: span 7; } .bn-w6 { grid-column: span 6; } .bn-w5 { grid-column: span 5; } .bn-w4 { grid-column: span 4; }

        .bn-card { position: relative; display: flex; flex-direction: column; overflow: hidden; border-radius: 28px; background: #F8F7F2; border: 1px solid #E2E1D8; }
        .bn-oscura { background: #2B2F1E; border-color: #2B2F1E; color: #F1F2EA; }
        .bn-texto { padding: clamp(22px,2.6vw,34px) clamp(22px,2.6vw,34px) 0; position: relative; z-index: 1; }
        .bn-h3 { margin: 0 0 10px; font-size: clamp(21px,2vw,27px); font-weight: 800; line-height: 1.12; letter-spacing: -.03em; color: #1F2216; text-wrap: balance; }
        .bn-h3-grande { font-size: clamp(26px,3vw,38px); }
        .bn-p { margin: 0 0 16px; max-width: 56ch; font-size: 15px; line-height: 1.6; color: #5A5A52; text-wrap: pretty; }
        .bn-oscura .bn-h3 { color: #fff; } .bn-oscura .bn-p { color: #C9CCB8; }

        .bn-chips { list-style: none; margin: 0 0 14px; padding: 0; display: flex; flex-wrap: wrap; gap: 8px; }
        .bn-chips li { padding: 6px 12px; border-radius: 999px; background: #fff; border: 1px solid #E2E1D8; font-size: 12.5px; font-weight: 600; color: #3B3B34; }
        .bn-oscura .bn-chips li { background: rgba(255,255,255,.08); border-color: rgba(255,255,255,.16); color: #E8E9DC; }
        .bn-mas { display: inline-flex; align-items: center; gap: 6px; min-height: 44px; font-size: 14px; font-weight: 700; color: #343825; }
        .bn-oscura .bn-mas { color: #D9C29E; }
        .bn-mas:hover, .bn-salida:hover { text-decoration: underline; text-underline-offset: 4px; }
        .bn-mas:focus-visible, .bn-salida:focus-visible, .bn-cta:focus-visible { outline: 2px solid #343825; outline-offset: 3px; border-radius: 6px; }
        .bn-oscura .bn-mas:focus-visible { outline-color: #D9C29E; }

        .bn-dato { display: flex; align-items: baseline; gap: 14px; margin: 0 0 14px; }
        .bn-dato b { white-space: nowrap; font-size: clamp(30px,3vw,40px); font-weight: 800; letter-spacing: -.04em; color: #343825; font-variant-numeric: tabular-nums; }
        .bn-dato span { font-size: 13.5px; line-height: 1.35; color: #5A5A52; max-width: 22ch; }

        .bn-leyenda { list-style: none; margin: 0 0 6px; padding: 0; display: flex; flex-direction: column; gap: 6px; font-size: 13.5px; color: #3B3B34; }
        .bn-leyenda li { display: flex; gap: 10px; align-items: flex-start; }
        .bn-leyenda b, .bn-pie-oscuro b { flex-shrink: 0; display: inline-grid; place-items: center; width: 20px; height: 20px; border-radius: 99px; background: #343825; color: #D9C29E; font-size: 11.5px; }
        .bn-pie-oscuro { display: flex; gap: 10px; align-items: center; margin: 12px clamp(22px,2.6vw,34px) 0; font-size: 13px; color: #C9CCB8; }
        .bn-pie-oscuro b { background: #D9C29E; color: #2B2F1E; }

        /* Ventana de escritorio: barra discreta y sombra suave. A sangre (.bn-sangre) toca el borde de la tarjeta. */
        .bn-sangre { margin-top: auto; padding: 18px 0 0 clamp(22px,2.6vw,34px); }
        .bn-sangre .bn-ventana { border-radius: 16px 0 0 0; border-right: 0; border-bottom: 0; }
        .bn-oscura .bn-sangre { padding: 14px 0 0 clamp(22px,2.6vw,34px); }
        .bn-ventana { background: #fff; border: 1px solid rgba(52,56,37,.12); border-radius: 14px; overflow: hidden; box-shadow: 0 30px 60px -34px rgba(34,37,26,.5); }
        .bn-ventana-barra { display: flex; align-items: center; gap: 5px; height: 26px; padding: 0 12px; background: #F1F2EA; border-bottom: 1px solid rgba(52,56,37,.08); }
        .bn-ventana-barra i { width: 8px; height: 8px; border-radius: 99px; background: #D5D6C6; }
        .bn-ventana-barra span { margin-left: 10px; font-size: 11px; font-weight: 600; color: #6B6B63; }
        .bn-vista { position: relative; overflow: hidden; }
        .bn-lienzo { position: relative; }
        .bn-lienzo img, .bn-iphone img { display: block; width: 100%; height: auto; }
        .bn-anillo { position: absolute; border-radius: 12px; border: 2px solid #343825; box-shadow: 0 0 0 3px rgba(217,194,158,.85); pointer-events: none; }
        .bn-anillo b { position: absolute; top: -13px; left: -7px; display: grid; place-items: center; width: 22px; height: 22px; border-radius: 99px; background: #343825; color: #D9C29E; font-size: 12px; box-shadow: 0 0 0 2px #fff; }
        .bn-oscura .bn-anillo { border-color: #D9C29E; box-shadow: 0 0 0 3px rgba(217,194,158,.35); }

        /* iPhone: bisel de tinta, isla y pantalla redondeada. */
        .bn-iphone { position: relative; width: 230px; padding: 24px 7px 7px; border-radius: 36px; background: #1F2216; box-shadow: 0 40px 70px -30px rgba(34,37,26,.6), 0 0 0 1px rgba(255,255,255,.06) inset; }
        .bn-iphone img { border-radius: 29px; }
        .bn-iphone-isla { position: absolute; z-index: 2; top: 8px; left: 50%; width: 24%; height: 9px; border-radius: 99px; background: #1F2216; transform: translateX(-50%); }

        .bn-escena { position: relative; margin-top: auto; }
        /* 2 · reservas: foto y iPhone encima, recortado por abajo */
        .bn-escena-foto { height: clamp(300px,30vw,380px); margin-top: 18px; }
        .bn-foto { position: relative; overflow: hidden; background: #E4D8C2; }
        .bn-escena-foto .bn-foto { position: absolute; inset: 0; }
        .bn-foto picture, .bn-foto img { display: block; width: 100%; height: 100%; }
        .bn-foto img { object-fit: cover; }
        .bn-foto-ancha { flex: 1; min-height: 220px; margin-top: 8px; }
        .bn-iphone-centro { position: absolute; left: 50%; top: 34px; translate: -50% 0; width: min(210px, 62%); }
        /* 3 · app: dos teléfonos escalonados, recortados por abajo */
        .bn-escena-dos { display: flex; justify-content: center; align-items: flex-start; gap: 14px; height: clamp(330px,34vw,420px); margin-top: 18px; overflow: hidden; padding: 0 16px; }
        .bn-iphone-a { width: min(190px, 44%); margin-top: 34px; flex-shrink: 0; }
        .bn-iphone-b { width: min(190px, 44%); margin-top: 6px; flex-shrink: 0; }
        /* 4 · cobros: ventana con el iPhone solapado a la derecha */
        .bn-escena-cobros { margin-top: 18px; padding: 0 0 0 clamp(22px,2.6vw,34px); height: clamp(280px,28vw,340px); overflow: hidden; }
        .bn-cobros-ventana { width: 88%; }
        .bn-cobros-ventana .bn-ventana { border-radius: 16px 0 0 0; border-right: 0; }
        .bn-iphone-cobro { position: absolute; right: clamp(16px,3vw,34px); top: 56px; width: min(170px, 28%); }

        /* Movimiento suave al hacer scroll (translate, no transform: no choca con el reveal). Solo con soporte y sin «reducir movimiento». */
        @media (prefers-reduced-motion: no-preference) {
          @supports (animation-timeline: view()) {
            @keyframes bn-par { from { translate: 0 26px; } to { translate: 0 -14px; } }
            .bn-par { animation: bn-par linear both; animation-timeline: view(); animation-range: cover; }
            .bn-iphone-centro { translate: -50% 0; animation-name: bn-par-centro; }
            @keyframes bn-par-centro { from { translate: -50% 22px; } to { translate: -50% -10px; } }
          }
        }

        .bn-persona { display: grid; grid-template-columns: minmax(0,1.2fr) minmax(0,1fr); gap: clamp(24px,4vw,56px); align-items: center; margin-top: 16px; padding: clamp(28px,4vw,48px) clamp(22px,3vw,40px); border-radius: 28px; background: #EDEBDD; }
        .bn-persona .bn-p { max-width: 52ch; }
        .bn-persona-acc { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 26px; }
        .bn-cta { display: inline-flex; align-items: center; min-height: 48px; padding: 0 26px; border-radius: 999px; background: #343825; color: #D9C29E; font-weight: 800; font-size: 15.5px; }
        .bn-cta:hover { background: #22251A; }
        .bn-datos { list-style: none; margin: 0; padding: 0; display: grid; gap: 14px; }
        .bn-datos li { display: flex; align-items: baseline; gap: 14px; padding-bottom: 14px; border-bottom: 1px solid #D9D7C6; }
        .bn-datos li:last-child { border-bottom: 0; padding-bottom: 0; }
        .bn-datos b { font-size: clamp(22px,2.4vw,30px); font-weight: 800; letter-spacing: -.035em; color: #1F2216; white-space: nowrap; }
        .bn-datos span { font-size: 14px; color: #5A5A52; }

        .bn-nota { margin: 18px 0 0; text-align: center; font-size: 12.5px; color: #6B6B63; }
        .bn-mas-nav { display: flex; flex-wrap: wrap; justify-content: center; gap: 4px 28px; margin-top: 14px; padding-top: 14px; border-top: 1px solid #DEDED6; }
        .bn-salida { display: inline-flex; align-items: center; gap: 6px; min-height: 44px; font-size: 14.5px; font-weight: 700; color: #343825; }

        @media (max-width: 960px) {
          .bn-w8, .bn-w7, .bn-w6, .bn-w5, .bn-w4 { grid-column: span 12; }
          .bn-persona { grid-template-columns: minmax(0,1fr); }
        }

        /* Móvil: las ventanas del panel se ENCUADRAN a lo importante (z, fx, fy, ar de cada una). */
        @media (max-width: 700px) {
          .bn-card { border-radius: 22px; }
          .bn-vista { aspect-ratio: var(--ar); }
          .bn-lienzo { position: absolute; left: 0; top: 0; width: calc(var(--z) * 100%);
            transform: translate(calc(var(--fx) * -100%), calc(var(--fy) * -100%)); }
          .bn-sangre { padding-left: 18px; }
          .bn-escena-cobros { padding-left: 18px; height: 340px; }
          .bn-cobros-ventana { display: none; }
          .bn-iphone-cobro { position: relative; right: auto; top: auto; margin: 0 auto; width: min(220px, 62%); }
          .bn-iphone-centro { width: min(200px, 60%); }
          .bn-iphone-a, .bn-iphone-b { width: 46%; }
          .bn-escena-dos { gap: 10px; padding: 0 12px; }
          .bn-datos li { flex-direction: column; gap: 2px; }
          .bn-solo-escritorio { display: none !important; }
          .bn-escena-foto { height: 500px; }
        }
      `}</style>
    </section>
  );
}
