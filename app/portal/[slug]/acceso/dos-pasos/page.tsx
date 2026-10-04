'use client';

// El segundo paso en la app del estudio (4-oct-2026, decisión del fundador:
// opcional, la activa cada alumna en su perfil). Solo llega aquí quien la tiene
// activada: las guardias de la app, `/acceso/verificar`, `/reservar` y el widget
// la mandan con `?next=` cuando a su sesión le falta el paso. `?codigo=1` va
// directo a la app de códigos: lo usa Perfil → Seguridad para desactivarla.
// La pantalla vive en components/student/acceso/SegundoPaso.tsx, que comparte
// con la entrada de la app de iOS.
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useEstudio, usePortalHref } from '@/components/student/contexto';
import { SegundoPaso } from '@/components/student/acceso/SegundoPaso';
import { useAuthStudent } from '@/lib/student/auth';
import { destinoTrasDosPasos } from '@/lib/student/doble-factor-portal-reglas';

function DosPasos() {
  const { slug, estudio } = useEstudio();
  const href = usePortalHref();
  const sp = useSearchParams();
  const { logout } = useAuthStudent(slug);
  return (
    <SegundoPaso
      slug={slug}
      nombreEstudio={estudio.nombre}
      pideLaApp={sp.get('codigo') === '1'}
      // Recarga entera, a donde iba (solo rutas de este estudio o su página de reservas).
      alTerminar={() => window.location.assign(destinoTrasDosPasos(new URLSearchParams(window.location.search).get('next'), slug))}
      alSalir={async () => { await logout(); window.location.assign(href('/acceso/login')); }}
      entrarHref={href('/acceso/login')}
    />
  );
}

export default function Page() {
  // `useSearchParams` exige Suspense en App Router.
  return <Suspense fallback={null}><DosPasos /></Suspense>;
}
