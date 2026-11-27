import Link from 'next/link'
import type { Punto } from './filas'

export type Cifra = { etiqueta: string; valor: React.ReactNode; nota?: string; punto?: Punto | 'verde'; href?: string }

/** Indicadores: cuatro en una línea en escritorio y 2 × 2 en el celular. */
export function Cifras({ cifras }: { cifras: Cifra[] }) {
  const clase = cifras.length === 3 ? 'cifras tres' : cifras.length === 2 ? 'cifras dos' : 'cifras'
  return (
    <div className={clase}>
      {cifras.map((c) => {
        const contenido = (
          <>
            <span>{c.etiqueta}</span>
            <strong>{c.valor}</strong>
            {c.nota && (
              <small>
                {c.punto && <span className={`punto ${c.punto}`} aria-hidden="true" />}
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.nota}</span>
              </small>
            )}
          </>
        )
        return c.href ? (
          <Link key={c.etiqueta} className="cifra" href={c.href}>
            {contenido}
          </Link>
        ) : (
          <div key={c.etiqueta} className="cifra">
            {contenido}
          </div>
        )
      })}
    </div>
  )
}
