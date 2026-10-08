'use client'
import Link from 'next/link'
import { useMemo, useState, useTransition } from 'react'
import { readSheet } from 'read-excel-file/browser'
import {
  CAMPOS, PLANTILLA_CSV, TIPOS_UNIDAD, clasificar, detectarEncabezados, leerCsv, validarFilas,
  type Campo, type Mapeo, type UnidadExistente,
} from '@/lib/importacion/unidades'
import { nombreUnidad } from '@/lib/unidades'
import { aplicarImportacion, type Resultado } from './acciones'

type Cargado = { archivo: string; filas: unknown[][]; filaEncabezado: number }
const fmt = (n: number | null) => (n === null ? '—' : n.toLocaleString('es-CO', { maximumFractionDigits: 6 }))

export function Importador({ copropiedadId, existentes, puedeAprobar }: { copropiedadId: string; existentes: UnidadExistente[]; puedeAprobar: boolean }) {
  const [cargado, setCargado] = useState<Cargado | null>(null)
  const [mapeo, setMapeo] = useState<Mapeo>({})
  const [error, setError] = useState('')
  const [resultado, setResultado] = useState<Resultado | null>(null)
  const [aplicando, iniciar] = useTransition()

  async function leer(archivo: File) {
    setError('')
    setResultado(null)
    try {
      const nombre = archivo.name.toLowerCase()
      let filas: unknown[][]
      if (nombre.endsWith('.csv') || nombre.endsWith('.txt')) {
        const bytes = new Uint8Array(await archivo.arrayBuffer())
        let texto: string
        try {
          texto = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
        } catch {
          texto = new TextDecoder('windows-1252').decode(bytes) // Excel en español guarda CSV así
        }
        filas = leerCsv(texto)
      } else if (nombre.endsWith('.xlsx')) {
        filas = (await readSheet(archivo)) as unknown[][]
      } else {
        setError('Usa un archivo .xlsx o .csv. Si tienes un .xls antiguo, ábrelo en Excel y guárdalo como .xlsx.')
        return
      }
      if (filas.length < 2) {
        setError('El archivo no tiene filas de datos.')
        return
      }
      const { filaEncabezado, mapeo } = detectarEncabezados(filas)
      setCargado({ archivo: archivo.name, filas, filaEncabezado })
      setMapeo(mapeo)
    } catch {
      setError('No pudimos leer el archivo. Verifica que no esté protegido con contraseña.')
    }
  }

  const revision = useMemo(() => {
    if (!cargado) return null
    const v = validarFilas(cargado.filas, mapeo, cargado.filaEncabezado)
    return { ...v, clasificadas: clasificar(v.validas, existentes) }
  }, [cargado, mapeo, existentes])

  const conteo = useMemo(() => {
    const c = { nueva: 0, actualizada: 0, sin_cambios: 0 }
    revision?.clasificadas.forEach((x) => c[x.estado]++)
    return c
  }, [revision])

  const sumaFinal = useMemo(() => {
    if (!revision) return 0
    const porLlave = new Map(existentes.filter((e) => e.activa).map((e) => [`${e.torre}|${e.numero}`, Number(e.coeficiente)]))
    revision.validas.forEach((v) => porLlave.set(`${v.torre}|${v.numero}`, v.coeficiente))
    return [...porLlave.values()].reduce((a, b) => a + b, 0)
  }, [revision, existentes])

  function aprobar() {
    if (!cargado || !revision) return
    iniciar(async () => {
      const r = await aplicarImportacion(copropiedadId, {
        archivo: cargado.archivo,
        filas: revision.validas.map(({ fila: _fila, ...resto }) => resto),
        rechazos: revision.rechazos,
      })
      setResultado(r)
      if (!r.error) setCargado(null)
    })
  }

  function descargarPlantilla() {
    const blob = new Blob(['﻿' + PLANTILLA_CSV], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'plantilla-unidades-ph-pro.csv'
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const encabezados = cargado ? (cargado.filas[cargado.filaEncabezado] ?? []).map((h, i) => String(h ?? '').trim() || `Columna ${i + 1}`) : []
  const cambios = conteo.nueva + conteo.actualizada

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      {resultado && !resultado.error && (
        <p className="aviso ok" role="status">
          Importación aplicada: {resultado.nuevas} nuevas, {resultado.actualizadas} actualizadas, {resultado.sin_cambios} sin cambios y {resultado.rechazadas} rechazadas.{' '}
          <Link href={`/c/${copropiedadId}/unidades`}>Ver unidades</Link>
        </p>
      )}
      {resultado?.error && <p className="aviso error" role="alert">{resultado.error}</p>}

      <section className="panel">
        <h2>1. Carga el archivo</h2>
        <div className="zona-archivo">
          <p style={{ margin: 0 }}>Un archivo <strong>.xlsx</strong> o <strong>.csv</strong> con una fila por unidad.</p>
          <p className="tenue pequeno" style={{ margin: 0 }}>Columnas: Torre (opcional), Número, Tipo, Coeficiente, Área m² y Matrícula inmobiliaria.</p>
          <label className="boton" style={{ display: 'inline-flex' }}>
            Elegir archivo
            <input type="file" accept=".xlsx,.csv,.txt" hidden onChange={(e) => e.target.files?.[0] && leer(e.target.files[0])} />
          </label>
          <button type="button" className="boton secundario pequeno" onClick={descargarPlantilla}>Descargar plantilla</button>
        </div>
        {error && <p className="aviso error" role="alert" style={{ marginTop: 12 }}>{error}</p>}
      </section>

      {cargado && revision && (
        <>
          <section className="panel">
            <h2>2. Confirma las columnas</h2>
            <p className="tenue pequeno">Archivo: {cargado.archivo}. Encabezados en la fila {cargado.filaEncabezado + 1}.</p>
            <div className="fila">
              {(Object.keys(CAMPOS) as Campo[]).map((c) => (
                <label key={c}>
                  {CAMPOS[c].etiqueta}{!CAMPOS[c].obligatorio && <small> (opcional)</small>}
                  <select value={mapeo[c] ?? ''} onChange={(e) => setMapeo({ ...mapeo, [c]: e.target.value === '' ? undefined : Number(e.target.value) })}>
                    <option value="">— No está en el archivo —</option>
                    {encabezados.map((h, i) => <option key={i} value={i}>{h}</option>)}
                  </select>
                </label>
              ))}
            </div>
          </section>

          <section className="panel">
            <h2>3. Revisa antes de aprobar</h2>
            {revision.error ? (
              <p className="aviso error">{revision.error}</p>
            ) : (
              <>
                <div className="cifras">
                  <div className="cifra"><span>Nuevas</span><strong>{conteo.nueva}</strong></div>
                  <div className="cifra"><span>Actualizadas</span><strong>{conteo.actualizada}</strong></div>
                  <div className="cifra"><span>Sin cambios</span><strong>{conteo.sin_cambios}</strong></div>
                  <div className={`cifra ${revision.rechazos.length ? 'alerta' : ''}`}><span>Rechazadas</span><strong>{revision.rechazos.length}</strong></div>
                  <div className={`cifra ${Math.abs(sumaFinal - 100) < 0.0005 ? 'bien' : 'alerta'}`}><span>Coeficientes después de importar</span><strong>{fmt(sumaFinal)} %</strong></div>
                </div>
                {revision.escala === 100 && <p className="aviso info">Los coeficientes venían como fracción (suman 1). Los convertimos a porcentaje.</p>}
                {revision.rechazos.length > 0 && (
                  <details open={revision.rechazos.length <= 10} style={{ marginBottom: 14 }}>
                    <summary><strong>Filas rechazadas</strong> (no se importan)</summary>
                    <ul className="lista" style={{ marginTop: 8 }}>
                      {revision.rechazos.map((r) => <li key={r.fila}><span>Fila {r.fila}</span><span>{r.motivo}</span></li>)}
                    </ul>
                  </details>
                )}
                {revision.clasificadas.length > 0 && (
                  <div className="tabla-caja" style={{ maxHeight: 420, overflowY: 'auto' }}>
                    <table className="tabla tarjetas-movil">
                      <thead><tr><th>Fila</th><th>Unidad</th><th>Tipo</th><th className="num">Coeficiente %</th><th className="num">Área m²</th><th>Resultado</th></tr></thead>
                      <tbody>
                        {revision.clasificadas.map((c) => (
                          <tr key={c.fila}>
                            <td data-label="Fila">{c.fila}</td>
                            <td data-titulo><strong>{nombreUnidad(c)}</strong></td>
                            <td data-label="Tipo">{TIPOS_UNIDAD[c.tipo]}</td>
                            <td className="num" data-label="Coeficiente %">
                              {c.estado === 'actualizada' && c.anterior && Number(c.anterior.coeficiente) !== c.coeficiente && <span className="tenue">{fmt(Number(c.anterior.coeficiente))} → </span>}
                              {fmt(c.coeficiente)}
                            </td>
                            <td className="num" data-label="Área m²">{fmt(c.area_m2)}</td>
                            <td data-label="Resultado"><span className={`etiqueta ${c.estado === 'nueva' ? 'nueva' : c.estado === 'actualizada' ? 'actualizada' : 'gris'}`}>{c.estado === 'nueva' ? 'Nueva' : c.estado === 'actualizada' ? 'Se actualiza' : 'Sin cambios'}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </section>

          {!revision.error && (
            <section className="panel">
              <h2>4. Aprueba</h2>
              {puedeAprobar ? (
                <>
                  <p className="tenue">Nada se ha guardado todavía. Al aprobar se aplican {cambios} cambios y la importación queda registrada con tu nombre.</p>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <button className="boton" onClick={aprobar} disabled={aplicando || revision.validas.length === 0}>{aplicando ? 'Aplicando…' : 'Aprobar e importar'}</button>
                    <button className="boton secundario" onClick={() => setCargado(null)} disabled={aplicando}>Descartar</button>
                  </div>
                </>
              ) : (
                <p className="aviso info">Puedes revisar el archivo, pero solo la administración puede aprobar la importación.</p>
              )}
            </section>
          )}
        </>
      )}
    </div>
  )
}
