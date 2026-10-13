import type { Page, Route } from '@playwright/test';
import type { Backend } from './backend.ts';

// Las rutas de servidor (`/api/…`) que Configuración usa para GUARDAR, contestadas
// como lo haría el servidor de verdad (la forma está leída de cada ruta, no
// inventada) y apuntadas en el mismo estado que `backend.ts`. Lo que no esté aquí
// cae al andamiaje de e2e, que contesta `{}`.
//
// Cada ruta de este fichero existe porque, sin ella, la pantalla decía «no se ha
// guardado» y el vídeo enseñaba un error que en producción no pasa.

const json = (route: Route, cuerpo: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(cuerpo) });

const estudio = (b: Backend) => b.tablas.studios[0];

export async function montarApi(page: Page, backend: Backend) {
  const en = (ruta: string, fn: (route: Route, cuerpo: Record<string, unknown>) => unknown | Promise<unknown>, metodos?: string[]) =>
    page.route(u => u.pathname === ruta, async route => {
      const m = route.request().method();
      if (metodos && !metodos.includes(m)) return route.fallback();
      const cuerpo = (m === 'GET' ? {} : route.request().postDataJSON() ?? {}) as Record<string, unknown>;
      return fn(route, cuerpo);
    });

  // Datos de domiciliación: los valida y guarda el servidor, y devuelve lo normalizado.
  await en('/api/estudio/sepa', (route, c) => {
    const datos = {
      sepaAcreedorId: String(c.sepaAcreedorId ?? '').trim().toUpperCase(),
      sepaIban: String(c.sepaIban ?? '').replace(/\s+/g, '').toUpperCase(),
      sepaTitular: String(c.sepaTitular ?? '').trim(),
    };
    Object.assign(estudio(backend), { sepa_acreedor_id: datos.sepaAcreedorId, sepa_iban: datos.sepaIban, sepa_titular: datos.sepaTitular });
    backend.escrituras.push({ metodo: 'PUT', tabla: 'api/estudio/sepa', cuerpo: datos });
    return json(route, { datos });
  }, ['PUT']);

  // Ocultar la página de reservas: el GET dice cómo está y el PUT lo cambia.
  const pagina = { oculta: false, tieneClave: false };
  await en('/api/pagina-publica', (route, c) => {
    if (route.request().method() === 'GET') return json(route, pagina);
    pagina.oculta = c.oculta === true;
    if (c.clave !== undefined) pagina.tieneClave = c.clave !== '';
    return json(route, { oculta: pagina.oculta, tieneClave: pagina.tieneClave });
  }, ['GET', 'PUT']);

  // Redactar con IA (encendido de serie) y doble factor de todo el equipo (apagado de serie).
  const ajustes = { ia: true, doble: false };
  await en('/api/estudio/redaccion-ia', (route, c) => {
    if (route.request().method() === 'PUT') ajustes.ia = c.activo === true;
    return json(route, { activo: ajustes.ia });
  }, ['GET', 'PUT']);
  await en('/api/estudio/doble-factor', (route, c) => {
    if (route.request().method() === 'PUT') ajustes.doble = c.exigir === true;
    return json(route, { exigir: ajustes.doble });
  }, ['GET', 'PUT']);

  // «Mis avisos»: qué tipos le llegan a la propietaria, dentro del panel y como push.
  const prefs: Record<string, { inapp: boolean; push: boolean }> = {};
  await en('/api/notifications/preferences', (route, c) => {
    if (route.request().method() === 'PUT') {
      const cat = String(c.category ?? '');
      prefs[cat] = { inapp: c.inapp !== false, push: c.push !== false, ...(prefs[cat] ?? {}), ...(typeof c.inapp === 'boolean' ? { inapp: c.inapp } : {}), ...(typeof c.push === 'boolean' ? { push: c.push } : {}) };
      return json(route, { ok: true });
    }
    return json(route, { prefs });
  }, ['GET', 'PUT']);

  // Claves de la API para la contabilidad: sin activar en el estudio de ejemplo.
  await en('/api/integrations/api-publica/claves', route => json(route, { activada: false, permitidos: [], claves: [], sedesCadena: null }), ['GET']);

  // Cerrar el centro: la ruta de servidor cuenta lo que hizo, y el cierre queda en la lista.
  await en('/api/cierres', (route, c) => {
    const desde = String(c.desde ?? ''), hasta = String(c.hasta ?? '');
    const dias = Math.round((Date.parse(hasta) - Date.parse(desde)) / 86_400_000) + 1;
    backend.tablas.cierres_estudio.push({ id: `cierre-demo-${backend.tablas.cierres_estudio.length + 1}`, studio_id: 'studio-test', desde, hasta, motivo: String(c.motivo ?? '') || null });
    return json(route, { dias, clasesCanceladas: 0, bonosAmpliados: 0, incidencias: [] });
  }, ['POST']);

  // Vista previa del correo: una muestra con datos de ejemplo, con el saludo que se escribe.
  await en('/api/plantillas-email/preview', (route, c) => {
    const saludo = String(c.intro ?? '').trim() || 'Hola, Ana. Tu plaza está confirmada.';
    const html = `<body style="margin:0;background:#f4f1ea;font-family:system-ui,sans-serif"><div style="max-width:520px;margin:0 auto;background:#fff">
      <div style="background:#343825;color:#fff;padding:22px 28px;font-size:20px;font-weight:600">Estudio Aurora</div>
      <div style="padding:28px"><p style="margin:0 0 16px;font-size:16px;line-height:1.5">${saludo.replace(/</g, '&lt;')}</p>
      <p style="margin:0 0 6px;color:#555">Clase</p><p style="margin:0 0 14px;font-weight:600">Reformer</p>
      <p style="margin:0 0 6px;color:#555">Cuándo</p><p style="margin:0 0 14px;font-weight:600">jueves a las 18:30</p>
      <p style="margin:24px 0 0;color:#777;font-size:13px">Si no puedes venir, cancela desde tu app con tiempo.</p></div></div></body>`;
    return json(route, { html, subject: 'Reserva confirmada — Reformer' });
  }, ['POST']);
}
