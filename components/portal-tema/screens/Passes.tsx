"use client";

import { Icon } from "@/components/portal-tema/components/ui/Icon";
import { Button, Card, EmptyState, SectionTitle } from "@/components/portal-tema/components/ui/primitives";
import { Island, StatusBar } from "@/components/portal-tema/components/layout/chrome";
import { useActions, usePortal } from "@/components/portal-tema/store/PortalStore";
import type { ViewModel } from "@/components/portal-tema/store/useViewModel";

/**
 * Bonos. Dos formas según el tema:
 *
 *   `plan`    — el bono activo arriba y los planes debajo (Oliva/Bloom/Noir).
 *   `cartera` — «Mis bonos» con dos pestañas, Bonos e Historial (Tentada), y
 *               el botón de comprar fijo abajo.
 *
 * ⚠️ La cartera lista TODOS los activos, ilimitados incluidos. `bonoDe` los
 * descarta a propósito para la tarjeta del Inicio (no hay «quedan N» que
 * enseñar), pero el efecto colateral era que una socia con plan mensual no
 * veía ningún bono en ninguna pantalla.
 */
export function Passes({ vm }: { vm: ViewModel }) {
  const actions = useActions();
  const { bonosTab } = usePortal();

  if (vm.features.passes_style === "cartera") {
    const enBonos = bonosTab === "bonos";
    return (
      <>
        <Island />
        <StatusBar />
        <div className="canvas no-scrollbar">
          <h1 className="screen-title">Mis bonos</h1>

          <div className="subtabs" role="tablist">
            <button
              role="tab" aria-selected={enBonos}
              className={"subtab " + (enBonos ? "is-active" : "")}
              onClick={() => actions.setBonosTab("bonos")}
            >Bonos</button>
            <button
              role="tab" aria-selected={!enBonos}
              className={"subtab " + (!enBonos ? "is-active" : "")}
              onClick={() => actions.setBonosTab("historial")}
            >Historial</button>
          </div>

          <div className="scroller no-scrollbar">
            {enBonos ? (
              vm.wallet.length ? (
                vm.wallet.map((b) => (
                  <article className="bono" key={b.id}>
                    <div className="bono__head">
                      <p className="bono__name">{b.name}</p>
                      {b.unlimited ? <span className="bono__badge">Activo</span> : null}
                    </div>
                    <p className="bono__sub">{b.subline}</p>
                    {/* Sin barra en el ilimitado: no hay nada que agotar, y una
                        barra al 100 % ahí no significa nada. */}
                    {b.unlimited ? null : (
                      <span className="bono__track">
                        <span className="bono__fill" style={{ width: b.percent + "%" }}></span>
                      </span>
                    )}
                    {b.footline ? <p className="bono__foot">{b.footline}</p> : null}
                  </article>
                ))
              ) : (
                <EmptyState
                  title="Todavía no tienes bono"
                  text="Compra uno y podrás reservar tus clases desde aquí."
                  cta="Comprar bono"
                  onAction={actions.goBuy}
                />
              )
            ) : vm.purchases.length ? (
              vm.purchases.map((c) => (
                <article className="compra" key={c.id}>
                  <div className="compra__body">
                    <p className="compra__name">{c.concepto}</p>
                    <p className="compra__when">{c.cuando}</p>
                  </div>
                  <p className="compra__importe">{c.importe}</p>
                </article>
              ))
            ) : (
              <EmptyState
                title="Sin compras todavía"
                text="Aquí verás lo que hayas pagado al estudio."
              />
            )}
          </div>

          {/* `loading` no es decoración: bloquea el botón mientras se pide la
              sesión de pago, que es lo que impide que una doble pulsación abra
              dos cobros. */}
          <Button block size="lg" onClick={actions.goBuy}>Comprar bono</Button>
          <div style={{ height: 8 }}></div>
        </div>
      </>
    );
  }

  return (
    <>
      <Island />
      <StatusBar />
      <div className="canvas no-scrollbar">
        <div className="topbar" style={{ padding: "0 0 4px" }}>
          <button className="icon-btn is-pressable" onClick={actions.goProfile} aria-label="Atrás">
            <Icon name="back" stroke={1.9} />
          </button>
          <p className="topbar__title">Bonos</p>
          <span style={{ width: 40 }}></span>
        </div>

        <Card className="pass">
          <p className="pass__name">{vm.pass.name}</p>
          <div className="pass__row">
            <span className="pass__number">{vm.pass.left}</span>
            <span className="pass__note">clases disponibles<br />caduca el {vm.pass.expires}</span>
          </div>
          <div className="pass__bar">
            <span className="pass__fill" style={{ "--pct": vm.pass.percent + "%" } as React.CSSProperties}></span>
          </div>
        </Card>

        <section>
          <SectionTitle>Cambiar de plan</SectionTitle>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {vm.plans.map((plan) => (
              <button
                key={plan.key}
                className={("card plan is-pressable " + (plan.selected ? "is-selected" : "")).trim()}
                onClick={() => actions.selectPlan(plan.key)}
                aria-pressed={plan.selected}
              >
                {plan.badge ? <span className="plan__badge">{plan.badge}</span> : null}
                <span className="plan__name">{plan.name}</span>
                <span className="plan__price">
                  <span className="plan__amount">{plan.price} €</span>
                  <span className="plan__unit">IVA no incluido</span>
                </span>
                <span className="plan__list">
                  {plan.perks.map((perk) => (
                    <span className="plan__item" key={perk}>
                      <Icon name="check" size={15} stroke={2.4} />
                      {perk}
                    </span>
                  ))}
                </span>
              </button>
            ))}
          </div>
        </section>

        {/* `loading` no es decoración: bloquea el botón mientras se pide la
            sesión de pago, que es lo que impide que una doble pulsación abra
            dos cobros. El store lo respalda con su propia guarda. */}
        <Button block size="lg" loading={vm.checkout.paying} onClick={actions.checkout}>
          Continuar al pago
        </Button>
        <div style={{ height: 8 }}></div>
      </div>
    </>
  );
}
