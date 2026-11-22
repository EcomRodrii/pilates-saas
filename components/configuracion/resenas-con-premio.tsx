'use client';

// «Reseñas y premio» (Configuración → Cómo me comunico, 21-nov-2026): el enlace de
// reseñas del estudio y el código que se regala a quien valora una clase en Tentare.
//
// ⚠️ El premio es por valorar EN TENTARE (solo valora quien asistió) y se da con
// cualquier nota; el enlace de reseñas se ofrece a TODAS, aparte. Nunca «te
// regalamos X si dejas una reseña en Google»: no se puede comprobar, Google lo
// prohíbe y la normativa de consumo exige declararlo. Lo dice la propia pantalla,
// porque es lo que el estudio tiene que entender antes de encenderlo.
// Reglas y topes: lib/valoraciones/premio.ts. Todo se guarda por
// /api/estudio/resenas (el servidor valida y la base lo vuelve a exigir).
//
// Vive en Configuración y no en Marketing: ese módulo está desactivado
// (MARKETING_MODULE_ENABLED = false) y el estudio no podría llegar a él.

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { useStudio } from '@/lib/studio-context';
import { authHeader } from '@/lib/api-client';
import { hayCambios } from '@/lib/configuracion/formulario-sincronizado';
import { tarjetaPorId } from '@/lib/configuracion/secciones';
import {
  LIMITES_PREMIO, leerRespuestaResenas, resumenResenas, textoDelPremio, validarAjustesResenas,
  type AjustesResenas, type RespuestaResenas, type TipoPremio,
} from '@/lib/valoraciones/premio';
import { Toggle, inputCls } from '@/components/configuracion/estilos';
import { BotonQr } from '@/components/configuracion/dialogo-qr';
import { useOrigen } from '@/components/configuracion/tab-estudio-enlaces';
import { Campo } from '@/components/configuracion/formulario-estudio';
import { BarraGuardar } from '@/components/configuracion/shell/barra-guardar';
import type { PropsFormularioCajon } from '@/components/configuracion/shell/cajon-ajuste';

export interface Resenas {
  carga: 'cargando' | 'error' | RespuestaResenas;
  fijar: (r: RespuestaResenas) => void;
  /** Lo que dice la fila: `null` hasta que se sabe. */
  valor: string | null;
}

/** Lee los ajustes una vez (los comparten la fila y su cajón). */
export function useResenas(): Resenas {
  const [carga, setCarga] = useState<Resenas['carga']>('cargando');
  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const res = await fetch('/api/estudio/resenas', { headers: await authHeader() });
        if (!res.ok) throw new Error(String(res.status));
        // Con otra forma (un `{}`, un servidor viejo) es «no se pudo leer», no una pantalla rota.
        const r = leerRespuestaResenas(await res.json().catch(() => null));
        if (!r) throw new Error('respuesta inesperada');
        if (vivo) setCarga(r);
      } catch {
        if (vivo) setCarga('error');
      }
    })();
    return () => { vivo = false; };
  }, []);
  return { carga, fijar: setCarga, valor: typeof carga === 'object' ? resumenResenas(carga.ajustes) : null };
}

interface Formulario { enlace: string; conPremio: boolean; tipo: TipoPremio; valor: string; dias: string }

function formularioDe(a: AjustesResenas): Formulario {
  return {
    enlace: a.enlace ?? '',
    conPremio: a.premioTipo != null,
    tipo: a.premioTipo ?? 'PORCENTAJE',
    valor: a.premioValor != null ? String(a.premioValor).replace('.', ',') : '10',
    dias: String(a.premioDias),
  };
}

/** Lo que se enviaría: lo mismo que valida el servidor, para decirlo antes de pulsar. */
function propuestaDe(f: Formulario) {
  return {
    enlace: f.enlace.trim() || null,
    premio: f.conPremio ? { tipo: f.tipo, valor: Number(f.valor.replace(',', '.')), dias: Number(f.dias) } : null,
  };
}

export function FormResenasConPremio({ resenas, onGuardado }: { resenas: Resenas } & Pick<PropsFormularioCajon, 'onGuardado'>) {
  const { carga } = resenas;
  if (carga === 'cargando') return <p className="py-6 text-sm text-muted-foreground" role="status">Cargando…</p>;
  if (carga === 'error') return <p className="py-6 text-sm text-destructive" role="alert">No se han podido leer los ajustes. Cierra y vuelve a abrir, o recarga la página.</p>;
  return <Cuerpo respuesta={carga} resenas={resenas} onGuardado={onGuardado} />;
}

