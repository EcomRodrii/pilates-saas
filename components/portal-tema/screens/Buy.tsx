"use client";

import { Icon } from "@/components/portal-tema/components/ui/Icon";
import { Button, EmptyState } from "@/components/portal-tema/components/ui/primitives";
import { StatusBar } from "@/components/portal-tema/components/layout/chrome";
import { useActions } from "@/components/portal-tema/store/PortalStore";
import type { ViewModel } from "@/components/portal-tema/store/useViewModel";

/**
 * Comprar bono: elegir el plan y confirmar.
 *
 * ⚠️ Aquí NO hay formulario de tarjeta, y no es un recorte del diseño. El
 * prototipo pide número y CVC en su propio DOM y luego enseña «¡Bono
 * activado!»; en este repo el cobro va por Checkout ALOJADO de Stripe
 * (`crearCheckoutPlan`), y el marco ya documenta que la maqueta de tarjeta del
 * kit no se monta nunca en el portal real porque «pedía número y CVC sin
 * cobrar nada». El botón manda a Stripe, que es donde se paga de verdad.
 *
 * Por lo mismo, la fila «Método de pago» del prototipo tampoco está: la tarjeta
 * la elige la socia en Stripe, no aquí.
 */
export function Buy({ vm }: { vm: ViewModel }) {
  const actions = useActions();
  const elegido = vm.plans.find((p) => p.selected);

  return (
    <>
      <StatusBar />
      <div className="canvas no-scrollbar">
        <div className="topbar" style={{ padding: "0 0 4px" }}>
          <button className="icon-btn is-pressable" onClick={actions.back} aria-label="Atrás">
            <Icon name="back" stroke={1.9} />
          </button>
          <p className="topbar__title">Comprar bono</p>
          <span style={{ width: 40 }}></span>
        </div>

        <div className="scroller no-scrollbar">
          {vm.plans.length ? (
            vm.plans.map((plan) => (
              <button
                key={plan.key}
                className={("tarifa is-pressable " + (plan.selected ? "is-selected" : "")).trim()}
                onClick={() => actions.selectPlan(plan.key)}
                aria-pressed={plan.selected}
              >
                {plan.badge ? <span className="tarifa__badge">{plan.badge}</span> : null}
                <span className="tarifa__head">
                  <span className={("tarifa__radio " + (plan.selected ? "is-on" : "")).trim()}></span>
                  <span className="tarifa__name">{plan.name}</span>
                  <span className="tarifa__price">{plan.price} €</span>
                </span>
                {/* Sale de la descripción del plan que escribe la propietaria.
                    El prototipo trae tres viñetas por plan y aquí no hay dónde
                    escribirlas: si no hay ninguna, no se pinta la lista. */}
                {plan.perks.length ? (
                  <span className="tarifa__perks">
                    {plan.perks.map((perk) => (
                      <span className="tarifa__perk" key={perk}>
                        <Icon name="check" size={10} stroke={2.4} />
                        {perk}
                      </span>
                    ))}
                  </span>
                ) : null}
              </button>
            ))
          ) : (
            <EmptyState
              title="El estudio aún no tiene tarifas"
              text="En cuanto las publique podrás comprar tu bono desde aquí."
            />
          )}
        </div>

        {vm.plans.length ? (
          <>
            {/* `loading` bloquea el botón mientras se pide la sesión de pago:
                es lo que impide que una doble pulsación abra DOS cobros. */}
            <Button block size="lg" loading={vm.checkout.paying} onClick={actions.checkout}>
              {elegido ? `Confirmar compra · ${elegido.price} €` : "Elige un bono"}
            </Button>
            <p className="detail__seats">El pago se completa en la pasarela segura del estudio.</p>
          </>
        ) : null}
        <div style={{ height: 8 }}></div>
      </div>
    </>
  );
}
