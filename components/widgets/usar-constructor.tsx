'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { useStudio } from '@/lib/studio-context';
import { authHeader } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { LEGAL } from '@/lib/legal-info';
import { widgetPorId, esDisponible, type MetodoIntegracion, type WidgetDisponible, WIDGETS } from '@/lib/widgets/catalogo';
import {
  CONFIG_POR_DEFECTO, anchoPopupDe, anchoPorDefecto, esLaMismaCopia, etiquetaEfectiva, fusionarWidgetBuilder, leerConfigs, leerCopiados, nuevaCopia,
  type ConfigConstructor, type Copiado,
} from '@/lib/widgets/config';
import { embudoPorWidget, textoMes, type EmbudoWidget } from '@/lib/widgets/embudo';
import { etiquetasDeCopia, gruposSinAplicar, piezaCopiada, webSinAutorizar } from '@/lib/widgets/en-tu-web';
import { copiaTrasAplicar } from '@/lib/widgets/pieza-panel';
import { descartarContenido } from '@/lib/widgets/publicar-en-mi-web';
import type { VistoWidget } from '@/lib/widgets/pegado';
import { dbEmbudoWidgetPorOrigen, dbWidgetVistos } from '@/lib/supabase-data';
import { useRol } from '@/lib/permisos';
import { leerPaginaPublica } from '@/lib/pagina-publica-cliente';
import { puedeGestionarPortalHome } from '@/lib/permisos-reglas';
import {
  botonSigueElEstilo, conVistaPrevia, faltaParaGenerar, firmaContenidoDe, tieneDisenoEnCodigo, urlEmbebido, urlPagina, type EntradaIntegracion,
} from '@/lib/widgets/integracion';
import { urlPopupPermitida } from '@/lib/widgets/popup-url';
import { piezasAfectadas } from '@/lib/widgets/estilo-afectados';
import { colorDeLaWeb } from '@/lib/reservar/estilo-web-tipos';
import { botonDeLaVentana } from '@/lib/reservar/estilo-web';
import { direccionLegible, leerWeb, metodoEnWeb, receta as recetaDe, usaBotonPropio, type EstadoWeb } from '@/lib/widgets/recetas';
import { frasePlazoCancelacion, fraseAntelacionMinima, fraseAntelacionMaxima } from '@/lib/reservar/promesas';
import type { TipoPlan } from '@/lib/types';
import { FOCO } from './piezas';
import type { AvisoDeDatos, DatosPanel, EstadoCopias } from './paso-que';
import type { FilaTienes } from './lo-que-tienes';
import { useEstiloWeb } from './usar-estilo-web';
import { usePiezas } from './usar-piezas';
import { BotonEnTuWeb, type Contenido, type FormaPrevia } from './vista-previa';
import { PreviewNativa } from './preview-nativa';
import { estaArchivado, tiposActivos, tiposConVida } from '@/lib/tipos-clase/orden-y-archivo';
import type { MostrarToast } from '@/components/ui/toast';

// El estado y las reglas del constructor de widgets, sin su pantalla (16-oct-2026).
//
// Sale de `ConstructorWidgets` (./constructor-widgets.tsx) TAL CUAL —se mueve, no
// se reescribe— para que «Tu web» v2 (./v2/) cumpla LAS MISMAS reglas que el
// constructor de siempre sin copiarlas: copiar y después publicar (por Safari),
// nunca guardar al montar, el `desfasado` único en toda la pantalla, la huella
// de lo copiado. Duplicar estas ~500 líneas en dos componentes es justo cómo
// divergen. Lo de cada pantalla (en qué paso está, adónde lleva cada botón) se
// queda en la pantalla.
//
// Las reglas de fondo, con su porqué, siguen explicadas arriba de
// `ConstructorWidgets`. El hook vive mientras convivan las dos: al retirar el
// interruptor `MI_WEB_NUEVA` se borra el JSX viejo y esto se queda.

const ORIGEN_POR_DEFECTO = new URL(LEGAL.url).origin;
const HORARIO = WIDGETS.find((x): x is WidgetDisponible => x.id === 'horario' && x.estado === 'disponible')!;
const COLOR_POR_DEFECTO = '#343825';
/** El lienzo de la vista previa con un diseño propio «para una web oscura». */
const FONDO_WEB_OSCURA = '#1C1D1A';

