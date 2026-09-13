'use client';

import { useCallback } from 'react';
import { StudentShell } from '@/components/student/shell/StudentShell';
import { PageHeader } from '@/components/student/shell/PageHeader';
import { useEstudio, usePortalHref } from '@/components/student/contexto';
import { DescargarMisDatos, SolicitudesDerechos } from '@/components/student/domain/MisDatos';
import { ConsentimientoSaludPerfil } from '@/components/student/domain/ConsentimientoSaludPerfil';
import { Skeleton } from '@/components/student/ui/States';
import { useAsync } from '@/lib/student/useAsync';
import { leerConsentimientoSalud } from '@/lib/student/consentimiento-salud';

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

  // ⚠️ El consentimiento se pide AQUÍ y lo de debajo espera a que llegue. Antes
  // lo pedía su propio bloque y los enlaces de «Otras solicitudes» se pintaban
  // al momento: al llegar la respuesta bajaban ~190 px, y «Retirar
  // consentimiento» quedaba justo donde estaba «Limitar u oponerme». Un toque
  // durante la carga acababa en otra acción. Descargar va arriba y no se mueve,
  // así que se pinta ya.
  const cargarSalud = useCallback(() => leerConsentimientoSalud(estudio.id), [estudio.id]);
  const { data: salud, estado } = useAsync(cargarSalud, () => false);

  return (
    <StudentShell>
      <PageHeader titulo="Privacidad y datos" back />
      <div className="px stack" style={{ ['--gap' as string]: '20px', marginTop: 14, maxWidth: 520 }}>
        <DescargarMisDatos slug={estudio.slug} nombreEstudio={estudio.nombre} />
        {estado === 'loading' ? (
          <div aria-busy="true" aria-label="Cargando" className="stack" style={{ ['--gap' as string]: 'var(--s-2)' }}>
            <Skeleton h={12} w="40%" />
            <Skeleton h={120} r={16} />
          </div>
        ) : (
          <>
            {/* Solo aparece si alguna vez dio el consentimiento. Si no se ha
                podido leer, tampoco: no se enseña un estado inventado. */}
            {salud && salud.estado !== 'NO_CONSTA' && (
              <ConsentimientoSaludPerfil inicial={salud} studioId={estudio.id} nombreEstudio={estudio.nombre} hrefMensajes={href('/mensajes')} />
            )}
            <SolicitudesDerechos slug={estudio.slug} nombreEstudio={estudio.nombre} />
          </>
        )}
      </div>
    </StudentShell>
  );
}
