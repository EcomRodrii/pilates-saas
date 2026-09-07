import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Test ESTRUCTURAL (lee el fuente): las páginas del panel no se pueden importar
// desde el runner porque resuelven el alias `@/`. Mismo idioma que
// lib/student/cadena-rechazo-reserva.test.ts y lib/reservas/errores-rpc.test.ts.
//
// El repo tiene `components/ui/confirm-dialog.tsx` y lo usa en 22 sitios — pero
// cinco borrados se habían quedado fuera y se ejecutaban con un clic en una
// papelera, sin preguntar nada. El más grave: anular la recuperación de una
// alumna, que le quita una clase ya ganada.
//
// Un test por pantalla nombrada no cierra la familia (esa lección ya la costó
// la traducción de códigos de rechazo, dos veces). Éste fija que en estos
// ficheros NINGUNA acción de borrado se llame directamente desde un `onClick`.

const raiz = join(import.meta.dirname, '..', '..');

/** Ficheros con borrados destructivos y la acción que no debe ir suelta. */
const VIGILADOS: Array<{ fichero: string; acciones: string[] }> = [
  { fichero: 'components/socios/ficha-recuperaciones.tsx', acciones: ['anularRecuperacion'] },
  { fichero: 'app/(dashboard)/marketing/page.tsx', acciones: ['deleteCampana', 'deleteAutomatizacion'] },
  { fichero: 'app/(dashboard)/contenido/biblioteca/page.tsx', acciones: ['eliminarPublicacion'] },
  { fichero: 'app/(dashboard)/contenido/ideas/page.tsx', acciones: ['eliminarIdea'] },
];

for (const { fichero, acciones } of VIGILADOS) {
  test(`${fichero}: los borrados pasan por confirmación`, () => {
    const src = readFileSync(join(raiz, fichero), 'utf8');
    assert.match(src, /ConfirmDialog/,
      `${fichero} tiene borrados destructivos y no importa ConfirmDialog.`);
    for (const accion of acciones) {
      // Lo que se prohíbe es invocar la acción DENTRO de un onClick.
      const suelto = new RegExp(`onClick=\\{[^}]*${accion}\\(`);
      assert.doesNotMatch(src, suelto,
        `'${accion}' se llama directamente desde un onClick en ${fichero}: `
        + `un clic en la papelera borra sin preguntar. Pasa por ConfirmDialog.`);
    }
  });
}

test('nadie vuelve al confirm() nativo en el panel', () => {
  // El repo lo erradicó a propósito: no se puede estilar, no respeta el tema, y
  // algunos navegadores lo suprimen sin foco — la acción no ocurre y nadie sabe
  // por qué. Está escrito en components/ui/confirm-dialog.tsx.
  for (const { fichero } of VIGILADOS) {
    const src = readFileSync(join(raiz, fichero), 'utf8');
    assert.doesNotMatch(src, /(^|[^.\w])confirm\(/,
      `${fichero} usa el confirm() nativo; usa ConfirmDialog.`);
  }
});
