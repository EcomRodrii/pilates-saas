'use client';

// 02 — INICIO. Implementación del diseño "Tentare App Cliente v2".
//
// La capa de datos es la misma de siempre: mismos hooks de `useStudio`, mismo
// `getHomeCardContext`, mismas notificaciones. Lo que cambia es la composición.
//
// Cómo se ha mapeado cada hueco del diseño a algo que existe de verdad:
//
//  · Tarjeta grande con foto → `getHomeCardContext`. El diseño solo dibuja el
//    caso "tienes clase hoy"; los otros cuatro (bono agotado, racha en riesgo,
//    llevas tiempo sin venir, sin reservas) reutilizan la MISMA tarjeta con otro
//    contenido, para no inventar una forma que el diseño no tiene.
//  · "Esta semana" → las próximas sesiones con hueco. Las tarjetas llevan al
//    detalle de la clase, que es donde se reserva; el diseño no dibuja botón de
//    reservar aquí.
//  · Las cuatro filas → cuatro destinos reales y distintos, ninguno repetido en
//    el menú de abajo.
//  · El banner de "TALLER" no tiene detrás ningún concepto de taller en el
//    producto. Ocupa ese hueco «Invita a una amiga», que es la única pieza
//    promocional real que hay y encaje con la forma (foto + volanta + titular
//    en cursiva + círculo de acción).
//  · El botón "Ver mi acceso" abre hoy la reserva. El pase con QR llega en su
//    propio PR: es funcionalidad, no interfaz.

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { usePortalAuth } from '@/lib/portal-auth';
import { useStudio } from '@/lib/studio-context';
import { ProfileAvatar } from '@/components/ui/profile-avatar';
import { getHomeCardContext } from '@/lib/portal-home-logic';
import { buildPortalNotifications, usePortalNotifUnreadCount } from '@/lib/portal-notifications';
import { useModo } from '@/lib/portal-modo';
import { HojaPase } from '@/components/portal/hoja-pase';
import { pedirPaseDeAcceso } from '@/lib/api-client';
import {
  dur, transicion, display, micro, texto, radio, altura, sombra, cristal, desenfoque,
} from '@/lib/portal-design';
import type { BannerPortal } from '@/lib/types';

// Un banner "de home" está listo para mostrarse si sigue activo y, si tiene
// ventana de fechas, "hoy" cae dentro. El filtro de ubicación/activo ya lo
// hizo la query del servidor (fetchPublicStudioData) — esto solo resuelve la
// fecha, que depende del momento de carga, no de cuándo se rellenó el caché.
function bannerVigente(b: BannerPortal, hoyISO: string): boolean {
  if (b.fechaInicio && hoyISO < b.fechaInicio) return false;
  if (b.fechaFin && hoyISO > b.fechaFin) return false;
  return true;
}

// No basta con validar en el editor: el dato viene de la BD (que un manager
// pudo guardar sin pasar por esa validación, o que cambió por fuera). Un link
// externo que no sea http(s) — `javascript:`, `data:`… — no se enlaza.
function hrefExternoSeguro(valor: string): string | null {
  try {
    const u = new URL(valor);
    return u.protocol === 'http:' || u.protocol === 'https:' ? valor : null;
  } catch {
    return null;
  }
}

/** El glifo del botón de acceso: 3×3 celdas de 4 px, como un código en miniatura. */
function GlifoAcceso({ color }: { color: string }) {
  const on = [1, 1, 0, 1, 0, 1, 0, 1, 1];
  return (
    <span aria-hidden style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 4px)', gridTemplateRows: 'repeat(3, 4px)', gap: 2.5, flex: '0 0 auto' }}>
      {on.map((v, i) => (
        <span key={i} style={{ background: color, opacity: v ? 1 : 0.35 }} />
      ))}
    </span>
  );
}

