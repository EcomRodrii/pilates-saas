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
import { usePanelNuevo } from '@/lib/estudio/panel-nuevo-cliente';
import type { RewardTriggerDef } from '@/lib/types';

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

/**
 * Panel nuevo: los disparadores en grupos con su título, como «Gamificación» de
 * Bonsai (b-63: Clases, Eventos). Un disparador que no esté en ningún grupo cae
 * en el último, para que uno nuevo del catálogo no se quede sin pintar.
 */
const GRUPOS_CREDITOS: { titulo: string; sub: string; triggers: string[] }[] = [
  { titulo: 'Clases', sub: 'Lo que pasa con sus reservas y su asistencia.', triggers: ['PRIMERA_RESERVA', 'ASISTENCIA_CLASE', 'SEMANA_COMPLETA', 'OBJETIVO_MENSUAL'] },
  { titulo: 'Compras', sub: 'Lo que paga en el estudio.', triggers: ['RENOVACION_PLAN', 'COMPRA'] },
  { titulo: 'Amigas', sub: 'Cuando trae a alguien al estudio.', triggers: ['REFERIDO_AMIGO'] },
];
function gruposDeCreditos(): { titulo: string; sub: string; defs: RewardTriggerDef[] }[] {
  const conocidos = new Set(GRUPOS_CREDITOS.flatMap(g => g.triggers));
  return GRUPOS_CREDITOS.map((g, i) => ({
    titulo: g.titulo,
    sub: g.sub,
    defs: REWARD_TRIGGERS.filter(d => g.triggers.includes(d.trigger) || (i === GRUPOS_CREDITOS.length - 1 && !conocidos.has(d.trigger))),
  }));
}

/** Cuántos créditos da cada cosa: una fila de `reward_rules` por disparador. */
export function FormCreditosPorAccion({ onGuardado }: Pick<PropsFormularioCajon, 'onGuardado'>) {
  const { studio, rewardRules, addRewardRule, updateRewardRule } = useStudio();
  const panelNuevo = usePanelNuevo();
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

  // Los dos campos de más de dos acciones (por cada X € / como mucho N al mes).
  const extras = (def: RewardTriggerDef) => (
    <>
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
            value={form[def.trigger].unidadEuros}
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
            value={form[def.trigger].topeMensual}
            onChange={e => cambiar(def.trigger, { topeMensual: e.target.value })}
          />
          al mes
        </label>
      )}
    </>
  );

  const sumaDe = (def: RewardTriggerDef) => {
    const f = form[def.trigger];
    const malAqui = mal.includes(def.trigger);
    return (
      <label className={cn('flex shrink-0 items-center gap-1.5 text-[13px]', !f.activa && 'opacity-55')}>
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Suma</span>
        <input
          type="number"
          min={0}
          step={1}
          inputMode="numeric"
          aria-label={`Créditos por ${def.nombre}`}
          aria-invalid={malAqui}
          className={cn(inputCls, 'w-16 rounded-[10px] text-center font-semibold', malAqui && 'border-destructive')}
          value={f.creditos}
          onChange={e => escribir(def.trigger, e.target.value)}
        />
        <span className="text-muted-foreground">{moneda}</span>
      </label>
    );
  };

  if (panelNuevo) {
    return (
      <>
        <div className="flex flex-col gap-4 pb-6">
          <p className="rounded-[10px] bg-muted px-3 py-2.5 text-[13px] text-muted-foreground text-pretty">
            Enciende lo que quieras premiar y di cuántos {moneda} suma. Lo que ya ganó una alumna no cambia al tocar esto: vale para lo que pase a partir de ahora.
          </p>
          {gruposDeCreditos().filter(g => g.defs.length > 0).map(g => (
            <section key={g.titulo} aria-label={g.titulo} className="rounded-[14px] border border-border bg-card px-4 py-3">
              <h3 className="text-[15px] font-semibold text-foreground">{g.titulo}</h3>
              <p className="text-[12.5px] text-muted-foreground">{g.sub}</p>
              <ul className="mt-2 flex flex-col divide-y divide-border">
                {g.defs.map(def => {
                  const f = form[def.trigger];
                  return (
                    <li key={def.trigger} className="flex items-start gap-3 py-3">
                      <span className="mt-1.5 shrink-0"><Interruptor on={f.activa} onChange={v => cambiar(def.trigger, { activa: v })} ariaLabel={def.nombre} /></span>
                      <span className="min-w-0 flex-1">
                        {/* El nombre y lo que suma en una línea; lo que significa, debajo y a todo el ancho (el cajón es estrecho). */}
                        <span className="flex items-center justify-between gap-3">
                          <span className="min-w-0 text-[13.5px] font-semibold text-foreground">{def.nombre}</span>
                          {sumaDe(def)}
                        </span>
                        <span className="mt-0.5 block text-[12.5px] text-muted-foreground text-pretty">{def.descripcion}</span>
                        {(def.trigger === 'COMPRA' || def.trigger === 'REFERIDO_AMIGO') && (
                          <span className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-foreground">{extras(def)}</span>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
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
