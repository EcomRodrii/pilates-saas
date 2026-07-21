'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Upload, FileSpreadsheet, Download, Check, AlertTriangle,
  ArrowRight, CalendarDays, PartyPopper, Info, Repeat, Users,
} from 'lucide-react';
import {
  parseCsv, autoMapearClase, validarFilasClase, serializeCsv, CAMPOS_CLASE,
  type CampoClase, type ParsedCsv,
} from '@/lib/csv';
import { importarClases, type ResultadoImportClases } from '@/lib/api-client';
import { PageHeader } from '@/components/ui/page-header';

// Asistente de importación del HORARIO — tercera pieza de la migración asistida
// (tras socias y membresías). Acepta las dos formas en que las plataformas
// exportan un horario: con fecha concreta, o recurrente por día de la semana.

type Paso = 1 | 2 | 3;

const PLANTILLA_HEADERS = ['Clase', 'Día de la semana', 'Hora inicio', 'Hora fin', 'Instructora', 'Sala', 'Aforo'];
const PLANTILLA_EJEMPLO = [
  ['Pilates Mat', 'Lunes', '09:00', '10:00', 'María Soler', 'Sala 1', '12'],
  ['Reformer Fundamental', 'Lunes', '19:00', '19:50', 'Julia Ramos', 'Sala 2', '8'],
  ['Pilates Mat', 'Miércoles', '09:00', '10:00', 'María Soler', 'Sala 1', '12'],
];

const MAPEO_VACIO: Record<CampoClase, number> = {
  clase: -1, fecha: -1, dia_semana: -1, hora_inicio: -1, hora_fin: -1,
  duracion: -1, instructor: -1, sala: -1, aforo: -1,
};

