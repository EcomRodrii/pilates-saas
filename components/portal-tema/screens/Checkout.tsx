"use client";

import { useState } from "react";
import { Icon } from "@/components/portal-tema/components/ui/Icon";
import { Button, Card, Checkbox, Field, Input, InputGroup, Notice, SectionTitle, Segmented } from "@/components/portal-tema/components/ui/primitives";
import { StatusBar } from "@/components/portal-tema/components/layout/chrome";
import { useActions } from "@/components/portal-tema/store/PortalStore";
import type { ViewModel } from "@/components/portal-tema/store/useViewModel";

/** Pago. Resumen, datos de tarjeta y estado de procesado. */
export function Checkout({ vm }: { vm: ViewModel }) {
  const actions = useActions();
  const [method, setMethod] = useState("Tarjeta");
  const [card, setCard] = useState({ number: "", exp: "", cvc: "" });
  const [save, setSave] = useState(true);

  return (
    <>
      <StatusBar />
      <div className="canvas no-scrollbar">
        <div className="topbar" style={{ padding: "0 0 4px" }}>
          <button className="icon-btn is-pressable" onClick={() => actions.goto("bonos")} aria-label="Atrás">
            <Icon name="back" stroke={1.9} />
          </button>
          <p className="topbar__title">Pago</p>
          <span style={{ width: 40 }}></span>
        </div>

        <Card className="summary">
          <dl>
            <div className="summary__row"><dt>{vm.checkout.plan}</dt><dd>{vm.checkout.price}</dd></div>
            <div className="summary__row"><dt>IVA (21%)</dt><dd>{vm.checkout.vat}</dd></div>
            <div className="summary__row summary__row--total"><dt>Total</dt><dd>{vm.checkout.total}</dd></div>
          </dl>
        </Card>

        <section>
          <SectionTitle>Método de pago</SectionTitle>
          <div style={{ marginBottom: 14 }}>
            <Segmented items={["Tarjeta", "Bizum", "En el estudio"]} value={method} onChange={setMethod} />
          </div>

          <form className="form-grid" onSubmit={(e) => e.preventDefault()}>
            <Field label="Número de tarjeta" htmlFor="card">
              <InputGroup icon="card">
                <Input
                  id="card" inputMode="numeric" placeholder="4242 4242 4242 4242"
                  value={card.number} onChange={(e) => setCard({ ...card, number: e.target.value })}
                />
              </InputGroup>
            </Field>
            <div className="form-grid form-grid--2">
              <Field label="Caducidad" htmlFor="exp">
                <Input id="exp" placeholder="09/29" value={card.exp} onChange={(e) => setCard({ ...card, exp: e.target.value })} />
              </Field>
              <Field label="CVC" htmlFor="cvc">
                <Input id="cvc" placeholder="123" value={card.cvc} onChange={(e) => setCard({ ...card, cvc: e.target.value })} />
              </Field>
            </div>
            <Checkbox checked={save} onChange={setSave}>Guardar la tarjeta para próximas compras</Checkbox>
          </form>
        </section>

        <Notice>El cobro lo procesa la pasarela del estudio. Tentare no guarda los datos de la tarjeta.</Notice>

        <Button block size="lg" loading={vm.checkout.paying} onClick={actions.pay}>
          <span>{vm.checkout.cta}</span>
        </Button>
        <p className="detail__seats">Puedes cancelar el bono en los primeros 14 días.</p>
        <div style={{ height: 12 }}></div>
      </div>
    </>
  );
}
