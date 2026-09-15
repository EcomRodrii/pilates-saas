'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useRol } from '@/lib/permisos';
import { Toast, useToast, type MostrarToast } from '@/components/ui/toast';
import { PanelSkeleton } from '@/components/ui/panel-skeleton';
import { PageHeader } from '@/components/ui/page-header';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { hrefDeLugar, resolverDestino, resolverHref, seccionesVisibles } from '@/lib/configuracion/destino';
import {
  esTarjetaId, herramientaPorId, herramientaVisible, seccionPorId, tarjetaVisible,
  type HerramientaId, type SeccionId, type TarjetaId,
} from '@/lib/configuracion/secciones';
import { ContextoNavegacionConfig, type NavegacionConfig } from './contexto';
import { ListaSecciones } from './lista-secciones';
import { CabeceraSeccion } from './cabecera-seccion';
import { CabeceraHerramienta } from './cabecera-herramienta';
import { idFilaHerramienta } from './fila-herramienta';
import { InicioConfiguracion } from './inicio-configuracion';
import { escucharEnlacesAConfiguracion } from './ir-a-configuracion';

// ─────────────────────────────────────────────────────────────────────────────
// Configuración por preguntas.
//
// Antes: doce pestañas en fila (27 px de alto, a dos filas en el iPad, cortadas
// en el móvil sin nada que dijera que había más) y dentro sub-pestañas y
// «Opciones avanzadas». Ahora:
//
//   · `/configuracion` sin sección es el INICIO, en todas las anchuras
//     (inicio-configuracion.tsx): cómo está el estudio, qué hay que revisar y
//     cada sección con su valor de hoy. Tocar una fila abre la sección con
//     `pushState`, para que el atrás del navegador —o el gesto del teléfono—
//     vuelva al inicio con el foco en esa fila.
//     Hasta el 15-sep, a partir de 768 px no había inicio: se abría la primera
//     sección y la propietaria caía en el formulario de datos sin ver nada.
//   · móvil (<768): el inicio o la sección, a pantalla completa y con flecha de
//     volver.
//   · 768 en adelante: la columna de la izquierda (el inicio y las secciones)
//     y a la derecha lo que esté abierto. Saltar de una a otra en la columna es
//     `replaceState`: no llena el historial. (Por qué la API nativa y no el
//     router: ver `irA`.)
//   · una HERRAMIENTA grande (`?tab=web&abrir=widgets`: widgets, correos, tipos
//     de clase, salas, contenido de tu app, recompensas y logros) se abre desde
//     la fila de su sección a pantalla propia y a todo el ancho, sin la columna,
//     con «volver» a su sección. Volver —con el botón o con el atrás— deja el
//     foco en su fila. Pintadas dentro de la sección, «Mi app y mi web» medía
//     diez pantallas de móvil.
//
// Lo que cambia con la anchura se decide con CSS (`data-vista`, `md:`), nunca
// con matchMedia: girar el iPad no desmonta nada ni pierde lo que se estaba
// escribiendo.
// ─────────────────────────────────────────────────────────────────────────────

type PropsSeccion = { showToast: MostrarToast };

