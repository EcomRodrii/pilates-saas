'use client';

import { useState, useEffect, useCallback, useRef, useId } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { RotateCcw, AlertTriangle, Monitor, ExternalLink, Calendar as CalendarLinkIcon, Building2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useStudio } from '@/lib/studio-context';
import { subirLogoEstudio, eliminarLogoEstudio } from '@/lib/portal-storage';
import { authHeader } from '@/lib/api-client';
import { tieneFeature } from '@/lib/billing/entitlements';
import type { Studio } from '@/lib/types';
import { Toggle, inputCls, labelCls, btnPrimary, btnSecondary, cardCls } from '@/app/(dashboard)/configuracion/page';

type StudioForm = {
  nombre: string; razonSocial: string; nif: string;
  direccion: string; ciudad: string; codigoPostal: string;
  telefono: string; email: string;
};

function studioToForm(s: Studio | null): StudioForm {
  return {
    nombre: s?.nombre ?? '',
    razonSocial: s?.razonSocial ?? '',
    nif: s?.nif ?? '',
    direccion: s?.direccion ?? '',
    ciudad: s?.ciudad ?? '',
    codigoPostal: s?.codigoPostal ?? '',
    telefono: s?.telefono ?? '',
    email: s?.email ?? '',
  };
}

type PoliticaForm = {
  cancelacionVentanaHoras: number;
  cancelacionDevolverBonoTardia: boolean;
  reservaExigirPlan: boolean;
  reservaMaxSimultaneas: number | null;
};

function studioToPolitica(s: Studio | null): PoliticaForm {
  return {
    cancelacionVentanaHoras: s?.cancelacionVentanaHoras ?? 12,
    cancelacionDevolverBonoTardia: s?.cancelacionDevolverBonoTardia ?? false,
    reservaExigirPlan: s?.reservaExigirPlan ?? false,
    reservaMaxSimultaneas: s?.reservaMaxSimultaneas ?? null,
  };
}

