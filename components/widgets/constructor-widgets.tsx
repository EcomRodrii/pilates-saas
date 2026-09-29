'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, ArrowLeft, ArrowRight, ArrowUpRight, Check, CheckCircle2, Globe, Loader2, TrendingUp } from 'lucide-react';
import { useStudio } from '@/lib/studio-context';
import { authHeader } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { LEGAL } from '@/lib/legal-info';
import { btnPrimary, btnSecondary } from '@/components/configuracion/estilos';
import { WIDGETS, widgetPorId, esDisponible, type MetodoIntegracion, type WidgetDisponible } from '@/lib/widgets/catalogo';
import {
  CONFIG_POR_DEFECTO, anchoPopupDe, anchoPorDefecto, esLaMismaCopia, etiquetaEfectiva, fusionarWidgetBuilder, leerConfigs, leerCopiados, nuevaCopia,
  type ConfigConstructor, type Copiado,
} from '@/lib/widgets/config';
import { embudoPorWidget, textoMes, type EmbudoWidget } from '@/lib/widgets/embudo';
import { etiquetasDeCopia, piezaCopiada, webSinAutorizar } from '@/lib/widgets/en-tu-web';
import type { VistoWidget } from '@/lib/widgets/pegado';
import { dbEmbudoWidgetPorOrigen, dbWidgetVistos } from '@/lib/supabase-data';
import { useRol } from '@/lib/permisos';
import { puedeGestionarPortalHome, puedeVer } from '@/lib/permisos-reglas';
import {
  botonSigueElEstilo, conVistaPrevia, faltaParaGenerar, firmaContenidoDe, urlEmbebido, urlPagina, type EntradaIntegracion,
} from '@/lib/widgets/integracion';
import { urlPopupPermitida } from '@/lib/widgets/popup-url';
import { piezasAfectadas } from '@/lib/widgets/estilo-afectados';
import { colorDeLaWeb } from '@/lib/reservar/estilo-web-tipos';
import { nadaParaSinMarco } from '@/lib/widget/estilo-nativa';
import { botonDeLaVentana } from '@/lib/reservar/estilo-web';
import {
  direccionLegible, leerWeb, metodoEnWeb, nombrePlataforma, receta as recetaDe, usaBotonPropio, type EstadoWeb, type PlataformaWeb,
} from '@/lib/widgets/recetas';
import { frasePlazoCancelacion, fraseAntelacionMinima, fraseAntelacionMaxima } from '@/lib/reservar/promesas';
import type { TipoPlan } from '@/lib/types';
import { FOCO, TACTIL, fechaCorta } from './piezas';
import { PasoPlataforma } from './paso-plataforma';
import { PasoQue, type AvisoDeDatos, type DatosPanel, type EstadoCopias } from './paso-que';
import { PasoComo } from './paso-como';
import { PasoPonlo } from './paso-ponlo';
import { LoQueTienes, type FilaTienes } from './lo-que-tienes';
import { useEstiloWeb } from './usar-estilo-web';
import { BotonEnTuWeb, VistaPrevia, type Contenido, type Dispositivo, type FormaPrevia } from './vista-previa';
import { PreviewNativa } from './preview-nativa';
import { GestionDominios } from './dominios';

// «Tentare Widgets»: el constructor, en el orden en que lo piensa la dueña de
// un estudio —con qué está hecha su web (una vez), qué pone y dónde, cómo se
// ve, y ponerlo—. Tentare no hace la web del estudio: le da piezas que
// funcionan de verdad para meter en la suya.
//
// ⚠️ La config efectiva viaja CONGELADA en el código copiado (decisión de
// producto del 2026-08-20, no reabrir): esto guarda en `studios.widget_builder`
// solo para no perder lo ajustado al volver. Guardado con debounce y SOLO tras
// una edición — nunca al montar (fijar línea base al cargar escribe datos que
// nadie tocó). Y FUSIONANDO sobre lo que había (`fusionarWidgetBuilder`): ahí
// viven también `_web` y la huella de lo copiado.
//
// ⚠️ Los tres pasos están SIEMPRE montados y solo se oculta el que no toca:
// el código (su <pre>) tiene que estar en el DOM desde el principio, también
// mientras se contesta la pregunta de la web.
//
// El ESTILO de sus widgets (Fase B, 28-sep-2026) es otra cosa: no va en el
// código ni en `widget_builder`, sino en el tema publicado, y se aplica con su
// botón (./usar-estilo-web.ts). Por eso su borrador vive aquí arriba: lo leen la
// vista previa, «Cómo se ve» y «Ponlo en tu web», y no depende del widget abierto.
//
// «Lo que tienes en tu web» (Fase C, 28-sep-2026) es la portada cuando ya ha
// copiado algo: un paso más (`'tienes'`) en estado de React, nunca en la URL
// (escribir `&paso=` rompería los enlaces que ya traen aquí). Se decide SOLO con
// lo copiado, que se sabe al montar: lo visto en su web llega después, y
// decidir con eso haría saltar la pantalla. Se monta y se desmonta; los tres
// pasos siguen montados debajo, ocultos, con el código en el DOM.
//
// El botón que abre la ventana (Fase D, 29-sep-2026) sigue ese estilo en vivo:
// el código lleva variables CSS y, de respaldo, el botón como se ve HOY en su
// web —lo PUBLICADO, nunca el borrador: es lo que pintará mientras no llegue el
// de ahora—. La vista previa, en cambio, pinta el borrador. Y al copiar se
// marca si lo copiado lee esas variables (`copiado.botonVivo`), con el mismo
// predicado que las emite: es lo único que dice si un botón pegado cambia solo.
//
// Sin marco (Fase E, 29-sep-2026) el estilo también llega, con sus datos: la
// vista previa pinta el borrador con las mismas funciones que el bundle, y al
// copiar se guarda la versión que dirá ver su web (`firmaContenidoDe`).
//
// ⚠️ El color del estudio es el del TEMA (`estiloWeb.base.colorPrimario`, lo que
// elige en Marca), no la columna `studios.color_primario`: en casi todos los
// estudios esa columna es el índigo que escribe el alta y no ha elegido nadie
// (lib/emails/color-marca.ts). La columna, solo mientras carga el tema. Con él
// se pintan el botón a su página en el código (su `style`, que `firmaCodigo` no
// cuenta), la vista previa y las muestras.

