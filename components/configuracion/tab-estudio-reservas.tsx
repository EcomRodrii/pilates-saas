'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { useStudio } from '@/lib/studio-context';
import type { Studio } from '@/lib/types';
import { Toggle, inputCls, labelCls, cardCls } from '@/app/(dashboard)/configuracion/page';
import { obtenerConfirmacionRiesgo, actualizarConfirmacionRiesgo } from '@/lib/api-client';

// P2 (auditoría "Veredicto de Marta"): los 13 campos de este formulario iban
// todos con el mismo peso visual en una sola columna — fácil confundir un
// campo con otro configurando rápido, sobre todo los de dinero. Puramente
// visual: no cambia ningún campo ni su lógica.
const grupoCls = 'text-[11px] font-bold uppercase tracking-wide text-muted-foreground pt-2 first:pt-0';

type PoliticaForm = {
  cancelacionVentanaHoras: number;
  cancelacionDevolverBonoTardia: boolean;
  cancelacionClaseDevuelveBono: boolean;
  // Migr 0086: caducidad de las recuperaciones que concede el estudio. Las
  // columnas existían desde entonces pero no había forma de tocarlas sin SQL.
  recuperacionCaducidadTipo: 'DIAS' | 'FIN_MES' | 'FIN_MES_SIGUIENTE';
  recuperacionCaducidadDias: number | null;
  reservaExigirPlan: boolean;
  reservaMaxSimultaneas: number | null;
  compraPublicaModo: 'EXIGIR_REGISTRO' | 'CREAR_FICHA';
  // Fase 1 de reglas por tipo de clase (migr 20260730152516): estos son los
  // DEFAULTS de estudio; cada tipo de clase puede sobrescribirlos.
  reservaVentanaMinimaMinutos: number;
  reservaAntelacionMaximaDias: number | null;
  permiteListaEspera: boolean;
  // Fase 2a (migr 20260730192445): mismo criterio, default de estudio.
  requiereAprobacion: boolean;
  // Fase 2b (migr 20260731130000): minutos para aceptar una plaza liberada.
  // 0 = confirmación instantánea (comportamiento clásico).
  listaEsperaPlazoAceptacionMinutos: number;
  // Fase 2c (migr 20260731140000): nº mínimo de asistentes CONFIRMADA para
  // que la clase se mantenga. 0 = sin mínimo.
  minimoAsistentesPorClase: number;
  // Fase 3 (migr 20260730225253): importe fijo en € por cancelación tardía o
  // no-show. NULL/0 = regla desactivada.
  penalizacionImporteEur: number | null;
  penalizacionAplicaCancelacionTardia: boolean;
  penalizacionAplicaNoShow: boolean;
  penalizacionCobroAutomatico: boolean;
  // Migr 20260809020328: default true = comportamiento de siempre (pase/QR
  // obligatorio). false = confía en la reserva: se marca asistida sola.
  requiereCheckinQr: boolean;
  // Migr 20260905151515: impedir reservar con un recibo FALLIDO o DEVUELTO.
  // Opt-in: encenderlo por defecto dejaría fuera a socias que hoy reservan.
  bloquearReservaImpago: boolean;
  // Migr 20260906005059: recuperaciones solas al cerrar la semana.
  recuperacionAutoSemanal: boolean;
};

