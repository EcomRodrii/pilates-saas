'use client';

// 02 — HOY. Implementación LITERAL de "Tentare Studio App" (Claude Design),
// sección HOY (tentare-studio-app.dc.html) — Fase 1 de la sustitución
// completa del sistema de temas Oliva/Bloom/Noir por este único diseño.
//
// A diferencia de la versión anterior de este fichero, NO hay ramas por
// `variantes.*` (cabeceraInicio/tarjetaPrincipal/accesosRapidos/retos): una
// sola estructura, la del diseño, para todo estudio. Lo que el diseño no
// dibuja (cuatro estados de la tarjeta grande que no son "tienes clase hoy";
// el bono/progreso/retos reales; "Tu estudio"/"Huecos de hoy"/"Tablón") sigue
// resuelto con datos reales, con la MISMA forma visual que la única pieza que
// el diseño sí dibuja — nunca una forma inventada.
//
// Extraído de app/portal/[slug]/home/page.tsx: esta es la PRESENTACIÓN pura
// del Inicio, sin depender de usePortalAuth() internamente — recibe
// `session` como prop para poder montarse también desde /portal-preview/[slug]
// (staff, sin sesión de socia real) con una sesión de muestra.
// `homeBloquesOverride`, si se pasa, sustituye a `homeBloques` del tema
// PUBLICADO — lo usa el preview en vivo del constructor de bloques
// (components/theme/home-preview.tsx) para reflejar el BORRADOR que se está
// editando, no lo ya publicado.
//
// La capa de datos del resto (estudio/catálogo) sigue viniendo de
// `useStudio()`: tanto /portal/[slug] como /portal-preview/[slug] montan su
// propio StudioProvider vía StudioSlugGate, así que ambos lo tienen.
//
// Cómo se ha mapeado cada hueco del diseño a algo que existe de verdad:
//
//  · Hero de foto + saludo + buscador → foto del estudio (la suya, o la de
//    por defecto), `saludoPorHora`, `fechaHoy`, `BuscarOverlay` (PR #1452).
//  · "Tu próxima clase" (dark card) → `getHomeCardContext`. El diseño solo
//    dibuja el caso "tienes clase hoy"; los otros cuatro (bono agotado,
//    racha en riesgo, llevas tiempo sin venir, sin reservas) reutilizan la
//    MISMA tarjeta con otro contenido, para no inventar una forma que el
//    diseño no tiene.
//  · "Tu ritmo"/"Tu semana"/"Mi progreso"+"Reto" → datos reales de bono,
//    racha y progreso semanal, sin ningún estado de carga fabricado.
//  · "Tu estudio" → el propio estudio (enlaza a su ficha, PR #1460) + una
//    instructora real que imparte hoy (o la primera que imparte de verdad).
//  · "Huecos de hoy"/"Tablón" → clases de hoy con hueco que cubre su plan, y
//    novedades vigentes del estudio. Ya eran literales al diseño.
//
// Lo que el diseño NO dibuja y este fichero SIGUE resolviendo por ser
// contenido real de cada estudio (no del tema visual): el mensaje destacado
// y los banners configurables desde el editor, y los bloques de catálogo
// (banner/texto/cta/faq) que una propietaria haya añadido — ninguno es
// exclusivo de Oliva/Bloom/Noir, así que no desaparecen con ellos.

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import type { PortalSession } from '@/lib/portal-auth';
import { useStudio } from '@/lib/studio-context';
import { ProfileAvatar } from '@/components/ui/profile-avatar';
import { getHomeCardContext, calcularTiraSemana, calcularProgresoSemanal, META_PROGRESO_SEMANAL, saludoPorHora, huecosHoy } from '@/lib/portal-home-logic';
import { sugerirClase, cuandoSugerencia } from '@/lib/portal-sugerencias';
import { Bell, Search } from 'lucide-react';
import { BuscarOverlay } from '@/components/portal/buscar-overlay';
import { RETOS_PORTAL } from '@/lib/retos-portal';
import { useNotificacionesSinLeer } from '@/lib/notifications/use-unread';
import { useModo } from '@/lib/portal-modo';
import { HojaPase } from '@/components/portal/hoja-pase';
import { AforoIndicator } from '@/components/portal/ui';
import { pedirPaseDeAcceso, portalAuthHeader } from '@/lib/api-client';
import { bonoActivo } from '@/lib/bonos-portal';
import { usePortalHref } from '@/components/portal/portal-preview-bridge';
import {
  EASE, dur, transicion, display, micro, texto, radio, altura, sombra, cristal, desenfoque, escala } from '@/lib/portal-design';
import { bloquesVisibles, type BloqueSistemaId, type BloqueHome } from '@/lib/portal-home-bloques';
import { BloqueHomeRender } from '@/components/portal/bloque-home-render';
import { imagenDeEstudio, alFallarImagen, IMAGENES_POR_DEFECTO } from '@/lib/imagenes-por-defecto';
import { hoyEnEstudio } from '@/lib/utils';
import { queImparten } from '@/lib/equipo';
import { valoracionParaPantalla } from '@/lib/portal-tema/valoracion';

// Valor de `now` mientras el reloj de abajo todavía no ha latido (render del
// servidor y primer render del cliente, antes del efecto). Constante de MÓDULO
// y no `new Date()`: un `new Date()` en el cuerpo del componente es una
// referencia distinta en cada render, así que los cinco useMemo que dependen de
// `now` se recalculaban SIEMPRE — justo lo que la memoización pretendía evitar.
// La fecha concreta da igual: todo lo que consume `now` antes de montar sale de
// datos del estudio (sesiones/reservas/banners), que StudioProvider carga en un
// efecto y por tanto están vacíos en ese momento. El único consumidor que
// pintaría algo real sin datos —el saludo por hora— se resuelve con `ahora` ya
// montado, no con esta constante.
const FECHA_PLACEHOLDER_SSR = new Date('2026-06-29T00:00:00Z');

