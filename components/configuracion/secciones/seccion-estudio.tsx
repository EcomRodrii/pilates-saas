'use client';

import { useEffect, useState } from 'react';
import { useStudio } from '@/lib/studio-context';
import { useAuth } from '@/lib/auth-context';
import { fetchMisEstudios, cambiarSedeActiva, type SedeSeleccionable } from '@/lib/supabase-data';
import { CLAVE_CAMBIO_SEDE } from '@/components/layout/sede-activa';
import { tieneFeature } from '@/lib/billing/entitlements';
import { TabDatosContacto } from '@/components/configuracion/tab-datos-contacto';
import { TabEstudioHorario } from '@/components/configuracion/tab-estudio-horario';
import { TabEstudioSedes } from '@/components/configuracion/tab-estudio-sedes';
import { FilasHerramienta } from '@/components/configuracion/shell/fila-herramienta';
import { resumenHerramienta } from '@/lib/configuracion/resumenes';

// Mi estudio: quién eres, dónde estás y cuándo abres. La marca y los textos de
// la app están en «Marca», y los datos fiscales en «Cobros y facturas»: cada uno
// con su propio «Guardar», que manda solo sus campos. Las salas y sus averías
// tienen su propia pantalla.
export function SeccionEstudio({ showToast }: { showToast: (m: string) => void }) {
  const { studio, dataLoaded, salas, bloqueosMaquina } = useStudio();
  const { user } = useAuth();

  // Qué avería sigue abierta depende de la hora: se lee una vez al montar (leer
  // el reloj en render es impuro), el mismo criterio que la lista de averías.
  const [ahoraMs, setAhoraMs] = useState(0);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- La hora del reloj no se puede derivar en render; es justo lo que prohíbe la regla de pureza.
    setAhoraMs(Date.now());
  }, []);

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
      <TabDatosContacto showToast={showToast} />
      <TabEstudioHorario showToast={showToast} />
      <FilasHerramienta
        filas={[{
          id: 'salas',
          valor: resumenHerramienta('salas', {
            salas: dataLoaded && ahoraMs > 0 ? { numSalas: salas.length, averias: bloqueosMaquina, ahoraMs } : null,
          }),
        }]}
      />
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
