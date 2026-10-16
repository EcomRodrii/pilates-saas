'use client';

import { AlertCircle, ArrowRight, CalendarDays, Copy, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { btnSecondary } from '@/components/configuracion/estilos';
import { Baldosa, type Tono } from '@/components/dashboard/vivo';
import { METODOS, widgetPorId, type CategoriaWidget } from '@/lib/widgets/catalogo';
import type { AccionAviso, FilaPortada } from '@/lib/widgets/fila-portada';
import type { TonoChip } from '@/lib/widgets/en-tu-web';
import { FOCO, TACTIL, fechaCorta } from '../piezas';
import { ICONOS } from '../paso-que';
import type { FilaTienes } from '../lo-que-tienes';

// Una pieza en la portada «Tus widgets» («Tu web» v2, decisión 5): su nombre,
// cómo va y cuándo se copió, su mes, UN estado en una pastilla y, como mucho,
// UN aviso con su botón (`filaDePortada`, lib/widgets/fila-portada.ts). Lo que no
// cabe aquí no se pierde: el diseño propio sigue en «Cómo se ve», las webs
// autorizadas y la versión en «Ponlo en tu web». Arreglas uno y sale el siguiente.
//
// Su web se nombra como TEXTO, nunca como enlace (lo de siempre: el anfitrión
// llega de fuera).

/** El tono de la baldosa de cada pieza, por su categoría (el mismo que la portada de siempre). */
const TONO_CATEGORIA: Record<CategoriaWidget, Tono> = { reservas: 'azul', venta: 'verde', captacion: 'magenta', estudio: 'indigo', contenido: 'indigo' };

const CLASE_CHIP: Record<TonoChip, string> = {
  ok: 'border-success/30 bg-success/10',
  aviso: 'border-warning/40 bg-warning/10',
  neutro: 'border-border bg-muted/60',
};
const PUNTO_CHIP: Record<TonoChip, string> = { ok: 'bg-success', aviso: 'bg-warning', neutro: 'bg-muted-foreground/50' };

export function FilaWidget({ f, fila, onCambiar, onCopiar, onAccion, onVerResultados }: {
  f: FilaTienes;
  fila: FilaPortada;
  onCambiar: () => void;
  onCopiar: () => void;
  onAccion: (hace: AccionAviso) => void;
  /** Solo si puede ver los resultados: lleva a los de la etiqueta con la que se copió. */
  onVerResultados?: (etiqueta: string | null) => void;
}) {
  const { pieza: p } = f;
  const Icono = ICONOS[f.icono] ?? CalendarDays;
  const { chip, aviso } = fila;
  const copiar = f.esEnlace ? 'Copiar enlace' : 'Copiar código';

  return (
    <li className="rounded-t-card border border-border bg-card p-4 shadow-t-card @md/config:p-5">
      <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3.5 gap-y-3 @2xl/config:grid-cols-[auto_minmax(0,1fr)_auto]">
        <Baldosa tono={TONO_CATEGORIA[widgetPorId(f.id)?.categoria ?? 'estudio']} Icono={Icono} />
        <div className="min-w-0 space-y-1">
          <h4 className="text-[15px] font-semibold leading-snug text-foreground">{f.nombre}</h4>
          <p className="text-[12.5px] text-muted-foreground">
            {p.metodo ? `${METODOS[p.metodo].nombre} · copiado el ${fechaCorta(f.en)}` : `Copiado el ${fechaCorta(f.en)}`}
          </p>
          {f.mes && (
            <p className="flex flex-wrap items-center gap-x-1.5 text-[12.5px] text-muted-foreground">
              <TrendingUp size={13} aria-hidden className="shrink-0" />{f.mes}
              {onVerResultados && (
                <button
                  type="button"
                  onClick={() => onVerResultados(p.etiqueta)}
                  aria-label={`Ver resultados de ${f.nombre}`}
                  className={cn(TACTIL, 'gap-0.5 font-semibold text-foreground underline underline-offset-2 hover:no-underline', FOCO)}
                >
                  Ver resultados<ArrowRight size={12} aria-hidden />
                </button>
              )}
            </p>
          )}
        </div>
        <div className="col-span-2 flex min-w-0 flex-col items-start gap-2.5 @2xl/config:col-span-1 @2xl/config:items-end">
          {chip && (
            <span
              data-estado-en-tu-web=""
              title={chip.detalle ?? undefined}
              aria-description={chip.detalle ?? undefined}
              className={cn('inline-flex max-w-full items-start gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-medium leading-snug text-foreground', CLASE_CHIP[chip.tono])}
            >
              <span aria-hidden className={cn('mt-[5px] size-1.5 shrink-0 rounded-full', PUNTO_CHIP[chip.tono])} />
              {/* Un dominio largo no cabe en 375 px sin partirlo. */}
              <span className="min-w-0 [overflow-wrap:anywhere]">{chip.texto}</span>
            </span>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={onCambiar} aria-label={`Cambiar ${f.nombre}`} className={btnSecondary}>Cambiar</button>
            <button type="button" onClick={onCopiar} aria-label={`${copiar} de ${f.nombre}`} className={cn(btnSecondary, 'inline-flex items-center gap-1.5')}>
              <Copy size={14} aria-hidden />{copiar}
            </button>
          </div>
        </div>
      </div>
      {aviso && (
        <div data-aviso-fila={aviso.clave} className="mt-3.5 flex items-start gap-2.5 rounded-xl border border-warning/40 bg-warning/10 px-3.5 py-3 text-[12.5px] leading-relaxed text-foreground">
          <AlertCircle size={15} aria-hidden className="mt-0.5 shrink-0 text-warning" />
          <div className="min-w-0">
            <p className="[overflow-wrap:anywhere]">{aviso.texto}</p>
            {aviso.accion && (
              <button type="button" onClick={() => onAccion(aviso.accion!.hace)} className={cn(TACTIL, 'font-semibold underline underline-offset-2 hover:no-underline', FOCO)}>
                {aviso.accion.texto}
              </button>
            )}
          </div>
        </div>
      )}
    </li>
  );
}
