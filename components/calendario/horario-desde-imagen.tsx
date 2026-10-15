'use client';

import { useId, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowLeft, ArrowRight, CalendarDays, Check, ImageUp, PartyPopper, Plus, Trash2 } from 'lucide-react';
import { importarClases, type ResultadoImportClases } from '@/lib/api-client';
import { masDias } from '@/lib/utils';
import { useStudio } from '@/lib/studio-context';
import {
  DIAS, MAX_CARACTERES_TEXTO, filasParaImportar, filasQueSeCrean, instructoraNueva, problemasDeFila,
  type DiaLeido, type FilaRevisable,
} from '@/lib/horario-imagen/mapeo';
import { pedirLecturaHorario, reducirImagen, type LecturaRecibida } from '@/lib/horario-imagen/cliente';

// P2.1 — el horario desde una captura o un texto (apagado tras
// `HORARIO_DESDE_IMAGEN`). Se lee, se REVISA en una tabla editable y solo
// entonces se crea, con el importador de siempre: clases semanales desde el
// lunes que dice el servidor, sin las que ya hayan pasado ni las que caigan en
// un cierre del centro. Nada se crea sin el botón.

/**
 * Cuántas semanas se crean de una vez: el máximo del importador. Las series no
 * se renuevan solas salvo que el estudio lo encienda: antes de acabarse avisan.
 */
const SEMANAS = 12;
/** Sin aforo en la captura ni sala, el importador pone este (`/api/clases/import`). */
const AFORO_POR_DEFECTO = 10;

const NOMBRE_DIA: Record<DiaLeido, string> = {
  lunes: 'Lunes', martes: 'Martes', miercoles: 'Miércoles', jueves: 'Jueves', viernes: 'Viernes', sabado: 'Sábado', domingo: 'Domingo',
};

const fechaLarga = (dia: string) =>
  new Date(`${dia}T12:00:00Z`).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

const normSala = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

const celda = 'w-full rounded-lg border border-border bg-background px-2 py-1.5 text-[13px] text-foreground focus:outline-none focus:ring-2 focus:ring-black/10 aria-[invalid=true]:border-destructive';

type Fase =
  | { tipo: 'entrada' }
  | { tipo: 'leyendo' }
  | { tipo: 'revisar'; lectura: LecturaRecibida }
  | { tipo: 'hecho'; resultado: ResultadoImportClases };

