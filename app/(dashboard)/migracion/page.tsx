'use client';

// Migración Mágica — "arrastra lo que tengas y nosotros hacemos el resto".
// Flujo en 4 pasos, con el humano SIEMPRE en medio: subir → revisar el plan
// (muestras, cuarentena, avisos) → ejecutar → acta con botón de deshacer.
// Nada se importa sin revisión, y todo lo importado se puede deshacer.

import { useRef, useState } from 'react';
import { useId } from 'react';
import {
  UploadCloud, FileSpreadsheet, AlertTriangle, CheckCircle2, Sparkles,
  Loader2, Undo2, ChevronDown, ChevronUp, ArrowRight,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useStudio } from '@/lib/studio-context';
import {
  analizarMigracion, deshacerMigracion,
  importarSocias, importarMembresias, importarClases, importarReservas, importarCitas,
} from '@/lib/api-client';
import {
  parseCsv,
  validarFilas, validarFilasMembresia, validarFilasClase, validarFilasReserva, validarFilasCita,
  type FilaSocia, type FilaMembresia, type FilaClase, type FilaReserva, type FilaCita,
} from '@/lib/csv';
import { uid } from '@/lib/utils';
import type { PlanMigracion, ArchivoAnalizado } from '@/lib/migracion/analizador';
// Runtime desde clasificador (client-safe): analizador.ts arrastra el SDK de
// Anthropic y no puede entrar en un bundle de cliente.
import {
  ENTIDADES, analizarConMapeoManual, avisosGlobalesYOrden,
  type EntidadMigracion, type ContextoEstudio,
} from '@/lib/migracion/clasificador';

type Paso = 'subir' | 'analizando' | 'revisar' | 'ejecutando' | 'acta';

interface ArchivoLocal { nombre: string; contenido: string }

interface ResultadoEntidad {
  entidad: EntidadMigracion;
  etiqueta: string;
  importadas: number;
  duplicadas: number;
  incidencias: number; // sinSocia/sinSesion/errores... agregado
  error?: string;
  batchAviso?: string | null;
}

// Convierte un XLSX/XLS en uno o varios "archivos" CSV (una por hoja con datos)
// usando SheetJS cargado bajo demanda — el parser no entra en el bundle base.
async function xlsxACsv(file: File): Promise<ArchivoLocal[]> {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const salida: ArchivoLocal[] = [];
  for (const nombreHoja of wb.SheetNames) {
    const csv = XLSX.utils.sheet_to_csv(wb.Sheets[nombreHoja]);
    if (csv.trim().split('\n').length >= 2) {
      salida.push({
        nombre: wb.SheetNames.length > 1 ? `${file.name} · ${nombreHoja}` : file.name,
        contenido: csv,
      });
    }
  }
  return salida;
}

