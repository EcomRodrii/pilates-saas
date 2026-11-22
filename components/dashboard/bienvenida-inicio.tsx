'use client';

import { useEffect, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react';

/**
 * La bienvenida del Inicio, como la del admin de Shopify (22-nov-2026, sobre el vídeo que dio el fundador): el
 * saludo aparece solo, palabra a palabra y saliendo del desenfoque, en mitad del lienzo vacío; después sube a su sitio
 * y debajo van entrando, uno tras otro, el compositor y el resto del Inicio.
 *
 * Suena **cada vez que se entra al software**, no solo la primera vez que se abre el estudio: una vez por sesión de
 * navegador (`sessionStorage`), así que pasar de Calendario a Inicio no la repite pero abrir Tentare otra vez, sí.
 * Sin «reducir movimiento» no hay nada que animar, y con un navegador automatizado (los e2e) tampoco: esperarían
 * casi tres segundos a que el contenido deje de estar oculto.
 *
 * Solo opacidad, desenfoque y transform. Las reglas están en `globals.css` (`[data-bienvenida='on']`).
 */
const CLAVE = 'tentare-bienvenida-inicio';
/** Cuánto dura la secuencia entera (ms): pasado eso, se quita el atributo y el Inicio queda como siempre. */
const DURACION_MS = 4200;

// La decisión se toma UNA vez por carga de la página y se recuerda aquí (no en un estado): leerla no escribe nada más.
let estado: 'sin-decidir' | 'on' | 'off' = 'sin-decidir';
const oyentes = new Set<() => void>();

function deberiaSonar(): boolean {
  try {
    if (sessionStorage.getItem(CLAVE)) return false;
    sessionStorage.setItem(CLAVE, '1');
  } catch { return false; }
  if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  return !navigator.webdriver;
}

function leer(): boolean {
  if (estado === 'sin-decidir') estado = deberiaSonar() ? 'on' : 'off';
  return estado === 'on';
}

function suscribir(f: () => void) {
  oyentes.add(f);
  return () => { oyentes.delete(f); };
}

export function useBienvenidaInicio(): boolean {
  // En el servidor nunca suena: no hay `sessionStorage`, y el primer pintado del cliente coincide con él.
  const activa = useSyncExternalStore(suscribir, leer, () => false);
  useEffect(() => {
    if (!activa) return;
    const t = setTimeout(() => { estado = 'off'; for (const f of oyentes) f(); }, DURACION_MS);
    return () => clearTimeout(t);
  }, [activa]);
  return activa;
}

/** El texto partido en palabras, cada una con su turno (`--p`) para entrar escalonada. */
export function PalabrasQueEntran({ texto, desde = 0 }: { texto: string; desde?: number }): ReactNode {
  return texto.split(' ').map((palabra, i, todas) => (
    <span key={i}>
      <span className="bv-palabra" style={{ '--p': desde + i } as CSSProperties}>{palabra}</span>
      {i < todas.length - 1 ? ' ' : ''}
    </span>
  ));
}
