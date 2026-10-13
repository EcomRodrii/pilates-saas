'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { CircleHelp } from 'lucide-react';
import { useTutorial } from '@/lib/tutorial-context';
import { ayudaDePantalla, tutorialDePantalla } from '@/lib/ayuda/pantallas';

// El «?» de una pantalla con tutorial (P1.1), junto al ⓘ. Lo ve cualquier rol
// que vea la pantalla; abrirse SOLO, solo a la propietaria de un estudio nuevo
// (`debeAbrirseSolo`). Sin tutorial en el catálogo, no se pinta nada.
//
// `ruta`: la clave del catálogo. Sin ella, la pantalla actual; las vistas de
// Configuración la pasan (su URL canónica, `hrefDeLugar`).
//
// ⚠️ La etiqueta no puede llevar «ver» ni «volver»: hay e2e que buscan
// `getByLabel('Ver')` y ya chocaron con otra etiqueta así (primera-vez-aqui.tsx).
//
// Mientras está montado, le dice al contexto «sigo en esta pantalla» (`presente`):
// al desmontarse, si el tutorial abierto era el suyo, se cierra sin anotar nada.
// Con la visita guiada en marcha no se pinta: un «?» que no responde es peor que ninguno.
export function BotonTutorial({ ruta }: { ruta?: string }) {
  const pathname = usePathname();
  const tutorial = useTutorial();
  const clave = ruta ?? pathname;
  const t = tutorialDePantalla(clave);
  const pedir = tutorial?.pedirAbrirSolo;
  const presente = tutorial?.presente;
  const visible = !!t && !!tutorial && !tutorial.visitaActiva;

  useEffect(() => {
    if (t && presente && visible) return presente(t.ruta);
  }, [t?.ruta, presente, visible]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (t && pedir) pedir(t.ruta);
  }, [t?.ruta, pedir]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!t || !tutorial || !visible) return null;
  const nombre = ayudaDePantalla(t.ruta)?.titulo ?? 'esta pantalla';
  return (
    <button
      type="button"
      onClick={() => tutorial.abrir(t.ruta)}
      aria-label={`Enséñame «${nombre}» paso a paso`}
      title={`Enséñame «${nombre}» paso a paso`}
      data-testid="boton-tutorial"
      // 40 px de zona táctil en el móvil sin estirar la fila del título (-my-1); 32 en escritorio.
      className="-my-1 inline-flex size-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 lg:my-0 lg:size-8"
    >
      <CircleHelp size={16} aria-hidden />
    </button>
  );
}
