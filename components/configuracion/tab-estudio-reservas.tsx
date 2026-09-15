'use client';

import { useEffect, useState, type ChangeEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useStudio } from '@/lib/studio-context';
import { Toggle, inputCls } from '@/components/configuracion/estilos';
import { BarraGuardar } from '@/components/configuracion/shell/barra-guardar';
import type { PropsFormularioCajon } from '@/components/configuracion/shell/cajon-ajuste';
import { esClicNormal, useNavegacionConfig } from '@/components/configuracion/shell/contexto';
import { Campo, useFormularioEstudio } from '@/components/configuracion/formulario-estudio';
import { obtenerConfirmacionRiesgo, actualizarConfirmacionRiesgo } from '@/lib/api-client';
import { hrefDeHerramienta } from '@/lib/configuracion/destino';
import { tarjetaPorId } from '@/lib/configuracion/secciones';
import {
  antelacionImposible, confirmarPenalizacion, confirmarPlazaFijaSinCuota, consecuenciaRegla, EXPLICACION_PAUSA_PLAZA_FIJA,
  EXPLICACION_PLAZA_FIJA_DESDE_APP, EXPLICACION_PLAZA_FIJA_SIN_CUOTA, formularioReglas, OPCIONES_FIN_PAUSA,
  OPCIONES_PLAZA_FIJA_SIN_CUOTA, reglasDeTarjetaAGuardar, reglasGuardadas,
  tarjetasConCambios, type ReglasReserva, type ReglasReservaForm, type TarjetaReglasId,
} from '@/lib/configuracion/reglas-reserva';
import { elegirModoListaEspera, valoresDeListaEspera, type ModoListaEspera } from '@/lib/configuracion/lista-espera-modo';

// ─────────────────────────────────────────────────────────────────────────────
// Los cajones de «Cómo reservan mis alumnas» (15-sep, v2).
//
// Eran cinco tarjetas abiertas, una explicación encima («Cuando algo cambia,
// Tentare…») y UNA barra de guardar para todas. Ahora cada regla es una fila con
// su valor de hoy (secciones/seccion-reservas.tsx) y se cambia aquí, en su cajón:
// como mucho seis campos, UNA línea de consecuencia con lo que va a pasar, qué
// tipos de clase la cambian y su «Guardar», que manda SOLO sus columnas
// (`reglasDeTarjetaAGuardar`, #2027). Las columnas y los valores, los de siempre
// (lib/configuracion/reglas-reserva.ts).
//
// ⚠️ «Pedir confirmación a quien suele no venir» NO viaja con el resto, y no es
// un descuido: su columna solo la escribe `/api/decisiones/confirmacion-riesgo`,
// que además de comprobar el rol exige plan con Centro de Control. Meterla en
// `updateStudio` —un UPDATE del cliente contra la RLS— la habría regalado a
// cualquier plan sin que se notara.
//
// ⚠️ «Si cancela tarde o no viene» es dinero: su «Guardar» pregunta antes, con
// la consecuencia (`confirmarPenalizacion`). Aquí no cambia nada de cómo se
// cobra; solo lo que se guarda y lo que se dice.
// ─────────────────────────────────────────────────────────────────────────────

export type TiposQueLaCambian = readonly { id: string; nombre: string }[];

export interface PropsCajonRegla extends PropsFormularioCajon {
  /** Los tipos de clase con su propio valor para esta regla (`excepcionesPorRegla`). */
  excepciones: TiposQueLaCambian;
}

// ── La confirmación de asistencia, por su endpoint ──────────────────────────

export interface ConfirmacionRiesgo {
  /** Lo guardado; `null` = cargando. */
  guardada: boolean | null;
  /** Sin poder leerla (normalmente, un plan sin Centro de Control): no se deja tocar. */
  sinPlan: boolean;
  fijar: (valor: boolean) => void;
}

