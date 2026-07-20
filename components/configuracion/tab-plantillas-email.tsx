'use client';

import { useState, useEffect, useId } from 'react';
import { Check } from 'lucide-react';
import { useStudio } from '@/lib/studio-context';
import { cn } from '@/lib/utils';
import type { PlantillaEmail, TipoPlantillaEmail } from '@/lib/types';
import { inputCls, btnPrimary, cardCls, Field, Toggle } from '@/app/(dashboard)/configuracion/page';

// ─── Plantillas de email transaccional ───────────────────────────────────────

const PLANTILLAS_META: {
  tipo: TipoPlantillaEmail; label: string; descripcion: string;
  asuntoDefault: string; introDefault: string; variables: string[];
}[] = [
  {
    tipo: 'bienvenida', label: 'Bienvenida', descripcion: 'Al dar de alta a una socia.',
    asuntoDefault: '¡Bienvenida a {estudio}!',
    introDefault: 'Hola {nombre}, estamos encantadas de tenerte en {estudio}.',
    variables: ['{nombre}', '{estudio}'],
  },
  {
    tipo: 'reserva', label: 'Reserva confirmada', descripcion: 'Cuando una socia reserva una clase.',
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
    tipo: 'promocion', label: 'Plaza liberada (lista de espera)', descripcion: 'Al ascender a una socia de la lista de espera.',
    asuntoDefault: 'Se ha liberado tu plaza — {clase}',
    introDefault: 'Hola {nombre}, estabas en lista de espera y ha quedado una plaza libre.',
    variables: ['{nombre}', '{clase}'],
  },
];

function PlantillaCard({
  meta, plantilla, onSave,
}: {
  meta: (typeof PLANTILLAS_META)[number];
  plantilla: PlantillaEmail | undefined;
  onSave: (changes: { asunto?: string | null; intro?: string | null; activa?: boolean }) => void;
}) {
  const [asunto, setAsunto] = useState(plantilla?.asunto ?? '');
  const [intro, setIntro] = useState(plantilla?.intro ?? '');
  const activa = plantilla?.activa ?? true;

  // Re-sincroniza si cambian los datos cargados (p. ej. tras la carga diferida).
  useEffect(() => { setAsunto(plantilla?.asunto ?? ''); setIntro(plantilla?.intro ?? ''); }, [plantilla?.asunto, plantilla?.intro]);

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
        <Field label="Asunto">
          <input className={inputCls} placeholder={meta.asuntoDefault}
            value={asunto} onChange={e => setAsunto(e.target.value)} />
        </Field>
        <Field label="Texto de introducción">
          <textarea className={cn(inputCls, 'resize-none')} rows={3} placeholder={meta.introDefault}
            value={intro} onChange={e => setIntro(e.target.value)} />
        </Field>
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] text-muted-foreground">
            Variables: {meta.variables.map(v => <code key={v} className="bg-muted rounded px-1 py-0.5 mx-0.5">{v}</code>)}
            . Deja un campo vacío para usar el texto por defecto.
          </p>
          <button onClick={() => onSave({ asunto: asunto.trim() || null, intro: intro.trim() || null })} className={btnPrimary}>
            <Check size={14} /> Guardar
          </button>
        </div>
      </div>
    </div>
  );
}

export function TabPlantillasEmail({ showToast }: { showToast: (m: string) => void }) {
  const { plantillasEmail, upsertPlantillaEmail } = useStudio();
  return (
    <div className="space-y-5 max-w-2xl">
      <p className="text-[12px] text-muted-foreground">
        Personaliza el asunto y el texto de introducción de los emails automáticos a tus socias.
        El diseño (logo, cabecera y datos) se mantiene. Los emails de recibo/factura no se editan por su contenido fiscal.
      </p>
      {PLANTILLAS_META.map(meta => (
        <PlantillaCard
          key={meta.tipo}
          meta={meta}
          plantilla={plantillasEmail.find(p => p.tipo === meta.tipo)}
          onSave={changes => { upsertPlantillaEmail(meta.tipo, changes); showToast('Plantilla guardada'); }}
        />
      ))}
    </div>
  );
}
