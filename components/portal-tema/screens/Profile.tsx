"use client";

import { Button, Card, SectionTitle, Status, Switch } from "@/components/portal-tema/components/ui/primitives";
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

        <section>
          <SectionTitle>Historial</SectionTitle>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Clase</th><th>Día</th><th className="is-numeric">Estado</th></tr>
              </thead>
              <tbody>
                <tr>
                  <td className="table__name">Pilates Reformer</td><td>Mié 3</td>
                  <td className="is-numeric"><Status tone="success">Asistida</Status></td>
                </tr>
                <tr>
                  <td className="table__name">Pilates de suelo</td><td>Lun 1</td>
                  <td className="is-numeric"><Status tone="success">Asistida</Status></td>
                </tr>
                <tr>
                  <td className="table__name">Reformer fuerza</td><td>Vie 29</td>
                  <td className="is-numeric"><Status tone="error">No asistida</Status></td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
        <div style={{ height: 8 }}></div>
      </div>
    </>
  );
}
