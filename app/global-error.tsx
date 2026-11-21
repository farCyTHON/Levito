"use client";

export default function GlobalError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="en" className="dark">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          background: "#17171c",
          color: "#ededf0",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <main style={{ maxWidth: 420, padding: 24, textAlign: "center" }}>
          <h1 style={{ fontSize: 16, fontWeight: 500, margin: 0 }}>Levito could not start</h1>
          <p style={{ fontSize: 14, lineHeight: 1.5, opacity: 0.7 }}>
            Something went wrong before the workspace loaded. Your demo data has not been changed.
          </p>
          <button
            type="button"
            onClick={() => retry()}
            style={{
              marginTop: 8,
              height: 32,
              padding: "0 12px",
              borderRadius: 8,
              border: 0,
              background: "#ededf0",
              color: "#17171c",
              fontSize: 14,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
