'use client';

// Actualizaciones — el changelog de Tentare, dentro del panel.
//
// Existía ya, pero como una hoja que se abría desde el menú de perfil
// (`components/layout/actualizaciones-widget.tsx`): un sitio donde no entra
// nadie. Esto es la sección de verdad, con su entrada en el menú.
//
// ⚠️ NADA de lo que se ve está escrito en el código. Sale de
// `changelog_versiones` + `changelog_cambios`, que se publican desde /interno
// sin desplegar (migr 20260803203046). Si alguien añade aquí una actualización
// a mano, la sección deja de reflejar lo que se ha publicado de verdad.
//
// Lectura directa con Supabase y RLS desde el navegador —la RLS solo deja ver
// `estado = 'publicado'`— porque es el camino que ya usaban tanto el widget como
// `useMenuNovedades`, y el changelog es global: no depende del estudio.

import { useCallback, useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/db/supabase';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { DashboardDrawer } from '@/components/ui/dashboard-drawer';
import { Megaphone, Loader2, ChevronRight, BellRing, X } from 'lucide-react';
import { compararVersiones, cn } from '@/lib/utils';
import {
  aplicarFiltro, categoriaDeVersion, recuentoPorFiltro, esReciente,
  type FiltroActualizaciones, type VersionPublicada, type CambioVersion,
} from '@/lib/actualizaciones/version';
import { PreviewActualizacion, EscenaDestacada } from '@/components/actualizaciones/previews';

const PAGINA = 8;

const FILTROS: { id: FiltroActualizaciones; label: string }[] = [
  { id: 'todas', label: 'Todas' },
  { id: 'nuevas', label: 'Nuevas funciones' },
  { id: 'mejoras', label: 'Mejoras' },
  { id: 'correcciones', label: 'Correcciones' },
];

// Suaves a propósito: son cuatro etiquetas repetidas decenas de veces en una
// misma pantalla, y a plena saturación compiten con el contenido.
const CHIP: Record<Exclude<FiltroActualizaciones, 'todas'>, { label: string; clase: string }> = {
  nuevas: { label: 'Nueva función', clase: 'bg-success/10 text-success' },
  mejoras: { label: 'Mejora', clase: 'bg-info/10 text-info' },
  correcciones: { label: 'Corrección', clase: 'bg-brand-medio/12 text-brand-medio' },
};

const MESES = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
const MESES_LARGO = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function dia(iso: string) { return Number(iso.split('-')[2]); }
function mes(iso: string) { return MESES[Number(iso.split('-')[1]) - 1] ?? ''; }
function anio(iso: string) { return iso.split('-')[0]; }
function fechaLarga(iso: string) {
  const [a, m, d] = iso.split('-');
  return `${Number(d)} de ${MESES_LARGO[Number(m) - 1]} de ${a}`;
}

// El reloj, solo para decidir qué versión es «reciente». Se congela al montar y
// no avanza a propósito: el distintivo dura 14 DÍAS, así que no hay nada que
// refrescar mientras la pantalla esté abierta.
//
// ⚠️ Aquí había un `useSyncExternalStore(nada, () => Date.now(), () => null)`,
// que parece el patrón limpio y es un BUCLE INFINITO. React relee `getSnapshot`
// en cada render y lo compara con `Object.is`; `Date.now()` devuelve otro número
// casi siempre, así que la store se ve eternamente cambiada → «Maximum update
// depth exceeded» y la pantalla ENTERA al error boundary. Y lo peor es cómo
// falla: se salva solo si las dos lecturas caen en el mismo milisegundo, o sea
// que pasaba en local y reventaba al añadir una versión más a la lista.
// El reloj que sí avanza ya está resuelto en `lib/student/use-ahora.ts`, con su
// store de módulo — y su propio comentario avisaba de esta trampa: el snapshot
// tiene que ser el mismo POR IDENTIDAD entre renders, no solo del mismo tipo.
function useAhoraMs(): number | null {
  const [ms, setMs] = useState<number | null>(null);
  // `null` en servidor y en el primer render de cliente: la guarda de hidratación
  // se mantiene igual que la daba `getServerSnapshot`.
  // eslint-disable-next-line react-hooks/set-state-in-effect -- el primer render tiene que ser el del servidor
  useEffect(() => { setMs(Date.now()); }, []);
  return ms;
}

export default function ActualizacionesPage() {
  const [versiones, setVersiones] = useState<VersionPublicada[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hayMas, setHayMas] = useState(false);
  const [cargandoMas, setCargandoMas] = useState(false);
  const [filtro, setFiltro] = useState<FiltroActualizaciones>('todas');
  const [abierta, setAbierta] = useState<VersionPublicada | null>(null);
  const ahoraMs = useAhoraMs();

  const cargar = useCallback(async (limite: number) => {
    // Se pide UNA de más para saber si hay siguiente página sin un count aparte
    // — mismo truco que el widget.
    const { data, error: err } = await supabase
      .from('changelog_versiones')
      .select('id, version, titulo, fecha_publicacion, changelog_cambios(texto, etiqueta, orden, imagen_url)')
      .eq('estado', 'publicado')
      .order('fecha_publicacion', { ascending: false })
      .limit(limite + 1);
    if (err) throw new Error(err.message);
    const filas = (data ?? []) as unknown as (Omit<VersionPublicada, 'cambios'> & { changelog_cambios: CambioVersion[] })[];
    // `version` es texto en la tabla, así que 0.10 iría antes que 0.9 por
    // orden alfabético: se desempata aquí con el comparador del repo.
    const orden = filas
      .map((f) => ({
        id: f.id, version: f.version, titulo: f.titulo, fecha_publicacion: f.fecha_publicacion,
        cambios: [...(f.changelog_cambios ?? [])].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0)),
      }))
      .sort((a, b) =>
        a.fecha_publicacion === b.fecha_publicacion
          ? compararVersiones(b.version, a.version)
          : b.fecha_publicacion.localeCompare(a.fecha_publicacion));
    return { pagina: orden.slice(0, limite), hayMas: orden.length > limite };
  }, []);

  useEffect(() => {
    let vivo = true;
    cargar(PAGINA)
      .then((r) => { if (!vivo) return; setVersiones(r.pagina); setHayMas(r.hayMas); })
      .catch((e: Error) => { if (vivo) setError(e.message); })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, [cargar]);

  async function cargarMas() {
    setCargandoMas(true);
    try {
      const r = await cargar(versiones.length + PAGINA);
      setVersiones(r.pagina);
      setHayMas(r.hayMas);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCargandoMas(false);
    }
  }

  const visibles = useMemo(() => aplicarFiltro(versiones, filtro), [versiones, filtro]);
  // La destacada es la primera de TODAS, no la primera del filtro: es «la última
  // actualización», y con un filtro puesto dejaría de serlo.
  const destacada = versiones[0] ?? null;
  const resto = filtro === 'todas' ? visibles.slice(1) : visibles;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Actualizaciones"
        description="Novedades, mejoras y correcciones de Tentare. Cada semana, un estudio más fuerte."
        actions={
          <Button variant="outline" size="sm" render={<a href="/ayuda/novedades" target="_blank" rel="noopener noreferrer" />}>
            <BellRing size={14} />
            Suscribirme a las novedades
          </Button>
        }
      />

      {/* Filtros. `aria-pressed` y no un radiogroup: son alternadores de una
          lista que ya está debajo, no un formulario. */}
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar actualizaciones">
        {FILTROS.map((f) => {
          const activo = filtro === f.id;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setFiltro(f.id)}
              aria-pressed={activo}
              className={cn(
                'h-9 px-4 rounded-full text-[13px] font-semibold transition-colors',
                activo
                  ? 'bg-brand text-brand-foreground'
                  : 'border border-border bg-card text-muted-foreground hover:text-foreground hover:bg-muted',
              )}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {error && (
        <p role="alert" className="text-[13px] text-destructive">
          No hemos podido cargar las actualizaciones. {error}
        </p>
      )}

      {cargando ? (
        <Esqueleto />
      ) : versiones.length === 0 ? (
        <EmptyState
          icono={Megaphone}
          titulo="Todavía no hay actualizaciones publicadas"
          descripcion="Cuando publiquemos una versión nueva, aparecerá aquí."
        />
      ) : (
        <>
          {filtro === 'todas' && destacada && (
            <Destacada version={destacada} onAbrir={() => setAbierta(destacada)} />
          )}

          {resto.length === 0 ? (
            <EmptyState
              compacto
              icono={Megaphone}
              titulo="Nada de este tipo, de momento"
              descripcion="Prueba con otro filtro para ver el resto de actualizaciones."
            />
          ) : (
            <ol className="relative">
              {resto.map((v) => (
                <FilaTimeline
                  key={v.id}
                  version={v}
                  reciente={esReciente(v.fecha_publicacion, ahoraMs)}
                  onAbrir={() => setAbierta(v)}
                />
              ))}
            </ol>
          )}

          {hayMas && filtro === 'todas' && (
            <div className="flex justify-center pt-1">
              <Button variant="outline" size="sm" onClick={cargarMas} disabled={cargandoMas}>
                {cargandoMas ? <><Loader2 size={14} className="animate-spin" /> Cargando…</> : 'Ver más actualizaciones'}
              </Button>
            </div>
          )}

          <p className="text-center text-[12px] text-muted-foreground pt-1">
            Actualizamos Tentare cada semana.
          </p>
        </>
      )}

      <DetalleVersion version={abierta} onCerrar={() => setAbierta(null)} />
    </div>
  );
}

// ─── Destacada ───────────────────────────────────────────────────────────────

function Destacada({ version, onAbrir }: { version: VersionPublicada; onAbrir: () => void }) {
  const cat = categoriaDeVersion(version.cambios);
  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="grid lg:grid-cols-[1fr_minmax(0,430px)] items-stretch">
        <div className="p-6 lg:p-7 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex h-5 items-center rounded-full bg-brand px-2.5 text-[10px] font-bold uppercase tracking-wide text-brand-foreground">
              Última actualización
            </span>
            <span className="text-[12px] text-muted-foreground">
              Versión {version.version} · {fechaLarga(version.fecha_publicacion)}
            </span>
          </div>
          <h2 className="mt-3 text-xl lg:text-2xl font-bold text-foreground text-balance leading-tight">
            {version.titulo}
          </h2>
          <ul className="mt-3 space-y-1.5">
            {version.cambios.slice(0, 3).map((c, i) => (
              <li key={i} className="flex gap-2 text-[13px] text-muted-foreground">
                <span aria-hidden className="mt-[7px] h-1 w-1 rounded-full bg-border shrink-0" />
                <span className="text-pretty">{c.texto}</span>
              </li>
            ))}
          </ul>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Button size="sm" onClick={onAbrir}>Ver detalles</Button>
            <button
              type="button"
              onClick={onAbrir}
              className="text-[13px] font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Qué hay de nuevo en esta versión
            </button>
          </div>
        </div>
        <div className="hidden lg:block relative">
          <EscenaDestacada categoria={cat} />
        </div>
      </div>
    </section>
  );
}

