'use client';

import type { ReactNode } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { clasesMarcadas, diaCorto, porMes, textoCrear, tituloMes, type FechaParaConfirmar } from '@/lib/calendario/confirmar-fechas';

// `ConfirmarFechas` (P2.3, doc 07 §5): ver y quitar fechas antes de crear
// clases. Controlado: quien lo usa decide qué viene marcado (los festivos,
// desmarcados) y qué se hace al crear. El botón cuenta en vivo las clases que
// salen, y con 0 no se ofrece. Si crear falla, el diálogo sigue abierto con el
// error: nunca se da por hecho sin que el servidor lo diga.
//
// Hoy solo lo usa «Repetir este mes». «Clase semanal» tiene su propio plan de
// fechas y no se ha tocado (decisión conservadora: es un flujo diario de todos
// los estudios).
//
// ⚠️ Los fieldset llevan `min-w-0`: de serie miden lo que su contenido
// (min-inline-size: min-content) y un nombre largo desbordaba el diálogo en el móvil.

export function ConfirmarFechas({
  titulo, descripcion, children, fechas, marcadas, onCambiar, onCrear, onCerrar, enviando, error, vacio,
}: {
  titulo: string;
  descripcion?: string;
  /** Lo que va antes de las fechas (p. ej. qué clases se repiten). */
  children?: ReactNode;
  fechas: FechaParaConfirmar[];
  marcadas: ReadonlySet<string>;
  onCambiar: (marcadas: Set<string>) => void;
  onCrear: () => void;
  onCerrar: () => void;
  enviando: boolean;
  error: string | null;
  /** Qué decir si no queda ninguna fecha («Noviembre ya está creado»). */
  vacio: string;
}) {
  const n = clasesMarcadas(fechas, marcadas);
  const marcar = (fecha: string, si: boolean) => {
    const otra = new Set(marcadas);
    if (si) otra.add(fecha); else otra.delete(fecha);
    onCambiar(otra);
  };

  return (
    <Dialog open onOpenChange={abierto => { if (!abierto && !enviando) onCerrar(); }}>
      <DialogContent className="max-w-lg" data-testid="confirmar-fechas">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          {descripcion && <DialogDescription>{descripcion}</DialogDescription>}
        </DialogHeader>

        <div className="-mx-1 max-h-[45vh] space-y-4 overflow-y-auto px-1 sm:max-h-[60vh]">
          {children}

          {fechas.length === 0 ? (
            <p className="text-sm text-muted-foreground" role="status">{vacio}</p>
          ) : (
            <fieldset className="min-w-0 space-y-3" disabled={enviando}>
              <legend className="sr-only">Días</legend>
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-muted-foreground" aria-hidden>Días</p>
                <div className="flex gap-1">
                  <Button type="button" size="sm" variant="ghost" className="min-h-11 px-2 text-xs md:min-h-8"
                    onClick={() => onCambiar(new Set(fechas.map(f => f.fecha)))}>Seleccionar todos</Button>
                  <Button type="button" size="sm" variant="ghost" className="min-h-11 px-2 text-xs md:min-h-8"
                    onClick={() => onCambiar(new Set())}>Ninguno</Button>
                </div>
              </div>
              {porMes(fechas).map(grupo => (
                <div key={grupo.mes}>
                  <p className="mb-1 text-xs font-semibold text-foreground">{tituloMes(grupo.mes)}</p>
                  <ul className="divide-y divide-border rounded-lg border border-border">
                    {grupo.fechas.map(f => (
                      <li key={f.fecha}>
                        <label className="flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2 text-sm"
                          data-testid="fecha-para-confirmar" data-fecha={f.fecha}>
                          <input type="checkbox" className="size-4 shrink-0 accent-[var(--brand)]"
                            checked={marcadas.has(f.fecha)} onChange={e => marcar(f.fecha, e.target.checked)} />
                          <span className="min-w-0 flex-1">
                            <span className="text-foreground">{diaCorto(f.fecha)}</span>
                            <span className="text-muted-foreground"> · {f.clases === 1 ? '1 clase' : `${f.clases} clases`}</span>
                            {f.festivo && (
                              <span className="mt-0.5 block text-xs font-medium text-warning">{f.festivo}</span>
                            )}
                            {f.nota && <span className="mt-0.5 block text-xs text-muted-foreground">{f.nota}</span>}
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </fieldset>
          )}
          {error && <p role="alert" className="text-sm font-medium text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" className="min-h-11 md:min-h-9" onClick={onCerrar} disabled={enviando}>
            {fechas.length > 0 ? 'Cancelar' : 'Cerrar'}
          </Button>
          {fechas.length > 0 && (
            <Button className="min-h-11 md:min-h-9" onClick={onCrear} disabled={enviando || n === 0} data-testid="confirmar-fechas-crear">
              {enviando ? 'Creando…' : textoCrear(n)}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
