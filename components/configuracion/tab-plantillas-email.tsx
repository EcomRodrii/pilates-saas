'use client';

import { useState, useEffect, useId } from 'react';
import { Check, Eye, Send, Loader2, X } from 'lucide-react';
import { useStudio } from '@/lib/studio-context';
import { cn } from '@/lib/utils';
import type { PlantillaEmail, TipoPlantillaEmail } from '@/lib/types';
import { inputCls, btnPrimary, btnSecondary, cardCls, Field, Toggle } from '@/app/(dashboard)/configuracion/page';
import { previsualizarPlantilla, enviarPruebaPlantilla } from '@/lib/api-client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

// ─── Plantillas de email transaccional ───────────────────────────────────────

const PLANTILLAS_META: {
  tipo: TipoPlantillaEmail; label: string; descripcion: string;
  asuntoDefault: string; introDefault: string; variables: string[];
}[] = [
  {
    tipo: 'bienvenida', label: 'Bienvenida', descripcion: 'Al dar de alta a una clienta.',
    asuntoDefault: '¡Bienvenida a {estudio}!',
    introDefault: 'Hola {nombre}, estamos encantadas de tenerte en {estudio}.',
    variables: ['{nombre}', '{estudio}'],
  },
  {
    tipo: 'reserva', label: 'Reserva confirmada', descripcion: 'Cuando una clienta reserva una clase.',
    asuntoDefault: 'Reserva confirmada — {clase}',
    introDefault: 'Hola {nombre}, tu plaza está reservada.',
    variables: ['{nombre}', '{clase}'],
  },
  {
    tipo: 'recordatorio', label: 'Recordatorio de clase', descripcion: 'Aviso antes de la clase.',
    asuntoDefault: 'Recordatorio — {clase}',
    introDefault: 'Hola {nombre}, te esperamos en tu próxima clase. Aquí tienes los detalles.',
    variables: ['{nombre}', '{clase}'],
  },
  {
    tipo: 'cancelacion', label: 'Clase cancelada', descripcion: 'Cuando el estudio cancela una clase.',
    asuntoDefault: 'Clase cancelada — {clase}',
    introDefault: 'Hola {nombre}, lamentamos avisarte de que esta clase ha sido cancelada. No hace falta que te presentes.',
    variables: ['{nombre}', '{clase}'],
  },
  {
    tipo: 'promocion', label: 'Plaza liberada (lista de espera)', descripcion: 'Al ascender a una clienta de la lista de espera.',
    asuntoDefault: 'Se ha liberado tu plaza — {clase}',
    introDefault: 'Hola {nombre}, estabas en lista de espera y ha quedado una plaza libre.',
    variables: ['{nombre}', '{clase}'],
  },
  {
    tipo: 'impago', label: 'Pago fallido', descripcion: 'Cuando un cobro automático no se completa. De las que más importan: la lee alguien a quien le acaban de fallar un cobro.',
    asuntoDefault: 'Problema con tu pago — {estudio}',
    introDefault: 'Hola {nombre}, hemos intentado cobrar tu cuota y el pago no se ha completado.',
    variables: ['{nombre}', '{estudio}'],
  },
];

