'use client';

import { useEffect, useId, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { useStudio } from '@/lib/studio-context';
import { Toggle, inputCls, labelCls } from '@/components/configuracion/estilos';
import { TarjetaAjuste } from '@/components/configuracion/shell/tarjeta-ajuste';
import { BarraGuardar } from '@/components/configuracion/shell/barra-guardar';
import { useFormularioEstudio } from '@/components/configuracion/formulario-estudio';
import { obtenerConfirmacionRiesgo, actualizarConfirmacionRiesgo } from '@/lib/api-client';
import { frasesPoliticaEstudio, type AjustePolitica } from '@/lib/politica-estudio-textos';
import { tarjetaPorId } from '@/lib/configuracion/secciones';
import {
  TARJETAS_REGLAS, antelacionImposible, formularioReglas, fraseAntelacion, reglasAGuardar, reglasGuardadas,
  tarjetasConCambios, type ReglasReservaForm,
} from '@/lib/configuracion/reglas-reserva';
import { elegirModoListaEspera, valoresDeListaEspera, type ModoListaEspera } from '@/lib/configuracion/lista-espera-modo';
import { InterruptorAvisarAlumnas } from '@/components/sustituciones/interruptor-avisar-alumnas';

// ─────────────────────────────────────────────────────────────────────────────
// Cómo reservan mis alumnas.
//
// Era UNA tarjeta con veintidós campos, quince de ellos plegados en «Opciones
// avanzadas», y un botón que guardaba todo. Ahora son cinco tarjetas —Reservar,
// Cancelar y recuperar, Lista de espera, Asistencia, Si cancela tarde o no
// viene— y una sola barra de guardar para la sección, que dice en cuáles hay
// cambios. Las columnas y los valores que se guardan son los de antes
// (lib/configuracion/reglas-reserva.ts); lo único que se fue es «Compra desde tu
// enlace» (a Alta de alumnas) y «Las instructoras crean sus clases» (a Mi
// equipo), que se guardan allí.
//
// ⚠️ Los ids de las tarjetas son estables a propósito: son anclas de enlaces y
// serán los grupos del resumen de la sección.
//
// Texto: una línea bajo cada título (la de secciones.ts) y ayudas de unas quince
// palabras bajo cada campo. Si algo necesita más, va en la ayuda, no aquí.
// ─────────────────────────────────────────────────────────────────────────────

// «Cambiar» lleva al control que decide la frase.
function irAAjuste(ajuste: AjustePolitica) {
  const el = document.getElementById(`ajuste-${ajuste}`);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  const control = el.querySelector<HTMLElement>('input:checked') ?? el.querySelector<HTMLElement>('input, select, button');
  control?.focus({ preventScroll: true });
}

const grupoCls = 'text-[11px] font-bold uppercase tracking-wide text-muted-foreground';
const ayudaCls = 'text-[11px] text-muted-foreground mt-1';

function FilaInterruptor({ id, titulo, on, onChange, disabled, children }: {
  id?: string;
  titulo: string;
  on: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  children?: ReactNode;
}) {
  return (
    <label id={id} className={cn('flex scroll-mt-32 items-center justify-between gap-4', disabled ? 'cursor-default' : 'cursor-pointer')}>
      <span className="text-[13px] text-foreground">
        {titulo}
        {children && <span className="mt-0.5 block space-y-1 text-[11px] text-muted-foreground">{children}</span>}
      </span>
      <Toggle on={on} onChange={onChange} disabled={disabled} />
    </label>
  );
}

const OPCIONES_LISTA: { modo: ModoListaEspera; titulo: (minutos: number | null) => string; detalle: string }[] = [
  {
    modo: 'sin-lista',
    titulo: () => 'Sin lista de espera',
    detalle: 'Con la clase llena, nadie más puede apuntarse.',
  },
  {
    modo: 'al-momento',
    titulo: () => 'Se da a la primera al momento',
    detalle: 'Se le confirma sola, aunque no esté mirando el móvil.',
  },
  {
    modo: 'con-plazo',
    titulo: minutos => (minutos ? `Se le ofrece durante ${minutos} minutos` : 'Se le ofrece durante unos minutos'),
    detalle: 'Si no la acepta a tiempo, pierde su turno y pasa a la siguiente.',
  },
];

export function TabEstudioReservas({ showToast }: { showToast: (m: string) => void }) {
  const { studio, reflejarStudioGuardado } = useStudio();
  const { form, setForm, guardar, descartar } = useFormularioEstudio(formularioReglas, showToast);
  const idCampo = useId();
  const cambiar = <K extends keyof ReglasReservaForm>(campo: K, valor: ReglasReservaForm[K]) =>
    setForm(f => ({ ...f, [campo]: valor }));

  // Lo guardado: de aquí salen las frases de arriba (nunca de lo que está a medio
  // editar: si «Guardar» falla, la frase no puede haber cambiado) y contra esto
  // se mide qué tarjetas tienen cambios.
  const guardado = reglasGuardadas(studio);

  // ⚠️ «Pedir confirmación de asistencia» NO viaja con el resto, y no es un
  // descuido.
  //
  // Su columna solo la escribe `/api/decisiones/confirmacion-riesgo`, que además
  // de comprobar el rol exige plan con Centro de Control (el riesgo lo calcula el
  // motor de decisiones). Meterla en `updateStudio` —un UPDATE del cliente contra
  // la RLS— la habría regalado a cualquier plan sin que se notara. Así que la
  // barra de guardar llama a su endpoint, nunca a `updateStudio`, y lo guardado y
  // lo elegido en pantalla van por separado.
  const [confirmacionGuardada, setConfirmacionGuardada] = useState<boolean | null>(null); // null = cargando
  const [confirmacion, setConfirmacion] = useState<boolean | null>(null);
  const [sinPlanConfirmacion, setSinPlanConfirmacion] = useState(false);
  useEffect(() => {
    let vivo = true;
    obtenerConfirmacionRiesgo().then(r => {
      if (!vivo) return;
      if ('activo' in r) { setConfirmacionGuardada(r.activo); setConfirmacion(r.activo); return; }
      // Fallar en CERRADO para lo que se pinta: sin poder leerlo, se enseña
      // apagado y sin permitir tocarlo, nunca encendido por defecto.
      setConfirmacionGuardada(false);
      setConfirmacion(false);
      setSinPlanConfirmacion(true);
    });
    return () => { vivo = false; };
  }, []);

  // ⚠️ «Avisar a las alumnas» TAMPOCO viaja con el resto, y este sí guarda al
  // pulsar: su único escritor es `/api/sustituciones` (action `config_avisar`),
  // el mismo componente que en Sustituciones. Meterlo en la barra mezclaría dos
  // endpoints en un solo «guardado» (#1971). Por eso va en su propia tarjeta.
  const avisarGuardado = studio?.avisarAlumnas ?? null;
  const frases = studio ? frasesPoliticaEstudio({ ...guardado, avisarAlumnas: avisarGuardado }) : [];

  // Llegar con un ancla (`#ajuste-avisar-alumnas` desde Sustituciones) lo
  // resuelve el shell de Configuración para todas las secciones.

  const tarjetasEstudio = tarjetasConCambios(form, guardado);
  const cambiaConfirmacion = confirmacion !== null && confirmacion !== confirmacionGuardada;
  const conCambios = TARJETAS_REGLAS.filter(t => tarjetasEstudio.includes(t) || (t === 'asistencia' && cambiaConfirmacion));
  const aGuardar = reglasAGuardar(form, guardado);

  async function guardarReglas(): Promise<string | null> {
    if (!aGuardar.ok) return aGuardar.problema.texto;
    const errores: string[] = [];
    if (tarjetasEstudio.length > 0) {
      // Las veinte columnas de la sección, y ninguna más (reglas-reserva.ts).
      const res = await guardar(aGuardar.reglas, null);
      if (!res) errores.push('ya se estaba guardando');
      else if (!res.ok) errores.push(res.error);
    }
    if (cambiaConfirmacion && confirmacion !== null) {
      const r = await actualizarConfirmacionRiesgo(confirmacion);
      // Si su endpoint dice que no, «Asistencia» sigue con cambios sin guardar.
      if ('error' in r) errores.push(r.error);
      else setConfirmacionGuardada(confirmacion);
    }
    if (errores.length) return errores.join(' · ');
    showToast('Reglas de reserva guardadas');
    return null;
  }

  function descartarTodo() {
    descartar();
    setConfirmacion(confirmacionGuardada);
  }

  const imposible = antelacionImposible(form.reservaVentanaMinimaMinutos, form.reservaAntelacionMaximaDias);
  const lista = valoresDeListaEspera(form.listaEspera, guardado);
  const minutosLista = lista.ok && lista.valores.listaEsperaPlazoAceptacionMinutos > 0 ? lista.valores.listaEsperaPlazoAceptacionMinutos : null;
  const cargoSinLista = !form.requiereCheckinQr && !!form.penalizacionImporteEur && form.penalizacionAplicaNoShow;

  return (
    <>
      {studio && (
        <TarjetaAjuste id="politica-explicada">
          <ul aria-labelledby="politica-explicada-titulo" className="divide-y divide-border">
            {frases.map(f => (
              <li key={f.id} className="flex items-start justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
                <span className="text-[13px] text-foreground">{f.texto}</span>
                <a
                  href={`#ajuste-${f.ajuste}`}
                  onClick={e => { e.preventDefault(); irAAjuste(f.ajuste); }}
                  className="shrink-0 text-[12px] font-medium text-foreground underline underline-offset-2 hover:no-underline"
                >
                  Cambiar
                </a>
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-muted-foreground mt-3">
            Cada tipo de clase puede cambiar algunas en Mis clases y citas → Tipos de clase.
          </p>
        </TarjetaAjuste>
      )}

      <TarjetaAjuste id="reservar">
        <div className="space-y-5">
          <FilaInterruptor titulo="Exigir plan o bono activo para reservar" on={form.reservaExigirPlan} onChange={v => cambiar('reservaExigirPlan', v)}>
            Sin suscripción activa ni bono con sesiones, no puede reservar.
          </FilaInterruptor>

          {/* Fase 1 de reglas por tipo de clase (migr 20260730152516): estos son
              los valores del estudio; cada tipo de clase los puede cambiar. Dos
              cifras con unidades distintas (días y minutos), dichas en una frase
              para que no haya que adivinar cuál es cuál. */}
          <fieldset className="space-y-2">
            <legend className={labelCls}>Con cuánta antelación se puede reservar</legend>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-foreground">
              <span>Desde</span>
              <input
                type="number" min={0} className={cn(inputCls, 'w-28')}
                placeholder="Sin límite"
                aria-label="Días antes de la clase en que se abre la reserva"
                aria-invalid={imposible}
                value={form.reservaAntelacionMaximaDias ?? ''}
                onChange={e => cambiar('reservaAntelacionMaximaDias', e.target.value === '' ? null : Math.max(0, Number(e.target.value)))}
              />
              <span>días antes</span>
            </div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-foreground">
              <span>Hasta</span>
              <input
                type="number" min={0} className={cn(inputCls, 'w-24')}
                aria-label="Minutos antes de empezar en que se cierra la reserva"
                aria-invalid={imposible}
                value={form.reservaVentanaMinimaMinutos}
                onChange={e => cambiar('reservaVentanaMinimaMinutos', Math.max(0, Number(e.target.value)))}
              />
              <span>minutos antes de que empiece</span>
            </div>
            <p role={imposible ? 'alert' : undefined} className={cn('text-[12px]', imposible ? 'font-medium text-destructive' : 'text-foreground')}>
              {fraseAntelacion(form.reservaVentanaMinimaMinutos, form.reservaAntelacionMaximaDias)}
            </p>
            <p className={ayudaCls}>Días vacío = sin límite. Minutos a 0 = hasta que empieza la clase.</p>
          </fieldset>

          <div>
            <label htmlFor={`${idCampo}-a-la-vez`} className={labelCls}>Reservas a la vez por alumna</label>
            <input
              type="number" min={0} max={99} className={inputCls}
              placeholder="Sin límite"
              id={`${idCampo}-a-la-vez`} value={form.reservaMaxSimultaneas ?? ''}
              onChange={e => cambiar('reservaMaxSimultaneas', e.target.value === '' ? null : Math.max(0, Number(e.target.value)))}
            />
            <p className={ayudaCls}>Reservas activas en clases futuras. Vacío = sin límite.</p>
          </div>

          <FilaInterruptor titulo="No dejar reservar con un pago fallido" on={form.bloquearReservaImpago} onChange={v => cambiar('bloquearReservaImpago', v)}>
            Solo con un cobro rechazado o devuelto. Desde mostrador nunca bloquea.
          </FilaInterruptor>

          <FilaInterruptor titulo="Aprobar cada reserva a mano" on={form.requiereAprobacion} onChange={v => cambiar('requiereAprobacion', v)}>
            Queda pendiente hasta que la apruebes, desde Inicio o desde la clase.
          </FilaInterruptor>
        </div>
      </TarjetaAjuste>

      <TarjetaAjuste id="cancelar-y-recuperar">
        <div className="space-y-5">
          <div id="ajuste-ventana-cancelacion" className="scroll-mt-32">
            <label htmlFor={`${idCampo}-ventana`} className={labelCls}>Plazo para cancelar sin perder la sesión (horas antes)</label>
            <input
              type="number" min={0} max={168} className={inputCls}
              id={`${idCampo}-ventana`} value={form.cancelacionVentanaHoras}
              onChange={e => cambiar('cancelacionVentanaHoras', Math.max(0, Number(e.target.value)))}
            />
            <p className={ayudaCls}>Con menos antelación es tardía. 0 = puede cancelar hasta el último momento.</p>
          </div>

          <FilaInterruptor
            id="ajuste-devolver-tardia"
            titulo="Devolver la sesión del bono en cancelaciones tardías"
            on={form.cancelacionDevolverBonoTardia}
            onChange={v => cambiar('cancelacionDevolverBonoTardia', v)}
          >
            Desactivado: pierde la sesión, y la plaza se libera igual (recomendado).
          </FilaInterruptor>

          {/* Desde #1342 este interruptor lo leen TODAS las cancelaciones de clase
              entera, no solo las del panel: `devolverBonosPorCancelacionClase` es
              también el camino del mínimo de asistentes y del cierre del centro. */}
          <FilaInterruptor
            id="ajuste-clase-devuelve-bono"
            titulo="Devolver la sesión al cancelar una clase entera"
            on={form.cancelacionClaseDevuelveBono}
            onChange={v => cambiar('cancelacionClaseDevuelveBono', v)}
          >
            También si se cancela sola, por no llegar al mínimo o por un cierre.
          </FilaInterruptor>

          <div>
            <label htmlFor={`${idCampo}-minimo`} className={labelCls}>Mínimo de alumnas para mantener la clase</label>
            <input
              type="number" min={0} className={inputCls}
              placeholder="Sin mínimo"
              id={`${idCampo}-minimo`} value={form.minimoAsistentesPorClase || ''}
              onChange={e => cambiar('minimoAsistentesPorClase', Math.max(0, Number(e.target.value) || 0))}
            />
            <p className={ayudaCls}>Si a 2 h del inicio no se alcanza, se cancela sola. Vacío = sin mínimo.</p>
          </div>

          {/* Migr 0086: la política ya existía en la BD y la aplica
              `calcular_caduca_recuperacion` dentro de `crear_recuperacion`. */}
          <h4 className={grupoCls}>Recuperaciones</h4>
          <div>
            <label htmlFor={`${idCampo}-caducidad`} className={labelCls}>Cuándo caduca una recuperación</label>
            <select
              className={inputCls}
              id={`${idCampo}-caducidad`} value={form.recuperacionCaducidadTipo}
              onChange={e => cambiar('recuperacionCaducidadTipo', e.target.value as ReglasReservaForm['recuperacionCaducidadTipo'])}
            >
              <option value="FIN_MES_SIGUIENTE">Al final del mes siguiente</option>
              <option value="FIN_MES">Al final del mes en curso</option>
              <option value="DIAS">Pasados unos días</option>
            </select>
            <p className={ayudaCls}>Se cuenta desde que se concede, no desde la clase perdida.</p>
          </div>
          {form.recuperacionCaducidadTipo === 'DIAS' && (
            <div>
              <label htmlFor={`${idCampo}-dias`} className={labelCls}>Días de validez</label>
              <input
                type="number" min={1} max={365} className={inputCls}
                placeholder="30"
                id={`${idCampo}-dias`} value={form.recuperacionCaducidadDias ?? ''}
                onChange={e => cambiar('recuperacionCaducidadDias', e.target.value === '' ? null : Math.max(1, Number(e.target.value)))}
              />
              <p className={ayudaCls}>Vacío = 30 días.</p>
            </div>
          )}
          <FilaInterruptor titulo="Dar recuperaciones solas al cerrar la semana" on={form.recuperacionAutoSemanal} onChange={v => cambiar('recuperacionAutoSemanal', v)}>
            Cada lunes, a quien canceló a tiempo y no recuperó. Solo planes con límite semanal.
          </FilaInterruptor>
        </div>
      </TarjetaAjuste>

      {/* Un control para dos columnas (lib/configuracion/lista-espera-modo.ts). */}
      <TarjetaAjuste id="lista-de-espera">
        <fieldset id="ajuste-lista-espera" className="scroll-mt-32 space-y-2">
          <legend className="sr-only">Cuando una clase se llena</legend>
          {OPCIONES_LISTA.map(o => {
            const elegida = form.listaEspera.modo === o.modo;
            return (
              <label
                key={o.modo}
                className={cn(
                  'flex items-start gap-2.5 rounded-lg border p-3 cursor-pointer transition-colors',
                  elegida ? 'border-brand bg-brand/5' : 'border-border hover:bg-muted',
                )}
              >
                <input
                  type="radio"
                  name={`${idCampo}-lista-espera`}
                  className="mt-0.5 accent-[var(--brand)]"
                  checked={elegida}
                  onChange={() => setForm(f => ({ ...f, listaEspera: elegirModoListaEspera(f.listaEspera, o.modo) }))}
                />
                <span>
                  <span className="block text-[13px] font-medium text-foreground">{o.titulo(o.modo === 'con-plazo' ? minutosLista : null)}</span>
                  <span className="mt-0.5 block text-[11px] text-muted-foreground">{o.detalle}</span>
                </span>
              </label>
            );
          })}
          {form.listaEspera.modo === 'con-plazo' && (
            <div className="pl-3 pt-1">
              <label htmlFor={`${idCampo}-plazo-espera`} className={labelCls}>Minutos para aceptar la plaza</label>
              <input
                type="number" min={1} className={cn(inputCls, 'w-28')}
                id={`${idCampo}-plazo-espera`}
                aria-invalid={!lista.ok}
                value={form.listaEspera.minutos}
                onChange={e => setForm(f => ({ ...f, listaEspera: { ...f.listaEspera, minutos: e.target.value } }))}
              />
              {!lista.ok && <p role="alert" className="mt-1 text-[11px] font-medium text-destructive">{lista.error}</p>}
            </div>
          )}
        </fieldset>
      </TarjetaAjuste>

      <TarjetaAjuste id="asistencia">
        <div className="space-y-5">
          <FilaInterruptor titulo="Pasar lista" on={form.requiereCheckinQr} onChange={v => cambiar('requiereCheckinQr', v)}>
            Desactivado: toda reserva confirmada cuenta como asistida al terminar la clase.
          </FilaInterruptor>
          <FilaInterruptor
            titulo="Pedir confirmación a quien suele no venir"
            on={!!confirmacion}
            onChange={v => { if (!sinPlanConfirmacion) setConfirmacion(v); }}
            disabled={confirmacion === null || sinPlanConfirmacion}
          >
            <span className="block">
              Si no confirma, se cancela su reserva. <strong className="font-semibold">No se le pide a todo el mundo</strong>: solo
              a quien suele faltar.
            </span>
            {sinPlanConfirmacion && (
              <span className="block">Esta regla va con el Centro de Control, y tu plan no lo incluye.</span>
            )}
          </FilaInterruptor>
        </div>
      </TarjetaAjuste>

      <TarjetaAjuste id="si-cancela-tarde-o-no-viene">
        <div className="space-y-5">
          <div>
            <label htmlFor={`${idCampo}-cargo`} className={labelCls}>Cargo por cancelar tarde o no venir sin avisar (€)</label>
            <input
              type="number" min={0} step="0.01" className={inputCls}
              placeholder="Sin cargo"
              id={`${idCampo}-cargo`} value={form.penalizacionImporteEur || ''}
              onChange={e => cambiar('penalizacionImporteEur', e.target.value === '' ? null : Math.max(0, Number(e.target.value)))}
            />
            <p className={ayudaCls}>A su tarjeta guardada, si tiene y aceptó tus condiciones. Vacío = sin cargo.</p>
          </div>
          {!!form.penalizacionImporteEur && (
            <>
              <h4 className={grupoCls}>A qué se aplica</h4>
              <FilaInterruptor titulo="Cobrar si cancela tarde" on={form.penalizacionAplicaCancelacionTardia} onChange={v => cambiar('penalizacionAplicaCancelacionTardia', v)} />
              <FilaInterruptor titulo="Cobrar también si no viene sin avisar" on={form.penalizacionAplicaNoShow} onChange={v => cambiar('penalizacionAplicaNoShow', v)} />
              <FilaInterruptor titulo="Cobrar automáticamente" on={form.penalizacionCobroAutomatico} onChange={v => cambiar('penalizacionCobroAutomatico', v)}>
                Desactivado: cada cargo espera tu aprobación.
              </FilaInterruptor>
            </>
          )}
          {cargoSinLista && (
            <p className="text-[11px] text-amber-600">
              Sin «Pasar lista», nunca habrá un «no vino» que cobrar: márcalo a mano en Asistentes.
            </p>
          )}
        </div>
      </TarjetaAjuste>

      {/* Guarda al pulsar y por su propio endpoint: tarjeta propia, y la marca
          «Se guarda al momento» lo dice antes de tocarlo. */}
      <TarjetaAjuste id="ajuste-avisar-alumnas">
        <InterruptorAvisarAlumnas
          guardado={avisarGuardado}
          onGuardado={v => reflejarStudioGuardado({ avisarAlumnas: v })}
        />
      </TarjetaAjuste>

      <BarraGuardar
        seccion="reservas"
        cambios={conCambios.map(t => tarjetaPorId(t).titulo)}
        bloqueo={aGuardar.ok ? null : aGuardar.problema.texto}
        onGuardar={guardarReglas}
        onDescartar={descartarTodo}
      />
    </>
  );
}