export default function MigracionPage() {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  // Tras importar (o deshacer) hay que refrescar el estado global del panel:
  // si no, las clientas/reservas recién creadas NO aparecen en sus listados
  // hasta recargar la página a mano. resetDatosPilates re-lee todo del servidor.
  const { resetDatosPilates, planesTarifa, instructores, salas, citasServicios } = useStudio();
  // Contexto del estudio para reanalizar mapeos manuales con los mismos avisos
  // (planes/instructoras/salas/servicios inexistentes) que la vía automática.
  const ctxEstudio: ContextoEstudio = {
    planes: planesTarifa.map(p => p.nombre),
    instructores: instructores.map(i => i.nombre),
    salas: salas.map(s => s.nombre),
    servicios: citasServicios.map(s => s.nombre),
  };

  // Correcciones manuales de la propietaria en el paso de revisión: por archivo,
  // qué entidad es y qué columna alimenta cada campo. Si el auto-mapeo se
  // equivoca (inevitable con formatos que no hemos visto), aquí se arregla en
  // segundos — sin esto, un archivo mal clasificado era un callejón sin salida.
  const [overrides, setOverrides] = useState<Record<string, { entidad: EntidadMigracion | null; mapeo: Record<string, number> }>>({});
  const [editando, setEditando] = useState<string | null>(null);
  const [paso, setPaso] = useState<Paso>('subir');
  const [arrastrando, setArrastrando] = useState(false);
  const [archivos, setArchivos] = useState<ArchivoLocal[]>([]);
  const [plan, setPlan] = useState<PlanMigracion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progreso, setProgreso] = useState('');
  const [resultados, setResultados] = useState<ResultadoEntidad[]>([]);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [confirmDeshacer, setConfirmDeshacer] = useState(false);
  const [deshaciendo, setDeshaciendo] = useState(false);
  const [deshecho, setDeshecho] = useState<Record<string, number> | null>(null);
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());

  async function onFiles(lista: FileList | File[]) {
    setError(null);
    const nuevos: ArchivoLocal[] = [];
    for (const f of Array.from(lista)) {
      try {
        if (/\.(xlsx|xls)$/i.test(f.name)) {
          nuevos.push(...(await xlsxACsv(f)));
        } else {
          nuevos.push({ nombre: f.name, contenido: await f.text() });
        }
      } catch {
        setError(`No se ha podido leer "${f.name}". ¿Está dañado?`);
      }
    }
    setArchivos(prev => {
      const nombres = new Set(prev.map(a => a.nombre));
      return [...prev, ...nuevos.filter(a => !nombres.has(a.nombre))].slice(0, 8);
    });
  }

  async function analizar() {
    if (archivos.length === 0) return;
    setPaso('analizando');
    setError(null);
    const r = await analizarMigracion(archivos);
    if ('error' in r) {
      setError(r.error);
      setPaso('subir');
      return;
    }
    setPlan(r);
    setPaso('revisar');
  }

  // Re-deriva las filas en cliente con las MISMAS funciones puras de lib/csv
  // que usó el análisis en servidor: mismo mapeo → mismas filas, determinista.
  function filasDe(a: ArchivoAnalizado): unknown[] {
    const local = archivos.find(x => x.nombre === a.nombre);
    if (!local || !a.mapeo || !a.entidad) return [];
    const { rows } = parseCsv(local.contenido);
    const validar = {
      socias: validarFilas, membresias: validarFilasMembresia, clases: validarFilasClase,
      reservas: validarFilasReserva, citas: validarFilasCita,
    }[a.entidad] as (r: string[][], m: Record<string, number>) => { estado: string; datos: unknown }[];
    return validar(rows, a.mapeo).filter(v => v.estado === 'ok').map(v => v.datos);
  }

  async function ejecutar() {
    if (!plan) return;
    const id = `mig-${uid()}`;
    setBatchId(id);
    setPaso('ejecutando');
    const out: ResultadoEntidad[] = [];
    const hoy = new Date().toISOString().slice(0, 10);

    for (const entidad of efectivo.orden) {
      const deEntidad = archivosEfectivos.filter(a => a.entidad === entidad);
      const filas = deEntidad.flatMap(a => filasDe(a));
      if (filas.length === 0) continue;
      const etiqueta = deEntidad[0].entidadEtiqueta ?? entidad;
      setProgreso(`Importando ${etiqueta.toLowerCase()}…`);

      if (entidad === 'socias') {
        const r = await importarSocias(filas as FilaSocia[], id);
        out.push({ entidad, etiqueta, importadas: r.importadas, duplicadas: r.duplicadas, incidencias: r.errores.length, error: r.error, batchAviso: r.batchAviso });
      } else if (entidad === 'membresias') {
        const r = await importarMembresias(filas as FilaMembresia[], id);
        out.push({ entidad, etiqueta, importadas: r.importadas, duplicadas: r.duplicadas, incidencias: r.errores.length, error: r.error, batchAviso: r.batchAviso });
      } else if (entidad === 'clases') {
        const r = await importarClases(filas as FilaClase[], { semanas: 4, desde: hoy }, id);
        out.push({ entidad, etiqueta, importadas: r.creadas, duplicadas: r.omitidas, incidencias: r.sinInstructor + r.sinSala + r.errores.length, error: r.error, batchAviso: r.batchAviso });
      } else if (entidad === 'reservas') {
        const r = await importarReservas(filas as FilaReserva[], id);
        out.push({ entidad, etiqueta, importadas: r.importadas, duplicadas: r.duplicadas, incidencias: r.sinSocia + r.sinSesion + r.errores.length, error: r.error, batchAviso: r.batchAviso });
      } else {
        const r = await importarCitas(filas as FilaCita[], id);
        out.push({ entidad, etiqueta, importadas: r.importadas, duplicadas: r.duplicadas, incidencias: r.sinSocia + r.sinInstructor + r.errores.length, error: r.error, batchAviso: r.batchAviso });
      }
      setResultados([...out]);
      // Un fallo de una entidad no borra lo hecho, pero paramos: las
      // siguientes dependen de ella y el acta debe reflejar dónde se quedó.
      if (out[out.length - 1].error) break;
    }
    setResultados(out);
    setPaso('acta');
    // Refresca el panel para que lo importado aparezca ya en Clientas, Calendario,
    // etc., sin que la propietaria tenga que recargar la página.
    resetDatosPilates();
  }

  async function deshacer() {
    if (!batchId) return;
    setDeshaciendo(true);
    const r = await deshacerMigracion(batchId);
    setDeshaciendo(false);
    if ('error' in r) {
      setError(r.error);
      return;
    }
    setDeshecho(r.borrados);
    // Lo deshecho también debe desaparecer de los listados sin recargar a mano.
    resetDatosPilates();
  }

  // Plan EFECTIVO: el análisis del servidor con las correcciones manuales
  // aplicadas encima (reanálisis determinista en cliente, mismos validadores).
  const archivosEfectivos: ArchivoAnalizado[] = !plan ? [] : plan.archivos.map(a => {
    const ov = overrides[a.nombre];
    if (!ov) return a;
    const raw = archivos.find(x => x.nombre === a.nombre);
    if (!raw) return a;
    return analizarConMapeoManual(raw, ov.entidad, ov.mapeo, ctxEstudio);
  });

  // Sin useMemo: el React Compiler ya memoiza y aquí no puede preservar la
  // memoización manual (la salida es un objeto nuevo). El cálculo es trivial.
  const efectivo = avisosGlobalesYOrden(archivosEfectivos);

  const listos = archivosEfectivos.filter(a => a.entidad !== null);
  const sinClasificar = archivosEfectivos.filter(a => a.entidad === null);
  const totalOk = listos.reduce((s, a) => s + a.ok, 0);

  // Cambia la entidad de un archivo: prerellena el mapeo con el auto-mapeo de esa
  // entidad (mejor punto de partida que en blanco) para que solo retoque lo justo.
  function cambiarEntidad(a: ArchivoAnalizado, entidad: EntidadMigracion | null) {
    const mapeo = entidad ? ENTIDADES[entidad].mapear(a.columnas) : {};
    setOverrides(prev => ({ ...prev, [a.nombre]: { entidad, mapeo } }));
  }
  // Cambia a qué columna (índice, -1 = sin asignar) se mapea un campo.
  function cambiarColumna(a: ArchivoAnalizado, campo: string, idx: number) {
    setOverrides(prev => {
      const base = prev[a.nombre] ?? { entidad: a.entidad, mapeo: { ...(a.mapeo ?? {}) } };
      return { ...prev, [a.nombre]: { entidad: base.entidad, mapeo: { ...base.mapeo, [campo]: idx } } };
    });
  }
  const toggleAbierto = (n: string) => setAbiertos(prev => {
    const s = new Set(prev);
    if (s.has(n)) s.delete(n); else s.add(n);
    return s;
  });

  return (
    <div className="max-w-3xl mx-auto pb-16">
      <PageHeader
        title="Migración"
        description="Trae tu estudio desde tu software anterior. Tú no migras nada: arrastra lo que tengas, revisa el plan y confirma — todo se puede deshacer con un clic."
      />

      {error && (
        <div role="alert" className="mb-4 flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-[13px] text-destructive">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          <span className="flex-1">{error}</span>
        </div>
      )}

      {/* ── Paso 1: subir ──────────────────────────────────────────────────── */}
      {(paso === 'subir' || paso === 'analizando') && (
        <div>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setArrastrando(true); }}
            onDragLeave={() => setArrastrando(false)}
            onDrop={e => { e.preventDefault(); setArrastrando(false); void onFiles(e.dataTransfer.files); }}
            className={`w-full rounded-2xl border-2 border-dashed p-10 text-center transition-colors ${arrastrando ? 'border-brand bg-brand/5' : 'border-border bg-card hover:border-brand/50'}`}
          >
            <UploadCloud size={34} className="mx-auto mb-3 text-brand" />
            <p className="text-[15px] font-bold text-foreground">Arrastra aquí lo que puedas exportar de tu software actual</p>
            <p className="text-[13px] text-muted-foreground mt-1.5">
              Clientas, bonos, horario, reservas, citas — CSV o Excel, da igual el formato o el nombre de las columnas. Hasta 8 archivos.
            </p>
            <input
              ref={inputRef} id={inputId} type="file" multiple accept=".csv,.xlsx,.xls,text/csv"
              className="hidden"
              onChange={e => { if (e.target.files) void onFiles(e.target.files); e.target.value = ''; }}
            />
          </button>

          {archivos.length > 0 && (
            <div className="mt-4 space-y-2">
              {archivos.map(a => (
                <div key={a.nombre} className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-2.5">
                  <FileSpreadsheet size={16} className="text-brand shrink-0" />
                  <span className="flex-1 text-[13px] font-medium text-foreground truncate">{a.nombre}</span>
                  <button
                    onClick={() => setArchivos(prev => prev.filter(x => x.nombre !== a.nombre))}
                    className="text-[12px] text-muted-foreground hover:text-destructive"
                  >
                    Quitar
                  </button>
                </div>
              ))}
              <button
                onClick={analizar}
                disabled={paso === 'analizando'}
                className="mt-2 w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-brand text-brand-foreground text-[14px] font-extrabold hover:brightness-95 disabled:opacity-60 transition"
              >
                {paso === 'analizando'
                  ? <><Loader2 size={16} className="animate-spin" /> Analizando tus archivos…</>
                  : <><Sparkles size={16} /> Analizar {archivos.length} archivo{archivos.length === 1 ? '' : 's'}</>}
              </button>
              <p className="text-[12px] text-muted-foreground text-center">El análisis no importa nada: primero verás el plan completo y lo confirmas tú.</p>
            </div>
          )}
        </div>
      )}

      {/* ── Paso 2: revisar el plan ────────────────────────────────────────── */}
      {paso === 'revisar' && plan && (
        <div className="space-y-4">
          {efectivo.avisos.map(av => (
            <div key={av} className="flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-[13px] text-amber-800">
              <AlertTriangle size={15} className="shrink-0 mt-0.5" />{av}
            </div>
          ))}

          {archivosEfectivos.map(a => (
            <div key={a.nombre} className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-center gap-3">
                <FileSpreadsheet size={18} className={a.entidad ? 'text-brand' : 'text-muted-foreground'} />
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-bold text-foreground truncate">{a.nombre}</p>
                  <p className="text-[12px] text-muted-foreground">
                    {a.entidad
                      ? <>{a.entidadEtiqueta} · {a.origen === 'manual' ? 'ajustado a mano' : a.origen === 'ia' ? 'clasificado con IA' : 'reconocido automáticamente'}</>
                      : 'Sin clasificar — no se importará'}
                  </p>
                </div>
                {a.entidad && (
                  <div className="text-right shrink-0">
                    <p className="text-[15px] font-extrabold text-foreground tabular-nums">{a.ok}</p>
                    <p className="text-[11px] text-muted-foreground">se importarán</p>
                  </div>
                )}
              </div>

              {/* Corrección manual: entidad + columna por campo. La red de
                  seguridad cuando el auto-mapeo no acierta en un formato nuevo. */}
              <div className="mt-2.5">
                <button
                  onClick={() => setEditando(editando === a.nombre ? null : a.nombre)}
                  className="text-[12px] font-semibold text-brand hover:underline"
                >
                  {editando === a.nombre ? 'Cerrar ajustes' : a.entidad ? 'Ajustar entidad o columnas' : 'Asignar a mano'}
                </button>
                {editando === a.nombre && (
                  <div className="mt-2 rounded-xl border border-border bg-muted/30 p-3 space-y-2.5">
                    <label className="block">
                      <span className="text-[11px] font-semibold text-muted-foreground">¿Qué es este archivo?</span>
                      <select
                        value={a.entidad ?? ''}
                        onChange={e => cambiarEntidad(a, (e.target.value || null) as EntidadMigracion | null)}
                        className="mt-1 w-full rounded-lg border border-border bg-card px-2.5 py-2 text-[13px]"
                      >
                        <option value="">— No importar</option>
                        {(Object.keys(ENTIDADES) as EntidadMigracion[]).map(ent => (
                          <option key={ent} value={ent}>{ENTIDADES[ent].etiqueta}</option>
                        ))}
                      </select>
                    </label>
                    {a.entidad && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {ENTIDADES[a.entidad].campos.map(campo => (
                          <label key={campo.campo} className="block">
                            <span className="text-[11px] font-semibold text-muted-foreground">
                              {campo.etiqueta}{campo.obligatorio ? ' *' : ''}
                            </span>
                            <select
                              value={a.mapeo?.[campo.campo] ?? -1}
                              onChange={e => cambiarColumna(a, campo.campo, Number(e.target.value))}
                              className="mt-1 w-full rounded-lg border border-border bg-card px-2.5 py-2 text-[13px]"
                            >
                              <option value={-1}>— sin asignar</option>
                              {a.columnas.map((h, i) => (
                                <option key={i} value={i}>{h || `(columna ${i + 1})`}</option>
                              ))}
                            </select>
                          </label>
                        ))}
                        <p className="sm:col-span-2 text-[11px] text-muted-foreground">Los campos con * son obligatorios. La muestra de abajo se actualiza al instante.</p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {a.avisos.map(av => (
                <p key={av} className="mt-2 flex items-start gap-1.5 text-[12px] text-amber-700"><AlertTriangle size={13} className="shrink-0 mt-0.5" />{av}</p>
              ))}

              {a.entidad && a.muestra.length > 0 && (
                <div className="mt-3 rounded-xl bg-muted/40 p-3 overflow-x-auto">
                  <table className="w-full text-[12px]">
                    <thead>
                      <tr className="text-left text-muted-foreground">
                        {Object.keys(a.muestra[0]).slice(0, 5).map(k => <th key={k} className="pr-4 pb-1 font-semibold">{k}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {a.muestra.map((m, i) => (
                        <tr key={i} className="text-foreground">
                          {Object.keys(a.muestra[0]).slice(0, 5).map(k => (
                            <td key={k} className="pr-4 py-0.5 truncate max-w-[160px]">{String((m as Record<string, unknown>)[k] ?? '')}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {a.cuarentena.length > 0 && (
                <div className="mt-2">
                  <button onClick={() => toggleAbierto(a.nombre)} className="flex items-center gap-1 text-[12px] font-semibold text-amber-700">
                    {abiertos.has(a.nombre) ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                    {a.cuarentena.length} fila{a.cuarentena.length === 1 ? '' : 's'} no se importará{a.cuarentena.length === 1 ? '' : 'n'} (ver motivos)
                  </button>
                  {abiertos.has(a.nombre) && (
                    <ul className="mt-1.5 space-y-0.5 text-[12px] text-muted-foreground max-h-40 overflow-y-auto">
                      {a.cuarentena.map(c => <li key={c.fila}>Fila {c.fila}: {c.motivo}</li>)}
                    </ul>
                  )}
                </div>
              )}
            </div>
          ))}

          {sinClasificar.length > 0 && (
            <p className="text-[12px] text-muted-foreground">
              Los archivos sin clasificar no se tocan. Si quieres que los migremos nosotros, escríbenos a soporte@tentare.app con el archivo adjunto.
            </p>
          )}

          <div className="flex gap-3">
            <button onClick={() => { setPaso('subir'); setPlan(null); }} className="flex-1 py-3 rounded-2xl border border-border text-[13px] font-bold text-foreground hover:bg-muted transition">
              Volver
            </button>
            <button
              onClick={ejecutar}
              disabled={totalOk === 0}
              className="flex-[2] flex items-center justify-center gap-2 py-3 rounded-2xl bg-brand text-brand-foreground text-[14px] font-extrabold hover:brightness-95 disabled:opacity-50 transition"
            >
              Importar {totalOk} registro{totalOk === 1 ? '' : 's'} <ArrowRight size={15} />
            </button>
          </div>
          <p className="text-[12px] text-muted-foreground text-center">Podrás deshacer la migración completa con un clic si algo no cuadra.</p>
        </div>
      )}

      {/* ── Paso 3: ejecutando ─────────────────────────────────────────────── */}
      {paso === 'ejecutando' && (
        <div className="text-center py-16">
          <Loader2 size={30} className="mx-auto mb-4 animate-spin text-brand" />
          <p className="text-[14px] font-bold text-foreground">{progreso}</p>
          <p className="text-[12px] text-muted-foreground mt-1">Tu software anterior sigue funcionando: aquí no se corta nada.</p>
        </div>
      )}

      {/* ── Paso 4: acta ───────────────────────────────────────────────────── */}
      {paso === 'acta' && (
        <div className="space-y-4">
          <div className={`rounded-2xl border p-5 ${deshecho ? 'border-border bg-muted/40' : 'border-success/30 bg-success/5'}`}>
            <div className="flex items-center gap-2.5 mb-3">
              {deshecho
                ? <><Undo2 size={18} className="text-muted-foreground" /><p className="text-[15px] font-extrabold text-foreground">Migración deshecha</p></>
                : <><CheckCircle2 size={18} className="text-success" /><p className="text-[15px] font-extrabold text-foreground">Acta de migración</p></>}
            </div>
            <div className="space-y-1.5">
              {resultados.map(r => (
                <div key={r.entidad} className="flex items-baseline justify-between text-[13px]">
                  <span className="text-muted-foreground">{r.etiqueta}</span>
                  <span className="font-bold text-foreground tabular-nums">
                    {deshecho
                      ? `${deshecho[r.entidad === 'socias' ? 'socios' : r.entidad === 'membresias' ? 'suscripciones' : r.entidad === 'clases' ? 'sesiones' : r.entidad] ?? 0} borrados`
                      : `${r.importadas} importadas · ${r.duplicadas} ya existían${r.incidencias > 0 ? ` · ${r.incidencias} incidencias` : ''}`}
                  </span>
                </div>
              ))}
            </div>
            {resultados.some(r => r.error) && (
              <p className="mt-3 text-[13px] text-destructive">{resultados.find(r => r.error)?.error} — el proceso se detuvo ahí; puedes deshacer y volver a intentarlo.</p>
            )}
            {resultados.some(r => r.batchAviso) && (
              <p className="mt-3 text-[12px] text-amber-700">⚠️ Parte del lote no quedó registrado para deshacer. Si necesitas revertir, escríbenos a soporte@tentare.app.</p>
            )}
          </div>

          <p className="text-[13px] text-muted-foreground">
            Comprueba los números contra tu software anterior (nº de clientas, bonos activos, clases de la semana). ¿Todo cuadra? Ya está — no había más que hacer.
          </p>

          <div className="flex gap-3">
            {!deshecho && (
              <button
                onClick={() => setConfirmDeshacer(true)}
                disabled={deshaciendo}
                className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-2xl border border-border text-[13px] font-bold text-foreground hover:bg-muted disabled:opacity-50 transition"
              >
                <Undo2 size={14} /> {deshaciendo ? 'Deshaciendo…' : 'Deshacer migración'}
              </button>
            )}
            <button
              onClick={() => { setPaso('subir'); setArchivos([]); setPlan(null); setResultados([]); setBatchId(null); setDeshecho(null); setError(null); }}
              className="flex-1 py-3 rounded-2xl bg-brand text-brand-foreground text-[13px] font-extrabold hover:brightness-95 transition"
            >
              {deshecho ? 'Empezar de nuevo' : 'Hacer otra importación'}
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmDeshacer}
        onOpenChange={setConfirmDeshacer}
        titulo="¿Deshacer esta migración?"
        descripcion="Se borrará exactamente lo que ha creado esta importación (y nada más). Tus datos anteriores a la migración no se tocan."
        textoConfirmar="Deshacer migración"
        destructivo
        onConfirm={() => { setConfirmDeshacer(false); void deshacer(); }}
      />
    </div>
  );
}