export function useConfirmacionRiesgo(): ConfirmacionRiesgo {
  const [guardada, setGuardada] = useState<boolean | null>(null);
  const [sinPlan, setSinPlan] = useState(false);
  useEffect(() => {
    let vivo = true;
    obtenerConfirmacionRiesgo().then(r => {
      if (!vivo) return;
      if ('activo' in r) { setGuardada(r.activo); return; }
      // Fallar en CERRADO para lo que se pinta: sin poder leerlo, se enseña
      // apagado y sin permitir tocarlo, nunca encendido por defecto.
      setGuardada(false);
      setSinPlan(true);
    });
    return () => { vivo = false; };
  }, []);
  return { guardada, sinPlan, fijar: setGuardada };
}

// ── Piezas ──────────────────────────────────────────────────────────────────

/** Un sí/no dentro del cajón: espera al «Guardar». El `<label>` le da nombre al interruptor. */
function InterruptorCampo({ titulo, detalle, on, onChange, disabled, children }: {
  titulo: string;
  detalle?: string;
  on: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  children?: ReactNode;
}) {
  return (
    <label className={cn('flex min-h-11 items-center justify-between gap-4', disabled ? 'cursor-default' : 'cursor-pointer')}>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-foreground">{titulo}</span>
        {detalle && <span className="block text-sm text-muted-foreground text-pretty">{detalle}</span>}
        {children}
      </span>
      <Toggle on={on} onChange={onChange} disabled={disabled} />
    </label>
  );
}

/** Lo que va a pasar con lo que hay en pantalla. Una línea, antes de «Guardar». */
function Consecuencia({ texto, alerta }: { texto: string; alerta?: boolean }) {
  return (
    <p
      data-consecuencia=""
      role={alerta ? 'alert' : undefined}
      className={cn('rounded-lg px-3 py-2.5 text-sm text-pretty', alerta ? 'bg-destructive/10 font-medium text-destructive' : 'bg-muted text-foreground')}
    >
      {texto}
    </p>
  );
}

function enumerar(nombres: readonly string[]): string {
  if (nombres.length <= 1) return nombres[0] ?? '';
  if (nombres.length > 3) return `${nombres.slice(0, 2).join(', ')} y ${nombres.length - 2} más`;
  return `${nombres.slice(0, -1).join(', ')} y ${nombres.at(-1)}`;
}

/** «Reformer y Mat tienen su propia regla» y a un toque, los tipos de clase (por el shell: #2030).
 *  `cargo`: en el del cargo no «la cambian»: su importe propio no se cobra nunca. */
function TiposDeClaseQueLaCambian({ tipos, cargo = false }: { tipos: TiposQueLaCambian; cargo?: boolean }) {
  const nav = useNavegacionConfig();
  if (tipos.length === 0) return null;
  return (
    <div data-excepciones="" className="text-sm text-muted-foreground text-pretty">
      <p>
        {enumerar(tipos.map(t => t.nombre))} {tipos.length === 1 ? 'tiene' : 'tienen'}{' '}
        {cargo ? 'su propio cargo, y no se cobra: tus alumnas solo aceptaron el del estudio.' : 'su propia regla: no siguen esta.'}
      </p>
      <Link
        href={hrefDeHerramienta('tipos-de-clase')}
        onClick={e => {
          if (!nav || !esClicNormal(e)) return;
          e.preventDefault();
          nav.irA('clases', { abrir: 'tipos-de-clase', modo: 'push' });
        }}
        className="inline-flex min-h-11 items-center font-medium text-foreground underline underline-offset-2 hover:no-underline"
      >
        Ver tipos de clase
      </Link>
    </div>
  );
}

const numeroDe = (e: ChangeEvent<HTMLInputElement>) => Math.max(0, Number(e.target.value) || 0);
const numeroOVacio = (e: ChangeEvent<HTMLInputElement>) => (e.target.value === '' ? null : Math.max(0, Number(e.target.value) || 0));