// Un banner o una novedad del Tablón "de home" están listos para mostrarse si
// siguen activos y, si tienen ventana de fechas, "hoy" cae dentro. El filtro
// de activo/ubicación ya lo hizo la query del servidor (fetchPublicStudioData)
// — esto solo resuelve la fecha, que depende del momento de carga, no de
// cuándo se rellenó el caché.
function dentroDeVentana(x: { fechaInicio: string | null; fechaFin: string | null }, hoyISO: string): boolean {
  if (x.fechaInicio && hoyISO < x.fechaInicio) return false;
  if (x.fechaFin && hoyISO > x.fechaFin) return false;
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

/** Dos dígitos, para el formato UTC de un fichero .ics (siempre en punto). */
function dosDigitos(n: number): string {
  return String(n).padStart(2, '0');
}

/** AAAAMMDDTHHMMSSZ — el formato de fecha que exige el estándar iCalendar. */
function fechaIcs(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCFullYear()}${dosDigitos(d.getUTCMonth() + 1)}${dosDigitos(d.getUTCDate())}T${dosDigitos(d.getUTCHours())}${dosDigitos(d.getUTCMinutes())}${dosDigitos(d.getUTCSeconds())}Z`;
}

/**
 * "+ Calendario" del diseño: un .ics descargable con la clase concreta, sin
 * backend ni librería nueva — un evento con hora de inicio/fin ya cubre lo
 * que promete el botón. `download` es una acción del NAVEGADOR sobre datos
 * que la propia socia pidió, no una descarga que decida este código por
 * su cuenta.
 */
function icsDataUri(titulo: string, inicio: string, fin: string, lugar: string): string {
  const cuerpo = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Tentare//Portal//ES',
    'BEGIN:VEVENT',
    `UID:${inicio}-${titulo.replace(/[^a-zA-Z0-9]/g, '')}@portal`,
    `DTSTAMP:${fechaIcs(new Date().toISOString())}`,
    `DTSTART:${fechaIcs(inicio)}`,
    `DTEND:${fechaIcs(fin)}`,
    `SUMMARY:${titulo}`,
    lugar ? `LOCATION:${lugar}` : '',
    'END:VEVENT', 'END:VCALENDAR',
  ].filter(Boolean).join('\r\n');
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(cuerpo)}`;
}

