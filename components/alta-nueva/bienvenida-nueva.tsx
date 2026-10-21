'use client';

// ─────────────────────────────────────────────────────────────────────────────
// La bienvenida del alta nueva, dentro del panel (PR-3 del plan del 21-oct-2026,
// maqueta aprobada 03-maqueta-alta-nueva.html). Sustituye a `PantallaBienvenida`
// cuando `altaNueva` está encendido (components/layout/dashboard-shell.tsx):
//
//   3 · Tu estudio      dónde está y cuándo abre (obligatorio, dos pantallas)
//   4 · Tus datos       «¿Traes alumnas de otro sitio?» (opcional)
//   5 · Tu marca        logo, color y nombre con la app en vivo (opcional)
//   6 · Primera clase   la clase y su precio, todo a la vez (obligatorio, PR-4)
//   7 · Publicar        «¡Listo! Tu clase … ya está publicada» (PR-4)
//
// Los pasos 1 y 2 (cuenta y código) ya están hechos: son /crear-estudio. Al 6 se
// llega después del 5, con «Saltar a mi primera clase» o con
// `/calendario?primera=1` (el correo «Tu cuenta está activa»); al 7, solo
// publicando.
//
// Igual que la bienvenida de siempre:
//   · el alta se SELLA (`studios.bienvenida_vista_en`) al salir —«Prefiero ir a
//     mi panel» o «Ir a mi panel» en el paso 7— y no antes; un UPDATE fallido no
//     deja a nadie encerrado ni sella a medias;
//   · sin Tenti en los pasos 3 a 6 (el plan lo deja fuera de la bienvenida
//     nueva); en el 7 celebra, como siempre, `ListoParaReservar`.
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
import { PASO_DE_PANTALLA, anteriorPantalla, pidePrimeraClase, siguientePantalla, type PantallaAlta } from '@/lib/alta/bienvenida-nueva';
import type { RespuestaPuedeReservar } from '@/lib/onboarding/puede-reservar';
import { ListoParaReservar } from '@/components/onboarding/listo-para-reservar';
import { sedesDeOnbCentros, type Sedes } from '@/lib/alta/tu-estudio';
import { ErrorGuardado, WhatsAppPersona } from './piezas';
import { PasoCuando, PasoDonde } from './paso-tu-estudio';
import { PasoImportar } from './paso-importar';
import { PasoMarca } from './paso-marca';
import { PrimeraClase } from './primera-clase';
import { guardarPantalla, leerAlta, olvidarPantalla } from './pantalla-guardada';

type Salida = 'panel' | 'terminada';

/** Lo que enseña el paso 7. Sin `veredicto` (recargó la página, o el servidor no pudo comprobarlo), lo vuelve a preguntar. */
interface Publicada { nombre: string | null; veredicto?: RespuestaPuedeReservar; correo: boolean }

/** Dónde empieza: `?primera=1` lleva a la primera clase; si no, donde se quedó. */
function inicio(studioId: string): { pantalla: PantallaAlta; publicada: Publicada | null } {
  const guardada = leerAlta(studioId);
  if (guardada.pantalla === 'publicada') return { pantalla: 'publicada', publicada: { nombre: guardada.clase, correo: false } };
  if (typeof window !== 'undefined' && pidePrimeraClase(window.location.search)) return { pantalla: 'clase', publicada: null };
  return { pantalla: guardada.pantalla, publicada: null };
}

export function BienvenidaNueva({ studio }: { studio: Studio }) {
  const { updateStudio } = useStudio();
  const router = useRouter();
  const [arranque] = useState(() => inicio(studio.id));
  const [pantalla, setPantalla] = useState<PantallaAlta>(arranque.pantalla);
  const [publicada, setPublicada] = useState<Publicada | null>(arranque.publicada);
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
    capturarEvento('bienvenida_paso', { paso: `nueva_${pantalla}`, n: PASO_DE_PANTALLA[pantalla], total: 7, retomado: vistas.current.size === 1 && pantalla !== 'estudio' });
  }, [pantalla]);

  const irA = useCallback((p: PantallaAlta, clase?: string | null) => {
    setPantalla(p);
    guardarPantalla(studio.id, p, clase);
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
  // «Saltar a mi primera clase»: al paso 6, sin salir de la bienvenida.
  const aLaPrimeraClase = useCallback(() => irA('clase'), [irA]);
  const seguir = useCallback((desde: PantallaAlta) => {
    const sig = siguientePantalla(desde);
    if (sig) irA(sig);
    else void sellarYSalir('/dashboard', 'terminada');
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

  const comunes = { studio, saliendo, onSaltar: aLaPrimeraClase };
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
            {pantalla === 'clase' && (
              <PrimeraClase
                studio={studio}
                saliendo={saliendo}
                onAtras={() => atras('clase')}
                onPublicada={r => {
                  setPublicada({ nombre: r.clase.nombre, veredicto: r.veredicto, correo: r.correo });
                  irA('publicada', r.clase.nombre);
                }}
              />
            )}
            {/* Paso 7: «¡Listo!», con la respuesta del servidor que acaba de
                publicar. «Ir a mi panel» (o Escape) sella el alta y va al panel. */}
            {pantalla === 'publicada' && studio.slug && (
              <ListoParaReservar
                slug={studio.slug}
                nombreEstudio={studio.nombre ?? 'tu estudio'}
                clasesCreadas={0}
                nombreClase={publicada?.nombre ?? null}
                veredicto={publicada?.veredicto}
                correoEnviado={publicada?.correo ?? false}
                conQr
                textoSeguir="Ir a mi panel"
                errorSeguir={errorSalir}
                onSeguir={() => void sellarYSalir('/dashboard', 'terminada')}
              />
            )}
          </main>
        </div>
      </PanelThemeProvider>
    </PanelPrivacyProvider>
  );
}