/** Lo que comparten los cajones que escriben en la fila del estudio. */
function useRegla(tarjeta: TarjetaReglasId, { showToast, onGuardado }: PropsFormularioCajon) {
  const { studio } = useStudio();
  const { form, setForm, guardar, descartar } = useFormularioEstudio(formularioReglas, showToast);
  const guardado = reglasGuardadas(studio);
  const aGuardar = reglasDeTarjetaAGuardar(tarjeta, form, guardado);
  const cambiar = <K extends keyof ReglasReservaForm>(campo: K, valor: ReglasReservaForm[K]) =>
    setForm(f => ({ ...f, [campo]: valor }));

  async function guardarRegla(): Promise<string | null> {
    if (!aGuardar.ok) return aGuardar.texto;
    // Solo las columnas de esta tarjeta; «Guardado» solo con la fila confirmada.
    const res = await guardar(aGuardar.cambios, null);
    if (!res) return 'Ya se estaba guardando';
    if (!res.ok) return res.error;
    onGuardado('Reglas de reserva guardadas');
    return null;
  }

  return {
    form,
    setForm,
    cambiar,
    descartar,
    guardado,
    /** Lo guardado con lo de esta tarjeta que hay en pantalla: de aquí sale la consecuencia. */
    enPantalla: (aGuardar.ok ? { ...guardado, ...aGuardar.cambios } : guardado) as ReglasReserva,
    conCambios: tarjetasConCambios(form, guardado).includes(tarjeta),
    bloqueo: aGuardar.ok ? null : aGuardar.texto,
    guardarRegla,
  };
}

function Barra({ tarjeta, r, confirmar }: {
  tarjeta: TarjetaReglasId;
  r: Pick<ReturnType<typeof useRegla>, 'conCambios' | 'bloqueo' | 'guardarRegla' | 'descartar'>;
  confirmar?: Parameters<typeof BarraGuardar>[0]['confirmar'];
}) {
  return (
    <BarraGuardar
      seccion="reservas"
      cambios={r.conCambios ? [tarjetaPorId(tarjeta).titulo] : []}
      bloqueo={r.bloqueo}
      confirmar={confirmar}
      onGuardar={r.guardarRegla}
      onDescartar={r.descartar}
    />
  );
}

const CUERPO = 'flex flex-col gap-5 pb-6';

// ── Reservar ────────────────────────────────────────────────────────────────

export function FormReservar({ excepciones, ...props }: PropsCajonRegla) {
  const r = useRegla('reservar', props);
  const { form, cambiar } = r;
  const imposible = antelacionImposible(form.reservaVentanaMinimaMinutos, form.reservaAntelacionMaximaDias);
  return (
    <>
      <div className={CUERPO}>
        <InterruptorCampo
          titulo="Exigir plan o bono activo para reservar"
          detalle="Sin suscripción activa ni bono con sesiones, no puede reservar."
          on={form.reservaExigirPlan}
          onChange={v => cambiar('reservaExigirPlan', v)}
        />
        {/* Dos cifras con unidades distintas (días y minutos), dichas en una
            frase para que no haya que adivinar cuál es cuál. */}
        <fieldset className="space-y-2">
          <legend className="mb-1 text-sm font-medium text-foreground">Con cuánta antelación se puede reservar</legend>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-foreground">
            <span>Desde</span>
            <input
              type="number" min={0} inputMode="numeric" className={cn(inputCls, 'w-28')}
              placeholder="Sin límite"
              aria-label="Días antes de la clase en que se abre la reserva"
              aria-invalid={imposible}
              value={form.reservaAntelacionMaximaDias ?? ''}
              onChange={e => cambiar('reservaAntelacionMaximaDias', numeroOVacio(e))}
            />
            <span>días antes</span>
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-foreground">
            <span>Hasta</span>
            <input
              type="number" min={0} inputMode="numeric" className={cn(inputCls, 'w-24')}
              aria-label="Minutos antes de empezar en que se cierra la reserva"
              aria-invalid={imposible}
              value={form.reservaVentanaMinimaMinutos}
              onChange={e => cambiar('reservaVentanaMinimaMinutos', numeroDe(e))}
            />
            <span>minutos antes</span>
          </div>
          <p className="text-xs text-muted-foreground">Días vacío = sin límite. Minutos a 0 = hasta que empieza.</p>
        </fieldset>
        <Campo label="Reservas a la vez por alumna" ayuda="Reservas activas en clases futuras. Vacío = sin límite.">
          {id => (
            <input
              id={id} type="number" min={0} max={99} inputMode="numeric" className={inputCls} placeholder="Sin límite"
              value={form.reservaMaxSimultaneas ?? ''}
              onChange={e => cambiar('reservaMaxSimultaneas', numeroOVacio(e))}
            />
          )}
        </Campo>
        <InterruptorCampo
          titulo="No dejar reservar con un pago fallido"
          detalle="Solo con un cobro rechazado o devuelto. Desde mostrador nunca bloquea."
          on={form.bloquearReservaImpago}
          onChange={v => cambiar('bloquearReservaImpago', v)}
        />
        <InterruptorCampo
          titulo="Aprobar cada reserva a mano"
          detalle="Queda pendiente hasta que la apruebes, desde Inicio o desde la clase."
          on={form.requiereAprobacion}
          onChange={v => cambiar('requiereAprobacion', v)}
        />
        <Consecuencia
          alerta={imposible}
          texto={consecuenciaRegla('reservar', { ...r.guardado, reservaVentanaMinimaMinutos: form.reservaVentanaMinimaMinutos, reservaAntelacionMaximaDias: form.reservaAntelacionMaximaDias })}
        />
        <TiposDeClaseQueLaCambian tipos={excepciones} />
      </div>
      <Barra tarjeta="reservar" r={r} />
    </>
  );
}

