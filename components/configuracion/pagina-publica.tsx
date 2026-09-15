'use client';

import { useId, useState } from 'react';
import { cn } from '@/lib/utils';
import {
  CLAVE_MINIMA, confirmacionPaginaPublica, cuerpoPaginaPublica, formularioPaginaPublica, hayCambiosPaginaPublica,
  motivoClavePaginaPublica, textoGuardadoPaginaPublica, type EstadoPaginaPublica, type FormPaginaPublica,
} from '@/lib/configuracion/pagina-publica';
import { guardarPaginaPublica } from '@/lib/pagina-publica-cliente';
import { tarjetaPorId } from '@/lib/configuracion/secciones';
import { btnSecondary, inputCls } from '@/components/configuracion/estilos';
import { Campo } from '@/components/configuracion/formulario-estudio';
import { BarraGuardar } from '@/components/configuracion/shell/barra-guardar';

// ─────────────────────────────────────────────────────────────────────────────
// «Ocultar tu página», en Mi app y mi web (16-sep).
//
// Cambia lo que ven personas de fuera, así que no es un interruptor que se
// guarda al tocarlo: se elige en el cajón y «Guardar» pregunta con la
// consecuencia. «Guardado» solo con la respuesta del servidor; si falla, el
// cajón se queda abierto con el error (BarraGuardar). La lógica es la misma que
// usa `PanelVisibilidad` (lib/configuracion/pagina-publica.ts).
//
// Cada frase de «Si la ocultas» está comprobada contra el código que lo hace
// (ver la cabecera de lib/configuracion/pagina-publica.ts).
// ─────────────────────────────────────────────────────────────────────────────

const OPCIONES = [
  { oculta: false, titulo: 'Visible', detalle: 'Cualquiera con tu enlace reserva, y tus alumnas entran en su app.' },
  { oculta: true, titulo: 'Oculta', detalle: 'Enseñan «Estamos preparando esta página». Con clave, entra quien tú quieras.' },
] as const;

const SI_LA_OCULTAS = [
  'Tus alumnas también ven el aviso al abrir su app, aunque tengan cuenta.',
  'Los widgets de tu web enseñan el aviso, salvo el calendario incrustado, que sigue enseñando tus clases.',
  'En Tentare Network sigues saliendo si lo tienes encendido, pero tu enlace lleva al aviso.',
  'Le pedimos a Google que no la enseñe.',
];

function FormularioPaginaPublica({ estado, onGuardado }: {
  estado: EstadoPaginaPublica;
  onGuardado: (nuevo: EstadoPaginaPublica, texto: string) => void;
}) {
  const id = useId();
  const [form, setForm] = useState<FormPaginaPublica>(() => formularioPaginaPublica(estado));
  const cambiar = (cambio: Partial<FormPaginaPublica>) => setForm(f => ({ ...f, ...cambio }));
  const motivo = motivoClavePaginaPublica(form);

  async function alGuardar(): Promise<string | null> {
    const res = await guardarPaginaPublica(cuerpoPaginaPublica(form), estado);
    if (!res.ok) return res.error;
    onGuardado(res.estado, textoGuardadoPaginaPublica(res.estado, estado));
    return null;
  }

  return (
    <>
      <div className="flex flex-col gap-5 pb-6">
        <div>
          <p id={`${id}-pregunta`} className="text-sm font-semibold text-foreground">Quién ve tu página</p>
          <div role="radiogroup" aria-labelledby={`${id}-pregunta`} className="mt-2 space-y-2">
            {OPCIONES.map(o => (
              <label
                key={o.titulo}
                className={cn(
                  'flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors',
                  form.oculta === o.oculta ? 'border-brand bg-brand/5' : 'border-border hover:bg-muted',
                )}
              >
                <input
                  type="radio"
                  name={`${id}-visibilidad`}
                  className="mt-1 size-4 accent-[var(--brand)]"
                  checked={form.oculta === o.oculta}
                  onChange={() => cambiar({ oculta: o.oculta })}
                />
                <span>
                  <span className="block text-sm font-medium text-foreground">{o.titulo}</span>
                  <span className="mt-0.5 block text-sm text-muted-foreground text-pretty">{o.detalle}</span>
                </span>
              </label>
            ))}
          </div>
        </div>

        {form.oculta && (
          <div className="flex flex-col gap-3">
            <Campo
              label={estado.tieneClave ? 'Cambiar la clave' : 'Clave para dejar entrar (opcional)'}
              error={motivo}
              ayuda={estado.tieneClave ? 'Déjala vacía para seguir con la que tienes.' : `Mínimo ${CLAVE_MINIMA} caracteres. Sin clave no entra nadie.`}
            >
              {campoId => (
                <input
                  id={campoId}
                  type="password"
                  className={inputCls}
                  value={form.clave}
                  autoComplete="new-password"
                  disabled={form.quitarClave}
                  aria-invalid={!!motivo}
                  onChange={e => cambiar({ clave: e.target.value, quitarClave: false })}
                />
              )}
            </Campo>
            {estado.tieneClave && (
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  className="size-4 accent-[var(--brand)]"
                  checked={form.quitarClave}
                  onChange={e => cambiar(e.target.checked ? { quitarClave: true, clave: '' } : { quitarClave: false })}
                />
                Quitar la clave
              </label>
            )}
          </div>
        )}

        <div data-consecuencia="" className="rounded-lg bg-muted px-3 py-2.5 text-sm text-foreground">
          <p className="font-semibold">Si la ocultas</p>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-pretty">
            {SI_LA_OCULTAS.map(t => <li key={t}>{t}</li>)}
          </ul>
        </div>
      </div>
      <BarraGuardar
        seccion="web"
        cambios={hayCambiosPaginaPublica(form, estado) ? [tarjetaPorId('pagina-publica').titulo] : []}
        bloqueo={motivo}
        confirmar={confirmacionPaginaPublica(form, estado)}
        onGuardar={alGuardar}
        onDescartar={() => setForm(formularioPaginaPublica(estado))}
      />
    </>
  );
}

/**
 * El cajón. Sin saber cómo está la página no se enseña ningún formulario: uno
 * con «Visible» marcado por defecto afirmaría algo que nadie ha dicho.
 */
export function DetallePaginaPublica({ estado, cargando, onReintentar, onGuardado }: {
  estado: EstadoPaginaPublica | null;
  cargando: boolean;
  onReintentar: () => void;
  onGuardado: (nuevo: EstadoPaginaPublica, texto: string) => void;
}) {
  if (estado) {
    return <FormularioPaginaPublica key={`${estado.oculta}-${estado.tieneClave}`} estado={estado} onGuardado={onGuardado} />;
  }
  if (cargando) {
    return <p role="status" className="pb-6 text-sm text-muted-foreground">Mirando cómo está tu página…</p>;
  }
  return (
    <div className="flex flex-col items-start gap-3 pb-6">
      <p role="alert" className="text-sm font-medium text-destructive text-pretty">
        No hemos podido saber si tu página está visible u oculta.
      </p>
      <button type="button" onClick={onReintentar} className={btnSecondary}>Volver a intentarlo</button>
    </div>
  );
}
