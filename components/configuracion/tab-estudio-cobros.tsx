'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { useStudio } from '@/lib/studio-context';
import type { Studio } from '@/lib/types';
import { authHeader } from '@/lib/api-client';
import type { DatosSepa } from '@/lib/billing/cuenta-cobro';
import { Toggle, inputCls, labelCls, cardCls } from '@/app/(dashboard)/configuracion/page';

type SepaForm = { sepaAcreedorId: string; sepaIban: string; sepaTitular: string };

function studioToSepa(s: Studio | null): SepaForm {
  return {
    sepaAcreedorId: s?.sepaAcreedorId ?? '',
    sepaIban: s?.sepaIban ?? '',
    sepaTitular: s?.sepaTitular ?? '',
  };
}

export function TabEstudioCobros({ showToast }: { showToast: (m: string) => void }) {
  const { studio, reflejarStudioGuardado } = useStudio();
  const [form, setForm] = useState<SepaForm>(() => studioToSepa(studio));
  const [guardando, setGuardando] = useState(false);

  const [studioAnterior, setStudioAnterior] = useState(studio);
  if (studio !== studioAnterior) {
    setStudioAnterior(studio);
    setForm(studioToSepa(studio));
  }

  // Los datos SEPA son la cuenta donde entra el dinero de la remesa: los valida
  // y guarda el servidor (solo la dueña), y aquí se pinta lo que devolvió ya
  // normalizado — nunca lo que se tecleó.
  async function guardarSepa() {
    if (guardando) return;
    setGuardando(true);
    try {
      const res = await fetch('/api/estudio/sepa', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => null) as { datos?: DatosSepa; error?: string } | null;
      if (!res.ok || !data?.datos) { showToast(data?.error ?? 'No se han podido guardar los datos SEPA'); return; }
      reflejarStudioGuardado(data.datos);
      showToast('Datos SEPA guardados');
    } catch {
      showToast('No se han podido guardar los datos SEPA. Revisa tu conexión.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="space-y-5 max-w-2xl">
      <div className={cn(cardCls, 'p-6')}>
        <h3 className="text-[14px] font-semibold text-foreground mb-1">Domiciliaciones SEPA (cuaderno 19.14)</h3>
        <p className="text-[12px] text-muted-foreground mb-4">Para generar la remesa que subes al banco (Cobros → Generar remesa SEPA). Tu banco te da el identificador de acreedor al darte de alta.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <p className={labelCls}>Identificador de acreedor SEPA</p>
            <input className={inputCls} value={form.sepaAcreedorId} onChange={e => setForm(f => ({ ...f, sepaAcreedorId: e.target.value }))} placeholder="ES00ZZZ00000000000" />
          </div>
          <div>
            <p className={labelCls}>IBAN de la cuenta del estudio</p>
            <input className={inputCls} value={form.sepaIban} onChange={e => setForm(f => ({ ...f, sepaIban: e.target.value }))} placeholder="ES00 0000 0000 0000 0000 0000" />
          </div>
          <div>
            <p className={labelCls}>Titular de la cuenta</p>
            <input className={inputCls} value={form.sepaTitular} onChange={e => setForm(f => ({ ...f, sepaTitular: e.target.value }))} />
          </div>
        </div>
        <button onClick={guardarSepa} disabled={guardando} className="mt-4 px-4 py-2 rounded-lg bg-brand text-brand-foreground text-[12px] font-medium hover:brightness-95 transition-colors disabled:opacity-60">
          {guardando ? 'Guardando…' : 'Guardar datos SEPA'}
        </button>
      </div>

      <PoliticaDevoluciones showToast={showToast} />
    </div>
  );
}

// ── Política de devoluciones ─────────────────────────────────────────────────
// Apagada de fábrica a propósito: mientras lo esté, en la ficha de la clienta
// no aparece ningún botón de devolver, y el endpoint rechaza aunque se le llame
// a mano. Se puede seguir devolviendo desde Stripe como hasta ahora — Tentare
// se entera igual por el webhook.

function PoliticaDevoluciones({ showToast }: { showToast: (m: string) => void }) {
  const { studio, updateStudio } = useStudio();
  const [activos, setActivos] = useState(studio?.reembolsosActivos ?? false);
  const [plazo, setPlazo] = useState(String(studio?.reembolsoPlazoDias ?? 14));
  const [soloSinUsar, setSoloSinUsar] = useState(studio?.reembolsoSoloSinUsar ?? true);

  const [anterior, setAnterior] = useState(studio);
  if (studio !== anterior) {
    setAnterior(studio);
    setActivos(studio?.reembolsosActivos ?? false);
    setPlazo(String(studio?.reembolsoPlazoDias ?? 14));
    setSoloSinUsar(studio?.reembolsoSoloSinUsar ?? true);
  }

  async function guardar() {
    // Un plazo negativo o con letras se guarda como 0 = sin límite, que es lo
    // MENOS restrictivo: mejor eso que un número raro que bloquee sin explicarse.
    const dias = Math.max(0, Math.trunc(Number(plazo) || 0));
    const res = await updateStudio({
      reembolsosActivos: activos,
      reembolsoPlazoDias: dias,
      reembolsoSoloSinUsar: soloSinUsar,
    });
    showToast(res.ok ? 'Política de devoluciones guardada' : res.error);
  }

  return (
    <div className={cn(cardCls, 'p-6')}>
      <h3 className="text-[14px] font-semibold text-foreground mb-1">Devoluciones</h3>
      <p className="text-[12px] text-muted-foreground mb-4">
        Con esto activado aparece un botón para devolver en la pestaña <strong>Pagos</strong> de cada clienta.
        El dinero vuelve a su tarjeta y el recibo queda marcado como devuelto. Si lo dejas apagado, puedes
        seguir devolviendo desde Stripe: Tentare se entera igual.
      </p>

      <div className="flex items-center justify-between py-2.5">
        <div className="pr-4">
          <p className="text-[13px] font-medium text-foreground">Permitir devolver desde Tentare</p>
          <p className="text-[11px] text-muted-foreground">Solo la propietaria y recepción ven el botón.</p>
        </div>
        <Toggle on={activos} onChange={setActivos} />
      </div>

      {activos && (
        <div className="mt-2 pt-3 border-t border-border space-y-4">
          <div className="max-w-[240px]">
            <p className={labelCls}>Plazo para devolver (días desde el cobro)</p>
            <input
              className={inputCls}
              type="number"
              min={0}
              value={plazo}
              onChange={e => setPlazo(e.target.value)}
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              {Number(plazo) > 0
                ? `Pasados ${Math.trunc(Number(plazo))} días ya no se podrá devolver desde aquí.`
                : '0 = sin límite: se podrá devolver un cobro de cualquier fecha.'}
            </p>
          </div>

          <div className="flex items-center justify-between py-1">
            <div className="pr-4">
              <p className="text-[13px] font-medium text-foreground">Solo bonos sin empezar</p>
              <p className="text-[11px] text-muted-foreground">
                No deja devolver un bono del que ya se han gastado sesiones. Los mensuales y las citas no se ven afectados.
              </p>
            </div>
            <Toggle on={soloSinUsar} onChange={setSoloSinUsar} />
          </div>
        </div>
      )}

      <button onClick={guardar} className="mt-4 px-4 py-2 rounded-lg bg-brand text-brand-foreground text-[12px] font-medium hover:brightness-95 transition-colors">
        Guardar política
      </button>
    </div>
  );
}
