'use client';

// 02 — INICIO. Implementación del diseño "Tentare App Cliente v2".
//
// Extraído de app/portal/[slug]/home/page.tsx (Fase 4 del editor de temas):
// esta es la PRESENTACIÓN pura del Inicio, sin depender de usePortalAuth()
// internamente — recibe `session` como prop para poder montarse también
// desde /portal-preview/[slug] (staff, sin sesión de socia real) con una
// sesión de muestra. `homeBloquesOverride`, si se pasa, sustituye a
// `homeBloques` del tema PUBLICADO — lo usa el preview en vivo del
// constructor de bloques (components/theme/home-preview.tsx) para reflejar
// el BORRADOR que se está editando, no lo ya publicado.
//
// La capa de datos del resto (estudio/catálogo) sigue viniendo de
// `useStudio()`: tanto /portal/[slug] como /portal-preview/[slug] montan su
// propio StudioProvider vía StudioSlugGate, así que ambos lo tienen.
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
import type { PortalSession } from '@/lib/portal-auth';
import { useStudio } from '@/lib/studio-context';
import { ProfileAvatar } from '@/components/ui/profile-avatar';
import { getHomeCardContext, calcularTiraSemana, calcularProgresoSemanal, META_PROGRESO_SEMANAL, saludoPorHora, huecosHoy } from '@/lib/portal-home-logic';
import { sugerirClase, cuandoSugerencia } from '@/lib/portal-sugerencias';
import { CalendarDays, Bell, Search, Ticket } from 'lucide-react';
import { BuscarOverlay } from '@/components/portal/buscar-overlay';
import { RETOS_PORTAL } from '@/lib/retos-portal';
import { useNotificacionesSinLeer } from '@/lib/notifications/use-unread';
import { HojaPase } from '@/components/portal/hoja-pase';
import { AforoIndicator } from '@/components/portal/ui';
import { pedirPaseDeAcceso, portalAuthHeader } from '@/lib/api-client';
import { bonoActivo } from '@/lib/bonos-portal';
import { usePortalHref } from '@/components/portal/portal-preview-bridge';
import {
  EASE, dur, transicion, display, micro, texto, radio, altura, sombra, cristal } from '@/lib/portal-design';
import { bloquesVisibles, type BloqueSistemaId, type BloqueHome } from '@/lib/portal-home-bloques';
import { BloqueHomeRender } from '@/components/portal/bloque-home-render';
import { imagenDeEstudio, alFallarImagen, IMAGENES_POR_DEFECTO } from '@/lib/imagenes-por-defecto';
import { hoyEnEstudio } from '@/lib/utils';
import { queImparten } from '@/lib/equipo';
import { valoracionParaPantalla } from '@/lib/portal-tema/valoracion';

/**
 * El radio de una tarjeta interna, del kit (`.ap-card` = 16 px,
 * app/portal/[slug]/portal-app.css).
 *
 * ⚠️ Antes era `radio.card` de `lib/portal-design.ts`, que vale **24**. En la
 * misma pantalla convivían tarjetas de 24 (bono en su variante rotulada,
 * semana, retos, contenido del estudio) con tarjetas de 16 (las que ya usaban
 * la clase `.ap-card`), y dos radios distintos en cards hermanas se ven. El
 * kit solo tiene tres radios de tarjeta —16 normal, 18 el banner y 20 las
 * grandes con foto— y 24 no es ninguno.
 *
 * No se toca `radio.card` en `lib/portal-design.ts`: lo comparte `/reservar`,
 * que va por otro diseño.
 */
