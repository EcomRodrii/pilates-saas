'use client';

// «¿Para qué clienta?» antes de asignar una plaza fija desde el horario: la
// plaza es de una persona, y el diálogo de plaza fija empieza por ella. Busca
// entre las clientas activas que ya tiene cargadas el panel (nombre y
// apellidos, sin tildes ni mayúsculas). Se monta al abrir y se desmonta al cerrar.

import { useId, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const VISIBLES = 8;

const normalizar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export function ElegirClienta({ titulo, subtitulo, clientas, onElegir, onClose }: {
  titulo: string;
  /** La clase para la que se elige, p. ej. «Reformer · Martes 18:00 · Sala 1». */
  subtitulo: string;
  /** `sinCuota`: no tiene una cuota que incluya esta clase. Sale al final y no
   *  se puede elegir: la plaza fija va con la cuota (con bono, clase a clase). */
  clientas: { id: string; nombre: string; sinCuota?: boolean }[];
  onElegir: (socioId: string) => void;
  onClose: () => void;
}) {
  const uid = useId();
  const [busqueda, setBusqueda] = useState('');
  const { resultados, total } = useMemo(() => {
    const q = normalizar(busqueda);
    const lista = q ? clientas.filter(c => normalizar(c.nombre).includes(q)) : clientas;
    return { resultados: lista.slice(0, VISIBLES), total: lista.length };
  }, [busqueda, clientas]);

  return (
    <Dialog open onOpenChange={abierto => { if (!abierto) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground -mt-1">{subtitulo}</p>
        <label htmlFor={`${uid}-buscar`} className="text-xs font-semibold text-muted-foreground">Clienta</label>
        <input
          id={`${uid}-buscar`} autoFocus type="search" value={busqueda} onChange={e => setBusqueda(e.target.value)}
          placeholder="Busca por nombre"
          className="w-full text-sm rounded-lg border border-border bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ring"
        />
        {resultados.length === 0 ? (
          <p className="text-sm text-muted-foreground py-3">
            {clientas.length === 0 ? 'No hay clientas activas sin plaza fija en esta clase.' : 'Ninguna clienta con ese nombre.'}
          </p>
        ) : (
          <ul className="max-h-72 overflow-y-auto rounded-lg border border-border">
            {resultados.map(c => (
              <li key={c.id} className="border-t border-border first:border-t-0">
                <button
                  type="button" onClick={() => onElegir(c.id)} disabled={c.sinCuota}
                  className="w-full flex items-center justify-between gap-3 text-left px-3 py-2.5 text-sm text-foreground hover:bg-muted transition-colors disabled:cursor-not-allowed disabled:text-muted-foreground disabled:hover:bg-transparent"
                >
                  <span className="truncate">{c.nombre}</span>
                  {c.sinCuota && <span className="shrink-0 text-xs">Sin cuota</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
        {total > resultados.length && (
          <p className="text-xs text-muted-foreground -mt-2">Hay {total - resultados.length} más: busca por nombre.</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
