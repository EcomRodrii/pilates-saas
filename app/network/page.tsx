import type { Metadata } from 'next';
import Link from 'next/link';
import { LogoTentare } from '@/components/marca/logo-tentare';
import { NavLandingClon } from '@/components/network-v2/NavLandingClon';
import { Reveal } from '@/components/network-v2/Reveal';
import { NW_PRODUCTO, NW_PRODUCTO_OSCURO, NW_PRODUCTO_CLARO } from '@/components/network-v2/tokens';

// Clon literal del mockup de Claude Design "UI mockups for landing page"
// (2026-08-30) — pedido explícito del fundador: "EXACTAMENTE EL MISMO
// DISEÑO", confirmado en una pregunta de alcance a incluir también las
// secciones de Estudio (Automatiza/Widget/App), aunque hablen del producto
// de gestión y no del marketplace de instructoras.
//
// Segunda pasada (2026-08-30, mismo día): feedback directo tras ver el
// clon en móvil — "se ve cortada", "los botones de arriba no funcionan",
// "no hay contenido explicativo... sobre network", "no es responsive".
// Cuatro arreglos reales, no cosméticos:
// 1. `overflow-x: clip` en <body> (app/globals.css) — un elemento
//    decorativo que se salía unos px de su contenedor abría scroll
//    horizontal en TODA la página.
// 2. Nav con menú móvil de verdad (NavLandingClon.tsx) — los tres enlaces
//    estaban `hidden sm:flex` SIN alternativa: en móvil no había nada que
//    tocar, literalmente. `scroll-mt-16` en cada sección ancla compensa la
//    nav sticky (64px) para que el salto no la tape.
// 3. Móviles del hero con marco real (MovilMock, abajo) en vez de tarjetas
//    planas sin bisel — y tamaños base más pequeños para caber en 375px.
// 4. Cuatro secciones nuevas de contenido real sobre NETWORK (el mockup
//    solo traía una franja-teaser): Cómo funciona, Confianza, Casos de
//    uso y FAQ — copy recuperado de la versión anterior de esta página
//    (git f8c14a8a~1), reescrito sobre el sistema visual del clon.
//
// Colores en hex literal del propio mockup, no vía los tokens NW_* de
// siempre — la mayoría no coincide exactamente con ningún token existente
// y forzar el encaje habría sido justo la clase de aproximación que
// "exactamente" pedía evitar. NW_PRODUCTO/_OSCURO/_CLARO sí son el mismo
// verde citado por variable (PR #1480), así que esos tres se reutilizan.
//
// Fotos: el mockup referencia imágenes subidas a su propio canvas (uuids
// sin URL pública). Sustituidas por fotografía real ya existente en este
// repo (public/disciplinas, public/por-defecto).

const INK = '#14140F';
const PAPEL = '#FAF9F5';
const OSCURO = '#0F0F0C';
const HERO_BG = '#1A1A16';
const MUTED = '#4A4A42';
const MUTED_2 = '#7E7A6E';
const BORDE = '#E5E3DA';
const GRIS_VERDOSO = '#98A093';
const SAGE = '#F1F2EA';
const MONO = "'IBM Plex Mono', ui-monospace, monospace";

export const metadata: Metadata = {
  title: 'Tentare Network — Encuentra tu instructora de Pilates y Yoga',
  description: 'La red profesional de instructoras de Pilates y Yoga. Estudios buscan por especialidad, ciudad y disponibilidad, y contactan directamente.',
  openGraph: {
    type: 'website',
    title: 'Tentare Network — Red de instructoras de Pilates y Yoga',
    description: 'La red profesional donde estudios buscan instructoras y viceversa.',
    images: [{ url: '/network/opengraph-image' }],
  },
};

const PASOS_INSTRUCTORA = [
  { n: '01', titulo: 'Crea tu perfil', desc: 'Experiencia, formación, especialidades, ciudad y disponibilidad. Unos minutos, no una hoja de cálculo.' },
  { n: '02', titulo: 'Hazte visible', desc: 'Los estudios pueden encontrarte cuando buscan justo tu especialidad, o compartir tu perfil como tu CV online.' },
  { n: '03', titulo: 'Conecta', desc: 'Si hay interés, respondes tú directamente. Verificamos el email de cada perfil antes de publicarlo.' },
] as const;

const PASOS_ESTUDIO = [
  { n: '01', titulo: 'Cuéntanos qué necesitas', desc: 'Especialidad, ciudad, tipo de colaboración — una sustitución puntual o algo fijo.' },
  { n: '02', titulo: 'Buscamos por ti', desc: 'Cruzamos tu petición contra la red de instructoras, no solo el directorio público — también las que ya trabajan en estudios Tentare.' },
  { n: '03', titulo: 'Te presentamos candidatas', desc: 'Hablas directamente con quien encaje. Sin comisión, sin intermediarios de por medio.' },
] as const;

const CONFIANZA_ITEMS = [
  { titulo: 'Sin intermediarios', texto: 'Instructora y estudio habláis directamente — Tentare no se queda en medio ni cobra comisión.' },
  { titulo: 'Email verificado', texto: 'Todo perfil confirma su email antes de publicarse.' },
  { titulo: 'Experiencia confirmada', texto: 'Puedes pedir que un estudio que ya usa Tentare confirme que trabajaste ahí — se marca como verificada en tu perfil.' },
  { titulo: 'Actividad reciente', texto: 'Se nota si sigues buscando o si tu perfil lleva meses parado.' },
] as const;

