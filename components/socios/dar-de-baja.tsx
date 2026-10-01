'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, UserX } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { useStudio } from '@/lib/studio-context';
import { dbRecibosPendientesDeCuota } from '@/lib/supabase-data';
import { textoCobrosAlCancelar, type ReciboPendienteDeLaCuota } from '@/lib/billing/texto-cancelar-cuota';
import { bajaSinConsecuencias, ETIQUETA_MOTIVO_BAJA, MOTIVOS_BAJA, planDeBaja, type MotivoBaja, type RespuestaBaja } from '@/lib/socios/baja';
import { cn, hoyEnEstudio } from '@/lib/utils';
import { useRol, puedeGestionarCalendario } from '@/lib/permisos';
import type { Socio } from '@/lib/types';

// «Dar de baja» y «Borrar sus datos»: dos cosas distintas que la pantalla
// mezclaba. La papelera de cada fila decía «¿Dar de baja a esta clienta?» y lo
// que hacía era BORRAR sus datos para siempre; «Desactivar» era un clic sin
// confirmación que dejaba su cuota renovándose y cobrándose.
//
// · Dar de baja: reversible. Cuenta, con sus datos, qué pasa con su cuota, su
//   plaza fija y sus reservas ANTES de pulsar (el mismo `planDeBaja` que ejecuta
//   app/api/socios/[id]/baja), y solo da por hecho lo que el servidor confirma.
// · Borrar sus datos: irreversible, solo la propietaria, escribiendo su nombre.

const RESERVA_FUTURA = new Set(['CONFIRMADA', 'LISTA_ESPERA', 'PENDIENTE_APROBACION']);

