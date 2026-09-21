'use client';

// Asignar o cambiar una plaza fija eligiendo una CLASE del horario.
//
// Un solo diálogo para la ficha de la clienta y para «Hacer fija» del
// calendario: antes eran dos caminos que daban resultados distintos, y la ficha
// pedía día y hora tecleados que tenían que coincidir al minuto con una clase
// (si no, la plaza no reservaba nunca y nadie se enteraba).
//
// Las franjas salen de las clases ya cargadas (`franjasSemanales`), sin
// consultas nuevas. Guardar va por el servidor, que deduce día/hora/sala/tipo de
// la clase elegida, comprueba cuota y límite semanal y reserva ya las próximas
// semanas con el mismo motor que cada noche.
//
// Se monta cuando hace falta y se desmonta al cerrar: así cada apertura empieza
// con el estado limpio sin efectos que lo reinicien.

import { useEffect, useId, useMemo, useState } from 'react';
import { useStudio } from '@/lib/studio-context';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { IconoAviso } from '@/lib/iconos';
import { franjasSemanales, nombreDiaSemana, plazaEnFranja, type FranjaSemanal } from '@/lib/plazas-fijas-slot';
import { cn, fechaCortaEstudio, hoyEnEstudio } from '@/lib/utils';
import type { ResultadoGuardarPlazaFija } from '@/lib/plazas-fijas-reglas';
import { cuotaParaPlazaFija } from '@/lib/plazas-fijas-reglas';
import type { PlazaFija } from '@/lib/types';

export type PlazaFijaGuardada = Extract<ResultadoGuardarPlazaFija, { ok: true }>;

const inputCls = 'w-full text-sm rounded-lg border border-border bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ring';
const labelCls = 'text-xs font-semibold text-muted-foreground mb-1.5 block';

const capitalizar = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Lo que ha pasado de verdad al guardar, con las cifras del servidor. */
export function textoPlazaGuardada(r: PlazaFijaGuardada, movida: boolean): string {
  const partes = [movida ? 'Plaza fija cambiada' : 'Plaza fija guardada'];
  if (r.primeraFecha) {
    partes.push(`ya tiene reservada la clase del ${fechaCortaEstudio(`${r.primeraFecha}T12:00:00Z`)}`);
  } else if (!r.hayClaseProgramada) {
    partes.push('en cuanto haya una clase programada en ese horario, se le reservará sola');
  } else {
    partes.push('la próxima clase no se le ha podido reservar (llena o cerrada)');
  }
  if (r.canceladas.length > 0) {
    partes.push(r.canceladas.length === 1
      ? '1 clase del horario anterior cancelada'
      : `${r.canceladas.length} clases del horario anterior canceladas`);
  }
  return partes.join(' · ');
}

export interface DialogoPlazaFijaProps {
  socioId: string;
  /** Presente = cambiar esta plaza a otra clase (o su sitio y fechas). */
  plaza?: PlazaFija | null;
  /** Clase ya elegida al abrir (desde el calendario). */
  claveInicial?: string | null;
  spotInicial?: string | null;
  onClose: () => void;
  onGuardada: (r: PlazaFijaGuardada, movida: boolean) => void;
}

