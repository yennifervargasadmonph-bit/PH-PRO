import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { COOKIE_ACTIVIDAD, MINUTOS_INACTIVIDAD, esRutaPublica, sesionVencida } from '@/lib/sesion'

// Corre antes de cada página: renueva la sesión, exige inicio de sesión,
// aplica el cierre por inactividad y la verificación en dos pasos.
export async function proxy(request: NextRequest) {
  const ruta = request.nextUrl.pathname
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) {
    if (ruta === '/sin-configurar') return NextResponse.next()
    return NextResponse.redirect(new URL('/sin-configurar', request.url))
  }

  let respuesta = NextResponse.next({ request })
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(porGuardar, encabezados) {
        porGuardar.forEach(({ name, value }) => request.cookies.set(name, value))
        respuesta = NextResponse.next({ request })
        porGuardar.forEach(({ name, value, options }) => respuesta.cookies.set(name, value, options))
        Object.entries(encabezados ?? {}).forEach(([k, v]) => respuesta.headers.set(k, v))
      },
    },
  })

  const { data } = await supabase.auth.getClaims()
  const conSesion = Boolean(data?.claims?.sub)
  const redirigir = (destino: string, params: Record<string, string> = {}) => {
    const u = new URL(destino, request.url)
    Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v))
    const r = NextResponse.redirect(u)
    respuesta.cookies.getAll().forEach((c) => r.cookies.set(c))
    return r
  }

  if (!conSesion) {
    if (esRutaPublica(ruta)) return respuesta
    return redirigir('/ingresar', ruta === '/' ? {} : { siguiente: ruta + request.nextUrl.search })
  }

  if (sesionVencida(request.cookies.get(COOKIE_ACTIVIDAD)?.value)) {
    await supabase.auth.signOut()
    const r = redirigir('/ingresar', { motivo: 'inactividad' })
    r.cookies.delete(COOKIE_ACTIVIDAD)
    return r
  }

  // Verificación en dos pasos: si la persona la activó, exige el código en cada sesión.
  if (data?.claims?.aal === 'aal1' && ruta !== '/verificar' && ruta !== '/salir') {
    const { data: nivel } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    if (nivel?.nextLevel === 'aal2' && nivel.currentLevel !== 'aal2') return redirigir('/verificar')
  }

  if (ruta === '/ingresar' || ruta === '/recuperar') return redirigir('/central')

  respuesta.cookies.set(COOKIE_ACTIVIDAD, String(Date.now()), {
    httpOnly: true,
    sameSite: 'lax',
    secure: request.nextUrl.protocol === 'https:',
    path: '/',
    maxAge: MINUTOS_INACTIVIDAD * 60 * 4,
  })
  return respuesta
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.png|logo-ph-pro.png|icono-ph-pro.png).*)'],
}