export function TabEstudio({ showToast }: { showToast: (m: string) => void }) {
  const { resetDatosPilates, studioConfig, updateStudioConfig, studio, updateStudio } = useStudio();
  const [confirmReset, setConfirmReset] = useState(false);
  const [politica, setPolitica] = useState(studioConfig.politicaPrivacidad);
  const [terminos, setTerminos] = useState(studioConfig.terminosServicio);
  const [form, setForm] = useState<StudioForm>(() => studioToForm(studio));
  // Política de reservas/cancelaciones (C-2/C-4). Estado propio, tarjeta aparte.
  const [pol, setPol] = useState(() => studioToPolitica(studio));
  // Marca (logo) e IVA — Tanda 1.
  const [subiendoLogo, setSubiendoLogo] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  // Añadir sede (plan CADENA — soporte multi-sede). Solo visible con
  // multiCentro activo; el gate real (cadena_id + suscripción vigente) lo
  // hace app/api/cadena/sedes, esto es solo la UI.
  const puedeAnadirSedes = !!studio && tieneFeature({ plan: studio.plan, subscriptionStatus: studio.subscriptionStatus }, 'multiCentro');
  const [nuevaSede, setNuevaSede] = useState({ nombre: '', ciudad: '', telefono: '' });
  const [creandoSede, setCreandoSede] = useState(false);
  async function anadirSede() {
    if (!nuevaSede.nombre.trim()) { showToast('Ponle un nombre a la sede'); return; }
    setCreandoSede(true);
    try {
      const res = await fetch('/api/cadena/sedes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify(nuevaSede),
      });
      const data = await res.json();
      if (!res.ok) { showToast(`Error: ${data.error ?? 'no se pudo crear la sede'}`); return; }
      showToast(`Sede "${nuevaSede.nombre}" creada — cámbiate a ella desde el menú de perfil`);
      setNuevaSede({ nombre: '', ciudad: '', telefono: '' });
    } finally {
      setCreandoSede(false);
    }
  }

  useEffect(() => { setForm(studioToForm(studio)); }, [studio]);
  useEffect(() => { setPol(studioToPolitica(studio)); }, [studio]);

  async function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !studio) return;
    if (!file.type.startsWith('image/')) { showToast('Elige un archivo de imagen'); return; }
    if (file.size > 5 * 1024 * 1024) { showToast('La imagen no puede superar 5 MB'); return; }
    setSubiendoLogo(true);
    const result = await subirLogoEstudio(studio.id, file);
    setSubiendoLogo(false);
    if ('error' in result) { showToast(result.error); return; }
    await updateStudio({ logoUrl: result.url });
    showToast('Logo actualizado');
  }

  async function handleEliminarLogo() {
    if (!studio) return;
    setSubiendoLogo(true);
    const result = await eliminarLogoEstudio(studio.id);
    setSubiendoLogo(false);
    if ('error' in result) { showToast(result.error); return; }
    await updateStudio({ logoUrl: null });
    showToast('Logo eliminado');
  }

  function guardarIva(tipo: number) {
    updateStudio({ ivaPorDefecto: tipo });
    showToast(`IVA general fijado en ${tipo}%`);
  }

  const handleReset = useCallback(() => {
    resetDatosPilates();
    showToast('Datos restablecidos al estado de demo');
  }, [resetDatosPilates, showToast]);

  function guardarEstudio() {
    updateStudio(form);
    showToast('Datos del estudio guardados');
  }

  function guardarPolitica() {
    updateStudio(pol);
    showToast('Política de reservas guardada');
  }

  return (
    <div className="space-y-5 max-w-2xl">
      {/* Studio info — editable */}
      <div className={cn(cardCls, 'p-6')}>
        <h3 className="text-[14px] font-semibold text-foreground mb-4">Información del estudio</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <p className={labelCls}>Nombre del estudio</p>
            <input className={inputCls} value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} />
          </div>
          <div>
            <p className={labelCls}>Razón social</p>
            <input className={inputCls} value={form.razonSocial} onChange={e => setForm(f => ({ ...f, razonSocial: e.target.value }))} />
          </div>
          <div>
            <p className={labelCls}>NIF / CIF</p>
            <input className={inputCls} value={form.nif} onChange={e => setForm(f => ({ ...f, nif: e.target.value }))} />
          </div>
          <div>
            <p className={labelCls}>Teléfono</p>
            <input className={inputCls} value={form.telefono} onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))} />
          </div>
          <div>
            <p className={labelCls}>Dirección</p>
            <input className={inputCls} value={form.direccion} onChange={e => setForm(f => ({ ...f, direccion: e.target.value }))} />
          </div>
          <div>
            <p className={labelCls}>Ciudad</p>
            <input className={inputCls} value={form.ciudad} onChange={e => setForm(f => ({ ...f, ciudad: e.target.value }))} />
          </div>
          <div>
            <p className={labelCls}>Código postal</p>
            <input className={inputCls} value={form.codigoPostal} onChange={e => setForm(f => ({ ...f, codigoPostal: e.target.value }))} />
          </div>
          <div>
            <p className={labelCls}>Email de contacto</p>
            <input className={inputCls} type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
          </div>
        </div>
        <button onClick={guardarEstudio} className="mt-4 px-4 py-2 rounded-lg bg-brand text-brand-foreground text-[12px] font-medium hover:brightness-95 transition-colors">
          Guardar datos del estudio
        </button>
      </div>

      {/* Añadir sede (plan CADENA) */}
      {puedeAnadirSedes && (
        <div className={cn(cardCls, 'p-6')}>
          <h3 className="text-[14px] font-semibold text-foreground mb-1 flex items-center gap-2">
            <Building2 size={15} className="text-muted-foreground" /> Añadir sede
          </h3>
          <p className="text-[12px] text-muted-foreground mb-4">
            Tu plan Cadena cubre todas tus sedes con una sola suscripción. La sede nueva queda operativa
            al momento — cámbiate a ella desde el menú de perfil (arriba a la derecha).
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <p className={labelCls}>Nombre</p>
              <input className={inputCls} value={nuevaSede.nombre} onChange={e => setNuevaSede(s => ({ ...s, nombre: e.target.value }))} />
            </div>
            <div>
              <p className={labelCls}>Ciudad</p>
              <input className={inputCls} value={nuevaSede.ciudad} onChange={e => setNuevaSede(s => ({ ...s, ciudad: e.target.value }))} />
            </div>
            <div>
              <p className={labelCls}>Teléfono</p>
              <input className={inputCls} value={nuevaSede.telefono} onChange={e => setNuevaSede(s => ({ ...s, telefono: e.target.value }))} />
            </div>
          </div>
          <button onClick={anadirSede} disabled={creandoSede} className={cn(btnPrimary, 'mt-4', creandoSede && 'opacity-50')}>
            {creandoSede ? 'Creando…' : 'Añadir sede'}
          </button>
        </div>
      )}

      {/* Marca — logo del estudio */}
      <div className={cn(cardCls, 'p-6')}>
        <h3 className="text-[14px] font-semibold text-foreground mb-1">Marca</h3>
        <p className="text-[12px] text-muted-foreground mb-4">
          Tu logo aparece en la página pública de reservas. El color de la app de
          clientas se elige desde <span className="font-medium text-foreground">Apariencia</span> (menú de perfil).
        </p>
        <div className="flex items-center gap-4">
          <div className="w-20 h-20 rounded-xl border border-border bg-muted flex items-center justify-center overflow-hidden shrink-0">
            {studio?.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={studio.logoUrl} alt="Logo del estudio" className="w-full h-full object-contain" />
            ) : (
              <span className="text-[11px] text-muted-foreground text-center px-2">Sin logo</span>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <input ref={logoInputRef} type="file" accept="image/*" onChange={handleLogoChange} className="hidden" />
            <button
              type="button"
              disabled={subiendoLogo}
              onClick={() => logoInputRef.current?.click()}
              className={cn(btnSecondary, 'disabled:opacity-40')}
            >
              {subiendoLogo ? 'Subiendo…' : studio?.logoUrl ? 'Cambiar logo' : 'Subir logo'}
            </button>
            {studio?.logoUrl && (
              <button
                type="button"
                disabled={subiendoLogo}
                onClick={handleEliminarLogo}
                className="text-[12px] font-medium text-destructive hover:underline text-left disabled:opacity-40"
              >
                Quitar logo
              </button>
            )}
            <p className="text-[11px] text-muted-foreground">PNG o JPG, máx. 5 MB.</p>
          </div>
        </div>
      </div>

      {/* Facturación e impuestos — tipo de IVA general */}
      <div className={cn(cardCls, 'p-6')}>
        <h3 className="text-[14px] font-semibold text-foreground mb-1">Facturación e impuestos</h3>
        <p className="text-[12px] text-muted-foreground mb-4">
          Tipo de IVA aplicado al emitir facturas. Los precios se tratan como <span className="font-medium text-foreground">IVA incluido</span>:
          este tipo solo cambia el desglose base/cuota, nunca el total cobrado.
        </p>
        <div className="max-w-xs">
          <p className={labelCls}>IVA general</p>
          <select
            className={cn(inputCls, 'cursor-pointer')}
            value={studio?.ivaPorDefecto ?? 21}
            onChange={e => guardarIva(Number(e.target.value))}
          >
            <option value={21}>21 % — General</option>
            <option value={10}>10 % — Reducido</option>
            <option value={4}>4 % — Superreducido</option>
            <option value={0}>0 % — Exento</option>
          </select>
          <p className="text-[11px] text-muted-foreground mt-2">
            Se aplica a las próximas facturas. Las ya emitidas y selladas (Veri*Factu) no cambian.
          </p>
        </div>
      </div>

      {/* Reservas y cancelaciones (C-2/C-4) */}
      <div className={cn(cardCls, 'p-6')}>
        <h3 className="text-[14px] font-semibold text-foreground mb-1">Reservas y cancelaciones</h3>
        <p className="text-[12px] text-muted-foreground mb-4">
          Reglas que se aplican cuando una clienta reserva o cancela desde el portal público.
        </p>
        <div className="space-y-4">
          <div>
            <p className={labelCls}>Ventana de cancelación (horas)</p>
            <input
              type="number" min={0} max={168} className={inputCls}
              value={pol.cancelacionVentanaHoras}
              onChange={e => setPol(p => ({ ...p, cancelacionVentanaHoras: Math.max(0, Number(e.target.value)) }))}
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Cancelar con menos antelación se considera tardío. 0 = sin penalización.
            </p>
          </div>
          <label className="flex items-center justify-between gap-4 cursor-pointer">
            <span className="text-[13px] text-foreground">
              Devolver la sesión del bono en cancelaciones tardías
              <span className="block text-[11px] text-muted-foreground">Desactivado: una cancelación tardía pierde la sesión (recomendado).</span>
            </span>
            <Toggle on={pol.cancelacionDevolverBonoTardia} onChange={v => setPol(p => ({ ...p, cancelacionDevolverBonoTardia: v }))} />
          </label>
          <label className="flex items-center justify-between gap-4 cursor-pointer">
            <span className="text-[13px] text-foreground">
              Exigir plan o bono activo para reservar
              <span className="block text-[11px] text-muted-foreground">La clienta necesita una suscripción activa o bono con sesiones para reservar.</span>
            </span>
            <Toggle on={pol.reservaExigirPlan} onChange={v => setPol(p => ({ ...p, reservaExigirPlan: v }))} />
          </label>
          <div>
            <p className={labelCls}>Máximo de reservas simultáneas por clienta</p>
            <input
              type="number" min={0} max={99} className={inputCls}
              placeholder="Sin límite"
              value={pol.reservaMaxSimultaneas ?? ''}
              onChange={e => setPol(p => ({ ...p, reservaMaxSimultaneas: e.target.value === '' ? null : Math.max(0, Number(e.target.value)) }))}
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Reservas activas en clases futuras. Vacío = sin límite.
            </p>
          </div>
        </div>
        <button onClick={guardarPolitica} className="mt-4 px-4 py-2 rounded-lg bg-brand text-brand-foreground text-[12px] font-medium hover:brightness-95 transition-colors">
          Guardar política de reservas
        </button>
      </div>

      {/* Enlaces públicos */}
      <div className={cn(cardCls, 'p-6')}>
        <h3 className="text-[14px] font-semibold text-foreground mb-1">Enlaces públicos</h3>
        <p className="text-[12px] text-muted-foreground mb-3">
          Páginas de tu estudio para compartir con clientas o usar en tablet.
        </p>
        <div className="space-y-2">
          <a
            href={`/reservar/${studio?.slug ?? ''}`}
            target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border border-border hover:bg-muted transition-colors"
          >
            <CalendarLinkIcon size={15} className="text-muted-foreground shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold text-foreground">Portal de reservas</p>
              <p className="text-[11px] text-muted-foreground">Página pública para que cualquiera reserve una clase</p>
            </div>
            <ExternalLink size={13} className="text-muted-foreground shrink-0" />
          </a>
          <a
            href={`/kiosk/${studio?.slug ?? ''}`}
            target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border border-border hover:bg-muted transition-colors"
          >
            <Monitor size={15} className="text-muted-foreground shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold text-foreground">Modo quiosco</p>
              <p className="text-[11px] text-muted-foreground">Pantalla de check-in para dejar en una tablet en recepción</p>
            </div>
            <ExternalLink size={13} className="text-muted-foreground shrink-0" />
          </a>
        </div>
      </div>

      {/* Privacy policy */}
      <div className={cn(cardCls, 'p-6')}>
        <h3 className="text-[14px] font-semibold text-foreground mb-1">Política de privacidad</h3>
        <p className="text-[12px] text-muted-foreground mb-3">
          Este texto se muestra a las clientas al registrarse y deben aceptarlo antes de completar la inscripción.
        </p>
        <textarea
          rows={8}
          className="w-full rounded-lg border border-border bg-card px-3 py-2 text-[12px] font-mono text-foreground focus:outline-none focus:border-muted-foreground transition-colors resize-y"
          value={politica}
          onChange={(e) => setPolitica(e.target.value)}
        />
        <button
          onClick={() => { updateStudioConfig({ politicaPrivacidad: politica }); showToast('Política de privacidad guardada'); }}
          className="mt-3 px-4 py-2 rounded-lg bg-brand text-brand-foreground text-[12px] font-medium hover:brightness-95 transition-colors"
        >
          Guardar política
        </button>
      </div>

      {/* Terms of service */}
      <div className={cn(cardCls, 'p-6')}>
        <h3 className="text-[14px] font-semibold text-foreground mb-1">Términos y condiciones</h3>
        <p className="text-[12px] text-muted-foreground mb-3">
          Contrato que acepta cada clienta al inscribirse. Queda registrado con su firma digital.
        </p>
        <textarea
          rows={8}
          className="w-full rounded-lg border border-border bg-card px-3 py-2 text-[12px] font-mono text-foreground focus:outline-none focus:border-muted-foreground transition-colors resize-y"
          value={terminos}
          onChange={(e) => setTerminos(e.target.value)}
        />
        <button
          onClick={() => { updateStudioConfig({ terminosServicio: terminos }); showToast('Términos y condiciones guardados'); }}
          className="mt-3 px-4 py-2 rounded-lg bg-brand text-brand-foreground text-[12px] font-medium hover:brightness-95 transition-colors"
        >
          Guardar términos
        </button>
      </div>

      {/* Danger zone */}
      <div className={cn(cardCls, 'p-6 border-[#FCA5A5]')}>
        <h3 className="text-[14px] font-semibold text-destructive mb-1">Zona de riesgo</h3>
        <p className="text-[13px] text-muted-foreground mb-4">
          Las acciones de esta sección son irreversibles. Procede con precaución.
        </p>
        <div className="flex items-center justify-between p-4 bg-destructive/10 border border-[#FCA5A5] rounded-xl">
          <div>
            <p className="text-[13px] font-semibold text-foreground">Restablecer datos de demo</p>
            <p className="text-[12px] text-muted-foreground mt-0.5">
              Borra todos los cambios y vuelve al estado inicial de demostración.
            </p>
          </div>
          <button
            onClick={() => setConfirmReset(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-destructive text-destructive text-[12px] font-medium hover:bg-destructive hover:text-white transition-colors shrink-0 ml-4"
          >
            <RotateCcw size={12} />
            Restablecer
          </button>
        </div>
      </div>

      {/* Confirm reset dialog */}
      <Dialog open={confirmReset} onOpenChange={setConfirmReset}>
        <DialogContent className="max-w-sm">
          <div className="flex flex-col items-center text-center gap-4 py-2">
            <div className="w-12 h-12 rounded-xl bg-warning/10 flex items-center justify-center">
              <AlertTriangle size={20} className="text-warning" />
            </div>
            <div>
              <h3 className="text-[14px] font-semibold text-foreground mb-1">
                ¿Restablecer datos de demo?
              </h3>
              <p className="text-[13px] text-muted-foreground">
                Todos los socios, sesiones, pagos y configuraciones que hayas creado se perderán.
                Esta acción no se puede deshacer.
              </p>
            </div>
            <div className="flex gap-2 w-full">
              <button
                className={cn(btnSecondary, 'flex-1 justify-center')}
                onClick={() => setConfirmReset(false)}
              >
                Cancelar
              </button>
              <button
                className="flex-1 bg-warning text-white rounded-lg px-4 py-2 text-[13px] font-medium hover:bg-amber-700 transition-colors"
                onClick={() => { handleReset(); setConfirmReset(false); }}
              >
                Sí, restablecer
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