// Una sección se ve cada vez: cada una en su propio trozo de JS, que solo se
// descarga al abrirla.
const cargando = () => <PanelSkeleton />;
const COMPONENTES: Record<SeccionId, ComponentType<PropsSeccion>> = {
  estudio: dynamic(() => import('@/components/configuracion/secciones/seccion-estudio').then(m => m.SeccionEstudio), { loading: cargando }),
  clases: dynamic(() => import('@/components/configuracion/secciones/seccion-clases').then(m => m.SeccionClases), { loading: cargando }),
  reservas: dynamic(() => import('@/components/configuracion/secciones/seccion-reservas').then(m => m.SeccionReservas), { loading: cargando }),
  cobros: dynamic(() => import('@/components/configuracion/secciones/seccion-cobros').then(m => m.SeccionCobros), { loading: cargando }),
  altas: dynamic(() => import('@/components/configuracion/secciones/seccion-altas').then(m => m.SeccionAltas), { loading: cargando }),
  comunicacion: dynamic(() => import('@/components/configuracion/secciones/seccion-comunicacion').then(m => m.SeccionComunicacion), { loading: cargando }),
  equipo: dynamic(() => import('@/components/configuracion/secciones/seccion-equipo').then(m => m.SeccionEquipo), { loading: cargando }),
  marca: dynamic(() => import('@/components/configuracion/secciones/seccion-marca').then(m => m.SeccionMarca), { loading: cargando }),
  web: dynamic(() => import('@/components/configuracion/secciones/seccion-web').then(m => m.SeccionWeb), { loading: cargando }),
  motivacion: dynamic(() => import('@/components/configuracion/secciones/seccion-motivacion').then(m => m.SeccionMotivacion), { loading: cargando }),
  conexiones: dynamic(() => import('@/components/configuracion/secciones/seccion-conexiones').then(m => m.SeccionConexiones), { loading: cargando }),
  datos: dynamic(() => import('@/components/configuracion/secciones/seccion-datos').then(m => m.SeccionDatos), { loading: cargando }),
  avisos: dynamic(() => import('@/components/configuracion/secciones/seccion-avisos').then(m => m.SeccionAvisos), { loading: cargando }),
  panel: dynamic(() => import('@/components/configuracion/secciones/seccion-panel').then(m => m.SeccionPanel), { loading: cargando }),
};

// Y cada herramienta, en el suyo: el constructor de widgets no se descarga al
// abrir «Mi app y mi web», solo al abrirlo a él.
const COMPONENTES_HERRAMIENTA: Record<HerramientaId, ComponentType<PropsSeccion>> = {
  salas: dynamic(() => import('@/components/configuracion/herramientas/herramienta-salas').then(m => m.HerramientaSalas), { loading: cargando }),
  'tipos-de-clase': dynamic(() => import('@/components/configuracion/herramientas/herramienta-tipos-de-clase').then(m => m.HerramientaTiposDeClase), { loading: cargando }),
  'correos-automaticos': dynamic(() => import('@/components/configuracion/herramientas/herramienta-correos-automaticos').then(m => m.HerramientaCorreosAutomaticos), { loading: cargando }),
  'recompensas-y-logros': dynamic(() => import('@/components/configuracion/herramientas/herramienta-recompensas-y-logros').then(m => m.HerramientaRecompensasYLogros), { loading: cargando }),
  'contenido-de-tu-app': dynamic(() => import('@/components/configuracion/herramientas/herramienta-contenido-de-tu-app').then(m => m.HerramientaContenidoDeTuApp), { loading: cargando }),
  widgets: dynamic(() => import('@/components/configuracion/herramientas/herramienta-widgets').then(m => m.HerramientaWidgets), { loading: cargando }),
};

type Lugar = { tab: SeccionId | null; abrir?: HerramientaId; ancla?: string };

// Lo que está abierto. `vista` cambia en cada navegación, para que el ancla se
// busque otra vez aunque sea la misma.
type Abierto = Lugar & { vista: number };

/**
 * Lo que de verdad se abre al pedir `tab` con esas opciones: un ancla de una
 * tarjeta que vive en una herramienta (`#canjes`, desde el buscador) abre la
 * herramienta. La misma regla que los enlaces (lib/configuracion/destino.ts).
 */
function lugarDe(tab: SeccionId | null, opciones: { ancla?: string; abrir?: HerramientaId } = {}): Lugar {
  if (!tab) return { tab: null };
  const destino = resolverDestino({ tab, hash: opciones.ancla ?? null, params: opciones.abrir ? { abrir: opciones.abrir } : {} });
  return 'redirect' in destino ? { tab } : destino;
}