// ── Cancelar y recuperar ────────────────────────────────────────────────────

export function FormCancelarYRecuperar({ excepciones, ...props }: PropsCajonRegla) {
  const r = useRegla('cancelar-y-recuperar', props);
  const { form, cambiar } = r;
  return (
    <>
      <div className={CUERPO}>
        <Campo label="Plazo para cancelar sin perder la sesión (horas antes)" ayuda="0 = puede cancelar hasta el último momento.">
          {id => (
            <input
              id={id} type="number" min={0} max={168} inputMode="numeric" className={inputCls}
              value={form.cancelacionVentanaHoras}
              onChange={e => cambiar('cancelacionVentanaHoras', numeroDe(e))}
            />
          )}
        </Campo>
        <InterruptorCampo
          titulo="Devolver la sesión del bono en cancelaciones tardías"
          detalle="Desactivado: pierde la sesión, y la plaza se libera igual (recomendado)."
          on={form.cancelacionDevolverBonoTardia}
          onChange={v => cambiar('cancelacionDevolverBonoTardia', v)}
        />
        {/* Migr 0086: la política la aplica `calcular_caduca_recuperacion` dentro de `crear_recuperacion`. */}
        <Campo label="Cuándo caduca una recuperación" ayuda="Se cuenta desde que se concede, no desde la clase perdida.">
          {id => (
            <select
              id={id} className={inputCls}
              value={form.recuperacionCaducidadTipo}
              onChange={e => cambiar('recuperacionCaducidadTipo', e.target.value as ReglasReservaForm['recuperacionCaducidadTipo'])}
            >
              <option value="FIN_MES_SIGUIENTE">Al final del mes siguiente</option>
              <option value="FIN_MES">Al final del mes en curso</option>
              <option value="DIAS">Pasados unos días</option>
            </select>
          )}
        </Campo>
        {form.recuperacionCaducidadTipo === 'DIAS' && (
          <Campo label="Días de validez" ayuda="Vacío = 30 días.">
            {id => (
              <input
                id={id} type="number" min={1} max={365} inputMode="numeric" className={inputCls} placeholder="30"
                value={form.recuperacionCaducidadDias ?? ''}
                onChange={e => cambiar('recuperacionCaducidadDias', e.target.value === '' ? null : Math.max(1, Number(e.target.value) || 1))}
              />
            )}
          </Campo>
        )}
        <InterruptorCampo
          titulo="Dar recuperaciones solas al cerrar la semana"
          detalle="Cada lunes, a quien canceló a tiempo y no recuperó. Solo planes con límite semanal."
          on={form.recuperacionAutoSemanal}
          onChange={v => cambiar('recuperacionAutoSemanal', v)}
        />
        <Consecuencia texto={consecuenciaRegla('cancelar-y-recuperar', r.enPantalla)} />
        <TiposDeClaseQueLaCambian tipos={excepciones} />
      </div>
      <Barra tarjeta="cancelar-y-recuperar" r={r} />
    </>
  );
}

// ── Si se cancela una clase entera ──────────────────────────────────────────

