"use client";

import { Icon } from "@/components/portal-tema/components/ui/Icon";
import { Button } from "@/components/portal-tema/components/ui/primitives";
import { StatusBar } from "@/components/portal-tema/components/layout/chrome";
import { useActions, useCompra } from "@/components/portal-tema/store/PortalStore";
import type { ViewModel } from "@/components/portal-tema/store/useViewModel";

/**
 * La vuelta de Stripe después de comprar un bono.
 *
 * ⚠️ Esto NO es «¡Bono activado!» pase lo que pase, que es lo que dibuja el
 * prototipo. Stripe redirige aquí en cuanto cobra, pero quien ENTREGA el bono
 * es el webhook (`checkout.session.completed`), que puede tardar unos segundos
 * y puede reintentarse. El propio webhook lo dice en su comentario: el
 * `success_url` solo actualiza la UI de forma optimista.
 *
 * Así que la pantalla mira. Si el bono del plan que se acaba de pagar ya está
 * en su cartera, felicita y lo enseña con las clases que trae. Si todavía no,
 * dice que se está confirmando — que es la verdad— en vez de un «activado» que
 * la dejaría intentando reservar con un bono que aún no existe. Mismo criterio
 * que `Confirmed`, y la misma lección del #500.
 *
 * El pago cancelado también acaba aquí: se sale sin cobrar nada y conviene
 * decirlo, no dejarla con la duda.
 */
export function BonoActivado({ vm }: { vm: ViewModel }) {
  const actions = useActions();
  const compra = useCompra();

  if (!compra) {
    return (
      <>
        <StatusBar />
        <div className="canvas no-scrollbar">
          <div className="outcome">
            <p className="outcome__title">Nada que confirmar</p>
            <p className="outcome__text">Aquí verás el resultado justo después de comprar un bono.</p>
          </div>
          <Button block size="lg" onClick={actions.goPasses}>Ver mis bonos</Button>
        </div>
      </>
    );
  }

  if (compra.estado === "cancelada") {
    return (
      <>
        <StatusBar />
        <div className="canvas no-scrollbar">
          <div className="outcome outcome--lista_espera">
            <span className="outcome__mark animate-pop">
              <Icon name="close" size={42} stroke={1.6} />
            </span>
            <p className="outcome__title">Pago sin terminar</p>
            <p className="outcome__text">Has salido antes de pagar. No se te ha cobrado nada.</p>
          </div>
          <Button block size="lg" onClick={actions.goBuy}>Volver a los bonos</Button>
          <Button block variant="ghost" onClick={actions.goPasses}>Ver mis bonos</Button>
          <div style={{ height: 8 }}></div>
        </div>
      </>
    );
  }

  // El bono del plan que se acaba de pagar. Sin `planId` en la URL —una vuelta
  // antigua, un enlace recortado— no se puede saber cuál es, y entonces no se
  // afirma que esté: se manda a mirarlo.
  const bono = compra.planId ? vm.wallet.find((b) => b.planKey === compra.planId) : undefined;

  if (!bono) {
    return (
      <>
        <StatusBar />
        <div className="canvas no-scrollbar">
          <div className="outcome">
            <span className="outcome__mark animate-pop">
              <Icon name="clock" size={42} stroke={1.6} />
            </span>
            <p className="outcome__title">Estamos confirmando tu pago</p>
            <p className="outcome__text">
              El cobro ha salido bien. Tu bono aparece en cuanto el estudio lo registra,
              normalmente en unos segundos.
            </p>
          </div>
          <Button block size="lg" onClick={actions.goPasses}>Ver mis bonos</Button>
          <div style={{ height: 8 }}></div>
        </div>
      </>
    );
  }

  return (
    <>
      <StatusBar />
      <div className="canvas no-scrollbar">
        <div className="outcome outcome--confirmada">
          <span className="outcome__mark animate-pop">
            <Icon name="check" size={42} stroke={1.6} />
          </span>
          <p className="outcome__title">¡Bono activado!</p>
          <p className="outcome__text">Ya puedes reservar con tu nuevo bono.</p>
        </div>

        <section className="card card--pad outcome__card">
          <p className="outcome__name">{bono.name}</p>
          <p className="outcome__teacher">{bono.subline}</p>
          {bono.footline ? <p className="outcome__teacher">{bono.footline}</p> : null}
        </section>

        <Button block size="lg" onClick={actions.goPasses}>Ver mis bonos</Button>
        <Button block variant="ghost" onClick={actions.goSchedule}>Reservar una clase</Button>
        <div style={{ height: 8 }}></div>
      </div>
    </>
  );
}
