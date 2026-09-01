'use client';

import { CalendarPlus, Download } from 'lucide-react';
import { sans } from '@/lib/portal-design';
import { eventoIcs, nombreIcs, urlGoogleCalendar, type EventoCalendario } from '@/lib/calendario-ics';

// ─────────────────────────────────────────────────────────────────────────────
// §6 — Añadir UNA reserva al calendario de la alumna, desde el portal.
//
// ⚠️ No confundir con la integración Google Calendar del ESTUDIO
// (`lib/google-calendar.ts`): esa vuelca la agenda del negocio en la cuenta de
// la propietaria. Que ella la tenga conectada no pone ni una clase en el
// calendario de su alumna — son dos funcionalidades distintas, y es justo donde
// más se confunden.
//
// Dos salidas porque ninguna cubre a la otra:
//   · Google Calendar, por enlace: lo que usa la mayoría en Android y en
//     escritorio, y no descarga ningún fichero.
//   · `.ics`, que es lo que entiende el calendario del PROPIO dispositivo
//     (Apple Calendar en iPhone, Outlook) y funciona sin cuenta de Google.
//
// Las dos salen del MISMO `EventoCalendario`, así que no pueden decir cosas
// distintas. Y la parte pura vive en `lib/calendario-ics.ts` (con tests); aquí
// solo queda lo que es de navegador: el blob y la descarga.
// ─────────────────────────────────────────────────────────────────────────────

export function BotonesCalendario({ evento }: { evento: EventoCalendario }) {
  const descargarIcs = () => {
    const url = URL.createObjectURL(
      new Blob([eventoIcs(evento, new Date())], { type: 'text/calendar;charset=utf-8' }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = nombreIcs(evento.titulo, evento.inicio);
    a.click();
    URL.revokeObjectURL(url);
  };

  const estilo = {
    flex: 1, minWidth: 0, height: 40, borderRadius: 20, border: '1px solid #E5E3DA',
    background: 'transparent', color: '#1A1A1A', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
    textDecoration: 'none', fontFamily: sans, fontSize: 11, fontWeight: 600,
  } as const;

  return (
    <div style={{ display: 'flex', gap: 8 }}>
      {/* Un <a> de verdad, no un <button> con onClick: es una navegación, así
          que tiene que poder abrirse en pestaña nueva, copiarse el enlace y
          anunciarse como enlace a un lector de pantalla.
          `noreferrer` además de `noopener`: sale del portal de una alumna y no
          hay motivo para contarle a Google de qué página viene. */}
      <a
        href={urlGoogleCalendar(evento)}
        target="_blank"
        rel="noopener noreferrer"
        style={estilo}
      >
        <CalendarPlus size={14} aria-hidden />
        Google Calendar
      </a>
      <button type="button" onClick={descargarIcs} style={estilo}>
        <Download size={14} aria-hidden />
        Mi calendario
      </button>
    </div>
  );
}