const ORIGEN_POR_DEFECTO = new URL(LEGAL.url).origin;
const HORARIO = WIDGETS.find((x): x is WidgetDisponible => x.id === 'horario' && x.estado === 'disponible')!;
const COLOR_POR_DEFECTO = '#343825';
/** El lienzo de la vista previa con un diseño propio «para una web oscura». */
const FONDO_WEB_OSCURA = '#1C1D1A';

type Paso = 'tienes' | 'plataforma' | 'que' | 'como' | 'ponlo';
// Sin web no hay dónde «ponerlo»: el último paso se llama por lo que hace.
function pasosDe(plataforma: PlataformaWeb | null): readonly { id: Exclude<Paso, 'plataforma'>; nombre: string; siguiente: string }[] {
  const ponlo = plataforma === 'sinweb' ? 'Compártelo' : 'Ponlo en tu web';
  return [
    { id: 'que', nombre: 'Qué y dónde', siguiente: 'Siguiente: qué y dónde' },
    { id: 'como', nombre: 'Cómo se ve', siguiente: 'Siguiente: cómo se ve' },
    { id: 'ponlo', nombre: ponlo, siguiente: `Siguiente: ${ponlo.toLowerCase()}` },
  ];
}
type EstadoGuardado = 'guardando' | 'guardado' | 'error' | null;
interface Guardable { configs: Record<string, ConfigConstructor>; copiados: Record<string, Copiado>; web: EstadoWeb }

/** Algo copiado de un widget que sigue existiendo: con eso hay portada. */
const hayCopias = (copiados: Readonly<Record<string, Copiado>>) => Object.keys(copiados).some(id => esDisponible(widgetPorId(id)));

