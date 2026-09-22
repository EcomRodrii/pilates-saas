'use client';

// Fila 11 del informe estratégico: "La nómina de instructoras genera
// conflictos" → liquidación desglosada y transparente. NO mueve dinero real
// — genera un documento (BORRADOR→CONFIRMADA→PAGADA) que explica cuánto se
// le debe a cada instructora y por qué. El pago sigue haciéndose fuera de
// Tentare; aquí solo se anota que se pagó.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useStudio } from '@/lib/studio-context';
import { useRol } from '@/lib/permisos';
import { puedeGestionarEquipo } from '@/lib/permisos-reglas';
import { AvisoControlHorario } from '@/components/equipo/aviso-control-horario';
import { PageHeader } from '@/components/ui/page-header';
import { Toast, useToast } from '@/components/ui/toast';
import {
  leerTarifasEquipo, actualizarTarifaInstructor, fetchLiquidaciones, generarLiquidacion,
  transicionarLiquidacion, fetchTiempoTrabajado, fetchModoLiquidacion, guardarModoLiquidacion, guardarRelacionLaboral,
  type TarifaInstructor, type Liquidacion, type ModoLiquidacion,
} from '@/lib/api-client';
import { formatEuro } from '@/lib/utils';
import type { Instructor } from '@/lib/types';
import { ProfileAvatar } from '@/components/ui/profile-avatar';
import { AlertTriangle, ChevronLeft, ChevronRight, Info, RefreshCw, SlidersHorizontal } from 'lucide-react';

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];


