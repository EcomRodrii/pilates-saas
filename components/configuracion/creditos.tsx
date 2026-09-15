'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { useStudio } from '@/lib/studio-context';
import { REWARD_TRIGGERS } from '@/lib/engines/reward-engine';
import { NOMBRE_CREDITOS_MAX, nombreCreditos, normalizarNombreCreditos } from '@/lib/creditos-nombre';
import { sincronizarFormulario } from '@/lib/configuracion/formulario-sincronizado';
import {
  accionesAFormulario, accionesConCreditosMal, cambiosReglasCreditos, creditosValidos, enteroPositivo, escribirCreditos, escriturasDeAcciones,
  reglasCreditosAFormulario, type AccionForm, type AccionesForm, type ReglasCreditosForm,
} from '@/lib/configuracion/creditos';
import { resumenCreditosPorAccion, resumenReglasCreditos } from '@/lib/configuracion/resumenes';
import { tarjetaPorId } from '@/lib/configuracion/secciones';
import { Interruptor } from '@/components/ui/interruptor';
import { inputCls } from '@/components/configuracion/estilos';
import { Campo } from '@/components/configuracion/formulario-estudio';
import { BarraGuardar } from '@/components/configuracion/shell/barra-guardar';
import type { PropsFormularioCajon } from '@/components/configuracion/shell/cajon-ajuste';

// ─────────────────────────────────────────────────────────────────────────────
// Los dos cajones de los créditos, en Motivación (15-sep, v2).
//
// Se guardaban al salir de cada campo: se tecleaba el nombre, se salía y ya
// estaba escrito, sin «Guardar» ni forma de arrepentirse, al lado de catálogos
// que sí tenían su botón. Ahora cada cajón tiene UN «Guardar» (BarraGuardar)
// que manda solo lo que ha cambiado de verdad (lib/configuracion/creditos.ts) y
// solo dice «Guardado» con la respuesta del servidor.
// ─────────────────────────────────────────────────────────────────────────────

const CONSECUENCIA = 'rounded-lg bg-muted px-3 py-2.5 text-sm text-foreground text-pretty';

/** Cómo se llaman, cuánto duran y la racha: tres columnas de `studios`. */
export function FormReglasCreditos({ onGuardado }: Pick<PropsFormularioCajon, 'onGuardado'>) {
  const { studio, updateStudio } = useStudio();
  const [form, setForm] = useState<ReglasCreditosForm>(() => reglasCreditosAFormulario(studio));
  const [base, setBase] = useState<ReglasCreditosForm>(() => reglasCreditosAFormulario(studio));
  // Si el estudio cambia por otro lado, lo que no se ha tocado se pone al día (#2027).
  const [anterior, setAnterior] = useState(studio);
  if (studio !== anterior) {
    setAnterior(studio);
    const servidor = reglasCreditosAFormulario(studio);
    setForm(sincronizarFormulario(form, base, servidor));
    setBase(servidor);
  }

  const cambios = cambiosReglasCreditos(form, studio);
  const asi = resumenReglasCreditos({
    creditosNombre: normalizarNombreCreditos(form.nombre),
    creditosCaducanMeses: enteroPositivo(form.caducanMeses),
    rachaClasesSemana: enteroPositivo(form.rachaClases),
  });
  const cambiar = (cambio: Partial<ReglasCreditosForm>) => setForm(f => ({ ...f, ...cambio }));

  async function alGuardar(): Promise<string | null> {
    // «Guardado» solo con la fila confirmada (updateStudio cuenta filas).
    const res = await updateStudio(cambios);
    if (!res.ok) return res.error;
    onGuardado('Créditos guardados');
    return null;
  }

  return (
    <>
      <div className="flex flex-col gap-5 pb-6">
        <Campo label="Nombre de tus créditos" ayuda="En plural, como «puntos» o «estrellas». Vacío = «créditos».">
          {id => (
            <input
              id={id}
              className={cn(inputCls, 'max-w-60')}
              value={form.nombre}
              placeholder="créditos"
              maxLength={NOMBRE_CREDITOS_MAX}
              onChange={e => cambiar({ nombre: e.target.value })}
            />
          )}
        </Campo>
        <Campo label="Meses que duran" ayuda="Desde la última vez que gana. Vacío = no caducan.">
          {id => (
            <input
              id={id}
              className={cn(inputCls, 'max-w-40')}
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              value={form.caducanMeses}
              placeholder="No caducan"
              onChange={e => cambiar({ caducanMeses: e.target.value })}
            />
          )}
        </Campo>
        <Campo label="Clases por semana para mantener la racha" ayuda="La semana en curso nunca rompe la racha: cuenta cuando termina.">
          {id => (
            <input
              id={id}
              className={cn(inputCls, 'max-w-40')}
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              value={form.rachaClases}
              placeholder="1"
              onChange={e => cambiar({ rachaClases: e.target.value })}
            />
          )}
        </Campo>
        {asi && <p data-consecuencia="" className={CONSECUENCIA}>Así queda: {asi}.</p>}
      </div>
      <BarraGuardar
        seccion="motivacion"
        cambios={Object.keys(cambios).length > 0 ? [tarjetaPorId('reglas').titulo] : []}
        onGuardar={alGuardar}
        onDescartar={() => setForm(reglasCreditosAFormulario(studio))}
      />
    </>
  );
}

