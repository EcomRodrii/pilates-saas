'use client';

import { useId, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { useStudio } from '@/lib/studio-context';
import type { Studio } from '@/lib/types';
import { authHeader } from '@/lib/api-client';
import type { DatosSepa } from '@/lib/billing/cuenta-cobro';
import { leerPlazoReembolso, PLAZO_REEMBOLSO_MAX_DIAS } from '@/lib/billing/politica-reembolso';
import { hayCambios, sincronizarFormulario } from '@/lib/configuracion/formulario-sincronizado';
import { Toggle, inputCls, labelCls } from '@/components/configuracion/estilos';
import { TarjetaAjuste } from '@/components/configuracion/shell/tarjeta-ajuste';

// ⚠️ Las dos tarjetas de esta pestaña se guardan cada una con su botón, y la de
// Devoluciones escribe en `studio`. Antes cada formulario se recopiaba ENTERO al
// cambiar `studio`, así que guardar la política de devoluciones borraba los
// datos SEPA a medio escribir. Ahora un campo solo se pone al día si no se ha
// tocado (lib/configuracion/formulario-sincronizado.ts).

type SepaForm = { sepaAcreedorId: string; sepaIban: string; sepaTitular: string };

function studioToSepa(s: DatosSepa | null): SepaForm {
  return {
    sepaAcreedorId: s?.sepaAcreedorId ?? '',
    sepaIban: s?.sepaIban ?? '',
    sepaTitular: s?.sepaTitular ?? '',
  };
}

export function TabEstudioCobros({ showToast }: { showToast: (m: string) => void }) {
  const { studio, reflejarStudioGuardado } = useStudio();
  const [form, setForm] = useState<SepaForm>(() => studioToSepa(studio));
  const idSepa = useId();
  // Lo último que se sabe del servidor: lo que difiere de aquí es lo tecleado.
  const [base, setBase] = useState<SepaForm>(() => studioToSepa(studio));
  const guardandoRef = useRef(false);
  const [guardando, setGuardando] = useState(false);

  const [studioAnterior, setStudioAnterior] = useState(studio);
  if (studio !== studioAnterior) {
    setStudioAnterior(studio);
    const servidor = studioToSepa(studio);
    setForm(sincronizarFormulario(form, base, servidor));
    setBase(servidor);
  }

  // Los datos SEPA son la cuenta donde entra el dinero de la remesa: los valida
  // y guarda el servidor (solo la dueña), y aquí se pinta lo que devolvió ya
  // normalizado — nunca lo que se tecleó.
  async function guardarSepa() {
    if (guardandoRef.current) return;
    guardandoRef.current = true;
    setGuardando(true);
    const enviado = form;
    try {
      const res = await fetch('/api/estudio/sepa', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify(enviado),
      });
      const data = await res.json().catch(() => null) as { datos?: DatosSepa; error?: string } | null;
      if (!res.ok || !data?.datos) { showToast(data?.error ?? 'No se han podido guardar los datos SEPA'); return; }
      reflejarStudioGuardado(data.datos);
      const guardado = studioToSepa(data.datos);
      setForm(f => sincronizarFormulario(f, enviado, guardado));
      setBase(guardado);
      showToast('Datos SEPA guardados');
    } catch {
      showToast('No se han podido guardar los datos SEPA. Revisa tu conexión.');
    } finally {
      guardandoRef.current = false;
      setGuardando(false);
    }
  }

  return (
    <>
      <TarjetaAjuste id="domiciliaciones">
        <p className="text-[12px] text-muted-foreground mb-4">
          El identificador de acreedor te lo da tu banco al darte de alta en los recibos domiciliados (SEPA).
          La remesa se genera en Cobros → Generar remesa SEPA.
        </p>
        <div className="grid grid-cols-1 @md/config:grid-cols-2 gap-4">
          <div>
            <label htmlFor={`${idSepa}-acreedor`} className={labelCls}>Identificador de acreedor SEPA</label>
            <input id={`${idSepa}-acreedor`} className={inputCls} value={form.sepaAcreedorId} onChange={e => setForm(f => ({ ...f, sepaAcreedorId: e.target.value }))} placeholder="ES00ZZZ00000000000" />
          </div>
          <div>
            <label htmlFor={`${idSepa}-iban`} className={labelCls}>IBAN de la cuenta del estudio</label>
            <input id={`${idSepa}-iban`} className={inputCls} value={form.sepaIban} onChange={e => setForm(f => ({ ...f, sepaIban: e.target.value }))} placeholder="ES00 0000 0000 0000 0000 0000" />
          </div>
          <div>
            <label htmlFor={`${idSepa}-titular`} className={labelCls}>Titular de la cuenta</label>
            <input id={`${idSepa}-titular`} className={inputCls} value={form.sepaTitular} onChange={e => setForm(f => ({ ...f, sepaTitular: e.target.value }))} />
          </div>
        </div>
        <button onClick={guardarSepa} disabled={guardando} className="mt-4 px-4 py-2 rounded-lg bg-brand text-brand-foreground text-[12px] font-medium hover:brightness-95 transition-colors disabled:opacity-60">
          {guardando ? 'Guardando…' : 'Guardar datos SEPA'}
        </button>
      </TarjetaAjuste>

      <PoliticaDevoluciones showToast={showToast} />
    </>
  );
}

// ── Política de devoluciones ─────────────────────────────────────────────────
// Apagada de fábrica a propósito: mientras lo esté, en la ficha de la clienta
// no aparece ningún botón de devolver, y el endpoint rechaza aunque se le llame
// a mano. Se puede seguir devolviendo desde Stripe como hasta ahora — Tentare
// se entera igual por el webhook.

