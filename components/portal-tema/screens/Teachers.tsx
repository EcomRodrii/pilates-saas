"use client";

import { Icon } from "@/components/portal-tema/components/ui/Icon";
import { Avatar, EmptyState, Valoracion } from "@/components/portal-tema/components/ui/primitives";
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
          <p className="topbar__title">Instructores</p>
          <span style={{ width: 40 }}></span>
        </div>

        <div className="scroller no-scrollbar">
          {vm.teachers.length ? (
            vm.teachers.map((t) => (
              <button
                className="profe is-pressable" key={t.id}
                onClick={() => actions.abrirHoja({ tipo: 'profesor', id: t.id })}
              >
                <Avatar foto={t.foto}>{t.inicial}</Avatar>
                <span className="profe__body">
                  <span className="profe__name">{t.nombre}</span>
                  {/* Solo con muestra suficiente; si no, ni hueco. */}
                  <Valoracion valoracion={t.valoracion} />
                  {/* En la lista, la bio recortada; entera en la hoja. */}
                  {t.bio ? <span className="profe__bio">{t.bio}</span> : null}
                </span>
                <Icon name="forward" size={15} stroke={1.6} />
              </button>
            ))
          ) : (
            <EmptyState
              title="Todavía no hay instructoras publicadas"
              text="En cuanto el estudio dé de alta a su equipo, lo verás aquí."
            />
          )}
        </div>
        <div style={{ height: 8 }}></div>
      </div>
    </>
  );
}
