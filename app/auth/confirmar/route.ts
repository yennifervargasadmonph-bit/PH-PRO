import { NextResponse, type NextRequest } from 'next/server'
import type { EmailOtpType } from '@supabase/supabase-js'
import { crearClienteServidor } from '@/lib/supabase/server'
import { destinoSeguro } from '@/lib/sesion'

// Destino de los enlaces que envía el proveedor (recuperación de contraseña, invitaciones).
export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams
  const siguiente = destinoSeguro(p.get('siguiente'))
  const supabase = await crearClienteServidor()

  const code = p.get('code')
  const tokenHash = p.get('token_hash')
  const tipo = p.get('type') as EmailOtpType | null
  const { error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : tokenHash && tipo
      ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type: tipo })
      : { error: new Error('Enlace incompleto') }

  if (error) return NextResponse.redirect(new URL('/ingresar?motivo=enlace', request.url))
  return NextResponse.redirect(new URL(siguiente, request.url))
}
