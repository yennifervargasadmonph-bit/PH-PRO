// Datos de EJEMPLO para la vista previa del diseño (solo desarrollo). No son datos reales y
// nunca se usan fuera de app/vista-previa.
import type { Copropiedad, Organizacion } from '@/lib/datos'
import type { Autorizacion, DatosPersona, Persona, Politica, Vinculo } from '@/lib/personas'
import type { DatosPersonas } from '@/lib/personas-servidor'
import type { Unidad } from '@/lib/unidades'
import type { EventoHistorial } from '@/app/(privado)/c/[id]/unidades/[unidad]/vista'

export const COPRO = '00000000-0000-4000-8000-000000000001'
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

export const ORG: Organizacion = { id: id(900), nombre: 'Administración de ejemplo', nit: '900123456-8', rol: 'propietario' }

export const COPROPIEDAD: Copropiedad = {
  id: COPRO,
  organizacion_id: ORG.id,
  nombre: 'Edificio Ejemplo 23',
  nit: '900123456-8',
  tipo: 'edificio',
  ciudad: 'Bogotá D.C.',
  direccion: 'Calle 23 # 4-56',
  prefijo: 'E23',
  activa: true,
}

const u = (n: number, torre: string, numero: string, coef: string, tipo: Unidad['tipo'] = 'apartamento', area: string | null = '72.50'): Unidad => ({
  id: id(100 + n),
  copropiedad_id: COPRO,
  torre,
  numero,
  tipo,
  coeficiente: coef,
  area_m2: area,
  matricula_inmobiliaria: area ? `50C-${1200 + n}` : '',
  activa: true,
})
export const UNIDADES: Unidad[] = [
  u(1, '1', '101', '14.500000'),
  u(2, '1', '102', '14.500000'),
  u(3, '1', '201', '14.500000'),
  u(4, '1', '202', '14.500000', 'apartamento', null),
  u(5, '2', '101', '14.000000'),
  u(6, '2', '102', '14.000000'),
  u(7, '', 'L-1', '14.000000', 'local', '48.00'),
]

const p = (n: number, nombre: string, tipo: Persona['tipo_persona'] = 'natural', conservar: string | null = null): Persona => ({
  id: id(200 + n),
  copropiedad_id: COPRO,
  tipo_persona: tipo,
  nombre,
  activa: true,
  conservar_hasta: conservar,
})
const PERSONAS: Persona[] = [
  p(1, 'Ana María Pérez Rojas'),
  p(2, 'Bruno Díaz Mejía'),
  p(3, 'Carla Gómez Acosta'),
  p(4, 'Diego Ruiz Lozano'),
  p(5, 'Elena Suárez Pinto'),
  p(6, 'Fernando Castro Díaz', 'natural', '2029-03-31'),
  p(7, 'Gloria Marín Téllez'),
  p(8, 'Inversiones Ejemplo S.A.S.', 'juridica'),
  p(9, 'Hernán Ospina Vélez'),
]
export const PERSONA_ANA = PERSONAS[0].id

const d = (n: number, doc: string | null, correo: string | null, celular: string | null): DatosPersona => ({
  persona_id: id(200 + n),
  tipo_documento: doc ? (n === 8 ? 'NIT' : 'CC') : null,
  numero_documento: doc,
  correo,
  celular,
  telefono: null,
})
const DATOS = [
  d(1, '52123456', 'ana.perez@ejemplo.co', '3001234567'),
  d(2, '79111222', null, '3109998877'),
  d(4, '80555444', 'diego.ruiz@ejemplo.co', null),
  d(5, '41222333', 'elena.suarez@ejemplo.co', '3157654321'),
  d(8, '901222333-4', 'contacto@ejemplo.co', null),
]

