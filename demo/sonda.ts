import { join } from 'node:path';
import { SALIDA, grabarCapitulo } from './nucleo.ts';
import { TABLAS_DEMO } from './datos.ts';

// Herramienta de desarrollo: abre una pantalla, pulsa lo que se le diga (por texto
// del botón) y lista los controles del cuadro abierto y una foto.
//   node --experimental-strip-types demo/sonda.ts "configuracion?tab=estudio&abrir=salas" "Nueva sala" …
process.env.DEMO_RAPIDO = '1';
const [ruta, ...clics] = process.argv.slice(2);
await grabarCapitulo({ id: 'sonda', titulo: 'sonda', tablas: structuredClone(TABLAS_DEMO) }, async g => {
  await g.visita(ruta);
  for (const c of clics) {
    if (c.startsWith('fill:')) { const [l, v] = c.slice(5).split('='); await g.page.getByLabel(l).first().fill(v); await g.page.waitForTimeout(300); continue; }
    if (c.startsWith('fila:')) { await g.page.locator('#' + c.slice(5)).click(); await g.page.waitForTimeout(800); continue; }
    await g.page.getByRole('button', { name: c }).or(g.page.getByRole('link', { name: c })).first().click();
    await g.page.waitForTimeout(700);
  }
  const raiz = (await g.page.getByRole('dialog').count()) ? g.page.getByRole('dialog').last() : g.page.locator('main, body').first();
  const lista = await raiz.evaluate(el => [...el.querySelectorAll('input,select,textarea,[role=switch],[role=radio],[role=combobox],[role=tab],button,summary')].filter(c => (c as HTMLElement).offsetParent !== null).map(c => {
    const e = c as HTMLInputElement;
    const lab = e.getAttribute('aria-label') || (e.id && el.querySelector(`label[for="${e.id}"]`)?.textContent) || e.closest('label')?.textContent || e.textContent || e.placeholder || '';
    return `${c.tagName.toLowerCase()}${e.type ? ':' + e.type : ''}${c.getAttribute('role') ? '/' + c.getAttribute('role') : ''} «${(lab || '').trim().replace(/\s+/g, ' ').slice(0, 80)}»${e.value && e.tagName !== 'BUTTON' ? ' =' + String(e.value).slice(0, 20) : ''}`;
  }));
  console.log(lista.join('\n'));
  await g.page.screenshot({ path: join(SALIDA, 'sonda.png'), fullPage: false });
}, `http://localhost:${process.env.E2E_PORT ?? '3411'}`);
