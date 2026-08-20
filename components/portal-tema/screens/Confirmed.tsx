"use client";

import { Icon } from "@/components/portal-tema/components/ui/Icon";
import { Button } from "@/components/portal-tema/components/ui/primitives";
import { StatusBar } from "@/components/portal-tema/components/layout/chrome";
import { useActions } from "@/components/portal-tema/store/PortalStore";
import { AnadirAlCalendario } from "@/components/portal-tema/components/ui/anadir-al-calendario";
import type { ViewModel } from "@/components/portal-tema/store/useViewModel";

/**
 * Lo que ha pasado al reservar.
 *
 * ⚠️ NO se llama «Reserva confirmada» pase lo que pase. El prototipo da por
 * hecho que reservar sale bien, pero el servidor devuelve tres finales
 * —`CONFIRMADA`, `LISTA_ESPERA`, `PENDIENTE_APROBACION`— y decirle «¡reserva
 * confirmada!» a quien ha quedado tercera en la cola es exactamente el bug
 * #500: la pantalla anunciando algo que la base de datos no dijo. El diseño es
 * el mismo; el texto y el icono los pone el desenlace.
 *
 * Sin `confirmation` no hay nada que contar (se ha llegado aquí por una URL
 * pegada, o tras recargar), así que lleva de vuelta a sus reservas.
 */
export function Confirmed({ vm }: { vm: ViewModel }) {
  const actions = useActions();
  const c = vm.confirmation;

  if (!c) {
    return (
      <>
        <StatusBar />
        <div className="canvas no-scrollbar">
          <div className="outcome">
            <p className="outcome__title">Nada que confirmar</p>
            <p className="outcome__text">Aquí verás el resultado justo después de reservar.</p>
          </div>
          <Button block size="lg" onClick={actions.goBookings}>Ver mis reservas</Button>
        </div>
      </>
    );
  }

  return (
    <>
      <StatusBar />
      <div className="canvas no-scrollbar">
        <p className="outcome__kicker">{c.kicker}</p>

        <div className={"outcome outcome--" + c.estado.toLowerCase()}>
          <span className="outcome__mark animate-pop">
            <Icon name={c.icon} size={42} stroke={1.6} />
          </span>
          <p className="outcome__title">{c.title}</p>
          <p className="outcome__text">{c.text}</p>
        </div>

        <section className="card card--pad outcome__card">
          <p className="outcome__name">{c.name}</p>
          <p className="outcome__teacher">con {c.teacher}</p>
          <div className="outcome__facts">
            <p className="outcome__fact"><Icon name="calendar" size={14} stroke={1.6} />{c.when}</p>
            <p className="outcome__fact"><Icon name="pin" size={14} stroke={1.6} />{c.room}</p>
            <p className="outcome__fact"><Icon name="clock" size={14} stroke={1.6} />{c.duration}</p>
          </div>
        </section>

        {/* Antes aquí solo había `.ics`. Ahora las dos salidas (Google Calendar
            y el calendario del propio dispositivo), que es lo que cubre a la
            vez a quien vive en Google y a quien va con un iPhone. Ver
            components/portal-tema/components/ui/anadir-al-calendario.tsx. */}
        <div style={{ marginBottom: 8 }}>
          <p style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 8, opacity: 0.72 }}>
            Añádela a tu calendario
          </p>
          <AnadirAlCalendario evento={c.ics} size="md" />
        </div>
        <Button block size="lg" onClick={actions.goBookings}>Ver mis reservas</Button>
        <div style={{ height: 8 }}></div>
      </div>
    </>
  );
}