// ─── Timeline ────────────────────────────────────────────────────────────────

/**
 * La captura que representa a una versión en la lista: la primera que tenga
 * alguno de sus cambios. `null` si ninguno trae imagen, que es lo normal.
 */
function portadaDe(v: VersionPublicada): string | null {
  for (const c of v.cambios) {
    const u = (c.imagen_url ?? '').trim();
    if (u !== '') return u;
  }
  return null;
}

function Miniatura({ url }: { url: string | null }) {
  const [rota, setRota] = useState(false);
  if (!url || rota) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- se publica sin desplegar; misma razón que CapturaCambio
    <img
      src={url}
      alt=""
      loading="lazy"
      onError={() => setRota(true)}
      className="hidden md:block w-[152px] h-[92px] shrink-0 rounded-xl border border-border object-cover object-top transition-transform duration-200 group-hover:scale-[1.04]"
    />
  );
}

function FilaTimeline({
  version, reciente, onAbrir,
}: { version: VersionPublicada; reciente: boolean; onAbrir: () => void }) {
  const cat = categoriaDeVersion(version.cambios);
  const chip = CHIP[cat];
  const cuenta = recuentoPorFiltro(version.cambios);
  const total = version.cambios.length;

  return (
    <li className="grid grid-cols-[auto_1fr] sm:grid-cols-[64px_auto_1fr] gap-x-3 sm:gap-x-4">
      {/* La fecha, fuera de la tarjeta. En móvil se va arriba: una columna de
          64px a la izquierda deja la tarjeta sin sitio para respirar. */}
      <div className="hidden sm:block pt-4 text-right">
        <p className="text-[13px] font-bold text-foreground leading-none tabular-nums">
          {dia(version.fecha_publicacion)} {mes(version.fecha_publicacion)}
        </p>
        <p className="text-[11px] text-muted-foreground leading-none mt-1 tabular-nums">
          {anio(version.fecha_publicacion)}
        </p>
      </div>

      {/* El raíl. La línea nace en el punto y baja: así el último no arrastra
          una línea que no lleva a ninguna parte. */}
      <div aria-hidden className="flex flex-col items-center">
        <div className="h-4" />
        <span className="h-2 w-2 rounded-full bg-brand shrink-0" />
        <div className="w-px flex-1 bg-border" />
      </div>

      <div className="min-w-0 pb-3">
        <button
          type="button"
          onClick={onAbrir}
          className="group w-full text-left rounded-2xl border border-border bg-card p-4 transition-all duration-200 hover:border-foreground/15 hover:shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <div className="flex gap-4 items-center">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className={cn('inline-flex h-5 items-center rounded-full px-2 text-[10px] font-bold uppercase tracking-wide', chip.clase)}>
                  {chip.label}
                </span>
                {reciente && (
                  <span className="inline-flex h-5 items-center rounded-full bg-brand px-2 text-[10px] font-bold uppercase tracking-wide text-brand-foreground">
                    Nueva
                  </span>
                )}
                {/* La fecha vuelve a aparecer en móvil, donde su columna no está. */}
                <span className="sm:hidden text-[11px] text-muted-foreground tabular-nums">
                  {dia(version.fecha_publicacion)} {mes(version.fecha_publicacion)} {anio(version.fecha_publicacion)}
                </span>
              </div>
              <p className="mt-1.5 text-[15px] font-bold text-foreground leading-snug text-pretty">
                {version.titulo}
              </p>
              <p className="mt-1 text-[13px] text-muted-foreground line-clamp-2 text-pretty">
                {version.cambios[0]?.texto}
              </p>
              <p className="mt-2 text-[11px] text-muted-foreground">
                {total} {total === 1 ? 'cambio' : 'cambios'}
                {cuenta.nuevas > 0 && ` · ${cuenta.nuevas} nuevo${cuenta.nuevas === 1 ? '' : 's'}`}
                {cuenta.mejoras > 0 && ` · ${cuenta.mejoras} mejora${cuenta.mejoras === 1 ? '' : 's'}`}
                {cuenta.correcciones > 0 && ` · ${cuenta.correcciones} corrección${cuenta.correcciones === 1 ? '' : 'es'}`}
              </p>
            </div>

            {/* ⚠️ La miniatura es la CAPTURA de esta versión, y si no tiene, no hay
                miniatura. Antes se pintaba aquí la escena de su categoría, y el
                resultado era que cuatro filas seguidas de «nuevas funciones»
                enseñaban el MISMO dibujo: una lista donde todo se ve igual no
                distingue nada y se lee como un fallo de carga. Es la regla que
                `public/por-defecto/README.md` ya dejó escrita para las fotos de
                estudio («la misma foto ocho veces en una pantalla se lee como un
                error»), aplicada aquí. La escena de categoría sigue viva donde sí
                aporta: el bloque destacado y el detalle sin capturas. */}
            <Miniatura url={portadaDe(version)} />

            <ChevronRight
              size={16}
              aria-hidden
              className="hidden sm:block shrink-0 text-muted-foreground opacity-0 -translate-x-1 transition-all duration-200 group-hover:opacity-100 group-hover:translate-x-0"
            />
          </div>
        </button>
      </div>
    </li>
  );
}

