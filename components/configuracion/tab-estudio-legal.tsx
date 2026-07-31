'use client';

import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useStudio } from '@/lib/studio-context';
import { faltanDatosFiscales } from '@/lib/legal-textos';
import { cardCls } from '@/app/(dashboard)/configuracion/page';

export function TabEstudioLegal({ showToast }: { showToast: (m: string) => void }) {
  const { studioConfig, updateStudioConfig, studio } = useStudio();
  const [politica, setPolitica] = useState(studioConfig.politicaPrivacidad);
  const [terminos, setTerminos] = useState(studioConfig.terminosServicio);
  // Estos textos se inicializaban UNA vez al montar. Si el componente montaba
  // antes de que `studioConfig` llegara de la BD, el textarea enseñaba el texto
  // por defecto y "Guardar" machacaba con él el texto propio del estudio.
  // Mientras no se toque a mano, seguimos al contexto. Se ajusta DURANTE el
  // render (el patrón de React para estado derivado), no en un efecto: así no
  // hay un primer pintado con el valor viejo.
  const [tocadoPolitica, setTocadoPolitica] = useState(false);
  const [tocadoTerminos, setTocadoTerminos] = useState(false);
  const [configVista, setConfigVista] = useState(studioConfig);
  if (configVista !== studioConfig) {
    setConfigVista(studioConfig);
    if (!tocadoPolitica) setPolitica(studioConfig.politicaPrivacidad);
    if (!tocadoTerminos) setTerminos(studioConfig.terminosServicio);
  }

  return (
    <div className="space-y-5 max-w-2xl">
      <div className={cn(cardCls, 'p-6')}>
        <h3 className="text-[14px] font-semibold text-foreground mb-1">Política de privacidad</h3>
        <p className="text-[12px] text-muted-foreground mb-3">
          Este texto se muestra a las clientas al registrarse y deben aceptarlo antes de completar la inscripción.
        </p>
        {/* Sin razón social / nombre no se puede identificar al responsable del
            tratamiento, y lo que firme la clienta no sirve (RGPD art. 13.1.a).
            Se avisa aquí, que es donde se arregla. */}
        {faltanDatosFiscales(studio ?? {}) && (
          <p className="flex items-start gap-2 mb-3 p-2.5 rounded-lg bg-warning/10 text-[12px] text-warning">
            <AlertTriangle size={14} className="shrink-0 mt-0.5" />
            <span>
              Rellena en Estudio → General la razón social y el NIF: sin ellos este documento no dice quién
              es el responsable de los datos y no cumple el RGPD.
            </span>
          </p>
        )}
        <textarea
          rows={8}
          className="w-full rounded-lg border border-border bg-card px-3 py-2 text-[12px] font-mono text-foreground focus:outline-none focus:border-muted-foreground transition-colors resize-y"
          value={politica}
          onChange={(e) => { setTocadoPolitica(true); setPolitica(e.target.value); }}
        />
        <button
          onClick={async () => { const r = await updateStudioConfig({ politicaPrivacidad: politica }); showToast(r.ok ? 'Política de privacidad guardada' : r.error); }}
          className="mt-3 px-4 py-2 rounded-lg bg-brand text-brand-foreground text-[12px] font-medium hover:brightness-95 transition-colors"
        >
          Guardar política
        </button>
      </div>

      <div className={cn(cardCls, 'p-6')}>
        <h3 className="text-[14px] font-semibold text-foreground mb-1">Términos y condiciones</h3>
        <p className="text-[12px] text-muted-foreground mb-3">
          Contrato que acepta cada clienta al inscribirse. Queda registrado con su firma digital.
        </p>
        <textarea
          rows={8}
          className="w-full rounded-lg border border-border bg-card px-3 py-2 text-[12px] font-mono text-foreground focus:outline-none focus:border-muted-foreground transition-colors resize-y"
          value={terminos}
          onChange={(e) => { setTocadoTerminos(true); setTerminos(e.target.value); }}
        />
        <button
          onClick={async () => { const r = await updateStudioConfig({ terminosServicio: terminos }); showToast(r.ok ? 'Términos y condiciones guardados' : r.error); }}
          className="mt-3 px-4 py-2 rounded-lg bg-brand text-brand-foreground text-[12px] font-medium hover:brightness-95 transition-colors"
        >
          Guardar términos
        </button>
      </div>
    </div>
  );
}