export default function LiquidacionesPage() {
  const rol = useRol();
  const { instructores } = useStudio();
  const { message: toastMsg, show: showToast, dismiss: dismissToast } = useToast();

  const ahora = useMemo(() => new Date(), []);
  const [anio, setAnio] = useState(ahora.getFullYear());
  const [mes, setMes] = useState(ahora.getMonth() + 1);

  const [tarifas, setTarifas] = useState<Record<string, TarifaInstructor>>({});
  // Sin poder leer las tarifas no sabemos quién tiene relación: el aviso se calla.
  const [tarifasLeidas, setTarifasLeidas] = useState(false);
  const [liquidaciones, setLiquidaciones] = useState<Record<string, Liquidacion>>({});
  // Minutos fichados por instructora en el mes. `null` = no se pudo leer: no se
  // pinta nada antes que un «0 h» que no es verdad.
  const [fichado, setFichado] = useState<Map<string, number> | null>(null);
  // Con qué calcula el estudio la parte variable. `null` = no se sabe todavía.
  const [criterio, setCriterio] = useState<{ modo: ModoLiquidacion; pagarDuracionReal: boolean; puedeCambiar: boolean } | null>(null);
  const [guardandoCriterio, setGuardandoCriterio] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [procesandoId, setProcesandoId] = useState<string | null>(null);

  const activos = useMemo(() => instructores.filter(i => i.activo && i.rol === 'INSTRUCTOR'), [instructores]);

  useEffect(() => {
    let vivo = true;
    fetchModoLiquidacion().then(c => { if (vivo) setCriterio(c); });
    return () => { vivo = false; };
  }, []);

  async function cambiarCriterio(modo: ModoLiquidacion) {
    if (!criterio || modo === criterio.modo || guardandoCriterio) return;
    const texto = modo === 'HORAS_FICHADAS'
      ? 'A partir de ahora, los borradores pagarán las horas fichadas (jornadas cerradas) × tarifa por hora, sin recargo de sustitución. Las liquidaciones confirmadas o pagadas no cambian. ¿Seguimos?'
      : 'A partir de ahora, los borradores volverán a pagar las horas de clase × tarifa por hora. Las liquidaciones confirmadas o pagadas no cambian. ¿Seguimos?';
    if (!window.confirm(texto)) return;
    setGuardandoCriterio(true);
    const r = await guardarModoLiquidacion({ modo });
    setGuardandoCriterio(false);
    if (!r.ok) { showToast(r.error ?? 'No se pudo guardar'); return; }
    setCriterio({ ...criterio, modo });
    showToast('Criterio guardado. Recalcula los borradores de este mes para aplicarlo.');
  }

  async function cambiarDuracionReal(pagarDuracionReal: boolean) {
    if (!criterio || guardandoCriterio) return;
    const texto = pagarDuracionReal
      ? 'A partir de ahora, cada clase dada se pagará por lo que duró de verdad: si empezó 10 min tarde o acabó antes, se paga menos. Las liquidaciones confirmadas o pagadas no cambian. ¿Seguimos?'
      : 'A partir de ahora, cada clase dada se pagará por su horario entero, aunque empezara tarde o acabara antes. Las liquidaciones confirmadas o pagadas no cambian. ¿Seguimos?';
    if (!window.confirm(texto)) return;
    setGuardandoCriterio(true);
    const r = await guardarModoLiquidacion({ pagarDuracionReal });
    setGuardandoCriterio(false);
    if (!r.ok) { showToast(r.error ?? 'No se pudo guardar'); return; }
    setCriterio({ ...criterio, pagarDuracionReal });
    showToast('Criterio guardado. Recalcula los borradores de este mes para aplicarlo.');
  }

  useEffect(() => {
    let vivo = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCargando(true);
    Promise.all([leerTarifasEquipo(), fetchLiquidaciones(anio, mes), fetchTiempoTrabajado(anio, mes)]).then(([tar, liq, tiempo]) => {
      if (!vivo) return;
      setFichado(tiempo ? new Map(tiempo.resumen.map(r => [r.instructorId, r.minutos])) : null);
      setTarifas(Object.fromEntries((tar ?? []).map(t => [t.instructorId, t])));
      setTarifasLeidas(tar !== null);
      setLiquidaciones(Object.fromEntries(liq.map(l => [l.instructorId, l])));
      setCargando(false);
    });
    return () => { vivo = false; };
  }, [anio, mes]);

  async function handleGenerar(instructorId: string) {
    setProcesandoId(instructorId);
    const r = await generarLiquidacion(instructorId, anio, mes);
    setProcesandoId(null);
    if (r.ok && r.item) {
      setLiquidaciones(prev => ({ ...prev, [instructorId]: r.item! }));
    } else {
      showToast(r.error ?? 'No se pudo generar la liquidación');
    }
  }

  async function handleTransicion(liq: Liquidacion, accion: 'confirmar' | 'marcar_pagada') {
    let referenciaPago: string | undefined;
    if (accion === 'marcar_pagada') {
      referenciaPago = window.prompt('Referencia del pago (opcional): transferencia, Bizum, fecha...') ?? undefined;
    }
    setProcesandoId(liq.instructorId);
    const r = await transicionarLiquidacion(liq.id, accion, referenciaPago);
    setProcesandoId(null);
    if (r.ok && r.item) {
      setLiquidaciones(prev => ({ ...prev, [liq.instructorId]: r.item! }));
    } else {
      showToast(r.error ?? 'No se pudo actualizar la liquidación');
    }
  }

  async function handleGuardarTarifa(instructorId: string, campo: 'tarifaHora' | 'baseMensualEur' | 'recargoSustitucionPct', valor: string) {
    const actual = tarifas[instructorId];
    const n = valor.trim() === '' ? null : Number(valor);
    if (n !== null && !Number.isFinite(n)) return;
    const base: TarifaInstructor = actual ?? { instructorId, tarifaHora: null, baseMensualEur: null, recargoSustitucionPct: null };
    const siguiente: TarifaInstructor = { ...base, [campo]: n };
    // 44ª pasada de auditoría, hallazgo #4: antes esto se escribía optimista
    // ANTES de confirmar el PATCH, sin revertir si fallaba (rol sin permiso,
    // red caída). Ahora solo se refleja en el estado tras la confirmación
    // real del servidor.
    const r = await actualizarTarifaInstructor(instructorId, siguiente.tarifaHora, {
      baseMensualEur: siguiente.baseMensualEur, recargoSustitucionPct: siguiente.recargoSustitucionPct,
    });
    if (r.ok) {
      setTarifas(prev => ({ ...prev, [instructorId]: siguiente }));
    } else {
      showToast(r.error ?? 'No se pudo guardar');
    }
  }

  async function handleRelacion(instructorId: string, valor: string) {
    const relacion = valor === 'CONTRATADA' || valor === 'AUTONOMA' ? valor : null;
    const r = await guardarRelacionLaboral(instructorId, relacion);
    if (!r.ok) { showToast(r.error ?? 'No se pudo guardar'); return; }
    setTarifas(prev => ({
      ...prev,
      [instructorId]: { ...(prev[instructorId] ?? { instructorId, tarifaHora: null, baseMensualEur: null, recargoSustitucionPct: null, horasSemanalesContrato: null }), relacionLaboral: relacion },
    }));
    showToast(relacion === 'AUTONOMA'
      ? 'Guardado: como autónoma no fichará jornada, confirmará sus clases.'
      : relacion === 'CONTRATADA' ? 'Guardado: como contratada fichará su jornada.' : 'Guardado.');
  }

  if (!puedeGestionarEquipo(rol)) {
    return (
      <div className="space-y-5">
        <PageHeader title="Liquidaciones" back={{ href: '/equipo', label: 'Volver a Equipo' }} />
        <p className="text-sm text-muted-foreground">No tienes permiso para ver esta pantalla.</p>
      </div>
    );
  }

  const irMes = (delta: number) => {
    const d = new Date(anio, mes - 1 + delta, 1);
    setAnio(d.getFullYear());
    setMes(d.getMonth() + 1);
  };
  const lista = activos.map(i => liquidaciones[i.id]).filter((l): l is Liquidacion => !!l);
  const resumen = {
    total: lista.reduce((a, l) => a + l.totalEur, 0),
    borradores: lista.filter(l => l.estado === 'BORRADOR').length,
    confirmadas: lista.filter(l => l.estado === 'CONFIRMADA').length,
    pagadas: lista.filter(l => l.estado === 'PAGADA').length,
    sinGenerar: activos.length - lista.length,
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Liquidaciones de instructoras"
        description="Lo que le corresponde a cada instructora este mes, desglosado. El pago lo haces tú, fuera de Tentare; aquí queda anotado."
        back={{ href: '/equipo', label: 'Volver a Equipo' }}
        actions={
          <div className="flex items-center gap-1 rounded-xl border border-border bg-card p-1" data-testid="selector-mes">
            <button onClick={() => irMes(-1)} aria-label="Mes anterior" className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
              <ChevronLeft size={16} />
            </button>
            <span className="min-w-[132px] text-center text-sm font-semibold capitalize text-foreground">{MESES[mes - 1]} {anio}</span>
            <button onClick={() => irMes(1)} aria-label="Mes siguiente" className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
              <ChevronRight size={16} />
            </button>
          </div>
        }
      />

      {!cargando && activos.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="resumen-mes">
          <Cifra etiqueta={`Total de ${MESES[mes - 1]}`} valor={lista.length ? formatEuro(resumen.total) : '—'} sub={lista.length ? `${lista.length} de ${activos.length} generadas` : 'sin generar todavía'} fuerte />
          <Cifra etiqueta="Por confirmar" valor={String(resumen.borradores)} sub="borradores" />
          <Cifra etiqueta="Por pagar" valor={String(resumen.confirmadas)} sub="confirmadas" />
          <Cifra etiqueta="Pagadas" valor={String(resumen.pagadas)} sub={resumen.sinGenerar > 0 ? `${resumen.sinGenerar} sin generar` : 'todo generado'} />
        </div>
      )}

      {tarifasLeidas && (
        <AvisoControlHorario enLiquidaciones
          pendientes={activos.filter(i => !tarifas[i.id]?.relacionLaboral).map(i => ({ id: i.id, nombre: i.nombre }))} />
      )}

      {criterio && (
        <section className="rounded-2xl border border-border bg-card p-5" data-testid="criterio-liquidacion" aria-labelledby="como-se-calcula">
          <h2 id="como-se-calcula" className="text-[13px] font-semibold text-foreground">Cómo se calcula</h2>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-[12px] text-muted-foreground">Parte variable</p>
              {criterio.puedeCambiar ? (
                <select aria-label="Calcular la parte variable por" value={criterio.modo} disabled={guardandoCriterio}
                  onChange={e => void cambiarCriterio(e.target.value as ModoLiquidacion)} className={campoCls + ' mt-1 w-full sm:w-auto'}>
                  <option value="CLASES">Por horas de clase</option>
                  <option value="HORAS_FICHADAS">Por horas fichadas</option>
                </select>
              ) : (
                <p className="mt-1 text-sm font-semibold text-foreground">{criterio.modo === 'HORAS_FICHADAS' ? 'Por horas fichadas' : 'Por horas de clase'}</p>
              )}
              <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">
                {criterio.modo === 'HORAS_FICHADAS'
                  ? 'Horas de jornadas cerradas × tarifa por hora. Sin recargo de sustitución: esas horas ya están en lo fichado.'
                  : 'Horas de cada clase dada × tarifa por hora, con recargo en las sustituciones.'}
              </p>
            </div>
            <div data-testid="criterio-duracion">
              <p className="text-[12px] text-muted-foreground">Cada clase dada se paga por</p>
              {criterio.puedeCambiar ? (
                <select aria-label="Pagar cada clase por" value={criterio.pagarDuracionReal ? 'real' : 'horario'} disabled={guardandoCriterio}
                  onChange={e => void cambiarDuracionReal(e.target.value === 'real')} className={campoCls + ' mt-1 w-full sm:w-auto'}>
                  <option value="horario">Su horario entero</option>
                  <option value="real">Lo que duró de verdad</option>
                </select>
              ) : (
                <p className="mt-1 text-sm font-semibold text-foreground">{criterio.pagarDuracionReal ? 'Lo que duró de verdad' : 'Su horario entero'}</p>
              )}
              <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">
                {criterio.pagarDuracionReal
                  ? 'Desde que la empezó en la app hasta que acabó. Un retraso se descuenta.'
                  : 'Si empezó tarde, se ve el retraso, pero no se descuenta.'}
                {' '}Las autónomas se pagan siempre por clases.
              </p>
            </div>
          </div>
        </section>
      )}

      {cargando ? (
        <div className="space-y-3">{[0, 1, 2].map(k => <div key={k} className="h-24 animate-pulse rounded-2xl border border-border bg-card" />)}</div>
      ) : activos.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
          Todavía no hay instructoras de alta. <Link href="/equipo?nuevo=1" className="font-semibold text-foreground underline">Añade la primera en Equipo</Link>.
        </div>
      ) : (
        <div className="space-y-3">
          {activos.map(i => (
            <TarjetaInstructora key={i.id}
              instructora={i} tarifa={tarifas[i.id]} liq={liquidaciones[i.id]} mes={MESES[mes - 1]}
              minutosFichados={fichado ? (fichado.get(i.id) ?? 0) : null}
              pagarDuracionReal={criterio?.pagarDuracionReal ?? false} modoEstudio={criterio?.modo ?? 'CLASES'}
              procesando={procesandoId === i.id}
              onGenerar={() => handleGenerar(i.id)}
              onTransicion={accion => liquidaciones[i.id] && handleTransicion(liquidaciones[i.id], accion)}
              onRelacion={v => handleRelacion(i.id, v)}
              onTarifa={(campo, v) => handleGuardarTarifa(i.id, campo, v)}
            />
          ))}
        </div>
      )}
      {toastMsg && <Toast message={toastMsg} onDismiss={dismissToast} />}
    </div>
  );
}

