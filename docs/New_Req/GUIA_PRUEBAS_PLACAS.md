# Cómo probar el reconocimiento de placas y de rostro

Guía para la prueba manual con **placas reales de Ecuador** delante de la cámara. Es la parte
que ninguna prueba automática puede cubrir: TestSprite no puede acercar una matrícula a un
objetivo, y el navegador de las pruebas no tiene cámara.

---

## Antes de empezar: tres cosas de cinco minutos

### 1. La placa tiene que existir en la base de datos

Es el motivo número uno por el que la prueba "falla" sin que nada esté roto: el lector acierta,
la placa se lee perfecta, y el sistema responde *"no corresponde a ningún vehículo registrado"*
— porque efectivamente no está.

Las placas sembradas hoy son ficticias: `PDF1234`, `ECU593`, `PDF7777`, `PGF593`, `PCI514`.

**Para registrar la tuya**, entra con `admin@epn.edu.ec` (o `lenin.amangandi@epn.edu.ec` para
un vehículo de personal interno) → **Vehículos** → Registrar. Necesitas placa, tipo y, desde la
propia ficha del vehículo, **asociar a una persona**. Sin esa asociación la placa se identifica
pero el ingreso se deniega con `PLACA_NO_RECONOCIDA`, que es el comportamiento correcto de
RF-CA-015: la placa tiene que corresponder a quien la conduce.

Si vas a probar la **doble autenticación** (RF-CA-016), asocia el vehículo a una persona que
además tenga el **rostro enrolado**.

### 2. Enrolar tu rostro

Hoy solo hay tres rostros enrolados —Frank Jumbo, Cecilia Jaramillo y Alexander Guerra— y
**ninguno tiene vehículo con propietario**. Para probar el flujo completo necesitas enrolarte:

`lenin.amangandi@epn.edu.ec` → **Personal Interno** → **Biometría** → registrar el rostro de la
persona que vaya a conducir.

### 3. El token del lector en la nube (opcional)

Sin token, el sistema **funciona igual**: lee la placa con Tesseract en el propio navegador. Con
token, acierta bastante más, porque un lector de matrículas localiza la placa dentro de la foto
antes de leerla en vez de hacer OCR sobre la imagen entera.

Para activarlo: registro gratuito en `platerecognizer.com` (2500 lecturas/mes), y el token va
como variable de entorno **`PLATE_RECOGNIZER_TOKEN`** en el proyecto de Supabase
(*Edge Functions → Secrets*). No hace falta desplegar nada más: la función lo lee en caliente.

> El token vive en el servidor, nunca en el bundle del navegador. Una clave de API en el
> frontend es una clave pública.

---

## Dos relojes que hay que mirar antes de probar

Esto es lo que más tiempo hace perder, porque el sistema responde con toda la razón y parece que
algo está roto.

**1. El turno del guardia.** `guardia.demo` tiene turno **12:00–23:59** (hora de Ecuador). Fuera
de esa franja no puede registrar **nada**: el botón responde con "Su turno no se encuentra
habilitado a esta hora". Es la barrera de turno funcionando (req 34), no un fallo.

Para moverlo a la mañana, una línea en el SQL Editor de Supabase:

```sql
update public.guardia_punto_control
   set hora_inicio = '06:00', hora_fin = '18:00'
 where id_usuario = (select id from auth.users where email = 'guardia.demo@epn.edu.ec')
   and estado_asignacion = 'ACTIVA';
```

No se puede cubrir el día entero: la jornada máxima son 12 h (§D59, art. 55 del Código del
Trabajo), y esa regla se respeta también para las cuentas de demostración.

**2. El horario de la regla de acceso de cada categoría.** Aunque el guardia esté en turno, la
persona que intenta entrar tiene su propia franja:

| Categoría | Franja | Sirve para probar de noche |
|---|---|---|
| **Docente** | 05:30 – 23:00 | **Sí** — es la mejor opción |
| Estudiante | 06:00 – 21:00 | Hasta las 21:00 |
| Administrativo | 06:00 – 20:00 | Hasta las 20:00 |
| Empresa de servicio | 06:00 – 18:00 | No |
| Visitante / Contratista | horario de oficina | No |