const CASOS_USO = [
  { titulo: 'Necesitas una sustitución', texto: 'Un estudio se queda sin quien dé la clase de mañana y busca una instructora disponible en su zona.' },
  { titulo: 'Buscas nuevas oportunidades', texto: 'Terminaste una certificación de Reformer y quieres que los estudios que buscan ese perfil te encuentren.' },
  { titulo: 'Quieres incorporar una especialidad', texto: 'Tu estudio quiere ofrecer Yoga prenatal y hoy no tenéis a nadie formada en eso.' },
] as const;

const FAQ_ITEMS = [
  { q: '¿Cuesta dinero crear mi perfil?', a: 'No. Publicar tu perfil en Tentare Network es gratis y sin comisión sobre lo que cobres a los estudios. Durante la beta no hay ningún plan de pago activo; si eso cambia alguna vez, te avisaremos antes de aplicar cualquier condición nueva a tu cuenta.' },
  { q: '¿Tengo que dejar mi trabajo actual?', a: 'No. Puedes marcarte como "disponible para sustituciones" aunque ya trabajes en otro estudio, o "buscando trabajo" si es lo que necesitas ahora mismo. Cambias el estado cuando quieras.' },
  { q: '¿Quién ve mi teléfono y mi email?', a: 'Nadie, hasta que tú aceptas una solicitud de contacto de un estudio. Antes de eso, solo ven tu perfil público: especialidad, experiencia, disponibilidad y tarifa orientativa.' },
  { q: '¿Cómo saben los estudios que mi experiencia es real?', a: 'Puedes pedir que un estudio donde trabajaste, si usa Tentare, confirme esa experiencia desde su propia cuenta — se marca como verificada en tu perfil, no es algo que rellenes tú misma.' },
  { q: '¿Puedo ocultar mi perfil si dejo de buscar?', a: 'Sí, en cualquier momento, sin perder los datos que ya rellenaste. Vuelves a publicarlo cuando quieras.' },
  { q: '¿Qué significa que Tentare Network está en beta?', a: 'Que acabamos de abrir la red y estamos incorporando a las primeras instructoras y estudios. Entrar ahora significa formar parte desde el principio, no llegar tarde a algo ya lleno.' },
  { q: '¿En qué ciudades está disponible?', a: 'Empezamos con las primeras instructoras en Barcelona y Madrid, y vamos a sumar más ciudades según se una gente.' },
  { q: '¿Cómo elimino mi cuenta o mi perfil?', a: 'Escríbenos a hola@tentare.app y lo borramos. Mientras tanto puedes ocultar tu perfil tú misma desde "Mi perfil" cuando quieras, sin perder tus datos.' },
] as const;

/** Titular en curvas con el trazo del acento — misma técnica que el mockup: `<text>` con `fill` = fondo de la sección (se camufla) y `stroke` = acento, `paint-order="stroke"`. */
function TituloTrazado({
  texto, viewBox, fontSize, fondo, className = '',
}: {
  texto: string; viewBox: string; fontSize: number; fondo: string; className?: string;
}) {
  const [, , w, h] = viewBox.split(' ').map(Number);
  return (
    <svg aria-hidden="true" viewBox={viewBox} className={className} style={{ display: 'block', overflow: 'visible' }}>
      <text
        x={w / 2} y={h * 0.82} textAnchor="middle"
        fontFamily="'Plus Jakarta Sans', system-ui, sans-serif"
        fontSize={fontSize} fontStyle="italic" fontWeight={800}
        paintOrder="stroke"
        fill={fondo}
        stroke={NW_PRODUCTO}
        strokeWidth={fontSize / 46}
        strokeLinejoin="round"
        strokeLinecap="round"
      >
        {texto}
      </text>
    </svg>
  );
}

function AppScreen({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ height: '100%', background: PAPEL, padding: '46px 14px 0', boxSizing: 'border-box', fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif", color: INK, overflow: 'hidden' }}>
      {children}
    </div>
  );
}

/** Marco de móvil real (bisel + dynamic island) — sustituye al componente
    "IOSDevice" del mockup, que no existe en este stack. Sin esto eran
    tarjetas blancas planas sin bisel, la razón concreta del feedback "los
    móviles no son los diseños y están mal". */
function MovilMock({
  className = '', style, children,
}: { className?: string; style?: React.CSSProperties; children: React.ReactNode }) {
  return (
    <div
      className={className}
      style={{ ...style, background: INK, borderRadius: 30, padding: 8, boxSizing: 'border-box' }}
    >
      <div className="relative w-full h-full overflow-hidden" style={{ borderRadius: 22 }}>
        <span aria-hidden="true" className="absolute left-1/2 top-2 -translate-x-1/2 rounded-full" style={{ width: 46, height: 14, background: INK, zIndex: 1 }} />
        {children}
      </div>
    </div>
  );
}

function FaqItem({ q, a }: { q: string; a: string }) {
  return (
    <details className="group py-4" style={{ borderBottom: `1px solid ${BORDE}` }}>
      <summary className="flex items-center justify-between gap-4 cursor-pointer list-none text-[15px] font-extrabold">
        {q}
        <span aria-hidden="true" className="shrink-0 text-[20px] font-normal transition-transform group-open:rotate-45" style={{ color: NW_PRODUCTO }}>+</span>
      </summary>
      <p className="mt-2.5 text-[14px] leading-[1.65]" style={{ color: MUTED }}>{a}</p>
    </details>
  );
}

