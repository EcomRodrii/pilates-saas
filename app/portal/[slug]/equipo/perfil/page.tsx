'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { StudentShell } from '@/components/student/shell/StudentShell';
import { PageHeader } from '@/components/student/shell/PageHeader';
import { useEstudio, usePortalHref } from '@/components/student/contexto';
import { useSesionInstructora } from '@/lib/student/sesion-instructora';
import { useSesionStudent } from '@/lib/student/sesion';
import { useAuthStudent } from '@/lib/student/auth';
import { ProfileSection } from '@/components/student/domain/ProfileSection';
import { ConfirmationDialog } from '@/components/student/ui/ConfirmationDialog';
import { AvatarSocia } from '@/components/student/domain/AvatarSocia';

// Perfil de la instructora en la app del estudio.
//
// En esta fase: quién es, en qué estudio, lo que puede hacer como alumna si
// además lo es, y cerrar sesión de verdad (`supabasePortal.auth.signOut()`, igual
// que el perfil de la alumna: en un móvil compartido dejar la sesión viva es
// dejar la cuenta abierta). La disponibilidad, las ausencias, sus estudios y su
// tarifa llegan en el siguiente paso.
export default function PerfilInstructoraPage() {
  const { estudio } = useEstudio();
  const href = usePortalHref();
  const router = useRouter();
  const { instructora } = useSesionInstructora(estudio.slug, true, true);
  const { socia } = useSesionStudent(estudio.slug);
  const { logout } = useAuthStudent(estudio.slug);
  const [salir, setSalir] = useState(false);
  const [saliendo, setSaliendo] = useState(false);

  const cerrarSesion = async () => {
    setSaliendo(true);
    await logout();
    router.push(href('/acceso/login'));
  };

  return (
    <StudentShell modo="instructora">
      <PageHeader titulo="Perfil" />
      <div className="px grid-lg-2" style={{ ['--lg2-gap' as string]: '16px', marginTop: 14 }}>
        <div className="card card--pad-lg row" style={{ ['--gap' as string]: '13px' }}>
          <AvatarSocia nombre={instructora?.nombre} fotoUrl={instructora?.fotoUrl ?? null} size={56} />
          <div className="trunc">
            <p className="t-card-title trunc">{instructora?.nombre ?? 'Tu perfil'}</p>
            <p className="t-meta" style={{ marginTop: 1 }}>Instructora en {estudio.nombre}</p>
          </div>
        </div>

        <ProfileSection
          titulo="Tu trabajo"
          items={[
            { label: 'Tu disponibilidad', href: href('/equipo/disponibilidad') },
          ]}
        />

        {socia && (
          <ProfileSection
            titulo="También eres alumna"
            items={[
              { label: 'Reservar una clase', href: href('/reservar') },
              { label: 'Mis clases como alumna', href: href('/mis-reservas') },
              { label: 'Bonos', href: href('/bonos') },
            ]}
          />
        )}

        <ProfileSection
          titulo="Sesión"
          items={[{ label: 'Cerrar sesión', onClick: () => setSalir(true), destructivo: true }]}
        />

        <p className="t-meta" style={{ textAlign: 'center', color: 'var(--subtle-foreground)' }}>
          App de {estudio.nombre} · con Tentare
        </p>
      </div>

      <ConfirmationDialog
        open={salir}
        onClose={() => { if (!saliendo) setSalir(false); }}
        titulo="¿Cerrar sesión?"
        cuerpo="Tendrás que volver a identificarte para ver tu agenda."
        confirmar="Cerrar sesión"
        tono="danger"
        loading={saliendo}
        onConfirm={() => void cerrarSesion()}
      />
    </StudentShell>
  );
}