// ─── Detalle ─────────────────────────────────────────────────────────────────

/**
 * La captura de un cambio concreto, si la tiene.
 *
 * `alt=""` a propósito: el texto del cambio va JUSTO al lado y dice lo mismo.
 * Repetirlo en el `alt` le hace oír dos veces la misma frase a quien usa lector
 * de pantalla, que es peor que no describir una imagen ya descrita.
 *
 * `<img>` crudo y no `next/image`: la URL vive en Supabase Storage y se publica
 * desde /interno SIN desplegar, que es el sentido entero del changelog. Con el
 * optimizador habría que tocar `remotePatterns` y volver a desplegar, o la
 * imagen no cargaría.
 *
 * ⚠️ Si el fichero desaparece del bucket, se ESCONDE en vez de dejar el icono
 * de imagen rota: una versión antigua con una foto que ya no está no debe
 * estropear la lectura de un changelog que sigue siendo correcto.
 */
function CapturaCambio({ url }: { url?: string | null }) {
  const [rota, setRota] = useState(false);
  if (!url || rota) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- se publica sin desplegar; ver arriba
    <img
      src={url}
      alt=""
      loading="lazy"
      onError={() => setRota(true)}
      // Alto acotado y ancho libre: una captura de panel (1380×812) ocupa el
      // ancho entero, y una de móvil (393×852) se queda en su tamaño de teléfono
      // en vez de estirarse hasta comerse la pantalla del drawer entera.
      className="mt-2.5 max-h-[380px] w-auto max-w-full rounded-lg border border-border bg-muted"
    />
  );
}

