import type { Metadata } from 'next';
import Link from 'next/link';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { buscarPerfilesPublico } from '@/lib/network/publico';
import { HeroParallax } from '@/components/network-v2/HeroParallax';
import { NavPublico } from '@/components/network-v2/NavPublico';
import { PieNetwork } from '@/components/network-v2/PieNetwork';
import { BuscadorHero } from '@/components/network-v2/BuscadorHero';
import { TarjetaInstructora } from '@/components/network-v2/TarjetaInstructora';
import { FotoInstructora } from '@/components/network-v2/FotoInstructora';
import { FormularioInteresEstudio } from '@/components/network-v2/FormularioInteresEstudio';
import { Reveal } from '@/components/network-v2/Reveal';
import { EnlaceRastreo } from '@/components/network-v2/EnlaceRastreo';
import { NW_FONDO, NW_TINTA, NW_MUTED, NW_SAGE, NW_SAND, NW_BORDE, NW_VERDE_OSCURO, NW_PRODUCTO, NW_ARENA, NW_ESTADO, NW_PROBLEMA } from '@/components/network-v2/tokens';

// Fuente display del kit (app/layout.tsx: `--font-display`, Instrument
// Serif) reutilizada aquí en su peso ROMANO únicamente — nunca cursiva.
// Rediseño 2026-08-26: la página entera iba en una sola familia (Jakarta
// Sans) para titulares, cuerpo y cifras a la vez, que es justo el "un solo
// tipo por defecto" que se pidió corregir. La cursiva se queda fuera a
// propósito (comentario de PROBLEMA_ITEMS más abajo: "sin cursiva, paleta
// oliva" ya fue una decisión explícita de este mismo rediseño en su día) —
// esto es un PAR editorial (serif redonda + sans extrabold), no la vuelta a
// la voz-en-cursiva de la landing antigua.
const FUENTE_DISPLAY = { fontFamily: 'var(--font-display), Georgia, serif', fontStyle: 'normal' as const };

// "Kicker" de sección — antes texto suelto oliva sobre crema, casi sin
// distinguirse del resto de la tipografía en tono (auditoría 2026-08-26:
// color/identidad se sentía plano porque el ÚNICO acento de página era el
// mismo oliva del texto normal). Ahora es una píldora real con el segundo
// acento de marca (arena) de fondo — mismo patrón que ya usan los estados
// (EstadoPill) y los badges "Verificada", no un componente nuevo de la nada.
function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[12px] font-bold uppercase tracking-[.14em]"
      style={{ background: `color-mix(in srgb, ${NW_ARENA} 38%, white)`, color: NW_VERDE_OSCURO }}
    >
      {children}
    </p>
  );
}

// Landing pública de Tentare Network (1a del rediseño) — Server Component:
// "sin esto Google ve un div vacío", mismo criterio que ya usa
// app/network/instructoras/page.tsx para el marketplace. Ocupa la ruta
// literal /network, que hasta ahora tenía el buscador de la propietaria
// (movido a /network/buscar, ver lib/nav-config.ts).
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

// Antes un único bloque de 3 pasos servía "para los dos lados" a la vez —
// auditoría 2026-08-20: el brief pedía dos bloques diferenciados
// (instructora / estudio) y el genérico no explicaba de verdad ninguno de
// los dos flujos reales (el de estudio, sobre todo, ni mencionaba el
// concierge). Separados, cada uno describe lo que de verdad pasa en ESE
// lado.
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

const CASOS_USO = [
  { titulo: 'Necesitas una sustitución', texto: 'Un estudio se queda sin quien dé la clase de mañana y busca una instructora disponible en su zona.' },
  { titulo: 'Buscas nuevas oportunidades', texto: 'Terminaste una certificación de Reformer y quieres que los estudios que buscan ese perfil te encuentren.' },
  { titulo: 'Quieres incorporar una especialidad', texto: 'Tu estudio quiere ofrecer Yoga prenatal y hoy no tenéis a nadie formada en eso.' },
] as const;

