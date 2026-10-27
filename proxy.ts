import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { configCaptcha } from '@/lib/captcha'
import { encabezadosSeguridad, generarNonce } from '@/lib/encabezados'
import { LIMITES, consumir, ipCliente, type Veredicto } from '@/lib/limite'
import { evaluarOrigen, origenesPermitidos } from '@/lib/origen'
import { COOKIE_ACTIVIDAD, RUTAS_SIN_MFA, cookieActividad, esRutaPublica, sesionExcedeMaximo, sesionVencida } from '@/lib/sesion'

// Corre antes de cada página: pone los encabezados de seguridad (CSP con nonce), rechaza
// envíos de otros sitios (CORS/CSRF), limita las solicitudes por IP y por persona, renueva
// la sesión, exige inicio de sesión, aplica el cierre por inactividad, la duración máxima de
// la sesión y la verificación en dos pasos.
export async function proxy(request: NextRequest) {
  const ruta = request.nextUrl.pathname
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

  const nonce = generarNonce()
  const seguridad = encabezadosSeguridad({
    nonce,
    supabaseUrl: url,
    desarrollo: process.env.NODE_ENV === 'development',
    captcha: configCaptcha()?.csp,
  })
  const proteger = <T extends NextResponse>(r: T) => {
    Object.entries(seguridad).forEach(([k, v]) => r.headers.set(k, v))
    return r
  }
  // Next.js lee el nonce de la CSP de la solicitud y lo pone en sus propios scripts.
  const continuar = () => {
    const h = new Headers(request.headers)
    h.set('x-nonce', nonce)
    h.set('Content-Security-Policy', seguridad['Content-Security-Policy'])
    return proteger(NextResponse.next({ request: { headers: h } }))
  }

  const bloquear = (estado: number, mensaje: string, extra: Record<string, string> = {}) =>
    proteger(new NextResponse(mensaje, { status: estado, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', ...extra } }))
  const demasiadas = (v: Veredicto) =>
    bloquear(429, 'Demasiadas solicitudes. Espera un momento e inténtalo de nuevo.', { 'Retry-After': String(v.reintentarEnSegundos) })

  // CORS y envíos desde otros sitios.
  const origen = evaluarOrigen({
    metodo: request.method,
    origin: request.headers.get('origin'),
    secFetchSite: request.headers.get('sec-fetch-site'),
    propio: request.nextUrl.origin,
    permitidos: origenesPermitidos(process.env.NEXT_PUBLIC_SITE_URL, process.env.ORIGENES_PERMITIDOS),
  })
  if (!origen.permitir) return bloquear(origen.estado, 'Solicitud no permitida.')

  // Límite por IP: cualquier solicitud, y más estricto para envíos.
  const ip = ipCliente(request.headers)
  const esEnvio = request.method !== 'GET' && request.method !== 'HEAD'
  const porIp = await consumir(`solicitudes:ip:${ip}`, LIMITES.solicitudesIp)
  if (!porIp.permitido) return demasiadas(porIp)
  if (esEnvio) {
    const envioIp = await consumir(`envio:ip:${ip}`, LIMITES.envioIp)
    if (!envioIp.permitido) return demasiadas(envioIp)
  }
  if (ruta === '/auth/confirmar') {
    const enlace = await consumir(`enlace:ip:${ip}`, LIMITES.enlaceIp)
    if (!enlace.permitido) return demasiadas(enlace)
  }

  if (!url || !key) {
    if (ruta === '/sin-configurar') return continuar()
    return proteger(NextResponse.redirect(new URL('/sin-configurar', request.url)))
  }

  let respuesta = continuar()
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(porGuardar, encabezados) {
        porGuardar.forEach(({ name, value }) => request.cookies.set(name, value))
        respuesta = continuar()
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
    return proteger(r)
  }

  if (!conSesion) {
    if (esRutaPublica(ruta)) return respuesta
    return redirigir('/ingresar', ruta === '/' ? {} : { siguiente: ruta + request.nextUrl.search })
  }

  // Límite de envíos por persona (además del de su IP).
  if (esEnvio) {
    const envioUsuario = await consumir(`envio:usuario:${data!.claims.sub}`, LIMITES.envioUsuario)
    if (!envioUsuario.permitido) return demasiadas(envioUsuario)
  }

  // Inactividad (30 minutos) o jornada cumplida (12 horas desde el ingreso): se cierra la
  // sesión de este navegador y se pide ingresar de nuevo.
  const vencida = sesionVencida(request.cookies.get(COOKIE_ACTIVIDAD)?.value)
  if (vencida || sesionExcedeMaximo(data?.claims?.amr)) {
    await supabase.auth.signOut({ scope: 'local' })
    const r = redirigir('/ingresar', { motivo: vencida ? 'inactividad' : 'jornada' })
    r.cookies.delete(COOKIE_ACTIVIDAD)
    return r
  }

  // Verificación en dos pasos. La base de datos la exige con RLS (sin aal2 no entrega
  // datos); aquí solo se lleva a la persona a la pantalla que corresponde.
  if (data?.claims?.aal !== 'aal2' && !RUTAS_SIN_MFA.includes(ruta)) {
    // Ya la activó: debe escribir el código en cada sesión.
    const { data: nivel } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    if (nivel?.nextLevel === 'aal2' && nivel.currentLevel !== 'aal2') return redirigir('/verificar')
    // Su rol la exige (administradora, auxiliar, contador, revisor fiscal o administración de
    // la organización) y aún no la ha activado: primero la activa.
    if (ruta !== '/seguridad') {
      const { data: pendiente } = await supabase.rpc('mfa_pendiente')
      if (pendiente === true) return redirigir('/seguridad', { obligatoria: '1' })
    }
  }

  if (ruta === '/ingresar' || ruta === '/recuperar') return redirigir('/central')

  // Cierre por inactividad deslizante: cada solicitud renueva la marca de actividad.
  respuesta.cookies.set(cookieActividad(request.nextUrl.protocol === 'https:'))
  return respuesta
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.png|logo-ph-pro.png|icono-ph-pro.png).*)'],
}
