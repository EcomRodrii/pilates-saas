'use client';

// «Equipo → Tiempo trabajado»: lo que han fichado las instructoras desde la app
// del estudio, mes a mes. Corregir una jornada exige un motivo y deja rastro del
// valor anterior y el nuevo; aquí solo se pinta lo que el servidor confirma.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useStudio } from '@/lib/studio-context';
import { useRol } from '@/lib/permisos';
import { puedeGestionarEquipo } from '@/lib/permisos-reglas';
import { PageHeader } from '@/components/ui/page-header';
import { Toast, useToast } from '@/components/ui/toast';
import {
  corregirJornada, fetchTarifasEquipo, fetchTiempoTrabajado,
  type TarifaInstructor, type TiempoTrabajadoMes,
} from '@/lib/api-client';
import type { CambioJornada, JornadaEquipo } from '@/lib/fichaje/jornadas-equipo';
import { formatEuro, instanteEnEstudio, TZ_ESTUDIO } from '@/lib/utils';

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const inputCls = 'rounded-lg border border-border bg-card px-2.5 py-1.5 text-sm text-foreground focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/15 transition-all';

const fmtDia = new Intl.DateTimeFormat('es-ES', { timeZone: TZ_ESTUDIO, weekday: 'short', day: 'numeric', month: 'short' });
const fmtHora = new Intl.DateTimeFormat('es-ES', { timeZone: TZ_ESTUDIO, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const fmtFechaISO = new Intl.DateTimeFormat('en-CA', { timeZone: TZ_ESTUDIO, year: 'numeric', month: '2-digit', day: '2-digit' });

const horas = (min: number) => `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min`;
const dia = (iso: string) => fmtDia.format(new Date(iso));
const hora = (iso: string) => fmtHora.format(new Date(iso));
const CAMPO: Record<string, string> = { check_in_at: 'Entrada', check_out_at: 'Salida', status: 'Estado' };
const ACCION: Record<CambioJornada['accion'], string> = { CHECK_IN: 'Fichó la entrada', CHECK_OUT: 'Fichó la salida', EDITED: 'Corregido' };

export default function TiempoTrabajadoPage() {
  const rol = useRol();
  const { instructores } = useStudio();
  const { message: toastMsg, show: showToast, dismiss: dismissToast } = useToast();

  const ahora = useMemo(() => new Date(), []);
  const [anio, setAnio] = useState(ahora.getFullYear());
  const [mes, setMes] = useState(ahora.getMonth() + 1);
  const [datos, setDatos] = useState<TiempoTrabajadoMes | null>(null);
  const [error, setError] = useState(false);
  const [tarifas, setTarifas] = useState<Record<string, TarifaInstructor>>({});
  const [abierta, setAbierta] = useState<string | null>(null);

  const recargar = useCallback(async () => {
    const d = await fetchTiempoTrabajado(anio, mes);
    setDatos(d);
    setError(d === null);
  }, [anio, mes]);

  useEffect(() => {
    let vivo = true;
    Promise.all([fetchTiempoTrabajado(anio, mes), fetchTarifasEquipo()]).then(([d, tar]) => {
      if (!vivo) return;
      setDatos(d);
      setError(d === null);
      setTarifas(Object.fromEntries(tar.map((t) => [t.instructorId, t])));
    });
    return () => { vivo = false; };
  }, [anio, mes]);

  const nombre = useMemo(() => new Map(instructores.map((i) => [i.id, i.nombre])), [instructores]);
  const filas = useMemo(() => {
    if (!datos) return [];
    const ids = new Set([
      ...instructores.filter((i) => i.activo && i.rol === 'INSTRUCTOR').map((i) => i.id),
      ...datos.resumen.map((r) => r.instructorId),
    ]);
    const porId = new Map(datos.resumen.map((r) => [r.instructorId, r]));
    return [...ids]
      .map((id) => ({ id, resumen: porId.get(id), jornadas: datos.jornadas.filter((j) => j.instructorId === id) }))
      .sort((a, b) => (b.resumen?.minutos ?? 0) - (a.resumen?.minutos ?? 0));
  }, [datos, instructores]);

  if (!puedeGestionarEquipo(rol)) {
    return (
      <div className="space-y-5">
        <PageHeader title="Tiempo trabajado" back={{ href: '/equipo', label: 'Volver a Equipo' }} />
        <p className="text-sm text-muted-foreground">No tienes permiso para ver esta pantalla.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Tiempo trabajado"
        description="Las jornadas que fichan tus instructoras desde la app del estudio. Corregir una deja constancia del motivo."
        back={{ href: '/equipo', label: 'Volver a Equipo' }}
        actions={
          <div className="flex items-center gap-2">
            <select aria-label="Mes" value={mes} onChange={(e) => setMes(Number(e.target.value))} className={inputCls}>
              {MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
            <select aria-label="Año" value={anio} onChange={(e) => setAnio(Number(e.target.value))} className={inputCls}>
              {[ahora.getFullYear() - 1, ahora.getFullYear()].map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
        }
      />

      {error ? (
        <div className="rounded-2xl border border-border bg-card p-5 text-sm">
          <p className="text-foreground">No hemos podido cargar el tiempo trabajado.</p>
          <button onClick={() => void recargar()} className="mt-3 px-3 py-1.5 rounded-lg border border-border text-[12px] font-semibold hover:bg-muted">Reintentar</button>
        </div>
      ) : !datos ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : filas.length === 0 ? (
        <p className="text-sm text-muted-foreground">Todavía no hay instructoras de alta.</p>
      ) : (
        <div className="space-y-4" data-testid="tiempo-trabajado">
          {filas.map(({ id, resumen, jornadas }) => {
            const tarifa = tarifas[id]?.tarifaHora;
            const minutos = resumen?.minutos ?? 0;
            const desplegada = abierta === id;
            return (
              <div key={id} className="rounded-2xl border border-border bg-card p-5" data-testid="tiempo-instructora">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-[14px] font-semibold text-foreground">{nombre.get(id) ?? 'Instructora'}</h2>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {(resumen?.abiertas ?? 0) > 0 && (
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700">Fichada ahora</span>
                      )}
                      {(resumen?.aRevisar ?? 0) > 0 && (
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-700">
                          {resumen!.aRevisar} {resumen!.aRevisar === 1 ? 'jornada por revisar' : 'jornadas por revisar'}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4 text-[13px] text-right">
                    <div><p className="text-muted-foreground">Horas</p><p className="font-semibold text-foreground" data-testid="horas-mes">{horas(minutos)}</p></div>
                    <div><p className="text-muted-foreground">Jornadas</p><p className="font-semibold text-foreground">{resumen?.jornadas ?? 0}</p></div>
                    <div>
                      <p className="text-muted-foreground">Coste estimado</p>
                      <p className="font-semibold text-foreground">{tarifa != null ? formatEuro((minutos / 60) * tarifa) : '—'}</p>
                    </div>
                  </div>
                </div>
                {tarifa == null && minutos > 0 && (
                  <p className="mt-2 text-[12px] text-muted-foreground">Sin tarifa por hora: fíjala en Liquidaciones para ver el coste.</p>
                )}

                {jornadas.length > 0 && (
                  <button
                    onClick={() => setAbierta(desplegada ? null : id)}
                    aria-expanded={desplegada}
                    className="mt-3 text-[12px] font-semibold text-brand hover:underline"
                  >
                    {desplegada ? 'Ocultar jornadas' : `Ver ${jornadas.length} ${jornadas.length === 1 ? 'jornada' : 'jornadas'}`}
                  </button>
                )}
                {desplegada && (
                  <ul className="mt-3 divide-y divide-border border-t border-border">
                    {jornadas.map((j) => (
                      <FilaJornada key={j.id} jornada={j} cambios={datos.cambios[j.id] ?? []}
                        onGuardado={async () => { await recargar(); showToast('Jornada corregida'); }}
                        onError={showToast} />
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
          <p className="text-[12px] text-muted-foreground">
            Cada jornada cuenta en el mes en que empezó. Una jornada abierta no suma horas hasta que se cierra. El coste es orientativo, a la tarifa por hora actual.
          </p>
        </div>
      )}
      {toastMsg && <Toast message={toastMsg} onDismiss={dismissToast} />}
    </div>
  );
}

function FilaJornada({ jornada: j, cambios, onGuardado, onError }: {
  jornada: JornadaEquipo; cambios: CambioJornada[];
  onGuardado: () => Promise<void>; onError: (m: string) => void;
}) {
  const [editando, setEditando] = useState(false);
  const [historial, setHistorial] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const inicial = () => ({
    fechaEntrada: fmtFechaISO.format(new Date(j.checkInAt)), horaEntrada: hora(j.checkInAt),
    fechaSalida: j.checkOutAt ? fmtFechaISO.format(new Date(j.checkOutAt)) : fmtFechaISO.format(new Date(j.checkInAt)),
    horaSalida: j.checkOutAt ? hora(j.checkOutAt) : '', motivo: '',
  });
  const [f, setF] = useState(inicial);

  async function guardar() {
    const entrada = instanteEnEstudio(f.fechaEntrada, f.horaEntrada);
    const salida = f.horaSalida ? instanteEnEstudio(f.fechaSalida, f.horaSalida) : null;
    if (!entrada || (f.horaSalida && !salida)) { onError('Revisa la fecha y la hora'); return; }
    if (!f.motivo.trim()) { onError('Indica el motivo del cambio'); return; }
    const cambios: { checkInAt?: string; checkOutAt?: string } = {};
    if (Date.parse(entrada) !== Date.parse(j.checkInAt)) cambios.checkInAt = entrada;
    if (salida && (!j.checkOutAt || Date.parse(salida) !== Date.parse(j.checkOutAt))) cambios.checkOutAt = salida;
    if (!cambios.checkInAt && !cambios.checkOutAt) { setEditando(false); return; }
    setGuardando(true);
    const r = await corregirJornada(j.id, cambios, f.motivo.trim());
    setGuardando(false);
    if (!r.ok) { onError(r.error ?? 'No se pudo guardar'); return; }
    setEditando(false);
    await onGuardado();
  }

  return (
    <li className="py-3 text-[13px]" data-testid="jornada">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-foreground capitalize">{dia(j.checkInAt)}</span>
          <span className="text-muted-foreground">{hora(j.checkInAt)} – {j.checkOutAt ? hora(j.checkOutAt) : 'sin salida'}</span>
          {j.minutos != null && <span className="text-foreground">{horas(j.minutos)}</span>}
          {j.status === 'OPEN' && !j.requiereRevision && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700">Abierta</span>}
          {j.requiereRevision && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-700">Por revisar</span>}
          {j.corregida && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">Corregida</span>}
        </div>
        <div className="flex gap-2">
          {cambios.length > 0 && (
            <button onClick={() => setHistorial(!historial)} aria-expanded={historial} className="px-2.5 py-1 rounded-lg border border-border text-[12px] font-semibold hover:bg-muted">Historial</button>
          )}
          <button onClick={() => { setF(inicial()); setEditando(!editando); }} aria-expanded={editando} className="px-2.5 py-1 rounded-lg border border-border text-[12px] font-semibold hover:bg-muted">Corregir</button>
        </div>
      </div>

      {editando && (
        <div className="mt-3 grid gap-3 rounded-xl bg-muted/40 p-3 sm:grid-cols-2">
          <label className="grid gap-1 text-[12px] text-muted-foreground">Entrada
            <span className="flex gap-2">
              <input type="date" value={f.fechaEntrada} onChange={(e) => setF({ ...f, fechaEntrada: e.target.value })} className={inputCls} />
              <input type="time" aria-label="Hora de entrada" value={f.horaEntrada} onChange={(e) => setF({ ...f, horaEntrada: e.target.value })} className={inputCls} />
            </span>
          </label>
          <label className="grid gap-1 text-[12px] text-muted-foreground">Salida
            <span className="flex gap-2">
              <input type="date" value={f.fechaSalida} onChange={(e) => setF({ ...f, fechaSalida: e.target.value })} className={inputCls} />
              <input type="time" aria-label="Hora de salida" value={f.horaSalida} onChange={(e) => setF({ ...f, horaSalida: e.target.value })} className={inputCls} />
            </span>
          </label>
          <label className="grid gap-1 text-[12px] text-muted-foreground sm:col-span-2">Motivo (obligatorio)
            <input value={f.motivo} maxLength={300} onChange={(e) => setF({ ...f, motivo: e.target.value })} placeholder="Ej.: olvidó fichar la salida" className={inputCls + ' w-full'} />
          </label>
          <div className="flex gap-2 sm:col-span-2">
            <button onClick={() => void guardar()} disabled={guardando} className="px-3 py-1.5 rounded-lg bg-brand text-brand-foreground text-[12px] font-semibold hover:brightness-95 disabled:opacity-50">
              {guardando ? 'Guardando…' : 'Guardar corrección'}
            </button>
            <button onClick={() => setEditando(false)} className="px-3 py-1.5 rounded-lg border border-border text-[12px] font-semibold hover:bg-muted">Cancelar</button>
          </div>
        </div>
      )}

      {historial && (
        <ol className="mt-3 space-y-1.5 rounded-xl bg-muted/40 p-3 text-[12px]" data-testid="historial-jornada">
          {cambios.map((c, i) => (
            <li key={i} className="text-muted-foreground">
              <span className="text-foreground">{dia(c.en)} {hora(c.en)}</span>
              {' · '}{ACCION[c.accion]}{c.por ? ` por ${c.por}` : ''}
              {c.accion === 'EDITED' && c.campo && (
                <> · {CAMPO[c.campo] ?? c.campo}: {valor(c.campo, c.antes)} → {valor(c.campo, c.despues)}</>
              )}
              {c.motivo && <> · «{c.motivo}»</>}
            </li>
          ))}
        </ol>
      )}
    </li>
  );
}

function valor(campo: string, v: string | null): string {
  if (v == null) return 'vacío';
  if (campo === 'status') return v === 'CLOSED' ? 'cerrada' : v === 'OPEN' ? 'abierta' : v;
  const t = Date.parse(v);
  return Number.isNaN(t) ? v : `${dia(v)} ${hora(v)}`;
}
