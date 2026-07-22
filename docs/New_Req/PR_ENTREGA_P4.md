# PR — Entrega del prototipo 4

Rama: `feat/gpe-garita-verificar-cedula` → `main`
Abrir en: https://github.com/cschavezv03-ops/security-system-EPN/compare/main...feat/gpe-garita-verificar-cedula?expand=1

**Título sugerido:** Cierre del prototipo 4: ámbito de las asociaciones, fechas del memorando y datos reales

---

## 1. Cada módulo asocia vehículos a su propia gente

Desde GPE se podía registrar el coche de un docente, y desde GPI el de un visitante. La frontera
entre las dos poblaciones existía solo en el buscador por cédula de la ficha del vehículo: el alta
unificada de vehículo + propietario (`/vehiculos/nuevo`) no filtraba nada, y la API REST y la RPC
tampoco.

Ahora la regla vive en la base (§D88), con dos comprobaciones que se complementan:

- **Por quién escribe** — el ámbito se deduce de los permisos efectivos del usuario, no de un
  parámetro del cliente: GPI solo vincula personal interno, GPE solo personal externo. ADM, que es
  la maestra de las tres tablas, puede con las dos.
- **Por coherencia del vehículo** — ningún vehículo tiene a la vez personas internas y externas
  vigentes. Un vehículo mixto no es un permiso más amplio: el ingreso de un interno se decide por
  su categoría y el de un externo por su memorando, y el guardia no sabría cuál aplicar.

En pantalla, el módulo viaja en la ruta del alta (`?modulo=GPI`) para que el filtro se aplique
también ahí, y la ficha de un vehículo de la otra población lo dice y no ofrece el botón de
vincular en vez de dejar que el usuario llegue al final del formulario para descubrirlo.

## 2. La vigencia de la asociación la manda el memorando (GPE)

Un externo entra con vehículo porque un memorando ampara la placa, pero las fechas de la relación
persona-vehículo se tecleaban a mano y sin relación con el oficio (§D89).

- Al elegir a la persona, la ficha busca el memorando que la ampara **con ese vehículo**, rellena
  la fecha de inicio y la de fin y las deja en solo lectura, con el número del memorando y su
  vigencia a la vista.
- El backend rellena las fechas que lleguen vacías y rechaza cualquier vigencia que se salga del
  memorando, venga de donde venga la escritura.
- El alta del vehículo desde el propio memorando hereda sus fechas, en lugar de abrir la relación
  con `now()` y sin fecha de fin, que era el caso más frecuente y el que nacía peor.
- La RPC de alta admite una vigencia de un solo día: el CHECK de la tabla siempre lo permitió y en
  GPE es el caso del oficio que autoriza una entrega puntual.

Cuando el vehículo de un externo no está amparado por ningún memorando, no hay nada que heredar y
las fechas se siguen tecleando.

## 3. Datos listos para la presentación

Ver §V47 para el detalle completo. En resumen:

- Se borraron "Impostor Uno", "Impostor Dos" y "TuRostro Muestra Dos" con todo lo que colgaba de
  ellas; se convirtieron en personas reales "Docente Demo", "Visitante Demo", "Guardia Demo" y
  "Administrador del Sistema", para no dejar sin historial la garita.
- **Ninguna cuenta del sistema cambió de correo, usuario ni contraseña.** De sus personas solo se
  corrigió la cédula y los datos de contacto (y el nombre, en las dos que llevaban un cargo por
  nombre).
- Todas las cédulas de relleno (1750000xxx) se sustituyeron por cédulas que pasan el algoritmo del
  Registro Civil. La de Carlos Chávez es la real: 1751207646.
- Ninguna persona queda sin sexo, fecha de nacimiento, teléfono, dirección ni ficha de datos
  internos (cargo/unidad/contrato).
- Se eliminaron los registros que el sistema íntegro no habría producido: memorandos sin ninguna
  persona autorizada, un memorando de prueba anulado, el mismo camión dado de alta dos veces (sus
  eventos se trasladaron al que sigue vivo) y reglas de acceso duplicadas o llamadas "Demo …".
- "Garita Principal (demo)" pasó a "Garita Principal - Av. Toledo"; el punto dentro del edificio 15
  adoptó la nomenclatura oficial de espacios de la EPN.

## Estado

- `npm run typecheck`, `npm test` (263 pruebas, 5 nuevas) y `npm run build`: en verde.
- Migraciones aplicadas al proyecto remoto de Supabase, incluidas tres que estaban pendientes de
  rondas anteriores. Una de ellas arreglaba un fallo en producción: el alta de vehículo llamaba a
  la RPC con un argumento (`p_fecha_fin`) que la base todavía no tenía, así que fallaba siempre.
- Los cuatro casos de la nueva regla se comprobaron contra la base real (mezcla bloqueada, fuera de
  memorando bloqueado, herencia de fechas, y el caso normal que debe seguir funcionando).
