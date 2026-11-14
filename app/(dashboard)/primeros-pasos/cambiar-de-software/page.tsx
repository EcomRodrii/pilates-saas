'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowRight, CheckCircle2, Circle, CircleDot, ExternalLink, Loader2, ShieldAlert, Wrench } from 'lucide-react';
import { useStudio } from '@/lib/studio-context';
import { useRol, puedeGestionarClientas } from '@/lib/permisos';
import { PageHeader } from '@/components/ui/page-header';
import { cn } from '@/lib/utils';
import {
  ESTADOS, ETIQUETA_ESTADO, LIMITES_DE_LA_MIGRACION, ORIGENES, origenDe, pendientesAntesDeActivar, resolverPasos, resumirRecorrido,
  type EstadoPaso, type FilaPaso, type IdOrigen, type PasoConEstado,
} from '@/lib/migracion/recorrido';
import { cargarRecorrido, guardarPaso } from '@/lib/migracion/recorrido-cliente';
import { VideoFachada } from '@/components/ayuda/VideoFachada';
import { useVideosAcademy } from '@/components/ayuda/use-videos-academy';

// ─────────────────────────────────────────────────────────────────────────────
// «Cambiar a Tentare»: el curso de migración de Academy (lib/migracion/recorrido.ts). Del software que usas hoy a Tentare como software
// principal, en 11 pasos con cinco estados, sin perder el control.
//
// Los pasos de DATOS (importar alumnas, bonos, horario) se completan solos cuando el dato existe en el estudio; los que ocurren fuera de
// Tentare o solo ella puede dar por buenos, los marca ella y se guardan (`migracion_checklist`). Nada de «próximamente»: lo que no se puede
// traer se dice (límites), y de cada software de origen solo hay pasos cuando constan en SU documentación pública, con la fecha.
// ─────────────────────────────────────────────────────────────────────────────

const CLASE_ESTADO: Record<EstadoPaso, string> = {
  PENDIENTE: 'bg-muted text-muted-foreground',
  EN_PROGRESO: 'bg-info/10 text-info',
  COMPLETADO: 'bg-success/10 text-success',
  REQUIERE_REVISION: 'bg-warning/10 text-warning',
  BLOQUEADO: 'bg-destructive/10 text-destructive',
};

const fechaLarga = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

