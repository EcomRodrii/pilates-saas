import type { Metadata } from 'next';
import Link from 'next/link';
import { LogoTentare } from '@/components/marca/logo-tentare';
import { Reveal } from '@/components/network-v2/Reveal';
import { NW_PRODUCTO, NW_PRODUCTO_OSCURO, NW_PRODUCTO_CLARO } from '@/components/network-v2/tokens';

// Clon literal del mockup de Claude Design "UI mockups for landing page"
// (2026-08-30) — pedido explícito del fundador: "EXACTAMENTE EL MISMO
// DISEÑO", confirmado en una pregunta de alcance a incluir también las
// secciones de Estudio (Automatiza/Widget/App), aunque hablen del producto
// de gestión y no del marketplace de instructoras. Sustituye el diseño
// anterior de esta página entero, no lo complementa.
//
// Colores en hex literal del propio mockup, no vía los tokens NW_* de
// siempre — la mayoría no coincide exactamente con ningún token existente
// (#14140F/#1A1A16/#4A4A42/#7E7A6E/#0F0F0C son valores propios del mockup,
// no alias de NW_TINTA/NW_VERDE_OSCURO/NW_MUTED) y forzar el encaje habría
// sido justo la clase de aproximación que "exactamente" pedía evitar.
// NW_PRODUCTO/_OSCURO/_CLARO sí son el mismo verde citado por variable
// (PR #1480), así que esos tres se reutilizan tal cual.
//
// Sin "IOSDevice" (componente propio de Claude Design, no existe en este
// stack): los tres móviles flotando del hero se aproximan con tarjetas
// redondeadas sin bisel de hardware — mismo contenido y animación
// (nw-float-a/b/c, app/globals.css), sin la carcasa de iPhone literal.
//
// Fotos: el mockup referencia imágenes subidas a su propio canvas (uuids
// sin URL pública). Sustituidas por fotografía real ya existente en este
// repo (public/disciplinas, public/por-defecto) en vez de placeholders
// grises — misma idea visual, sin inventar un asset nuevo.

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
    <div style={{ height: '100%', background: PAPEL, padding: '58px 16px 0', boxSizing: 'border-box', fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif", color: INK, borderRadius: 28, overflow: 'hidden' }}>
      {children}
    </div>
  );
}

