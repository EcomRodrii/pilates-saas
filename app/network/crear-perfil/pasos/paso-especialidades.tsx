'use client';

// Paso 05 del wizard: especialidades. Extraído tal cual de
// app/network/crear-perfil/page.tsx (paso === 4) — F0 del roadmap de
// Tentare Network 2.0, sin cambios de comportamiento. Único paso que guarda
// al vuelo (`guardar`) en vez de esperar al botón Continuar — se mantiene
// igual, es el padre quien pasa esa función.
import { SelectorChips } from '@/components/network/selector-chips';
import { ESPECIALIDADES_NETWORK, ESPECIALIDAD_LABEL } from '@/lib/network/catalogo';
import type { FormState } from '../form-state';

export function PasoEspecialidades({
  form, setForm, guardar,
}: {
  form: FormState; setForm: (fn: (v: FormState) => FormState) => void;
  guardar: (cambios?: Partial<FormState>) => Promise<boolean>;
}) {
  return (
    <SelectorChips
      v2
      opciones={ESPECIALIDADES_NETWORK.map(v => ({ valor: v, etiqueta: ESPECIALIDAD_LABEL[v] }))}
      seleccion={form.especialidades}
      onChange={sel => { setForm(v => ({ ...v, especialidades: sel })); guardar({ especialidades: sel }); }}
    />
  );
}
