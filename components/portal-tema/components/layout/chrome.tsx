"use client";

import { Icon } from "@/components/portal-tema/components/ui/Icon";
import { Avatar, Status } from "@/components/portal-tema/components/ui/primitives";
import { useActions, useCromoDemo } from "@/components/portal-tema/store/PortalStore";
import { alFallarImagen, IMAGENES_CLASE, IMAGENES_POR_DEFECTO } from "@/lib/imagenes-por-defecto";

/**
 * Una foto del portal.
 *
 * Va con `<img>` crudo y no `next/image` por la misma decisión ya documentada
 * en `public/por-defecto/README.md`: son fondos con `position:absolute` +
 * `object-fit:cover`, donde el optimizador no aporta y sí obliga a medidas
 * fijas. Sigue siendo UN componente para que ese razonamiento —y su disable—
 * vivan en un solo sitio.
 *
 * ⚠️ `src` viene YA resuelto por la capa de datos (`DatosPortal.fotos`,
 * `StudioClass.fotoUrl`). Aquí no se elige ninguna imagen: hasta 2026-08-13
 * este componente montaba rutas a mano contra `/media/*.svg`, un segundo juego
 * de marcadores en paralelo al de `lib/imagenes-por-defecto.ts`, y con él una
 * bienvenida con foto CLARA bajo un velo que cuenta con una oscura.
 *
 * `respaldo` cubre la foto subida que desaparece de Storage: sin él queda el
 * icono de imagen rota en el portal de la socia.
 */
/**
 * A qué se cae una foto que no carga. Son las MISMAS de por defecto: si la que
 * subió la propietaria desaparece de Storage, la socia ve lo que vería si
 * nunca hubiera subido ninguna, no un icono roto.
 */
export const RESPALDO_ESTUDIO = IMAGENES_POR_DEFECTO.portada[0];
export const RESPALDO_VERTICAL = IMAGENES_POR_DEFECTO.vertical[0];
export const RESPALDO_CLASE = IMAGENES_CLASE.generica;

export function FotoTema({ src, alt = "", respaldo }: { src: string; alt?: string; respaldo?: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- ver comentario de arriba
  return <img src={src} alt={alt} onError={respaldo ? alFallarImagen(respaldo) : undefined} />;
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
  // Con las CUATRO etiquetas puestas, la cápsula no cabe en fila: icono y
  // texto pasan a columna, como en la barra pegada. Se deduce de los propios
  // tabs en vez de con otra prop — quien decide es `tab_labels` del tema, y
  // pasarlo dos veces sería otro sitio donde puedan discrepar.
  const conEtiquetas = floating && tabs.every((t) => t.showLabel);
  return (
    <nav
      className={["tab-bar", floating && "tab-bar--floating", conEtiquetas && "tab-bar--etiquetas"]
        .filter(Boolean).join(" ")}
      aria-label="Navegación principal"
    >
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
  /**
   * `true` si el estudio asigna plaza en esa clase. Entonces el atajo de la
   * fila NO reserva: lleva al detalle, que es donde está la rejilla. Reservar
   * desde aquí dejaría a la socia sin máquina y sin haberlo decidido.
   *
   * ⚠️ El rótulo sigue siendo «Reservar», no «Elegir sitio». No es un engaño:
   * es lo que hace la fila del portal de siempre, donde pulsar en la clase
   * abre la hoja de reserva —con su rejilla— y se confirma allí. Cambiar la
   * palabra habría enseñado dos verbos distintos para el mismo gesto según el
   * estudio.
   */
  eligeSitio?: boolean;
  id: string; name: string; time: string; duration: string; initial: string; teacher: string;
  meta: string; room: string; booked: boolean; status: string; statusTone: "booked" | "free" | "full";
  /** «Emma · Sala A · Todos» — la instructora subida a la línea de metadatos. */
  metaLarga: string;
  /** «4 plazas», o vacío cuando el badge ya lo dice todo. */
  plazas: string;
  /** «Disponible» / «Reservada» / «Completa» — el estado sin la cifra. */
  estadoCorto: string;
  /** En la cola de esa clase, no con plaza. Son cosas distintas. */
  waiting: boolean;
  full: boolean;
}

/**
 * La fila del horario de Sereno: hora | separador | cuerpo | chevron.
 *
 * La diferencia con la de siempre no es de color: la instructora sube a la
 * línea de metadatos (con su avatar, la fila se lee de abajo arriba), el badge
 * va acompañado de las plazas que quedan, y el chevron dice que se entra a
 * algún sitio. Va aquí y no en un fichero por tema porque sigue siendo la misma
 * fila con los mismos datos — es composición, no otra pantalla.
 */
function ClassRowSereno({ row }: { row: ClassRowData }) {
  const actions = useActions();
  const cls = ["class-row", "class-row--sereno", "is-pressable", row.booked ? "is-booked" : "", row.statusTone === "full" ? "is-full" : ""]
    .filter(Boolean).join(" ");
  return (
    <button className={cls} onClick={() => actions.openClass(row.id)}>
      <span className="class-row__time">
        <span className="class-row__hour">{row.time}</span>
        <span className="class-row__dur">{row.duration}</span>
      </span>
      <span className="class-row__sep" aria-hidden="true"></span>
      <span className="class-row__body">
        <span className="class-row__name">{row.name}</span>
        <span className="class-row__meta">{row.metaLarga}</span>
        <span className="class-row__foot">
          <Status tone={row.statusTone}>{row.estadoCorto}</Status>
          {row.plazas ? <span className="class-row__plazas">{row.plazas}</span> : null}
        </span>
      </span>
      <Icon name="forward" size={13} stroke={1.8} />
    </button>
  );
}

export function ClassRow({ row, sereno }: { row: ClassRowData; sereno?: boolean }) {
  const actions = useActions();
  if (sereno) return <ClassRowSereno row={row} />;
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
          onClick={(e) => { e.stopPropagation(); if (row.eligeSitio) return actions.openClass(row.id); actions.reserve(row.id); }}
          onKeyDown={(e) => {
            if (e.key !== "Enter" && e.key !== " ") return;
            e.stopPropagation(); e.preventDefault();
            if (row.eligeSitio) return actions.openClass(row.id);
            actions.reserve(row.id);
          }}
        >Reservar</span>
      )}
    </button>
  );
}
