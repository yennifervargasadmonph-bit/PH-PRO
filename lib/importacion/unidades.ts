// Lectura y validación de un archivo de unidades (PH PRO DATA).
// Funciones puras: no tocan la base de datos. Nada se escribe hasta que la administración aprueba.

export const TIPOS_UNIDAD = {
  apartamento: 'Apartamento',
  casa: 'Casa',
  local: 'Local',
  oficina: 'Oficina',
  parqueadero: 'Parqueadero',
  deposito: 'Depósito',
  otro: 'Otro',
} as const
export type TipoUnidad = keyof typeof TIPOS_UNIDAD

export const CAMPOS = {
  torre: { etiqueta: 'Torre o bloque', obligatorio: false },
  numero: { etiqueta: 'Número de unidad', obligatorio: true },
  tipo: { etiqueta: 'Tipo', obligatorio: false },
  coeficiente: { etiqueta: 'Coeficiente', obligatorio: true },
  area_m2: { etiqueta: 'Área (m²)', obligatorio: false },
  matricula_inmobiliaria: { etiqueta: 'Matrícula inmobiliaria', obligatorio: false },
} as const
export type Campo = keyof typeof CAMPOS
export type Mapeo = Partial<Record<Campo, number>>

const ALIAS: Record<Campo, string[]> = {
  torre: ['torre', 'bloque', 'interior', 'edificio', 'etapa', 'manzana'],
  numero: ['numero', 'unidad', 'apartamento', 'apto', 'apt', 'casa', 'inmueble', 'no', 'num', 'local'],
  tipo: ['tipo', 'tipo de unidad', 'clase', 'uso', 'destinacion'],
  coeficiente: ['coeficiente', 'coef', 'coeficiente de copropiedad', 'participacion', 'porcentaje', '%', 'indiviso'],
  area_m2: ['area', 'area m2', 'area privada', 'metros', 'm2', 'area construida'],
  matricula_inmobiliaria: ['matricula', 'matricula inmobiliaria', 'folio', 'folio de matricula'],
}

export const normalizarTexto = (s: unknown) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[²]/g, '2')
    .replace(/[^a-z0-9%]+/g, ' ')
    .trim()

/** Busca la fila de encabezados (entre las primeras 10) y propone qué columna corresponde a cada campo. */
export function detectarEncabezados(filas: unknown[][]): { filaEncabezado: number; mapeo: Mapeo } {
  let mejor = { filaEncabezado: 0, mapeo: {} as Mapeo, aciertos: -1 }
  for (let i = 0; i < Math.min(filas.length, 10); i++) {
    const mapeo = sugerirMapeo(filas[i] ?? [])
    const aciertos = Object.keys(mapeo).length
    if (aciertos > mejor.aciertos) mejor = { filaEncabezado: i, mapeo, aciertos }
  }
  return { filaEncabezado: mejor.filaEncabezado, mapeo: mejor.mapeo }
}

export function sugerirMapeo(encabezados: unknown[]): Mapeo {
  const nombres = encabezados.map(normalizarTexto)
  const mapeo: Mapeo = {}
  const usadas = new Set<number>()
  // Primero coincidencias exactas, luego parciales, para no confundir "tipo" con "tipo de unidad".
  for (const exacta of [true, false]) {
    for (const campo of Object.keys(ALIAS) as Campo[]) {
      if (mapeo[campo] !== undefined) continue
      const i = nombres.findIndex(
        (n, idx) => !usadas.has(idx) && n && ALIAS[campo].some((a) => (exacta ? n === a : n.startsWith(a + ' ') || n.endsWith(' ' + a))),
      )
      if (i >= 0) {
        mapeo[campo] = i
        usadas.add(i)
      }
    }
  }
  return mapeo
}

/**
 * Convierte un número escrito a la colombiana o a la inglesa: "1.234,56", "1,234.56", "0,5", "2.5 %".
 * Devuelve null si no es un número.
 */
export function leerNumero(valor: unknown): number | null {
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : null
  let s = String(valor ?? '').replace(/[%\s$]/g, '').trim()
  if (!s) return null
  const coma = s.lastIndexOf(',')
  const punto = s.lastIndexOf('.')
  if (coma >= 0 && punto >= 0) {
    // El separador que aparece de último es el decimal.
    s = coma > punto ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')
  } else if (coma >= 0) {
    s = (s.match(/,/g) ?? []).length > 1 ? s.replace(/,/g, '') : s.replace(',', '.')
  } else if ((s.match(/\./g) ?? []).length > 1) {
    s = s.replace(/\./g, '')
  }
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null
  return Number(s)
}

export function leerTipo(valor: unknown): TipoUnidad | null {
  const n = normalizarTexto(valor)
  if (!n) return 'apartamento'
  if (/^ap(to|artamento)?s?$|^apart/.test(n)) return 'apartamento'
  if (/^casa/.test(n)) return 'casa'
  if (/^local/.test(n)) return 'local'
  if (/^oficina|^consultorio/.test(n)) return 'oficina'
  if (/^parq|^garaje|^garage/.test(n)) return 'parqueadero'
  if (/^deposito|^bodega|^cuarto util/.test(n)) return 'deposito'
  if (/^otro/.test(n)) return 'otro'
  return null
}

export type FilaUnidad = {
  fila: number
  torre: string
  numero: string
  tipo: TipoUnidad
  coeficiente: number
  area_m2: number | null
  matricula_inmobiliaria: string
}
export type Rechazo = { fila: number; motivo: string }

const textoCelda = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim())

/**
 * Valida las filas de datos con el mapeo elegido.
 * Si los coeficientes vienen como fracción (suman cerca de 1), los pasa a porcentaje.
 */
