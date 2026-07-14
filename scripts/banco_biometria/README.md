# Banco de pruebas biométrico (herramienta de desarrollo)

Página standalone para probar el **reconocimiento facial 1:N de personal interno**
con la cámara de una laptop o celular, **antes** de que exista el frontend real.
No forma parte del backend ni del frontend definitivo: es un banco de pruebas.

## Qué hace

- **Motor:** `face-api.js` (fork `@vladmandic`) calcula en el navegador el
  descriptor facial de **128 dimensiones**. La **comparación ocurre en el backend**
  (pgvector), vía la Edge Function `validar-biometria`. Ver
  `docs/01_AUTENTICACION_Y_ROLES.md` §6.
- **Enrolar (GPI):** inicia sesión como un usuario con permiso
  `GPI_BIOMETRIA_INSERT` (lo exige la RLS), captura un rostro, sube la foto al
  bucket privado `registro-biometrico` y guarda el descriptor con la RPC
  `enrolar_biometria`.
- **Ingresar (dispositivo):** captura un rostro, lo identifica 1:N contra los
  enrolados y, opcionalmente, registra el evento de acceso por la vía
  `AUTOMATICA` como lo haría el dispositivo de la garita.

## Requisitos

1. **Migraciones aplicadas** (incluye `..._biometria_facial_1n.sql`) y las Edge
   Functions `validar-biometria` y `registrar-evento-acceso` desplegadas
   (local con `supabase functions serve`, o en el proyecto remoto).
2. **Origen seguro** para la cámara: `getUserMedia` solo funciona en `https://`
   o en `localhost`. Sirve esta carpeta y ábrela por localhost:

   ```bash
   npx serve scripts/banco_biometria
   # abre http://localhost:3000
   ```

   Para probar **desde el celular** necesitas `https` (un túnel tipo `ngrok`/
   `cloudflared`) o el frontend real servido por https.
3. **Conexión a internet** al abrir la página: las librerías y los pesos de los
   modelos se cargan por CDN (`jsdelivr`).

## Uso

1. Pega la **URL del proyecto** y la **anon key** (Settings → API), y pulsa
   *Conectar*. Se cargan los modelos.
2. *Activar cámara*.
3. **Para enrolar:** pestaña *Enrolar*, inicia sesión GPI, indica el
   `id_persona` (por defecto el "Docente Demo" del `seed_demo.sql`) y pulsa
   *Capturar rostro y enrolar*.
4. **Para probar el ingreso:** pestaña *Ingresar*, pon tu propia cara (la que
   enrolaste) frente a la cámara y pulsa *Capturar rostro y validar*. Si marcas
   la casilla, además se registra el evento de acceso.

## Notas

- El `confidence` es `1 − distancia euclidiana (L2)` contra el enrolado más
  cercano (métrica correcta para face-api.js; coseno daba falsos positivos). El
  match se decide contra el parámetro `UMBRAL_BIOMETRIA` (por defecto `0.38`, =
  distancia L2 máxima 0.62), ajustable en `parametro_sistema` sin tocar código.
- El "Docente Demo" del seed trae una fila biométrica **sin descriptor** (era el
  mock): hay que **re-enrolarlo** con un rostro real desde aquí para que el 1:N
  lo reconozca.
- Los **externos nunca** tienen biometría (§D20): la RPC y el trigger lo impiden.