type DevolucionesForm = { activos: boolean; plazo: string; soloSinUsar: boolean };

function studioToDevoluciones(
  s: Pick<Studio, 'reembolsosActivos' | 'reembolsoPlazoDias' | 'reembolsoSoloSinUsar'> | null,
): DevolucionesForm {
  // Los mismos valores por defecto que lee el servidor (app/api/reembolsos).
  return {
    activos: s?.reembolsosActivos ?? false,
    plazo: String(s?.reembolsoPlazoDias ?? 14),
    soloSinUsar: s?.reembolsoSoloSinUsar ?? true,
  };
}

function PoliticaDevoluciones({ showToast }: { showToast: (m: string) => void }) {
  const { studio, updateStudio } = useStudio();
  const idPlazo = useId();
  const [form, setForm] = useState<DevolucionesForm>(() => studioToDevoluciones(studio));
  const [base, setBase] = useState<DevolucionesForm>(() => studioToDevoluciones(studio));
  const guardandoRef = useRef(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
  const pendiente = hayCambios(form, base);

  function cambiar(cambio: Partial<DevolucionesForm>) {
    setForm(f => ({ ...f, ...cambio }));
    setError(null);
  }

  async function guardar() {
    // Un ref y no solo el `disabled`: dos toques seguidos llegan antes de que
    // el botón se repinte deshabilitado.
    if (guardandoRef.current || plazoInvalido) return;
    guardandoRef.current = true;
    setGuardando(true);
    setError(null);
    const enviado = form;
    const cambios = {
      reembolsosActivos: enviado.activos,
      reembolsoPlazoDias: plazoDias ?? leerPlazoReembolso(base.plazo) ?? 14,
      reembolsoSoloSinUsar: enviado.soloSinUsar,
    };
    try {
      const res = await updateStudio(cambios);
      // «Guardada» solo con la fila confirmada (updateStudio cuenta filas).
      if (!res.ok) { setError(res.error); showToast(res.error); return; }
      const guardado = studioToDevoluciones(cambios);
      setForm(f => sincronizarFormulario(f, enviado, guardado));
      setBase(guardado);
      showToast('Política de devoluciones guardada');
    } catch {
      const mensaje = 'No se ha podido guardar la política de devoluciones. Revisa tu conexión.';
      setError(mensaje);
      showToast(mensaje);
    } finally {
      guardandoRef.current = false;
      setGuardando(false);
    }
  }

  return (
    <TarjetaAjuste id="devoluciones">
      <p className="text-[12px] text-muted-foreground mb-4">
        Con esto activado aparece un botón para devolver en la pestaña <strong>Pagos</strong> de cada alumna,
        y el recibo queda marcado como devuelto. Si lo dejas apagado, puedes seguir devolviendo desde
        Stripe: Tentare se entera igual.
      </p>

      <div className="flex items-center justify-between py-2.5">
        <div className="pr-4">
          <p className="text-[13px] font-medium text-foreground">Permitir devolver desde Tentare</p>
          <p className="text-[11px] text-muted-foreground">Solo la propietaria y recepción ven el botón.</p>
        </div>
        <Toggle on={form.activos} onChange={v => cambiar({ activos: v })} ariaLabel="Permitir devolver desde Tentare" />
      </div>

      {form.activos && (
        <div className="mt-2 pt-3 border-t border-border space-y-4">
          <div className="max-w-[240px]">
            <label className={labelCls} htmlFor={idPlazo}>Plazo para devolver (días desde el cobro)</label>
            <input
              id={idPlazo}
              className={cn(inputCls, plazoInvalido && 'border-destructive')}
              type="number"
              min={0}
              max={PLAZO_REEMBOLSO_MAX_DIAS}
              step={1}
              inputMode="numeric"
              aria-invalid={plazoInvalido}
              value={form.plazo}
              onChange={e => cambiar({ plazo: e.target.value })}
            />
            {plazoInvalido ? (
              <p role="alert" className="text-[11px] font-medium text-destructive mt-1">
                {`Tienen que ser días enteros, entre 0 y ${PLAZO_REEMBOLSO_MAX_DIAS}. 0 = sin límite.`}
              </p>
            ) : (
              <p className="text-[11px] text-muted-foreground mt-1">
                {plazoDias
                  ? `Pasados ${plazoDias} días ya no se podrá devolver desde aquí.`
                  : '0 = sin límite: se podrá devolver un cobro de cualquier fecha.'}
              </p>
            )}
          </div>

          <div className="flex items-center justify-between py-1">
            <div className="pr-4">
              <p className="text-[13px] font-medium text-foreground">Solo bonos sin empezar</p>
              <p className="text-[11px] text-muted-foreground">
                No deja devolver un bono del que ya se han gastado sesiones. Los mensuales y las citas no se ven afectados.
              </p>
            </div>
            <Toggle on={form.soloSinUsar} onChange={v => cambiar({ soloSinUsar: v })} ariaLabel="Solo bonos sin empezar" />
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          onClick={guardar}
          disabled={guardando || !pendiente || plazoInvalido}
          className="px-4 py-2 rounded-lg bg-brand text-brand-foreground text-[12px] font-medium hover:brightness-95 transition-colors disabled:opacity-40"
        >
          {guardando ? 'Guardando…' : 'Guardar política'}
        </button>
        {pendiente && !guardando && <span className="text-[12px] text-muted-foreground">Cambios sin guardar.</span>}
      </div>
      {error && <p role="alert" className="mt-2 text-[12px] font-medium text-destructive">{error}</p>}
    </TarjetaAjuste>
  );
}
