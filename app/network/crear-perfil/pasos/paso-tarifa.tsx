'use client';

// Paso 09 del wizard: tarifa. Extraído tal cual de
// app/network/crear-perfil/page.tsx (paso === 8) — F0 del roadmap de
// Tentare Network 2.0, sin cambios de comportamiento.
import { SelectorChips } from '@/components/network/selector-chips';
import { TARIFAS_RANGO_NETWORK, TARIFA_RANGO_LABEL } from '@/lib/network/catalogo';
import type { FormState } from '../form-state';

export function PasoTarifa({
  form, setForm,
}: {
  form: FormState; setForm: (fn: (v: FormState) => FormState) => void;
}) {
  return (
    <SelectorChips
      unico
      v2
      opciones={TARIFAS_RANGO_NETWORK.map(v => ({ valor: v, etiqueta: TARIFA_RANGO_LABEL[v] }))}
      seleccion={form.tarifaRango ? [form.tarifaRango] : []}
      onChange={sel => setForm(v => ({ ...v, tarifaRango: sel[0] }))}
    />
  );
}
