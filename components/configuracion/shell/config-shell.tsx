'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import { useRol } from '@/lib/permisos';
import { Toast, useToast } from '@/components/ui/toast';
import { PanelSkeleton } from '@/components/ui/panel-skeleton';
import { PageHeader } from '@/components/ui/page-header';
import { hrefDeSeccion, resolverDestino, seccionesVisibles } from '@/lib/configuracion/destino';
import { seccionPorId, type SeccionId } from '@/lib/configuracion/secciones';
import { ContextoNavegacionConfig, type NavegacionConfig } from './contexto';
import { ListaSecciones } from './lista-secciones';
import { CabeceraSeccion } from './cabecera-seccion';

// ─────────────────────────────────────────────────────────────────────────────
// Configuración por preguntas.
//
// Antes: doce pestañas en fila (27 px de alto, a dos filas en el iPad, cortadas
// en el móvil sin nada que dijera que había más) y dentro sub-pestañas y
// «Opciones avanzadas». Ahora:
//
//   · móvil (<768): una LISTA de once secciones; tocar una abre su DETALLE a
//     pantalla completa, con flecha de volver. `router.push`, para que el gesto
//     de atrás del teléfono vuelva a la lista.
//   · 768 en adelante: la lista es una columna fija a la izquierda y la sección
//     a la derecha. `router.replace`: saltar de una a otra no llena el historial.
//
// Lista o detalle se decide con CSS (`data-vista`), nunca con matchMedia: girar
// el iPad no desmonta nada ni pierde lo que se estaba escribiendo.
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
  web: dynamic(() => import('@/components/configuracion/secciones/seccion-web').then(m => m.SeccionWeb), { loading: cargando }),
  motivacion: dynamic(() => import('@/components/configuracion/secciones/seccion-motivacion').then(m => m.SeccionMotivacion), { loading: cargando }),
  conexiones: dynamic(() => import('@/components/configuracion/secciones/seccion-conexiones').then(m => m.SeccionConexiones), { loading: cargando }),
  datos: dynamic(() => import('@/components/configuracion/secciones/seccion-datos').then(m => m.SeccionDatos), { loading: cargando }),
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

  // ⚠️ #2008: tras cambiar la URL, `useSearchParams()` no se entera en el mismo
  // render. Si la sección se derivara de él, cada clic volvería un instante a la
  // URL de antes. Así que la URL se lee solo cuando cambia por algo que NO ha
  // escrito esta página: `escritas` guarda lo que se pidió con push/replace y
  // `urlVista` lo último que se sabe que hay en la barra.
  const escritas = useRef<string[]>([]);
  const urlVista = useRef<string | null>(null);

  // Foco: la fila de la lista que abrió el detalle (a ella se vuelve), si hay
  // que llevar el foco al título, y cuántos `push` van desde la lista.
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
    if (modo === 'push') router.push(href, { scroll: false });
    else router.replace(href, { scroll: false });
  }, [router]);

  const nav = useMemo<NavegacionConfig>(() => ({ irA }), [irA]);

  const tab = abierto?.tab ?? null;
  const vista = abierto?.vista;
  const ancla = abierto?.ancla;

  // De vuelta en la lista: el foco, a la fila que abrió la sección.
  useEffect(() => {
    if (tab) return;
    pushesDesdeLista.current = 0;
    const fila = filaOrigen.current;
    if (!fila) return;
    filaOrigen.current = null;
    requestAnimationFrame(() => document.getElementById(fila)?.focus());
  }, [tab]);

  // Sección abierta desde la lista del móvil: arriba del todo y el foco en su
  // título, para que un lector de pantalla diga dónde ha llegado.
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
  // Sin sección en la URL, en pantalla ancha se abre la primera sin tocar la URL.
  const mostrada = permitida ? tab : (visibles[0]?.id ?? null);
  const Seccion = mostrada ? COMPONENTES[mostrada] : null;

  function volver() {
    // Si se llegó desde la lista con un solo paso, «volver» es el atrás de
    // siempre y el historial queda como estaba. Si se llegó por un enlace
    // (una notificación, otra sección), se sustituye por la lista.
    //
    // ⚠️ Con el atrás, la lista NO se pinta antes de que la URL cambie: si se
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
      <div data-tour="configuracion-vista" data-vista={permitida ? 'detalle' : 'lista'} className="group/config config-tactil space-y-6">
        <PageHeader
          title="Configuración"
          description="Cómo funciona tu estudio: tus clases, cómo reservan tus alumnas, cómo cobras y qué ven en su app."
          className="max-md:group-data-[vista=detalle]/config:sr-only"
        />

        {tab !== null && !permitida && (
          <p role="status" className="rounded-xl border border-border bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
            Esta parte la gestiona la propietaria.
          </p>
        )}

        <div className="md:grid md:grid-cols-[13rem_minmax(0,1fr)] md:items-start md:gap-6">
          <div className="md:hidden max-md:group-data-[vista=detalle]/config:hidden">
            <ListaSecciones
              variant="lista"
              secciones={visibles}
              activa={null}
              onElegir={(id, fila) => irA(id, { modo: 'push', origen: fila })}
            />
          </div>
          <div className="hidden md:sticky md:top-14 md:block md:max-h-[calc(100dvh-8rem)] md:self-start md:overflow-y-auto lg:top-[calc(var(--panel-sticky-top,0px)+4rem)]">
            <ListaSecciones variant="rail" secciones={visibles} activa={mostrada} onElegir={id => irA(id)} />
          </div>

          <div className="@container/config min-w-0 max-md:group-data-[vista=lista]/config:hidden">
            {mostrada && Seccion && (
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
            )}
          </div>
        </div>

        {toastMsg && <Toast message={toastMsg} onDismiss={dismissToast} />}
      </div>
    </ContextoNavegacionConfig.Provider>
  );
}