type EstadoGuardado = 'guardando' | 'guardado' | 'error' | null;
interface Guardable { configs: Record<string, ConfigConstructor>; copiados: Record<string, Copiado>; web: EstadoWeb }

/** Algo copiado de un widget que sigue existiendo: con eso hay portada. */
export const hayCopias = (copiados: Readonly<Record<string, Copiado>>) => Object.keys(copiados).some(id => esDisponible(widgetPorId(id)));

export type ResultadoAplicarPieza =
  | { ok: true; copiados: Record<string, Copiado> }
  | { ok: false; error: string; motivo?: 'cambiado' | 'ocupado' };

/**
 * Lo que se dice al publicar, por pantalla: el constructor de siempre
 * («Aplicar en mi web») y «Tu web» v2 («Publicar en mi web», decisión 1).
 */
const TEXTOS = {
  v1: {
    aplicado: 'Aplicado. Tu web lo enseñará en unos minutos.',
    copiadoSinAplicar: 'El código está copiado, pero tus cambios no se han aplicado: tu web enseñará lo de antes hasta que pulses «Aplicar en mi web».',
    ocupado: 'Ya se están aplicando tus cambios. Espera un momento.',
    noExiste: 'Este widget ya no existe.',
  },
  v2: {
    aplicado: 'Publicado. Tu web lo enseñará en unos minutos.',
    copiadoSinAplicar: 'El código está copiado, pero tus cambios no se han publicado: tu web enseñará lo de antes hasta que pulses «Publicar en mi web».',
    ocupado: 'Ya se están publicando tus cambios. Espera un momento.',
    noExiste: 'Este widget ya no existe.',
  },
} as const;

