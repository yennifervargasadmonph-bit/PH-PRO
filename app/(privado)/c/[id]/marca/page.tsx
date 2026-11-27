import { notFound } from 'next/navigation'
import { misPermisos, puede } from '@/lib/datos'
import { Cabecera } from '@/components/ui/cabecera'
import { obtenerIdentidad } from '@/lib/identidad-servidor'
import { FormularioIdentidad } from './formulario'

export const metadata = { title: 'Identidad del edificio' }

export default async function PaginaIdentidad({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const permisos = await misPermisos(id)
  if (!puede(permisos, 'perfil', 'V')) notFound()
  const identidad = await obtenerIdentidad(id)
  if (!identidad) notFound()

  return (
    <>
      <Cabecera titulo="Identidad" meta="Logo, nombre completo, NIT y celular de los documentos de esta copropiedad. Cada cambio queda en la bitácora." />
      <FormularioIdentidad copropiedadId={id} identidad={identidad} editable={puede(permisos, 'perfil', 'E')} />
    </>
  )
}
