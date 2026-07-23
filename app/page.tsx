'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { IBM_Plex_Mono } from 'next/font/google';
import { useAuth } from '@/lib/auth-context';
import { useStudio } from '@/lib/studio-context';
import { useRol } from '@/lib/permisos';
import { tieneFeature } from '@/lib/billing/entitlements';
import { BG } from '@/components/landing/theme';
import { Nav } from '@/components/landing/Nav';
import { Hero } from '@/components/landing/Hero';
import { Problema } from '@/components/landing/Problema';
import { AntesDespues } from '@/components/landing/AntesDespues';
import { Recorrido } from '@/components/landing/Recorrido';
import { Sustituciones } from '@/components/landing/Sustituciones';
import { Autonomia } from '@/components/landing/Autonomia';
import { CentroDeControl } from '@/components/landing/CentroDeControl';
import { UnDia } from '@/components/landing/UnDia';
import { Disciplinas } from '@/components/landing/Disciplinas';
import { Integraciones } from '@/components/landing/Integraciones';
import { SinFormacion } from '@/components/landing/SinFormacion';
import { Migracion } from '@/components/landing/Migracion';
import { Precio } from '@/components/landing/Precio';
import { Faq } from '@/components/landing/Faq';
import { CtaFinal } from '@/components/landing/CtaFinal';
import { Footer } from '@/components/landing/Footer';
import { GlobalStyles } from '@/components/landing/GlobalStyles';

const plexMono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-plex-mono' });

export default function LandingPage() {
  // Los usuarios AUTENTICADOS que aterrizan en "/" (logo, marcador, tras
  // cerrar sesión y volver) van a su home real; los anónimos ven la landing.
  const router = useRouter();
  const { session } = useAuth();
  const { studio } = useStudio();
  const rol = useRol();
  useEffect(() => {
    if (!session || !studio) return;
    const tieneDecisionOS =
      rol === 'PROPIETARIO' &&
      tieneFeature({ plan: studio.plan, subscriptionStatus: studio.subscriptionStatus }, 'decisiones');
    router.replace(tieneDecisionOS ? '/centro-de-control' : '/dashboard');
  }, [session, studio, rol, router]);

  return (
    <div className={plexMono.variable} style={{ background: BG, color: '#1A1A1A', overflowX: 'clip', position: 'relative' }}>
      <Nav />
      <Hero />
      <Problema />
      <AntesDespues />
      <Recorrido />
      <Sustituciones />
      <Autonomia />
      <CentroDeControl />
      <UnDia />
      <Disciplinas />
      <Integraciones />
      <SinFormacion />
      <Migracion />
      <Precio />
      <Faq />
      <CtaFinal />
      <Footer />
      <GlobalStyles />
    </div>
  );
}
