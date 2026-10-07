/* eslint-disable @next/next/no-img-element */
export const metadata = { title: 'Configuración pendiente' }

export default function SinConfigurar() {
  return (
    <main className="acceso">
      <div className="acceso-caja">
        <img className="acceso-logo" src="/logo-ph-pro.png" alt="PH PRO" />
        <h1>Falta conectar la base de datos</h1>
        <p className="intro">
          Copia el archivo <code>.env.example</code> como <code>.env.local</code> y completa los datos del proyecto de
          Supabase. Los pasos están en el README.
        </p>
      </div>
    </main>
  )
}
