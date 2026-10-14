/* eslint-disable @next/next/no-img-element */
import Link from 'next/link'
import { usuarioActual } from '@/lib/datos'
import { tokenValido } from '@/lib/invitaciones'
import { ROLES_COPROPIEDAD } from '@/lib/roles'
import { FormularioAceptar } from './formulario'

export const metadata = { title: 'Invitación' }

type Invitacion = { organizacion: string; rol: string; copropiedad: string | null; rol_copropiedad: string | null; expira_en: string }

// Destino del enlace de invitación. El proxy exige sesión: quien no la tiene ingresa
// primero y vuelve aquí. Solo se muestra la invitación si es para el correo de la cuenta.
export default async function PaginaInvitacion({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams
  const { supabase, usuario } = await usuarioActual()
  let invitacion: Invitacion | null = null
  if (tokenValido(token)) {
    const { data } = await supabase.rpc('consultar_invitacion', { p_token: token })
    invitacion = ((data ?? []) as Invitacion[])[0] ?? null
  }

  return (
    <main className="acceso">
      <div className="acceso-caja">
        <img className="acceso-logo" src="/logo-ph-pro.png" alt="PH PRO" />
        <h1>Invitación al equipo</h1>
        {invitacion && tokenValido(token) ? (
          <>
            <p className="intro">
              Te invitaron a <strong>{invitacion.organizacion}</strong>
              {invitacion.rol === 'administrador' ? ' como administrador' : ''}
              {invitacion.copropiedad && (
                <>
                  {' '}con acceso a <strong>{invitacion.copropiedad}</strong> como{' '}
                  {ROLES_COPROPIEDAD[invitacion.rol_copropiedad as keyof typeof ROLES_COPROPIEDAD] ?? invitacion.rol_copropiedad}
                </>
              )}
              .
            </p>
            <FormularioAceptar token={token} />
          </>
        ) : (
          <p className="aviso error" role="alert">
            Esta invitación no es válida para la cuenta {usuario.email}: puede que ya se haya usado, que haya vencido o que sea para otro correo.
            Pide una nueva a la administración.
          </p>
        )}
        <p className="pequeno" style={{ textAlign: 'center', marginTop: 14 }}><Link href="/central">Ir a PH PRO</Link></p>
      </div>
    </main>
  )
}
