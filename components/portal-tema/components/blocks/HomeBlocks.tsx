"use client";

import { BLOQUE_KIT_A_EDITOR, ordenDelInicio } from "@/lib/portal-tema/equivalencias";

/**
 * El id con el que el EDITOR de Apariencia conoce a este bloque, o `undefined`
 * si no tiene sección equivalente allí.
 *
 * ⚠️ Va en la RAÍZ de cada bloque, no en un envoltorio: el puente de la
 * previsualización mide con `getBoundingClientRect` y un `<div>` con
 * `display:contents` no genera caja —saldría 0×0 y el resaltado no se vería—,
 * mientras que un `<div>` normal se convertiría en el hijo de `.canvas` y
 * rompería los márgenes negativos y el `order` con los que los bloques se
 * colocan.
 */
const idEditor = (kit: string) => BLOQUE_KIT_A_EDITOR[kit];
import { Icon } from "@/components/portal-tema/components/ui/Icon";
import { Avatar, Button, Card, EmptyState, SectionHead, SectionTitle } from "@/components/portal-tema/components/ui/primitives";
import { DayStrip, FotoTema , RESPALDO_CLASE, RESPALDO_ESTUDIO } from "@/components/portal-tema/components/layout/chrome";
import { useActions } from "@/components/portal-tema/store/PortalStore";
import type { ViewModel } from "@/components/portal-tema/store/useViewModel";
import type { HomeBlockName } from "@/components/portal-tema/tipos-tema";
import { PORTAL_VIDEOS_CONGELADO } from "@/lib/frozen-features";

