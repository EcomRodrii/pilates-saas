"use client";

import { Button, EmptyState } from "@/components/portal-tema/components/ui/primitives";
import { Island, StatusBar } from "@/components/portal-tema/components/layout/chrome";
import { AnadirAlCalendario } from "@/components/portal-tema/components/ui/anadir-al-calendario";
import { useActions } from "@/components/portal-tema/store/PortalStore";
import type { ViewModel } from "@/components/portal-tema/store/useViewModel";

/** Mis reservas. Cada una con ver y cancelar. */
export function Bookings({ vm }: { vm: ViewModel }) {
  const actions = useActions();
  return (
    <>
      <Island />
      <StatusBar />
      <div className="canvas no-scrollbar">
        <h1 className="screen-title">Mis reservas</h1>
        <div className="scroller no-scrollbar">
          {vm.bookings.length ? (
            vm.bookings.map((row) => (
              <article className="card booking" key={row.id}>
                <div className="booking__head">
                  <div className="class-row__time">
                    <p className="class-row__hour">{row.time}</p>
                    <p className="class-row__dur" style={{ letterSpacing: ".06em", fontWeight: 600 }}>{row.day}</p>
                  </div>
                  <div className="class-row__body">
                    <p className="class-row__name">{row.name}</p>
                    <p className="class-row__meta">{row.meta}</p>
                  </div>
                </div>
                <div className="booking__actions">
                  <Button size="sm" onClick={() => actions.openClass(row.id)}>Ver clase</Button>
                  <Button size="sm" variant="ghost" onClick={() => actions.abrirHoja({ tipo: 'cancelar', classId: row.id, reservaId: row.reservaId })}>Cancelar</Button>
                </div>
                {/* §6 — Antes esto solo se ofrecía en la pantalla de
                    confirmación: quien la cerraba, o reservaba desde el widget
                    de la web del estudio, se quedaba sin poder añadirla nunca.
                    Aquí está mientras la reserva exista. */}
                <div className="booking__actions" style={{ marginTop: 6 }}>
                  <AnadirAlCalendario evento={row.ics} />
                </div>
              </article>
            ))
          ) : (
            <EmptyState
              title="Aún no has reservado"
              text="Elige una clase del horario y aparecerá aquí."
              cta="Ver horario"
              onAction={actions.goSchedule}
            />
          )}
        </div>
      </div>
    </>
  );
}
