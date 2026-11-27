import { notFound } from 'next/navigation'
import { Marco, type EnlaceMenu } from '@/components/marco/marco'
import { enlacesGenerales } from '@/components/marco/enlaces'
import { esAdministrador, leerCopropiedad, misOrganizaciones, misPermisos, puede, usuarioActual } from '@/lib/datos'

export default async function LayoutCopropiedad({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params
  // RLS: si la persona no tiene acceso, la copropiedad no existe para ella.
  const c = await leerCopropiedad(id)
  if (!c) notFound()
  const [{ usuario }, permisos, organizaciones] = await Promise.all([usuarioActual(), misPermisos(id), misOrganizaciones()])
  const enlaces: (EnlaceMenu & { ver: boolean })[] = [
    { href: `/c/${id}`, texto: 'Resumen', icono: 'resumen', exacto: true, ver: true },
    { href: `/c/${id}/unidades`, texto: 'Unidades', icono: 'unidades', ver: puede(permisos, 'unidades', 'V') },
    { href: `/c/${id}/personas`, texto: 'Personas', icono: 'personas', ver: puede(permisos, 'personas', 'V') },
    { href: `/c/${id}/porteria`, texto: 'Portería', icono: 'porteria', ver: puede(permisos, 'porteria', 'V') },
    { href: `/c/${id}/importar`, texto: 'Importar', icono: 'importar', ver: puede(permisos, 'importar', 'V') },
    { href: `/c/${id}/marca`, texto: 'Identidad', icono: 'identidad', ver: puede(permisos, 'perfil', 'V') },
  ]

  return (
    <Marco
      correo={usuario.email ?? ''}
      general={enlacesGenerales(organizaciones.some(esAdministrador))}
      copropiedad={{ nombre: c.nombre, enlaces: enlaces.filter((e) => e.ver).map(({ ver: _, ...e }) => e) }}
    >
      {children}
    </Marco>
  )
}