const RADIO_TARJETA = 16;

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
    retosApuntados, retoConteos, toggleReto, variantes, valoracionEstudio,
  } = useStudio();
  const homeBloques = homeBloquesOverride ?? homeBloquesPublicado;
  const tarjetaRotulada = variantes.tarjetaPrincipal === 'rotulada';
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

  // Orden/visibilidad del Inicio (Fase 3 del editor de temas — constructor de
  // bloques): los 4 módulos de siempre (`sistema`) se ordenan por CSS `order`
  // sin mover el DOM, mismo mecanismo de Fase 2, así que el saludo/tarjeta
  // grande (fuera de este sistema) y los efectos de scroll que dependen de
  // ellos no se ven afectados. Los bloques nuevos del catálogo
  // (banner/texto/cta/faq) se AÑADEN como hermanos más en el mismo
  // contenedor flex, con su `order` calculado en el mismo espacio de índices
  // — así se intercalan de verdad con los módulos fijos, no solo se apilan
  // detrás. `homeBloques` ya viene resuelto del servidor (con fallback a
  // portalHome legacy si el estudio nunca tocó esto, ver resolveBloquesPantalla).
  const bloquesOrdenados = useMemo(() => bloquesVisibles(homeBloques), [homeBloques]);
  const wrap = (sistemaId: BloqueSistemaId) => {
    const i = bloquesOrdenados.findIndex((b) => b.kind === 'sistema' && b.sistemaId === sistemaId);
    // `data-bloque-sistema` marca el bloque igual que `data-bloque-id` marca
    // los del catálogo: sirve para acotar una aserción a SU bloque (varios de
    // estos destinos salen también en la barra inferior, así que buscar el
    // href a secas encuentra dos).
    //
    // `data-bloque-id` es lo que hace al bloque SELECCIONABLE desde el
    // preview del editor (portal-preview-bridge.ts busca ese atributo con
    // `closest()`). Los dos conviven a propósito: el `sistemaId` es el tipo
    // de módulo —el mismo en todos los estudios— y el `id` es esta fila
    // concreta en la lista de esta pantalla, que es lo que el editor
    // selecciona. Fuera del preview no cambia nada: en el portal de verdad
    // este atributo no lo lee nadie.
    return {
      'data-bloque-sistema': sistemaId,
      'data-bloque-id': i === -1 ? undefined : bloquesOrdenados[i].id,
      style: { order: i === -1 ? 0 : i },
      hidden: i === -1,
    };
  };
  /**
   * La config de un bloque de SISTEMA, ya resuelta.
   *
   * Los textos de estos bloques estaban escritos a fuego aquí — el titular de
   * "Invita a una amiga" era copy de un estudio concreto servido a todos. Ahora
   * salen del bloque guardado, y `resolverBloques` ya ha rellenado con el texto
   * de siempre lo que el estudio no haya tocado: sin config guardada esto
   * devuelve EXACTAMENTE lo que se pintaba antes.
   */
  const cfgSistema = (sistemaId: BloqueSistemaId): Record<string, unknown> => {
    const b = bloquesOrdenados.find((x) => x.kind === 'sistema' && x.sistemaId === sistemaId);
    return (b && b.kind === 'sistema' && b.config) || {};
  };
  const txt = (sistemaId: BloqueSistemaId, campo: string, siVacio = ''): string => {
    const v = cfgSistema(sistemaId)[campo];
    // ⚠️ La cadena VACÍA cuenta como "no puesto" y cae al literal de quien
    // llama — el parámetro se llama `siVacio`. Sin esto, un campo cuyo
    // `porDefecto` es '' (como `fraseConClase`, que va vacío a propósito para
    // que cada variante de cabecera conserve SU frase) borraba el texto en vez
    // de heredarlo. Lo cazó el e2e de la cabecera `titular` en CI.
    return typeof v === 'string' && v !== '' ? v : siVacio;
  };

  /**
   * El id de un bloque FIJO, para que el editor pueda seleccionarlo desde la
   * vista previa. Estos dos no entran en el contenedor que ordena los demás
   * con CSS `order` —el saludo y la tarjeta se mantienen siempre arriba, y los
   * efectos de scroll dependen de esa estructura— así que no pasan por
   * `wrap()` y necesitan su propio enganche.
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

  // "Mi progreso"/"Retos" — hoy solo existen como bloques de sistema OCULTOS
  // por defecto (`tiraSemana`/`progresoSemanal` de Oliva, `retos` de Bloom),
  // así que un estudio en el tema clásico (la inmensa mayoría — ningún tema
  // los instala hoy, ver comentario de BLOQUES_SISTEMA_POR_PANTALLA) no ve
  // nunca su progreso semanal ni los retos del estudio. Las dos tarjetas de
  // abajo son PERSISTENTES (mismo criterio que "Tu ritmo"/"Tu estudio": leen
  // datos de sesión, no tiene sentido reordenarlas en el editor) y se pintan
  // siempre — salvo que ESTE estudio ya haya activado a mano el bloque
  // equivalente del tema, en cuyo caso se cede el turno a ese para no
  // duplicar la misma información dos veces en la misma pantalla.
  const progresoSemanalBloqueActivo = bloquesOrdenados.some((b) => b.kind === 'sistema' && b.sistemaId === 'progresoSemanal');
  const retosBloqueActivo = bloquesOrdenados.some((b) => b.kind === 'sistema' && b.sistemaId === 'retos');

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

  // Bloques de sistema "tiraSemana"/"progresoSemanal", visibles por defecto
  // en el Inicio (rediseño "Tentare Studio App"). Lógica pura en
  // lib/portal-home-logic.ts, mismo criterio que getHomeCardContext arriba.
  const tiraSemana = useMemo(() => calcularTiraSemana(now, misReservas, sesiones), [now, misReservas, sesiones]);
  const progresoSemanal = useMemo(() => calcularProgresoSemanal(now, misReservas, sesiones), [now, misReservas, sesiones]);

  // "Tu ritmo" (rediseño Tentare Studio App): el saldo de bono, siempre a la
  // vista en Inicio en vez de solo en /bonos. `bonoActivo` ya calcula
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

  // Las líneas de la tarjeta cuando SÍ hay una clase concreta que proponer.
  // Sustituyen al texto genérico del estudio, no a la volanta ni al titular:
  // el tono ("Tu sitio te espera") lo escribe la propietaria y se respeta; lo
  // que cambia es que debajo aparece una clase de verdad y su porqué.
  //
  // Sin sugerencia se devuelve el texto genérico de siempre — la tarjeta no
  // pierde nada por que hoy no haya nada que ofrecer.
  function metaConSugerencia(previas: string[], generico: string): string[] {
    if (!sugerencia) return [...previas, generico].filter(Boolean);
    const cuando = cuandoSugerencia(sugerencia.sesion.inicio, now);
    return [
      ...previas,
      `${sugerencia.tipo?.nombre ?? 'Clase'} · ${cuando}`,
      // El motivo va SIEMPRE con la propuesta: sin él es una sugerencia
      // aleatoria, que es justo lo que no queremos.
      sugerencia.motivo,
    ];
  }

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

  // La foto de la tarjeta grande: la SUYA si la propietaria le puso una, si no
  // la del portal, y si tampoco la de por defecto. La herencia va en este orden
  // a propósito: quien nunca toque el campo nuevo no nota ningún cambio.
  const fotoTarjeta = imagenDeEstudio('vertical', [txt('proximaClase', 'fotoUrl', ''), studio?.imagenBienvenidaUrl]);

  return (
    <div ref={raizRef} className="portal-app" style={{ minHeight: '100%' }}>
      {/* Ken Burns EXACTO del cheatsheet (apKen: 22 s, scale 1↔1.08) — va en
          el <img>, nunca en `fotoRef` (el envoltorio que ya escribe
          `transform` a mano en cada scroll para el paralaje, más abajo): una
          animación CSS de `transform` y un `style.transform` de JS sobre el
          MISMO elemento se pisarían entre sí. */}
      <style>{`
        @keyframes portal-hero-kenburns { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.08); } }
        @media (prefers-reduced-motion: reduce) {
          .portal-hero-kenburns { animation: none !important; }
        }
      `}</style>

      {/* Barra que aparece al desplazar. `sticky` con margen negativo del mismo
          alto: se queda pegada arriba sin ocupar sitio, así el contenido pasa
          por debajo en vez de empezar 92 px más abajo. */}
      <div
        ref={topBarRef}
        aria-hidden
        style={{
          position: 'sticky', top: 0, height: altura.topbar, marginBottom: -altura.topbar, zIndex: 12,
          opacity: 0, pointerEvents: 'none',
          background: 'rgba(250,249,245,.88)', ...cristal(16),
          borderBottom: '1px solid #EFEDE4',
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center', paddingBottom: 14,
          transition: 'opacity 500ms ease',
        }}
      >
        <span style={{ fontSize: 15, fontWeight: 800, color: '#1A1A1A' }}>{studio?.nombre ?? 'Tentare'}</span>
      </div>

      {/* ── Hero fotográfico 314px ──────────────────────────────────────────
          Verificado contra CHEATSHEET-CSS.md ("Hero (Home, 314px)") y contra
          capturas reales: sustituye la cabecera de fondo plano de antes (las
          4 variantes `cabeceraInicio` de lib/theme-variantes.ts —
          clásica/saludo/nombre/titular — quedan retiradas por decisión
          explícita: el diseño vigente tiene un solo hero, igual para todo
          estudio). `saludoRef` se queda en el envoltorio que el efecto de
          scroll ya usa para el fundido del saludo (más abajo, sin tocar). */}
      <div style={{ position: 'relative', height: 314, overflow: 'hidden' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imagenDeEstudio('portada', studio?.imagenBienvenidaUrl)}
          alt=""
          onError={alFallarImagen(IMAGENES_POR_DEFECTO.portada[0])}
          className="portal-hero-kenburns"
          style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%',
            objectFit: 'cover', objectPosition: 'center 32%',
            animation: `portal-hero-kenburns 22000ms ${EASE} infinite`,
          }}
        />
        <div
          aria-hidden
          style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(185deg, rgba(8,8,8,.58), rgba(8,8,8,.18) 42%, rgba(8,8,8,.06) 58%, rgba(250,249,245,.35) 86%, #FAF9F5)',
          }}
        />

        <div
          ref={saludoRef}
          data-bloque-sistema="cabecera"
          data-bloque-id={idFijo('cabecera')}
          style={{
            position: 'absolute', left: 20, right: 20, top: 'calc(env(safe-area-inset-top) + 16px)',
            willChange: 'transform, opacity',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 9.5, letterSpacing: '.2em', textTransform: 'uppercase', color: '#A8D0A9' }}>
                {studio?.nombre ?? ''}
              </div>
              {/* Fecha en mono uppercase, EXACTA del cheatsheet — sale de
                  `ahora` (nunca de `now`/el placeholder de servidor): es la
                  única pieza de esta pantalla que depende solo de la hora
                  real del navegador, mismo motivo que ya documentaba
                  `saludoPorHora` más abajo. */}
              <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 9.5, letterSpacing: '.14em', textTransform: 'uppercase', color: 'rgba(250,249,245,.65)', marginTop: 3 }}>
                {ahora ? ahora.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }) : ''}
              </div>
            </div>
            <Link
              href={portalHref(`/${slug}/notificaciones`)}
              aria-label={sinLeer !== null && sinLeer > 0 ? `Notificaciones, ${sinLeer} sin leer` : 'Notificaciones'}
              style={{
                position: 'relative', width: 40, height: 40, flex: '0 0 40px',
                borderRadius: '50%', border: '1px solid rgba(255,255,255,.45)',
                background: 'rgba(250,249,245,.22)', ...cristal(10),
                display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none',
              }}
            >
              <Bell size={18} strokeWidth={1.9} style={{ color: '#FAF9F5' }} />
              {sinLeer !== null && sinLeer > 0 && (
                <span style={{ position: 'absolute', top: 1, right: 1, width: 8, height: 8, borderRadius: '50%', background: '#E8A13C', border: '1.5px solid #fff' }} />
              )}
            </Link>
          </div>

          <div style={{ marginTop: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'rgba(250,249,245,.9)' }}>
              {ahora ? saludoPorHora(ahora) : ' '}, {nombre} 👋
            </div>
            <h1 style={{ fontSize: 32, fontWeight: 800, letterSpacing: '-.035em', lineHeight: 1, color: '#FAF9F5', marginTop: 6 }}>
              {homeCard.caso === 'PROXIMA_CLASE'
                ? txt('cabecera', 'fraseConClase', 'Hoy tienes una cita contigo.')
                : txt('cabecera', 'fraseSinClase', '¿Qué te apetece hoy?')}
            </h1>
          </div>
        </div>

        {/* Buscador — pill translúcida EXACTA del cheatsheet, anclada al
            borde inferior del hero (donde el degradado ya funde a
            #FAF9F5). Sigue sin ser un push de ruta — abre el mismo
            `<BuscarOverlay>` de siempre. */}
        <button
          type="button"
          onClick={() => setBuscarAbierto(true)}
          aria-label="Buscar clases, instructoras"
          style={{
            position: 'absolute', left: 20, right: 20, bottom: 18,
            height: 46, padding: '13px 16px',
            display: 'flex', alignItems: 'center', gap: 10,
            borderRadius: 999, border: 'none',
            background: 'rgba(250,249,245,.94)', ...cristal(10),
            boxShadow: '0 10px 26px rgba(8,8,8,.22)', cursor: 'pointer',
          }}
        >
          <Search size={17} strokeWidth={1.9} style={{ color: '#5A5A52', flex: '0 0 auto' }} />
          <span style={{ fontSize: 13.5, color: '#5A5A52' }}>Buscar clases, instructoras…</span>
        </button>
      </div>

      <div style={{ padding: '0 24px' }}>
        <div style={{ height: 24 }} />

        {/* Rótulo de sección encima de la tarjeta (prototipo): "Tu semana"
            cuando no hay clase reservada, "Próxima clase" cuando la hay
            ("Tu próxima clase" en el tema de barra oscura). Sin la variante,
            no se pinta nada — la tarjeta ya se explica sola con su volanta. */}
        {/* ⚠️ TITULARES DE SECCIÓN: `.ap-h2` (18px/800/-.025em, portal-app.css),
            no `display(escala('seccion', …))`. Los cinco titulares de esta
            pantalla usaban la escala del tema y habían vuelto a derivar —
            24 px este y 30 px los otros cuatro ("Esta semana", "Retos",
            "Huecos de hoy", "Novedades del estudio")—, que es exactamente la
            incoherencia que `escala()` se creó para impedir. El kit fija un
            solo tamaño de titular de sección, así que la clase es la fuente
            de verdad y ya no hay número suelto que se pueda mover.
            La fuente SÍ sigue saliendo del tema (`--portal-heading-font`):
            `.ap-h2` solo fija tamaño, peso y tracking. */}
        {tarjetaRotulada && (
          <h2 style={{ fontFamily: 'var(--portal-heading-font, inherit)', color: '#1A1A1A', marginBottom: 12 }} className="ap-h2">
            {/* El prototipo dice "Tu próxima clase" solo en Noir; es una
                palabra de diferencia que obligaría a exponer otro campo del
                tema hasta aquí, así que se unifica. */}
            {homeCard.caso === 'PROXIMA_CLASE' ? 'Próxima clase' : 'Tu semana'}
          </h2>
        )}

        {/* Estado VACÍO en la variante rotulada: tarjeta sencilla en vez del
            bloque grande. Con clase reservada se sigue usando el hero de
            abajo, igual que hace el prototipo. */}
        {/* Las DOS ramas de la tarjeta llevan la misma marca: para el editor
            es el mismo bloque, aunque el tema decida pintarlo de otra forma. */}
        {tarjetaRotulada && homeCard.caso !== 'PROXIMA_CLASE' ? (
          <Link
            href={'href' in tarjeta ? tarjeta.href : portalHref(`/${slug}/clases`)}
            data-tarjeta="principal"
            style={{
              display: 'block', textDecoration: 'none', padding: 22,
              background: '#FFFFFF',
              border: `var(--portal-card-border, 1px solid #E5E3DA)`,
              boxShadow: 'var(--portal-card-shadow, none)',
              borderRadius: `var(--portal-radius-card, ${RADIO_TARJETA}px)`,
            }}
          >
            {/* Mismos textos que el hero (`tarjeta`), no unos propios: el
                estado vacío cambia de FORMA, no de mensaje. */}
            <p style={{ ...display(19, false, 1.2), color: '#1A1A1A' }}>{tarjeta.titulo}</p>
            {tarjeta.meta[0] && (
              <p style={{ ...texto.meta, color: '#5A5A52', marginTop: 7, lineHeight: 1.5 }}>{tarjeta.meta[0]}</p>
            )}
            <span style={{
              display: 'inline-flex', alignItems: 'center', height: 42, padding: '0 20px', marginTop: 16,
              borderRadius: radio.pill,
              // Fallback del KIT, no de la marca: `.ap-btn--primario` es tinta
              // con texto crema. El tema puede seguir pisándolo con
              // `--portal-btn-*` si el estudio lo declara.
              background: 'var(--portal-btn-bg, var(--ap-tinta, #1A1A1A))',
              color: 'var(--portal-btn-fg, #F1ECE1)',
              border: 'var(--portal-btn-border, none)',
              ...texto.metaFuerte,
            }}>
              {tarjeta.cta}
            </span>
          </Link>
        ) : (
        <>
        {/* `fotoTarjeta` nunca viene vacía: si el estudio no ha subido nada,
            `imagenDeEstudio` devuelve la de por defecto. Por eso aquí no hay
            rama "sin foto" — la hubo mientras la tarjeta medía 476 px y sin
            imagen dejaba medio metro de crema, pero con la foto por defecto
            ese vacío no llega a existir. */}
        {/* Tarjeta "Tu próxima clase" — kit "Tentare Studio App"
            (docs/diseno-referencia-portal/CHEATSHEET-CSS.md, literal):
            radio 20, padding 14px 15px, foto de fondo bajo un velo verde
            noche, sombra 0 18px 38px -16px rgba(18,41,26,.5).

            ⚠️ ANTES ERA OTRO DISEÑO. Esto medía 476 px de alto (foto a
            sangre + tarjeta de cristal flotando abajo, titular de 36 px en
            cursiva): la composición de "Tentare App Cliente v2", el diseño
            ANTERIOR. Con el kit vigente la tarjeta es compacta y el titular
            va a 15.5px/800 sobre el velo, no en una tarjeta clara aparte.
            Los dos e2e que fijaban los 476 px defendían aquel diseño y se
            han actualizado a esta geometría, no se han borrado.

            Y arregla un recorte real, medido en local a 390 px: el titular
            ("Tu sitio te espera", 18 caracteres) pedía 291 px en una caja de
            272 y salía como "Tu sitio te esp…", con el CTA igual
            ("Volver a reser…"). La causa era `whiteSpace: nowrap` sobre un
            texto de 36 px que el editor deja escribir hasta 50 caracteres.
            A 15.5 px y con dos líneas de margen, el texto por defecto cabe
            entero y el editable tiene sitio de verdad. */}
        <div
          // Ancla estable para las pruebas de geometría: la tarjeta no tiene rol
          // ni texto propio con el que localizarla (el titular cambia según el
          // caso), y colgar el test de su estructura lo rompe al primer div.
          data-tarjeta="principal"
          data-bloque-sistema="proximaClase"
          data-bloque-id={idFijo('proximaClase')}
          style={{
            position: 'relative', overflow: 'hidden',
            borderRadius: `var(--portal-radius-card, 20px)`,
            padding: '14px 15px',
            background: '#12291A',
            boxShadow: '0 18px 38px -16px rgba(18,41,26,.5)',
          }}
        >
          <div ref={fotoRef} style={{ position: 'absolute', left: 0, right: 0, top: -34, bottom: -34, willChange: 'transform' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={fotoTarjeta}
              alt=""
              onError={alFallarImagen(IMAGENES_POR_DEFECTO.vertical[0])}
              className="portal-hero-kenburns"
              style={{
                width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'var(--portal-foto-pos, center center)', display: 'block',
                animation: `portal-hero-kenburns ${dur.heroFoto}ms ${EASE} infinite`,
              }}
            />
          </div>

          {/* Velo del kit. Va SOBRE la foto y BAJO el texto: es lo que
              garantiza que el titular claro se lea con cualquier foto que
              suba el estudio, incluida una muy clara. */}
          <div aria-hidden style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(100deg, rgba(18,41,26,.95), rgba(18,41,26,.68))',
          }} />

          <div style={{ position: 'relative' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                {/* Dot 6px #7BC488 pulsante, del cheatsheet. `ap-dot-pulse`
                    ya existe en portal-app.css y respeta prefers-reduced-motion. */}
                <span aria-hidden className="ap-dot-pulse" style={{ width: 6, height: 6, borderRadius: '50%', background: '#7BC488', flex: '0 0 6px' }} />
                <span style={{
                  fontFamily: 'ui-monospace, monospace', fontSize: 10, letterSpacing: '.16em',
                  textTransform: 'uppercase', color: '#A8D0A9',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{tarjeta.volanta}</span>
              </span>
              {tarjeta.contador && (
                <span style={{
                  fontFamily: 'ui-monospace, monospace', fontSize: 10, letterSpacing: '.14em',
                  textTransform: 'uppercase', color: 'rgba(234,240,231,.72)', whiteSpace: 'nowrap', flex: '0 0 auto',
                }}>{tarjeta.contador}</span>
              )}
            </div>

            <Link href={tarjeta.href} style={{ textDecoration: 'none', display: 'block', marginTop: 9 }}>
              {/* Dos líneas, no `nowrap`: el titular es editable por la
                  propietaria hasta 50 caracteres (lib/portal-home-bloques.ts). */}
              <div style={{
                fontSize: 15.5, fontWeight: 800, letterSpacing: '-.02em', lineHeight: 1.25, color: '#FAF9F5',
                display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2, overflow: 'hidden',
              }}>
                {tarjeta.titulo}
              </div>
            </Link>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
              {tarjeta.meta.map((m, i) => (
                <span key={m} style={{ display: 'contents' }}>
                  {i > 0 && <span aria-hidden style={{ width: 1, height: 10, background: 'rgba(234,240,231,.35)' }} />}
                  <span style={{ fontSize: 11, color: i === 0 ? 'rgba(250,249,245,.92)' : 'rgba(234,240,231,.72)' }}>{m}</span>
                </span>
              ))}
            </div>

            {/* Fila de 3 acciones. Ninguna anida un interactivo dentro de
                otro (una es <button>, las otras dos <Link>, siempre
                HERMANOS: la tarjeta dejó de ser un enlace único por esto,
                ver el comentario de e2e/portal-cliente-v2.spec.ts). */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 13 }}>
              {(() => {
                // Píldora clara sobre el verde noche: #FAF9F5 con texto
                // #12291A a 11.5px/800, tal cual el cheatsheet.
                const estilo: React.CSSProperties = {
                  flex: 1, minWidth: 0, height: 38, borderRadius: 999, background: '#FAF9F5',
                  display: 'flex', alignItems: 'center', padding: '0 14px', border: 'none',
                  textDecoration: 'none', cursor: 'pointer',
                  transition: transicion(['transform', 'background']),
                };
                const dentro = (
                  <>
                    <GlifoAcceso color="#12291A" />
                    <span style={{
                      flex: 1, minWidth: 0, fontSize: 11.5, fontWeight: 800, color: '#12291A',
                      paddingLeft: 8, textAlign: 'left',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>{tarjeta.cta}</span>
                    <span aria-hidden style={{ flex: '0 0 auto', fontSize: 14, color: '#12291A', opacity: 0.55, paddingLeft: 4 }}>→</span>
                  </>
                );
                // Con el check-in QR desactivado (Configuración → Reservas), la
                // reserva se marca asistida sola al terminar la clase: no hay
                // ningún pase que enseñar, así que el botón lleva directo a la
                // reserva, como en el resto de estados de esta tarjeta.
                return 'abrePase' in tarjeta && tarjeta.abrePase && (studio?.requiereCheckinQr ?? true)
                  ? <button type="button" onClick={() => setPaseAbierto(true)} style={estilo}>{dentro}</button>
                  : <Link href={tarjeta.href} style={estilo}>{dentro}</Link>;
              })()}

              {/* Secundarios del cheatsheet: borde rgba(234,240,231,.35),
                  fondo rgba(234,240,231,.12), icono #EAF0E7 — translúcidos
                  sobre el velo, no círculos blancos (que sobre verde noche
                  pesaban más que el CTA principal). */}
              <Link
                href={portalHref(`/${slug}/clases`)}
                aria-label="Ver el horario"
                style={{
                  position: 'relative', width: 38, height: 38, flex: '0 0 38px',
                  borderRadius: '50%', border: '1px solid rgba(234,240,231,.35)',
                  background: 'rgba(234,240,231,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  textDecoration: 'none', transition: transicion(['transform']),
                }}
              >
                <CalendarDays size={17} strokeWidth={1.9} style={{ color: '#EAF0E7' }} />
              </Link>

              {/* Mi acceso — mismo destino que la fila "Mis reservas" de más
                  abajo: es ahí (no un pase suelto sin clase que enseñar en
                  los otros cuatro casos de esta tarjeta) donde vive el pase
                  QR de verdad cuando el check-in lo requiere. */}
              <Link
                href={portalHref(`/${slug}/reservas`)}
                aria-label="Mi acceso"
                style={{
                  position: 'relative', width: 38, height: 38, flex: '0 0 38px',
                  borderRadius: '50%', border: '1px solid rgba(234,240,231,.35)',
                  background: 'rgba(234,240,231,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  textDecoration: 'none', transition: transicion(['transform']),
                }}
              >
                <Ticket size={17} strokeWidth={1.9} style={{ color: '#EAF0E7' }} />
              </Link>
            </div>
          </div>
        </div>
        </>
        )}

        {/* "Tu ritmo" — saldo de bono, siempre a la vista (rediseño Tentare
            Studio App). Elemento persistente, no un bloque reordenable: igual
            que la tarjeta de arriba, depende de datos de sesión (bono real de
            ESTA socia) que no tendría sentido que una socia sin sesión (staff
            en /portal-preview) reordenara. Oculto sin bono con sesiones que
            contar — un mensual ilimitado no tiene fracción que barrear, y
            mostrar un 0/0 mentiría sobre un bono que no existe. */}
        {bono && bono.totalSesiones != null && bono.totalSesiones > 0 && (
          <>
            <div style={{ height: 44 }} />
            <h2 className="ap-label">Tu ritmo</h2>
            {/* Card bono (CHEATSHEET-CSS.md, literal): ap-card, padding
                12px 15px, barra 66×5px #EFEDE4/#4F8A5B, "quedan N" en mono
                verde — ya no el token de tema. */}
            <div className="ap-card" style={{
              marginTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '12px 15px',
            }}>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: '#1A1A1A' }}>{bono.nombre}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 66, height: 5, borderRadius: 999, background: '#EFEDE4', overflow: 'hidden' }}>
                  <div style={{
                    width: `${Math.round((bono.progresoTotal ?? 0) * 100)}%`, height: '100%',
                    background: '#4F8A5B', borderRadius: 999, transition: 'width .6s',
                  }} />
                </div>
                <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11, color: '#3E6B4A' }}>quedan {bono.totalRestantes}</span>
              </div>
            </div>

            {/* Semana (CHEATSHEET-CSS.md, "Semana (7 dots)"): "Tu semana" +
                7 columnas letra+dot, más la racha en ámbar a la derecha.
                Reutiliza `tiraSemana` (ya calculado arriba, mismo dato que el
                tema Oliva) y `racha.semanas` — nada nuevo que calcular. Se
                omite sin racha real Y sin ninguna clase esta semana: un dot
                vacío en las 7 columnas con "🔥 0 sem." sería ruido.
                ⚠️ Gateado por `!progresoSemanalBloqueActivo`, igual que "Mi
                progreso" más abajo: el bloque de sistema `progresoSemanal`
                (visible por defecto desde 2026-08-26, wrap('progresoSemanal')
                más abajo en este mismo fichero) YA pinta su propia tarjeta
                "Tu semana" — sin este gate, un estudio con ese bloque activo Y
                un bono con saldo veía LAS DOS a la vez, mismo rótulo,
                duplicado real (encontrado en vivo con sesión inyectada). */}
            {!progresoSemanalBloqueActivo && (tiraSemana.some(d => d.tieneClaseReservada) || (racha && racha.semanas > 0)) && (
              <div className="ap-card" style={{ marginTop: 10, padding: '14px 15px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: '#5A5A52' }}>Tu semana</span>
                  {racha && racha.semanas > 0 && (
                    <span style={{ fontSize: 10.5, fontWeight: 800, color: '#C99A3C' }}>🔥 {racha.semanas} sem.</span>
                  )}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12 }}>
                  {tiraSemana.map((dia) => (
                    <div key={dia.fecha.toDateString()} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 8.5, fontWeight: 700, color: '#98A093' }}>
                        {['L', 'M', 'X', 'J', 'V', 'S', 'D'][dia.indiceSemana]}
                      </span>
                      <span aria-hidden style={{
                        width: 16, height: 16, borderRadius: '50%',
                        background: dia.tieneClaseReservada ? '#4F8A5B' : '#EFEDE4',
                        border: dia.esHoy ? '2px solid #4F8A5B' : 'none',
                        boxSizing: 'border-box',
                      }} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* "Mi progreso" + "Retos" — dos tarjetas SIEMPRE visibles (rediseño
            Tentare Studio App). El progreso semanal y los retos del estudio
            ya existían como bloques de sistema — visibles POR DEFECTO desde
            2026-08-26 (ver comentario junto a `progresoSemanalBloqueActivo`
            más abajo) —, así que hoy casi toda socia ya los ve ahí, más
            abajo, dentro del contenedor ordenable. Misma lógica de cálculo
            que esos bloques (`calcularProgresoSemanal`/`RETOS_PORTAL`+
            `retosApuntados`+`retoConteos`+`toggleReto`), sin reimplementarla
            — solo se pinta aquí, apilada como "Tu ritmo", para el estudio
            RARO que los haya desactivado a mano desde el editor. */}
        {!progresoSemanalBloqueActivo && (
          <>
            <div style={{ height: 44 }} />
            <h2 className="ap-label">
              Mi progreso
            </h2>
            <Link
              href={portalHref(`/${slug}/progreso`)}
              style={{
                marginTop: 10, display: 'block', textDecoration: 'none',
                background: '#FFFFFF', border: `1px solid #E5E3DA`, borderRadius: RADIO_TARJETA,
                padding: '14px 16px', boxShadow: sombra.cardSemana,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ ...texto.metaFuerte, color: '#1A1A1A' }}>Tu semana</span>
                <span style={{ ...micro(9.5, 0, 500), color: '#5A5A52' } as React.CSSProperties}>meta {META_PROGRESO_SEMANAL}/sem</span>
              </div>
              <div style={{ ...texto.meta, color: '#5A5A52', margin: '6px 0 8px' }}>
                <span style={{ ...texto.metaFuerte, color: '#1A1A1A' }}>
                  {progresoSemanal} {progresoSemanal === 1 ? 'clase' : 'clases'}
                </span>{' '}
                esta semana
              </div>
              <div style={{ height: 5, borderRadius: 999, background: '#E5E3DA', overflow: 'hidden' }}>
                <div style={{
                  width: `${Math.min(progresoSemanal, META_PROGRESO_SEMANAL) / META_PROGRESO_SEMANAL * 100}%`,
                  // Mismo verde que la barra del bono de "Tu ritmo"
                  // (#4F8A5B, CHEATSHEET-CSS.md), no el color de marca.
                  height: '100%', background: '#4F8A5B', borderRadius: 999,
                  transition: transicion(['width'], dur.card),
                }} />
              </div>
            </Link>
          </>
        )}

        {!retosBloqueActivo && (
          <>
            <div style={{ height: 34 }} />
            <h2 className="ap-label">
              Retos
            </h2>
            <div style={{
              marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8,
              background: '#FFFFFF', border: `1px solid #E5E3DA`, borderRadius: RADIO_TARJETA,
              padding: '6px 16px', boxShadow: sombra.cardSemana,
            }}>
              {RETOS_PORTAL.map((reto, i) => {
                const apuntada = retosApuntados.includes(reto.key);
                const conteo = retoConteos[reto.key] ?? 0;
                return (
                  <div
                    key={reto.key}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0',
                      borderTop: i > 0 ? `1px solid #E5E3DA` : undefined,
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ ...texto.metaFuerte, color: '#1A1A1A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {reto.label}
                      </div>
                      <div style={{ ...texto.nota, color: '#5A5A52', marginTop: 2 }}>
                        {reto.dias} · {conteo > 0 ? `${conteo} apuntada${conteo === 1 ? '' : 's'}` : 'Sé la primera'}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void toggleReto(reto.key, apuntada ? 'desmarcar' : 'marcar')}
                      style={{
                        flex: '0 0 auto', height: 34, padding: '0 14px', borderRadius: 999, border: 'none', cursor: 'pointer',
                        background: apuntada ? '#EFEDE4' : 'var(--ap-tinta, #1A1A1A)',
                        color: apuntada ? '#1A1A1A' : '#F1ECE1',
                        transition: transicion(['background', 'color'], dur.card),
                        ...texto.metaFuerte,
                      }}
                    >
                      {apuntada ? 'Apuntada ✓' : 'Apuntarme'}
                    </button>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* Zona de Inicio construida con bloques (Fase 3 del editor de temas):
            cada módulo de siempre se ordena por CSS `order` sin mover el DOM,
            así que ningún efecto de scroll/parallax de arriba (que solo
            dependen del saludo y la tarjeta grande, fuera de este sistema) se
            ve afectado. Con `homeBloques` vacío (ningún estudio lo ha
            configurado) el orden es 0/1/2/3 = el orden de siempre, píxel a
            píxel. Los bloques nuevos del catálogo se añaden como hermanos
            más abajo, con el `order` que les toque en ese mismo espacio. */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {/* Esta semana */}
          <div {...wrap('estaSemana')}>
            {estaSemana.length > 0 && (
              <>
                <div style={{ height: 44 }} />
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                  <h2 style={{ fontFamily: 'var(--portal-heading-font, inherit)', color: '#1A1A1A' }} className="ap-h2">{txt('estaSemana', 'titulo', 'Esta semana')}</h2>
                  <Link href={portalHref(`/${slug}/clases`)} style={{ ...micro(9.5, 0.2, 600), color: '#3E6B4A', textDecoration: 'none' }}>
                    {txt('estaSemana', 'enlaceTexto', 'Agenda →')}
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
                        href={portalHref(`/${slug}/clases/${s.id}`)}
                        style={{
                          flex: '0 0 158px', height: 178, borderRadius: RADIO_TARJETA, background: '#FFFFFF',
                          padding: 20, display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                          boxShadow: sombra.cardSemana, textDecoration: 'none',
                          transition: transicion(['transform', 'box-shadow'], dur.card),
                        }}
                      >
                        <span style={{ ...micro(9, 0.26, 600), color: '#98A093' }}>{diaCorto(s.inicio)}</span>
                        <span style={{ ...display(25, false, 1.05), color: '#1A1A1A', textWrap: 'pretty' } as React.CSSProperties}>
                          {tipo?.nombre ?? 'Clase'}
                        </span>
                        <span style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                          <span style={{ ...texto.nota, color: '#5A5A52' }}>{hora(s.inicio)} ·</span>
                          <AforoIndicator libres={libres} />
                        </span>
                      </Link>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          {/* Invita a una amiga */}
          <div {...wrap('invitarAmiga')}>
            <div style={{ height: 34 }} />
            <Link
              href={portalHref(`/${slug}/invitar`)}
              style={{
                // Banner del kit (CHEATSHEET-CSS.md, "Invita a una amiga"):
                // 112 px de alto y radio 18, no los 208/26 de antes — que
                // eran del diseño anterior y hacían del banner la pieza más
                // alta del Inicio por detrás de la tarjeta principal.
                position: 'relative', display: 'block', height: 112, borderRadius: 18,
                overflow: 'hidden', background: '#EFEDE4',
                boxShadow: '0 14px 30px -14px rgba(15,15,15,.35)', textDecoration: 'none',
                transition: transicion(['transform'], dur.card),
              }}
            >
              {/* La foto del estudio, o la de por defecto del banner — que
                  viene compuesta con el motivo a la DERECHA, justo por el
                  degradado de aquí abajo, que tapa el 42 % izquierdo para el
                  texto. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imagenDeEstudio('banner', studio?.imagenBienvenidaUrl)}
                alt=""
                onError={alFallarImagen(IMAGENES_POR_DEFECTO.banner[0])}
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'var(--portal-foto-pos, center center)' }}
              />
              {/* Velo OSCURO del kit, no el crema de antes. Mantiene la misma
                  dirección (denso a la izquierda, transparente a la derecha),
                  así que la foto por defecto —compuesta con el motivo a la
                  DERECHA justo por esto— sigue encajando; lo que cambia es que
                  el texto pasa a ir en claro sobre la foto. */}
              <div aria-hidden style={{
                position: 'absolute', inset: 0, pointerEvents: 'none',
                background: 'linear-gradient(90deg, rgba(15,15,15,.68), rgba(15,15,15,.12))',
              }} />
              <div style={{ position: 'absolute', inset: 0, padding: '14px 18px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', pointerEvents: 'none' }}>
                <span style={{ ...micro(8.5, 0.26, 600), color: 'rgba(250,249,245,.82)' }}>
                  {txt('invitarAmiga', 'antetitulo', 'Trae a quien quieras')}
                </span>
                <div>
                  {/* 16px/800 en cursiva, del cheatsheet — no los 29 px de la
                      escala del tema: en 112 px de alto no caben. */}
                  <div style={{
                    fontFamily: 'var(--portal-heading-font, inherit)',
                    fontSize: 16, fontWeight: 800, fontStyle: 'italic', letterSpacing: '-.02em', lineHeight: 1.15,
                    color: '#FFFFFF', maxWidth: 210, textWrap: 'pretty',
                  } as React.CSSProperties}>
                    {txt('invitarAmiga', 'titulo', 'La calma se comparte mejor.')}
                  </div>
                  <div style={{ fontSize: 11, color: 'rgba(250,249,245,.78)', marginTop: 5, maxWidth: 210 }}>
                    {txt('invitarAmiga', 'subtitulo', 'Invita a una amiga y ganáis las dos')}
                  </div>
                </div>
              </div>
              <span aria-hidden style={{
                position: 'absolute', right: 16, bottom: 16, width: 38, height: 38, borderRadius: '50%',
                background: '#FAF9F5', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 14, color: '#1A1A1A', boxShadow: sombra.circuloBanner,
              }}>→</span>
            </Link>
          </div>

          {/* Contenido editable del estudio (mensaje destacado + banners). Añadido
              DESPUÉS de "Invita a una amiga" a propósito: no toca ninguna pieza ya
              cerrada del diseño, y no aparece nada aquí para un estudio que no haya
              configurado contenido — misma pantalla de siempre. */}
          <div {...wrap('contenidoEstudio')}>
            {contenidoPortal?.mensajeDestacado && (
              <>
                <div style={{ height: 20 }} />
                <div style={{
                  borderRadius: RADIO_TARJETA, padding: '16px 18px',
                  background: 'var(--ap-verde-suave, #EAF0E7)',
                  border: '1px solid rgba(44,53,44,.16)',
                }}>
                  <p style={{ ...texto.nota, color: '#5A5A52', lineHeight: 1.5 }}>{contenidoPortal.mensajeDestacado}</p>
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
                      // Sin foto por defecto a propósito (ver lib/imagenes-por-defecto.ts):
                      // es contenido que la propietaria decide subir, no un hueco a
                      // rellenar. Si la URL no carga, se oculta y queda el degradado +
                      // texto de abajo — no un icono de imagen rota (C3 de la auditoría
                      // de uso real, 2026-08-24).
                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'var(--portal-foto-pos, center center)' }}
                    />
                  ) : (
                    <div style={{ position: 'absolute', inset: 0, background: 'var(--ap-pill, #EFEDE4)' }} />
                  )}
                  <div aria-hidden style={{
                    position: 'absolute', inset: 0, pointerEvents: 'none',
                    background: 'linear-gradient(94deg, rgba(246,244,239,.97) 6%, rgba(246,244,239,.88) 42%, rgba(246,244,239,.35) 72%, rgba(246,244,239,.06) 100%)',
                  }} />
                  <div style={{ position: 'absolute', inset: 0, padding: '26px 24px', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', pointerEvents: 'none' }}>
                    {b.titulo && <div style={{
                    // 16px/800 en cursiva, del cheatsheet — a 29 px no cabe en
                    // los 112 de alto del banner.
                    fontFamily: 'var(--portal-heading-font, inherit)',
                    fontSize: 16, fontWeight: 800, fontStyle: 'italic', letterSpacing: '-.02em', lineHeight: 1.15,
                    color: '#FFFFFF', maxWidth: 210, textWrap: 'pretty',
                  } as React.CSSProperties}>{b.titulo}</div>}
                    {b.texto && <div style={{ ...texto.nota, color: '#5A5A52', marginTop: 12 }}>{b.texto}</div>}
                  </div>
                  <span aria-hidden style={{
                    position: 'absolute', right: 22, bottom: 22, width: 44, height: 44, borderRadius: '50%',
                    background: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 15, color: '#1A1A1A', boxShadow: sombra.circuloBanner,
                  }}>→</span>
                </>
              );
              // Misma geometría que el banner de "Invita a una amiga": son
              // hermanos visuales (foto a todo lo ancho, titular y flecha) y
              // el kit solo define un banner, 112 px de alto y radio 18
              // (CHEATSHEET-CSS.md). Antes iba a 208/26, que no es ningún
              // radio del kit y hacía de estos banners la pieza más alta del
              // Inicio.
              const estiloBanner: React.CSSProperties = {
                position: 'relative', display: 'block', height: 112, borderRadius: 18,
                overflow: 'hidden', background: '#EFEDE4',
                boxShadow: '0 14px 30px -14px rgba(15,15,15,.35)', textDecoration: 'none',
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

          {/* Tira de los 7 días (tema "Oliva") — el día de hoy resaltado, con
              un punto si esa fecha tiene una clase CONFIRMADA. Oculto por
              defecto: solo lo ve quien instala Oliva o lo activa a mano. */}
          <div {...wrap('tiraSemana')}>
            <div style={{ height: 34 }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
              {tiraSemana.map((dia) => (
                <div key={dia.fecha.toDateString()} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                  <span style={{ ...micro(9, 0.18, 600), color: '#98A093' }}>
                    {['L', 'M', 'X', 'J', 'V', 'S', 'D'][dia.indiceSemana]}
                  </span>
                  <span style={{
                    width: 34, height: 34, borderRadius: `var(--portal-radius-chip, ${radio.pill}px)`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    // Día activo del kit: "borde/bg #1A1A1A, texto #F1ECE1"
                    // (CHEATSHEET-CSS.md, "Tabs día / filtros").
                    background: dia.esHoy ? 'var(--ap-tinta, #1A1A1A)' : 'transparent',
                    border: dia.esHoy ? 'none' : `1px solid #E5E3DA`,
                    ...texto.metaFuerte, color: dia.esHoy ? '#F1ECE1' : '#1A1A1A',
                  }}>
                    {dia.fecha.getDate()}
                  </span>
                  <span aria-hidden style={{
                    width: 5, height: 5, borderRadius: '50%',
                    // Dot de la semana del kit (#4F8A5B, CHEATSHEET-CSS.md,
                    // "Semana (7 dots)"), no el color de marca.
                    background: dia.tieneClaseReservada ? '#4F8A5B' : 'transparent',
                  }} />
                </div>
              ))}
            </div>
          </div>

          {/* Progreso semanal — reservas CONFIRMADA de esta semana sobre
              META_PROGRESO_SEMANAL (un número de referencia, no una meta
              configurable). Oculto por defecto. Barra compacta (rediseño
              Tentare Studio App, 2026-08-26): sustituye el anillo anterior,
              que no tenía variante propia por tema (a diferencia de
              `retos.variantes` de abajo) — no era la seña de ningún tema en
              concreto, así que restylearlo no quita identidad a ninguno. */}
          <div {...wrap('progresoSemanal')}>
            <div style={{ height: 34 }} />
            <div style={{
              background: '#FFFFFF', border: `1px solid #E5E3DA`, borderRadius: RADIO_TARJETA,
              padding: '14px 16px', boxShadow: sombra.cardSemana,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ ...texto.metaFuerte, color: '#1A1A1A' }}>{txt('progresoSemanal', 'titulo', 'Tu semana')}</span>
                <span style={{ ...micro(9.5, 0, 500), color: '#5A5A52' } as React.CSSProperties}>meta {META_PROGRESO_SEMANAL}/sem</span>
              </div>
              <div style={{ ...texto.meta, color: '#5A5A52', margin: '6px 0 8px' }}>
                <span style={{ ...texto.metaFuerte, color: '#1A1A1A' }}>
                  {progresoSemanal} {progresoSemanal === 1 ? 'clase' : 'clases'}
                </span>{' '}
                esta semana
              </div>
              <div style={{ height: 5, borderRadius: 999, background: '#E5E3DA', overflow: 'hidden' }}>
                <div style={{
                  width: `${Math.min(progresoSemanal, META_PROGRESO_SEMANAL) / META_PROGRESO_SEMANAL * 100}%`,
                  // Mismo verde que la barra del bono de "Tu ritmo"
                  // (#4F8A5B, CHEATSHEET-CSS.md), no el color de marca.
                  height: '100%', background: '#4F8A5B', borderRadius: 999,
                  transition: transicion(['width'], dur.card),
                }} />
              </div>
            </div>
          </div>

          {/* Retos (tema "Bloom") — carrusel de 2 retos fijos (lib/retos-portal.ts)
              con conteo REAL de apuntadas de este estudio (nunca una cifra de
              marketing) y un toggle Apuntarme/Apuntada ✓ persistido por socia.
              Oculto por defecto. */}
          <div {...wrap('retos')}>
            <div style={{ height: 40 }} />
            <h2 style={{ fontFamily: 'var(--portal-heading-font, inherit)', color: '#1A1A1A' }} className="ap-h2">{txt('retos', 'titulo', 'Retos')}</h2>
            <div style={{ display: 'flex', gap: 12, overflowX: 'auto', margin: '0 -24px', padding: '18px 24px 8px', scrollbarWidth: 'none' } as React.CSSProperties}>
              {RETOS_PORTAL.map((reto) => {
                const apuntada = retosApuntados.includes(reto.key);
                const conteo = retoConteos[reto.key] ?? 0;
                // Variante 'color' (Bloom): fondo propio por reto y tinta fija
                // oscura — con un fondo claro constante, `'#1A1A1A'` quedaría casi
                // blanco encima y sería ilegible.
                const conColor = variantes.retos === 'color';
                const tinta = conColor ? reto.tinta : '#1A1A1A';
                // `imagenCore`/`imagenCara`: campo del bloque, no del tema —
                // es contenido del estudio, y cada estudio sube el suyo.
                const fotoReto = txt('retos', reto.key === 'core' ? 'imagenCore' : 'imagenCara');
                return (
                  <div
                    key={reto.key}
                    style={{
                      flex: conColor ? '0 0 218px' : '0 0 200px',
                      borderRadius: conColor ? 26 : RADIO_TARJETA,
                      background: conColor ? reto.fondo : '#FFFFFF',
                      padding: 18,
                      boxShadow: conColor ? 'none' : sombra.cardSemana,
                    }}
                  >
                    {/* La foto que haya subido el estudio para ESTE reto. Sin
                        foto, la tarjeta se queda con su color — que es como se
                        ve hoy en todos los estudios. Va arriba, sangrando el
                        relleno de la tarjeta, y el texto sigue debajo: así el
                        conteo real de apuntadas no compite con la imagen. */}
                    {fotoReto !== '' && (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={fotoReto} alt=""
                        // Sin foto por defecto a propósito (ver comentario de arriba y
                        // lib/imagenes-por-defecto.ts): si la URL no carga, la tarjeta
                        // se queda con su color, igual que cuando nunca hubo foto — no
                        // un icono de imagen rota (C3 de la auditoría de uso real,
                        // 2026-08-24).
                        onError={(e) => { e.currentTarget.style.display = 'none'; }}
                        style={{
                          display: 'block', width: 'calc(100% + 36px)', height: 116,
                          margin: '-18px -18px 14px', objectFit: 'cover',
                        }}
                      />
                    )}
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                      <span style={{ ...display(18, false, 1.2), color: tinta }}>{reto.label}</span>
                      <span style={{
                        flex: 'none', height: 24, padding: '0 10px', borderRadius: 999,
                        background: conColor ? 'rgba(255,255,255,.75)' : '#EFEDE4',
                        color: conColor ? tinta : '#5A5A52',
                        display: 'inline-flex', alignItems: 'center',
                        ...micro(10.5, 0, 600),
                      }}>
                        {reto.dias}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14 }}>
                      {/* Pila de "caras": decoración de COLOR, nunca fotos
                          reales de socias (el prototipo también usa colores
                          planos, y así no se expone a nadie). */}
                      {conColor && (
                        <span aria-hidden style={{ display: 'flex', flex: 'none' }}>
                          {reto.caras.map((c, i) => (
                            <span key={i} style={{
                              display: 'block', width: 24, height: 24, borderRadius: '50%',
                              background: c, border: `2px solid ${reto.fondo}`, marginLeft: i ? -8 : 0,
                            }} />
                          ))}
                        </span>
                      )}
                      <p style={{ ...texto.meta, color: conColor ? tinta : '#5A5A52', opacity: conColor ? 0.75 : 1, margin: 0 }}>
                        {conteo > 0 ? `${conteo} apuntada${conteo === 1 ? '' : 's'}` : 'Sé la primera en apuntarte'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void toggleReto(reto.key, apuntada ? 'desmarcar' : 'marcar')}
                      style={{
                        marginTop: 16, width: '100%', height: 40, borderRadius: 999, border: 'none', cursor: 'pointer',
                        background: conColor
                          ? (apuntada ? 'rgba(255,255,255,.55)' : tinta)
                          : (apuntada ? '#EFEDE4' : 'var(--ap-tinta, #1A1A1A)'),
                        color: conColor
                          ? (apuntada ? tinta : reto.fondo)
                          : (apuntada ? '#1A1A1A' : '#F1ECE1'),
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: transicion(['background', 'color'], dur.card),
                        ...texto.metaFuerte,
                      }}
                    >
                      {apuntada ? 'Apuntada ✓' : 'Apuntarme'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Bloques del catálogo (banner/texto/cta/faq) — hermanos de los 4
              módulos de arriba en el mismo contenedor flex, con el `order`
              que les toque para intercalarse de verdad en la posición
              elegida en el editor. */}
          {bloquesPersonalizados.map(({ b, orden }) => (
            <div key={b.id} data-bloque-id={b.id} style={{ order: orden }}>
              <BloqueHomeRender bloque={b} slug={slug} />
            </div>
          ))}
        </div>

        {/* "Tu estudio" (rediseño Tentare Studio App): carrusel con el
            estudio y una instructora del equipo — elemento persistente, no
            un bloque reordenable (misma razón que "Tu ritmo": depende de
            datos calculados en cada carga — sesión de hoy, plan puntual
            activo — que no tendría sentido reordenar en el editor). */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', padding: '30px 24px 8px' }}>
          <div>
            <p className="ap-label">El espacio</p>
            <h2 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-.025em', color: '#1A1A1A', marginTop: 4 }}>Tu estudio</h2>
          </div>
          <Link href={portalHref(`/${slug}/clases`)} style={{ fontSize: 11, fontWeight: 700, color: '#3E6B4A', textDecoration: 'none' }}>
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
                  [studio?.direccion, studio?.ciudad].filter(Boolean).join(', ') || null,
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
              {/* Sin foto propia, NUNCA una foto de archivo haciéndose pasar
                  por ella (lib/imagenes-por-defecto.ts) — se queda con su
                  color e iniciales, igual que en el listado de equipo. */}
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

        {/* "Huecos de hoy" (rediseño Tentare Studio App): SOLO las clases de
            hoy que su plan/bono cubre y que aún tienen plaza — no toda la
            agenda del día (eso ya está en "Esta semana"/Explorar). Elemento
            persistente, no un bloque reordenable: depende de `session` y de
            la hora exacta de carga, igual que "Tu ritmo"/"Tu estudio". Sin
            huecos, la sección entera desaparece — un titular sin filas
            debajo se lee como un error, no como "hoy no hay nada que
            ofrecerte". */}
        {huecos.length > 0 && (
          <>
            <div style={{ padding: '30px 24px 8px' }}>
              <p className="ap-label">Últimas plazas</p>
              <h2 style={{ fontFamily: 'var(--portal-heading-font, inherit)', color: '#1A1A1A' }} className="ap-h2">Huecos de hoy</h2>
            </div>
            <div style={{ padding: '0 24px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {huecos.map(({ sesion: s, libres }) => {
                const tipo = tiposClase.find(tc => tc.id === s.tipoClaseId);
                const inst = instructores.find(i => i.id === s.instructorId);
                return (
                  <Link
                    key={s.id}
                    href={portalHref(`/${slug}/clases/${s.id}`)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 11, background: '#FFFFFF', border: `1px solid #E5E3DA`,
                      // 16, no 15: es una fila de clase, misma pieza que las
                      // de Horario, y el kit las da a `.ap-card` (16 px). Un
                      // píxel de diferencia no se ve solo, pero era el único
                      // radio de Inicio que no salía del kit.
                      borderRadius: RADIO_TARJETA, padding: '10px 13px', textDecoration: 'none', transition: transicion(['box-shadow'], dur.card),
                    }}
                  >
                    <span style={{ ...micro(13, 0, 500), color: '#1A1A1A', minWidth: 40 } as React.CSSProperties}>{hora(s.inicio)}</span>
                    <span aria-hidden style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, backgroundColor: tipo?.color ?? '#5A5A52' }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: '#1A1A1A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {tipo?.nombre ?? 'Clase'}
                      </p>
                      {inst && (
                        <p style={{ margin: '1px 0 0', fontSize: 11, color: '#5A5A52' }}>{inst.nombre}</p>
                      )}
                    </div>
                    <AforoIndicator libres={libres} />
                  </Link>
                );
              })}
            </div>
          </>
        )}

        {/* "Tablón" (rediseño Tentare Studio App): avisos de texto libre que
            PROPIETARIO/MANAGER escriben (componente Novedades del editor de
            temas). Elemento persistente, no un bloque reordenable — mismo
            criterio que "Tu ritmo"/"Tu estudio": aquí lo que decide qué se ve
            es la ventana de fechas resuelta en cada carga, no un orden que
            tenga sentido reordenar a mano. Vacío si no hay ningún aviso
            vigente — nunca un "Tablón" con la sección en blanco debajo. */}
        {novedadesVigentes.length > 0 && (
          <>
            <div style={{ padding: '30px 24px 8px' }}>
              <p className="ap-label">Tablón</p>
              <h2 style={{ fontFamily: 'var(--portal-heading-font, inherit)', color: '#1A1A1A' }} className="ap-h2">Novedades del estudio</h2>
            </div>
            <div style={{ padding: '0 24px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {novedadesVigentes.map((n) => (
                <div
                  key={n.id}
                  style={{ display: 'flex', gap: 10, background: '#FFFFFF', border: `1px solid #E5E3DA`, borderRadius: 14, padding: '11px 13px' }}
                >
                  <span style={{ fontSize: 14, flexShrink: 0 }}>{n.emoji || '📣'}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 12, fontWeight: 800, color: '#1A1A1A' }}>{n.titulo}</span>
                    {n.texto && (
                      <span style={{ display: 'block', fontSize: 10.5, color: '#5A5A52', marginTop: 1 }}>{n.texto}</span>
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

      {/* El avatar vive en el menú de abajo (pestaña Perfil) y ya no hay
          variante de hero que lo suba a la cabecera (retirada, ver más
          arriba) — este bloque se queda SIEMPRE fuera de la vista para que
          los lectores de pantalla sigan anunciando de quién es la sesión
          al entrar. */}
      <span className="sr-only">
        <ProfileAvatar avatarId={socio?.avatar} fotoUrl={socio?.fotoUrl} nombre={session?.nombre ?? ''} size="md" />
      </span>
    </div>
  );
}
