// El script que activa el panel de demostración: lo carga el `<head>` solo cuando la
// pestaña lo ha pedido desde /demo (app/layout.tsx). Va en un paquete aparte, sin React,
// para que no pese en ninguna otra pantalla.
import { montar, PLANES, SUSCRIPCIONES, STUDIO_ID, STUDIO_ROW } from '../../../e2e/panel-sembrado.ts';
import { crearPagina } from './page-shim.ts';
import { leerMarca, montarGuia } from './guia.ts';
import type { PantallaPanel } from '../modelo.ts';

declare global { interface Window { __demoPanel?: { sinAtender: () => string[] } } }

/** El día de hoy en el estudio (Madrid) más `n` días, como YYYY-MM-DD. */
function dia(n: number): string {
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());
  const d = new Date(`${hoy}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Los bonos de la clienta de ejemplo (`soc-1`) en este paso. El primero es el que ya trae el estudio de ejemplo. */
function ajustarBonos(bonos: NonNullable<PantallaPanel['bonos']>) {
  bonos.forEach((b, i) => {
    const idSus = i === 0 ? 'sus-1' : `sus-demo-${i}`;
    const idPlan = i === 0 ? 'pl-bono10' : `pl-demo-${i}`;
    const fin = b.caducaEnDias === null ? null : dia(b.caducaEnDias);
    if (i > 0) {
      PLANES.push({ id: idPlan, studio_id: STUDIO_ID, nombre: b.nombre, precio: 130, tipo: 'BONO', sesiones: b.total, validez_dias: 90, activo: true });
      SUSCRIPCIONES.push({ id: idSus, studio_id: STUDIO_ID, socio_id: 'soc-1', plan_id: idPlan, estado: 'ACTIVA', fecha_inicio: dia(-30), fecha_fin: fin, sesiones_restantes: b.restantes, stripe_subscription_id: null });
      return;
    }
    const plan = PLANES.find((p) => p.id === idPlan);
    const sus = SUSCRIPCIONES.find((s) => s.id === idSus);
    if (plan) { plan.sesiones = b.total; plan.nombre = b.nombre; }
    if (sus) { sus.sesiones_restantes = b.restantes; sus.fecha_fin = fin; }
  });
}

/** Las reglas del estudio de ejemplo (columnas de `studios`), como las lee el panel en Configuración. */
function ajustarReglas(r: NonNullable<PantallaPanel['reglas']>) {
  if (r.ventanaCancelacionHoras !== undefined) STUDIO_ROW.cancelacion_ventana_horas = r.ventanaCancelacionHoras;
  if (r.devolverBonoEnTardia !== undefined) STUDIO_ROW.cancelacion_devolver_bono_tardia = r.devolverBonoEnTardia;
  if (r.recuperacionAutoSemanal !== undefined) STUDIO_ROW.recuperacion_auto_semanal = r.recuperacionAutoSemanal;
  if (r.recuperacionSoloEnLaSemana !== undefined) STUDIO_ROW.recuperacion_solo_en_la_semana = r.recuperacionSoloEnLaSemana;
}

const marca = leerMarca();
const paso = marca?.guia?.pasos[marca.guia.paso];
if (paso?.pantalla?.bonos) ajustarBonos(paso.pantalla.bonos);
if (paso?.pantalla?.reglas) ajustarReglas(paso.pantalla.reglas);

// Nada de esto sale del navegador: el panel pinta un estudio ficticio, y todo lo que
// «guarda» se queda en la memoria de esta pestaña.
const pagina = crearPagina({
  sesion: {
    access_token: 't', refresh_token: 'r', expires_at: 4102444800, expires_in: 9e8, token_type: 'bearer',
    user: { id: 'auth-e2e-duena', email: 'demo@example.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
  },
});
window.__demoPanel = { sinAtender: pagina.sinAtender };
void montar(pagina as never);
if (marca) montarGuia(marca);
