# Guía de pruebas manuales (E2E) — reqs 9-38

No hay navegador headless ni Docker en el entorno, así que estas pruebas de interfaz se
verifican a mano. Las de base de datos y validadores sí están automatizadas:

- **Validadores (frontend):** `cd web && npm run test` (Vitest, 24 casos).
- **Base de datos:** `psql "$DATABASE_URL" -f scripts/pruebas_validaciones_nuevas.sql` (seguro,
  corre dentro de `BEGIN … ROLLBACK`).

Requisito previo: `supabase db push` aplicado y `supabase functions deploy registrar-evento-acceso`.

## 1. Persistencia de formulario (req 32)
1. Ir a **Registrar vehículo** (`/vehiculos/nuevo`). Escribir tipo, placa, marca.
2. Hacer **Alt + Tab** a otra aplicación y volver → los datos permanecen.
3. Cambiar a otra pestaña del navegador y volver → los datos permanecen.
4. Recargar la página (F5) → aparece el aviso "Hay un borrador sin guardar" → **Restaurar**.
5. Guardar el formulario → el borrador se elimina (recargar ya no lo ofrece).
6. Abrir la misma pantalla en dos pestañas y editar en ambas → aparece el aviso de conflicto.

## 2. Cambio de contraseña cierra la sesión (reqs 26/27/28)
1. Iniciar sesión con una cuenta normal. Ir a **Mi cuenta**.
2. "Cambio de contraseña" muestra **Pendiente** o **Realizado** según el usuario.
3. Cambiar la contraseña (actual + nueva + confirmar).
4. Resultado: se cierra la sesión y vuelve al login con el aviso
   "La contraseña se actualizó correctamente. Inicie sesión nuevamente."
5. Iniciar sesión en OTRA pestaña que tuviera sesión abierta → esa sesión ya no funciona
   (el token fue revocado en el servidor).

## 3. Cambio obligatorio de arranque (req 27)
1. Crear un usuario nuevo desde ADM (queda con contraseña temporal, `requiere_cambio_password=true`).
2. Iniciar sesión con esa cuenta → **solo** se ve la pantalla "Debe cambiar su contraseña";
   no hay acceso al resto del sistema.
3. Cambiar la contraseña → cierra sesión → volver a entrar → ahora sí entra al sistema y el
   estado es **Realizado**.

## 4. Recordar sesión (req 30)
1. Login **sin** "Recordar sesión" → cerrar el navegador por completo → reabrir: pide login.
2. Login **con** "Recordar sesión" → cerrar y reabrir el navegador: la sesión sigue activa.
3. En ningún caso el navegador guarda ni autocompleta la contraseña.

## 5. ¿Olvidó su contraseña? (req 31)
1. En el login, "¿Olvidó su contraseña?" → ingresar un correo (exista o no).
2. Siempre responde: "Si existe una cuenta asociada, recibirá instrucciones…" (no revela cuentas).
3. Con SMTP configurado, el enlace lleva a **Restablecer contraseña**; al guardar se revocan las
   sesiones y se vuelve al login. Sin SMTP no llega correo (estado documentado: NO_VERIFICADO).

## 6. Turno de guardia (req 34)
1. Con un guardia cuya asignación esté **fuera** de la ventana horaria: la vista de garita muestra
   el aviso "Su turno no se encuentra habilitado a esta hora" y los botones Ingreso/Salida quedan
   deshabilitados.
2. Si se fuerza un registro por API, el backend responde 403 y registra el intento en `bitacora_sistema`.
3. Cambiar la hora del navegador NO cambia el resultado (se usa la hora del servidor).
4. Un administrador u otro rol NO se ve afectado por la regla de turno.

## 7. Vehículo + propietario y máximo 2 (req 35)
1. En **Registrar vehículo**, buscar a la persona por cédula (no hay combo con todas las personas).
2. Registrar 2 vehículos activos a la misma persona → el 3.º es rechazado por el backend con
   mensaje en español.
3. Placa de motocicleta `AB-123C` se acepta en tipo MOTOCICLETA y se rechaza en AUTOMOVIL.
4. Bicicleta sin placa: se permite guardando el motivo, no una cadena ficticia.

## 8. Encabezado usuario/rol (req 33)
1. Con la cuenta admin, la barra superior muestra:
   ```
   Admin
   Administrador del Sistema
   ```
