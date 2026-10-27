'use server'
import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { crearClienteServidor } from '@/lib/supabase/server'
import { tokenCaptcha } from '@/lib/captcha'
import { LIMITES, consumir, ipCliente, mensajeLimite } from '@/lib/limite'
import { cookieActividad, destinoSeguro } from '@/lib/sesion'
import { FALTA_URL_SITIO, urlSitio } from '@/lib/sitio'

export type EstadoFormulario = { error?: string; ok?: string }

const esquema = z.object({
  correo: z.string().trim().toLowerCase().max(254, 'Escribe un correo válido.').pipe(z.email('Escribe un correo válido.')),
  clave: z.string().min(1, 'Escribe tu contraseña.').max(256, 'La contraseña es demasiado larga.'),
  siguiente: z.string().max(2048).optional(),
})

/** Límite de intentos de ingreso y recuperación: por IP y por correo. */
async function limitarIngreso(correo: string) {
  const ip = ipCliente(await headers())
  for (const [clave, regla] of [
    [`ingreso:ip:${ip}`, LIMITES.ingresoIp],
    [`ingreso:correo:${correo}`, LIMITES.ingresoCorreo],
  ] as const) {
    const v = await consumir(clave, regla)
    if (!v.permitido) return mensajeLimite(v)
  }
  return null
}

export async function ingresar(_: EstadoFormulario, formulario: FormData): Promise<EstadoFormulario> {
  const datos = esquema.safeParse(Object.fromEntries(formulario))
  if (!datos.success) return { error: datos.error.issues[0].message }
  const limite = await limitarIngreso(datos.data.correo)
  if (limite) return { error: limite }
  const captcha = tokenCaptcha(formulario)
  if (captcha.error) return { error: captcha.error }

  const supabase = await crearClienteServidor()
  const { error } = await supabase.auth.signInWithPassword({
    email: datos.data.correo,
    password: datos.data.clave,
    options: { captchaToken: captcha.token },
  })
  if (error) {
    // Mensaje genérico: no revela si el correo existe.
    if (error.status === 429) return { error: 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.' }
    if (error.code === 'captcha_failed') return { error: 'La verificación de seguridad falló. Inténtalo de nuevo.' }
    return { error: 'El correo o la contraseña no coinciden.' }
  }
  // Empieza a contar la inactividad desde el ingreso (sin esta marca el proxy cierra la sesión).
  const almacen = await cookies()
  almacen.set(cookieActividad(process.env.NODE_ENV === 'production'))
  redirect(destinoSeguro(datos.data.siguiente))
}

export async function recuperar(_: EstadoFormulario, formulario: FormData): Promise<EstadoFormulario> {
  const correo = z.string().trim().toLowerCase().max(254).pipe(z.email()).safeParse(formulario.get('correo'))
  if (!correo.success) return { error: 'Escribe un correo válido.' }
  const limite = await limitarIngreso(correo.data)
  if (limite) return { error: limite }
  const sitio = urlSitio()
  if (!sitio) return { error: FALTA_URL_SITIO }
  const captcha = tokenCaptcha(formulario)
  if (captcha.error) return { error: captcha.error }
  const supabase = await crearClienteServidor()
  const { error } = await supabase.auth.resetPasswordForEmail(correo.data, {
    redirectTo: `${sitio}/auth/confirmar?siguiente=/nueva-clave`,
    captchaToken: captcha.token,
  })
  // Un CAPTCHA rechazado sí se informa (no revela nada sobre la cuenta).
  if (error?.code === 'captcha_failed') return { error: 'La verificación de seguridad falló. Inténtalo de nuevo.' }
  // Siempre la misma respuesta, exista o no la cuenta.
  return { ok: 'Si el correo está registrado, te enviamos un enlace para crear una nueva contraseña.' }
}
