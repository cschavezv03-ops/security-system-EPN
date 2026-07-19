# Despliegue

## Por qué existe `vercel.json` en la raíz

La aplicación vive en `web/`, pero el proyecto de Vercel tiene el **Root Directory en la raíz
del repositorio**. Eso hacía que cada despliegue disparado por Git instalase las dependencias
del `package.json` de la raíz —que solo tiene la CLI de Supabase— y después intentase ejecutar
`vite build`, con Vite sin instalar:

```
added 9 packages, and removed 255 packages in 6s
sh: line 1: vite: command not found
Error: Command "vite build" exited with 127
```

Hasta ahora no se había notado porque **todos los despliegues que funcionaron fueron manuales**
(`npx vercel --prod` ejecutado dentro de `web/`, que sí toma el `package.json` correcto). El
primer despliegue automático desde `main`, el 18/07 a las 23:07, falló por esta razón; el
`ESTADO_SESION.md` de la ronda de ADM daba por hecho que la integración con Git ya estaba
resuelta, y no lo estaba.

`vercel.json` en la raíz corrige las tres cosas sin necesidad de entrar al panel de Vercel:
instala dentro de `web`, construye ahí, y publica `web/dist`. La configuración de un
`vercel.json` versionado tiene precedencia sobre la del panel.

> El **Root Directory sí es exclusivo del panel**: no se puede fijar desde `vercel.json`. Si
> alguien lo cambia a `web` en el futuro, este archivo deja de hacer falta y **hay que borrarlo**,
> porque entonces los comandos harían `cd web` estando ya dentro de `web`.

El `rewrites` se duplica aquí porque `web/vercel.json` deja de leerse cuando el Root Directory
es la raíz. Los dos archivos deben decir lo mismo: la aplicación es una SPA y cualquier ruta
tiene que servir `index.html`.

## Comprobar un despliegue

```bash
cd web
npx vercel ls                                   # estado de los últimos despliegues
npx vercel inspect --logs <url-del-despliegue>  # por qué falló uno concreto
```

Un push a `main` publica en producción. Un push a cualquier otra rama genera una URL de
*preview*, que es la que se usa para las revisiones manuales antes de abrir el PR.