export function PortalHomeView({ session, homeBloquesOverride, escribible = true }: {
  session: PortalSession | null;
  homeBloquesOverride?: BloqueHome[];
  /**
   * `false` en el preview de temas: misma vista, pero sin servidor real detrás
   * al que preguntar. Mismo criterio que portal-clases-view/reservas-view.
   */
  escribible?: boolean;
}) {
  const { slug } = useParams<{ slug: string }>();
  const portalHref = usePortalHref();
  const {
    socios, suscripciones, planesTarifa, sesiones, reservas,
    tiposClase, salas, instructores, studio, contenidoPortal, bannersPortal, novedadesEstudio,
    homeBloques: homeBloquesPublicado,
    retosApuntados, retoConteos, toggleReto, valoracionEstudio,
  } = useStudio();
  const homeBloques = homeBloquesOverride ?? homeBloquesPublicado;
  const { t, noche } = useModo();
  const [paseAbierto, setPaseAbierto] = useState(false);
  const [buscarAbierto, setBuscarAbierto] = useState(false);

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
  const now = ahora ?? FECHA_PLACEHOLDER_SSR;
  const bannersVigentes = useMemo(() => {
    // Fecha LOCAL, no toISOString() (UTC): con un estudio en España, la hora
    // siguiente a medianoche local todavía cae en el día UTC anterior, y un
    // banner con fecha de inicio/fin de hoy aparecía/desaparecía con 1-2 h de
    // desfase.
    const hoyISO = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    return bannersPortal.filter(b => dentroDeVentana(b, hoyISO)).sort((a, b) => a.orden - b.orden);
  }, [bannersPortal, now]);

  const novedadesVigentes = useMemo(() => {
    const hoyISO = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    return novedadesEstudio.filter(n => dentroDeVentana(n, hoyISO));
  }, [novedadesEstudio, now]);

  // Orden/visibilidad de los dos bloques que SIGUEN siendo del constructor de
  // bloques ("Invita a una amiga" y el contenido editable del estudio) más
  // los bloques de catálogo (banner/texto/cta/faq): mismo mecanismo de
  // siempre, CSS `order` sin mover el DOM. El resto de la pantalla (hero,
  // tarjeta grande, ritmo/semana/progreso, Tu estudio, huecos, tablón) ya no
  // pasa por este sistema — es la estructura FIJA del diseño, no algo que
  // tenga sentido reordenar por estudio.
  const bloquesOrdenados = useMemo(() => bloquesVisibles(homeBloques), [homeBloques]);
  const wrap = (sistemaId: BloqueSistemaId) => {
    const i = bloquesOrdenados.findIndex((b) => b.kind === 'sistema' && b.sistemaId === sistemaId);
    return {
      'data-bloque-sistema': sistemaId,
      'data-bloque-id': i === -1 ? undefined : bloquesOrdenados[i].id,
      style: { order: i === -1 ? 0 : i },
      hidden: i === -1,
    };
  };
  /**
   * La config de un bloque de SISTEMA, ya resuelta. Los textos de "Invita a
   * una amiga" y de la tarjeta grande salen del bloque guardado —
   * `resolverBloques` ya ha rellenado con el texto de siempre lo que el
   * estudio no haya tocado.
   */
  const cfgSistema = (sistemaId: BloqueSistemaId): Record<string, unknown> => {
    const b = bloquesOrdenados.find((x) => x.kind === 'sistema' && x.sistemaId === sistemaId);
    return (b && b.kind === 'sistema' && b.config) || {};
  };
  const txt = (sistemaId: BloqueSistemaId, campo: string, siVacio = ''): string => {
    const v = cfgSistema(sistemaId)[campo];
    // ⚠️ La cadena VACÍA cuenta como "no puesto" y cae al literal de quien
    // llama — sin esto, un campo cuyo `porDefecto` es '' borraba el texto en
    // vez de heredarlo.
    return typeof v === 'string' && v !== '' ? v : siVacio;
  };

  /**
   * El id de un bloque FIJO, para que el editor pueda seleccionarlo desde la
   * vista previa. La tarjeta grande no entra en el contenedor que ordena los
   * demás con CSS `order` — se mantiene siempre arriba — así que no pasa por
   * `wrap()` y necesita su propio enganche.
   */
  const idFijo = (sistemaId: BloqueSistemaId): string | undefined => {
    const b = homeBloques.find((x) => x.kind === 'sistema' && x.sistemaId === sistemaId);
    return b?.id;
  };

  const bloquesPersonalizados = useMemo(
    () => bloquesOrdenados
      .map((b, i) => ({ b, orden: i }))
      .filter((x): x is { b: Exclude<BloqueHome, { kind: 'sistema' }>; orden: number } => x.b.kind !== 'sistema'),
    [bloquesOrdenados],
  );

  const raizRef = useRef<HTMLDivElement>(null);
  const fotoRef = useRef<HTMLDivElement>(null);

  // Paralaje muy sutil de la foto del hero al desplazar — quien hace scroll es
  // el <main> del armazón, no esta pantalla (ver portal-shell.tsx), así que se
  // busca hacia arriba en vez de montar otro contenedor con scroll propio.
  // Se escribe directo sobre el estilo en vez de pasar por estado: es una
  // propiedad que cambia en cada frame y un `setState` aquí re-renderizaría
  // la pantalla entera 60 veces por segundo.
  useEffect(() => {
    const el = raizRef.current?.closest('main');
    if (!el) return;
    let pendiente = false;
    const aplicar = () => {
      pendiente = false;
      const y = el.scrollTop;
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
    racha: racha ?? { semanas: 0, enRiesgo: false, diasParaPerder: null, claveSemanaActual: '', esMejor: false },
  }), [now, misReservas, sesiones, tiposClase, salas, instructores, activeSus, racha]);

  // La clase CONCRETA que le proponemos (lib/portal-sugerencias.ts). Los cuatro
  // estados que no son "tienes clase" mandaban a la lista entera con un texto
  // genérico ("Hay clases con hueco esta semana"); esto los convierte en una
  // propuesta con nombre, día y hora. `null` cuando no hay nada honesto que
  // proponer —sin hueco, sin plan que lo cubra, sin nada futuro— y entonces la
  // tarjeta se queda exactamente como estaba.
  //
  // ⚠️ El id se saca FUERA del useMemo. Leyendo `session.socioId` dentro, el
  // React Compiler infiere que la dependencia real es `session` entero —menos
  // específico que el `session?.socioId` declarado— y se niega a conservar la
  // memoización (`react-hooks/preserve-manual-memoization`). Con el primitivo
  // extraído, lo inferido y lo declarado coinciden.
  const sugerenciaSocioId = session?.socioId ?? null;
  const sugerencia = useMemo(() => {
    if (!sugerenciaSocioId || homeCard.caso === 'PROXIMA_CLASE') return null;
    return sugerirClase({
      now, socioId: sugerenciaSocioId, misReservas, reservas, sesiones, tiposClase,
      suscripciones, planesTarifa,
    });
  }, [now, sugerenciaSocioId, homeCard.caso, misReservas, reservas, sesiones, tiposClase, suscripciones, planesTarifa]);

  // Los avisos salen del motor de notificaciones, la MISMA fuente que la
  // pantalla a la que enlaza la campana — si el número y la lista se calculan
  // por separado, dejan de coincidir (ver lib/notifications/use-unread.ts).
  // `null` = todavía no se sabe.
  const sinLeerReal = useNotificacionesSinLeer(portalAuthHeader, studio?.id, escribible);
  // En el preview el hook nunca pide nada, así que se quedaría en `null` para
  // siempre y el editor enseñaría un círculo VACÍO, que no es un estado real
  // del portal. Un valor de muestra fijo: la propietaria juzga el diseño con lo
  // que verá una socia al día, no con un estado de carga congelado.
  const sinLeer = escribible ? sinLeerReal : 0;

  // Bloques de sistema "tiraSemana"/"progresoSemanal", visibles por defecto
  // en el Inicio (rediseño "Tentare Studio App"). Lógica pura en
  // lib/portal-home-logic.ts, mismo criterio que getHomeCardContext arriba.
  const tiraSemana = useMemo(() => calcularTiraSemana(now, misReservas, sesiones), [now, misReservas, sesiones]);
  const progresoSemanal = useMemo(() => calcularProgresoSemanal(now, misReservas, sesiones), [now, misReservas, sesiones]);

  // "Tu ritmo" (rediseño Tentare Studio App): el saldo de bono, siempre a la
  // vista en Hoy en vez de solo en /bonos. `bonoActivo` ya calcula
  // restantes/total/progreso — null con mensual ilimitado (nada que barrear)
  // o sin ninguna suscripción activa, y ahí no se pinta nada.
  const bono = useMemo(
    () => bonoActivo(suscripciones, planesTarifa, tiposClase, session?.socioId ?? null),
    [suscripciones, planesTarifa, tiposClase, session?.socioId],
  );

  // "Huecos de hoy" (rediseño Tentare Studio App): clases de HOY con plaza
  // libre que su plan/bono cubre de verdad — no toda la agenda del día.
  const huecos = useMemo(
    () => huecosHoy({ now, socioId: session?.socioId ?? null, sesiones, reservas, suscripciones, planesTarifa }),
    [now, session?.socioId, sesiones, reservas, suscripciones, planesTarifa],
  );

  const nombre = socio?.nombre ?? session?.nombre?.split(' ')[0] ?? '';
  const hora = (iso: string) => new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  const diaCorto = (iso: string) =>
    new Date(iso).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric' }).replace('.', '').toUpperCase();

  // "Tu estudio" (rediseño Tentare Studio App): la próxima sesión de HOY con
  // aforo, para el badge "hoy HH:MM · N plazas" — fecha en LOCAL del estudio
  // (hoyEnEstudio), no UTC, mismo gotcha ya documentado en Decision OS. Sin
  // clase hoy, el badge simplemente no se pinta (nunca un hueco vacío con
  // aspecto de dato).
  const sesionHoy = useMemo(() => {
    const hoyStr = hoyEnEstudio(now);
    const libres = (sesionId: string, aforo: number) =>
      aforo - reservas.filter(r => r.sesionId === sesionId && r.estado === 'CONFIRMADA').length;
    const candidatas = sesiones
      .filter(s => !s.cancelada && new Date(s.inicio) > now && hoyEnEstudio(new Date(s.inicio)) === hoyStr)
      .sort((a, b) => new Date(a.inicio).getTime() - new Date(b.inicio).getTime());
    if (candidatas.length === 0) return null;
    const s = candidatas[0];
    return { sesion: s, libres: libres(s.id, s.aforoMaximo) };
  }, [now, sesiones, reservas]);

  // La instructora de esa misma clase de hoy si hay una, si no la primera que
  // imparte de verdad (recepción queda fuera, `queImparten`) — nunca ninguna
  // si el estudio no tiene instructoras activas.
  const instructoraDestacada = useMemo(() => {
    const activas = queImparten(instructores);
    if (activas.length === 0) return null;
    const deHoy = sesionHoy ? activas.find(i => i.id === sesionHoy.sesion.instructorId) : null;
    return deHoy ?? activas[0];
  }, [instructores, sesionHoy]);

  const especialidadesDestacada = useMemo(() => {
    if (!instructoraDestacada) return [];
    const idsImpartidos = new Set(
      sesiones.filter(s => s.instructorId === instructoraDestacada.id && !s.cancelada).map(s => s.tipoClaseId),
    );
    return tiposClase.filter(tc => idsImpartidos.has(tc.id));
  }, [instructoraDestacada, sesiones, tiposClase]);

  // Precio real de clase suelta (el plan PUNTUAL activo) — mismo campo que ya
  // usa /reservar para decidir qué precio enseñar sin bono (lib/reservar/construir-slots.ts).
  const precioClaseSuelta = useMemo(
    () => planesTarifa.find(p => p.tipo === 'PUNTUAL' && p.activo)?.precio ?? null,
    [planesTarifa],
  );

  const valoracionEstudioPantalla = valoracionParaPantalla(valoracionEstudio);
  const valoracionInstructoraPantalla = valoracionParaPantalla(instructoraDestacada?.valoracion ?? null);

  const fechaHoy = ahora
    ? new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }).format(ahora).toUpperCase()
    : '';

  // Las líneas de la tarjeta cuando SÍ hay una clase concreta que proponer.
  // Sustituyen al texto genérico del estudio, no a la volanta ni al titular:
  // el tono ("Tu sitio te espera") lo escribe la propietaria y se respeta; lo
  // que cambia es que debajo aparece una clase de verdad y su porqué.
  function metaConSugerencia(previas: string[], generico: string): string[] {
    if (!sugerencia) return [...previas, generico].filter(Boolean);
    const cuando = cuandoSugerencia(sugerencia.sesion.inicio, now);
    return [
      ...previas,
      `${sugerencia.tipo?.nombre ?? 'Clase'} · ${cuando}`,
      sugerencia.motivo,
    ];
  }

  // ── La tarjeta "Tu próxima clase" ───────────────────────────────────────────
  //
  // Un solo componente para los cinco estados. El diseño solo dibuja el
  // primero (PROXIMA_CLASE); los demás cambian volanta, titular y destino,
  // nunca la forma de la tarjeta.
  const tarjeta = (() => {
    switch (homeCard.caso) {
      case 'PROXIMA_CLASE': {
        const inicio = new Date(homeCard.sesion.inicio);
        const mins = Math.max(0, Math.round((inicio.getTime() - now.getTime()) / 60000));
        const h = Math.floor(mins / 60);
        const esHoy = inicio.toDateString() === now.toDateString();
        return {
          volanta: txt('proximaClase', 'proximaVolanta', 'Tu próxima clase'),
          contador: ahora ? (h > 0 ? `EN ${h} H ${mins % 60} MIN` : `EN ${mins} MIN`) : null,
          titulo: homeCard.tipo?.nombre ?? 'Clase',
          meta: [
            `${esHoy ? 'Hoy' : diaCorto(homeCard.sesion.inicio)} · ${hora(homeCard.sesion.inicio)}`,
            homeCard.instructor?.nombre,
            homeCard.sala?.nombre,
          ].filter(Boolean) as string[],
          cta: txt('proximaClase', 'proximaBoton', 'Ver mi acceso'),
          href: portalHref(`/${slug}/reservas`),
          abrePase: true,
          sesion: homeCard.sesion,
        };
      }
      case 'ULTIMA_SESION':
        return {
          volanta: txt('proximaClase', 'bonoVolanta', 'Tu bono se acaba'), contador: null,
          titulo: txt('proximaClase', 'bonoTitulo', 'Te queda una sesión'),
          meta: [plan?.nombre, txt('proximaClase', 'bonoTexto', 'Renuévalo y sigues igual')].filter(Boolean) as string[],
          cta: txt('proximaClase', 'bonoBoton', 'Renovar mi bono'), href: portalHref(`/${slug}/compras`),
        };
      case 'RACHA_EN_RIESGO':
        return {
          volanta: `Racha de ${homeCard.semanas} semanas`, contador: null,
          titulo: txt('proximaClase', 'rachaTitulo', 'No la pierdas ahora'),
          meta: metaConSugerencia([`Te quedan ${homeCard.diasParaPerder} ${homeCard.diasParaPerder === 1 ? 'día' : 'días'}`], txt('proximaClase', 'rachaTexto', 'Reserva esta semana')),
          cta: txt('proximaClase', 'rachaBoton', 'Buscar mi clase'), href: portalHref(`/${slug}/clases`),
        };
      case 'INACTIVA':
        return {
          volanta: `${homeCard.diasSinVenir} días sin venir`, contador: null,
          titulo: txt('proximaClase', 'inactivaTitulo', 'Tu sitio te espera'),
          meta: metaConSugerencia([], txt('proximaClase', 'inactivaTexto', 'Hay clases con hueco esta semana')),
          cta: txt('proximaClase', 'inactivaBoton', 'Volver a reservar'), href: portalHref(`/${slug}/clases`),
        };
      default:
        return {
          volanta: txt('proximaClase', 'vaciaVolanta', 'Sin clases reservadas'), contador: null,
          titulo: txt('proximaClase', 'vaciaTitulo', 'Empieza por aquí'),
          meta: metaConSugerencia([], txt('proximaClase', 'vaciaTexto', 'Elige el día que mejor te venga')),
          cta: txt('proximaClase', 'vaciaBoton', 'Ver la agenda'), href: portalHref(`/${slug}/clases`),
        };
    }
  })();

  // La foto de la tarjeta de "Tu próxima clase": la SUYA si la propietaria le
  // puso una, si no la del portal, y si tampoco la de por defecto.
  const fotoTarjeta = imagenDeEstudio('vertical', [txt('proximaClase', 'fotoUrl', ''), studio?.imagenBienvenidaUrl]);
  // La foto del hero de arriba (saludo/buscador): la de bienvenida del
  // estudio, o la de por defecto — nunca la misma variable que la de la
  // tarjeta (aunque hoy resuelvan al mismo campo), para que un fotoUrl de
  // sistema en "proximaClase" no cambie el hero sin querer.
  const fotoHero = imagenDeEstudio('vertical', studio?.imagenBienvenidaUrl);
  const lugarEstudio = [studio?.direccion, studio?.ciudad].filter(Boolean).join(', ');

  return (
    <div ref={raizRef} style={{ minHeight: '100%', background: t.bg, color: t.ink }}>
      {/* Ken Burns de las fotos: un bucle MUY lento y sutil (scale 1↔1.08,
          dur.heroFoto = 20 s). `!important` bajo `prefers-reduced-motion` es
          lo único que puede ganarle a la animación puesta inline por style. */}
      <style>{`
        @keyframes portal-hero-kenburns { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.08); } }
        @media (prefers-reduced-motion: reduce) {
          .portal-hero-kenburns { animation: none !important; }
        }
      `}</style>

      {/* ── HERO: foto del estudio + saludo + buscador + campana ──────────────
          Literal de la sección HOY del diseño: foto a sangre, degradado, y el
          texto flotando encima — nada de cabecera aparte por encima de la
          foto (eso era la mezcla entre lo viejo y el diseño). */}
      <div
        data-bloque-sistema="cabecera"
        data-bloque-id={idFijo('cabecera')}
        style={{ position: 'relative', height: 314, overflow: 'hidden' }}
      >
        <div ref={fotoRef} style={{ position: 'absolute', left: 0, right: 0, top: -34, bottom: -34, willChange: 'transform' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={fotoHero}
            alt=""
            onError={alFallarImagen(IMAGENES_POR_DEFECTO.vertical[0])}
            className="portal-hero-kenburns"
            style={{
              width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'var(--portal-foto-pos, center 32%)', display: 'block',
              animation: `portal-hero-kenburns ${dur.heroFoto}ms ${EASE} infinite`,
            }}
          />
        </div>
        <div aria-hidden style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(185deg, rgba(8,8,8,.58), rgba(8,8,8,.18) 42%, rgba(8,8,8,.06) 58%, transparent 86%)',
        }} />
        <div aria-hidden style={{
          position: 'absolute', left: 0, right: 0, bottom: 0, height: 64,
          background: `linear-gradient(180deg, transparent, ${t.bg})`,
        }} />

        <div style={{ position: 'absolute', left: 18, right: 18, top: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14 }}>
            <div style={{ minWidth: 0 }}>
              <p style={{ ...micro(9.5, 0.2, 600), color: 'rgba(250,249,245,.75)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {studio?.nombre ?? ''}
              </p>
              <p style={{ ...micro(9.5, 0.14, 500), color: 'rgba(250,249,245,.65)', marginTop: 2 }}>{fechaHoy || ' '}</p>
              <p style={{ ...texto.metaFuerte, fontSize: 13, color: 'rgba(250,249,245,.92)', marginTop: 6 }}>
                {ahora ? saludoPorHora(ahora) : ' '}, {nombre} 👋
              </p>
              <h1 style={{ ...display(32, false, 1.03), color: '#FAF9F5', marginTop: 3 }}>
                ¿Qué te apetece hoy?
              </h1>
            </div>
            <Link
              href={portalHref(`/${slug}/notificaciones`)}
              aria-label={sinLeer !== null && sinLeer > 0 ? `Notificaciones, ${sinLeer} sin leer` : 'Notificaciones'}
              style={{
                position: 'relative', width: 40, height: 40, flex: '0 0 40px', marginTop: 2,
                borderRadius: '50%', border: '1px solid rgba(255,255,255,.45)',
                background: 'rgba(250,249,245,.22)', ...cristal(desenfoque.chip),
                display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none',
              }}
            >
              <Bell size={18} strokeWidth={1.9} style={{ color: '#FAF9F5' }} />
              {sinLeer !== null && sinLeer > 0 && (
                <span style={{ position: 'absolute', top: 2, right: 2, width: 8, height: 8, borderRadius: '50%', background: '#E8A13C', border: '1.5px solid #fff' }} />
              )}
            </Link>
          </div>
          <button
            type="button"
            onClick={() => setBuscarAbierto(true)}
            style={{
              width: '100%', marginTop: 16, display: 'flex', alignItems: 'center', gap: 9,
              background: 'rgba(250,249,245,.94)', ...cristal(10), border: 'none', borderRadius: 999,
              padding: '13px 16px', boxShadow: '0 10px 26px rgba(8,8,8,.22)', cursor: 'pointer',
            }}
          >
            <Search size={16} strokeWidth={2} style={{ color: '#5A5A52', flexShrink: 0 }} />
            <span style={{ ...texto.meta, color: '#5A5A52' }}>Buscar clases, instructoras…</span>
          </button>
        </div>
      </div>

      <div style={{ padding: '0 24px 32px' }}>
        {/* ── "Tu próxima clase" ────────────────────────────────────────────── */}
        <div
          data-tarjeta="principal"
          data-bloque-sistema="proximaClase"
          data-bloque-id={idFijo('proximaClase')}
          style={{
            position: 'relative', margin: '13px -24px 0', borderRadius: 20, overflow: 'hidden',
            padding: '14px 15px', boxShadow: '0 18px 38px -16px rgba(18,41,26,.5)',
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={fotoTarjeta}
            alt=""
            onError={alFallarImagen(IMAGENES_POR_DEFECTO.vertical[0])}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
          />
          <div aria-hidden style={{ position: 'absolute', inset: 0, background: 'linear-gradient(100deg, rgba(18,41,26,.95), rgba(18,41,26,.68))' }} />
          <div style={{ position: 'relative' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <p style={{ ...micro(10, 0.16, 600), color: '#A8D0A9' }}>{tarjeta.volanta}</p>
              {tarjeta.contador && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, ...micro(10.5, 0, 700), color: '#A8D0A9' }}>
                  <span aria-hidden style={{ width: 6, height: 6, borderRadius: '50%', background: '#7BC488' }} />
                  {tarjeta.contador}
                </span>
              )}
            </div>
            <p style={{ margin: '5px 0 0', fontSize: 15.5, fontWeight: 800, letterSpacing: '-0.02em', color: '#FAF9F5' }}>
              {tarjeta.titulo}
            </p>
            {tarjeta.meta.length > 0 && (
              <p style={{ margin: '2px 0 0', fontSize: 11.5, color: 'rgba(234,240,231,.75)' }}>{tarjeta.meta.join(' · ')}</p>
            )}
            <div style={{ display: 'flex', gap: 7, marginTop: 9, flexWrap: 'wrap' }}>
              {(() => {
                const primaria: React.CSSProperties = {
                  display: 'flex', alignItems: 'center', gap: 7, height: 32, padding: '0 14px', borderRadius: 999,
                  background: '#FAF9F5', color: '#12291A', border: 'none', cursor: 'pointer', textDecoration: 'none',
                  ...micro(10.5, 0, 700), transition: transicion(['transform']),
                };
                const dentro = (
                  <>
                    <GlifoAcceso color="#12291A" />
                    {tarjeta.cta}
                  </>
                );
                // Con el check-in QR desactivado (Configuración → Reservas), la
                // reserva se marca asistida sola al terminar la clase: no hay
                // ningún pase que enseñar, así que el botón lleva directo a la
                // reserva, como en el resto de estados de esta tarjeta.
                return 'abrePase' in tarjeta && tarjeta.abrePase && (studio?.requiereCheckinQr ?? true)
                  ? <button type="button" onClick={() => setPaseAbierto(true)} style={primaria}>{dentro}</button>
                  : <Link href={tarjeta.href} style={primaria}>{dentro}</Link>;
              })()}
              {'sesion' in tarjeta && tarjeta.sesion && (
                <>
                  <a
                    href={lugarEstudio ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(lugarEstudio)}` : undefined}
                    target="_blank" rel="noopener noreferrer"
                    aria-disabled={!lugarEstudio}
                    style={{
                      display: 'flex', alignItems: 'center', height: 32, padding: '0 13px', borderRadius: 999,
                      border: '1px solid rgba(234,240,231,.35)', background: 'rgba(234,240,231,.12)', color: '#EAF0E7',
                      textDecoration: 'none', pointerEvents: lugarEstudio ? 'auto' : 'none', opacity: lugarEstudio ? 1 : 0.5,
                      ...micro(10.5, 0, 700),
                    }}
                  >
                    Cómo llegar
                  </a>
                  <a
                    href={icsDataUri(tarjeta.titulo, tarjeta.sesion.inicio, tarjeta.sesion.fin, lugarEstudio)}
                    download={`${tarjeta.titulo.replace(/[^a-zA-Z0-9]/g, '-')}.ics`}
                    style={{
                      display: 'flex', alignItems: 'center', height: 32, padding: '0 13px', borderRadius: 999,
                      border: '1px solid rgba(234,240,231,.35)', background: 'rgba(234,240,231,.12)', color: '#EAF0E7',
                      textDecoration: 'none', ...micro(10.5, 0, 700),
                    }}
                  >
                    + Calendario
                  </a>
                </>
              )}
            </div>
          </div>
        </div>

        {/* ── "Tu ritmo" (saldo de bono) ────────────────────────────────────── */}
        {bono && bono.totalSesiones != null && bono.totalSesiones > 0 && (
          <>
            <div style={{ height: 26 }} />
            <p style={{ ...micro(10, 0.16, 600), color: t.muted2 }}>Tu ritmo</p>
            <Link
              href={portalHref(`/${slug}/bonos`)}
              style={{
                marginTop: 9, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                background: t.surface, border: `1px solid ${t.line}`, borderRadius: 16,
                padding: '12px 15px', boxShadow: sombra.cardSemana, textDecoration: 'none',
              }}
            >
              <span style={{ ...texto.metaFuerte, color: t.ink }}>{bono.nombre}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 66, height: 5, borderRadius: 999, background: t.line, overflow: 'hidden' }}>
                  <div style={{
                    width: `${Math.round((bono.progresoTotal ?? 0) * 100)}%`, height: '100%',
                    background: 'var(--portal-brand)', borderRadius: 999,
                  }} />
                </div>
                <span style={{ ...micro(11, 0, 500), color: t.heroAccent }}>quedan {bono.totalRestantes}</span>
              </div>
            </Link>
          </>
        )}

        {/* ── "Tu semana" (racha + 7 días) ──────────────────────────────────── */}
        <div style={{ height: 10 }} />
        <Link
          href={portalHref(`/${slug}/progreso`)}
          style={{
            marginTop: 10, display: 'block', textDecoration: 'none',
            background: t.surface, border: `1px solid ${t.line}`, borderRadius: 16,
            padding: '11px 15px', boxShadow: sombra.cardSemana,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: t.muted2 }}>Tu semana</span>
            {racha && racha.semanas > 0 && (
              <span style={{ ...micro(10.5, 0, 700), color: '#C99A3C' }}>🔥 {racha.semanas} sem.</span>
            )}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
            {tiraSemana.map((dia) => (
              <div key={dia.fecha.toDateString()} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <span style={{ ...micro(8, 0.14, 600), color: t.micro }}>
                  {['L', 'M', 'X', 'J', 'V', 'S', 'D'][dia.indiceSemana]}
                </span>
                <span style={{
                  width: 26, height: 26, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: dia.esHoy ? 'var(--portal-brand)' : 'transparent',
                  border: dia.esHoy ? 'none' : `1px solid ${t.line}`,
                  fontSize: 10.5, fontWeight: 600, color: dia.esHoy ? 'var(--portal-brand-foreground)' : t.muted2,
                }}>
                  {dia.fecha.getDate()}
                </span>
                <span aria-hidden style={{ width: 4, height: 4, borderRadius: '50%', background: dia.tieneClaseReservada ? 'var(--portal-brand)' : 'transparent' }} />
              </div>
            ))}
          </div>
        </Link>

        {/* ── "Mi progreso" + reto destacado, lado a lado ──────────────────── */}
        <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
          <Link
            href={portalHref(`/${slug}/progreso`)}
            style={{
              flex: 1, minWidth: 0, textDecoration: 'none',
              background: t.surface, border: `1px solid ${t.line}`, borderRadius: 16,
              padding: '12px 14px', boxShadow: sombra.cardSemana,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ ...texto.metaFuerte, color: t.ink }}>Mi progreso</span>
              <span style={{ ...micro(8.5, 0, 500), color: t.muted2 }}>meta {META_PROGRESO_SEMANAL}/sem</span>
            </div>
            <p style={{ margin: '6px 0 8px', ...texto.meta, color: t.muted2 }}>
              <b style={{ color: t.ink }}>{progresoSemanal}</b> {progresoSemanal === 1 ? 'clase' : 'clases'} esta semana
            </p>
            <div style={{ height: 5, borderRadius: 999, background: t.line, overflow: 'hidden' }}>
              <div style={{
                width: `${Math.min(progresoSemanal, META_PROGRESO_SEMANAL) / META_PROGRESO_SEMANAL * 100}%`,
                height: '100%', background: 'var(--portal-brand)', borderRadius: 999,
                transition: transicion(['width'], dur.card),
              }} />
            </div>
          </Link>

          {RETOS_PORTAL[0] && (() => {
            const reto = RETOS_PORTAL[0];
            const apuntada = retosApuntados.includes(reto.key);
            const conteo = retoConteos[reto.key] ?? 0;
            return (
              <div style={{
                flex: 1, minWidth: 0, background: t.surface, border: `1px solid ${t.line}`, borderRadius: 16,
                padding: '12px 14px', boxShadow: sombra.cardSemana,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ ...texto.metaFuerte, color: t.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{reto.label}</span>
                  <span style={{ ...micro(8.5, 0, 500), color: t.muted2 }}>🏅</span>
                </div>
                <p style={{ margin: '6px 0 8px', ...texto.meta, color: t.muted2 }}>
                  {reto.dias} · {conteo > 0 ? `${conteo} apuntada${conteo === 1 ? '' : 's'}` : 'sé la primera'}
                </p>
                <button
                  type="button"
                  onClick={() => void toggleReto(reto.key, apuntada ? 'desmarcar' : 'marcar')}
                  style={{
                    width: '100%', height: 30, borderRadius: 999, border: 'none', cursor: 'pointer',
                    background: apuntada ? t.surface2 : 'var(--portal-brand)',
                    color: apuntada ? t.ink : 'var(--portal-brand-foreground)',
                    ...micro(10, 0, 700),
                  }}
                >
                  {apuntada ? 'Apuntada ✓' : 'Apuntarme'}
                </button>
              </div>
            );
          })()}
        </div>

        {/* ── Invita a una amiga ────────────────────────────────────────────── */}
        <div {...wrap('invitarAmiga')}>
          <div style={{ height: 34 }} />
          <Link
            href={portalHref(`/${slug}/invitar`)}
            style={{
              position: 'relative', display: 'block', height: altura.banner, borderRadius: radio.banner,
              overflow: 'hidden', background: t.surface2, boxShadow: sombra.banner, textDecoration: 'none',
              transition: transicion(['transform'], dur.card),
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imagenDeEstudio('banner', studio?.imagenBienvenidaUrl)}
              alt=""
              onError={alFallarImagen(IMAGENES_POR_DEFECTO.banner[0])}
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'var(--portal-foto-pos, center center)' }}
            />
            <div aria-hidden style={{
              position: 'absolute', inset: 0, pointerEvents: 'none',
              background: noche
                ? 'linear-gradient(94deg, rgba(18,20,14,.97) 6%, rgba(18,20,14,.88) 42%, rgba(18,20,14,.35) 72%, rgba(18,20,14,.06) 100%)'
                : 'linear-gradient(94deg, rgba(246,244,239,.97) 6%, rgba(246,244,239,.88) 42%, rgba(246,244,239,.35) 72%, rgba(246,244,239,.06) 100%)',
            }} />
            <div style={{ position: 'absolute', inset: 0, padding: '26px 24px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', pointerEvents: 'none' }}>
              <span style={{ ...micro(8.5, 0.26, 600), color: t.heroAccent }}>
                {txt('invitarAmiga', 'antetitulo', 'Trae a quien quieras')}
              </span>
              <div>
                <div style={{ ...display(escala('titulo-hero', 29), true, 1.12), color: t.ink, maxWidth: 220, textWrap: 'pretty' } as React.CSSProperties}>
                  {txt('invitarAmiga', 'titulo', 'La calma se comparte mejor.')}
                </div>
                <div style={{ ...texto.nota, color: t.muted, marginTop: 12 }}>
                  {txt('invitarAmiga', 'subtitulo', 'Invita a una amiga y ganáis las dos')}
                </div>
              </div>
            </div>
            <span aria-hidden style={{
              position: 'absolute', right: 22, bottom: 22, width: 44, height: 44, borderRadius: '50%',
              background: t.surface, display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 15, color: t.ink, boxShadow: sombra.circuloBanner,
            }}>→</span>
          </Link>
        </div>

        {/* ── Contenido editable del estudio (mensaje destacado + banners) ──── */}
        <div {...wrap('contenidoEstudio')}>
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
                  <img
                    src={b.imagenUrl} alt=""
                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'var(--portal-foto-pos, center center)' }}
                  />
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
                  {b.titulo && <div style={{ ...display(escala('titulo-hero', 29), true, 1.12), color: t.ink, maxWidth: 220, textWrap: 'pretty' } as React.CSSProperties}>{b.titulo}</div>}
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
                  ? <Link href={portalHref(`/${slug}${b.linkValor}`)} style={estiloBanner}>{contenido}</Link>
                  : <a href={hrefExterno!} target="_blank" rel="noopener noreferrer" style={estiloBanner}>{contenido}</a>}
              </div>
            );
          })}
        </div>

        {/* Bloques del catálogo (banner/texto/cta/faq) — hermanos de los dos
            de arriba en el mismo contenedor de order, para intercalarse de
            verdad en la posición elegida en el editor. */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {bloquesPersonalizados.map(({ b, orden }) => (
            <div key={b.id} data-bloque-id={b.id} style={{ order: orden }}>
              <BloqueHomeRender bloque={b} slug={slug} />
            </div>
          ))}
        </div>

        {/* ── "Tu estudio" ──────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', padding: '30px 0 8px' }}>
          <div>
            <p style={{ ...micro(10, 0.16, 600), color: t.muted2, textTransform: 'uppercase' } as React.CSSProperties}>El espacio</p>
            <h2 style={{ ...display(escala('seccion', 30)), color: t.ink }}>Tu estudio</h2>
          </div>
          <Link href={portalHref(`/${slug}/clases`)} style={{ ...micro(9.5, 0.2, 600), color: t.heroAccent, textDecoration: 'none' }}>
            Ver horario →
          </Link>
        </div>
        <div style={{ display: 'flex', gap: 12, overflowX: 'auto', margin: '0 -24px', padding: '8px 24px 8px', scrollbarWidth: 'none' } as React.CSSProperties}>
          <Link
            href={portalHref(`/${slug}/estudio`)}
            style={{
              position: 'relative', minWidth: 236, flex: '0 0 236px', height: 280, borderRadius: 20,
              overflow: 'hidden', textDecoration: 'none', boxShadow: sombra.cardSemana,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imagenDeEstudio('vertical', studio?.imagenBienvenidaUrl)}
              alt={studio?.nombre ?? 'Tu estudio'}
              onError={alFallarImagen(IMAGENES_POR_DEFECTO.vertical[0])}
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
            />
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0) 45%, rgba(15,15,15,.64))' }} aria-hidden />
            {sesionHoy && (
              <span style={{
                position: 'absolute', top: 11, left: 11, background: 'rgba(250,249,245,.92)', borderRadius: 999,
                padding: '4px 10px', ...micro(10.5, 0, 700), color: '#2E5A3A',
              }}>
                hoy {hora(sesionHoy.sesion.inicio)} · {sesionHoy.libres} {sesionHoy.libres === 1 ? 'plaza' : 'plazas'}
              </span>
            )}
            <div style={{ position: 'absolute', left: 13, right: 13, bottom: 11, color: '#fff' }}>
              <p style={{ margin: 0, fontSize: 17, fontWeight: 800, letterSpacing: '-0.02em' }}>{studio?.nombre}</p>
              <p style={{ margin: '2px 0 0', fontSize: 11.5, color: 'rgba(255,255,255,.85)' }}>
                {[
                  valoracionEstudioPantalla ? `★ ${valoracionEstudioPantalla.nota}` : null,
                  lugarEstudio || null,
                ].filter(Boolean).join(' · ')}
              </p>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                {precioClaseSuelta != null && (
                  <span style={{ fontSize: 13.5, fontWeight: 800 }}>{precioClaseSuelta} €</span>
                )}
                <span style={{ marginLeft: 'auto', background: '#FAF9F5', color: '#1A1A1A', borderRadius: 999, padding: '7px 14px', fontSize: 11.5, fontWeight: 800 }}>
                  Ver ficha
                </span>
              </div>
            </div>
          </Link>

          {instructoraDestacada && (
            <Link
              href={`/portal/${slug}/instructores/${instructoraDestacada.id}`}
              style={{
                position: 'relative', minWidth: 236, flex: '0 0 236px', height: 280, borderRadius: 20,
                overflow: 'hidden', textDecoration: 'none', boxShadow: sombra.cardSemana,
                backgroundColor: instructoraDestacada.color,
              }}
            >
              {instructoraDestacada.fotoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={instructoraDestacada.fotoUrl}
                  alt={instructoraDestacada.nombre}
                  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <span style={{
                  position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff', fontSize: 48, fontWeight: 800,
                }}>
                  {instructoraDestacada.nombre.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()}
                </span>
              )}
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0) 45%, rgba(15,15,15,.64))' }} aria-hidden />
              <span style={{
                position: 'absolute', top: 11, left: 11, background: 'rgba(250,249,245,.92)', borderRadius: 999,
                padding: '4px 10px', ...micro(10.5, 0, 700), color: '#2E5A3A',
              }}>
                Tu equipo
              </span>
              <div style={{ position: 'absolute', left: 13, right: 13, bottom: 11, color: '#fff' }}>
                <p style={{ margin: 0, fontSize: 17, fontWeight: 800, letterSpacing: '-0.02em' }}>
                  Conoce a {instructoraDestacada.nombre.split(' ')[0]}
                </p>
                <p style={{ margin: '2px 0 0', fontSize: 11.5, color: 'rgba(255,255,255,.85)' }}>
                  {[
                    valoracionInstructoraPantalla ? `★ ${valoracionInstructoraPantalla.nota}` : null,
                    especialidadesDestacada.slice(0, 2).map(tc => tc.nombre).join(', ') || null,
                  ].filter(Boolean).join(' · ')}
                </p>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                  <span style={{ background: 'rgba(250,249,245,.26)', border: '1px solid rgba(255,255,255,.5)', borderRadius: 999, padding: '7px 14px', fontSize: 11.5, fontWeight: 800 }}>
                    Su perfil
                  </span>
                </div>
              </div>
            </Link>
          )}
        </div>

        {/* ── "Huecos de hoy" ───────────────────────────────────────────────── */}
        {huecos.length > 0 && (
          <>
            <div style={{ padding: '30px 0 8px' }}>
              <p style={{ ...micro(10, 0.16, 600), color: t.muted2, textTransform: 'uppercase' } as React.CSSProperties}>Últimas plazas</p>
              <h2 style={{ ...display(escala('seccion', 30)), color: t.ink }}>Huecos de hoy</h2>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {huecos.map(({ sesion: s, libres }) => {
                const tipo = tiposClase.find(tc => tc.id === s.tipoClaseId);
                const inst = instructores.find(i => i.id === s.instructorId);
                return (
                  <Link
                    key={s.id}
                    href={portalHref(`/${slug}/clases/${s.id}`)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 11, background: t.surface, border: `1px solid ${t.line}`,
                      borderRadius: 15, padding: '10px 13px', textDecoration: 'none', transition: transicion(['box-shadow'], dur.card),
                    }}
                  >
                    <span style={{ ...micro(13, 0, 500), color: t.ink, minWidth: 40 } as React.CSSProperties}>{hora(s.inicio)}</span>
                    <span aria-hidden style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, backgroundColor: tipo?.color ?? t.muted }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: t.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {tipo?.nombre ?? 'Clase'}
                      </p>
                      {inst && (
                        <p style={{ margin: '1px 0 0', fontSize: 11, color: t.muted }}>{inst.nombre}</p>
                      )}
                    </div>
                    <AforoIndicator libres={libres} />
                  </Link>
                );
              })}
            </div>
          </>
        )}

        {/* ── "Tablón" ───────────────────────────────────────────────────────── */}
        {novedadesVigentes.length > 0 && (
          <>
            <div style={{ padding: '30px 0 8px' }}>
              <p style={{ ...micro(10, 0.16, 600), color: t.muted2, textTransform: 'uppercase' } as React.CSSProperties}>Tablón</p>
              <h2 style={{ ...display(escala('seccion', 30)), color: t.ink }}>Novedades del estudio</h2>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {novedadesVigentes.map((n) => (
                <div
                  key={n.id}
                  style={{ display: 'flex', gap: 10, background: t.surface, border: `1px solid ${t.line}`, borderRadius: 14, padding: '11px 13px' }}
                >
                  <span style={{ fontSize: 14, flexShrink: 0 }}>{n.emoji || '📣'}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 12, fontWeight: 800, color: t.ink }}>{n.titulo}</span>
                    {n.texto && (
                      <span style={{ display: 'block', fontSize: 10.5, color: t.muted, marginTop: 1 }}>{n.texto}</span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
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

      <BuscarOverlay open={buscarAbierto} onClose={() => setBuscarAbierto(false)} />

      {/* El avatar vive en el menú de abajo (pestaña Perfil), como en el
          diseño — nunca en esta cabecera. Se deja este bloque fuera de la
          vista para que los lectores de pantalla sigan anunciando de quién
          es la sesión al entrar. */}
      <span className="sr-only">
        <ProfileAvatar avatarId={socio?.avatar} fotoUrl={socio?.fotoUrl} nombre={session?.nombre ?? ''} size="md" />
      </span>
    </div>
  );
}