function studioToPolitica(s: Studio | null): PoliticaForm {
  return {
    cancelacionVentanaHoras: s?.cancelacionVentanaHoras ?? 12,
    cancelacionDevolverBonoTardia: s?.cancelacionDevolverBonoTardia ?? false,
    cancelacionClaseDevuelveBono: s?.cancelacionClaseDevuelveBono ?? true,
    recuperacionCaducidadTipo: s?.recuperacionCaducidadTipo ?? 'FIN_MES_SIGUIENTE',
    recuperacionCaducidadDias: s?.recuperacionCaducidadDias ?? null,
    reservaExigirPlan: s?.reservaExigirPlan ?? true,
    reservaMaxSimultaneas: s?.reservaMaxSimultaneas ?? null,
    compraPublicaModo: s?.compraPublicaModo ?? 'EXIGIR_REGISTRO',
    reservaVentanaMinimaMinutos: s?.reservaVentanaMinimaMinutos ?? 0,
    reservaAntelacionMaximaDias: s?.reservaAntelacionMaximaDias ?? null,
    permiteListaEspera: s?.permiteListaEspera ?? true,
    requiereAprobacion: s?.requiereAprobacion ?? false,
    listaEsperaPlazoAceptacionMinutos: s?.listaEsperaPlazoAceptacionMinutos ?? 0,
    minimoAsistentesPorClase: s?.minimoAsistentesPorClase ?? 0,
    penalizacionImporteEur: s?.penalizacionImporteEur ?? null,
    penalizacionAplicaCancelacionTardia: s?.penalizacionAplicaCancelacionTardia ?? true,
    penalizacionAplicaNoShow: s?.penalizacionAplicaNoShow ?? true,
    penalizacionCobroAutomatico: s?.penalizacionCobroAutomatico ?? false,
    requiereCheckinQr: s?.requiereCheckinQr ?? true,
    bloquearReservaImpago: s?.bloquearReservaImpago ?? false,
    recuperacionAutoSemanal: s?.recuperacionAutoSemanal ?? false,
  };
}

