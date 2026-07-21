# Guía de revisión manual — ronda GPE + GPI

**Rama:** `feat/gpe-gpi-mejoras` · **Preview:** el último de `npx vercel ls` con entorno
`Preview` (pide iniciar sesión en Vercel: entra con la cuenta dueña del proyecto).

Las migraciones **ya están aplicadas en la base de producción**, así que la aplicación
desplegada en `main` comparte esquema con el preview. Eso es intencional (cambios aditivos y
compatibles), pero explica que algunas cosas se noten también en producción: por ejemplo, los
tres memorandos ya aparecen como vencidos ahí.

Contraseña de las 8 cuentas de prueba: `admin1234`.

---

## 1. Memorandos (GPE §2, §3, §6)

**Personal Externo → Memorandos**

- [ ] Los tres memorandos aparecen como **Vencido**, no como Vigente. Antes de esta ronda decían
      "Vigente" pese a haber caducado el 17/07.
- [ ] Sus números son `EPN-DA-2026-0001-M`, `-0002-M` y `-0003-M`, no `MEM-MRQUHXKD`.
- [ ] **Registrar Memorando**: el campo "Número de memorando" está vacío y se puede escribir.
      Prueba a poner `MEMORANDO` (sin dígitos) → debe rechazarlo. Con `EPN-VRA-2026-0500-M`
      debe aceptarlo. Intenta repetir un número existente → la base lo rechaza.
- [ ] Registra uno con vigencia de hoy a dentro de un mes: aparece **Vigente**, y su ficha dice
      "Autoriza el ingreso hasta el … inclusive".
- [ ] Abre ese memorando vigente y pulsa **Editar**: el campo "Estado" está **en gris** y dice
      "Vigente". No es un desplegable. Tampoco aparece ya el aviso "Los campos en gris no son
      editables por diseño".
- [ ] Cambia la fecha de fin y pulsa Guardar: **antes de guardar** debe salir una ventana de
      confirmación con el antes y el después. Cancela → no se guarda nada.
- [ ] En la ficha del memorando vigente, pie de página: botón **Anular memorando**. Pulsa y
      confirma sin motivo → lo exige. Con motivo, el memorando pasa a "Anulado" y ya no autoriza.
      (Ojo: si lo anulas, las personas vinculadas dejan de entrar. Hazlo con uno de prueba.)

## 2. Personal externo (GPE §10)

**Personal Externo → Personal externo**

- [ ] La columna ya no se llama "Ingreso" con un número de días suelto, sino **"Autorización de
      ingreso"**, y dice de dónde sale el permiso.
- [ ] Abre una persona vinculada a un memorando: la ficha dice **si puede ingresar o no**, con
      el número de memorando **como enlace**. Pulsa el enlace → va a Memorandos con ese número
      ya buscado.
- [ ] Abre una persona sin memorando ni visita: dice que no puede ingresar y qué hay que hacer.

## 3. Ingresos sin memorando (GPE §8)

**Personal Externo → Ingresos (visitas sin memorando)**

- [ ] **Registrar Autorización**: ya **no** hay combo "Estado". El visitante se busca por su
      cédula; al encontrarlo se muestran su identidad y categoría antes de elegir fecha y motivo.
- [ ] Intenta poner una fecha de visita anterior a hoy → lo rechaza (nacería caducada).
- [ ] En el listado, las visitas de días pasados aparecen como **Caducada**; una de hoy,
      **Vigente**; una futura, **Programada**.
- [ ] Revoca una: ahora pide motivo **y lo guarda** (antes se pedía y se tiraba). El motivo se ve
      en la ficha.

## 4. Vinculación por memorando (GPE §12)

**Personal Externo → Personas por memorando**

- [ ] **Registrar**: el memorando va primero, y solo se ofrecen los vigentes o por empezar (los
      vencidos ya no, porque vincular a alguien a uno vencido no le da acceso).
- [ ] La lista de personas tiene un **buscador**: escribe una cédula, un apellido o el nombre de
      una empresa y filtra. Cada línea muestra apellidos, cédula y empresa.
- [ ] En el listado, la columna **"¿Puede entrar?"** dice sí/no y hasta cuándo.

## 5. Personal interno (GPI)

**Personal Interno → Personal interno → Registrar Persona interna**

- [ ] El **primer campo es Categoría**, y de él depende el resto.
- [ ] Con **Estudiante**: aparece "Código único". Cambia a **Docente**: desaparece.
- [ ] Con **Empresa de servicio**: aparece "Empresa a la que pertenece", con las empresas de
      Administración.
