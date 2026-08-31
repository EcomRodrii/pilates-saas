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
import { getHomeCardContext, calcularTiraSemana, calcularProgresoSemanal, META_PROGRESO_SEMANAL, accesosRapidosDe, rotuloAccesos, saludoPorHora, huecosHoy } from '@/lib/portal-home-logic';
import { sugerirClase, cuandoSugerencia } from '@/lib/portal-sugerencias';
import { CalendarDays, Sparkles, Bell, User, Search, Ticket, type LucideIcon } from 'lucide-react';
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

// Iconos de los accesos rápidos en sus variantes rejilla/círculos (la de filas
// no lleva icono). Mismo criterio que portal-nav.tsx: el dato es un NOMBRE, el
// componente se resuelve aquí — así lib/portal-home-logic.ts sigue sin React.
const ICONOS_ACCESO: Record<string, LucideIcon> = { CalendarDays, Sparkles, Bell, User };

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

  const filas = accesosRapidosDe({ slug, portalHref, proximas, totalAsistidas, sinLeer, nInstructoras: instructores.length });

  // La foto de la tarjeta grande: la SUYA si la propietaria le puso una, si no
  // la del portal, y si tampoco la de por defecto. La herencia va en este orden
  // a propósito: quien nunca toque el campo nuevo no nota ningún cambio.
  const fotoTarjeta = imagenDeEstudio('vertical', [txt('proximaClase', 'fotoUrl', ''), studio?.imagenBienvenidaUrl]);
  const cristalClaro = noche ? 'rgba(28,31,23,.72)' : 'rgba(246,244,239,.72)';
  const bordeCristal = noche ? 'rgba(243,241,233,.10)' : 'rgba(255,255,255,.80)';
  const lineaSuave = noche ? 'rgba(243,241,233,.20)' : 'rgba(34,38,31,.20)';

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
        {tarjetaRotulada && (
          <h2 style={{ ...display(escala('seccion', 24)), color: t.ink, marginBottom: 12 }}>
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
              background: t.surface,
              border: `var(--portal-card-border, 1px solid ${t.line})`,
              boxShadow: 'var(--portal-card-shadow, none)',
              borderRadius: `var(--portal-radius-card, ${radio.card}px)`,
            }}
          >
            {/* Mismos textos que el hero (`tarjeta`), no unos propios: el
                estado vacío cambia de FORMA, no de mensaje. */}
            <p style={{ ...display(19, false, 1.2), color: t.ink }}>{tarjeta.titulo}</p>
            {tarjeta.meta[0] && (
              <p style={{ ...texto.meta, color: t.muted2, marginTop: 7, lineHeight: 1.5 }}>{tarjeta.meta[0]}</p>
            )}
            <span style={{
              display: 'inline-flex', alignItems: 'center', height: 42, padding: '0 20px', marginTop: 16,
              borderRadius: `var(--portal-radius-boton, ${radio.pill}px)`,
              background: 'var(--portal-btn-bg, var(--portal-brand))',
              color: 'var(--portal-btn-fg, var(--portal-brand-foreground))',
              border: 'var(--portal-btn-border, none)',
              ...texto.metaFuerte,
            }}>
              {tarjeta.cta}
            </span>
          </Link>
        ) : (
        <>
        {/* Tarjeta grande: 476 px de imagen con la tarjeta de cristal flotando
            abajo, que es exactamente el diseño.
            Hubo una rama alternativa —tarjeta encogida a su altura natural—
            porque SIN foto esos 476 px eran un vacío de color crema, el caso de
            casi todos los estudios el primer día. Con la foto por defecto ese
            vacío ya no existe, así que la rama se fue: `fotoTarjeta` nunca
            viene vacía. */}
        <div
          // Ancla estable para las pruebas de geometría: la tarjeta no tiene rol
          // ni texto propio con el que localizarla (el titular cambia según el
          // caso), y colgar el test de su estructura lo rompe al primer div.
          data-tarjeta="principal"
          // Se marca AQUÍ y no en un envoltorio nuevo: la rama grande es un
          // fragment con varios hijos directos del contenedor con padding, y
          // meterles un div encima cambiaría el layout de la pieza más visible
          // del portal. Este ancla ya existía para las pruebas de geometría.
          data-bloque-sistema="proximaClase"
          data-bloque-id={idFijo('proximaClase')}
          style={{
            position: 'relative',
            height: altura.heroCard,
            // var() con el valor de hoy como fallback: sin `radioTema.card` el
            // tema no declara esta var (varsRadioTema, lib/theme-runtime.ts) y
            // la tarjeta se ve exactamente igual que antes.
            borderRadius: `var(--portal-radius-card, ${radio.heroCard}px)`, overflow: 'hidden',
            background: t.surface2,
            boxShadow: sombra.heroCard,
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

          <div style={{
            position: 'absolute', top: 18, left: 18, right: 18,
            display: 'flex', justifyContent: 'space-between', gap: 10, pointerEvents: 'none',
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
            position: 'absolute', left: 14, right: 14, bottom: 14,
            borderRadius: radio.card,
            background: cristalClaro, ...cristal(desenfoque.cardHero, 170),
            border: `1px solid ${bordeCristal}`, boxShadow: sombra.cardInterna, padding: '22px 20px 20px',
          }}>
            <Link href={tarjeta.href} style={{ textDecoration: 'none', display: 'block' }}>
              <div style={{ ...display(escala('titulo-hero', 36), true), color: t.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
            {/* Fila de 3 píldoras: la principal (case-aware, igual que
                siempre) más dos accesos directos fijos — horario y mi acceso
                — a acciones reales que ya existían en el portal pero solo se
                podían llegar a ellas desde otra pantalla. Ninguna anida un
                interactivo dentro de otro (una de las píldoras es un
                <button>, las otras dos son <Link>, siempre HERMANOS: la
                tarjeta grande dejó de ser un enlace único por esto mismo,
                ver el comentario de e2e/portal-cliente-v2.spec.ts). */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 18 }}>
              {(() => {
                // Padding/gaps recortados respecto al botón de ancho completo
                // de antes: con los 2 círculos nuevos al lado (medido en un
                // iPhone SE, 375px — el "iPhone normal" de 402px del
                // comentario de abajo no era el caso más estrecho real), el
                // texto por defecto de este CTA ("Ver la agenda", editable
                // hasta 30 caracteres desde el editor) se veía truncado a
                // "Ver la ag…" — inaceptable en el CTA principal de la
                // pantalla que más ve una socia. Los círculos se quedan a 40px
                // (mismo tamaño que la cabecera, ver comentario de abajo).
                const estilo: React.CSSProperties = {
                  flex: 1, minWidth: 0, height: altura.botonCta, borderRadius: `var(--portal-radius-boton, ${radio.botonCta}px)`, background: 'var(--portal-brand)',
                  display: 'flex', alignItems: 'center', padding: '0 12px', border: 'none',
                  textDecoration: 'none', cursor: 'pointer',
                  boxShadow: sombra.cta, transition: transicion(['transform', 'background']),
                };
                const dentro = (
                  <>
                    <GlifoAcceso color="var(--portal-brand-foreground)" />
                    <span style={{
                      flex: 1, minWidth: 0, ...texto.botonCta, color: 'var(--portal-brand-foreground)', paddingLeft: 8, textAlign: 'left',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>{tarjeta.cta}</span>
                    <span aria-hidden style={{ flex: '0 0 auto', fontSize: 16, color: 'var(--portal-brand-foreground)', opacity: 0.7, paddingLeft: 4 }}>→</span>
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

              {/* Horario/Mi acceso — círculos de 40 px, el MISMO tamaño y
                  tratamiento que la lupa y la campana de la cabecera (arriba
                  en este mismo fichero): no `altura.botonCta` (62 px, pensado
                  para un botón ancho a todo lo ancho, no para un icono suelto
                  al lado de la píldora principal) — con 62 px la principal se
                  quedaba sin sitio para su texto en un iPhone normal (402 px),
                  no solo en el SE. Horario — el calendario completo, un atajo
                  a la misma pantalla a la que ya lleva "Ver la agenda"/"Esta
                  semana" más abajo, ahora también desde la tarjeta principal. */}
              <Link
                href={portalHref(`/${slug}/clases`)}
                aria-label="Ver el horario"
                style={{
                  position: 'relative', width: 40, height: 40, flex: '0 0 40px',
                  borderRadius: '50%', border: `1px solid ${noche ? 'rgba(243,241,233,.14)' : 'rgba(34,38,31,.14)'}`,
                  background: t.surface, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: sombra.circulo, textDecoration: 'none',
                  transition: transicion(['transform']),
                }}
              >
                <CalendarDays size={18} strokeWidth={1.9} style={{ color: t.ink }} />
              </Link>

              {/* Mi acceso — mismo destino que la fila "Mis reservas" de más
                  abajo: es ahí (no un pase suelto sin clase que enseñar en
                  los otros cuatro casos de esta tarjeta) donde vive el pase
                  QR de verdad cuando el check-in lo requiere. */}
              <Link
                href={portalHref(`/${slug}/reservas`)}
                aria-label="Mi acceso"
                style={{
                  position: 'relative', width: 40, height: 40, flex: '0 0 40px',
                  borderRadius: '50%', border: `1px solid ${noche ? 'rgba(243,241,233,.14)' : 'rgba(34,38,31,.14)'}`,
                  background: t.surface, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: sombra.circulo, textDecoration: 'none',
                  transition: transicion(['transform']),
                }}
              >
                <Ticket size={18} strokeWidth={1.9} style={{ color: t.ink }} />
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
                vacío en las 7 columnas con "🔥 0 sem." sería ruido. */}
            {(tiraSemana.some(d => d.tieneClaseReservada) || (racha && racha.semanas > 0)) && (
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
            <h2 style={{ ...micro(10, 0.16, 600), color: t.muted2, textTransform: 'uppercase' } as React.CSSProperties}>
              Mi progreso
            </h2>
            <Link
              href={portalHref(`/${slug}/progreso`)}
              style={{
                marginTop: 10, display: 'block', textDecoration: 'none',
                background: t.surface, border: `1px solid ${t.line}`, borderRadius: radio.card,
                padding: '14px 16px', boxShadow: sombra.cardSemana,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ ...texto.metaFuerte, color: t.ink }}>Tu semana</span>
                <span style={{ ...micro(9.5, 0, 500), color: t.muted2 } as React.CSSProperties}>meta {META_PROGRESO_SEMANAL}/sem</span>
              </div>
              <div style={{ ...texto.meta, color: t.muted2, margin: '6px 0 8px' }}>
                <span style={{ ...texto.metaFuerte, color: t.ink }}>
                  {progresoSemanal} {progresoSemanal === 1 ? 'clase' : 'clases'}
                </span>{' '}
                esta semana
              </div>
              <div style={{ height: 5, borderRadius: 999, background: t.line, overflow: 'hidden' }}>
                <div style={{
                  width: `${Math.min(progresoSemanal, META_PROGRESO_SEMANAL) / META_PROGRESO_SEMANAL * 100}%`,
                  height: '100%', background: 'var(--portal-brand)', borderRadius: 999,
                  transition: transicion(['width'], dur.card),
                }} />
              </div>
            </Link>
          </>
        )}

        {!retosBloqueActivo && (
          <>
            <div style={{ height: 34 }} />
            <h2 style={{ ...micro(10, 0.16, 600), color: t.muted2, textTransform: 'uppercase' } as React.CSSProperties}>
              Retos
            </h2>
            <div style={{
              marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8,
              background: t.surface, border: `1px solid ${t.line}`, borderRadius: radio.card,
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
                      borderTop: i > 0 ? `1px solid ${t.line}` : undefined,
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ ...texto.metaFuerte, color: t.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {reto.label}
                      </div>
                      <div style={{ ...texto.nota, color: t.muted, marginTop: 2 }}>
                        {reto.dias} · {conteo > 0 ? `${conteo} apuntada${conteo === 1 ? '' : 's'}` : 'Sé la primera'}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void toggleReto(reto.key, apuntada ? 'desmarcar' : 'marcar')}
                      style={{
                        flex: '0 0 auto', height: 34, padding: '0 14px', borderRadius: 999, border: 'none', cursor: 'pointer',
                        background: apuntada ? t.surface2 : 'var(--portal-brand)',
                        color: apuntada ? t.ink : 'var(--portal-brand-foreground)',
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
                  <h2 style={{ ...display(escala('seccion', 30)), color: t.ink }}>{txt('estaSemana', 'titulo', 'Esta semana')}</h2>
                  <Link href={portalHref(`/${slug}/clases`)} style={{ ...micro(9.5, 0.2, 600), color: t.heroAccent, textDecoration: 'none' }}>
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
                        <span style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                          <span style={{ ...texto.nota, color: t.muted }}>{hora(s.inicio)} ·</span>
                          <AforoIndicator libres={libres} />
                        </span>
                      </Link>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          {/* Accesos rápidos — tres formas según el tema (lib/theme-variantes.ts).
              La rama 'filas' es la de SIEMPRE, literal: es lo que ve todo
              estudio sin tema, y no se refactoriza de paso. */}
          <div {...wrap('accesosRapidos')}>
            <div style={{ height: 40 }} />
            {/* El rótulo del estudio manda sobre el del tema; vacío en los dos
                = sin rótulo, que es lo que hacen las variantes que no lo llevan. */}
            {(txt('accesosRapidos', 'titulo') || rotuloAccesos(variantes.accesosRapidos)) && (
              <h2 style={{ ...display(escala('seccion', 24)), color: t.ink, marginBottom: 14 }}>
                {txt('accesosRapidos', 'titulo') || rotuloAccesos(variantes.accesosRapidos)}
              </h2>
            )}
            {variantes.accesosRapidos === 'filas' && filas.map((f, i) => (
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

            {/* Rejilla de baldosas (Oliva/Bloom) y círculos (Noir): misma
                estructura, distinto envoltorio — separarlas en dos ramas
                duplicaría el enlace y el punto de aviso sin ganar nada. */}
            {variantes.accesosRapidos !== 'filas' && (
              <div style={{
                display: 'flex', justifyContent: 'space-between',
                gap: variantes.accesosRapidos === 'circulos' ? 0 : 9,
              }}>
                {filas.map((f) => {
                  const Icono = ICONOS_ACCESO[f.icono] ?? Sparkles;
                  const enCirculo = variantes.accesosRapidos === 'circulos';
                  return (
                    <Link
                      key={f.href}
                      href={f.href}
                      aria-label={`${f.etiqueta}: ${f.valor}`}
                      style={{
                        position: 'relative', flex: 1, minWidth: 0, textDecoration: 'none',
                        textAlign: 'center', color: t.ink,
                        ...(enCirculo ? {} : {
                          height: 104, padding: '14px 8px',
                          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 9,
                          background: t.surface,
                          border: `var(--portal-card-border, 1px solid ${t.line})`,
                          boxShadow: 'var(--portal-card-shadow, none)',
                          borderRadius: `var(--portal-radius-acceso, ${radio.card}px)`,
                        }),
                      }}
                    >
                      <span style={enCirculo ? {
                        width: 58, height: 58, margin: '0 auto', borderRadius: '50%',
                        background: t.surface, border: `1px solid ${t.line}`,
                        display: 'grid', placeItems: 'center',
                      } : { display: 'grid', placeItems: 'center' }}>
                        <Icono size={enCirculo ? 20 : 18} strokeWidth={1.8} />
                      </span>
                      <span style={{ ...texto.valor, color: t.ink, display: 'block', marginTop: enCirculo ? 9 : 0, lineHeight: 1.3 }}>
                        {f.etiqueta}
                      </span>
                      {f.punto && (
                        <span aria-hidden style={{
                          position: 'absolute', top: enCirculo ? 0 : 10, right: enCirculo ? 10 : 10,
                          width: 7, height: 7, borderRadius: '50%', background: 'var(--portal-brand)',
                        }} />
                      )}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          {/* Invita a una amiga */}
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

          {/* Contenido editable del estudio (mensaje destacado + banners). Añadido
              DESPUÉS de "Invita a una amiga" a propósito: no toca ninguna pieza ya
              cerrada del diseño, y no aparece nada aquí para un estudio que no haya
              configurado contenido — misma pantalla de siempre. */}
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
                      // Sin foto por defecto a propósito (ver lib/imagenes-por-defecto.ts):
                      // es contenido que la propietaria decide subir, no un hueco a
                      // rellenar. Si la URL no carga, se oculta y queda el degradado +
                      // texto de abajo — no un icono de imagen rota (C3 de la auditoría
                      // de uso real, 2026-08-24).
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

          {/* Tira de los 7 días (tema "Oliva") — el día de hoy resaltado, con
              un punto si esa fecha tiene una clase CONFIRMADA. Oculto por
              defecto: solo lo ve quien instala Oliva o lo activa a mano. */}
          <div {...wrap('tiraSemana')}>
            <div style={{ height: 34 }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
              {tiraSemana.map((dia) => (
                <div key={dia.fecha.toDateString()} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                  <span style={{ ...micro(9, 0.18, 600), color: t.micro }}>
                    {['L', 'M', 'X', 'J', 'V', 'S', 'D'][dia.indiceSemana]}
                  </span>
                  <span style={{
                    width: 34, height: 34, borderRadius: `var(--portal-radius-chip, ${radio.pill}px)`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: dia.esHoy ? 'var(--portal-brand)' : 'transparent',
                    border: dia.esHoy ? 'none' : `1px solid ${t.line}`,
                    ...texto.metaFuerte, color: dia.esHoy ? 'var(--portal-brand-foreground)' : t.ink,
                  }}>
                    {dia.fecha.getDate()}
                  </span>
                  <span aria-hidden style={{
                    width: 5, height: 5, borderRadius: '50%',
                    background: dia.tieneClaseReservada ? 'var(--portal-brand)' : 'transparent',
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
              background: t.surface, border: `1px solid ${t.line}`, borderRadius: radio.card,
              padding: '14px 16px', boxShadow: sombra.cardSemana,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ ...texto.metaFuerte, color: t.ink }}>{txt('progresoSemanal', 'titulo', 'Tu semana')}</span>
                <span style={{ ...micro(9.5, 0, 500), color: t.muted2 } as React.CSSProperties}>meta {META_PROGRESO_SEMANAL}/sem</span>
              </div>
              <div style={{ ...texto.meta, color: t.muted2, margin: '6px 0 8px' }}>
                <span style={{ ...texto.metaFuerte, color: t.ink }}>
                  {progresoSemanal} {progresoSemanal === 1 ? 'clase' : 'clases'}
                </span>{' '}
                esta semana
              </div>
              <div style={{ height: 5, borderRadius: 999, background: t.line, overflow: 'hidden' }}>
                <div style={{
                  width: `${Math.min(progresoSemanal, META_PROGRESO_SEMANAL) / META_PROGRESO_SEMANAL * 100}%`,
                  height: '100%', background: 'var(--portal-brand)', borderRadius: 999,
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
            <h2 style={{ ...display(escala('seccion', 30)), color: t.ink }}>{txt('retos', 'titulo', 'Retos')}</h2>
            <div style={{ display: 'flex', gap: 12, overflowX: 'auto', margin: '0 -24px', padding: '18px 24px 8px', scrollbarWidth: 'none' } as React.CSSProperties}>
              {RETOS_PORTAL.map((reto) => {
                const apuntada = retosApuntados.includes(reto.key);
                const conteo = retoConteos[reto.key] ?? 0;
                // Variante 'color' (Bloom): fondo propio por reto y tinta fija
                // oscura — con un fondo claro constante, `t.ink` en modo noche
                // sería casi blanco encima y quedaría ilegible.
                const conColor = variantes.retos === 'color';
                const tinta = conColor ? reto.tinta : t.ink;
                // `imagenCore`/`imagenCara`: campo del bloque, no del tema —
                // es contenido del estudio, y cada estudio sube el suyo.
                const fotoReto = txt('retos', reto.key === 'core' ? 'imagenCore' : 'imagenCara');
                return (
                  <div
                    key={reto.key}
                    style={{
                      flex: conColor ? '0 0 218px' : '0 0 200px',
                      borderRadius: conColor ? 26 : radio.card,
                      background: conColor ? reto.fondo : t.surface,
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
                        background: conColor ? 'rgba(255,255,255,.75)' : t.surface2,
                        color: conColor ? tinta : t.muted,
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
                      <p style={{ ...texto.meta, color: conColor ? tinta : t.muted2, opacity: conColor ? 0.75 : 1, margin: 0 }}>
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
                          : (apuntada ? t.surface2 : 'var(--portal-brand)'),
                        color: conColor
                          ? (apuntada ? tinta : reto.fondo)
                          : (apuntada ? t.ink : 'var(--portal-brand-foreground)'),
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
              <p style={{ ...micro(10, 0.16, 600), color: t.muted2, textTransform: 'uppercase' } as React.CSSProperties}>Últimas plazas</p>
              <h2 style={{ ...display(escala('seccion', 30)), color: t.ink }}>Huecos de hoy</h2>
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
              <p style={{ ...micro(10, 0.16, 600), color: t.muted2, textTransform: 'uppercase' } as React.CSSProperties}>Tablón</p>
              <h2 style={{ ...display(escala('seccion', 30)), color: t.ink }}>Novedades del estudio</h2>
            </div>
            <div style={{ padding: '0 24px', display: 'flex', flexDirection: 'column', gap: 8 }}>
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
