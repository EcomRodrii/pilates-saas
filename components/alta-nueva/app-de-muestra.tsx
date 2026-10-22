'use client';

// La app de la alumna, la REAL, en el paso 1 del alta nueva (antes de que exista
// el estudio): su pantalla de entrada —lo primero que ve una alumna al abrir el
// enlace— dentro de un iPhone 17 Pro, con el nombre que se va escribiendo.
//
// Es `/portal/_muestra/acceso/login` (lib/student/muestra.ts): el código de la
// app, con el estudio tal como nacerá (sin logo, la foto de portada de serie que
// le toca, el color de fábrica). El nombre le llega por `postMessage`, nunca por
// la URL. Sin interacción (es una vista previa mientras rellena el formulario) y,
// por si acaso, en el marco de «solo mirar»: no escribe nada.

import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { MarcoIphone, PANTALLA_IPHONE } from '@/components/ui/marco-iphone';
import { pintarBorrador } from '@/lib/apariencia/borrador-en-marco';
import { MUESTRA_LISTA, SLUG_MUESTRA, mensajeMuestra } from '@/lib/student/muestra';
import { NOMBRE_MARCO_SOLO_MIRAR } from '@/lib/student/solo-mirar';

export function AppDeMuestra({ nombre, escala }: { nombre: string; escala: number }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [lista, setLista] = useState(false);

  const mandar = useEffectEvent(() => {
    ref.current?.contentWindow?.postMessage(mensajeMuestra(nombre), window.location.origin);
  });
  useEffect(() => { mandar(); }, [nombre]);

  // Lista la app: los márgenes del iPhone (al hidratar, React puede quitar del
  // <head> lo que no es suyo) y el nombre de ahora.
  const preparar = useEffectEvent(() => {
    pintarBorrador(ref.current, '');
    mandar();
    setLista(true);
  });

  // La app avisa al montarse (`MUESTRA_LISTA`). ⚠️ El iframe viene en el HTML del
  // servidor y puede cargar ANTES de que esta página hidrate: su aviso (y el `load`)
  // llegaría sin nadie escuchando. Por eso, al empezar a escuchar, si ya está ahí
  // se prepara igual; si aún no había montado, avisará y se prepara entonces.
  useEffect(() => {
    const escuchar = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.source !== ref.current?.contentWindow) return;
      if ((e.data as { tipo?: unknown } | null)?.tipo === MUESTRA_LISTA) preparar();
    };
    window.addEventListener('message', escuchar);
    if (ref.current?.contentDocument?.querySelector('.student-app')) preparar();
    return () => window.removeEventListener('message', escuchar);
  }, []);

  return (
    <MarcoIphone escala={escala} modelo="17-pro" tinta="clara" velo={false} indicador="oscura" data-testid="app-de-muestra">
      <iframe
        ref={ref}
        name={NOMBRE_MARCO_SOLO_MIRAR}
        title="La app de tus alumnas, con el nombre de tu estudio"
        src={`/portal/${SLUG_MUESTRA}/acceso/login`}
        // Los márgenes del iPhone (isla arriba, indicador abajo): los mismos que la vista previa de Apariencia.
        onLoad={() => {
          pintarBorrador(ref.current, '');
          ref.current?.contentWindow?.postMessage(mensajeMuestra(nombre), window.location.origin);
        }}
        {...({ inert: true } as object)}
        aria-hidden="true"
        tabIndex={-1}
        className="bg-white transition-opacity duration-300"
        style={{ width: PANTALLA_IPHONE.ancho, height: PANTALLA_IPHONE.alto, border: 0, opacity: lista ? 1 : 0.35, pointerEvents: 'none' }}
      />
    </MarcoIphone>
  );
}
