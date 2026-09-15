'use client';

import { useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useStudio } from '@/lib/studio-context';
import { faltanDatosFiscales } from '@/lib/legal-textos';
import { sincronizarFormulario } from '@/lib/configuracion/formulario-sincronizado';
import { hayPenalizacionConfigurada } from '@/lib/configuracion/penalizacion-activa';
import { cardCls } from '@/components/configuracion/estilos';

type Campo = 'politicaPrivacidad' | 'terminosServicio';
type LegalForm = Record<Campo, string>;

const TEXTOS: Record<Campo, { titulo: string; boton: string; guardado: string; aviso: string }> = {
  politicaPrivacidad: {
    titulo: 'Política de privacidad',
    boton: 'Guardar política',
    guardado: 'Política de privacidad guardada',
    aviso: 'Al cambiar la política de privacidad, todas tus alumnas tendrán que aceptarla de nuevo; hasta entonces no se les puede cobrar penalización.',
  },
  terminosServicio: {
    titulo: 'Términos y condiciones',
    boton: 'Guardar términos',
    guardado: 'Términos y condiciones guardados',
    aviso: 'Al cambiar los términos, todas tus alumnas tendrán que aceptarlos de nuevo; hasta entonces no se les puede cobrar penalización.',
  },
};

export function TabEstudioLegal({ showToast }: { showToast: (m: string) => void }) {
  const { studioConfig, updateStudioConfig, studio, tiposClase } = useStudio();
  const deConfig = (c: typeof studioConfig): LegalForm => ({
    politicaPrivacidad: c.politicaPrivacidad,
    terminosServicio: c.terminosServicio,
  });
  const [form, setForm] = useState<LegalForm>(() => deConfig(studioConfig));
  const [base, setBase] = useState<LegalForm>(() => deConfig(studioConfig));
  // Si el componente monta antes de que `studioConfig` llegue de la BD, el
  // textarea enseñaba el texto por defecto y «Guardar» machacaba con él el
  // texto propio del estudio. Mientras no se toque a mano, se sigue al contexto;
  // lo tocado no lo pisa nada — ni la carga, ni guardar el OTRO documento.
  // Se ajusta DURANTE el render, no en un efecto: sin primer pintado viejo.
  const [configVista, setConfigVista] = useState(studioConfig);
  if (configVista !== studioConfig) {
    setConfigVista(studioConfig);
    const servidor = deConfig(studioConfig);
    setForm(sincronizarFormulario(form, base, servidor));
    setBase(servidor);
  }

  const guardandoRef = useRef<Partial<Record<Campo, boolean>>>({});
  const [guardando, setGuardando] = useState<Partial<Record<Campo, boolean>>>({});
  const [errores, setErrores] = useState<Partial<Record<Campo, string>>>({});

  // El consentimiento se compara por TEXTO COMPLETO (lib/inngest/penalizaciones.ts):
  // cualquier cambio en cualquiera de los dos documentos deja a todas las
  // alumnas sin consentimiento vigente para cobrarles una penalización. Solo se
  // avisa si de verdad hay una configurada — si no, el aviso sería falso.
  const hayPenalizacion = hayPenalizacionConfigurada(studio, tiposClase);

  function escribir(campo: Campo, valor: string) {
    setForm(f => ({ ...f, [campo]: valor }));
    setErrores(e => ({ ...e, [campo]: undefined }));
  }

  async function guardar(campo: Campo) {
    // Un ref y no solo el `disabled`: dos toques seguidos llegan antes de que
    // el botón se repinte deshabilitado.
    if (guardandoRef.current[campo]) return;
    guardandoRef.current = { ...guardandoRef.current, [campo]: true };
    setGuardando(g => ({ ...g, [campo]: true }));
    setErrores(e => ({ ...e, [campo]: undefined }));
    const valor = form[campo];
    try {
      const r = await updateStudioConfig(
        campo === 'politicaPrivacidad' ? { politicaPrivacidad: valor } : { terminosServicio: valor },
      );
      if (!r.ok) {
        setErrores(e => ({ ...e, [campo]: r.error }));
        showToast(r.error);
        return;
      }
      setBase(b => ({ ...b, [campo]: valor }));
      showToast(TEXTOS[campo].guardado);
    } catch {
      const mensaje = 'No se ha podido guardar. Revisa tu conexión.';
      setErrores(e => ({ ...e, [campo]: mensaje }));
      showToast(mensaje);
    } finally {
      guardandoRef.current = { ...guardandoRef.current, [campo]: false };
      setGuardando(g => ({ ...g, [campo]: false }));
    }
  }

  function pintarDocumento(campo: Campo, descripcion: React.ReactNode, antes?: React.ReactNode) {
    const pendiente = form[campo] !== base[campo];
    const ocupado = !!guardando[campo];
    const error = errores[campo];
    return (
      <div className={cn(cardCls, 'p-6')}>
        <h3 className="text-[14px] font-semibold text-foreground mb-1">{TEXTOS[campo].titulo}</h3>
        <p className="text-[12px] text-muted-foreground mb-3">{descripcion}</p>
        {antes}
        <textarea
          rows={8}
          aria-label={TEXTOS[campo].titulo}
          className="w-full rounded-lg border border-border bg-card px-3 py-2 text-[12px] font-mono text-foreground focus:outline-none focus:border-muted-foreground transition-colors resize-y"
          value={form[campo]}
          onChange={(e) => escribir(campo, e.target.value)}
        />
        {hayPenalizacion && pendiente && (
          <p className="flex items-start gap-2 mt-3 p-2.5 rounded-lg bg-warning/10 text-[12px] text-warning">
            <AlertTriangle size={14} className="shrink-0 mt-0.5" />
            <span>{TEXTOS[campo].aviso}</span>
          </p>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            onClick={() => guardar(campo)}
            disabled={ocupado || !pendiente}
            className="px-4 py-2 rounded-lg bg-brand text-brand-foreground text-[12px] font-medium hover:brightness-95 transition-colors disabled:opacity-40"
          >
            {ocupado ? 'Guardando…' : TEXTOS[campo].boton}
          </button>
          {pendiente && !ocupado && <span className="text-[12px] text-muted-foreground">Cambios sin guardar.</span>}
        </div>
        {error && <p role="alert" className="mt-2 text-[12px] font-medium text-destructive">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-2xl">
      {pintarDocumento(
        'politicaPrivacidad',
        'Este texto se muestra a las clientas al registrarse y deben aceptarlo antes de completar la inscripción.',
        /* Sin razón social / nombre no se puede identificar al responsable del
           tratamiento, y lo que firme la clienta no sirve (RGPD art. 13.1.a).
           Se avisa aquí, que es donde se arregla. */
        faltanDatosFiscales(studio ?? {}) && (
          <p className="flex items-start gap-2 mb-3 p-2.5 rounded-lg bg-warning/10 text-[12px] text-warning">
            <AlertTriangle size={14} className="shrink-0 mt-0.5" />
            <span>
              Rellena en Estudio → General la razón social y el NIF: sin ellos este documento no dice quién
              es el responsable de los datos y no cumple el RGPD.
            </span>
          </p>
        ),
      )}
      {pintarDocumento(
        'terminosServicio',
        'Contrato que acepta cada clienta al inscribirse. Queda registrado con su firma digital.',
      )}
    </div>
  );
}
