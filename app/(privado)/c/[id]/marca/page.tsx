import { notFound } from 'next/navigation'
import { misPermisos, puede } from '@/lib/datos'
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
      <div className="cabecera">
        <div>
          <h1>Identidad del edificio</h1>
          <p className="tenue">Logo, nombre completo, NIT y celular con los que se preparan todos los documentos de esta copropiedad. Cada cambio queda en la bitácora.</p>
        </div>
      </div>
      <FormularioIdentidad copropiedadId={id} identidad={identidad} editable={puede(permisos, 'perfil', 'E')} />
    </>
  )
}
