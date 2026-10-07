/* eslint-disable @next/next/no-img-element */
import { FormularioRecuperar } from './formulario'

export const metadata = { title: 'Recuperar contraseña' }

export default function Recuperar() {
  return (
    <main className="acceso">
      <div className="acceso-caja">
        <img className="acceso-logo" src="/logo-ph-pro.png" alt="PH PRO" />
        <h1>Recupera tu contraseña</h1>
        <p className="intro">Te enviaremos un enlace a tu correo.</p>
        <FormularioRecuperar />
      </div>
    </main>
  )
}