export function FormClaseCancelada({ excepciones, ...props }: PropsCajonRegla) {
  const r = useRegla('si-se-cancela-una-clase', props);
  const { form, cambiar } = r;
  return (
    <>
      <div className={CUERPO}>
        {/* Desde #1342 este interruptor lo leen TODAS las cancelaciones de clase
            entera, no solo las del panel: `devolverBonosPorCancelacionClase` es
            también el camino del mínimo de asistentes y del cierre del centro. */}
        <InterruptorCampo
          titulo="Devolver la sesión al cancelar una clase entera"
          detalle="También si se cancela sola, por no llegar al mínimo o por un cierre."
          on={form.cancelacionClaseDevuelveBono}
          onChange={v => cambiar('cancelacionClaseDevuelveBono', v)}
        />
        <Campo label="Mínimo de alumnas para mantener la clase" ayuda="Vacío = sin mínimo.">
          {id => (
            <input
              id={id} type="number" min={0} inputMode="numeric" className={inputCls} placeholder="Sin mínimo"
              value={form.minimoAsistentesPorClase || ''}
              onChange={e => cambiar('minimoAsistentesPorClase', numeroDe(e))}
            />
          )}
        </Campo>
        <Consecuencia texto={consecuenciaRegla('si-se-cancela-una-clase', r.enPantalla)} />
        <TiposDeClaseQueLaCambian tipos={excepciones} />
      </div>
      <Barra tarjeta="si-se-cancela-una-clase" r={r} />
    </>
  );
}

// ── Lista de espera ─────────────────────────────────────────────────────────

const OPCIONES_LISTA: { modo: ModoListaEspera; titulo: (minutos: number | null) => string; detalle: string }[] = [
  { modo: 'sin-lista', titulo: () => 'Sin lista de espera', detalle: 'Con la clase llena, nadie más puede apuntarse.' },
  { modo: 'al-momento', titulo: () => 'Se da a la primera al momento', detalle: 'Se le confirma sola, aunque no esté mirando el móvil.' },
  {
    modo: 'con-plazo',
    titulo: minutos => (minutos ? `Se le ofrece durante ${minutos} minutos` : 'Se le ofrece durante unos minutos'),
    detalle: 'Si no la acepta a tiempo, pierde su turno y pasa a la siguiente.',
  },
];

/** Un control para dos columnas (lib/configuracion/lista-espera-modo.ts). */
export function FormListaEspera({ excepciones, ...props }: PropsCajonRegla) {
  const r = useRegla('lista-de-espera', props);
  const { form, setForm } = r;
  const lista = valoresDeListaEspera(form.listaEspera, r.guardado);
  const minutosLista = lista.ok && lista.valores.listaEsperaPlazoAceptacionMinutos > 0 ? lista.valores.listaEsperaPlazoAceptacionMinutos : null;
  return (
    <>
      <div className={CUERPO}>
        <fieldset className="space-y-2">
          <legend className="sr-only">Cuando una clase se llena</legend>
          {OPCIONES_LISTA.map(o => {
            const elegida = form.listaEspera.modo === o.modo;
            return (
              <label
                key={o.modo}
                className={cn(
                  'flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors',
                  elegida ? 'border-brand bg-brand/5' : 'border-border hover:bg-muted',
                )}
              >
                <input
                  type="radio"
                  name="lista-de-espera"
                  className="mt-1 accent-[var(--brand)]"
                  checked={elegida}
                  onChange={() => setForm(f => ({ ...f, listaEspera: elegirModoListaEspera(f.listaEspera, o.modo) }))}
                />
                <span>
                  <span className="block text-sm font-medium text-foreground">{o.titulo(o.modo === 'con-plazo' ? minutosLista : null)}</span>
                  <span className="block text-sm text-muted-foreground text-pretty">{o.detalle}</span>
                </span>
              </label>
            );
          })}
        </fieldset>
        {form.listaEspera.modo === 'con-plazo' && (
          <Campo label="Minutos para aceptar la plaza" error={lista.ok ? null : lista.error}>
            {id => (
              <input
                id={id} type="number" min={1} inputMode="numeric" className={cn(inputCls, 'max-w-40')}
                aria-invalid={!lista.ok}
                value={form.listaEspera.minutos}
                onChange={e => { const minutos = e.target.value; setForm(f => ({ ...f, listaEspera: { ...f.listaEspera, minutos } })); }}
              />
            )}
          </Campo>
        )}
        {lista.ok && <Consecuencia texto={consecuenciaRegla('lista-de-espera', r.enPantalla)} />}
        <TiposDeClaseQueLaCambian tipos={excepciones} />
      </div>
      <Barra tarjeta="lista-de-espera" r={r} />
    </>
  );
}

