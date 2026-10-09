import Link from 'next/link'
import { notFound } from 'next/navigation'
import { leerCopropiedad, misPermisos, puede } from '@/lib/datos'
import { MenuCopropiedad } from './menu'

export default async function LayoutCopropiedad({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params
  // RLS: si la persona no tiene acceso, la copropiedad no existe para ella.
  const c = await leerCopropiedad(id)
  if (!c) notFound()
  const permisos = await misPermisos(id)
  const enlaces = [
    { href: `/c/${id}`, texto: 'Resumen', ver: true },
    { href: `/c/${id}/unidades`, texto: 'Unidades', ver: puede(permisos, 'unidades', 'V') },
    { href: `/c/${id}/importar`, texto: 'Importar', ver: puede(permisos, 'importar', 'V') },
    { href: `/c/${id}/marca`, texto: 'Identidad', ver: puede(permisos, 'perfil', 'V') },
  ].filter((e) => e.ver)

  return (
    <>
      <div className="trabajando" role="status">
        <span><span className="prefijo">Trabajando actualmente en: </span><strong>{c.nombre.toUpperCase()}</strong></span>
        <Link href="/central">Cambiar</Link>
      </div>
      <MenuCopropiedad enlaces={enlaces.map(({ href, texto }) => ({ href, texto }))} />
      {children}
    </>
  )
}
