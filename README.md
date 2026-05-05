# Monitor automático de cupones Udemy

MVP para vigilar una lista cerrada de cursos Udemy de un profesor, detectar el cupón publicado en una o pocas fuentes, probarlo con Playwright y avisar por Telegram cuando un curso queda gratis.

## Stack

- Next.js + TypeScript para dashboard y API.
- Supabase Postgres para cursos, fuentes, cupones, revisiones y alertas.
- Playwright para verificar el precio final en Udemy.
- Telegram Bot API para notificaciones.

## Configuración

1. Crea un proyecto en Supabase.
2. Ejecuta el SQL de `supabase/schema.sql` en el SQL editor de Supabase.
3. Copia `.env.example` a `.env.local` y completa:

```bash
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
```

4. Instala Chromium para Playwright:

```bash
npm run playwright:install
```

5. Levanta el dashboard:

```bash
npm run dev
```

## Uso

- Abre `http://localhost:3000`.
- Agrega una fuente donde el profesor publica el cupón.
- Agrega los cursos específicos de Udemy que quieres vigilar.
- Pulsa `Revisar ahora`.

El verificador prueba URLs de este estilo:

```txt
https://www.udemy.com/course/curso/?couponCode=CUPON
```

## Worker programado con GitHub Actions

El proyecto incluye `.github/workflows/monitor.yml`, que ejecuta el monitor cada 30 minutos y también permite correrlo manualmente desde la pestaña `Actions` de GitHub.

No necesitas deploy para esta fase: el dashboard puede correr localmente para cargar cursos y fuentes en Supabase, mientras GitHub Actions ejecuta el worker programado contra esa misma base.

En GitHub, crea estos secrets en `Settings > Secrets and variables > Actions > New repository secret`:

```txt
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
TELEGRAM_BOT_TOKEN
TELEGRAM_CHAT_ID
```

Los secrets de Telegram son opcionales para guardar revisiones, pero necesarios para recibir alertas.

Para probar localmente el worker:

```bash
npm run monitor
```

También puedes usar el endpoint del dashboard local o desplegado:

```bash
POST /api/check?secret=MONITOR_SECRET
```

Si `MONITOR_SECRET` está vacío, el endpoint queda abierto para uso local.

## Flujo recomendado para esta fase

1. Ejecuta `supabase/schema.sql` en Supabase.
   - Si ya ejecutaste el schema antes y solo quieres activar Realtime, ejecuta `supabase/realtime.sql`.
2. Crea `.env.local` con tus claves.
3. Ejecuta `npm run dev`.
4. Abre `http://localhost:3000` y registra fuentes/cursos.
5. Pulsa `Revisar ahora` para validar que guarda resultados.
6. Sube el repo a GitHub.
7. Configura los secrets.
8. Ejecuta el workflow manualmente una vez.
9. Deja el cron activo cada 30 minutos.

## Notas importantes

- Este proyecto no busca cupones en internet ni hace scraping masivo.
- Solo revisa las fuentes y cursos que registres.
- Udemy puede cambiar layout, precios por región o mostrar bloqueos anti-bot; el sistema guarda estado `error` cuando no puede clasificar con confianza.
