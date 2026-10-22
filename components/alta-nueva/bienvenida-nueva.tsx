'use client';

// ─────────────────────────────────────────────────────────────────────────────
// La bienvenida del alta nueva, dentro del panel (PR-3 del plan del 21-oct-2026,
// maqueta aprobada 03-maqueta-alta-nueva.html). Sustituye a `PantallaBienvenida`
// cuando `altaNueva` está encendido (components/layout/dashboard-shell.tsx):
//
//   3 · Tu estudio      dónde está y cuándo abre (obligatorio, dos pantallas)
//   4 · Tus datos       «¿Traes alumnas de otro sitio?» (opcional)
//   5 · Tu marca        logo, color y nombre con la app en vivo (opcional)
//       Tus primeros    la introducción breve de lo que viene en el panel
//       pasos
//
// Los pasos 1 y 2 (cuenta y código) ya están hechos: son /crear-estudio. El alta
// ACABA en el 5 (fundador, 21-oct-2026: «lo de crear la clase durante el
// onboarding, descartado»; y al terminar, nunca el Calendario vacío con su aviso,
// sino «primeros pasos y una introducción breve de lo que va a hacer»).
// «Empezar» sella el alta y abre la primera tarea, «Tu primera clase», sobre el
// Calendario (`ENTRADA_PRIMERA_CLASE`); al publicarla, su «¡Listo!» lleva al
// Resumen, donde «Pon en marcha tu estudio» ofrece la siguiente, con «Omitir».
//
// Igual que la bienvenida de siempre:
//   · el alta se SELLA (`studios.bienvenida_vista_en`) al salir —«Prefiero ir a
//     mi panel» o al terminar— y no antes; un UPDATE fallido no deja a nadie
//     encerrado ni sella a medias;
//   · sin Tenti (el plan lo deja fuera de la bienvenida nueva).
// Lo nuevo: se REANUDA (si recarga, vuelve a la pantalla en que estaba) y una
// persona por WhatsApp está a la vista en todas (decisión D5).
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogoTentare } from '@/components/marca/logo-tentare';
import { useStudio } from '@/lib/studio-context';
import type { Studio } from '@/lib/types';
import { capturarEvento } from '@/lib/posthog-cliente';
import { capturarExcepcion } from '@/lib/sentry-cliente';
import { PanelThemeProvider } from '@/lib/panel-theme';
import { PanelPrivacyProvider } from '@/lib/panel-privacy';
import { ENTRADA_PRIMERA_CLASE, LINEA_DE_PASOS, PASO_DE_PANTALLA, anteriorPantalla, siguientePantalla, type PantallaAlta } from '@/lib/alta/bienvenida-nueva';
import { sedesDeOnbCentros, type Sedes } from '@/lib/alta/tu-estudio';
import { ErrorGuardado, WhatsAppPersona } from './piezas';
import { PasoCuando, PasoDonde } from './paso-tu-estudio';
import { PasoImportar } from './paso-importar';
import { PasoMarca } from './paso-marca';
import { PasoPrimerosPasos } from './paso-primeros-pasos';
import { guardarPantalla, leerPantalla, olvidarPantalla } from './pantalla-guardada';

type Salida = 'panel' | 'terminada' | 'omitida';

/**
 * Dónde empieza: donde se quedó. También con `?primera=1` (el botón del correo
 * «Tu cuenta está activa», que llega antes de terminar el alta): la clase va
 * DESPUÉS del alta, y saltar a ella se comería «Tu estudio», que es obligatorio.
 * Al terminar, «Empezar» la abre.
 */
function inicio(studioId: string): PantallaAlta {
  return leerPantalla(studioId);
}

