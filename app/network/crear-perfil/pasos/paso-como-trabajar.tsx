'use client';

// Paso 07 del wizard: modalidad y tipo de oportunidades. Extraído tal cual
// de app/network/crear-perfil/page.tsx (paso === 6) — F0 del roadmap de
// Tentare Network 2.0, sin cambios de comportamiento.
import { SelectorChips } from '@/components/network/selector-chips';
import { TIPOS_TRABAJO_NETWORK, TIPO_TRABAJO_LABEL } from '@/lib/network/catalogo';
import { NW_TINTA } from '@/components/network-v2/tokens';
import type { FormState } from '../form-state';
import { labelCls } from '../estilos';

export function PasoComoTrabajar({
  form, setForm,
}: {
  form: FormState; setForm: (fn: (v: FormState) => FormState) => void;
}) {
  return (
    <div className="space-y-4">
      <p className={labelCls} style={{ color: NW_TINTA }}>Modalidad y tipo de oportunidades</p>
      <SelectorChips
        v2
        opciones={TIPOS_TRABAJO_NETWORK.map(v => ({ valor: v, etiqueta: TIPO_TRABAJO_LABEL[v] }))}
        seleccion={form.tipoTrabajo}
        onChange={sel => setForm(v => ({ ...v, tipoTrabajo: sel }))}
      />
    </div>
  );
}
