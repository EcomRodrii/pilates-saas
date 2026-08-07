"use client";

import { ICON_PATHS, Icon } from "@/components/portal-tema/components/ui/Icon";
import { Avatar, Button, Divider, Pill } from "@/components/portal-tema/components/ui/primitives";
import { MEDIA, StatusBar } from "@/components/portal-tema/components/layout/chrome";
import { useActions } from "@/components/portal-tema/store/PortalStore";
import type { ViewModel } from "@/components/portal-tema/store/useViewModel";

function FavouriteButton({ fav, glass, size }: { fav: boolean; glass?: boolean; size: number }) {
  const actions = useActions();
  return (
    <button
      className={("icon-btn " + (glass ? "icon-btn--glass" : "")).trim()}
      onClick={actions.toggleFavourite}
      aria-pressed={fav}
      aria-label="Favorita"
    >
      <svg
        className={("icon " + (fav ? "animate-pop" : "")).trim()}
        width={size} height={size} viewBox="0 0 24 24"
        fill={fav ? "currentColor" : "none"}
        stroke="currentColor" strokeWidth={glass ? 1.8 : 1.7} strokeLinecap="round" strokeLinejoin="round"
        style={{ color: fav ? "var(--fav)" : "currentColor" }}
        aria-hidden="true"
      >
        <path d={ICON_PATHS.heart[0]}></path>
      </svg>
    </button>
  );
}

/**
 * Detalle de clase. Dos cabeceras según el tema: `bleed` (foto a sangre con la
 * hoja montada) o `card` (foto contenida y hoja en tarjeta).
 */
export function ClassDetail({ vm }: { vm: ViewModel }) {
  const actions = useActions();
  const bleed = vm.features.detail_style === "bleed";
  const d = vm.detail;

  return (
    <>
      {bleed ? (
        <div className="detail-photo">
          <div className="detail-photo__media"><img src={MEDIA + "clase.svg"} alt="" /></div>
          <div className="detail-photo__veil"></div>
          <StatusBar over />
          <div className="detail-top">
            <button className="icon-btn icon-btn--glass is-pressable" onClick={actions.back} aria-label="Atrás">
              <Icon name="back" stroke={2} size={19} />
            </button>
            <FavouriteButton fav={d.fav} glass size={18} />
          </div>
          <div className="detail-hero">
            <h1 className="detail-hero__title">{d.name}</h1>
            <Pill glass>{d.pill}</Pill>
            <div className="detail-hero__teacher">
              <Avatar size="sm">{d.initial}</Avatar>
              <span className="detail-hero__name">{d.teacher}</span>
            </div>
          </div>
        </div>
      ) : (
        <>
          <StatusBar />
          <div className="topbar">
            <button className="icon-btn is-pressable" onClick={actions.back} aria-label="Atrás">
              <Icon name="back" stroke={1.9} />
            </button>
            <p className="topbar__title">Detalle de clase</p>
            <FavouriteButton fav={d.fav} size={21} />
          </div>
          <div className="detail-photo detail-photo--card">
            <div className="detail-photo__media"><img src={MEDIA + "clase.svg"} alt="" /></div>
          </div>
        </>
      )}

      <div className={"sheet " + (bleed ? "sheet--scroll" : "sheet--card") + " animate-rise no-scrollbar"}>
        {!bleed ? (
          <>
            <p className="detail__title">{d.name}</p>
            <div className="meta-grid">
              {d.meta.map((row) => (
                <div className="meta-row" key={row.label}>
                  <Icon name={row.icon} size={17} />
                  <span className="meta-row__label">{row.label}</span>
                </div>
              ))}
            </div>
            <Divider />
          </>
        ) : null}

        <p className="detail__label">Sobre la clase</p>
        <p className="detail__body">{d.description}</p>

        {bleed ? (
          <div className="facts">
            {d.facts.map((fact) => (
              <div className="fact" key={fact.key}>
                <p className="fact__key">{fact.key}</p>
                <p className="fact__value">{fact.value}</p>
              </div>
            ))}
          </div>
        ) : null}

        <Button block size="lg" variant={d.booked ? "done" : "primary"} loading={d.loading} onClick={actions.reserve}>
          {d.confirmed ? (
            <svg className="icon animate-pop" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d={ICON_PATHS.check[0]}></path>
            </svg>
          ) : null}
          <span>{d.cta}</span>
        </Button>
        <p className="detail__seats">{d.seats}</p>

        {d.confirmed ? (
          <Button variant="ghost" block style={{ marginTop: 12, height: 46 }} onClick={actions.startSession}>
            Empezar la sesión guiada
          </Button>
        ) : null}
      </div>
    </>
  );
}