export function BienvenidaNueva({ studio }: { studio: Studio }) {
  const { updateStudio } = useStudio();
  const router = useRouter();
  const [pantalla, setPantalla] = useState<PantallaAlta>(() => inicio(studio.id));
  const [sedes, setSedes] = useState<Sedes>(() => sedesDeOnbCentros(studio.onbCentros) ?? { tipo: 'una' });
  const [saliendo, setSaliendo] = useState(false);
  const [errorSalir, setErrorSalir] = useState<string | null>(null);
  const sellando = useRef(false);
  const vistas = useRef(new Set<PantallaAlta>());

  // Embudo de PostHog con los eventos de la bienvenida de siempre (la lista es
  // cerrada, lib/analytics-navegador.ts): una vez al empezar y una por pantalla,
  // la primera vez que se llega. Lo de la nueva lleva `nueva_` delante, para no
  // mezclarse con los pasos del asistente de siempre. El embudo de verdad es el
  // de la base de datos (`embudo_alta`, /interno).
  useEffect(() => {
    if (vistas.current.size === 0) capturarEvento('bienvenida_iniciada');
    if (vistas.current.has(pantalla)) return;
    vistas.current.add(pantalla);
    capturarEvento('bienvenida_paso', { paso: `nueva_${pantalla}`, n: PASO_DE_PANTALLA[pantalla], total: LINEA_DE_PASOS.length, retomado: vistas.current.size === 1 && pantalla !== 'estudio' });
  }, [pantalla]);

  const irA = useCallback((p: PantallaAlta) => {
    setPantalla(p);
    guardarPantalla(studio.id, p);
    window.scrollTo({ top: 0 });
  }, [studio.id]);

  // Sellar y salir. Si el UPDATE falla, se libera el cerrojo y se dice: nadie se
  // queda encerrado ni se sella lo que no ha terminado.
  const sellarYSalir = useCallback(async (destino: string, salida: Salida) => {
    if (sellando.current) return;
    sellando.current = true;
    setSaliendo(true);
    setErrorSalir(null);
    const res = await updateStudio({ bienvenidaVistaEn: new Date().toISOString() });
    if (!res.ok) {
      sellando.current = false;
      setSaliendo(false);
      capturarExcepcion(new Error(res.error ?? 'No se pudo sellar bienvenida_vista_en'), { tags: { area: 'onboarding' } });
      setErrorSalir(`No hemos podido guardar que sales de la configuración. ${res.error ?? ''} Vuelve a intentarlo.`.replace(/\s+/g, ' ').trim());
      return;
    }
    olvidarPantalla(studio.id);
    capturarEvento(salida === 'terminada' ? 'bienvenida_completada' : 'bienvenida_saltada', { destino: `nueva_${salida}` });
    router.push(destino);
  }, [updateStudio, router, studio.id]);

  const alPanel = useCallback(() => void sellarYSalir('/dashboard', 'panel'), [sellarYSalir]);
  // «Omitir» en «Tus primeros pasos»: al Resumen, donde «Pon en marcha tu estudio» los sigue teniendo.
  const omitirPrimerosPasos = useCallback(() => void sellarYSalir('/dashboard', 'omitida'), [sellarYSalir]);
  // La última pantalla sella el alta y abre la primera tarea: «Tu primera clase», en el panel.
  const seguir = useCallback((desde: PantallaAlta) => {
    const sig = siguientePantalla(desde);
    if (sig) irA(sig);
    else void sellarYSalir(ENTRADA_PRIMERA_CLASE, 'terminada');
  }, [irA, sellarYSalir]);
  const atras = useCallback((desde: PantallaAlta) => {
    const ant = anteriorPantalla(desde);
    if (ant) irA(ant);
  }, [irA]);
  // A una de las tres pantallas de traer datos; al volver, el paso 5.
  const irARutaDelAlta = useCallback((ruta: string) => {
    guardarPantalla(studio.id, 'marca');
    router.push(ruta);
  }, [router, studio.id]);

  const comunes = { studio, saliendo };
  return (
    <PanelPrivacyProvider>
      <PanelThemeProvider className="panel-app min-h-dvh bg-background">
        <div className="min-h-dvh bg-background text-foreground" data-screen="bienvenida-nueva">
          <header className="mx-auto flex w-full max-w-[1180px] items-center justify-between gap-3 px-5 pb-1 pt-4 sm:px-8 sm:pt-5">
            <LogoTentare alto={22} tinta="auto" decorativo />
            <div className="flex min-w-0 items-center gap-1.5 sm:gap-3">
              <button
                type="button"
                onClick={alPanel}
                disabled={saliendo}
                className="min-h-10 whitespace-nowrap rounded-full px-2 text-[13px] font-semibold text-muted-foreground hover:text-foreground disabled:opacity-60 sm:px-2.5"
              >
                <span className="sm:hidden">Ir a mi panel</span>
                <span className="hidden sm:inline">Prefiero ir a mi panel</span>
              </button>
              <WhatsAppPersona nombreEstudio={studio.nombre} />
            </div>
          </header>

          <main className="mx-auto w-full max-w-[1180px] px-5 pb-12 pt-3 sm:px-8">
            <ErrorGuardado mensaje={errorSalir} />
            {pantalla === 'estudio' && (
              <PasoDonde {...comunes} sedes={sedes} onSedes={setSedes} onListo={() => seguir('estudio')} />
            )}
            {pantalla === 'horario' && (
              <PasoCuando {...comunes} sedes={sedes} onAtras={() => atras('horario')} onListo={() => seguir('horario')} />
            )}
            {pantalla === 'importar' && (
              <PasoImportar {...comunes} onAtras={() => atras('importar')} onListo={() => seguir('importar')} onIrA={irARutaDelAlta} />
            )}
            {pantalla === 'marca' && (
              <PasoMarca studio={studio} saliendo={saliendo} onAtras={() => atras('marca')} onListo={() => seguir('marca')} />
            )}
            {pantalla === 'pasos' && (
              <PasoPrimerosPasos
                saliendo={saliendo}
                onAtras={() => atras('pasos')}
                onEmpezar={() => seguir('pasos')}
                onOmitir={omitirPrimerosPasos}
              />
            )}
          </main>
        </div>
      </PanelThemeProvider>
    </PanelPrivacyProvider>
  );
}
