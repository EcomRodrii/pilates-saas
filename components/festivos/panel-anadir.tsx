'use client';

// ─────────────────────────────────────────────────────────────────────────────
// «Añadir festivos» (módulo Festivos, panel nuevo): el panel lateral de Bonsai
// (b-90-festivos-02…13) con lo que a Bonsai le falta.
//
//   · Buscar: «Tu localidad» ya viene puesta (la ciudad del estudio). Sale UNA
//     lista con TODOS los festivos de hoy a final del año que viene, por años:
//     los oficiales (Año Nuevo, Reyes, Navidad, los de la comunidad), del
//     boletín copiado en el código, y las fiestas locales que encuentra la IA.
//     Vienen marcados los oficiales y lo de la IA con fuente vista; lo de la IA
//     sin fuente, desmarcado. Lo que ya está en la lista se enseña con su ✓ y no
//     se vuelve a añadir. Nada se guarda hasta pulsar «Añadir N festivos».
//   · A mano: un nombre y un día. Para varios días seguidos (vacaciones) ya
//     existe «Cerrar el centro», y se enlaza.
//
// Nada optimista: las filas se ponen en verde cuando el servidor dice que se
// han guardado, y solo entonces salen los fuegos artificiales (los lanza la
// pantalla, que sigue montada cuando este panel se cierra).
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { ArrowLeft, Check, ExternalLink, Loader2, MapPin, PenLine, Sparkles, TriangleAlert, X } from 'lucide-react';
import { DashboardDrawer } from '@/components/ui/dashboard-drawer';
import { BotonVivo } from '@/components/dashboard/vivo';
import { cn } from '@/lib/utils';
import { fechaDelFestivo } from '@/lib/festivos/textos';
import { NOMBRE_MAX, recuentoDeFestivos, textoAnadir, type FestivoPropuesto } from '@/lib/festivos/lista';
import { buscarFestivos, guardarFestivos, type Busqueda, type FestivoParaGuardar } from '@/lib/festivos/modulo-cliente';
import { hrefDeTarjeta } from '@/lib/configuracion/destino';
import { BotonBordeVivo, ChapaAmbito, ChapaIA } from './piezas';

type Modo = 'buscar' | 'manual';

export function PanelAnadirFestivos({ open, onClose, modoInicial, localidadInicial, hoy, puedeVerCierres, onGuardados }: {
  open: boolean;
  onClose: () => void;
  modoInicial: Modo;
  localidadInicial: string;
  hoy: string;
  /** Si este rol abre «Cerrar el centro» en Configuración (para enlazarlo). */
  puedeVerCierres: boolean;
  /** Lo que el servidor ha guardado de verdad: la pantalla recarga, avisa y lanza los fuegos. */
  onGuardados: (r: { creados: number; yaEstaban: number }) => void;
}) {
  return (
    <DashboardDrawer
      open={open}
      onClose={onClose}
      label="Añadir festivos"
      sheetClassName="relative flex h-full w-full flex-col bg-card shadow-[-20px_0_60px_-20px_rgba(0,0,0,0.3)] lg:w-[520px]"
    >
      {/* Se vuelve a montar al abrir: cada vez empieza limpio, con la localidad del estudio. */}
      {open && (
        <Contenido
          modoInicial={modoInicial}
          localidadInicial={localidadInicial}
          hoy={hoy}
          puedeVerCierres={puedeVerCierres}
          onClose={onClose}
          onGuardados={onGuardados}
        />
      )}
    </DashboardDrawer>
  );
}

