'use client';

import { useEffect, useState, type ChangeEvent } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useStudio } from '@/lib/studio-context';
import type { ModoFacturacion, Studio } from '@/lib/types';
import { nifEmisorValido } from '@/lib/nif';
import { authHeader } from '@/lib/api-client';
import type { DatosSepa } from '@/lib/billing/cuenta-cobro';
import { leerPlazoReembolso, PLAZO_REEMBOLSO_MAX_DIAS } from '@/lib/billing/politica-reembolso';
import { hayCambios, sincronizarFormulario } from '@/lib/configuracion/formulario-sincronizado';
import { resumenAlCancelarCuota, resumenDevoluciones } from '@/lib/configuracion/resumenes';
import { Toggle, inputCls } from '@/components/configuracion/estilos';
import { BarraGuardar } from '@/components/configuracion/shell/barra-guardar';
import type { PropsFormularioCajon } from '@/components/configuracion/shell/cajon-ajuste';
import { Campo } from '@/components/configuracion/formulario-estudio';
import { ExportarRegistrosVerifactu } from '@/components/configuracion/exportar-registros-verifactu';
import type { EstadoEstudioVerifactu } from '@/lib/verifactu/apoderamiento';
import {
  ALTA_AUN_CERRADA, SIN_PODER_VIGENTE, SOLO_CON_ENVIO_ACTIVO, avisoPermanencia, envioActivado, ofrecerAlta, pasoDelAlta, puedeEmitir,
} from '@/lib/verifactu/facturacion-activa';

// Los cajones de «Domiciliaciones bancarias» y «Devoluciones», en Cobros y
// facturas. Cada uno se guarda con el «Guardar» de su barra, que solo aparece
// con cambios: ni un «Guardar datos SEPA» siempre a la vista ni un «Guardar
// política» gris en reposo.
//
// ⚠️ Un campo solo se pone al día con `studio` si no se ha tocado
// (lib/configuracion/formulario-sincronizado.ts): guardar otra cosa cambia
// `studio` de referencia y no puede borrar lo que se está escribiendo.

// ── Domiciliaciones bancarias ────────────────────────────────────────────────

type SepaForm = { sepaAcreedorId: string; sepaIban: string; sepaTitular: string };

function studioToSepa(s: DatosSepa | null): SepaForm {
  return {
    sepaAcreedorId: s?.sepaAcreedorId ?? '',
    sepaIban: s?.sepaIban ?? '',
    sepaTitular: s?.sepaTitular ?? '',
  };
}

export function FormDomiciliaciones({ onGuardado }: PropsFormularioCajon) {
  const { studio, reflejarStudioGuardado } = useStudio();
  const [form, setForm] = useState<SepaForm>(() => studioToSepa(studio));
  // Lo último que se sabe del servidor: lo que difiere de aquí es lo tecleado.
  const [base, setBase] = useState<SepaForm>(() => studioToSepa(studio));

  const [studioAnterior, setStudioAnterior] = useState(studio);
  if (studio !== studioAnterior) {
    setStudioAnterior(studio);
    const servidor = studioToSepa(studio);
    setForm(sincronizarFormulario(form, base, servidor));
    setBase(servidor);
  }

  const campo = (k: keyof SepaForm) => (e: ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setForm(f => ({ ...f, [k]: v }));
  };

  // Es la cuenta donde entra el dinero de la remesa: la valida y la guarda el
  // servidor (solo la dueña), y aquí se pinta lo que devolvió ya normalizado,
  // nunca lo que se tecleó.
  async function alGuardar(): Promise<string | null> {
    const enviado = form;
    const res = await fetch('/api/estudio/sepa', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(enviado),
    });
    const data = await res.json().catch(() => null) as { datos?: DatosSepa; error?: string } | null;
    if (!res.ok || !data?.datos) return data?.error ?? 'No se han podido guardar los datos de tu banco';
    reflejarStudioGuardado(data.datos);
    const guardado = studioToSepa(data.datos);
    setForm(f => sincronizarFormulario(f, enviado, guardado));
    setBase(guardado);
    onGuardado('Datos de domiciliación guardados');
    return null;
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-5 pb-6">
        <Campo label="Identificador de acreedor" ayuda="Te lo da tu banco al darte de alta en los recibos domiciliados.">
          {id => <input id={id} className={inputCls} value={form.sepaAcreedorId} onChange={campo('sepaAcreedorId')} placeholder="ES00ZZZ00000000000" autoCapitalize="characters" />}
        </Campo>
        <Campo label="IBAN de la cuenta del estudio">
          {id => <input id={id} className={inputCls} value={form.sepaIban} onChange={campo('sepaIban')} placeholder="ES00 0000 0000 0000 0000 0000" autoCapitalize="characters" />}
        </Campo>
        <Campo label="Titular de la cuenta">
          {id => <input id={id} className={inputCls} value={form.sepaTitular} onChange={campo('sepaTitular')} />}
        </Campo>
      </div>
      <BarraGuardar
        seccion="cobros"
        cambios={hayCambios(form, base) ? ['Domiciliaciones bancarias'] : []}
        onGuardar={alGuardar}
        onDescartar={() => setForm(base)}
      />
    </>
  );
}