function PlantillaCard({
  meta, plantilla, onSave, showToast,
}: {
  meta: (typeof PLANTILLAS_META)[number];
  plantilla: PlantillaEmail | undefined;
  onSave: (changes: { asunto?: string | null; intro?: string | null; activa?: boolean }) => void;
  showToast: (m: string) => void;
}) {
  const [asunto, setAsunto] = useState(plantilla?.asunto ?? '');
  const [intro, setIntro] = useState(plantilla?.intro ?? '');
  const activa = plantilla?.activa ?? true;

  // Re-sincroniza si cambian los datos cargados (p. ej. tras la carga diferida).
  useEffect(() => { setAsunto(plantilla?.asunto ?? ''); setIntro(plantilla?.intro ?? ''); }, [plantilla?.asunto, plantilla?.intro]);

  // Vista previa y envío de prueba (P2-11): renderizan el BORRADOR tal cual
  // está en el formulario, sin necesidad de guardarlo antes.
  const [preview, setPreview] = useState<{ html: string; subject: string } | null>(null);
  const [cargandoPreview, setCargandoPreview] = useState(false);
  const [enviandoPrueba, setEnviandoPrueba] = useState(false);

  async function abrirPreview() {
    setCargandoPreview(true);
    const r = await previsualizarPlantilla({ tipo: meta.tipo, asunto: asunto || null, intro: intro || null });
    setCargandoPreview(false);
    if ('error' in r) { showToast(r.error); return; }
    setPreview(r);
  }

  async function enviarPrueba() {
    setEnviandoPrueba(true);
    const r = await enviarPruebaPlantilla({ tipo: meta.tipo, asunto: asunto || null, intro: intro || null });
    setEnviandoPrueba(false);
    showToast('error' in r ? r.error : `Prueba enviada a ${r.enviadoA}`);
  }

  return (
    <div className={cn(cardCls, 'p-6')}>
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h3 className="text-[14px] font-semibold text-foreground">{meta.label}</h3>
          <p className="text-[12px] text-muted-foreground">{meta.descripcion}</p>
        </div>
        <label className="flex items-center gap-2 cursor-pointer shrink-0" title="Personalización activa">
          <span className="text-[11px] text-muted-foreground">{activa ? 'Personalizado' : 'Por defecto'}</span>
          <Toggle on={activa} onChange={v => onSave({ activa: v })} />
        </label>
      </div>
      <div className="space-y-4">
        <Field
          label="Asunto"
          description="Lo primero que ve la clienta en su bandeja. Directo y sin mayúsculas sostenidas."
        >
          <input className={inputCls} placeholder={meta.asuntoDefault}
            value={asunto} onChange={e => setAsunto(e.target.value)} />
        </Field>
        <Field
          label="Texto de introducción"
          description="Abre el email, antes de los datos concretos. Los detalles se añaden solos debajo."
        >
          <textarea className={cn(inputCls, 'resize-none')} rows={3} placeholder={meta.introDefault}
            value={intro} onChange={e => setIntro(e.target.value)} />
        </Field>
        <p className="text-[11px] text-muted-foreground">
          Variables: {meta.variables.map(v => <code key={v} className="bg-muted rounded px-1 py-0.5 mx-0.5">{v}</code>)}
          . Deja un campo vacío para usar el texto por defecto.
        </p>
        <div className="flex items-center justify-end gap-2">
          <button onClick={abrirPreview} disabled={cargandoPreview} className={cn(btnSecondary, 'disabled:opacity-50')}>
            {cargandoPreview ? <Loader2 size={14} className="animate-spin" /> : <Eye size={14} />} Vista previa
          </button>
          <button onClick={enviarPrueba} disabled={enviandoPrueba} className={cn(btnSecondary, 'disabled:opacity-50')}>
            {enviandoPrueba ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Enviarme una prueba
          </button>
          <button onClick={() => onSave({ asunto: asunto.trim() || null, intro: intro.trim() || null })} className={btnPrimary}>
            <Check size={14} /> Guardar
          </button>
        </div>
      </div>

      <Dialog open={!!preview} onOpenChange={open => { if (!open) setPreview(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Vista previa — {meta.label}</DialogTitle>
          </DialogHeader>
          {preview && (
            <div className="space-y-3">
              <p className="text-[12px] text-muted-foreground">
                Asunto: <span className="font-medium text-foreground">{preview.subject}</span>
              </p>
              <div className="rounded-xl border border-border overflow-hidden bg-white">
                <iframe
                  title={`Vista previa de ${meta.label}`}
                  srcDoc={preview.html}
                  sandbox=""
                  className="w-full h-[420px]"
                />
              </div>
              <p className="text-[11px] text-muted-foreground">
                Con datos de muestra (Ana García, Reformer Iniciación) — así se ve sin esperar a una clienta real.
              </p>
              <button onClick={() => setPreview(null)} className={cn(btnSecondary, 'w-full justify-center')}>
                <X size={14} /> Cerrar
              </button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function TabPlantillasEmail({ showToast }: { showToast: (m: string) => void }) {
  const { plantillasEmail, upsertPlantillaEmail } = useStudio();
  return (
    <div className="space-y-5 max-w-2xl">
      <p className="text-[12px] text-muted-foreground">
        Personaliza el asunto y el texto de introducción de los emails automáticos a tus clientas.
        El diseño (logo, cabecera y datos) se mantiene. Los emails de recibo/factura no se editan por su contenido fiscal.
      </p>
      {PLANTILLAS_META.map(meta => (
        <PlantillaCard
          key={meta.tipo}
          meta={meta}
          plantilla={plantillasEmail.find(p => p.tipo === meta.tipo)}
          onSave={async changes => {
            const res = await upsertPlantillaEmail(meta.tipo, changes);
            showToast(res.ok ? 'Plantilla guardada' : res.error);
          }}
          showToast={showToast}
        />
      ))}
    </div>
  );
}
