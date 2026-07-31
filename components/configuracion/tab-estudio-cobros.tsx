'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { useStudio } from '@/lib/studio-context';
import type { Studio } from '@/lib/types';
import { inputCls, labelCls, cardCls } from '@/app/(dashboard)/configuracion/page';

type SepaForm = { sepaAcreedorId: string; sepaIban: string; sepaTitular: string };

function studioToSepa(s: Studio | null): SepaForm {
  return {
    sepaAcreedorId: s?.sepaAcreedorId ?? '',
    sepaIban: s?.sepaIban ?? '',
    sepaTitular: s?.sepaTitular ?? '',
  };
}

export function TabEstudioCobros({ showToast }: { showToast: (m: string) => void }) {
  const { studio, updateStudio } = useStudio();
  const [form, setForm] = useState<SepaForm>(() => studioToSepa(studio));

  const [studioAnterior, setStudioAnterior] = useState(studio);
  if (studio !== studioAnterior) {
    setStudioAnterior(studio);
    setForm(studioToSepa(studio));
  }

  function guardarSepa() {
    updateStudio({
      sepaAcreedorId: form.sepaAcreedorId.trim() || null,
      sepaIban: form.sepaIban.replace(/\s+/g, '').toUpperCase() || null,
      sepaTitular: form.sepaTitular.trim() || null,
    });
    showToast('Datos SEPA guardados');
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
        <button onClick={guardarSepa} className="mt-4 px-4 py-2 rounded-lg bg-brand text-brand-foreground text-[12px] font-medium hover:brightness-95 transition-colors">
          Guardar datos SEPA
        </button>
      </div>
    </div>
  );
}