// Copy heredado de la landing original (components/landing/network/data.ts,
// app/network/unirse) — el rediseño de esta página se quedó con el hero y el
// grid de destacadas, pero perdió el contraste "sin/con", la confianza y el
// FAQ que sí vivían ahí. El usuario pidió recuperarlo explícitamente sobre el
// design system nuevo (sin cursiva, paleta oliva) en vez de mantener las dos
// landings en paralelo.
const PROBLEMA_ITEMS = [
  {
    sin: 'Mandas tu currículum a doce estudios y no sabes si alguien lo ha abierto.',
    con: 'Publicas un perfil una vez. Lo ven los estudios que buscan justo tu especialidad.',
  },
  {
    sin: 'Te enteras de una sustitución por un grupo de WhatsApp al que ya casi no perteneces.',
    con: 'Los estudios te contactan a ti directamente cuando tu disponibilidad encaja.',
  },
  {
    sin: 'Negocias tu tarifa desde cero cada vez, sin saber qué es lo normal.',
    con: 'Marcas tu rango de tarifa una vez. Lo ven todos antes de escribirte.',
  },
  {
    sin: 'Das tu teléfono a cualquiera que pregunte por WhatsApp o Instagram.',
    con: 'Tu email y tu teléfono quedan privados hasta que tú aceptas hablar.',
  },
] as const;

const CONFIANZA_ITEMS = [
  { titulo: 'Sin intermediarios', texto: 'Instructora y estudio habláis directamente — Tentare no se queda en medio ni cobra comisión.' },
  { titulo: 'Email verificado', texto: 'Todo perfil confirma su email antes de publicarse.' },
  { titulo: 'Experiencia confirmada', texto: 'Puedes pedir que un estudio que ya usa Tentare confirme que trabajaste ahí — se marca como verificada en tu perfil.' },
  { titulo: 'Actividad reciente', texto: 'Se nota si sigues buscando o si tu perfil lleva meses parado.' },
] as const;

const PROBLEMA_ESTUDIO_ITEMS = [
  {
    sin: 'Una sustitución urgente se resuelve preguntando en cinco grupos de WhatsApp a la vez.',
    con: 'Cuéntanos qué necesitas y cruzamos tu petición contra la red de instructoras al momento.',
  },
  {
    sin: 'Los contactos de instructoras se acumulan en notas sueltas, sin saber quién sigue disponible.',
    con: 'Cada perfil dice si está buscando trabajo, disponible para sustituciones, o ninguna de las dos.',
  },
  {
    sin: 'Comparar candidatas a mano es leer diez conversaciones de WhatsApp distintas.',
    con: 'Toda la información — experiencia, especialidades, tarifa orientativa — en el mismo formato.',
  },
] as const;

