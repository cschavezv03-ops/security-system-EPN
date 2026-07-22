<p align="center">
  <img src="Logo.png" alt="Escudo de la Escuela Politécnica Nacional" width="112" />
</p>

# Manual de usuario — Sistema de Seguridad y Control de Accesos EPN

**Versión:** 1.0<br>
**Fecha:** 21 de julio de 2026<br>
**Aplicación:** [security-system-epn.vercel.app](https://security-system-epn.vercel.app)

Este manual explica cómo realizar las tareas habituales del sistema de forma segura. Está
organizado por objetivos, con pasos numerados, resultados esperados y soluciones a problemas,
siguiendo el enfoque de la [guía de wikiHow para hacer un manual de
usuario](https://es.wikihow.com/hacer-un-manual-de-usuario).

> El sistema muestra solamente los módulos y botones permitidos para la cuenta activa. Si una
> opción de este manual no aparece, primero confirme que está trabajando con el rol correcto.

## Contenido

1. [Propósito y alcance](#1-propósito-y-alcance)
2. [Antes de comenzar](#2-antes-de-comenzar)
3. [Inicio de sesión y cuenta](#3-inicio-de-sesión-y-cuenta)
4. [Cómo usar las pantallas del sistema](#4-cómo-usar-las-pantallas-del-sistema)
5. [Personal Interno (GPI)](#5-personal-interno-gpi)
6. [Personal Externo (GPE)](#6-personal-externo-gpe)
7. [Puntos de Control (PCO)](#7-puntos-de-control-pco)
8. [Control de Accesos (CAC)](#8-control-de-accesos-cac)
9. [Vista operativa del guardia](#9-vista-operativa-del-guardia)
10. [Administración (ADM)](#10-administración-adm)
11. [Monitoreo](#11-monitoreo)
12. [Solución de problemas](#12-solución-de-problemas)
13. [Buenas prácticas y soporte](#13-buenas-prácticas-y-soporte)
14. [Glosario](#14-glosario)

## 1. Propósito y alcance

El Sistema de Seguridad y Control de Accesos centraliza:

- el registro de personas internas y externas;
- la identificación facial del personal interno;
- los vehículos y las personas relacionadas con ellos;
- los memorandos y las autorizaciones de visita;
- las zonas, garitas, dispositivos y turnos de guardias;
- las reglas, eventos, alertas y fallos de reconocimiento; y
- la administración de cuentas, permisos, catálogos y auditoría.

Este documento está dirigido a usuarios finales. La instalación, el desarrollo, la base de datos
y el despliegue se explican en el [README del proyecto](../README.md).

### 1.1 Roles

| Rol | Trabajo principal |
|---|---|
| Administrador del Sistema | Administra cuentas, roles, permisos, catálogos, auditoría y datos maestros. |
| Director Administrativo | Consulta Administración en modo de solo lectura. |
| Responsable de Personal Interno | Gestiona personas internas, datos institucionales, rostros y vehículos. |
| Responsable de Personal Externo | Gestiona visitantes, proveedores, empresas, memorandos, visitas y vehículos. |
| Responsable de Puntos de Control | Gestiona zonas, garitas, dispositivos y asignaciones de guardias. |
| Responsable de Control de Accesos | Configura reglas y supervisa eventos, alertas y errores. |
| Guardia de Seguridad | Valida personas y vehículos y registra ingresos o salidas en su punto asignado. |

Cada cuenta mantiene un solo rol activo. Al cambiarlo, el rol anterior queda revocado y se
conserva en el historial. La cuenta con rol de guardia abre directamente la vista de garita.

## 2. Antes de comenzar

Necesita:

- una cuenta habilitada por el Administrador del Sistema;
- un navegador moderno con conexión a internet;
- la cédula, memorando, placa u otros datos de respaldo requeridos para la tarea; y
- permiso de cámara cuando vaya a registrar o reconocer rostros o placas.

La cámara funciona en una conexión HTTPS o en `localhost`. Limpie la lente, use iluminación
frontal y evite que aparezcan varias personas en el encuadre.

### 2.1 Reglas que debe conocer

- La cédula identifica a una persona. Debe tener 10 dígitos y superar la validación ecuatoriana.
- El personal interno se valida físicamente mediante su rostro.
- El personal externo necesita estar activo y tener un memorando vigente o una autorización
  válida para ese día.
- Reconocer una placa no autoriza automáticamente a sus ocupantes. Cada persona se valida por
  separado.
- Los registros históricos no se borran. Las bajas cambian el estado y conservan la trazabilidad.
- Los estados y vigencias mostrados por el sistema pueden cambiar por la fecha actual, aunque el
  registro original no haya sido editado.

## 3. Inicio de sesión y cuenta

### 3.1 Iniciar sesión

1. Abra la aplicación.
2. Escriba su correo electrónico y contraseña.
3. Active **Recordar sesión** solo en un equipo personal o institucional de uso exclusivo.
4. Seleccione **Iniciar sesión**.
5. Espere a que aparezca el panel de módulos o, si es guardia, la vista de garita.

**Resultado esperado:** la barra superior muestra su nombre, rol y estado de conexión.

> Después de cinco intentos fallidos, la cuenta se bloquea temporalmente durante 15 minutos.
> Espere ese tiempo o solicite el desbloqueo al Administrador del Sistema.

### 3.2 Cambiar la contraseña temporal del primer ingreso

1. Inicie sesión con la contraseña temporal entregada por el administrador.
2. En la pantalla obligatoria, escriba la contraseña actual.
3. Escriba una contraseña nueva de al menos 8 caracteres.
4. Repítala exactamente y confirme el cambio.
5. Inicie sesión nuevamente con la contraseña nueva.

La contraseña temporal no debe reutilizarse ni compartirse. El cambio cierra las sesiones
anteriores para proteger la cuenta.

### 3.3 Recuperar una contraseña olvidada

1. En la pantalla de acceso, seleccione **¿Olvidó su contraseña?**
2. Ingrese el correo de la cuenta.
3. Revise la bandeja de entrada y el correo no deseado.
4. Abra el enlace recibido y defina una contraseña nueva.

Por seguridad, la aplicación no confirma si el correo está registrado. Si no recibe el mensaje,
verifique la dirección y comuníquese con el administrador.

### 3.4 Revisar o cerrar sesiones

1. Abra el menú de usuario de la barra superior.
2. Seleccione **Mi cuenta**.
3. Revise la información de la cuenta y las sesiones activas.
4. Use **Cerrar todas las sesiones** si desconoce alguna sesión o perdió un dispositivo.

Para terminar únicamente la sesión actual, seleccione **Cerrar sesión** en la barra superior.

## 4. Cómo usar las pantallas del sistema

### 4.1 Abrir un módulo

1. En el panel principal, seleccione una tarjeta de módulo.
2. Abra el submódulo correspondiente a su tarea.
3. Para volver, use la ruta de navegación o el botón de regreso de la aplicación.

Las tarjetas que no corresponden a sus permisos permanecen ocultas.

### 4.2 Buscar, filtrar y revisar un registro

1. Escriba una cédula, nombre, placa, número u otro término en **Buscar**.
2. Aplique los filtros disponibles si necesita reducir los resultados.
3. Seleccione una fila para abrir su ficha lateral.
4. Revise el estado, vigencia y datos relacionados antes de actuar.
5. Use **Exportar CSV** cuando el botón esté disponible y tenga permiso.

La búsqueda de las listas admite coincidencias parciales. En cambio, los formularios que dicen
**Cédula de la persona** ejecutan una búsqueda exacta al completar los 10 dígitos.

### 4.3 Registrar o editar

1. Seleccione **Registrar …**.
2. Complete primero los campos que controlan el resto del formulario, como categoría, tipo o
   zona.
3. Complete todos los campos marcados como obligatorios.
4. Corrija los mensajes mostrados bajo cada campo.
5. Seleccione **Guardar** una sola vez y espere la confirmación.

Para editar, abra la fila y seleccione **Editar**. Algunos cambios sensibles —por ejemplo,
categoría, empresa, correo o vigencia— solicitan una confirmación adicional.

**Resultado esperado:** aparece un aviso de éxito y la lista refleja el cambio.

### 4.4 Dar de baja, finalizar o reactivar

1. Abra la ficha del registro.
2. Seleccione **Dar de baja**, **Inactivar** o **Finalizar**, según el módulo.
3. Escriba el motivo si se solicita.
4. Confirme y compruebe el nuevo estado.

Si la política lo permite, la misma ficha mostrará **Reactivar**. Estas acciones no eliminan el
registro ni su historial.

### 4.5 Recuperar un formulario sin terminar

La aplicación guarda borradores locales de varios formularios. Si cierra accidentalmente un
panel y vuelve a abrirlo, acepte la recuperación solo si reconoce los datos. Descarte el borrador
si pertenece a otra tarea.

Evite editar el mismo registro en dos pestañas. Si aparece un aviso de cambio concurrente,
recargue la ficha y compruebe cuál es la información más reciente antes de volver a guardar.

## 5. Personal Interno (GPI)

### 5.1 Registrar una persona interna

1. Abra **Personal Interno → Personal interno**.
2. Seleccione **Registrar Persona interna**.
3. Elija primero la **Categoría**. Esta selección determina los campos posteriores.
4. Ingrese cédula, nombres, apellidos, correo institucional, sexo y demás datos solicitados.
5. Si la categoría es **Estudiante**, registre también el código único.
6. Si la categoría es **Empresa de servicio**, seleccione la empresa correspondiente.
7. Seleccione **Guardar**.

**Resultado esperado:** la persona aparece activa en la lista, con su categoría y estado de
biometría. La cédula, nombres, apellidos y código único de estudiante no se pueden modificar
después del registro.

### 5.2 Registrar los datos internos por cédula

1. Abra **Personal Interno → Datos internos**.
2. Seleccione **Registrar Detalle interno**.
3. Escriba los 10 dígitos en **Cédula de la persona interna**.
4. Espere la tarjeta de resultado y compruebe nombre, cédula, categoría y estado.
5. Complete únicamente los campos habilitados para esa categoría:

   | Categoría | Datos que corresponden |
   |---|---|
   | Docente | Unidad, categoría académica y contrato. |
   | Administrativo | Unidad, cargo y contrato. |
   | Trabajador | Cargo y contrato. |
   | Empresa de servicio | Contrato. |
   | Estudiante EPN | Unidad EPN y carrera. |
   | Estudiante CEC | Unidad CEC y curso. |

6. Seleccione **Guardar**.

La categoría visible explica por qué ciertos campos aparecen, se ocultan o permanecen
deshabilitados. Si la persona no aparece, confirme que fue registrada como interna, está activa y
todavía no tiene un detalle interno.

### 5.3 Registrar el rostro de una persona interna

1. Abra **Personal Interno → Biometría**.
2. Busque a la persona por su cédula.
3. Permita el uso de la cámara si el navegador lo solicita.
4. Coloque un solo rostro de frente, con iluminación uniforme y sin obstrucciones.
5. Espere a que el sistema confirme que el rostro es válido.
6. Capture y confirme el registro biométrico.

**Resultado esperado:** la persona figura como enrolada o con biometría activa.

Si existe un registro incorrecto, use la acción de baja o reemplazo disponible para su permiso y
repita la captura. No registre fotografías de pantallas ni el rostro de otra persona.

### 5.4 Registrar un vehículo interno

1. Abra **Personal Interno → Vehículos**.
2. Seleccione **Registrar Vehículo**.
3. Busque al propietario por su cédula y compruebe su identidad.
4. Seleccione el tipo de vehículo.
5. Ingrese la placa con formato de tres letras y tres o cuatro dígitos, por ejemplo `PDF-1234`.
6. Complete marca, modelo y color cuando corresponda.
7. Guarde el registro.
8. Abra la ficha del vehículo para añadir conductores u otras personas relacionadas, indicando
   tipo de relación y vigencia.

La aplicación guarda la placa en formato normalizado. Cada persona puede mantener como máximo
dos vehículos activos. Una relación con el vehículo no sustituye la validación individual en la
garita.

## 6. Personal Externo (GPE)

### 6.1 Registrar una empresa

1. Abra **Personal Externo → Empresas**.
2. Busque por nombre o RUC para evitar duplicados.
3. Seleccione **Registrar Empresa**.
4. Complete los datos solicitados y guarde.

Registre primero la empresa cuando la persona externa o el memorando deban vincularse con ella.

### 6.2 Registrar una persona externa

1. Abra **Personal Externo → Personal externo**.
2. Seleccione **Registrar Persona externa**.
3. Elija una categoría externa, como visitante, proveedor, contratista o conductor.
4. Ingrese cédula, nombres, apellidos y datos de contacto.
5. Seleccione la empresa cuando corresponda.
6. Guarde y revise la ficha.

Registrar a la persona no autoriza por sí solo el ingreso. Debe existir un memorando vigente o
una autorización diaria vigente.

### 6.3 Registrar un memorando

1. Abra **Personal Externo → Memorandos**.
2. Seleccione **Registrar Memorando**.
3. Escriba el número completo del documento, incluida su parte numérica.
4. Seleccione la empresa y registre asunto, fechas y demás datos requeridos.
5. Guarde el memorando.
6. Abra su ficha y compruebe el texto de vigencia mostrado por el sistema.

El estado efectivo se calcula con las fechas: un memorando puede estar programado, vigente o
caducado sin que una persona tenga que cambiarlo manualmente. Para anularlo, abra la ficha,
seleccione **Anular** e ingrese el motivo.

### 6.4 Vincular personas con un memorando

1. Compruebe que tanto el memorando como las personas externas ya existan.
2. Abra **Personal Externo → Personas por memorando**.
3. Seleccione **Registrar**.
4. Elija el memorando.
5. Busque las personas por cédula, apellido o empresa y selecciónelas.
6. Confirme la vinculación.

La ficha permite distinguir la vigencia del memorando y el estado de acceso de cada persona. No
vincule una persona solo por compartir empresa; confirme su identidad y relación con el
documento.

### 6.5 Autorizar una visita de un solo día

1. Abra **Personal Externo → Ingresos (visitas sin memorando)**.
2. Seleccione **Registrar Autorización**.
3. Busque a la persona externa por su cédula.
4. Compruebe nombre, categoría y estado.
5. Seleccione la fecha de visita y escriba el motivo.
6. Guarde.

Una visita para hoy se muestra vigente; una fecha futura, programada. La autorización deja de
ser válida al terminar su fecha. Para cancelarla antes, abra la ficha y use **Revocar** con un
motivo.

### 6.6 Registrar un vehículo externo

Use **Personal Externo → Vehículos** y siga el procedimiento de [registro de vehículo
interno](#54-registrar-un-vehículo-interno), pero busque a una persona externa como propietaria.
Revise también el memorando de la empresa y las personas vinculadas al vehículo. Una autorización
vehicular no concede acceso automático a personas no autorizadas.

## 7. Puntos de Control (PCO)

Configure la infraestructura en este orden:

```text
Zona → Punto de control → Dispositivo → Asignación de guardia
```

### 7.1 Registrar una zona

1. Abra **Puntos de Control → Zonas**.
2. Seleccione **Registrar Zona**.
3. Escoja el tipo y complete los campos mostrados.
4. Para un edificio, seleccione su campus y asigne un número de edificio único.
5. Para un parqueadero, seleccione el edificio al que pertenece.
6. Guarde.

La jerarquía válida es **Campus → Edificio → Parqueadero**. Las zonas nuevas nacen activas. Use
la ficha para inactivar o reactivar una zona.

### 7.2 Registrar un punto de control

1. Abra **Puntos de Control → Puntos de control**.
2. Seleccione **Registrar Punto de control**.
3. Elija primero el tipo de zona.
4. Identifique el campus, edificio o parqueadero solicitado por el formulario.
5. Complete la letra, piso, espacio o descripción que corresponda. El sistema compone el nombre
   cuando existe una nomenclatura institucional.
6. Guarde y compruebe la zona asociada.

Los puntos nuevos nacen activos. Un punto inactivo o en mantenimiento impide operar al guardia
asignado, aunque su turno esté vigente.

### 7.3 Registrar un dispositivo

1. Abra **Puntos de Control → Dispositivos**.
2. Seleccione **Registrar Dispositivo**.
3. Elija la tecnología.
4. Ingrese una dirección IP válida.
5. Elija la zona y después uno de sus puntos de control compatibles.
6. Guarde.

El código del dispositivo se genera automáticamente, por ejemplo `BIO-0001` o `LPR-0001`. Un
lector de placas solo puede asociarse a una ubicación compatible. Actualice el estado desde la
ficha si el equipo queda fuera de servicio.

### 7.4 Asignar un guardia

1. Abra **Puntos de Control → Asignaciones de guardia**.
2. Seleccione **Registrar Asignación**.
3. Escriba la cédula completa del guardia.
4. Compruebe la tarjeta con su nombre. La búsqueda acepta únicamente cuentas con rol de guardia
   activo.
5. Seleccione una zona y luego el punto de control.
6. Registre hora de entrada, hora de salida, fecha de inicio y fecha de fin.
7. Guarde.

El turno puede cruzar la medianoche. No puede durar más de 12 horas; si supera 8 horas, el
formulario advierte que excede la jornada ordinaria. La lista separa **Asignación** —su vigencia
por fechas— de **Estado actual** —si está o no dentro del turno en este momento—.

Para terminarla antes de la fecha prevista, abra la ficha y seleccione **Finalizar asignación**.

## 8. Control de Accesos (CAC)

### 8.1 Crear una regla de acceso

1. Abra **Control de Accesos → Reglas de acceso**.
2. Seleccione **Registrar Regla de acceso**.
3. Escriba un nombre y una descripción que expliquen claramente la regla.
4. Seleccione la categoría de persona.
5. Defina el horario y si requiere memorando.
6. Guarde la regla.
7. Abra su ficha y asocie las garitas donde se aplicará. Si no asocia ninguna, la regla se aplica
   en todas las garitas.

Evite reglas duplicadas o contradictorias. Los cambios de categoría, horario, puntos o
requisitos de memorando afectan decisiones futuras de ingreso y requieren confirmación.

### 8.2 Consultar el historial de accesos

1. Abra **Control de Accesos → Historial de accesos**.
2. Busque por cédula, nombre, placa o punto.
3. Filtre por fecha, movimiento o resultado cuando esté disponible.
4. Seleccione un evento para ver persona, vehículo, punto, fecha, decisión y motivo.
5. Exporte el listado si necesita un reporte autorizado.

El historial es de solo lectura. No intente corregir un evento pasado modificando a la persona:
registre y atienda la novedad correspondiente.

### 8.3 Atender una alerta

1. Abra **Control de Accesos → Alertas de seguridad**.
2. Filtre las alertas pendientes y abra una.
3. Revise el evento, nivel de riesgo, persona y datos de atención disponibles.
4. Realice la verificación operativa fuera del sistema.
5. Seleccione **Atender**, describa la acción tomada y añada observaciones útiles.
6. Confirme que la alerta cambió a atendida.

No marque una alerta como atendida antes de ejecutar o coordinar la acción indicada.

### 8.4 Revisar fallos de cámara, rostro o placa

1. Abra **Control de Accesos → Errores de reconocimiento**.
2. Filtre por fecha, tipo o punto de control.
3. Abra el registro y revise dispositivo, mensaje y contexto.
4. Compare varios fallos del mismo equipo para detectar un problema persistente.
5. Informe a PCO si el dispositivo requiere revisión o cambio de estado.

Esta pantalla es histórica y de solo lectura.

## 9. Vista operativa del guardia

### 9.1 Comprobar que la garita está lista

Al iniciar sesión, verifique en la parte superior:

- el nombre del punto asignado;
- el estado activo del punto;
- el horario mostrado; y
- la ausencia de una advertencia de fuera de turno.

Si aparece **Sin asignación activa**, el responsable de PCO debe asignar un punto. Si aparece una
advertencia de turno, podrá consultar la pantalla, pero el servidor rechazará el registro del
evento hasta que exista un turno válido.

### 9.2 Registrar el paso peatonal de una persona externa

1. Abra la pestaña **Ingreso peatonal**.
2. En la tarjeta de búsqueda por cédula, ingrese los 10 dígitos.
3. Compruebe nombre, tipo de persona, estado y vía de vigencia.
4. Seleccione **Registrar ingreso** o **Registrar salida**, según el movimiento real.
5. Lea el resultado completo antes de permitir el paso.

**Resultado esperado:** un aviso verde indica ingreso o salida autorizada. Un aviso rojo muestra
la causa de la denegación. No permita el paso basándose únicamente en que la persona existe.

### 9.3 Registrar el paso peatonal de una persona interna

1. Abra la pestaña **Ingreso peatonal**.
2. En la tarjeta de biometría, habilite la cámara.
3. Pida a la persona mirar de frente y mantenga un solo rostro en el encuadre.
4. Ejecute la identificación.
5. Compruebe nombre y nivel de confianza mostrado.
6. Seleccione **Registrar ingreso** o **Registrar salida**.
7. Lea la decisión devuelta por el sistema.

No sustituya la identificación del personal interno por una búsqueda manual de cédula. Si el
rostro no está enrolado o la comparación no es confiable, informe la novedad a GPI y CAC.

### 9.4 Autorizar una visita de hoy desde la garita

1. En **Ingreso peatonal**, ubique **Autorizar una visita de hoy**.
2. Busque por cédula a una persona externa ya registrada.
3. Verifique nombre, categoría y estado.
4. Escriba el motivo de la visita.
5. Seleccione **Autorizar el ingreso de hoy**.
6. Vuelva a buscar la cédula y registre el ingreso.

La tarjeta no aparece si la cuenta no posee el permiso correspondiente. Una autorización diaria
es válida solo en la fecha indicada.

### 9.5 Registrar un ingreso o salida vehicular

1. Abra la pestaña **Ingreso vehicular**.
2. Capture la placa con la cámara. Si la lectura no es correcta, escriba la placa manualmente.
3. Compruebe vehículo, propietario, estado y respaldo de acceso mostrado.
4. Añada al conductor y a cada pasajero:
   - identifique por rostro al personal interno;
   - busque por cédula al personal externo.
5. Marque exactamente a una persona como conductor.
6. Revise la autorización individual de todos los ocupantes.
7. Seleccione **Registrar ingreso** o **Registrar salida**.
8. Lea el resultado general y los motivos antes de abrir el paso.

El acceso del vehículo se deniega si la placa o cualquiera de los ocupantes no cumple las reglas.
Nunca omita pasajeros para conseguir una decisión favorable.

### 9.6 Revisar movimientos recientes

La sección inferior muestra los últimos eventos del punto y se actualiza después de registrar un
movimiento. Úsela para confirmar que el evento quedó guardado y para evitar un doble registro.

## 10. Administración (ADM)

### 10.1 Crear una cuenta de usuario

1. Confirme que la persona interna ya está registrada.
2. Abra **Administración → Usuarios**.
3. Seleccione **Registrar Usuario**.
4. Busque a la persona por su cédula y compruebe su identidad.
5. Complete nombre de usuario, correo y rol inicial.
6. Confirme el alta.
7. Copie la contraseña temporal mostrada una sola vez y entréguela por un canal seguro.

La persona deberá cambiar esa contraseña en el primer ingreso. Nunca envíe la contraseña junto
con otros datos de acceso en un canal público.

### 10.2 Administrar una cuenta y sus roles

1. Busque por cédula, nombre de usuario o correo.
2. Abra la ficha del usuario.
3. Revise estado, persona vinculada y asignaciones de rol.
4. Use únicamente la acción necesaria:
   - **Bloquear** o **Desbloquear** controla intentos de acceso;
   - **Activar** o **Dar de baja** controla la vigencia de la cuenta;
   - **Resetear contraseña** genera una nueva clave temporal;
   - asignar o revocar un rol cambia el alcance funcional.
5. Confirme el resultado en la misma ficha.

El sistema restringe acciones que puedan dejar sin control una cuenta administrativa propia. Cada
cuenta tiene un solo rol activo: cambiarlo revoca el anterior en la misma operación. No otorgue un
rol más amplio para resolver un problema operativo puntual; aplique el mínimo necesario.

### 10.3 Roles, permisos y matriz

- **Roles** muestra los perfiles funcionales.
- **Permisos** explica cada capacidad y su código técnico.
- **Matriz rol × permiso** muestra y administra qué acciones contiene cada rol.

Un cambio en la matriz se aplica a todos los usuarios con ese rol. Revise la fila y la columna
antes de guardar y valide el resultado con una cuenta de prueba, no con datos de producción.

### 10.4 Catálogos y parámetros

Desde **Categorías**, **Empresas** y **Parámetros** se gestionan valores reutilizados por todo el
sistema. Antes de inactivar o modificar uno, revise dónde se utiliza. Un parámetro puede cambiar
límites, umbrales o políticas operativas sin cambiar el código.

### 10.5 Consultar personas, biometría y vehículos

- **Personal interno y externo** presenta listas separadas por ámbito.
- **Biometría** indica quién tiene un rostro vigente y desde cuándo; no expone la fotografía como
  un archivo público.
- **Vehículos** reúne propietarios, conductores y demás relaciones en la ficha de cada vehículo.

### 10.6 Revisar auditoría y sesiones

1. Abra **Administración → Auditoría**.
2. Busque por usuario, acción o entidad y aplique filtros.
3. Abra el registro para revisar quién hizo qué, sobre cuál dato y cuándo.
4. Exporte CSV solo si el análisis lo requiere y proteja el archivo resultante.

En **Sesiones** puede consultar los inicios y cierres registrados. Ambos paneles son históricos;
no deben alterarse para ocultar una acción.

El Director Administrativo puede consultar la información administrativa autorizada, pero no
crear, editar, bloquear, asignar ni revocar.

## 11. Monitoreo

1. Abra **Monitoreo → Panel de monitoreo**.
2. Revise los indicadores generales y las alertas pendientes.
3. Compruebe la lista de vehículos que permanecen dentro del campus.
4. Revise eventos y errores recientes.
5. Seleccione un elemento para abrir el detalle.
6. Para atender una alerta o investigar un error, diríjase al submódulo de CAC correspondiente.

El panel se actualiza aproximadamente cada 30 segundos. Es una vista de supervisión: las
acciones formales permanecen en Control de Accesos.

## 12. Solución de problemas

| Situación | Qué comprobar | Qué hacer |
|---|---|---|
| No puede iniciar sesión | Correo, mayúsculas y estado de la cuenta | Reintente con cuidado; tras cinco fallos, espere 15 minutos o contacte al administrador. |
| La contraseña temporal no permite navegar | Cambio obligatorio pendiente | Complete la pantalla de cambio y vuelva a iniciar sesión. |
| No llega el correo de recuperación | Dirección y carpeta de spam | Espere unos minutos, repita una vez y contacte al administrador sin enviar su contraseña. |
| El panel aparece vacío o falta un botón | Rol o permiso insuficiente | Confirme el rol mostrado y solicite revisión al administrador. |
| Una cédula no encuentra a la persona | Longitud, dígito verificador, ámbito y estado | Use 10 dígitos; compruebe si debía ser interna, externa o guardia y si está activa. |
| Datos internos deja campos bloqueados | Categoría o unidad de la persona | Revise la categoría mostrada. En estudiantes, EPN habilita carrera y CEC habilita curso. |
| La cámara no abre | Permiso del navegador, HTTPS, cámara ocupada | Autorice la cámara, cierre otras aplicaciones y recargue la página. |
| No detecta el rostro | Luz, distancia, encuadre o varios rostros | Mire de frente, mejore la luz y deje una sola persona visible. |
| La placa se lee mal | Reflejos, suciedad o ángulo | Repita la captura de frente o use la entrada manual y verifique carácter por carácter. |
| El externo existe pero no puede entrar | Estado y vigencia | Compruebe memorando, vínculo personal o autorización del día. |
| El guardia no puede registrar eventos | Asignación, punto o turno | PCO debe mantener una asignación vigente a un punto activo y dentro del horario. |
| Un vehículo es rechazado | Estado, respaldo y ocupantes | Valide la placa y a cada ocupante; una persona denegada impide el paso del conjunto. |
| Aparece un aviso de cambios en otra pestaña | Edición concurrente | Recargue, compare la información y vuelva a aplicar únicamente el cambio necesario. |
| La lista no se actualiza | Conexión o sesión vencida | Compruebe el indicador de conexión, recargue e inicie sesión otra vez si se solicita. |

No repita muchas veces una operación que devuelve error: podría crear registros duplicados si la
conexión se restablece entre intentos. Primero busque el registro y confirme si ya fue guardado.

## 13. Buenas prácticas y soporte

### 13.1 Uso seguro

- No comparta contraseñas ni deje una sesión abierta en una garita desatendida.
- Compruebe nombre, cédula, categoría, estado y vigencia antes de confirmar.
- Registre motivos concretos; evite textos como “varios”, “prueba” o “ok”.
- No exporte datos personales si no son necesarios para la tarea.
- Guarde los CSV en una ubicación institucional protegida y elimínelos cuando dejen de ser
  necesarios.
- No fotografíe ni copie información biométrica fuera del sistema.
- Cierre todas las sesiones si pierde un dispositivo o sospecha acceso no autorizado.

### 13.2 Cómo reportar un problema

Entregue al responsable técnico:

1. módulo y pantalla donde ocurrió;
2. acción que intentaba realizar;
3. fecha y hora aproximadas;
4. texto exacto del mensaje mostrado;
5. rol con el que trabajaba; y
6. cédula o placa relacionada solo si el canal de soporte es seguro.

Puede adjuntar una captura que no exponga contraseñas, tokens, fotografías biométricas ni datos de
terceros ajenos al incidente. Nunca envíe la contraseña actual o temporal.

## 14. Glosario

| Término | Significado |
|---|---|
| ADM | Administración del sistema. |
| CAC | Control de Accesos. |
| GPE | Gestión de Personal Externo. |
| GPI | Gestión de Personal Interno. |
| PCO | Puntos de Control. |
| Biometría o enrolamiento | Registro de características del rostro para identificar a una persona. |
| Garita o punto de control | Lugar físico desde el que se registra un ingreso o una salida. |
| Memorando vigente | Documento cuya fecha y estado permiten el acceso de personas vinculadas. |
| Autorización diaria | Permiso de una persona externa válido para una fecha específica. |
| Evento de acceso | Intento registrado de ingreso o salida, autorizado o denegado. |
| RLS | Reglas de base de datos que limitan qué filas puede consultar o modificar cada cuenta. |
| Baja lógica | Cambio de estado que deshabilita un registro sin borrar su historial. |

---

Para información técnica, instalación y despliegue, consulte el [README del
repositorio](../README.md). Para políticas funcionales detalladas, consulte las [reglas de
negocio](04_REGLAS_NEGOCIO.md) y la [documentación de autenticación y
roles](01_AUTENTICACION_Y_ROLES.md).
