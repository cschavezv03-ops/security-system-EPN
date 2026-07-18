import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'
import { createContext, forwardRef, useCallback, useContext, useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, Info, Loader2, X } from 'lucide-react'
import { humanizar } from '../../lib/catalogos'

export function cx(...cls: (string | false | null | undefined)[]): string {
  return cls.filter(Boolean).join(' ')
}

/* ---------- Button ---------- */
type Variant = 'primary' | 'secondary' | 'danger' | 'ghost'
export function Button({
  variant = 'primary',
  loading,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean }) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-offset-1'
  const styles: Record<Variant, string> = {
    primary: 'bg-navy text-white hover:bg-navy-700 focus:ring-navy/40',
    secondary: 'border border-slate-300 bg-white text-navy hover:bg-slate-50 focus:ring-navy/20',
    danger: 'bg-red text-white hover:bg-[#9c2027] focus:ring-red/40',
    ghost: 'text-navy hover:bg-slate-100 focus:ring-navy/20',
  }
  return (
    <button className={cx(base, styles[variant], className)} disabled={loading || props.disabled} {...props}>
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  )
}

/* ---------- Card ---------- */
export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx('rounded-xl border border-slate-200 bg-white shadow-card', className)}>{children}</div>
}

/* ---------- Badge de estado ---------- */
const OK = new Set(['ACTIVO', 'ACTIVA', 'VIGENTE', 'AUTORIZADO', 'OPERATIVO', 'EXITO', 'ATENDIDA', 'EPN', 'REALIZADO', 'VALIDO'])
const BAD = new Set(['DADO_DE_BAJA', 'REVOCADA', 'REVOCADO', 'DENEGADO', 'BLOQUEADO', 'BLOQUEADA', 'DANO_FISICO', 'ERROR', 'VENCIDO', 'VENCIDA', 'CRITICO', 'ALTO', 'INVALIDO'])
const WARN = new Set(['INACTIVO', 'INACTIVA', 'SUSPENDIDO', 'SUSPENDIDA', 'FALLA', 'FALLA_DE_RED', 'MANTENIMIENTO', 'PENDIENTE', 'FINALIZADA', 'EXPIRADA', 'CERRADA', 'CERRADA_CAMBIO_PASSWORD', 'MEDIO', 'BAJO', 'NO_VERIFICADO'])

export function Badge({ value, className }: { value?: string | null; className?: string }) {
  const v = value ?? ''
  const tone = OK.has(v)
    ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/20'
    : BAD.has(v)
      ? 'bg-red-50 text-red ring-red/20'
      : WARN.has(v)
        ? 'bg-amber-50 text-amber-700 ring-amber-600/20'
        : 'bg-slate-100 text-slate-600 ring-slate-500/20'
  const dot = OK.has(v) ? 'bg-emerald-500' : BAD.has(v) ? 'bg-red' : WARN.has(v) ? 'bg-amber-500' : 'bg-slate-400'
  return (
    <span className={cx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset', tone, className)}>
      <span className={cx('h-1.5 w-1.5 rounded-full', dot)} />
      {/* El color se decide con el valor crudo de la BD; el texto se muestra ya traducido
          ("DADO_DE_BAJA" -> "Dado de baja"). Antes se pintaba el codigo tal cual. */}
      {humanizar(value)}
    </span>
  )
}

/* ---------- Campos de formulario ---------- */
/**
 * Campo de formulario con ayuda de formato y error en vivo.
 *
 * `ayuda` es la explicación de qué formato se espera y por qué (ej. las reglas de la cédula):
 * aparece en una ventanita al pulsar la "i", para no llenar el formulario de texto pero tenerla
 * a un clic. `error` es el problema concreto del valor tecleado ahora mismo.
 *
 * No es un <label> envolvente: el botón de ayuda dentro de un <label> haría que pulsarlo enfocara
 * el input y cerrara la ventanita al instante.
 */
export function Field({
  label, required, children, hint, ayuda, error, htmlFor,
}: {
  label: string
  required?: boolean
  children: ReactNode
  hint?: string
  ayuda?: string
  error?: string | null
  htmlFor?: string
}) {
  const [abierta, setAbierta] = useState(false)

  useEffect(() => {
    if (!abierta) return
    const alPulsarEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAbierta(false)
    }
    document.addEventListener('keydown', alPulsarEscape)
    return () => document.removeEventListener('keydown', alPulsarEscape)
  }, [abierta])

  return (
    <div className="block">
      <span className="epn-label flex items-center gap-1.5">
        <label htmlFor={htmlFor}>
          {label} {required && <span className="text-red">*</span>}
        </label>
        {ayuda && (
          <span className="relative inline-flex">
            <button
              type="button"
              onClick={() => setAbierta((v) => !v)}
              onBlur={() => setAbierta(false)}
              aria-label={`Ver el formato de ${label}`}
              aria-expanded={abierta}
              className="inline-flex h-4 w-4 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-navy focus:outline-none focus:ring-2 focus:ring-navy/30"
            >
              <Info className="h-3.5 w-3.5" />
            </button>
            {abierta && (
              <span
                role="tooltip"
                className="absolute left-1/2 top-6 z-20 w-64 -translate-x-1/2 rounded-lg border border-slate-200 bg-white p-3 text-xs font-normal leading-relaxed text-ink shadow-lg"
              >
                <span className="mb-1 block font-semibold text-navy">Formato de {label.toLowerCase()}</span>
                {ayuda}
              </span>
            )}
          </span>
        )}
      </span>
      {children}
      {error ? (
        <span className="mt-1 flex items-start gap-1 text-xs font-medium text-red">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
          {error}
        </span>
      ) : (
        hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>
      )}
    </div>
  )
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx('epn-input', className)} {...props} />
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return <textarea ref={ref} className={cx('epn-input min-h-[80px]', className)} {...props} />
  },
)

