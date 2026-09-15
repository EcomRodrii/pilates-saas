'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import { useRol } from '@/lib/permisos';
import { Toast, useToast } from '@/components/ui/toast';
import { PanelSkeleton } from '@/components/ui/panel-skeleton';
import { PageHeader } from '@/components/ui/page-header';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { hrefDeSeccion, resolverDestino, resolverHref, seccionesVisibles } from '@/lib/configuracion/destino';
import { seccionPorId, type SeccionId } from '@/lib/configuracion/secciones';
import { ContextoNavegacionConfig, type NavegacionConfig } from './contexto';
import { ListaSecciones } from './lista-secciones';
import { CabeceraSeccion } from './cabecera-seccion';
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
//
// Lo que cambia con la anchura se decide con CSS (`data-vista`, `md:`), nunca
// con matchMedia: girar el iPad no desmonta nada ni pierde lo que se estaba
// escribiendo.
// ─────────────────────────────────────────────────────────────────────────────

type PropsSeccion = { showToast: (m: string) => void };

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

// Lo que está abierto. `vista` cambia en cada navegación, para que el ancla se
// busque otra vez aunque sea la misma.
type Abierto = { tab: SeccionId | null; ancla?: string; vista: number };

export function ConfigShell() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rol = useRol();
  const { message: toastMsg, show: showToast, dismiss: dismissToast } = useToast();
  // `null` hasta leer la URL: pintar antes una sección y cambiarla un render
  // después era un parpadeo en cada enlace.
  const [abierto, setAbierto] = useState<Abierto | null>(null);
  // Lo escrito en el buscador del inicio. Vive aquí y no en el inicio, que se
  // desmonta al abrir una sección: volver tiene que encontrar los mismos
  // resultados, y el foco, el enlace que se pulsó.
  const [consulta, setConsulta] = useState('');

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
      if (prev && prev.tab === destino.tab && !destino.ancla) return prev;
      return { tab: destino.tab, ancla: destino.ancla, vista: (prev?.vista ?? 0) + 1 };
    });
  }, [searchParams, router]);

  const irA = useCallback<NavegacionConfig['irA']>((tab, { ancla, modo = 'replace', origen } = {}) => {
    if (origen) filaOrigen.current = origen;
    if (tab && modo === 'push') {
      pushesDesdeLista.current += 1;
      enfocarTitulo.current = !ancla;
    }
    setAbierto(prev => ({ tab, ancla, vista: (prev?.vista ?? 0) + 1 }));
    // La URL dice lo que se ve, para que recargar, volver o compartir el enlace
    // abra lo mismo.
    const query = tab ? `tab=${tab}` : '';
    if (query === urlVista.current) {
      // Misma sección: solo cambia el ancla, y eso no pasa por `useSearchParams`.
      if (!ancla) return;
    } else {
      escritas.current.push(query);
    }
    const href = tab ? hrefDeSeccion(tab, ancla) : '/configuracion';
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
  // (shell/barra-guardar.tsx). Cambiar a OTRA sección, volver al inicio o irse
  // a otra pantalla del panel pregunta antes; recargar o cerrar la pestaña lo
  // pregunta el navegador (`beforeunload`, en la propia barra).
  // ⚠️ El gesto de atrás del teléfono (popstate) no se puede frenar sin tocar el
  // historial a mano, y eso rompería la vuelta al inicio: ese no pregunta.
  const sinGuardar = useRef(new Map<number, SeccionId>());
  const ultimaMarca = useRef(0);
  const [salida, setSalida] = useState<{ seccion: SeccionId; ir: () => void } | null>(null);

  const marcarSinGuardar = useCallback((seccion: SeccionId) => {
    const marca = ++ultimaMarca.current;
    sinGuardar.current.set(marca, seccion);
    return () => { sinGuardar.current.delete(marca); };
  }, []);

  /** La sección con cambios que se perderían yendo a `destino` (`null` = fuera de ella). */
  const seccionQueSePierde = useCallback((destino: SeccionId | null) => {
    for (const s of sinGuardar.current.values()) if (s !== destino) return s;
    return null;
  }, []);

  const irAPreguntando = useCallback<NavegacionConfig['irA']>((destino, opciones) => {
    const pendiente = seccionQueSePierde(destino);
    if (pendiente) {
      setSalida({ seccion: pendiente, ir: () => irA(destino, opciones) });
      return;
    }
    irA(destino, opciones);
  }, [irA, seccionQueSePierde]);

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
    (preguntar ? irAPreguntando : irA)(destino.tab, { ancla: destino.ancla, modo: 'push' });
  }, [irA, irAPreguntando, router]);

  useEffect(() => escucharEnlacesAConfiguracion(href => irAHref(href, true)), [irAHref]);

  // Un enlace a otra pantalla (el menú, «Mi cuenta», un enlace dentro de una
  // tarjeta): se para antes de que Next navegue. En captura, para llegar antes
  // que el `onClick` del propio enlace.
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
      const pendiente = seccionQueSePierde(null);
      if (!pendiente) return;
      e.preventDefault();
      e.stopPropagation();
      const ruta = `${url.pathname}${url.search}${url.hash}`;
      // A otra sección de aquí mismo (la barra superior, el menú): por el shell,
      // nunca por el router (#2030). A otra pantalla, navegación normal.
      const ir = url.pathname === window.location.pathname ? () => irAHref(ruta, false) : () => router.push(ruta);
      setSalida({ seccion: pendiente, ir });
    }
    document.addEventListener('click', alPulsar, true);
    return () => document.removeEventListener('click', alPulsar, true);
  }, [router, seccionQueSePierde, irAHref]);

  const nav = useMemo<NavegacionConfig>(() => ({ irA: irAPreguntando, marcarSinGuardar }), [irAPreguntando, marcarSinGuardar]);

  const tab = abierto?.tab ?? null;
  const vista = abierto?.vista;
  const ancla = abierto?.ancla;

  // De vuelta en el inicio: el foco, al enlace que abrió la sección.
  useEffect(() => {
    if (tab) return;
    pushesDesdeLista.current = 0;
    const fila = filaOrigen.current;
    if (!fila) return;
    filaOrigen.current = null;
    requestAnimationFrame(() => document.getElementById(fila)?.focus());
  }, [tab]);

  // Sección abierta desde el inicio: arriba del todo y el foco en su título,
  // para que un lector de pantalla diga dónde ha llegado.
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

  function volver() {
    const pendiente = seccionQueSePierde(null);
    if (pendiente) {
      setSalida({ seccion: pendiente, ir: volverSinPreguntar });
      return;
    }
    volverSinPreguntar();
  }

  function volverSinPreguntar() {
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
      <div data-tour="configuracion-vista" data-vista={permitida ? 'detalle' : 'inicio'} className="group/config config-tactil space-y-6">
        <PageHeader
          title="Configuración"
          description="Cómo está tu estudio y dónde se cambia cada cosa."
          className="max-md:group-data-[vista=detalle]/config:sr-only"
        />

        {tab !== null && !permitida && (
          <p role="status" className="rounded-xl border border-border bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
            Esta parte la gestiona la propietaria.
          </p>
        )}

        <div className="md:grid md:grid-cols-[13rem_minmax(0,1fr)] md:items-start md:gap-6">
          <div className="hidden md:sticky md:top-14 md:block md:max-h-[calc(100dvh-8rem)] md:self-start md:overflow-y-auto lg:top-[calc(var(--panel-sticky-top,0px)+4rem)]">
            <ListaSecciones secciones={visibles} activa={mostrada} onElegir={id => irAPreguntando(id)} />
          </div>

          <div className="@container/config min-w-0">
            {mostrada && Seccion ? (
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
                consulta={consulta}
                onConsulta={setConsulta}
                onAbrir={(id, { ancla: tarjeta, origen }) => irAPreguntando(id, { ancla: tarjeta, modo: 'push', origen })}
              />
            )}
          </div>
        </div>

        {toastMsg && <Toast message={toastMsg} onDismiss={dismissToast} />}

        <ConfirmDialog
          open={salida !== null}
          onOpenChange={abiertoDialogo => { if (!abiertoDialogo) setSalida(null); }}
          titulo="¿Salir sin guardar?"
          descripcion={salida ? `Los cambios de «${seccionPorId(salida.seccion).titulo}» se perderán.` : undefined}
          textoConfirmar="Salir sin guardar"
          textoCancelar="Seguir editando"
          destructivo
          onConfirm={() => salida?.ir()}
        />
      </div>
    </ContextoNavegacionConfig.Provider>
  );
}
