"use client";

import { Icon } from "@/components/portal-tema/components/ui/Icon";
import { StatusBar } from "@/components/portal-tema/components/layout/chrome";
import { useActions } from "@/components/portal-tema/store/PortalStore";
import type { ViewModel } from "@/components/portal-tema/store/useViewModel";

/**
 * Información del centro: horario, normas, contacto o privacidad, según con
 * qué fila se haya entrado desde «Mi centro».
 *
 * Una pantalla y no cuatro porque las cuatro son lo mismo —un título y una
 * lista— y el prototipo las dibuja idénticas. Lo que cambia es de dónde sale
 * el contenido, y las cuatro fuentes son reales:
 *
 *   horario     → `studio_horario` (migr 20260804213940)
 *   normas      → `studios.normas_texto` (migr 20260813004723)
 *   contacto    → dirección, teléfono y email del estudio
 *   privacidad  → el texto legal que la socia acepta al darse de alta
 *
 * Cada sección se calla si su fuente está vacía: un estudio que no ha escrito
 * sus normas no ve un bloque en blanco.
 */
export function Info({ vm }: { vm: ViewModel }) {
  const actions = useActions();
  const info = vm.info;

  return (
    <>
      <StatusBar />
      <div className="canvas no-scrollbar">
        <div className="topbar" style={{ padding: "0 0 4px" }}>
          <button className="icon-btn is-pressable" onClick={actions.back} aria-label="Atrás">
            <Icon name="back" stroke={1.9} />
          </button>
          <p className="topbar__title">{info.titulo}</p>
          <span style={{ width: 40 }}></span>
        </div>

        <div className="scroller no-scrollbar">
          {info.filas.length ? (
            <div className="info-rows">
              {info.filas.map((f) => (
                <div className="info-row" key={f.clave}>
                  <span className="info-row__key">{f.clave}</span>
                  <span className="info-row__val">{f.valor}</span>
                </div>
              ))}
            </div>
          ) : null}

          {info.lista.length ? (
            <ul className="info-list">
              {info.lista.map((l, i) => (
                <li key={i}>
                  <span className="info-list__tick"><Icon name="check" size={11} stroke={2.2} /></span>
                  <span>{l}</span>
                </li>
              ))}
            </ul>
          ) : null}

          {info.parrafos.map((p, i) => (
            <p className="info-para" key={i}>{p}</p>
          ))}

          {/* Ni filas, ni lista, ni párrafos: el estudio no lo ha rellenado.
              Se dice, en vez de dejar la pantalla en blanco. */}
          {!info.filas.length && !info.lista.length && !info.parrafos.length ? (
            <p className="info-para">{info.vacio}</p>
          ) : null}
        </div>
        <div style={{ height: 8 }}></div>
      </div>
    </>
  );
}
