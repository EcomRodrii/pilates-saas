'use client';

import type { CampoPersonalizado } from '@/lib/types';

export type CamposExtraValues = Record<string, string | number | boolean | null>;

// Renderiza los campos personalizados del estudio como inputs, según su tipo.
// Se usa tanto en el alta de socia como en su ficha. Cada página pasa su propia
// clase de input (`inputClassName`) para encajar con su estilo.
export function CamposExtraFields({
  campos,
  values,
  onChange,
  inputClassName,
}: {
  campos: CampoPersonalizado[];
  values: CamposExtraValues;
  onChange: (campoId: string, valor: string | number | boolean | null) => void;
  inputClassName: string;
}) {
  const activos = campos.filter(c => c.activo).sort((a, b) => a.orden - b.orden);
  if (activos.length === 0) return null;

  return (
    <>
      {activos.map(c => {
        const v = values[c.id];
        return (
          <div key={c.id} className="space-y-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {c.etiqueta}
              {c.requerido && <span className="text-[#DC2626]"> *</span>}
            </label>

            {c.tipo === 'booleano' ? (
              <label className="flex items-center gap-2 text-[13px] text-foreground">
                <input
                  type="checkbox"
                  checked={v === true}
                  onChange={e => onChange(c.id, e.target.checked)}
                />
                Sí
              </label>
            ) : c.tipo === 'seleccion' ? (
              <select
                className={inputClassName}
                value={typeof v === 'string' ? v : ''}
                onChange={e => onChange(c.id, e.target.value || null)}
              >
                <option value="">—</option>
                {c.opciones.map(o => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            ) : (
              <input
                className={inputClassName}
                type={c.tipo === 'numero' ? 'number' : c.tipo === 'fecha' ? 'date' : 'text'}
                value={v == null ? '' : String(v)}
                onChange={e => {
                  const raw = e.target.value;
                  onChange(c.id, raw === '' ? null : c.tipo === 'numero' ? Number(raw) : raw);
                }}
              />
            )}
          </div>
        );
      })}
    </>
  );
}
