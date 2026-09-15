'use client';

import { useId } from 'react';
import { cn } from '@/lib/utils';
import type { Studio } from '@/lib/types';
import { labelCls } from '@/components/configuracion/estilos';
import { TarjetaAjuste } from '@/components/configuracion/shell/tarjeta-ajuste';

// «Compra desde tu enlace», en Alta de alumnas: quién puede comprar desde el
// enlace público sin tener ficha. Antes no había ajuste: se cobraba y no se
// entregaba nada (el webhook ignoraba el plan comprado).
//
// Vivía dentro de las reglas de reserva, en «Opciones avanzadas». Se guarda
// igual que entonces (`compra_publica_modo`), pero sola: su propia barra de
// guardar manda esa columna y ninguna más.

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

export function TarjetaCompraPublica({ valor, onCambiar }: {
  valor: ModoCompraPublica;
  onCambiar: (v: ModoCompraPublica) => void;
}) {
  const id = useId();
  return (
    <TarjetaAjuste id="compra-desde-tu-enlace">
      <p id={`${id}-pregunta`} className={labelCls}>Si alguien compra un bono desde tu enlace público y aún no es alumna</p>
      <div role="radiogroup" aria-labelledby={`${id}-pregunta`} className="mt-1.5 space-y-2">
        {OPCIONES.map(([modo, titulo, detalle]) => (
          <label
            key={modo}
            className={cn(
              'flex items-start gap-2.5 rounded-lg border p-3 cursor-pointer transition-colors',
              valor === modo ? 'border-brand bg-brand/5' : 'border-border hover:bg-muted',
            )}
          >
            <input
              type="radio"
              name={`${id}-compra-publica-modo`}
              className="mt-0.5 accent-[var(--brand)]"
              checked={valor === modo}
              onChange={() => onCambiar(modo)}
            />
            <span>
              <span className="block text-[13px] font-medium text-foreground">{titulo}</span>
              <span className="mt-0.5 block text-[11px] text-muted-foreground">{detalle}</span>
            </span>
          </label>
        ))}
      </div>
    </TarjetaAjuste>
  );
}