const DISPARADORES = REWARD_TRIGGERS.map(d => d.trigger);

/** Cuántos créditos da cada cosa: una fila de `reward_rules` por disparador. */
export function FormCreditosPorAccion({ onGuardado }: Pick<PropsFormularioCajon, 'onGuardado'>) {
  const { studio, rewardRules, addRewardRule, updateRewardRule } = useStudio();
  const moneda = nombreCreditos(studio?.creditosNombre);
  const [form, setForm] = useState<AccionesForm>(() => accionesAFormulario(rewardRules));
  const [base, setBase] = useState<AccionesForm>(() => accionesAFormulario(rewardRules));
  const [anteriores, setAnteriores] = useState(rewardRules);
  if (rewardRules !== anteriores) {
    setAnteriores(rewardRules);
    const servidor = accionesAFormulario(rewardRules);
    setForm(sincronizarFormulario(form, base, servidor));
    setBase(servidor);
  }

  const escrituras = escriturasDeAcciones(form, rewardRules);
  const mal = accionesConCreditosMal(form);
  const asi = resumenCreditosPorAccion(
    DISPARADORES.map(trigger => ({ trigger, activa: form[trigger].activa, creditos: creditosValidos(form[trigger].creditos) ? Number(form[trigger].creditos) : 0 })),
    DISPARADORES,
    moneda,
  );
  const cambiar = (trigger: string, cambio: Partial<AccionForm>) =>
    setForm(f => ({ ...f, [trigger]: { ...f[trigger], ...cambio } }));
  // La cifra: más de 0 enciende la acción y 0 o vacío la apaga, a la vista y
  // antes de guardar (16-sep). El interruptor, en cambio, no toca la cifra.
  const escribir = (trigger: string, texto: string) =>
    setForm(f => ({ ...f, [trigger]: escribirCreditos(f[trigger], texto) }));

  async function alGuardar(): Promise<string | null> {
    // Una a una y en orden: si una falla, las anteriores quedan guardadas (y la
    // pantalla lo refleja) y la que falló sigue en pantalla con el motivo.
    for (const e of escrituras) {
      const def = REWARD_TRIGGERS.find(d => d.trigger === e.trigger)!;
      const res = 'cambios' in e
        ? await updateRewardRule(e.id, e.cambios)
        : await addRewardRule({ trigger: e.trigger, nombre: def.nombre, descripcion: def.descripcion, ...e.nueva });
      if (!res.ok) return res.error;
    }
    onGuardado('Créditos por acción guardados');
    return null;
  }

  return (
    <>
      <div className="flex flex-col gap-5 pb-6">
        <ul className="flex flex-col divide-y divide-border">
          {REWARD_TRIGGERS.map(def => {
            const f = form[def.trigger];
            const malAqui = mal.includes(def.trigger);
            return (
              <li key={def.trigger} className="flex flex-col gap-3 py-4 first:pt-0">
                <div className="flex items-start justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-foreground">{def.nombre}</span>
                    <span className="block text-sm text-muted-foreground text-pretty">{def.descripcion}</span>
                  </span>
                  <Interruptor on={f.activa} onChange={v => cambiar(def.trigger, { activa: v })} ariaLabel={def.nombre} />
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-foreground">
                  <label className="flex items-center gap-2">
                    <input
                      type="number"
                      min={0}
                      step={1}
                      inputMode="numeric"
                      aria-label={`Créditos por ${def.nombre}`}
                      aria-invalid={malAqui}
                      className={cn(inputCls, 'w-24 text-center', malAqui && 'border-destructive')}
                      value={f.creditos}
                      onChange={e => escribir(def.trigger, e.target.value)}
                    />
                    {moneda}
                  </label>
                  {def.trigger === 'COMPRA' && (
                    <label className="flex items-center gap-2">
                      por cada
                      <input
                        type="number"
                        min={0}
                        step={1}
                        inputMode="numeric"
                        aria-label="Euros por cada premio de compra"
                        placeholder="1"
                        className={cn(inputCls, 'w-20 text-center')}
                        value={f.unidadEuros}
                        onChange={e => cambiar(def.trigger, { unidadEuros: e.target.value })}
                      />
                      €
                    </label>
                  )}
                  {def.trigger === 'REFERIDO_AMIGO' && (
                    <label className="flex items-center gap-2">
                      como mucho
                      <input
                        type="number"
                        min={0}
                        step={1}
                        inputMode="numeric"
                        aria-label={`Tope mensual de ${def.nombre}`}
                        placeholder="Sin tope"
                        className={cn(inputCls, 'w-24 text-center')}
                        value={f.topeMensual}
                        onChange={e => cambiar(def.trigger, { topeMensual: e.target.value })}
                      />
                      al mes
                    </label>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
        {asi && <p data-consecuencia="" className={CONSECUENCIA}>Así queda: {asi}.</p>}
      </div>
      <BarraGuardar
        seccion="motivacion"
        cambios={escrituras.length > 0 ? [tarjetaPorId('creditos-por-accion').titulo] : []}
        bloqueo={mal.length > 0 ? `Pon un número de ${moneda} en cada acción encendida.` : null}
        onGuardar={alGuardar}
        onDescartar={() => setForm(accionesAFormulario(rewardRules))}
      />
    </>
  );
}
