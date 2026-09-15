'use client';

import { StudentShell } from '@/components/student/shell/StudentShell';
import { PageHeader } from '@/components/student/shell/PageHeader';
import { useEstudio } from '@/components/student/contexto';
import { CambiarPassword } from '@/components/student/domain/CambiarPassword';

// Cambiar la contraseña, desde la parte de la instructora.
//
// Una página aparte y no un enlace a `/perfil/seguridad`: aquella va dentro del
// marco de la alumna, cuya guardia manda a `/equipo` a quien no tiene ficha de
// alumna, así que la instructora nunca llegaba al formulario. El formulario es el
// mismo (`CambiarPassword`): es la misma cuenta.
export default function SeguridadInstructoraPage() {
  const { estudio } = useEstudio();
  return (
    <StudentShell modo="instructora">
      <PageHeader titulo="Contraseña" back />
      <CambiarPassword slug={estudio.slug} />
    </StudentShell>
  );
}
