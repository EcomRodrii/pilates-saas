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
  week, tight,
}: { week: { label: string; num: number; active: boolean; hasClass: boolean }[]; tight?: boolean }) {
  const actions = useActions();
  return (
    <div className={("week " + (tight ? "week--tight" : "")).trim()}>
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
  meta: string; booked: boolean; status: string; statusTone: "booked" | "free" | "full";
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
