'use client';

import { StudentShell } from '@/components/student/shell/StudentShell';
import { PageHeader } from '@/components/student/shell/PageHeader';
import { useEstudio } from '@/components/student/contexto';
import { CambiarPassword } from '@/components/student/domain/CambiarPassword';
import { DosPasos } from '@/components/student/domain/DosPasos';

// Seguridad de la cuenta desde dentro de la app: la verificación en dos pasos
// (opcional, `DosPasos`) y cambiar la contraseña (`CambiarPassword`, que
// comparte con la instructora en `/equipo/perfil/seguridad`).
export default function SeguridadPage() {
  const { estudio } = useEstudio();
  return (
    <StudentShell>
      <PageHeader titulo="Seguridad" back />
      <div className="px" style={{ marginTop: 14, maxWidth: 520 }}>
        <DosPasos volverA="/perfil/seguridad" />
      </div>
      <h2 className="t-h3 px" style={{ marginTop: 'var(--s-6)' }}>Contraseña</h2>
      <CambiarPassword slug={estudio.slug} />
    </StudentShell>
  );
}
