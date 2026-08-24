'use client';

// Paso 04 del wizard: experiencia (años + recorrido + SeccionExperienciaNetwork).
// Extraído tal cual de app/network/crear-perfil/page.tsx (paso === 3) — F0
// del roadmap de Tentare Network 2.0, sin cambios de comportamiento.
import { useId } from 'react';
import { SeccionExperienciaNetwork } from '@/components/network/seccion-experiencia';
import { NW_TINTA } from '@/components/network-v2/tokens';
import type { FormState } from '../form-state';
import { inputCls, inputStyle, labelCls } from '../estilos';

export function PasoExperiencia({
  form, setForm,
}: {
  form: FormState; setForm: (fn: (v: FormState) => FormState) => void;
}) {
  const uid = useId();

  return (
    <div className="space-y-4">
      <div><label className={labelCls} style={{ color: NW_TINTA }} htmlFor={`${uid}-anios`}>Años de experiencia</label>
        <input id={`${uid}-anios`} type="number" min={0} value={form.aniosExperiencia} onChange={e => setForm(v => ({ ...v, aniosExperiencia: e.target.value }))} className={inputCls} style={inputStyle} /></div>
      <div><label className={labelCls} style={{ color: NW_TINTA }} htmlFor={`${uid}-recorrido`}>Cuéntanos tu recorrido (opcional)</label>
        <textarea id={`${uid}-recorrido`} value={form.descripcion} onChange={e => setForm(v => ({ ...v, descripcion: e.target.value }))} rows={4} className={inputCls} style={inputStyle} /></div>
      <SeccionExperienciaNetwork onExperienciasChange={() => {}} tokensNetworkV2 />
    </div>
  );
}
