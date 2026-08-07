"use client";

import { Icon } from "@/components/portal-tema/components/ui/Icon";
import { Button, Card, SectionTitle } from "@/components/portal-tema/components/ui/primitives";
import { Island, StatusBar } from "@/components/portal-tema/components/layout/chrome";
import { useActions } from "@/components/portal-tema/store/PortalStore";
import type { ViewModel } from "@/components/portal-tema/store/useViewModel";

/** Bonos: el activo arriba y los planes debajo, uno seleccionable. */
export function Passes({ vm }: { vm: ViewModel }) {
  const actions = useActions();
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

        <Button block size="lg" onClick={actions.checkout}>Continuar al pago</Button>
        <div style={{ height: 8 }}></div>
      </div>
    </>
  );
}
