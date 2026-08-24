'use client';

// Paso 08 del wizard: disponibilidad (estado + horarios). Extraído tal cual
// de app/network/crear-perfil/page.tsx (paso === 7) — F0 del roadmap de
// Tentare Network 2.0, sin cambios de comportamiento.
import { SelectorChips } from '@/components/network/selector-chips';
import {
  HORARIOS_NETWORK, HORARIO_LABEL, DISPONIBILIDAD_ESTADOS_NETWORK, DISPONIBILIDAD_ESTADO_LABEL,
} from '@/lib/network/catalogo';
import { NW_TINTA } from '@/components/network-v2/tokens';
import type { FormState } from '../form-state';
import { labelCls } from '../estilos';

export function PasoDisponibilidad({
  form, setForm,
}: {
  form: FormState; setForm: (fn: (v: FormState) => FormState) => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <p className={labelCls} style={{ color: NW_TINTA }}>Estado</p>
        <SelectorChips
          unico
          v2
          opciones={DISPONIBILIDAD_ESTADOS_NETWORK.map(v => ({ valor: v, etiqueta: DISPONIBILIDAD_ESTADO_LABEL[v] }))}
          seleccion={[form.disponibilidadEstado]}
          onChange={sel => setForm(v => ({ ...v, disponibilidadEstado: sel[0] ?? v.disponibilidadEstado }))}
        />
      </div>
      <div>
        <p className={labelCls} style={{ color: NW_TINTA }}>Horarios</p>
        <SelectorChips
          v2
          opciones={HORARIOS_NETWORK.map(v => ({ valor: v, etiqueta: HORARIO_LABEL[v] }))}
          seleccion={form.disponibilidadHorarios}
          onChange={sel => setForm(v => ({ ...v, disponibilidadHorarios: sel }))}
        />
      </div>
    </div>
  );
}