export default function NetworkLandingPage() {
  return (
    <div style={{ background: PAPEL, color: INK, fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}>
      <NavLandingClon />

      {/* Hero */}
      <header className="relative z-[5]" style={{ background: HERO_BG }}>
        <div aria-hidden="true" className="absolute inset-0 overflow-hidden">
          <span className="absolute -inset-y-[12%] inset-x-0" style={{ backgroundImage: 'url(/disciplinas/pilates.jpg)', backgroundSize: 'cover', backgroundPosition: 'center 30%', filter: 'grayscale(1)', opacity: 0.5 }} />
          <span className="absolute inset-0" style={{ background: 'linear-gradient(90deg, rgba(15,15,12,.92) 0%, rgba(15,15,12,.55) 55%, rgba(15,15,12,.3))' }} />
          <div className="absolute inset-0">
            <span className="absolute -top-[18%] right-[6%] w-[120px] h-[150%]" style={{ background: NW_PRODUCTO, opacity: 0.85, transform: 'skewX(-24deg)' }} />
            <span className="absolute -top-[18%] -right-[4%] w-16 h-[150%]" style={{ background: NW_PRODUCTO, opacity: 0.5, transform: 'skewX(-24deg)' }} />
          </div>
        </div>

        <div className="relative z-[2] max-w-[1340px] mx-auto px-[clamp(18px,3.5vw,48px)] pt-[clamp(48px,10vh,120px)]">
          <h1 className="m-0 italic font-extrabold uppercase leading-[.96] tracking-[-.02em] text-[clamp(38px,7.2vw,108px)]">
            <span className="nw-fade-up block" style={{ color: NW_PRODUCTO }}>Tu estudio,</span>
            <TituloTrazado texto="A OTRO NIVEL" viewBox="0 0 980 128" fontSize={118} fondo={HERO_BG} className="nw-fade-up w-full max-w-[900px] mt-1" />
          </h1>
          <p className="nw-fade-up mt-[26px] italic font-semibold text-[clamp(16px,1.8vw,24px)]" style={{ color: NW_PRODUCTO }}>Pilates y Yoga · reservas, pagos, equipo y alumnas</p>
          <div className="nw-fade-up flex flex-wrap gap-4 mt-[30px]">
            <Link href="/crear-estudio" className="px-[30px] py-[15px] rounded-xl text-[15.5px] font-extrabold" style={{ background: NW_PRODUCTO, color: PAPEL }}>Empieza gratis</Link>
            <a href="#estudio" className="px-[26px] py-[15px] rounded-xl text-[15.5px] font-extrabold" style={{ color: PAPEL, boxShadow: 'inset 0 0 0 2px rgba(250,249,245,.5)' }}>Ver cómo funciona</a>
          </div>

          <div className="nw-fade-up max-w-[660px] mt-[26px]">
            <div className="flex flex-wrap items-stretch gap-3.5 rounded-[22px] p-3 sm:py-3 sm:pr-3 sm:pl-[26px]" style={{ background: PAPEL, boxShadow: '0 24px 60px -24px rgba(0,0,0,.5)' }}>
              <div className="flex-1 min-w-[130px] flex flex-col justify-center py-1.5 px-2 sm:px-0">
                <span className="text-[10px] uppercase tracking-[.14em] font-medium" style={{ fontFamily: MONO, color: GRIS_VERDOSO }}>¿Qué buscas?</span>
                <span className="mt-[3px] text-[17px] font-semibold" style={{ color: MUTED_2 }}>Reformer</span>
              </div>
              <span aria-hidden="true" className="w-px my-1 hidden xs:block" style={{ background: BORDE }} />
              <div className="flex-1 min-w-[130px] flex flex-col justify-center py-1.5 px-2 sm:px-0">
                <span className="text-[10px] uppercase tracking-[.14em] font-medium" style={{ fontFamily: MONO, color: GRIS_VERDOSO }}>¿Dónde?</span>
                <span className="mt-[3px] text-[17px] font-semibold" style={{ color: MUTED_2 }}>Barcelona</span>
              </div>
              <Link href="/network/instructoras" className="w-full sm:w-auto shrink-0 self-center text-center rounded-full px-7 py-[17px] text-[15.5px] font-extrabold whitespace-nowrap" style={{ background: INK, color: PAPEL }}>Buscar instructoras</Link>
            </div>
            <p className="mt-3.5 ml-1 text-[14px]" style={{ color: 'rgba(250,249,245,.75)' }}>
              Populares:{' '}
              <Link href="/network/instructoras?especialidad=reformer" className="font-extrabold" style={{ color: PAPEL }}>Reformer</Link>
              <span style={{ color: 'rgba(250,249,245,.4)' }}> · </span>
              <Link href="/network/instructoras?especialidad=prenatal" className="font-extrabold" style={{ color: PAPEL }}>Prenatal</Link>
              <span style={{ color: 'rgba(250,249,245,.4)' }}> · </span>
              <Link href="/network" className="font-extrabold" style={{ color: PAPEL }}>Sustituciones</Link>
            </p>
            <p className="flex items-center gap-2 mt-2.5 ml-1 text-[13.5px]" style={{ color: 'rgba(250,249,245,.65)' }}>
              <span aria-hidden="true" className="nw-pulse-dot w-[7px] h-[7px] rounded-full" style={{ background: NW_PRODUCTO }} />
              Beta · empezando en Barcelona y Madrid
            </p>
          </div>

          {/* Móviles flotando — ver MovilMock arriba sobre la sustitución de IOSDevice. */}
          <div className="relative flex justify-center items-end gap-2.5 xs:gap-3.5 sm:gap-[clamp(14px,3vw,40px)] mt-[clamp(36px,7vh,84px)] mb-[-70px] sm:mb-[-170px]">
            <MovilMock className="nw-float-a w-[92px] xs:w-[112px] sm:w-[195px] h-[200px] xs:h-[243px] sm:h-[422px]" style={{ filter: 'drop-shadow(0 34px 60px rgba(0,0,0,.55))' }}>
              <AppScreen>
                <p className="m-0 text-[9px] xs:text-[11px] sm:text-[13px] font-semibold" style={{ color: '#5A5A52' }}>Buenas tardes, Laura</p>
                <h3 className="m-0 mb-2 mt-0.5 text-[13px] xs:text-[16px] sm:text-[24px] font-extrabold tracking-[-.03em] leading-tight">¿Qué te apetece hoy?</h3>
                <p className="m-0 flex items-center gap-1.5 rounded-full px-2.5 py-2 sm:px-4 sm:py-3.5 text-[8px] xs:text-[9.5px] sm:text-[13.5px] font-semibold" style={{ background: '#fff', border: `1px solid ${BORDE}`, color: GRIS_VERDOSO }}>Buscar clases o instructoras</p>
                <p className="mt-2.5 mb-1.5 text-[9.5px] xs:text-[11px] sm:text-[16px] font-extrabold">Explora</p>
                <div className="grid grid-cols-2 gap-1.5 sm:gap-2.5">
                  <span className="block h-[46px] xs:h-[58px] sm:h-[120px] rounded-lg sm:rounded-2xl" style={{ backgroundImage: 'url(/por-defecto/clase-reformer.webp)', backgroundSize: 'cover', backgroundPosition: 'center' }} />
                  <span className="block h-[46px] xs:h-[58px] sm:h-[120px] rounded-lg sm:rounded-2xl" style={{ backgroundImage: 'url(/por-defecto/clase-yoga.webp)', backgroundSize: 'cover', backgroundPosition: 'center' }} />
                </div>
              </AppScreen>
            </MovilMock>
            <MovilMock className="nw-float-b w-[102px] xs:w-[126px] sm:w-[218px] h-[225px] xs:h-[273px] sm:h-[473px] z-[2]" style={{ filter: 'drop-shadow(0 44px 70px rgba(0,0,0,.62))' }}>
              <AppScreen>
                <h3 className="m-0 mb-2 text-[13px] xs:text-[16px] sm:text-[24px] font-extrabold tracking-[-.03em]">Horario · <span style={{ color: NW_PRODUCTO_OSCURO }}>hoy</span></h3>
                <div className="flex gap-1 mb-2">
                  <span className="rounded-lg sm:rounded-xl px-2 sm:px-[15px] py-1 sm:py-2 text-[8px] xs:text-[9.5px] sm:text-[12.5px] font-extrabold" style={{ background: INK, color: PAPEL }}>Hoy</span>
                  <span className="rounded-lg sm:rounded-xl px-2 sm:px-[15px] py-1 sm:py-2 text-[8px] xs:text-[9.5px] sm:text-[12.5px] font-bold" style={{ border: `1px solid ${BORDE}`, color: MUTED_2 }}>Mañana</span>
                </div>
                <div className="flex flex-col gap-1.5 sm:gap-2.5">
                  <div className="flex gap-1.5 sm:gap-2.5 items-center rounded-lg sm:rounded-2xl px-2 sm:px-3.5 py-2 sm:py-3.5" style={{ background: '#fff', border: `1px solid ${BORDE}` }}>
                    <span className="text-[8px] xs:text-[10px] sm:text-[14px]" style={{ fontFamily: MONO }}>9:00</span>
                    <span className="flex-1 text-[8px] xs:text-[10px] sm:text-[14px] font-extrabold truncate">Reformer Despertar</span>
                    <span className="text-[7px] xs:text-[8px] sm:text-[11px] font-extrabold whitespace-nowrap" style={{ color: NW_PRODUCTO_OSCURO }}>5 plazas</span>
                  </div>
                  <div className="flex gap-1.5 sm:gap-2.5 items-center rounded-lg sm:rounded-2xl px-2 sm:px-3.5 py-2 sm:py-3.5" style={{ background: INK, color: '#fff' }}>
                    <span className="text-[8px] xs:text-[10px] sm:text-[14px]" style={{ fontFamily: MONO }}>19:30</span>
                    <span className="flex-1 text-[8px] xs:text-[10px] sm:text-[14px] font-extrabold truncate">Reformer Intenso</span>
                    <span className="text-[7px] xs:text-[8px] sm:text-[11px] font-extrabold whitespace-nowrap" style={{ color: '#F3C46A' }}>quedan 2</span>
                  </div>
                  <span className="text-center rounded-full py-2 sm:py-3.5 text-[9px] xs:text-[11px] sm:text-[15px] font-extrabold" style={{ background: NW_PRODUCTO, color: '#fff' }}>Reservar</span>
                </div>
              </AppScreen>
            </MovilMock>
            <MovilMock className="nw-float-c w-[92px] xs:w-[112px] sm:w-[195px] h-[200px] xs:h-[243px] sm:h-[422px]" style={{ filter: 'drop-shadow(0 34px 60px rgba(0,0,0,.55))' }}>
              <AppScreen>
                <span className="block h-[56px] xs:h-[70px] sm:h-[140px] rounded-lg sm:rounded-2xl" style={{ background: `linear-gradient(135deg, ${NW_PRODUCTO}, ${NW_PRODUCTO_OSCURO})` }} />
                <p className="mt-2 text-[11px] xs:text-[13px] sm:text-[21px] font-extrabold tracking-[-.02em]">Marta G. <span className="text-[8px] xs:text-[9px] sm:text-[14px]" style={{ color: '#C99A3C' }}>★ 4,9</span></p>
                <p className="mt-[2px] text-[7.5px] xs:text-[9px] sm:text-[13px]" style={{ color: GRIS_VERDOSO }}>Reformer · Gràcia</p>
                <div className="flex gap-1 mt-2 flex-wrap">
                  <span className="rounded-full px-1.5 sm:px-3 py-0.5 sm:py-1.5 text-[6.5px] xs:text-[8px] sm:text-[11.5px] font-bold" style={{ background: SAGE }}>Sustituciones</span>
                </div>
                <div className="flex gap-1 sm:gap-2 mt-2 sm:mt-3.5">
                  <span className="flex-1 text-center rounded-full py-1 sm:py-3 text-[7px] xs:text-[8.5px] sm:text-[13px] font-extrabold" style={{ border: `1.5px solid ${INK}` }}>Ver perfil</span>
                  <span className="flex-1 text-center rounded-full py-1 sm:py-3 text-[7px] xs:text-[8.5px] sm:text-[13px] font-extrabold" style={{ background: INK, color: PAPEL }}>Contactar</span>
                </div>
              </AppScreen>
            </MovilMock>
          </div>
        </div>
      </header>

      {/* Studio */}
      <section id="estudio" className="scroll-mt-16 overflow-hidden pt-[100px] sm:pt-[210px] px-[clamp(18px,3.5vw,48px)]" style={{ background: PAPEL }}>
        <div className="max-w-[1340px] mx-auto">
          <div className="flex flex-wrap gap-[clamp(26px,4vw,70px)] items-start">
            <Reveal className="flex-1 min-w-[280px]">
              <h2 className="m-0 font-extrabold leading-[1.04] tracking-[-.035em] text-[clamp(30px,4.4vw,62px)]">Todo tu estudio.<br />En un solo lugar.</h2>
            </Reveal>
            <Reveal delayMs={120} className="flex-1 min-w-[280px] max-w-[560px]">
              <p className="mt-1.5 text-[clamp(15px,1.4vw,18px)] leading-[1.65]" style={{ color: MUTED }}>Horario, reservas, bonos, pagos e instructoras — sin hojas de cálculo ni WhatsApp. Tú abres Tentare por la mañana y ya sabes qué pasa hoy en tu estudio.</p>
              <div className="flex flex-wrap gap-[22px] mt-[22px]">
                <p className="m-0 text-[13.5px] font-extrabold">Reservas <span className="block text-[12px] font-semibold" style={{ color: MUTED_2 }}>con lista de espera</span></p>
                <p className="m-0 text-[13.5px] font-extrabold">Pagos <span className="block text-[12px] font-semibold" style={{ color: MUTED_2 }}>bonos y mensualidades</span></p>
                <p className="m-0 text-[13.5px] font-extrabold">Equipo <span className="block text-[12px] font-semibold" style={{ color: MUTED_2 }}>sustituciones incluidas</span></p>
              </div>
            </Reveal>
          </div>
          <TituloTrazado texto="#tentarestudio" viewBox="0 0 1200 168" fontSize={152} fondo={PAPEL} className="w-full max-w-[1180px] mx-auto mt-[clamp(40px,7vh,90px)]" />
        </div>
      </section>

      {/* Automatiza */}
      <section id="automatiza" className="overflow-hidden mt-[clamp(56px,9vh,110px)] py-[clamp(64px,10vh,120px)] px-[clamp(18px,3.5vw,48px)]" style={{ background: OSCURO, color: PAPEL }}>
        <div className="max-w-[1340px] mx-auto">
          <Reveal>
            <h2 className="m-0 font-extrabold leading-[1.1] tracking-[-.03em] text-[clamp(28px,3.8vw,54px)] max-w-[15ch]" style={{ color: NW_PRODUCTO_CLARO }}>Deja de hacerlo todo tú.</h2>
          </Reveal>
          <div className="grid gap-3 mt-[clamp(28px,4vh,44px)]" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))' }}>
            {[
              { pie: 'Una alumna cancela', h: 'La plaza se ofrece sola a la lista de espera.' },
              { pie: 'Un pago se queda pendiente', h: 'Recordatorio automático, sin conversaciones incómodas.' },
              { pie: 'Una alumna deja de venir', h: 'Te avisamos a tiempo, antes de perderla.' },
              { pie: 'Una instructora se cae', h: 'Network te propone sustituta disponible.' },
            ].map((c, i) => (
              <Reveal key={c.pie} delayMs={i * 80} className="rounded-[18px] px-[22px] py-5" style={{ background: 'rgba(250,249,245,.06)', border: '1px solid rgba(250,249,245,.12)' }}>
                <p className="m-0 text-[13px]" style={{ color: 'rgba(250,249,245,.55)' }}>{c.pie}</p>
                <p className="mt-1.5 mb-0 text-[15px] font-extrabold">{c.h}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Widget */}
      <section id="widget" className="overflow-hidden py-[clamp(64px,10vh,120px)] px-[clamp(18px,3.5vw,48px)]" style={{ background: PAPEL }}>
        <div className="max-w-[1340px] mx-auto flex flex-wrap gap-[clamp(26px,4vw,70px)] items-center">
          <Reveal className="flex-1 min-w-[280px]">
            <h2 className="m-0 font-extrabold leading-[1.04] tracking-[-.035em] text-[clamp(30px,4.4vw,62px)]">Tu web también reserva.</h2>
            <p className="mt-[18px] text-[clamp(15px,1.4vw,18px)] leading-[1.65] max-w-[52ch]" style={{ color: MUTED }}>El portal de reservas se incrusta en tu página: mismo horario, mismos bonos, pago incluido. Un fragmento de código y tu web vende plazas mientras das clase.</p>
          </Reveal>
          <Reveal delayMs={140} className="flex-1 min-w-[280px] max-w-[520px] rounded-[20px] overflow-hidden" style={{ background: '#fff', border: `1px solid ${BORDE}`, boxShadow: '0 30px 70px -30px rgba(20,20,15,.25)' }}>
            <div className="flex items-center gap-1.5 px-3.5 py-2.5" style={{ background: SAGE }}>
              <span className="w-[9px] h-[9px] rounded-full" style={{ background: BORDE }} />
              <span className="w-[9px] h-[9px] rounded-full" style={{ background: BORDE }} />
              <span className="w-[9px] h-[9px] rounded-full" style={{ background: BORDE }} />
              <span className="flex-1 text-center rounded-lg py-1 text-[10.5px]" style={{ background: '#fff', fontFamily: MONO, color: MUTED_2 }}>tuestudio.com/reservas</span>
            </div>
            <div className="px-[18px] pt-4 pb-5">
              <p className="m-0 mb-2.5 text-[13.5px] font-extrabold">Horario · <span style={{ color: NW_PRODUCTO_OSCURO }}>hoy</span></p>
              <div className="flex gap-2.5 items-center rounded-2xl px-3.5 py-2.5" style={{ border: '1px solid #ECEAE0' }}>
                <span className="text-[12px]" style={{ fontFamily: MONO }}>18:15</span>
                <span className="flex-1 text-[12.5px] font-extrabold">Reformer Fundamental</span>
                <span className="text-[10px] font-extrabold" style={{ color: '#8A6A25' }}>últimas 2</span>
              </div>
              <div className="flex gap-2.5 items-center rounded-2xl px-3.5 py-2.5 mt-2" style={{ border: '1px solid #ECEAE0' }}>
                <span className="text-[12px]" style={{ fontFamily: MONO }}>19:30</span>
                <span className="flex-1 text-[12.5px] font-extrabold">Yoga Flow</span>
                <span className="text-[10px] font-extrabold" style={{ color: NW_PRODUCTO_OSCURO }}>7 plazas</span>
              </div>
              <span className="block text-center rounded-full py-3 text-[13px] font-extrabold mt-3" style={{ background: INK, color: PAPEL }}>Reservar plaza</span>
            </div>
          </Reveal>
        </div>
      </section>

      {/* App */}
      <section id="app" className="scroll-mt-16 overflow-hidden mt-[clamp(56px,9vh,110px)] py-[clamp(64px,10vh,120px)] px-[clamp(18px,3.5vw,48px)]" style={{ background: OSCURO, color: PAPEL }}>
        <div className="max-w-[1340px] mx-auto">
          <Reveal>
            <h2 className="m-0 font-extrabold leading-[1.1] tracking-[-.03em] text-[clamp(28px,3.8vw,54px)] max-w-[16ch]" style={{ color: NW_PRODUCTO_CLARO }}>Tus alumnas reservan solas.<br />Tú te dedicas a dar clase.</h2>
          </Reveal>
          <div className="flex justify-start sm:justify-end mt-[clamp(30px,5vh,56px)]">
            <Reveal className="max-w-[560px]">
              <p className="m-0 text-[clamp(15px,1.4vw,18px)] leading-[1.7]" style={{ color: 'rgba(250,249,245,.85)' }}>Horario en el bolsillo, plaza y cama elegidas en tres toques, bono siempre a la vista y lista de espera que avisa sola. Y si una clase se llena, la app ofrece la siguiente.</p>
              <div className="flex gap-3 mt-6 flex-wrap">
                <span className="inline-flex flex-col justify-center rounded-[10px] px-4 py-1.5" style={{ border: '1.5px solid rgba(250,249,245,.5)' }}>
                  <span className="text-[8.5px]" style={{ color: 'rgba(250,249,245,.7)' }}>Consíguelo en el</span>
                  <span className="text-[14px] font-extrabold leading-[1.1]">App Store</span>
                </span>
                <span className="inline-flex flex-col justify-center rounded-[10px] px-4 py-1.5" style={{ border: '1.5px solid rgba(250,249,245,.5)' }}>
                  <span className="text-[8.5px]" style={{ color: 'rgba(250,249,245,.7)' }}>Disponible en</span>
                  <span className="text-[14px] font-extrabold leading-[1.1]">Google Play</span>
                </span>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* Network */}
      <section id="network" className="scroll-mt-16 overflow-hidden pt-[clamp(64px,10vh,120px)] px-[clamp(18px,3.5vw,48px)]" style={{ background: PAPEL }}>
        <div className="max-w-[1340px] mx-auto">
          <div className="flex flex-wrap gap-[clamp(26px,4vw,70px)] items-start">
            <Reveal className="flex-1 min-w-[280px]">
              <h2 className="m-0 font-extrabold leading-[1.04] tracking-[-.035em] text-[clamp(30px,4.4vw,62px)]">Encuentra el talento que tu estudio necesita.</h2>
            </Reveal>
            <Reveal delayMs={120} className="flex-1 min-w-[280px] max-w-[560px]">
              <p className="mt-1.5 text-[clamp(15px,1.4vw,18px)] leading-[1.65]" style={{ color: MUTED }}>Tentare Network conecta estudios con instructoras de Pilates y Yoga: perfiles verificados, disponibilidad real y sustituciones resueltas en minutos, no en cadenas de mensajes.</p>
              <div className="flex gap-2.5 mt-[22px] flex-wrap">
                <span className="inline-flex items-center gap-2 rounded-full pr-3.5 pl-[7px] py-[7px] text-[12px] font-extrabold" style={{ background: '#fff', border: `1px solid ${BORDE}` }}>
                  <span aria-hidden="true" className="w-[26px] h-[26px] rounded-full" style={{ backgroundImage: 'url(/por-defecto/clase-reformer.webp)', backgroundSize: 'cover', backgroundPosition: 'center' }} />
                  Marta G. · Reformer
                </span>
                <span className="inline-flex items-center gap-2 rounded-full pr-3.5 pl-[7px] py-[7px] text-[12px] font-extrabold" style={{ background: '#fff', border: `1px solid ${BORDE}` }}>
                  <span aria-hidden="true" className="w-[26px] h-[26px] rounded-full" style={{ backgroundImage: 'url(/por-defecto/clase-yoga.webp)', backgroundSize: 'cover', backgroundPosition: 'center' }} />
                  Carmen V. · Yoga
                </span>
                <span className="inline-flex items-center rounded-full px-3.5 py-[7px] text-[12px] font-extrabold" style={{ background: '#fff', border: `1px solid ${BORDE}`, color: NW_PRODUCTO_OSCURO }}>+120 perfiles</span>
              </div>
              <Link href="/network/instructoras" className="inline-block mt-5 text-[14.5px] font-extrabold pb-[3px] whitespace-nowrap" style={{ color: INK, borderBottom: `2.5px solid ${INK}` }}>Explorar Network →</Link>
            </Reveal>
          </div>
          <TituloTrazado texto="#tentarenetwork" viewBox="0 0 1200 158" fontSize={136} fondo={PAPEL} className="w-full max-w-[1180px] mx-auto mt-[clamp(40px,7vh,90px)]" />
        </div>
      </section>

      {/* Cómo funciona — contenido real sobre Network que el mockup no traía
          (era solo una franja-teaser). Dos columnas: instructora / estudio,
          cada una con su flujo real (auditoría 2026-08-20 original: un
          bloque genérico no explicaba de verdad ninguno de los dos lados). */}
      <section className="overflow-hidden mt-[clamp(56px,9vh,110px)] py-[clamp(64px,10vh,120px)] px-[clamp(18px,3.5vw,48px)]" style={{ background: OSCURO, color: PAPEL }}>
        <div className="max-w-[1340px] mx-auto">
          <Reveal>
            <h2 className="m-0 font-extrabold leading-[1.1] tracking-[-.03em] text-[clamp(28px,3.8vw,54px)]" style={{ color: NW_PRODUCTO_CLARO }}>Cómo funciona Tentare Network.</h2>
          </Reveal>
          <div className="grid md:grid-cols-2 gap-x-[clamp(26px,4vw,70px)] gap-y-10 mt-[clamp(28px,4vh,44px)]">
            {[
              { titulo: 'Para instructoras', pasos: PASOS_INSTRUCTORA },
              { titulo: 'Para estudios', pasos: PASOS_ESTUDIO },
            ].map(bloque => (
              <div key={bloque.titulo}>
                <Reveal><p className="m-0 mb-5 text-[13px] font-extrabold uppercase tracking-[.1em]" style={{ color: 'rgba(250,249,245,.5)' }}>{bloque.titulo}</p></Reveal>
                <div className="space-y-5">
                  {bloque.pasos.map((p, i) => (
                    <Reveal key={p.n} delayMs={i * 80} className="flex gap-4">
                      <span className="shrink-0 text-[13px] font-extrabold" style={{ color: NW_PRODUCTO_CLARO }}>{p.n}</span>
                      <div>
                        <p className="m-0 text-[15.5px] font-extrabold">{p.titulo}</p>
                        <p className="mt-1 mb-0 text-[13.5px] leading-[1.6]" style={{ color: 'rgba(250,249,245,.65)' }}>{p.desc}</p>
                      </div>
                    </Reveal>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Confianza */}
      <section className="overflow-hidden py-[clamp(64px,10vh,120px)] px-[clamp(18px,3.5vw,48px)]" style={{ background: PAPEL }}>
        <div className="max-w-[1340px] mx-auto">
          <Reveal>
            <h2 className="m-0 font-extrabold leading-[1.04] tracking-[-.035em] text-[clamp(28px,3.8vw,48px)]">Confianza real, no una insignia.</h2>
          </Reveal>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 mt-10">
            {CONFIANZA_ITEMS.map((it, i) => (
              <Reveal key={it.titulo} delayMs={i * 80} className="rounded-[18px] p-5" style={{ background: SAGE }}>
                <p className="m-0 text-[15px] font-extrabold">{it.titulo}</p>
                <p className="mt-1.5 mb-0 text-[13.5px] leading-[1.6]" style={{ color: MUTED }}>{it.texto}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Casos de uso */}
      <section className="overflow-hidden py-[clamp(64px,10vh,120px)] px-[clamp(18px,3.5vw,48px)]" style={{ background: OSCURO, color: PAPEL }}>
        <div className="max-w-[1340px] mx-auto">
          <Reveal>
            <h2 className="m-0 font-extrabold leading-[1.1] tracking-[-.03em] text-[clamp(28px,3.8vw,48px)]" style={{ color: NW_PRODUCTO_CLARO }}>¿Cuándo se usa Network?</h2>
          </Reveal>
          <div className="grid sm:grid-cols-3 gap-4 mt-10">
            {CASOS_USO.map((c, i) => (
              <Reveal key={c.titulo} delayMs={i * 80} className="rounded-[18px] px-6 py-6" style={{ background: 'rgba(250,249,245,.06)', border: '1px solid rgba(250,249,245,.12)' }}>
                <p className="m-0 text-[15px] font-extrabold">{c.titulo}</p>
                <p className="mt-2 mb-0 text-[13.5px] leading-[1.6]" style={{ color: 'rgba(250,249,245,.65)' }}>{c.texto}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="overflow-hidden py-[clamp(64px,10vh,120px)] px-[clamp(18px,3.5vw,48px)]" style={{ background: PAPEL }}>
        <div className="max-w-[720px] mx-auto">
          <Reveal>
            <h2 className="m-0 font-extrabold leading-[1.04] tracking-[-.035em] text-[clamp(28px,3.8vw,48px)]">Preguntas frecuentes.</h2>
          </Reveal>
          <Reveal delayMs={100} className="mt-8">
            {FAQ_ITEMS.map(f => <FaqItem key={f.q} q={f.q} a={f.a} />)}
          </Reveal>
        </div>
      </section>

      {/* CTA final */}
      <section id="cta" className="overflow-hidden mt-[clamp(56px,9vh,110px)] py-[clamp(80px,13vh,150px)] px-[clamp(18px,3.5vw,48px)]" style={{ background: OSCURO, color: PAPEL }}>
        <div className="max-w-[1340px] mx-auto text-center">
          <Reveal>
            <h2 className="m-0 italic font-extrabold uppercase leading-[.96] tracking-[-.02em] text-[clamp(34px,6.4vw,96px)]">
              <span className="block" style={{ color: NW_PRODUCTO_CLARO }}>Tu estudio.</span>
              <TituloTrazado texto="TODO LO DEMÁS, TENTARE." viewBox="0 0 1560 172" fontSize={112} fondo={OSCURO} className="w-full max-w-[1300px] mx-auto mt-2" />
            </h2>
          </Reveal>
          <Reveal delayMs={120}>
            <p className="mt-6 italic font-semibold text-[clamp(15px,1.5vw,19px)]" style={{ color: 'rgba(250,249,245,.75)' }}>Descubre, gestiona y crece</p>
          </Reveal>
          <Reveal delayMs={200} className="flex justify-center gap-4 mt-8 flex-wrap">
            <Link href="/crear-estudio" className="px-[34px] py-4 rounded-xl text-[16px] font-extrabold" style={{ background: NW_PRODUCTO, color: PAPEL }}>Empieza gratis</Link>
            <a href="#top" className="px-7 py-4 rounded-xl text-[16px] font-extrabold" style={{ color: PAPEL, boxShadow: 'inset 0 0 0 2px rgba(250,249,245,.5)' }}>Hablar con nosotros</a>
          </Reveal>
        </div>
      </section>

      {/* Pie — el mockup solo traía Producto/Network/Precios/Privacidad (las
          anclas de su propia landing general). Completado con los enlaces
          reales de Network (Explorar instructoras, Acceso) y sus dos
          legales propios, más aviso legal y cookies compartidos. */}
      <footer style={{ background: OSCURO, color: 'rgba(250,249,245,.7)', borderTop: '1px solid rgba(250,249,245,.12)' }} className="px-[clamp(18px,3.5vw,48px)] py-[34px]">
        <div className="max-w-[1340px] mx-auto flex flex-col gap-6">
          <div className="flex flex-wrap gap-[18px] items-center justify-between">
            <LogoTentare formato="horizontal" tinta="blanco" producto="network" titulo="Tentare Network" alto={22} decorativo />
            <div className="flex gap-5 flex-wrap text-[13px]">
              <a href="#estudio" style={{ color: 'rgba(250,249,245,.7)' }}>Producto</a>
              <Link href="/network/instructoras" style={{ color: 'rgba(250,249,245,.7)' }}>Explorar instructoras</Link>
              <Link href="/network/acceso" style={{ color: 'rgba(250,249,245,.7)' }}>Acceso</Link>
              <Link href="/precios" style={{ color: 'rgba(250,249,245,.7)' }}>Precios</Link>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-4 pt-5" style={{ borderTop: '1px solid rgba(250,249,245,.12)' }}>
            <div className="flex gap-5 flex-wrap text-[12.5px]" style={{ color: 'rgba(250,249,245,.55)' }}>
              <Link href="/network/terminos" style={{ color: 'inherit' }}>Términos de Network</Link>
              <Link href="/network/privacidad" style={{ color: 'inherit' }}>Privacidad de Network</Link>
              <Link href="/legal" style={{ color: 'inherit' }}>Aviso legal</Link>
              <Link href="/cookies" style={{ color: 'inherit' }}>Cookies</Link>
            </div>
            <p className="m-0 text-[12px]" style={{ color: 'rgba(250,249,245,.45)' }}>© 2026 Tentare · Barcelona</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
