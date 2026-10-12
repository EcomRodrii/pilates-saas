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
export function BotonTutorial({ ruta }: { ruta?: string }) {
  const pathname = usePathname();
  const tutorial = useTutorial();
  const clave = ruta ?? pathname;
  const t = tutorialDePantalla(clave);
  const pedir = tutorial?.pedirAbrirSolo;

  useEffect(() => {
    if (t && pedir) pedir(t.ruta);
  }, [t?.ruta, pedir]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!t || !tutorial) return null;
  const nombre = ayudaDePantalla(t.ruta)?.titulo ?? 'esta pantalla';
  return (
    <button
      type="button"
      onClick={() => tutorial.abrir(t.ruta)}
      aria-label={`Enséñame cómo funciona ${nombre}`}
      title={`Enséñame cómo funciona ${nombre}`}
      data-testid="boton-tutorial"
      className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <CircleHelp size={17} aria-hidden />
    </button>
  );
}