- [ ] Para cualquier categoría están disponibles: cédula, nombres, apellidos, correo, correo
      alternativo, teléfono, teléfono alternativo, sexo, fecha de nacimiento y dirección.
- [ ] Deja **Sexo** vacío y guarda → lo exige (ahora es obligatorio).
- [ ] Pon una **fecha de nacimiento de 2030** → lo rechaza, y también lo rechaza la base.

**Personal Interno → Datos internos → Registrar**

- [ ] La persona se busca por su **cédula**, no en un combo con todo el personal. Al encontrarla
      se muestran nombre, categoría y estado; la categoría explica los campos habilitados.
- [ ] Elige un **docente**: "Contrato" es un desplegable con **Fijo / Temporal** y el dato
      académico se etiqueta **Categoría**. No aparecen Cargo ni Nombramiento.
- [ ] Elige un **administrativo**: tiene Contrato y Cargo, pero no Nombramiento.
- [ ] Elige un **trabajador**: tiene Cargo, pero no Nombramiento.
- [ ] Elige una persona de **Empresas de servicio**: no aparece Nombramiento.
- [ ] Elige un **estudiante** y Unidad **CEC**: Curso queda habilitado y Carrera bloqueada.
- [ ] Cambia la Unidad a **EPN**: Carrera queda habilitada, Curso bloqueado y se limpian los
      valores académicos incompatibles con la unidad anterior.

**Personal Interno → Biometría → Enrolar rostro**

- [ ] La persona interna se busca por su **cédula** y el resultado muestra su categoría antes de
      capturar el rostro; no existe un combo con todo el personal.

## 6. Vehículos y asociaciones (GPE §9, GPI)

- [ ] En **Personal Interno** y en **Personal Externo** ya **no** existe la tarjeta
      "Asociaciones". Solo "Vehículos".
- [ ] Abre un vehículo: dentro de la ficha está el bloque **"Personas asociadas"** con
      "Vincular persona", igual que en Administración.
- [ ] Desde **Personal Interno**, intenta vincular la cédula de una persona **externa** →
      debe avisar de que esa sección trabaja con personal interno. Y al revés desde GPE.
- [ ] Al crear un vehículo con propietario o vincular otra persona, **Fecha de fin** es
      obligatoria y debe ser posterior a Fecha de inicio.

## 7. Textos (GPE §4, §7 y GPI anglicismos)

- [ ] Las tarjetas de módulo ya no dicen "Enrolamiento facial 1:N", "Vínculos persona–vehículo"
      ni "Categoría × punto × horario".
- [ ] Entra con una cuenta sin permisos a una sección restringida: el mensaje dice "Pide acceso
      al administrador del sistema", no "Requiere GPI_BIOMETRIA_SELECT".
- [ ] **Puntos de Control → Zonas**: "Edificio 15 - Facultad de Ingeniería Mecánica", con tildes.

## 8. Garita del guardia (GPE §13)

Entra con una cuenta de **guardia** (rol Guardia de Seguridad).

- [ ] Aparece una tarjeta nueva: **"Autorizar una visita de hoy"**.
- [ ] Busca una cédula registrada como externa → pide el motivo y autoriza el ingreso de hoy.
- [ ] Busca una cédula que **no existe** → ofrece registrarla ahí mismo (nombres, apellidos,
      categoría) y, tras crearla, continúa con la autorización sin cambiar de pantalla.
- [ ] Repite con alguien que ya tiene autorización de hoy → avisa de que ya puede entrar en vez
      de dejar crear una segunda.

## 9. Borrador de formularios

- [ ] Empieza a registrar cualquier cosa (un memorando, por ejemplo), escribe algo y pulsa
      "Volver al panel". Vuelve a entrar en "Registrar": ofrece **"Recuperarlo"**.
- [ ] "Empezar de cero" descarta lo guardado.

---

## Qué hace falta de tu parte

1. **Desbloquear TestSprite** para el preview (ver §V20 en `99_DUDAS_PARA_EL_EQUIPO.md`): los 10
   planes de esta ronda están creados pero no se han podido ejecutar porque el preview pide
   iniciar sesión en Vercel.
2. **Decidir sobre §V18/§V19**: un docente sembrado tiene código único y carrera de estudiante.
3. **Abrir el PR** cuando des el visto bueno.
