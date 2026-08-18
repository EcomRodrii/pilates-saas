import type { Metadata } from 'next';
import Link from 'next/link';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { buscarPerfilesPublico } from '@/lib/network/publico';
import { LogoTentare } from '@/components/marca/logo-tentare';
import { NavPublico } from '@/components/network-v2/NavPublico';
import { PieNetwork } from '@/components/network-v2/PieNetwork';
import { BuscadorHero } from '@/components/network-v2/BuscadorHero';
import { TarjetaInstructora } from '@/components/network-v2/TarjetaInstructora';
import { FotoInstructora } from '@/components/network-v2/FotoInstructora';
import { NW_FONDO, NW_TINTA, NW_MUTED, NW_SAGE, NW_SAND, NW_BORDE, NW_VERDE_OSCURO, NW_PRODUCTO, NW_ESTADO, NW_PROBLEMA } from '@/components/network-v2/tokens';

// Landing pública de Tentare Network (1a del rediseño) — Server Component:
// "sin esto Google ve un div vacío", mismo criterio que ya usa
// app/network/instructoras/page.tsx para el marketplace. Ocupa la ruta
// literal /network, que hasta ahora tenía el buscador de la propietaria
// (movido a /network/buscar, ver lib/nav-config.ts).
export const metadata: Metadata = {
  title: 'Tentare Network — Encuentra tu instructora de Pilates y Yoga',
  description: 'La red profesional de instructoras de Pilates y Yoga. Estudios buscan por especialidad, ciudad y disponibilidad, y contactan directamente.',
};

const PASOS_COMO_FUNCIONA = [
  { n: '01', titulo: 'Descubre', desc: 'Filtra por especialidad, ciudad y disponibilidad entre instructoras verificadas.' },
  { n: '02', titulo: 'Conoce', desc: 'Perfil completo: experiencia, formación, disponibilidad semanal y opiniones de otros estudios.' },
  { n: '03', titulo: 'Contacta', desc: 'Escríbele directamente. Sin comisiones ni intermediarios — habláis vosotras dos.' },
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
  { titulo: 'Email verificado', texto: 'Todo perfil confirma su email antes de publicarse.' },
  { titulo: 'Experiencia confirmada', texto: 'Puedes pedir que un estudio que ya usa Tentare confirme que trabajaste ahí — se marca como verificada en tu perfil.' },
  { titulo: 'Actividad reciente', texto: 'Se nota si sigues buscando o si tu perfil lleva meses parado.' },
] as const;

const FAQ_ITEMS = [
  { q: '¿Cuesta dinero crear mi perfil?', a: 'No. Publicar tu perfil en Tentare Network es gratis y sin comisión sobre lo que cobres a los estudios.' },
  { q: '¿Tengo que dejar mi trabajo actual?', a: 'No. Puedes marcarte como "disponible para sustituciones" aunque ya trabajes en otro estudio, o "buscando trabajo" si es lo que necesitas ahora mismo. Cambias el estado cuando quieras.' },
  { q: '¿Quién ve mi teléfono y mi email?', a: 'Nadie, hasta que tú aceptas una solicitud de contacto de un estudio. Antes de eso, solo ven tu perfil público: especialidad, experiencia, disponibilidad y tarifa orientativa.' },
  { q: '¿Cómo saben los estudios que mi experiencia es real?', a: 'Puedes pedir que un estudio donde trabajaste, si usa Tentare, confirme esa experiencia desde su propia cuenta — se marca como verificada en tu perfil, no es algo que rellenes tú misma.' },
  { q: '¿Puedo ocultar mi perfil si dejo de buscar?', a: 'Sí, en cualquier momento, sin perder los datos que ya rellenaste. Vuelves a publicarlo cuando quieras.' },
  { q: '¿Necesito que mi estudio use Tentare para unirme?', a: 'No. Tu perfil en Network es una cuenta independiente, sin ningún estudio detrás. Da igual el software que use el estudio donde trabajas.' },
] as const;

