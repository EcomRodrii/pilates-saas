'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useStudio } from '@/lib/studio-context';
import { useRol } from '@/lib/permisos';
import { tieneFeature } from '@/lib/billing/entitlements';
import { BG } from '@/components/landing/theme';
import { SeccionHero } from '@/components/landing/SeccionHero';
import { VideoProducto } from '@/components/landing/VideoProducto';
import { SeccionTeSuena } from '@/components/landing/SeccionTeSuena';
import { SeccionTuEstudio } from '@/components/landing/SeccionTuEstudio';
import { SeccionConfianza } from '@/components/landing/SeccionConfianza';
import { SeccionParteNoche } from '@/components/landing/SeccionParteNoche';
import { SeccionSustituciones } from '@/components/landing/SeccionSustituciones';
import { SeccionCalendarioReservas } from '@/components/landing/SeccionCalendarioReservas';
import { SeccionReservas } from '@/components/landing/SeccionReservas';
import { SeccionFuncionalidades } from '@/components/landing/SeccionFuncionalidades';
import { SeccionPrecio } from '@/components/landing/SeccionPrecio';
import { SeccionFaq } from '@/components/landing/SeccionFaq';
import { SeccionCtaFinal } from '@/components/landing/SeccionCtaFinal';
import { WhatsAppFab } from '@/components/landing/WhatsAppFab';
import { PopupEmpezar } from '@/components/landing/PopupEmpezar';
import { GlobalStyles } from '@/components/landing/GlobalStyles';
import { MedicionLanding } from '@/components/landing/MedicionLanding';
import { AnclasSuaves } from '@/components/landing/AnclasSuaves';
import { IntroLogo } from '@/components/landing/IntroLogo';
import { StructuredData } from '@/components/landing/StructuredData';
import { OrganizationStructuredData } from '@/components/OrganizationStructuredData';

// La landing entera (cliente): ya no es la página de `/` sino lo que ésta pinta.
// Antes vivía en app/page.tsx con 'use client', y una página de cliente no puede
// exportar `metadata`: la home heredaba título, descripción y canonical del
// layout raíz (fase 5 del SEO, 23-sep). Ahora `app/page.tsx` es un componente de
// servidor con sus propios metadatos y esto solo se monta debajo.
export function LandingCliente() {
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
      {/* El nav (`position: sticky`, dentro de SeccionHero) queda "pegado" solo
          mientras este contenedor sigue en pantalla — es su límite de
          contención. Sin este envoltorio, el nav se queda pegado hasta el
          final literal de la página y se superpone al pie, tapando su texto
          (detectado verificando en móvil real: "Contáctanos por correo..."
          se veía a través del propio nav). El pie va FUERA a propósito. */}
      <div style={{ position: 'relative' }}>
        <SeccionHero />
        {/* Rediseño por fases (23-sep): ATENCIÓN → IDENTIFICACIÓN → PERFIL →
            VISUALIZACIÓN → SOLUCIÓN → RESULTADO → CONFIANZA → PRECIO → DUDAS.
            Cada bloque tiene una sola función; lo que no la tenía salió (la
            rejilla de 17 tarjetas pasó a una fila de enlaces y «Cambiarse» se
            repartió entre Confianza y las preguntas). El vídeo va justo detrás
            de la promesa, encima de «¿Te suena?» (el fundador, 23-sep). */}
        <VideoProducto />
        <SeccionTeSuena />
        <SeccionTuEstudio />
        <SeccionReservas />
        <SeccionSustituciones />
        {/* La noche y su mañana: mismo fondo, se leen como un solo bloque. */}
        <SeccionParteNoche />
        <SeccionCalendarioReservas />
        <SeccionConfianza />
        <SeccionFuncionalidades />
        <SeccionPrecio />
        <SeccionFaq />
      </div>
      <SeccionCtaFinal />
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