export default function NetworkLandingPage() {
  return (
    <div style={{ background: PAPEL, color: INK, fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}>
      {/* Nav — clon literal: los tres enlaces son anclas dentro de esta
          misma página (así están en el mockup, que es de una única
          landing con todas las secciones). */}
      <nav id="top" className="sticky top-0 z-[60] flex items-center gap-[26px] px-[clamp(18px,3.5vw,48px)]" style={{ height: 64, background: OSCURO, color: PAPEL }}>
        <Link href="/network" className="inline-flex"><LogoTentare formato="horizontal" tinta="blanco" producto="network" titulo="Tentare Network" alto={26} decorativo /></Link>
        <div className="hidden sm:flex gap-[22px] items-center">
          <a href="#estudio" className="text-[14px] font-extrabold pb-1" style={{ color: PAPEL, borderBottom: `2.5px solid ${NW_PRODUCTO}` }}>Producto</a>
          <a href="#app" className="text-[14px] font-semibold hover:!text-white" style={{ color: 'rgba(250,249,245,.65)' }}>Estudio</a>
          <a href="#network" className="text-[14px] font-semibold hover:!text-white" style={{ color: 'rgba(250,249,245,.65)' }}>Network</a>
        </div>
        <div className="ml-auto flex items-center gap-[18px]">
          <Link href="/crear-estudio" className="px-5 py-2.5 rounded-[10px] text-[13.5px] font-extrabold" style={{ background: NW_PRODUCTO, color: PAPEL }}>Empieza gratis</Link>
        </div>
      </nav>

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

        <div className="relative z-[2] max-w-[1340px] mx-auto px-[clamp(18px,3.5vw,48px)] pt-[clamp(64px,10vh,120px)]">
          <h1 className="m-0 italic font-extrabold uppercase leading-[.96] tracking-[-.02em] text-[clamp(46px,7.2vw,108px)]">
            <span className="nw-fade-up block" style={{ color: NW_PRODUCTO }}>Tu estudio,</span>
            <TituloTrazado texto="A OTRO NIVEL" viewBox="0 0 980 128" fontSize={118} fondo={HERO_BG} className="nw-fade-up w-full max-w-[900px] mt-1" />
          </h1>
          <p className="nw-fade-up mt-[26px] italic font-semibold text-[clamp(17px,1.8vw,24px)]" style={{ color: NW_PRODUCTO }}>Pilates y Yoga · reservas, pagos, equipo y alumnas</p>
          <div className="nw-fade-up flex flex-wrap gap-4 mt-[30px]">
            <Link href="/crear-estudio" className="px-[30px] py-[15px] rounded-xl text-[15.5px] font-extrabold" style={{ background: NW_PRODUCTO, color: PAPEL }}>Empieza gratis</Link>
            <a href="#estudio" className="px-[26px] py-[15px] rounded-xl text-[15.5px] font-extrabold" style={{ color: PAPEL, boxShadow: 'inset 0 0 0 2px rgba(250,249,245,.5)' }}>Ver cómo funciona</a>
          </div>

          <div className="nw-fade-up max-w-[660px] mt-[26px]">
            <div className="flex flex-wrap items-stretch gap-3.5 rounded-[22px] py-3 pr-3 pl-[26px]" style={{ background: PAPEL, boxShadow: '0 24px 60px -24px rgba(0,0,0,.5)' }}>
              <div className="flex-1 min-w-[150px] flex flex-col justify-center py-1.5">
                <span className="text-[10px] uppercase tracking-[.14em] font-medium" style={{ fontFamily: MONO, color: GRIS_VERDOSO }}>¿Qué buscas?</span>
                <span className="mt-[3px] text-[17px] font-semibold" style={{ color: MUTED_2 }}>Reformer</span>
              </div>
              <span aria-hidden="true" className="w-px my-1" style={{ background: BORDE }} />
              <div className="flex-1 min-w-[150px] flex flex-col justify-center py-1.5">
                <span className="text-[10px] uppercase tracking-[.14em] font-medium" style={{ fontFamily: MONO, color: GRIS_VERDOSO }}>¿Dónde?</span>
                <span className="mt-[3px] text-[17px] font-semibold" style={{ color: MUTED_2 }}>Barcelona</span>
              </div>
              <Link href="/network/instructoras" className="shrink-0 self-center rounded-full px-7 py-[17px] text-[15.5px] font-extrabold whitespace-nowrap" style={{ background: INK, color: PAPEL }}>Buscar instructoras</Link>
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

          {/* Móviles flotando — ver nota de cabecera sobre la sustitución de IOSDevice. */}
          <div className="relative flex justify-center items-end gap-[clamp(14px,3vw,40px)] mt-[clamp(44px,7vh,84px)] mb-[-100px] sm:mb-[-170px]">
            <div className="nw-float-a w-[150px] sm:w-[195px] h-[325px] sm:h-[422px]" style={{ filter: 'drop-shadow(0 34px 60px rgba(0,0,0,.55))' }}>
              <AppScreen>
                <p className="m-0 text-[13px] font-semibold" style={{ color: '#5A5A52' }}>Buenas tardes, Laura</p>
                <h3 className="m-0 mb-3 mt-0.5 text-[24px] font-extrabold tracking-[-.03em]">¿Qué te apetece hoy?</h3>
                <p className="m-0 flex items-center gap-2 rounded-full px-4 py-3.5 text-[13.5px] font-semibold" style={{ background: '#fff', border: `1px solid ${BORDE}`, color: GRIS_VERDOSO }}>Buscar clases o instructoras</p>
                <p className="mt-4 mb-2 text-[16px] font-extrabold">Explora</p>
                <div className="grid grid-cols-2 gap-2.5">
                  <span className="block h-[120px] rounded-2xl" style={{ backgroundImage: 'url(/por-defecto/clase-reformer.webp)', backgroundSize: 'cover', backgroundPosition: 'center' }} />
                  <span className="block h-[120px] rounded-2xl" style={{ backgroundImage: 'url(/por-defecto/clase-yoga.webp)', backgroundSize: 'cover', backgroundPosition: 'center' }} />
                </div>
              </AppScreen>
            </div>
            <div className="nw-float-b w-[168px] sm:w-[218px] h-[365px] sm:h-[473px] z-[2]" style={{ filter: 'drop-shadow(0 44px 70px rgba(0,0,0,.62))' }}>
              <AppScreen>
                <h3 className="m-0 mb-3 text-[24px] font-extrabold tracking-[-.03em]">Horario · <span style={{ color: NW_PRODUCTO_OSCURO }}>hoy</span></h3>
                <div className="flex gap-1.5 mb-3">
                  <span className="rounded-xl px-[15px] py-2 text-[12.5px] font-extrabold" style={{ background: INK, color: PAPEL }}>Hoy</span>
                  <span className="rounded-xl px-[15px] py-2 text-[12.5px] font-bold" style={{ border: `1px solid ${BORDE}`, color: MUTED_2 }}>Mañana</span>
                </div>
                <div className="flex flex-col gap-2.5">
                  <div className="flex gap-2.5 items-center rounded-2xl px-3.5 py-3.5" style={{ background: '#fff', border: `1px solid ${BORDE}` }}>
                    <span className="text-[14px]" style={{ fontFamily: MONO }}>9:00</span>
                    <span className="flex-1 text-[14px] font-extrabold">Reformer Despertar</span>
                    <span className="text-[11px] font-extrabold" style={{ color: NW_PRODUCTO_OSCURO }}>5 plazas</span>
                  </div>
                  <div className="flex gap-2.5 items-center rounded-2xl px-3.5 py-3.5" style={{ background: INK, color: '#fff' }}>
                    <span className="text-[14px]" style={{ fontFamily: MONO }}>19:30</span>
                    <span className="flex-1 text-[14px] font-extrabold">Reformer Intenso</span>
                    <span className="text-[11px] font-extrabold" style={{ color: '#F3C46A' }}>quedan 2</span>
                  </div>
                  <span className="text-center rounded-full py-3.5 text-[15px] font-extrabold" style={{ background: NW_PRODUCTO, color: '#fff' }}>Reservar</span>
                </div>
              </AppScreen>
            </div>
            <div className="nw-float-c w-[150px] sm:w-[195px] h-[325px] sm:h-[422px]" style={{ filter: 'drop-shadow(0 34px 60px rgba(0,0,0,.55))' }}>
              <AppScreen>
                <span className="block h-[140px] rounded-2xl" style={{ background: `linear-gradient(135deg, ${NW_PRODUCTO}, ${NW_PRODUCTO_OSCURO})` }} />
                <p className="mt-3.5 text-[21px] font-extrabold tracking-[-.02em]">Marta G. <span className="text-[14px]" style={{ color: '#C99A3C' }}>★ 4,9</span></p>
                <p className="mt-[3px] text-[13px]" style={{ color: GRIS_VERDOSO }}>Reformer · Prenatal · Gràcia</p>
                <div className="flex gap-1.5 mt-3.5 flex-wrap">
                  <span className="rounded-full px-3 py-1.5 text-[11.5px] font-bold" style={{ background: SAGE }}>Sustituciones</span>
                  <span className="rounded-full px-3 py-1.5 text-[11.5px] font-bold" style={{ background: SAGE }}>Tardes</span>
                </div>
                <div className="flex gap-2 mt-3.5">
                  <span className="flex-1 text-center rounded-full py-3 text-[13px] font-extrabold" style={{ border: `1.5px solid ${INK}` }}>Ver perfil</span>
                  <span className="flex-1 text-center rounded-full py-3 text-[13px] font-extrabold" style={{ background: INK, color: PAPEL }}>Contactar</span>
                </div>
              </AppScreen>
            </div>
          </div>
        </div>
      </header>

      {/* Studio */}
      <section id="estudio" className="overflow-hidden pt-[130px] sm:pt-[210px] px-[clamp(18px,3.5vw,48px)]" style={{ background: PAPEL }}>
        <div className="max-w-[1340px] mx-auto">
          <div className="flex flex-wrap gap-[clamp(26px,4vw,70px)] items-start">
            <Reveal className="flex-1 min-w-[380px]">
              <h2 className="m-0 font-extrabold leading-[1.04] tracking-[-.035em] text-[clamp(34px,4.4vw,62px)]">Todo tu estudio.<br />En un solo lugar.</h2>
            </Reveal>
            <Reveal delayMs={120} className="flex-1 min-w-[340px] max-w-[560px]">
              <p className="mt-1.5 text-[clamp(15.5px,1.4vw,18px)] leading-[1.65]" style={{ color: MUTED }}>Horario, reservas, bonos, pagos e instructoras — sin hojas de cálculo ni WhatsApp. Tú abres Tentare por la mañana y ya sabes qué pasa hoy en tu estudio.</p>
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
            <h2 className="m-0 font-extrabold leading-[1.1] tracking-[-.03em] text-[clamp(30px,3.8vw,54px)] max-w-[15ch]" style={{ color: NW_PRODUCTO_CLARO }}>Deja de hacerlo todo tú.</h2>
          </Reveal>
          <div className="grid gap-3 mt-[clamp(28px,4vh,44px)]" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))' }}>
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
          <Reveal className="flex-1 min-w-[380px]">
            <h2 className="m-0 font-extrabold leading-[1.04] tracking-[-.035em] text-[clamp(34px,4.4vw,62px)]">Tu web también reserva.</h2>
            <p className="mt-[18px] text-[clamp(15.5px,1.4vw,18px)] leading-[1.65] max-w-[52ch]" style={{ color: MUTED }}>El portal de reservas se incrusta en tu página: mismo horario, mismos bonos, pago incluido. Un fragmento de código y tu web vende plazas mientras das clase.</p>
          </Reveal>
          <Reveal delayMs={140} className="flex-1 min-w-[340px] max-w-[520px] rounded-[20px] overflow-hidden" style={{ background: '#fff', border: `1px solid ${BORDE}`, boxShadow: '0 30px 70px -30px rgba(20,20,15,.25)' }}>
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
      <section id="app" className="overflow-hidden mt-[clamp(56px,9vh,110px)] py-[clamp(64px,10vh,120px)] px-[clamp(18px,3.5vw,48px)]" style={{ background: OSCURO, color: PAPEL }}>
        <div className="max-w-[1340px] mx-auto">
          <Reveal>
            <h2 className="m-0 font-extrabold leading-[1.1] tracking-[-.03em] text-[clamp(30px,3.8vw,54px)] max-w-[16ch]" style={{ color: NW_PRODUCTO_CLARO }}>Tus alumnas reservan solas.<br />Tú te dedicas a dar clase.</h2>
          </Reveal>
          <div className="flex justify-end mt-[clamp(30px,5vh,56px)]">
            <Reveal className="max-w-[560px]">
              <p className="m-0 text-[clamp(15.5px,1.4vw,18px)] leading-[1.7]" style={{ color: 'rgba(250,249,245,.85)' }}>Horario en el bolsillo, plaza y cama elegidas en tres toques, bono siempre a la vista y lista de espera que avisa sola. Y si una clase se llena, la app ofrece la siguiente.</p>
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
      <section id="network" className="overflow-hidden pt-[clamp(64px,10vh,120px)] px-[clamp(18px,3.5vw,48px)]" style={{ background: PAPEL }}>
        <div className="max-w-[1340px] mx-auto">
          <div className="flex flex-wrap gap-[clamp(26px,4vw,70px)] items-start">
            <Reveal className="flex-1 min-w-[380px]">
              <h2 className="m-0 font-extrabold leading-[1.04] tracking-[-.035em] text-[clamp(34px,4.4vw,62px)]">Encuentra el talento que tu estudio necesita.</h2>
            </Reveal>
            <Reveal delayMs={120} className="flex-1 min-w-[340px] max-w-[560px]">
              <p className="mt-1.5 text-[clamp(15.5px,1.4vw,18px)] leading-[1.65]" style={{ color: MUTED }}>Tentare Network conecta estudios con instructoras de Pilates y Yoga: perfiles verificados, disponibilidad real y sustituciones resueltas en minutos, no en cadenas de mensajes.</p>
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

      {/* CTA final */}
      <section id="cta" className="overflow-hidden mt-[clamp(56px,9vh,110px)] py-[clamp(80px,13vh,150px)] px-[clamp(18px,3.5vw,48px)]" style={{ background: OSCURO, color: PAPEL }}>
        <div className="max-w-[1340px] mx-auto text-center">
          <Reveal>
            <h2 className="m-0 italic font-extrabold uppercase leading-[.96] tracking-[-.02em] text-[clamp(40px,6.4vw,96px)]">
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

      {/* Footer */}
      <footer style={{ background: OSCURO, color: 'rgba(250,249,245,.7)', borderTop: '1px solid rgba(250,249,245,.12)' }} className="px-[clamp(18px,3.5vw,48px)] py-[34px]">
        <div className="max-w-[1340px] mx-auto flex flex-wrap gap-[18px] items-center justify-between">
          <LogoTentare formato="horizontal" tinta="blanco" producto="network" titulo="Tentare Network" alto={22} decorativo />
          <div className="flex gap-5 flex-wrap text-[13px]">
            <a href="#estudio" style={{ color: 'rgba(250,249,245,.7)' }}>Producto</a>
            <a href="#network" style={{ color: 'rgba(250,249,245,.7)' }}>Network</a>
            <Link href="/precios" style={{ color: 'rgba(250,249,245,.7)' }}>Precios</Link>
            <Link href="/privacidad" style={{ color: 'rgba(250,249,245,.7)' }}>Privacidad</Link>
          </div>
          <p className="m-0 text-[12px]" style={{ color: 'rgba(250,249,245,.45)' }}>© 2026 Tentare · Barcelona</p>
        </div>
      </footer>
    </div>
  );
}
