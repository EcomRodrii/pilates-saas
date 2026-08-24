'use client';

// Paso 10 del wizard: foto + idiomas + redes. Extraído tal cual de
// app/network/crear-perfil/page.tsx (paso === 9) — F0 del roadmap de
// Tentare Network 2.0, sin cambios de comportamiento.
import { useId } from 'react';
import { Camera } from 'lucide-react';
import { NW_TINTA, NW_BORDE, NW_MUTED, NW_MUTED_2, NW_SAGE } from '@/components/network-v2/tokens';
import type { PerfilNetwork } from '@/lib/network/tipos';
import type { FormState } from '../form-state';
import { inputCls, inputStyle, labelCls } from '../estilos';

export function PasoPerfil({
  perfil, form, setForm, fileInputFoto, subiendoFoto, subirFoto,
}: {
  perfil: PerfilNetwork | null;
  form: FormState; setForm: (fn: (v: FormState) => FormState) => void;
  fileInputFoto: React.RefObject<HTMLInputElement | null>;
  subiendoFoto: boolean;
  subirFoto: (file: File) => void;
}) {
  const uid = useId();

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4">
        <div className="relative">
          {perfil?.fotoUrl
            // eslint-disable-next-line @next/next/no-img-element -- foto subida por la instructora
            ? <img src={perfil.fotoUrl} alt={perfil.nombre} width={80} height={80} className="w-20 h-20 rounded-full object-cover" />
            : <div className="w-20 h-20 rounded-full flex items-center justify-center" style={{ background: NW_SAGE }}><Camera size={22} color={NW_MUTED} /></div>}
        </div>
        <div>
          <input ref={fileInputFoto} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) subirFoto(f); }} />
          <button type="button" disabled={subiendoFoto || !perfil} onClick={() => fileInputFoto.current?.click()} className="px-4 py-2 rounded-full text-[13px] font-semibold" style={{ border: `1px solid ${NW_BORDE}`, color: NW_TINTA }}>
            {subiendoFoto ? 'Subiendo…' : 'Subir foto'}
          </button>
          <p className="text-[12px] mt-1.5" style={{ color: NW_MUTED_2 }}>Una foto real, de cara. Recomendado: cuadrada, buena luz.</p>
        </div>
      </div>
      <div><label className={labelCls} style={{ color: NW_TINTA }} htmlFor={`${uid}-idiomas`}>Idiomas (separados por coma)</label>
        <input id={`${uid}-idiomas`} value={form.idiomasTexto} onChange={e => setForm(v => ({ ...v, idiomasTexto: e.target.value }))} className={inputCls} style={inputStyle} placeholder="Español (nativo), Inglés (avanzado)" /></div>
      <div className="grid sm:grid-cols-3 gap-3">
        <input aria-label="Instagram" value={form.instagram} onChange={e => setForm(v => ({ ...v, instagram: e.target.value }))} className={inputCls} style={inputStyle} placeholder="Instagram (opcional)" />
        <input aria-label="LinkedIn" value={form.linkedin} onChange={e => setForm(v => ({ ...v, linkedin: e.target.value }))} className={inputCls} style={inputStyle} placeholder="LinkedIn (opcional)" />
        <input aria-label="Web" value={form.web} onChange={e => setForm(v => ({ ...v, web: e.target.value }))} className={inputCls} style={inputStyle} placeholder="Web (opcional)" />
      </div>
    </div>
  );
}