// ── Devoluciones ─────────────────────────────────────────────────────────────
// Apagadas de fábrica a propósito: mientras lo estén, en la ficha de la alumna
// no aparece ningún botón de devolver, y el endpoint rechaza aunque se le llame
// a mano. Se puede seguir devolviendo desde Stripe — Tentare se entera igual por
// el webhook. Es dinero: «Guardar» pregunta antes, con lo que va a pasar.

type DevolucionesForm = { activos: boolean; plazo: string; soloSinUsar: boolean };
type Politica = Pick<Studio, 'reembolsosActivos' | 'reembolsoPlazoDias' | 'reembolsoSoloSinUsar'>;

function studioToDevoluciones(s: Politica | null): DevolucionesForm {
  // Los mismos valores por defecto que lee el servidor (app/api/reembolsos).
  return {
    activos: s?.reembolsosActivos ?? false,
    plazo: String(s?.reembolsoPlazoDias ?? 14),
    soloSinUsar: s?.reembolsoSoloSinUsar ?? true,
  };
}

/** Lo que se pregunta antes de guardar: qué cambia para la propietaria y su recepción. */
function confirmacion(antes: DevolucionesForm, ahora: Politica) {
  const politica = resumenDevoluciones(ahora) ?? '';
  if (!antes.activos && ahora.reembolsosActivos) {
    return {
      titulo: '¿Permitir devolver desde Tentare?',
      descripcion: `Tú y recepción veréis «Devolver» en los pagos de cada alumna (${politica.toLowerCase()}). Cada devolución mueve dinero de verdad a su forma de pago original.`,
      textoConfirmar: 'Sí, permitirlo',
    };
  }
  if (antes.activos && !ahora.reembolsosActivos) {
    return {
      titulo: '¿Dejar de devolver desde Tentare?',
      descripcion: 'Desaparece «Devolver» de las fichas. Podrás seguir devolviendo desde Stripe.',
      textoConfirmar: 'Sí, dejar de devolver',
    };
  }
  return { titulo: '¿Cambiar las devoluciones?', descripcion: `Desde ahora: ${politica.toLowerCase()}.`, textoConfirmar: 'Sí, cambiarlas' };
}

