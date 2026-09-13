'use client';

import { StudentShell } from '@/components/student/shell/StudentShell';
import { PageHeader } from '@/components/student/shell/PageHeader';
import { useEstudio, usePortalHref } from '@/components/student/contexto';
import { DescargarMisDatos, SolicitudesDerechos } from '@/components/student/domain/MisDatos';
import { ConsentimientoSaludPerfil } from '@/components/student/domain/ConsentimientoSaludPerfil';

// Privacidad y datos: los derechos RGPD de la alumna, fuera del Perfil.
//
// Antes «Tus datos» y el consentimiento de salud se pintaban en el propio
// Perfil, con la eliminación en rojo entre «Estudio» y «Cerrar sesión». Son
// cosas que se hacen casi nunca, así que ahora viven un nivel más abajo, detrás
// de una sola fila. El orden es a propósito: primero lo que es suyo y es al
// momento (descargar), y después, como enlaces discretos, lo que retira o pide
// borrar.
export default function PrivacidadPage() {
  const { estudio } = useEstudio();
  const href = usePortalHref();

  return (
    <StudentShell>
      <PageHeader titulo="Privacidad y datos" back />
      <div className="px stack" style={{ ['--gap' as string]: '20px', marginTop: 14, maxWidth: 520 }}>
        <DescargarMisDatos slug={estudio.slug} nombreEstudio={estudio.nombre} />
        {/* Solo aparece si alguna vez dio el consentimiento. */}
        <ConsentimientoSaludPerfil studioId={estudio.id} nombreEstudio={estudio.nombre} hrefMensajes={href('/mensajes')} />
        <SolicitudesDerechos slug={estudio.slug} nombreEstudio={estudio.nombre} />
      </div>
    </StudentShell>
  );
}
