/** Forma comparable de un texto para búsquedas de usuario: minúsculas y sin diacríticos.
 * Conserva letras y números; quien llama decide si además elimina separadores. */
export function normalizarBusqueda(v: unknown): string {
  return String(v ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}