export function TabEstudioReservas({ showToast }: { showToast: (m: string) => void }) {
  const { studio, updateStudio } = useStudio();
  const [pol, setPol] = useState(() => studioToPolitica(studio));

  const [studioAnterior, setStudioAnterior] = useState(studio);
  if (studio !== studioAnterior) {
    setStudioAnterior(studio);
    setPol(studioToPolitica(studio));
  }

  // Sin límite máximo (null) no hay conflicto posible; con límite, mismo
  // criterio que el override por tipo de clase (#867): comparar en minutos.
  const ventanaImposible = pol.reservaAntelacionMaximaDias != null
    && pol.reservaVentanaMinimaMinutos > pol.reservaAntelacionMaximaDias * 24 * 60;

  // ⚠️ «Pedir confirmación de asistencia» NO viaja en `pol`, y no es un
  // descuido.
  //
  // Vivía sola en Centro de Control, debajo de un desplegable cerrado por
  // defecto, y por eso una propietaria veía cancelarse reservas sin encontrar
  // nunca dónde se decidía eso. Su sitio son estas reglas. Pero su columna solo
  // la escribe `/api/decisiones/confirmacion-riesgo`, que además de comprobar
  // el rol exige plan con Centro de Control (el riesgo lo calcula el motor de
  // decisiones). Meterla en `updateStudio` —un UPDATE del cliente contra la
  // RLS— la habría regalado a cualquier plan sin que se notara. Se queda con su
  // endpoint, y por eso guarda al pulsar en vez de esperar al botón de abajo.
  const [confirmacion, setConfirmacion] = useState<boolean | null>(null); // null = cargando
  const [sinPlanConfirmacion, setSinPlanConfirmacion] = useState(false);
  const [guardandoConfirmacion, setGuardandoConfirmacion] = useState(false);
  useEffect(() => {
    let vivo = true;
    obtenerConfirmacionRiesgo().then(r => {
      if (!vivo) return;
      if ('activo' in r) { setConfirmacion(r.activo); return; }
      // Fallar en CERRADO para lo que se pinta: sin poder leerlo, se enseña
      // apagado y sin permitir tocarlo, nunca encendido por defecto.
      setConfirmacion(false);
      setSinPlanConfirmacion(true);
    });
    return () => { vivo = false; };
  }, []);

  async function cambiarConfirmacion(activo: boolean) {
    const previo = confirmacion;
    setConfirmacion(activo); // optimista
    setGuardandoConfirmacion(true);
    const r = await actualizarConfirmacionRiesgo(activo);
    setGuardandoConfirmacion(false);
    if ('error' in r) { setConfirmacion(previo); showToast(r.error); return; }
    showToast(activo ? 'Se pedirá confirmación a quien tenga más riesgo de no venir' : 'Ya no se pedirá confirmación');
  }

  // Todo el formulario espera al botón salvo «Pedir confirmación…», que guarda
  // al pulsar (ver arriba). Con los dos modelos en la misma tarjeta, quien
  // tocaba un interruptor y salía creía haberlo guardado (evaluación del
  // 13-sep): el botón va pegado abajo y dice si queda algo pendiente.
  const hayCambios = JSON.stringify(pol) !== JSON.stringify(studioToPolitica(studio));

  async function guardarPolitica() {
    if (ventanaImposible) return;
    const res = await updateStudio(pol);
    showToast(res.ok ? 'Política de reservas guardada' : res.error);
  }

  return (
    <div className="space-y-5 max-w-2xl">
      <div className={cn(cardCls, 'p-6')}>
        <h3 className="text-[14px] font-semibold text-foreground mb-1">Reservas y cancelaciones</h3>
        <p className="text-[12px] text-muted-foreground mb-4">
          Reglas que se aplican cuando una clienta reserva o cancela desde la página pública de reservas.
        </p>
        <div className="space-y-4">
          <p className={grupoCls}>General</p>
          <div>
            <p className={labelCls}>Ventana de cancelación (horas)</p>
            <input
              type="number" min={0} max={168} className={inputCls}
              value={pol.cancelacionVentanaHoras}
              onChange={e => setPol(p => ({ ...p, cancelacionVentanaHoras: Math.max(0, Number(e.target.value)) }))}
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Cancelar con menos antelación se considera tardío. 0 = sin penalización.
            </p>
          </div>
          <label className="flex items-center justify-between gap-4 cursor-pointer">
            <span className="text-[13px] text-foreground">
              Devolver la sesión del bono en cancelaciones tardías
              <span className="block text-[11px] text-muted-foreground">Desactivado: una cancelación tardía pierde la sesión (recomendado).</span>
            </span>
            <Toggle on={pol.cancelacionDevolverBonoTardia} onChange={v => setPol(p => ({ ...p, cancelacionDevolverBonoTardia: v }))} />
          </label>
          <label className="flex items-center justify-between gap-4 cursor-pointer">
            <span className="text-[13px] text-foreground">
              Devolver la sesión al cancelar tú una clase
              <span className="block text-[11px] text-muted-foreground">
                Cuando cancelas tú una clase completa (avería, baja de la instructora, mal
                tiempo...), las socias apuntadas recuperan la sesión en su bono. Desactívalo
                si prefieres que se les agote igual.
              </span>
            </span>
            <Toggle on={pol.cancelacionClaseDevuelveBono} onChange={v => setPol(p => ({ ...p, cancelacionClaseDevuelveBono: v }))} />
          </label>
          <label className="flex items-center justify-between gap-4 cursor-pointer">
            <span className="text-[13px] text-foreground">
              Exigir plan o bono activo para reservar
              <span className="block text-[11px] text-muted-foreground">La clienta necesita una suscripción activa o bono con sesiones para reservar.</span>
            </span>
            <Toggle on={pol.reservaExigirPlan} onChange={v => setPol(p => ({ ...p, reservaExigirPlan: v }))} />
          </label>
          {/* Quién puede comprar desde el enlace público sin tener ficha. Antes
              no había ajuste: se cobraba y no se entregaba nada (el webhook
              ignoraba el plan comprado). */}
          <div>
            <p className={labelCls}>Si alguien compra un bono desde tu enlace público y aún no es clienta</p>
            <div className="space-y-2 mt-1.5">
              {([
                ['EXIGIR_REGISTRO', 'Que se registre antes de pagar',
                 'Le pedimos su email y que acepte tus condiciones, y luego paga. Es lo más limpio: nadie paga sin haber aceptado el contrato.'],
                ['CREAR_FICHA', 'Que pague directamente',
                 'Cobras primero y le creamos la ficha con el email de su tarjeta. Vendes con menos pasos; a cambio entra sin contrato aceptado y se lo pediremos cuando entre a reservar.'],
              ] as const).map(([valor, titulo, detalle]) => (
                <label
                  key={valor}
                  className={cn(
                    'flex items-start gap-2.5 p-3 rounded-lg border cursor-pointer transition-colors',
                    pol.compraPublicaModo === valor ? 'border-brand bg-brand/5' : 'border-border hover:bg-muted',
                  )}
                >
                  <input
                    type="radio"
                    name="compra-publica-modo"
                    className="mt-0.5 accent-[var(--brand)]"
                    checked={pol.compraPublicaModo === valor}
                    onChange={() => setPol(p => ({ ...p, compraPublicaModo: valor }))}
                  />
                  <span>
                    <span className="block text-[13px] font-medium text-foreground">{titulo}</span>
                    <span className="block text-[11px] text-muted-foreground mt-0.5">{detalle}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <p className={labelCls}>Máximo de reservas simultáneas por clienta</p>
            <input
              type="number" min={0} max={99} className={inputCls}
              placeholder="Sin límite"
              value={pol.reservaMaxSimultaneas ?? ''}
              onChange={e => setPol(p => ({ ...p, reservaMaxSimultaneas: e.target.value === '' ? null : Math.max(0, Number(e.target.value)) }))}
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Reservas activas en clases futuras. Vacío = sin límite.
            </p>
          </div>
          {/* Migr 0086: la política ya existía en la BD y la aplica
              `calcular_caduca_recuperacion` dentro de `crear_recuperacion`,
              pero no había forma de cambiarla sin entrar a SQL. */}
          <p className={grupoCls}>Recuperaciones</p>
          <div>
            <p className={labelCls}>Cuándo caduca una recuperación</p>
            <select
              className={inputCls}
              value={pol.recuperacionCaducidadTipo}
              onChange={e => setPol(p => ({ ...p, recuperacionCaducidadTipo: e.target.value as PoliticaForm['recuperacionCaducidadTipo'] }))}
            >
              <option value="FIN_MES_SIGUIENTE">Al final del mes siguiente</option>
              <option value="FIN_MES">Al final del mes en curso</option>
              <option value="DIAS">Pasados unos días</option>
            </select>
            <p className="text-[11px] text-muted-foreground mt-1">
              Se calcula al conceder la recuperación, no desde la clase perdida.
            </p>
          </div>
          {pol.recuperacionCaducidadTipo === 'DIAS' && (
            <div>
              <p className={labelCls}>Días de validez</p>
              <input
                type="number" min={1} max={365} className={inputCls}
                placeholder="30"
                value={pol.recuperacionCaducidadDias ?? ''}
                onChange={e => setPol(p => ({ ...p, recuperacionCaducidadDias: e.target.value === '' ? null : Math.max(1, Number(e.target.value)) }))}
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Vacío = 30 días.
              </p>
            </div>
          )}
          {/* Fase 1 de reglas por tipo de clase (migr 20260730152516): estos son
              los defaults del estudio; cada tipo de clase los puede sobrescribir
              desde Clases → editar tipo de clase. */}
          <p className={grupoCls}>Antelación</p>
          <div>
            <p className={labelCls}>Antelación mínima para reservar (minutos)</p>
            <input
              type="number" min={0} className={inputCls}
              value={pol.reservaVentanaMinimaMinutos}
              onChange={e => setPol(p => ({ ...p, reservaVentanaMinimaMinutos: Math.max(0, Number(e.target.value)) }))}
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Se cierra la reserva con esta antelación. 0 = se puede reservar hasta el mismo inicio de la clase.
            </p>
          </div>
          <div>
            <p className={labelCls}>Antelación máxima para reservar (días)</p>
            <input
              type="number" min={0} className={inputCls}
              placeholder="Sin límite"
              value={pol.reservaAntelacionMaximaDias ?? ''}
              onChange={e => setPol(p => ({ ...p, reservaAntelacionMaximaDias: e.target.value === '' ? null : Math.max(0, Number(e.target.value)) }))}
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              No se puede reservar con más antelación que esta. Vacío = sin límite.
            </p>
            {ventanaImposible && (
              <p role="alert" className="text-[11px] text-destructive mt-1">
                La antelación mínima ({pol.reservaVentanaMinimaMinutos} min) es mayor que la máxima
                ({pol.reservaAntelacionMaximaDias} días) — nunca habría un momento válido para reservar.
              </p>
            )}
          </div>
          <p className={grupoCls}>Lista de espera y confirmación</p>
          <label className="flex items-center justify-between gap-4 cursor-pointer">
            <span className="text-[13px] text-foreground">
              Permitir lista de espera
              <span className="block text-[11px] text-muted-foreground">Con la clase llena, ¿se puede apuntar a la lista de espera?</span>
            </span>
            <Toggle on={pol.permiteListaEspera} onChange={v => setPol(p => ({ ...p, permiteListaEspera: v }))} />
          </label>
          <div>
            <p className={labelCls}>Plazo para aceptar una plaza liberada (minutos)</p>
            <input
              type="number" min={0} className={inputCls}
              placeholder="Sin plazo (confirmación instantánea)"
              value={pol.listaEsperaPlazoAceptacionMinutos || ''}
              onChange={e => setPol(p => ({ ...p, listaEsperaPlazoAceptacionMinutos: Math.max(0, Number(e.target.value) || 0) }))}
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Al liberarse una plaza, hoy se confirma sola a la primera de la lista aunque no esté mirando el móvil en ese momento — y si no aparece, la plaza se pierde. Con un plazo (p.ej. 15 min), le das tiempo a confirmar que la quiere antes de dársela; si no contesta, pasa a la siguiente. Vacío o 0 = como hasta ahora, sin plazo.
            </p>
          </div>
          <label className="flex items-center justify-between gap-4 cursor-pointer">
            <span className="text-[13px] text-foreground">
              Dar recuperaciones solas al cerrar la semana
              <span className="block text-[11px] text-muted-foreground">
                Cada lunes, a quien canceló a tiempo y no le dio tiempo a recuperar el hueco esa semana, le aparece una recuperación sin que tenga que pedírtela. Solo afecta a planes con límite semanal —con bono ya se devuelve la sesión sola— y respeta tu tope de 4 y tu política de caducidad.
              </span>
            </span>
            <Toggle on={pol.recuperacionAutoSemanal} onChange={v => setPol(p => ({ ...p, recuperacionAutoSemanal: v }))} />
          </label>
          <label className="flex items-center justify-between gap-4 cursor-pointer">
            <span className="text-[13px] text-foreground">
              No dejar reservar con un pago fallido
              <span className="block text-[11px] text-muted-foreground">
                Solo cuenta un cobro que se intentó y no salió (tarjeta rechazada o recibo devuelto), no una cuota emitida que aún está en plazo. Nunca bloquea desde mostrador —ahí decides tú— ni a quien acaba de pagar esa misma clase.
              </span>
            </span>
            <Toggle on={pol.bloquearReservaImpago} onChange={v => setPol(p => ({ ...p, bloquearReservaImpago: v }))} />
          </label>
          <label className={cn('flex items-center justify-between gap-4', sinPlanConfirmacion ? 'cursor-default' : 'cursor-pointer')}>
            <span className="text-[13px] text-foreground">
              Pedir confirmación a quien suele no venir
              <span className="block text-[11px] text-muted-foreground">
                La víspera se le manda un email para que confirme que viene. Si no
                confirma antes de la clase, se cancela su reserva y la plaza pasa a
                la lista de espera. <strong className="font-semibold">No se le pide a todo el mundo</strong>: solo a
                quien acumula faltas recientes, no a quien reserva y viene. Se
                guarda al pulsar, no hace falta el botón de abajo.
              </span>
              {sinPlanConfirmacion && (
                <span className="block text-[11px] text-muted-foreground mt-1">
                  Esta regla va con el Centro de Control: quien decide a quién pedírselo
                  es el motor de decisiones, y tu plan no lo incluye.
                </span>
              )}
            </span>
            <Toggle
              on={!!confirmacion}
              onChange={v => { if (!sinPlanConfirmacion) void cambiarConfirmacion(v); }}
              disabled={confirmacion === null || guardandoConfirmacion || sinPlanConfirmacion}
            />
          </label>
          <label className="flex items-center justify-between gap-4 cursor-pointer">
            <span className="text-[13px] text-foreground">
              Requerir aprobación manual
              <span className="block text-[11px] text-muted-foreground">La reserva no se confirma sola: queda pendiente hasta que la apruebes o la rechaces desde el calendario.</span>
            </span>
            <Toggle on={pol.requiereAprobacion} onChange={v => setPol(p => ({ ...p, requiereAprobacion: v }))} />
          </label>
          <label className="flex items-center justify-between gap-4 cursor-pointer">
            <span className="text-[13px] text-foreground">
              Pasar lista
              <span className="block text-[11px] text-muted-foreground">
                Desactívalo si confías en que quien reserva viene: toda reserva confirmada se da por asistida sola al terminar la clase, sin que nadie tenga que escanear nada ni marcarla a mano.
              </span>
              <span className="block text-[11px] text-muted-foreground mt-1">
                Es el valor por defecto: cada tipo de clase puede llevarte la contraria desde Configuración → Clases.
              </span>
              {!pol.requiereCheckinQr && !!pol.penalizacionImporteEur && pol.penalizacionAplicaNoShow && (
                <span className="block text-[11px] text-amber-600 mt-1">
                  Con esto desactivado y la penalización por no-show activa, nunca vas a poder cobrarla: toda reserva se da por asistida antes de que exista un &quot;no vino&quot; que penalizar. Puedes seguir marcando &quot;No asistió&quot; a mano desde Asistentes si lo ves en el momento.
                </span>
              )}
            </span>
            <Toggle on={pol.requiereCheckinQr} onChange={v => setPol(p => ({ ...p, requiereCheckinQr: v }))} />
          </label>
          <div>
            <p className={labelCls}>Mínimo de asistentes para mantener la clase</p>
            <input
              type="number" min={0} className={inputCls}
              placeholder="Sin mínimo"
              value={pol.minimoAsistentesPorClase || ''}
              onChange={e => setPol(p => ({ ...p, minimoAsistentesPorClase: Math.max(0, Number(e.target.value) || 0) }))}
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Si a 2h del inicio no se alcanza, la clase se cancela automáticamente y se devuelve el bono a las apuntadas. Vacío o 0 = sin mínimo.
            </p>
          </div>
          <p className={grupoCls}>Dinero y penalizaciones</p>
          <div>
            <p className={labelCls}>Penalización por cancelación tardía o no-show (€)</p>
            <input
              type="number" min={0} step="0.01" className={inputCls}
              placeholder="Sin penalización"
              value={pol.penalizacionImporteEur || ''}
              onChange={e => setPol(p => ({ ...p, penalizacionImporteEur: e.target.value === '' ? null : Math.max(0, Number(e.target.value)) }))}
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Se cobra a la tarjeta guardada de la socia (si tiene una) cuando cancela dentro de la ventana de cancelación o no se presenta. Vacío o 0 = sin cargo.
            </p>
          </div>
          {!!pol.penalizacionImporteEur && (
            <>
              <label className="flex items-center justify-between gap-4 cursor-pointer">
                <span className="text-[13px] text-foreground">
                  Aplicar a cancelaciones tardías
                </span>
                <Toggle on={pol.penalizacionAplicaCancelacionTardia} onChange={v => setPol(p => ({ ...p, penalizacionAplicaCancelacionTardia: v }))} />
              </label>
              <label className="flex items-center justify-between gap-4 cursor-pointer">
                <span className="text-[13px] text-foreground">
                  Aplicar a no-shows
                </span>
                <Toggle on={pol.penalizacionAplicaNoShow} onChange={v => setPol(p => ({ ...p, penalizacionAplicaNoShow: v }))} />
              </label>
              <label className="flex items-center justify-between gap-4 cursor-pointer">
                <span className="text-[13px] text-foreground">
                  Cobrar automáticamente
                  <span className="block text-[11px] text-muted-foreground">Cuando esté desactivado, cada cargo esperará tu aprobación antes de tocar la tarjeta de la socia.</span>
                </span>
                <Toggle on={pol.penalizacionCobroAutomatico} onChange={v => setPol(p => ({ ...p, penalizacionCobroAutomatico: v }))} />
              </label>
            </>
          )}
        </div>
        <div className="sticky bottom-0 -mx-6 -mb-6 mt-4 flex flex-wrap items-center gap-3 rounded-b-xl border-t border-border bg-card px-6 py-3">
          <button
            onClick={guardarPolitica}
            disabled={ventanaImposible || !hayCambios}
            className="px-4 py-2 rounded-lg bg-brand text-brand-foreground text-[12px] font-medium hover:brightness-95 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Guardar política de reservas
          </button>
          <p role="status" className={cn('text-[11px]', hayCambios ? 'font-medium text-foreground' : 'text-muted-foreground')}>
            {hayCambios ? 'Tienes cambios sin guardar.' : 'Sin cambios pendientes.'}
          </p>
        </div>
      </div>
    </div>
  );
}
