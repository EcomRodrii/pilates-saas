"use client";

import { useEffect } from "react";
import { Button, Card, EmptyState, SectionTitle } from "@/components/portal-tema/components/ui/primitives";
import { Icon } from "@/components/portal-tema/components/ui/Icon";
import { DayStrip, Island, StatusBar } from "@/components/portal-tema/components/layout/chrome";
import { AnadirAlCalendario } from "@/components/portal-tema/components/ui/anadir-al-calendario";
import { useActions } from "@/components/portal-tema/store/PortalStore";
import type { ViewModel } from "@/components/portal-tema/store/useViewModel";

/**
 * La fila de la agenda de Sereno: barra de acento, cuerpo y píldora de estado.
 *
 * Sin botones a propósito. La de siempre lleva cuatro («Ver clase»,
 * «Cancelar», y los dos de calendario) y en una lista de la semana eso son
 * dieciséis botones en pantalla; aquí se entra a la clase y desde allí se
 * gestiona, que es lo que hace la captura.
 */
function FilaAgenda({ row, conFecha }: {
  row: ViewModel["bookings"][number];
  /** Con el bloque de fecha delante (vista de lista, que mezcla días). */
  conFecha?: boolean;
}) {
  const actions = useActions();
  return (
    <button className="agenda-row is-pressable" onClick={() => actions.openClass(row.id)}>
      {conFecha ? (
        <span className="agenda-row__fecha">
          <span className="agenda-row__dow">{row.day}</span>
          <span className="agenda-row__num">{row.dayNumero}</span>
        </span>
      ) : (
        <span className={"agenda-row__marca" + (row.enEspera ? " agenda-row__marca--espera" : "")} aria-hidden="true"></span>
      )}
      <span className="agenda-row__body">
        <span className="agenda-row__name">{row.name}</span>
        <span className="agenda-row__meta">
          {[conFecha ? row.time : row.tramo, conFecha && row.esHoy ? "Hoy" : "", row.profe]
            .filter(Boolean).join(" · ")}
        </span>
      </span>
      <span className={"agenda-pill" + (row.enEspera ? " agenda-pill--espera" : "")}>{row.estado}</span>
    </button>
  );
}

const VISTAS = [
  { key: "semana", label: "Semana" },
  { key: "mes", label: "Mes" },
  { key: "lista", label: "Lista" },
] as const;

/**
 * Mis reservas / Mi agenda.
 *
 * Dos formas según el tema. La de siempre es la LISTA a secas, y es la que
 * siguen viendo Tentada, Oliva, Bloom y Noir: nada cambia para ellos. Sereno
 * pide además semana y mes (`tab_set: "agenda"`), con el segmentado arriba.
 *
 * ⚠️ La vista de MES no navega entre meses, y no es un olvido: `state.day` es
 * un número de día, no una fecha, así que un mes anterior no se puede
 * seleccionar sin convertirlo — está documentado en `Calendar.tsx` desde antes
 * de esto. El prototipo tampoco trae flechas de mes, así que el hueco no se
 * nota; el día que haga falta, es una pasada propia.
 */