export function validarFilas(filas: unknown[][], mapeo: Mapeo, filaEncabezado: number) {
  const faltan = (Object.keys(CAMPOS) as Campo[]).filter((c) => CAMPOS[c].obligatorio && mapeo[c] === undefined)
  if (faltan.length) {
    return { validas: [] as FilaUnidad[], rechazos: [] as Rechazo[], escala: 1, error: `Indica la columna de: ${faltan.map((c) => CAMPOS[c].etiqueta).join(', ')}.` }
  }

  const celda = (f: unknown[], c: Campo) => (mapeo[c] === undefined ? undefined : f[mapeo[c]!])
  const datos = filas.slice(filaEncabezado + 1).map((f, i) => ({ f, fila: filaEncabezado + i + 2 }))
  const conDatos = datos.filter(({ f }) => f.some((v) => textoCelda(v) !== ''))

  const coefs = conDatos.map(({ f }) => leerNumero(celda(f, 'coeficiente'))).filter((n): n is number => n !== null && n > 0)
  const suma = coefs.reduce((a, b) => a + b, 0)
  const escala = coefs.length > 1 && coefs.every((n) => n <= 1) && suma > 0.98 && suma < 1.02 ? 100 : 1

  const validas: FilaUnidad[] = []
  const rechazos: Rechazo[] = []
  const vistas = new Map<string, number>()

  for (const { f, fila } of conDatos) {
    const torre = textoCelda(celda(f, 'torre')).toUpperCase()
    const numero = textoCelda(celda(f, 'numero')).toUpperCase()
    const coefLeido = leerNumero(celda(f, 'coeficiente'))
    const tipo = leerTipo(celda(f, 'tipo'))
    const areaTexto = textoCelda(celda(f, 'area_m2'))
    const area = areaTexto ? leerNumero(areaTexto) : null
    const matricula = textoCelda(celda(f, 'matricula_inmobiliaria'))

    const motivo = !numero
      ? 'Falta el número de unidad.'
      : numero.length > 20 || torre.length > 20
        ? 'La torre o el número son demasiado largos.'
        : coefLeido === null
          ? 'El coeficiente no es un número.'
          : coefLeido <= 0 || coefLeido * escala > 100
            ? 'El coeficiente debe ser mayor que 0 y como máximo 100 %.'
            : tipo === null
              ? `No reconocemos el tipo "${textoCelda(celda(f, 'tipo'))}".`
              : areaTexto && (area === null || area <= 0)
                ? 'El área no es válida.'
                : matricula.length > 30
                  ? 'La matrícula es demasiado larga.'
                  : null
    if (motivo) {
      rechazos.push({ fila, motivo })
      continue
    }
    const llave = `${torre}|${numero}`
    if (vistas.has(llave)) {
      rechazos.push({ fila, motivo: `Repite la unidad de la fila ${vistas.get(llave)}.` })
      continue
    }
    vistas.set(llave, fila)
    validas.push({
      fila,
      torre,
      numero,
      tipo: tipo!,
      coeficiente: Math.round(coefLeido! * escala * 1e6) / 1e6,
      area_m2: area === null ? null : Math.round(area * 100) / 100,
      matricula_inmobiliaria: matricula,
    })
  }
  return { validas, rechazos, escala, error: null as string | null }
}

export type UnidadExistente = Omit<FilaUnidad, 'fila'> & { activa: boolean }
export type Clasificacion = 'nueva' | 'actualizada' | 'sin_cambios'

/** Compara contra las unidades que ya existen. Llave: torre + número. */
export function clasificar(validas: FilaUnidad[], existentes: UnidadExistente[]) {
  const porLlave = new Map(existentes.map((e) => [`${e.torre}|${e.numero}`, e]))
  return validas.map((v) => {
    const e = porLlave.get(`${v.torre}|${v.numero}`)
    let estado: Clasificacion = 'nueva'
    if (e) {
      const igual =
        e.tipo === v.tipo &&
        Number(e.coeficiente) === v.coeficiente &&
        (e.area_m2 === null ? null : Number(e.area_m2)) === v.area_m2 &&
        e.matricula_inmobiliaria === v.matricula_inmobiliaria &&
        e.activa
      estado = igual ? 'sin_cambios' : 'actualizada'
    }
    return { ...v, estado, anterior: e ?? null }
  })
}

/** Separa un CSV (coma o punto y coma, con comillas) en filas y celdas. */
export function leerCsv(texto: string): string[][] {
  const limpio = texto.replace(/^﻿/, '')
  const primera = limpio.split(/\r?\n/, 1)[0] ?? ''
  const sep = (primera.match(/;/g) ?? []).length > (primera.match(/,/g) ?? []).length ? ';' : ','
  const filas: string[][] = []
  let fila: string[] = []
  let celda = ''
  let comillas = false
  for (let i = 0; i < limpio.length; i++) {
    const c = limpio[i]
    if (comillas) {
      if (c === '"' && limpio[i + 1] === '"') {
        celda += '"'
        i++
      } else if (c === '"') comillas = false
      else celda += c
    } else if (c === '"') comillas = true
    else if (c === sep) {
      fila.push(celda)
      celda = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && limpio[i + 1] === '\n') i++
      fila.push(celda)
      filas.push(fila)
      fila = []
      celda = ''
    } else celda += c
  }
  if (celda || fila.length) {
    fila.push(celda)
    filas.push(fila)
  }
  return filas
}

export const PLANTILLA_CSV = 'Torre;Número;Tipo;Coeficiente;Área m2;Matrícula inmobiliaria\n1;101;Apartamento;1,25;72,5;50N-1234567\n1;102;Apartamento;1,25;72,5;\n;Local 1;Local;0,8;40;\n'
