'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { SeccionId } from '@/lib/configuracion/secciones';
import { useNavegacionConfig } from './contexto';

// Algunos errores ya empiezan por «No se ha guardado:» (una fila que la RLS no
// deja tocar, lib/db/actualizar-studio.ts): no se repite.
function textoDeError(error: string): string {
  const limpio = error.trim().replace(/[.\s]+$/, '');
  return `${/^no se ha guardado/i.test(limpio) ? limpio : `No se ha guardado: ${limpio}`}. Tus cambios siguen aquí.`;
}

// ─────────────────────────────────────────────────────────────────────────────
// La barra de guardar de una sección de Configuración.
//
// Una por sección, y solo se ve con cambios sin guardar. Dice EN QUÉ tarjetas
// los hay, porque una sección tiene varias y «tienes cambios sin guardar» a
// secas obliga a buscarlos.
//
// Lo que no se puede perder (el mismo contrato que #1971 y #2027):
//  · «Guardado» solo cuando el servidor lo ha confirmado. `onGuardar` devuelve
//    `null` si todo salió y el texto del error si no; quien lo implementa cuenta
//    filas (lib/db/actualizar-studio.ts), no se fía de un 200.
//  · Si falla, la barra se queda, lo dice con `role="alert"` y lo escrito sigue
//    en pantalla.
//  · Una ref contra el doble toque: el `disabled` llega un render tarde.
//  · Salir con cambios pregunta: aquí se avisa al shell (que pinta el diálogo) y
//    se engancha `beforeunload` para recargar o cerrar la pestaña.
//
// Colocación (§2 de la reorganización):
//  · ÚLTIMA hija de la columna de la sección, nunca dentro de una tarjeta: el
//    `overflow-hidden` de `Card` anula `sticky`.
//  · `sticky`, nunca `fixed`: `.panel-page-in` crea un bloque contenedor y un
//    `fixed` dentro se colocaría respecto a él.
//  · Por encima de la barra de navegación del móvil y el iPad (56 px + zona
//    segura), que es `fixed bottom-0`.
//  · `data-barra-guardar` SOLO mientras se ve: con él a la vista, la burbuja de
//    WhatsApp se aparta (globals.css). En todos los anchos: a 1024 px tapaba
//    «Guardar».
// ─────────────────────────────────────────────────────────────────────────────

export function BarraGuardar({
  seccion,
  cambios,
  bloqueo,
  onGuardar,
  onDescartar,
}: {
  seccion: SeccionId;
  /** Títulos de las tarjetas con cambios, en su orden. Vacío = no se pinta. */
  cambios: readonly string[];
  /** Por qué no se puede guardar todavía (un plazo imposible). Deja «Guardar» apagado. */
  bloqueo?: string | null;
  /** `null` = guardado de verdad; un texto = no se ha guardado, y por qué. */
  onGuardar: () => Promise<string | null>;
  onDescartar: () => void;
}) {
  const nav = useNavegacionConfig();
  const visible = cambios.length > 0;
  const enVuelo = useRef(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [anuncio, setAnuncio] = useState('');

  // Salir de la sección con cambios: el shell pregunta antes de cambiar de
  // sección o de pantalla.
  useEffect(() => {
    if (!visible || !nav) return;
    return nav.marcarSinGuardar(seccion);
  }, [visible, nav, seccion]);

  // Recargar o cerrar la pestaña: el diálogo del navegador (su texto no se
  // puede cambiar).
  useEffect(() => {
    if (!visible) return;
    const avisar = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', avisar);
    return () => window.removeEventListener('beforeunload', avisar);
  }, [visible]);

  async function guardar() {
    if (enVuelo.current || bloqueo) return;
    enVuelo.current = true;
    setGuardando(true);
    setError(null);
    setAnuncio('');
    try {
      const fallo = await onGuardar();
      if (fallo) setError(fallo);
      else setAnuncio('Guardado');
    } catch {
      setError('No hemos podido hablar con el servidor');
    } finally {
      enVuelo.current = false;
      setGuardando(false);
    }
  }

  function descartar() {
    setError(null);
    onDescartar();
  }

  return (
    <>
      {/* Fuera de la barra: cuando se guarda, la barra desaparece y esto es lo
          que le dice a un lector de pantalla que ha ido bien. */}
      <p role="status" className="sr-only">{visible ? '' : anuncio}</p>
      {visible && (
        <div
          data-barra-guardar=""
          role="region"
          aria-label="Cambios sin guardar"
          className="sticky z-20 bottom-[calc(3.5rem+env(safe-area-inset-bottom,0px)+0.5rem)] lg:bottom-4"
        >
          <div className="flex max-w-2xl flex-col gap-3 rounded-xl border border-border bg-card/95 px-4 py-3 shadow-lg backdrop-blur @sm/config:flex-row @sm/config:items-center @sm/config:justify-between">
            <div className="min-w-0 space-y-1">
              {(error || bloqueo) && (
                <p role="alert" className="text-sm font-medium text-destructive text-pretty">
                  {error ? textoDeError(error) : bloqueo}
                </p>
              )}
              <p role="status" className="text-sm text-foreground text-pretty">
                Cambios sin guardar en: {cambios.join(', ')}
              </p>
            </div>
            <div className="grid shrink-0 grid-cols-2 gap-2 @sm/config:flex">
              <Button type="button" variant="outline" size="lg" onClick={descartar} disabled={guardando}>
                Descartar
              </Button>
              <Button type="button" size="lg" onClick={guardar} disabled={guardando || !!bloqueo}>
                {guardando ? 'Guardando…' : 'Guardar'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
