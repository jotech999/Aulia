import { ImageResponse } from "next/og";

/**
 * Imagen de vista previa (Open Graph / Twitter) generada dinámicamente con la
 * identidad "Pizarra & Ámbar". Se muestra al compartir el enlace en WhatsApp,
 * redes o correo. 1200×630, sin dependencias de imágenes externas.
 */
export const alt = "Ciudi — Gestión escolar para colegios chilenos";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px",
          color: "#ffffff",
          backgroundColor: "#a85610",
          backgroundImage:
            "radial-gradient(1000px 700px at 100% -10%, rgba(255,236,194,0.26), transparent 55%), radial-gradient(900px 700px at -10% 110%, rgba(46,139,106,0.4), transparent 55%), linear-gradient(140deg, #9a4e0c, #c26a12 55%, #a85610)",
          fontFamily: "sans-serif",
        }}
      >
        {/* Marca */}
        <div style={{ display: "flex", alignItems: "center", gap: "18px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "64px",
              height: "64px",
              borderRadius: "50%",
              backgroundColor: "rgba(255,255,255,0.12)",
              border: "1px solid rgba(255,255,255,0.25)",
              fontSize: "34px",
              fontWeight: 700,
            }}
          >
            C
          </div>
          <div style={{ fontSize: "34px", fontWeight: 700, letterSpacing: "-0.5px" }}>
            Ciudi
          </div>
        </div>

        {/* Titular */}
        <div style={{ display: "flex", flexDirection: "column", maxWidth: "900px" }}>
          <div
            style={{
              fontSize: "34px",
              fontWeight: 600,
              color: "rgba(255,255,255,0.65)",
              marginBottom: "18px",
            }}
          >
            Gestión escolar para colegios chilenos
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", fontSize: "66px", fontWeight: 700, lineHeight: 1.05, letterSpacing: "-1.5px" }}>
            <span>El libro de clases que los profesores&nbsp;</span>
            <span style={{ color: "#ffe6ad" }}>de verdad&nbsp;</span>
            <span>quieren usar.</span>
          </div>
        </div>

        {/* Chips normativos */}
        <div style={{ display: "flex", gap: "14px" }}>
          {["Circular N°30", "Decreto 67", "SIGE", "IA incluida"].map((t) => (
            <div
              key={t}
              style={{
                display: "flex",
                fontSize: "24px",
                fontWeight: 600,
                padding: "10px 20px",
                borderRadius: "999px",
                backgroundColor: "rgba(255,255,255,0.10)",
                border: "1px solid rgba(255,255,255,0.16)",
                color: "rgba(255,255,255,0.9)",
              }}
            >
              {t}
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size }
  );
}