Si pruebas por la noche, **usa a un docente**. Alexander Guerra (cédula `1750000257`) es docente,
tiene el rostro enrolado **y** es propietario de `PGF593`: es el único caso del sistema que hoy
permite probar la doble autenticación completa de un tirón.

## Cómo se usa

Entra con **`guardia.demo@epn.edu.ec` / `admin1234`** (asignado a "Garita Principal (demo)").

Pestaña **Ingreso vehicular**:

1. **Activar cámara.** En un móvil abre la trasera; en un portátil, la que haya.
2. **Encuadrar la placa dentro del marco verde.** El marco no es decoración: marca exactamente
   la región que se recorta para leer. Todo lo que quede fuera (capó, calle, otros coches) es
   ruido que solo empeora la lectura.
3. **Capturar placa.**
4. **Añadir al conductor** (por rostro) y a los pasajeros (por rostro o cédula).
5. **Registrar ingreso.**

### Si la lectura falla

Tres salidas, en orden de preferencia:

- **Repetir la captura** más cerca y con mejor luz.
- **Subir una foto** con el botón de la imagen, junto a "Capturar placa". Sirve también para
  probar sin vehículo delante.
- **Escribir la placa a mano** en el campo de abajo. Siempre está disponible a propósito: si la
  placa está sucia, doblada o a contraluz, el guardia la lee con sus ojos. Un sistema de garita
  que solo funciona cuando el OCR acierta deja al guardia sin salida justo cuando más falta le
  hace.

### Si vas a mostrar la placa en la pantalla del móvil

Es el caso de la demo y **no es una versión más fácil** de fotografiar una placa metálica: la
pantalla emite luz en vez de reflejarla, aparece moiré (la interferencia entre la rejilla de
píxeles del móvil y la del sensor de la webcam) y el brillo aplana el contraste.

Medido sobre 200 imágenes (§D71), esto es lo que cambia el resultado:

| Cómo la muestres | Acierto |
|---|---|
| Llenando el marco, de frente, brillo del móvil al máximo | ~100 % |
| Encuadrada pero pequeña dentro del marco | ~65 % |
| Lejos o torcida | ~5 % — no lo hagas |

Tres cosas que suben mucho el acierto y cuestan nada:

1. **Que la placa llene el marco verde.** Es lo que más pesa, con diferencia.
2. **Brillo del móvil al máximo** y la pantalla lo más perpendicular posible a la cámara: así se
   evita el reflejo, que es lo que borra caracteres enteros.
3. **Que la foto de origen sea nítida.** Si la foto ya está movida, ningún preprocesado la
   arregla.

Y si aun así falla: escribe la placa a mano. Está siempre disponible a propósito.

### Qué esperar de cada motor

| | Lector en la nube | Lector local (Tesseract) |
|---|---|---|
| Placa limpia, buena luz, de frente | Casi siempre bien | Suele acertar |
| Foto en pantalla, bien encuadrada | Muy bien | Bien |
| Ángulo, sombra o placa sucia | Aguanta bastante | Falla a menudo |
| Distancia > 3 m | Aguanta | Casi nunca lee |
| Necesita internet | Sí | No |

En los dos casos, **una lectura con erratas se corrige antes de rendirse**: ver más abajo.

---

## Qué comprobar (y qué debería pasar)

### El corrector de erratas

Prueba a escribir a mano estas placas, que simulan lo que devuelve un OCR sucio:

| Escribe | Debería resolver a | Por qué |
|---|---|---|
| `PDFI234` | PDF-1234 | La `I` está en zona de dígitos: es un `1` |
| `PDF1Z34` | PDF-1234 | La `Z` está en zona de dígitos: es un `2` |
| `P0F1234` | PDF-1234 | El `0` está en zona de letras: es una `O`, y de ahí a `D` por tolerancia |
| `PCI5I4` | PCI-514 | Igual que el primero |
| `PBX7412` | **No registrada** | Placa con formato válido que no existe en la base |

