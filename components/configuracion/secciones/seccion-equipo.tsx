'use client';

import { BarraGuardar } from '@/components/configuracion/shell/barra-guardar';
import { useFormularioEstudio } from '@/components/configuracion/formulario-estudio';
import { TarjetaInstructorasCreanClases, formularioInstructoras } from '@/components/configuracion/tarjeta-instructoras-crean-clases';
import { tarjetaPorId } from '@/lib/configuracion/secciones';

// Mi equipo: qué pueden hacer tus instructoras por su cuenta.
export function SeccionEquipo({ showToast }: { showToast: (m: string) => void }) {
  const equipo = useFormularioEstudio(formularioInstructoras, showToast);

  async function guardarEquipo(): Promise<string | null> {
    const res = await equipo.guardar({ instructorasCreanClases: equipo.form.instructorasCreanClases }, null);
    if (!res) return 'ya se estaba guardando';
    if (!res.ok) return res.error;
    showToast('Ajuste de tu equipo guardado');
    return null;
  }

  return (
    <>
      <TarjetaInstructorasCreanClases
        on={equipo.form.instructorasCreanClases}
        onCambiar={v => equipo.setForm({ instructorasCreanClases: v })}
      />
      <BarraGuardar
        seccion="equipo"
        cambios={equipo.hayCambios ? [tarjetaPorId('ajuste-instructoras-crean-clases').titulo] : []}
        onGuardar={guardarEquipo}
        onDescartar={equipo.descartar}
      />
    </>
  );
}
