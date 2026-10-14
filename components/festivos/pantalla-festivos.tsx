'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Festivos (14-oct-2026), como la pantalla de Bonsai
// (b-90-festivos-01…27): cabecera con «Comprobar clases» y «Añadir festivos»,
// pestañas Listado / Configuración, la lista por años con su hoja de
// calendario y su chapa, y el panel lateral de añadir con la búsqueda con IA y
// los fuegos artificiales.
//
// Lo que Tentare hace mejor que Bonsai, a propósito:
//   · Los oficiales ya están: salen del boletín (BOE y el de la comunidad) por
//     la dirección del estudio, con su norma. A Bonsai le faltaba la Semana
//     Santa de 2027 en Madrid y Sant Joan en Barcelona.
//   · Lo que propone la IA viene desmarcado y con su fuente: nunca entra solo.
//   · «Comprobar clases» no borra clases: cuenta clases y reservas de cada día
//     y deja elegir «Abrimos igualmente» o «Cerrar ese día», que es el cierre de
//     siempre (avisa a quien tenía reserva, devuelve la sesión según tu ajuste y
//     alarga bonos y recuperaciones), con su confirmación.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import {
  CalendarCheck2, CalendarDays, CalendarX2, Check, DoorOpen, ExternalLink, Landmark, MapPin, PartyPopper, Plus, Search, Sparkles, Trash2,
} from 'lucide-react';
import { useStudio } from '@/lib/studio-context';
import { useRol } from '@/lib/permisos';
import { PageHeader } from '@/components/ui/page-header';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { MenuAcciones, type AccionMenu } from '@/components/ui/menu-acciones';
import { Toast, useToast } from '@/components/ui/toast';
import { BotonVivo, CabeceraTarjeta, PantallaVacia, Pildoras, TarjetaCifra, fondoTenido } from '@/components/dashboard/vivo';
import { BOTON_BORDE, BOTON_MENU, PestanasVivas } from '@/components/dashboard/vivo-seccion';
import { cn } from '@/lib/utils';
import { invalidarEstadoEstudio } from '@/lib/estado-estudio-cliente';
import { consecuenciasDelCierre } from '@/lib/cierres/dias-de-cierre';
import { hrefDeTarjeta } from '@/lib/configuracion/destino';
import { tarjetaVisible } from '@/lib/configuracion/secciones';
import { fechaDelFestivo } from '@/lib/festivos/textos';
import { abrirFestivo, cerrarFestivo } from '@/lib/festivos/festivos-cliente';
import {
  aniosDeLista, cifrasDeLista, hojaDeCalendario, recuentoDeFestivos, vistaDeLista, type FestivoDeLaLista,
} from '@/lib/festivos/lista';
import { leerFestivosDelEstudio, quitarFestivos, type ListaDelEstudio } from '@/lib/festivos/modulo-cliente';
import { BotonBordeVivo, Chapa, ChapaAmbito, ChapaIA, HojaCalendario } from './piezas';
import { PanelAnadirFestivos } from './panel-anadir';
import { PanelComprobarClases } from './panel-comprobar';
import { FuegosArtificiales } from './fuegos-artificiales';

