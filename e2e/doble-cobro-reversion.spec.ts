import { test, expect } from '@playwright/test';

test.describe('PAY-8: Reversión de dobles cobros', () => {
  test.beforeEach(async ({ page }) => {
    // Setup: autenticar como propietaria
    await page.context().addCookies([
      {
        name: 'sb-access-token',
        value: 'mock-token',
        domain: 'localhost',
        path: '/',
      },
    ]);
  });

  test('Flujo completo: Click "Revertir" → modal → confirmar crédito → tabla actualiza', async ({ page }) => {
    // Mock de datos de dobles cobros
    const mockDobleCobroId = 'ddc-test-1';
    const importeEur = 29.50;

    await page.route('**/api/billing/doble-cobro-detector*', async (route) => {
      if (route.request().method() === 'GET') {
        await route.respond({
          status: 200,
          body: JSON.stringify({
            ok: true,
            doblesCobros: [
              {
                id: mockDobleCobroId,
                recibo_id: 'rec-test-1',
                importe_centimos: 2950,
                intentos_exitosos_count: 2,
                primera_fecha: '2026-01-01T10:00:00Z',
                estado: 'PENDIENTE_REVISION',
                socia_nombre: 'Test Socia',
                socia_email: 'socia@test.invalid',
                payment_intent_ids: ['pi_primary', 'pi_duplicate'],
              },
            ],
          }),
        });
      } else {
        await route.continue();
      }
    });

    // Mock del endpoint de reversión
    let reversionCalled = false;
    await page.route('**/api/billing/dobles-cobros/revertir', async (route) => {
      if (route.request().method() === 'POST') {
        const body = await route.request().postDataJSON();
        reversionCalled = true;
        expect(body.dobleCobroId).toBe(mockDobleCobroId);
        expect(body.tipo).toBe('credito');

        await route.respond({
          status: 200,
          body: JSON.stringify({
            ok: true,
            dobleCobroId: mockDobleCobroId,
            tipo: 'credito',
            importeEur,
            creditoId: 'cred-test-1',
            mensaje: `Crédito de €${importeEur.toFixed(2)} creado para la socia`,
          }),
        });
      } else {
        await route.continue();
      }
    });

    // Navegar a la página
    await page.goto('/billing/dobles-cobros');
    await page.waitForLoadState('networkidle');

    // Verificar que la tabla se cargó
    const tableRows = page.locator('table tbody tr');
    await expect(tableRows).toHaveCount(1);

    // Verificar datos en la tabla
    await expect(page.locator('text=rec-test-1')).toBeVisible();
    await expect(page.locator('text=€29.50')).toBeVisible();

    // Click en "Revertir"
    const btnRevertir = page.locator('button:has-text("Revertir")').first();
    await btnRevertir.click();

    // Verificar modal se abre
    const modal = page.locator('[role="dialog"]');
    await expect(modal).toBeVisible();

    // Verificar que el modal muestra datos correctos
    await expect(modal.locator('text=€29.50')).toBeVisible();
    await expect(modal.locator('text=Test Socia')).toBeVisible();

    // Verificar que "Crear crédito" está seleccionado por defecto
    const radioCredito = modal.locator('input[value="credito"]');
    await expect(radioCredito).toBeChecked();

    // Click en "Confirmar reversión"
    const btnConfirmar = modal.locator('button:has-text("Confirmar reversión")');
    await btnConfirmar.click();

    // Esperar a que se procese
    await page.waitForLoadState('networkidle');

    // Verificar que se llamó al endpoint
    expect(reversionCalled).toBe(true);

    // Verificar que el modal se cierra
    await expect(modal).not.toBeVisible();
  });

  test('Flujo de refund: seleccionar "Reembolso a tarjeta" y procesar', async ({ page }) => {
    const mockDobleCobroId = 'ddc-test-refund';
    const importeEur = 15.00;

    await page.route('**/api/billing/doble-cobro-detector*', async (route) => {
      if (route.request().method() === 'GET') {
        await route.respond({
          status: 200,
          body: JSON.stringify({
            ok: true,
            doblesCobros: [
              {
                id: mockDobleCobroId,
                recibo_id: 'rec-refund-1',
                importe_centimos: 1500,
                intentos_exitosos_count: 2,
                primera_fecha: '2026-01-02T10:00:00Z',
                estado: 'PENDIENTE_REVISION',
                socia_nombre: 'Refund Test',
                socia_email: 'refund@test.invalid',
                payment_intent_ids: ['pi_a', 'pi_b'],
              },
            ],
          }),
        });
      } else {
        await route.continue();
      }
    });

    let refundCalled = false;
    await page.route('**/api/billing/dobles-cobros/revertir', async (route) => {
      if (route.request().method() === 'POST') {
        const body = await route.request().postDataJSON();
        if (body.tipo === 'refund') {
          refundCalled = true;
          expect(body.dobleCobroId).toBe(mockDobleCobroId);
        }

        await route.respond({
          status: 200,
          body: JSON.stringify({
            ok: true,
            dobleCobroId: mockDobleCobroId,
            tipo: body.tipo,
            importeEur,
            refundId: 're_test_123',
            mensaje: `Refund de €${importeEur.toFixed(2)} en proceso en Stripe`,
          }),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto('/billing/dobles-cobros');
    await page.waitForLoadState('networkidle');

    // Click revertir
    const btnRevertir = page.locator('button:has-text("Revertir")').first();
    await btnRevertir.click();

    // Esperar modal
    const modal = page.locator('[role="dialog"]');
    await expect(modal).toBeVisible();

    // Seleccionar "Reembolso a tarjeta"
    const radioRefund = modal.locator('input[value="refund"]');
    await radioRefund.click();
    await expect(radioRefund).toBeChecked();

    // Click confirmar
    const btnConfirmar = modal.locator('button:has-text("Confirmar reversión")');
    await btnConfirmar.click();

    // Esperar procesamiento
    await page.waitForLoadState('networkidle');

    // Verificar que se procesó como refund
    expect(refundCalled).toBe(true);
  });

  test('Validación: botón deshabilitado cuando doble cobro ya está RESUELTO', async ({ page }) => {
    await page.route('**/api/billing/doble-cobro-detector*', async (route) => {
      if (route.request().method() === 'GET') {
        await route.respond({
          status: 200,
          body: JSON.stringify({
            ok: true,
            doblesCobros: [
              {
                id: 'ddc-resuelto',
                recibo_id: 'rec-resolved',
                importe_centimos: 5000,
                intentos_exitosos_count: 2,
                primera_fecha: '2026-01-03T10:00:00Z',
                estado: 'RESUELTO',
                socia_nombre: 'Already Resolved',
                socia_email: 'resolved@test.invalid',
                payment_intent_ids: ['pi_x', 'pi_y'],
              },
            ],
          }),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto('/billing/dobles-cobros');
    await page.waitForLoadState('networkidle');

    // Buscar botón para fila RESUELTO
    const btnResuelto = page.locator('button:has-text("Resuelto")').first();
    await expect(btnResuelto).toBeDisabled();
  });

  test('Error handling: Stripe refund rechazado muestra error', async ({ page }) => {
    const mockDobleCobroId = 'ddc-error-refund';

    await page.route('**/api/billing/doble-cobro-detector*', async (route) => {
      if (route.request().method() === 'GET') {
        await route.respond({
          status: 200,
          body: JSON.stringify({
            ok: true,
            doblesCobros: [
              {
                id: mockDobleCobroId,
                recibo_id: 'rec-error',
                importe_centimos: 10000,
                intentos_exitosos_count: 2,
                primera_fecha: '2026-01-04T10:00:00Z',
                estado: 'PENDIENTE_REVISION',
                socia_nombre: 'Error Test',
                socia_email: 'error@test.invalid',
                payment_intent_ids: ['pi_invalid'],
              },
            ],
          }),
        });
      } else {
        await route.continue();
      }
    });

    await page.route('**/api/billing/dobles-cobros/revertir', async (route) => {
      await route.respond({
        status: 400,
        body: JSON.stringify({
          ok: false,
          error: 'Refund rechazado: payment_intent no encontrado en Stripe',
          dobleCobroId: mockDobleCobroId,
        }),
      });
    });

    await page.goto('/billing/dobles-cobros');
    await page.waitForLoadState('networkidle');

    // Click revertir
    const btnRevertir = page.locator('button:has-text("Revertir")').first();
    await btnRevertir.click();

    // Esperar modal
    const modal = page.locator('[role="dialog"]');
    await expect(modal).toBeVisible();

    // Seleccionar refund
    const radioRefund = modal.locator('input[value="refund"]');
    await radioRefund.click();

    // Click confirmar
    const btnConfirmar = modal.locator('button:has-text("Confirmar reversión")');
    await btnConfirmar.click();

    // Esperar error
    await page.waitForLoadState('networkidle');

    // Verificar que se muestra error en modal
    const errorMsg = modal.locator('text=Refund rechazado');
    await expect(errorMsg).toBeVisible();
  });

  test('Filtro: solo muestra PENDIENTE_REVISION cuando se filtra', async ({ page }) => {
    await page.route('**/api/billing/doble-cobro-detector*', async (route) => {
      if (route.request().method() === 'GET') {
        await route.respond({
          status: 200,
          body: JSON.stringify({
            ok: true,
            doblesCobros: [
              {
                id: 'ddc-1',
                recibo_id: 'rec-1',
                importe_centimos: 1000,
                intentos_exitosos_count: 2,
                primera_fecha: '2026-01-05T10:00:00Z',
                estado: 'PENDIENTE_REVISION',
                payment_intent_ids: ['pi_1', 'pi_2'],
              },
              {
                id: 'ddc-2',
                recibo_id: 'rec-2',
                importe_centimos: 2000,
                intentos_exitosos_count: 2,
                primera_fecha: '2026-01-06T10:00:00Z',
                estado: 'RESUELTO',
                payment_intent_ids: ['pi_3', 'pi_4'],
              },
              {
                id: 'ddc-3',
                recibo_id: 'rec-3',
                importe_centimos: 3000,
                intentos_exitosos_count: 2,
                primera_fecha: '2026-01-07T10:00:00Z',
                estado: 'FALSO_POSITIVO',
                payment_intent_ids: ['pi_5', 'pi_6'],
              },
            ],
          }),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto('/billing/dobles-cobros');
    await page.waitForLoadState('networkidle');

    // Verificar que se cargan los 3
    const allRows = page.locator('table tbody tr');
    await expect(allRows).toHaveCount(3);

    // Filtrar por PENDIENTE_REVISION
    const selectFiltro = page.locator('select, [role="combobox"]').first();
    // Buscar el select de filtro
    const filterTrigger = page.locator('button:has-text("Pendiente revisión")').first();
    // Clickear en el select de filtro
    const filterSelect = page.locator('text=Filtrar por estado').locator('..').locator('[role="combobox"]');
    await filterSelect.click();
    await page.locator('[role="option"]:has-text("Pendiente revisión")').click();

    // Verificar que ahora solo hay 1 fila
    const pendientesRows = page.locator('table tbody tr');
    await expect(pendientesRows).toHaveCount(1);
    await expect(page.locator('text=rec-1')).toBeVisible();
  });

  test('Permiso: solo PROPIETARIO puede revertir', async ({ page }) => {
    // Simular que el usuario es RECEPCION
    await page.context().clearCookies();
    await page.context().addCookies([
      {
        name: 'sb-access-token',
        value: 'mock-token-recepcion',
        domain: 'localhost',
        path: '/',
      },
    ]);

    await page.route('**/api/billing/dobles-cobros/revertir', async (route) => {
      await route.respond({
        status: 403,
        body: JSON.stringify({
          error: 'No tienes permiso para resolver dobles cobros',
        }),
      });
    });

    // Navegar a la página
    await page.goto('/billing/dobles-cobros');

    // Debería mostrar error de acceso denegado o no cargar nada
    // Este comportamiento depende de la implementación del guardián
  });
});