export function useConstructorWidgets({ slug, showToast, ...opciones }: {
  slug: string;
  showToast: MostrarToast;
  /** Qué pantalla lo usa: cambia solo cómo se dice publicar. */
  textos?: 'v1' | 'v2';
}) {
  const textos = TEXTOS[opciones.textos ?? 'v1'];
  const v2 = opciones.textos === 'v2';
  const { sesiones, tiposClase, salas, instructores, planesTarifa, citasServicios, studio, updateStudio, reflejarStudioGuardado } = useStudio();
  const origen = typeof window !== 'undefined' ? window.location.origin : ORIGEN_POR_DEFECTO;
  const rol = useRol();
  const estiloWeb = useEstiloWeb();
  // Lo publicado de cada widget por id. Solo lo lee y lo aplica la propietaria.
  const publicacion = usePiezas(rol === 'PROPIETARIO');

  const [activoId, setActivoId] = useState('horario');
  const elegido = widgetPorId(activoId);
  const w = esDisponible(elegido) ? elegido : HORARIO;

  const [configs, setConfigs] = useState<Record<string, ConfigConstructor>>(() => leerConfigs(studio?.widgetBuilder));
  const [copiados, setCopiados] = useState<Record<string, Copiado>>(() => leerCopiados(studio?.widgetBuilder));
  const [web, setWeb] = useState<EstadoWeb>(() => leerWeb(studio?.widgetBuilder));
  const config = configs[w.id] ?? CONFIG_POR_DEFECTO;
  const publicada = publicacion.publicadas[w.id] ?? null;

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
  /** La pregunta de su web, contestada: se guarda al momento (fusionando sobre lo que había). */
  function guardarWeb(nueva: EstadoWeb) {
    setWeb(nueva);
    guardar({ web: nueva }, true);
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

  // «Ocultar tu página» también oculta los widgets: son esa misma página
  // (/reservar?embed=1, `app/reservar/[slug]/layout.tsx`), y enseñan «Estamos
  // preparando esta página»; el calendario sin marco se queda sin clases. La
  // herramienta no lo decía en ningún sitio. Solo la propietaria puede leerlo
  // (`/api/pagina-publica`); sin respuesta, no se dice nada (nunca un aviso a ciegas).
  const [paginaOculta, setPaginaOculta] = useState(false);
  useEffect(() => {
    if (rol !== 'PROPIETARIO') return;
    let vivo = true;
    void leerPaginaPublica().then(e => { if (vivo) setPaginaOculta(e?.oculta === true); });
    return () => { vivo = false; };
  }, [rol]);

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
    pieza: publicada?.id ?? null,
  };

  // ── Lo publicado (código por ID) ──
  // Lo que cambió aquí y aún no ha llegado a su web: solo lo que llega con
  // «Aplicar en mi web» (lo que va en el HTML lo dice el aviso de copiar otra vez).
  const sinAplicar = publicada ? gruposSinAplicar(publicada.config, configEfectiva) : [];
  // Crear lo publicado la primera vez que abre «Ponlo en tu web» con un widget:
  // hasta entonces no hay id que poner en el código. Si falla, el código de
  // siempre (y no se reintenta en esta visita: no se cambia el código a medias).
  const [creando, setCreando] = useState<string | null>(null);
  const creacionFallida = useRef(new Set<string>());
  function prepararCodigo(id: string) {
    if (rol !== 'PROPIETARIO' || publicacion.estado !== 'listo' || creando) return;
    if (publicacion.publicadas[id] || creacionFallida.current.has(id)) return;
    const otro = widgetPorId(id);
    if (!esDisponible(otro)) return;
    const c = sinHuerfanos(configs[id] ?? CONFIG_POR_DEFECTO, vigentes);
    if (otro.contenido.includes('sesion') && !c.sesion) return;
    setCreando(id);
    void publicacion.publicar(id, c).then(r => {
      if (!r.ok) creacionFallida.current.add(id);
      setCreando(null);
    });
  }
  const [aplicando, setAplicando] = useState(false);
  /**
   * Lo de ahora de una pieza para mandarlo a su web: la abierta tal cual, y
   * cualquier otra con su config sin huérfanos y la forma que le toca hoy (lo
   * mismo que calcula el bucle de lo copiado, más abajo).
   */
  function entradaDe(id: string): { e: EntradaIntegracion; config: ConfigConstructor; metodo: MetodoIntegracion } | null {
    if (id === w.id) return { e: entrada, config: configEfectiva, metodo };
    const otro = widgetPorId(id);
    if (!esDisponible(otro)) return null;
    const c = sinHuerfanos(configs[id] ?? CONFIG_POR_DEFECTO, vigentes);
    return { e: { ...entrada, widget: otro, config: c, pieza: publicacion.publicadas[id]?.id ?? null }, config: c, metodo: metodoEnWeb(c, otro, plataforma) };
  }
  /**
   * Publica lo de ahora de UNA pieza (la abierta o cualquier otra copiada por id:
   * la barra única de «Tu web» v2 las publica todas). Sin escritura optimista: lo
   * publicado solo cambia con lo que devuelve el servidor. La copia por id pasa a
   * decir que su web enseña esto (lo de antes, «anterior»).
   *
   * Devuelve lo copiado tal como queda, para que quien publique varias seguidas
   * lo encadene: cada llamada ve el `copiados` de su render, y la segunda pisaría
   * lo que guardó la primera. `silencioso`: sin avisos (los da quien la llama).
   */
  async function aplicarPieza(id: string, opc?: { copiados?: Record<string, Copiado>; alFallar?: string; silencioso?: boolean }): Promise<ResultadoAplicarPieza> {
    if (aplicando) return { ok: false, error: textos.ocupado, motivo: 'ocupado' };
    const d = entradaDe(id);
    if (!d) return { ok: false, error: textos.noExiste };
    setAplicando(true);
    const r = await publicacion.publicar(id, d.config);
    setAplicando(false);
    if (!r.ok) {
      if (!opc?.silencioso) showToast(opc?.alFallar ?? r.error, { variant: 'error' });
      return { ok: false, error: r.error, ...(r.motivo ? { motivo: r.motivo } : {}) };
    }
    const base = opc?.copiados ?? copiados;
    let siguientes = base;
    const pegada = base[id];
    if (pegada?.pieza) {
      const contenido = firmaContenidoDe({ ...d.e, pieza: null, config: r.pieza.config }, pegada.metodo ?? d.metodo);
      const siguiente = copiaTrasAplicar(pegada, contenido);
      if (siguiente !== pegada) {
        siguientes = { ...base, [id]: siguiente };
        setCopiados(siguientes);
        guardar({ copiados: siguientes }, true);
      }
    }
    if (!opc?.silencioso) showToast(textos.aplicado);
    return { ok: true, copiados: siguientes };
  }
  /**
   * «Aplicar en mi web»: publica lo de ahora de este widget (el de siempre:
   * `aplicarPieza` de la abierta).
   */
  async function aplicarContenido(opc?: { copiados?: Record<string, Copiado>; alFallar?: string }): Promise<boolean> {
    return (await aplicarPieza(w.id, opc)).ok;
  }

  // Al copiar se guarda, además de la huella, la forma, una foto de la config
  // (sin huérfanos), la versión que verá la página y si su botón sigue el
  // estilo: con eso la portada dice QUÉ cambió y qué hay en su web. Copiar otra
  // vez lo mismo en menos de un minuto (el botón y después a mano, o dos
  // Ctrl+C) no se vuelve a guardar.
  //
  // Con un código por id, copiar también APLICA lo de ahora: lo que copia es lo
  // que su web va a enseñar. Se copia primero y se aplica después, a propósito:
  // en Safari, esperar a la red antes de escribir en el portapapeles pierde el
  // gesto y la copia falla; y el código por id es el mismo antes y después de
  // aplicar. Si aplicar falla, se dice, y el aviso de «sin aplicar» se queda.
  function registrarCopia(firma: string) {
    const nueva = nuevaCopia(copiados[w.id], {
      firma, en: new Date().toISOString(), metodo, config: configEfectiva, contenido: firmaContenidoDe(entrada, metodo),
      botonVivo: botonSigueElEstilo(configEfectiva, metodo), pieza: entrada.pieza,
    });
    let siguientes = copiados;
    if (!esLaMismaCopia(copiados[w.id], nueva)) {
      siguientes = { ...copiados, [w.id]: nueva };
      setCopiados(siguientes);
      guardar({ copiados: siguientes }, true);
    }
    if (entrada.pieza && sinAplicar.length) {
      void aplicarContenido({
        copiados: siguientes,
        alFallar: textos.copiadoSinAplicar,
      });
    }
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
  // Fuera del memo: el compilador infiere `config` entero si se lee dentro.
  const tiposElegidos = config.tipos;
  const datos: DatosPanel = useMemo(() => {
    const planesPorTipo: Record<TipoPlan, number> = { MENSUAL: 0, BONO: 0, PUNTUAL: 0 };
    for (const p of planesContratables) planesPorTipo[p.tipo] += 1;
    const reglasEstudio = {
      cancelacionVentanaHoras: studio?.cancelacionVentanaHoras ?? 0,
      reservaVentanaMinimaMinutos: studio?.reservaVentanaMinimaMinutos ?? 0,
      reservaAntelacionMaximaDias: studio?.reservaAntelacionMaximaDias ?? null,
      reservaAntelacionHora: studio?.reservaAntelacionHora ?? null,
    };
    // Las reglas, sobre los tipos que aún tienen clases (lo mismo que /reservar):
    // la de uno archivado sin ninguna ya no le toca a nadie.
    const vivos = ahora === null ? tiposActivos(tiposClase) : tiposConVida(tiposClase, sesiones, ahora);
    const reglas = [
      frasePlazoCancelacion(reglasEstudio, vivos),
      fraseAntelacionMinima(reglasEstudio, vivos),
      fraseAntelacionMaxima(reglasEstudio, vivos),
      studio?.permiteListaEspera === false ? 'Sin lista de espera: una clase llena no admite más.' : 'Con la clase llena, se apuntan a la lista de espera.',
      studio?.requiereAprobacion ? 'Cada reserva espera tu visto bueno.' : null,
      studio?.reservaExigirPlan ? 'Para reservar hace falta un plan o bono activo.' : null,
    ].filter((r): r is string => !!r);
    return {
      // Para elegir, los activos. Uno archivado que ya estaba elegido se queda
      // en la lista, marcado: quitarlo sin decir nada cambiaría el widget.
      tiposClase: tiposClase
        .filter(t => !estaArchivado(t) || tiposElegidos.includes(t.id))
        .map(t => ({ id: t.id, nombre: estaArchivado(t) ? `${t.nombre} (archivado)` : t.nombre })),
      instructoras: instructorasActivas.map(i => ({ id: i.id, nombre: i.nombre })),
      salas: salas.map(s => ({ id: s.id, nombre: s.nombre })),
      proximasClases,
      planesPorTipo,
      colorEstudio: colorEstudio ?? COLOR_POR_DEFECTO,
      reglas,
    };
  }, [tiposClase, sesiones, ahora, tiposElegidos, instructorasActivas, salas, proximasClases, planesContratables, studio, colorEstudio]);

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
    const suya = publicacion.publicadas[id] ?? null;
    const e: EntradaIntegracion = { ...entrada, widget: otro, config: c, pieza: suya?.id ?? null };
    for (const t of etiquetasDeCopia(k, e)) pedir.add(t);
    const p = piezaCopiada({
      copia: k, base: e, metodoAhora: m, puedeGenerar: !faltaParaGenerar(e, m, { dominiosAutorizados }),
      vistos: vistos?.filas, leidas: vistos?.etiquetas,
      esperandoVistos: veResultados && vistos === undefined,
      mes: resultadosMes, ahora,
      publicada: suya?.config ?? null,
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
      // Un código de antes, y ella puede pasarse al de ahora (solo la propietaria publica).
      codigoAntiguo: !k.pieza && rol === 'PROPIETARIO' && publicacion.estado === 'listo',
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
  // ¿Llega lo que enseña con «Aplicar en mi web»? Solo si su código es por id:
  // con uno de antes pegado, cambiarlo sigue pidiendo pegarlo otra vez, y
  // decirle «pulsa Aplicar» sería prometer algo que no pasa.
  const porId = !!publicada && (!copia || !!copia.pieza);
  const conCopias = filasTienes.length > 0;

  // El mes del widget abierto, por la etiqueta con la que se COPIÓ: es la que
  // lleva lo que hay en su web (si la cambió después, la de ahora aún no mide nada).
  const filaActiva = filasTienes.find(f => f.id === w.id);
  const etiquetaActiva = filaActiva ? filaActiva.pieza.etiqueta : etiquetaEfectiva(configEfectiva, w);
  const resultadoActivo = resultadosMes && etiquetaActiva
    ? resultadosMes.find(r => r.etiqueta === etiquetaActiva) ?? null
    : null;

  // ── Vista previa ──
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
        nodo: (
          <PreviewNativa
            slug={slug}
            config={configEfectiva}
            estilo={borradorWeb ?? estiloWeb.publicado}
            base={estiloWeb.base}
            colorEstudio={colorEstudio}
            // v2 (01b, hallazgo #9): sin marco y con la identidad del estudio, el widget toma la letra de
            // la web donde vive. Aquí su web es el dibujo de alrededor, así que lleva la letra del dibujo
            // (la del panel), y no otra que no se ve en ningún sitio. La v1, como estaba.
            fuenteDelPanel={v2 ? 'var(--fuente-sans, system-ui, sans-serif)' : undefined}
          />
        ),
      }
      : { tipo: 'iframe', src: srcPrevia, titulo: w.nombre, origen, slug, altoInicial: paginaCompleta ? 900 : w.alto };
  }
  // Sin marco y sin letra elegida (ni en el estilo de sus widgets ni en un diseño propio), la letra es la
  // de su web: la vista previa lo dice, porque aquí su web es un dibujo.
  const letraDeSuWeb = metodo === 'nativa' && configEfectiva.identidad !== 'propia' && !(borradorWeb ?? estiloWeb.publicado)?.letra;
  const anchoWidget = metodo === 'iframe'
    ? ((configEfectiva.ancho ?? anchoPorDefecto(w, configEfectiva)) === 'compacto' ? 480 : null)
    : metodo === 'popup' ? anchoPopupDe(w, configEfectiva) : null;
  const botonPropio = metodo === 'boton' && usaBotonPropio(plataforma);
  // Lo que enseña la previa y NO cambia con el estilo de sus widgets: se dice
  // encima (y arriba, en «Cómo se ve», con la salida). Mismas reglas que la página.
  const noSigueElEstilo = paginaCompleta
    ? 'Tu página de reservas se ve como tu app: el estilo de tus widgets no le llega.'
    : tieneDisenoEnCodigo(configEfectiva, metodo)
      ? `«${w.nombre}» tiene su propio diseño: el estilo de tus widgets no le llega.`
      : null;
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
    publicadas: Object.fromEntries(Object.entries(publicacion.publicadas).map(([id, p]) => [id, p.config])),
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

  // ── Lo que necesita la barra única de «Tu web» v2 ──
  /**
   * «Descartar» de lo sin publicar: lo de ahora vuelve a lo publicado SOLO en lo
   * que llega al publicar (`descartarContenido`), de todas las piezas a la vez
   * (una a una, cada una vería el `configs` de su render y pisaría la anterior).
   * Es tras un clic suyo: no rompe «nunca guardar al montar».
   */
  function descartarPiezas(ids: readonly string[]) {
    let siguientes = configs;
    for (const id of ids) {
      const publicada = publicacion.publicadas[id];
      if (!publicada) continue;
      siguientes = { ...siguientes, [id]: descartarContenido(siguientes[id] ?? CONFIG_POR_DEFECTO, publicada.config) };
    }
    if (siguientes === configs) return;
    setConfigs(siguientes);
    guardar({ configs: siguientes });
  }
  /** Quita el diseño propio de una pieza: vuelve a seguir el estilo de sus widgets. */
  function quitarDisenoPropio(id: string) {
    const actual = configs[id] ?? CONFIG_POR_DEFECTO;
    if (actual.identidad === 'estudio') return;
    const siguientes = { ...configs, [id]: { ...actual, identidad: 'estudio' as const } };
    setConfigs(siguientes);
    guardar({ configs: siguientes });
  }

  return {
    studio, rol, origen, slug, showToast, estiloWeb, publicacion,
    activoId, setActivoId, w, configs, copiados, web, config, publicada, configEfectiva, entrada,
    guardado, cambiar, guardarWeb, plataforma, colorEstudio, receta, metodo, elegirMetodo,
    veResultados, resultadosMes, paginaOculta, sinAplicar, creando, prepararCodigo, aplicando, aplicarPieza, aplicarContenido,
    registrarCopia, ahora, datos, guardarDominios, dominiosAutorizados, direccionWeb,
    copias, filasTienes, configsCopiadas, copia, desfase, porId, conCopias, filaActiva, etiquetaActiva, resultadoActivo,
    faltaPrevia, paginaCompleta, urlPrevia, urlReal, letraDeSuWeb, contenido, anchoWidget, botonPropio, noSigueElEstilo, forma, suWeb, piezas, avisos,
    descartarPiezas, quitarDisenoPropio,
  };
}

/** Lo que devuelve `useConstructorWidgets`: el estado y las reglas, sin la pantalla. */
export type ConstructorWidgets = ReturnType<typeof useConstructorWidgets>;

interface Vigentes { tipos: ReadonlySet<string>; instructoras: ReadonlySet<string>; salas: ReadonlySet<string> }

function sinHuerfanos(c: ConfigConstructor, v: Vigentes): ConfigConstructor {
  return {
    ...c,
    tipos: c.tipos.filter(id => v.tipos.has(id)),
    instructoras: c.instructoras.filter(id => v.instructoras.has(id)),
    salas: c.salas.filter(id => v.salas.has(id)),
  };
}

// Lo que haría que el widget pegado no sirviera para lo que promete. Se dice
// ANTES de configurar nada, con el sitio donde se arregla.
function avisosDeDatos(id: string, d: { pruebas: number; pruebaDePago: boolean; stripe: boolean; planes: number; bonos: number; citas: number }): AvisoDeDatos[] {
  const a: AvisoDeDatos[] = [];
  const ir = (href: string, texto: string) => (
    <Link href={href} className={cn('inline-flex items-center gap-0.5 font-medium underline underline-offset-2', FOCO)}>{texto}<ArrowUpRight size={12} aria-hidden /></Link>
  );
  if ((id === 'planes' || id === 'bonos') && !d.stripe) a.push({ texto: 'Para vender online necesitas los cobros con tarjeta conectados.', enlace: ir('/configuracion?tab=conexiones#integracion-stripe', 'Conectarlos') });
  if (id === 'planes' && d.planes === 0) a.push({ texto: 'No tienes planes a la venta: el widget saldría vacío.', enlace: ir('/productos', 'Crear un plan') });
  if (id === 'bonos' && d.bonos === 0) a.push({ texto: 'No tienes bonos a la venta: el widget saldría vacío.', enlace: ir('/productos', 'Crear un bono') });
  if (id === 'prueba' && d.pruebas === 0) a.push({ texto: 'No tienes ninguna clase de prueba activa: tu web diría «Ahora no hay clase de prueba». Marca una tarifa como clase de prueba en Paquetes.', enlace: ir('/productos', 'Ir a Paquetes') });
  if (id === 'prueba' && d.pruebaDePago && !d.stripe) a.push({ texto: 'Tu clase de prueba es de pago y no tienes los cobros con tarjeta conectados.', enlace: ir('/configuracion?tab=conexiones#integracion-stripe', 'Conectarlos') });
  if (id === 'citas' && d.citas === 0) a.push({ texto: 'Ningún servicio de cita se puede reservar online todavía: el widget saldría vacío.', enlace: ir('/configuracion?tab=clases', 'Revisar servicios') });
  return a;
}
