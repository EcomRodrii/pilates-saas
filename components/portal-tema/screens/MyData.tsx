"use client";

import { useState } from "react";
import { Icon } from "@/components/portal-tema/components/ui/Icon";
import { Button, Field, Input } from "@/components/portal-tema/components/ui/primitives";
import { StatusBar } from "@/components/portal-tema/components/layout/chrome";
import { useActions, usePortal } from "@/components/portal-tema/store/PortalStore";
import type { ViewModel } from "@/components/portal-tema/store/useViewModel";

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
 */
export function MyData({ vm }: { vm: ViewModel }) {
  const actions = useActions();
  const { loading } = usePortal();
  const s = vm.profile;
  const [form, setForm] = useState({
    nombre: s.short, apellidos: s.apellidos, email: s.email,
    telefono: s.telefono, fechaNacimiento: s.fechaNacimiento, direccion: s.direccion,
  });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

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

        <form className="form-grid scroller no-scrollbar" onSubmit={(e) => { e.preventDefault(); actions.guardarDatos(form); }}>
          <Field label="Nombre" htmlFor="nombre">
            <Input id="nombre" autoComplete="given-name" value={form.nombre} onChange={set("nombre")} />
          </Field>
          <Field label="Apellidos" htmlFor="apellidos">
            <Input id="apellidos" autoComplete="family-name" value={form.apellidos} onChange={set("apellidos")} />
          </Field>
          <Field label="Email" htmlFor="email">
            <Input id="email" type="email" autoComplete="email" value={form.email} onChange={set("email")} />
          </Field>
          <Field label="Teléfono" htmlFor="tel">
            <Input id="tel" type="tel" inputMode="tel" autoComplete="tel" placeholder="+34 600 000 000"
              value={form.telefono} onChange={set("telefono")} />
          </Field>
          <Field label="Fecha de nacimiento" htmlFor="nac">
            <Input id="nac" type="date" value={form.fechaNacimiento} onChange={set("fechaNacimiento")} />
          </Field>
          <Field label="Dirección" htmlFor="dir">
            <Input id="dir" autoComplete="street-address" placeholder="Calle, número, ciudad"
              value={form.direccion} onChange={set("direccion")} />
          </Field>
        </form>

        <Button block size="lg" loading={loading} onClick={() => actions.guardarDatos(form)}>
          Guardar cambios
        </Button>
        <div style={{ height: 8 }}></div>
      </div>
    </>
  );
}