type Pestana = 'lista' | 'config';
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export function PantallaFestivos() {
  const { studio } = useStudio();
  const rol = useRol();
  const [estado, setEstado] = useState<'cargando' | 'listo' | 'error' | 'no_disponible'>('cargando');
  const [datos, setDatos] = useState<ListaDelEstudio | null>(null);
  const [pestana, setPestana] = useState<Pestana>('lista');
  const [anio, setAnio] = useState<number | 'todos'>('todos');
  const [busqueda, setBusqueda] = useState('');
  const [ocultarPasados, setOcultarPasados] = useState(true);
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [panel, setPanel] = useState<'buscar' | 'manual' | null>(null);
  const [comprobar, setComprobar] = useState(false);
  const [disparo, setDisparo] = useState(0);
  const [quitando, setQuitando] = useState<FestivoDeLaLista[] | null>(null);
  const [cerrando, setCerrando] = useState<FestivoDeLaLista | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const enVuelo = useRef(false);
  const toast = useToast();

  const cargar = useCallback(async () => {
    const r = await leerFestivosDelEstudio();
    if (r.ok) { setDatos(r.datos); setEstado('listo'); return; }
    setEstado(r.noDisponible ? 'no_disponible' : 'error');
  }, []);

  useEffect(() => {
    let vivo = true;
    void leerFestivosDelEstudio().then(r => {
      if (!vivo) return;
      if (r.ok) { setDatos(r.datos); setEstado('listo'); } else setEstado(r.noDisponible ? 'no_disponible' : 'error');
    });
    return () => { vivo = false; };
  }, []);

  const hoy = datos?.hoy ?? '';
  const festivos = useMemo(() => datos?.festivos ?? [], [datos]);
  const grupos = useMemo(
    () => vistaDeLista(festivos, { anio, busqueda, ocultarPasados, hoy }),
    [festivos, anio, busqueda, ocultarPasados, hoy],
  );
  const anios = useMemo(() => aniosDeLista(festivos, { ocultarPasados, hoy }), [festivos, ocultarPasados, hoy]);
  const cifras = useMemo(() => cifrasDeLista(festivos, hoy), [festivos, hoy]);
  const visibles = grupos.flatMap(g => g.festivos);
  const quitables = visibles.filter(f => f.id);
  const seleccionados = quitables.filter(f => f.id && seleccion.has(f.id));
  const localesGuardados = festivos.some(f => f.origen !== 'oficial' && f.fecha >= hoy);
  const devuelveSesion = studio?.cancelacionClaseDevuelveBono ?? true;

  function alGuardar(r: { creados: number; yaEstaban: number }) {
    if (r.creados > 0) setDisparo(n => n + 1);
    toast.show(r.creados === 0
      ? 'Ya los tenías todos en tu lista.'
      : r.creados === 1 ? '1 festivo añadido a tu lista' : `${r.creados} festivos añadidos a tu lista`);
    invalidarEstadoEstudio();
    void cargar();
    // Deja ver las filas en verde un momento antes de cerrar, como Bonsai.
    window.setTimeout(() => setPanel(null), 1100);
  }

  async function quitar(lista: FestivoDeLaLista[]) {
    if (enVuelo.current) return;
    const ids = lista.map(f => f.id).filter((x): x is string => !!x);
    if (ids.length === 0) return;
    enVuelo.current = true;
    setOcupado(true);
    try {
      const r = await quitarFestivos(ids);
      if (!r.ok) { toast.showError(r.error); return; }
      setSeleccion(new Set());
      toast.show(r.datos.quitados === 1 ? '1 festivo quitado de tu lista' : `${r.datos.quitados} festivos quitados de tu lista`);
      invalidarEstadoEstudio();
      await cargar();
    } finally {
      enVuelo.current = false;
      setOcupado(false);
    }
  }

  async function decidir(f: FestivoDeLaLista, accion: 'abrir' | 'cerrar') {
    if (enVuelo.current) return;
    enVuelo.current = true;
    setOcupado(true);
    try {
      const r = accion === 'abrir' ? await abrirFestivo(f.fecha) : await cerrarFestivo(f);
      if (!r.ok) { toast.showError(r.error); return; }
      const cuando = fechaDelFestivo(f.fecha, hoy);
      toast.show(accion === 'abrir'
        ? `Apuntado: el ${cuando} abres.`
        : `${cuando.charAt(0).toUpperCase()}${cuando.slice(1)}: ${'texto' in r ? r.texto : 'día cerrado'}`);
      invalidarEstadoEstudio();
      await cargar();
    } finally {
      enVuelo.current = false;
      setOcupado(false);
    }
  }

  const acciones = (
    <>
      <button type="button" className={BOTON_BORDE} onClick={() => setComprobar(true)} disabled={estado !== 'listo'}>
        <CalendarCheck2 size={15} aria-hidden /> Comprobar clases
      </button>
      <BotonVivo label="Añadir festivos" Icono={Plus} onClick={() => setPanel('buscar')} disabled={estado !== 'listo'} />
    </>
  );

  return (
    <div className="space-y-5" data-testid="pantalla-festivos">
      <PageHeader
        title="Festivos"
        description="Los días que tu estudio no abre: los oficiales ya están; añade los de tu localidad y decide qué pasa con sus clases."
        actions={estado === 'no_disponible' ? undefined : <div className="flex flex-wrap items-center gap-2">{acciones}</div>}
      />

      {estado === 'cargando' && (
        <div aria-hidden className="space-y-3">
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">{[0, 1, 2].map(i => <div key={i} className="h-[132px] animate-pulse rounded-t-card bg-muted" />)}</div>
          {[0, 1, 2, 3].map(i => <div key={i} className="h-[72px] animate-pulse rounded-2xl bg-muted" />)}
        </div>
      )}

      {estado === 'no_disponible' && (
        <div className="mx-auto max-w-md py-16 text-center" data-testid="festivos-no-disponible">
          <p className="text-[15px] font-medium text-foreground">Festivos aún no está disponible para tu estudio.</p>
          <Link href="/dashboard" className="mt-3 inline-block text-[13.5px] text-muted-foreground underline underline-offset-2">Volver al Resumen</Link>
        </div>
      )}

      {estado === 'error' && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-destructive/10 px-4 py-3 text-[13.5px] font-medium text-destructive">
          No se han podido leer tus festivos.
          <button type="button" className={BOTON_BORDE} onClick={() => { setEstado('cargando'); void cargar(); }}>Reintentar</button>
        </div>
      )}

      {estado === 'listo' && datos && (
        <>
          {festivos.length > 0 && (
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-3 xl:gap-4">
              <TarjetaCifra
                etiqueta="Próximo festivo"
                tono="magenta"
                Icono={PartyPopper}
                href={null}
                valor={cifras.proximo ? `${Number(cifras.proximo.fecha.slice(8))} ${MESES[Number(cifras.proximo.fecha.slice(5, 7)) - 1]}` : '—'}
                // `normal-nums`: la cifra lleva `tabular-nums`, que también ensancha la coma («Santos , trasladado»).
                arriba={cifras.proximo ? <span className="normal-nums">{cifras.proximo.nombre}</span> : undefined}
                abajo={cifras.diasHastaProximo === null ? 'No queda ninguno en tu lista' : cifras.diasHastaProximo === 0 ? 'es hoy' : cifras.diasHastaProximo === 1 ? 'mañana' : `en ${cifras.diasHastaProximo} días`}
              />
              <TarjetaCifra etiqueta={`Quedan en ${hoy.slice(0, 4)}`} tono="azul" Icono={CalendarDays} href={null} valor={String(cifras.esteAnio)} abajo={cifras.esteAnio === 1 ? 'festivo hasta fin de año' : 'festivos hasta fin de año'} />
              <TarjetaCifra etiqueta={`En ${Number(hoy.slice(0, 4)) + 1}`} tono="indigo" Icono={CalendarCheck2} href={null} valor={String(cifras.siguiente)} abajo={cifras.siguiente === 1 ? 'festivo en tu lista' : 'festivos en tu lista'} />
            </div>
          )}

          {festivos.length === 0 ? (
            <PantallaVacia
              tono="magenta"
              Icono={PartyPopper}
              titulo="Pon los festivos de tu estudio"
              texto={datos.comunidad
                ? 'Busca los de tu localidad: te enseñamos todos, los del boletín oficial y las fiestas locales, y añades los que quieras.'
                : 'No sabemos tu comunidad por la dirección del estudio, así que aún no tienes los oficiales. Busca los de tu localidad: te enseñamos todos, los del boletín oficial y las fiestas locales, y añades los que quieras.'}
              ejemplos={[
                { accion: 'Buscar los de tu localidad', cuando: 'y añadirlos de una vez' },
                { accion: 'Ver qué clases caen en festivo', cuando: 'antes de que llegue el día' },
                { accion: 'Cerrar ese día o abrir igualmente', cuando: 'sin cancelar nada sin que lo digas' },
              ]}
              accion={{ label: 'Buscar los festivos de mi localidad', onClick: () => setPanel('buscar'), Icono: Sparkles }}
              secundaria={{ label: 'Añadir uno a mano', onClick: () => setPanel('manual') }}
            />
          ) : !localesGuardados && (
            <section
              data-testid="festivos-faltan-locales"
              className="flex flex-col gap-4 rounded-t-card border p-4 shadow-t-card sm:flex-row sm:items-center sm:justify-between sm:p-5"
              style={fondoTenido('magenta', 22)}
            >
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-[15px] font-semibold text-foreground">
                  <Sparkles size={16} style={{ color: 'var(--t-magenta-500)' }} aria-hidden /> Faltan las fiestas locales{datos.localidad ? ` de ${datos.localidad}` : ''}
                </p>
                <p className="mt-1 text-[13px] text-muted-foreground text-pretty">
                  Cada municipio tiene dos al año y no vienen en el boletín de tu comunidad. La IA las busca y te las propone con su fuente: tú eliges cuáles añadir.
                </p>
              </div>
              <BotonBordeVivo onClick={() => setPanel('buscar')} className="shrink-0">
                <Sparkles size={16} style={{ color: 'var(--t-magenta-500)' }} aria-hidden /> Buscar con IA
              </BotonBordeVivo>
            </section>
          )}

          {festivos.length > 0 && (
            <>
              <PestanasVivas
                etiqueta="Vista"
                valor={pestana}
                onCambio={setPestana}
                pestanas={[{ id: 'lista', label: 'Listado', n: festivos.filter(f => f.fecha >= hoy).length }, { id: 'config', label: 'Configuración' }]}
              />

              {pestana === 'lista' ? (
                <section aria-label="Tus festivos" className="space-y-4">
                  <div className="flex flex-wrap items-center gap-3">
                    {anios.length > 1 && (
                      <Pildoras<number | 'todos'>
                        opciones={[{ valor: 'todos', label: 'Todos' }, ...anios.map(a => ({ valor: a, label: String(a) }))]}
                        valor={anio}
                        onCambio={setAnio}
                      />
                    )}
                    <label className="flex min-w-[200px] flex-1 items-center gap-2.5 rounded-full border border-border bg-card px-4 py-2 shadow-t-card focus-within:ring-3 focus-within:ring-ring/40">
                      <Search size={15} className="shrink-0 text-muted-foreground" aria-hidden />
                      <span className="sr-only">Buscar un festivo</span>
                      <input
                        value={busqueda}
                        onChange={e => setBusqueda(e.target.value)}
                        placeholder="Buscar festivo…"
                        className="min-w-0 flex-1 bg-transparent text-[14px] text-foreground outline-none placeholder:text-muted-foreground"
                      />
                    </label>
                    <label className="flex min-h-11 cursor-pointer items-center gap-2 text-[13px] font-medium text-foreground md:min-h-8">
                      <input type="checkbox" className="size-4 accent-[var(--t-blue-500)]" checked={ocultarPasados} onChange={e => setOcultarPasados(e.target.checked)} />
                      Ocultar pasados
                    </label>
                  </div>

                  {seleccionados.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card px-4 py-2.5 shadow-t-card" role="region" aria-label="Seleccionados">
                      <span className="mr-auto text-[13px] font-semibold text-foreground">
                        {seleccionados.length === 1 ? '1 festivo seleccionado' : `${seleccionados.length} festivos seleccionados`}
                      </span>
                      <button type="button" className={cn(BOTON_BORDE, 'text-destructive')} disabled={ocupado} onClick={() => setQuitando(seleccionados)}>
                        <Trash2 size={14} aria-hidden /> Quitar de la lista
                      </button>
                      <button type="button" className={BOTON_BORDE} onClick={() => setSeleccion(new Set())}>Cancelar</button>
                    </div>
                  )}

                  {grupos.length === 0 ? (
                    <p className="rounded-2xl border border-border bg-card px-4 py-8 text-center text-[13.5px] text-muted-foreground">
                      {busqueda ? 'Ningún festivo se llama así.' : 'No te quedan festivos en estas fechas.'}
                    </p>
                  ) : grupos.map(g => (
                    <div key={g.anio} className="space-y-2">
                      <h2 className="flex items-baseline gap-2 border-b border-border pb-1.5">
                        <span className="text-[18px] font-bold text-foreground tabular-nums">{g.anio}</span>
                        <span className="text-[12.5px] text-muted-foreground">{recuentoDeFestivos(g.festivos.length)}</span>
                      </h2>
                      <ul className="space-y-2">
                        {g.festivos.map(f => (
                          <FilaFestivo
                            key={`${f.origen}-${f.fecha}`}
                            f={f}
                            hoy={hoy}
                            seleccionado={!!f.id && seleccion.has(f.id)}
                            onSeleccionar={si => setSeleccion(prev => {
                              const otra = new Set(prev);
                              if (!f.id) return otra;
                              if (si) otra.add(f.id); else otra.delete(f.id);
                              return otra;
                            })}
                            ocupado={ocupado}
                            onAbrir={() => void decidir(f, 'abrir')}
                            onCerrar={() => setCerrando(f)}
                            onQuitar={() => setQuitando([f])}
                          />
                        ))}
                      </ul>
                    </div>
                  ))}

                  <p className="text-[12px] text-muted-foreground text-pretty">
                    {datos.comunidad
                      ? `Los oficiales de ${datos.comunidad} salen del boletín oficial (el BOE y el de la comunidad), según la dirección de tu estudio, y no se pueden quitar: si un día abres, dilo con «Abrimos igualmente». `
                      : 'No sabemos tu comunidad por la dirección del estudio: los festivos de la lista son los que has añadido. '}
                    Añadir o quitar un festivo no cancela ninguna clase.
                  </p>
                </section>
              ) : (
                <Configuracion datos={datos} rol={rol} devuelveSesion={devuelveSesion} />
              )}
            </>
          )}
        </>
      )}

      {datos && (
        <PanelAnadirFestivos
          open={panel !== null}
          onClose={() => setPanel(null)}
          modoInicial={panel ?? 'buscar'}
          localidadInicial={datos.localidad}
          hoy={hoy}
          puedeVerCierres={tarjetaVisible('cerrar-el-centro', rol)}
          onGuardados={alGuardar}
        />
      )}
      {datos && (
        <PanelComprobarClases
          open={comprobar}
          onClose={() => setComprobar(false)}
          devuelveSesion={devuelveSesion}
          onDecidido={(texto) => { toast.show(texto); invalidarEstadoEstudio(); void cargar(); }}
          onError={(e) => toast.showError(e)}
        />
      )}

      <ConfirmDialog
        open={quitando !== null}
        onOpenChange={v => { if (!v) setQuitando(null); }}
        titulo={quitando?.length === 1 ? `¿Quitar «${quitando[0].nombre}» de tu lista?` : `¿Quitar ${quitando?.length ?? 0} festivos de tu lista?`}
        descripcion="Deja de contar como festivo al repetir clases y en los avisos. No toca ninguna clase: si ese día ya lo cerraste, sigue cerrado."
        textoConfirmar="Sí, quitar"
        destructivo
        onConfirm={() => { const l = quitando; setQuitando(null); if (l) void quitar(l); }}
      />
      <ConfirmDialog
        open={cerrando !== null}
        onOpenChange={v => { if (!v) setCerrando(null); }}
        titulo={cerrando ? `¿Cerrar el ${fechaDelFestivo(cerrando.fecha, hoy)}?` : ''}
        descripcion={cerrando ? `${consecuenciasDelCierre({ cuando: 'Ese día', dias: 1, devuelveSesion })} Quitar el cierre después no devuelve las clases.` : undefined}
        textoConfirmar="Sí, cerrar ese día"
        destructivo
        onConfirm={() => { const f = cerrando; setCerrando(null); if (f) void decidir(f, 'cerrar'); }}
      />

      <FuegosArtificiales disparo={disparo} />
      {toast.message && <Toast message={toast.message} variant={toast.variant} onDismiss={toast.dismiss} />}
    </div>
  );
}