export default function CambiarDeSoftwarePage() {
  const { studio, socios, planesTarifa, suscripciones, sesiones, reservas } = useStudio();
  const rol = useRol();
  const puede = puedeGestionarClientas(rol);
  const video = useVideosAcademy().get('primeros-pasos/cambiar-de-software') ?? null;

  const [filas, setFilas] = useState<FilaPaso[]>([]);
  const [origenId, setOrigenId] = useState<IdOrigen | null>(null);
  const [sinTabla, setSinTabla] = useState(false);
  const [cargado, setCargado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const r = await cargarRecorrido();
    if (r.ok) { setFilas(r.filas); setOrigenId(r.origen); setSinTabla(r.sinTabla); setError(null); } else setError(r.error);
    setCargado(true);
  }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- Carga inicial desde la red: el estado viene de la respuesta.
  useEffect(() => { if (puede) void cargar(); else setCargado(true); }, [puede, cargar]);

  const pasos = useMemo(() => resolverPasos(filas, {
    numAlumnas: socios.filter(s => s.activo !== false).length,
    numPlanesActivos: planesTarifa.filter(p => p.activo).length,
    numSuscripciones: suscripciones.length,
    numClases: sesiones.length,
    numReservas: reservas.length,
  }), [filas, socios, planesTarifa, suscripciones, sesiones, reservas]);
  const resumen = resumirRecorrido(pasos);
  const origen = origenDe(origenId);

  async function cambiar(p: PasoConEstado, estado: EstadoPaso, nota?: string | null, origen?: IdOrigen) {
    setGuardando(p.paso.id); setError(null);
    const r = await guardarPaso({ paso: p.paso.id, estado, nota: nota === undefined ? p.nota : nota, origen });
    setGuardando(null);
    if (!r.ok) { setError(r.error); return; }
    await cargar();
  }

  if (!studio) return null;
  if (!puede) {
    return (
      <div className="space-y-6 max-w-3xl">
        <PageHeader back={{ href: '/primeros-pasos', label: 'Volver a Academy' }} title="Cambiar a Tentare" description="Este recorrido lo llevan quienes gestionan las clientas del estudio." />
      </div>
    );
  }

  const faltan = pendientesAntesDeActivar(pasos);

  return (
    <div className="space-y-6 max-w-3xl">
      <PageHeader
        back={{ href: '/primeros-pasos', label: 'Volver a Academy' }}
        title="Cambiar a Tentare"
        description="Del programa que usas hoy a Tentare como tu software principal, paso a paso y sin perder el control. Puedes ir a tu ritmo: nada cambia en tu estudio hasta que tú lo activas."
      />

      {video && <VideoFachada video={video} />}

      {error && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-[13px] text-destructive">{error}</p>}
      {sinTabla && <p role="status" className="rounded-xl border border-border bg-muted px-4 py-3 text-[13px] text-foreground">El guardado del recorrido todavía no está disponible. Lo que sale de tus datos (alumnas, bonos, horario) sí se calcula.</p>}

      <div className="rounded-2xl border border-border bg-card p-6" data-testid="resumen-migracion">
        <p className="text-[15px] font-semibold text-foreground">{resumen.completados} de {resumen.total} pasos · {resumen.pct}%</p>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-brand-secondary transition-all" style={{ width: `${resumen.pct}%` }} /></div>
        {resumen.conAviso.length > 0 && (
          <p className="mt-3 flex items-center gap-2 text-[13px] text-warning"><AlertTriangle size={14} aria-hidden /> {resumen.conAviso.length} {resumen.conAviso.length === 1 ? 'paso pide' : 'pasos piden'} tu atención.</p>
        )}
        {resumen.siguiente && (
          <p className="mt-3 text-[13px] text-muted-foreground">Sigue por: <span className="font-semibold text-foreground">{resumen.siguiente.paso.numero} · {resumen.siguiente.paso.titulo}</span></p>
        )}
      </div>

      {/* Lo que NO se puede traer, antes de empezar y sin letra pequeña. */}
      <section className="rounded-2xl border border-border bg-muted/40 p-5" aria-label="Lo que no se puede traer">
        <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"><ShieldAlert size={13} aria-hidden /> Lo que conviene saber antes de empezar</p>
        <ul className="mt-3 space-y-2">
          {LIMITES_DE_LA_MIGRACION.map(l => <li key={l} className="flex items-start gap-2.5 text-[13px] leading-relaxed text-foreground"><span aria-hidden className="mt-[7px] size-1.5 shrink-0 rounded-full bg-warning" /><span>{l}</span></li>)}
        </ul>
      </section>

      <ol className="space-y-3">
        {pasos.map(p => (
          <li key={p.paso.id} data-paso={p.paso.id} className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-start gap-3">
              {p.estado === 'COMPLETADO' ? <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-brand-secondary" aria-hidden />
                : p.estado === 'PENDIENTE' ? <Circle size={20} className="mt-0.5 shrink-0 text-[#D4D4CC]" aria-hidden />
                : <CircleDot size={20} className="mt-0.5 shrink-0 text-brand-secondary" aria-hidden />}
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="text-[11px] font-semibold tabular-nums text-muted-foreground">{p.paso.numero}</span>
                  <span className="text-[14px] font-semibold text-foreground">{p.paso.titulo}</span>
                  <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', CLASE_ESTADO[p.estado])} data-testid={`estado-${p.paso.id}`}>{ETIQUETA_ESTADO[p.estado]}</span>
                  {p.porDatos && <span className="text-[11px] text-muted-foreground">Se ha marcado solo, por tus datos</span>}
                </p>
                <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{p.paso.descripcion}</p>

                {/* 01 · De dónde vienes: la elección que abre la guía de exportación. */}
                {p.paso.id === 'diagnostico' && (
                  <div className="mt-3">
                    <label className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Software de origen
                      <select
                        value={origenId ?? ''} disabled={guardando !== null} aria-label="Software de origen"
                        onChange={e => { const id = e.target.value as IdOrigen; if (id) void cambiar(p, 'COMPLETADO', p.nota, id); }}
                        className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-[13px] font-medium normal-case tracking-normal text-foreground"
                      >
                        <option value="" disabled>Elige uno…</option>
                        {ORIGENES.map(o => <option key={o.id} value={o.id}>{o.nombre}</option>)}
                      </select>
                    </label>
                  </div>
                )}

                {/* 03 · Cómo exportar, del software elegido. Pasos solo si constan en su documentación; si no, se dice y se da la salida. */}
                {p.paso.id === 'exportar' && (
                  <div className="mt-3 rounded-xl border border-border bg-background p-4" data-testid="guia-origen">
                    {!origen ? (
                      <p className="text-[13px] text-muted-foreground">Elige antes de qué software vienes (paso 01) y aquí te decimos cómo sacar tus datos de ese programa.</p>
                    ) : (
                      <>
                        <p className="flex items-center gap-2 text-[13px] font-semibold text-foreground"><Wrench size={14} aria-hidden /> Cómo exportar desde {origen.nombre}</p>
                        {origen.pasos.length > 0 && (
                          <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-[13px] leading-relaxed text-foreground">{origen.pasos.map(s => <li key={s}>{s}</li>)}</ol>
                        )}
                        <p className={cn('mt-3 text-[12.5px] leading-relaxed', origen.verificado ? 'text-muted-foreground' : 'text-foreground')}>{origen.aviso}</p>
                        <p className="mt-2 text-[11.5px] text-muted-foreground">
                          {origen.verificado ? 'Pasos comprobados en su ayuda pública' : 'No confirmado en su ayuda pública'} el {fechaLarga(origen.comprobado)}. Su programa puede haber cambiado desde entonces.
                          {origen.fuente && <> · <a href={origen.fuente.href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold underline underline-offset-2">{origen.fuente.texto} <ExternalLink size={11} aria-hidden /></a></>}
                        </p>
                      </>
                    )}
                  </div>
                )}

                {p.paso.id === 'activar' && faltan.length > 0 && p.estado !== 'COMPLETADO' && (
                  <p className="mt-3 rounded-xl bg-warning/10 px-3 py-2 text-[12.5px] leading-snug text-foreground" data-testid="aviso-activar">
                    Aún te quedan {faltan.length} {faltan.length === 1 ? 'paso' : 'pasos'} sin completar. Puedes activarlo igualmente —es tu estudio—, pero lo habitual es dejar antes hecha la prueba.
                  </p>
                )}

                {p.nota && p.estado !== 'PENDIENTE' && <p className="mt-2 text-[12.5px] italic text-muted-foreground">«{p.nota}»</p>}

                <div className="mt-3 flex flex-wrap items-center gap-3">
                  {p.paso.href && p.estado !== 'COMPLETADO' && (
                    <Link href={p.paso.href} className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-[12px] font-semibold text-brand-foreground hover:brightness-95">
                      {p.paso.etiquetaHref ?? 'Hacerlo'} <ArrowRight size={12} aria-hidden />
                    </Link>
                  )}
                  {/* El diagnóstico se marca solo al elegir el origen. El resto lo cambia ella: los de datos solo para decir «requiere revisión» o «bloqueado». */}
                  {p.paso.id !== 'diagnostico' && (
                    <label className="flex items-center gap-2 text-[12px] text-muted-foreground">
                      Estado
                      <select
                        aria-label={`Estado del paso ${p.paso.numero}`} value={p.estado} disabled={guardando !== null}
                        onChange={e => {
                          const estado = e.target.value as EstadoPaso;
                          // «Requiere revisión» y «Bloqueado» piden decir por qué: es lo que luego le recuerda dónde se quedó.
                          const nota = estado === 'REQUIERE_REVISION' || estado === 'BLOQUEADO' ? window.prompt('¿Qué pasa? (una frase, opcional)', p.nota ?? '') : p.nota;
                          void cambiar(p, estado, nota ?? null);
                        }}
                        className="rounded-lg border border-border bg-background px-2 py-1.5 text-[12px] font-medium text-foreground"
                      >
                        {ESTADOS.filter(e => e !== 'COMPLETADO' || p.paso.modo === 'manual' || p.porDatos).map(e => <option key={e} value={e}>{ETIQUETA_ESTADO[e]}</option>)}
                      </select>
                    </label>
                  )}
                  {guardando === p.paso.id && <Loader2 size={14} className="animate-spin text-muted-foreground" aria-label="Guardando" />}
                </div>
              </div>
            </div>
          </li>
        ))}
      </ol>

      {!cargado && <p className="text-[13px] text-muted-foreground">Cargando tu recorrido…</p>}

      <p className="text-[12.5px] leading-relaxed text-muted-foreground">
        ¿Una duda concreta? En el <Link href="/ayuda/clientes/importar-clientes" className="font-semibold text-foreground underline underline-offset-2">Centro de ayuda</Link> hay una guía del importador, y todo lo que subes en «Traer mis datos» se puede deshacer.
      </p>
    </div>
  );
}