export default function PortalHome() {
  const { slug } = useParams<{ slug: string }>();
  const { session } = usePortalAuth();
  const {
    socios, suscripciones, planesTarifa, sesiones, reservas, recibos,
    tiposClase, salas, instructores, studio, contenidoPortal, bannersPortal,
  } = useStudio();
  const { t, noche } = useModo();
  const [paseAbierto, setPaseAbierto] = useState(false);

  // El reloj vive en estado y arranca en null: el servidor y el navegador no
  // pueden coincidir en "ahora", y una cuenta atrás pintada en el HTML del
  // servidor es un desajuste de hidratación garantizado. Late cada 30 s, que es
  // lo que necesita el "EN 3 H 12 MIN" y nada más.
  const [ahora, setAhora] = useState<Date | null>(null);
  useEffect(() => {
    // El compilador de React avisa de que esto encadena renders, y tiene razón:
    // es justo lo que hace un reloj. La alternativa (useSyncExternalStore con
    // el tiempo troceado en cubos de 30 s) resuelve el aviso y deja el código
    // bastante peor de leer para el mismo resultado. Se asume, acotado a un
    // tic cada 30 s.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAhora(new Date());
    const id = setInterval(() => setAhora(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);
  const now = ahora ?? new Date();
  const bannersVigentes = useMemo(() => {
    const hoyISO = now.toISOString().slice(0, 10);
    return bannersPortal.filter(b => bannerVigente(b, hoyISO)).sort((a, b) => a.orden - b.orden);
  }, [bannersPortal, now]);

  const raizRef = useRef<HTMLDivElement>(null);
  const topBarRef = useRef<HTMLDivElement>(null);
  const saludoRef = useRef<HTMLDivElement>(null);
  const fotoRef = useRef<HTMLDivElement>(null);

  // Scroll → opacidad de la barra, desvanecido del saludo y paralaje de la foto.
  //
  // Quien hace scroll es el <main> del armazón, no esta pantalla: montar aquí
  // otro contenedor con scroll propio daría dos barras anidadas y dejaría a las
  // 14 pantallas sin migrar sin el hueco del menú. Por eso se busca hacia
  // arriba en vez de crear uno.
  //
  // Se escribe directo sobre el estilo en vez de pasar por estado: son tres
  // propiedades que cambian en cada frame y un `setState` aquí re-renderizaría
  // la pantalla entera 60 veces por segundo. Solo se tocan `opacity` y
  // `transform`, que el compositor resuelve sin repintar nada.
  useEffect(() => {
    const el = raizRef.current?.closest('main');
    if (!el) return;
    let pendiente = false;
    const aplicar = () => {
      pendiente = false;
      const y = el.scrollTop;
      if (topBarRef.current) topBarRef.current.style.opacity = String(Math.min(1, Math.max(0, (y - 20) / 60)));
      if (saludoRef.current) {
        const p = Math.min(1, y / 150);
        saludoRef.current.style.opacity = String(1 - p * 0.85);
        saludoRef.current.style.transform = `translate3d(0,${-p * 12}px,0)`;
      }
      if (fotoRef.current) {
        fotoRef.current.style.transform = `translate3d(0,${Math.max(-30, Math.min(30, y * 0.075))}px,0)`;
      }
    };
    const onScroll = () => {
      if (pendiente) return;
      pendiente = true;
      requestAnimationFrame(aplicar);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  const socio = socios.find(s => s.id === session?.socioId);
  const activeSus = suscripciones.find(s => s.socioId === session?.socioId && s.estado === 'ACTIVA') ?? null;
  const plan = activeSus ? planesTarifa.find(p => p.id === activeSus.planId) : null;

  const misReservas = useMemo(
    () => reservas.filter(r => r.socioId === session?.socioId),
    [reservas, session?.socioId],
  );

  const { rachaSocio } = useStudio();
  const racha = useMemo(
    () => (session ? rachaSocio(session.socioId) : null),
    [session, reservas, sesiones], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const homeCard = useMemo(() => getHomeCardContext({
    now, misReservas, sesiones, tiposClase, salas, instructores, activeSus,
    racha: racha ?? { semanas: 0, enRiesgo: false, diasParaPerder: null, claveSemanaActual: '' },
  }), [now, misReservas, sesiones, tiposClase, salas, instructores, activeSus, racha]);

  const notifItems = useMemo(() => {
    if (!session?.socioId) return [];
    return buildPortalNotifications({ socioId: session.socioId, reservas, recibos, sesiones, tiposClase, instructores });
  }, [session?.socioId, reservas, recibos, sesiones, tiposClase, instructores]);
  const sinLeer = usePortalNotifUnreadCount(session?.socioId, notifItems);

  const totalAsistidas = misReservas.filter(r => r.estado === 'ASISTIDA').length;
  const proximas = misReservas.filter(r => {
    if (r.estado !== 'CONFIRMADA') return false;
    const s = sesiones.find(x => x.id === r.sesionId);
    return !!s && new Date(s.inicio) > now;
  }).length;

  // Las próximas seis sesiones con hueco: el carrusel de "Esta semana".
  const estaSemana = useMemo(() => {
    const libres = (sesionId: string, aforo: number) =>
      aforo - reservas.filter(r => r.sesionId === sesionId && r.estado === 'CONFIRMADA').length;
    return sesiones
      .filter(s => !s.cancelada && new Date(s.inicio) > now)
      .sort((a, b) => new Date(a.inicio).getTime() - new Date(b.inicio).getTime())
      .slice(0, 6)
      .map(s => ({ s, libres: libres(s.id, s.aforoMaximo) }));
  }, [sesiones, reservas, now]);

  const nombre = socio?.nombre ?? session?.nombre?.split(' ')[0] ?? '';
  const hora = (iso: string) => new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  const diaCorto = (iso: string) =>
    new Date(iso).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric' }).replace('.', '').toUpperCase();

  const fechaHoy = ahora
    ? new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }).format(ahora).toUpperCase()
    : '';

  // ── La tarjeta grande ──────────────────────────────────────────────────────
  //
  // Un solo componente para los cinco estados. El diseño solo dibuja el
  // primero; los demás cambian volanta, titular y destino, nunca la forma.
  const tarjeta = (() => {
    switch (homeCard.caso) {
      case 'PROXIMA_CLASE': {
        const inicio = new Date(homeCard.sesion.inicio);
        const mins = Math.max(0, Math.round((inicio.getTime() - now.getTime()) / 60000));
        const h = Math.floor(mins / 60);
        const esHoy = inicio.toDateString() === now.toDateString();
        return {
          volanta: 'Tu próxima clase',
          contador: ahora ? (h > 0 ? `EN ${h} H ${mins % 60} MIN` : `EN ${mins} MIN`) : null,
          titulo: homeCard.tipo?.nombre ?? 'Clase',
          meta: [
            `${esHoy ? 'Hoy' : diaCorto(homeCard.sesion.inicio)} · ${hora(homeCard.sesion.inicio)}`,
            homeCard.instructor?.nombre,
            homeCard.sala?.nombre,
          ].filter(Boolean) as string[],
          cta: 'Ver mi acceso',
          href: `/portal/${slug}/reservas`,
          abrePase: true,
        };
      }
      case 'ULTIMA_SESION':
        return {
          volanta: 'Tu bono se acaba', contador: null,
          titulo: 'Te queda una sesión',
          meta: [plan?.nombre, 'Renuévalo y sigues igual'].filter(Boolean) as string[],
          cta: 'Renovar mi bono', href: `/portal/${slug}/compras`,
        };
      case 'RACHA_EN_RIESGO':
        return {
          volanta: `Racha de ${homeCard.semanas} semanas`, contador: null,
          titulo: 'No la pierdas ahora',
          meta: [`Te quedan ${homeCard.diasParaPerder} ${homeCard.diasParaPerder === 1 ? 'día' : 'días'}`, 'Reserva esta semana'],
          cta: 'Buscar mi clase', href: `/portal/${slug}/clases`,
        };
      case 'INACTIVA':
        return {
          volanta: `${homeCard.diasSinVenir} días sin venir`, contador: null,
          titulo: 'Tu sitio te espera',
          meta: ['Hay clases con hueco esta semana'],
          cta: 'Volver a reservar', href: `/portal/${slug}/clases`,
        };
      default:
        return {
          volanta: 'Sin clases reservadas', contador: null,
          titulo: 'Empieza por aquí',
          meta: ['Elige el día que mejor te venga'],
          cta: 'Ver la agenda', href: `/portal/${slug}/clases`,
        };
    }
  })();

  const filas = [
    { etiqueta: 'Mis reservas', valor: proximas > 0 ? `${proximas} próxima${proximas !== 1 ? 's' : ''}` : 'Ninguna', href: `/portal/${slug}/reservas` },
    { etiqueta: 'Mi progreso', valor: `${totalAsistidas} clase${totalAsistidas !== 1 ? 's' : ''}`, href: `/portal/${slug}/progreso` },
    { etiqueta: 'Notificaciones', valor: sinLeer > 0 ? `${sinLeer} nueva${sinLeer !== 1 ? 's' : ''}` : 'Al día', href: `/portal/${slug}/notificaciones`, punto: sinLeer > 0 },
    { etiqueta: 'El equipo', valor: `${instructores.length} instructora${instructores.length !== 1 ? 's' : ''}`, href: `/portal/${slug}/instructores` },
  ];

  const conFoto = !!studio?.fotoUrl;
  const cristalClaro = noche ? 'rgba(28,31,23,.72)' : 'rgba(246,244,239,.72)';
  const bordeCristal = noche ? 'rgba(243,241,233,.10)' : 'rgba(255,255,255,.80)';
  const lineaSuave = noche ? 'rgba(243,241,233,.20)' : 'rgba(34,38,31,.20)';

  return (
    <div ref={raizRef} style={{ minHeight: '100%', background: t.bg, color: t.ink }}>

      {/* Barra que aparece al desplazar. `sticky` con margen negativo del mismo
          alto: se queda pegada arriba sin ocupar sitio, así el contenido pasa
          por debajo en vez de empezar 92 px más abajo. */}
      <div
        ref={topBarRef}
        aria-hidden
        style={{
          position: 'sticky', top: 0, height: altura.topbar, marginBottom: -altura.topbar, zIndex: 12,
          opacity: 0, pointerEvents: 'none',
          background: noche ? 'rgba(18,20,14,.78)' : 'rgba(246,244,239,.78)',
          ...cristal(desenfoque.topbar, 150),
          borderBottom: `1px solid ${noche ? 'rgba(243,241,233,.07)' : 'rgba(34,38,31,.07)'}`,
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center', paddingBottom: 14,
          transition: 'opacity 500ms ease',
        }}
      >
        <span style={{ ...display(19), color: t.ink }}>{studio?.nombre ?? 'Tentare'}</span>
      </div>

      {/* 62 px arriba como el diseño. Abajo solo 32: el hueco que deja libre el
          menú flotante lo pone el armazón, que es quien sabe cuánto mide. */}
      <div style={{ padding: '62px 24px 32px' }}>
        {/* Saludo */}
        <div ref={saludoRef} style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14, willChange: 'transform, opacity' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ ...micro(9.5, 0.28), color: t.micro }}>{fechaHoy || ' '}</div>
            <h1 style={{ ...display(50), color: t.ink, marginTop: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              Hola, {nombre}.
            </h1>
            <p style={{ ...display(19, true), color: t.muted, marginTop: 10 }}>
              {homeCard.caso === 'PROXIMA_CLASE' ? 'Hoy tienes una cita contigo.' : 'Tu sitio sigue aquí.'}
            </p>
          </div>
          <Link
            href={`/portal/${slug}/notificaciones`}
            aria-label={sinLeer > 0 ? `Notificaciones, ${sinLeer} sin leer` : 'Notificaciones'}
            style={{
              position: 'relative', width: 40, height: 40, flex: '0 0 40px', marginTop: 22,
              borderRadius: '50%', border: `1px solid ${noche ? 'rgba(243,241,233,.14)' : 'rgba(34,38,31,.14)'}`,
              background: t.surface, display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: sombra.circulo, textDecoration: 'none',
              transition: transicion(['transform']),
            }}
          >
            <span style={{ ...display(17), color: t.ink }}>{sinLeer}</span>
            {sinLeer > 0 && (
              <span style={{ position: 'absolute', top: 2, right: 2, width: 6, height: 6, borderRadius: '50%', background: 'var(--portal-brand)' }} />
            )}
          </Link>
        </div>

        <div style={{ height: 32 }} />

        {/* Tarjeta grande.
            Con foto del estudio, es exactamente el diseño: 476 px de imagen con
            la tarjeta de cristal flotando abajo. SIN foto —el caso de casi
            todos los estudios el primer día— esos 476 px eran un vacío de color
            crema con una tarjeta pegada al fondo. Así que sin foto la tarjeta
            se queda a su altura natural: la misma pieza, sin el hueco. */}
        <div
          // Ancla estable para las pruebas de geometría: la tarjeta no tiene rol
          // ni texto propio con el que localizarla (el titular cambia según el
          // caso), y colgar el test de su estructura lo rompe al primer div.
          data-tarjeta="principal"
          style={{
            position: 'relative',
            height: conFoto ? altura.heroCard : undefined,
            padding: conFoto ? 0 : 14,
            borderRadius: radio.heroCard, overflow: 'hidden',
            background: conFoto ? t.surface2 : t.hero,
            boxShadow: sombra.heroCard,
          }}
        >
          {conFoto && (
            <div ref={fotoRef} style={{ position: 'absolute', left: 0, right: 0, top: -34, bottom: -34, willChange: 'transform' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={studio!.fotoUrl!} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            </div>
          )}

          <div style={{
            position: conFoto ? 'absolute' : 'relative',
            top: conFoto ? 18 : undefined, left: conFoto ? 18 : undefined, right: conFoto ? 18 : undefined,
            display: 'flex', justifyContent: 'space-between', gap: 10, pointerEvents: 'none',
            padding: conFoto ? 0 : '4px 6px 14px',
          }}>
            <span style={{
              padding: '10px 16px', borderRadius: radio.pill, background: noche ? 'rgba(28,31,23,.62)' : 'rgba(255,255,255,.62)',
              ...cristal(desenfoque.chip), border: `1px solid ${bordeCristal}`,
              ...micro(8.5, 0.26, 600), color: t.ink, whiteSpace: 'nowrap',
            }}>{tarjeta.volanta}</span>
            {tarjeta.contador && (
              <span style={{
                padding: '10px 16px', borderRadius: radio.pill,
                background: noche ? 'rgba(243,241,233,.72)' : 'rgba(34,38,31,.72)',
                ...cristal(desenfoque.chip, 100),
                ...micro(8.5, 0.22, 600), color: noche ? '#12140E' : '#F6F4EF', whiteSpace: 'nowrap',
              }}>{tarjeta.contador}</span>
            )}
          </div>

          <div style={{
            position: conFoto ? 'absolute' : 'relative',
            left: conFoto ? 14 : undefined, right: conFoto ? 14 : undefined, bottom: conFoto ? 14 : undefined,
            borderRadius: radio.card,
            background: cristalClaro, ...cristal(desenfoque.cardHero, 170),
            border: `1px solid ${bordeCristal}`, boxShadow: sombra.cardInterna, padding: '22px 20px 20px',
          }}>
            <Link href={tarjeta.href} style={{ textDecoration: 'none', display: 'block' }}>
              <div style={{ ...display(36, true), color: t.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {tarjeta.titulo}
              </div>
            </Link>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 14, flexWrap: 'wrap' }}>
              {tarjeta.meta.map((m, i) => (
                <span key={m} style={{ display: 'contents' }}>
                  {i > 0 && <span style={{ width: 1, height: 11, background: lineaSuave }} />}
                  <span style={{ ...(i === 0 ? texto.metaFuerte : texto.meta), color: i === 0 ? t.ink : t.muted }}>{m}</span>
                </span>
              ))}
            </div>
            {(() => {
              const estilo: React.CSSProperties = {
                width: '100%', height: altura.botonCta, borderRadius: radio.botonCta, background: 'var(--portal-brand)',
                display: 'flex', alignItems: 'center', padding: '0 24px', marginTop: 18, border: 'none',
                textDecoration: 'none', cursor: 'pointer',
                boxShadow: sombra.cta, transition: transicion(['transform', 'background']),
              };
              const dentro = (
                <>
                  <GlifoAcceso color="var(--portal-brand-foreground)" />
                  <span style={{ flex: 1, ...texto.botonCta, color: 'var(--portal-brand-foreground)', paddingLeft: 14, textAlign: 'left' }}>{tarjeta.cta}</span>
                  <span aria-hidden style={{ fontSize: 16, color: 'var(--portal-brand-foreground)', opacity: 0.7 }}>→</span>
                </>
              );
              return 'abrePase' in tarjeta && tarjeta.abrePase
                ? <button type="button" onClick={() => setPaseAbierto(true)} style={estilo}>{dentro}</button>
                : <Link href={tarjeta.href} style={estilo}>{dentro}</Link>;
            })()}
          </div>
        </div>

        {/* Esta semana */}
        {estaSemana.length > 0 && (
          <>
            <div style={{ height: 44 }} />
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
              <h2 style={{ ...display(30), color: t.ink }}>Esta semana</h2>
              <Link href={`/portal/${slug}/clases`} style={{ ...micro(9.5, 0.2, 600), color: t.heroAccent, textDecoration: 'none' }}>
                Agenda →
              </Link>
            </div>
            {/* Sin `scroll-snap`. Lo añadí de más y se comía la sangría: con
                `scroll-snap-align: start` en las tarjetas, el navegador ajusta
                el carrusel a la primera nada más montarlo (scrollLeft = 24) y
                la deja pegada al borde de la pantalla. El diseño no lleva
                anclaje, y sin él la sangría de 24 px se respeta. */}
            <div style={{ display: 'flex', gap: 12, overflowX: 'auto', margin: '0 -24px', padding: '22px 24px 8px', scrollbarWidth: 'none' } as React.CSSProperties}>
              {estaSemana.map(({ s, libres }) => {
                const tipo = tiposClase.find(x => x.id === s.tipoClaseId);
                return (
                  <Link
                    key={s.id}
                    href={`/portal/${slug}/clases/${s.id}`}
                    style={{
                      flex: '0 0 158px', height: 178, borderRadius: radio.card, background: t.surface,
                      padding: 20, display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                      boxShadow: sombra.cardSemana, textDecoration: 'none',
                      transition: transicion(['transform', 'box-shadow'], dur.card),
                    }}
                  >
                    <span style={{ ...micro(9, 0.26, 600), color: t.micro }}>{diaCorto(s.inicio)}</span>
                    <span style={{ ...display(25, false, 1.05), color: t.ink, textWrap: 'pretty' } as React.CSSProperties}>
                      {tipo?.nombre ?? 'Clase'}
                    </span>
                    <span style={{ ...texto.nota, color: t.muted }}>
                      {hora(s.inicio)} · {libres > 0 ? `${libres} plaza${libres !== 1 ? 's' : ''}` : 'Completa'}
                    </span>
                  </Link>
                );
              })}
            </div>
          </>
        )}

        <div style={{ height: 40 }} />

        {/* Las cuatro filas */}
        {filas.map((f, i) => (
          <Link
            key={f.href}
            href={f.href}
            style={{
              height: altura.fila, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
              borderTop: `1px solid ${t.line}`,
              borderBottom: i === filas.length - 1 ? `1px solid ${t.line}` : undefined,
              textDecoration: 'none', transition: transicion(['padding-left'], 400),
            }}
          >
            <span style={{ ...display(24), color: t.ink }}>{f.etiqueta}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              {f.punto && <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--portal-brand)' }} />}
              <span style={{ ...texto.valor, color: t.muted2 }}>{f.valor}</span>
              <span aria-hidden style={{ fontSize: 13, color: t.heroAccent }}>→</span>
            </span>
          </Link>
        ))}

        {/* Invita a una amiga */}
        <div style={{ height: 34 }} />
        <Link
          href={`/portal/${slug}/invitar`}
          style={{
            position: 'relative', display: 'block', height: altura.banner, borderRadius: radio.banner,
            overflow: 'hidden', background: t.surface2, boxShadow: sombra.banner, textDecoration: 'none',
            transition: transicion(['transform'], dur.card),
          }}
        >
          {studio?.fotoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={studio.fotoUrl} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <div style={{ position: 'absolute', inset: 0, background: t.hero }} />
          )}
          <div aria-hidden style={{
            position: 'absolute', inset: 0, pointerEvents: 'none',
            background: noche
              ? 'linear-gradient(94deg, rgba(18,20,14,.97) 6%, rgba(18,20,14,.88) 42%, rgba(18,20,14,.35) 72%, rgba(18,20,14,.06) 100%)'
              : 'linear-gradient(94deg, rgba(246,244,239,.97) 6%, rgba(246,244,239,.88) 42%, rgba(246,244,239,.35) 72%, rgba(246,244,239,.06) 100%)',
          }} />
          <div style={{ position: 'absolute', inset: 0, padding: '26px 24px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', pointerEvents: 'none' }}>
            <span style={{ ...micro(8.5, 0.26, 600), color: t.heroAccent }}>Trae a quien quieras</span>
            <div>
              <div style={{ ...display(29, true, 1.12), color: t.ink, maxWidth: 220, textWrap: 'pretty' } as React.CSSProperties}>
                La calma se comparte mejor.
              </div>
              <div style={{ ...texto.nota, color: t.muted, marginTop: 12 }}>Invita a una amiga y ganáis las dos</div>
            </div>
          </div>
          <span aria-hidden style={{
            position: 'absolute', right: 22, bottom: 22, width: 44, height: 44, borderRadius: '50%',
            background: t.surface, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 15, color: t.ink, boxShadow: sombra.circuloBanner,
          }}>→</span>
        </Link>

        {/* Contenido editable del estudio (mensaje destacado + banners). Añadido
            DESPUÉS de "Invita a una amiga" a propósito: no toca ninguna pieza ya
            cerrada del diseño, y no aparece nada aquí para un estudio que no haya
            configurado contenido — misma pantalla de siempre. */}
        {contenidoPortal?.mensajeDestacado && (
          <>
            <div style={{ height: 20 }} />
            <div style={{
              borderRadius: radio.card, padding: '16px 18px',
              background: noche ? t.surface2 : '#EEF0EA',
              border: `1px solid ${noche ? 'rgba(169,187,160,.22)' : 'rgba(44,53,44,.16)'}`,
            }}>
              <p style={{ ...texto.nota, color: t.muted2, lineHeight: 1.5 }}>{contenidoPortal.mensajeDestacado}</p>
            </div>
          </>
        )}
        {bannersVigentes.map(b => {
          const contenido = (
            <>
              {b.imagenUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={b.imagenUrl} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <div style={{ position: 'absolute', inset: 0, background: t.hero }} />
              )}
              <div aria-hidden style={{
                position: 'absolute', inset: 0, pointerEvents: 'none',
                background: noche
                  ? 'linear-gradient(94deg, rgba(18,20,14,.97) 6%, rgba(18,20,14,.88) 42%, rgba(18,20,14,.35) 72%, rgba(18,20,14,.06) 100%)'
                  : 'linear-gradient(94deg, rgba(246,244,239,.97) 6%, rgba(246,244,239,.88) 42%, rgba(246,244,239,.35) 72%, rgba(246,244,239,.06) 100%)',
              }} />
              <div style={{ position: 'absolute', inset: 0, padding: '26px 24px', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', pointerEvents: 'none' }}>
                {b.titulo && <div style={{ ...display(29, true, 1.12), color: t.ink, maxWidth: 220, textWrap: 'pretty' } as React.CSSProperties}>{b.titulo}</div>}
                {b.texto && <div style={{ ...texto.nota, color: t.muted, marginTop: 12 }}>{b.texto}</div>}
              </div>
              <span aria-hidden style={{
                position: 'absolute', right: 22, bottom: 22, width: 44, height: 44, borderRadius: '50%',
                background: t.surface, display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 15, color: t.ink, boxShadow: sombra.circuloBanner,
              }}>→</span>
            </>
          );
          const estiloBanner: React.CSSProperties = {
            position: 'relative', display: 'block', height: altura.banner, borderRadius: radio.banner,
            overflow: 'hidden', background: t.surface2, boxShadow: sombra.banner, textDecoration: 'none',
            transition: transicion(['transform'], dur.card),
          };
          if (b.linkTipo === 'interno' && !b.linkValor.startsWith('/')) return null;
          const hrefExterno = b.linkTipo === 'externo' ? hrefExternoSeguro(b.linkValor) : null;
          if (b.linkTipo === 'externo' && !hrefExterno) return null;
          return (
            <div key={b.id}>
              <div style={{ height: 18 }} />
              {b.linkTipo === 'interno'
                ? <Link href={`/portal/${slug}${b.linkValor}`} style={estiloBanner}>{contenido}</Link>
                : <a href={hrefExterno!} target="_blank" rel="noopener noreferrer" style={estiloBanner}>{contenido}</a>}
            </div>
          );
        })}
      </div>

      <HojaPase
        abierta={paseAbierto}
        onClose={() => setPaseAbierto(false)}
        slug={slug}
        nombreEstudio={studio?.nombre ?? 'tu estudio'}
        tituloClase={tarjeta.titulo}
        subtitulo={tarjeta.meta.join(' · ')}
        pedirPase={pedirPaseDeAcceso}
      />

      {/* El avatar vive en el menú de abajo (pestaña Perfil), como en el diseño.
          Se deja este bloque fuera de la vista para que los lectores de pantalla
          sigan anunciando de quién es la sesión al entrar. */}
      <span className="sr-only">
        <ProfileAvatar avatarId={socio?.avatar} fotoUrl={socio?.fotoUrl} nombre={session?.nombre ?? ''} size="md" />
      </span>
    </div>
  );
}
