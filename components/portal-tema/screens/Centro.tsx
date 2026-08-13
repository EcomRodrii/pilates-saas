"use client";

import { Icon } from "@/components/portal-tema/components/ui/Icon";
import { FotoTema, StatusBar } from "@/components/portal-tema/components/layout/chrome";
import { useActions } from "@/components/portal-tema/store/PortalStore";
import type { ViewModel } from "@/components/portal-tema/store/useViewModel";

/**
 * Mi centro. La pantalla que da sentido a la tercera pestaña de la barra de
 * Tentada: dónde está el estudio, cómo se le llama y quién da las clases.
 *
 * ⚠️ Todo lo que pinta sale de columnas reales de `studios` (`direccion`,
 * `telefono`, `email`, `fotoUrl`). Las filas que el prototipo trae y aquí NO
 * están —«Horario del centro» y «Normas del centro»— no se han quitado por
 * falta de tiempo: **no hay campo donde la propietaria las escriba**. Sin
 * fuente, esa fila sería o texto inventado o un enlace a ninguna parte, que es
 * exactamente el fallo que ya costó el bloque de vídeos. Cuando exista dónde
 * escribirlas, entran aquí.
 *
 * Cada dato se calla por su cuenta si falta: un estudio sin teléfono no enseña
 * una fila de teléfono vacía.
 */
export function Centro({ vm }: { vm: ViewModel }) {
  const actions = useActions();
  const c = vm.centro;

  return (
    <>
      <StatusBar />
      <div className="canvas no-scrollbar">
        <header className="centro__head">
          <h1 className="screen-title">Mi centro</h1>
          <button className="icon-btn icon-btn--bell is-pressable" onClick={actions.alerts} aria-label="Avisos">
            <Icon name="bell" stroke={1.8} size={20} />
            {vm.greeting.hasAlert ? <i className="icon-btn__dot"></i> : null}
          </button>
        </header>

        <div className="centro__photo">
          <FotoTema nombre="portada.svg" />
        </div>

        <section>
          <p className="centro__name">{c.nombre}</p>
          <div className="centro__facts">
            {c.direccion ? (
              <p className="centro__fact">
                <Icon name="pin" size={14} stroke={1.6} />
                <span>{c.direccion}{c.postal ? <><br />{c.postal}</> : null}</span>
              </p>
            ) : null}
            {c.telefono ? (
              <a className="centro__fact" href={`tel:${c.telefono.replace(/\s+/g, "")}`}>
                <Icon name="phone" size={14} stroke={1.6} />
                <span>{c.telefono}</span>
              </a>
            ) : null}
            {c.email ? (
              <a className="centro__fact" href={`mailto:${c.email}`}>
                <Icon name="mail" size={14} stroke={1.6} />
                <span>{c.email}</span>
              </a>
            ) : null}
          </div>
        </section>

        {/* Las cuatro filas del diseño. Ya no falta ninguna: el horario sale
            de `studio_horario` y las normas de `studios.normas_texto`. */}
        <div className="centro__rows">
          {[
            { label: "Horario del centro", go: () => actions.goInfo("horario") },
            { label: "Profesores", go: actions.goTeachers },
            { label: "Normas del centro", go: () => actions.goInfo("normas") },
            { label: "Contacto", go: () => actions.goInfo("contacto") },
            { label: "Privacidad", go: () => actions.goInfo("privacidad") },
          ].map((r) => (
            <button key={r.label} className="centro__row is-pressable" onClick={r.go}>
              <span>{r.label}</span>
              <Icon name="forward" size={15} stroke={1.6} />
            </button>
          ))}
        </div>
        <div style={{ height: 8 }}></div>
      </div>
    </>
  );
}
