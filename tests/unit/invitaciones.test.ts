import { describe, expect, it } from 'vitest'
import { MENSAJE_INVITACION, enlaceInvitacion, tokenValido } from '@/lib/invitaciones'

describe('invitaciones', () => {
  it('el mensaje no revela si el correo tiene cuenta', () => {
    expect(MENSAJE_INVITACION).toBe('Si el correo corresponde a una cuenta o se registra, recibirá la invitación.')
  })

  it('arma el enlace con el token', () => {
    const t = 'a'.repeat(64)
    expect(enlaceInvitacion('https://phpro.co', t)).toBe(`https://phpro.co/invitacion?token=${t}`)
    expect(enlaceInvitacion('http://localhost:3000/', t)).toBe(`http://localhost:3000/invitacion?token=${t}`)
  })

  it('solo acepta tokens de 64 caracteres hexadecimales', () => {
    expect(tokenValido('0123456789abcdef'.repeat(4))).toBe(true)
    expect(tokenValido('0123456789ABCDEF'.repeat(4))).toBe(false)
    expect(tokenValido('a'.repeat(63))).toBe(false)
    expect(tokenValido("' or 1=1 --")).toBe(false)
    expect(tokenValido(undefined)).toBe(false)
  })
})
