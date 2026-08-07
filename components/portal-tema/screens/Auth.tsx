"use client";

import { useState } from "react";
import { Icon } from "@/components/portal-tema/components/ui/Icon";
import { Button, Checkbox, Field, Input, InputGroup, Notice, Select } from "@/components/portal-tema/components/ui/primitives";
import { StatusBar } from "@/components/portal-tema/components/layout/chrome";
import { useActions } from "@/components/portal-tema/store/PortalStore";
import type { ViewModel } from "@/components/portal-tema/store/useViewModel";

function TopBack({ onBack }: { onBack: () => void }) {
  return (
    <div className="topbar" style={{ paddingLeft: 0, paddingRight: 0 }}>
      <button className="icon-btn is-pressable" onClick={onBack} aria-label="Atrás">
        <Icon name="back" stroke={1.9} />
      </button>
    </div>
  );
}

/** Acceso. Campos con sus estados y enlace a registro. */
export function Login({ vm }: { vm: ViewModel }) {
  const actions = useActions();
  const [email, setEmail] = useState("laura@ejemplo.com");
  const [password, setPassword] = useState("········");
  const [keep, setKeep] = useState(true);

  return (
    <>
      <StatusBar />
      <div className="auth">
        <TopBack onBack={() => actions.goto("welcome")} />

        <div className="auth__head">
          <h1 className="auth__title">Entra en tu portal</h1>
          <p className="auth__text">Tus reservas, tu bono y tus clases guardadas, en un sitio.</p>
        </div>

        <form className="auth__form" onSubmit={(e) => e.preventDefault()}>
          <Field label="Correo" htmlFor="email">
            <InputGroup icon="person">
              <Input id="email" type="email" value={email} autoComplete="email" onChange={(e) => setEmail(e.target.value)} />
            </InputGroup>
          </Field>

          <Field label="Contraseña" htmlFor="pass" hint="Mínimo 8 caracteres.">
            <Input id="pass" type="password" value={password} autoComplete="current-password" onChange={(e) => setPassword(e.target.value)} />
          </Field>

          <Checkbox checked={keep} onChange={setKeep}>Mantener la sesión abierta</Checkbox>
        </form>

        <div className="auth__actions">
          <Button block size="lg" loading={vm.auth.working} onClick={actions.authSubmit}>
            <span>{vm.auth.working ? "Entrando…" : "Entrar"}</span>
          </Button>
          <Button variant="ghost" block pressable={false} onClick={() => actions.goto("registro")}>
            Crear una cuenta
          </Button>
        </div>

        <div className="auth__divider">o</div>

        <Notice>Si el estudio te ha invitado por correo, entra con ese enlace y la cuenta se crea sola.</Notice>

        <p className="auth__foot">
          ¿Olvidaste la contraseña? <button onClick={actions.alerts}>Te enviamos un enlace</button>
        </p>
      </div>
    </>
  );
}

/** Registro. Tres pasos, el primero completo. */
export function Register() {
  const actions = useActions();
  const [form, setForm] = useState({ nombre: "Laura", apellido: "Ortega", tel: "", email: "laura@", nivel: "He hecho algo de suelo" });
  const [terms, setTerms] = useState(false);
  const emailError = form.email.includes("@") && form.email.split("@")[1] ? undefined : "Ese correo está incompleto.";

  const change = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <>
      <StatusBar />
      <div className="auth">
        <TopBack onBack={() => actions.goto("login")} />

        <div className="auth__head">
          <h1 className="auth__title">Crea tu cuenta</h1>
          <p className="auth__text">Dos minutos y ya puedes reservar tu primera clase.</p>
          <div className="steps">
            <i className="step is-done"></i><i className="step"></i><i className="step"></i>
          </div>
        </div>

        <form className="auth__form" onSubmit={(e) => e.preventDefault()}>
          <div className="form-grid form-grid--2">
            <Field label="Nombre" htmlFor="nombre">
              <Input id="nombre" value={form.nombre} onChange={change("nombre")} />
            </Field>
            <Field label="Apellidos" htmlFor="apellido">
              <Input id="apellido" value={form.apellido} onChange={change("apellido")} />
            </Field>
          </div>

          <Field label="Teléfono" htmlFor="tel" hint="Solo lo usamos para avisos de clase.">
            <Input id="tel" type="tel" placeholder="600 000 000" value={form.tel} onChange={change("tel")} />
          </Field>

          <Field label="Correo" htmlFor="email2" error={emailError}>
            <Input id="email2" type="email" value={form.email} aria-invalid={!!emailError} onChange={change("email")} />
          </Field>

          <Field label="Nivel" htmlFor="nivel">
            <Select id="nivel" value={form.nivel} onChange={change("nivel")}>
              <option>Nunca he hecho Pilates</option>
              <option>He hecho algo de suelo</option>
              <option>Tengo experiencia en reformer</option>
            </Select>
          </Field>

          <Checkbox checked={terms} onChange={setTerms}>
            Acepto las condiciones del estudio
            <small>Cancelación gratis hasta 6 horas antes de la clase.</small>
          </Checkbox>
        </form>

        <div className="auth__actions">
          <Button block size="lg" onClick={actions.authSubmit}>Continuar</Button>
          <Button variant="ghost" block disabled>Saltar por ahora</Button>
        </div>

        <p className="auth__foot">
          ¿Ya tienes cuenta? <button onClick={() => actions.goto("login")}>Entrar</button>
        </p>
      </div>
    </>
  );
}