const FAQ_ITEMS = [
  { q: '¿Cuesta dinero crear mi perfil?', a: 'No. Publicar tu perfil en Tentare Network es gratis y sin comisión sobre lo que cobres a los estudios. Durante la beta no hay ningún plan de pago activo; si eso cambia alguna vez, te avisaremos antes de aplicar cualquier condición nueva a tu cuenta.' },
  { q: '¿Tengo que dejar mi trabajo actual?', a: 'No. Puedes marcarte como "disponible para sustituciones" aunque ya trabajes en otro estudio, o "buscando trabajo" si es lo que necesitas ahora mismo. Cambias el estado cuando quieras.' },
  { q: '¿Quién ve mi teléfono y mi email?', a: 'Nadie, hasta que tú aceptas una solicitud de contacto de un estudio. Antes de eso, solo ven tu perfil público: especialidad, experiencia, disponibilidad y tarifa orientativa.' },
  { q: '¿Cómo saben los estudios que mi experiencia es real?', a: 'Puedes pedir que un estudio donde trabajaste, si usa Tentare, confirme esa experiencia desde su propia cuenta — se marca como verificada en tu perfil, no es algo que rellenes tú misma.' },
  { q: '¿Puedo ocultar mi perfil si dejo de buscar?', a: 'Sí, en cualquier momento, sin perder los datos que ya rellenaste. Vuelves a publicarlo cuando quieras.' },
  { q: '¿Necesito que mi estudio use Tentare para unirme?', a: 'No. Tu perfil en Network es una cuenta independiente, sin ningún estudio detrás. Da igual el software que use el estudio donde trabajas.' },
  { q: '¿Qué significa que Tentare Network está en beta?', a: 'Que acabamos de abrir la red y estamos incorporando a las primeras instructoras y estudios. No hay una comunidad grande todavía — entrar ahora significa formar parte desde el principio, no llegar tarde a algo ya lleno.' },
  { q: '¿En qué ciudades está disponible?', a: 'Empezamos con las primeras instructoras en Barcelona y Madrid, y vamos a sumar más ciudades según se una gente. Si tu ciudad todavía no tiene perfiles, puedes dejarnos tu email y te avisamos.' },
  { q: '¿Qué pasa si busco y todavía no hay perfiles en mi zona o especialidad?', a: 'Te lo decimos con claridad en vez de enseñarte una página vacía, y puedes dejarnos tu email o crear tu propio perfil para ser de las primeras.' },
  { q: '¿Cómo elimino mi cuenta o mi perfil?', a: 'Escríbenos a hola@tentare.app y lo borramos. Mientras tanto puedes ocultar tu perfil tú misma desde "Mi perfil" cuando quieras, sin perder tus datos.' },
  { q: '¿Cómo denuncio un perfil o un mensaje?', a: 'Desde cualquier perfil o conversación hay un botón de "Reportar" que llega directamente al equipo de Tentare, no a la otra persona.' },
] as const;

