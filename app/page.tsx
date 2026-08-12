'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useStudio } from '@/lib/studio-context';
import { useRol } from '@/lib/permisos';
import { tieneFeature } from '@/lib/billing/entitlements';
import { BG } from '@/components/landing/theme';
import { SeccionHero } from '@/components/landing/SeccionHero';
import { SeccionMartes } from '@/components/landing/SeccionMartes';
import { SeccionSustituciones } from '@/components/landing/SeccionSustituciones';
import { SeccionCalendarioReservas } from '@/components/landing/SeccionCalendarioReservas';
import { SeccionApp } from '@/components/landing/SeccionApp';
import { SeccionWidget } from '@/components/landing/SeccionWidget';
import { SeccionClientas } from '@/components/landing/SeccionClientas';
import { SeccionCambiarse } from '@/components/landing/SeccionCambiarse';
import { SeccionFuncionalidades } from '@/components/landing/SeccionFuncionalidades';
import { SeccionPrecio } from '@/components/landing/SeccionPrecio';
import { SeccionFaq } from '@/components/landing/SeccionFaq';
import { SeccionRecursos } from '@/components/landing/SeccionRecursos';
import { SeccionCtaFinal } from '@/components/landing/SeccionCtaFinal';
import { GlobalStyles } from '@/components/landing/GlobalStyles';
import { IntroLogo } from '@/components/landing/IntroLogo';
import { StructuredData } from '@/components/landing/StructuredData';
import { OrganizationStructuredData } from '@/components/OrganizationStructuredData';

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
  // carrera en esta página: con más de diez secciones, fuentes e imágenes aún
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
    <div style={{ background: BG, color: '#1A1A1A', overflowX: 'clip', position: 'relative' }}>
      <StructuredData />
      <OrganizationStructuredData />
      {/* Va ARRIBA del todo pero se pinta solo en cliente: el HTML del servidor
          —el que ven Google y los lectores de pantalla— es la landing, sin
          cortina delante. `autenticado` lo apaga para quien está a punto de
          ser redirigido a su panel. */}
      <IntroLogo autenticado={!!session} />
      <SeccionHero />
      <SeccionMartes />
      <SeccionSustituciones />
      <SeccionCalendarioReservas />
      <SeccionApp />
      <SeccionWidget />
      <SeccionClientas />
      <SeccionCambiarse />
      <SeccionFuncionalidades />
      <SeccionPrecio />
      <SeccionFaq />
      <SeccionRecursos />
      <SeccionCtaFinal />
      <GlobalStyles />
    </div>
  );
}
