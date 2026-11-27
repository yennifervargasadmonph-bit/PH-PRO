import type { LucideIcon } from 'lucide-react'

/** Estado vacío: ícono, una frase y, debajo, la fila para agregar. */
export function Vacio({ icono: I, texto, children }: { icono: LucideIcon; texto: string; children?: React.ReactNode }) {
  return (
    <div>
      <div className="vacio">
        <i>
          <I aria-hidden="true" />
        </i>
        <p>{texto}</p>
      </div>
      {children}
    </div>
  )
}