export function DialogoPlazaFija({
  socioId, plaza = null, claveInicial = null, spotInicial = null, onClose, onGuardada,
}: DialogoPlazaFijaProps) {
  const { sesiones, plazasFijas, salas, tiposClase, spots, asignarPlazaFija, moverPlazaFija, suscripciones, planesTarifa } = useStudio();
  const uid = useId();

  // La hora entra por estado (no `Date.now()` en un memo), mismo patrón que la
  // ficha: la lógica pura la recibe inyectada.
  const [ahoraMs, setAhoraMs] = useState(0);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Reloj: sincroniza con el paso del TIEMPO, un sistema externo.
    setAhoraMs(Date.now());
  }, []);

  const franjas = useMemo(
    () => (ahoraMs ? franjasSemanales(sesiones, plazasFijas, ahoraMs) : []),
    [sesiones, plazasFijas, ahoraMs],
  );
  const porDia = useMemo(() => {
    const grupos: { dia: number; franjas: FranjaSemanal[] }[] = [];
    for (const f of franjas) {
      const ultimo = grupos[grupos.length - 1];
      if (ultimo && ultimo.dia === f.diaSemana) ultimo.franjas.push(f);
      else grupos.push({ dia: f.diaSemana, franjas: [f] });
    }
    return grupos;
  }, [franjas]);

  const [claveElegida, setClaveElegida] = useState<string | null>(claveInicial);
  const claveDeLaPlaza = plaza ? franjas.find(f => plazaEnFranja(plaza, f))?.clave ?? null : null;
  const clave = claveElegida ?? claveDeLaPlaza;
  const franja = franjas.find(f => f.clave === clave) ?? null;

  const [spotElegido, setSpotElegido] = useState(spotInicial ?? plaza?.spotId ?? '');
  const [desde, setDesde] = useState(plaza?.vigenciaDesde ?? hoyEnEstudio());
  const [hasta, setHasta] = useState(plaza?.vigenciaHasta ?? '');
  const [error, setError] = useState<string | null>(null);
  const [limite, setLimite] = useState<number | null>(null);
  const [guardando, setGuardando] = useState(false);

  const nombreSala = (id: string) => salas.find(s => s.id === id)?.nombre ?? 'Sala';
  const nombreTipo = (id: string) => tiposClase.find(t => t.id === id)?.nombre ?? 'Clase';

  const spotsSala = franja ? spots.filter(s => s.salaId === franja.salaId && s.activo) : [];
  // Sitios que ya son de otra plaza fija en esa clase: la exclusión GiST los
  // rechazaría igual, mejor no ofrecerlos.
  const ocupados = new Set(franja ? franja.fijas.filter(p => p.id !== plaza?.id && p.spotId).map(p => p.spotId as string) : []);
  const spotId = spotsSala.some(s => s.id === spotElegido && !ocupados.has(s.id)) ? spotElegido : '';
  const rangoInvertido = !!hasta && hasta < desde;
  // Se dice ANTES de elegir: sin cuota el servidor no la deja guardar, y
  // enterarse al pulsar «Asignar» después de buscar la clase es tarde. No
  // bloquea el botón — la última palabra es del servidor, que ve todas las
  // suscripciones y no solo las que tiene cargadas el panel.
  const hoy = hoyEnEstudio();
  const sinNingunaCuota = ahoraMs > 0 && !cuotaParaPlazaFija(socioId, suscripciones, planesTarifa, hoy, null);
  const cuotaNoIncluyeClase = !sinNingunaCuota && !!franja
    && !cuotaParaPlazaFija(socioId, suscripciones, planesTarifa, hoy, franja.tipoClaseId);
  const puedeGuardar = !!franja && !!desde && !rangoInvertido && !guardando;

  async function guardar(confirmarLimite: boolean) {
    if (!franja || !puedeGuardar) return;
    setGuardando(true);
    setError(null);
    const datos = {
      sesionId: franja.proximaSesionId, spotId: spotId || null,
      vigenciaDesde: desde, vigenciaHasta: hasta || null, confirmarLimite,
    };
    const r = plaza ? await moverPlazaFija(plaza.id, datos) : await asignarPlazaFija({ ...datos, socioId });
    setGuardando(false);
    if (!r.ok) {
      setError(r.error);
      setLimite(r.codigo === 'SUPERA_LIMITE' ? r.limite ?? 0 : null);
      return;
    }
    onGuardada(r, Boolean(plaza));
  }

  return (
    <Dialog open onOpenChange={abierto => { if (!abierto && !guardando) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{plaza ? 'Cambiar plaza fija' : 'Asignar plaza fija'}</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground -mt-1">
          Elige la clase a la que viene cada semana. Se le reservan ya las clases programadas en ese horario, hasta unos seis meses por delante (menos las que empiezan dentro del plazo de cancelación), y después solas: cada
          noche y al crear una clase nueva. Hace falta una cuota activa que incluya esa clase; con bono se reserva clase a clase.
        </p>
        {(sinNingunaCuota || cuotaNoIncluyeClase) && (
          <p role="status" className="rounded-lg border border-warning/40 bg-warning/5 px-3 py-2 text-xs font-medium text-warning">
            {sinNingunaCuota
              ? 'No tiene ninguna cuota activa, así que no se le puede dar plaza fija todavía. Asígnale primero una cuota.'
              : 'Su cuota no incluye esta clase: elige una clase que cubra, o cámbiale la cuota.'}
          </p>
        )}

        <div className="space-y-4">
          <div>
            <p id={`${uid}-clase`} className={labelCls}>Clase</p>
            {ahoraMs > 0 && franjas.length === 0 ? (
              <p className="text-sm text-muted-foreground rounded-lg border border-dashed border-border px-3 py-4">
                No hay clases programadas en las próximas 6 semanas. Crea el horario en el calendario y vuelve aquí.
              </p>
            ) : (
              <div role="radiogroup" aria-labelledby={`${uid}-clase`} className="max-h-72 overflow-y-auto rounded-lg border border-border">
                {porDia.map(grupo => (
                  <div key={grupo.dia}>
                    <p className="sticky top-0 z-10 bg-muted px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                      {capitalizar(nombreDiaSemana(grupo.dia))}
                    </p>
                    {grupo.franjas.map(f => {
                      const hora = f.horaInicio.slice(0, 5);
                      const yaLaTiene = [...f.fijas, ...f.pausadas].some(p => p.socioId === socioId && p.id !== plaza?.id);
                      const seleccionada = f.clave === clave;
                      const completa = f.fijas.length >= f.aforo;
                      return (
                        <button
                          key={f.clave}
                          type="button"
                          role="radio"
                          aria-checked={seleccionada}
                          disabled={yaLaTiene || guardando}
                          aria-label={`${capitalizar(nombreDiaSemana(f.diaSemana))} ${hora} · ${nombreTipo(f.tipoClaseId)} · ${nombreSala(f.salaId)}`}
                          onClick={() => { setClaveElegida(f.clave); setError(null); setLimite(null); }}
                          className={cn(
                            'w-full text-left px-3 py-2 flex items-center gap-3 border-t border-border first:border-t-0 transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
                            // Con un color principal oscuro, un fondo tenue no se distingue: la
                            // elegida lleva borde marcado y su círculo relleno.
                            seleccionada ? 'bg-muted ring-2 ring-inset ring-primary' : 'hover:bg-muted',
                          )}
                        >
                          <span
                            aria-hidden
                            className={cn(
                              'size-4 shrink-0 rounded-full border-2 flex items-center justify-center',
                              seleccionada ? 'border-primary' : 'border-muted-foreground/40',
                            )}
                          >
                            {seleccionada && <span className="size-2 rounded-full bg-primary" />}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-semibold text-foreground">{hora} · {nombreTipo(f.tipoClaseId)}</span>
                            <span className="block text-xs text-muted-foreground">
                              {nombreSala(f.salaId)} · próxima el {fechaCortaEstudio(f.proximaInicio)}{yaLaTiene ? ' · ya la tiene' : ''}
                            </span>
                          </span>
                          <span className={cn('shrink-0 text-xs font-semibold', completa ? 'text-warning' : 'text-muted-foreground')}>
                            {f.fijas.length}/{f.aforo} fijas
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
            {franja && franja.fijas.filter(p => p.id !== plaza?.id).length >= franja.aforo && (
              <p role="status" className="mt-2 text-xs font-medium text-warning flex items-start gap-1.5">
                <IconoAviso size={14} className="shrink-0 mt-px" aria-hidden />
                <span>Todas las plazas de esta clase ya son fijas: se guarda, pero no se le podrá reservar hasta que quede sitio.</span>
              </p>
            )}
          </div>

          {spotsSala.length > 0 && (
            <div>
              <label htmlFor={`${uid}-spot`} className={labelCls}>Sitio (opcional)</label>
              <select id={`${uid}-spot`} className={inputCls} value={spotId} onChange={e => setSpotElegido(e.target.value)}>
                <option value="">Cualquiera libre</option>
                {spotsSala.map(s => (
                  <option key={s.id} value={s.id} disabled={ocupados.has(s.id)}>
                    {s.nombre}{ocupados.has(s.id) ? ' (de otra plaza fija)' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor={`${uid}-desde`} className={labelCls}>Desde</label>
              <input id={`${uid}-desde`} type="date" className={inputCls} value={desde} onChange={e => setDesde(e.target.value)} />
            </div>
            <div>
              <label htmlFor={`${uid}-hasta`} className={labelCls}>Hasta (opcional)</label>
              <input id={`${uid}-hasta`} type="date" className={inputCls} value={hasta} onChange={e => setHasta(e.target.value)} />
            </div>
          </div>

          {plaza && (
            <p className="text-[11px] text-muted-foreground">
              Si la cambias de clase, las que ya tenía reservadas en la anterior se cancelan sin penalización.
            </p>
          )}
          {rangoInvertido && (
            <p role="alert" className="text-xs font-medium text-destructive">
              «Hasta» no puede ser anterior a «Desde»: ese rango nunca estaría activo.
            </p>
          )}
          {error && (
            <div role="alert" className={cn('rounded-lg px-3 py-2 text-xs font-medium', limite !== null ? 'bg-warning/10 text-warning' : 'text-destructive')}>
              <p>{error}</p>
              {limite !== null && (
                <button
                  type="button"
                  onClick={() => guardar(true)}
                  disabled={guardando}
                  className="mt-2 text-xs font-bold underline underline-offset-2 disabled:opacity-50"
                >
                  Asignar igualmente
                </button>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} disabled={guardando} className="text-xs font-semibold px-4 py-2 rounded-lg border border-border text-muted-foreground hover:text-foreground disabled:opacity-50">
            Cancelar
          </button>
          <button
            disabled={!puedeGuardar}
            onClick={() => guardar(false)}
            className="text-xs font-bold px-4 py-2 rounded-lg text-primary-foreground bg-primary hover:brightness-95 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {guardando ? 'Guardando…' : plaza ? 'Guardar cambios' : 'Asignar plaza fija'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
