"use client";

import { Icon } from "@/components/portal-tema/components/ui/Icon";
import { MEDIA, StatusBar } from "@/components/portal-tema/components/layout/chrome";
import { useActions } from "@/components/portal-tema/store/PortalStore";
import type { ViewModel } from "@/components/portal-tema/store/useViewModel";

/** Sesión guiada. Cronómetro real, pausa y salto de ejercicio. */
export function GuidedSession({ vm }: { vm: ViewModel }) {
  const actions = useActions();
  const s = vm.session;

  return (
    <>
      <div className="session-photo">
        <div className="detail-photo__media"><img src={MEDIA + "ejercicio.svg"} alt="" /></div>
        <div className="session-photo__veil"></div>
        <StatusBar over />
        <div className="session-top">
          <button className="icon-btn icon-btn--glass is-pressable" onClick={actions.exitSession} aria-label="Salir">
            <Icon name="back" stroke={2} size={19} />
          </button>
          <p className="session__title">{s.name}</p>
          <span className="icon-btn icon-btn--glass"><Icon name="music" stroke={1.9} size={18} /></span>
        </div>
      </div>

      <div className="sheet sheet--session animate-rise">
        <p className="session__status">{s.status}</p>
        <p className="session__step">{s.step}</p>
        <p className="timer">{s.clock}</p>
        <div className="timer__bar">
          <span className="timer__fill" style={{ "--pct": s.percent + "%" } as React.CSSProperties}></span>
        </div>
        <div className="controls">
          <button className="control is-pressable" onClick={actions.prevExercise} aria-label="Anterior">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M18 6v12L9 12zM7 6h2v12H7z"></path>
            </svg>
          </button>
          <button
            className="control control--main is-pressable"
            onClick={actions.playPause}
            aria-label={s.running ? "Pausar" : "Reproducir"}
          >
            {s.running ? (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M8 5h3v14H8zM13 5h3v14h-3z"></path>
              </svg>
            ) : (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M8 5l12 7-12 7z"></path>
              </svg>
            )}
          </button>
          <button className="control is-pressable" onClick={actions.nextExercise} aria-label="Siguiente">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M6 6v12l9-6zM15 6h2v12h-2z"></path>
            </svg>
          </button>
        </div>
      </div>
    </>
  );
}