function FilaFestivo({ f, hoy, seleccionado, onSeleccionar, ocupado, onAbrir, onCerrar, onQuitar }: {
  f: FestivoDeLaLista; hoy: string; seleccionado: boolean; onSeleccionar: (si: boolean) => void; ocupado: boolean;
  onAbrir: () => void; onCerrar: () => void; onQuitar: () => void;
}) {
  const pasado = f.fecha < hoy;
  const futuro = f.fecha > hoy;
  const h = hojaDeCalendario(f.fecha);
  const acciones: AccionMenu[] = [];
  if (futuro && f.estado === null) {
    acciones.push({ texto: 'Abrimos igualmente', icono: DoorOpen, onClick: onAbrir, nota: 'Se apunta y no te lo volvemos a preguntar' });
    acciones.push({ texto: 'Cerrar ese día', icono: CalendarX2, onClick: onCerrar, nota: 'Se cancelan sus clases avisando a quien tenía reserva' });
  }
  if (f.id) acciones.push({ texto: 'Quitar de la lista', icono: Trash2, onClick: onQuitar, peligro: true, separar: acciones.length > 0 });

  return (
    <li
      data-testid="festivo-fila"
      data-fecha={f.fecha}
      className={cn(
        'flex items-center gap-3 rounded-2xl border border-border bg-card px-3 py-2.5 shadow-t-card transition-colors sm:gap-4 sm:px-4',
        seleccionado && 'border-[color:var(--t-blue-500)] bg-[color-mix(in_srgb,var(--t-blue-500)_5%,var(--card))]',
      )}
    >
      {f.id ? (
        <input
          type="checkbox"
          className="size-4 shrink-0 accent-[var(--t-blue-500)]"
          checked={seleccionado}
          onChange={e => onSeleccionar(e.target.checked)}
          aria-label={`Seleccionar ${f.nombre}`}
        />
      ) : (
        <span className="flex size-4 shrink-0 items-center justify-center text-muted-foreground" title="Oficial: sale del boletín">
          <Landmark size={14} aria-hidden />
        </span>
      )}
      <HojaCalendario fecha={f.fecha} apagada={pasado} />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-1.5">
          <span className={cn('text-[14.5px] font-semibold', pasado ? 'text-muted-foreground' : 'text-foreground')}>{f.nombre}</span>
          <ChapaAmbito ambito={f.ambito} />
          {f.origen === 'ia' && <ChapaIA />}
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12.5px] text-muted-foreground">
          <span>{h.semana}</span>
          {f.fuenteUrl && (
            // En la fila, la norma corta («BOE núm. 259»); entera, al pasar por encima.
            <a href={f.fuenteUrl} target="_blank" rel="noopener noreferrer nofollow" title={f.fuente ?? undefined} className="inline-flex items-center gap-1 underline-offset-2 hover:underline">
              {f.origen === 'oficial' ? f.fuente?.split(',')[0] ?? 'Boletín oficial' : f.fuente ?? 'Fuente'} <ExternalLink size={11} aria-hidden /><span className="sr-only"> (se abre en otra pestaña)</span>
            </a>
          )}
          {futuro && <Link href={`/calendario?fecha=${f.fecha}`} className="underline-offset-2 hover:underline" style={{ color: 'var(--t-text-link)' }}>Ver ese día</Link>}
        </p>
      </div>
      {f.estado === 'cerrado' && <Chapa color="var(--muted-foreground)"><CalendarX2 size={11} aria-hidden /> Cerrado</Chapa>}
      {f.estado === 'abierto' && <Chapa color="var(--success)"><Check size={11} aria-hidden /> Abres</Chapa>}
      {acciones.length > 0 ? (
        <MenuAcciones acciones={acciones} titulo={f.nombre} etiqueta={`Acciones de ${f.nombre}`} claseBoton={cn(BOTON_MENU, 'shrink-0', ocupado && 'pointer-events-none opacity-50')} />
      ) : <span className="w-9 shrink-0" aria-hidden />}
    </li>
  );
}