export function HorarioDesdeImagen({ onVolver }: { onVolver: () => void }) {
  const uid = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [fase, setFase] = useState<Fase>({ tipo: 'entrada' });
  const [texto, setTexto] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [detalles, setDetalles] = useState<string[]>([]);
  const [filas, setFilas] = useState<FilaRevisable[]>([]);
  const [tocada, setTocada] = useState(false);
  const [confirmarVolver, setConfirmarVolver] = useState(false);
  const [creando, setCreando] = useState(false);
  const { instructores, salas } = useStudio();
  const equipo = useMemo(() => instructores.map((i) => i.nombre), [instructores]);
  const capacidadPorSala = useMemo(() => new Map(salas.map((s) => [normSala(s.nombre), s.capacidad])), [salas]);
  const textoLargo = texto.length > MAX_CARACTERES_TEXTO;

  async function leer(entrada: { imagen: File } | { texto: string }) {
    setError(null);
    setDetalles([]);
    setFase({ tipo: 'leyendo' });
    let peticion: { imagen: Blob } | { texto: string };
    if ('imagen' in entrada) {
      try {
        peticion = { imagen: await reducirImagen(entrada.imagen) };
      } catch {
        setFase({ tipo: 'entrada' });
        setError('No hemos podido abrir esa imagen aquí. Haz una captura de pantalla del horario (PNG o JPG) y súbela.');
        return;
      }
    } else {
      peticion = { texto: entrada.texto };
    }
    const r = await pedirLecturaHorario(peticion);
    if (!r.ok) {
      setFase({ tipo: 'entrada' });
      setError(r.error);
      return;
    }
    if (r.lectura.resultado !== 'HORARIO' || r.lectura.filas.length === 0) {
      setFase({ tipo: 'entrada' });
      setError(r.lectura.resultado === 'NO_ES_HORARIO'
        ? 'Eso no parece un horario de clases. Prueba con una captura de tu horario semanal.'
        : 'No hemos podido leer ninguna clase. Prueba con una captura más nítida, o pega el texto.');
      return;
    }
    // Con una sola sala, las clases son de esa sala (una captura casi nunca la dice).
    const unicaSala = salas.length === 1 ? salas[0].nombre : null;
    setFilas(r.lectura.filas.map((f) => (f.sala || !unicaSala ? f : { ...f, sala: unicaSala })));
    setTocada(false);
    setConfirmarVolver(false);
    setFase({ tipo: 'revisar', lectura: r.lectura });
  }

  async function crear() {
    if (fase.tipo !== 'revisar') return;
    setError(null);
    setDetalles([]);
    setCreando(true);
    const r = await importarClases(filasParaImportar(filas), { semanas: SEMANAS, desde: fase.lectura.desde, origen: 'imagen' });
    setCreando(false);
    // Un fallo deja la tabla como estaba, con el motivo: nada se pierde.
    if (r.error) {
      setError(r.error);
      setDetalles((r.errores ?? []).slice(0, 4).map((e) => e.motivo));
      return;
    }
    setFase({ tipo: 'hecho', resultado: r });
  }

  // Editar no quita la marca de «dudosa»: eso es «Está bien», a propósito (cambiar
  // la instructora no revisa una hora que nadie ha mirado).
  const cambiar = (i: number, cambios: Partial<FilaRevisable>) => {
    setTocada(true);
    setFilas((fs) => fs.map((f, j) => (j === i ? { ...f, ...cambios } : f)));
  };

  // ── Entrada ────────────────────────────────────────────────────────────────
  if (fase.tipo === 'entrada' || fase.tipo === 'leyendo') {
    const leyendo = fase.tipo === 'leyendo';
    return (
      <div className="flex flex-col gap-4" aria-busy={leyendo}>
        <div className="rounded-2xl border border-border bg-card p-5">
          <p className="text-[14px] font-semibold text-foreground">¿Ya tienes tu horario en tu web, en Instagram o en tu programa de ahora?</p>
          <p className="mt-1 text-[12.5px] text-muted-foreground">
            Sube una captura del horario (sin listas de alumnas) o pega el texto. Lo leemos y te enseñamos la semana: no se crea nada hasta que lo revises.
          </p>
          <div className="mt-4 flex flex-col gap-4 sm:flex-row">
            <button
              type="button"
              disabled={leyendo}
              onClick={() => inputRef.current?.click()}
              className="flex flex-1 flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-border p-6 text-center transition-colors hover:border-foreground/30 disabled:opacity-50"
            >
              <ImageUp size={24} className="text-muted-foreground" />
              <span className="text-[13.5px] font-semibold text-foreground">Subir una captura</span>
              <span className="text-[12px] text-muted-foreground">PNG o JPG</span>
            </button>
            <input
              ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp,image/heic" className="hidden"
              aria-label="Captura del horario"
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void leer({ imagen: f }); }}
            />
            <div className="flex flex-1 flex-col gap-2">
              <label htmlFor={`${uid}-texto`} className="text-[12.5px] font-medium text-foreground">O pega el texto del horario</label>
              <textarea
                id={`${uid}-texto`} rows={4} value={texto} disabled={leyendo}
                aria-invalid={textoLargo}
                aria-describedby={`${uid}-cuenta`}
                onChange={(e) => setTexto(e.target.value)}
                placeholder={'Lunes 9:00 Reformer (Ana)\nLunes 19:00 Mat…'}
                className={`${celda} resize-y`}
              />
              <p id={`${uid}-cuenta`} className={`text-[11.5px] ${textoLargo ? 'font-medium text-destructive' : 'text-muted-foreground'}`}>
                {textoLargo
                  ? `Son ${texto.length.toLocaleString('es-ES')} caracteres y se leen ${MAX_CARACTERES_TEXTO.toLocaleString('es-ES')} como mucho: pégalo en dos partes.`
                  : `${texto.length.toLocaleString('es-ES')} de ${MAX_CARACTERES_TEXTO.toLocaleString('es-ES')} caracteres`}
              </p>
              <button
                type="button" disabled={leyendo || !texto.trim() || textoLargo}
                onClick={() => void leer({ texto: texto.trim() })}
                className="self-start rounded-lg border border-border bg-background px-3 py-1.5 text-[13px] font-medium text-foreground hover:bg-muted disabled:opacity-40"
              >
                Leer el texto
              </button>
            </div>
          </div>
          {leyendo && <p className="mt-4 text-[13px] text-muted-foreground" role="status">Leyendo el horario… puede tardar medio minuto.</p>}
        </div>
        {error && (
          <p role="alert" className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-[13px] text-destructive">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" />{error}
          </p>
        )}
        <button type="button" disabled={leyendo} onClick={onVolver} className="inline-flex items-center gap-1.5 self-start text-[13px] text-muted-foreground hover:text-foreground disabled:opacity-40">
          <ArrowLeft size={14} />Prefiero subir un Excel
        </button>
      </div>
    );
  }

  // ── Hecho ──────────────────────────────────────────────────────────────────
  if (fase.tipo === 'hecho') {
    const r = fase.resultado;
    const ninguna = r.creadas === 0;
    return (
      <div className="flex flex-col items-center gap-3 rounded-3xl border border-border bg-card px-6 py-10 text-center" data-testid="horario-hecho">
        <div className={`flex h-14 w-14 items-center justify-center rounded-full ${ninguna ? 'bg-muted' : 'bg-success/10'}`}>
          {ninguna ? <AlertTriangle size={26} className="text-muted-foreground" /> : <PartyPopper size={26} className="text-success" />}
        </div>
        <p className="text-[18px] font-bold text-foreground">{ninguna ? 'No se ha creado ninguna clase nueva' : 'Horario creado'}</p>
        {!ninguna && (
          <p className="text-[13px] text-muted-foreground">
            {r.creadas} clases en el calendario{r.tiposCreados > 0 && ` · ${r.tiposCreados} tipos de clase nuevos`}
          </p>
        )}
        <div className="flex flex-col gap-0.5 text-[12.5px] text-muted-foreground">
          {r.omitidas > 0 && <p>{r.omitidas} ya existían y no se han duplicado</p>}
          {(r.saltadasPorCierre ?? 0) > 0 && <p>{r.saltadasPorCierre} caían en un cierre del centro y no se han creado</p>}
          {(r.omitidasPorSolape ?? 0) > 0 && <p>{r.omitidasPorSolape} no se han creado porque se pisaban con otra clase en la misma sala o con la misma instructora</p>}
          {(r.instructorasCreadas?.length ?? 0) > 0 && (
            <p>Se dieron de alta en tu equipo, sin email ni invitación: {r.instructorasCreadas!.slice(0, 6).join(', ')}{r.instructorasCreadas!.length > 6 ? '…' : ''}. Complétalas en Equipo.</p>
          )}
          {r.sinInstructor > 0 && <p>{r.sinInstructor} sin instructora: no se encontró ese nombre en tu equipo</p>}
          {r.sinSala > 0 && <p>{r.sinSala} sin sala: no se encontró ese nombre</p>}
          {r.errores.slice(0, 4).map((e, i) => <p key={i}>{e.motivo}</p>)}
        </div>
        {!ninguna && <p className="text-[12.5px] text-muted-foreground">Antes de que se acaben las {SEMANAS} semanas te avisamos para renovarlas.</p>}
        <Link href="/calendario" className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-[13px] font-medium text-brand-foreground hover:brightness-95">
          <CalendarDays size={14} />Ver el calendario
        </Link>
      </div>
    );
  }

  // ── Revisar ────────────────────────────────────────────────────────────────
  const { lectura } = fase;
  const seCrean = filasQueSeCrean(filas);
  const conProblemas = filas.filter((f) => problemasDeFila(f).length > 0).length;
  const repetidas = filas.length - conProblemas - seCrean.length;
  const ultimoDia = masDias(lectura.desde, SEMANAS * 7 - 1);
  const aforoQueSeAplica = (f: FilaRevisable) => (f.sala ? capacidadPorSala.get(normSala(f.sala)) : undefined) ?? AFORO_POR_DEFECTO;
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-border bg-card p-4">
        <p className="text-[14px] font-semibold text-foreground">Revisa la semana antes de crearla</p>
        <p className="mt-1 text-[12.5px] text-muted-foreground">
          Cambia lo que no esté bien.
          {filas.some((f) => f.dudosa) && ' Las marcadas en ámbar con ⚠ no las hemos leído seguras: míralas y pulsa «Está bien».'}
          {' '}Las instructoras marcadas como «nueva» no están en tu equipo y se darán de alta, sin acceso: si alguna no es una instructora, bórrala.
          {' '}Sin aforo, se usa el de la sala (o {AFORO_POR_DEFECTO} si no tiene).
        </p>
        {(lectura.avisos.length > 0 || lectura.descartadas > 0) && (
          <ul className="mt-2 list-disc pl-5 text-[12.5px] text-muted-foreground">
            {lectura.descartadas > 0 && <li>{lectura.descartadas === 1 ? 'Una clase no se ha podido leer' : `${lectura.descartadas} clases no se han podido leer`} (sin hora o sin nombre, o que acaba al día siguiente): añádela a mano si hace falta.</li>}
            {lectura.avisos.map((a, i) => <li key={i}>{a}</li>)}
          </ul>
        )}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full min-w-[980px] text-[13px]" data-testid="horario-leido">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2"><span className="sr-only">Acciones</span></th>
              <th className="px-3 py-2 font-semibold">Día</th>
              <th className="px-3 py-2 font-semibold">Empieza</th>
              <th className="px-3 py-2 font-semibold">Acaba</th>
              <th className="px-3 py-2 font-semibold">Clase</th>
              <th className="px-3 py-2 font-semibold">Instructora</th>
              <th className="px-3 py-2 font-semibold">Sala</th>
              <th className="px-3 py-2 font-semibold">Aforo</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f, i) => {
              const mal = new Set(problemasDeFila(f));
              const n = i + 1;
              return (
                <tr key={i} className={`border-t border-border ${f.dudosa ? 'bg-warning/10' : ''}`}>
                  <td className="px-2 py-1.5">
                    <div className="flex items-center gap-1">
                      <button type="button" aria-label={`Quitar la fila ${n}`} onClick={() => { setTocada(true); setFilas((fs) => fs.filter((_, j) => j !== i)); }}
                        className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
                        <Trash2 size={14} />
                      </button>
                      {f.dudosa && (
                        <button type="button" onClick={() => setFilas((fs) => fs.map((g, j) => (j === i ? { ...g, dudosa: false } : g)))}
                          className="inline-flex items-center gap-1 whitespace-nowrap rounded-md bg-warning/15 px-1.5 py-0.5 text-[11px] font-semibold text-warning hover:brightness-95"
                          aria-label={`Revisar la fila ${n}: está bien`}>
                          <AlertTriangle size={11} aria-hidden /><Check size={11} aria-hidden />Está bien
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="px-2 py-1.5">
                    <select aria-label={`Día de la fila ${n}`} aria-invalid={mal.has('dia')} className={`${celda} min-w-[7.5rem]`} value={f.dia} onChange={(e) => cambiar(i, { dia: e.target.value as DiaLeido })}>
                      {DIAS.map((d) => <option key={d} value={d}>{NOMBRE_DIA[d]}</option>)}
                    </select>
                  </td>
                  <td className="px-2 py-1.5"><input aria-label={`Hora de inicio de la fila ${n}`} aria-invalid={mal.has('inicio')} type="time" className={`${celda} min-w-[6.5rem]`} value={f.inicio} onChange={(e) => cambiar(i, { inicio: e.target.value })} /></td>
                  <td className="px-2 py-1.5"><input aria-label={`Hora de fin de la fila ${n}`} aria-invalid={mal.has('fin')} type="time" className={`${celda} min-w-[6.5rem]`} value={f.fin ?? ''} onChange={(e) => cambiar(i, { fin: e.target.value || null })} /></td>
                  <td className="px-2 py-1.5"><input aria-label={`Clase de la fila ${n}`} aria-invalid={mal.has('clase')} className={`${celda} min-w-[9rem]`} value={f.clase} onChange={(e) => cambiar(i, { clase: e.target.value })} /></td>
                  <td className="px-2 py-1.5">
                    <div className="flex items-center gap-1.5">
                      <input aria-label={`Instructora de la fila ${n}`} className={`${celda} min-w-[9rem]`} value={f.instructora ?? ''} onChange={(e) => cambiar(i, { instructora: e.target.value || null })} />
                      {instructoraNueva(f.instructora, equipo) && (
                        <span className="shrink-0 rounded-md bg-warning/15 px-1.5 py-0.5 text-[11px] font-semibold text-warning" title="No está en tu equipo: se dará de alta, sin acceso">nueva</span>
                      )}
                    </div>
                  </td>
                  <td className="px-2 py-1.5"><input aria-label={`Sala de la fila ${n}`} className={`${celda} min-w-[7rem]`} value={f.sala ?? ''} onChange={(e) => cambiar(i, { sala: e.target.value || null })} /></td>
                  <td className="px-2 py-1.5">
                    <input aria-label={`Aforo de la fila ${n}`} aria-invalid={mal.has('aforo')} type="number" min={1} max={200} className={`${celda} w-20`}
                      placeholder={String(aforoQueSeAplica(f))}
                      value={f.aforo ?? ''}
                      onChange={(e) => cambiar(i, { aforo: e.target.value === '' ? null : Number(e.target.value) })} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <button type="button"
          onClick={() => { setTocada(true); setFilas((fs) => [...fs, { dia: 'lunes', inicio: '09:00', fin: null, clase: '', instructora: null, sala: salas.length === 1 ? salas[0].nombre : null, aforo: null, dudosa: false }]); }}
          className="m-2 inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[12.5px] font-medium text-brand-medio hover:underline">
          <Plus size={14} />Añadir una clase
        </button>
      </div>

      <p className="text-[13px] text-foreground" data-testid="horario-resumen">
        Vas a crear <strong>{seCrean.length} {seCrean.length === 1 ? 'clase semanal' : 'clases semanales'}</strong> desde el {fechaLarga(lectura.desde)}:
        {' '}como mucho {seCrean.length * SEMANAS} clases hasta el {fechaLarga(ultimoDia)} (sin las que caigan en un cierre del centro ni las que ya existan).
        {conProblemas > 0 && <span className="text-destructive"> {conProblemas === 1 ? 'Una fila no está completa' : `${conProblemas} filas no están completas`} (clase, hora de inicio, el fin después del inicio y un aforo de 1 a 200) y no se creará.</span>}
        {repetidas > 0 && <span className="text-muted-foreground"> {repetidas === 1 ? 'Una fila repite' : `${repetidas} filas repiten`} otra clase el mismo día a la misma hora: se crea una vez.</span>}
      </p>

      {error && (
        <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-[13px] text-destructive">
          <p className="flex items-start gap-2"><AlertTriangle size={15} className="mt-0.5 shrink-0" />{error}</p>
          {detalles.length > 0 && <ul className="mt-1 list-disc pl-8 text-[12.5px]">{detalles.map((d, i) => <li key={i}>{d}</li>)}</ul>}
        </div>
      )}

      {confirmarVolver ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-[13px]">
          <span className="text-foreground">Se perderán los cambios de la tabla, y leer otra vez cuenta como otra lectura del día.</span>
          <button type="button" onClick={() => { setError(null); setFase({ tipo: 'entrada' }); }}
            className="rounded-lg border border-border bg-background px-3 py-1.5 font-medium text-foreground hover:bg-muted">Sí, volver</button>
          <button type="button" onClick={() => setConfirmarVolver(false)}
            className="rounded-lg px-3 py-1.5 font-medium text-muted-foreground hover:text-foreground">Seguir revisando</button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={creando}
            onClick={() => { if (tocada) setConfirmarVolver(true); else { setError(null); setFase({ tipo: 'entrada' }); } }}
            className="rounded-lg border border-border bg-card px-4 py-2 text-[13px] text-foreground hover:bg-muted disabled:opacity-40">
            Volver a subir o pegar
          </button>
          <button type="button" disabled={creando || seCrean.length === 0} onClick={() => void crear()}
            className="flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-[13px] font-medium text-brand-foreground hover:brightness-95 disabled:opacity-40">
            {creando ? 'Creando…' : `Crear ${seCrean.length} ${seCrean.length === 1 ? 'clase semanal' : 'clases semanales'}`}<ArrowRight size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
