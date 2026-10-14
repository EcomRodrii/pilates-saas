'use client';

// La lógica de «Tus módulos» (leer el menú, el plan y el modo, y poner o quitar
// un módulo del menú) para las dos caras: la fila de Configuración
// (`tus-modulos.tsx`) y la pantalla Módulos del panel nuevo
// (`components/modulos/modulos-nuevo.tsx`). Un solo sitio que guarda: dos
// editores del mismo dato no pueden tener reglas distintas. Guardar lo deja
// hacer el servidor solo a la propietaria (`guardarLayoutAction`).

import { useEffect, useRef, useState } from 'react';
import { usePermisos } from '@/lib/permisos';
import { usePanelNuevo } from '@/lib/estudio/panel-nuevo-cliente';
import { seccionesDelMenu } from '@/lib/nav-panel-nuevo';
import { estadoBilling, fetchLayout, guardarLayoutApi, olvidarLayout } from '@/lib/api-client';
import { mensajeSeguro, ERROR_RED } from '@/lib/errores';
import { EVENTO_MODO_MENU, leerModoMenu, modoDelEvento, type ModoMenu } from '@/lib/nav-modo';
import { contar, gruposTuTentare, ocultosTrasCambiar, type ModuloTuTentare } from '@/lib/tu-tentare/catalogo';

export function useTusModulos({ onCambio, bloqueado = false, onGuardando }: {
  onCambio?: () => void;
  bloqueado?: boolean;
  onGuardando?: (guardando: boolean) => void;
} = {}) {
  const { puedeVer } = usePermisos();
  const panelNuevo = usePanelNuevo();
  const [ocultos, setOcultos] = useState<string[] | null>(null);
  const [errorLectura, setErrorLectura] = useState(false);
  const [plan, setPlan] = useState<{ plan: string | null; activo: boolean } | null>(null);
  const [modo, setModo] = useState<ModoMenu>('esencial');
  const [guardando, setGuardando] = useState<string | null>(null);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [recien, setRecien] = useState<string | null>(null);
  const enVuelo = useRef(false);

  useEffect(() => {
    let vivo = true;
    const leer = () => fetchLayout()
      .then(l => { if (vivo) { setOcultos(l.ocultos); setErrorLectura(false); } })
      .catch(() => { if (vivo) setErrorLectura(true); });
    void leer();
    void estadoBilling().then(b => { if (vivo) setPlan(b ? { plan: b.plan ?? null, activo: b.activo } : null); });
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

  const grupos = gruposTuTentare(puedeVer, seccionesDelMenu(panelNuevo));
  const vistos = new Set(ocultos ?? []);
  const cuenta = contar(grupos, vistos);

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
      const nuevos = ocultosTrasCambiar(fresco.ocultos, m, enMenu);
      if (!nuevos) return false;
      // Solo `ocultos`: el servidor fusiona por clave y no toca el orden ni el Resumen.
      const config = await guardarLayoutApi({ ocultos: nuevos });
      setOcultos(config.ocultos);
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


  return { grupos, ocultos, vistos, cuenta, plan, modo, setModo, guardando, errores, recien, errorLectura, cambiar };
}