function Contenido({ modoInicial, localidadInicial, hoy, puedeVerCierres, onClose, onGuardados }: {
  modoInicial: Modo; localidadInicial: string; hoy: string; puedeVerCierres: boolean;
  onClose: () => void; onGuardados: (r: { creados: number; yaEstaban: number }) => void;
}) {
  const [modo, setModo] = useState<Modo>(modoInicial);
  return (
    <>
      <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div className="min-w-0">
          <h2 className="text-[18px] font-bold leading-tight text-foreground">{modo === 'buscar' ? 'Añadir festivos' : 'Añadir un festivo a mano'}</h2>
          <p className="mt-0.5 text-[12.5px] text-muted-foreground text-pretty">
            {modo === 'buscar'
              ? 'Busca los de tu localidad y elige cuáles son festivo en tu estudio.'
              : 'Un día que tu estudio no abre y no está en ningún boletín: un puente, la fiesta de tu barrio…'}
          </p>
        </div>
        <button type="button" onClick={onClose} aria-label="Cerrar" className="flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
          <X size={18} aria-hidden />
        </button>
      </header>
      {modo === 'buscar' ? (
        <Buscar localidadInicial={localidadInicial} hoy={hoy} onManual={() => setModo('manual')} onGuardados={onGuardados} />
      ) : (
        <AMano hoy={hoy} puedeVerCierres={puedeVerCierres} onBuscar={() => setModo('buscar')} onGuardados={onGuardados} />
      )}
    </>
  );
}

// ─── Buscar ──────────────────────────────────────────────────────────────────

/** Lo que viene marcado: lo del boletín y lo de la IA con fuente vista. Lo de la IA sin fuente, a criterio de ella. */
const marcadoDeSerie = (f: FestivoPropuesto) => !f.yaEnLista && (f.origen === 'oficial' || !!f.fuenteUrl);

