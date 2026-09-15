'use client';

import { useId, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { useStudio } from '@/lib/studio-context';
import { faltanDatosFiscales } from '@/lib/legal-textos';
import { hayCambios, sincronizarFormulario } from '@/lib/configuracion/formulario-sincronizado';
import { hayPenalizacionConfigurada } from '@/lib/configuracion/penalizacion-activa';
import { hrefDeTarjeta } from '@/lib/configuracion/destino';
import { labelCls } from '@/components/configuracion/estilos';
import { BarraGuardar } from '@/components/configuracion/shell/barra-guardar';
import type { PropsFormularioCajon } from '@/components/configuracion/shell/cajon-ajuste';
import { esClicNormal, useNavegacionConfig } from '@/components/configuracion/shell/contexto';

// «Contrato y privacidad»: el cajón de su fila en Alta de alumnas. Los dos
// documentos se guardan con UN «Guardar», que manda solo el que ha cambiado
// (#2027): antes cada uno llevaba su botón, siempre a la vista y gris en reposo.
//
// Lo que no se puede perder:
//  · si el componente monta antes de que `studioConfig` llegue de la BD, el
//    texto de fábrica no puede machacar el propio del estudio al guardar: lo
//    tocado a mano no lo pisa nada (lib/configuracion/formulario-sincronizado.ts);
//  · el consentimiento de una penalización se compara por TEXTO COMPLETO: tocar
//    una coma deja a todas las alumnas sin consentimiento hasta que vuelvan a
//    aceptar. Solo se avisa —y se pregunta antes de guardar— si hay una
//    penalización configurada; si no, el aviso sería falso.

type Campo = 'politicaPrivacidad' | 'terminosServicio';
type LegalForm = Record<Campo, string>;

const DOCUMENTOS: { campo: Campo; titulo: string; ayuda: string; aviso: string; guardado: string }[] = [
  {
    campo: 'politicaPrivacidad',
    titulo: 'Política de privacidad',
    ayuda: 'La acepta al registrarse, antes de terminar el alta.',
    aviso: 'Al cambiar la política de privacidad, todas tus alumnas tendrán que aceptarla de nuevo; hasta entonces no se les puede cobrar penalización.',
    guardado: 'Política de privacidad guardada',
  },
  {
    // Lo que se guarda al aceptar (`AceptacionContrato`): el texto legal completo
    // tal cual se leyó, la fecha y el nombre con el que firmó.
    campo: 'terminosServicio',
    titulo: 'Términos y condiciones',
    ayuda: 'El contrato que acepta cada alumna al darse de alta.',
    aviso: 'Al cambiar los términos, todas tus alumnas tendrán que aceptarlos de nuevo; hasta entonces no se les puede cobrar penalización.',
    guardado: 'Términos y condiciones guardados',
  },
];

const deConfig = (c: LegalForm): LegalForm => ({ politicaPrivacidad: c.politicaPrivacidad, terminosServicio: c.terminosServicio });

export function FormContratoYPrivacidad({ onGuardado }: PropsFormularioCajon) {
  const { studioConfig, updateStudioConfig, studio, tiposClase, textosLegalesPropios } = useStudio();
  const nav = useNavegacionConfig();
  const uid = useId();
  const [form, setForm] = useState<LegalForm>(() => deConfig(studioConfig));
  const [base, setBase] = useState<LegalForm>(() => deConfig(studioConfig));
  // Se ajusta DURANTE el render, no en un efecto: sin primer pintado viejo.
  const [configVista, setConfigVista] = useState(studioConfig);
  if (configVista !== studioConfig) {
    setConfigVista(studioConfig);
    const servidor = deConfig(studioConfig);
    setForm(sincronizarFormulario(form, base, servidor));
    setBase(servidor);
  }

  const hayPenalizacion = hayPenalizacionConfigurada(studio, tiposClase);
  const cambiados = DOCUMENTOS.filter(d => form[d.campo] !== base[d.campo]);
  // Con unos términos propios no se cobra ninguna penalización
  // (lib/billing/penalizacion-consentimiento.ts, `terminos_propios`).
  const sinPenalizaciones = hayPenalizacion && !!textosLegalesPropios?.terminosServicio;

  async function alGuardar(): Promise<string | null> {
    const cambios: Partial<LegalForm> = Object.fromEntries(cambiados.map(d => [d.campo, form[d.campo]]));
    const r = await updateStudioConfig(cambios);
    if (!r.ok) return r.error;
    setBase(b => ({ ...b, ...cambios }));
    onGuardado(cambiados.length === 1 ? cambiados[0].guardado : 'Contrato y privacidad guardados');
    return null;
  }

  return (
    <>
      <div className="space-y-6 pb-6">
        {sinPenalizaciones && (
          <p className="flex gap-2 rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-foreground text-pretty">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-destructive" aria-hidden />
            <span>Con términos propios no se cobran penalizaciones. Déjalos en blanco para usar los de Tentare.</span>
          </p>
        )}
        {/* Sin razón social ni NIF no se identifica al responsable del
            tratamiento, y lo que firme la alumna no sirve (RGPD art. 13.1.a). */}
        {faltanDatosFiscales(studio ?? {}) && (
          <p className="flex gap-2 rounded-lg bg-warning/10 px-3 py-2.5 text-sm text-foreground text-pretty">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-warning" aria-hidden />
            <span>
              Sin tu razón social y tu NIF, estos textos no dicen quién responde de los datos.{' '}
              {/* Dentro de Configuración va por el shell, no por el router (#2030). */}
              <Link
                href={hrefDeTarjeta('datos-fiscales')}
                onClick={e => {
                  if (!nav || !esClicNormal(e)) return;
                  e.preventDefault();
                  nav.irA('cobros', { ancla: 'datos-fiscales', modo: 'push' });
                }}
                className="font-semibold underline underline-offset-2"
              >
                Poner mis datos fiscales
              </Link>
            </span>
          </p>
        )}

        {DOCUMENTOS.map(d => (
          <div key={d.campo}>
            <label htmlFor={`${uid}-${d.campo}`} className={labelCls}>{d.titulo}</label>
            <p className="mb-2 text-xs text-muted-foreground">{d.ayuda}</p>
            <textarea
              id={`${uid}-${d.campo}`}
              rows={8}
              className="w-full resize-y rounded-lg border border-input bg-card px-3 py-2 font-mono text-base text-foreground transition-colors [@media(pointer:fine)]:text-[12px] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              value={form[d.campo]}
              onChange={e => { const v = e.target.value; setForm(f => ({ ...f, [d.campo]: v })); }}
            />
            {hayPenalizacion && form[d.campo] !== base[d.campo] && (
              <p className="mt-2 flex gap-2 rounded-lg bg-warning/10 p-2.5 text-xs text-foreground text-pretty">
                <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warning" aria-hidden />
                <span>{d.aviso}</span>
              </p>
            )}
          </div>
        ))}
      </div>
      <BarraGuardar
        seccion="altas"
        cambios={hayCambios(form, base) ? ['Contrato y privacidad'] : []}
        confirmar={hayPenalizacion ? {
          titulo: '¿Cambiar los textos que aceptan tus alumnas?',
          descripcion: 'Tendrán que volver a aceptarlos, y hasta entonces no se les cobra ninguna penalización.',
          textoConfirmar: 'Sí, cambiarlos',
        } : null}
        onGuardar={alGuardar}
        onDescartar={() => setForm(base)}
      />
    </>
  );
}
