'use client';

import { useEffect, useState } from 'react';
import { useStudio } from '@/lib/studio-context';
import { useAuth } from '@/lib/auth-context';
import { fetchMisEstudios, cambiarSedeActiva, type SedeSeleccionable } from '@/lib/supabase-data';
import { CLAVE_CAMBIO_SEDE } from '@/components/layout/sede-activa';
import { tieneFeature } from '@/lib/billing/entitlements';
import { TabEstudioGeneral } from '@/components/configuracion/tab-estudio-general';
import { TabEstudioHorario } from '@/components/configuracion/tab-estudio-horario';
import { TabSalas } from '@/components/configuracion/tab-salas';
import { TabEstudioSedes } from '@/components/configuracion/tab-estudio-sedes';
import { TarjetaAjuste } from '@/components/configuracion/shell/tarjeta-ajuste';

// Mi estudio: quién eres, dónde estás y cuándo abres.
//
// ⚠️ Mientras no se parta el formulario de TabEstudioGeneral, aquí se pintan
// también la marca, los textos de la app y los datos fiscales, que tienen su
// sitio en «Mi app y mi web» y «Cobros y facturas» (allí hay una fila que trae
// hasta aquí). Ver `hospedadaEn` en lib/configuracion/secciones.ts.
export function SeccionEstudio({ showToast }: { showToast: (m: string) => void }) {
  const { studio } = useStudio();
  const { user } = useAuth();

  // «Sedes» solo existe si hay algo que decidir ahí: más de una sede, o el plan
  // Cadena para poder añadir la segunda. Con un estudio normal (la inmensa
  // mayoría) la tarjeta ni aparece — no hay una tarjeta vacía que enseñar a
  // cambio de nada.
  const puedeAnadirSedes = !!studio && tieneFeature({ plan: studio.plan, subscriptionStatus: studio.subscriptionStatus }, 'multiCentro');
  const [sedes, setSedes] = useState<SedeSeleccionable[]>([]);
  const [cambiandoASede, setCambiandoASede] = useState<string | null>(null);
  useEffect(() => {
    if (!user) return;
    let vivo = true;
    fetchMisEstudios().then(r => { if (vivo) setSedes(r); });
    return () => { vivo = false; };
  }, [user]);

  function cambiarmeASede(id: string) {
    if (!user || id === studio?.id || cambiandoASede) return;
    setCambiandoASede(id);
    // Mismo patrón que SedeActiva.elegir() (components/layout/sede-activa.tsx):
    // hard-nav tras guardar, para que StudioProvider remonte limpio contra la
    // nueva sede.
    cambiarSedeActiva(user.id, id).then(ok => {
      if (!ok) { setCambiandoASede(null); showToast('No se ha podido cambiar de sede'); return; }
      const destino = sedes.find(s => s.id === id);
      try { sessionStorage.setItem(CLAVE_CAMBIO_SEDE, destino?.nombre ?? ''); } catch { /* modo privado */ }
      window.location.href = '/dashboard';
    });
  }

  const haySedes = sedes.length > 1 || puedeAnadirSedes;

  return (
    <>
      <TabEstudioGeneral showToast={showToast} />
      <TabEstudioHorario showToast={showToast} />
      <TarjetaAjuste id="salas" marco={false}>
        <TabSalas showToast={showToast} />
      </TarjetaAjuste>
      {haySedes && (
        <TabEstudioSedes
          showToast={showToast}
          sedes={sedes}
          refrescarSedes={() => { fetchMisEstudios().then(setSedes); }}
          cambiandoASede={cambiandoASede}
          cambiarmeASede={cambiarmeASede}
          puedeAnadirSedes={puedeAnadirSedes}
        />
      )}
    </>
  );
}
