"use client";

import { Button, Card, SectionTitle, Switch } from "@/components/portal-tema/components/ui/primitives";
import { CuentaFilas } from "@/components/portal-tema/components/blocks/CuentaFilas";
import { Island, StatusBar } from "@/components/portal-tema/components/layout/chrome";
import { useCountUp } from "@/components/portal-tema/hooks/motion";
import { useActions } from "@/components/portal-tema/store/PortalStore";
import type { ViewModel } from "@/components/portal-tema/store/useViewModel";
import { ProfileTentada } from "@/components/portal-tema/screens/Profile.tentada";
import { ProfileSereno } from "@/components/portal-tema/screens/Profile.sereno";

function Metric({ value, label }: { value: number; label: string }) {
  const shown = useCountUp(value);
  return (
    <div className="metric">
      <p className="metric__value">{shown}</p>
      <p className="metric__label">{label}</p>
    </div>
  );
}

/** Perfil: bono, avisos y cifras del mes. */
export function Profile({ vm }: { vm: ViewModel }) {
  // Tentada trae su propia forma (cabecera verde y filas), y con «Aspecto» y
  // el estado SEPA que el prototipo no tiene pero el perfil de la socia sí.
  if (vm.features.profile_style === "header") return <ProfileTentada vm={vm} />;
  // Sereno: cabecera con avatar y correo, tres cifras y opciones en fichas.
  if (vm.features.profile_style === "fichas") return <ProfileSereno vm={vm} />;
  return <ProfileKit vm={vm} />;
}

function ProfileKit({ vm }: { vm: ViewModel }) {
  const actions = useActions();
  return (
    <>
      <Island />
      <StatusBar />
      <div className="canvas no-scrollbar">
        <h1 className="screen-title">Perfil</h1>

        <Card className="pass">
          <p className="pass__name">{vm.pass.name}</p>
          <div className="pass__row">
            <span className="pass__number">{vm.pass.left}</span>
            <span className="pass__note">clases disponibles<br />caduca el {vm.pass.expires}</span>
          </div>
          <div className="pass__bar">
            <span className="pass__fill" style={{ "--pct": vm.pass.percent + "%" } as React.CSSProperties}></span>
          </div>
          <Button block style={{ marginTop: 20, height: 54 }} onClick={() => actions.goto("bonos")}>
            Comprar otro bono
          </Button>
        </Card>

        <section>
          <SectionTitle>Avisos</SectionTitle>
          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            {vm.notifications.map((item) => (
              <button
                key={item.key}
                className="card setting"
                role="switch"
                aria-checked={item.on}
                onClick={() => actions.toggleNotification(item.key)}
              >
                <span className="setting__body">
                  <span className="setting__label">{item.label}</span>
                  <span className="setting__note">{item.note}</span>
                </span>
                <Switch on={item.on} />
              </button>
            ))}
          </div>
        </section>

        <section>
          <SectionTitle>Este mes</SectionTitle>
          <div className="metrics">
            {vm.metrics.map((m) => <Metric key={m.label} value={m.value} label={m.label} />)}
          </div>
        </section>

        {/* ⚠️ Aquí había una TABLA DE HISTORIAL ESCRITA A MANO en el JSX
            —«Pilates Reformer · Mié 3 · Asistida», «Reformer fuerza · Vie 29 ·
            No asistida»— que veía CADA socia de un estudio con este tema, como
            si fueran sus clases. Datos inventados en producción.

            Ahora es una fila que lleva al historial de verdad, con lo que esa
            socia hizo. */}
        <section>
          <SectionTitle>Mi cuenta</SectionTitle>
          <Card className="filas">
            <CuentaFilas vm={vm} />
          </Card>
        </section>

        {/* Cerrar sesión FALTABA en este tema. No es un detalle: sin ella, una
            socia que entra desde un móvil prestado no tiene forma de salir. */}
        <Button block variant="ghost" style={{ marginTop: 18 }} onClick={actions.logout}>
          Cerrar sesión
        </Button>
        <div style={{ height: 8 }}></div>
      </div>
    </>
  );
}
