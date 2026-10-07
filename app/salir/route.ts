import { NextResponse, type NextRequest } from 'next/server'
import { crearClienteServidor } from '@/lib/supabase/server'
import { COOKIE_ACTIVIDAD, COOKIE_COPROPIEDAD } from '@/lib/sesion'

export async function POST(request: NextRequest) {
  const supabase = await crearClienteServidor()
  await supabase.auth.signOut()
  const r = NextResponse.redirect(new URL('/ingresar', request.url), { status: 303 })
  r.cookies.delete(COOKIE_ACTIVIDAD)
  r.cookies.delete(COOKIE_COPROPIEDAD)
  return r
}
