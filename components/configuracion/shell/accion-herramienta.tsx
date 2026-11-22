'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { anfitrionPortal } from '@/lib/panel-portal';
import { useShellNuevo } from '@/lib/estudio/panel-nuevo-cliente';

/**
 * La acción principal de una herramienta («Nueva sala», «Nuevo tipo de clase»). Con el shell nuevo
 * (`SHELL_NUEVO`) sube a la esquina superior derecha del lienzo, como el botón negro de la barra de
 * una página de Configuración de Shopify (p. ej. «Agregar idioma»); sin él, se queda donde estaba.
 *
 * Va en un portal fijo al viewport (no dentro de la página): el contenido se anima con `transform` y
 * un `fixed` dentro se mediría contra él (ver `lib/panel-portal.ts`). Solo desde 768 px; en el móvil se
 * queda en su sitio.
 */
export function AccionHerramienta({ children }: { children: ReactNode }) {
  const sangre = useShellNuevo();
  // Se decide en el cliente, tras montar: así el HTML del servidor y el primer pintado coinciden.
  const [ancho, setAncho] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const leer = () => setAncho(mq.matches);
    leer();
    mq.addEventListener('change', leer);
    return () => mq.removeEventListener('change', leer);
  }, []);
  if (!sangre || !ancho) return <>{children}</>;
  return createPortal(
    <div data-accion-herramienta="" className="fixed right-8 top-3.5 z-30 flex items-center gap-2">{children}</div>,
    anfitrionPortal(),
  );
}
