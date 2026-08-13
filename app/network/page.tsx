import type { Metadata } from 'next';
import Link from 'next/link';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { buscarPerfilesPublico } from '@/lib/network/publico';
import { NavPublico } from '@/components/network-v2/NavPublico';
import { PieNetwork } from '@/components/network-v2/PieNetwork';
import { BuscadorHero } from '@/components/network-v2/BuscadorHero';
import { TarjetaInstructora } from '@/components/network-v2/TarjetaInstructora';
import { FotoInstructora } from '@/components/network-v2/FotoInstructora';
import { NW_FONDO, NW_TINTA, NW_MUTED, NW_SAGE, NW_VERDE_OSCURO, NW_PRODUCTO } from '@/components/network-v2/tokens';

// Landing pública de Tentare Network (1a del rediseño) — Server Component:
// "sin esto Google ve un div vacío", mismo criterio que ya usa
// app/network/instructoras/page.tsx para el marketplace. Ocupa la ruta
// literal /network, que hasta ahora tenía el buscador de la propietaria
// (movido a /network/buscar, ver lib/nav-config.ts).
export const metadata: Metadata = {
  title: 'Tentare Network — Encuentra tu instructora de Pilates',
  description: 'La red profesional de instructoras de Pilates. Estudios buscan por especialidad, ciudad y disponibilidad, y contactan directamente.',
};

const PASOS_COMO_FUNCIONA = [
  { n: '01', titulo: 'Descubre', desc: 'Filtra por especialidad, ciudad y disponibilidad entre instructoras verificadas.' },
  { n: '02', titulo: 'Conoce', desc: 'Perfil completo: experiencia, formación, disponibilidad semanal y opiniones de otros estudios.' },
  { n: '03', titulo: 'Contacta', desc: 'Escríbele directamente. Sin comisiones ni intermediarios — habláis vosotras dos.' },
] as const;

export default async function NetworkLandingPage() {
  const admin = getSupabaseAdmin();
  const resultado = admin
    ? await buscarPerfilesPublico(admin, { ciudad: null, especialidades: [], disponibilidad: [], horarios: [], tipoTrabajo: [], experienciaMinima: null, tarifaRango: [] })
    : null;
  const perfiles = resultado && 'perfiles' in resultado ? resultado.perfiles : [];
  const destacadas = [...perfiles].sort((a, b) => Number(b.destacado) - Number(a.destacado)).slice(0, 4);

  return (
    <div style={{ background: NW_FONDO, color: NW_TINTA }}>
      <NavPublico />

      <section className="max-w-[1240px] mx-auto px-6 pt-16 pb-20 grid lg:grid-cols-2 gap-14 items-center">
        <div>
          <p className="text-[13px] font-bold uppercase tracking-[.16em]" style={{ color: NW_PRODUCTO }}>
            Red profesional de instructoras de Pilates
          </p>
          <h1 className="mt-5 text-[44px] sm:text-[56px] font-extrabold leading-[0.98] tracking-tight text-balance">
            Encuentra la{' '}
            <em className="font-normal not-italic" style={{ fontFamily: 'var(--font-display)', color: NW_PRODUCTO }}>
              instructora de Pilates
            </em>{' '}
            que necesitas.
          </h1>
          <p className="mt-5 text-[17.5px]" style={{ color: NW_MUTED }}>
            Publica lo que buscas o explora perfiles verificados directamente. Sin comisiones, sin intermediarios.
          </p>
          <div className="mt-8">
            <BuscadorHero />
          </div>
        </div>
        <div className="relative">
          <FotoInstructora fotoUrl={destacadas[0]?.fotoUrl} nombre="" aspectRatio="1 / 1.08" radius={26} />
          <div
            className="absolute top-5 left-5 inline-flex items-center gap-2 px-4 py-2 rounded-full text-[13px] font-bold"
            style={{ background: 'rgba(250,249,245,.88)', backdropFilter: 'blur(8px)', color: NW_TINTA }}
          >
            <span className="w-[26px] h-[26px] rounded-full flex items-center justify-center text-white" style={{ background: NW_PRODUCTO }}>✓</span>
            {perfiles.length > 0 ? `${perfiles.length} perfiles verificados` : 'Perfiles verificados'}
          </div>
        </div>
      </section>

      {destacadas.length > 0 && (
        <section className="max-w-[1240px] mx-auto px-6 pb-20">
          <div className="flex items-end justify-between mb-6">
            <h2 className="text-[26px] font-extrabold tracking-tight">Descubre instructoras de Pilates</h2>
            <Link href="/network/instructoras" className="text-[13.5px] font-bold hover:opacity-70" style={{ color: NW_PRODUCTO }}>
              Ver todas →
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {destacadas.map(p => <TarjetaInstructora key={p.id} perfil={p} />)}
          </div>
        </section>
      )}

      <section id="como-funciona" className="max-w-[1240px] mx-auto px-6 pb-20 scroll-mt-6">
        <div className="rounded-[26px] p-12" style={{ background: NW_SAGE }}>
          <div className="grid sm:grid-cols-3 gap-10">
            {PASOS_COMO_FUNCIONA.map(paso => (
              <div key={paso.n}>
                <span className="text-[36px] font-normal" style={{ fontFamily: 'var(--font-display)', color: NW_PRODUCTO }}>{paso.n}</span>
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
            Soy instructora — Deja que los estudios{' '}
            <em className="font-normal not-italic" style={{ fontFamily: 'var(--font-display)' }}>te encuentren</em>.
          </h2>
          <p className="mt-3 text-[14px]" style={{ color: 'rgba(255,255,255,.72)' }}>
            Publica tu perfil, tu disponibilidad y tu experiencia. Gratis, sin comisión.
          </p>
          <Link
            href="/network/crear-perfil"
            className="inline-block mt-6 px-6 py-3 rounded-full text-[14px] font-bold"
            style={{ background: '#F1ECE1', color: NW_VERDE_OSCURO }}
          >
            Crear perfil gratis
          </Link>
        </div>
        <div className="rounded-[24px] p-10 bg-white" style={{ border: '1px solid #E5E3DA' }}>
          <h2 className="text-[24px] font-extrabold leading-tight">
            Soy propietaria — Encuentra a tu{' '}
            <em className="font-normal not-italic" style={{ fontFamily: 'var(--font-display)', color: NW_PRODUCTO }}>próxima instructora</em>.
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

      <PieNetwork />
    </div>
  );
}
