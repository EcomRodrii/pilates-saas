'use client';

import { cn } from '@/lib/utils';
import type { Studio } from '@/lib/types';
import { tarjetaPorId } from '@/lib/configuracion/secciones';
import { inputCls } from '@/components/configuracion/estilos';
import { BarraGuardar } from '@/components/configuracion/shell/barra-guardar';
import { Campo, useFormularioEstudio } from '@/components/configuracion/formulario-estudio';

// «Cómo te presentas» en «Mi web» guiada (21-oct-2026, decisión 4 de «Mi app»): la descripción sale
// en tu página de reservas («El estudio») y en Tentare Network, no en la app de tus alumnas, así que
// se escribe aquí. Es el MISMO campo que el de «Cómo te presentas» de «Mi app» (`studios.descripcion`)
// y manda SOLO ese campo (#2027): el lema, las normas y el año se quedan como estaban.

type FormDescripcion = { descripcion: string };

const aDescripcion = (s: Studio | null): FormDescripcion => ({ descripcion: s?.descripcion ?? '' });

export function DetalleDescripcionWeb({ showToast, onGuardado }: {
  showToast: (m: string) => void;
  onGuardado: (texto: string) => void;
}) {
  const { form, setForm, hayCambios, guardar, descartar } = useFormularioEstudio(aDescripcion, showToast);

  async function alGuardar(): Promise<string | null> {
    // Vacío se guarda como NULL, como en el resto de textos: la página no enseña un hueco.
    const res = await guardar({ descripcion: form.descripcion.trim() || null }, null);
    if (!res) return 'Ya se estaba guardando';
    if (!res.ok) return res.error;
    onGuardado('Tu presentación, guardada');
    return null;
  }

  return (
    <>
      <div className="flex flex-col gap-5 pb-6">
        <Campo
          label="Cómo te presentas"
          ayuda="Sale en tu página de reservas, en «El estudio», y en Tentare Network. No sale en la app de tus alumnas."
        >
          {id => (
            <textarea
              id={id}
              className={cn(inputCls, 'min-h-[96px] resize-y')}
              value={form.descripcion}
              maxLength={400}
              placeholder="Estudio boutique especializado en pilates reformer. Grupos de ocho para que nadie pase desapercibida."
              onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))}
            />
          )}
        </Campo>
      </div>
      <BarraGuardar
        seccion="web"
        cambios={hayCambios ? [tarjetaPorId('presentacion-web').titulo] : []}
        onGuardar={alGuardar}
        onDescartar={descartar}
      />
    </>
  );
}
