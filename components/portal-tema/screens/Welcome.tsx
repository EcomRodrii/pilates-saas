"use client";

import { Icon } from "@/components/portal-tema/components/ui/Icon";
import { FotoTema, StatusBar } from "@/components/portal-tema/components/layout/chrome";
import { useActions } from "@/components/portal-tema/store/PortalStore";
import type { ViewModel } from "@/components/portal-tema/store/useViewModel";

/**
 * Bienvenida. Es la primera impresión del tema, así que cada uno la resuelve a
 * su manera: el estilo llega en `features` y lo demás es token.
 */
export function Welcome({ vm }: { vm: ViewModel }) {
  const actions = useActions();
  const f = vm.features;

  return (
    <div className="welcome">
      <div className="welcome__media"><FotoTema nombre="portada.svg" /></div>
      <div className="welcome__veil"></div>

      {f.welcome_curves ? (
        <svg className="welcome__curves" viewBox="0 0 392 560" preserveAspectRatio="none" aria-hidden="true">
          <path d="M64 20C24 150 96 250 56 400 36 470 60 520 96 552" fill="none" stroke="rgba(255,255,255,.85)" strokeWidth="5" strokeLinecap="round"></path>
          <path d="M330 8C366 140 296 236 336 386 356 456 334 508 300 544" fill="none" stroke="rgba(255,255,255,.85)" strokeWidth="5" strokeLinecap="round"></path>
        </svg>
      ) : null}

      <StatusBar over />

      {f.welcome_seal ? (
        <div className="welcome__seal-row">
          <span className="welcome__seal"><Icon name="leaf" stroke={1.5} size={20} /></span>
        </div>
      ) : null}

      <div className="welcome__footer">
        <h1 className="welcome__title">
          {vm.welcome.line1}
          <br />
          <span className="welcome__accent">{vm.welcome.line2}</span>
        </h1>
        <p className="welcome__text">{vm.welcome.text}</p>

        <button className="welcome__cta is-pressable" onClick={actions.enter}>
          <span>{vm.welcome.cta}</span>
          <span className={"welcome__cta-arrow " + (f.welcome_cta_circle ? "welcome__cta-arrow--circle" : "")}>→</span>
        </button>

        <div className="welcome__dots">
          <i className="welcome__dot is-active"></i>
          <i className="welcome__dot"></i>
          <i className="welcome__dot"></i>
        </div>
      </div>
    </div>
  );
}
