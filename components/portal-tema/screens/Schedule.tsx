"use client";

import { Chip, EmptyState } from "@/components/portal-tema/components/ui/primitives";
import { ClassRow, DayStrip, Island, StatusBar } from "@/components/portal-tema/components/layout/chrome";
import { useActions } from "@/components/portal-tema/store/PortalStore";
import type { ViewModel } from "@/components/portal-tema/store/useViewModel";

/** Horario: día, tipo y lista. Con estado vacío propio. */
export function Schedule({ vm }: { vm: ViewModel }) {
  const actions = useActions();
  return (
    <>
      <Island />
      <StatusBar />
      <div className="canvas no-scrollbar">
        <div className="screen-head">
          <h1 className="screen-title">Clases</h1>
          <span className="screen-count">{vm.classCount}</span>
        </div>

        <DayStrip week={vm.week} tight />

        <div className="rail">
          {vm.filters.map((item) => (
            <Chip key={item.key} active={item.active} onClick={() => actions.setFilter(item.key)}>
              {item.label}
            </Chip>
          ))}
        </div>

        <div className="scroller no-scrollbar">
          {vm.classes.length ? (
            vm.classes.map((row) => <ClassRow key={row.id} row={row} />)
          ) : (
            <EmptyState title="Nada este día" text="Prueba otro día de la semana o quita el filtro." />
          )}
        </div>
      </div>
    </>
  );
}
