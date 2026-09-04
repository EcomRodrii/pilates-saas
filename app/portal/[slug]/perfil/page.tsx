'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { StudentShell } from '@/components/student/shell/StudentShell';
import { PageHeader } from '@/components/student/shell/PageHeader';
import { useEstudio, usePortalHref } from '@/components/student/contexto';
import { useAsync } from '@/lib/student/useAsync';
import { getAlumna } from '@/lib/student/datos';
import { useAuthStudent } from '@/lib/student/auth';
import { ProfileSection } from '@/components/student/domain/ProfileSection';
import { ConfirmationDialog } from '@/components/student/ui/ConfirmationDialog';

/** Iniciales para el monograma cuando no hay foto. */
function iniciales(nombre: string): string {
  return nombre.trim().split(/\s+/).slice(0, 2).map((p) => p[0] ?? '').join('').toUpperCase() || '·';
}

// Perfil (§A.17). Cerrar sesión es de verdad: `supabasePortal.auth.signOut()`.
// El paquete solo navega a /login, que dejaría la sesión viva — y en un móvil
// compartido eso es dejar la cuenta abierta.
export default function PerfilPage() {
  const { estudio } = useEstudio();
  const href = usePortalHref();
  const router = useRouter();
  const cargarAlumna = useCallback(() => getAlumna(estudio.slug), [estudio.slug]);
  const { data: socia } = useAsync(cargarAlumna, (d) => !d);
  const { logout } = useAuthStudent(estudio.slug);
  const [salir, setSalir] = useState(false);
  const [saliendo, setSaliendo] = useState(false);

  const nombreCompleto = [socia?.nombre, socia?.apellidos].filter(Boolean).join(' ') || 'Tu perfil';

  const cerrarSesion = async () => {
    setSaliendo(true);
    await logout();
    router.push(href('/acceso/login'));
  };

  return (
    <StudentShell>
      <PageHeader titulo="Perfil" />
      <div className="px grid-lg-2" style={{ ['--lg2-gap' as string]: '16px', marginTop: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
          <span
            aria-hidden
            style={{
              width: 56, height: 56, borderRadius: 999, background: 'var(--accent-soft)',
              color: 'var(--accent-soft-foreground)', fontSize: 19, fontWeight: 800,
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}
          >
            {iniciales(nombreCompleto)}
          </span>
          <div style={{ minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>{nombreCompleto}</p>
            <p className="t-meta" style={{ marginTop: 1, fontSize: 12 }}>Alumna de {estudio.nombre}</p>
          </div>
        </div>

        <ProfileSection
          titulo="Cuenta"
          items={[
            { label: 'Datos personales', href: href('/perfil/datos'), valor: socia?.email ?? undefined },
            { label: 'Preferencias', href: href('/perfil/preferencias') },
            { label: 'Comprar bonos y suscripciones', href: href('/comprar') },
            { label: 'Bonos', href: href('/bonos') },
            { label: 'Pagos y recibos', href: href('/pagos') },
          ]}
        />

        <ProfileSection
          titulo="Estudio"
          items={[
            { label: 'Ayuda y contacto', href: href('/ayuda') },
            { label: 'Notificaciones', href: href('/notificaciones') },
          ]}
        />

        <ProfileSection
          titulo="Sesión"
          items={[{ label: 'Cerrar sesión', onClick: () => setSalir(true), destructivo: true }]}
        />

        <p className="t-meta" style={{ textAlign: 'center', fontSize: 10.5, color: 'var(--subtle-foreground)' }}>
          App de {estudio.nombre} · con Tentare
        </p>
      </div>

      <ConfirmationDialog
        open={salir}
        onClose={() => { if (!saliendo) setSalir(false); }}
        titulo="¿Cerrar sesión?"
        cuerpo="Tendrás que volver a identificarte para reservar."
        confirmar="Cerrar sesión"
        tono="danger"
        loading={saliendo}
        onConfirm={() => void cerrarSesion()}
      />
    </StudentShell>
  );
}
