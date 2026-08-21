import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resumirReviewBoost } from './review-boost.ts';

test('resumirReviewBoost separa ratings bajos/altos y canjeadas/concedidas', () => {
  const r = resumirReviewBoost({
    elegibles: 10,
    mostrados: 7,
    feedbacks: [{ rating: 1 }, { rating: 3 }, { rating: 4 }, { rating: 5 }, { rating: 5 }],
    recompensas: [
      { concedidaEn: '2026-08-01T00:00:00.000Z', canjeadaEn: '2026-08-02T00:00:00.000Z' },
      { concedidaEn: '2026-08-05T00:00:00.000Z', canjeadaEn: null },
    ],
  });
  assert.deepEqual(r, {
    elegibles: 10, mostrados: 7, feedbacks: 5,
    ratingsBajos: 2, ratingsAltos: 3,
    recompensasConcedidas: 2, recompensasCanjeadas: 1,
  });
});
