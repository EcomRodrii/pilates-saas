'use client';

import { TabEstudioLegal } from '@/components/configuracion/tab-estudio-legal';
import { TabCamposPersonalizados } from '@/components/configuracion/tab-campos-personalizados';
import { TabCuestionarioSalud } from '@/components/configuracion/tab-cuestionario-salud';
import { TarjetaAjuste } from '@/components/configuracion/shell/tarjeta-ajuste';
import { BarraGuardar } from '@/components/configuracion/shell/barra-guardar';
import { useFormularioEstudio } from '@/components/configuracion/formulario-estudio';
import { TarjetaCompraPublica, formularioCompraPublica } from '@/components/configuracion/tarjeta-compra-publica';
import { tarjetaPorId } from '@/lib/configuracion/secciones';

// Alta de alumnas: lo que acepta y rellena una alumna nueva.
//
// La barra de guardar va al final de la sección (tiene que ser la última hija de
// la columna para pegarse abajo) y guarda solo «Compra desde tu enlace»: el
// contrato y la privacidad tienen todavía sus propios botones.
export function SeccionAltas({ showToast }: { showToast: (m: string) => void }) {
  const compra = useFormularioEstudio(formularioCompraPublica, showToast);

  async function guardarCompra(): Promise<string | null> {
    const res = await compra.guardar({ compraPublicaModo: compra.form.compraPublicaModo }, null);
    if (!res) return 'ya se estaba guardando';
    if (!res.ok) return res.error;
    showToast('Compra desde tu enlace guardada');
    return null;
  }

  return (
    <>
      <TabEstudioLegal showToast={showToast} />
      <TarjetaCompraPublica
        valor={compra.form.compraPublicaModo}
        onCambiar={v => compra.setForm({ compraPublicaModo: v })}
      />
      <TarjetaAjuste id="datos-extra-de-la-ficha" marco={false}>
        <TabCamposPersonalizados showToast={showToast} />
      </TarjetaAjuste>
      <TabCuestionarioSalud showToast={showToast} />
      <BarraGuardar
        seccion="altas"
        cambios={compra.hayCambios ? [tarjetaPorId('compra-desde-tu-enlace').titulo] : []}
        onGuardar={guardarCompra}
        onDescartar={compra.descartar}
      />
    </>
  );
}
