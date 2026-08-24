'use client';

// Paso 11 del wizard: revisar (vista previa de cómo verán el perfil los
// estudios). Extraído tal cual de app/network/crear-perfil/page.tsx — F0
// del roadmap de Tentare Network 2.0, sin cambios de comportamiento.
import { Camera, Check, Clock3 } from 'lucide-react';
import {
  ESPECIALIDAD_LABEL, DISPONIBILIDAD_ESTADO_LABEL, TARIFA_RANGO_LABEL, tituloProfesionalDe,
} from '@/lib/network/catalogo';
import { NW_TINTA, NW_MUTED, NW_MUTED_2, NW_BORDE, NW_SAGE, NW_PRODUCTO, NW_ESTADO } from '@/components/network-v2/tokens';
import type { PerfilNetwork, VerificacionIdentidadNetwork } from '@/lib/network/tipos';
import type { FormState } from '../form-state';

export function PasoRevisar({
  perfil, form, verificacion, onEditar,
}: {
  perfil: PerfilNetwork; form: FormState; verificacion: VerificacionIdentidadNetwork | null; onEditar: (paso: number) => void;
}) {
  return (
    <div className="text-center">
      <p className="text-[20px] font-extrabold mb-1" style={{ color: NW_TINTA }}>
        Así verán tu perfil <em style={{ color: NW_PRODUCTO }}>los estudios</em>
      </p>
      <p className="text-[13px] mb-6" style={{ color: NW_MUTED }}>Tus datos privados —documento, dirección, teléfono— no aparecen.</p>

      <div className="text-left rounded-2xl p-6 mb-6" style={{ border: `1px solid ${NW_BORDE}`, background: '#fff' }}>
        <div className="flex items-center gap-3">
          {perfil.fotoUrl
            // eslint-disable-next-line @next/next/no-img-element -- foto subida por la instructora
            ? <img src={perfil.fotoUrl} alt={perfil.nombre} width={56} height={56} className="w-14 h-14 rounded-full object-cover" />
            : <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: NW_SAGE }}><Camera size={18} color={NW_MUTED} /></div>}
          <div>
            <p className="text-[15px] font-extrabold" style={{ color: NW_TINTA }}>{perfil.nombre}</p>
            <p className="text-[13px] font-bold" style={{ color: NW_PRODUCTO }}>{tituloProfesionalDe(form.especialidades)}</p>
          </div>
        </div>
        <p className="text-[12.5px] mt-3" style={{ color: NW_MUTED_2 }}>{form.ciudad || 'Ciudad'} · {form.aniosExperiencia || '0'} años · {DISPONIBILIDAD_ESTADO_LABEL[form.disponibilidadEstado]}</p>
        {form.especialidades.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {form.especialidades.map(e => <span key={e} className="px-2.5 py-1 rounded-full text-[11.5px] font-semibold" style={{ background: NW_SAGE, color: NW_TINTA }}>{ESPECIALIDAD_LABEL[e]}</span>)}
          </div>
        )}
        <p className="text-[13px] font-bold mt-3" style={{ color: NW_TINTA }}>{form.tarifaRango ? `Desde ${TARIFA_RANGO_LABEL[form.tarifaRango]}` : 'Tarifa a consultar'}</p>
      </div>

      <div className="text-left space-y-1.5 mb-6">
        <p className="text-[12.5px] flex items-center gap-1.5" style={{ color: NW_MUTED }}><Check size={14} style={{ color: NW_PRODUCTO }} /> Email verificado</p>
        <p className="text-[12.5px] flex items-center gap-1.5" style={{ color: NW_MUTED }}>
          {verificacion?.estado === 'verificado'
            ? <><Check size={14} style={{ color: NW_PRODUCTO }} /> Identidad verificada</>
            : <><Clock3 size={14} style={{ color: NW_ESTADO.pendiente.color }} /> Identidad {verificacion ? 'en revisión' : 'pendiente'}</>}
        </p>
      </div>

      <button type="button" onClick={() => onEditar(0)} className="text-[13px] font-semibold underline" style={{ color: NW_TINTA }}>Editar algo</button>
    </div>
  );
}
