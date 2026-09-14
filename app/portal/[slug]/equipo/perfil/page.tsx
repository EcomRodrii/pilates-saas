'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { StudentShell } from '@/components/student/shell/StudentShell';
import { PageHeader } from '@/components/student/shell/PageHeader';
import { useEstudio, usePortalHref } from '@/components/student/contexto';
import { useSesionInstructora } from '@/lib/student/sesion-instructora';
import { useSesionStudent } from '@/lib/student/sesion';
import { useAuthStudent } from '@/lib/student/auth';
import { useAsync } from '@/lib/student/useAsync';
import { getPerfilInstructora } from '@/lib/student/datos-instructora';
import { euros } from '@/lib/student/formato';
import { ProfileSection } from '@/components/student/domain/ProfileSection';
import { ConfirmationDialog } from '@/components/student/ui/ConfirmationDialog';
import { AvatarSocia } from '@/components/student/domain/AvatarSocia';

// Perfil de la instructora en la app del estudio: quién es, su trabajo
// (disponibilidad y ausencias), su tarifa, sus estudios, lo que puede hacer como
// alumna si además lo es, y cerrar sesión de verdad
// (`supabasePortal.auth.signOut()`, igual que el perfil de la alumna: en un
// móvil compartido dejar la sesión viva es dejar la cuenta abierta).
export default function PerfilInstructoraPage() {
  const { estudio } = useEstudio();
  const href = usePortalHref();
  const router = useRouter();
  const { instructora } = useSesionInstructora(estudio.slug, true, true);
  const { socia } = useSesionStudent(estudio.slug);
  const { logout } = useAuthStudent(estudio.slug);
  const [salir, setSalir] = useState(false);
  const [saliendo, setSaliendo] = useState(false);

  // Monta antes que su guardia (es su padre): sin confirmar, no se pide nada.
  const esInstructora = Boolean(instructora);
  const cargar = useCallback(
    () => (esInstructora ? getPerfilInstructora(estudio.slug) : new Promise<never>(() => {})),
    [esInstructora, estudio.slug],
  );
  // Si el perfil no carga, el resto de la pantalla sigue sirviendo: solo faltan
  // la tarifa y los estudios.
  const { data: perfil } = useAsync(cargar, () => false);
  const tarifa = perfil?.tarifa ?? null;
  const estudios = perfil?.estudios ?? [];

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
            { label: 'Tus ausencias', href: href('/equipo/ausencias') },
          ]}
        />

        {tarifa && (
          <section>
            <p className="t-label" style={{ margin: '0 0 7px' }}>Tu tarifa</p>
            <div
              className="card"
              data-testid="tarifa"
              style={{ padding: '12px 15px', display: 'flex', flexDirection: 'column', gap: 8, fontSize: 'var(--t-small)' }}
            >
              {tarifa.tarifaHora != null && <Fila k="Por hora" v={euros(tarifa.tarifaHora)} />}
              {tarifa.baseMensualEur != null && <Fila k="Base mensual" v={euros(tarifa.baseMensualEur)} />}
              <p className="t-meta">La fija el estudio. Si algo no cuadra, habla con el estudio.</p>
            </div>
          </section>
        )}

        {estudios.length > 1 && (
          <ProfileSection
            titulo="Tus estudios"
            items={estudios.map((e) => ({
              label: e.nombre,
              // Cada estudio tiene su app; la sesión es la misma cuenta.
              href: e.actual ? href('/equipo') : `/portal/${encodeURIComponent(e.slug)}/equipo`,
              valor: e.actual ? 'Estás aquí' : undefined,
            }))}
          />
        )}

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

function Fila({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
      <span style={{ color: 'var(--muted-foreground)' }}>{k}</span>
      <b style={{ textAlign: 'right' }}>{v}</b>
    </div>
  );
}
