'use client';

// F2 (B2.11) rescate desde Excel: importa las plazas fijas del estudio. Mismo patrón
// de asistente (subir → mapear → importar) que membresías. Empareja por email de la
// socia + nombre de la sala (ambos ya deben existir).

import { useMemo, useRef, useState, useId } from 'react';
import { useRouter } from 'next/navigation';
import {
  Upload, FileSpreadsheet, Download, Check, AlertTriangle,
  ArrowLeft, ArrowRight, CalendarClock, PartyPopper, Info,
} from 'lucide-react';
import {
  parseCsv, autoMapearPlazaFija, validarFilasPlazaFija, serializeCsv, CAMPOS_PLAZA_FIJA,
  type CampoPlazaFija, type ParsedCsv, type FilaPlazaFija,
} from '@/lib/csv';
import { importarPlazasFijas, type ResultadoImport } from '@/lib/api-client';
import { PageHeader } from '@/components/ui/page-header';

type Paso = 1 | 2 | 3;
const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

const PLANTILLA_HEADERS = ['Email', 'Día', 'Hora', 'Sala', 'Vigente desde'];
const PLANTILLA_EJEMPLO = [
  ['ana@ejemplo.com', 'Martes', '10:00', 'Sala Reformer', '01/02/2024'],
  ['lucia@ejemplo.com', 'Jueves', '18:30', 'Sala Reformer', ''],
];

