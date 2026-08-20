"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/portal-tema/components/ui/Icon";
import { Button, Field, Input } from "@/components/portal-tema/components/ui/primitives";
import { StatusBar } from "@/components/portal-tema/components/layout/chrome";
import { useActions, usePortal } from "@/components/portal-tema/store/PortalStore";
import type { ViewModel } from "@/components/portal-tema/store/useViewModel";
import { validarMisDatos, hayErrores, hayCambios, type ErroresMisDatos, type MisDatos } from "@/lib/portal-tema/mis-datos";

/**
 * Mis datos.
 *
 * ⚠️ SEIS campos, no los tres del prototipo (nombre, email, teléfono). Los
 * otros tres —apellidos, fecha de nacimiento y dirección— ya existen en el
 * perfil que la socia usa hoy (`PortalPerfilView`), y quitárselos sería que el
 * rediseño le costara dónde escribir su dirección.
 *
 * No guarda nada de forma optimista: el aviso sale con lo que responde el
 * servidor, y solo entonces se vuelve atrás. Sin socia identificada (la
 * previsualización) lo dice en vez de fingir un «Guardado».
 *
 * ⚠️ EL FORMULARIO ESPERA A QUE LLEGUEN LOS DATOS, y esto era un bug que podía
 * BORRARLE el perfil a una socia. Antes hacía una foto de `vm.profile` al montar
 * y no había ni un solo efecto: si la pantalla se abría antes de que el catálogo
 * respondiera —que es lo normal entrando directo por URL o con la red lenta—,
 * los seis campos salían vacíos y «Guardar cambios» mandaba esos vacíos al
 * servidor encima de sus datos reales.
 *
 * Se arregla en dos sitios a la vez, porque uno solo no basta:
 *   · mientras no hay socia identificada (`profile.id` vacío) no se puede
 *     guardar, y la pantalla lo dice;
 *   · cuando llega, el formulario se resincroniza — salvo que la socia ya haya
 *     escrito algo, porque entonces lo suyo manda y pisárselo sería el mismo
 *     bug al revés.
 */
export function MyData({ vm }: { vm: ViewModel }) {
  const actions = useActions();
  const { loading } = usePortal();
  const s = vm.profile;

  const guardado: MisDatos = {
    nombre: s.short, apellidos: s.apellidos, email: s.email,
    telefono: s.telefono, fechaNacimiento: s.fechaNacimiento, direccion: s.direccion,
  };
  // Vacío = el catálogo todavía no ha traído a la socia, o no hay ninguna
  // identificada (la previsualización del editor). Ver `sociaDe`.
  const cargado = !!s.id;

  const [form, setForm] = useState<MisDatos>(guardado);
  const [errores, setErrores] = useState<ErroresMisDatos>({});
  // Solo se enseñan los errores DESPUÉS de intentar guardar. Pintarlos mientras
  // escribe le dice «ese email no parece completo» a la letra 3 de 20.
  const [intentado, setIntentado] = useState(false);
  const tocado = useRef(false);

  // La resincronización. `guardado` se serializa para comparar por VALOR: es un
  // objeto nuevo en cada render y con él en las dependencias esto correría
  // siempre.
  const claveGuardado = JSON.stringify(guardado);
  useEffect(() => {
    if (tocado.current) return;
    setForm(JSON.parse(claveGuardado) as MisDatos);
  }, [claveGuardado]);

  const set = (k: keyof MisDatos) => (e: React.ChangeEvent<HTMLInputElement>) => {
    tocado.current = true;
    const v = e.target.value;
    setForm((f) => {
      const siguiente = { ...f, [k]: v };
      // Ya con un error en pantalla, se revalida al escribir: así el mensaje se
      // apaga en cuanto lo arregla, en vez de seguir ahí hasta el siguiente
      // intento de guardar.
      if (intentado) setErrores(validarMisDatos(siguiente));
      return siguiente;
    });
  };

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    setIntentado(true);
    const fallos = validarMisDatos(form);
    setErrores(fallos);
    if (hayErrores(fallos)) return;
    // Sin socia cargada no se manda nada: es justo el caso que borraba datos.
    if (!cargado) return;
    // Y sin cambios tampoco: una escritura que no cambia nada es una escritura
    // que puede fallar para nada.
    if (!hayCambios(form, guardado)) return actions.back();
    actions.guardarDatos(form);
  }

  return (
    <>
      <StatusBar />
      <div className="canvas no-scrollbar">
        <div className="topbar" style={{ padding: "0 0 4px" }}>
          <button className="icon-btn is-pressable" onClick={actions.back} aria-label="Atrás">
            <Icon name="back" stroke={1.9} />
          </button>
          <p className="topbar__title">Mis datos</p>
          <span style={{ width: 40 }}></span>
        </div>

        {/* El botón va DENTRO del formulario y es `type="submit"`: antes había
            dos caminos de envío (el `onSubmit` y un `onClick` suelto) que podían
            separarse en el primer cambio. */}
        <form className="form-grid scroller no-scrollbar" onSubmit={enviar} noValidate>
          <Field label="Nombre" htmlFor="nombre" error={errores.nombre}>
            <Input id="nombre" autoComplete="given-name" value={form.nombre} onChange={set("nombre")}
              aria-invalid={!!errores.nombre} />
          </Field>
          <Field label="Apellidos" htmlFor="apellidos" error={errores.apellidos}>
            <Input id="apellidos" autoComplete="family-name" value={form.apellidos} onChange={set("apellidos")} />
          </Field>
          <Field label="Email" htmlFor="email" error={errores.email}>
            <Input id="email" type="email" autoComplete="email" value={form.email} onChange={set("email")}
              aria-invalid={!!errores.email} />
          </Field>
          <Field label="Teléfono" htmlFor="tel" error={errores.telefono} hint="Para avisarte de un cambio de última hora.">
            <Input id="tel" type="tel" inputMode="tel" autoComplete="tel" placeholder="+34 600 000 000"
              value={form.telefono} onChange={set("telefono")} aria-invalid={!!errores.telefono} />
          </Field>
          <Field label="Fecha de nacimiento" htmlFor="nac" error={errores.fechaNacimiento}>
            <Input id="nac" type="date" value={form.fechaNacimiento} onChange={set("fechaNacimiento")}
              aria-invalid={!!errores.fechaNacimiento} />
          </Field>
          <Field label="Dirección" htmlFor="dir" error={errores.direccion}>
            <Input id="dir" autoComplete="street-address" placeholder="Calle, número, ciudad"
              value={form.direccion} onChange={set("direccion")} />
          </Field>

          {/* Se dice por qué no se puede guardar, en vez de dejar un botón
              apagado sin explicación. */}
          {!cargado ? (
            <p className="field__hint" role="status">Cargando tus datos…</p>
          ) : null}

          <Button type="submit" block size="lg" loading={loading} disabled={!cargado}>
            Guardar cambios
          </Button>
        </form>
        <div style={{ height: 8 }}></div>
      </div>
    </>
  );
}