export function FormDevoluciones({ onGuardado }: PropsFormularioCajon) {
  const { studio, updateStudio } = useStudio();
  const [form, setForm] = useState<DevolucionesForm>(() => studioToDevoluciones(studio));
  const [base, setBase] = useState<DevolucionesForm>(() => studioToDevoluciones(studio));

  const [anterior, setAnterior] = useState(studio);
  if (studio !== anterior) {
    setAnterior(studio);
    const servidor = studioToDevoluciones(studio);
    setForm(sincronizarFormulario(form, base, servidor));
    setBase(servidor);
  }

  const plazoDias = leerPlazoReembolso(form.plazo);
  // Con la política apagada el plazo ni se ve: no se bloquea por algo que no se
  // puede corregir en pantalla (se guarda el que ya había).
  const plazoInvalido = form.activos && plazoDias === null;
  const politica: Politica = {
    reembolsosActivos: form.activos,
    reembolsoPlazoDias: plazoDias ?? leerPlazoReembolso(base.plazo) ?? 14,
    reembolsoSoloSinUsar: form.soloSinUsar,
  };

  const cambiar = (cambio: Partial<DevolucionesForm>) => setForm(f => ({ ...f, ...cambio }));

  async function alGuardar(): Promise<string | null> {
    const enviado = form;
    const cambios = politica;
    // «Guardada» solo con la fila confirmada (updateStudio cuenta filas).
    const res = await updateStudio(cambios);
    if (!res.ok) return res.error;
    const guardado = studioToDevoluciones(cambios);
    setForm(f => sincronizarFormulario(f, enviado, guardado));
    setBase(guardado);
    onGuardado('Política de devoluciones guardada');
    return null;
  }

  return (
    <>
      <div className="space-y-5 pb-6">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">Permitir devolver desde Tentare</p>
            <p className="text-sm text-muted-foreground text-pretty">Tú y recepción veis «Devolver» en sus pagos.</p>
          </div>
          <Toggle on={form.activos} onChange={v => cambiar({ activos: v })} ariaLabel="Permitir devolver desde Tentare" />
        </div>

        {form.activos && (
          <>
            <Campo
              label="Plazo para devolver (días desde el cobro)"
              error={plazoInvalido ? `Tienen que ser días enteros, entre 0 y ${PLAZO_REEMBOLSO_MAX_DIAS}. 0 = sin límite.` : null}
              ayuda={plazoDias ? `Pasados ${plazoDias} días ya no se podrá devolver desde aquí.` : '0 = sin límite: cualquier cobro, sea de cuando sea.'}
            >
              {id => (
                <input
                  id={id}
                  className={cn(inputCls, 'max-w-40', plazoInvalido && 'border-destructive')}
                  type="number"
                  min={0}
                  max={PLAZO_REEMBOLSO_MAX_DIAS}
                  step={1}
                  inputMode="numeric"
                  aria-invalid={plazoInvalido}
                  value={form.plazo}
                  onChange={e => cambiar({ plazo: e.target.value })}
                />
              )}
            </Campo>

            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">Solo bonos sin empezar</p>
                <p className="text-sm text-muted-foreground text-pretty">Un bono con sesiones gastadas no se devuelve. Mensuales y citas, sí.</p>
              </div>
              <Toggle on={form.soloSinUsar} onChange={v => cambiar({ soloSinUsar: v })} ariaLabel="Solo bonos sin empezar" />
            </div>
          </>
        )}
      </div>
      <BarraGuardar
        seccion="cobros"
        cambios={hayCambios(form, base) ? ['Devoluciones'] : []}
        bloqueo={plazoInvalido ? 'Corrige el plazo para poder guardar.' : null}
        confirmar={confirmacion(base, politica)}
        onGuardar={alGuardar}
        onDescartar={() => setForm(base)}
      />
    </>
  );
}

// ── Cuándo se cobra la cuota mensual ─────────────────────────────────────────
// PAY-11: petición real de un estudio que mueve plazas de plaza fija cada mes
// y quiere el cobro en una fecha fija, no en el aniversario de cada alumna
// (por defecto). No toca el alta ni prorratea: cada suscripción se realinea
// SOLA en su próxima renovación (converge en como mucho un ciclo). Es dinero:
// «Guardar» pregunta antes, con lo que va a pasar.

type CobroDiaForm = { dia1: boolean };

function studioToCobroDia(s: Partial<Pick<Studio, 'cobroDia1Activo'>> | null): CobroDiaForm {
  return { dia1: s?.cobroDia1Activo ?? false };
}

function confirmacionCobroDia(activar: boolean) {
  if (activar) {
    return {
      titulo: '¿Cobrar todas las cuotas el día 1?',
      descripcion: 'Cada cuota mensual se realinea sola en su PRÓXIMA renovación, sin prorratear ni tocarla ahora: para una alumna que ya tienes puede tardar hasta un ciclo en caer exactamente el día 1. Las cuotas nuevas siguen naciendo en el día en que se apuntan.',
      textoConfirmar: 'Sí, cobrar el día 1',
    };
  }
  return {
    titulo: '¿Volver al aniversario de cada alumna?',
    descripcion: 'Las próximas renovaciones vuelven a caer en el día en que cada alumna contrató su cuota.',
    textoConfirmar: 'Sí, volver al aniversario',
  };
}