const campoCls = 'rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/15 transition-all';
const horasMin = (min: number) => `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min`;
const euros = (n: number | null | undefined) => n == null ? null : n.toLocaleString('es-ES', { maximumFractionDigits: 2 });

function Cifra({ etiqueta, valor, sub, fuerte = false }: { etiqueta: string; valor: string; sub: string; fuerte?: boolean }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-[12px] text-muted-foreground">{etiqueta}</p>
      <p className={`mt-1 font-bold text-foreground tabular-nums ${fuerte ? 'text-xl' : 'text-lg'}`}>{valor}</p>
      <p className="text-[11px] text-muted-foreground">{sub}</p>
    </div>
  );
}

function Etiqueta({ tono, children, testId }: { tono: 'neutro' | 'aviso' | 'ok' | 'info' | 'error'; children: React.ReactNode; testId?: string }) {
  const clases = {
    neutro: 'bg-muted text-muted-foreground',
    aviso: 'bg-amber-500/15 text-amber-700',
    ok: 'bg-emerald-500/15 text-emerald-700',
    info: 'bg-sky-500/15 text-sky-700',
    error: 'bg-red-500/15 text-red-700',
  }[tono];
  return <span data-testid={testId} className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${clases}`}>{children}</span>;
}

function Nota({ tono, children, testId }: { tono: 'aviso' | 'info'; children: React.ReactNode; testId?: string }) {
  return (
    <p data-testid={testId} className={`flex gap-2 rounded-xl px-3 py-2 text-[12px] leading-relaxed ${tono === 'aviso' ? 'bg-amber-500/10 text-amber-800' : 'bg-muted/60 text-muted-foreground'}`}>
      {tono === 'aviso' ? <AlertTriangle size={14} className="mt-0.5 shrink-0" /> : <Info size={14} className="mt-0.5 shrink-0" />}
      <span>{children}</span>
    </p>
  );
}

function TarjetaInstructora({ instructora: i, tarifa, liq, mes, minutosFichados, pagarDuracionReal, modoEstudio, procesando, onGenerar, onTransicion, onRelacion, onTarifa }: {
  instructora: Instructor; tarifa: TarifaInstructor | undefined; liq: Liquidacion | undefined; mes: string;
  minutosFichados: number | null; pagarDuracionReal: boolean; modoEstudio: ModoLiquidacion; procesando: boolean;
  onGenerar: () => void; onTransicion: (a: 'confirmar' | 'marcar_pagada') => void;
  onRelacion: (v: string) => void;
  onTarifa: (campo: 'tarifaHora' | 'baseMensualEur' | 'recargoSustitucionPct', v: string) => void;
}) {
  const relacion = tarifa?.relacionLaboral ?? null;
  const sinTarifa = tarifa?.tarifaHora == null && tarifa?.baseMensualEur == null;
  // Abierto de entrada solo si falta algo por configurar; después lo decide ella.
  const [abierto, setAbierto] = useState(() => !relacion || sinTarifa);
  // El desglose, abierto mientras hay algo que revisar (borrador); una vez
  // confirmada o pagada, plegado: ya no hay nada que decidir ahí.
  const [verDesglose, setVerDesglose] = useState(() => !liq || liq.estado === 'BORRADOR');
  const condiciones = [
    tarifa?.tarifaHora != null ? `${euros(tarifa.tarifaHora)} €/h` : null,
    tarifa?.baseMensualEur ? `base ${euros(tarifa.baseMensualEur)} €` : null,
    tarifa?.recargoSustitucionPct ? `+${euros(tarifa.recargoSustitucionPct)} % en sustituciones` : null,
  ].filter(Boolean).join(' · ');
  const bloqueada = !!liq && ((liq.modo === 'HORAS_FICHADAS' && liq.jornadasSinCerrar > 0) || (liq.clasesSinConfirmar ?? 0) > 0);

  return (
    <article className="rounded-2xl border border-border bg-card" data-testid="tarjeta-liquidacion">
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <ProfileAvatar avatarId={i.avatar ?? null} fotoUrl={i.fotoUrl ?? null} nombre={i.nombre} color={i.color} size="md" />
          <div className="min-w-0">
            <h2 className="truncate text-[15px] font-semibold text-foreground">{i.nombre}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {relacion === 'AUTONOMA' ? <Etiqueta tono="neutro">Autónoma</Etiqueta>
                : relacion === 'CONTRATADA' ? <Etiqueta tono="neutro">Contratada</Etiqueta>
                : <Etiqueta tono="aviso">Relación sin definir</Etiqueta>}
              {liq && (liq.estado === 'PAGADA' ? <Etiqueta tono="ok">Pagada</Etiqueta>
                : liq.estado === 'CONFIRMADA' ? <Etiqueta tono="info">Confirmada · por pagar</Etiqueta>
                : <Etiqueta tono="aviso">Borrador</Etiqueta>)}
              {liq?.requiereRevision && <Etiqueta tono="error">Requiere revisión{liq.revisionMotivo ? `: ${liq.revisionMotivo}` : ''}</Etiqueta>}
            </div>
            <p className="mt-1 text-[12px] text-muted-foreground">
              {condiciones || <span className="text-amber-700">Sin tarifa: fíjala en «Condiciones» para poder valorar sus horas</span>}
              {minutosFichados != null && minutosFichados > 0 && relacion !== 'AUTONOMA' && (
                <> · <Link href="/equipo/tiempo-trabajado" className="hover:text-foreground hover:underline" data-testid="fichado-mes">Fichado en {mes}: {horasMin(minutosFichados)}</Link></>
              )}
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
          <div className="text-left sm:text-right">
            <p className="text-[11px] text-muted-foreground">{liq ? (liq.estado === 'BORRADOR' ? 'Total estimado' : 'Total') : 'Sin generar'}</p>
            <p className="whitespace-nowrap text-lg font-bold tabular-nums text-foreground">{liq ? formatEuro(liq.totalEur) : '—'}</p>
          </div>
          <div className="flex w-full items-center gap-2 sm:w-auto [&>button]:flex-1 [&>button]:whitespace-nowrap sm:[&>button]:flex-none">
            <button onClick={() => setAbierto(!abierto)} aria-expanded={abierto}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[12px] font-semibold text-foreground hover:bg-muted">
              <SlidersHorizontal size={14} /> Condiciones
            </button>
            {!liq && (
              <button onClick={onGenerar} disabled={procesando}
                className="rounded-lg bg-brand px-3 py-2 text-[12px] font-semibold text-brand-foreground hover:brightness-95 disabled:opacity-50">
                {procesando ? 'Generando…' : 'Generar liquidación'}
              </button>
            )}
            {liq?.estado === 'BORRADOR' && (
              <button onClick={() => onTransicion('confirmar')} disabled={procesando || bloqueada}
                title={bloqueada ? 'Hay jornadas o clases del mes por revisar' : undefined}
                className="rounded-lg bg-brand px-3 py-2 text-[12px] font-semibold text-brand-foreground hover:brightness-95 disabled:opacity-50">
                Confirmar
              </button>
            )}
            {liq?.estado === 'CONFIRMADA' && (
              <button onClick={() => onTransicion('marcar_pagada')} disabled={procesando}
                className="rounded-lg bg-brand px-3 py-2 text-[12px] font-semibold text-brand-foreground hover:brightness-95 disabled:opacity-50">
                Marcar como pagada
              </button>
            )}
          </div>
        </div>
      </div>

      {abierto && (
        <div className="border-t border-border bg-muted/30 px-5 py-4" data-testid="condiciones">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="grid gap-1 text-[12px] font-medium text-muted-foreground">
              Relación con el estudio
              <select aria-label={`Relación de ${i.nombre} con el estudio`} className={campoCls}
                value={relacion ?? ''} onChange={e => onRelacion(e.target.value)}>
                <option value="">Sin definir</option>
                <option value="CONTRATADA">Contratada</option>
                <option value="AUTONOMA">Autónoma</option>
              </select>
            </label>
            <CampoNumero etiqueta="Tarifa por hora" sufijo="€/h" valor={tarifa?.tarifaHora} onGuardar={v => onTarifa('tarifaHora', v)} />
            <CampoNumero etiqueta="Base mensual" sufijo="€" valor={tarifa?.baseMensualEur} onGuardar={v => onTarifa('baseMensualEur', v)} />
            <CampoNumero etiqueta="Recargo en sustituciones" sufijo="%" valor={tarifa?.recargoSustitucionPct} onGuardar={v => onTarifa('recargoSustitucionPct', v)} />
          </div>
          <p className="mt-3 text-[12px] text-muted-foreground" data-testid="relacion-explicacion">
            {relacion === 'CONTRATADA'
              ? 'Contratada: ficha su jornada de entrada y salida, como exige la ley, y además empieza sus clases desde la app.'
              : relacion === 'AUTONOMA'
                ? 'Autónoma: no ficha jornada. Empieza sus clases desde la app, o las confirma después si se le olvida.'
                : 'Indica si trabaja contratada (ficha su jornada) o como autónoma (solo confirma sus clases).'}
            {' '}Los cambios se guardan solos y valen para los borradores que generes o recalcules.
          </p>
        </div>
      )}

      {liq && !verDesglose && (
        <div className="border-t border-border px-5 py-3 flex flex-wrap items-center justify-between gap-2 text-[12px] text-muted-foreground">
          <span>
            {liq.estado === 'PAGADA' ? `Pagada${liq.referenciaPago ? ` · Ref: ${liq.referenciaPago}` : ''}` : 'Confirmada: ya no cambia aunque cambien sus clases.'}
          </span>
          <button onClick={() => setVerDesglose(true)} className="font-semibold text-foreground hover:underline">Ver desglose</button>
        </div>
      )}

      {liq && verDesglose && (
        <div className="border-t border-border px-5 py-4">
          <dl className="divide-y divide-border/70 text-[13px]" data-testid="desglose">
            {liq.baseEur > 0 && <Linea etiqueta="Base mensual" importe={liq.baseEur} />}
            {liq.modo === 'HORAS_FICHADAS' ? (
              <div data-testid="variable-fichado">
                <Linea etiqueta={`${horasMin(liq.minutosFichados ?? 0)} fichadas`} detalle={`${liq.nClasesPropias + liq.nClasesSustitucion} clases del mes`} importe={liq.variablePropiasEur} />
              </div>
            ) : (
              <>
                <Linea etiqueta={`${liq.nClasesPropias} ${liq.nClasesPropias === 1 ? 'clase propia' : 'clases propias'}`} importe={liq.variablePropiasEur} />
                {liq.nClasesSustitucion > 0 && <Linea etiqueta={`${liq.nClasesSustitucion} ${liq.nClasesSustitucion === 1 ? 'sustitución' : 'sustituciones'}`} importe={liq.variableSustitucionEur} />}
              </>
            )}
            {liq.nPenalizaciones > 0 && <Linea etiqueta={`${liq.nPenalizaciones} ${liq.nPenalizaciones === 1 ? 'penalización' : 'penalizaciones'}`} detalle="su parte de lo cobrado" importe={liq.repartoPenalizacionesEur} />}
            <div className="flex items-baseline justify-between pt-3">
              <dt className="text-[14px] font-semibold text-foreground">Total</dt>
              <dd className="text-[16px] font-bold tabular-nums text-foreground">{formatEuro(liq.totalEur)}</dd>
            </div>
          </dl>

          <div className="mt-3 space-y-2">
            {liq.modo === 'HORAS_FICHADAS' && liq.jornadasSinCerrar > 0 && (
              <Nota tono="aviso" testId="jornadas-sin-cerrar">
                {liq.jornadasSinCerrar === 1
                  ? 'Una jornada de este mes está sin cerrar: no se paga ni se puede confirmar hasta corregirla en '
                  : `${liq.jornadasSinCerrar} jornadas de este mes están sin cerrar: no se pagan ni se puede confirmar hasta corregirlas en `}
                <Link href="/equipo/tiempo-trabajado" className="font-semibold underline">Tiempo trabajado</Link>.
              </Nota>
            )}
            {(liq.clasesSinConfirmar ?? 0) > 0 && (
              <Nota tono="aviso" testId="clases-sin-confirmar-liq">
                {liq.clasesSinConfirmar === 1
                  ? 'Una clase de este mes terminó sin saberse si la dio. Se ha contado por su horario, pero no se puede confirmar hasta revisarla en '
                  : `${liq.clasesSinConfirmar} clases de este mes terminaron sin saberse si las dio. Se han contado por su horario, pero no se puede confirmar hasta revisarlas en `}
                <Link href="/equipo/tiempo-trabajado" className="font-semibold underline">Tiempo trabajado</Link>.
              </Nota>
            )}
            {liq.nClasesSinTarifa > 0 && (
              <Nota tono="aviso">
                {liq.nClasesSinTarifa} {liq.nClasesSinTarifa === 1 ? 'clase sin tarifa fijada: no se ha valorado.' : 'clases sin tarifa fijada: no se han valorado.'} Fija su tarifa en «Condiciones» y recalcula.
              </Nota>
            )}
            {(liq.clasesNoDadas ?? 0) > 0 && (
              <Nota tono="info" testId="clases-no-dadas-liq">
                {liq.clasesNoDadas === 1 ? 'Una clase que dijo no dar no se paga.' : `${liq.clasesNoDadas} clases que dijo no dar no se pagan.`}
              </Nota>
            )}
            {(liq.minutosRetraso ?? 0) > 0 && (
              <Nota tono="info" testId="retraso-liq">
                Empezó tarde {liq.minutosRetraso} min en total este mes
                {pagarDuracionReal ? ' (descontados).' : ' (no se descuentan: se paga el horario).'}
              </Nota>
            )}
            {liq.minutosExtra != null && liq.minutosContrato != null && (
              <Nota tono="info" testId="extra-liq">
                Contrato: {Math.round(liq.minutosContrato / 60)} h este mes.
                {liq.minutosExtra > 0
                  ? ` Ha fichado ${horasMin(liq.minutosExtra)} de más: se enseñan, no se pagan aparte.`
                  : ' No ha fichado horas de más.'}
              </Nota>
            )}
            {liq.relacionLaboral === 'AUTONOMA' && liq.modo === 'CLASES' && modoEstudio === 'HORAS_FICHADAS' && (
              <Nota tono="info">Como autónoma no ficha jornada: se le paga por clases.</Nota>
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[12px] text-muted-foreground">
            <span>
              {liq.estado === 'PAGADA'
                ? `Pagada${liq.referenciaPago ? ` · Ref: ${liq.referenciaPago}` : ''}`
                : liq.estado === 'CONFIRMADA' ? 'Confirmada: ya no cambia aunque cambien sus clases.' : 'Borrador: se recalcula con los datos de ahora al confirmar.'}
            </span>
            {liq.estado === 'BORRADOR' ? (
              <button onClick={onGenerar} disabled={procesando} className="inline-flex items-center gap-1.5 font-semibold text-foreground hover:underline disabled:opacity-50">
                <RefreshCw size={13} /> Recalcular
              </button>
            ) : (
              <button onClick={() => setVerDesglose(false)} className="font-semibold text-foreground hover:underline">Ocultar desglose</button>
            )}
          </div>
        </div>
      )}
    </article>
  );
}

function Linea({ etiqueta, detalle, importe }: { etiqueta: string; detalle?: string; importe: number }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2">
      <dt className="text-muted-foreground">{etiqueta}{detalle && <span className="ml-1.5 text-[11px] text-muted-foreground/80">· {detalle}</span>}</dt>
      <dd className="tabular-nums text-foreground">{formatEuro(importe)}</dd>
    </div>
  );
}

function CampoNumero({ etiqueta, sufijo, valor, onGuardar }: { etiqueta: string; sufijo: string; valor: number | null | undefined; onGuardar: (v: string) => void }) {
  return (
    <label className="grid gap-1 text-[12px] font-medium text-muted-foreground">
      {etiqueta}
      <span className="relative">
        <input type="number" min={0} step={0.01} inputMode="decimal" className={campoCls + ' w-full pr-12'}
          defaultValue={valor ?? ''} placeholder="Sin fijar" onBlur={e => onGuardar(e.target.value)} />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-muted-foreground">{sufijo}</span>
      </span>
    </label>
  );
}
