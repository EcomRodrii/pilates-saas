'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Download, ListChecks, Search, Settings2 } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { useStudio } from '@/lib/studio-context';
import { useRol, puedeGestionarClientas, puedeGestionarCamposPersonalizados } from '@/lib/permisos';
import { esTipoPregunta, type PreguntaAlta } from '@/lib/preguntas-alta';
import {
  csvRespuestas, filasRespuestas, resumenPreguntas, textoRespuesta,
  type FilaRespuestas, type ResumenPregunta,
} from '@/lib/preguntas-alta-resumen';
import { cn } from '@/lib/utils';

// Las respuestas de todas las alumnas a las preguntas del estudio («Datos extra
// de la ficha»), juntas. Hasta ahora solo se veían abriendo ficha a ficha.
//
// Vive DENTRO de Clientas (sin entrada nueva en el menú): es otra forma de mirar
// a las mismas clientas. No pide nada al servidor: preguntas y respuestas ya las
// tiene cargadas el panel (`camposPersonalizados`, `socios.camposExtra`), con la
// misma RLS que la ficha.

type Filtro = 'todas' | 'faltan' | 'completas';
const PAGINA = 60;

function descargar(nombre: string, contenido: string) {
  // BOM para que Excel abra bien las tildes.
  const blob = new Blob(['﻿' + contenido], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(url);
}

function Estado({ f }: { f: FilaRespuestas }) {
  return f.pendientes === 0 ? (
    <span className="inline-flex shrink-0 items-center rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-semibold text-success">
      Completa
    </span>
  ) : (
    <span className="inline-flex shrink-0 items-center rounded-full bg-warning/10 px-2 py-0.5 text-[11px] font-semibold text-warning">
      Le falta{f.pendientes === 1 ? '' : 'n'} {f.pendientes}
    </span>
  );
}

function TarjetaResumen({ p, r, total }: { p: PreguntaAlta; r: ResumenPregunta; total: number }) {
  const base = Math.max(r.contestadas, 1);
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-[13px] font-semibold text-foreground">
        {p.etiqueta}
        {p.requerido && <span className="ml-1.5 text-[11px] font-medium text-muted-foreground">· obligatoria</span>}
      </p>
      <p className="mt-0.5 text-[12px] text-muted-foreground">
        {r.contestadas} de {total} {total === 1 ? 'la ha contestado' : 'la han contestado'}
      </p>
      {r.reparto && r.contestadas > 0 && (
        <ul className="mt-3 space-y-2">
          {r.reparto.map((o) => {
            const pct = Math.round((o.n / base) * 100);
            return (
              <li key={o.opcion}>
                <div className="flex items-baseline justify-between gap-2 text-[12px]">
                  <span className="truncate text-foreground">{o.opcion}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">{o.n} · {pct} %</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                  <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {r.numeros && (
        <p className="mt-3 text-[12px] text-foreground">
          Media <strong className="tabular-nums">{r.numeros.media.toLocaleString('es-ES')}</strong>
          <span className="text-muted-foreground"> · de {r.numeros.min.toLocaleString('es-ES')} a {r.numeros.max.toLocaleString('es-ES')}</span>
        </p>
      )}
    </div>
  );
}

export default function RespuestasPage() {
  const { studio, dataLoaded, socios, camposPersonalizados, camposPersonalizadosCargados } = useStudio();
  const rol = useRol();
  const exporta = puedeGestionarClientas(rol);
  const configura = puedeGestionarCamposPersonalizados(rol);

  const [filtro, setFiltro] = useState<Filtro>('todas');
  const [busqueda, setBusqueda] = useState('');
  const [visibles, setVisibles] = useState(PAGINA);

  const preguntas: PreguntaAlta[] = useMemo(() => camposPersonalizados
    .filter((c) => c.activo && esTipoPregunta(c.tipo))
    .sort((a, b) => a.orden - b.orden)
    .map((c) => ({ id: c.id, etiqueta: c.etiqueta, tipo: c.tipo, opciones: c.opciones ?? [], requerido: c.requerido })),
  [camposPersonalizados]);

  // Solo las que están de alta: a una clienta dada de baja no se le va a preguntar nada.
  const filas = useMemo(() => filasRespuestas(
    preguntas,
    socios.filter((s) => s.activo).map((s) => ({ id: s.id, nombre: s.nombre, apellidos: s.apellidos, camposExtra: s.camposExtra })),
  ).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')), [preguntas, socios]);

  const resumen = useMemo(() => resumenPreguntas(preguntas, filas), [preguntas, filas]);
  const completas = filas.filter((f) => f.pendientes === 0).length;

  const lista = useMemo(() => {
    const q = busqueda.trim().toLocaleLowerCase('es');
    return filas.filter((f) =>
      (filtro === 'todas' || (filtro === 'completas' ? f.pendientes === 0 : f.pendientes > 0))
      && (!q || f.nombre.toLocaleLowerCase('es').includes(q)));
  }, [filas, filtro, busqueda]);

  const cargando = !dataLoaded || !camposPersonalizadosCargados;

  const exportar = () => {
    const fecha = new Date().toISOString().slice(0, 10);
    descargar(`respuestas-${studio?.slug ?? 'estudio'}-${fecha}.csv`, csvRespuestas(preguntas, lista));
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Respuestas de tus alumnas"
        description="Lo que ha contestado cada una a tus preguntas de «Datos extra de la ficha»."
        back={{ href: '/clientas', label: 'Volver a Clientas' }}
        actions={exporta && preguntas.length > 0 && lista.length > 0 ? (
          <button
            onClick={exportar}
            className="flex items-center gap-1.5 rounded-xl border border-border bg-card px-4 py-2 text-[13px] font-semibold text-foreground transition-colors hover:bg-muted"
          >
            <Download size={14} />
            Exportar {lista.length === filas.length ? '' : `(${lista.length})`}
          </button>
        ) : null}
      />

      {cargando ? (
        <div className="space-y-3" aria-busy="true">
          <span className="sr-only">Cargando…</span>
          {[0, 1, 2].map((i) => <div key={i} className="h-24 animate-pulse rounded-xl bg-muted" />)}
        </div>
      ) : preguntas.length === 0 ? (
        <div className="rounded-xl border border-border bg-card">
          <EmptyState
            icono={ListChecks}
            titulo="Aún no haces ninguna pregunta"
            descripcion="Crea tus preguntas en Configuración → Alta de alumnas → «Datos extra de la ficha» (su objetivo, cómo te conoció…) y aquí verás lo que contesta cada alumna."
            cta={configura ? { label: 'Crear preguntas', href: '/configuracion?tab=altas', icono: Settings2 } : undefined}
          />
        </div>
      ) : (
        <>
          {studio && !studio.preguntasAltaActivas && (
            <p role="note" className="rounded-lg border border-border bg-muted px-3 py-2.5 text-[13px] text-foreground">
              Tus alumnas todavía no las contestan en su app: solo se rellenan desde su ficha.{' '}
              {configura
                ? <Link href="/configuracion?tab=altas" className="font-semibold underline underline-offset-2">Activa «Preguntar los datos extra en su app»</Link>
                : 'Puede activarlo la propietaria en Configuración.'}
            </p>
          )}

          {/* Cuántas han contestado, de un vistazo. */}
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-[15px] font-semibold text-foreground">
                <span className="tabular-nums">{completas}</span> de <span className="tabular-nums">{filas.length}</span> alumnas lo han contestado todo
              </p>
              {filas.length - completas > 0 && (
                <button onClick={() => { setFiltro('faltan'); setVisibles(PAGINA); }} className="text-[12px] font-semibold text-muted-foreground underline underline-offset-2 hover:text-foreground">
                  Ver a quién le falta ({filas.length - completas})
                </button>
              )}
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={filas.length} aria-valuenow={completas} aria-label="Alumnas con todo contestado">
              <div className="h-full rounded-full bg-success" style={{ width: `${filas.length ? Math.round((completas / filas.length) * 100) : 0}%` }} />
            </div>
          </div>

          {/* Una tarjeta por pregunta: cómo se reparten las respuestas. */}
          <section aria-label="Resumen por pregunta" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {preguntas.map((p, i) => <TarjetaResumen key={p.id} p={p} r={resumen[i]} total={filas.length} />)}
          </section>

          {/* Filtros */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar alumnas">
              {([
                ['todas', `Todas (${filas.length})`],
                ['faltan', `Les falta algo (${filas.length - completas})`],
                ['completas', `Completas (${completas})`],
              ] as const).map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => { setFiltro(id); setVisibles(PAGINA); }}
                  aria-pressed={filtro === id}
                  className={cn(
                    'whitespace-nowrap rounded-full border px-3 py-1.5 text-[12px] font-semibold transition-colors',
                    filtro === id ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground hover:text-foreground',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <label className="relative sm:ml-auto sm:w-64">
              <span className="sr-only">Buscar alumna</span>
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <input
                value={busqueda}
                onChange={(e) => { setBusqueda(e.target.value); setVisibles(PAGINA); }}
                placeholder="Buscar alumna…"
                className="w-full rounded-xl border border-border bg-card py-2 pl-8 pr-3 text-[13px] text-foreground placeholder:text-muted-foreground focus:border-foreground focus:outline-none"
              />
            </label>
          </div>

          {lista.length === 0 ? (
            <div className="rounded-xl border border-border bg-card">
              <EmptyState compacto icono={Search} titulo="Nadie coincide" descripcion="Prueba con otro nombre u otro filtro." />
            </div>
          ) : (
            <>
              {/* Escritorio: una fila por alumna, una columna por pregunta. */}
              <div className="hidden overflow-x-auto rounded-xl border border-border bg-card shadow-sm sm:block">
                <table className="w-full text-[13px]" data-testid="tabla-respuestas">
                  <thead>
                    <tr className="border-b border-muted bg-muted text-left">
                      <th className="sticky left-0 z-10 bg-muted px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Alumna</th>
                      {preguntas.map((p) => (
                        <th key={p.id} className="min-w-[140px] max-w-[240px] px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          {p.etiqueta}
                        </th>
                      ))}
                      <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lista.slice(0, visibles).map((f) => (
                      <tr key={f.id} className="border-b border-muted last:border-0 hover:bg-muted/40">
                        <td className="sticky left-0 z-10 bg-card px-4 py-3 font-semibold">
                          <Link href={`/clientas/${f.id}`} className="text-foreground hover:underline">{f.nombre}</Link>
                        </td>
                        {preguntas.map((p) => {
                          const t = textoRespuesta(p, f.valores[p.id]);
                          return (
                            <td key={p.id} className={cn('max-w-[240px] truncate px-4 py-3', t === '—' ? 'text-muted-foreground' : 'text-foreground')} title={t === '—' ? undefined : t}>
                              {t}
                            </td>
                          );
                        })}
                        <td className="px-4 py-3"><Estado f={f} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Móvil: una tarjeta por alumna. */}
              <ul className="space-y-2 sm:hidden">
                {lista.slice(0, visibles).map((f) => (
                  <li key={f.id} className="rounded-xl border border-border bg-card p-3.5">
                    <div className="flex items-center justify-between gap-2">
                      <Link href={`/clientas/${f.id}`} className="truncate text-[14px] font-semibold text-foreground">{f.nombre}</Link>
                      <Estado f={f} />
                    </div>
                    <dl className="mt-2 space-y-1.5">
                      {preguntas.map((p) => (
                        <div key={p.id}>
                          <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{p.etiqueta}</dt>
                          <dd className="text-[13px] text-foreground">{textoRespuesta(p, f.valores[p.id])}</dd>
                        </div>
                      ))}
                    </dl>
                  </li>
                ))}
              </ul>

              {lista.length > visibles && (
                <button
                  onClick={() => setVisibles((v) => v + PAGINA)}
                  className="w-full rounded-xl border border-border bg-card py-2.5 text-[13px] font-semibold text-foreground hover:bg-muted"
                >
                  Ver más ({lista.length - visibles})
                </button>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
