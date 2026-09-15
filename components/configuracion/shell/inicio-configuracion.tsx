'use client';

import { useEffect, useId, useState, type MouseEvent } from 'react';
import Link from 'next/link';
import { AlertTriangle, ChevronRight, Clock, Search } from 'lucide-react';
import { useStudio } from '@/lib/studio-context';
import { usePanelTheme } from '@/lib/panel-theme';
import { cn } from '@/lib/utils';
import { estadoBilling, fetchLayout, fetchThemePublicado } from '@/lib/api-client';
import { tieneFeature } from '@/lib/billing/entitlements';
import { DEFAULT_THEME } from '@/lib/theme-schema';
import { cardCls, inputCls } from '@/components/configuracion/estilos';
import { hrefDeLugar, hrefDeSeccion, resolverHref } from '@/lib/configuracion/destino';
import { FILAS_EXTERNAS, GRUPOS, type HerramientaId, type SeccionConfiguracion, type SeccionId } from '@/lib/configuracion/secciones';
import {
  resumenPlan, resumenesDeConfiguracion, revisaEsto, type DatosConfiguracion, type EstadoPlanResumible,
} from '@/lib/configuracion/resumenes';
import { buscarAjustes } from '@/lib/configuracion/buscar';
import { calcularOnboarding, datosOnboardingDelEstudio, type PasoOnboarding } from '@/lib/onboarding';
import { calcularProgresoGuia } from '@/lib/guia/progreso';
import { EstadoAjuste } from './estado-ajuste';
import { ICONOS_EXTERNAS, ICONOS_SECCION } from './lista-secciones';
import { esClicNormal } from './contexto';

// ─────────────────────────────────────────────────────────────────────────────
// El inicio de Configuración: cómo está tu estudio, de un vistazo.
//
// El fundador la puntuaba en 55 %: «sigue siendo un poco lioso», «mezcla de
// cosas muy distintas». La lista decía lo que había dentro de cada sección y
// nunca cómo estaba, y a partir de 768 px ni siquiera había lista: se abría la
// primera sección. Aquí, en este orden:
//
//   1. un buscador de ajustes («IVA», «lista de espera»), sin índice aparte
//      (lib/configuracion/buscar.ts);
//   2. «Revisa esto»: lo roto o sin hacer que se puede calcular, como mucho
//      tres. Sin nada que revisar, no se pinta: nunca un «todo bien» de relleno;
//   3. «Pon tu estudio a punto»: el MISMO número que la tarjeta del Inicio y la
//      guía (`calcularProgresoGuia`). Desaparece cuando está hecho;
//   4. las secciones en seis grupos, cada una con su valor de hoy
//      (lib/configuracion/resumenes.ts) y, si toca, su estado. «Tu cuenta»
//      lleva además «Plan de Tentare» y «Mi cuenta», que abren otra pantalla.
//
// Casi todo sale de lo que el panel ya tiene cargado. Lo que no está en
// `useStudio` —cómo va tu plan, el color publicado y dónde va el menú— se lee
// de lo mismo que ya piden la barra superior y el menú; si una lectura falla, su
// fila enseña su descripción y no adivina.
// ─────────────────────────────────────────────────────────────────────────────

const FILA = 'flex min-h-16 items-center gap-3 px-4 py-3 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/50';
const LISTA = cn(cardCls, 'divide-y divide-border overflow-hidden');
const TITULO_GRUPO = 'px-1 text-sm font-semibold text-foreground';
const CAJA_ICONO = 'flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground';

type Abrir = (tab: SeccionId, opciones: { ancla?: string; abrir?: HerramientaId; origen: string }) => void;

