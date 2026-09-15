'use client';

import { useId } from 'react';
import { cn } from '@/lib/utils';
import type { Studio } from '@/lib/types';
import { labelCls } from '@/components/configuracion/estilos';
import { BarraGuardar } from '@/components/configuracion/shell/barra-guardar';
import type { PropsFormularioCajon } from '@/components/configuracion/shell/cajon-ajuste';
import { useFormularioEstudio } from '@/components/configuracion/formulario-estudio';

// «Compra desde tu enlace», el cajón de su fila en Alta de alumnas: quién puede
// comprar desde el enlace público sin tener ficha. Antes no había ajuste: se
// cobraba y no se entregaba nada (el webhook ignoraba el plan comprado).
//
// Vivía dentro de las reglas de reserva, en «Opciones avanzadas», y después con
// la barra de toda la sección. Se guarda igual (`compra_publica_modo`), con el
// «Guardar» de su cajón, que manda esa columna y ninguna más.

export type ModoCompraPublica = Studio['compraPublicaModo'];

export function formularioCompraPublica(s: Studio | null): { compraPublicaModo: ModoCompraPublica } {
  return { compraPublicaModo: s?.compraPublicaModo ?? 'EXIGIR_REGISTRO' };
}

const OPCIONES: readonly [ModoCompraPublica, string, string][] = [
  ['EXIGIR_REGISTRO', 'Que se registre antes de pagar',
    'Deja su email y acepta tus condiciones antes de pagar.'],
  ['CREAR_FICHA', 'Que pague directamente',
    'Paga primero; entra sin contrato aceptado y se le pide al reservar.'],
];

export function FormCompraPublica({ showToast, onGuardado }: PropsFormularioCajon) {
  const id = useId();
  const { form, setForm, hayCambios, guardar, descartar } = useFormularioEstudio(formularioCompraPublica, showToast);

  async function alGuardar(): Promise<string | null> {
    const res = await guardar({ compraPublicaModo: form.compraPublicaModo }, null);
    if (!res) return 'Ya se estaba guardando';
    if (!res.ok) return res.error;
    onGuardado('Compra desde tu enlace guardada');
    return null;
  }

  return (
    <>
      <div className="pb-6">
        <p id={`${id}-pregunta`} className={labelCls}>Si alguien compra un bono desde tu enlace y aún no es alumna</p>
        <div role="radiogroup" aria-labelledby={`${id}-pregunta`} className="mt-2 space-y-2">
          {OPCIONES.map(([modo, titulo, detalle]) => (
            <label
              key={modo}
              className={cn(
                'flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors',
                form.compraPublicaModo === modo ? 'border-brand bg-brand/5' : 'border-border hover:bg-muted',
              )}
            >
              <input
                type="radio"
                name={`${id}-compra-publica-modo`}
                className="mt-1 size-4 accent-[var(--brand)]"
                checked={form.compraPublicaModo === modo}
                onChange={() => setForm({ compraPublicaModo: modo })}
              />
              <span>
                <span className="block text-sm font-medium text-foreground">{titulo}</span>
                <span className="mt-0.5 block text-sm text-muted-foreground text-pretty">{detalle}</span>
              </span>
            </label>
          ))}
        </div>
      </div>
      <BarraGuardar
        seccion="altas"
        cambios={hayCambios ? ['Compra desde tu enlace'] : []}
        onGuardar={alGuardar}
        onDescartar={descartar}
      />
    </>
  );
}
