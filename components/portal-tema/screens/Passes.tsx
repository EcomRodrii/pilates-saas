"use client";

import { Icon } from "@/components/portal-tema/components/ui/Icon";
import { Button, Card, EmptyState, SectionTitle } from "@/components/portal-tema/components/ui/primitives";
import { FotoTema, Island, RESPALDO_ESTUDIO, StatusBar } from "@/components/portal-tema/components/layout/chrome";
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
                    {/* Solo si el plan tiene condiciones que contar — validez,
                        tope semanal, tipos de clase que cubre. Sin ninguna, el
                        botón abriría una hoja vacía. */}
                    {b.terminos.length ? (
                      <button className="bono__detalles is-pressable"
                        onClick={() => actions.abrirHoja({ tipo: "bono", bonoId: b.id })}>
                        Ver detalles
                      </button>
                    ) : null}
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
        {vm.features.pass_style_sereno ? (
          <div className="screen-head screen-head--atras">
            <button className="icon-btn icon-btn--redondo is-pressable" onClick={actions.goProfile} aria-label="Atrás">
              <Icon name="back" stroke={1.9} size={17} />
            </button>
            <h1 className="screen-title">Mis bonos</h1>
          </div>
        ) : (
          <div className="topbar" style={{ padding: "0 0 4px" }}>
            <button className="icon-btn is-pressable" onClick={actions.goProfile} aria-label="Atrás">
              <Icon name="back" stroke={1.9} />
            </button>
            <p className="topbar__title">Bonos</p>
            <span style={{ width: 40 }}></span>
          </div>
        )}

        {/* ⚠️ Los TRES estados, y hasta ahora solo se pintaba el primero: sin
            bono la tarjeta salía con un «0» y un «caduca el » sin fecha, y con
            un plan ILIMITADO salía igual de vacía porque `bonoDe` descarta a
            propósito los que no tienen sesiones que contar. Son dos situaciones
            distintas —«no tienes» y «tienes de los que no se cuentan»— y
            enseñar la misma tarjeta rota para las dos es lo que hacía que una
            socia con mensual creyera que se había quedado sin nada. */}
        {/* La tarjeta de bono de Sereno: foto del estudio enmascarada a la
            derecha, monograma, el saldo en serif grande y la caducidad. Es la
            pieza más propia del tema, y por eso va aquí y no detrás de más
            tokens sobre `.pass` — cambia la composición entera, no el color. */}
        {vm.features.pass_style_sereno && vm.pass.total > 0 ? (
          <>
            <SectionTitle>Bono activo</SectionTitle>
            <div className="bono-sereno">
              <span className="bono-sereno__foto">
                <FotoTema src={vm.fotos.portada} respaldo={RESPALDO_ESTUDIO} />
                {/* Funde el borde inferior de la foto con la tarjeta. Sin él la
                    imagen corta en seco justo encima de la barra de uso y se
                    come el «3 de 10 usados». */}
                <span className="bono-sereno__fundido" aria-hidden="true"></span>
              </span>
              <span className="bono-sereno__cuerpo">
                <span className="bono-sereno__top">
                  <span className="bono-sereno__kicker">Bono activo</span>
                  {vm.monograma ? <span className="bono-sereno__mono">{vm.monograma}</span> : null}
                </span>
                <span className="bono-sereno__saldo">
                  <span className="bono-sereno__num">{vm.pass.left}</span>
                  <span className="bono-sereno__unidad">
                    <span>{vm.pass.left === 1 ? "crédito" : "créditos"}</span>
                    <span>{vm.pass.left === 1 ? "disponible" : "disponibles"}</span>
                  </span>
                </span>
                <span className="bono-sereno__fila">
                  <span className="bono-sereno__micro">{vm.pass.name}</span>
                  <span className="bono-sereno__micro">{vm.pass.total - vm.pass.left} de {vm.pass.total} usados</span>
                </span>
                <span className="bono-sereno__track">
                  <span className="bono-sereno__fill" style={{ "--pct": vm.pass.percent + "%" } as React.CSSProperties}></span>
                </span>
                {/* Sin fecha de fin no se escribe «caduca el» a secas: es un
                    bono SIN caducidad, no un dato que falte. */}
                {vm.pass.expires ? (
                  <span className="bono-sereno__caduca">
                    <span className="bono-sereno__icono"><Icon name="calendar" size={13} stroke={1.3} /></span>
                    <span className="bono-sereno__micro">Caduca el</span>
                    <span className="bono-sereno__fecha">{vm.pass.expires}</span>
                  </span>
                ) : null}
                {vm.theme.pass_valores?.length ? (
                  <span className="bono-sereno__valores">
                    {vm.theme.pass_valores.map((v) => (
                      <span className="bono-sereno__valor" key={v.label}>
                        <Icon name={v.icono} size={16} stroke={1.2} />
                        <span className="bono-sereno__micro">{v.label}</span>
                      </span>
                    ))}
                  </span>
                ) : null}
              </span>
            </div>
          </>
        ) : vm.pass.total > 0 ? (
          <>
            <SectionTitle>Bono activo</SectionTitle>
            <Card className="pass">
              <p className="pass__name">{vm.pass.name}</p>
              <div className="pass__row">
                <span className="pass__number">{vm.pass.left}</span>
                <span className="pass__note">
                  {vm.pass.left === 1 ? "clase disponible" : "clases disponibles"}
                  {/* Sin fecha de fin no se escribe «caduca el » a secas:
                      `fechaLarga` devuelve vacío cuando `fecha_fin` es NULL, y
                      eso es un bono sin caducidad, no un dato que falte. */}
                  {vm.pass.expires ? <><br />caduca el {vm.pass.expires}</> : null}
                </span>
              </div>
              <div className="pass__bar">
                <span className="pass__fill" style={{ "--pct": vm.pass.percent + "%" } as React.CSSProperties}></span>
              </div>
              <p className="pass__uso">{vm.pass.total - vm.pass.left} de {vm.pass.total} usadas</p>
            </Card>
          </>
        ) : vm.wallet.length ? (
          <>
            <SectionTitle>Bono activo</SectionTitle>
            {vm.wallet.map((b) => (
              <Card className="pass" key={b.id}>
                <p className="pass__name">{b.name}</p>
                <p className="pass__note" style={{ marginTop: 8 }}>{b.subline}</p>
                {b.footline ? <p className="pass__uso">{b.footline}</p> : null}
              </Card>
            ))}
          </>
        ) : (
          <EmptyState
            title="Todavía no tienes bono"
            text="Elige uno abajo y podrás reservar tus clases desde aquí."
          />
        )}

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