export default async function NetworkLandingPage() {
  const admin = getSupabaseAdmin();
  const resultado = admin
    ? await buscarPerfilesPublico(admin, { ciudad: null, especialidades: [], disponibilidad: [], horarios: [], tipoTrabajo: [], experienciaMinima: null, tarifaRango: [], soloIdentidadVerificada: false, soloExperienciaVerificada: false, soloCertificacionVerificada: false, valoracionMinima: null, idioma: null })
    : null;
  const perfiles = resultado && 'perfiles' in resultado ? resultado.perfiles : [];
  const destacadas = [...perfiles].sort((a, b) => Number(b.destacado) - Number(a.destacado)).slice(0, 4);

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
          <p className="text-[13px] font-bold uppercase tracking-[.16em]" style={{ color: NW_PRODUCTO }}>
            Red profesional de instructoras de Pilates y Yoga
          </p>
          <h1 className="mt-5 text-[44px] sm:text-[56px] font-extrabold leading-[0.98] tracking-tight text-balance">
            Encuentra la{' '}
            <span style={{ color: NW_PRODUCTO }}>instructora de Pilates y Yoga</span>{' '}
            que necesitas.
          </h1>
          <p className="mt-5 text-[17.5px]" style={{ color: NW_MUTED }}>
            Publica lo que buscas o explora perfiles verificados directamente. Sin comisiones, sin intermediarios.
          </p>
          <div className="mt-8">
            <BuscadorHero />
          </div>
        </div>
        {destacadas[0]?.fotoUrl ? (
          <div className="relative">
            <FotoInstructora fotoUrl={destacadas[0].fotoUrl} nombre="" aspectRatio="1 / 1.08" radius={26} eager />
            <div
              className="absolute top-5 left-5 inline-flex items-center gap-2 px-4 py-2 rounded-full text-[13px] font-bold"
              style={{ background: 'rgba(250,249,245,.88)', backdropFilter: 'blur(8px)', color: NW_TINTA }}
            >
              <span className="w-[26px] h-[26px] rounded-full flex items-center justify-center text-white" style={{ background: NW_PRODUCTO }}>✓</span>
              {perfiles.length} perfiles verificados
            </div>
          </div>
        ) : (
          // Sin ninguna instructora destacada todavía (red nueva, sin
          // fotos que mostrar): un panel de marca sólido, nunca el
          // placeholder rayado de FotoInstructora — ese comunica "foto
          // rota" a tamaño de tarjeta, y aquí ocupa media pantalla.
          <div
            className="hidden lg:flex items-center justify-center rounded-[26px]"
            style={{ aspectRatio: '1 / 1.08', background: NW_VERDE_OSCURO }}
          >
            <LogoTentare formato="isotipo" tinta="blanco" alto={72} decorativo />
          </div>
        )}
      </section>

      {destacadas.length > 0 && (
        <section className="max-w-[1240px] mx-auto px-6 pb-20">
          <div className="flex items-end justify-between mb-6">
            <h2 className="text-[26px] font-extrabold tracking-tight">Descubre instructoras de Pilates y Yoga</h2>
            <Link href="/network/instructoras" className="text-[13.5px] font-bold hover:opacity-70" style={{ color: NW_PRODUCTO }}>
              Ver todas →
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {destacadas.map(p => <TarjetaInstructora key={p.id} perfil={p} />)}
          </div>
        </section>
      )}

      <section id="problema" className="max-w-[920px] mx-auto px-6 pb-20 scroll-mt-6">
        <p className="text-[13px] font-bold uppercase tracking-[.16em]" style={{ color: NW_PRODUCTO }}>
          Buscar trabajo como instructora
        </p>
        <h2 className="mt-4 text-[28px] sm:text-[38px] font-extrabold leading-[1.02] tracking-tight max-w-[16ch] text-balance">
          Esto es lo que hay hoy.
        </h2>
        <div className="mt-10 flex flex-col gap-3.5">
          {PROBLEMA_ITEMS.map(item => (
            <div key={item.sin} className="grid sm:grid-cols-2 gap-3.5">
              <div className="flex items-start gap-2.5 px-5 py-4.5 rounded-2xl" style={{ background: NW_PROBLEMA.fondo, color: NW_PROBLEMA.texto }}>
                <span className="mt-0.5 flex-shrink-0" style={{ color: NW_PROBLEMA.icono }}>✕</span>
                <p className="text-[14.5px] leading-[1.55] m-0">{item.sin}</p>
              </div>
              <div className="flex items-start gap-2.5 px-5 py-4.5 rounded-2xl font-medium" style={{ background: NW_ESTADO.verificada.fondo, color: NW_TINTA }}>
                <span className="mt-0.5 flex-shrink-0" style={{ color: NW_PRODUCTO }}>✓</span>
                <p className="text-[14.5px] leading-[1.55] m-0">{item.con}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section id="como-funciona" className="max-w-[1240px] mx-auto px-6 pb-20 scroll-mt-6">
        <div className="rounded-[26px] p-12" style={{ background: NW_SAGE }}>
          <div className="grid sm:grid-cols-3 gap-10">
            {PASOS_COMO_FUNCIONA.map(paso => (
              <div key={paso.n}>
                <span className="text-[32px] font-extrabold" style={{ color: NW_PRODUCTO }}>{paso.n}</span>
                <h3 className="mt-2 text-[19px] font-extrabold">{paso.titulo}</h3>
                <p className="mt-1.5 text-[14px]" style={{ color: NW_MUTED }}>{paso.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="max-w-[1240px] mx-auto px-6 pb-24 grid sm:grid-cols-2 gap-6">
        <div className="rounded-[24px] p-10" style={{ background: NW_VERDE_OSCURO }}>
          <h2 className="text-[24px] font-extrabold text-white leading-tight">
            Soy instructora — Deja que los estudios te encuentren.
          </h2>
          <p className="mt-3 text-[14px]" style={{ color: 'rgba(255,255,255,.72)' }}>
            Publica tu perfil, tu disponibilidad y tu experiencia. Gratis, sin comisión.
          </p>
          <Link
            href="/network/crear-perfil"
            className="inline-block mt-6 px-6 py-3 rounded-full text-[14px] font-bold"
            style={{ background: NW_SAND, color: NW_VERDE_OSCURO }}
          >
            Crear perfil gratis
          </Link>
        </div>
        <div className="rounded-[24px] p-10 bg-white" style={{ border: `1px solid ${NW_BORDE}` }}>
          <h2 className="text-[24px] font-extrabold leading-tight">
            Soy propietaria — Encuentra a tu <span style={{ color: NW_PRODUCTO }}>próxima instructora</span>.
          </h2>
          <p className="mt-3 text-[14px]" style={{ color: NW_MUTED }}>
            Filtra por especialidad, ciudad y disponibilidad. Sin publicar una oferta ni esperar candidaturas.
          </p>
          <Link
            href="/network/instructoras"
            className="inline-block mt-6 px-6 py-3 rounded-full text-[14px] font-bold text-white"
            style={{ background: NW_TINTA }}
          >
            Explorar la network
          </Link>
        </div>
      </section>

      <section id="confianza" className="max-w-[1240px] mx-auto px-6 pb-24 scroll-mt-6">
        <h2 className="text-[26px] font-extrabold tracking-tight">Por qué puedes fiarte de un perfil</h2>
        <div className="mt-8 grid sm:grid-cols-3 gap-6">
          {CONFIANZA_ITEMS.map(item => (
            <div key={item.titulo} className="rounded-2xl p-6 bg-white" style={{ border: `1px solid ${NW_BORDE}` }}>
              <h3 className="text-[16px] font-extrabold">{item.titulo}</h3>
              <p className="mt-2 text-[14px]" style={{ color: NW_MUTED }}>{item.texto}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="faq" className="max-w-[820px] mx-auto px-6 pb-24 scroll-mt-6">
        <h2 className="text-[26px] font-extrabold tracking-tight">Preguntas frecuentes</h2>
        <div className="mt-8 flex flex-col gap-3">
          {FAQ_ITEMS.map(item => (
            <details key={item.q} className="group rounded-2xl px-5 py-4 bg-white" style={{ border: `1px solid ${NW_BORDE}` }}>
              <summary className="text-[15px] font-bold cursor-pointer list-none flex items-center justify-between gap-4">
                {item.q}
                <span className="text-[18px] font-normal group-open:rotate-45 transition-transform" style={{ color: NW_PRODUCTO }}>+</span>
              </summary>
              <p className="mt-3 text-[14px] leading-[1.6]" style={{ color: NW_MUTED }}>{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      <PieNetwork />
    </div>
  );
}
