'use client';

// Asignar o cambiar una plaza fija eligiendo una CLASE del horario.
//
// Un solo diálogo para la ficha de la clienta y para «Hacer fija» del
// calendario: antes eran dos caminos que daban resultados distintos, y la ficha
// pedía día y hora tecleados que tenían que coincidir al minuto con una clase
// (si no, la plaza no reservaba nunca y nadie se enteraba).
//
// Al ASIGNAR se pueden marcar varias clases a la vez: una cuota de «2 días a la
// semana» son dos clases fijas, y el diálogo solo dejaba elegir una (había que
// volver a entrar para la segunda). Al CAMBIAR una que ya existe sigue siendo
// una sola: es esa plaza la que se mueve.
//
// Las franjas salen de las clases ya cargadas (`franjasSemanales`), sin
// consultas nuevas. Guardar va por el servidor, una petición por clase y una
// detrás de otra, que deduce día/hora/sala/tipo de la clase elegida, comprueba
// cuota y límite semanal y reserva ya las próximas semanas con el mismo motor
// que cada noche. Si una falla, las de antes ya están guardadas: se dice cuáles,
// salen de la selección y al cerrar se avisa de ellas igual.
//
// Se monta cuando hace falta y se desmonta al cerrar: así cada apertura empieza
// con el estado limpio sin efectos que lo reinicien.

import { useEffect, useId, useMemo, useState } from 'react';
import { useStudio } from '@/lib/studio-context';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { IconoAviso } from '@/lib/iconos';
import { franjasSemanales, nombreDiaSemana, plazaEnFranja, type FranjaSemanal } from '@/lib/plazas-fijas-slot';
import { cn, fechaCortaEstudio, hoyEnEstudio } from '@/lib/utils';
import { cuotaParaPlazaFija } from '@/lib/plazas-fijas-reglas';
import { avisoLimiteSemanal, enumerar, textoYaGuardadas, type ClaseFijaGuardada } from '@/lib/plazas-fijas-guardadas';
import { DURACIONES_POR_DEFECTO, etiquetaDuracion, vigenciaHastaDeDuracion } from '@/lib/clases-fijas-reglas';
import type { PlazaFija } from '@/lib/types';

const inputCls = 'w-full text-sm rounded-lg border border-border bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ring';
const labelCls = 'text-xs font-semibold text-muted-foreground mb-1.5 block';

const capitalizar = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** «martes 10:00»: como se nombra una clase en los avisos. */
const etiquetaFranja = (f: FranjaSemanal) => `${nombreDiaSemana(f.diaSemana)} ${f.horaInicio.slice(0, 5)}`;

export interface DialogoPlazaFijaProps {
  socioId: string;
  /** Presente = cambiar esta plaza a otra clase (o su sitio y fechas). */
  plaza?: PlazaFija | null;
  /** Clase ya elegida al abrir (desde el calendario). */
  claveInicial?: string | null;
  spotInicial?: string | null;
  onClose: () => void;
  /**
   * Lo que se ha guardado de verdad, una entrada por clase. Llega también al
   * cerrar tras un fallo a mitad si alguna se guardó antes: esas ya existen.
   */
  onGuardada: (guardadas: ClaseFijaGuardada[], movida: boolean) => void;
}

