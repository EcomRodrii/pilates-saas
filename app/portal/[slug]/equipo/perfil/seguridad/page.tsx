'use client';

import { StudentShell } from '@/components/student/shell/StudentShell';
import { PageHeader } from '@/components/student/shell/PageHeader';
import { useEstudio } from '@/components/student/contexto';
import { CambiarPassword } from '@/components/student/domain/CambiarPassword';
import { DosPasos } from '@/components/student/domain/DosPasos';

// Seguridad de la cuenta, desde la parte de la instructora: la verificación en
// dos pasos y la contraseña.
//
// Una página aparte y no un enlace a `/perfil/seguridad`: aquella va dentro del
// marco de la alumna, cuya guardia manda a `/equipo` a quien no tiene ficha de
// alumna, así que la instructora nunca llegaba. Los bloques son los mismos
// (`DosPasos`, `CambiarPassword`): es la misma cuenta.
export default function SeguridadInstructoraPage() {
  const { estudio } = useEstudio();
  return (
    <StudentShell modo="instructora">
      <PageHeader titulo="Seguridad" back />
      <div className="px" style={{ marginTop: 14, maxWidth: 520 }}>
        <DosPasos volverA="/equipo/perfil/seguridad" />
      </div>
      <h2 className="t-h3 px" style={{ marginTop: 'var(--s-6)' }}>Contraseña</h2>
      <CambiarPassword slug={estudio.slug} />
    </StudentShell>
  );
}
