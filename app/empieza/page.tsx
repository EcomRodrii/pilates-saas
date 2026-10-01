import type { Metadata } from 'next';
import Link from 'next/link';
import { Check } from 'lucide-react';
import { LogoTentare } from '@/components/marca/logo-tentare';
import { MedicionLanding } from '@/components/landing/MedicionLanding';
import { ACC, ACC_SOFT, BG, MUTED, btnCta } from '@/components/landing/theme';
import { ALTA, WHATSAPP_SOPORTE } from '@/components/landing/enlaces';
import { enlaceWhatsApp } from '@/lib/decision/mensajes-socia';
import { G2_NOTA, G2_URL } from '@/lib/seo/g2';

// Página de aterrizaje para quien llega desde TikTok (el enlace de la bio).
//
// Por qué existe (PostHog, 14 días a 1-oct-2026): TikTok trajo 576 visitas a la
// home, el 75 % se fue sin pasar de la primera pantalla y ninguna se dio de
// alta. La home está pensada para quien compara programas despacio; quien viene
// de un vídeo en el móvil necesita la promesa, el precio y el botón en una sola
// pantalla.
//
// No se indexa (lib/seo/no-indexables.ts): repite las promesas de la home y
// competiría con ella. Los clics se miden con el mismo oyente que la home
// (MedicionLanding); `$pathname` = /empieza los separa en el embudo.

export const metadata: Metadata = {
  title: 'Empieza gratis con Tentare',
  description: 'Reservas, bonos y cobros de tu estudio de pilates en una app con tu nombre. 7 días gratis, sin tarjeta.',
  robots: { index: false, follow: true },
};

const VENTAJAS = [
  'Tus alumnas reservan y cancelan solas desde el móvil',
  'Los bonos se descuentan solos y los cobros entran por tarjeta o SEPA',
  'Si falla una instructora, Tentare busca sustituta por ti',
];

export default function EmpiezaPage() {
  const whatsapp = enlaceWhatsApp(WHATSAPP_SOPORTE, 'Hola, vengo de TikTok y tengo una duda sobre Tentare:') ?? '#';
  return (
    <main className="min-h-dvh px-4 py-8" style={{ background: BG, color: ACC }}>
      <MedicionLanding />
      <div className="mx-auto flex max-w-md flex-col gap-8">
        <Link href="/" aria-label="Tentare, ir a la página principal" className="self-start">
          <LogoTentare alto={28} />
        </Link>

        <section id="hero" className="flex flex-col gap-5">
          <h1 className="text-[2.1rem] font-extrabold leading-[1.1] tracking-tight">
            Tu estudio de pilates, sin Excel ni WhatsApp
          </h1>
          <p className="text-lg leading-snug" style={{ color: MUTED }}>
            Reservas, bonos y cobros en una app con el nombre de tu estudio.
          </p>
          <Link href={ALTA} className={`${btnCta} px-6 py-4 text-center text-lg font-bold`}>
            Crear mi estudio gratis
          </Link>
          <p className="text-center text-sm" style={{ color: MUTED }}>
            7 días de prueba · sin tarjeta · sin permanencia
          </p>
        </section>

        <ul className="flex flex-col gap-3 rounded-3xl p-5" style={{ background: ACC_SOFT }}>
          {VENTAJAS.map((v) => (
            <li key={v} className="flex gap-3 text-base leading-snug">
              <Check aria-hidden className="mt-0.5 h-5 w-5 shrink-0" strokeWidth={2.5} />
              <span>{v}</span>
            </li>
          ))}
        </ul>

        <section id="precio" className="flex flex-col gap-4 text-center" data-cta-final>
          <p className="text-xl font-bold">Desde 29 €/mes, IVA incluido.</p>
          <a href={G2_URL} target="_blank" rel="noopener noreferrer" className="text-sm underline-offset-2 hover:underline" style={{ color: MUTED }}>
            <span aria-hidden>★★★★★</span> Valorado {G2_NOTA} en G2
          </a>
          <Link href={ALTA} className={`${btnCta} px-6 py-4 text-lg font-bold`}>
            Empezar ahora
          </Link>
          <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold underline underline-offset-2">
            ¿Dudas? Escríbenos por WhatsApp
          </a>
        </section>

        <p className="text-center text-xs" style={{ color: MUTED }}>
          <Link href="/" className="underline underline-offset-2">Ver todo lo que hace Tentare</Link>
          {' · '}
          <Link href="/precios" className="underline underline-offset-2">Planes y precios</Link>
        </p>
      </div>
    </main>
  );
}