export function FormCobroDia1({ onGuardado }: PropsFormularioCajon) {
  const { studio, updateStudio } = useStudio();
  const [form, setForm] = useState<CobroDiaForm>(() => studioToCobroDia(studio));
  const [base, setBase] = useState<CobroDiaForm>(() => studioToCobroDia(studio));

  const [anterior, setAnterior] = useState(studio);
  if (studio !== anterior) {
    setAnterior(studio);
    const servidor = studioToCobroDia(studio);
    setForm(sincronizarFormulario(form, base, servidor));
    setBase(servidor);
  }

  async function alGuardar(): Promise<string | null> {
    const enviado = form;
    const res = await updateStudio({ cobroDia1Activo: form.dia1 });
    if (!res.ok) return res.error;
    setForm(f => sincronizarFormulario(f, enviado, enviado));
    setBase(enviado);
    onGuardado('Guardado cuándo se cobra la cuota mensual');
    return null;
  }

  return (
    <>
      <div className="space-y-2 pb-6">
        <label
          className={cn(
            'flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors',
            !form.dia1 ? 'border-brand bg-brand/5' : 'border-border hover:bg-muted',
          )}
        >
          <input type="radio" name="cobro-dia" className="mt-1 accent-[var(--brand)]" checked={!form.dia1} onChange={() => setForm({ dia1: false })} />
          <span>
            <span className="block text-sm font-medium text-foreground">Cada alumna en su aniversario</span>
            <span className="block text-sm text-muted-foreground text-pretty">Se le cobra el mismo día en que contrató su cuota, cada mes. Es como funciona hoy.</span>
          </span>
        </label>
        <label
          className={cn(
            'flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors',
            form.dia1 ? 'border-brand bg-brand/5' : 'border-border hover:bg-muted',
          )}
        >
          <input type="radio" name="cobro-dia" className="mt-1 accent-[var(--brand)]" checked={form.dia1} onChange={() => setForm({ dia1: true })} />
          <span>
            <span className="block text-sm font-medium text-foreground">Todas el día 1 de cada mes</span>
            <span className="block text-sm text-muted-foreground text-pretty">
              Cada cuota se realinea sola en su próxima renovación, sin prorratear: una alumna a mitad de ciclo puede tardar hasta un mes en pasar a cobrarse el día 1.
            </span>
          </span>
        </label>
      </div>
      <BarraGuardar
        seccion="cobros"
        cambios={hayCambios(form, base) ? ['Cuándo se cobra la cuota mensual'] : []}
        confirmar={confirmacionCobroDia(form.dia1)}
        onGuardar={alGuardar}
        onDescartar={() => setForm(base)}
      />
    </>
  );
}

// ── Si se cancela una cuota ──────────────────────────────────────────────────
// Lo elige el estudio (decisión del fundador, 16-sep). Una cuota cancelada nunca
// genera cobros nuevos; lo que se elige es qué pasa con el recibo que ya estaba
// PENDIENTE (el trigger de la migr 20260915215311 lo escribe en el recibo al
// cancelar) y si la alumna puede renovarla sola desde su app. Es dinero:
// «Guardar» pregunta antes, con lo que va a pasar.

type PoliticaRecibos = Studio['recibosAlCancelarCuota'];
type CuotaCanceladaForm = { recibos: PoliticaRecibos; renovarSola: boolean };

function studioToCuotaCancelada(s: Partial<Pick<Studio, 'recibosAlCancelarCuota' | 'renovarSolaCuotaCancelada'>> | null): CuotaCanceladaForm {
  return {
    recibos: s?.recibosAlCancelarCuota ?? 'MANTENER_CON_REINTENTOS',
    renovarSola: s?.renovarSolaCuotaCancelada ?? true,
  };
}

const OPCIONES_RECIBO_AL_CANCELAR: readonly { valor: PoliticaRecibos; titulo: string; detalle: string }[] = [
  {
    valor: 'MANTENER_CON_REINTENTOS',
    titulo: 'Sigue debiéndolo y se sigue intentando cobrar',
    detalle: 'El recibo sigue en «Quién me debe» y, si tenía cobros automáticos programados, se siguen intentando.',
  },
  {
    valor: 'MANTENER_SIN_REINTENTOS',
    titulo: 'Sigue debiéndolo, sin cobros automáticos',
    detalle: 'El recibo sigue en «Quién me debe», pero solo se cobra si lo cobras tú o lo paga ella.',
  },
  {
    valor: 'ANULAR',
    titulo: 'Se anula',
    detalle: 'El recibo se anula y deja de deberlo. Si tiene un pago en marcha no se puede anular: se queda pendiente, sin cobros automáticos.',
  },
];

