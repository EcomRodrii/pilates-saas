"use client";

import { Icon } from "@/components/portal-tema/components/ui/Icon";
import { Avatar, EmptyState } from "@/components/portal-tema/components/ui/primitives";
import { StatusBar } from "@/components/portal-tema/components/layout/chrome";
import { useActions } from "@/components/portal-tema/store/PortalStore";
import type { ViewModel } from "@/components/portal-tema/store/useViewModel";

/**
 * Profesores.
 *
 * Quién sale lo decide `queImparten`, la MISMA función que usa
 * `/portal/[slug]/instructores`: con un filtro propio, las dos pantallas
 * acabarían enseñando listas distintas del mismo equipo.
 *
 * La bio es `instructores.bio`, nullable de verdad. Sin ella la ficha no pinta
 * un párrafo vacío ni texto de relleno — que es lo que hace el prototipo, con
 * una biografía inventada por profesora.
 */
export function Teachers({ vm }: { vm: ViewModel }) {
  const actions = useActions();
  return (
    <>
      <StatusBar />
      <div className="canvas no-scrollbar">
        <div className="topbar" style={{ padding: "0 0 4px" }}>
          <button className="icon-btn is-pressable" onClick={actions.back} aria-label="Atrás">
            <Icon name="back" stroke={1.9} />
          </button>
          <p className="topbar__title">Profesores</p>
          <span style={{ width: 40 }}></span>
        </div>

        <div className="scroller no-scrollbar">
          {vm.teachers.length ? (
            vm.teachers.map((t) => (
              <article className="profe" key={t.id}>
                <Avatar>{t.inicial}</Avatar>
                <div className="profe__body">
                  <p className="profe__name">{t.nombre}</p>
                  {t.bio ? <p className="profe__bio">{t.bio}</p> : null}
                </div>
              </article>
            ))
          ) : (
            <EmptyState
              title="Todavía no hay profesoras publicadas"
              text="En cuanto el estudio dé de alta a su equipo, lo verás aquí."
            />
          )}
        </div>
        <div style={{ height: 8 }}></div>
      </div>
    </>
  );
}
