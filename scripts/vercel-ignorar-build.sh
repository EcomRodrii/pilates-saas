#!/bin/sh
# ignoreCommand de Vercel: exit 0 = saltar el build, exit 1 = construir.
# Vive aquí y no en vercel.json porque Vercel limita ese campo a 256 caracteres.
#
# - Preview: siempre se salta (el CI ya construye).
# - Sin commit previo desplegado: se construye.
# - Solo cambian rutas que no alteran lo que se construye: se salta. Un build de
#   producción es el 94 % de la factura de Vercel, así que cada uno cuenta.
#   El `lib/db-types.ts` que acompaña a una migración SÍ dispara el build.
if [ "$VERCEL_ENV" = "preview" ]; then exit 0; fi
if [ -z "$VERCEL_GIT_PREVIOUS_SHA" ]; then exit 1; fi
if git diff --quiet "$VERCEL_GIT_PREVIOUS_SHA" HEAD -- \
  ':!docs/**' ':!**/*.md' ':!e2e/**' ':!**/*.test.ts' \
  ':!supabase/**' ':!.github/**' ':!.claude/**'; then exit 0; fi
exit 1