/** Cabecera del inicio: saludo, avatar y campana con aviso. */
function Greeting({ vm }: { vm: ViewModel }) {
  const actions = useActions();
  // Sereno no lleva avatar aquí: la fecha va en micro y el saludo debajo, en la
  // serif grande. Es la MISMA cabecera con otra jerarquía, no otro bloque —
  // por eso es un valor de `greeting_style` y no un componente nuevo.
  if (vm.features.greeting_style === "date-first") {
    return (
      <header className="greeting greeting--fecha">
        <div className="greeting__body">
          <p className="greeting__micro">{vm.greeting.today}</p>
          <p className="greeting__name">{vm.greeting.hola}</p>
        </div>
        <button className="icon-btn icon-btn--bell is-pressable" onClick={actions.alerts} aria-label="Avisos">
          <Icon name="bell" stroke={1.8} size={20} />
          {vm.greeting.hasAlert ? <i className="icon-btn__dot"></i> : null}
        </button>
      </header>
    );
  }
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

/**
 * Cabecera con foto a sangre (Tentada): fecha, campana y el saludo en grande
 * sobre la imagen. Sustituye a `greeting` — los temas instalan una o la otra,
 * nunca las dos, o el nombre de la socia sale dos veces seguidas.
 *
 * Sale del lienzo con márgenes negativos en vez de moverse fuera de `.canvas`:
 * el orden de los bloques lo decide `home_blocks` y un bloque que tuviera que
 * ir fuera del contenedor dejaría de ser reordenable.
 */
function HomeHeader({ vm }: { vm: ViewModel }) {
  const actions = useActions();
  return (
    <header className="home-header" data-bloque-id={idEditor("home-header")}>
      <span className="home-header__photo"><FotoTema src={vm.fotos.portada} respaldo={RESPALDO_ESTUDIO} /></span>
      <span className="home-header__veil"></span>
      <div className="home-header__top">
        <p className="home-header__date">{vm.greeting.today}</p>
        <button className="icon-btn icon-btn--glass is-pressable" onClick={actions.alerts} aria-label="Avisos">
          <Icon name="bell" stroke={1.8} size={19} />
          {vm.greeting.hasAlert ? <i className="icon-btn__dot"></i> : null}
        </button>
      </div>
      <div className="home-header__body">
        <p className="home-header__hello">{vm.greeting.hola}</p>
        {vm.greeting.note ? <p className="home-header__note">{vm.greeting.note}</p> : null}
      </div>
    </header>
  );
}

/** Titular de bienvenida. Solo lo usan los temas que lo declaran. */
function Headline({ vm }: { vm: ViewModel }) {
  if (!vm.greeting.headline) return null;
  return <p className="headline">{vm.greeting.headline}</p>;
}

/**
 * La próxima clase como BILLETE (Tentada): dos mitades separadas por una línea
 * de puntos y dos muescas del color del lienzo.
 *
 * No lleva rótulo de sección encima porque el rótulo va DENTRO del billete
 * ("TU PRÓXIMA CLASE"), que es lo que hace que se lea como una entrada.
 */
function NextClassTicket({ vm }: { vm: ViewModel }) {
  const actions = useActions();
  const next = vm.next!;
  return (
    <button data-bloque-id={idEditor("next-class")} className="ticket is-pressable" onClick={() => actions.openClass(next.id)}>
      <span className="ticket__top">
        <span className="ticket__head">
          <span className="ticket__kicker">{vm.nextHeading}</span>
          {next.isToday ? <span className="ticket__badge">HOY</span> : null}
        </span>
        <span className="ticket__line">
          <span className="ticket__name">{next.name}</span>
          <span className="ticket__time">{next.time}</span>
        </span>
        <span className="ticket__meta">
          {next.isToday ? "" : next.day + " · "}con {next.teacher} · {next.room} · {next.duration}
        </span>
      </span>
      <span className="ticket__perf" aria-hidden="true"></span>
      <span className="ticket__foot">
        <span className="ticket__note">{vm.pass.total ? "Se descuenta 1 clase de tu bono" : "Tu plaza está guardada"}</span>
        <span className="ticket__cta">Ver detalles <Icon name="forward" size={12} stroke={1.8} /></span>
      </span>
    </button>
  );
}

/** Próxima clase. Sin reserva no se queda vacío: propone el horario. */
function NextClass({ vm }: { vm: ViewModel }) {
  const actions = useActions();
  if (vm.next && vm.features.next_class_style === "ticket") return <NextClassTicket vm={vm} />;
  return (
    <section data-bloque-id={idEditor("next-class")}>
      <SectionTitle>{vm.nextHeading}</SectionTitle>
      {vm.next ? (
        <button className="hero is-pressable" onClick={() => actions.openClass(vm.next!.id)}>
          <span className="hero__photo"><FotoTema src={vm.next!.foto} respaldo={RESPALDO_CLASE} /></span>
          <span className="hero__veil"></span>
          {/* El chip del CUÁNDO va sobre la foto, no bajo el título. Solo donde
              la foto es una banda con sitio para él (Sereno); en los temas que
              la ponen a la derecha el texto ya vive ahí y se pisarían. */}
          {vm.features.hero_chip ? <span className="hero__chip">{vm.next.chip}</span> : null}
          <span className="hero__body">
            {vm.features.hero_badge ? (
              <span className="hero__badge"><Icon name="calendar" stroke={1.8} /></span>
            ) : null}
            <span className="hero__title">{vm.next.name}</span>
            {/* Con inicial delante, como la captura: la instructora es una
                persona, y una inicial la ancla mejor que otra línea de texto
                gris. Sin ella, la fila de siempre. */}
            {vm.features.hero_chip ? (
              <span className="hero__quien">
                <span className="hero__quien-inicial">{vm.next.teacherInitial}</span>
                <span>{vm.next.quien}</span>
              </span>
            ) : (
              <>
                <span className="hero__teacher">{vm.next.teacher}</span>
                <span className="hero__meta">{vm.next.meta}</span>
              </>
            )}
            <span className="hero__cta">
              <span>{vm.features.hero_chip ? "Ver clase" : "Ver detalles"}</span>
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

/**
 * El horario de HOY (Tentada). Una fila por clase, con la tuya en color de
 * marca y las completas apagadas.
 *
 * ⚠️ Es el día de hoy, no el seleccionado en la tira de la semana: el rótulo
 * dice «Hoy en el estudio» y cambiarlo al pulsar otro día lo dejaría mintiendo.
 * Para el día seleccionado ya está la pantalla de Clases, que es a donde lleva
 * «Ver horario».
 */
function TodayTimeline({ vm }: { vm: ViewModel }) {
  const actions = useActions();
  if (!vm.today.length) return null;
  return (
    <section data-bloque-id={idEditor("today-timeline")}>
      <SectionHead title="Hoy en el estudio" action="Ver horario" onAction={actions.goSchedule} />
      <div className="timeline">
        {vm.today.map((row) => (
          <button
            key={row.id}
            className={"timeline__row timeline__row--" + row.tone + " is-pressable"}
            onClick={() => actions.openClass(row.id)}
          >
            <span className="timeline__time">{row.time}</span>
            <i className="timeline__dot"></i>
            <span className="timeline__body">
              <span className="timeline__name">{row.name}</span>
              <span className="timeline__meta">{row.meta}</span>
            </span>
            <span className="timeline__tag">{row.tag}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

/**
 * El bono, con una semilla por sesión (Tentada).
 *
 * Sin bono no se pinta: proponerle «quedan 0 clases» a quien nunca ha
 * comprado uno no es un estado vacío, es ruido. Y con un bono largo (>12) cae
 * a la barra de progreso — doce puntos ya no se cuentan de un vistazo.
 */
function PassCard({ vm }: { vm: ViewModel }) {
  const actions = useActions();
  if (!vm.pass.total) return null;
  return (
    <button className="pass-card is-pressable" onClick={actions.goPasses}>
      <span className="pass-card__body">
        <span className="pass-card__name">{vm.pass.name}</span>
        <span className="pass-card__left">
          quedan <b>{vm.pass.left}</b> {vm.pass.left === 1 ? "clase" : "clases"}
        </span>
      </span>
      {vm.pass.seedsFit ? (
        <span className="seeds">
          {vm.pass.seeds.map((on, i) => (
            <i key={i} className={"seed " + (on ? "is-on" : "")}></i>
          ))}
        </span>
      ) : (
        <span className="pass-card__track">
          <span className="pass-card__fill" style={{ width: vm.pass.percent + "%" }}></span>
        </span>
      )}
      <Icon name="forward" size={13} stroke={1.7} className="pass-card__chevron" />
    </button>
  );
}

/** Las reservas vivas de la socia (Tentada), con el día en grande a la izquierda. */
function BookingsList({ vm }: { vm: ViewModel }) {
  const actions = useActions();
  return (
    <section>
      <SectionHead title="Mis reservas" action="Ver todas" onAction={actions.goBookings} />
      {vm.bookings.length ? (
        <div className="home-bookings">
          {vm.bookings.map((b) => (
            <button key={b.id} className="home-booking is-pressable" onClick={() => actions.openClass(b.id)}>
              <span className="home-booking__day">
                <span className="home-booking__num">{b.dayNum}</span>
                <span className="home-booking__dow">{b.day}</span>
              </span>
              <span className="home-booking__body">
                <span className="home-booking__name">{b.name}</span>
                <span className="home-booking__meta">{b.meta}</span>
              </span>
              <span className="home-booking__time">{b.time}</span>
            </button>
          ))}
        </div>
      ) : (
        <EmptyState
          title="No tienes reservas"
          text="Busca tu próxima clase en el horario."
          cta="Reservar"
          onAction={actions.goSchedule}
        />
      )}
    </section>
  );
}

/**
 * La racha (Tentada): «6 semanas seguidas — tu mejor racha».
 *
 * ⚠️ El prototipo la traía como texto fijo. Aquí sale de `calcularRacha`
 * (`lib/engines/streak-engine.ts`) — la MISMA que alimenta los logros, para
 * que el Inicio no pueda decir 6 semanas y su insignia 5 —, y por eso
 * puede no pintarse: sin dos semanas seguidas asistiendo no hay racha, y una
 * píldora que anuncia una racha que no existe es peor que no tenerla. El
 * «— tu mejor racha» tampoco es decorativo: solo se escribe cuando lo es.
 */
function StreakPill({ vm }: { vm: ViewModel }) {
  const actions = useActions();
  if (!vm.streak) return null;
  return (
    <button className="streak is-pressable" onClick={actions.goProfile}>
      <span className="streak__mark">✦</span>
      <span className="streak__text">
        {vm.streak.semanas} semanas seguidas{vm.streak.esMejor ? " — tu mejor racha" : ""}
      </span>
      <Icon name="forward" size={13} stroke={1.7} className="streak__chevron" />
    </button>
  );
}

/**
 * El acceso a los vídeos para casa (Tentada): la tarjeta arena con el play.
 *
 * ⚠️ No se pinta con VOD congelado, y esto NO es una precaución teórica:
 * `app/portal/[slug]/videos/page.tsx` hace `router.replace(.../home)` mientras
 * `PORTAL_VIDEOS_CONGELADO` sea `true`. Sin esta guardia el bloque es un
 * callejón sin salida — la socia lo toca y rebota al Inicio sin explicación.
 * Se oculta también en la previsualización a propósito: enseñarle a la
 * propietaria un bloque que su portal no va a tener es justo lo que este repo
 * lleva pagando caro.
 */
function VideosCta({ vm }: { vm: ViewModel }) {
  const actions = useActions();
  if (PORTAL_VIDEOS_CONGELADO) return null;
  return (
    <button className="videos-cta is-pressable" onClick={actions.goVideos}>
      <span className="videos-cta__play">
        <svg width="13" height="13" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true"><path d="M4.6 2.8v8.4l6.4-4.2z"></path></svg>
      </span>
      <span className="videos-cta__body">
        <span className="videos-cta__title">{vm.videosCta.title}</span>
        <span className="videos-cta__text">{vm.videosCta.text}</span>
      </span>
      <Icon name="forward" size={13} stroke={1.7} className="videos-cta__chevron" />
    </button>
  );
}

/**
 * El cierre del Inicio (Tentada): la cita del tema, firmada por el estudio.
 *
 * ⚠️ El año NO se inventa. `studios.anio_fundacion` es nullable y no es la
 * fecha de alta en Tentare: sin él la firma va sin año, no con el que le
 * tocara. Es lo mismo que hace el prototipo con «DESDE 2019», salvo que allí
 * el 2019 estaba escrito a mano.
 */
function StudioQuote({ vm }: { vm: ViewModel }) {
  if (!vm.closing) return null;
  return (
    <div className="closing">
      <p className="closing__quote">«{vm.closing.quote}»</p>
      <p className="closing__sign">{vm.closing.sign}</p>
    </div>
  );
}

/** Progreso semanal (Noir). El anillo sale de las reservas reales. */
function WeeklyProgress({ vm }: { vm: ViewModel }) {
  return (
    <section data-bloque-id={idEditor("weekly-progress")}>
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
    <section data-bloque-id={idEditor("challenges")}>
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
  const bare = vm.features.quick_links_style === "bare";
  return (
    <section data-bloque-id={idEditor("quick-links")}>
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

/**
 * Resumen de la semana. Dos formas y los MISMOS siete días: Oliva/Bloom/Noir
 * lo meten en una tarjeta con «Ver agenda»; Tentada lo deja a pelo sobre el
 * lienzo con el mes en cursiva a la derecha.
 */
function WeekStrip({ vm }: { vm: ViewModel }) {
  const actions = useActions();
  if (vm.features.week_strip_style === "bare") {
    return (
      <section data-bloque-id={idEditor("week-strip")} className="week-bare">
        <div className="section-head">
          <p className="section-title">Tu semana</p>
          <p className="week-bare__month">{vm.weekMonth}</p>
        </div>
        <DayStrip week={vm.week} />
      </section>
    );
  }
  return (
    <Card className="week-card">
      <SectionHead title="Esta semana" action="Ver agenda" onAction={actions.goSchedule} />
      <DayStrip week={vm.week} />
    </Card>
  );
}

/**
 * Banner del estudio. Bloque de contenido que la propietaria edita — de ahí
 * que `title`/`text` entren por prop: hoy los rellenan los textos de muestra,
 * y al conectar la capa de datos vendrán de sus bloques guardados. Declara
 * `vm` como el resto del registro aunque no lo use, para que la firma encaje.
 */
function StudioBanner({
  title = "Nueva sala de reformer",
  text = "Seis máquinas nuevas desde el lunes.",
}: { vm: ViewModel; title?: string; text?: string }) {
  const actions = useActions();
  return (
    <section data-bloque-id={idEditor("studio-banner")}>
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

/**
 * «Estás en lista de espera · Reformer fuerza · Mañana 18:00».
 *
 * Se pinta SOLO si de verdad está en alguna cola (`vm.waitlist`), que sale de
 * sus reservas reales en estado `LISTA_ESPERA` — no de una lista aparte. Sin
 * cola no ocupa nada: un banner permanente que casi siempre dice «no estás en
 * ninguna» sería ruido en la primera pantalla.
 *
 * Lleva a la clase, que es donde puede salirse de la cola o ver su puesto.
 */
function WaitlistBanner({ vm }: { vm: ViewModel }) {
  const actions = useActions();
  const primera = vm.waitlist[0];
  if (!primera) return null;
  return (
    <button
      data-bloque-id={idEditor("waitlist-banner")}
      className="espera-banner is-pressable"
      onClick={() => actions.openClass(primera.id)}
    >
      <i className="espera-banner__dot" aria-hidden="true"></i>
      <span className="espera-banner__texto">
        Estás en lista de espera · {primera.name} · {primera.dateLine}
      </span>
      <Icon name="forward" size={12} stroke={1.8} />
    </button>
  );
}

const REGISTRY: Record<HomeBlockName, (p: { vm: ViewModel }) => React.ReactNode> = {
  greeting: Greeting,
  "home-header": HomeHeader,
  headline: Headline,
  "next-class": NextClass,
  "today-timeline": TodayTimeline,
  "pass-card": PassCard,
  "bookings-list": BookingsList,
  "streak-pill": StreakPill,
  "videos-cta": VideosCta,
  "studio-quote": StudioQuote,
  "weekly-progress": WeeklyProgress,
  challenges: Challenges,
  "quick-links": QuickLinks,
  "week-strip": WeekStrip,
  "studio-banner": StudioBanner,
  "waitlist-banner": WaitlistBanner,
};

/**
 * Pinta los bloques del Inicio en el orden que declara el tema.
 * Cambiar `home_blocks` en config.ts reordena la pantalla sin tocar nada más.
 */
export function HomeBlocks({ vm }: { vm: ViewModel }) {
  return (
    <>
      {/* ⚠️ El orden lo manda el ESTUDIO, no el tema — decisión del fundador
          (2026-08-14). El `home_blocks` del tema es el DEFAULT: si la
          propietaria no ha tocado nada, sale tal cual. Ver `ordenDelInicio`. */}
      {ordenDelInicio(vm.theme.home_blocks, vm.bloquesInicio).map((name) => {
        // `ordenDelInicio` devuelve `string`, no `HomeBlockName`: ya filtra
        // por lo que el tema compone, pero el tipo no lo sabe. El `?? null` de
        // abajo es la red de verdad — un nombre desconocido no pinta nada en
        // vez de reventar la pantalla de la socia.
        const Block = (REGISTRY as Record<string, ((p: { vm: ViewModel }) => React.ReactNode) | undefined>)[name];
        return Block ? <Block key={name} vm={vm} /> : null;
      })}
    </>
  );
}