export default async function NetworkLandingPage() {
  const admin = getSupabaseAdmin();
  const resultado = admin
    ? await buscarPerfilesPublico(admin, { ciudad: null, especialidades: [], disponibilidad: [], horarios: [], tipoTrabajo: [], experienciaMinima: null, tarifaRango: [], soloIdentidadVerificada: false, soloExperienciaVerificada: false, soloCertificacionVerificada: false, valoracionMinima: null, idioma: null })
    : null;
  const perfiles = resultado && 'perfiles' in resultado ? resultado.perfiles : [];
  const destacadas = [...perfiles].sort((a, b) => Number(b.destacado) - Number(a.destacado)).slice(0, 4);
  // Para el hero: una foto REAL antes que el flag `destacado` — auditoría UX
  // 2026-08-19 midió que con 0-2 perfiles reales, `destacadas[0]` puede ser
  // justo el único sin foto (ordenado primero por `destacado`), y eso hacía
  // caer al fallback de foto de stock genérica aun habiendo una foto de
  // instructora real disponible. Mostrar la persona real pesa más para la
  // confianza que respetar el orden de "destacado".
  const heroPerfil = perfiles.find(p => p.fotoUrl) ?? null;

  // FAQ_ITEMS ya existe y se pinta más abajo (<details>/<summary>) — esto
  // solo declara el mismo contenido como dato estructurado, sin duplicar
  // copy nuevo.
  const faqLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQ_ITEMS.map(({ q, a }) => ({
      '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a },
    })),
  };

  return (
    <div style={{ background: NW_FONDO, color: NW_TINTA }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd).replace(/</g, '\\u003c') }} />
      <NavPublico />

      <section className="max-w-[1240px] mx-auto px-6 pt-16 pb-20 grid lg:grid-cols-2 gap-14 items-center">
        <div>
          <span className="nw-fade-up inline-block">
            <Eyebrow>Red profesional de instructoras de Pilates y Yoga</Eyebrow>
          </span>
          <h1 className="nw-fade-up mt-5 text-[44px] sm:text-[58px] font-extrabold leading-[0.96] tracking-tight text-balance" style={{ animationDelay: '60ms' }}>
            Encuentra la{' '}
            <span style={{ ...FUENTE_DISPLAY, color: NW_PRODUCTO, fontWeight: 400 }}>instructora de Pilates y Yoga</span>{' '}
            que necesitas.
          </h1>
          <p className="nw-fade-up mt-5 text-[17.5px]" style={{ color: NW_MUTED, animationDelay: '120ms' }}>
            Publica lo que buscas o explora perfiles verificados directamente. Sin comisiones, sin intermediarios.
          </p>
          <div className="nw-fade-up mt-8" style={{ animationDelay: '190ms' }}>
            <BuscadorHero />
          </div>
          {/* Discreto a propósito, DEBAJO del CTA — no lo primero que se lee.
              Auditoría UX 2026-08-19: un badge grande de "beta/empezando" como
              primer elemento del hero comunica "esto está vacío" antes de que
              nadie llegue a leer la propuesta. La honestidad sobre la beta se
              queda (no se oculta), solo deja de competir con el mensaje
              principal por la atención de los primeros 2 segundos. */}
          <p className="nw-fade-up mt-5 flex items-center gap-2 text-[12.5px] font-medium" style={{ color: NW_MUTED, animationDelay: '260ms' }}>
            <span className="nw-pulse-dot w-[6px] h-[6px] rounded-full" style={{ background: NW_PRODUCTO }} />
            Beta · empezando en Barcelona y Madrid
          </p>
        </div>
        {heroPerfil ? (
          <div className="nw-fade-up relative" style={{ animationDelay: '140ms' }}>
            <FotoInstructora fotoUrl={heroPerfil.fotoUrl!} nombre={heroPerfil.nombre} aspectRatio="1 / 1.08" radius={26} eager />
            <div
              className="absolute top-5 left-5 inline-flex items-center gap-2 px-4 py-2 rounded-full text-[13px] font-bold"
              style={{ background: 'rgba(250,249,245,.88)', backdropFilter: 'blur(8px)', color: NW_TINTA }}
            >
              {heroPerfil.experienciaVerificada && (
                <span className="w-[22px] h-[22px] rounded-full flex items-center justify-center text-white text-[11px]" style={{ background: NW_PRODUCTO }}>✓</span>
              )}
              {heroPerfil.nombre}{heroPerfil.ciudad ? ` · ${heroPerfil.ciudad}` : ''}
            </div>
          </div>
        ) : (
          // Sin ninguna instructora con foto todavía (red nueva): foto de
          // marca del hero con efecto parallax sutil, en vez del placeholder
          // rayado de FotoInstructora (ese comunica "foto rota" a tamaño de
          // tarjeta, y aquí ocupa media pantalla). Solo escritorio: en móvil
          // un genérico de stock no aporta credibilidad, mejor no ocupar la
          // pantalla con él (auditoría UX) — una foto REAL sí se muestra en
          // móvil (rama de arriba, sin `hidden`).
          <div className="nw-fade-up hidden lg:block" style={{ animationDelay: '140ms' }}>
            <HeroParallax src="/network/hero-reformer.webp" alt="" />
          </div>
        )}
      </section>

      {destacadas.length > 0 && (
        <section className="max-w-[1240px] mx-auto px-6 pb-20">
          <Reveal className="flex items-end justify-between mb-6">
            <h2 className="text-[26px] font-extrabold tracking-tight">Descubre instructoras de Pilates y Yoga</h2>
            {/* Solo con inventario suficiente de verdad — auditoría UX
                2026-08-19: mandar tráfico a /network/instructoras con 2
                perfiles reales es mandar a la gente a una página que, en
                cuanto filtra por ciudad o especialidad, casi siempre da 0
                resultados. Sin este link, quien quiere un perfil concreto
                usa el formulario de #estudios (concierge) en su lugar. */}
            {perfiles.length >= 5 && (
              <Link href="/network/instructoras" className="text-[13.5px] font-bold hover:opacity-70" style={{ color: NW_PRODUCTO }}>
                Ver todas →
              </Link>
            )}
          </Reveal>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {destacadas.map((p, i) => (
              <Reveal key={p.id} delayMs={i * 60}>
                <TarjetaInstructora perfil={p} />
              </Reveal>
            ))}
          </div>
        </section>
      )}

      <section id="problema" className="max-w-[920px] mx-auto px-6 pb-20 scroll-mt-6">
        <Reveal>
          <Eyebrow>Buscar trabajo como instructora</Eyebrow>
          <h2 className="mt-4 text-[28px] sm:text-[38px] font-extrabold leading-[1.02] tracking-tight max-w-[16ch] text-balance">
            Esto es lo que hay hoy.
          </h2>
        </Reveal>
        <div className="mt-10 flex flex-col gap-3.5">
          {PROBLEMA_ITEMS.map((item, i) => (
            <Reveal key={item.sin} delayMs={i * 70} className="grid sm:grid-cols-2 gap-3.5">
              <div className="flex items-start gap-2.5 px-5 py-4.5 rounded-2xl" style={{ background: NW_PROBLEMA.fondo, color: NW_PROBLEMA.texto }}>
                <span className="mt-0.5 flex-shrink-0" style={{ color: NW_PROBLEMA.icono }}>✕</span>
                <p className="text-[14.5px] leading-[1.55] m-0">{item.sin}</p>
              </div>
              <div className="flex items-start gap-2.5 px-5 py-4.5 rounded-2xl font-medium" style={{ background: NW_ESTADO.verificada.fondo, color: NW_TINTA }}>
                <span className="mt-0.5 flex-shrink-0" style={{ color: NW_PRODUCTO }}>✓</span>
                <p className="text-[14.5px] leading-[1.55] m-0">{item.con}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <section id="problema-estudio" className="max-w-[920px] mx-auto px-6 pb-20 scroll-mt-6">
        <Reveal>
          <Eyebrow>Buscar instructoras para tu estudio</Eyebrow>
          <h2 className="mt-4 text-[28px] sm:text-[38px] font-extrabold leading-[1.02] tracking-tight max-w-[18ch] text-balance">
            Encontrar a la persona adecuada no debería ser un caos.
          </h2>
        </Reveal>
        <div className="mt-10 flex flex-col gap-3.5">
          {PROBLEMA_ESTUDIO_ITEMS.map((item, i) => (
            <Reveal key={item.sin} delayMs={i * 70} className="grid sm:grid-cols-2 gap-3.5">
              <div className="flex items-start gap-2.5 px-5 py-4.5 rounded-2xl" style={{ background: NW_PROBLEMA.fondo, color: NW_PROBLEMA.texto }}>
                <span className="mt-0.5 flex-shrink-0" style={{ color: NW_PROBLEMA.icono }}>✕</span>
                <p className="text-[14.5px] leading-[1.55] m-0">{item.sin}</p>
              </div>
              <div className="flex items-start gap-2.5 px-5 py-4.5 rounded-2xl font-medium" style={{ background: NW_ESTADO.verificada.fondo, color: NW_TINTA }}>
                <span className="mt-0.5 flex-shrink-0" style={{ color: NW_PRODUCTO }}>✓</span>
                <p className="text-[14.5px] leading-[1.55] m-0">{item.con}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <section id="como-funciona" className="max-w-[1240px] mx-auto px-6 pb-20 scroll-mt-6">
        <Reveal className="mb-6">
          <h2 className="text-[26px] font-extrabold tracking-tight">Cómo funciona</h2>
        </Reveal>
        <div className="grid md:grid-cols-2 gap-6">
          <Reveal className="rounded-[26px] p-10" style={{ background: NW_SAGE }}>
            <p className="text-[12px] font-bold uppercase tracking-wide mb-6" style={{ color: NW_PRODUCTO }}>Para instructoras</p>
            <div className="flex flex-col gap-6">
              {PASOS_INSTRUCTORA.map(paso => (
                <div key={paso.n}>
                  <span className="text-[34px] leading-none" style={{ ...FUENTE_DISPLAY, color: NW_PRODUCTO }}>{paso.n}</span>
                  <h3 className="mt-1 text-[16px] font-extrabold">{paso.titulo}</h3>
                  <p className="mt-1 text-[13.5px]" style={{ color: NW_MUTED }}>{paso.desc}</p>
                </div>
              ))}
            </div>
          </Reveal>
          <Reveal delayMs={80} className="rounded-[26px] p-10 bg-white" style={{ border: `1px solid ${NW_BORDE}` }}>
            <p className="text-[12px] font-bold uppercase tracking-wide mb-6" style={{ color: NW_PRODUCTO }}>Para estudios</p>
            <div className="flex flex-col gap-6">
              {PASOS_ESTUDIO.map(paso => (
                <div key={paso.n}>
                  <span className="text-[34px] leading-none" style={{ ...FUENTE_DISPLAY, color: NW_PRODUCTO }}>{paso.n}</span>
                  <h3 className="mt-1 text-[16px] font-extrabold">{paso.titulo}</h3>
                  <p className="mt-1 text-[13.5px]" style={{ color: NW_MUTED }}>{paso.desc}</p>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* Banda de cita a sangre completa — rompe el patrón "caja tras caja"
          (auditoría de composición 2026-08-26: hasta aquí la página son 6
          secciones seguidas de tarjetas del mismo ancho/radio). Sin cifra
          inventada: es una promesa de producto ya verificable en el propio
          texto legal (LEGAL, "sin comisión"), no una estadística fabricada
          — mismo criterio que ya evita `resumenResenas`/tiempos de
          respuesta ficticios en el perfil público. */}
      <section className="py-20" style={{ background: NW_VERDE_OSCURO }}>
        <div className="max-w-[760px] mx-auto px-6 text-center">
          <Reveal>
            <p className="text-[36px] sm:text-[46px] leading-[1.12] text-white text-balance" style={FUENTE_DISPLAY}>
              Sin comisiones. Sin intermediarios.{' '}
              <span style={{ color: NW_ARENA }}>Solo el trabajo, visible.</span>
            </p>
          </Reveal>
        </div>
      </section>

      <section className="max-w-[1240px] mx-auto px-6 pb-24 pt-20 grid sm:grid-cols-2 gap-6">
        {/* Reencuadrado 2026-08-20 (tentare-producto): "espera a que te
            encuentren" es un beneficio pasivo y débil con 2 perfiles reales
            en toda la red — nadie va a "encontrarte" todavía. El perfil
            público (/network/instructoras/[slug]) ya existe y funciona como
            página propia enlazable independientemente de que haya tráfico
            de estudios o no; eso es lo que se vende primero. La promesa
            activa (el equipo avisa si encaja con una petición concierge) va
            después, no como titular — es cierta pero no es algo que se
            pueda prometer con fecha. */}
        <Reveal className="rounded-[24px] p-10 transition-transform duration-300 hover:-translate-y-1" style={{ background: NW_VERDE_OSCURO }}>
          <h2 className="text-[24px] font-extrabold text-white leading-tight">
            Soy instructora — Tu perfil profesional, listo para compartir.
          </h2>
          <p className="mt-3 text-[14px]" style={{ color: 'rgba(255,255,255,.72)' }}>
            Créalo en unos minutos y úsalo como tu CV online — en tu bio de Instagram, en un
            mensaje, donde quieras. Y si un estudio busca justo tu perfil, te avisamos nosotros.
            Gratis, sin comisión.
          </p>
          <EnlaceRastreo
            href="/network/crear-perfil"
            evento="network_click_crear_perfil"
            className="inline-block mt-6 px-6 py-3 rounded-full text-[14px] font-bold transition-transform hover:scale-[1.04]"
            style={{ background: NW_SAND, color: NW_VERDE_OSCURO }}
          >
            Crear perfil gratis
          </EnlaceRastreo>
        </Reveal>
        {/* Concierge como puerta principal del lado estudio, no el buscador
            — decisión de producto 2026-08-19 (tras auditoría cruzada
            producto+UX): con 2 perfiles públicos, "busca tú misma" casi
            siempre da 0 resultados. El equipo de Tentare cruza la petición
            contra la red completa de instructoras (incluidas las que ya
            trabajan en estudios Tentare, no solo los perfiles públicos),
            así que hay oferta real detrás aunque el directorio público
            todavía sea pequeño. El buscador sigue existiendo, pero como
            opción secundaria (enlace de texto), no como el CTA principal. */}
        <Reveal delayMs={80} className="rounded-[24px] p-10 bg-white transition-transform duration-300 hover:-translate-y-1" style={{ border: `1px solid ${NW_BORDE}` }}>
          <h2 className="text-[24px] font-extrabold leading-tight">
            Soy propietaria — Te buscamos a tu <span style={{ color: NW_PRODUCTO }}>próxima instructora</span>.
          </h2>
          <p className="mt-3 text-[14px]" style={{ color: NW_MUTED }}>
            Cuéntanos qué necesitas y cruzamos tu petición contra la red de instructoras — no solo los perfiles públicos, también las que ya trabajan en estudios Tentare — para presentarte candidatas directamente.
          </p>
          <a
            href="#estudios"
            className="inline-block mt-6 px-6 py-3 rounded-full text-[14px] font-bold text-white transition-transform hover:scale-[1.04]"
            style={{ background: NW_TINTA }}
          >
            Cuéntanos qué necesitas
          </a>
          <Link href="/network/instructoras" className="block mt-3 text-[12.5px] font-semibold hover:opacity-70" style={{ color: NW_MUTED }}>
            O explora los perfiles públicos tú misma →
          </Link>
        </Reveal>
      </section>

      <section id="estudios" className="max-w-[820px] mx-auto px-6 pb-24 scroll-mt-6">
        <Reveal className="rounded-[24px] p-10 bg-white" style={{ border: `1px solid ${NW_BORDE}` }}>
          <Eyebrow>Para estudios</Eyebrow>
          <h2 className="mt-3 text-[24px] font-extrabold tracking-tight">
            ¿Eres un estudio y estás buscando instructoras?
          </h2>
          <p className="mt-2 text-[14.5px]" style={{ color: NW_MUTED }}>
            No busques tú en un directorio que todavía está creciendo. Cuéntanos qué necesitas
            — especialidad, ciudad, tipo de colaboración — y el equipo de Tentare cruza tu
            petición contra la red de instructoras, incluidas las que ya trabajan en estudios
            Tentare, para presentarte candidatas directamente.
          </p>
          <div className="mt-6">
            <FormularioInteresEstudio variante="completo" />
          </div>
        </Reveal>
      </section>

      {/* Banda sage a sangre completa — la página hasta aquí alternaba solo
          entre "sin fondo" (NW_FONDO) y el negro de la cita; esta sección
          recupera el sage que ya usaba "Cómo funciona" para dar un tercer
          punto de referencia visual antes del pie, en vez de que todo el
          tramo final vuelva a leerse como una única superficie continua. */}
      <section id="confianza" className="py-24 scroll-mt-6" style={{ background: NW_SAGE }}>
        <div className="max-w-[1240px] mx-auto px-6">
          <Reveal>
            <Eyebrow>Confianza</Eyebrow>
            <h2 className="mt-4 text-[26px] sm:text-[32px] font-extrabold tracking-tight">Por qué puedes fiarte de un perfil</h2>
          </Reveal>
          <div className="mt-10 grid sm:grid-cols-3 gap-6">
            {CONFIANZA_ITEMS.map((item, i) => (
              <Reveal
                key={item.titulo} delayMs={i * 80}
                className="rounded-2xl p-6 bg-white transition-transform duration-300 hover:-translate-y-1"
                style={{ border: `1px solid ${NW_BORDE}` }}
              >
                <span className="block text-[26px] leading-none" style={{ ...FUENTE_DISPLAY, color: NW_PRODUCTO }}>0{i + 1}</span>
                <h3 className="mt-1 text-[16px] font-extrabold">{item.titulo}</h3>
                <p className="mt-2 text-[14px]" style={{ color: NW_MUTED }}>{item.texto}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section id="casos-de-uso" className="max-w-[1240px] mx-auto px-6 pb-24 scroll-mt-6">
        <Reveal>
          <h2 className="text-[26px] font-extrabold tracking-tight">Cuándo se usa Tentare Network</h2>
          {/* Etiquetado explícito como escenario, nunca como historia real —
              brief punto 15/33: "no inventar usuarios". */}
          <p className="mt-1.5 text-[13.5px]" style={{ color: NW_MUTED }}>Situaciones habituales, no casos reales.</p>
        </Reveal>
        <div className="mt-8 grid sm:grid-cols-3 gap-6">
          {CASOS_USO.map((c, i) => (
            <Reveal key={c.titulo} delayMs={i * 80} className="rounded-2xl p-6 bg-white" style={{ border: `1px solid ${NW_BORDE}` }}>
              <h3 className="text-[15.5px] font-extrabold">{c.titulo}</h3>
              <p className="mt-2 text-[13.5px] leading-[1.5]" style={{ color: NW_MUTED }}>{c.texto}</p>
            </Reveal>
          ))}
        </div>
      </section>

      <section id="por-que" className="max-w-[820px] mx-auto px-6 pb-24 scroll-mt-6">
        <Reveal className="rounded-[24px] p-10" style={{ background: NW_SAGE }}>
          <h2 className="text-[22px] font-extrabold tracking-tight">Por qué construimos esto</h2>
          <p className="mt-3 text-[14.5px] leading-[1.6]" style={{ color: NW_MUTED }}>
            Tentare ya gestiona la agenda, los pagos y el equipo de estudios reales de Pilates
            y Yoga. Una y otra vez vimos el mismo problema fuera de nuestro software: encontrar
            o cubrir una plaza de instructora se resolvía a mano, por WhatsApp, sin ninguna
            forma de saber quién estaba disponible de verdad. Network es esa pieza que faltaba
            — construida por el mismo equipo, empezando desde cero y con la beta a la vista,
            no escondida.
          </p>
          <p className="mt-3 text-[13.5px]" style={{ color: NW_MUTED }}>
            ¿Preguntas, feedback o algo que no cuadra? Escríbenos a{' '}
            <a href="mailto:hola@tentare.app" className="font-semibold hover:underline" style={{ color: NW_TINTA }}>hola@tentare.app</a>.
          </p>
        </Reveal>
      </section>

      <section id="faq" className="max-w-[820px] mx-auto px-6 pb-24 scroll-mt-6">
        <Reveal>
          <h2 className="text-[26px] font-extrabold tracking-tight">Preguntas frecuentes</h2>
        </Reveal>
        <div className="mt-8 flex flex-col gap-3">
          {FAQ_ITEMS.map((item, i) => (
            <Reveal key={item.q} delayMs={Math.min(i, 6) * 45}>
              <details className="group rounded-2xl px-5 py-4 bg-white transition-colors" style={{ border: `1px solid ${NW_BORDE}` }}>
                <summary className="text-[15px] font-bold cursor-pointer list-none flex items-center justify-between gap-4">
                  {item.q}
                  <span className="text-[18px] font-normal group-open:rotate-45 transition-transform" style={{ color: NW_PRODUCTO }}>+</span>
                </summary>
                <p className="mt-3 text-[14px] leading-[1.6]" style={{ color: NW_MUTED }}>{item.a}</p>
              </details>
            </Reveal>
          ))}
        </div>
      </section>

      <PieNetwork />
    </div>
  );
}
