"use client";

import { Chip, EmptyState } from "@/components/portal-tema/components/ui/primitives";
import { ClassRow, ClassRowPlana, DayStrip, Island, StatusBar } from "@/components/portal-tema/components/layout/chrome";
import { Icon } from "@/components/portal-tema/components/ui/Icon";
import { useActions, usePortal } from "@/components/portal-tema/store/PortalStore";
import type { ViewModel } from "@/components/portal-tema/store/useViewModel";

/**
 * El horario. Dos formas según el tema:
 *
 *   `chips` — «Clases», el contador y los filtros por tipo (Oliva/Bloom/Noir).
 *   `tabs`  — «Reservas» con dos pestañas, Clases y Lista de espera (Tentada).
 *
 * La lista de espera NO es una pantalla aparte: son las reservas de la socia en
 * estado `LISTA_ESPERA`, que hasta ahora el portal pintaba como «Reservada»
 * porque `ReservaPortal` no llevaba el estado.
 */
export function Schedule({ vm }: { vm: ViewModel }) {
  const actions = useActions();
  const { horarioTab } = usePortal();
  const conPestanas = vm.features.schedule_style === "tabs";

  if (!conPestanas) {
    return (
      <>
        <Island />
        <StatusBar />
        <div className="canvas no-scrollbar">
          <div className="screen-head">
            <h1 className="screen-title">Clases</h1>
            {/* Sin contador arriba cuando la línea «Hoy · N clases» ya va bajo
                los filtros: dos veces la misma cifra en la misma pantalla. */}
            {vm.features.day_strip_style === "cajas"
              ? null
              : <span className="screen-count">{vm.classCount}</span>}
          </div>

          <DayStrip week={vm.week} tight boxed={vm.features.day_strip_style === "cajas"} />

          <div className="rail">
            {vm.filters.map((item) => (
              <Chip key={item.key} active={item.active} onClick={() => actions.setFilter(item.key)}>
                {item.label}
              </Chip>
            ))}
          </div>

          {vm.features.day_strip_style === "cajas"
            ? <p className="dia-frase">{vm.diaFrase}</p>
            : null}

          <div className="scroller no-scrollbar">
            {vm.classes.length ? (
              vm.classes.map((row) => (
                <ClassRow key={row.id} row={row} sereno={vm.features.day_strip_style === "cajas"} />
              ))
            ) : (
              <EmptyState title="Nada este día" text="Prueba otro día de la semana o quita el filtro." />
            )}
          </div>
        </div>
      </>
    );
  }

  const enClases = horarioTab === "clases";
  return (
    <>
      <Island />
      <StatusBar />
      <div className="canvas no-scrollbar">
        <h1 className="screen-title">Reservas</h1>

        <div className="subtabs" role="tablist">
          <button
            role="tab" aria-selected={enClases}
            className={"subtab " + (enClases ? "is-active" : "")}
            onClick={() => actions.setHorarioTab("clases")}
          >Clases</button>
          <button
            role="tab" aria-selected={!enClases}
            className={"subtab " + (!enClases ? "is-active" : "")}
            onClick={() => actions.setHorarioTab("espera")}
          >Lista de espera</button>
        </div>

        {enClases ? (
          <>
            <DayStrip week={vm.week} boxed />
            <div className="scroller no-scrollbar">
              {vm.classes.length ? (
                vm.classes.map((row) => <ClassRowPlana key={row.id} row={row} />)
              ) : (
                <EmptyState
                  title="No hay clases este día"
                  text="El estudio descansa. Prueba otro día de la semana."
                />
              )}
            </div>
          </>
        ) : (
          <div className="scroller no-scrollbar">
            {vm.waitlist.length ? (
              vm.waitlist.map((w) => (
                <article className="wait-row" key={w.id}>
                  <div className="wait-row__body">
                    <p className="wait-row__date">{w.dateLine}</p>
                    <p className="wait-row__name">{w.name}</p>
                    <p className="wait-row__meta">{w.meta}</p>
                  </div>
                  <div className="wait-row__side">
                    <span className="wait-row__pos">{w.positionLabel}</span>
                    <button className="wait-row__leave" onClick={() => actions.cancel(w.id, w.reservaId)}>
                      Salir
                    </button>
                  </div>
                </article>
              ))
            ) : (
              <div className="wait-empty">
                <span className="wait-empty__mark"><Icon name="clock" size={22} stroke={1.5} /></span>
                <p className="wait-empty__title">Nada por aquí</p>
                <p className="wait-empty__text">
                  Cuando una clase esté completa podrás apuntarte a su lista de espera.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