export function InicioConfiguracion({
  secciones,
  consulta,
  onConsulta,
  onAbrir,
}: {
  secciones: readonly SeccionConfiguracion[];
  consulta: string;
  onConsulta: (valor: string) => void;
  /** `origen` es el id del enlace pulsado, para devolverle el foco al volver. */
  onAbrir: Abrir;
}) {
  const {
    studio, dataLoaded, salas, tiposClase, planesTarifa, integraciones,
    instructores, sesiones, socios, reservas, suscripciones, automationRules, contenidoPortal,
  } = useStudio();
  const idBuscador = useId();
  const { dark } = usePanelTheme();

  // El plan sale de /api/billing/status, lo mismo que la píldora de la prueba:
  // si se contara con el reloj del navegador, las dos podrían no coincidir. El
  // menú ya está en caché desde que lo pintó la barra lateral.
  const [fuera, setFuera] = useState<{
    plan: EstadoPlanResumible | null;
    colorPropio: boolean | null;
    menuPosition: 'lateral' | 'superior' | null;
  } | null>(null);
  useEffect(() => {
    let vivo = true;
    Promise.allSettled([estadoBilling(), fetchThemePublicado(), fetchLayout()]).then(([plan, tema, layout]) => {
      if (!vivo) return;
      const primario = tema.status === 'fulfilled' ? tema.value?.primary : undefined;
      const posicion = layout.status === 'fulfilled' ? layout.value?.menuPosition : undefined;
      setFuera({
        plan: plan.status === 'fulfilled' ? plan.value : null,
        colorPropio: typeof primario === 'string' ? primario.toLowerCase() !== DEFAULT_THEME.primary.toLowerCase() : null,
        menuPosition: posicion === 'lateral' || posicion === 'superior' ? posicion : null,
      });
    });
    return () => { vivo = false; };
  }, []);

  // Hasta tener los datos no se resume nada: «Sin salas» con las salas aún en
  // camino sería mentira. Las filas enseñan entretanto su descripción.
  const cargado = !!studio && dataLoaded;
  const datos: DatosConfiguracion | null = cargado ? {
    // «Ausente = sí» es lo que dice el tipo para `instructorasCreanClases`: se
    // aplica aquí, en la frontera, para que el módulo puro trate lo ausente como
    // «no se sabe».
    studio: { ...studio, instructorasCreanClases: studio.instructorasCreanClases ?? true },
    numSalas: salas.length,
    numTiposClase: tiposClase.length,
    numPlanesActivos: planesTarifa.filter(p => p.activo).length,
    integraciones,
    // El mismo criterio que la tarjeta de Stripe (tab-integraciones.tsx).
    stripeDisponible: !!process.env.NEXT_PUBLIC_STRIPE_CONNECT_CLIENT_ID,
    colorPropio: fuera?.colorPropio ?? null,
    panel: fuera?.menuPosition ? { menuPosition: fuera.menuPosition, oscuro: dark } : null,
  } : null;
  const resumenes = datos ? resumenesDeConfiguracion(datos) : null;
  const avisos = datos ? revisaEsto(datos) : [];

  const progreso = cargado
    ? calcularProgresoGuia(calcularOnboarding(datosOnboardingDelEstudio({
      studio, instructores, tiposClase, sesiones, socios, reservas,
      salas, planesTarifa, suscripciones, automationRules, contenidoPortal,
    })).categorias)
    : null;
  const aPunto = progreso && progreso.esencialTotal > 0 && progreso.esencialHechos < progreso.esencialTotal ? progreso : null;

  // «Sedes» se busca por lo que dice el plan, no por las sedes que carga «Mi
  // estudio» al abrirse: el buscador no espera a ninguna sección.
  const haySedes = !!studio && (tieneFeature(studio, 'multiCentro') || !!studio.cadenaId);
  const resultados = consulta.trim()
    ? buscarAjustes(consulta, { secciones, haySedes, esCadena: !!studio?.cadenaId })
    : null;

  const abrir = (tab: SeccionId, origen: string, ancla?: string, herramienta?: HerramientaId) => (e: MouseEvent) => {
    if (!esClicNormal(e)) return;
    e.preventDefault();
    onAbrir(tab, { ancla, abrir: herramienta, origen });
  };

  return (
    <div className="tab-content-in space-y-6">
      <div className="space-y-2">
        <label htmlFor={idBuscador} className="sr-only">Buscar un ajuste</label>
        <div className="relative">
          <Search size={18} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            id={idBuscador}
            type="search"
            value={consulta}
            onChange={e => onConsulta(e.target.value)}
            placeholder="Busca un ajuste: IVA, horario, lista de espera…"
            autoComplete="off"
            enterKeyHint="search"
            className={cn(inputCls, 'pl-10')}
          />
        </div>
        {/* Siempre montado: un lector de pantalla solo anuncia los cambios de una
            región que ya existía antes de cambiar. */}
        <p role="status" aria-live="polite" className={cn('px-1 text-sm text-muted-foreground', !resultados && 'sr-only')}>
          {!resultados ? ''
            : resultados.length === 0 ? `Nada con «${consulta.trim()}». Prueba con otra palabra.`
            : `${resultados.length} ${resultados.length === 1 ? 'resultado' : 'resultados'}`}
        </p>
      </div>

      {resultados ? (
        resultados.length > 0 && (
          <ul className={LISTA} aria-label="Resultados de la búsqueda">
            {resultados.map(r => {
              const id = `inicio-buscar-${r.id}`;
              // Una sección se abre por el shell; «Plan de Tentare» es otra pantalla.
              // Una tarjeta de una herramienta abre la pantalla de esa herramienta.
              const enlace = r.seccion
                ? { href: hrefDeLugar({ tab: r.seccion, abrir: r.abrir, ancla: r.ancla }), onClick: abrir(r.seccion, id, r.ancla, r.abrir) }
                : { href: r.href ?? '/configuracion' };
              return (
                <li key={r.id}>
                  <Link id={id} {...enlace} className={FILA}>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-semibold text-foreground">{r.titulo}</span>
                      <span className="block text-sm text-muted-foreground">{r.donde ?? 'Sección de Configuración'}</span>
                    </span>
                    <ChevronRight size={18} className="shrink-0 text-muted-foreground" aria-hidden />
                  </Link>
                </li>
              );
            })}
          </ul>
        )
      ) : (
        <>
          {avisos.length > 0 && (
            <section aria-labelledby="inicio-revisa-titulo" className="space-y-2">
              <h2 id="inicio-revisa-titulo" className={TITULO_GRUPO}>Revisa esto</h2>
              <ul className={LISTA} data-tarjeta-ajuste="">
                {avisos.map(a => {
                  const id = `inicio-revisa-${a.id}`;
                  const Icono = a.tono === 'problema' ? AlertTriangle : Clock;
                  return (
                    <li key={a.id}>
                      <Link id={id} href={hrefDeSeccion(a.seccion, a.ancla)} onClick={abrir(a.seccion, id, a.ancla)} className={FILA}>
                        <span className={cn(CAJA_ICONO, a.tono === 'problema' ? 'bg-destructive/10 text-destructive' : 'bg-warning/12 text-warning')}>
                          <Icono size={18} aria-hidden />
                        </span>
                        <span className="min-w-0 flex-1 text-[15px] font-medium text-foreground">{a.texto}</span>
                        <ChevronRight size={18} className="shrink-0 text-muted-foreground" aria-hidden />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {aPunto && (
            <section aria-labelledby="inicio-a-punto-titulo" className={cn(cardCls, 'space-y-3 p-4')} data-tarjeta-ajuste="">
              <div className="flex items-baseline justify-between gap-3">
                <h2 id="inicio-a-punto-titulo" className="text-[15px] font-semibold text-foreground">Pon tu estudio a punto</h2>
                <span className="shrink-0 text-sm text-muted-foreground tabular-nums">{aPunto.esencialHechos} de {aPunto.esencialTotal}</span>
              </div>
              <div
                role="progressbar"
                aria-label="Pon tu estudio a punto"
                aria-valuemin={0}
                aria-valuemax={aPunto.esencialTotal}
                aria-valuenow={aPunto.esencialHechos}
                aria-valuetext={`${aPunto.esencialHechos} de ${aPunto.esencialTotal}`}
                className="h-2 overflow-hidden rounded-full bg-muted"
              >
                <div className="h-full rounded-full bg-brand" style={{ width: `${aPunto.esencialPct}%` }} />
              </div>
              {aPunto.siguientePaso && <SiguientePaso paso={aPunto.siguientePaso} onAbrir={onAbrir} />}
            </section>
          )}

          {GRUPOS.map(grupo => {
            const suyas = grupo.secciones
              .map(id => secciones.find(s => s.id === id))
              .filter((s): s is SeccionConfiguracion => !!s);
            if (suyas.length === 0 && !grupo.externas?.length) return null;
            return (
              <section key={grupo.id} aria-labelledby={`inicio-grupo-${grupo.id}`} className="space-y-2">
                <h2 id={`inicio-grupo-${grupo.id}`} className={TITULO_GRUPO}>{grupo.titulo}</h2>
                <ul className={LISTA} data-tarjeta-ajuste="">
                  {suyas.map(s => {
                    const Icono = ICONOS_SECCION[s.id];
                    const resumen = resumenes?.[s.id];
                    const id = `inicio-seccion-${s.id}`;
                    return (
                      <li key={s.id}>
                        <Link id={id} href={hrefDeSeccion(s.id)} onClick={abrir(s.id, id)} className={FILA}>
                          <span className={CAJA_ICONO}><Icono size={20} aria-hidden /></span>
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                              <span className="text-[15px] font-semibold text-foreground">{s.titulo}</span>
                              {resumen?.estado && <EstadoAjuste tono={resumen.estado.tono}>{resumen.estado.etiqueta}</EstadoAjuste>}
                            </span>
                            {/* El valor de hoy; si no se sabe, lo que hay dentro. */}
                            <span data-resumen={resumen?.valor ? 'valor' : 'descripcion'} className="line-clamp-2 block text-sm text-muted-foreground">
                              {resumen?.valor ?? s.resumen}
                            </span>
                          </span>
                          <ChevronRight size={18} className="shrink-0 text-muted-foreground" aria-hidden />
                        </Link>
                      </li>
                    );
                  })}
                  {(grupo.externas ?? []).map(idFila => {
                    const f = FILAS_EXTERNAS[idFila];
                    const Icono = ICONOS_EXTERNAS[idFila];
                    const resumen = idFila === 'plan' ? resumenPlan(fuera?.plan) : null;
                    return (
                      <li key={idFila}>
                        <Link id={`inicio-${idFila}`} href={f.href} className={FILA}>
                          <span className={CAJA_ICONO}><Icono size={20} aria-hidden /></span>
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                              <span className="text-[15px] font-semibold text-foreground">{f.titulo}</span>
                              {resumen?.estado && <EstadoAjuste tono={resumen.estado.tono}>{resumen.estado.etiqueta}</EstadoAjuste>}
                            </span>
                            <span data-resumen={resumen?.valor ? 'valor' : 'descripcion'} className="line-clamp-2 block text-sm text-muted-foreground">
                              {resumen?.valor ?? f.resumen}
                            </span>
                          </span>
                          <ChevronRight size={18} className="shrink-0 text-muted-foreground" aria-hidden />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </>
      )}
    </div>
  );
}

/**
 * El siguiente paso de la guía, con su enlace. Si cae dentro de Configuración va
 * por el shell (`onAbrir`): un `router.push` a la misma ruta con otra query
 * dejaba la URL vieja en el build de producción (#2030).
 */
function SiguientePaso({ paso, onAbrir }: { paso: PasoOnboarding; onAbrir: Abrir }) {
  const destino = /^\/configuracion(?:[?#]|$)/.test(paso.href) ? resolverHref(paso.href) : null;
  const tab = destino && !('redirect' in destino) ? destino.tab : null;
  const ancla = destino && !('redirect' in destino) ? destino.ancla : undefined;
  const herramienta = destino && !('redirect' in destino) ? destino.abrir : undefined;
  const id = 'inicio-siguiente-paso';
  return (
    <Link
      id={id}
      href={paso.href}
      {...(paso.externo ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      onClick={e => {
        if (!tab || !esClicNormal(e)) return;
        e.preventDefault();
        onAbrir(tab, { ancla, abrir: herramienta, origen: id });
      }}
      className="-mx-2 flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <span className="min-w-0 flex-1">Siguiente: {paso.label}</span>
      <ChevronRight size={16} className="shrink-0 text-muted-foreground" aria-hidden />
    </Link>
  );
}
