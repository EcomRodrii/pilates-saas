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
import { IntroLogo } from '@/components/landing/IntroLogo';
import { StructuredData } from '@/components/landing/StructuredData';

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

  // El scroll nativo del navegador a #ancla (p. ej. /#precio) pierde la
  // carrera en esta página: con ~20 secciones, fuentes e imágenes aún
  // asentando el layout tras la hidratación, el navegador a veces intenta el
  // salto antes de que el elemento exista en su posición final y se queda
  // arriba del todo (detectado auditando: cargar /#precio en frío se quedaba
  // en la cabecera, no en Precio). Lo hacemos nosotros, con reintento por
  // frame hasta que el elemento exista, y una corrección a los 400ms por si
  // algo desplaza el layout justo después (p. ej. una fuente que termina de
  // cargar). `IntroLogo` es `position: fixed`, así que hacer scroll debajo de
  // la cortina mientras tapa la pantalla no tiene ningún efecto visible.
  useEffect(() => {
    if (!window.location.hash) return;
    const id = decodeURIComponent(window.location.hash.slice(1));
    let intentos = 0;
    let vivo = true;
    const intentar = () => {
      if (!vivo) return;
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ block: 'start' });
        setTimeout(() => { if (vivo) el.scrollIntoView({ block: 'start' }); }, 400);
      } else if (intentos < 20) {
        intentos++;
        requestAnimationFrame(intentar);
      }
    };
    requestAnimationFrame(intentar);
    return () => { vivo = false; };
  }, []);

  return (
    <div className={plexMono.variable} style={{ background: BG, color: '#1A1A1A', overflowX: 'clip', position: 'relative' }}>
      <StructuredData />
      {/* Va ARRIBA del todo pero se pinta solo en cliente: el HTML del servidor
          —el que ven Google y los lectores de pantalla— es la landing, sin
          cortina delante. `autenticado` lo apaga para quien está a punto de
          ser redirigido a su panel. */}
      <IntroLogo autenticado={!!session} />
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
