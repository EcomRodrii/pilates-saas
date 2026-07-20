'use client';

import * as React from 'react';
import { useState, useEffect, useId } from 'react';
import { useCampoAsociado } from '@/components/ui/use-campo-asociado';
import { useSearchParams } from 'next/navigation';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Toast, useToast } from '@/components/ui/toast';
import { TabCamposPersonalizados } from '@/components/configuracion/tab-campos-personalizados';
import { TabPlantillasEmail } from '@/components/configuracion/tab-plantillas-email';
import { TabClases } from '@/components/configuracion/tab-clases';
import { TabSalas } from '@/components/configuracion/tab-salas';
import { TabPlanes } from '@/components/configuracion/tab-planes';
import { TabIntegraciones } from '@/components/configuracion/tab-integraciones';
import { TabEstudio } from '@/components/configuracion/tab-estudio';
import { TabPerfil } from '@/components/configuracion/tab-perfil';
import type { PlanTarifa, TipoClase } from '@/lib/types';
import { TabRecompensas } from '@/components/configuracion/tab-recompensas';
import { TabLogros } from '@/components/configuracion/tab-logros';
import { TabNiveles } from '@/components/configuracion/tab-niveles';
import { TabRetos } from '@/components/configuracion/tab-retos';
import { TabBackups } from '@/components/configuracion/tab-backups';
import { TabServiciosCita } from '@/components/configuracion/tab-servicios-cita';
import { TabHorarioCitas } from '@/components/configuracion/tab-horario-citas';
import { PageHeader } from '@/components/ui/page-header';

// ─── Design tokens ────────────────────────────────────────────────────────────
export const inputCls =
  'rounded-lg border border-border px-3 py-2 text-[13px] w-full focus:outline-none focus:ring-2 focus:ring-black/10';
export const labelCls = 'text-[12px] font-medium text-foreground block mb-1';
export const btnPrimary =
  'bg-brand text-brand-foreground rounded-lg px-4 py-2 text-[13px] font-medium flex items-center gap-1.5 hover:brightness-95 transition-colors disabled:opacity-40 disabled:cursor-not-allowed';
export const btnSecondary =
  'bg-card border border-border rounded-lg px-4 py-2 text-[13px] text-foreground hover:bg-muted transition-colors';
export const cardCls = 'bg-card border border-border rounded-xl';

// ─── Shared micro-components ──────────────────────────────────────────────────

export function Field({
  label,
  description,
  hint,
  children,
}: {
  label: string;
  /**
   * Qué es esto y cómo decidir. Va debajo de la etiqueta y encima del control:
   * se lee ANTES de elegir, no después de haberse equivocado.
   *
   * Existe porque antes este helper solo aceptaba { label, children }, así que
   * no había ni dónde escribir la explicación — y por eso las pestañas de
   * conceptos propios del producto (planes, logros, niveles, retos) acababan
   * pidiendo decisiones sin contar en ningún sitio qué significaban.
   */
  description?: React.ReactNode;
  /** <InfoTip> junto a la etiqueta, para el detalle largo que no cabe aquí. */
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  // La asociación label↔control (htmlFor/id) la resuelve useCampoAsociado
  // (WCAG 1.3.1/4.1.2, aplicado con el mismo barrido en toda la app). Aquí
  // solo se añade encima el hueco de descripción que useCampoAsociado no trae.
  const { htmlFor, control } = useCampoAsociado(children);
  const descAutoId = React.useId();
  const idDesc = description ? `${descAutoId}-desc` : undefined;
  const controlDescrito = idDesc && React.isValidElement(control)
    ? React.cloneElement(control as React.ReactElement<{ 'aria-describedby'?: string }>, { 'aria-describedby': idDesc })
    : control;

  return (
    <div>
      <label htmlFor={htmlFor} className={cn(labelCls, 'flex items-center gap-1.5')}>
        {label}
        {hint}
      </label>
      {description && (
        <p id={idDesc} className="text-xs leading-relaxed text-muted-foreground mb-1.5 text-balance">
          {description}
        </p>
      )}
      {controlDescrito}
    </div>
  );
      {control}
    </div>
  );
}

export function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      aria-pressed={on}
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200',
        on ? 'bg-primary' : 'bg-muted-foreground/40'
      )}
    >
      <span
        className={cn(
          'pointer-events-none inline-block h-4 w-4 rounded-full bg-card shadow ring-0 transition-transform duration-200',
          on ? 'translate-x-4' : 'translate-x-0'
        )}
      />
    </button>
  );
}

export function ColorInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-9 h-9 rounded-lg border border-border cursor-pointer p-0.5 shrink-0"
      />
      <input
        className={cn(inputCls, 'flex-1')}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="#1A1A1A"
        maxLength={7}
      />
    </div>
  );
}