En los casos corregidos, la pantalla avisa de que **la lectura no fue exacta** y pide comprobar
la placa antes de continuar. El sistema propone; tú confirmas.

### Los umbrales de la placa

El lector prepara la imagen de cuatro formas distintas y las lee por separado; la confianza es
**cuántas de las cuatro coincidieron**. Eso sustituye a la confianza que reporta Tesseract, que
en la versión que usa el sistema llega siempre a cero y no servía para nada (§D71).

| Acuerdo | Qué hace el sistema |
|---|---|
| ≥ 0.75 | Usa la lectura directamente |
| 0.50 – 0.75 | Te propone la placa y te pide confirmarla |
| < 0.50 | Descarta la lectura y te pide repetir la captura |

Medido: con 0.75, solo el 1,2 % de las lecturas que se aceptan solas son erróneas.

### Los umbrales del rostro

| Confianza | Qué debe pasar |
|---|---|
| ≥ 0.45 | Se autoriza sin más |
| 0.35 – 0.45 | Pide confirmación visual del guardia |
| < 0.35 | **Persona desconocida**, con botón para registrar el intento |

La confianza se muestra en pantalla junto al nombre. Si al ponerte tú delante sale por debajo de
0.45 de forma consistente, no subas la exposición: **vuelve a enrolar el rostro** con la misma
cámara y luz con la que vas a usarlo. Un enrolamiento hecho con otra cámara arrastra un sesgo
que ningún umbral arregla.

Si quieres ver el otro extremo, ponte delante de la cámara **con otra persona ya enrolada** y
comprueba que **no** te reconoce como ella. Es la prueba que justifica haber subido el umbral:
con el valor anterior (0.38) el margen contra el impostor más parecido del banco era de 0.07.

### La doble autenticación (RNF-CA-005)

1. Añade al conductor **solo por cédula** y marca "Conduce el vehículo".
   → La pantalla avisa de que le falta el rostro, y al registrar sale
   **"Falta la segunda verificación del conductor"**.
2. Ahora añádelo **por rostro**.
   → Se autoriza.

Es el caso que impide entrar con la placa de otro simplemente conduciendo su coche.

### Los pasajeros (RF-CA-017)

Añade dos o tres ocupantes y registra el ingreso. **Cada uno recibe su propio veredicto**: uno
puede pasar y otro no, y los dos resultados se muestran por separado con el nombre delante.

### Lo que queda registrado

Todo lo anterior deja rastro. Con `carlos.chavez03@epn.edu.ec`:

- **Historial de accesos** → el evento, con tipo de acceso, placa leída, confianza y el motivo
  del rechazo en castellano.
- **Alertas de seguridad** → la alerta correspondiente. Persona desconocida y placa no
  reconocida entran como riesgo **ALTO**; fuera de horario, como **BAJO** (nadie ha hecho nada
  malo, llega tarde).
- **Errores de reconocimiento** → si la cámara no abrió o no se distinguió ninguna placa. Este
  registro es el que permite saber que una garita lleva días con la cámara estropeada, en vez de
  que el fallo desaparezca al recargar la página.

---

## Si algo no funciona

| Síntoma | Causa habitual |
|---|---|
| "No se pudo abrir la cámara" | `getUserMedia` exige **https o localhost**. En el preview de Vercel va; en una IP local, no. |
| El botón de registrar está gris | Fuera del turno del guardia (06:00–18:00) o sin ocupantes añadidos. |
| "No hay ninguna regla de acceso para su categoría" | La categoría de esa persona no tiene regla activa. Se ve en CAC → Reglas de acceso. |
| Todo se deniega por horario | Comprueba la hora **de Ecuador**, no la del servidor: el sistema usa `America/Guayaquil`. |
| La placa se lee bien pero "no corresponde a esta persona" | El vehículo existe pero esa persona no está asociada a él. Es RF-CA-015 funcionando. |
