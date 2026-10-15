'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { CircleHelp, CirclePlay } from 'lucide-react';
import { usePanelNuevo } from '@/lib/estudio/panel-nuevo-cliente';
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
  const panelNuevo = usePanelNuevo();

  useEffect(() => {
    if (t && presente && visible) return presente(t.ruta);
  }, [t?.ruta, presente, visible]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (t && pedir) pedir(t.ruta);
  }, [t?.ruta, pedir]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!t || !tutorial || !visible) return null;
  const nombre = ayudaDePantalla(t.ruta)?.titulo ?? 'esta pantalla';
  if (panelNuevo) {
    // Panel nuevo: a la vista y con nombre, como el «Cómo funciona» de Bonsai; el mismo tutorial.
    return (
      <button
        type="button"
        onClick={() => tutorial.abrir(t.ruta)}
        aria-label={`Enséñame «${nombre}» paso a paso`}
        title={`Enséñame «${nombre}» paso a paso`}
        data-testid="boton-tutorial"
        className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-[12.5px] font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <CirclePlay size={15} aria-hidden style={{ color: 'var(--t-magenta-500)' }} />
        {/* Una cabecera estrecha puede dejar solo el icono (el nombre sigue en `aria-label`). */}
        <span data-boton-tutorial-texto>Cómo funciona</span>
      </button>
    );
  }
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
