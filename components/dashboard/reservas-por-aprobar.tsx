'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { CalendarCheck } from 'lucide-react';
import { dbListarReservasPorAprobar } from '@/lib/supabase-data';
import { decidirReservaPendiente } from '@/lib/api-client';
import { ANCLA_DECIDIR, invalidarEstadoEstudio } from '@/lib/estado-estudio-cliente';
import { resultadoDecisionReserva, VISIBLES_POR_APROBAR, type ReservaPorAprobar } from '@/lib/reservas-por-aprobar';
import { TZ_ESTUDIO } from '@/lib/utils';
import { Button } from '@/components/ui/button';

// Reservas que esperan aprobación manual (Fase 2a), decididas aquí mismo en vez
// de mandar a buscarlas clase a clase en el calendario. Mismo alcance que
// `BajasPorRevisar`: una lista y dos botones, dentro de la bandeja, y se oculta
// sola si no hay nada. «Ver clase» sigue a mano para quien quiera mirar el
// aforo antes de decidir.
//
// Solo se monta si `puedeGestionarCalendario` (el mismo gate que el servidor).
// Qué se dice con cada respuesta lo decide `resultadoDecisionReserva`, que
// comparte con el calendario: aprobar no siempre es «plaza confirmada».

const fmtClase = new Intl.DateTimeFormat('es-ES', {
  weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: TZ_ESTUDIO,
});

function cuando(inicio: string): string {
  const d = new Date(inicio);
  return Number.isNaN(d.getTime()) ? '' : fmtClase.format(d);
}

export function ReservasPorAprobar({ onToast }: { onToast: (m: string) => void }) {
  const [items, setItems] = useState<ReservaPorAprobar[] | null>(null);
  const [enviando, setEnviando] = useState<{ id: string; aprobar: boolean } | null>(null);
  // El motivo por el que una fila sigue ahí (límite semanal, sin red…).
  const [avisos, setAvisos] = useState<Record<string, string>>({});
  // El estado tarda un render: dos toques seguidos lo leerían aún vacío.
  const enviandoRef = useRef(false);

  useEffect(() => {
    let vivo = true;
    void dbListarReservasPorAprobar().then((r) => { if (vivo) setItems(r); });
    return () => { vivo = false; };
  }, []);

  async function decidir(r: ReservaPorAprobar, aprobar: boolean) {
    if (enviandoRef.current) return;
    enviandoRef.current = true;
    setEnviando({ id: r.id, aprobar });
    setAvisos(({ [r.id]: _viejo, ...resto }) => resto);
    try {
      const res = resultadoDecisionReserva(aprobar, await decidirReservaPendiente(r.id, aprobar));
      if (res.quitar) {
        setItems((prev) => (prev ?? []).filter((x) => x.id !== r.id));
        invalidarEstadoEstudio();
        onToast(res.mensaje);
      } else {
        setAvisos((prev) => ({ ...prev, [r.id]: res.mensaje }));
      }
    } finally {
      enviandoRef.current = false;
      setEnviando(null);
    }
  }

  if (!items?.length) return null;
  const visibles = items.slice(0, VISIBLES_POR_APROBAR);

  return (
    // Sin marco propio: vive dentro de la bandeja (EstadoDelEstudio), que ya lo pone.
    <div id={ANCLA_DECIDIR.reservasPorAprobar} tabIndex={-1} data-testid="reservas-por-aprobar"
      className="scroll-mt-20 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
      <div className="mb-1 flex items-center gap-2">
        <CalendarCheck className="size-4 text-muted-foreground" />
        <p className="text-[13px] font-medium text-foreground">
          {items.length === 1 ? 'Una reserva por aprobar' : `${items.length} reservas por aprobar`}
        </p>
      </div>
      <p className="mb-3 text-[11px] text-muted-foreground">
        Mientras espera no ocupa plaza ni gasta bono. Al aprobarla se vuelve a mirar el aforo: si la clase se ha llenado, pasa a la lista de espera.
        {items.length > visibles.length && ` Aquí ves las ${visibles.length} más próximas.`}
      </p>

      <ul className="flex flex-col gap-2">
        {visibles.map((r) => {
          const esta = enviando?.id === r.id;
          return (
            <li key={r.id} data-testid="reserva-por-aprobar"
              className="flex flex-col gap-2 rounded-lg bg-muted/40 px-3 py-2 xl:flex-row xl:items-center xl:justify-between">
              <div className="min-w-0">
                <p className="truncate text-[13px] text-foreground">{r.socioNombre} · {r.clase}</p>
                <p className="text-[11px] text-muted-foreground">
                  {cuando(r.inicio)}
                  {' · '}
                  <Link href={`/calendario?sesion=${encodeURIComponent(r.sesionId)}`} className="underline underline-offset-2 hover:text-foreground">
                    Ver clase
                  </Link>
                </p>
                {avisos[r.id] && <p role="alert" className="mt-1 text-[12px] text-destructive">{avisos[r.id]}</p>}
              </div>
              <div className="flex shrink-0 justify-end gap-2">
                <Button size="sm" variant="outline" disabled={enviando !== null}
                  aria-label={`Rechazar la reserva de ${r.socioNombre}`} onClick={() => void decidir(r, false)}>
                  {esta && !enviando.aprobar ? 'Guardando…' : 'Rechazar'}
                </Button>
                <Button size="sm" disabled={enviando !== null}
                  aria-label={`Aprobar la reserva de ${r.socioNombre}`} onClick={() => void decidir(r, true)}>
                  {esta && enviando.aprobar ? 'Guardando…' : 'Aprobar'}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
