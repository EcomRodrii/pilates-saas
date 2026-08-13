"use client";

import { Icon } from "@/components/portal-tema/components/ui/Icon";
import { Card, SectionTitle } from "@/components/portal-tema/components/ui/primitives";
import { Island, StatusBar } from "@/components/portal-tema/components/layout/chrome";
import { useActions } from "@/components/portal-tema/store/PortalStore";
import type { ViewModel } from "@/components/portal-tema/store/useViewModel";

/** Calendario del mes. El punto marca los días con clase. */
export function Calendar({ vm }: { vm: ViewModel }) {
  const actions = useActions();
  return (
    <>
      <Island />
      <StatusBar />
      <div className="canvas no-scrollbar">
        <div className="screen-head">
          <h1 className="screen-title">Calendario</h1>
          <button className="link" onClick={actions.goSchedule}>Ver lista</button>
        </div>

        <Card className="calendar">
          <div className="calendar__head">
            <p className="calendar__month">{vm.calendar.month}</p>
            {/* ⚠️ Aquí había dos flechas de mes anterior/siguiente SIN `onClick`:
                no hacían nada ya antes de este cambio. Se quitan en vez de
                dejarlas: con el mes de muestra el engaño era doble, pero con el
                mes real una flecha muerta es una promesa incumplida a la vista.
                Navegar de mes exige que `state.day` deje de ser un número de
                día y pase a fecha completa —hoy el filtro del horario casa por
                día del mes—, y eso es una pasada propia, no un `onClick`. */}
          </div>
          <div className="calendar__grid">
            {vm.calendar.dow.map((d, i) => <span className="calendar__dow" key={d + i}>{d}</span>)}
            {vm.calendar.cells.map((cell) => (
              <button
                key={cell.fecha}
                className={["calendar__cell", cell.outside ? "is-muted" : "", cell.today ? "is-today" : "", cell.selected ? "is-selected" : ""].filter(Boolean).join(" ")}
                onClick={cell.outside ? undefined : () => actions.selectDay(cell.label)}
              >
                {cell.label}
                {cell.marked ? <i className="calendar__mark"></i> : null}
              </button>
            ))}
          </div>
        </Card>

        <section>
          <SectionTitle>Ocupación de la semana</SectionTitle>
          <Card className="chart">
            <div className="chart__head">
              <div>
                <p className="chart__value">78%</p>
                <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>media de plazas ocupadas</p>
              </div>
              <span className="chart__delta"><Icon name="trend" size={15} /> +12%</span>
            </div>
            <div className="chart__plot">
              {vm.progress.bars.map((bar, i) => (
                <div className={("chart__col " + (i === 2 ? "is-peak" : "")).trim()} key={bar.label + i}>
                  <span className="chart__bar" style={{ "--h": bar.height * 2.6 + "px" } as React.CSSProperties}></span>
                  <span className="chart__label">{bar.label}</span>
                </div>
              ))}
            </div>
          </Card>
        </section>
        <div style={{ height: 8 }}></div>
      </div>
    </>
  );
}
