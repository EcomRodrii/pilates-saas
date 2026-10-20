'use client';

import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useStudio } from '@/lib/studio-context';
import { useRol } from '@/lib/permisos';
import { tieneFeature } from '@/lib/billing/entitlements';
import { SeccionHero } from '@/components/landing/SeccionHero';
import { SeccionCtaFinal } from '@/components/landing/SeccionCtaFinal';
import { WhatsAppFab } from '@/components/landing/WhatsAppFab';
import { PopupEmpezar } from '@/components/landing/PopupEmpezar';
import { BandaPrueba } from '@/components/landing/BandaPrueba';
import { GlobalStyles } from '@/components/landing/GlobalStyles';
import { MedicionLanding } from '@/components/landing/MedicionLanding';
import { AnclasSuaves } from '@/components/landing/AnclasSuaves';
import { StructuredData } from '@/components/landing/StructuredData';
import { OrganizationStructuredData } from '@/components/OrganizationStructuredData';

// El armazón de cliente de la home: la isla, el pie y lo que necesita el
// navegador (redirigir a quien ya tiene sesión, el salto a un #ancla, la
// medición, el popup y el botón de WhatsApp). Antes vivía en app/page.tsx con
// 'use client', y una página de cliente no puede exportar `metadata` (fase 5
// del SEO, 23-sep).
//
// Desde la home nueva (fase 2.2, 19-oct-2026) las SECCIONES llegan como
// `children`, ya pintadas en el servidor y en su orden, desde app/page.tsx: es
// el único sitio donde se lee la composición de la home. Ninguna sección entra
// en el JavaScript de la página salvo las pestañas (su estado).
interface Props {
  children?: ReactNode;
}

export function LandingCliente({ children }: Props = {}) {
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
      tieneFeature(studio, 'decisiones');
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
  // cargar).
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
    <div className="wh" style={{ overflowX: 'clip', position: 'relative' }}>
      <StructuredData />
      <OrganizationStructuredData />
      {/* El nav (`position: sticky`, dentro de SeccionHero) queda "pegado" solo
          mientras este contenedor sigue en pantalla — es su límite de
          contención. Sin este envoltorio, el nav se queda pegado hasta el
          final literal de la página y se superpone al pie, tapando su texto
          (detectado verificando en móvil real: "Contáctanos por correo..."
          se veía a través del propio nav). El pie va FUERA a propósito. */}
      <div style={{ position: 'relative' }}>
        {/* Una línea con la oferta, en el flujo y sin popup (fundador, 9-oct). */}
        <BandaPrueba />
        <SeccionHero />
        {children}
      </div>
      {/* Solo el pie: la banda final es la de la home (CierreHome, en `children`). */}
      <SeccionCtaFinal sinCierre />
      <WhatsAppFab />
      {/* Se pinta solo si toca: sus reglas de frecuencia deciden dentro
          (lib/landing/popup-frecuencia.ts), no aquí. */}
      <PopupEmpezar />
      <MedicionLanding />
      <AnclasSuaves />
      <GlobalStyles />
    </div>
  );
}