export function DialogoPlazaFija({
  socioId, plaza = null, claveInicial = null, spotInicial = null, onClose, onGuardada,
}: DialogoPlazaFijaProps) {
  const { sesiones, plazasFijas, salas, tiposClase, spots, asignarPlazaFija, moverPlazaFija, suscripciones, planesTarifa } = useStudio();
  const uid = useId();
  const varias = !plaza;

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

  // Cambiar: una clase. Asignar: las que se marquen.
  const [claveElegida, setClaveElegida] = useState<string | null>(claveInicial);
  const claveDeLaPlaza = plaza ? franjas.find(f => plazaEnFranja(plaza, f))?.clave ?? null : null;
  const clave = claveElegida ?? claveDeLaPlaza;
  const [marcadas, setMarcadas] = useState<string[]>(claveInicial ? [claveInicial] : []);
  // En el orden del horario, no en el de los clics.
  const elegidas = varias
    ? franjas.filter(f => marcadas.includes(f.clave))
    : franjas.filter(f => f.clave === clave);
  const franja = elegidas[0] ?? null;

  // Sitio por clase: cada una es de su sala.
  const [spotElegido, setSpotElegido] = useState<Record<string, string>>(
    () => (claveInicial && spotInicial ? { [claveInicial]: spotInicial } : {}),
  );
  const [desde, setDesde] = useState(plaza?.vigenciaDesde ?? hoyEnEstudio());
  const [hasta, setHasta] = useState(plaza?.vigenciaHasta ?? '');
  const [error, setError] = useState<string | null>(null);
  const [limite, setLimite] = useState<number | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [guardadas, setGuardadas] = useState<ClaseFijaGuardada[]>([]);

  const nombreSala = (id: string) => salas.find(s => s.id === id)?.nombre ?? 'Sala';
  const nombreTipo = (id: string) => tiposClase.find(t => t.id === id)?.nombre ?? 'Clase';

  const spotsDe = (f: FranjaSemanal) => spots.filter(s => s.salaId === f.salaId && s.activo);
  // Sitios que ya son de otra plaza fija en esa clase: la exclusión GiST los
  // rechazaría igual, mejor no ofrecerlos.
  const ocupadosDe = (f: FranjaSemanal) =>
    new Set(f.fijas.filter(p => p.id !== plaza?.id && p.spotId).map(p => p.spotId as string));
  const spotDe = (f: FranjaSemanal) => {
    const elegido = spotElegido[f.clave] ?? (!varias ? plaza?.spotId ?? '' : '');
    return spotsDe(f).some(s => s.id === elegido && !ocupadosDe(f).has(s.id)) ? elegido : '';
  };

  const rangoInvertido = !!hasta && hasta < desde;
  // Se dice ANTES de elegir: sin cuota el servidor no la deja guardar, y
  // enterarse al pulsar «Asignar» después de buscar la clase es tarde. No
  // bloquea el botón — la última palabra es del servidor, que ve todas las
  // suscripciones y no solo las que tiene cargadas el panel.
  const hoy = hoyEnEstudio();
  const cuota = ahoraMs > 0 ? cuotaParaPlazaFija(socioId, suscripciones, planesTarifa, hoy, null) : null;
  const sinNingunaCuota = ahoraMs > 0 && !cuota;
  const noCubiertas = sinNingunaCuota ? [] : elegidas.filter(f => !cuotaParaPlazaFija(socioId, suscripciones, planesTarifa, hoy, f.tipoClaseId));
  // Mismo recuento que el servidor al crear: las activas que no han vencido.
  const yaTiene = plazasFijas.filter(p => p.socioId === socioId && p.estado === 'ACTIVA' && (!p.vigenciaHasta || p.vigenciaHasta >= hoy)).length;
  const avisoLimite = varias ? avisoLimiteSemanal(cuota?.limiteSemanal, yaTiene, elegidas.length) : null;
  const completas = elegidas.filter(f => f.fijas.filter(p => p.id !== plaza?.id).length >= f.aforo);
  const puedeGuardar = elegidas.length > 0 && !!desde && !rangoInvertido && !guardando;

  function alternar(f: FranjaSemanal) {
    setError(null);
    setLimite(null);
    if (varias) setMarcadas(prev => prev.includes(f.clave) ? prev.filter(c => c !== f.clave) : [...prev, f.clave]);
    else setClaveElegida(f.clave);
  }

  async function guardar(confirmarLimite: boolean) {
    if (!puedeGuardar) return;
    setGuardando(true);
    setError(null);
    setLimite(null);
    const datosDe = (f: FranjaSemanal) => ({
      sesionId: f.proximaSesionId, spotId: spotDe(f) || null,
      vigenciaDesde: desde, vigenciaHasta: hasta || null, confirmarLimite,
    });

    if (plaza && franja) {
      const r = await moverPlazaFija(plaza.id, datosDe(franja));
      setGuardando(false);
      if (!r.ok) {
        setError(r.error);
        setLimite(r.codigo === 'SUPERA_LIMITE' ? r.limite ?? 0 : null);
        return;
      }
      onGuardada([{ resultado: r, clase: etiquetaFranja(franja) }], true);
      return;
    }

    // Una detrás de otra: cada una cuenta las anteriores para el límite semanal.
    const nuevas: ClaseFijaGuardada[] = [];
    const hechas: string[] = [];
    let fallo: { f: FranjaSemanal; error: string; limite: number | null } | null = null;
    for (const f of elegidas) {
      const r = await asignarPlazaFija({ ...datosDe(f), socioId });
      if (!r.ok) {
        fallo = { f, error: r.error, limite: r.codigo === 'SUPERA_LIMITE' ? r.limite ?? 0 : null };
        break;
      }
      nuevas.push({ resultado: r, clase: etiquetaFranja(f) });
      hechas.push(f.clave);
    }
    const todas = [...guardadas, ...nuevas];
    setGuardadas(todas);
    setMarcadas(prev => prev.filter(c => !hechas.includes(c)));
    setGuardando(false);
    if (!fallo) {
      onGuardada(todas, false);
      return;
    }
    setError(elegidas.length > 1 ? `${capitalizar(etiquetaFranja(fallo.f))}: ${fallo.error}` : fallo.error);
    setLimite(fallo.limite);
  }

  // Si alguna se guardó antes de un fallo, cerrar no la deshace: se avisa de ella.
  function cerrar() {
    if (guardando) return;
    if (guardadas.length > 0) onGuardada(guardadas, false);
    else onClose();
  }

  const yaGuardadas = textoYaGuardadas(guardadas.map(g => g.clase));
  const textoBoton = guardando
    ? 'Guardando…'
    : plaza ? 'Guardar cambios' : elegidas.length > 1 ? `Asignar ${elegidas.length} clases fijas` : 'Asignar clase fija';

  return (
    <Dialog open onOpenChange={abierto => { if (!abierto) cerrar(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{plaza ? 'Cambiar clase fija' : 'Asignar clase fija'}</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground -mt-1">
          {varias
            ? 'Marca las clases a las que viene cada semana (puedes elegir varias). '
            : 'Elige la clase a la que viene cada semana. '}
          Se le reservan ya las clases programadas en ese horario, hasta unos seis meses por delante (menos las que empiezan dentro del plazo de cancelación), y después solas: cada
          noche y al crear una clase nueva. Hace falta una cuota activa que incluya esa clase; con bono se reserva clase a clase.
        </p>
        {(sinNingunaCuota || noCubiertas.length > 0) && (
          <p role="status" className="rounded-lg border border-warning/40 bg-warning/5 px-3 py-2 text-xs font-medium text-warning">
            {sinNingunaCuota
              ? 'No tiene ninguna cuota activa, así que no se le puede dar clase fija todavía. Asígnale primero una cuota.'
              : elegidas.length > 1
                ? `Su cuota no incluye ${enumerar(noCubiertas.map(etiquetaFranja))}: elige clases que cubra, o cámbiale la cuota.`
                : 'Su cuota no incluye esta clase: elige una clase que cubra, o cámbiale la cuota.'}
          </p>
        )}

        <div className="space-y-4">
          <div>
            <p id={`${uid}-clase`} className={labelCls}>{varias ? 'Clases' : 'Clase'}</p>
            {ahoraMs > 0 && franjas.length === 0 ? (
              <p className="text-sm text-muted-foreground rounded-lg border border-dashed border-border px-3 py-4">
                No hay clases programadas en las próximas 6 semanas. Crea el horario en el calendario y vuelve aquí.
              </p>
            ) : (
              <div role={varias ? 'group' : 'radiogroup'} aria-labelledby={`${uid}-clase`} className="max-h-72 overflow-y-auto rounded-lg border border-border">
                {porDia.map(grupo => (
                  <div key={grupo.dia}>
                    <p className="sticky top-0 z-10 bg-muted px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                      {capitalizar(nombreDiaSemana(grupo.dia))}
                    </p>
                    {grupo.franjas.map(f => {
                      const hora = f.horaInicio.slice(0, 5);
                      const yaLaTiene = [...f.fijas, ...f.pausadas].some(p => p.socioId === socioId && p.id !== plaza?.id);
                      const seleccionada = elegidas.some(e => e.clave === f.clave);
                      const completa = f.fijas.length >= f.aforo;
                      return (
                        <button
                          key={f.clave}
                          type="button"
                          role={varias ? 'checkbox' : 'radio'}
                          aria-checked={seleccionada}
                          disabled={yaLaTiene || guardando}
                          aria-label={`${capitalizar(nombreDiaSemana(f.diaSemana))} ${hora} · ${nombreTipo(f.tipoClaseId)} · ${nombreSala(f.salaId)}`}
                          onClick={() => alternar(f)}
                          className={cn(
                            'w-full text-left px-3 py-2 flex items-center gap-3 border-t border-border first:border-t-0 transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
                            // Con un color principal oscuro, un fondo tenue no se distingue: la
                            // elegida lleva borde marcado y su marca rellena.
                            seleccionada ? 'bg-muted ring-2 ring-inset ring-primary' : 'hover:bg-muted',
                          )}
                        >
                          {varias ? (
                            <span
                              aria-hidden
                              className={cn(
                                'size-4 shrink-0 rounded border-2 flex items-center justify-center',
                                seleccionada ? 'border-primary bg-primary' : 'border-muted-foreground/40',
                              )}
                            >
                              {seleccionada && (
                                <svg viewBox="0 0 12 12" className="size-3 text-primary-foreground" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M2.5 6.2 5 8.5l4.5-5" />
                                </svg>
                              )}
                            </span>
                          ) : (
                            <span
                              aria-hidden
                              className={cn(
                                'size-4 shrink-0 rounded-full border-2 flex items-center justify-center',
                                seleccionada ? 'border-primary' : 'border-muted-foreground/40',
                              )}
                            >
                              {seleccionada && <span className="size-2 rounded-full bg-primary" />}
                            </span>
                          )}
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
            {completas.length > 0 && (
              <p role="status" className="mt-2 text-xs font-medium text-warning flex items-start gap-1.5">
                <IconoAviso size={14} className="shrink-0 mt-px" aria-hidden />
                <span>
                  {elegidas.length > 1
                    ? `Todas las plazas de ${enumerar(completas.map(etiquetaFranja))} ya son fijas: se guarda, pero no se le podrá reservar hasta que quede sitio.`
                    : 'Todas las plazas de esta clase ya son fijas: se guarda, pero no se le podrá reservar hasta que quede sitio.'}
                </span>
              </p>
            )}
            {avisoLimite && (
              <p role="status" className="mt-2 text-xs font-medium text-warning flex items-start gap-1.5">
                <IconoAviso size={14} className="shrink-0 mt-px" aria-hidden />
                <span>{avisoLimite}</span>
              </p>
            )}
          </div>

          {elegidas.filter(f => spotsDe(f).length > 0).map(f => {
            const ocupados = ocupadosDe(f);
            return (
              <div key={f.clave}>
                <label htmlFor={`${uid}-spot-${f.clave}`} className={labelCls}>
                  {elegidas.length > 1 ? `Sitio el ${etiquetaFranja(f)} (opcional)` : 'Sitio (opcional)'}
                </label>
                <select
                  id={`${uid}-spot-${f.clave}`}
                  className={inputCls}
                  value={spotDe(f)}
                  onChange={e => setSpotElegido(prev => ({ ...prev, [f.clave]: e.target.value }))}
                >
                  <option value="">Cualquiera libre</option>
                  {spotsDe(f).map(s => (
                    <option key={s.id} value={s.id} disabled={ocupados.has(s.id)}>
                      {s.nombre}{ocupados.has(s.id) ? ' (de otra clase fija)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            );
          })}

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
          {/* Atajos de duración: rellenan «Hasta» contando desde «Desde». La fecha libre sigue ahí para cualquier otra. */}
          {desde && (
            <div role="group" aria-label="Duración rápida" className="flex flex-wrap items-center gap-1.5 -mt-2">
              <span className="text-[11px] font-semibold text-muted-foreground mr-0.5">Duración</span>
              {[...DURACIONES_POR_DEFECTO, 12].map(m => {
                const fecha = vigenciaHastaDeDuracion(desde, m);
                return (
                  <button
                    key={m} type="button" aria-pressed={hasta === fecha} onClick={() => setHasta(fecha)}
                    className={cn(
                      'text-[11px] font-semibold px-2.5 py-1 rounded-full border transition-colors',
                      hasta === fecha ? 'border-primary bg-muted text-foreground' : 'border-border text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {etiquetaDuracion(m)}
                  </button>
                );
              })}
              <button
                type="button" aria-pressed={hasta === ''} onClick={() => setHasta('')}
                className={cn(
                  'text-[11px] font-semibold px-2.5 py-1 rounded-full border transition-colors',
                  hasta === '' ? 'border-primary bg-muted text-foreground' : 'border-border text-muted-foreground hover:text-foreground',
                )}
              >
                Sin fecha de fin
              </button>
            </div>
          )}

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
              {yaGuardadas && <p className="mt-1 text-foreground">{yaGuardadas}</p>}
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
          <button onClick={cerrar} disabled={guardando} className="text-xs font-semibold px-4 py-2 rounded-lg border border-border text-muted-foreground hover:text-foreground disabled:opacity-50">
            {guardadas.length > 0 ? 'Cerrar' : 'Cancelar'}
          </button>
          <button
            disabled={!puedeGuardar}
            onClick={() => guardar(false)}
            className="text-xs font-bold px-4 py-2 rounded-lg text-primary-foreground bg-primary hover:brightness-95 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {textoBoton}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