export function Select({
  className,
  options,
  placeholder,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { options?: { value: string; label: string }[]; placeholder?: string }) {
  return (
    <select className={cx('epn-input', className)} {...props}>
      {placeholder && <option value="">{placeholder}</option>}
      {options?.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
      {children}
    </select>
  )
}

/* ---------- Spinner / estados vacíos ---------- */
export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cx('h-5 w-5 animate-spin text-navy', className)} />
}

export function CenterSpinner({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-ink-soft">
      <Spinner className="h-7 w-7" />
      {label && <p className="text-sm">{label}</p>}
    </div>
  )
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-slate-300 py-14 text-center">
      <p className="text-sm font-medium text-ink-soft">{title}</p>
      {hint && <p className="max-w-md text-xs text-slate-400">{hint}</p>}
    </div>
  )
}

export function ErrorBanner({ message }: { message?: string | null }) {
  if (!message) return null
  return (
    <div className="flex items-start gap-2 rounded-md border border-red/30 bg-red-50 px-3 py-2 text-sm text-red">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{message}</span>
    </div>
  )
}

/* ---------- Modal ---------- */
export function Modal({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/40 p-4" onMouseDown={onClose}>
      <div className={cx('w-full rounded-xl bg-white shadow-xl', wide ? 'max-w-2xl' : 'max-w-md')} onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h3 className="text-base font-semibold text-navy">{title}</h3>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-navy">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3">{footer}</div>}
      </div>
    </div>
  )
}

/* ---------- Panel lateral (Patrón A) ---------- */
export function SidePanel({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title?: string; children: ReactNode; footer?: ReactNode }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-navy/20" onMouseDown={onClose}>
      <div className="flex h-full w-full max-w-md flex-col bg-white shadow-panel" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h3 className="text-base font-semibold text-navy">{title ?? 'Detalle'}</h3>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-navy">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex gap-2 border-t border-slate-200 px-5 py-3">{footer}</div>}
      </div>
    </div>
  )
}

/* ---------- Toast ---------- */
type Toast = { id: number; kind: 'ok' | 'error'; msg: string }
const ToastCtx = createContext<(kind: 'ok' | 'error', msg: string) => void>(() => {})
export function useToast() {
  return useContext(ToastCtx)
}
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const push = useCallback((kind: 'ok' | 'error', msg: string) => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t, { id, kind, msg }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500)
  }, [])
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cx(
              'flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm text-white shadow-lg',
              t.kind === 'ok' ? 'bg-emerald-600' : 'bg-red',
            )}
          >
            {t.kind === 'ok' ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
            {t.msg}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}
