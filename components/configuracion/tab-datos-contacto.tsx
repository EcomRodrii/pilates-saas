'use client';

import type { ChangeEvent } from 'react';
import { hrefCanal, CANALES } from '@/lib/canales-estudio';
import type { Studio } from '@/lib/types';
import type { ResultadoEscritura } from '@/lib/errores';
import { inputCls } from '@/components/configuracion/estilos';
import { BarraGuardar } from '@/components/configuracion/shell/barra-guardar';
import type { PropsFormularioCajon } from '@/components/configuracion/shell/cajon-ajuste';
import { Campo, useFormularioEstudio } from '@/components/configuracion/formulario-estudio';

// Los dos cajones de datos de «Mi estudio»: «Nombre y dirección» y «Contacto».
//
// Eran una tarjeta de siete campos («Datos y contacto») y un cajón lleva como
// mucho seis, así que se partió en dos. Cada uno manda SOLO sus campos
// (components/configuracion/formulario-estudio.tsx, #2027), y «Guardado» solo
// llega con la fila confirmada: si no, el cajón se queda abierto, con lo
// escrito, y la barra dice por qué.

/** Para la barra: `null` = guardado. */
function falloDe(res: ResultadoEscritura | null): string | null {
  if (!res) return 'Ya se estaba guardando';
  return res.ok ? null : res.error;
}

type NombreYDireccion = { nombre: string; direccion: string; ciudad: string; codigoPostal: string };

function aNombreYDireccion(s: Studio | null): NombreYDireccion {
  return { nombre: s?.nombre ?? '', direccion: s?.direccion ?? '', ciudad: s?.ciudad ?? '', codigoPostal: s?.codigoPostal ?? '' };
}

export function FormNombreYDireccion({ showToast, onGuardado }: PropsFormularioCajon) {
  const { form, setForm, hayCambios, guardar, descartar } = useFormularioEstudio(aNombreYDireccion, showToast);
  const campo = (k: keyof NombreYDireccion) => (e: ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setForm(f => ({ ...f, [k]: v }));
  };

  async function alGuardar() {
    const fallo = falloDe(await guardar(form, null));
    if (!fallo) onGuardado('Nombre y dirección guardados');
    return fallo;
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-5 pb-6 @sm/config:grid-cols-2">
        <Campo label="Nombre del estudio" className="@sm/config:col-span-2" ayuda="El nombre comercial. La razón social va con tus datos fiscales.">
          {id => <input id={id} className={inputCls} value={form.nombre} onChange={campo('nombre')} />}
        </Campo>
        <Campo label="Dirección" className="@sm/config:col-span-2">
          {id => <input id={id} className={inputCls} value={form.direccion} onChange={campo('direccion')} />}
        </Campo>
        <Campo label="Ciudad">
          {id => <input id={id} className={inputCls} value={form.ciudad} onChange={campo('ciudad')} />}
        </Campo>
        <Campo label="Código postal">
          {id => <input id={id} className={inputCls} inputMode="numeric" value={form.codigoPostal} onChange={campo('codigoPostal')} />}
        </Campo>
      </div>
      <BarraGuardar
        seccion="estudio"
        cambios={hayCambios ? ['Nombre y dirección'] : []}
        bloqueo={form.nombre.trim() ? null : 'Ponle un nombre a tu estudio.'}
        onGuardar={alGuardar}
        onDescartar={descartar}
      />
    </>
  );
}

type Contacto = { telefono: string; email: string; sitioWeb: string };

function aContacto(s: Studio | null): Contacto {
  return { telefono: s?.telefono ?? '', email: s?.email ?? '', sitioWeb: s?.sitioWeb ?? '' };
}

export function FormContacto({ showToast, onGuardado }: PropsFormularioCajon) {
  const { form, setForm, hayCambios, guardar, descartar } = useFormularioEstudio(aContacto, showToast);
  const campo = (k: keyof Contacto) => (e: ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setForm(f => ({ ...f, [k]: v }));
  };

  // Aviso, no bloqueo: se guarda igual (mismo criterio que el resto de
  // canales). Solo evita el silencio de guardar algo que después no se pinta.
  const webNoResuelve = form.sitioWeb.trim() !== '' && !hrefCanal('web', form.sitioWeb);

  async function alGuardar() {
    // En blanco se guarda como NULL, no como cadena vacía: «no la ha puesto» y
    // «la ha puesto vacía» tienen que ser lo mismo para quien decide si pintar
    // el enlace.
    const fallo = falloDe(await guardar({ ...form, sitioWeb: form.sitioWeb.trim() || null }, null));
    if (!fallo) onGuardado('Contacto guardado');
    return fallo;
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-5 pb-6 @sm/config:grid-cols-2">
        <Campo label="Teléfono">
          {id => <input id={id} className={inputCls} type="tel" value={form.telefono} onChange={campo('telefono')} />}
        </Campo>
        <Campo label="Email de contacto">
          {id => <input id={id} className={inputCls} type="email" value={form.email} onChange={campo('email')} />}
        </Campo>
        {/* La web va aquí y no con las redes: no es una red social, es un dato
            de contacto —hermano del teléfono y el email— y la usan sitios que
            no cargan el tema, empezando por el pie de tus correos. Ver
            lib/canales-estudio.ts. */}
        <Campo
          label="Web"
          className="@sm/config:col-span-2"
          ayuda={webNoResuelve ? 'No parece una dirección web: no se verá en tu página ni en tus correos.' : undefined}
        >
          {id => <input id={id} className={inputCls} value={form.sitioWeb} placeholder={CANALES.web.placeholder} onChange={campo('sitioWeb')} />}
        </Campo>
      </div>
      <BarraGuardar
        seccion="estudio"
        cambios={hayCambios ? ['Contacto'] : []}
        onGuardar={alGuardar}
        onDescartar={descartar}
      />
    </>
  );
}
