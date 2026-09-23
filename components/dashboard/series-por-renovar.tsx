'use client';

import { useEffect, useRef, useState } from 'react';
import { CalendarClock } from 'lucide-react';
import { useStudio } from '@/lib/studio-context';
import { ANCLA_DECIDIR, invalidarEstadoEstudio, useAnclaDeAviso } from '@/lib/estado-estudio-cliente';
import { listarSeriesPorRenovar, marcarNoRenovar } from '@/lib/series-renovacion-cliente';
import { nombreSerie, textoFinSerie, type SeriePorRenovar } from '@/lib/series-renovacion';
import { hoyEnEstudio } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { DialogoRenovarSerie } from '@/components/series/dialogo-renovar-serie';

// Clases que se repiten y se acaban (30 días por delante, o terminadas hace
// menos de 14) sin renovar, dentro de la bandeja de Inicio. Mismo alcance que
// `ReservasPorAprobar`: una lista y dos botones, y se oculta sola si no hay nada.
//
// Qué entra lo decide la base de datos (`series_por_renovar`): fuera las marcadas
// «no renovar», la cola cancelada a propósito y la que ya continúa en otra serie.
// Solo se monta si `puedeGestionarCalendario` (el mismo gate que el servidor).

const VISIBLES = 5;

export function SeriesPorRenovar({ onToast }: { onToast: (m: string) => void }) {
  const { salas, tiposClase } = useStudio();
  const [items, setItems] = useState<SeriePorRenovar[] | null>(null);
  const [abierta, setAbierta] = useState<SeriePorRenovar | null>(null);
  const [enviando, setEnviando] = useState<string | null>(null);
  const enviandoRef = useRef(false);
  const [hoy] = useState(() => hoyEnEstudio());

  useEffect(() => {
    let vivo = true;
    void listarSeriesPorRenovar().then(r => { if (vivo) setItems(r); });
    return () => { vivo = false; };
  }, []);

  const nombre = (s: SeriePorRenovar) => nombreSerie(
    s,
    id => tiposClase.find(t => t.id === id)?.nombre,
    id => salas.find(x => x.id === id)?.nombre,
  );

  async function noRenovar(s: SeriePorRenovar) {
    if (enviandoRef.current) return;
    enviandoRef.current = true;
    setEnviando(s.serieId);
    try {
      const r = await marcarNoRenovar(s.serieId, true);
      if (!r.ok) { onToast(r.error); return; }
      setItems(prev => (prev ?? []).filter(x => x.serieId !== s.serieId));
      invalidarEstadoEstudio();
      onToast('No te lo volveremos a recordar. Si cambias de idea, renuévala desde la clase en el calendario.');
    } finally {
      enviandoRef.current = false;
      setEnviando(null);
    }
  }

  useAnclaDeAviso(ANCLA_DECIDIR.seriesPorRenovar, items !== null);

  if (!items?.length) return null;
  const visibles = items.slice(0, VISIBLES);

  return (
    // Sin marco propio: vive dentro de la bandeja (EstadoDelEstudio), que ya lo pone.
    <div id={ANCLA_DECIDIR.seriesPorRenovar} tabIndex={-1} data-testid="series-por-renovar"
      className="scroll-mt-20 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
      <div className="mb-1 flex items-center gap-2">
        <CalendarClock className="size-4 text-muted-foreground" />
        <p className="text-[13px] font-medium text-foreground">
          {items.length === 1 ? 'Una clase que se repite termina pronto' : `${items.length} clases que se repiten terminan pronto`}
        </p>
      </div>
      <p className="mb-3 text-[11px] text-muted-foreground">
        Si no la renuevas, ese hueco se queda sin clase y sus plazas fijas sin reserva. Renovar alarga la misma clase; lo que ya está en el calendario no se toca.
        {items.length > visibles.length && ` Aquí ves las ${visibles.length} que antes terminan.`}
      </p>

      <ul className="flex flex-col gap-2">
        {visibles.map(s => {
          const n = nombre(s);
          return (
            <li key={s.serieId} data-testid="serie-por-renovar"
              className="flex flex-col gap-2 rounded-lg bg-muted/40 px-3 py-2 xl:flex-row xl:items-center xl:justify-between">
              <div className="min-w-0">
                <p className="truncate text-[13px] text-foreground">{n}</p>
                <p className={s.terminada ? 'text-[11px] font-medium text-destructive' : 'text-[11px] text-muted-foreground'}>
                  {textoFinSerie(s.ultimaFecha, hoy)}
                  {s.plazasFijas > 0 && ` · ${s.plazasFijas === 1 ? '1 alumna con plaza fija' : `${s.plazasFijas} alumnas con plaza fija`}`}
                  {s.renovacionAutomatica && ' · se renueva sola'}
                </p>
              </div>
              <div className="flex shrink-0 justify-end gap-2">
                <Button size="sm" variant="outline" disabled={enviando !== null}
                  aria-label={`No renovar ${n}`} onClick={() => void noRenovar(s)}>
                  {enviando === s.serieId ? 'Guardando…' : 'No renovar'}
                </Button>
                <Button size="sm" disabled={enviando !== null}
                  aria-label={`Revisar y renovar ${n}`} onClick={() => setAbierta(s)}>
                  Revisar y renovar
                </Button>
              </div>
            </li>
          );
        })}
      </ul>

      {abierta && (
        <DialogoRenovarSerie
          serieId={abierta.serieId}
          nombre={nombre(abierta)}
          onClose={() => setAbierta(null)}
          onHecho={(mensaje, renovada) => {
            const id = abierta.serieId;
            setAbierta(null);
            if (renovada) {
              setItems(prev => (prev ?? []).filter(x => x.serieId !== id));
              invalidarEstadoEstudio();
            }
            onToast(mensaje);
          }}
        />
      )}
    </div>
  );
}
