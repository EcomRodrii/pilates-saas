"use client";

import { THEME } from "@/theme/config";
import { Icon } from "@/components/portal-tema/components/ui/Icon";
import { Avatar, Button, Card, EmptyState, SectionHead, SectionTitle } from "@/components/portal-tema/components/ui/primitives";
import { DayStrip, MEDIA } from "@/components/portal-tema/components/layout/chrome";
import { useActions } from "@/components/portal-tema/store/PortalStore";
import type { ViewModel } from "@/components/portal-tema/store/useViewModel";
import type { HomeBlockName } from "@/components/portal-tema/tipos-tema";

/** Cabecera del inicio: saludo, avatar y campana con aviso. */
function Greeting({ vm }: { vm: ViewModel }) {
  const actions = useActions();
  return (
    <header className="greeting">
      <Avatar>{vm.greeting.initial}</Avatar>
      <div className="greeting__body">
        <p className="greeting__micro">{vm.greeting.micro}</p>
        <p className="greeting__name">{vm.greeting.name}</p>
      </div>
      <button className="icon-btn icon-btn--bell is-pressable" onClick={actions.alerts} aria-label="Avisos">
        <Icon name="bell" stroke={1.8} size={20} />
        {vm.greeting.hasAlert ? <i className="icon-btn__dot"></i> : null}
      </button>
    </header>
  );
}

/** Titular de bienvenida. Solo lo usan los temas que lo declaran. */
function Headline({ vm }: { vm: ViewModel }) {
  if (!vm.greeting.headline) return null;
  return <p className="headline">{vm.greeting.headline}</p>;
}

/** Próxima clase. Sin reserva no se queda vacío: propone el horario. */
function NextClass({ vm }: { vm: ViewModel }) {
  const actions = useActions();
  return (
    <section>
      <SectionTitle>{vm.nextHeading}</SectionTitle>
      {vm.next ? (
        <button className="hero is-pressable" onClick={() => actions.openClass(vm.next!.id)}>
          <span className="hero__photo"><img src={MEDIA + "clase.svg"} alt="" /></span>
          <span className="hero__veil"></span>
          <span className="hero__body">
            {THEME.features.hero_badge ? (
              <span className="hero__badge"><Icon name="calendar" stroke={1.8} /></span>
            ) : null}
            <span className="hero__title">{vm.next.name}</span>
            <span className="hero__teacher">{vm.next.teacher}</span>
            <span className="hero__meta">{vm.next.meta}</span>
            <span className="hero__cta">
              <span>Ver detalles</span>
              <span className="hero__cta-arrow">→</span>
            </span>
          </span>
        </button>
      ) : (
        <EmptyState
          title="No tienes clases reservadas"
          text="Mira el horario de esta semana y guarda tu sitio."
          cta="Ver horario"
          onAction={actions.goSchedule}
        />
      )}
    </section>
  );
}

/** Progreso semanal (Noir). El anillo sale de las reservas reales. */
function WeeklyProgress({ vm }: { vm: ViewModel }) {
  return (
    <section>
      <SectionTitle>Progreso semanal</SectionTitle>
      <Card className="progress">
        <div className="donut" style={{ "--turn": vm.progress.turn + "turn" } as React.CSSProperties}>
          <div className="donut__hole">
            <p className="donut__value">{vm.progress.percent}%</p>
            <p className="donut__label">Completado</p>
          </div>
        </div>
        <div className="progress__body">
          <p className="progress__title">{vm.progress.summary}</p>
          <p className="progress__note">{vm.progress.note}</p>
          <div className="bars">
            {vm.progress.bars.map((bar, i) => (
              <div className="bar" key={bar.label + i}>
                <span className={"bar__fill bar__fill--" + bar.tone} style={{ height: bar.height }}></span>
                <span className="bar__label">{bar.label}</span>
              </div>
            ))}
          </div>
        </div>
      </Card>
    </section>
  );
}

/** Retos (Bloom). Carrusel con scroll-snap: se arrastra con el dedo. */
function Challenges({ vm }: { vm: ViewModel }) {
  const actions = useActions();
  return (
    <section>
      <SectionHead title="Retos" action="Ver todos" onAction={actions.showFavourites} />
      <div className="rail">
        {vm.challenges.map((item) => (
          <article className={"challenge challenge--" + item.tone} key={item.key}>
            <div className="challenge__head">
              <p className="challenge__title">{item.label}</p>
              <span className="challenge__badge">{item.days}</span>
            </div>
            <div className="challenge__foot">
              <div className="faces">
                <i className="face face--1"></i><i className="face face--2"></i><i className="face face--3"></i>
              </div>
              <span className="challenge__members">{item.members}</span>
            </div>
            <button
              className={("challenge__cta is-pressable " + (item.joined ? "is-joined" : "")).trim()}
              onClick={() => actions.toggleChallenge(item.key)}
            >
              {item.cta}
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}

/** Accesos rápidos. Tarjetas en Oliva y Bloom, círculos en Noir. */
function QuickLinks({ vm }: { vm: ViewModel }) {
  const actions = useActions();
  const bare = THEME.features.quick_links_style === "bare";
  return (
    <section>
      <SectionTitle>{vm.quickLinksHeading}</SectionTitle>
      <div className={("quick-links " + (bare ? "quick-links--bare" : "")).trim()}>
        {vm.quickLinks.map((link) => (
          <button
            key={link.label}
            className="quick-link is-pressable"
            onClick={() => (actions as unknown as Record<string, () => void>)[link.action]()}
          >
            <span className="quick-link__icon"><Icon name={link.icon} /></span>
            <span className="quick-link__label">{link.label}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

/** Resumen de la semana (Oliva): siete días, con punto si hay clase. */
function WeekStrip({ vm }: { vm: ViewModel }) {
  const actions = useActions();
  return (
    <Card className="week-card">
      <SectionHead title="Esta semana" action="Ver agenda" onAction={actions.goSchedule} />
      <DayStrip week={vm.week} />
    </Card>
  );
}

/** Banner del estudio. Bloque de contenido que la propietaria edita. */
function StudioBanner({
  title = "Nueva sala de reformer",
  text = "Seis máquinas nuevas desde el lunes.",
}: { title?: string; text?: string }) {
  const actions = useActions();
  return (
    <section>
      <div className="banner">
        <div className="banner__body">
          <p className="banner__title">{title}</p>
          <p className="banner__text">{text}</p>
        </div>
        <Button variant="quiet" size="sm" onClick={actions.goSchedule}>Ver</Button>
      </div>
    </section>
  );
}

const REGISTRY: Record<HomeBlockName, (p: { vm: ViewModel }) => React.ReactNode> = {
  greeting: Greeting,
  headline: Headline,
  "next-class": NextClass,
  "weekly-progress": WeeklyProgress,
  challenges: Challenges,
  "quick-links": QuickLinks,
  "week-strip": WeekStrip,
  "studio-banner": StudioBanner,
};

/**
 * Pinta los bloques del Inicio en el orden que declara el tema.
 * Cambiar `home_blocks` en config.ts reordena la pantalla sin tocar nada más.
 */
export function HomeBlocks({ vm }: { vm: ViewModel }) {
  return (
    <>
      {THEME.home_blocks.map((name) => {
        const Block = REGISTRY[name];
        return Block ? <Block key={name} vm={vm} /> : null;
      })}
    </>
  );
}
