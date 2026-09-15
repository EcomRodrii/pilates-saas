'use client';

import { useState, type ChangeEvent } from 'react';
import { cn } from '@/lib/utils';
import { useStudio } from '@/lib/studio-context';
import type { Studio } from '@/lib/types';
import { authHeader } from '@/lib/api-client';
import type { DatosSepa } from '@/lib/billing/cuenta-cobro';
import { leerPlazoReembolso, PLAZO_REEMBOLSO_MAX_DIAS } from '@/lib/billing/politica-reembolso';
import { hayCambios, sincronizarFormulario } from '@/lib/configuracion/formulario-sincronizado';
import { resumenDevoluciones } from '@/lib/configuracion/resumenes';
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
      descripcion: `Tú y recepción veréis «Devolver» en los pagos de cada alumna (${politica.toLowerCase()}). Cada devolución mueve dinero de verdad a su tarjeta.`,
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
