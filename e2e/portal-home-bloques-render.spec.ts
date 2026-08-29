import { test, expect } from '@playwright/test';
import { montarPortal, SLUG } from './portal-mock';

// ─────────────────────────────────────────────────────────────────────────────
// Fase 3 del editor de temas: constructor de bloques del Inicio del portal.
// Verifica el lado de CONSUMO de los bloques NUEVOS (banner/texto/cta/faq) —
// el lado del editor se verifica en e2e/apariencia-inicio-portal.spec.ts, y el
// legacy (portalHome) en e2e/portal-home-modulos.spec.ts.
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Inicio del portal — bloques del catálogo (banner/texto/cta/faq)', () => {
  test('un bloque de texto se pinta con su título y contenido', async ({ page }) => {
    await montarPortal(page, {
      conSesion: true,
      homeBloques: [
        { id: 'sistema-estaSemana', kind: 'sistema', sistemaId: 'estaSemana' },
        { id: 'b-texto', kind: 'texto', config: { titulo: 'Horario de verano', texto: 'Cerramos los sábados de julio y agosto.' } },
      ],
    });
    await page.goto(`/portal/${SLUG}/home`);

    await expect(page.getByRole('heading', { name: '¿Qué te apetece hoy?' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Horario de verano')).toBeVisible();
    await expect(page.getByText('Cerramos los sábados de julio y agosto.')).toBeVisible();
  });

  test('un bloque CTA con enlace externo inseguro (javascript:) no se pinta', async ({ page }) => {
    await montarPortal(page, {
      conSesion: true,
      homeBloques: [
        { id: 'sistema-estaSemana', kind: 'sistema', sistemaId: 'estaSemana' },
        { id: 'b-cta', kind: 'cta', config: { titulo: 'Síguenos', textoBoton: 'Ir', href: 'javascript:alert(1)' } },
      ],
    });
    await page.goto(`/portal/${SLUG}/home`);

    await expect(page.getByRole('heading', { name: '¿Qué te apetece hoy?' })).toBeVisible({ timeout: 30_000 });
    // El título del CTA es el marcador fiable de que el bloque se pintó — "Ir"
    // (el texto del botón) es demasiado genérico, ya aparece en otro sitio de
    // la pantalla sin relación con este bloque.
    await expect(page.getByText('Síguenos')).toHaveCount(0);
  });

  test('un bloque CTA con enlace interno válido se pinta y enlaza dentro del portal', async ({ page }) => {
    await montarPortal(page, {
      conSesion: true,
      homeBloques: [
        { id: 'sistema-estaSemana', kind: 'sistema', sistemaId: 'estaSemana' },
        { id: 'b-cta', kind: 'cta', config: { titulo: 'Trae a una amiga', textoBoton: 'Invitar', href: '/invitar' } },
      ],
    });
    await page.goto(`/portal/${SLUG}/home`);

    await expect(page.getByRole('heading', { name: '¿Qué te apetece hoy?' })).toBeVisible({ timeout: 30_000 });
    const boton = page.getByRole('link', { name: 'Invitar' });
    await expect(boton).toBeVisible();
    await expect(boton).toHaveAttribute('href', `/portal/${SLUG}/invitar`);
  });

  test('un bloque FAQ despliega la respuesta al pulsar la pregunta', async ({ page }) => {
    await montarPortal(page, {
      conSesion: true,
      homeBloques: [
        { id: 'sistema-estaSemana', kind: 'sistema', sistemaId: 'estaSemana' },
        { id: 'b-faq', kind: 'faq', config: { titulo: 'Preguntas', preguntas: [{ pregunta: '¿Hay parking?', respuesta: 'Sí, gratuito.' }] } },
      ],
    });
    await page.goto(`/portal/${SLUG}/home`);

    await expect(page.getByRole('heading', { name: '¿Qué te apetece hoy?' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('¿Hay parking?')).toBeVisible();
    await expect(page.getByText('Sí, gratuito.')).not.toBeVisible();
    await page.getByText('¿Hay parking?').click();
    await expect(page.getByText('Sí, gratuito.')).toBeVisible();
  });

  test('un bloque oculto no se pinta', async ({ page }) => {
    await montarPortal(page, {
      conSesion: true,
      homeBloques: [
        { id: 'sistema-estaSemana', kind: 'sistema', sistemaId: 'estaSemana' },
        { id: 'b-texto', kind: 'texto', config: { titulo: 'No debería verse', texto: 'x' }, oculto: true },
      ],
    });
    await page.goto(`/portal/${SLUG}/home`);

    await expect(page.getByRole('heading', { name: '¿Qué te apetece hoy?' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('No debería verse')).toHaveCount(0);
  });

  // La regresión que motivó el registro de render + la lectura tolerante.
  // Antes, `BloqueHomeRender` acababa en un `return <TestimoniosBloque>` SIN
  // guarda: un `kind` que el código no conoce —una fila escrita por una
  // versión más nueva, un jsonb tocado a mano, un rollback del deploy— leía
  // `config.testimonios.map` de una config que no lo tiene y tumbaba la
  // pantalla ENTERA. No era un bloque roto: era la socia sin sus clases ni su
  // bono.
  //
  // Este caso no se puede escribir como test unitario: el tipo `BloqueHome`
  // impide construirlo en TS, y justo la gracia es que llega de jsonb, donde
  // no hay tipos que valgan. Por eso vive aquí, inyectándolo por la red
  // mockeada como llegaría de verdad.
  test('un bloque con un kind desconocido se ignora y NO tumba el resto de la pantalla', async ({ page }) => {
    const errores: string[] = [];
    page.on('pageerror', (e) => errores.push(e.message));

    await montarPortal(page, {
      conSesion: true,
      homeBloques: [
        { id: 'sistema-estaSemana', kind: 'sistema', sistemaId: 'estaSemana' },
        { id: 'b-futuro', kind: 'carruselDelFuturo', config: { loQueSea: [1, 2, 3] } },
        { id: 'b-texto', kind: 'texto', config: { titulo: 'Esto sí se ve', texto: 'y el saludo también' } },
      ] as never,
    });
    await page.goto(`/portal/${SLUG}/home`);

    // El saludo (bloque sistema) y el bloque bueno que va DESPUÉS del raro
    // siguen ahí: el desconocido se descarta él solo.
    await expect(page.getByRole('heading', { name: '¿Qué te apetece hoy?' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Esto sí se ve')).toBeVisible();
    expect(errores).toEqual([]);
  });
});

// ── El grupo, en el portal de la socia ─────────────────────────────────────
test('un Grupo en fila pinta a sus dos hijos, lado a lado', async ({ page }) => {
  await montarPortal(page, {
    conSesion: true,
    homeBloques: [
      { id: 'g1', kind: 'contenedor', config: { titulo: 'Lo nuestro', direccion: 'fila', separacion: 'normal', reparto: 'iguales' },
        hijos: [
          // ⚠️ Textos que no sean substring de nada más de la pantalla: con
          // "Una"/"Dos" el locator encontraba tres coincidencias.
          { id: 'h1', kind: 'texto', config: { titulo: 'Izquierda', texto: 'Zurdo del grupo' } },
          { id: 'h2', kind: 'texto', config: { titulo: 'Derecha', texto: 'Diestro del grupo' } },
        ] },
    ] as never,
  });
  await page.goto(`/portal/${SLUG}/home`);
  await expect(page.getByText('Lo nuestro')).toBeVisible({ timeout: 30_000 });
  const uno = await page.getByText('Zurdo del grupo').boundingBox();
  const dos = await page.getByText('Diestro del grupo').boundingBox();
  // En fila de verdad: el segundo empieza a la derecha del primero, no debajo.
  expect(dos!.x).toBeGreaterThan(uno!.x + uno!.width - 1);
  expect(Math.abs(dos!.y - uno!.y)).toBeLessThan(4);
});

test('un Grupo VACÍO no deja un hueco en el portal', async ({ page }) => {
  await montarPortal(page, {
    conSesion: true,
    homeBloques: [
      { id: 'g0', kind: 'contenedor', config: { titulo: 'No debería verse', direccion: 'columna', separacion: 'normal', reparto: 'iguales' }, hijos: [] },
    ] as never,
  });
  await page.goto(`/portal/${SLUG}/home`);
  await expect(page.getByRole('navigation', { name: 'Secciones' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('No debería verse')).toHaveCount(0);
});

// ── Etapa 6: el texto no puede quedarse ilegible sobre un fondo propio ─────
test('un bloque con fondo OSCURO escribe en claro, sin que nadie se lo diga', async ({ page }) => {
  // El agujero que cierra esta etapa: `EstiloBloque.fondo` deja poner
  // cualquier color, y el texto se quedaba con el del tema (oscuro).
  await montarPortal(page, {
    conSesion: true,
    homeBloques: [
      { id: 't1', kind: 'texto', config: { titulo: 'Sobre oscuro', texto: 'Cuerpo del bloque' },
        estilo: { fondo: '#1E2B22' } },
    ] as never,
  });
  await page.goto(`/portal/${SLUG}/home`);
  const titulo = page.getByText('Sobre oscuro');
  await expect(titulo).toBeVisible({ timeout: 30_000 });

  const { color, fondo } = await titulo.evaluate((e) => {
    const s = getComputedStyle(e);
    const caja = (e.closest('[style*="background"]') as HTMLElement) ?? e;
    return { color: s.color, fondo: getComputedStyle(caja).backgroundColor };
  });
  // Se mide el CONTRASTE real, no un color concreto: lo que importa es que se
  // lea, no qué hex salió.
  const lum = (c: string) => {
    const [r, g, b] = c.match(/\d+/g)!.slice(0, 3).map(Number) as [number, number, number];
    const f = (v: number) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const a = lum(color), b = lum(fondo);
  const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  expect(ratio).toBeGreaterThanOrEqual(4.5);
});

test('con fondo CLARO el bloque conserva el color del tema, no salta a negro', async ({ page }) => {
  // Si esto fallara, la etapa se notaría donde no debe: cualquier fondo suave
  // perdería el carácter del tema.
  // ⚠️ Comparativo y no absoluto: `t.ink` es la tinta del PORTAL, no el
  // `text` del tema (asumirlo me dio un falso rojo). Lo que hay que sostener
  // es que un fondo claro NO cambia el color respecto a no tener fondo. No
  // hace falta un `tema` con paleta propia para esto — el `text` de
  // `DEFAULT_THEME` (`#1A1A1A`) ya es distinguible de un negro puro, que es
  // justo lo que haría saltar la regresión. (Antes usaba `tema: 'oliva'`,
  // retirado con el resto del kit de temas en el PR 2 de "borrar temas del
  // kit" — `getThemeDefinition('oliva')` ya no existe.)
  await montarPortal(page, {
    conSesion: true,
    homeBloques: [
      { id: 't2', kind: 'texto', config: { titulo: 'Sobre claro', texto: '' }, estilo: { fondo: '#F5F3ED' } },
      { id: 't3', kind: 'texto', config: { titulo: 'Sin fondo', texto: '' } },
    ] as never,
  });
  await page.goto(`/portal/${SLUG}/home`);
  const conFondo = page.getByText('Sobre claro');
  await expect(conFondo).toBeVisible({ timeout: 30_000 });
  const esperado = await page.getByText('Sin fondo').evaluate((e) => getComputedStyle(e).color);
  await expect(conFondo).toHaveCSS('color', esperado);
});
