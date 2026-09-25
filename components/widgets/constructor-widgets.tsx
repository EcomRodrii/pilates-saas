'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { useStudio } from '@/lib/studio-context';
import { authHeader } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { LEGAL } from '@/lib/legal-info';
import { WIDGETS, widgetPorId, widgetsVisibles, esDisponible, type MetodoIntegracion, type WidgetDisponible } from '@/lib/widgets/catalogo';
import { CONFIG_POR_DEFECTO, leerConfigs, metodoEfectivo, anchoPorDefecto, type ConfigConstructor } from '@/lib/widgets/config';
import { conVistaPrevia, faltaParaGenerar, urlEmbebido, urlPagina, type EntradaIntegracion } from '@/lib/widgets/integracion';
import { frasePlazoCancelacion, fraseAntelacionMinima, fraseAntelacionMaxima } from '@/lib/reservar/promesas';
import type { TipoPlan } from '@/lib/types';
import { Biblioteca } from './biblioteca';
import { PanelAjustes, type DatosPanel } from './panel-ajustes';
import { VistaPrevia, type Contenido, type Dispositivo } from './vista-previa';
import { PreviewNativa } from './preview-nativa';
import { BloqueIntegracion } from './bloque-integracion';
import { GestionDominios } from './dominios';

// «Tentare Widgets»: el constructor. Cuatro pasos en el orden en que se piensan
// —elegir, ajustar, ver, copiar— y nada más. Tentare no hace la web del
// estudio: le da piezas que funcionan de verdad para meter en la suya.
//
// ⚠️ La config efectiva viaja CONGELADA en el código copiado (decisión de
// producto del 2026-08-20, no reabrir): esto guarda en `studios.widget_builder`
// solo para no perder lo ajustado al volver. Guardado con debounce y SOLO tras
// una edición — nunca al montar (fijar línea base al cargar escribe datos que
// nadie tocó).

const ORIGEN_POR_DEFECTO = new URL(LEGAL.url).origin;
const HORARIO = WIDGETS.find((x): x is WidgetDisponible => x.id === 'horario' && x.estado === 'disponible')!;
type EstadoGuardado = 'guardando' | 'guardado' | 'error' | null;