function Cuerpo({ respuesta, resenas, onGuardado }: { respuesta: RespuestaResenas; resenas: Resenas } & Pick<PropsFormularioCajon, 'onGuardado'>) {
  const base = formularioDe(respuesta.ajustes);
  const { studio } = useStudio();
  const origen = useOrigen();
  const [form, setForm] = useState<Formulario>(base);
  const cambiar = (parcial: Partial<Formulario>) => setForm(f => ({ ...f, ...parcial }));

  const propuesta = propuestaDe(form);
  const validacion = validarAjustesResenas(propuesta);
  // El error del enlace sale en su campo y el del premio en el suyo: no uno solo para los dos.
  const enlaceMal = form.enlace.trim() !== '' && !validarAjustesResenas({ enlace: form.enlace }).ok;
  const premioMal = form.conPremio && !validarAjustesResenas({ premio: propuesta.premio }).ok;
  const errorEnlace = enlaceMal && !validacion.ok ? validacion.error : null;
  const errorPremio = !enlaceMal && !validacion.ok ? validacion.error : null;
  const premioVista = form.conPremio && validacion.ok && validacion.ajustes.premioTipo
    ? textoDelPremio({ tipo: validacion.ajustes.premioTipo, valor: validacion.ajustes.premioValor ?? 0 })
    : null;

  async function alGuardar(): Promise<string | null> {
    if (!validacion.ok) return validacion.error;
    try {
      const res = await fetch('/api/estudio/resenas', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify(propuesta),
      });
      const crudo = (await res.json().catch(() => null)) as { error?: unknown } | null;
      const j = res.ok ? leerRespuestaResenas(crudo) : null;
      // Nada de «guardado» sin que el servidor lo diga.
      if (!j) return typeof crudo?.error === 'string' ? crudo.error : 'No se ha podido guardar. Inténtalo de nuevo.';
      resenas.fijar(j);
      setForm(formularioDe(j.ajustes));
      onGuardado('Reseñas y premio guardado');
      return null;
    } catch {
      return 'Sin conexión. Inténtalo de nuevo.';
    }
  }

  return (
    <>
      <div className="flex flex-col gap-5 pb-6" data-testid="resenas-con-premio">
        <Campo
          label="Enlace de tu página de reseñas"
          error={errorEnlace}
          ayuda="Se lo enseñamos a cada cliente una sola vez, cuando ya ha ido a 3 clases, justo después de valorar una: sea cual sea su nota. También lo lleva el cartel con QR."
        >
          {id => (
            <input
              id={id} type="url" inputMode="url" autoComplete="off" className={inputCls} placeholder="https://g.page/r/…"
              aria-invalid={enlaceMal} value={form.enlace} onChange={e => cambiar({ enlace: e.target.value })}
            />
          )}
        </Campo>

        <details className="rounded-lg border border-border px-3 py-2 text-sm" data-testid="resenas-ayuda-enlace">
          <summary className="cursor-pointer font-medium text-foreground">¿Dónde saco ese enlace?</summary>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted-foreground text-pretty">
            <li>Busca tu estudio en Google (o entra en tu Perfil de empresa de Google).</li>
            <li>Pulsa «Pedir reseñas» (o «Obtener más reseñas») y copia el enlace corto: empieza por <code className="font-mono text-xs">https://g.page/r/</code>.</li>
            <li>Pégalo aquí y pulsa «Guardar». Después, «Probar el enlace» te lleva a ver cómo lo verá tu cliente.</li>
          </ol>
        </details>

        {respuesta.ajustes.enlace && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2" data-testid="resenas-acciones-enlace">
            <a href={respuesta.ajustes.enlace} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-brand-medio underline underline-offset-2">Probar el enlace</a>
            {respuesta.slug && (
              <BotonQr
                destino="resena" url={`${origen}/resena/${respuesta.slug}`} slug={respuesta.slug}
                estudio={studio?.nombre ?? ''} nombreEnlace="Reseñas"
              />
            )}
          </div>
        )}

        <label className="flex min-h-11 cursor-pointer items-center justify-between gap-4">
          <span className="min-w-0">
            <span className="block text-sm font-medium text-foreground">Regalar un descuento a quien valora una clase</span>
            <span className="block text-sm text-muted-foreground text-pretty">Una vez por cliente. Es un código que se canjea en la Caja o al comprar un bono o un plan en su app.</span>
          </span>
          <Toggle on={form.conPremio} onChange={v => cambiar({ conPremio: v })} />
        </label>

        {form.conPremio && (
          <div className="flex flex-col gap-4 rounded-lg border border-border p-4" data-testid="resenas-premio">
            <fieldset>
              <legend className="mb-2 text-sm font-medium text-foreground">El premio</legend>
              <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Tipo de descuento">
                {([['PORCENTAJE', 'Porcentaje'], ['IMPORTE_FIJO', 'Importe fijo']] as const).map(([t, nombre]) => (
                  <button
                    key={t} type="button" role="radio" aria-checked={form.tipo === t}
                    onClick={() => cambiar({ tipo: t })}
                    className={cn('rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors', form.tipo === t ? 'border-brand bg-brand/5 text-foreground' : 'border-border text-muted-foreground hover:bg-muted')}
                  >{nombre}</button>
                ))}
                <div className="flex items-center gap-1.5">
                  <input
                    aria-label={form.tipo === 'PORCENTAJE' ? 'Porcentaje de descuento' : 'Importe del descuento en euros'}
                    inputMode="decimal" className={cn(inputCls, 'w-24')} value={form.valor}
                    aria-invalid={premioMal} onChange={e => cambiar({ valor: e.target.value })}
                  />
                  <span className="text-sm text-muted-foreground">{form.tipo === 'PORCENTAJE' ? '%' : '€'}</span>
                </div>
              </div>
              <p className="mt-2 text-xs text-muted-foreground text-pretty">
                {form.tipo === 'PORCENTAJE'
                  ? `De ${LIMITES_PREMIO.PORCENTAJE.min} % a ${LIMITES_PREMIO.PORCENTAJE.max} %, sobre lo que compre.`
                  : `De ${LIMITES_PREMIO.IMPORTE_FIJO.min} € a ${LIMITES_PREMIO.IMPORTE_FIJO.max} €. Para regalar una clase, pon lo que cuesta tu clase suelta.`}
              </p>
            </fieldset>
            <Campo label="Cuántos días vale el código" error={premioMal ? errorPremio : null}>
              {id => <input id={id} inputMode="numeric" className={cn(inputCls, 'w-24')} value={form.dias} aria-invalid={premioMal} onChange={e => cambiar({ dias: e.target.value })} />}
            </Campo>
            <p className="rounded-lg bg-muted px-3 py-2.5 text-sm text-pretty text-foreground" data-testid="resenas-aviso-premio" data-consecuencia="">
              El premio es por <strong className="font-semibold">valorar la clase en Tentare</strong> (solo valora quien asistió) y se da con cualquier nota.
              No es por dejar una reseña en Google: no se puede comprobar, Google no permite premiar reseñas y la normativa de consumo exige declararlas.
              Por eso el enlace de arriba se ofrece aparte: sin mencionar el premio y sin mirar la nota.
            </p>
            {premioVista && <p className="text-sm text-muted-foreground">Tus clientes recibirán {premioVista}.</p>}
            {respuesta.regalados > 0 && (
              <p className="text-xs text-muted-foreground" data-testid="resenas-cifras">
                {respuesta.regalados} {respuesta.regalados === 1 ? 'premio regalado' : 'premios regalados'} · {respuesta.canjeados} {respuesta.canjeados === 1 ? 'canjeado' : 'canjeados'}
              </p>
            )}
          </div>
        )}

        {(respuesta.ajustes.enlace || respuesta.embudo.valoraciones > 0) && (
          <section className="rounded-lg bg-muted/50 px-3 py-3" aria-label="Últimos 30 días" data-testid="resenas-embudo">
            <h3 className="text-sm font-medium text-foreground">Últimos 30 días</h3>
            <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
              {([
                ['Valoraciones', respuesta.embudo.valoraciones],
                ['Enlaces mostrados', respuesta.embudo.mostrados],
                ['Toques desde la app', respuesta.embudo.clicsApp],
                ['Toques desde el QR', respuesta.embudo.clicsQr],
              ] as const).map(([nombre, n]) => (
                <div key={nombre}><dt className="text-xs text-muted-foreground">{nombre}</dt><dd className="font-semibold tabular-nums text-foreground">{n}</dd></div>
              ))}
            </dl>
            <p className="mt-2 text-xs text-muted-foreground text-pretty">
              Un toque no es una reseña publicada: Google no dice quién publica. Es lo más cerca que se puede medir.
            </p>
          </section>
        )}
      </div>
      <BarraGuardar
        seccion="comunicacion"
        cambios={hayCambios(form, base) ? [tarjetaPorId('resenas-y-premio').titulo] : []}
        // El detalle ya sale junto al campo: repetirlo aquí lo anunciaría dos veces.
        bloqueo={validacion.ok ? null : 'Corrige lo marcado para poder guardar.'}
        onGuardar={alGuardar}
        onDescartar={() => setForm(base)}
      />
    </>
  );
}
