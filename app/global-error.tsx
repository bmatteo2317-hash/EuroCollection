"use client";

/**
 * Boundary globale: ultima rete di sicurezza contro "Minified React error
 * #441" a schermata bianca in produzione (vedi app/error.tsx).
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="it">
      <body>
        <div
          style={{
            maxWidth: 560,
            margin: "64px auto",
            textAlign: "center",
            fontFamily: "system-ui, sans-serif",
          }}
        >
          <h1>Qualcosa è andato storto</h1>
          <p style={{ color: "#666", fontSize: 14 }}>
            La pagina non è riuscita a caricarsi. Controlla il collegamento
            Neon su Vercel (Environment Variables + schema.sql).
            {error?.digest ? ` Digest: ${error.digest}` : ""}
          </p>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              marginTop: 16,
              padding: "8px 20px",
              borderRadius: 999,
              border: "none",
              background: "#18181b",
              color: "#fff",
              fontWeight: 600,
            }}
          >
            Riprova
          </button>
        </div>
      </body>
    </html>
  );
}
