'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Upload, FileSpreadsheet, Download, Check, AlertTriangle,
  ArrowLeft, ArrowRight, CalendarDays, PartyPopper, Info,
} from 'lucide-react';
import {
  parseCsv, autoMapearReserva, validarFilasReserva, serializeCsv, CAMPOS_RESERVA,
  type CampoReserva, type ParsedCsv,
} from '@/lib/csv';
import { importarReservas, type ResultadoImportReservas } from '@/lib/api-client';

// Asistente de importación de RESERVAS — cuarta pieza de la migración asistida.
// Requiere haber importado antes las socias y el horario: cada fila se empareja
// con una socia (email) y con una sesión (clase + fecha + hora) que ya existan.

type Paso = 1 | 2 | 3;

const PLANTILLA_HEADERS = ['Email', 'Clase', 'Fecha', 'Hora inicio', 'Estado'];
const PLANTILLA_EJEMPLO = [
  ['ana@ejemplo.com', 'Pilates Mat', '22/07/2026', '09:00', 'Confirmada'],
  ['lucia@ejemplo.com', 'Pilates Mat', '22/07/2026', '09:00', 'Asistió'],
  ['marta@ejemplo.com', 'Reformer Fundamental', '20/07/2026', '19:00', 'No asistió'],
];

const MAPEO_VACIO: Record<CampoReserva, number> = {
  email: -1, clase: -1, fecha: -1, hora_inicio: -1, estado: -1,
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

export default function ImportarReservasPage() {
  const router = useRouter();
  const [paso, setPaso] = useState<Paso>(1);
  const [parsed, setParsed] = useState<ParsedCsv | null>(null);
  const [nombreArchivo, setNombreArchivo] = useState('');
  const [mapeo, setMapeo] = useState<Record<CampoReserva, number>>(MAPEO_VACIO);
  const [dragActivo, setDragActivo] = useState(false);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [importando, setImportando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoImportReservas | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const validadas = useMemo(
    () => (parsed ? validarFilasReserva(parsed.rows, mapeo) : []),
    [parsed, mapeo],
  );
  const conteo = useMemo(() => {
    let ok = 0, err = 0;
    const porEstado: Record<string, number> = {};
    for (const f of validadas) {
      if (f.estado === 'ok') { ok++; porEstado[f.datos.estado] = (porEstado[f.datos.estado] ?? 0) + 1; }
      else err++;
    }
    return { ok, err, porEstado };
  }, [validadas]);

  const obligatoriosMapeados = mapeo.email >= 0 && mapeo.clase >= 0 && mapeo.fecha >= 0 && mapeo.hora_inicio >= 0;
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
      setMapeo(autoMapearReserva(p.headers));
      setNombreArchivo(file.name);
      setPaso(2);
    } catch {
      setErrorCarga('No se pudo leer el archivo.');
    }
  }

  async function importar() {
    setImportando(true);
    const filas = validadas.filter(f => f.estado === 'ok').map(f => f.datos);
    setResultado(await importarReservas(filas));
    setImportando(false);
    setPaso(3);
  }

  return (
    <div className="flex flex-col gap-6 pb-10 max-w-4xl">
      <div className="flex items-center gap-3">
        <Link href="/calendario" className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="text-[22px] font-bold text-foreground">Importar reservas</h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">
            Trae quién está apuntada a cada clase, para que nadie pierda su sitio.
          </p>
        </div>
      </div>

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

      {/* ── Paso 1 ──────────────────────────────────────────────────────── */}
      {paso === 1 && (
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-2.5 rounded-2xl border border-[#FDE68A] bg-[#FFFBEB] p-4">
            <Info size={15} className="mt-0.5 shrink-0 text-[#92400E]" />
            <p className="text-[12.5px] text-[#92400E]">
              <span className="font-semibold">Importa antes las socias y el horario.</span> Cada reserva se empareja con
              una socia por su email y con una clase por su fecha y hora: si no existen todavía, esas filas se omiten.
            </p>
          </div>

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
                <p className="font-medium text-foreground">También vale el histórico</p>
                <p className="mt-1">
                  Si tu export trae quién asistió y quién no, se importa igual: eso alimenta el riesgo de plantón
                  y las señales de retención desde el primer día.
                </p>
                <button
                  onClick={e => { e.stopPropagation(); descargar('plantilla-reservas.csv', serializeCsv(PLANTILLA_HEADERS, PLANTILLA_EJEMPLO)); }}
                  className="mt-2 inline-flex items-center gap-1.5 text-[12.5px] font-medium text-brand hover:underline"
                >
                  <Download size={13} />Descargar plantilla de ejemplo
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Paso 2 ──────────────────────────────────────────────────────── */}
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
              {CAMPOS_RESERVA.map(c => (
                <label key={c.campo} className="flex items-center justify-between gap-3">
                  <span className="text-[13px] text-foreground">
                    {c.etiqueta}{c.obligatorio && <span className="text-rose-500"> *</span>}
                  </span>
                  <select className={`${inputCls} w-44`} value={mapeo[c.campo]}
                    onChange={e => setMapeo(m => ({ ...m, [c.campo]: Number(e.target.value) }))}>
                    <option value={-1}>— sin usar —</option>
                    {parsed.headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                  </select>
                </label>
              ))}
            </div>
            {!obligatoriosMapeados && (
              <p className="mt-3 text-[12px] text-rose-600">
                Empareja <strong>email</strong>, <strong>clase</strong>, <strong>fecha</strong> y <strong>hora</strong>.
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-3">
            <span className="rounded-xl bg-[#D1FAE5] px-3 py-1.5 text-[12.5px] font-semibold text-[#065F46]">
              {conteo.ok} filas correctas
            </span>
            {conteo.err > 0 && (
              <span className="rounded-xl bg-[#FEE2E2] px-3 py-1.5 text-[12.5px] font-semibold text-[#991B1B]">
                {conteo.err} con problemas (se omiten)
              </span>
            )}
            {Object.entries(conteo.porEstado).map(([est, n]) => (
              <span key={est} className="rounded-xl bg-muted px-3 py-1.5 text-[12.5px] font-medium text-foreground">
                {n} {est.toLowerCase().replace('_', ' ')}
              </span>
            ))}
          </div>

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
              {importando ? 'Importando…' : 'Importar reservas'}<ArrowRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* ── Paso 3 ──────────────────────────────────────────────────────── */}
      {paso === 3 && resultado && (
        <div className="flex flex-col gap-4">
          {resultado.error ? (
            <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-700">
              <AlertTriangle size={15} className="shrink-0" />{resultado.error}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 rounded-3xl border border-border bg-card py-10 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#D1FAE5]">
                <PartyPopper size={26} className="text-[#059669]" />
              </div>
              <p className="text-[18px] font-bold text-foreground">Reservas importadas</p>
              <p className="text-[13px] text-muted-foreground">{resultado.importadas} reservas creadas</p>
            </div>
          )}

          {resultado && (resultado.duplicadas > 0 || resultado.sinSocia > 0 || resultado.sinSesion > 0 || resultado.sobreAforo > 0) && (
            <div className="rounded-2xl border border-border bg-card p-4">
              <div className="flex flex-col gap-1 text-[12.5px] text-muted-foreground">
                {resultado.duplicadas > 0 && <p>{resultado.duplicadas} ya estaban y no se han duplicado</p>}
                {resultado.sinSocia > 0 && <p>{resultado.sinSocia} sin socia: ese email no está en tus clientas</p>}
                {resultado.sinSesion > 0 && <p>{resultado.sinSesion} sin clase: no hay ninguna a esa fecha y hora</p>}
                {resultado.sobreAforo > 0 && (
                  <p className="text-[#92400E]">
                    {resultado.sobreAforo} {resultado.sobreAforo === 1 ? 'clase queda' : 'clases quedan'} por encima de su aforo —
                    se han importado igual para no quitarle el sitio a nadie, pero revísalas.
                  </p>
                )}
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