function confirmacionCuotaCancelada(antes: CuotaCanceladaForm, ahora: CuotaCanceladaForm) {
  if (ahora.recibos === 'ANULAR' && antes.recibos !== 'ANULAR') {
    return {
      titulo: '¿Anular el recibo pendiente al cancelar?',
      descripcion: 'Desde ahora, al cancelar una cuota su recibo pendiente se anula y la alumna deja de deberlo. Lo que ya estaba cancelado antes no cambia.',
      textoConfirmar: 'Sí, anularlo',
    };
  }
  return {
    titulo: '¿Cambiar qué pasa al cancelar una cuota?',
    descripcion: `Desde ahora: ${resumenAlCancelarCuota({ recibosAlCancelarCuota: ahora.recibos, renovarSolaCuotaCancelada: ahora.renovarSola }) ?? ''}. Lo que ya estaba cancelado antes no cambia.`,
    textoConfirmar: 'Sí, cambiarlo',
  };
}

export function FormAlCancelarCuota({ onGuardado }: PropsFormularioCajon) {
  const { studio, updateStudio } = useStudio();
  const [form, setForm] = useState<CuotaCanceladaForm>(() => studioToCuotaCancelada(studio));
  const [base, setBase] = useState<CuotaCanceladaForm>(() => studioToCuotaCancelada(studio));

  const [anterior, setAnterior] = useState(studio);
  if (studio !== anterior) {
    setAnterior(studio);
    const servidor = studioToCuotaCancelada(studio);
    setForm(sincronizarFormulario(form, base, servidor));
    setBase(servidor);
  }

  async function alGuardar(): Promise<string | null> {
    const enviado = form;
    // «Guardado» solo con la fila confirmada (updateStudio cuenta filas).
    const res = await updateStudio({ recibosAlCancelarCuota: form.recibos, renovarSolaCuotaCancelada: form.renovarSola });
    if (!res.ok) return res.error;
    setForm(f => sincronizarFormulario(f, enviado, enviado));
    setBase(enviado);
    onGuardado('Guardado qué pasa al cancelar una cuota');
    return null;
  }

  return (
    <>
      <div className="space-y-5 pb-6">
        <p className="text-sm text-muted-foreground text-pretty">
          Al cancelar una cuota —la cancelas tú, cambia de plan, termina tras darse de baja o se cancela porque no se pudo
          cobrar— nunca se generan cobros nuevos de esa cuota. Aquí eliges qué pasa con el recibo que ya estaba pendiente.
          Los que fallaron o se devolvieron no cambian.
        </p>
        <fieldset className="space-y-2">
          <legend className="sr-only">Qué pasa con su recibo pendiente</legend>
          {OPCIONES_RECIBO_AL_CANCELAR.map(o => {
            const elegida = form.recibos === o.valor;
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
                  name="recibo-al-cancelar-cuota"
                  className="mt-1 accent-[var(--brand)]"
                  checked={elegida}
                  onChange={() => setForm(f => ({ ...f, recibos: o.valor }))}
                />
                <span>
                  <span className="block text-sm font-medium text-foreground">{o.titulo}</span>
                  <span className="block text-sm text-muted-foreground text-pretty">{o.detalle}</span>
                </span>
              </label>
            );
          })}
        </fieldset>
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">Dejar que la renueve ella desde su app</p>
            <p className="text-sm text-muted-foreground text-pretty">
              Con la cuota cancelada, puede volver a pagarla desde su app. Desactivado: la app le dice que hable con el estudio.
            </p>
          </div>
          <Toggle on={form.renovarSola} onChange={v => setForm(f => ({ ...f, renovarSola: v }))} ariaLabel="Dejar que la renueve ella desde su app" />
        </div>
      </div>
      <BarraGuardar
        seccion="cobros"
        cambios={hayCambios(form, base) ? ['Si se cancela una cuota'] : []}
        confirmar={confirmacionCuotaCancelada(base, form)}
        onGuardar={alGuardar}
        onDescartar={() => setForm(base)}
      />
    </>
  );
}