// ── Asistencia ──────────────────────────────────────────────────────────────

export function FormAsistencia({ excepciones, confirmacion, showToast, onGuardado }: PropsCajonRegla & { confirmacion: ConfirmacionRiesgo }) {
  // «Guardado» con las DOS escrituras confirmadas: la columna del estudio y el
  // endpoint de la confirmación. Si una dice que no, el cajón se queda.
  const r = useRegla('asistencia', { showToast, onGuardado: () => {} });
  const { form, cambiar } = r;
  const { studio, updateStudio } = useStudio();

  // Lo elegido para la confirmación; se pone al día con lo guardado mientras no se toque.
  const [pedir, setPedir] = useState(confirmacion.guardada);
  const [vista, setVista] = useState(confirmacion.guardada);
  if (confirmacion.guardada !== vista) {
    setVista(confirmacion.guardada);
    if (pedir === vista) setPedir(confirmacion.guardada);
  }
  const cambiaPedir = pedir !== null && pedir !== confirmacion.guardada;
  const cambiaLista = form.requiereCheckinQr !== r.guardado.requiereCheckinQr;

  async function guardarAsistencia(): Promise<string | null> {
    const errores: string[] = [];
    if (cambiaLista) {
      const res = await updateStudio({ requiereCheckinQr: form.requiereCheckinQr });
      if (!res.ok) errores.push(res.error);
    }
    if (cambiaPedir && pedir !== null) {
      const res = await actualizarConfirmacionRiesgo(pedir);
      if ('error' in res) errores.push(res.error);
      else confirmacion.fijar(pedir);
    }
    if (errores.length) return errores.join(' · ');
    onGuardado('Reglas de reserva guardadas');
    return null;
  }

  function descartar() {
    r.descartar();
    setPedir(confirmacion.guardada);
  }

  return (
    <>
      <div className={CUERPO}>
        <InterruptorCampo
          titulo="Pasar lista"
          detalle="Desactivado: toda reserva confirmada cuenta como asistida al terminar la clase."
          on={form.requiereCheckinQr}
          onChange={v => cambiar('requiereCheckinQr', v)}
        />
        <InterruptorCampo
          titulo="Pedir confirmación a quien suele no venir"
          on={!!pedir}
          onChange={v => { if (!confirmacion.sinPlan) setPedir(v); }}
          disabled={pedir === null || confirmacion.sinPlan}
        >
          <span className="block text-sm text-muted-foreground text-pretty">
            Si no confirma, se cancela. <strong className="font-semibold">No se le pide a todo el mundo</strong>, solo a quien falta.
          </span>
          {confirmacion.sinPlan && (
            <span className="block text-sm text-muted-foreground">Esta regla va con el Centro de Control, y tu plan no lo incluye.</span>
          )}
        </InterruptorCampo>
        <Consecuencia texto={consecuenciaRegla('asistencia', { ...reglasGuardadas(studio), requiereCheckinQr: form.requiereCheckinQr })} />
        <TiposDeClaseQueLaCambian tipos={excepciones} />
      </div>
      <BarraGuardar
        seccion="reservas"
        cambios={cambiaLista || cambiaPedir ? [tarjetaPorId('asistencia').titulo] : []}
        onGuardar={guardarAsistencia}
        onDescartar={descartar}
      />
    </>
  );
}

// ── Si cancela tarde o no viene ─────────────────────────────────────────────