/** «jue 1 oct 18:00», en hora del estudio: sin comas dentro, porque van en una lista separada por comas. */
function diaCorto(iso: string): string {
  const p = Object.fromEntries(new Intl.DateTimeFormat('es-ES', {
    weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Europe/Madrid',
  }).formatToParts(new Date(iso)).map(x => [x.type, x.value]));
  return `${p.weekday} ${p.day} ${p.month} ${p.hour}:${p.minute}`.replace(/\./g, '');
}
function diaLargo(ymd: string): string {
  return new Date(`${ymd.slice(0, 10)}T12:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' });
}
const nombreCompleto = (s: Pick<Socio, 'nombre' | 'apellidos'>) => `${s.nombre} ${s.apellidos ?? ''}`.trim();

/** Resumen de lo que ha hecho la baja, para el aviso de después. Solo lo confirmado. */
export function resumenDeBaja(nombre: string, r: RespuestaBaja): string {
  const partes = [`${nombre} está de baja.`];
  if (r.cuotasAlVencer.length > 0) {
    const c = r.cuotasAlVencer[0];
    partes.push(r.cuotasAlVencer.length === 1 && c.fechaFin
      ? `Su cuota sigue hasta el ${diaLargo(c.fechaFin)} y no se renueva.`
      : 'Sus cuotas ya no se renuevan.');
  }
  if (r.cuotasCanceladas.length > 0) partes.push(r.cuotasCanceladas.length === 1 ? 'Su cuota se ha cancelado.' : 'Sus cuotas se han cancelado.');
  if (r.plazasDadasDeBaja.length > 0) partes.push('Su plaza fija se ha quitado.');
  const canceladas = r.reservasCanceladas.length;
  if (canceladas > 0) partes.push(canceladas === 1 ? '1 reserva cancelada.' : `${canceladas} reservas canceladas.`);
  if (r.reservasSinCancelar > 0) {
    partes.push(r.reservasSinCancelar === 1
      ? '1 reserva no se ha podido cancelar: revísala en su ficha.'
      : `${r.reservasSinCancelar} reservas no se han podido cancelar: revísalas en su ficha.`);
  }
  return partes.join(' ');
}

export function DialogoDarDeBaja({ socio, abierto, onCerrar, onHecho }: {
  socio: Socio;
  abierto: boolean;
  onCerrar: () => void;
  /** Con el texto de lo que ha pasado de verdad, para el aviso. */
  onHecho: (resumen: string) => void;
}) {
  if (!abierto) return null;
  return <ContenidoBaja socio={socio} onCerrar={onCerrar} onHecho={onHecho} />;
}

function ContenidoBaja({ socio, onCerrar, onHecho }: { socio: Socio; onCerrar: () => void; onHecho: (resumen: string) => void }) {
  const { suscripciones, planesTarifa, plazasFijas, reservas, sesiones, studio, darDeBajaSocia } = useStudio();
  const rol = useRol();
  // La hora se fija al abrir: no puede leerse en cada render (React Compiler).
  const [ahora] = useState(() => new Date());
  const [cancelarReservas, setCancelarReservas] = useState(true);
  const [motivo, setMotivo] = useState<MotivoBaja | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendientes, setPendientes] = useState<Record<string, ReciboPendienteDeLaCuota[]>>({});

  const plan = useMemo(() => planDeBaja(
    suscripciones.filter(s => s.socioId === socio.id),
    planesTarifa,
    plazasFijas.filter(p => p.socioId === socio.id),
    hoyEnEstudio(ahora),
  ), [suscripciones, planesTarifa, plazasFijas, socio.id, ahora]);

  const futuras = useMemo(() => {
    const inicioDe = new Map(sesiones.map(s => [s.id, s.inicio]));
    return reservas
      .filter(r => r.socioId === socio.id && RESERVA_FUTURA.has(r.estado))
      .map(r => ({ id: r.id, inicio: inicioDe.get(r.sesionId) }))
      .filter((r): r is { id: string; inicio: string } => !!r.inicio && new Date(r.inicio) > ahora)
      .sort((a, b) => a.inicio.localeCompare(b.inicio));
  }, [reservas, sesiones, socio.id, ahora]);

  // Sus recibos pendientes, leídos al abrir: la ventana dice qué pasa con ellos
  // con la política del estudio, como «Cancelar suscripción».
  const idsCuotas = [...plan.alVencer, ...plan.cancelarAhora].map(c => c.id).join(',');
  useEffect(() => {
    if (!idsCuotas) return;
    let vivo = true;
    void Promise.all(idsCuotas.split(',').map(async id => [id, await dbRecibosPendientesDeCuota(id)] as const))
      .then(pares => { if (vivo) setPendientes(Object.fromEntries(pares)); });
    return () => { vivo = false; };
  }, [idsCuotas]);

  const politica = studio?.recibosAlCancelarCuota ?? 'MANTENER_CON_REINTENTOS';
  // Cancelar reservas lo hace el servidor con el permiso de calendario: quien no
  // lo tiene no ve la casilla, y sus reservas se quedan como están.
  const puedeCancelarReservas = puedeGestionarCalendario(rol);
  const nombre = nombreCompleto(socio);

  async function confirmar() {
    if (enviando) return;
    if (!motivo) { setError('Elige por qué se da de baja.'); return; }
    setEnviando(true);
    setError(null);
    try {
      const r = await darDeBajaSocia(socio.id, { cancelarReservas: puedeCancelarReservas && futuras.length > 0 && cancelarReservas, motivo });
      if (r.ok !== true) { setError(r.error); return; }
      onHecho(resumenDeBaja(socio.nombre, r));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Dialog open onOpenChange={abierto => { if (!abierto && !enviando) onCerrar(); }}>
      <DialogContent className="max-w-md">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground"><UserX size={20} aria-hidden /></span>
          <div className="min-w-0">
            <DialogTitle className="text-base font-semibold text-foreground">Dar de baja a {nombre}</DialogTitle>
            <DialogDescription className="mt-0.5 text-[13px] text-muted-foreground text-pretty">
              Se puede deshacer: sigue en tu lista como «De baja» y la puedes volver a dar de alta cuando quieras.
            </DialogDescription>
          </div>
        </div>

        {/* Por qué se va: lo que el estudio quiere saber al mirar sus bajas. */}
        <fieldset>
          <legend className="mb-1.5 text-[12.5px] font-semibold text-foreground">Por qué se va</legend>
          <div className="flex flex-wrap gap-1.5">
            {MOTIVOS_BAJA.map(m => (
              <button
                key={m}
                type="button"
                aria-pressed={motivo === m}
                onClick={() => { setMotivo(m); setError(null); }}
                className={cn(
                  'min-h-10 rounded-full border px-3.5 text-[13px] font-medium transition-colors',
                  motivo === m ? 'border-transparent bg-foreground text-background' : 'border-border bg-card text-foreground hover:bg-muted',
                )}
              >
                {ETIQUETA_MOTIVO_BAJA[m]}
              </button>
            ))}
          </div>
          {motivo === 'OTRO' && (
            <p className="mt-1.5 text-[12px] text-muted-foreground">Si quieres contar más, déjalo en una nota de su ficha.</p>
          )}
          {motivo === 'PERSONAL' && (
            <p className="mt-1.5 text-[12px] text-muted-foreground text-pretty">Sin detalles: si tiene que ver con su salud, va en su pestaña Salud, que no ve todo el equipo.</p>
          )}
        </fieldset>

        <div className="mt-1 rounded-xl bg-muted/70 p-3.5">
          <p className="mb-1.5 text-[12.5px] font-semibold text-foreground">Qué pasa ahora</p>
          <ul className="space-y-1.5 text-[13px] text-foreground">
            {plan.alVencer.map(c => (
              <Linea key={c.id}>
                Su cuota <strong className="font-semibold">«{c.plan}»</strong> sigue hasta el {c.fechaFin ? diaLargo(c.fechaFin) : 'final del periodo'} y <strong className="font-semibold">ya no se renueva</strong>.{' '}
                {textoCobrosAlCancelar(politica, pendientes[c.id] ?? [], 'al-final')}
              </Linea>
            ))}
            {plan.cancelarAhora.map(c => (
              <Linea key={c.id}>
                Su cuota <strong className="font-semibold">«{c.plan}»</strong> se cancela hoy.{' '}
                {textoCobrosAlCancelar(politica, pendientes[c.id] ?? [], 'ahora')}
              </Linea>
            ))}
            {plan.plazas.length > 0 && (
              <Linea>Su plaza fija se quita: deja de apuntarla cada semana.</Linea>
            )}
            {plan.intactas.length > 0 && (
              <Linea>
                {plan.intactas.length === 1 ? <>Su «{plan.intactas[0].plan}» no se toca</> : <>Sus bonos no se tocan</>}: no se renuevan solos, y si vuelve los tiene.
              </Linea>
            )}
            {bajaSinConsecuencias(plan) && plan.intactas.length === 0 && (
              <Linea>No tiene cuota ni plaza fija activas: solo se marca como de baja.</Linea>
            )}
          </ul>
        </div>

        {futuras.length > 0 && (puedeCancelarReservas ? (
          <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-border px-3.5 py-3">
            <input
              type="checkbox"
              checked={cancelarReservas}
              onChange={e => setCancelarReservas(e.target.checked)}
              className="mt-0.5 size-4 shrink-0 accent-[var(--brand)]"
            />
            <span className="text-[13px] text-foreground">
              Cancelar {futuras.length === 1 ? 'su reserva' : <>sus <strong className="font-semibold">{futuras.length} reservas</strong></>} ({futuras.slice(0, 3).map(r => diaCorto(r.inicio)).join(', ')}{futuras.length > 3 ? '…' : ''})
              <span className="block text-[12px] text-muted-foreground">Sin penalización. Si hay lista de espera, la plaza pasa a la siguiente.</span>
            </span>
          </label>
        ) : (
          <p className="text-[12.5px] text-muted-foreground">
            {futuras.length === 1 ? 'Su reserva se mantiene.' : `Sus ${futuras.length} reservas se mantienen.`}
          </p>
        ))}

        <p className="text-[12.5px] text-muted-foreground text-pretty">
          ¿Lo que quieres es borrar sus datos? Eso es otra cosa, y no se puede deshacer: «Borrar sus datos», en esta misma ficha{rol === 'PROPIETARIO' ? '' : ' (solo la propietaria)'}.
        </p>

        {error && (
          <p role="alert" className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-[13px] text-destructive">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden />{error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCerrar} disabled={enviando} className="min-h-10 rounded-xl border border-border px-4 text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-50">
            Cancelar
          </button>
          <button type="button" onClick={() => void confirmar()} disabled={enviando || !motivo} className="min-h-10 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:brightness-95 disabled:opacity-60">
            {enviando ? 'Dando de baja…' : 'Dar de baja'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Linea({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2">
      <Check size={15} className="mt-0.5 shrink-0 text-success" aria-hidden />
      <span className="text-pretty">{children}</span>
    </li>
  );
}

/**
 * Borrar los datos de una clienta (RGPD). Irreversible: se escribe su nombre
 * para confirmar, y solo la propietaria llega a verlo (la ruta lo vuelve a
 * comprobar: `puedeBorrarDatosClienta`).
 */
export function DialogoBorrarDatos({ socio, abierto, borrando, error, onCerrar, onConfirmar }: {
  socio: Socio;
  abierto: boolean;
  borrando: boolean;
  /** Lo que ha dicho el servidor si no se ha podido: se enseña aquí, no detrás. */
  error?: string | null;
  onCerrar: () => void;
  onConfirmar: () => void;
}) {
  const [escrito, setEscrito] = useState('');
  const nombre = nombreCompleto(socio);
  const coincide = escrito.trim().toLocaleLowerCase('es') === nombre.toLocaleLowerCase('es');
  return (
    <Dialog open={abierto} onOpenChange={o => { if (!o && !borrando) { setEscrito(''); onCerrar(); } }}>
      <DialogContent className="max-w-md">
        <DialogTitle className="text-base font-semibold text-foreground">Borrar los datos de {nombre}</DialogTitle>
        <DialogDescription className="text-[13px] text-muted-foreground">
          Para cuando una clienta te pide que borres sus datos (RGPD).
        </DialogDescription>
        <div className="flex gap-2.5 rounded-xl border border-destructive/30 bg-destructive/[0.06] p-3.5 text-[13px] text-foreground">
          <AlertTriangle size={17} className="mt-0.5 shrink-0 text-destructive" aria-hidden />
          <span className="text-pretty">
            Esto <strong className="font-semibold">no se puede deshacer</strong>. Se borran su nombre, su contacto, su ficha de salud y sus notas, y se cancelan sus reservas futuras. Las facturas y los recibos se conservan sin su nombre, porque la ley obliga a guardarlos.
          </span>
        </div>
        <label className="block">
          <span className="mb-1.5 block text-[12.5px] font-semibold text-foreground">Escribe su nombre para confirmar</span>
          <input
            value={escrito}
            onChange={e => setEscrito(e.target.value)}
            placeholder={nombre}
            autoComplete="off"
            className="min-h-11 w-full rounded-lg border border-input bg-card px-3 text-base text-foreground [@media(pointer:fine)]:min-h-9 [@media(pointer:fine)]:text-[13px]"
          />
        </label>
        {error && (
          <p role="alert" className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-[13px] text-destructive">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden />{error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => { setEscrito(''); onCerrar(); }} disabled={borrando} className="min-h-10 rounded-xl border border-border px-4 text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-50">
            Cancelar
          </button>
          <button type="button" onClick={onConfirmar} disabled={!coincide || borrando} className="min-h-10 rounded-xl bg-destructive px-4 text-sm font-semibold text-destructive-foreground hover:brightness-95 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground">
            {borrando ? 'Borrando…' : 'Borrar para siempre'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
