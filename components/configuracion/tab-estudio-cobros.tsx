'use client';

import { useState, type ChangeEvent } from 'react';
import { cn } from '@/lib/utils';
import { useStudio } from '@/lib/studio-context';
import type { Studio } from '@/lib/types';
import { authHeader } from '@/lib/api-client';
import type { DatosSepa } from '@/lib/billing/cuenta-cobro';
import { leerPlazoReembolso, PLAZO_REEMBOLSO_MAX_DIAS } from '@/lib/billing/politica-reembolso';
import { hayCambios, sincronizarFormulario } from '@/lib/configuracion/formulario-sincronizado';
import { resumenAlCancelarCuota, resumenDevoluciones } from '@/lib/configuracion/resumenes';
import { Toggle, inputCls } from '@/components/configuracion/estilos';
import { BarraGuardar } from '@/components/configuracion/shell/barra-guardar';
import type { PropsFormularioCajon } from '@/components/configuracion/shell/cajon-ajuste';
import { Campo } from '@/components/configuracion/formulario-estudio';

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