export function FormPenalizacion({ excepciones, ...props }: PropsCajonRegla) {
  const r = useRegla('si-cancela-tarde-o-no-viene', props);
  const { form, cambiar, guardado, enPantalla } = r;
  const { tiposClase, textosLegalesPropios } = useStudio();
  const importe = form.penalizacionImporteEur ?? 0;
  // Sin «Pasar lista» nunca hay un «no vino» que detectar solo.
  const cargoSinLista = !guardado.requiereCheckinQr && importe > 0 && form.penalizacionAplicaNoShow;

  return (
    <>
      <div className={CUERPO}>
        <Campo label="Cargo por cancelar tarde o no venir sin avisar (€)" ayuda="A su tarjeta guardada, si tiene y aceptó tus condiciones. Vacío = sin cargo.">
          {id => (
            <input
              id={id} type="number" min={0} step="0.01" inputMode="decimal" className={inputCls} placeholder="Sin cargo"
              value={form.penalizacionImporteEur || ''}
              onChange={e => cambiar('penalizacionImporteEur', e.target.value === '' ? null : Math.max(0, Number(e.target.value) || 0))}
            />
          )}
        </Campo>
        {importe > 0 && (
          <>
            <InterruptorCampo titulo="Cobrar si cancela tarde" on={form.penalizacionAplicaCancelacionTardia} onChange={v => cambiar('penalizacionAplicaCancelacionTardia', v)} />
            <InterruptorCampo titulo="Cobrar también si no viene sin avisar" on={form.penalizacionAplicaNoShow} onChange={v => cambiar('penalizacionAplicaNoShow', v)} />
            <InterruptorCampo
              titulo="Cobrar automáticamente"
              detalle="Desactivado: cada cargo espera tu aprobación."
              on={form.penalizacionCobroAutomatico}
              onChange={v => cambiar('penalizacionCobroAutomatico', v)}
            />
          </>
        )}
        {cargoSinLista && (
          <p className="text-sm text-warning text-pretty">Sin pasar lista, nunca habrá un «no vino» que cobrar: márcalo a mano en Asistentes.</p>
        )}
        <Consecuencia texto={consecuenciaRegla('si-cancela-tarde-o-no-viene', enPantalla)} />
        <TiposDeClaseQueLaCambian tipos={excepciones} cargo />
      </div>
      <Barra
        tarjeta="si-cancela-tarde-o-no-viene"
        r={r}
        confirmar={confirmarPenalizacion(guardado, enPantalla, {
          terminosPropios: !!textosLegalesPropios?.terminosServicio,
          tiposConCargoPropio: tiposClase.filter(t => (t.penalizacionImporteEur ?? 0) > 0).length,
        })}
      />
    </>
  );
}

// ── Si se queda sin cuota (plaza fija) ──────────────────────────────────────
//
// Una sola columna (`plaza_fija_sin_cuota`) con tres opciones. Pasar a «Liberar»
// pregunta antes: cancela clases de alumnas (`confirmarPlazaFijaSinCuota`).

export function FormSinCuota(props: PropsCajonRegla) {
  const r = useRegla('si-se-queda-sin-cuota', props);
  const { form, cambiar, guardado, enPantalla } = r;
  return (
    <>
      <div className={CUERPO}>
        <p className="text-sm text-muted-foreground text-pretty">{EXPLICACION_PLAZA_FIJA_SIN_CUOTA}</p>
        <fieldset className="space-y-2">
          <legend className="sr-only">Qué pasa con las clases que ya tenía reservadas</legend>
          {OPCIONES_PLAZA_FIJA_SIN_CUOTA.map(o => {
            const elegida = form.plazaFijaSinCuota === o.valor;
            return (
              <label
                key={o.valor}
                className={cn(
                  'flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors',
                  elegida ? 'border-brand bg-brand/5' : 'border-border hover:bg-muted',
                )}
              >
                <input
                  type="radio"
                  name="si-se-queda-sin-cuota"
                  className="mt-1 accent-[var(--brand)]"
                  checked={elegida}
                  onChange={() => cambiar('plazaFijaSinCuota', o.valor)}
                />
                <span>
                  <span className="block text-sm font-medium text-foreground">{o.titulo}</span>
                  <span className="block text-sm text-muted-foreground text-pretty">{o.detalle}</span>
                </span>
              </label>
            );
          })}
        </fieldset>
        <Consecuencia texto={consecuenciaRegla('si-se-queda-sin-cuota', enPantalla)} />
      </div>
      <Barra
        tarjeta="si-se-queda-sin-cuota"
        r={r}
        confirmar={confirmarPlazaFijaSinCuota(guardado.plazaFijaSinCuota, enPantalla.plazaFijaSinCuota)}
      />
    </>
  );
}

