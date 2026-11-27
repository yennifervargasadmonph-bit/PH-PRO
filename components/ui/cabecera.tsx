import { Ellipsis } from 'lucide-react'
import Link from 'next/link'

export type AccionMas = { href: string; texto: string }

/**
 * Una cabecera por pantalla: título corto, una línea de meta y una sola acción principal.
 * El resto de acciones va en «⋯ Más».
 */
export function Cabecera({ titulo, meta, accion, mas = [] }: { titulo: string; meta?: React.ReactNode; accion?: React.ReactNode; mas?: AccionMas[] }) {
  return (
    <div className="cabecera">
      <div>
        <h1>{titulo}</h1>
        {meta && <p className="meta">{meta}</p>}
      </div>
      {(accion || mas.length > 0) && (
        <div className="cabecera-acciones">
          {accion}
          {mas.length > 0 && <Mas acciones={mas} />}
        </div>
      )}
    </div>
  )
}

export function Mas({ acciones }: { acciones: AccionMas[] }) {
  return (
    <details className="mas">
      <summary className="boton secundario" aria-label="Más acciones">
        <Ellipsis aria-hidden="true" /> Más
      </summary>
      <div role="menu">
        {acciones.map((a) => (
          <Link key={a.href + a.texto} href={a.href} role="menuitem">
            {a.texto}
          </Link>
        ))}
      </div>
    </details>
  )
}