export function ConstructorWidgets({ slug, showToast, onVerResultados }: {
  slug: string;
  showToast: (m: string) => void;
  /**
   * Lleva a «Cómo le va a tu página», centrada en la fila de esa etiqueta
   * (`null`: sin etiqueta que medir, se abre sin centrar en ninguna).
   */
  onVerResultados?: (etiqueta: string | null) => void;
}) {
  const { sesiones, tiposClase, salas, instructores, planesTarifa, citasServicios, studio, updateStudio, reflejarStudioGuardado } = useStudio();
  const origen = typeof window !== 'undefined' ? window.location.origin : ORIGEN_POR_DEFECTO;
  const rol = useRol();
  const estiloWeb = useEstiloWeb();

  const [activoId, setActivoId] = useState('horario');
  const elegido = widgetPorId(activoId);
  const w = esDisponible(elegido) ? elegido : HORARIO;

  const [configs, setConfigs] = useState<Record<string, ConfigConstructor>>(() => leerConfigs(studio?.widgetBuilder));
  const [copiados, setCopiados] = useState<Record<string, Copiado>>(() => leerCopiados(studio?.widgetBuilder));
  const [web, setWeb] = useState<EstadoWeb>(() => leerWeb(studio?.widgetBuilder));
  const [paso, setPaso] = useState<Paso>(() => {
    if (!leerWeb(studio?.widgetBuilder).plataforma) return 'plataforma';
    return hayCopias(leerCopiados(studio?.widgetBuilder)) ? 'tienes' : 'que';
  });
  const config = configs[w.id] ?? CONFIG_POR_DEFECTO;

  // ── Guardado ──
  const [guardado, setGuardado] = useState<EstadoGuardado>(null);
  const ultimo = useRef<Guardable>({ configs, copiados, web });
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (temporizador.current) clearTimeout(temporizador.current); }, []);
  function guardar(parcial: Partial<Guardable>, inmediato = false) {
    ultimo.current = { ...ultimo.current, ...parcial };
    setGuardado('guardando');
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = setTimeout(() => {
      const u = ultimo.current;
      const widgetBuilder = fusionarWidgetBuilder(studio?.widgetBuilder, u.configs, u.copiados, u.web);
      void updateStudio({ widgetBuilder }).then(r => {
        // Sin toast de error a propósito: perder esta comodidad no rompe nada
        // (el código copiado sigue valiendo). Se dice aquí, en voz baja.
        setGuardado(r.ok ? 'guardado' : 'error');
      });
    }, inmediato ? 0 : 1200);
  }
  function cambiar(parcial: Partial<ConfigConstructor>) {
    const siguientes = { ...configs, [w.id]: { ...config, ...parcial } };
    setConfigs(siguientes);
    guardar({ configs: siguientes });
  }
  function contestarWeb(nueva: EstadoWeb) {
    setWeb(nueva);
    guardar({ web: nueva }, true);
    irA(pasoAnterior === 'tienes' ? 'tienes' : 'que');
  }

  // ── Pasos ──
  const contenedores = useRef<Partial<Record<Paso, HTMLDivElement | null>>>({});
  // Si abre «Cambiar» y se arrepiente, vuelve a donde estaba.
  const [pasoAnterior, setPasoAnterior] = useState<Paso>('que');
  function irA(p: Paso) {
    setPaso(p);
    // Al paso nuevo, con el foco: se anuncia y queda a la vista.
    requestAnimationFrame(() => contenedores.current[p]?.focus());
  }

  const plataforma = web.plataforma;
  const colorEstudio = estiloWeb.base?.colorPrimario ?? studio?.colorPrimario ?? null;
  const receta = recetaDe(plataforma, w);
  const metodo = metodoEnWeb(config, w, plataforma);
  const elegirMetodo = (m: MetodoIntegracion) => cambiar({ metodo: m });

  // El mes de cada widget, por su etiqueta (lib/widgets/embudo.ts). Solo para
  // quien puede ver el embudo (la RLS de widget_eventos: PROPIETARIO/MANAGER).
  const veResultados = puedeGestionarPortalHome(rol);
  const [resultadosMes, setResultadosMes] = useState<EmbudoWidget[] | null>(null);
  // Dónde se ha visto cada pieza (Fase C), con las etiquetas que se pidieron
  // (se pide filtrado: ver `etiquetasVistas`, más abajo). `undefined` mientras
  // llega lo primero (o sin permiso: ni se pide) y `filas: null` si falla: en
  // los dos casos la portada no dice nada de su web. «Aún no lo vemos» sería
  // mentira, y a quien la RLS no deja leer le llega `[]`, no un error.
  const [vistos, setVistos] = useState<{ etiquetas: readonly string[]; filas: VistoWidget[] | null } | undefined>(undefined);
  // Lo visto espera al mes: con visitas este mes y nada visto, la fila dice
  // «aún no sabemos desde qué web», y antes del mes diría un momento «Aún no lo
  // vemos». La lectura del mes se guarda aquí para que la espere.
  const mesLeido = useRef<Promise<unknown> | null>(null);
  useEffect(() => {
    if (!veResultados) return;
    const hoy = new Date();
    const desde = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-01`;
    let vivo = true;
    mesLeido.current = dbEmbudoWidgetPorOrigen(desde).then(filas => { if (vivo && filas) setResultadosMes(embudoPorWidget(filas)); });
    return () => { vivo = false; };
  }, [veResultados]);

  // Un tipo, una instructora o una sala borrados después de guardarse no se
  // cuelan en el código: un filtro por un id que ya no existe dejaría el
  // horario vacío sin que nadie entienda por qué.
  const instructorasActivas = useMemo(() => instructores.filter(i => i.activo), [instructores]);
  const vigentes = useMemo<Vigentes>(() => ({
    tipos: new Set(tiposClase.map(t => t.id)),
    instructoras: new Set(instructorasActivas.map(i => i.id)),
    salas: new Set(salas.map(s => s.id)),
  }), [tiposClase, instructorasActivas, salas]);
  const configEfectiva = useMemo(() => sinHuerfanos(config, vigentes), [config, vigentes]);

  // Sin useMemo a mano: el React Compiler ya memoiza, y uno manual sobre `w`
  // (un objeto del catálogo) le impide optimizar el componente entero.
  // `botonVivo`: el respaldo del botón del popup en el código, con lo PUBLICADO
  // (mientras carga, `null`: el de siempre, `colorBoton`).
  const entrada: EntradaIntegracion = {
    widget: w, config: configEfectiva, origen, slug, colorEstudio,
    botonVivo: estiloWeb.base ? botonDeLaVentana(estiloWeb.publicado, estiloWeb.base) : null,
  };

  // Al copiar se guarda, además de la huella, la forma, una foto de la config
  // (sin huérfanos), la versión que verá la página y si su botón sigue el
  // estilo: con eso la portada dice QUÉ cambió y qué hay en su web. Copiar otra
  // vez lo mismo en menos de un minuto (el botón y después a mano, o dos
  // Ctrl+C) no se vuelve a guardar.
  function registrarCopia(firma: string) {
    const nueva = nuevaCopia(copiados[w.id], {
      firma, en: new Date().toISOString(), metodo, config: configEfectiva, contenido: firmaContenidoDe(entrada, metodo),
      botonVivo: botonSigueElEstilo(configEfectiva, metodo),
    });
    if (esLaMismaCopia(copiados[w.id], nueva)) return;
    const siguientes = { ...copiados, [w.id]: nueva };
    setCopiados(siguientes);
    guardar({ copiados: siguientes }, true);
  }

  // `Date.now()` no puede llamarse en render (pureza del React Compiler): se
  // fija tras montar. Es una pantalla de configuración, no un reloj.
  const [ahora, setAhora] = useState<number | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Guarda de hidratación: `Date.now()` no puede llamarse en render, así que se fija tras montar. El segundo render es el OBJETIVO.
    setAhora(Date.now());
  }, []);
  const tiposPorId = useMemo(() => new Map(tiposClase.map(t => [t.id, t.nombre])), [tiposClase]);
  const proximasClases = useMemo(() => {
    if (ahora === null) return [];
    return sesiones
      .filter(s => !s.cancelada && new Date(s.inicio).getTime() > ahora)
      .sort((a, b) => new Date(a.inicio).getTime() - new Date(b.inicio).getTime())
      .slice(0, 60)
      .map(s => {
        const inicio = new Date(s.inicio);
        return {
          id: s.id,
          etiqueta: `${tiposPorId.get(s.tipoClaseId) ?? 'Clase'} — ${inicio.toLocaleString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' })}`,
          cuando: inicio.toLocaleString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' }),
        };
      });
  }, [sesiones, ahora, tiposPorId]);

  const planesContratables = useMemo(() => planesTarifa.filter(p => p.activo && p.precio > 0 && p.esPrueba !== true), [planesTarifa]);
  const datos: DatosPanel = useMemo(() => {
    const planesPorTipo: Record<TipoPlan, number> = { MENSUAL: 0, BONO: 0, PUNTUAL: 0 };
    for (const p of planesContratables) planesPorTipo[p.tipo] += 1;
    const reglasEstudio = {
      cancelacionVentanaHoras: studio?.cancelacionVentanaHoras ?? 0,
      reservaVentanaMinimaMinutos: studio?.reservaVentanaMinimaMinutos ?? 0,
      reservaAntelacionMaximaDias: studio?.reservaAntelacionMaximaDias ?? null,
    };
    const reglas = [
      frasePlazoCancelacion(reglasEstudio, tiposClase),
      fraseAntelacionMinima(reglasEstudio, tiposClase),
      fraseAntelacionMaxima(reglasEstudio, tiposClase),
      studio?.permiteListaEspera === false ? 'Sin lista de espera: una clase llena no admite más.' : 'Con la clase llena, se apuntan a la lista de espera.',
      studio?.requiereAprobacion ? 'Cada reserva espera tu visto bueno.' : null,
      studio?.reservaExigirPlan ? 'Para reservar hace falta un plan o bono activo.' : null,
    ].filter((r): r is string => !!r);
    return {
      tiposClase: tiposClase.map(t => ({ id: t.id, nombre: t.nombre })),
      instructoras: instructorasActivas.map(i => ({ id: i.id, nombre: i.nombre })),
      salas: salas.map(s => ({ id: s.id, nombre: s.nombre })),
      proximasClases,
      planesPorTipo,
      colorEstudio: colorEstudio ?? COLOR_POR_DEFECTO,
      reglas,
    };
  }, [tiposClase, instructorasActivas, salas, proximasClases, planesContratables, studio, colorEstudio]);

  // Los dominios del widget los valida y guarda el servidor (solo la
  // propietaria, migr 20260914011356); aquí se pinta lo que devolvió.
  async function guardarDominios(dominios: string[]): Promise<{ ok: boolean; error?: string }> {
    try {
      const res = await fetch('/api/estudio/widget-dominios', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify({ dominios }),
      });
      const data = await res.json().catch(() => null) as { dominios?: unknown; error?: string } | null;
      if (!res.ok || !Array.isArray(data?.dominios)) return { ok: false, error: data?.error ?? 'No se han podido guardar los dominios' };
      reflejarStudioGuardado({ widgetDominiosAutorizados: data.dominios as string[] });
      return { ok: true };
    } catch {
      return { ok: false, error: 'No se han podido guardar los dominios. Revisa tu conexión.' };
    }
  }
  const dominiosAutorizados = studio?.widgetDominiosAutorizados ?? [];
  const direccionWeb = web.direccion ?? direccionLegible(studio?.sitioWeb);

  // ── Lo copiado: ¿sigue siendo lo de ahora, y qué se ve en su web? ──
  // De CADA widget copiado, no solo del abierto: si cambió otro y vuelve otro
  // día, su fila en la portada y su tarjeta en «¿Qué quieres poner en tu web?»
  // se lo dicen. El MISMO `desfasado` en las dos, en la cabecera y en «Ponlo en
  // tu web» (`piezaCopiada`, lib/widgets/en-tu-web.ts).
  const copias: Record<string, EstadoCopias[string]> = {};
  const filasTienes: FilaTienes[] = [];
  // Las configs de lo copiado con lo de ahora (sin huérfanos): con ellas rehace
  // su firma la confirmación de «Aplicar en mi web» (`piezasAfectadas`).
  const configsCopiadas: Record<string, ConfigConstructor> = {};
  // Lo que se pide a `widget_vistos()`: lo copiado y lo de ahora de cada pieza.
  const pedir = new Set<string>();
  for (const [id, k] of Object.entries(copiados)) {
    const otro = widgetPorId(id);
    if (!esDisponible(otro)) continue;
    const c = id === w.id ? configEfectiva : sinHuerfanos(configs[id] ?? CONFIG_POR_DEFECTO, vigentes);
    configsCopiadas[id] = c;
    const m = metodoEnWeb(c, otro, plataforma);
    const e: EntradaIntegracion = { ...entrada, widget: otro, config: c };
    for (const t of etiquetasDeCopia(k, e)) pedir.add(t);
    const p = piezaCopiada({
      copia: k, base: e, metodoAhora: m, puedeGenerar: !faltaParaGenerar(e, m, { dominiosAutorizados }),
      vistos: vistos?.filas, leidas: vistos?.etiquetas,
      esperandoVistos: veResultados && vistos === undefined,
      mes: resultadosMes, ahora,
    });
    copias[id] = { en: k.en, desfasado: p.desfasado };
    filasTienes.push({
      id, nombre: otro.nombre, icono: otro.icono, en: k.en, pieza: p,
      mes: resultadosMes && p.etiqueta ? textoMes(p.mes) : null,
      esEnlace: m === 'enlace' || (m === 'boton' && usaBotonPropio(plataforma)),
      // Solo la dirección que ELLA nos dio: nunca se ofrece autorizar otra.
      webSinAutorizar: p.metodo === 'nativa' ? webSinAutorizar(direccionWeb, dominiosAutorizados) : null,
      // La lista solo se pinta con la nativa de AHORA («Ponlo en tu web»).
      conListaDeWebs: m === 'nativa',
    });
  }
  // Una cadena y no la lista, para que el efecto dependa de lo que se pide y no
  // de un array nuevo en cada render. Las etiquetas no llevan espacios
  // (ETIQUETA_VALIDA).
  const etiquetasVistas = [...pedir].sort().join(' ');
  // Se vuelve a pedir si cambian (copia algo nuevo, o cambia una etiqueta):
  // lo leído no dice nada de una etiqueta que no se pidió (`leidas`). Mientras
  // tanto se queda lo anterior, y tras la primera lectura se espera a que deje
  // de escribir para no pedir una vez por letra.
  const vistosLeidos = useRef(false);
  useEffect(() => {
    if (!veResultados) return;
    const etiquetas = etiquetasVistas ? etiquetasVistas.split(' ') : [];
    let vivo = true;
    const t = setTimeout(() => {
      void Promise.all([dbWidgetVistos(etiquetas), mesLeido.current])
        .then(([filas]) => filas, () => null)
        .then(filas => {
          vistosLeidos.current = true;
          if (vivo) setVistos({ etiquetas, filas });
        });
    }, vistosLeidos.current ? 600 : 0);
    return () => { vivo = false; clearTimeout(t); };
  }, [veResultados, etiquetasVistas]);
  const copia = copiados[w.id] ?? null;
  const desfase = !!copias[w.id]?.desfasado;
  const conCopias = filasTienes.length > 0;

  // El mes del widget abierto, por la etiqueta con la que se COPIÓ: es la que
  // lleva lo que hay en su web (si la cambió después, la de ahora aún no mide nada).
  const filaActiva = filasTienes.find(f => f.id === w.id);
  const etiquetaActiva = filaActiva ? filaActiva.pieza.etiqueta : etiquetaEfectiva(configEfectiva, w);
  const resultadoActivo = resultadosMes && etiquetaActiva
    ? resultadosMes.find(r => r.etiqueta === etiquetaActiva) ?? null
    : null;

  // ── Vista previa ──
  const [dispositivo, setDispositivo] = useState<Dispositivo>(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 720px)').matches ? 'movil' : 'escritorio');
  // Con cualquier dominio dado por bueno, lo único que puede faltar para
  // enseñarlo es la clase. Con su propio texto: aquí no se habla de código.
  const faltaPrevia = faltaParaGenerar(entrada, metodo, { dominiosAutorizados: ['*'] })
    ? 'Elige la clase y aquí verás cómo queda.'
    : null;
  const paginaCompleta = metodo === 'boton' || metodo === 'enlace';
  const urlReal = paginaCompleta ? urlPagina(entrada) : urlEmbebido(entrada, metodo);
  // El estilo de sus widgets que está probando, solo mientras no lo aplica:
  // aplicado, la previa ya lo recibe del servidor como cualquier web.
  const borradorWeb = estiloWeb.pendiente ? estiloWeb.borrador : undefined;
  const urlConBorrador = conVistaPrevia(urlReal, borradorWeb ? { borradorWeb } : undefined);
  // La ventana de verdad la abre /widget-popup.js con `ventana=1` (ahí el
  // estilo no se funde): la previa carga exactamente la misma URL que ella.
  const urlPrevia = metodo === 'popup' ? urlPopupPermitida(urlConBorrador, origen) ?? urlConBorrador : urlConBorrador;
  // Un color a medio elegir recargaría la vista previa a cada paso: se espera
  // a que se deje de tocar. El código sí cambia al momento.
  const [srcPrevia, setSrcPrevia] = useState(urlPrevia);
  useEffect(() => {
    const t = setTimeout(() => setSrcPrevia(urlPrevia), 350);
    return () => clearTimeout(t);
  }, [urlPrevia]);
  // Tras aplicar o deshacer, sin esperar: la vista previa se vuelve a montar
  // (ver su `key`) y tiene que cargar ya lo publicado, no el borrador de antes
  // para recargar otra vez 350 ms después.
  const [versionPrevia, setVersionPrevia] = useState(estiloWeb.version);
  if (versionPrevia !== estiloWeb.version) {
    setVersionPrevia(estiloWeb.version);
    setSrcPrevia(urlPrevia);
  }

  let contenido: Contenido | null = null;
  if (!faltaPrevia) {
    contenido = metodo === 'nativa'
      ? {
        tipo: 'componente',
        // El estilo que está probando (o, sin borrador, lo que hay en su web): lo mismo que la previa del iframe.
        nodo: <PreviewNativa slug={slug} config={configEfectiva} estilo={borradorWeb ?? estiloWeb.publicado} base={estiloWeb.base} colorEstudio={colorEstudio} />,
      }
      : { tipo: 'iframe', src: srcPrevia, titulo: w.nombre, origen, slug, altoInicial: paginaCompleta ? 900 : w.alto };
  }
  const anchoWidget = metodo === 'iframe'
    ? ((configEfectiva.ancho ?? anchoPorDefecto(w, configEfectiva)) === 'compacto' ? 480 : null)
    : metodo === 'popup' ? anchoPopupDe(w, configEfectiva) : null;
  const botonPropio = metodo === 'boton' && usaBotonPropio(plataforma);
  // El botón de la previa, con el estilo que está PROBANDO (el código lleva lo publicado).
  const entradaPrevia: EntradaIntegracion = {
    ...entrada,
    botonVivo: estiloWeb.base ? botonDeLaVentana(borradorWeb ?? estiloWeb.publicado, estiloWeb.base) : entrada.botonVivo,
  };
  const forma: FormaPrevia = metodo === 'popup' || metodo === 'boton'
    ? {
      tipo: 'boton',
      boton: <BotonEnTuWeb entrada={entradaPrevia} metodo={metodo} botonPropio={botonPropio} borradorWeb={borradorWeb} />,
      pista: botonPropio
        ? 'Es el botón de tu propia web con tu enlace: se verá como el resto de tus botones.'
        : metodo === 'popup' ? 'Púlsalo: se abre encima, como pasará en tu web.' : 'Púlsalo: lleva a tu página de reservas.',
      alPulsar: metodo === 'popup' ? 'Al pulsarlo, se abre encima de tu web:' : 'Al pulsarlo, se abre tu página de reservas:',
      abrePagina: metodo === 'boton',
    }
    : metodo === 'enlace' ? { tipo: 'enlace' } : { tipo: 'dentro' };
  const suWeb = {
    direccion: direccionWeb,
    nombre: studio?.nombre ?? 'Tu estudio',
    color: colorEstudio ?? COLOR_POR_DEFECTO,
    // El de «¿Cómo es tu web?» (el borrador: lo está contestando ahora). Un
    // diseño propio para una web oscura manda sobre él: es de este widget.
    fondo: configEfectiva.identidad === 'propia' && configEfectiva.tema === 'oscuro' ? FONDO_WEB_OSCURA : colorDeLaWeb(estiloWeb.borrador),
  };
  // Lo que nombra la confirmación: solo lo copiado que sigue siendo el código de
  // ahora, y a qué le llega el borrador que se va a aplicar (el botón de la
  // ventana, solo si se ve distinto que con lo publicado).
  const piezas = piezasAfectadas({
    configs: configsCopiadas, copiados, plataforma, origen, slug, colorEstudio,
    estilo: estiloWeb.borrador, publicado: estiloWeb.publicado, base: estiloWeb.base,
  });

  const ofertasPrueba = planesTarifa.filter(p => p.activo && p.esPrueba === true);
  const avisos = avisosDeDatos(w.id, {
    pruebas: ofertasPrueba.length,
    pruebaDePago: ofertasPrueba.some(p => p.precio > 0),
    stripe: !!studio?.stripeAccountId,
    planes: planesContratables.length,
    bonos: planesContratables.filter(p => p.tipo === 'BONO').length,
    citas: citasServicios.filter(s => s.activo && s.autoReservable).length,
  });

  // La portada no tiene pasos, ni vista previa, ni el aviso de cabecera: cada
  // fila lleva el suyo.
  const conPrevia = paso !== 'plataforma' && paso !== 'tienes';
  const pasos = pasosDe(plataforma);
  const indice = pasos.findIndex(p => p.id === paso);
  // Un paso anterior solo lleva ✓ si de verdad está hecho: sin la clase de
  // «Una clase concreta», «Qué y dónde» no lo está.
  const hecho = (id: Paso, i: number) => i < indice && !(id === 'que' && faltaPrevia);

  // ── La portada: qué hace cada botón ──
  function abrirPieza(id: string, p: Paso) {
    setActivoId(id);
    irA(p);
  }
  // «Ir a las webs autorizadas»: la lista vive en «Ponlo en tu web», dentro del
  // pliegue «Para quien te hace la web» (y solo con la nativa, por eso la fila
  // no enseña el botón con otra forma). Se abre el pliegue (`verDominios`) y se
  // lleva allí el foco, que la pone a la vista: dejarla en el paso con el
  // pliegue cerrado era mandarla a buscarla.
  const dominiosRef = useRef<HTMLDivElement | null>(null);
  const [verDominios, setVerDominios] = useState(false);
  function irAWebsAutorizadas(id: string) {
    setActivoId(id);
    setPaso('ponlo');
    setVerDominios(true);
    // Tras pintar el paso: el pliegue ya está abierto (su efecto corre al
    // confirmar el clic, antes del siguiente fotograma).
    requestAnimationFrame(() => {
      const lista = dominiosRef.current;
      if (lista) {
        lista.focus({ preventScroll: true });
        lista.scrollIntoView({ block: 'center' });
      } else {
        contenedores.current.ponlo?.focus();
      }
      // Se suelta: la próxima vez que lo pida, vuelve a abrirlo aunque lo cerrara.
      setVerDominios(false);
    });
  }
  function ponerOtraCosa() {
    // Lo primero que aún no tiene: lo más probable es que venga a por eso.
    const libre = WIDGETS.find((x): x is WidgetDisponible => esDisponible(x) && !!x.principal && !(x.id in copiados));
    if (libre) setActivoId(libre.id);
    irA('que');
  }

  return (
    <div className="space-y-5">
      {paso !== 'plataforma' && (
        <div className="space-y-3">
          {conPrevia && conCopias && (
            <button
              type="button"
              onClick={() => irA('tienes')}
              className={cn(TACTIL, 'gap-1.5 text-[12.5px] font-medium text-foreground underline underline-offset-2 hover:no-underline', FOCO)}
            >
              <ArrowLeft size={14} aria-hidden />Lo que tienes en tu web
            </button>
          )}
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1">
            <p className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-[12.5px] text-muted-foreground">
              <Globe size={14} aria-hidden />
              <span className="min-w-0 [overflow-wrap:anywhere]">Tu web: <strong className="font-semibold text-foreground">{plataforma ? nombrePlataforma(plataforma) : 'sin decir'}</strong>{direccionWeb && plataforma !== 'sinweb' ? ` · ${direccionWeb}` : ''}</span>
              <button
                type="button"
                onClick={() => { setPasoAnterior(paso); irA('plataforma'); }}
                aria-label="Cambiar con qué está hecha tu web"
                className={cn('min-h-11 px-1 font-medium text-foreground underline underline-offset-2 hover:no-underline [@media(pointer:fine)]:min-h-8', FOCO)}
              >
                Cambiar
              </button>
            </p>
            {conPrevia && resultadosMes && etiquetaActiva && (
              <ResumenMes resultado={resultadoActivo} onVer={onVerResultados ? () => onVerResultados(etiquetaActiva) : undefined} />
            )}
          </div>
          {conPrevia && (
            <nav aria-label="Pasos" className="flex flex-wrap gap-2">
              {pasos.map((p, i) => {
                const actual = p.id === paso;
                return (
                  <button
                    key={p.id}
                    type="button"
                    aria-current={actual ? 'step' : undefined}
                    onClick={() => irA(p.id)}
                    className={cn(
                      'inline-flex min-h-11 items-center gap-2 rounded-full border py-1 pl-1.5 pr-3.5 text-[12.5px] font-medium transition-colors',
                      actual ? 'border-foreground/70 bg-card text-foreground shadow-xs' : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground',
                      FOCO,
                    )}
                  >
                    <span aria-hidden className={cn('flex size-7 items-center justify-center rounded-full text-[12px] font-semibold', actual ? 'bg-foreground text-background' : 'bg-muted')}>
                      {hecho(p.id, i) ? <Check size={13} /> : i + 1}
                    </span>
                    {p.nombre}
                  </button>
                );
              })}
            </nav>
          )}
          {conPrevia && <EstadoGuardadoLinea estado={guardado} />}
        </div>
      )}

      {conPrevia && desfase && copia && (
        <div aria-live="polite" className="flex items-start gap-2.5 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-[13px] leading-relaxed text-foreground">
          <AlertCircle size={16} aria-hidden className="mt-0.5 shrink-0 text-warning" />
          <div className="min-w-0">
            <p>
              <strong>Has cambiado algo que va en el código después de copiarlo el {fechaCorta(copia.en)}.</strong>{' '}
              Tu web sigue con lo de antes hasta que copies el código nuevo y lo pegues en lugar del anterior.
            </p>
            {paso !== 'ponlo' && (
              <button type="button" onClick={() => irA('ponlo')} className={cn(TACTIL, 'font-semibold underline underline-offset-2 hover:no-underline', FOCO)}>
                Ir a copiarlo
              </button>
            )}
          </div>
        </div>
      )}

      <div className={cn('grid items-start gap-6', conPrevia && '@4xl/config:grid-cols-[minmax(0,1fr)_minmax(0,0.92fr)]')}>
        <div className="min-w-0 space-y-4">
          {paso === 'tienes' && (
            <div ref={el => { contenedores.current.tienes = el; }} tabIndex={-1} className="outline-none">
              <LoQueTienes
                filas={filasTienes}
                ahora={ahora}
                estilo={estiloWeb}
                onCambiar={id => abrirPieza(id, 'que')}
                onCopiarNuevo={id => abrirPieza(id, 'ponlo')}
                onEstiloComun={id => abrirPieza(id, 'como')}
                onWebsAutorizadas={irAWebsAutorizadas}
                onCambiarEstilo={() => irA('como')}
                onOtraCosa={ponerOtraCosa}
                onVerResultados={veResultados ? onVerResultados : undefined}
              />
            </div>
          )}
          {paso === 'plataforma' && (
            <div ref={el => { contenedores.current.plataforma = el; }} tabIndex={-1} className="outline-none">
              <PasoPlataforma
                web={web}
                sitioWeb={studio?.sitioWeb ?? null}
                onContestar={contestarWeb}
                onCancelar={plataforma ? () => irA(pasoAnterior) : undefined}
              />
            </div>
          )}
          <div ref={el => { contenedores.current.que = el; }} tabIndex={-1} hidden={paso !== 'que'} className="outline-none">
            <PasoQue
              w={w}
              c={configEfectiva}
              metodo={metodo}
              plataforma={plataforma}
              receta={receta}
              cambiar={cambiar}
              datos={datos}
              avisos={avisos}
              copias={copias}
              onElegirWidget={setActivoId}
              onMetodo={elegirMetodo}
            />
          </div>
          <div ref={el => { contenedores.current.como = el; }} tabIndex={-1} hidden={paso !== 'como'} className="outline-none">
            <PasoComo
              key={w.id}
              w={w}
              c={configEfectiva}
              metodo={metodo}
              plataforma={plataforma}
              cambiar={cambiar}
              colorEstudio={datos.colorEstudio}
              estilo={estiloWeb}
              // Lo aplica solo la propietaria, igual que decide el servidor
              // (`/api/estudio/widget-estilo`): el resto lo ve sin poder tocarlo.
              soloLectura={rol !== 'PROPIETARIO'}
              verApariencia={puedeVer(rol, '/configuracion/apariencia')}
              piezas={piezas}
            />
          </div>
          <div ref={el => { contenedores.current.ponlo = el; }} tabIndex={-1} hidden={paso !== 'ponlo'} className="outline-none">
            <PasoPonlo
              key={w.id}
              entrada={entrada}
              metodo={metodo}
              plataforma={plataforma}
              receta={receta}
              estudio={studio?.nombre ?? 'mi estudio'}
              origen={origen}
              copiado={copia}
              desfase={desfase}
              estiloSinAplicar={estiloWeb.pendiente}
              // Solo lo lee la nativa: aplicado es que le llega algo (quitar solo el pie, no).
              estiloAplicado={estiloWeb.fase === 'listo' ? !nadaParaSinMarco(estiloWeb.publicado) : null}
              onCopiado={registrarCopia}
              onMetodo={elegirMetodo}
              cambiar={cambiar}
              proximasClases={datos.proximasClases}
              dominiosAutorizados={dominiosAutorizados}
              verDominios={verDominios}
              dominios={(
                <div ref={dominiosRef} tabIndex={-1} className="outline-none">
                  <GestionDominios
                    dominios={dominiosAutorizados}
                    onGuardar={guardarDominios}
                    showToast={showToast}
                    puedeCambiar={rol === 'PROPIETARIO'}
                    sugerido={direccionWeb}
                  />
                </div>
              )}
              showToast={showToast}
            />
          </div>

          {conPrevia && (
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              {indice > 0 ? (
                <button type="button" onClick={() => irA(pasos[indice - 1].id)} className={cn(btnSecondary, 'inline-flex items-center gap-1.5')}>
                  <ArrowLeft size={15} aria-hidden />Atrás
                </button>
              ) : <span />}
              {indice < pasos.length - 1 && (
                <button type="button" onClick={() => irA(pasos[indice + 1].id)} className={btnPrimary}>
                  {pasos[indice + 1].siguiente}<ArrowRight size={15} aria-hidden />
                </button>
              )}
            </div>
          )}
        </div>

        {conPrevia && (
          <div className="order-first min-w-0 @4xl/config:sticky @4xl/config:top-4 @4xl/config:order-none">
            <VistaPrevia
              // Tras aplicar o deshacer, otra vez desde cero: lo publicado cambió en el servidor.
              key={`${w.id}-${metodo}-${estiloWeb.version}`}
              contenido={contenido}
              falta={faltaPrevia}
              forma={forma}
              web={suWeb}
              paginaDeReservas={`${new URL(origen).host}/reservar/${slug}`}
              anchoWidget={anchoWidget}
              abrirEn={urlPrevia}
              dispositivo={dispositivo}
              onDispositivo={setDispositivo}
            />
          </div>
        )}
      </div>
    </div>
  );
}

