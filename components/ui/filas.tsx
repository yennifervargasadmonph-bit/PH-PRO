import { ChevronRight, Plus } from 'lucide-react'
import Link from 'next/link'

export type Punto = 'rojo' | 'ambar' | null | undefined

/** Lista de filas en calma: título corto, una línea de meta y, si aplica, un punto de estado. */
export function Filas({ children, etiqueta }: { children: React.ReactNode; etiqueta?: string }) {
  return (
    <ul className="filas" aria-label={etiqueta}>
      {children}
    </ul>
  )
}

const NOMBRE_PUNTO = { rojo: 'Requiere atención', ambar: 'Pendiente' } as const

function Contenido({ titulo, meta, punto, derecha, abre }: { titulo: React.ReactNode; meta?: React.ReactNode; punto?: Punto; derecha?: React.ReactNode; abre: boolean }) {
  return (
    <>
      <span className="fila-cuerpo">
        <span className="fila-titulo">{titulo}</span>
        {meta && <span className="fila-meta">{meta}</span>}
      </span>
      {derecha && <span className="fila-derecha">{derecha}</span>}
      {punto && (
        <span className={`punto ${punto}`} role="img" aria-label={NOMBRE_PUNTO[punto]} title={NOMBRE_PUNTO[punto]} />
      )}
      {abre && <ChevronRight className="chevron" aria-hidden="true" />}
    </>
  )
}

/** Una fila. Con `href` abre su panel lateral (o su página); con `children` envuelve un botón propio. */
export function Fila({
  titulo,
  meta,
  punto,
  derecha,
  href,
  actual,
  inactiva,
}: {
  titulo: React.ReactNode
  meta?: React.ReactNode
  punto?: Punto
  derecha?: React.ReactNode
  href?: string
  actual?: boolean
  inactiva?: boolean
}) {
  const clase = `fila-c${inactiva ? ' inactiva' : ''}`
  return (
    <li>
      {href ? (
        <Link className={clase} href={href} scroll={false} aria-current={actual ? 'true' : undefined}>
          <Contenido titulo={titulo} meta={meta} punto={punto} derecha={derecha} abre />
        </Link>
      ) : (
        <div className={clase}>
          <Contenido titulo={titulo} meta={meta} punto={punto} derecha={derecha} abre={false} />
        </div>
      )}
    </li>
  )
}

/** Fila con un botón de formulario (por ejemplo, entrar a una copropiedad). */
export function FilaBoton({ titulo, meta, punto, derecha }: { titulo: React.ReactNode; meta?: React.ReactNode; punto?: Punto; derecha?: React.ReactNode }) {
  return (
    <button className="fila-c" type="submit">
      <Contenido titulo={titulo} meta={meta} punto={punto} derecha={derecha} abre />
    </button>
  )
}

/** Fila discreta «+ Agregar…». */
export function FilaAgregar({ href, texto }: { href: string; texto: string }) {
  return (
    <Link className="fila-agregar" href={href} scroll={false}>
      <span className="mas-circulo">
        <Plus aria-hidden="true" />
      </span>
      <span>{texto}</span>
    </Link>
  )
}
