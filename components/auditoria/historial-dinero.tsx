'use client';

// Historial de cambios de dinero del estudio: quién creó, cambió o borró un
// recibo, una cuota o bono, un plan o un ingreso manual, cuándo, y qué valor
// había antes. Solo lo ven las propietarias (`puedeVerAuditoriaFinanciera`; la
// cerradura es la RLS de `auditoria_estudio`).
//
// Un solo componente para dos sitios: la pestaña «Cambios del equipo» de Cobros
// (todo el estudio) y la ficha de una clienta (solo lo suyo, `socioId`).
//
// ⚠️ Solo cuenta lo que hace una PERSONA del equipo desde su sesión. Los cobros
// automáticos, los reintentos y lo que confirma Stripe no salen aquí — y la
// pantalla lo dice, para que su ausencia no se lea como «no ha pasado».

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { useStudio } from '@/lib/studio-context';
import { cn } from '@/lib/utils';
import { cargarAuditoriaEstudio } from '@/lib/db/auditoria-estudio';
import { describirEntrada, TABLAS_AUDITADAS, type EntradaAuditoria } from '@/lib/auditoria-estudio';
import { AVISO_DE_CONSERVACION } from '@/lib/auditoria/aviso-equipo';

export function HistorialDinero({ studioId, socioId }: { studioId: string; socioId?: string }) {
  const { planesTarifa, socios, instructores } = useStudio();
  const [entradas, setEntradas] = useState<EntradaAuditoria[]>([]);
  const [cargando, setCargando] = useState(true);
  const [cargandoMas, setCargandoMas] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hayMas, setHayMas] = useState(false);
  const [tabla, setTabla] = useState<string | null>(null);
  const [verRutina, setVerRutina] = useState(false);
  // Sube al reintentar: relanza la carga inicial sin duplicar la lógica.
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    let vivo = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCargando(true);
    setError(null);
    cargarAuditoriaEstudio({ studioId, socioId, tabla: tabla ?? undefined }).then(r => {
      if (!vivo) return;
      if (r.ok) { setEntradas(r.entradas); setHayMas(r.hayMas); } else { setEntradas([]); setHayMas(false); setError(r.error); }
      setCargando(false);
    });
    return () => { vivo = false; };
  }, [studioId, socioId, tabla, intento]);

  const cargarMas = useCallback(async () => {
    const ultima = entradas.at(-1);
    if (!ultima) return;
    setCargandoMas(true);
    const r = await cargarAuditoriaEstudio({ studioId, socioId, tabla: tabla ?? undefined, antesDeId: ultima.id });
    setCargandoMas(false);
    if (r.ok) { setEntradas(prev => [...prev, ...r.entradas]); setHayMas(r.hayMas); } else { setError(r.error); }
  }, [entradas, studioId, socioId, tabla]);

  const planPorId = useMemo(() => new Map(planesTarifa.map(p => [p.id, p.nombre])), [planesTarifa]);
  // El libro guarda la cuenta, no el nombre: se pone con la plantilla del equipo.
  const equipoPorUid = useMemo(
    () => new Map(instructores.filter(i => i.authUserId).map(i => [i.authUserId as string, i.nombre])),
    [instructores],
  );
  const clientaPorId = useMemo(() => new Map(socios.map(s => [s.id, `${s.nombre} ${s.apellidos}`.trim()])), [socios]);

  const filas = useMemo(
    () => entradas
      .map(e => describirEntrada(e, { nombreDePlan: id => planPorId.get(id), nombreDeActor: uid => equipoPorUid.get(uid) }))
      .filter(d => verRutina || !d.rutina),
    [entradas, planPorId, equipoPorUid, verRutina],
  );
  const ocultas = entradas.length - filas.length;

  return (
    <div className="space-y-4" data-testid="historial-dinero">
      <p className="text-xs text-muted-foreground max-w-prose">
        Cada vez que alguien de tu equipo crea, cambia o borra un recibo, una cuota o bono, un plan o un ingreso
        manual, pide un reembolso, marca un recibo como devuelto, lanza un cobro con el método de pago guardado
        («Cobrar online» o aprobar una propuesta en Automatizaciones), devuelve una venta de la caja, emite una
        factura rectificativa o aprueba cobrar una penalización, queda aquí: quién, cuándo y qué valor había antes.
        No incluye los cobros automáticos ni lo que confirma Stripe, ni un intento de cobro que el banco rechaza
        (no cambia ningún dato). Las ventas de la caja y sus entradas y salidas de efectivo llevan su propio
        registro, con quién las hizo, en Caja. Todavía no recoge lo que se importa desde otra plataforma.
        {' '}{AVISO_DE_CONSERVACION}
      </p>

      {!socioId && (
        <div className="flex gap-1.5 flex-wrap" role="group" aria-label="Filtrar por tipo">
          {[{ id: null, etiqueta: 'Todo' }, ...Object.entries(TABLAS_AUDITADAS).filter(([, t]) => t.desdeElPanel).map(([id, t]) => ({ id, etiqueta: t.etiqueta }))].map(f => (
            <button
              key={f.id ?? 'todo'}
              type="button"
              onClick={() => setTabla(f.id)}
              aria-pressed={tabla === f.id}
              className={cn(
                'px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors',
                tabla === f.id ? 'bg-brand text-brand-foreground border-transparent' : 'border-border text-muted-foreground hover:text-foreground',
              )}
            >
              {f.etiqueta}
            </button>
          ))}
        </div>
      )}

      {cargando ? (
        <p role="status" className="text-sm text-muted-foreground py-6">Cargando el historial…</p>
      ) : error ? (
        <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive flex items-center justify-between gap-3">
          <span>{error}</span>
          <button type="button" onClick={() => setIntento(n => n + 1)} className="font-bold underline underline-offset-2">Reintentar</button>
        </div>
      ) : entradas.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center">
          <p className="text-sm font-semibold text-foreground">No hay cambios registrados</p>
          <p className="text-xs text-muted-foreground mt-1">
            Desde hoy, lo que haga tu equipo con el dinero quedará aquí con quién lo hizo y el valor de antes.
          </p>
        </div>
      ) : (
        <>
          <ul className="space-y-2" aria-label="Cambios de dinero, del más reciente al más antiguo">
            {filas.map(d => {
              const clienta = !socioId && d.socioId ? clientaPorId.get(d.socioId) : null;
              return (
                <li key={d.id} className="rounded-xl border border-border bg-card px-4 py-3" data-testid="cambio-de-dinero">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                    <p className="text-sm font-semibold text-foreground">
                      {d.titulo}
                      {d.objeto && <span className="font-normal text-muted-foreground"> · {d.objeto}</span>}
                    </p>
                    <span className="text-xs text-muted-foreground">{d.cuando}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {d.quien}
                    {clienta && <> · {clienta}</>}
                  </p>
                  {d.motivo && <p className="text-xs text-muted-foreground">Motivo: {d.motivo}</p>}
                  {d.lineas.length > 0 && (
                    <ul className="mt-2 space-y-0.5">
                      {d.lineas.map(l => (
                        <li key={l.campo} className="text-[13px] text-foreground flex flex-wrap items-center gap-x-1.5">
                          <span className="text-muted-foreground">{l.campo}:</span>
                          {l.antes !== undefined && l.despues !== undefined ? (
                            <>
                              <span>{l.antes}</span>
                              <ArrowRight size={12} aria-label="pasa a" className="text-muted-foreground shrink-0" />
                              <span className="font-semibold">{l.despues}</span>
                            </>
                          ) : (
                            <span>{l.antes ?? l.despues}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>

          {filas.length === 0 && (
            <p className="text-sm text-muted-foreground">Solo hay descuentos de sesión de bonos en esta página.</p>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
              <input type="checkbox" checked={verRutina} onChange={e => setVerRutina(e.target.checked)} />
              Mostrar también los descuentos de sesión de los bonos{!verRutina && ocultas > 0 ? ` (${ocultas} ocultos)` : ''}
            </label>
            {hayMas && (
              <button
                type="button"
                onClick={cargarMas}
                disabled={cargandoMas}
                className="text-xs font-bold px-3.5 py-2 rounded-lg border border-border hover:bg-muted transition-colors disabled:opacity-50"
              >
                {cargandoMas ? 'Cargando…' : 'Ver más antiguos'}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