// ── Peticiones desde su app (plaza fija) ────────────────────────────────────
//
// Dos puertas (`plaza_fija_solicitar_desde_app`, `plaza_fija_pausa_desde_app`):
// la alumna pide y el estudio decide en Inicio
// (components/dashboard/plazas-fijas-por-decidir.tsx). Encenderlas no cambia nada
// de lo que ya hay, así que no pregunta.

export function FormPlazaFijaDesdeApp(props: PropsCajonRegla) {
  const r = useRegla('plaza-fija-desde-la-app', props);
  const { form, cambiar, enPantalla } = r;
  return (
    <>
      <div className={CUERPO}>
        <p className="text-sm text-muted-foreground text-pretty">{EXPLICACION_PLAZA_FIJA_DESDE_APP}</p>
        <InterruptorCampo
          titulo="Pueden pedir plaza fija"
          detalle="Desde una clase que se repite cada semana, en su app."
          on={form.plazaFijaSolicitarDesdeApp}
          onChange={v => cambiar('plazaFijaSolicitarDesdeApp', v)}
        />
        <InterruptorCampo
          titulo="Pueden pedir una pausa"
          detalle="De su plaza fija, con las fechas que elijan."
          on={form.plazaFijaPausaDesdeApp}
          onChange={v => cambiar('plazaFijaPausaDesdeApp', v)}
        />
        <Consecuencia texto={consecuenciaRegla('plaza-fija-desde-la-app', enPantalla)} />
      </div>
      <Barra tarjeta="plaza-fija-desde-la-app" r={r} />
    </>
  );
}

// ── Si pausa su plaza fija ──────────────────────────────────────────────────
//
// `plaza_fija_pausa_libera_sitio` y `plaza_fija_fin_pausa`. Solo vale para las
// pausas nuevas: queda escrito en cada plaza al ponerla (`pausarPlazaFijaStaff`).

export function FormPausaPlazaFija(props: PropsCajonRegla) {
  const r = useRegla('si-pausa-su-plaza-fija', props);
  const { form, cambiar, enPantalla } = r;
  return (
    <>
      <div className={CUERPO}>
        <p className="text-sm text-muted-foreground text-pretty">{EXPLICACION_PAUSA_PLAZA_FIJA}</p>
        <InterruptorCampo
          titulo="Su sitio queda libre para otra alumna"
          detalle="Mientras dura la pausa, si dura más de una semana. Apagado: conserva su plaza y su sitio."
          on={form.plazaFijaPausaLiberaSitio}
          onChange={v => cambiar('plazaFijaPausaLiberaSitio', v)}
        />
        {form.plazaFijaPausaLiberaSitio && (
          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-medium text-foreground">Al terminar la pausa</legend>
            {OPCIONES_FIN_PAUSA.map(o => {
              const elegida = form.plazaFijaFinPausa === o.valor;
              return (
                <label
                  key={o.valor}
                  className={cn(
                    'flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors',
                    elegida ? 'border-brand bg-brand/5' : 'border-border hover:bg-muted',
                  )}
                >
                  <input
                    type="radio"
                    name="si-pausa-su-plaza-fija"
                    className="mt-1 accent-[var(--brand)]"
                    checked={elegida}
                    onChange={() => cambiar('plazaFijaFinPausa', o.valor)}
                  />
                  <span>
                    <span className="block text-sm font-medium text-foreground">{o.titulo}</span>
                    <span className="block text-sm text-muted-foreground text-pretty">{o.detalle}</span>
                  </span>
                </label>
              );
            })}
          </fieldset>
        )}
        <Consecuencia texto={consecuenciaRegla('si-pausa-su-plaza-fija', enPantalla)} />
      </div>
      <Barra tarjeta="si-pausa-su-plaza-fija" r={r} />
    </>
  );
}