interface Vigentes { tipos: ReadonlySet<string>; instructoras: ReadonlySet<string>; salas: ReadonlySet<string> }

function sinHuerfanos(c: ConfigConstructor, v: Vigentes): ConfigConstructor {
  return {
    ...c,
    tipos: c.tipos.filter(id => v.tipos.has(id)),
    instructoras: c.instructoras.filter(id => v.instructoras.has(id)),
    salas: c.salas.filter(id => v.salas.has(id)),
  };
}

// El estado de lo guardado, sin que parezca que su web ya ha cambiado: lo
// guardado es lo de esta pantalla; lo que va en el código llega a su web cuando
// lo pega. (El estilo de sus widgets no pasa por aquí: se aplica con su botón.)
function EstadoGuardadoLinea({ estado }: { estado: EstadoGuardado }) {
  return (
    <p role="status" aria-live="polite" className={cn('flex min-h-5 items-center gap-1.5 text-[12px] text-muted-foreground', estado === 'error' && 'text-destructive')}>
      {estado === 'guardando' && <><Loader2 size={12} className="animate-spin" aria-hidden />Guardando tus ajustes…</>}
      {estado === 'guardado' && <><CheckCircle2 size={12} className="text-success" aria-hidden />Tus ajustes están guardados. Lo que va en el código llega a tu web cuando lo pegues.</>}
      {estado === 'error' && 'No se han guardado tus ajustes. El código que copies sigue valiendo.'}
    </p>
  );
}