/** Configuración: qué pasa si cierras un festivo, con el estado de verdad y el enlace al ajuste que lo decide. */
function Configuracion({ datos, rol, devuelveSesion }: { datos: ListaDelEstudio; rol: string; devuelveSesion: boolean }) {
  const { plantillasEmail, plantillasEmailCargadas } = useStudio();
  const correo = plantillasEmailCargadas ? plantillasEmail.find(p => p.tipo === 'cancelacion')?.enviar !== false : null;
  const enlace = (id: Parameters<typeof hrefDeTarjeta>[0]) => (tarjetaVisible(id, rol)
    ? <Link href={hrefDeTarjeta(id)} className="shrink-0 text-[13px] font-semibold" style={{ color: 'var(--t-text-link)' }}>Cambiar</Link>
    : null);
  const filas: { titulo: string; texto: string; valor: string; tono?: 'si' | 'no'; accion?: ReactNode }[] = [
    {
      titulo: 'Tu localidad',
      texto: datos.comunidad ? `Los festivos oficiales son los de ${datos.comunidad}.` : 'No sabemos tu comunidad: añade tus festivos buscándolos o a mano.',
      valor: datos.localidad || 'Sin ciudad en la dirección',
      accion: enlace('nombre-y-direccion'),
    },
    { titulo: 'Las clases de ese día se cancelan', texto: 'Al cerrar un festivo nadie puede reservar ese día y las clases que hay se cancelan.', valor: 'Siempre' },
    {
      titulo: 'Tus alumnas recuperan la sesión del bono',
      texto: 'La de cada reserva cancelada vuelve a su bono.',
      valor: devuelveSesion ? 'Sí' : 'No', tono: devuelveSesion ? 'si' : 'no',
      accion: enlace('si-se-cancela-una-clase'),
    },
    {
      titulo: 'Les llega un correo avisando',
      texto: 'Y un aviso en su app, si lo tienen activado.',
      valor: correo === null ? '…' : correo ? 'Encendido' : 'Apagado', tono: correo === null ? undefined : correo ? 'si' : 'no',
      accion: enlace('correos-automaticos'),
    },
    { titulo: 'Sus bonos y recuperaciones duran un día más', texto: 'A todas tus alumnas, una vez por día cerrado.', valor: 'Siempre' },
    { titulo: 'Las clases que se repiten se saltan los festivos', texto: 'Al repetir un mes en el Calendario, los días de tu lista vienen sin marcar.', valor: 'Siempre' },
  ];
  return (
    <section aria-label="Configuración de festivos" className="space-y-4">
      <div className="rounded-t-card border border-border bg-card p-4 shadow-t-card sm:p-5">
        <CabeceraTarjeta tono="magenta" Icono={CalendarX2} titulo="Si cierras un festivo" sub="Lo que pasa con sus clases. Cerrar siempre te lo pregunta antes." />
        <ul className="mt-4 divide-y divide-border">
          {filas.map(f => (
            <li key={f.titulo} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3">
              <div className="min-w-0 flex-1 basis-60">
                <p className="text-[14px] font-semibold text-foreground">{f.titulo}</p>
                <p className="text-[12.5px] text-muted-foreground text-pretty">{f.texto}</p>
              </div>
              <span
                className="flex items-center gap-1.5 text-[13px] font-semibold"
                style={{ color: f.tono === 'si' ? 'var(--success)' : f.tono === 'no' ? 'var(--muted-foreground)' : 'var(--foreground)' }}
              >
                {f.titulo === 'Tu localidad' && <MapPin size={14} aria-hidden />}{f.valor}
              </span>
              {f.accion}
            </li>
          ))}
        </ul>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-t-card border border-border bg-card p-4 shadow-t-card sm:p-5">
        <div className="min-w-0">
          <p className="text-[14px] font-semibold text-foreground">¿Cierras varios días seguidos?</p>
          <p className="text-[12.5px] text-muted-foreground">Vacaciones, un puente largo o una reforma: eso es «Cerrar el centro».</p>
        </div>
        {tarjetaVisible('cerrar-el-centro', rol) && (
          <Link href={hrefDeTarjeta('cerrar-el-centro')} className={BOTON_BORDE}>Cerrar el centro</Link>
        )}
      </div>
    </section>
  );
}
