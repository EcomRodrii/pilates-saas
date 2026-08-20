"use client";

import { Icon } from "@/components/portal-tema/components/ui/Icon";
import { EmptyState } from "@/components/portal-tema/components/ui/primitives";
import { ClassRow, StatusBar } from "@/components/portal-tema/components/layout/chrome";
import { useActions } from "@/components/portal-tema/store/PortalStore";
import type { ViewModel } from "@/components/portal-tema/store/useViewModel";

/**
 * Favoritas.
 *
 * ⚠️ Esta pantalla NO EXISTÍA. El acceso rápido «Favoritas» llamaba a
 * `showFavourites`, que lanzaba un aviso —«3 clases guardadas»— y se apagaba a
 * los dos segundos. O sea: la socia podía marcar favoritas y no había ningún
 * sitio donde verlas.
 *
 * Lo que se enseña son sus TIPOS de clase marcados y las próximas sesiones de
 * esos tipos, porque el favorito es del tipo («me gusta el Reformer»), no de
 * una sesión concreta. La fila es la MISMA del horario, no una copia.
 */
export function Favoritas({ vm }: { vm: ViewModel }) {
  const actions = useActions();
  const f = vm.favoritas;

  return (
    <>
      <StatusBar />
      <div className="canvas no-scrollbar">
        <div className="topbar" style={{ padding: "0 0 4px" }}>
          <button className="icon-btn is-pressable" onClick={actions.back} aria-label="Atrás">
            <Icon name="back" stroke={1.9} />
          </button>
          <p className="topbar__title">Favoritas</p>
          <span style={{ width: 40 }}></span>
        </div>

        {!f.hayAlguna ? (
          /* ⚠️ El vacío DICE QUÉ HACER y lleva ahí. «No tienes favoritas» a
             secas deja a la socia sin saber ni qué es esto ni cómo se usa. */
          <EmptyState
            title="Marca las clases que más te gustan"
            text="Toca el corazón en una clase y la tendrás siempre a mano, con sus próximos horarios."
            cta="Ver el horario"
            onAction={actions.goSchedule}
          />
        ) : f.sinProximas ? (
          /* Tiene favoritas pero ninguna programada: es OTRA situación, y la
             salida tampoco es la misma. Se le recuerda cuáles son para que no
             parezca que se han borrado. */
          <EmptyState
            title="Ninguna esta semana"
            text={`Sigues con ${f.tipos.map((t) => t.nombre).join(", ")} en favoritas. En cuanto el estudio programe una, aparecerá aquí.`}
            cta="Ver todo el horario"
            onAction={actions.goSchedule}
          />
        ) : (
          <>
            <p className="section-title">Tus próximas</p>
            <div className="scroller no-scrollbar">
              {f.clases.map((row) => <ClassRow key={row.id} row={row} />)}
            </div>
          </>
        )}
      </div>
    </>
  );
}