export function ColorSwatch({ color, size = 'md' }: { color: string; size?: 'sm' | 'md' }) {
  const cls = size === 'sm' ? 'w-4 h-4 rounded-full' : 'w-6 h-6 rounded-lg';
  return (
    <span
      className={cn(cls, 'inline-block border border-black/10 shrink-0')}
      style={{ backgroundColor: color }}
    />
  );
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description: string;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <div className="flex flex-col items-center text-center gap-4 py-2">
          <div className="w-12 h-12 rounded-xl bg-destructive/10 flex items-center justify-center">
            <AlertTriangle size={20} className="text-destructive" />
          </div>
          <div>
            <h3 className="text-[14px] font-semibold text-foreground mb-1">{title}</h3>
            <p className="text-[13px] text-muted-foreground">{description}</p>
          </div>
          <div className="flex gap-2 w-full">
            <button
              className={cn(btnSecondary, 'flex-1 justify-center')}
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </button>
            <button
              className="flex-1 bg-destructive text-white rounded-lg px-4 py-2 text-[13px] font-medium hover:bg-red-700 transition-colors"
              onClick={() => { onConfirm(); onOpenChange(false); }}
            >
              Eliminar
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Badge helpers ────────────────────────────────────────────────────────────

export function TipoPlanBadge({ tipo }: { tipo: PlanTarifa['tipo'] }) {
  const map: Record<string, string> = {
    MENSUAL: 'bg-purple-50 text-purple-700',
    BONO: 'bg-blue-50 text-blue-700',
    PUNTUAL: 'bg-background text-muted-foreground',
  };
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium', map[tipo])}>
      {tipo}
    </span>
  );
}

export function NivelBadge({ nivel }: { nivel: TipoClase['nivel'] }) {
  const map: Record<string, string> = {
    TODOS: 'bg-background text-muted-foreground',
    PRINCIPIANTE: 'bg-green-50 text-green-700',
    MEDIO: 'bg-amber-50 text-amber-700',
    AVANZADO: 'bg-red-50 text-red-600',
  };
  const labels: Record<string, string> = {
    TODOS: 'Todos',
    PRINCIPIANTE: 'Principiante',
    MEDIO: 'Medio',
    AVANZADO: 'Avanzado',
  };
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium', map[nivel])}>
      {labels[nivel]}
    </span>
  );
}

// ─── Tab definition ───────────────────────────────────────────────────────────

type TabId = 'planes' | 'clases' | 'salas' | 'servicios-cita' | 'horario-citas' | 'recompensas' | 'logros' | 'niveles' | 'retos' | 'integraciones' | 'estudio' | 'campos' | 'plantillas' | 'backups' | 'perfil';

const TABS: { id: TabId; label: string }[] = [
  { id: 'planes',      label: 'Planes y tarifas' },
  { id: 'clases',      label: 'Clases' },
  { id: 'salas',       label: 'Salas' },
  { id: 'servicios-cita', label: 'Servicios de cita' },
  { id: 'horario-citas',  label: 'Horario de citas' },
  { id: 'recompensas', label: 'Recompensas' },
  { id: 'logros',      label: 'Logros' },
  { id: 'niveles',     label: 'Niveles' },
  { id: 'retos',       label: 'Retos' },
  { id: 'integraciones', label: 'Integraciones' },
  { id: 'estudio',     label: 'Estudio' },
  { id: 'campos',      label: 'Campos de clienta' },
  { id: 'plantillas',  label: 'Emails' },
  { id: 'backups',     label: 'Copias de seguridad' },
  { id: 'perfil',      label: 'Mi perfil' },
];

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ConfiguracionPage() {
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>('planes');
  const { message: toastMsg, show: showToast, dismiss: dismissToast } = useToast();
  const searchParams = useSearchParams();

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab && TABS.some(t => t.id === tab)) setActiveTab(tab as TabId);
  }, [searchParams]);

  if (!mounted) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Configuración"
        description="Gestiona los planes, clases, salas, instructores e integraciones de tu estudio"
      />

      {/* Tab nav */}
      <div className="flex gap-1 p-1 bg-card border border-border rounded-xl overflow-x-auto">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all whitespace-nowrap',
              activeTab === tab.id
                ? 'bg-brand text-brand-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-background'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'planes'      && <TabPlanes      showToast={showToast} />}
      {activeTab === 'clases'      && <TabClases       showToast={showToast} />}
      {activeTab === 'salas'       && <TabSalas        showToast={showToast} />}
      {activeTab === 'servicios-cita' && <TabServiciosCita showToast={showToast} />}
      {activeTab === 'horario-citas'  && <TabHorarioCitas  showToast={showToast} />}
      {activeTab === 'recompensas' && <TabRecompensas  showToast={showToast} />}
      {activeTab === 'logros'      && <TabLogros       showToast={showToast} />}
      {activeTab === 'niveles'     && <TabNiveles      showToast={showToast} />}
      {activeTab === 'retos'       && <TabRetos        showToast={showToast} />}
      {activeTab === 'backups'     && <TabBackups      showToast={showToast} />}
      {activeTab === 'integraciones' && <TabIntegraciones showToast={showToast} />}
      {activeTab === 'estudio'     && <TabEstudio      showToast={showToast} />}
      {activeTab === 'campos'      && <TabCamposPersonalizados showToast={showToast} />}
      {activeTab === 'plantillas'  && <TabPlantillasEmail showToast={showToast} />}
      {activeTab === 'perfil'      && <TabPerfil       showToast={showToast} />}

      {toastMsg && <Toast message={toastMsg} onDismiss={dismissToast} />}
    </div>
  );
}