// Lo que haría que el widget pegado no sirviera para lo que promete. Se dice
// ANTES de configurar nada, con el sitio donde se arregla.
function avisosDeDatos(id: string, d: { pruebas: number; pruebaDePago: boolean; stripe: boolean; planes: number; bonos: number; citas: number }): AvisoDeDatos[] {
  const a: AvisoDeDatos[] = [];
  const ir = (href: string, texto: string) => (
    <Link href={href} className={cn('inline-flex items-center gap-0.5 font-medium underline underline-offset-2', FOCO)}>{texto}<ArrowUpRight size={12} aria-hidden /></Link>
  );
  if ((id === 'planes' || id === 'bonos') && !d.stripe) a.push({ texto: 'Para vender online necesitas los cobros con tarjeta conectados.', enlace: ir('/configuracion?tab=cobros', 'Conectarlos') });
  if (id === 'planes' && d.planes === 0) a.push({ texto: 'No tienes planes a la venta: el widget saldría vacío.', enlace: ir('/productos', 'Crear un plan') });
  if (id === 'bonos' && d.bonos === 0) a.push({ texto: 'No tienes bonos a la venta: el widget saldría vacío.', enlace: ir('/productos', 'Crear un bono') });
  if (id === 'prueba' && d.pruebas === 0) a.push({ texto: 'No tienes ninguna clase de prueba activa: tu web diría «Ahora no hay clase de prueba». Marca una tarifa como clase de prueba en Paquetes.', enlace: ir('/productos', 'Ir a Paquetes') });
  if (id === 'prueba' && d.pruebaDePago && !d.stripe) a.push({ texto: 'Tu clase de prueba es de pago y no tienes los cobros con tarjeta conectados.', enlace: ir('/configuracion?tab=cobros', 'Conectarlos') });
  if (id === 'citas' && d.citas === 0) a.push({ texto: 'Ningún servicio de cita se puede reservar online todavía: el widget saldría vacío.', enlace: ir('/configuracion?tab=clases', 'Revisar servicios') });
  return a;
}

// El mes del widget activo, en una línea (`textoMes`, la misma de la portada).
// Sin visitas con su etiqueta lo dice así — no «0 % de conversión», que se
// leería como un widget que no funciona.
function ResumenMes({ resultado, onVer }: { resultado: EmbudoWidget | null; onVer?: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground">
      <TrendingUp size={13} aria-hidden />
      <span>{textoMes(resultado)}</span>
      {onVer && (
        <button type="button" onClick={onVer} className={cn('inline-flex min-h-11 items-center gap-0.5 font-medium text-foreground underline underline-offset-2 hover:no-underline [@media(pointer:fine)]:min-h-8', FOCO)}>
          Ver resultados<ArrowRight size={12} aria-hidden />
        </button>
      )}
    </div>
  );
}
