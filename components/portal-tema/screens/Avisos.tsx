"use client";

import { useEffect } from "react";
import { Button, EmptyState } from "@/components/portal-tema/components/ui/primitives";
import { Icon } from "@/components/portal-tema/components/ui/Icon";
import { Island, StatusBar } from "@/components/portal-tema/components/layout/chrome";
import { useActions } from "@/components/portal-tema/store/PortalStore";
import type { ViewModel } from "@/components/portal-tema/store/useViewModel";

/**
 * La bandeja de avisos, dentro del kit.
 *
 * ⚠️ Hasta ahora el kit NO tenía esta pantalla: la campana disparaba un aviso
 * flotante con el texto «Tienes 2 avisos sin leer» — un 2 escrito a mano en el
 * kit de diseño, sin mirar ninguna bandeja. Era el último mock con cifra de
 * toda la app de la alumna.
 *
 * Los datos son los MISMOS que ya servía `/portal/[slug]/notificaciones`:
 * `fetchNotificaciones` / `accionNotificacion` sobre la tabla `notification`,
 * acotados por el JWT de la socia. Cero backend nuevo; lo que cambia es quién
 * lo pinta.
 *
 * ⚠️ Esto NO se lleva por delante `/preferencias`, que es otra pantalla: allí
 * viven el control por canal y la activación de push, y siguen donde estaban.
 * Esta es solo la bandeja.
 */
export function Avisos({ vm }: { vm: ViewModel }) {
  const actions = useActions();
  // Se piden al abrir, como el historial: una bandeja cargada en el arranque
  // sería una petición más para todas las socias que nunca la abren.
  useEffect(() => { actions.cargarAvisos(); }, [actions]);

  const items = vm.avisos.items;

  return (
    <>
      <Island />
      <StatusBar />
      <div className="canvas no-scrollbar">
        <div className="screen-head screen-head--atras">
          <button className="icon-btn icon-btn--redondo is-pressable" onClick={actions.back} aria-label="Atrás">
            <Icon name="back" stroke={1.9} size={17} />
          </button>
          <h1 className="screen-title">Avisos</h1>
        </div>

        <div className="scroller no-scrollbar">
          {/* `null` = todavía no ha llegado. No se pinta «no tienes avisos»
              mientras se está pidiendo: es la diferencia entre una bandeja
              vacía y una que no se ha podido leer. */}
          {items === null ? null : items.length === 0 ? (
            <EmptyState
              title="Sin avisos"
              text="Aquí te contaremos lo que pase con tus clases y tu bono."
            />
          ) : (
            items.map((n) => (
              <article className={"aviso" + (n.leido ? " is-leido" : "")} key={n.id}>
                <div className="aviso__top">
                  <i className="aviso__dot" aria-hidden="true"></i>
                  <span className="aviso__tipo">{n.tipo}</span>
                  <span className="aviso__cuando">{n.cuando}</span>
                </div>
                <p className="aviso__texto">{n.texto}</p>
                {/* Solo si el aviso lleva a algún sitio de verdad
                    (`deepLink`). Un botón que no navega es peor que ninguno. */}
                {n.accion ? (
                  <Button size="sm" style={{ marginTop: 10 }} onClick={() => actions.abrirAviso(n.id)}>
                    {n.accion}
                  </Button>
                ) : null}
              </article>
            ))
          )}
        </div>
      </div>
    </>
  );
}