export function ConstructorWidgets({ slug, showToast }: { slug: string; showToast: (m: string) => void }) {
  const { sesiones, tiposClase, salas, instructores, planesTarifa, citasServicios, studio, updateStudio, reflejarStudioGuardado } = useStudio();
  const origen = typeof window !== 'undefined' ? window.location.origin : ORIGEN_POR_DEFECTO;

  const [activoId, setActivoId] = useState('horario');
  const elegido = widgetPorId(activoId);
  const w = esDisponible(elegido) ? elegido : HORARIO;

  const [configs, setConfigs] = useState<Record<string, ConfigConstructor>>(() => leerConfigs(studio?.widgetBuilder));
  const config = configs[w.id] ?? CONFIG_POR_DEFECTO;

  const [guardado, setGuardado] = useState<EstadoGuardado>(null);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (temporizador.current) clearTimeout(temporizador.current); }, []);
  function cambiar(parcial: Partial<ConfigConstructor>) {
    const siguientes = { ...configs, [w.id]: { ...config, ...parcial } };
    setConfigs(siguientes);
    setGuardado('guardando');
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = setTimeout(() => {
      void updateStudio({ widgetBuilder: siguientes as unknown as Record<string, unknown> }).then(r => {
        // Sin toast de error a propósito: perder esta comodidad no rompe nada
        // (el código copiado sigue valiendo). Se dice aquí, en voz baja.
        setGuardado(r.ok ? 'guardado' : 'error');
      });
    }, 1200);
  }

  const metodo = metodoEfectivo(config, w);
  const elegirMetodo = (m: MetodoIntegracion) => cambiar({ metodo: m === w.metodos[0] ? null : m });

  // Un tipo, una instructora o una sala borrados después de guardarse no se
  // cuelan en el código: un filtro por un id que ya no existe dejaría el
  // horario vacío sin que nadie entienda por qué.
  const instructorasActivas = useMemo(() => instructores.filter(i => i.activo), [instructores]);
  const configEfectiva = useMemo<ConfigConstructor>(() => {
    const tipos = new Set(tiposClase.map(t => t.id));
    const ins = new Set(instructorasActivas.map(i => i.id));
    const sal = new Set(salas.map(s => s.id));
    return {
      ...config,
      tipos: config.tipos.filter(id => tipos.has(id)),
      instructoras: config.instructoras.filter(id => ins.has(id)),
      salas: config.salas.filter(id => sal.has(id)),
    };
  }, [config, tiposClase, instructorasActivas, salas]);

  // Sin useMemo a mano: el React Compiler ya memoiza, y uno manual sobre `w`
  // (un objeto del catálogo) le impide optimizar el componente entero.
  const entrada: EntradaIntegracion = { widget: w, config: configEfectiva, origen, slug, colorEstudio: studio?.colorPrimario ?? null };

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
      .map(s => ({
        id: s.id,
        etiqueta: `${tiposPorId.get(s.tipoClaseId) ?? 'Clase'} — ${new Date(s.inicio).toLocaleString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' })}`,
      }));
  }, [sesiones, ahora, tiposPorId]);

  const planesContratables = useMemo(() => planesTarifa.filter(p => p.activo && p.precio > 0), [planesTarifa]);
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
      colorEstudio: studio?.colorPrimario ?? '#343825',
      reglas,
    };
  }, [tiposClase, instructorasActivas, salas, proximasClases, planesContratables, studio]);

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

  // ── Vista previa ──
  const [dispositivo, setDispositivo] = useState<Dispositivo>(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 720px)').matches ? 'movil' : 'escritorio');
  const falta = faltaParaGenerar(entrada, metodo, { dominiosAutorizados: ['*'] });
  const urlReal = metodo === 'boton' || metodo === 'enlace' ? urlPagina(entrada) : urlEmbebido(entrada, metodo);
  // Un color a medio teclear recargaría la vista previa en cada pulsación: se
  // espera a que se deje de teclear. El código de abajo sí cambia al momento.
  const [srcPrevia, setSrcPrevia] = useState(() => conVistaPrevia(urlReal));
  useEffect(() => {
    const t = setTimeout(() => setSrcPrevia(conVistaPrevia(urlReal)), 350);
    return () => clearTimeout(t);
  }, [urlReal]);

  let contenido: Contenido | null = null;
  if (!falta) {
    contenido = metodo === 'nativa'
      ? { tipo: 'componente', nodo: <PreviewNativa slug={slug} config={configEfectiva} colorEstudio={studio?.colorPrimario ?? null} /> }
      : {
        tipo: 'iframe', src: srcPrevia, titulo: w.nombre, origen, slug,
        altoInicial: metodo === 'boton' || metodo === 'enlace' ? 900 : w.alto,
      };
  }
  const anchoWidget = metodo === 'iframe'
    ? ((configEfectiva.ancho ?? anchoPorDefecto(w)) === 'compacto' ? 480 : null)
    : metodo === 'popup' ? w.anchoPopup : null;

  const avisos = avisosDeDatos(w.id, {
    stripe: !!studio?.stripeAccountId,
    planes: planesContratables.length,
    bonos: planesContratables.filter(p => p.tipo === 'BONO').length,
    citas: citasServicios.filter(s => s.activo && s.autoReservable).length,
  });

  const visibles = widgetsVisibles();
  const listos = visibles.filter(x => x.estado === 'disponible').length;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <p className="max-w-xl text-[13.5px] leading-relaxed text-muted-foreground">
          Integra Tentare en la web de tu estudio: tu horario, tus precios y la cuenta de tus
          alumnas, con tu imagen. Elige un widget, ajústalo y copia el código.
        </p>
        <div className="flex items-center gap-3 text-[12px] text-muted-foreground">
          <span>{listos} widgets · {visibles.length - listos} en camino</span>
          <EstadoGuardadoChip estado={guardado} />
        </div>
      </header>

      <Biblioteca activo={w.id} onElegir={setActivoId} />

      <div className="border-t border-border pt-6">
        <div className="min-w-0 space-y-6">
          <div className="grid items-start gap-6 @4xl/config:grid-cols-[minmax(0,1fr)_340px] @6xl/config:grid-cols-[minmax(0,1fr)_380px]">
            <div className="min-w-0 space-y-3">
              <div>
                <h3 className="text-[17px] font-semibold tracking-tight text-foreground">{w.nombre}</h3>
                <p className="text-[12.5px] text-muted-foreground">{w.descripcion}</p>
              </div>
              {contenido ? (
                <VistaPrevia
                  key={`${w.id}-${metodo}`}
                  contenido={contenido}
                  anchoWidget={anchoWidget}
                  abrirEn={conVistaPrevia(urlReal)}
                  dispositivo={dispositivo}
                  onDispositivo={setDispositivo}
                />
              ) : (
                <div className="flex min-h-64 items-center justify-center rounded-xl border border-dashed border-border px-6 text-center text-[13px] text-muted-foreground">
                  {falta}
                </div>
              )}
              {avisos.length > 0 && (
                <ul className="space-y-2">
                  {avisos.map(a => (
                    <li key={a.texto} className="flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/5 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-foreground">
                      <AlertCircle size={15} className="mt-0.5 shrink-0 text-warning" aria-hidden />
                      <span>{a.texto} {a.enlace}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <PanelAjustes
              key={w.id}
              widget={w}
              config={configEfectiva}
              metodo={metodo}
              cambiar={cambiar}
              datos={datos}
              dominios={<GestionDominios dominios={dominiosAutorizados} onGuardar={guardarDominios} showToast={showToast} />}
            />
          </div>

          <BloqueIntegracion
            entrada={entrada}
            metodo={metodo}
            onMetodo={elegirMetodo}
            dominiosAutorizados={dominiosAutorizados}
            showToast={showToast}
          />
        </div>
      </div>
    </div>
  );
}

function EstadoGuardadoChip({ estado }: { estado: EstadoGuardado }) {
  if (!estado) return null;
  return (
    <span role="status" aria-live="polite" className={cn('inline-flex items-center gap-1', estado === 'error' && 'text-destructive')}>
      {estado === 'guardando' && <><Loader2 size={12} className="animate-spin" aria-hidden />Guardando…</>}
      {estado === 'guardado' && <><CheckCircle2 size={12} className="text-success" aria-hidden />Guardado</>}
      {estado === 'error' && 'No se ha guardado. El código sigue valiendo.'}
    </span>
  );
}

// Lo que haría que el widget pegado no sirviera para lo que promete. Se dice
// ANTES de copiar, con el sitio donde se arregla.
function avisosDeDatos(id: string, d: { stripe: boolean; planes: number; bonos: number; citas: number }): { texto: string; enlace: ReactNode }[] {
  const a: { texto: string; enlace: ReactNode }[] = [];
  const ir = (href: string, texto: string) => <Link href={href} className="font-medium underline underline-offset-2">{texto}</Link>;
  if ((id === 'planes' || id === 'bonos') && !d.stripe) a.push({ texto: 'Para vender online necesitas los cobros con tarjeta conectados.', enlace: ir('/configuracion?tab=cobros', 'Conectarlos') });
  if (id === 'planes' && d.planes === 0) a.push({ texto: 'No tienes planes a la venta: el widget saldría vacío.', enlace: ir('/productos', 'Crear un plan') });
  if (id === 'bonos' && d.bonos === 0) a.push({ texto: 'No tienes bonos a la venta: el widget saldría vacío.', enlace: ir('/productos', 'Crear un bono') });
  if (id === 'citas' && d.citas === 0) a.push({ texto: 'Ningún servicio de cita se puede reservar online todavía.', enlace: ir('/configuracion?tab=clases', 'Revisar servicios') });
  return a;
}
