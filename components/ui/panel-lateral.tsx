import { X } from 'lucide-react'
import Link from 'next/link'
import { CerrarConEscape } from './cerrar-con-escape'

/**
 * Panel lateral que se abre al tocar una fila (en el celular, hoja inferior).
 * Vive en la URL (?p=…), así que se puede compartir y el botón atrás lo cierra.
 */
export function PanelLateral({ titulo, meta, cerrar, children }: { titulo: string; meta?: React.ReactNode; cerrar: string; children: React.ReactNode }) {
  return (
    <>
      <Link className="panel-fondo" href={cerrar} scroll={false} aria-label="Cerrar panel" tabIndex={-1} />
      <aside className="panel-lateral" role="dialog" aria-modal="true" aria-labelledby="panel-titulo">
        <header>
          <div>
            <h2 id="panel-titulo">{titulo}</h2>
            {meta && <p className="meta">{meta}</p>}
          </div>
          <Link href={cerrar} scroll={false} aria-label="Cerrar">
            <X aria-hidden="true" width={20} height={20} />
          </Link>
        </header>
        <div className="panel-cuerpo">{children}</div>
        <CerrarConEscape destino={cerrar} />
      </aside>
    </>
  )
}