// ── Facturación ──────────────────────────────────────────────────────────────
//
// Si Tentare emite una factura por cobro (con su registro Veri*Factu) o no
// emite facturas y el estudio factura fuera. Por defecto, no (decisión del
// fundador, 29-sep-2026). La base de datos es la que impide que nazca una
// factura con el modo apagado (`reservar_numero_factura`), y la cadena de cada
// estudio no se toca.
//
// ⚠️ Encenderlo exige el envío a la AEAT ya activado (30-sep-2026): Tentare solo
// funciona como VERI*FACTU, así que no emite una factura cuyo registro no vaya a
// enviarse (migración 20260930170000, lib/verifactu/facturacion-activa.ts). La
// pantalla lo dice antes de que la base lo rechace. Apagarlo con el envío
// activo se deja, pero avisando de la permanencia (art. 17.2).
//
// ⚠️ Los textos no prometen lo que no depende de Tentare: ni «cumple», ni el QR
// (ver lib/factura-sello-cliente.ts). Solo lo que pasa de verdad al guardar.

type FacturacionForm = { modo: ModoFacturacion };

// Factura SIEMPRE; lo que se elige es si va también a la AEAT (2-oct-2026).
// 'sin_facturas' no se ofrece: es un estado de sistema que nadie elige.
const MODOS_FACTURACION: { valor: ModoFacturacion; titulo: string; descripcion: string }[] = [
  {
    valor: 'facturas',
    titulo: 'Facturas, sin envío a la AEAT',
    descripcion: 'Las facturas llevan número correlativo, pero no huella ni QR y no se envían a la AEAT. Las ves en Cobros → Facturas.',
  },
  {
    valor: 'verifactu',
    titulo: 'Facturas con Veri*Factu',
    descripcion: 'Además, cada factura lleva su huella encadenada a la anterior y su QR, y su registro se envía a la AEAT.',
  },
];

function studioToFacturacion(s: Partial<Pick<Studio, 'modoFacturacion'>> | null): FacturacionForm {
  return { modo: s?.modoFacturacion ?? 'facturas' };
}

function confirmacionFacturacion(ahora: ModoFacturacion, antes: ModoFacturacion, envioActivo: boolean) {
  if (ahora === 'facturas' && antes === 'sin_facturas') {
    return {
      titulo: '¿Empezar a emitir facturas?',
      descripcion: 'Desde ahora, cada cobro —salvo en efectivo— genera su factura con número correlativo. No se envía a la AEAT. Las facturas emitidas no se borran: se corrigen con una rectificativa.',
      textoConfirmar: 'Sí, emitir facturas',
    };
  }
  if (ahora === 'verifactu') {
    return {
      titulo: '¿Enviar tus facturas a la AEAT?',
      descripcion: 'Desde ahora, cada factura lleva su huella y su QR, y su registro se envía a la AEAT. Las facturas emitidas no se borran: se corrigen con una rectificativa. Para las sociedades es obligatorio desde el 1 de enero de 2027 y para el resto desde el 1 de julio de 2027: confírmalo con tu asesoría.',
      textoConfirmar: 'Sí, activar Veri*Factu',
    };
  }
  const base = 'Tus facturas se siguen emitiendo con su número, pero sin huella ni QR, y dejan de enviarse a la AEAT. Las que ya enviaste se quedan como están.';
  return {
    titulo: '¿Desactivar Veri*Factu?',
    descripcion: envioActivo ? `${base} ${avisoPermanencia(new Date())}` : base,
    textoConfirmar: 'Sí, desactivarlo',
  };
}

// El alta del envío a la AEAT, para saber si ya se puede emitir. El cajón es
// solo de la propietaria, igual que la ruta.
type AltaEnvio = { estado: EstadoEstudioVerifactu; activadoEn: string | null } | 'cargando' | 'error';

function useAltaEnvio(): AltaEnvio {
  const [alta, setAlta] = useState<AltaEnvio>('cargando');
  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const res = await fetch('/api/verifactu/estudio', { headers: await authHeader(), cache: 'no-store' });
        const datos = res.ok ? await res.json().catch(() => null) : null;
        if (!vivo) return;
        setAlta(datos && typeof datos.estado === 'string'
          ? { estado: datos.estado as EstadoEstudioVerifactu, activadoEn: typeof datos.activadoEn === 'string' ? datos.activadoEn : null }
          : 'error');
      } catch {
        if (vivo) setAlta('error');
      }
    })();
    return () => { vivo = false; };
  }, []);
  return alta;
}

