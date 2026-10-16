'use client';

// La lógica de «Tus módulos» (leer el menú y el modo, y poner o quitar
// un módulo del menú) para las dos caras: la fila de Configuración
// (`tus-modulos.tsx`) y la pantalla Módulos del panel nuevo
// (`components/modulos/modulos-nuevo.tsx`). Un solo sitio que guarda: dos
// editores del mismo dato no pueden tener reglas distintas. Guardar lo deja
// hacer el servidor solo a la propietaria (`guardarLayoutAction`).
//
// Con el panel nuevo, Módulos sustituye a «Esencial / Todo» (lib/modulos/menu.ts):
// un módulo está «en el menú» o no, sin un tercer estado que dependa del
// navegador, y guardar manda `ocultos` y `activados`.

import { useEffect, useRef, useState } from 'react';
import { usePermisos } from '@/lib/permisos';
import { useMiWebNueva, usePanelNuevo } from '@/lib/estudio/panel-nuevo-cliente';
import { seccionesDelMenu } from '@/lib/nav-panel-nuevo';
import { fetchLayout, guardarLayoutApi, olvidarLayout } from '@/lib/api-client';
import { mensajeSeguro, ERROR_RED } from '@/lib/errores';
import { EVENTO_MODO_MENU, leerModoMenu, modoDelEvento, type ModoMenu } from '@/lib/nav-modo';
import { contar, estadoEnMenu, gruposTuTentare, ocultosTrasCambiar, type EstadoEnMenu, type ModuloTuTentare } from '@/lib/tu-tentare/catalogo';
import { HREF_MODULOS, activoEnModulos, eleccionTrasCambiar } from '@/lib/modulos/menu';

const lista = (x: unknown): string[] => (Array.isArray(x) ? x.filter((h): h is string => typeof h === 'string') : []);

export function useTusModulos({ onCambio, bloqueado = false, onGuardando }: {
  onCambio?: () => void;
  bloqueado?: boolean;
  onGuardando?: (guardando: boolean) => void;
} = {}) {
  const { puedeVer } = usePermisos();
  const panelNuevo = usePanelNuevo();
  const miWebNueva = useMiWebNueva();
  const [ocultos, setOcultos] = useState<string[] | null>(null);
  const [activados, setActivados] = useState<string[]>([]);
  const [errorLectura, setErrorLectura] = useState(false);
  const [modo, setModo] = useState<ModoMenu>('esencial');
  const [guardando, setGuardando] = useState<string | null>(null);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [recien, setRecien] = useState<string | null>(null);
  const enVuelo = useRef(false);

  useEffect(() => {
    let vivo = true;
    const leer = () => fetchLayout()
      .then(l => { if (vivo) { setOcultos(lista(l.ocultos)); setActivados(lista(l.activados)); setErrorLectura(false); } })
      .catch(() => { if (vivo) setErrorLectura(true); });
    void leer();
    setModo(leerModoMenu());
    // Si el cajón «Tu menú» guarda, esta lista se pone al día con lo guardado; y
    // si el selector Esencial/Todo del menú cambia, también.
    const alCambiar = () => { void leer(); };
    const alCambiarModo = (e: Event) => setModo(modoDelEvento(e));
    window.addEventListener('tentare-layout-changed', alCambiar);
    window.addEventListener(EVENTO_MODO_MENU, alCambiarModo);
    return () => {
      vivo = false;
      window.removeEventListener('tentare-layout-changed', alCambiar);
      window.removeEventListener(EVENTO_MODO_MENU, alCambiarModo);
    };
  }, []);

  // Módulos no sale en su propia pantalla: no se puede ocultar y es donde se está.
  const grupos = gruposTuTentare(puedeVer, seccionesDelMenu(panelNuevo, miWebNueva))
    .map(g => ({ ...g, modulos: g.modulos.filter(m => m.href !== HREF_MODULOS) }))
    .filter(g => g.modulos.length > 0);
  const vistos = new Set(ocultos ?? []);
  const eleccion = { ocultos: ocultos ?? [], activados };
  /** Dónde se ve hoy. Con el panel nuevo, en el menú o fuera: no hay «solo con Todo». */
  const estadoDe = (m: ModuloTuTentare): EstadoEnMenu =>
    panelNuevo ? (activoEnModulos(m.href, eleccion) ? 'en-menu' : 'fuera') : estadoEnMenu(m, vistos);
  const cuenta = panelNuevo
    ? (() => { const todos = grupos.flatMap(g => g.modulos); return { en: todos.filter(m => estadoDe(m) !== 'fuera').length, de: todos.length }; })()
    : contar(grupos, vistos);

  /** `true` solo cuando el servidor ha guardado: la pantalla Módulos cierra su confirmación con eso. */
  async function cambiar(m: ModuloTuTentare, enMenu: boolean): Promise<boolean> {
    if (enVuelo.current || ocultos === null || bloqueado) return false;
    enVuelo.current = true;
    setGuardando(m.href);
    onGuardando?.(true);
    setErrores(prev => { const { [m.href]: _, ...resto } = prev; return resto; });
    try {
      // Sobre el menú de AHORA, no el de cuando se abrió la pestaña: otra pestaña
      // u otro dispositivo pueden haberlo cambiado, y mandar `ocultos` entero con
      // datos viejos desharía lo suyo.
      olvidarLayout();
      const fresco = await fetchLayout();
      const parche = panelNuevo
        ? eleccionTrasCambiar({ ocultos: lista(fresco.ocultos), activados: lista(fresco.activados) }, m.href, enMenu)
        : (() => { const nuevos = ocultosTrasCambiar(lista(fresco.ocultos), m, enMenu); return nuevos ? { ocultos: nuevos } : null; })();
      if (!parche) return false;
      // Solo esto: el servidor fusiona por clave y no toca el orden ni el Resumen.
      const config = await guardarLayoutApi(parche);
      setOcultos(lista(config.ocultos));
      setActivados(lista(config.activados));
      setRecien(enMenu ? m.href : null);
      // El menú escucha esto y se recoloca sin recargar; la fila «Tu menú», también.
      window.dispatchEvent(new CustomEvent('tentare-layout-changed'));
      onCambio?.();
      return true;
    } catch (e) {
      setErrores(prev => ({ ...prev, [m.href]: mensajeSeguro((e as Error).message, ERROR_RED) }));
      return false;
    } finally {
      enVuelo.current = false;
      setGuardando(null);
      onGuardando?.(false);
    }
  }


  return { grupos, ocultos, vistos, estadoDe, cuenta, modo, setModo, guardando, errores, recien, errorLectura, cambiar };
}
