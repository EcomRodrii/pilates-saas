"use client";

import { Button } from "@/components/portal-tema/components/ui/primitives";
import { Icon } from "@/components/portal-tema/components/ui/Icon";
import { eventoIcs, nombreIcs, urlGoogleCalendar, type EventoCalendario } from "@/lib/calendario-ics";

// ─────────────────────────────────────────────────────────────────────────────
// §6 — Añadir UNA reserva al calendario de la alumna.
//
// Nada que ver con la integración Google Calendar del ESTUDIO: esa sincroniza la
// agenda del negocio con la cuenta de la propietaria. Que ella la tenga
// conectada no pone ni una clase en el calendario de su alumna. Son dos
// funcionalidades distintas y es el punto donde más se confunden.
//
// Dos salidas porque cubren dos mundos y ninguna cubre el otro:
//   · Google Calendar, por enlace. Es lo que usa la mayoría en Android y en
//     escritorio, y no descarga nada.
//   · `.ics`, que es el que entiende el calendario del PROPIO dispositivo —
//     Apple Calendar en iPhone, Outlook — y funciona sin cuenta de Google.
//
// El fichero y el enlace salen del MISMO `EventoCalendario`
// (lib/calendario-ics.ts), así que no pueden decir cosas distintas.
// ─────────────────────────────────────────────────────────────────────────────

export function AnadirAlCalendario({ evento, size = "sm" }: {
  evento: EventoCalendario;
  size?: "sm" | "md";
}) {
  // La descarga se arma aquí y no en `lib/`: el blob y el <a> son cosa del
  // navegador, y dejar el helper puro es lo que permite probarlo con
  // `node --test`.
  const descargarIcs = () => {
    const url = URL.createObjectURL(
      new Blob([eventoIcs(evento, new Date())], { type: "text/calendar;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = nombreIcs(evento.titulo, evento.inicio);
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {/* Un <a> de verdad y no un <button> con onClick: es una navegación, así
          que debe poder abrirse en pestaña nueva, copiarse el enlace y anunciarse
          como enlace a un lector de pantalla. Las clases son las que compone el
          primitivo `Button` (btn / btn--variant / btn--size), para que no se vea
          distinto del de al lado.
          `rel="noreferrer"` además de `noopener`: sale del portal de una alumna y
          no hay motivo para contarle a Google de qué página concreta viene. */}
      <a
        className={`btn btn--ghost${size !== "md" ? ` btn--${size}` : ""} is-pressable`}
        href={urlGoogleCalendar(evento)}
        target="_blank"
        rel="noopener noreferrer"
      >
        Google Calendar
        <Icon name="calendar" size={15} stroke={1.6} />
      </a>
      <Button variant="ghost" size={size} onClick={descargarIcs}>
        Mi dispositivo
        <Icon name="calendar" size={15} stroke={1.6} />
      </Button>
    </div>
  );
}
