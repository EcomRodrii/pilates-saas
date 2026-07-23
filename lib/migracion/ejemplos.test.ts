import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analizarDeterminista } from './clasificador.ts';
import { EJEMPLOS } from './ejemplos.ts';

// Calibración: cada export de ejemplo (formato real de competidor) DEBE
// clasificarse solo por la vía determinista — sin IA, que es como corre la
// demo pública en el navegador. Si un formato deja de reconocerse, esto casca.

// Qué entidad esperamos de cada archivo de ejemplo (por nombre).
const ESPERADO: Record<string, 'socias' | 'membresias'> = {
  'eversports_customers.csv': 'socias',
  'eversports_memberships.csv': 'membresias',
  'momence_customers.csv': 'socias',
  'momence_memberships.csv': 'membresias',
  'timp_clientes.csv': 'socias',
  'timp_bonos.csv': 'membresias',
  'nubapp_socios.csv': 'socias',
  'nubapp_abonos.csv': 'membresias',
  'mis_clientas.csv': 'socias',
};

for (const plataforma of EJEMPLOS) {
  test(`${plataforma.label}: cada archivo de ejemplo se clasifica solo (sin IA)`, () => {
    const plan = analizarDeterminista(plataforma.archivos);
    for (const a of plan.archivos) {
      const esperado = ESPERADO[a.nombre];
      assert.equal(a.entidad, esperado, `${a.nombre} debería ser ${esperado}, fue ${a.entidad}`);
      assert.equal(a.origen, 'auto', `${a.nombre} debería clasificarse sin IA`);
      // Al menos la mitad de las filas del ejemplo deben entrar limpias.
      assert.ok(a.ok >= Math.ceil(a.total / 2), `${a.nombre}: solo ${a.ok}/${a.total} válidas`);
    }
  });
}

test('Eversports: nombre/apellidos/email/teléfono/fecha de alta se mapean bien', () => {
  const plan = analizarDeterminista(
    EJEMPLOS.find(e => e.id === 'eversports')!.archivos.filter(a => a.nombre.includes('customers')),
  );
  const a = plan.archivos[0];
  const m = a.muestra[0] as Record<string, string>;
  assert.equal(m.nombre, 'María');
  assert.equal(m.apellidos, 'Soler');
  assert.equal(m.email, 'maria.soler@gmail.com');
  assert.equal(m.telefono, '+34 600 111 222');
  assert.equal(m.fechaAlta, '2023-03-14'); // ISO preservada
});

test('Timp: fecha DD/MM/AAAA europea se normaliza a ISO', () => {
  const plan = analizarDeterminista(
    EJEMPLOS.find(e => e.id === 'timp')!.archivos.filter(a => a.nombre.includes('clientes')),
  );
  const m = plan.archivos[0].muestra[0] as Record<string, string>;
  assert.equal(m.fechaAlta, '2023-03-14'); // 14/03/2023 → ISO
});

test('Excel casero: "Nombre y apellidos" combinado se reconoce como nombre; fila sin email a cuarentena', () => {
  const plan = analizarDeterminista(EJEMPLOS.find(e => e.id === 'excel')!.archivos);
  const a = plan.archivos[0];
  assert.equal(a.entidad, 'socias');
  // "Sin Email" (última fila, email vacío) no debe entrar → cuarentena visible.
  assert.ok(a.cuarentena.length >= 1);
  assert.ok(a.cuarentena.every(c => c.motivo.length > 0));
});
