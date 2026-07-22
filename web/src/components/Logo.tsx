/**
 * El escudo del sistema.
 *
 * Vive en `public/`, así que se sirve tal cual sin pasar por el empaquetado: es la misma imagen
 * que usa la pestaña del navegador, y así no hay dos versiones que puedan separarse.
 *
 * El texto alternativo va vacío a propósito. En los dos sitios donde aparece, el nombre del
 * sistema está escrito justo al lado; ponerle descripción haría que un lector de pantalla
 * anunciara la marca dos veces seguidas.
 */
export function Logo({ className = 'h-6 w-6' }: { className?: string }) {
  return <img src="/logo.png" alt="" aria-hidden="true" className={`${className} object-contain`} />
}
