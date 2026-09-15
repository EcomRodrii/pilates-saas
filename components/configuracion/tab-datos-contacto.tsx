'use client';

import { hrefCanal, CANALES } from '@/lib/canales-estudio';
import type { Studio } from '@/lib/types';
import { inputCls } from '@/components/configuracion/estilos';
import { TarjetaAjuste } from '@/components/configuracion/shell/tarjeta-ajuste';
import { BarraCambiosEstudio, Campo, useFormularioEstudio } from '@/components/configuracion/formulario-estudio';

// «Datos y contacto», en Mi estudio: a dónde te escriben y dónde estás. Guarda
// SOLO estos siete campos (ver components/configuracion/formulario-estudio.tsx).

type DatosContactoForm = {
  nombre: string;
  telefono: string; email: string; sitioWeb: string;
  direccion: string; ciudad: string; codigoPostal: string;
};

function aFormulario(s: Studio | null): DatosContactoForm {
  return {
    nombre: s?.nombre ?? '',
    telefono: s?.telefono ?? '',
    email: s?.email ?? '',
    sitioWeb: s?.sitioWeb ?? '',
    direccion: s?.direccion ?? '',
    ciudad: s?.ciudad ?? '',
    codigoPostal: s?.codigoPostal ?? '',
  };
}

export function TabDatosContacto({ showToast }: { showToast: (m: string) => void }) {
  const { form, setForm, hayCambios, guardando, guardar, descartar } = useFormularioEstudio(aFormulario, showToast);

  // Aviso, no bloqueo: se guarda igual (mismo criterio que el resto de
  // canales). Solo evita el silencio de guardar algo que después no se pinta.
  const webNoResuelve = form.sitioWeb.trim() !== '' && !hrefCanal('web', form.sitioWeb);

  function guardarDatos() {
    const { sitioWeb, ...resto } = form;
    void guardar({
      ...resto,
      // En blanco se guarda como NULL, no como cadena vacía: «no la ha puesto»
      // y «la ha puesto vacía» tienen que ser lo mismo para quien decide si
      // pintar el enlace.
      sitioWeb: sitioWeb.trim() || null,
    }, 'Datos y contacto guardados');
  }

  return (
    <div className="max-w-2xl space-y-3">
      <TarjetaAjuste id="datos-y-contacto">
        <div className="grid grid-cols-1 gap-5 @md/config:grid-cols-2">
          <Campo label="Nombre del estudio" className="@md/config:col-span-2" ayuda="El nombre comercial, el que usa todo el mundo. La razón social va en Cobros y facturas, con los datos fiscales.">
            {id => (
              <input id={id} className={inputCls} value={form.nombre}
                onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} />
            )}
          </Campo>
          <Campo label="Teléfono">
            {id => (
              <input id={id} className={inputCls} type="tel" value={form.telefono}
                onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))} />
            )}
          </Campo>
          <Campo label="Email de contacto">
            {id => (
              <input id={id} className={inputCls} type="email" value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
            )}
          </Campo>
          {/* La web va aquí y no con las redes: no es una red social, es un
              dato de contacto —hermano del teléfono y el email— y la usan
              sitios que no cargan el tema, empezando por el pie de tus
              correos. Ver lib/canales-estudio.ts. */}
          <Campo
            label="Web"
            className="@md/config:col-span-2"
            ayuda={webNoResuelve
              ? 'No parece una dirección web: no se verá en tu página ni en tus correos.'
              : undefined}
          >
            {id => (
              <input
                id={id}
                className={inputCls}
                value={form.sitioWeb}
                placeholder={CANALES.web.placeholder}
                onChange={e => setForm(f => ({ ...f, sitioWeb: e.target.value }))}
              />
            )}
          </Campo>
          <Campo label="Dirección" className="@md/config:col-span-2">
            {id => (
              <input id={id} className={inputCls} value={form.direccion}
                onChange={e => setForm(f => ({ ...f, direccion: e.target.value }))} />
            )}
          </Campo>
          <Campo label="Ciudad">
            {id => (
              <input id={id} className={inputCls} value={form.ciudad}
                onChange={e => setForm(f => ({ ...f, ciudad: e.target.value }))} />
            )}
          </Campo>
          <Campo label="Código postal">
            {id => (
              <input id={id} className={inputCls} inputMode="numeric" value={form.codigoPostal}
                onChange={e => setForm(f => ({ ...f, codigoPostal: e.target.value }))} />
            )}
          </Campo>
        </div>
      </TarjetaAjuste>

      <BarraCambiosEstudio
        visible={hayCambios}
        guardando={guardando}
        textoGuardar="Guardar datos y contacto"
        onGuardar={guardarDatos}
        onDescartar={descartar}
      />
    </div>
  );
}
