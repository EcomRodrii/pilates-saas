'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { RotateCcw, Palette, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useStudio } from '@/lib/studio-context';
import { nifValido } from '@/lib/nif';
import type { Studio } from '@/lib/types';
import { inputCls, labelCls, btnSecondary, cardCls } from '@/app/(dashboard)/configuracion/page';

// Quién es el estudio (identidad + fiscal) + los dos ajustes de una sola
// línea (IVA, recargar datos) que no merecen sub-pestaña propia. Todo lo
// demás de la antigua "Estudio" (sedes, política de reservas, SEPA, enlaces,
// legal) vive ahora en su propia sub-pestaña — ver tab-estudio.tsx.

type StudioForm = {
  nombre: string; razonSocial: string; nif: string;
  direccion: string; ciudad: string; codigoPostal: string;
  telefono: string; email: string;
  descripcion: string; anioFundacion: string;
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
    descripcion: s?.descripcion ?? '',
    anioFundacion: s?.anioFundacion ? String(s.anioFundacion) : '',
  };
}

export function TabEstudioGeneral({ showToast }: { showToast: (m: string) => void }) {
  const { resetDatosPilates, studio, updateStudio } = useStudio();
  const [form, setForm] = useState<StudioForm>(() => studioToForm(studio));
  const nifInvalido = form.nif.trim() !== '' && !nifValido(form.nif);

  // Reajusta el formulario cuando `studio` cambia de referencia (llega de la
  // BD, o se cambia de sede) — ajuste de estado durante el render, no un
  // efecto: así no hay un primer pintado con el valor viejo.
  const [studioAnterior, setStudioAnterior] = useState(studio);
  if (studio !== studioAnterior) {
    setStudioAnterior(studio);
    setForm(studioToForm(studio));
  }

  const handleReset = useCallback(() => {
    resetDatosPilates();
    showToast('Datos recargados');
  }, [resetDatosPilates, showToast]);

  function guardarEstudio() {
    if (nifInvalido) { showToast('El NIF/CIF no es válido: revisa la letra o el dígito de control.'); return; }
    const anio = form.anioFundacion.trim();
    if (anio && !/^\d{4}$/.test(anio)) { showToast('El año de apertura tiene que ser de cuatro cifras.'); return; }
    const { anioFundacion, descripcion, ...resto } = form;
    updateStudio({
      ...resto,
      descripcion: descripcion.trim() || null,
      anioFundacion: anio ? Number(anio) : null,
    });
    showToast('Datos del estudio guardados');
  }

  function guardarIva(tipo: number) {
    updateStudio({ ivaPorDefecto: tipo });
    showToast(`IVA general fijado en ${tipo}%`);
  }

  return (
    <div className="space-y-5 max-w-2xl">
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
            <input className={cn(inputCls, nifInvalido && 'border-destructive')} value={form.nif} onChange={e => setForm(f => ({ ...f, nif: e.target.value }))} />
            {nifInvalido && <p className="text-[11px] text-destructive mt-1">Revisa el NIF/CIF: la letra o el dígito de control no cuadran.</p>}
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
          <div className="sm:col-span-2">
            <p className={labelCls}>Cómo te presentas</p>
            <textarea
              className={`${inputCls} min-h-[76px] resize-y`}
              value={form.descripcion}
              maxLength={400}
              placeholder="Estudio boutique especializado en pilates reformer. Grupos de ocho para que nadie pase desapercibida."
              onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))}
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Sale en tu página de reservas. Si lo dejas vacío, ese bloque no se pinta.
            </p>
          </div>
          <div>
            <p className={labelCls}>Año de apertura</p>
            <input
              className={inputCls}
              value={form.anioFundacion}
              inputMode="numeric"
              maxLength={4}
              placeholder="2016"
              onChange={e => setForm(f => ({ ...f, anioFundacion: e.target.value.replace(/\D/g, '') }))}
            />
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

      {/* Marca — antes había aquí un subir-logo propio que duplicaba, sin que
          nada avisara, al de Apariencia (components/theme/theme-editor.tsx):
          los dos escribían el mismo studio.logoUrl. Ahora hay un solo sitio
          para logo, favicon y color — este es solo un enlace hacia allí. */}
      <div className={cn(cardCls, 'p-6')}>
        <h3 className="text-[14px] font-semibold text-foreground mb-1">Marca</h3>
        <p className="text-[12px] text-muted-foreground mb-4">
          Logo, favicon y color de la app de clientas se editan desde Apariencia.
        </p>
        <Link
          href="/configuracion/apariencia"
          className="flex items-center justify-between px-3.5 py-3 rounded-xl border border-border hover:bg-muted transition-colors"
        >
          <span className="flex items-center gap-2.5 text-[13px] font-semibold text-foreground">
            <Palette size={15} className="text-muted-foreground" />
            Editar marca y apariencia
          </span>
          <ChevronRight size={15} className="text-muted-foreground" />
        </Link>
      </div>

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

      {/* Recargar datos: NO borra nada, solo vuelve a leer del servidor. Antes se
          llamaba "Restablecer datos de demo" y avisaba de una pérdida irreversible
          que nunca ocurría — el pánico lo causaba el texto, no la acción. */}
      <div className={cn(cardCls, 'p-6')}>
        <h3 className="text-[14px] font-semibold text-foreground mb-1">Recargar datos</h3>
        <p className="text-[13px] text-muted-foreground mb-4">
          Vuelve a leer socias, sesiones y pagos desde el servidor. No borra ni cambia nada.
        </p>
        <div className="flex items-center justify-between p-4 bg-muted/40 border border-border rounded-xl">
          <div>
            <p className="text-[13px] font-semibold text-foreground">Sincronizar con el servidor</p>
            <p className="text-[12px] text-muted-foreground mt-0.5">
              Útil si algo no se ha actualizado en pantalla.
            </p>
          </div>
          <button
            onClick={handleReset}
            className={cn(btnSecondary, 'flex items-center gap-1.5 shrink-0 ml-4')}
          >
            <RotateCcw size={12} />
            Recargar
          </button>
        </div>
      </div>
    </div>
  );
}