export function ConfigShell() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rol = useRol();
  const { message: toastMsg, variant: toastVariant, show, showError, dismiss: dismissToast } = useToast();
  // Auditoría 15-sep (C-4): las secciones ya podían avisar de un fallo, pero el
  // toast no distinguía color/aria de un éxito — este wrapper es lo único que
  // hace falta para que `{ variant: 'error' }` se vea de verdad como error.
  const showToast: MostrarToast = useCallback(
    (mensaje, opciones) => { if (opciones?.variant === 'error') showError(mensaje); else show(mensaje); },
    [show, showError],
  );
  // `null` hasta leer la URL: pintar antes una sección y cambiarla un render
  // después era un parpadeo en cada enlace.
  const [abierto, setAbierto] = useState<Abierto | null>(null);
  // Lo escrito en el buscador del inicio. Vive aquí y no en el inicio, que se
  // desmonta al abrir una sección: volver tiene que encontrar los mismos
  // resultados, y el foco, el enlace que se pulsó.
  const [consulta, setConsulta] = useState('');

  // Lo abierto, para quien lo lee fuera del render (navegar, marcar cambios).
  // En `useLayoutEffect`: corre antes que los `useEffect` de los hijos, que son
  // los que marcan cambios sin guardar.
  const abiertoRef = useRef<Abierto | null>(null);
  useLayoutEffect(() => { abiertoRef.current = abierto; }, [abierto]);

  // ⚠️ #2008: tras cambiar la URL, `useSearchParams()` no se entera en el mismo
  // render. Si la sección se derivara de él, cada clic volvería un instante a la
  // URL de antes. Así que la URL se lee solo cuando cambia por algo que NO ha
  // escrito esta página: `escritas` guarda lo que se pidió con push/replace y
  // `urlVista` lo último que se sabe que hay en la barra.
  const escritas = useRef<string[]>([]);
  const urlVista = useRef<string | null>(null);

  // Foco: el enlace del inicio que abrió la sección (a él se vuelve), si hay
  // que llevar el foco al título, y cuántos `push` van desde el inicio.
  const filaOrigen = useRef<string | null>(null);
  const enfocarTitulo = useRef(false);
  const pushesDesdeLista = useRef(0);
  // ¿La herramienta abierta se abrió con `push` desde la fila de su sección? Entonces
  // «volver» es el atrás de siempre; si se llegó por un enlace, se sustituye.
  const herramientaPorPush = useRef(false);
  const tituloRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const query = searchParams.toString();
    if (query === urlVista.current) return;
    urlVista.current = query;
    const pos = escritas.current.indexOf(query);
    if (pos !== -1) {
      // Es la nuestra (o una intermedia de dos clics seguidos): el estado ya va
      // por delante.
      escritas.current.splice(0, pos + 1);
      return;
    }
    escritas.current = [];
    herramientaPorPush.current = false;
    const destino = resolverDestino({
      tab: searchParams.get('tab'),
      sub: searchParams.get('sub'),
      hash: window.location.hash,
      params: new URLSearchParams(query),
    });
    if ('redirect' in destino) {
      router.replace(destino.redirect);
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Sincroniza con un sistema externo (la barra de direcciones) solo cuando cambia desde fuera; ver el comentario de `escritas`.
    setAbierto(prev => {
      // Mismo sitio que ya está abierto (p. ej. Conexiones limpiando el
      // `?stripe_connected=1` de la URL): no se toca nada.
      if (prev && prev.tab === destino.tab && prev.abrir === destino.abrir && !destino.ancla) return prev;
      return { tab: destino.tab, abrir: destino.abrir, ancla: destino.ancla, vista: (prev?.vista ?? 0) + 1 };
    });
  }, [searchParams, router]);

  const irA = useCallback<NavegacionConfig['irA']>((tabPedida, { ancla: anclaPedida, abrir: abrirPedida, modo = 'replace', origen } = {}) => {
    const { tab, abrir, ancla } = lugarDe(tabPedida, { ancla: anclaPedida, abrir: abrirPedida });
    if (origen) filaOrigen.current = origen;
    const antes = abiertoRef.current;
    herramientaPorPush.current = !!(abrir && modo === 'push' && antes?.tab === tab && !antes?.abrir);
    if (tab && modo === 'push') {
      // Abrir una herramienta desde su sección no aleja del inicio: el atrás
      // vuelve primero a la sección.
      if (!herramientaPorPush.current) pushesDesdeLista.current += 1;
      enfocarTitulo.current = !ancla;
    }
    setAbierto(prev => ({ tab, abrir, ancla, vista: (prev?.vista ?? 0) + 1 }));
    // La URL dice lo que se ve, para que recargar, volver o compartir el enlace
    // abra lo mismo.
    const query = tab ? `tab=${tab}${abrir ? `&abrir=${abrir}` : ''}` : '';
    if (query === urlVista.current) {
      // Misma sección: solo cambia el ancla, y eso no pasa por `useSearchParams`.
      if (!ancla) return;
    } else {
      escritas.current.push(query);
    }
    const href = tab ? hrefDeLugar({ tab, abrir, ancla }) : '/configuracion';
    // ⚠️ La API nativa del historial, NO `router.push/replace`. En el build de
    // producción, Next 16 guarda al cargar la ruta `/configuracion` con la URL de
    // llegada como canónica (`?tab=altas`), y una navegación posterior a la misma
    // ruta reutiliza esa entrada: el router escribía `?tab=altas` otra vez y la
    // lista se veía con la sección en la barra (CI, #2030; en `next dev` no pasa).
    // Aquí no hay nada que pedir al servidor —es la misma página—, y Next
    // sincroniza `useSearchParams` con `pushState`/`replaceState` (docs:
    // «Linking and Navigating», native History API). Tampoco remonta la página,
    // que con el router sí ocurría al cambiar los parámetros.
    if (modo === 'push') window.history.pushState(null, '', href);
    else window.history.replaceState(null, '', href);
  }, []);

  // ── Salir con cambios sin guardar ──────────────────────────────────────────
  // Cada barra de guardar con cambios deja aquí su sección
  // (shell/barra-guardar.tsx), y un editor de una herramienta con cambios, la
  // suya (el de un correo). Cambiar a OTRA sección o herramienta, volver al
  // inicio o irse a otra pantalla del panel pregunta antes; recargar o cerrar la
  // pestaña lo pregunta el navegador (`beforeunload`, en la barra o el editor).
  // ⚠️ El gesto de atrás del teléfono (popstate) no se puede frenar sin tocar el
  // historial a mano, y eso rompería la vuelta al inicio: ese no pregunta.
  const sinGuardar = useRef(new Map<number, { seccion: SeccionId; abrir: HerramientaId | null }>());
  const ultimaMarca = useRef(0);
  const [salida, setSalida] = useState<{ titulo: string; ir: () => void } | null>(null);

  const marcarSinGuardar = useCallback((seccion: SeccionId) => {
    const marca = ++ultimaMarca.current;
    // Lo que se ve al marcar: la sección, o la herramienta suya que está abierta.
    const abrir = abiertoRef.current?.tab === seccion ? abiertoRef.current.abrir ?? null : null;
    sinGuardar.current.set(marca, { seccion, abrir });
    return () => { sinGuardar.current.delete(marca); };
  }, []);

  /** El nombre de lo que tiene cambios que se perderían yendo a `destino` (`null` = fuera de Configuración). */
  const cambiosQueSePierden = useCallback((destino: SeccionId | null, abrir: HerramientaId | null = null) => {
    for (const m of sinGuardar.current.values()) {
      if (m.seccion !== destino || m.abrir !== abrir) {
        return m.abrir ? herramientaPorId(m.abrir).titulo : seccionPorId(m.seccion).titulo;
      }
    }
    return null;
  }, []);

  const irAPreguntando = useCallback<NavegacionConfig['irA']>((destino, opciones) => {
    const lugar = lugarDe(destino, opciones);
    const pendiente = cambiosQueSePierden(lugar.tab, lugar.abrir ?? null);
    if (pendiente) {
      setSalida({ titulo: pendiente, ir: () => irA(destino, opciones) });
      return;
    }
    irA(destino, opciones);
  }, [irA, cambiosQueSePierden]);

  // Un enlace a Configuración que no pinta el shell (la barra superior, ⌘K, un
  // aviso, el menú) mientras estás aquí: se abre con `irA`, como los suyos. Con
  // el router, en producción la dirección se quedaba en la sección de llegada
  // (#2030; ver ir-a-configuracion.ts).
  const irAHref = useCallback((href: string, preguntar: boolean) => {
    const destino = resolverHref(href);
    if ('redirect' in destino) {
      router.push(destino.redirect);
      return;
    }
    (preguntar ? irAPreguntando : irA)(destino.tab, { ancla: destino.ancla, abrir: destino.abrir, modo: 'push' });
  }, [irA, irAPreguntando, router]);

  useEffect(() => escucharEnlacesAConfiguracion(href => irAHref(href, true)), [irAHref]);

  // Un enlace a otra pantalla (el menú, «Mi cuenta», un enlace dentro de una
  // tarjeta, la fila de una herramienta): se para antes de que Next navegue. En
  // captura, para llegar antes que el `onClick` del propio enlace.
  useEffect(() => {
    function alPulsar(e: MouseEvent) {
      if (sinGuardar.current.size === 0) return;
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const enlace = e.target instanceof Element ? e.target.closest<HTMLAnchorElement>('a[href]') : null;
      if (!enlace || (enlace.target && enlace.target !== '_self') || enlace.hasAttribute('download')) return;
      const url = new URL(enlace.href, window.location.href);
      // A otra web: lo pregunta el navegador.
      if (url.origin !== window.location.origin) return;
      // Mismo sitio, como mucho otro `#ancla`: no se pierde nada.
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      // Las filas de secciones van por `irA`, que ya pregunta. «Mi cuenta», en la
      // misma lista, es otra pantalla: esa sí se para aquí.
      if (url.pathname === window.location.pathname && enlace.closest('nav[aria-label="Secciones de Configuración"]')) return;
      const pendiente = cambiosQueSePierden(null);
      if (!pendiente) return;
      e.preventDefault();
      e.stopPropagation();
      const ruta = `${url.pathname}${url.search}${url.hash}`;
      // A otra sección de aquí mismo (la barra superior, el menú): por el shell,
      // nunca por el router (#2030). A otra pantalla, navegación normal.
      const ir = url.pathname === window.location.pathname ? () => irAHref(ruta, false) : () => router.push(ruta);
      setSalida({ titulo: pendiente, ir });
    }
    document.addEventListener('click', alPulsar, true);
    return () => document.removeEventListener('click', alPulsar, true);
  }, [router, cambiosQueSePierden, irAHref]);

  const tab = abierto?.tab ?? null;
  const vista = abierto?.vista;
  const abrirAbierto = abierto?.abrir ?? null;
  // El ancla de una tarjeta que este rol no ve se cae: la sección se abre igual,
  // pero sin bajar a un sitio donde no hay nada suyo (la gerencia con
  // `#contacto`). Lo que no es una tarjeta —`#ajuste-…`— pasa tal cual.
  const anclaPedida = abierto?.ancla;
  const ancla = anclaPedida && (!esTarjetaId(anclaPedida) || tarjetaVisible(anclaPedida as TarjetaId, rol))
    ? anclaPedida
    : undefined;

  const nav = useMemo<NavegacionConfig>(() => ({
    irA: irAPreguntando,
    marcarSinGuardar,
    anclaAbierta: ancla ? { id: ancla, vista: vista ?? 0 } : null,
  }), [irAPreguntando, marcarSinGuardar, ancla, vista]);

  // De vuelta en el inicio: el foco, al enlace que abrió la sección.
  useEffect(() => {
    if (tab) return;
    pushesDesdeLista.current = 0;
    const fila = filaOrigen.current;
    if (!fila) return;
    filaOrigen.current = null;
    requestAnimationFrame(() => document.getElementById(fila)?.focus());
  }, [tab]);

  // De vuelta de una herramienta a su sección —con «volver» o con el atrás—: el
  // foco, a su fila. La sección se descarga aparte, así que se espera a que la
  // fila exista.
  const herramientaVista = useRef<HerramientaId | null>(null);
  useEffect(() => {
    if (abrirAbierto) {
      herramientaVista.current = abrirAbierto;
      return;
    }
    const cerrada = herramientaVista.current;
    herramientaVista.current = null;
    if (!cerrada || !tab || herramientaPorId(cerrada).seccion !== tab) return;
    let intentos = 0;
    const id = window.setInterval(() => {
      const fila = document.getElementById(idFilaHerramienta(cerrada));
      if (!fila) {
        if (++intentos > 100) window.clearInterval(id);
        return;
      }
      window.clearInterval(id);
      fila.scrollIntoView({ block: 'center' });
      fila.focus({ preventScroll: true });
    }, 50);
    return () => window.clearInterval(id);
  }, [tab, abrirAbierto]);

  // Sección o herramienta abierta desde una fila: arriba del todo y el foco en
  // su título, para que un lector de pantalla diga dónde ha llegado.
  useEffect(() => {
    if (!tab || !enfocarTitulo.current) return;
    enfocarTitulo.current = false;
    window.scrollTo({ top: 0 });
    tituloRef.current?.focus({ preventScroll: true });
  }, [tab, vista]);

  // El ancla (`#datos-fiscales`) apunta a algo que aún no existe al llegar: la
  // sección se descarga aparte y pinta un esqueleto hasta tener los datos. Se
  // espera a que aparezca, se baja una vez y se deja de mirar.
  useEffect(() => {
    if (!ancla) return;
    let intentos = 0;
    const id = window.setInterval(() => {
      const el = document.getElementById(ancla);
      if (!el) {
        if (++intentos > 100) window.clearInterval(id);
        return;
      }
      // Un ajuste dentro de un desplegable cerrado («Opciones avanzadas»): se
      // abre antes, o el enlace llevaría a algo invisible.
      for (let d = el.parentElement?.closest('details'); d; d = d.parentElement?.closest('details')) d.open = true;
      const titulo = document.getElementById(`${ancla}-titulo`);
      // Una tarjeta: su título arriba y con el foco. Un ajuste suelto
      // (`#ajuste-avisar-alumnas`): centrado y con el foco en su control.
      if (titulo && !ancla.startsWith('ajuste-')) {
        el.scrollIntoView({ block: 'start' });
        titulo.focus({ preventScroll: true });
        window.clearInterval(id);
        return;
      }
      const control = el.matches('input, select, textarea, button')
        ? el as HTMLInputElement
        : el.querySelector<HTMLInputElement>('input, select, textarea, button');
      // Mientras sus datos cargan el control está deshabilitado y no admite
      // foco: se espera un poco antes de darlo por perdido.
      if (control?.disabled && ++intentos <= 100) return;
      el.scrollIntoView({ block: 'center' });
      control?.focus({ preventScroll: true });
      window.clearInterval(id);
    }, 100);
    return () => window.clearInterval(id);
  }, [ancla, vista]);

  if (!abierto) return null;

  const visibles = seccionesVisibles(rol);
  const permitida = tab !== null && visibles.some(s => s.id === tab);
  // Sin sección en la URL (o con una que este rol no abre): el inicio.
  const mostrada = permitida ? tab : null;
  const Seccion = mostrada ? COMPONENTES[mostrada] : null;
  // Una herramienta solo se abre dentro de su propia sección, y solo si este rol
  // ve alguna de sus tarjetas.
  const herramienta = mostrada && abrirAbierto
    && herramientaPorId(abrirAbierto).seccion === mostrada
    && herramientaVisible(abrirAbierto, rol)
    ? abrirAbierto
    : null;
  const Herramienta = herramienta ? COMPONENTES_HERRAMIENTA[herramienta] : null;

  function volver() {
    // De una herramienta se vuelve a su sección; de una sección, al inicio.
    const pendiente = cambiosQueSePierden(herramienta ? mostrada : null);
    if (pendiente) {
      setSalida({ titulo: pendiente, ir: volverSinPreguntar });
      return;
    }
    volverSinPreguntar();
  }

  function volverSinPreguntar() {
    if (herramienta && mostrada) {
      // Abierta desde su fila: el atrás de siempre. Por un enlace: su sección
      // sustituye a la herramienta en el historial.
      if (herramientaPorPush.current) {
        router.back();
        return;
      }
      irA(mostrada, { modo: 'replace' });
      return;
    }
    // Si se llegó desde el inicio con un solo paso, «volver» es el atrás de
    // siempre y el historial queda como estaba. Si se llegó por un enlace
    // (una notificación, otra sección), se sustituye por el inicio.
    //
    // ⚠️ Con el atrás, el inicio NO se pinta antes de que la URL cambie: si se
    // pintara al momento, un segundo toque rápido en otra fila hacía su `push`
    // con el atrás aún en vuelo y el historial se descolocaba (medido en e2e:
    // acababa fuera del panel). La vuelta la aplica el efecto de la URL.
    if (pushesDesdeLista.current === 1) {
      router.back();
      return;
    }
    irA(null, { modo: 'replace' });
  }

  return (
    <ContextoNavegacionConfig.Provider value={nav}>
      {/* `config-tactil`: el tamaño mínimo de lo que se pulsa con el dedo (globals.css). */}
      <div
        data-tour="configuracion-vista"
        data-vista={herramienta ? 'herramienta' : permitida ? 'detalle' : 'inicio'}
        className="group/config config-tactil space-y-6"
      >
        <PageHeader
          title="Configuración"
          description="Cómo está tu estudio y dónde se cambia cada cosa."
          className="max-md:group-data-[vista=detalle]/config:sr-only max-md:group-data-[vista=herramienta]/config:sr-only"
        />

        {tab !== null && !permitida && (
          <p role="status" className="rounded-xl border border-border bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
            Esta parte la gestiona la propietaria.
          </p>
        )}

        {/* Una herramienta va a todo el ancho: sin la columna de secciones. */}
        <div className={cn(!herramienta && 'md:grid md:grid-cols-[13rem_minmax(0,1fr)] md:items-start md:gap-6')}>
          {!herramienta && (
            <div className="hidden md:sticky md:top-14 md:block md:max-h-[calc(100dvh-8rem)] md:self-start md:overflow-y-auto lg:top-[calc(var(--panel-sticky-top,0px)+4rem)]">
              <ListaSecciones secciones={visibles} rol={rol} activa={mostrada} onElegir={id => irAPreguntando(id)} />
            </div>
          )}

          <div className="@container/config min-w-0">
            {herramienta && Herramienta && mostrada ? (
              <section
                key={`herramienta-${herramienta}`}
                aria-labelledby="herramienta-titulo"
                className="tab-content-in space-y-5 [&_:is(input,select,textarea)]:scroll-mb-48"
              >
                <CabeceraHerramienta
                  herramienta={herramientaPorId(herramienta)}
                  seccion={seccionPorId(mostrada)}
                  tituloRef={tituloRef}
                  onVolver={volver}
                />
                <Herramienta showToast={showToast} />
              </section>
            ) : mostrada && Seccion ? (
              <section
                key={mostrada}
                aria-labelledby="seccion-titulo"
                // scroll-mb-48 (192 px): al enfocar un campo, el navegador lo sube
                // por encima de la barra de guardar Y de la navegación del móvil.
                // Con 40 (160 px) no llegaba: medido a 375 px, la barra de las
                // reglas de reserva baja a dos líneas y tapaba un píxel del campo.
                className="tab-content-in space-y-5 [&_:is(input,select,textarea)]:scroll-mb-48"
              >
                <CabeceraSeccion seccion={seccionPorId(mostrada)} tituloRef={tituloRef} onVolver={volver} />
                <Seccion showToast={showToast} />
              </section>
            ) : visibles.length > 0 && (
              <InicioConfiguracion
                secciones={visibles}
                rol={rol}
                consulta={consulta}
                onConsulta={setConsulta}
                onAbrir={(id, { ancla: tarjeta, abrir, origen }) => irAPreguntando(id, { ancla: tarjeta, abrir, modo: 'push', origen })}
              />
            )}
          </div>
        </div>

        {toastMsg && <Toast message={toastMsg} variant={toastVariant} onDismiss={dismissToast} />}

        <ConfirmDialog
          open={salida !== null}
          onOpenChange={abiertoDialogo => { if (!abiertoDialogo) setSalida(null); }}
          titulo="¿Salir sin guardar?"
          descripcion={salida ? `Los cambios de «${salida.titulo}» se perderán.` : undefined}
          textoConfirmar="Salir sin guardar"
          textoCancelar="Seguir editando"
          destructivo
          onConfirm={() => salida?.ir()}
        />
      </div>
    </ContextoNavegacionConfig.Provider>
  );
}