function descargar(nombre: string, contenido: string) {
  const blob = new Blob(['﻿' + contenido], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(url);
}

const inputCls = 'rounded-lg border border-border px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-black/10';

export default function ImportarHorarioPage() {
  const router = useRouter();
  const [paso, setPaso] = useState<Paso>(1);
  const [parsed, setParsed] = useState<ParsedCsv | null>(null);
  const [nombreArchivo, setNombreArchivo] = useState('');
  const [mapeo, setMapeo] = useState<Record<CampoClase, number>>(MAPEO_VACIO);
  const [dragActivo, setDragActivo] = useState(false);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [importando, setImportando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoImportClases | null>(null);
  const [semanas, setSemanas] = useState(4);
  const [desde, setDesde] = useState(() => new Date().toISOString().slice(0, 10));
  const inputRef = useRef<HTMLInputElement>(null);

  const validadas = useMemo(
    () => (parsed ? validarFilasClase(parsed.rows, mapeo) : []),
    [parsed, mapeo],
  );
  const conteo = useMemo(() => {
    let ok = 0, err = 0, recurrentes = 0;
    for (const f of validadas) {
      if (f.estado === 'ok') { ok++; if (f.datos.fecha === null) recurrentes++; } else err++;
    }
    return { ok, err, recurrentes };
  }, [validadas]);

  // Cuántas sesiones va a crear de verdad: las de fecha concreta van una a una,
  // las recurrentes se multiplican por el número de semanas.
  const sesionesEstimadas = (conteo.ok - conteo.recurrentes) + conteo.recurrentes * semanas;

  const obligatoriosMapeados = mapeo.clase >= 0 && mapeo.hora_inicio >= 0;
  const puedeImportar = obligatoriosMapeados && conteo.ok > 0 && !importando;

  async function cargarArchivo(file: File) {
    setErrorCarga(null);
    if (!/\.csv$/i.test(file.name) && file.type !== 'text/csv') {
      setErrorCarga('Sube un archivo .csv. Si tienes Excel, expórtalo como CSV primero.');
      return;
    }
    try {
      const texto = await file.text();
      const p = parseCsv(texto);
      if (p.headers.length === 0 || p.rows.length === 0) {
        setErrorCarga('El archivo no tiene filas de datos.');
        return;
      }
      setParsed(p);
      setMapeo(autoMapearClase(p.headers));
      setNombreArchivo(file.name);
      setPaso(2);
    } catch {
      setErrorCarga('No se pudo leer el archivo.');
    }
  }

  async function importar() {
    setImportando(true);
    const filas = validadas.filter(f => f.estado === 'ok').map(f => f.datos);
    const r = await importarClases(filas, { semanas, desde });
    setResultado(r);
    setImportando(false);
    setPaso(3);
  }

  return (
    <div className="flex flex-col gap-6 pb-10 max-w-4xl">
      <PageHeader
        back={{ href: '/calendario', label: 'Volver a la agenda' }}
        title="Importar horario"
        description="Trae tus clases y tu horario desde tu programa anterior."
      />

      {/* Pasos */}
      <div className="flex items-center gap-2">
        {([1, 2, 3] as Paso[]).map(n => (
          <div key={n} className="flex flex-1 items-center gap-2">
            <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
              paso >= n ? 'bg-brand text-brand-foreground' : 'bg-muted text-muted-foreground'}`}>
              {paso > n ? <Check size={12} /> : n}
            </span>
            <span className={`text-[12px] font-medium ${paso >= n ? 'text-foreground' : 'text-muted-foreground'}`}>
              {n === 1 ? 'Archivo' : n === 2 ? 'Columnas' : 'Listo'}
            </span>
            {n < 3 && <span className="h-px flex-1 bg-border" />}
          </div>
        ))}
      </div>

      {/* ── Paso 1: archivo ─────────────────────────────────────────────── */}
      {paso === 1 && (
        <div className="flex flex-col gap-4">
          <div
            onDragOver={e => { e.preventDefault(); setDragActivo(true); }}
            onDragLeave={() => setDragActivo(false)}
            onDrop={e => { e.preventDefault(); setDragActivo(false); const f = e.dataTransfer.files[0]; if (f) cargarArchivo(f); }}
            onClick={() => inputRef.current?.click()}
            className={`flex cursor-pointer flex-col items-center gap-3 rounded-3xl border-2 border-dashed p-12 text-center transition-colors ${
              dragActivo ? 'border-brand bg-brand/5' : 'border-border hover:border-foreground/30'}`}
          >
            <Upload size={28} className="text-muted-foreground" />
            <div>
              <p className="text-[14px] font-semibold text-foreground">Arrastra tu archivo CSV aquí</p>
              <p className="text-[12.5px] text-muted-foreground mt-0.5">o haz clic para elegirlo</p>
            </div>
            <input ref={inputRef} type="file" accept=".csv,text/csv" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) cargarArchivo(f); }} />
          </div>

          {errorCarga && (
            <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-700">
              <AlertTriangle size={15} className="shrink-0" />{errorCarga}
            </div>
          )}

          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="flex items-start gap-2.5">
              <Info size={15} className="mt-0.5 shrink-0 text-muted-foreground" />
              <div className="text-[12.5px] text-muted-foreground">
                <p className="font-medium text-foreground">Sirve tal cual te lo dé tu programa</p>
                <p className="mt-1">
                  Da igual cómo se llamen las columnas: intentamos reconocerlas solas y tú lo corriges en el paso siguiente.
                  Vale tanto un horario <span className="font-medium text-foreground">por día de la semana</span> (se repite cada semana)
                  como uno <span className="font-medium text-foreground">con fechas concretas</span>.
                </p>
                <button
                  onClick={e => { e.stopPropagation(); descargar('plantilla-horario.csv', serializeCsv(PLANTILLA_HEADERS, PLANTILLA_EJEMPLO)); }}
                  className="mt-2 inline-flex items-center gap-1.5 text-[12.5px] font-medium text-brand hover:underline"
                >
                  <Download size={13} />Descargar plantilla de ejemplo
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Paso 2: columnas ────────────────────────────────────────────── */}
      {paso === 2 && parsed && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
            <FileSpreadsheet size={15} />
            <span className="font-medium text-foreground">{nombreArchivo}</span>
            <span>· {parsed.rows.length} filas</span>
          </div>

          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="mb-3 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
              Empareja las columnas
            </p>
            <div className="grid gap-2.5 sm:grid-cols-2">
              {CAMPOS_CLASE.map(c => (
                <label key={c.campo} className="flex items-center justify-between gap-3">
                  <span className="text-[13px] text-foreground">
                    {c.etiqueta}{c.obligatorio && <span className="text-rose-500"> *</span>}
                  </span>
                  <select
                    className={`${inputCls} w-44`}
                    value={mapeo[c.campo]}
                    onChange={e => setMapeo(m => ({ ...m, [c.campo]: Number(e.target.value) }))}
                  >
                    <option value={-1}>— sin usar —</option>
                    {parsed.headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                  </select>
                </label>
              ))}
            </div>
            {!obligatoriosMapeados && (
              <p className="mt-3 text-[12px] text-rose-600">
                Empareja al menos <strong>Clase</strong> y <strong>Hora de inicio</strong>.
              </p>
            )}
          </div>

          {/* Expansión de recurrentes */}
          {conteo.recurrentes > 0 && (
            <div className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-start gap-2.5">
                <Repeat size={15} className="mt-0.5 shrink-0 text-brand" />
                <div className="flex-1">
                  <p className="text-[13px] font-semibold text-foreground">Horario que se repite</p>
                  <p className="mt-0.5 text-[12.5px] text-muted-foreground">
                    {conteo.recurrentes} {conteo.recurrentes === 1 ? 'clase se repite' : 'clases se repiten'} cada semana.
                    Elige desde cuándo y cuántas semanas quieres crear.
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <label className="flex items-center gap-2 text-[13px] text-foreground">
                      Desde
                      <input type="date" className={inputCls} value={desde} onChange={e => setDesde(e.target.value)} />
                    </label>
                    <label className="flex items-center gap-2 text-[13px] text-foreground">
                      Semanas
                      <input type="number" min={1} max={12} className={`${inputCls} w-20`}
                        value={semanas}
                        onChange={e => setSemanas(Math.max(1, Math.min(12, Number(e.target.value) || 1)))} />
                    </label>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Resumen */}
          <div className="flex flex-wrap gap-3">
            <span className="rounded-xl bg-success/10 px-3 py-1.5 text-[12.5px] font-semibold text-success">
              {conteo.ok} filas correctas
            </span>
            {conteo.err > 0 && (
              <span className="rounded-xl bg-destructive/10 px-3 py-1.5 text-[12.5px] font-semibold text-[#991B1B]">
                {conteo.err} con problemas (se omiten)
              </span>
            )}
            <span className="rounded-xl bg-muted px-3 py-1.5 text-[12.5px] font-semibold text-foreground">
              ≈ {sesionesEstimadas} clases en el calendario
            </span>
          </div>

          {/* Errores concretos */}
          {conteo.err > 0 && (
            <div className="rounded-2xl border border-border bg-card p-4">
              <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                Filas que se van a omitir
              </p>
              <div className="flex flex-col gap-1">
                {validadas.filter(f => f.estado === 'error').slice(0, 8).map(f => (
                  <p key={f.fila} className="text-[12.5px] text-muted-foreground">
                    <span className="font-medium text-foreground">Fila {f.fila}:</span> {f.motivo}
                  </p>
                ))}
                {conteo.err > 8 && <p className="text-[12px] text-muted-foreground">…y {conteo.err - 8} más</p>}
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <button onClick={() => setPaso(1)}
              className="rounded-lg border border-border bg-card px-4 py-2 text-[13px] text-foreground hover:bg-muted">
              Atrás
            </button>
            <button onClick={importar} disabled={!puedeImportar}
              className="flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-[13px] font-medium text-brand-foreground hover:brightness-95 disabled:opacity-40">
              {importando ? 'Importando…' : 'Importar horario'}<ArrowRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* ── Paso 3: resultado ───────────────────────────────────────────── */}
      {paso === 3 && resultado && (
        <div className="flex flex-col gap-4">
          {resultado.error ? (
            <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-700">
              <AlertTriangle size={15} className="shrink-0" />{resultado.error}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 rounded-3xl border border-border bg-card py-10 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-success/10">
                <PartyPopper size={26} className="text-success" />
              </div>
              <p className="text-[18px] font-bold text-foreground">Horario importado</p>
              <p className="text-[13px] text-muted-foreground">
                {resultado.creadas} clases creadas en el calendario
                {resultado.tiposCreados > 0 && ` · ${resultado.tiposCreados} tipos de clase nuevos`}
              </p>
              {(resultado.omitidas > 0 || resultado.sinInstructor > 0 || resultado.sinSala > 0) && (
                <div className="mt-1 flex flex-col gap-0.5 text-[12.5px] text-muted-foreground">
                  {resultado.omitidas > 0 && <p>{resultado.omitidas} ya existían y no se han duplicado</p>}
                  {resultado.sinInstructor > 0 && <p>{resultado.sinInstructor} sin instructora: no se encontró ese nombre en tu equipo</p>}
                  {resultado.sinSala > 0 && <p>{resultado.sinSala} sin sala: no se encontró ese nombre</p>}
                </div>
              )}
            </div>
          )}

          {/* Continuación natural de la migración: con el horario dentro, lo
              siguiente es traer quién está apuntada a cada clase. */}
          {!resultado.error && (
            <div className="flex items-start gap-2.5 rounded-2xl border border-border bg-card p-4">
              <Users size={15} className="mt-0.5 shrink-0 text-brand" />
              <div>
                <p className="text-[13px] font-semibold text-foreground">Ahora trae las reservas</p>
                <p className="mt-0.5 text-[12.5px] text-muted-foreground">
                  Con el horario ya dentro, importa quién está apuntada a cada clase para que nadie pierda su sitio.
                </p>
                <Link href="/calendario/importar/reservas"
                  className="mt-2 inline-flex items-center gap-1.5 text-[12.5px] font-medium text-brand hover:underline">
                  Importar reservas<ArrowRight size={13} />
                </Link>
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <button onClick={() => { setPaso(1); setParsed(null); setResultado(null); setMapeo(MAPEO_VACIO); }}
              className="rounded-lg border border-border bg-card px-4 py-2 text-[13px] text-foreground hover:bg-muted">
              Importar otro archivo
            </button>
            <button onClick={() => router.push('/calendario')}
              className="flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-[13px] font-medium text-brand-foreground hover:brightness-95">
              <CalendarDays size={14} />Ver el calendario
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
