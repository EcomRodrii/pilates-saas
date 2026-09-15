'use client';

// Pausar una plaza fija unas fechas (vacaciones, una lesión…) sin quitarla.
//
// La plaza sigue activa y conserva su sitio: entre esas fechas el motor no le
// reserva la clase y al acabar vuelve sola. Guardar va por el servidor
// (`/api/plazas-fijas/estado`), que suelta las clases ya reservadas en esas
// fechas —salvo las que están dentro del plazo de cancelación— y, al quitar o
// acortar la pausa, le reserva ya las que vuelven.
//
// Se monta al abrir y se desmonta al cerrar, como `DialogoPlazaFija`.

import { useId, useState } from 'react';
import { useStudio } from '@/lib/studio-context';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { hoyEnEstudio } from '@/lib/utils';
import { estadoPausa, pausaDe, textoTrasPausa, validarPausa, type Pausa } from '@/lib/plazas-fijas-pausa';
import type { PlazaFija } from '@/lib/types';

const inputCls = 'w-full text-sm rounded-lg border border-border bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ring';
const labelCls = 'text-xs font-semibold text-muted-foreground mb-1.5 block';

export function DialogoPausaPlazaFija({ plaza, nombre, onClose, onHecho }: {
  plaza: PlazaFija;
  /** «Martes 10:00», para situar a quien la pausa. */
  nombre: string;
  onClose: () => void;
  onHecho: (mensaje: string) => void;
}) {
  const { pausarPlazaFija } = useStudio();
  const uid = useId();
  const [hoy] = useState(() => hoyEnEstudio());
  // Una pausa que ya terminó no se ofrece para cambiar: se pausa de nuevo.
  const actual = estadoPausa(plaza, hoy) === 'sin_pausa' ? null : pausaDe(plaza);
  const [desde, setDesde] = useState(actual?.desde ?? hoy);
  const [hasta, setHasta] = useState(actual?.hasta ?? '');
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  // Hasta que no hay «hasta» no se riñe: es el campo que falta, no un error.
  const aviso = hasta ? validarPausa(desde, hasta, hoy) : null;
  const puedeGuardar = !!desde && !!hasta && !aviso && !guardando;

  async function enviar(pausa: Pausa | null) {
    setGuardando(true);
    setError(null);
    const r = await pausarPlazaFija(plaza.id, pausa);
    setGuardando(false);
    if (!r.ok) { setError(r.error); return; }
    onHecho(textoTrasPausa(r, pausa));
  }

  return (
    <Dialog open onOpenChange={abierto => { if (!abierto && !guardando) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{actual ? 'Cambiar la pausa' : 'Pausar plaza fija'}</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground -mt-1">
          {nombre}. Entre estas fechas no se le reserva la clase, pero no pierde la plaza ni su sitio, y al acabar
          vuelve sola.
        </p>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor={`${uid}-desde`} className={labelCls}>Desde</label>
              <input id={`${uid}-desde`} type="date" className={inputCls} value={desde} onChange={e => setDesde(e.target.value)} />
            </div>
            <div>
              <label htmlFor={`${uid}-hasta`} className={labelCls}>Hasta</label>
              <input id={`${uid}-hasta`} type="date" className={inputCls} min={desde || hoy} value={hasta} onChange={e => setHasta(e.target.value)} />
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Las clases que ya tenía reservadas en esas fechas se cancelan sin penalización; si hay alguien en lista de
            espera, entra en su lugar. Las que empiezan dentro del plazo de cancelación se mantienen.
          </p>
          {actual && (
            <p className="text-[11px] text-muted-foreground">
              Si la quitas o la acortas, se le reservan al momento las clases que vuelven, también la de hoy o mañana si
              hay sitio: avísala para que no se le pase.
            </p>
          )}
          {aviso && <p role="alert" className="text-xs font-medium text-destructive">{aviso}</p>}
          {error && <p role="alert" className="text-xs font-medium text-destructive">{error}</p>}
        </div>

        <div className="flex items-center justify-between gap-2 pt-2">
          <div>
            {actual && (
              <button
                onClick={() => enviar(null)}
                disabled={guardando}
                className="text-xs font-semibold px-3 py-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-50"
              >
                Quitar pausa
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} disabled={guardando} className="text-xs font-semibold px-4 py-2 rounded-lg border border-border text-muted-foreground hover:text-foreground disabled:opacity-50">
              Cancelar
            </button>
            <button
              disabled={!puedeGuardar}
              onClick={() => enviar({ desde, hasta })}
              className="text-xs font-bold px-4 py-2 rounded-lg text-primary-foreground bg-primary hover:brightness-95 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {guardando ? 'Guardando…' : actual ? 'Guardar pausa' : 'Pausar'}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
