"use client";

import { useEffect } from "react";
import { Icon } from "@/components/portal-tema/components/ui/Icon";
import { EmptyState, Skeleton } from "@/components/portal-tema/components/ui/primitives";
import { StatusBar } from "@/components/portal-tema/components/layout/chrome";
import { useActions } from "@/components/portal-tema/store/PortalStore";
import type { ViewModel } from "@/components/portal-tema/store/useViewModel";

/**
 * Historial de clases.
 *
 * ⚠️ Esta pantalla NO EXISTÍA: la fila «Historial de clases» del perfil llamaba
 * a `goBookings`, o sea que llevaba a la AGENDA. La agenda mira hacia delante
 * («¿qué tengo?») y el historial hacia atrás («¿a qué fui?»): son cosas
 * distintas, y quien entra ahí busca la segunda.
 *
 * Enseña las asistidas Y las canceladas, distinguidas. Un historial que solo
 * cuenta las asistidas es media verdad — y la mitad que falta es justo la que
 * se va a mirar cuando alguien discuta un cargo.
 */
export function Historial({ vm }: { vm: ViewModel }) {
  const actions = useActions();
  const h = vm.historial;

  // Se pide al abrir, no con el catálogo: es una lista larga que solo interesa
  // aquí. Mismo criterio que la bandeja de avisos.
  useEffect(() => { actions.cargarHistorial(); }, [actions]);

  return (
    <>
      <StatusBar />
      <div className="canvas no-scrollbar">
        <div className="topbar" style={{ padding: "0 0 4px" }}>
          <button className="icon-btn is-pressable" onClick={actions.back} aria-label="Atrás">
            <Icon name="back" stroke={1.9} />
          </button>
          <p className="topbar__title">Historial</p>
          <span style={{ width: 40 }}></span>
        </div>

        {h.filas === null ? (
          /* ⚠️ Esqueleto, no un spinner ni un vacío: mientras no ha llegado
             nada, decir «no tienes clases» sería mentir. `null` es «todavía no
             lo sé» y `[]` es «no hay»; se pintan distinto a propósito. */
          <div className="scroller no-scrollbar" aria-busy="true" aria-label="Cargando tu historial">
            {[0, 1, 2, 3].map((i) => (
              <div className="skeleton-row" key={i}>
                <div className="skeleton-row__body">
                  <Skeleton width="55%" height={14} />
                  <Skeleton width="35%" height={12} />
                </div>
              </div>
            ))}
          </div>
        ) : h.filas.length === 0 ? (
          <EmptyState
            title="Todavía no has ido a ninguna clase"
            text="Cuando asistas a tu primera, la verás aquí con su fecha y quién la dio."
            cta="Ver el horario"
            onAction={actions.goSchedule}
          />
        ) : (
          <div className="scroller no-scrollbar">
            {h.filas.map((f) => (
              <div className="agenda-row" key={f.id}>
                <span
                  className={"agenda-row__marca" + (f.cancelada ? " agenda-row__marca--espera" : "")}
                  aria-hidden="true"
                ></span>
                <span className="agenda-row__body">
                  <span className="agenda-row__name">{f.nombre}</span>
                  <span className="agenda-row__meta">
                    {[f.cuando, f.instructora].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <span className={"agenda-pill" + (f.cancelada ? " agenda-pill--espera" : "")}>{f.etiqueta}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