function Buscar({ localidadInicial, hoy, onManual, onGuardados }: {
  localidadInicial: string; hoy: string; onManual: () => void; onGuardados: (r: { creados: number; yaEstaban: number }) => void;
}) {
  const [localidad, setLocalidad] = useState(localidadInicial);
  const [buscando, setBuscando] = useState(false);
  const [busqueda, setBusqueda] = useState<Busqueda | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [guardando, setGuardando] = useState(false);
  const [guardadas, setGuardadas] = useState<Set<string> | null>(null);
  const [errorGuardar, setErrorGuardar] = useState<string | null>(null);
  const enVuelo = useRef(false);

  const elegibles = useMemo(() => (busqueda?.propuestos ?? []).filter(f => !f.yaEnLista), [busqueda]);
  const nMarcadas = elegibles.filter(f => marcadas.has(f.fecha)).length;
  const porAnio = useMemo(() => {
    const grupos = new Map<string, FestivoPropuesto[]>();
    for (const f of busqueda?.propuestos ?? []) grupos.set(f.fecha.slice(0, 4), [...(grupos.get(f.fecha.slice(0, 4)) ?? []), f]);
    return [...grupos.entries()];
  }, [busqueda]);

  async function buscar(e?: FormEvent) {
    e?.preventDefault();
    if (enVuelo.current || !localidad.trim()) return;
    enVuelo.current = true;
    setBuscando(true);
    setError(null);
    setErrorGuardar(null);
    setGuardadas(null);
    try {
      const r = await buscarFestivos(localidad.trim());
      if (!r.ok) { setError(r.error); return; }
      setBusqueda(r.datos);
      setMarcadas(new Set(r.datos.propuestos.filter(marcadoDeSerie).map(f => f.fecha)));
    } finally {
      enVuelo.current = false;
      setBuscando(false);
    }
  }

  function marcar(fecha: string, si: boolean) {
    setMarcadas(prev => {
      const otra = new Set(prev);
      if (si) otra.add(fecha); else otra.delete(fecha);
      return otra;
    });
  }

  async function anadir() {
    if (!busqueda || enVuelo.current || nMarcadas === 0) return;
    enVuelo.current = true;
    setGuardando(true);
    setErrorGuardar(null);
    try {
      const elegidos: FestivoParaGuardar[] = elegibles.filter(f => marcadas.has(f.fecha)).map(f => ({
        fecha: f.fecha, nombre: f.nombre, origen: f.origen, ambito: f.ambito, fuenteUrl: f.fuenteUrl,
      }));
      const r = await guardarFestivos(elegidos, busqueda.localidad);
      if (!r.ok) { setErrorGuardar(r.error); return; }
      // En verde lo que el servidor dice que ha guardado (y lo que ya estaba).
      setGuardadas(new Set(elegidos.map(f => f.fecha)));
      onGuardados({ creados: r.datos.creados.length, yaEstaban: r.datos.yaEstaban });
    } finally {
      enVuelo.current = false;
      setGuardando(false);
    }
  }

  const todasMarcadas = elegibles.length > 0 && nMarcadas === elegibles.length;
  const hecho = guardadas !== null;
  const nLocales = busqueda?.propuestos.filter(f => f.origen === 'ia').length ?? 0;
  const nYa = (busqueda?.propuestos.length ?? 0) - elegibles.length;

  return (
    <>
      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
        <form onSubmit={buscar} className="space-y-3 rounded-2xl border border-border bg-muted/40 p-4">
          <p className="text-[12.5px] leading-snug text-muted-foreground text-pretty">
            Te enseñamos <strong className="font-semibold text-foreground">todos los festivos</strong> de tu localidad hasta final de {Number(hoy.slice(0, 4)) + 1}:
            {' '}los nacionales y los de tu comunidad, del boletín oficial, y las <strong className="font-semibold text-foreground">fiestas locales</strong>, que busca la IA en el boletín y en la web de tu ayuntamiento.
          </p>
          <label className="block">
            <span className="mb-1 block text-[12px] font-semibold text-foreground">Tu localidad</span>
            <span className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 focus-within:ring-3 focus-within:ring-ring/40">
              <MapPin size={15} className="shrink-0 text-muted-foreground" aria-hidden />
              <input
                value={localidad}
                onChange={e => setLocalidad(e.target.value)}
                maxLength={60}
                placeholder="Madrid, Sabadell, 29680…"
                autoComplete="address-level2"
                disabled={buscando}
                className="min-h-11 min-w-0 flex-1 bg-transparent text-[14px] text-foreground outline-none placeholder:text-muted-foreground"
              />
            </span>
          </label>
          <BotonBordeVivo type="submit" disabled={buscando || !localidad.trim()} buscando={buscando} className="w-full">
            {buscando
              ? <><Loader2 size={16} className="animate-spin" aria-hidden /> Buscando…</>
              : <><Sparkles size={16} style={{ color: 'var(--t-magenta-500)' }} aria-hidden /> {busqueda ? 'Buscar otra vez' : 'Buscar los festivos de mi localidad'}</>}
          </BotonBordeVivo>
        </form>

        {error && <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-[13px] font-medium text-destructive">{error}</p>}

        {buscando && <Buscando localidad={localidad.trim()} />}

        {!buscando && busqueda && (
          <section aria-label="Festivos encontrados" className="space-y-4" data-testid="festivos-encontrados">
            <div className="space-y-1">
              <p className="text-[14px] font-semibold text-foreground text-pretty">
                {busqueda.localidad}: {recuentoDeFestivos(busqueda.propuestos.length)} hasta final de {Number(hoy.slice(0, 4)) + 1}
              </p>
              <p className="text-[12.5px] leading-snug text-muted-foreground text-pretty">
                {busqueda.comunidad
                  ? `Los nacionales y los de ${busqueda.comunidad} salen del boletín oficial`
                  : `No reconocemos la comunidad de ${busqueda.localidad}: los nacionales salen del boletín oficial y lo demás lo ha buscado la IA`}
                {nLocales > 0 ? `; ${nLocales === 1 ? 'la fiesta local la ha' : `las ${nLocales} fiestas locales las ha`} encontrado la IA: compruébalas con su fuente.` : '.'}
                {nYa > 0 ? ` ${nYa === 1 ? '1 ya está' : `${nYa} ya están`} en tu lista.` : ''}
              </p>
            </div>
            {busqueda.otraComunidad && (
              <p className="rounded-xl bg-muted/60 px-3 py-2 text-[12.5px] leading-snug text-foreground text-pretty">
                {busqueda.localidad} es de {busqueda.comunidad}, pero la dirección de tu estudio es de {busqueda.otraComunidad}, y tu lista ya trae sus festivos.
                {' '}Si tu sala está en {busqueda.localidad}, corrige la dirección en Configuración.
              </p>
            )}

            {busqueda.avisos.length > 0 && (
              <ul className="space-y-1.5 rounded-xl px-3 py-2.5" style={{ backgroundColor: 'color-mix(in srgb, var(--warning) 12%, transparent)' }}>
                {busqueda.avisos.map(a => (
                  <li key={a} className="flex items-start gap-2 text-[12.5px] leading-snug text-foreground">
                    <TriangleAlert size={14} className="mt-0.5 shrink-0" style={{ color: 'var(--warning)' }} aria-hidden /> {a}
                  </li>
                ))}
              </ul>
            )}

            {/* Si la IA ya explica por qué no hay (un aviso), no se repite. */}
            {busqueda.ia === 'ok' && nLocales === 0 && busqueda.avisos.length === 0 && (
              <p className="rounded-xl border border-dashed border-border px-3 py-3 text-[12.5px] text-muted-foreground text-pretty">
                La IA no ha encontrado fiestas locales de {busqueda.localidad} que queden por venir. Las del año que viene suelen publicarse a final de año:
                {' '}vuelve a buscarlas entonces, o añádelas a mano.
              </p>
            )}

            {elegibles.length > 0 && !hecho && (
              <div className="flex items-center justify-between gap-3">
                <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-[13px] font-semibold text-foreground md:min-h-8">
                  <input
                    type="checkbox"
                    className="size-4 accent-[var(--t-blue-500)]"
                    checked={todasMarcadas}
                    ref={el => { if (el) el.indeterminate = nMarcadas > 0 && !todasMarcadas; }}
                    onChange={e => setMarcadas(e.target.checked ? new Set(elegibles.map(f => f.fecha)) : new Set())}
                  />
                  {todasMarcadas ? 'Quitar todos' : 'Marcar todos'}
                </label>
                <span className="text-[12px] text-muted-foreground tabular-nums">{nMarcadas} de {elegibles.length} marcados</span>
              </div>
            )}

            {porAnio.map(([anio, festivos]) => (
              <Anio
                key={anio}
                anio={anio}
                sinCalendario={busqueda.sinCalendario.includes(Number(anio))}
                festivos={festivos}
                marcadas={marcadas}
                guardadas={guardadas}
                hoy={hoy}
                deshabilitado={guardando || hecho}
                onMarcar={marcar}
              />
            ))}
          </section>
        )}

        {!busqueda && !buscando && (
          <button type="button" onClick={onManual} className="inline-flex items-center gap-1.5 text-[13px] font-semibold" style={{ color: 'var(--t-text-link)' }}>
            <PenLine size={14} aria-hidden /> O añade uno a mano
          </button>
        )}
      </div>

      {busqueda && !buscando && (
        <footer className="space-y-2 border-t border-border px-5 py-4">
          {errorGuardar && <p role="alert" className="text-[12.5px] font-medium text-destructive">{errorGuardar}</p>}
          {hecho ? (
            <p role="status" className="flex items-center gap-2 text-[13.5px] font-semibold" style={{ color: 'var(--success)' }}>
              <Check size={16} aria-hidden /> Añadidos a tus festivos
            </p>
          ) : elegibles.length === 0 ? (
            <p role="status" className="flex items-center gap-2 text-[13.5px] font-semibold text-foreground">
              <Check size={16} style={{ color: 'var(--success)' }} aria-hidden /> Ya tienes todos en tu lista
            </p>
          ) : (
            <div className="flex items-center gap-3">
              <BotonVivo
                label={guardando ? 'Añadiendo…' : textoAnadir(nMarcadas)}
                onClick={() => void anadir()}
                disabled={guardando || nMarcadas === 0}
                grande
                className="flex-1"
              />
              <button type="button" onClick={onManual} className="shrink-0 text-[12.5px] font-semibold" style={{ color: 'var(--t-text-link)' }}>
                Uno a mano
              </button>
            </div>
          )}
        </footer>
      )}
    </>
  );
}

/** Mientras busca: qué está haciendo, sin inventar un progreso que no conocemos. */
function Buscando({ localidad }: { localidad: string }) {
  return (
    <div role="status" aria-live="polite" className="space-y-3 rounded-2xl border border-border p-4" data-testid="festivos-buscando">
      <p className="flex items-center gap-2 text-[13.5px] font-semibold text-foreground">
        <Loader2 size={16} className="animate-spin" style={{ color: 'var(--t-magenta-500)' }} aria-hidden />
        Buscando los festivos de {localidad || 'tu localidad'}
      </p>
      <ul className="space-y-1.5 text-[12.5px] text-muted-foreground">
        <li>· Los nacionales y los de tu comunidad, del boletín oficial.</li>
        <li>· Las fiestas locales, con IA, en el boletín y en la web de tu ayuntamiento.</li>
      </ul>
      <p className="text-[12px] text-muted-foreground">Suele tardar menos de un minuto.</p>
      <div aria-hidden className="space-y-2 pt-1">
        {[0, 1, 2].map(i => <div key={i} className="h-11 animate-pulse rounded-xl bg-muted" style={{ animationDelay: `${i * 120}ms` }} />)}
      </div>
    </div>
  );
}

function Anio({ anio, sinCalendario, festivos, marcadas, guardadas, hoy, deshabilitado, onMarcar }: {
  anio: string; sinCalendario: boolean; festivos: FestivoPropuesto[]; marcadas: ReadonlySet<string>;
  guardadas: ReadonlySet<string> | null; hoy: string; deshabilitado: boolean; onMarcar: (fecha: string, si: boolean) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-[15px] font-bold text-foreground tabular-nums">{anio}</h3>
        <span className="text-[12px] text-muted-foreground">{recuentoDeFestivos(festivos.length)}</span>
      </div>
      {sinCalendario && (
        <p className="text-[12px] leading-snug text-muted-foreground text-pretty">
          El boletín de tu comunidad aún no ha publicado {anio}: lo que no es nacional lo ha buscado la IA.
        </p>
      )}
      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card" data-testid={`festivos-${anio}`}>
        {festivos.map((f, i) => {
          const ya = f.yaEnLista;
          const guardada = guardadas?.has(f.fecha) ?? false;
          const marcada = marcadas.has(f.fecha) && !ya;
          return (
            <li
              key={f.fecha}
              data-testid="festivo-encontrado"
              data-fecha={f.fecha}
              data-origen={f.origen}
              className={cn('transition-colors', guardada ? 'bg-[color-mix(in_srgb,var(--success)_10%,transparent)]' : marcada ? 'bg-[color-mix(in_srgb,var(--t-blue-500)_6%,transparent)]' : '')}
            >
              <label className={cn('flex min-h-12 items-center gap-3 px-3 py-2.5', ya || deshabilitado ? 'cursor-default' : 'cursor-pointer')}>
                {guardada ? (
                  <span className="reserva-check-pop flex size-5 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: 'var(--success)', color: 'var(--card)', animationDelay: `${Math.min(i, 20) * 45}ms` }} aria-hidden>
                    <Check size={12} strokeWidth={3} />
                  </span>
                ) : ya ? (
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground" aria-hidden>
                    <Check size={12} strokeWidth={3} />
                  </span>
                ) : (
                  <input
                    type="checkbox"
                    className="size-4 shrink-0 accent-[var(--t-blue-500)]"
                    checked={marcada}
                    disabled={deshabilitado}
                    onChange={e => onMarcar(f.fecha, e.target.checked)}
                    aria-label={`${f.nombre}, ${fechaDelFestivo(f.fecha, hoy)}`}
                  />
                )}
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className={cn('text-[13.5px] font-semibold', ya ? 'text-muted-foreground' : 'text-foreground')}>{f.nombre}</span>
                    <ChapaAmbito ambito={f.ambito} />
                    {f.origen === 'ia' && <ChapaIA />}
                    {ya && <span className="text-[11px] font-semibold text-muted-foreground">Ya en tu lista</span>}
                  </span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px] text-muted-foreground">
                    <span className="first-letter:uppercase">{fechaDelFestivo(f.fecha, hoy)}</span>
                    {f.fuenteUrl ? (
                      <a href={f.fuenteUrl} target="_blank" rel="noopener noreferrer nofollow" onClick={e => e.stopPropagation()} title={f.fuente ?? undefined}
                        className="inline-flex items-center gap-1 font-semibold underline-offset-2 hover:underline" style={{ color: 'var(--t-text-link)' }}>
                        {(f.origen === 'oficial' ? f.fuente?.split(',')[0] : f.fuente) ?? 'Ver la fuente'} <ExternalLink size={11} aria-hidden /><span className="sr-only"> (se abre en otra pestaña)</span>
                      </a>
                    ) : f.origen === 'oficial' ? (
                      <span>Boletín oficial</span>
                    ) : (
                      <span>sin fuente: compruébalo tú</span>
                    )}
                  </span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ─── A mano ──────────────────────────────────────────────────────────────────

function AMano({ hoy, puedeVerCierres, onBuscar, onGuardados }: {
  hoy: string; puedeVerCierres: boolean; onBuscar: () => void; onGuardados: (r: { creados: number; yaEstaban: number }) => void;
}) {
  const [nombre, setNombre] = useState('');
  const [fecha, setFecha] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState(false);
  const enVuelo = useRef(false);
  const hasta = `${Number(hoy.slice(0, 4)) + 1}-12-31`;

  async function guardar(e: FormEvent) {
    e.preventDefault();
    if (enVuelo.current) return;
    if (!nombre.trim()) { setError('Ponle un nombre.'); return; }
    if (!fecha) { setError('Elige el día.'); return; }
    enVuelo.current = true;
    setGuardando(true);
    setError(null);
    try {
      const r = await guardarFestivos([{ fecha, nombre: nombre.trim(), origen: 'manual' }]);
      if (!r.ok) { setError(r.error); return; }
      if (r.datos.creados.length === 0) { setError('Ese día ya está en tus festivos.'); return; }
      setHecho(true);
      onGuardados({ creados: r.datos.creados.length, yaEstaban: r.datos.yaEstaban });
    } finally {
      enVuelo.current = false;
      setGuardando(false);
    }
  }

  return (
    <form onSubmit={guardar} className="flex flex-1 flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
        <button type="button" onClick={onBuscar} className="inline-flex items-center gap-1.5 text-[13px] font-semibold" style={{ color: 'var(--t-text-link)' }}>
          <ArrowLeft size={14} aria-hidden /> Buscar los de tu localidad
        </button>
        <label className="block">
          <span className="mb-1 block text-[12px] font-semibold text-foreground">Nombre</span>
          <input
            value={nombre}
            onChange={e => setNombre(e.target.value)}
            maxLength={NOMBRE_MAX}
            placeholder="Puente de diciembre, fiesta del barrio…"
            className="min-h-11 w-full rounded-xl border border-border bg-card px-3 text-[14px] text-foreground outline-none placeholder:text-muted-foreground focus:ring-3 focus:ring-ring/40"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[12px] font-semibold text-foreground">Día</span>
          <input
            type="date"
            value={fecha}
            min={hoy}
            max={hasta}
            onChange={e => setFecha(e.target.value)}
            className="min-h-11 w-full rounded-xl border border-border bg-card px-3 text-[14px] text-foreground outline-none focus:ring-3 focus:ring-ring/40"
          />
        </label>
        <p className="rounded-xl bg-muted/50 px-3 py-2.5 text-[12.5px] leading-snug text-muted-foreground text-pretty">
          Añadirlo no cancela ninguna clase: luego decides en «Comprobar clases» si ese día cierras o abres igualmente.
          {' '}¿Cierras varios días seguidos por vacaciones?{' '}
          {puedeVerCierres
            ? <Link href={hrefDeTarjeta('cerrar-el-centro')} className="font-semibold underline underline-offset-2" style={{ color: 'var(--t-text-link)' }}>Usa «Cerrar el centro»</Link>
            : 'Para eso está «Cerrar el centro», en Configuración.'}
        </p>
        {error && <p role="alert" className="text-[12.5px] font-medium text-destructive">{error}</p>}
      </div>
      <footer className="border-t border-border px-5 py-4">
        {hecho ? (
          <p role="status" className="flex items-center gap-2 text-[13.5px] font-semibold" style={{ color: 'var(--success)' }}>
            <Check size={16} aria-hidden /> Añadido a tus festivos
          </p>
        ) : (
          <BotonVivo type="submit" label={guardando ? 'Añadiendo…' : 'Añadir festivo'} disabled={guardando} grande className="w-full" />
        )}
      </footer>
    </form>
  );
}
