'use client';

// «Equipo → Tiempo trabajado»: lo que han fichado las instructoras desde la app
// del estudio, mes a mes, y si dieron cada clase. Corregir una jornada o una
// clase exige un motivo y deja rastro del valor anterior y el nuevo; aquí solo se
// pinta lo que el servidor confirma.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useStudio } from '@/lib/studio-context';
import { useRol } from '@/lib/permisos';
import { puedeGestionarEquipo } from '@/lib/permisos-reglas';
import { PageHeader } from '@/components/ui/page-header';
import { AvisoControlHorario } from '@/components/equipo/aviso-control-horario';
import { Toast, useToast } from '@/components/ui/toast';
import {
  corregirClasesEquipo, corregirJornada, fetchClasesDelMes, fetchTiempoTrabajado, leerTarifasEquipo, marcarClaseRevisada,
  type ClasesDelMes, type TarifaInstructor, type TiempoTrabajadoMes,
} from '@/lib/api-client';
import type { CambioJornada, JornadaEquipo } from '@/lib/fichaje/jornadas-equipo';
import type { CambioClase, ClaseEquipo } from '@/lib/fichaje/clases-equipo';
import { csvClases, csvJornadas, nombreCsvClases, nombreCsvJornadas } from '@/lib/fichaje/csv-jornadas';
import { descargarBlob } from '@/lib/descargar-blob';
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
  const [tarifasLeidas, setTarifasLeidas] = useState(false);
  // `null` = no se han podido leer: la parte de clases no se pinta, las jornadas sí.
  const [clases, setClases] = useState<ClasesDelMes | null>(null);
  const [abierta, setAbierta] = useState<{ id: string; que: 'jornadas' | 'clases' } | null>(null);

  const recargar = useCallback(async () => {
    const [d, c] = await Promise.all([fetchTiempoTrabajado(anio, mes), fetchClasesDelMes(anio, mes)]);
    setDatos(d);
    setClases(c);
    setError(d === null);
  }, [anio, mes]);

  useEffect(() => {
    let vivo = true;
    Promise.all([fetchTiempoTrabajado(anio, mes), leerTarifasEquipo(), fetchClasesDelMes(anio, mes)]).then(([d, tar, c]) => {
      if (!vivo) return;
      setDatos(d);
      setClases(c);
      setError(d === null);
      setTarifas(Object.fromEntries((tar ?? []).map((t) => [t.instructorId, t])));
      setTarifasLeidas(tar !== null);
    });
    return () => { vivo = false; };
  }, [anio, mes]);

  const nombre = useMemo(() => new Map(instructores.map((i) => [i.id, i.nombre])), [instructores]);
  const filas = useMemo(() => {
    if (!datos) return [];
    const ids = new Set([
      ...instructores.filter((i) => i.activo && i.rol === 'INSTRUCTOR').map((i) => i.id),
      ...datos.resumen.map((r) => r.instructorId),
      ...(clases?.resumen ?? []).map((r) => r.instructorId),
    ]);
    const porId = new Map(datos.resumen.map((r) => [r.instructorId, r]));
    const clasesPorId = new Map((clases?.resumen ?? []).map((r) => [r.instructorId, r]));
    return [...ids]
      .map((id) => ({
        id, resumen: porId.get(id), jornadas: datos.jornadas.filter((j) => j.instructorId === id),
        resumenClases: clasesPorId.get(id), susClases: (clases?.clases ?? []).filter((c) => c.instructorId === id),
      }))
      .sort((a, b) => (b.resumen?.minutos ?? 0) - (a.resumen?.minutos ?? 0) || (b.resumenClases?.dadas ?? 0) - (a.resumenClases?.dadas ?? 0));
  }, [datos, clases, instructores]);

  async function darPorDadas(instructorId: string, pendientes: ClaseEquipo[]) {
    const motivo = window.prompt(
      `Vas a dar por dadas, a su hora, ${pendientes.length === 1 ? 'la clase sin confirmar' : `las ${pendientes.length} clases sin confirmar`} de ${nombre.get(instructorId) ?? 'esta instructora'}. Motivo (queda en el historial):`,
      'Las dio a su hora',
    );
    if (motivo === null) return;
    if (!motivo.trim()) { showToast('Indica el motivo del cambio'); return; }
    const r = await corregirClasesEquipo(pendientes.map((c) => ({ sesionId: c.sesionId, estado: 'DADA' as const })), motivo.trim());
    if (!r.ok) { showToast(r.error ?? 'No se pudo guardar'); return; }
    await recargar();
    showToast(pendientes.length === 1 ? 'Clase dada por buena' : 'Clases dadas por buenas');
  }

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
        description="Las jornadas que fichan tus instructoras y las clases que dan, desde la app del estudio. Corregir algo deja constancia del motivo."
        back={{ href: '/equipo', label: 'Volver a Equipo' }}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <select aria-label="Mes" value={mes} onChange={(e) => setMes(Number(e.target.value))} className={inputCls}>
              {MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
            <select aria-label="Año" value={anio} onChange={(e) => setAnio(Number(e.target.value))} className={inputCls}>
              {[ahora.getFullYear() - 1, ahora.getFullYear()].map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
            <button
              onClick={() => datos && descargarBlob(
                new Blob([csvJornadas(datos.jornadas, (id) => nombre.get(id) ?? 'Instructora')], { type: 'text/csv;charset=utf-8' }),
                nombreCsvJornadas(anio, mes),
              )}
              disabled={!datos || datos.jornadas.length === 0}
              title={datos && datos.jornadas.length === 0 ? 'No hay jornadas este mes' : undefined}
              className="px-3 py-1.5 rounded-lg border border-border text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-50"
            >
              CSV jornadas
            </button>
            <button
              onClick={() => clases && descargarBlob(
                new Blob([csvClases(clases.clases, (id) => nombre.get(id) ?? 'Instructora')], { type: 'text/csv;charset=utf-8' }),
                nombreCsvClases(anio, mes),
              )}
              disabled={!clases || clases.clases.length === 0}
              title={clases && clases.clases.length === 0 ? 'No hay clases este mes' : undefined}
              className="px-3 py-1.5 rounded-lg border border-border text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-50"
            >
              CSV clases
            </button>
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
          {tarifasLeidas && (
            <AvisoControlHorario pendientes={instructores
              .filter((i) => i.activo && i.rol === 'INSTRUCTOR' && !tarifas[i.id]?.relacionLaboral)
              .map((i) => ({ id: i.id, nombre: i.nombre }))} />
          )}
          {datos.jornadas.length === 0 && (clases?.clases.length ?? 0) === 0 && (
            <div className="rounded-2xl border border-dashed border-border bg-card p-5 text-[13px]" data-testid="tiempo-vacio">
              <p className="font-semibold text-foreground">Todavía no hay nada de {MESES[mes - 1]}.</p>
              <p className="mt-1 text-muted-foreground">
                Aquí verás dos cosas, las dos desde la app del estudio: las <strong>jornadas</strong> que fichan tus
                instructoras contratadas (entrada al llegar, salida al irse) y las <strong>clases</strong> que da cada una,
                que empiezan con «Empezar clase» o al pasar lista.
              </p>
            </div>
          )}
          {filas.map(({ id, resumen, jornadas, resumenClases, susClases }) => {
            const tarifa = tarifas[id]?.tarifaHora;
            const relacion = tarifas[id]?.relacionLaboral ?? null;
            // La autónoma no ficha: sus horas son las de las clases que dio.
            const minutos = relacion === 'AUTONOMA' ? (resumenClases?.minutosDados ?? 0) : (resumen?.minutos ?? 0);
            const verJornadas = abierta?.id === id && abierta.que === 'jornadas';
            const verClases = abierta?.id === id && abierta.que === 'clases';
            const sinConfirmar = susClases.filter((c) => c.estado === 'SIN_CONFIRMAR');
            return (
              <div key={id} className="rounded-2xl border border-border bg-card p-5" data-testid="tiempo-instructora">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 className="text-[14px] font-semibold text-foreground">{nombre.get(id) ?? 'Instructora'}</h2>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {/* «Ahora» solo si la abierta es de verdad actual: una olvidada hace
                          días ya sale como «por revisar», no como fichada. */}
                      {jornadas.some((j) => j.status === 'OPEN' && !j.requiereRevision) && (
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700">Fichada ahora</span>
                      )}
                      {(resumen?.aRevisar ?? 0) > 0 && (
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-700">
                          {resumen!.aRevisar} {resumen!.aRevisar === 1 ? 'jornada por revisar' : 'jornadas por revisar'}
                        </span>
                      )}
                      {relacion && (
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                          {relacion === 'AUTONOMA' ? 'Autónoma' : 'Contratada'}
                        </span>
                      )}
                      {sinConfirmar.length > 0 && (
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-700" data-testid="chip-sin-confirmar">
                          {sinConfirmar.length === 1 ? '1 clase sin confirmar' : `${sinConfirmar.length} clases sin confirmar`}
                        </span>
                      )}
                      {(resumenClases?.noDadasPorRevisar ?? 0) > 0 && (
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-700">
                          {resumenClases!.noDadasPorRevisar === 1 ? '1 clase que dijo no dar' : `${resumenClases!.noDadasPorRevisar} clases que dijo no dar`}
                        </span>
                      )}
                      {(resumenClases?.fueraDeJornada ?? 0) > 0 && (
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-700">
                          {resumenClases!.fueraDeJornada === 1 ? '1 clase fuera de jornada' : `${resumenClases!.fueraDeJornada} clases fuera de jornada`}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4 text-[13px] sm:text-right">
                    <div>
                      <p className="text-muted-foreground">{relacion === 'AUTONOMA' ? 'Horas de clase' : 'Horas'}</p>
                      <p className="font-semibold text-foreground whitespace-nowrap" data-testid="horas-mes">{horas(minutos)}</p>
                    </div>
                    {relacion === 'AUTONOMA' || !clases ? (
                      <div><p className="text-muted-foreground">{relacion === 'AUTONOMA' ? 'Clases dadas' : 'Jornadas'}</p><p className="font-semibold text-foreground">{relacion === 'AUTONOMA' ? (resumenClases?.dadas ?? 0) : (resumen?.jornadas ?? 0)}</p></div>
                    ) : (
                      <div><p className="text-muted-foreground">Jornadas · clases</p><p className="font-semibold text-foreground">{resumen?.jornadas ?? 0} · {resumenClases?.dadas ?? 0}</p></div>
                    )}
                    <div>
                      <p className="text-muted-foreground" title="Horas cerradas del mes × tarifa por hora actual">Coste</p>
                      <p className="font-semibold text-foreground">{tarifa != null ? formatEuro((minutos / 60) * tarifa) : '—'}</p>
                    </div>
                  </div>
                </div>
                {tarifa == null && minutos > 0 && (
                  <p className="mt-2 text-[12px] text-muted-foreground">Sin tarifa por hora: fíjala en Liquidaciones para ver el coste.</p>
                )}

                {sinConfirmar.length > 0 && (
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-amber-500/10 px-3 py-2 text-[12px]" data-testid="aviso-sin-confirmar">
                    <p className="text-foreground">
                      {sinConfirmar.length === 1
                        ? 'Una clase terminó sin que la empezara en la app ni pasara lista.'
                        : `${sinConfirmar.length} clases terminaron sin que las empezara en la app ni pasara lista.`}
                      {' '}Hasta confirmarlo no se puede cerrar su liquidación. Ella también puede confirmarlo desde su app.
                    </p>
                    <button onClick={() => void darPorDadas(id, sinConfirmar)} className="px-2.5 py-1 rounded-lg border border-border bg-card text-[12px] font-semibold hover:bg-muted">
                      {sinConfirmar.length === 1 ? 'Dar por dada' : `Dar por dadas las ${sinConfirmar.length}`}
                    </button>
                  </div>
                )}

                <div className="mt-3 flex flex-wrap gap-4">
                  {jornadas.length > 0 && (
                    <button
                      onClick={() => setAbierta(verJornadas ? null : { id, que: 'jornadas' })}
                      aria-expanded={verJornadas}
                      className="text-[12px] font-semibold text-brand hover:underline"
                    >
                      {verJornadas ? 'Ocultar jornadas' : `Ver ${jornadas.length} ${jornadas.length === 1 ? 'jornada' : 'jornadas'}`}
                    </button>
                  )}
                  {susClases.length > 0 && (
                    <button
                      onClick={() => setAbierta(verClases ? null : { id, que: 'clases' })}
                      aria-expanded={verClases}
                      className="text-[12px] font-semibold text-brand hover:underline"
                    >
                      {verClases ? 'Ocultar clases' : `Ver ${susClases.length} ${susClases.length === 1 ? 'clase' : 'clases'}`}
                    </button>
                  )}
                </div>
                {verClases && clases && (
                  <ul className="mt-3 divide-y divide-border border-t border-border">
                    {susClases.map((c) => (
                      <FilaClase key={c.sesionId} clase={c} cambios={clases.cambios[c.sesionId] ?? []}
                        onGuardado={async (texto) => { await recargar(); showToast(texto); }}
                        onError={showToast} />
                    ))}
                  </ul>
                )}
                {verJornadas && (
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
          <details className="rounded-2xl border border-border bg-card px-5 py-3 text-[13px]" data-testid="tiempo-como-funciona">
            <summary className="cursor-pointer font-semibold text-foreground">¿Cómo funciona?</summary>
            <ul className="mt-2 mb-1 list-disc space-y-1.5 pl-5 text-muted-foreground">
              <li>Cada instructora ficha desde la app del estudio (Hoy → Fichaje): la entrada al llegar y la salida al irse. Si trabaja mañana y tarde, son dos jornadas.</li>
              <li>Las horas de una jornada solo cuentan cuando se cierra. Cada jornada cuenta en el mes en que empezó.</li>
              <li><strong>Por revisar</strong>: lleva abierta más horas de las normales, casi siempre porque olvidó fichar la salida. Corrígela con la hora real; el motivo es obligatorio y queda en el historial, con quién lo cambió.</li>
              <li><strong>Clases</strong>: la instructora empieza cada clase en la app («Empezar clase») o pasa lista. Termina sola a su hora. Si se le olvida, la app le pregunta después si la dio. Las contratadas que la dan dentro de su jornada no tienen que hacer nada.</li>
              <li><strong>Sin confirmar</strong>: terminó sin saberse si la dio. Se paga por su horario, pero no se puede confirmar su liquidación hasta que ella lo diga o la des por dada aquí.</li>
              <li><strong>Dijo no darla</strong>: no se paga. Mira quién la dio y márcala como revisada; si sí la dio, corrígela.</li>
              <li><strong>Fuera de jornada</strong>: una contratada dio la clase sin tener la jornada abierta. Corrige su jornada para que el registro cuadre.</li>
              <li>Las <strong>autónomas</strong> no fichan jornada: sus horas son las de las clases que dan. La relación de cada una se elige en Liquidaciones.</li>
              <li>El <strong>coste</strong> es orientativo: horas por la tarifa por hora actual. Lo que se paga lo decide Liquidaciones.</li>
              <li><strong>CSV jornadas</strong> descarga el registro de jornada del mes, para la gestoría o una inspección; <strong>CSV clases</strong>, las clases con su hora real.</li>
            </ul>
          </details>
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
          {!j.checkOutAt && (
            <p className="text-[12px] text-muted-foreground sm:col-span-2" data-testid="ayuda-correccion">
              Pon la hora a la que se fue de verdad. Al guardar, la jornada queda cerrada y sus horas cuentan en el mes.
            </p>
          )}
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

const ESTADO_CLASE: Partial<Record<ClaseEquipo['estado'], { texto: string; tono: string }>> = {
  DADA: { texto: 'Dada', tono: 'bg-emerald-500/15 text-emerald-700' },
  EN_CURSO: { texto: 'En curso', tono: 'bg-emerald-500/15 text-emerald-700' },
  EMPEZABLE: { texto: 'Sin empezar', tono: 'bg-muted text-muted-foreground' },
  NO_DADA: { texto: 'Dijo no darla', tono: 'bg-amber-500/15 text-amber-700' },
  SIN_CONFIRMAR: { texto: 'Sin confirmar', tono: 'bg-amber-500/15 text-amber-700' },
  PREVIA: { texto: 'Antes del control de clases', tono: 'bg-muted text-muted-foreground' },
};
const COMO: Record<NonNullable<ClaseEquipo['origen']>, string> = {
  BOTON: 'la empezó en la app', LISTA: 'pasó lista', CONFIRMACION: 'la confirmó después', PROPIETARIA: 'corregida por el estudio',
};
const ACCION_CLASE: Record<CambioClase['accion'], string> = {
  EMPEZADA: 'La empezó', DADA_POR_LISTA: 'Pasó lista', CONFIRMADA: 'Confirmó que la dio', NO_DADA: 'Dijo que no la dio',
  FIN_CAMBIADO: 'Cambió la hora de fin', CORREGIDA: 'Corregida', REVISADA: 'Marcada como revisada',
};

function FilaClase({ clase: c, cambios, onGuardado, onError }: {
  clase: ClaseEquipo; cambios: CambioClase[];
  onGuardado: (texto: string) => Promise<void>; onError: (m: string) => void;
}) {
  const [editando, setEditando] = useState(false);
  const [historial, setHistorial] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const inicial = () => ({
    como: (c.estado === 'NO_DADA' ? 'NO_DADA' : c.finReal || (c.inicioReal && c.retrasoMin > 0) ? 'OTRO' : 'A_SU_HORA') as 'A_SU_HORA' | 'OTRO' | 'NO_DADA',
    inicio: hora(c.inicioReal ?? c.inicio), fin: hora(c.finReal ?? c.fin), motivo: '',
  });
  const [f, setF] = useState(inicial);
  const estado = ESTADO_CLASE[c.estado];
  const puedeCorregir = c.estado !== 'EMPEZABLE' && c.estado !== 'EN_CURSO';

  async function guardar() {
    if (!f.motivo.trim()) { onError('Indica el motivo del cambio'); return; }
    let item: { sesionId: string; estado: 'DADA' | 'NO_DADA'; inicio?: string; fin?: string } = { sesionId: c.sesionId, estado: 'DADA' };
    if (f.como === 'NO_DADA') item = { sesionId: c.sesionId, estado: 'NO_DADA' };
    if (f.como === 'OTRO') {
      const fecha = fmtFechaISO.format(new Date(c.inicio));
      const inicio = instanteEnEstudio(fecha, f.inicio);
      const fin = instanteEnEstudio(fecha, f.fin);
      if (!inicio || !fin) { onError('Revisa las horas'); return; }
      item = { sesionId: c.sesionId, estado: 'DADA', inicio, fin };
    }
    setGuardando(true);
    const r = await corregirClasesEquipo([item], f.motivo.trim());
    setGuardando(false);
    if (!r.ok) { onError(r.error ?? 'No se pudo guardar'); return; }
    setEditando(false);
    await onGuardado('Clase corregida');
  }

  async function revisar() {
    setGuardando(true);
    const r = await marcarClaseRevisada(c.sesionId);
    setGuardando(false);
    if (!r.ok) { onError(r.error ?? 'No se pudo guardar'); return; }
    await onGuardado('Marcada como revisada');
  }

  const detalle: string[] = [];
  if (c.estado === 'DADA' || c.estado === 'EN_CURSO') {
    if (c.porJornada) detalle.push('dentro de su jornada');
    else if (c.origen) detalle.push(COMO[c.origen]);
    if (c.retrasoMin > 0) detalle.push(`empezó ${c.retrasoMin} min tarde`);
    if (c.finReal && c.inicioReal) detalle.push(`de ${hora(c.inicioReal)} a ${hora(c.finReal)}`);
  }

  return (
    <li className="py-3 text-[13px]" data-testid="clase-mes">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="font-semibold text-foreground capitalize">{dia(c.inicio)}</span>
          <span className="text-muted-foreground">{hora(c.inicio)} – {hora(c.fin)}</span>
          <span className="text-foreground">{c.nombre}</span>
          {estado && <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${estado.tono}`}>{estado.texto}</span>}
          {c.fueraDeJornada && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-700">Fuera de jornada</span>}
          {c.estado === 'NO_DADA' && c.revisada && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">Revisada</span>}
        </div>
        <div className="flex gap-2">
          {cambios.length > 0 && (
            <button onClick={() => setHistorial(!historial)} aria-expanded={historial} className="px-2.5 py-1 rounded-lg border border-border text-[12px] font-semibold hover:bg-muted">Historial</button>
          )}
          {c.estado === 'NO_DADA' && !c.revisada && (
            <button onClick={() => void revisar()} disabled={guardando} className="px-2.5 py-1 rounded-lg border border-border text-[12px] font-semibold hover:bg-muted disabled:opacity-50">Revisada</button>
          )}
          {puedeCorregir && (
            <button onClick={() => { setF(inicial()); setEditando(!editando); }} aria-expanded={editando} className="px-2.5 py-1 rounded-lg border border-border text-[12px] font-semibold hover:bg-muted">Corregir</button>
          )}
        </div>
      </div>
      {detalle.length > 0 && <p className="mt-1 text-[12px] text-muted-foreground">{detalle.join(' · ')}</p>}
      {c.estado === 'NO_DADA' && !c.revisada && (
        <p className="mt-1 text-[12px] text-muted-foreground">No se le paga. Comprueba quién la dio; si sí la dio, corrígela.</p>
      )}

      {editando && (
        <div className="mt-3 grid gap-3 rounded-xl bg-muted/40 p-3" data-testid="corregir-clase">
          <fieldset className="flex flex-wrap gap-x-4 gap-y-2 text-[12px] text-foreground">
            <legend className="sr-only">¿La dio?</legend>
            {([['A_SU_HORA', 'La dio a su hora'], ['OTRO', 'La dio con otro horario'], ['NO_DADA', 'No la dio']] as const).map(([v, t]) => (
              <label key={v} className="flex items-center gap-1.5">
                <input type="radio" name={`como-${c.sesionId}`} checked={f.como === v} onChange={() => setF({ ...f, como: v })} />{t}
              </label>
            ))}
          </fieldset>
          {f.como === 'OTRO' && (
            <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground">
              De <input type="time" aria-label="Hora a la que empezó" value={f.inicio} onChange={(e) => setF({ ...f, inicio: e.target.value })} className={inputCls} />
              a <input type="time" aria-label="Hora a la que terminó" value={f.fin} onChange={(e) => setF({ ...f, fin: e.target.value })} className={inputCls} />
            </div>
          )}
          <label className="grid gap-1 text-[12px] text-muted-foreground">Motivo (obligatorio)
            <input value={f.motivo} maxLength={300} onChange={(e) => setF({ ...f, motivo: e.target.value })} placeholder="Ej.: la dio, se le olvidó empezarla" className={inputCls + ' w-full'} />
          </label>
          <div className="flex gap-2">
            <button onClick={() => void guardar()} disabled={guardando} className="px-3 py-1.5 rounded-lg bg-brand text-brand-foreground text-[12px] font-semibold hover:brightness-95 disabled:opacity-50">
              {guardando ? 'Guardando…' : 'Guardar corrección'}
            </button>
            <button onClick={() => setEditando(false)} className="px-3 py-1.5 rounded-lg border border-border text-[12px] font-semibold hover:bg-muted">Cancelar</button>
          </div>
        </div>
      )}

      {historial && (
        <ol className="mt-3 space-y-1.5 rounded-xl bg-muted/40 p-3 text-[12px]" data-testid="historial-clase">
          {cambios.map((x, i) => (
            <li key={i} className="text-muted-foreground">
              <span className="text-foreground">{dia(x.en)} {hora(x.en)}</span>
              {' · '}{ACCION_CLASE[x.accion]}{x.por ? ` por ${x.por}` : ''}
              {x.accion === 'CORREGIDA' && x.antes && x.despues && <> · {x.antes} → {x.despues}</>}
              {x.accion === 'FIN_CAMBIADO' && x.despues && <> · terminó a las {hora(x.despues)}</>}
              {x.accion === 'CONFIRMADA' && x.despues && <> · de {x.despues.split(' → ').map(hora).join(' a ')}</>}
              {x.motivo && <> · «{x.motivo}»</>}
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
