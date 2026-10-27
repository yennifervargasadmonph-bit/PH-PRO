'use client'

// Pantalla para errores inesperados. Nunca muestra el mensaje técnico (podría revelar
// tablas, consultas o datos): solo un código de referencia para buscar el detalle en los
// registros del servidor.
export default function ErrorInesperado({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="acceso">
      <div className="acceso-caja">
        <h1>Algo salió mal</h1>
        <p className="intro">No pudimos completar la operación. Inténtalo de nuevo en unos segundos.</p>
        {error.digest && <p className="aviso info">Código de referencia: {error.digest}</p>}
        <button type="button" className="boton" onClick={reset} style={{ marginTop: 14 }}>
          Intentar de nuevo
        </button>
      </div>
    </main>
  )
}