const MAPEO_VACIO: Record<CampoPlazaFija, number> = {
  email: -1, dia_semana: -1, hora_inicio: -1, sala: -1, vigencia_desde: -1,
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

export default function ImportarPlazasFijasPage() {
  const uid = useId();
  const router = useRouter();
  const [paso, setPaso] = useState<Paso>(1);
  const [parsed, setParsed] = useState<ParsedCsv | null>(null);
  const [nombreArchivo, setNombreArchivo] = useState('');
  const [mapeo, setMapeo] = useState<Record<CampoPlazaFija, number>>(MAPEO_VACIO);
  const [dragActivo, setDragActivo] = useState(false);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [importando, setImportando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoImport | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const validadas = useMemo(() => (parsed ? validarFilasPlazaFija(parsed.rows, mapeo) : []), [parsed, mapeo]);
  const conteo = useMemo(() => {
    let ok = 0, err = 0;
    for (const f of validadas) (f.estado === 'ok' ? ok++ : err++);
    return { ok, err };
  }, [validadas]);

  const obligatoriosMapeados = mapeo.email >= 0 && mapeo.dia_semana >= 0 && mapeo.hora_inicio >= 0 && mapeo.sala >= 0;
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
      setMapeo(autoMapearPlazaFija(p.headers));
      setNombreArchivo(file.name);
      setPaso(2);
    } catch {
      setErrorCarga('No se pudo leer el archivo. ¿Seguro que es un CSV válido?');
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragActivo(false);
    const file = e.dataTransfer.files?.[0];
    if (file) cargarArchivo(file);
  }

  async function ejecutarImport() {
    setImportando(true);
    const filas: FilaPlazaFija[] = validadas.filter((f) => f.estado === 'ok').map((f) => f.datos);
    setResultado(await importarPlazasFijas(filas));
    setImportando(false);
    setPaso(3);
  }

  function reiniciar() {
    setPaso(1);
    setParsed(null);
    setNombreArchivo('');
    setResultado(null);
    setErrorCarga(null);
    setMapeo(MAPEO_VACIO);
  }

  return (
    <div className="space-y-6 min-h-screen" style={{ backgroundColor: 'var(--background)' }}>
      <PageHeader
        back={{ href: '/clientas/importar', label: 'Volver a importar clientas' }}
        title="Importar plazas fijas"
        description="Trae las plazas fijas (el hueco semanal de cada socia) desde un CSV."
      />

      <div className="flex items-start gap-2 text-[12.5px] rounded-xl px-4 py-3 border max-w-2xl" style={{ backgroundColor: 'color-mix(in srgb, var(--primary) 6%, transparent)', borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}>
        <Info size={15} className="shrink-0 mt-0.5 text-primary" />
        <span>Antes de importar, las <strong className="text-foreground">clientas</strong> (por email) y las <strong className="text-foreground">salas</strong> (por nombre) deben existir ya. Cada plaza generará reservas automáticamente en el cron nocturno.</span>
      </div>

      <div className="flex items-center gap-2 text-[12px] font-medium">
        {(['Subir archivo', 'Revisar y mapear', 'Importar'] as const).map((label, i) => {
          const n = (i + 1) as Paso;
          const activo = paso === n;
          const hecho = paso > n;
          return (
            <div key={label} className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold"
                style={{ backgroundColor: activo || hecho ? 'var(--primary)' : 'var(--muted)', color: activo || hecho ? 'var(--primary-foreground)' : 'var(--muted-foreground)' }}>
                {hecho ? <Check size={12} /> : n}
              </span>
              <span className={activo ? 'text-foreground' : 'text-muted-foreground'}>{label}</span>
              {i < 2 && <span className="w-6 h-px bg-border mx-1" />}
            </div>
          );
        })}
      </div>

      {paso === 1 && (
        <div className="space-y-4 max-w-2xl">
          <div
            onDragOver={(e) => { e.preventDefault(); setDragActivo(true); }}
            onDragLeave={() => setDragActivo(false)}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
            className="border-2 border-dashed rounded-2xl px-6 py-14 text-center cursor-pointer transition-colors"
            style={{ borderColor: dragActivo ? 'var(--primary)' : 'var(--border)', backgroundColor: dragActivo ? 'color-mix(in srgb, var(--primary) 6%, transparent)' : 'var(--card)' }}
          >
            <input ref={inputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) cargarArchivo(f); }} />
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4"><Upload size={22} className="text-primary" /></div>
            <p className="text-[15px] font-semibold text-foreground">Arrastra tu CSV aquí</p>
            <p className="text-[13px] text-muted-foreground mt-1">o haz clic para seleccionarlo</p>
          </div>

          {errorCarga && (
            <div className="flex items-start gap-2 text-[13px] rounded-xl px-4 py-3 border" style={{ backgroundColor: 'color-mix(in srgb, var(--destructive, #d33) 8%, transparent)', borderColor: 'color-mix(in srgb, var(--destructive, #d33) 30%, transparent)', color: 'var(--destructive, #b3261e)' }}>
              <AlertTriangle size={15} className="shrink-0 mt-0.5" />
              <span>{errorCarga}</span>
            </div>
          )}

          <div className="flex items-center gap-4 text-[13px]">
            <button onClick={() => descargar('plantilla-plazas-fijas-tentare.csv', serializeCsv(PLANTILLA_HEADERS, PLANTILLA_EJEMPLO))} className="inline-flex items-center gap-1.5 text-primary font-medium hover:underline">
              <Download size={14} /> Descargar plantilla de ejemplo
            </button>
            <span className="text-muted-foreground">Columnas mínimas: <strong className="text-foreground">Email</strong>, <strong className="text-foreground">Día</strong>, <strong className="text-foreground">Hora</strong> y <strong className="text-foreground">Sala</strong>.</span>
          </div>
        </div>
      )}

      {paso === 2 && parsed && (
        <div className="space-y-5">
          <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
            <FileSpreadsheet size={15} className="text-foreground" />
            <strong className="text-foreground">{nombreArchivo}</strong>
            · {parsed.rows.length} filas · delimitador «{parsed.delimiter === '\t' ? 'tab' : parsed.delimiter}»
          </div>

          <div className="bg-card border border-border rounded-2xl p-5">
            <h2 className="text-[13px] font-semibold text-foreground mb-1">Relaciona tus columnas</h2>
            <p className="text-[12px] text-muted-foreground mb-4">Hemos intentado adivinarlas. Ajusta lo que haga falta.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {CAMPOS_PLAZA_FIJA.map(({ campo, etiqueta, obligatorio }) => (
                <div key={campo} className="space-y-1.5">
                  <label htmlFor={`${uid}-${campo}`} className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                    {etiqueta}{obligatorio && <span className="text-primary">*</span>}
                  </label>
                  <select id={`${uid}-${campo}`} value={mapeo[campo]} onChange={(e) => setMapeo((m) => ({ ...m, [campo]: Number(e.target.value) }))}
                    className="w-full text-[13px] bg-background border border-border rounded-lg px-3 py-2 focus:outline-none focus:border-muted-foreground transition-colors">
                    <option value={-1}>— Sin asignar —</option>
                    {parsed.headers.map((h, i) => (<option key={i} value={i}>{h || `Columna ${i + 1}`}</option>))}
                  </select>
                </div>
              ))}
            </div>
            {!obligatoriosMapeados && (
              <p className="text-[12px] mt-4 flex items-center gap-1.5" style={{ color: 'var(--destructive, #b3261e)' }}>
                <AlertTriangle size={13} /> Asigna <strong>Email</strong>, <strong>Día</strong>, <strong>Hora</strong> y <strong>Sala</strong> para continuar.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 max-w-md">
            <Contador color="#16a34a" valor={conteo.ok} label="Listas para importar" Icon={Check} />
            <Contador color="#dc2626" valor={conteo.err} label="Con errores (se omiten)" Icon={AlertTriangle} />
          </div>

          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            <div className="px-4 py-2.5 border-b border-border text-[12px] font-semibold text-muted-foreground">
              Vista previa (primeras {Math.min(8, validadas.length)} de {validadas.length})
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="text-left font-semibold px-4 py-2">Estado</th>
                    <th className="text-left font-semibold px-4 py-2">Email</th>
                    <th className="text-left font-semibold px-4 py-2">Día</th>
                    <th className="text-left font-semibold px-4 py-2">Hora</th>
                    <th className="text-left font-semibold px-4 py-2">Sala</th>
                  </tr>
                </thead>
                <tbody>
                  {validadas.slice(0, 8).map((f) => (
                    <tr key={f.fila} className="border-t border-border">
                      <td className="px-4 py-2"><EstadoBadge estado={f.estado} motivo={f.motivo} /></td>
                      <td className="px-4 py-2 text-muted-foreground">{f.datos.email || '—'}</td>
                      <td className="px-4 py-2 text-foreground">{f.datos.diaSemana !== null ? DIAS[f.datos.diaSemana] : <span className="text-muted-foreground">—</span>}</td>
                      <td className="px-4 py-2 text-muted-foreground">{f.datos.horaInicio || '—'}</td>
                      <td className="px-4 py-2 text-muted-foreground">{f.datos.sala || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3">
            <button onClick={reiniciar} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft size={14} /> Elegir otro archivo
            </button>
            <button onClick={ejecutarImport} disabled={!puedeImportar}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-[13px] font-semibold text-primary-foreground bg-primary hover:brightness-95 transition-all shadow-sm disabled:opacity-40 disabled:cursor-not-allowed">
              {importando ? 'Importando…' : <>Importar {conteo.ok} plazas fijas <ArrowRight size={14} /></>}
            </button>
          </div>
        </div>
      )}

      {paso === 3 && resultado && (
        <div className="max-w-xl space-y-5">
          {resultado.error ? (
            <div className="bg-card border border-border rounded-2xl p-6 text-center">
              <div className="w-12 h-12 rounded-2xl mx-auto mb-3 flex items-center justify-center" style={{ backgroundColor: 'color-mix(in srgb, var(--destructive, #d33) 12%, transparent)' }}>
                <AlertTriangle size={22} style={{ color: 'var(--destructive, #b3261e)' }} />
              </div>
              <p className="text-[15px] font-semibold text-foreground">La importación falló</p>
              <p className="text-[13px] text-muted-foreground mt-1">{resultado.error}</p>
              {resultado.importadas > 0 && <p className="text-[13px] text-muted-foreground mt-2">Se importaron {resultado.importadas} antes del fallo.</p>}
            </div>
          ) : (
            <div className="bg-card border border-border rounded-2xl p-6 text-center">
              <div className="w-12 h-12 rounded-2xl bg-primary/10 mx-auto mb-3 flex items-center justify-center"><PartyPopper size={22} className="text-primary" /></div>
              <p className="text-[17px] font-bold text-foreground">
                {resultado.importadas} {resultado.importadas === 1 ? 'plaza fija importada' : 'plazas fijas importadas'}
              </p>
              <p className="text-[13px] text-muted-foreground mt-1">
                {resultado.duplicadas > 0 && `${resultado.duplicadas} omitidas por existir ya (misma socia, día, hora y sala). `}
                {resultado.errores.length > 0 && `${resultado.errores.length} con errores.`}
                {resultado.duplicadas === 0 && resultado.errores.length === 0 && 'Todo limpio.'}
              </p>
            </div>
          )}

          {resultado.errores.length > 0 && (
            <div className="bg-card border border-border rounded-2xl overflow-hidden">
              <div className="px-4 py-2.5 border-b border-border flex items-center justify-between">
                <span className="text-[12px] font-semibold text-muted-foreground">Filas con problemas</span>
                <button onClick={() => descargar('errores-plazas-fijas.csv', serializeCsv(['Fila', 'Email', 'Motivo'], resultado.errores.map((e) => [String(e.fila), e.email, e.motivo])))}
                  className="inline-flex items-center gap-1.5 text-[12px] text-primary font-medium hover:underline">
                  <Download size={13} /> Descargar
                </button>
              </div>
              <div className="max-h-52 overflow-y-auto text-[13px]">
                {resultado.errores.slice(0, 50).map((e, i) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-2 border-t border-border first:border-t-0">
                    <span className="text-muted-foreground w-12 shrink-0">#{e.fila}</span>
                    <span className="text-foreground truncate flex-1">{e.email || '(sin email)'}</span>
                    <span className="text-muted-foreground shrink-0">{e.motivo}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center gap-3">
            <button onClick={() => router.push('/clientas')} className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-[13px] font-semibold text-primary-foreground bg-primary hover:brightness-95 transition-all shadow-sm">
              <CalendarClock size={14} /> Ver mis clientas
            </button>
            <button onClick={reiniciar} className="text-[13px] font-medium text-muted-foreground hover:text-foreground transition-colors">Importar otro archivo</button>
          </div>
        </div>
      )}
    </div>
  );
}

function Contador({ color, valor, label, Icon }: { color: string; valor: number; label: string; Icon: React.ElementType }) {
  return (
    <div className="bg-card border border-border rounded-xl px-4 py-3 flex items-center gap-3">
      <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: color + '1A' }}><Icon size={16} style={{ color }} /></div>
      <div className="min-w-0">
        <p className="text-[20px] font-bold text-foreground leading-tight">{valor}</p>
        <p className="text-[11px] text-muted-foreground truncate">{label}</p>
      </div>
    </div>
  );
}

function EstadoBadge({ estado, motivo }: { estado: 'ok' | 'error'; motivo?: string }) {
  const cfg = estado === 'ok'
    ? { color: '#16a34a', texto: 'Lista', Icon: Check }
    : { color: '#dc2626', texto: motivo ?? 'Error', Icon: AlertTriangle };
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md whitespace-nowrap" style={{ backgroundColor: cfg.color + '1A', color: cfg.color }} title={motivo}>
      <cfg.Icon size={10} /> {cfg.texto}
    </span>
  );
}
