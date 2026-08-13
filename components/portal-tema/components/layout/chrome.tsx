"use client";

import { Icon } from "@/components/portal-tema/components/ui/Icon";
import { Avatar, Status } from "@/components/portal-tema/components/ui/primitives";
import { useActions, useCromoDemo } from "@/components/portal-tema/store/PortalStore";

/** Ruta de las imágenes del tema. En Next viven en /public/media. */
export const MEDIA = "/media/";

/**
 * Las fotos del tema, en un solo sitio.
 *
 * Hoy son los SVG marcador que entregó diseño y van con `<img>`: `next/image`
 * exige medidas y monta el optimizador para un placeholder decorativo. Cuando
 * entren las fotos reales del estudio hay que reconsiderarlo aquí — y solo
 * aquí, que es la razón de que esto sea un componente y no cinco `<img>`
 * sueltos con cinco disables iguales.
 */
export function FotoTema({ nombre, alt = "" }: { nombre: string; alt?: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- ver comentario de arriba
  return <img src={MEDIA + nombre} alt={alt} />;
}

export function StatusBar({ over }: { over?: boolean }) {
  // Fuera del marco de teléfono no se pinta: es una barra de estado FALSA, con
  // la hora congelada a las 9:41, dibujada encima de la de verdad del móvil.
  if (!useCromoDemo()) return null;
  return (
    <div className={("status-bar " + (over ? "status-bar--over" : "")).trim()}>
      <span>9:41</span>
      <span className="status-bar__signal">▮▮▮</span>
    </div>
  );
}

export function Island() {
  // Igual que la barra de estado: la isla dinámica es del marco de la demo.
  if (!useCromoDemo()) return null;
  return <div className="island"></div>;
}

// `floating` llega por prop y no del tema: este componente no recibe el view
// model, y el view model ya es el único que lee el tema (`vm.tabBarFloating`).
export function TabBar({
  tabs,
  floating,
}: {
  tabs: { key: string; label: string; icon: Parameters<typeof Icon>[0]["name"]; active: boolean; fill: string; stroke: number; showLabel: boolean }[];
  floating: boolean;
}) {
  const actions = useActions();
  return (
    <nav className={("tab-bar " + (floating ? "tab-bar--floating" : "")).trim()} aria-label="Navegación principal">
      {tabs.map((item) => (
        <button
          key={item.key}
          className={("tab " + (item.active ? "is-active" : "")).trim()}
          aria-current={item.active ? "page" : undefined}
          onClick={() => actions.goTab(item.key as "inicio")}
        >
          <Icon name={item.icon} fill={item.fill} stroke={item.stroke} />
          {item.showLabel ? <span className="tab__label">{item.label}</span> : null}
        </button>
      ))}
    </nav>
  );
}

export function DayStrip({
  week, tight, boxed,
}: {
  week: { label: string; num: number; active: boolean; hasClass: boolean }[];
  tight?: boolean;
  /** La tira de la pantalla de Reservas de Tentada: cajas, no círculos. */
  boxed?: boolean;
}) {
  const actions = useActions();
  return (
    <div className={["week", tight ? "week--tight" : "", boxed ? "week--boxed" : ""].filter(Boolean).join(" ")}>
      {week.map((day) => (
        <button
          key={day.num}
          className={("day " + (day.active ? "is-active" : "")).trim()}
          onClick={() => actions.selectDay(day.num)}
        >
          <span className="day__label">{day.label}</span>
          <span className="day__num">{day.num}</span>
          {day.hasClass ? <i className="day__dot"></i> : null}
        </button>
      ))}
    </div>
  );
}

export interface ClassRowData {
  id: string; name: string; time: string; duration: string; initial: string; teacher: string;
  meta: string; room: string; booked: boolean; status: string; statusTone: "booked" | "free" | "full";
  /** En la cola de esa clase, no con plaza. Son cosas distintas. */
  waiting: boolean;
  full: boolean;
}

export function ClassRow({ row }: { row: ClassRowData }) {
  const actions = useActions();
  const cls = ["class-row", "is-pressable", row.booked ? "is-booked" : "", row.statusTone === "full" ? "is-full" : ""]
    .filter(Boolean).join(" ");
  return (
    <button className={cls} onClick={() => actions.openClass(row.id)}>
      <span className="class-row__time">
        <span className="class-row__hour">{row.time}</span>
        <span className="class-row__dur">{row.duration}</span>
      </span>
      <span className="class-row__body">
        <span className="class-row__name">{row.name}</span>
        <span className="class-row__meta">{row.meta}</span>
        <span className="class-row__foot">
          <Avatar size="xs">{row.initial}</Avatar>
          <span className="class-row__teacher">{row.teacher}</span>
          <Status tone={row.statusTone}>{row.status}</Status>
        </span>
      </span>
    </button>
  );
}

/** Marco de teléfono. Solo para la demo: en producción el portal va a pantalla. */
export function PhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="phone">
      <div className="phone__screen">{children}</div>
    </div>
  );
}

/**
 * La fila del horario de Tentada: hora a la izquierda, y a la derecha lo único
 * que puede hacer la socia con esa clase.
 *
 * Cuatro estados y no dos, porque el diseño los pinta distinto y significan
 * cosas distintas: **tuya** (fila de marca con su check), **en la cola** (con
 * su puesto), **completa** (apagada, pero pulsable — desde el detalle se entra
 * en la lista) y **libre** (con su botón de reservar).
 *
 * ⚠️ El botón reserva de verdad: pasa por `reserve(id)`, o sea por
 * `alReservar` y su respuesta del servidor. No hay atajo optimista aquí — es
 * el camino que costó el bug #500.
 */
export function ClassRowPlana({ row }: { row: ClassRowData }) {
  const actions = useActions();
  if (row.booked) {
    return (
      <button className="row-mia is-pressable" onClick={() => actions.openClass(row.id)}>
        <span className="row-mia__time">{row.time}</span>
        <span className="row-mia__body">
          <span className="row-mia__name">{row.name}</span>
          <span className="row-mia__meta">con {row.teacher} · {row.room}</span>
          <span className="row-mia__dur">{row.duration}</span>
        </span>
        <span className="row-mia__check"><Icon name="check" size={14} stroke={2} /></span>
      </button>
    );
  }
  return (
    <button className="row-libre is-pressable" onClick={() => actions.openClass(row.id)}>
      <span className="row-libre__time">{row.time}</span>
      <span className="row-libre__body">
        <span className="row-libre__name">{row.name}</span>
        <span className="row-libre__meta">con {row.teacher} · {row.room}</span>
        <span className="row-libre__dur">{row.duration}</span>
      </span>
      {row.waiting ? (
        <span className="row-libre__cola">{row.status}</span>
      ) : row.full ? (
        <span className="row-libre__lleno">
          <span className="row-libre__pill">Completa</span>
          <span className="row-libre__link">Lista de espera ›</span>
        </span>
      ) : (
        <span
          role="button" tabIndex={0}
          className="row-libre__cta"
          onClick={(e) => { e.stopPropagation(); actions.reserve(row.id); }}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); e.preventDefault(); actions.reserve(row.id); } }}
        >Reservar</span>
      )}
    </button>
  );
}
