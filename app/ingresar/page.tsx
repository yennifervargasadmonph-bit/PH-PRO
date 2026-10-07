/* eslint-disable @next/next/no-img-element */
import { FormularioIngreso } from './formulario'

export const metadata = { title: 'Ingresar' }

export default async function Ingresar({ searchParams }: { searchParams: Promise<{ siguiente?: string; motivo?: string }> }) {
  const { siguiente, motivo } = await searchParams
  return (
    <main className="acceso">
      <div className="acceso-caja">
        <img className="acceso-logo" src="/logo-ph-pro.png" alt="PH PRO" />
        <h1>Ingresa a PH PRO</h1>
        <p className="intro">Administración de propiedad horizontal</p>
        {motivo === 'inactividad' && (
          <p className="aviso info" style={{ marginBottom: 14 }}>Cerramos tu sesión por 30 minutos sin actividad.</p>
        )}
        <FormularioIngreso siguiente={siguiente} />
      </div>
    </main>
  )
}