export function Bookings({ vm }: { vm: ViewModel }) {
  const actions = useActions();
  // El segmentado solo lo pide el tema que lo declara. Sin él, esta pantalla
  // es exactamente la de antes.
  const conVistas = vm.features.tab_set === "agenda";
  const vista = conVistas ? vm.agenda.vista : "lista";
  // El historial se pide al ABRIR la lista, no al montar el portal: es la mitad
  // del acuerdo que permite tenerlo sin meterlo en la carga de todo el mundo.
  // `cargarHistorial` es idempotente (se guarda de repetir), así que el efecto
  // puede correr en cada render de la lista sin encadenar peticiones.
  useEffect(() => {
    if (conVistas && vista === "lista") actions.cargarHistorial();
  }, [conVistas, vista, actions]);

  const delDia = new Set(vm.agenda.delDia);
  const filas = vista === "lista" ? vm.bookings : vm.bookings.filter((r) => delDia.has(r.id));

  return (
    <>
      <Island />
      <StatusBar />
      <div className="canvas no-scrollbar">
        <h1 className="screen-title">{conVistas ? "Mi agenda" : "Mis reservas"}</h1>

        {conVistas ? (
          <div className="segmented" role="tablist" aria-label="Vista de la agenda">
            {VISTAS.map((v) => (
              <button
                key={v.key}
                role="tab"
                aria-selected={vista === v.key}
                className={("segmented__item " + (vista === v.key ? "is-active" : "")).trim()}
                onClick={() => actions.setAgendaVista(v.key)}
              >
                {v.label}
              </button>
            ))}
          </div>
        ) : null}

        {conVistas && vista === "semana"
          ? <DayStrip week={vm.agenda.semana} boxed={vm.features.day_strip_style === "cajas"} inicial />
          : null}

        {conVistas && vista === "mes" ? (
          <Card className="calendar">
            <div className="calendar__head">
              <p className="calendar__month">{vm.agenda.mes.month}</p>
            </div>
            <div className="calendar__grid">
              {vm.agenda.mes.dow.map((d, i) => <span className="calendar__dow" key={d + i}>{d}</span>)}
              {vm.agenda.mes.cells.map((cell) => (
                <button
                  key={cell.fecha}
                  className={["calendar__cell", cell.outside ? "is-vacia" : "", cell.pasado ? "is-pasado" : "", cell.today ? "is-today" : "", cell.selected ? "is-selected" : ""].filter(Boolean).join(" ")}
                  onClick={cell.outside ? undefined : () => actions.selectDay(cell.label)}
                >
                  {/* Las celdas de los meses vecinos van VACÍAS, no con su
                      número en gris: un «4» apagado al lado del 4 de este mes
                      es justo la confusión que ya costó un fallo aquí. */}
                  {cell.outside ? "" : cell.label}
                  {cell.marked && !cell.outside ? <i className="calendar__mark"></i> : null}
                </button>
              ))}
            </div>
            {/* Sin leyenda de «Completada»: esa mitad no se puede pintar
                todavía (ver el estado vacío de la lista). Prometerla en la
                leyenda y no marcarla nunca sería peor que no ofrecerla. */}
            <p className="calendar__leyenda">
              <i className="calendar__mark calendar__mark--suelto"></i> Tienes clase
            </p>
          </Card>
        ) : null}

        <div className="scroller no-scrollbar">
          {conVistas ? (
            filas.length ? (
              <>
                {vista === "lista" ? <SectionTitle>Próximas</SectionTitle> : null}
                {filas.map((row) => <FilaAgenda key={row.id} row={row} conFecha={vista === "lista"} />)}
              </>
            ) : vista === "lista" ? (
              <EmptyState
                title="Aún no has reservado"
                text="Elige una clase del horario y aparecerá aquí."
                cta="Ver horario"
                onAction={actions.goSchedule}
              />
            ) : (
              <EmptyState
                title="Nada este día"
                text="Elige otro día o busca una clase en el horario."
                cta="Ver horario"
                onAction={actions.goSchedule}
              />
            )
          ) : filas.length ? (
            filas.map((row) => (
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
          ) : vista === "lista" ? (
            <EmptyState
              title="Aún no has reservado"
              text="Elige una clase del horario y aparecerá aquí."
              cta="Ver horario"
              onAction={actions.goSchedule}
            />
          ) : (
            <EmptyState
              title="Nada este día"
              text="Elige otro día o busca una clase en el horario."
              cta="Ver horario"
              onAction={actions.goSchedule}
            />
          )}
        </div>

        {/* «Completadas». Solo en la lista, y solo cuando el historial ha
            llegado: `null` significa «no se ha podido pedir» (previsualización
            sin sesión, o el servidor falló) y ahí la sección no aparece, en vez
            de anunciar un vacío que no es verdad. `[]` sí se dice: es «todavía
            no has asistido a ninguna». */}
        {conVistas && vista === "lista" && vm.agenda.completadas ? (
          <section style={{ marginTop: 26 }}>
            <SectionTitle>Completadas</SectionTitle>
            {vm.agenda.completadas.length ? (
              vm.agenda.completadas.map((c) => (
                <article className="card completada" key={c.id}>
                  <span className="completada__check" aria-hidden="true">
                    <Icon name="check" size={15} stroke={2} />
                  </span>
                  <span className="completada__body">
                    <span className="completada__name">{c.nombre}</span>
                    <span className="completada__meta">
                      {[c.cuando, c.instructora].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                </article>
              ))
            ) : (
              <p className="hoja__texto" style={{ marginTop: 0 }}>
                Aquí aparecerán las clases a las que ya hayas asistido.
              </p>
            )}
          </section>
        ) : null}
      </div>
    </>
  );
}
