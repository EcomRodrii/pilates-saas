'use client';

import { cn } from '@/lib/utils';
import { nifValido } from '@/lib/nif';
import type { Studio } from '@/lib/types';
import { inputCls } from '@/components/configuracion/estilos';
import { TarjetaAjuste } from '@/components/configuracion/shell/tarjeta-ajuste';
import { BarraCambiosEstudio, Campo, useFormularioEstudio } from '@/components/configuracion/formulario-estudio';

// «Datos fiscales e IVA», en Cobros y facturas: lo que va en tus facturas.
// Guarda SOLO razón social, NIF e IVA (ver formulario-estudio.tsx).
//
// `datos-fiscales` es un ancla con enlaces de verdad: «Poner mi NIF ahora» de
// Cobros → Facturas, el aviso de Contrato y privacidad y la guía.

type DatosFiscalesForm = {
  razonSocial: string;
  nif: string;
  /** Como texto porque es el valor del `<select>`; se guarda como número. */
  ivaPorDefecto: string;
};

function aFormulario(s: Studio | null): DatosFiscalesForm {
  return {
    razonSocial: s?.razonSocial ?? '',
    nif: s?.nif ?? '',
    ivaPorDefecto: String(s?.ivaPorDefecto ?? 21),
  };
}

export function TabDatosFiscales({ showToast }: { showToast: (m: string) => void }) {
  const { form, setForm, hayCambios, guardando, guardar, descartar } = useFormularioEstudio(aFormulario, showToast);

  const nifInvalido = form.nif.trim() !== '' && !nifValido(form.nif);

  function guardarDatosFiscales() {
    if (nifInvalido) { showToast('El NIF/CIF no es válido: revisa la letra o el dígito de control.'); return; }
    void guardar({
      razonSocial: form.razonSocial,
      nif: form.nif,
      // Viaja con el NIF y la razón social. Lo lee el TPV
      // (app/api/pos/catalogo) y el desglose de cada factura nueva.
      ivaPorDefecto: Number(form.ivaPorDefecto),
    }, 'Datos fiscales guardados');
  }

  return (
    <div className="max-w-2xl space-y-3">
      <TarjetaAjuste id="datos-fiscales">
        <p className="mb-4 text-[12px] leading-relaxed text-muted-foreground">
          Los precios se tratan como <span className="font-medium text-foreground">IVA incluido</span>: el tipo solo
          cambia el desglose base/cuota, nunca el total que cobras.
        </p>
        <div className="grid grid-cols-1 gap-5 @md/config:grid-cols-2">
          <Campo label="Razón social" ayuda="El nombre legal, si no coincide con el comercial.">
            {id => (
              <input id={id} className={inputCls} value={form.razonSocial}
                onChange={e => setForm(f => ({ ...f, razonSocial: e.target.value }))} />
            )}
          </Campo>
          <Campo
            label="NIF / CIF"
            error={nifInvalido ? 'Revisa el NIF/CIF: la letra o el dígito de control no cuadran.' : null}
          >
            {id => (
              <input
                id={id}
                className={cn(inputCls, nifInvalido && 'border-destructive')}
                value={form.nif}
                aria-invalid={nifInvalido}
                onChange={e => setForm(f => ({ ...f, nif: e.target.value }))}
              />
            )}
          </Campo>
          {/* El IVA espera a «Guardar», como el NIF y la razón social de esta
              misma tarjeta. Se guardaba solo al elegirlo: dos modelos en una
              tarjeta (#1971), y encima reiniciaba el formulario y borraba el
              NIF que estuvieras escribiendo. */}
          <Campo
            label="IVA general"
            className="@md/config:col-span-2"
            ayuda="Se aplica a las próximas facturas desde que guardas. Las ya emitidas y selladas (Veri*Factu) no cambian."
          >
            {id => (
              <select
                id={id}
                className={cn(inputCls, 'max-w-xs cursor-pointer')}
                value={form.ivaPorDefecto}
                onChange={e => setForm(f => ({ ...f, ivaPorDefecto: e.target.value }))}
              >
                <option value={21}>21 % — General</option>
                <option value={10}>10 % — Reducido</option>
                <option value={4}>4 % — Superreducido</option>
                <option value={0}>0 % — Exento</option>
              </select>
            )}
          </Campo>
        </div>
      </TarjetaAjuste>

      <BarraCambiosEstudio
        visible={hayCambios}
        guardando={guardando}
        textoGuardar="Guardar datos fiscales"
        onGuardar={guardarDatosFiscales}
        onDescartar={descartar}
      />
    </div>
  );
}