const v = (n: number, unidad: number, persona: number, tipo: Vinculo['tipo'], desde: string | null, extra: Partial<Vinculo> = {}): Vinculo => ({
  id: id(300 + n),
  unidad_id: id(100 + unidad),
  persona_id: id(200 + persona),
  tipo,
  es_titular: false,
  reside: false,
  desde,
  hasta: null,
  ...extra,
})
const VINCULOS: Vinculo[] = [
  v(1, 1, 1, 'propietario', '2020-01-15', { es_titular: true, reside: true }),
  v(2, 6, 1, 'propietario', '2021-06-01', { es_titular: true }),
  v(3, 6, 2, 'arrendatario', '2024-03-01', { reside: true }),
  v(4, 1, 3, 'autorizado', '2025-08-10'),
  v(5, 2, 4, 'propietario', '2019-11-20', { es_titular: true, reside: true }),
  v(6, 3, 5, 'propietario', '2024-04-01', { es_titular: true, reside: true }),
  v(7, 3, 6, 'propietario', '2012-05-02', { es_titular: true, reside: true, hasta: '2024-03-31' }),
  v(8, 4, 7, 'residente', null, { reside: true }),
  v(9, 7, 8, 'propietario', '2018-02-01', { es_titular: true }),
  v(10, 7, 9, 'apoderado', '2025-01-10'),
  v(11, 1, 2, 'residente', '2016-03-01', { reside: true, hasta: '2019-12-31' }),
]

export const POLITICAS: Politica[] = [
  {
    id: id(400),
    version: '1.0',
    vigente_desde: '2026-02-01',
    meses_conservacion: 60,
    texto: 'Texto de ejemplo de la política de tratamiento de datos personales de la copropiedad. En la aplicación real aquí va el texto aprobado por la administración.',
    creado_en: '2026-02-01T14:00:00Z',
  },
]

const a = (n: number, persona: number, otorgada: string, revocada: string | null = null): Autorizacion => ({
  id: id(500 + n),
  persona_id: id(200 + persona),
  politica_id: id(400),
  canal: n % 2 ? 'escrito' : 'formulario_web',
  otorgada_en: otorgada,
  finalidades: ['administracion', 'comunicaciones', 'seguridad'],
  registrada_en: `${otorgada}T15:00:00Z`,
  revocada_en: revocada,
  revocacion_canal: revocada ? 'correo' : null,
})
const AUTORIZACIONES = [a(1, 1, '2026-02-10'), a(2, 2, '2026-03-04'), a(3, 4, '2026-02-12'), a(4, 5, '2026-02-20', '2026-09-15'), a(5, 8, '2026-04-02')]

export const DATOS_PERSONAS: DatosPersonas = {
  personas: PERSONAS,
  datos: new Map(DATOS.map((x) => [x.persona_id, x])),
  vinculos: VINCULOS,
  autorizaciones: AUTORIZACIONES,
  politicas: POLITICAS,
  unidades: UNIDADES.map(({ id, torre, numero, activa }) => ({ id, torre, numero, activa })),
}

export const HISTORIAL_101: EventoHistorial[] = [
  { creado_en: '2025-08-10T16:20:00Z', accion: 'insert', entidad: 'vinculos_unidad', tipo: 'autorizado', cambios: [], autor: 'Auxiliar de ejemplo' },
  { creado_en: '2026-01-20T13:05:00Z', accion: 'update', entidad: 'unidades', tipo: null, cambios: ['actualizado_en', 'area_m2'], autor: 'Administradora de ejemplo' },
  { creado_en: '2025-07-01T15:40:00Z', accion: 'update', entidad: 'vinculos_unidad', tipo: 'residente', cambios: ['actualizado_en', 'hasta'], autor: 'Administradora de ejemplo' },
  { creado_en: '2025-06-30T15:30:00Z', accion: 'insert', entidad: 'vinculos_unidad', tipo: 'propietario', cambios: [], autor: 'Administradora de ejemplo' },
  { creado_en: '2025-06-30T15:00:00Z', accion: 'insert', entidad: 'unidades', tipo: null, cambios: [], autor: 'Administradora de ejemplo' },
].sort((x, y) => y.creado_en.localeCompare(x.creado_en))