function DetalleVersion({ version, onCerrar }: { version: VersionPublicada | null; onCerrar: () => void }) {
  if (!version) return null;
  const cat = categoriaDeVersion(version.cambios);
  const tieneCapturas = version.cambios.some((c) => (c.imagen_url ?? '') !== '');
  const porTipo: { id: Exclude<FiltroActualizaciones, 'todas'>; titulo: string }[] = [
    { id: 'nuevas', titulo: 'Nuevo' },
    { id: 'mejoras', titulo: 'Mejoras' },
    { id: 'correcciones', titulo: 'Correcciones' },
  ];
  return (
    <DashboardDrawer open onClose={onCerrar} label={`Versión ${version.version}`} portal>
      <div className="flex flex-col h-full">
        <div className="shrink-0 flex items-start justify-between gap-4 px-6 pt-6 pb-4 border-b border-border">
          <div className="min-w-0">
            <span className={cn('inline-flex h-5 items-center rounded-full px-2 text-[10px] font-bold uppercase tracking-wide', CHIP[cat].clase)}>
              {CHIP[cat].label}
            </span>
            <h2 className="mt-2 text-[17px] font-bold text-foreground leading-snug text-pretty">{version.titulo}</h2>
            <p className="mt-1 text-[12px] text-muted-foreground">
              Versión {version.version} · {fechaLarga(version.fecha_publicacion)}
            </p>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="shrink-0 w-9 h-9 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* La escena de categoría solo si NO hay capturas de verdad. Con ambas,
              lo primero que se ve es el dibujo genérico y lo real queda debajo —
              justo al revés de lo que interesa. */}
          {!tieneCapturas && <PreviewActualizacion categoria={cat} className="w-full h-[150px]" />}
          {porTipo.map(({ id, titulo }) => {
            const items = version.cambios.filter((c) => CHIP[categoriaDeCambio(c)].label === CHIP[id].label);
            if (items.length === 0) return null;
            return (
              <section key={id}>
                <h3 className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{titulo}</h3>
                <ul className="mt-2 space-y-2">
                  {items.map((c, i) => (
                    <li key={i} className="flex gap-2.5 text-[13.5px] text-foreground">
                      <span aria-hidden className={cn('mt-[7px] h-1.5 w-1.5 rounded-full shrink-0', id === 'nuevas' ? 'bg-success' : id === 'mejoras' ? 'bg-info' : 'bg-brand-medio')} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-pretty leading-relaxed">{c.texto}</span>
                        <CapturaCambio url={c.imagen_url} />
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      </div>
    </DashboardDrawer>
  );
}

function categoriaDeCambio(c: CambioVersion): Exclude<FiltroActualizaciones, 'todas'> {
  return c.etiqueta === 'NUEVA_FUNCIONALIDAD' ? 'nuevas' : c.etiqueta === 'ARREGLO' ? 'correcciones' : 'mejoras';
}

// ─── Carga ───────────────────────────────────────────────────────────────────

/** Con la forma de lo que va a llegar: destacada + filas, para que no salte. */
function Esqueleto() {
  return (
    <div className="space-y-6" role="status" aria-busy="true">
      <span className="sr-only">Cargando actualizaciones…</span>
      <div className="h-[220px] rounded-2xl border border-border bg-card animate-pulse" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="grid grid-cols-[auto_1fr] sm:grid-cols-[64px_auto_1fr] gap-x-3 sm:gap-x-4">
          <div className="hidden sm:block" />
          <div aria-hidden className="flex flex-col items-center">
            <div className="h-4" />
            <span className="h-2 w-2 rounded-full bg-border" />
            <div className="w-px flex-1 bg-border" />
          </div>
          <div className="pb-3">
            <div className="h-[112px] rounded-2xl border border-border bg-card animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  );
}
