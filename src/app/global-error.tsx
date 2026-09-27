"use client";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en-IN">
      <body style={{ fontFamily: "system-ui, sans-serif", display: "grid", placeItems: "center", minHeight: "100vh", margin: 0 }}>
        <div style={{ textAlign: "center", padding: 16 }}>
          <h1 style={{ fontSize: 20 }}>Something went wrong</h1>
          <p style={{ color: "#64748b", fontSize: 14 }}>Please refresh the page.{error.digest ? ` (ref ${error.digest})` : ""}</p>
          <button onClick={reset} style={{ marginTop: 16, padding: "10px 20px", borderRadius: 12, background: "#0c655c", color: "#fff", border: 0 }}>Try again</button>
        </div>
      </body>
    </html>
  );
}
