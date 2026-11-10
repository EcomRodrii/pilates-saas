'use client';

// ─────────────────────────────────────────────────────────────────────────────
// El botón de ayuda de la esquina del panel (maqueta aprobada el 10-nov-2026) y
// quien abre su panel. Sustituye al botón flotante de WhatsApp: el WhatsApp
// sigue, ahora dentro de la pestaña Mensajes.
//
//   · `conLanzador` decide si el botón flota (la misma regla que tenía el de
//     WhatsApp, `flotantes-del-panel.tsx`). El panel se puede abrir igualmente
//     desde el menú de perfil con `EVENTO_ABRIR_AYUDA`.
//   · El punto de novedades vive en este navegador (`CLAVE_NOVEDAD_VISTA`): un
//     aviso de comodidad que no sigue a la persona de un dispositivo a otro.
//   · El panel (`panel-ayuda.tsx`) llega con `dynamic()`: solo se descarga al
//     abrirlo.
//
// Lee solo `useCore()` y el pathname: esto se pinta en todas las pantallas y no
// puede suscribirse al god-context.
// ─────────────────────────────────────────────────────────────────────────────

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { ChevronDown, MessageCircleQuestion } from 'lucide-react';
import { supabase } from '@/lib/db/supabase';
import { cn } from '@/lib/utils';
import {
  CLAVE_NOVEDAD_VISTA, EVENTO_ABRIR_AYUDA, esPestanaAyuda, hayNovedadSinVer, type PestanaAyuda,
} from '@/lib/ayuda/panel-ayuda';

const PanelAyuda = dynamic(() => import('./panel-ayuda').then(m => m.PanelAyuda), { ssr: false });

function leerVista(): string | null {
  try { return localStorage.getItem(CLAVE_NOVEDAD_VISTA); } catch { return null; }
}
function guardarVista(version: string) {
  try { localStorage.setItem(CLAVE_NOVEDAD_VISTA, version); } catch { /* sin almacenamiento: el punto vuelve, no pasa nada */ }
}

export function AyudaDelPanel({ conLanzador }: { conLanzador: boolean }) {
  const pathname = usePathname() ?? '/';
  const [abierta, setAbierta] = useState(false);
  const [pestana, setPestana] = useState<PestanaAyuda>('inicio');
  const [ultima, setUltima] = useState<string | null>(null);
  // Lo leído de este navegador: sin almacenamiento (o en el servidor) es `null`. El punto no se
  // pinta hasta que llega `ultima`, así que no hay diferencia entre servidor y cliente al hidratar.
  const [vista, setVista] = useState<string | null>(leerVista);

  // La última versión publicada, una vez por carga, para el punto del botón.
  // Si falla no se pinta el punto: un aviso que falla en silencio es mejor que uno
  // que miente.
  useEffect(() => {
    if (!conLanzador) return;
    let vivo = true;
    supabase
      .from('changelog_versiones')
      .select('version, fecha_publicacion')
      .eq('estado', 'publicado')
      .order('fecha_publicacion', { ascending: false })
      .limit(1)
      .then(({ data, error }) => { if (vivo && !error && data?.[0]) setUltima(data[0].version as string); });
    return () => { vivo = false; };
  }, [conLanzador]);

  useEffect(() => {
    const abrir = (e: Event) => {
      const p = (e as CustomEvent<{ pestana?: unknown }>).detail?.pestana;
      setPestana(esPestanaAyuda(p) ? p : 'inicio');
      setAbierta(true);
    };
    window.addEventListener(EVENTO_ABRIR_AYUDA, abrir);
    return () => window.removeEventListener(EVENTO_ABRIR_AYUDA, abrir);
  }, []);

  // Al cambiar de pantalla el panel se queda como está: la persona puede estar
  // siguiendo una guía mientras navega.
  const alVerNovedad = useCallback((version: string) => { guardarVista(version); setVista(version); }, []);
  const punto = conLanzador && !abierta && hayNovedadSinVer(ultima, vista);

  return (
    <>
      {abierta && (
        <PanelAyuda
          ruta={pathname}
          pestana={pestana}
          onPestana={setPestana}
          onCerrar={() => setAbierta(false)}
          onNovedadVista={alVerNovedad}
        />
      )}
      {conLanzador && (
        // Por debajo de 1024 hay barra de navegación abajo (56 px + zona segura): 16 px por encima de ella.
        // `panel-wa-fab`: se aparta con las barras de guardar y de selección (globals.css), porque caía
        // justo encima de «Guardar». `data-whatsapp-soporte`: la tercera parada del recorrido rápido
        // del alta nueva lo señala (lib/guia/recorrido.ts).
        <div data-whatsapp-soporte="" className="panel-wa-fab fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] right-4 z-40 lg:bottom-6 lg:right-6">
          <button
            type="button"
            onClick={() => setAbierta(a => !a)}
            aria-label={abierta ? 'Cerrar la ayuda' : punto ? 'Abrir la ayuda: hay novedades' : 'Abrir la ayuda'}
            aria-expanded={abierta}
            data-testid="boton-ayuda"
            className="relative flex size-14 items-center justify-center rounded-full bg-foreground text-background shadow-lg ring-1 ring-black/10 transition-transform hover:scale-105 active:scale-95"
          >
            {abierta ? <ChevronDown size={26} aria-hidden /> : <MessageCircleQuestion size={26} aria-hidden />}
            {punto && <span aria-hidden className={cn('absolute right-0.5 top-0.5 size-3.5 rounded-full border-2 border-card')} style={{ backgroundColor: 'var(--t-magenta-500)' }} />}
          </button>
        </div>
      )}
    </>
  );
}
