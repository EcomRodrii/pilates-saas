'use client';

// Paso 03 del wizard: ubicación (ciudad/zona/radio). Extraído tal cual de
// app/network/crear-perfil/page.tsx (paso === 2) — F0 del roadmap de
// Tentare Network 2.0, sin cambios de comportamiento.
import { useId } from 'react';
import { NW_TINTA, NW_BORDE } from '@/components/network-v2/tokens';
import type { FormState } from '../form-state';
import { inputCls, inputStyle, labelCls } from '../estilos';

export function PasoUbicacion({
  form, setForm,
}: {
  form: FormState; setForm: (fn: (v: FormState) => FormState) => void;
}) {
  const uid = useId();

  return (
    <div className="space-y-4">
      <div><label className={labelCls} style={{ color: NW_TINTA }} htmlFor={`${uid}-ciudad`}>Ciudad</label>
        <input id={`${uid}-ciudad`} value={form.ciudad} onChange={e => setForm(v => ({ ...v, ciudad: e.target.value }))} className={inputCls} style={inputStyle} placeholder="Barcelona" /></div>
      <div><label className={labelCls} style={{ color: NW_TINTA }} htmlFor={`${uid}-zona`}>Zona / barrio (opcional)</label>
        <input id={`${uid}-zona`} value={form.zona} onChange={e => setForm(v => ({ ...v, zona: e.target.value }))} className={inputCls} style={inputStyle} placeholder="Gràcia" /></div>
      <div>
        <label className={labelCls} style={{ color: NW_TINTA }}>Radio de desplazamiento</label>
        <div className="flex gap-2">
          {['5', '10', '25', '50'].map(km => (
            <button key={km} type="button" onClick={() => setForm(v => ({ ...v, radioKm: km }))}
              className="px-4 py-2 rounded-full text-[13px] font-semibold"
              style={{ background: form.radioKm === km ? NW_TINTA : '#fff', color: form.radioKm === km ? '#fff' : NW_TINTA, border: `1px solid ${NW_BORDE}` }}>
              {km} km
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