// «Facturar automáticamente» (9-oct-2026): ajuste del estudio, SEPARADO de
// Veri*Factu. Se guarda al tocarlo y cambia solo con lo que contesta el servidor
// (solo la propietaria; nada optimista). No es retroactivo: lo ya emitido no se toca.
function AjusteFacturaAutomatica({ onGuardado }: { onGuardado: (texto: string) => void }) {
  const { studio, reflejarStudioGuardado } = useStudio();
  const activo = studio?.facturarAutomatico !== false;
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cambiar(activo: boolean) {
    if (guardando) return;
    setGuardando(true);
    setError(null);
    try {
      const res = await fetch('/api/facturacion/automatica', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify({ activo }),
      });
      const datos = (await res.json().catch(() => null)) as { activo?: boolean; error?: string } | null;
      if (!res.ok || typeof datos?.activo !== 'boolean') {
        setError(datos?.error ?? 'No se ha podido guardar. Vuelve a intentarlo.');
      } else {
        reflejarStudioGuardado({ facturarAutomatico: datos.activo });
        onGuardado(datos.activo ? 'Las facturas saldrán solas al cobrar' : 'Las facturas se harán a mano');
      }
    } catch {
      setError('No se ha podido guardar. Revisa la conexión y vuelve a intentarlo.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="mb-6 rounded-xl border border-border px-4 py-3">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">Facturar automáticamente</p>
          <p className="mt-0.5 text-sm text-muted-foreground text-pretty">
            {activo
              ? 'Cada cobro, salvo en efectivo, genera su factura al cobrarlo. En efectivo solo si marcas «Hacerle factura».'
              : 'No sale ninguna factura sola. Cuando te la pidan, la haces desde el recibo cobrado. Lo ya emitido no cambia.'}
          </p>
        </div>
        <Toggle on={activo} onChange={v => void cambiar(v)} ariaLabel="Facturar automáticamente" />
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
      <p className="mt-2 text-xs text-muted-foreground text-pretty">Es independiente de Veri*Factu: con él desactivado la factura sale igual, sin huella ni QR.</p>
    </div>
  );
}

export function FormFacturacion({ onGuardado }: PropsFormularioCajon) {
  const { studio, reflejarStudioGuardado } = useStudio();
  const [form, setForm] = useState<FacturacionForm>(() => studioToFacturacion(studio));
  const [base, setBase] = useState<FacturacionForm>(() => studioToFacturacion(studio));

  const [anterior, setAnterior] = useState(studio);
  if (studio !== anterior) {
    setAnterior(studio);
    const servidor = studioToFacturacion(studio);
    setForm(sincronizarFormulario(form, base, servidor));
    setBase(servidor);
  }

  // Sin un NIF válido no se puede sellar ninguna factura (`sellarFacturaDeRecibo`):
  // encenderlo así dejaría cada cobro con su factura pendiente. Se dice aquí.
  const sinNif = form.modo === 'verifactu' && !nifEmisorValido(studio?.nif?.trim() ?? '');

  const alta = useAltaEnvio();
  // Emitir exige el envío activado Y el poder vigente; avisar de la permanencia
  // (art. 17.2) basta con haberlo activado alguna vez.
  const activo = typeof alta === 'object' && puedeEmitir(alta.activadoEn, alta.estado);
  const activadoAlgunaVez = typeof alta === 'object' && envioActivado(alta.activadoEn);
  // Encenderlo sin el envío activo lo rechaza la base (VERIFACTU_SIN_ACTIVAR):
  // aquí se dice antes, sin mandar nada.
  const enciende = form.modo === 'verifactu' && base.modo !== 'verifactu';
  const bloqueoEnvio = !enciende || activo ? null
    : alta === 'cargando' ? 'Comprobando tu envío a la AEAT…'
    : alta === 'error' ? 'No se ha podido comprobar tu envío a la AEAT. Vuelve a intentarlo en un momento.'
    : 'Se podrá activar cuando tu envío a la AEAT esté activo.';

  async function alGuardar(): Promise<string | null> {
    const enviado = form;
    // Lo guarda el servidor (solo la propietaria); el navegador ya no escribe la columna.
    try {
      const res = await fetch('/api/facturacion/modo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify({ modo: enviado.modo }),
      });
      const datos = (await res.json().catch(() => null)) as { modo?: ModoFacturacion; error?: string } | null;
      if (!res.ok || !datos?.modo) return datos?.error ?? 'No se ha podido guardar. Vuelve a intentarlo.';
      reflejarStudioGuardado({ modoFacturacion: datos.modo });
    } catch {
      return 'No se ha podido guardar. Revisa la conexión y vuelve a intentarlo.';
    }
    setForm(f => sincronizarFormulario(f, enviado, enviado));
    setBase(enviado);
    onGuardado(enviado.modo === 'verifactu' ? 'Veri*Factu activado' : 'Veri*Factu desactivado');
    return null;
  }

  return (
    <>
      {studio?.modoFacturacion === 'sin_facturas' && (
        <p className="pb-4 text-sm text-muted-foreground text-pretty">Hoy este estudio no emite facturas. Elige una opción y guarda para empezar.</p>
      )}
      <AjusteFacturaAutomatica onGuardado={onGuardado} />
      <div role="radiogroup" aria-label="Facturación" className="space-y-3 pb-6">
        {MODOS_FACTURACION.map(m => {
          const elegido = form.modo === m.valor;
          return (
            <button
              key={m.valor}
              type="button"
              role="radio"
              aria-checked={elegido}
              onClick={() => setForm({ modo: m.valor })}
              className={cn(
                'w-full rounded-xl border px-4 py-3 text-left transition-colors',
                elegido ? 'border-foreground bg-muted/60' : 'border-border hover:bg-muted/40',
              )}
            >
              <span className="flex items-start gap-3">
                <span aria-hidden className={cn('mt-1 size-4 shrink-0 rounded-full border-2', elegido ? 'border-foreground bg-foreground shadow-[inset_0_0_0_3px_var(--background)]' : 'border-muted-foreground/50')} />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-foreground">{m.titulo}</span>
                  <span className="mt-0.5 block text-sm text-muted-foreground text-pretty">{m.descripcion}</span>
                </span>
              </span>
            </button>
          );
        })}
      </div>
      {form.modo === 'verifactu' && !activo && typeof alta === 'object' && (
        <div className="-mt-3 mb-6 rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm">
          <p className="text-foreground text-pretty">
            {activadoAlgunaVez ? SIN_PODER_VIGENTE : ofrecerAlta(alta.estado) ? SOLO_CON_ENVIO_ACTIVO : ALTA_AUN_CERRADA}
          </p>
          {ofrecerAlta(alta.estado) && (
            <p className="mt-2 text-muted-foreground text-pretty">
              {pasoDelAlta(alta.estado)}{' '}
              <Link href="/configuracion/verifactu" className="font-medium text-foreground underline underline-offset-2">
                {alta.estado === 'SIN_CONFIGURAR' ? 'Dar de alta el envío' : 'Ver tu alta en la AEAT'}
              </Link>
            </p>
          )}
        </div>
      )}
      {form.modo === 'verifactu' && activo && (
        // Orden HAC/1177/2024, art. 15.3: la declaración responsable del sistema
        // tiene que estar accesible para el cliente de forma rápida y fácil.
        <p className="-mt-3 pb-6 text-sm text-muted-foreground">
          <Link href="/verifactu/declaracion-responsable" className="font-medium text-foreground underline underline-offset-2">
            Declaración responsable del sistema de facturación
          </Link>
          {' '}— para verla o descargarla en PDF.
        </p>
      )}
      <ExportarRegistrosVerifactu />
      <BarraGuardar
        seccion="cobros"
        cambios={hayCambios(form, base) ? ['Facturación'] : []}
        bloqueo={sinNif ? 'Pon un NIF válido en «Datos fiscales e IVA» para emitir facturas.' : bloqueoEnvio}
        confirmar={confirmacionFacturacion(form.modo, base.modo, activadoAlgunaVez)}
        onGuardar={alGuardar}
        onDescartar={() => setForm(base)}
      />
    </>
  );
}
