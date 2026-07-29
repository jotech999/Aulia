/**
 * Envío de correo transaccional. Usa Resend por HTTP (sin dependencias).
 * Si no hay RESEND_API_KEY/EMAIL_FROM configurados, queda desactivado de forma
 * segura: la notificación in-app (campana) sigue funcionando.
 *
 * Minimización (Ley 21.719): el correo NO incluye datos sensibles del menor
 * (ni la nota); solo avisa e invita a entrar a la plataforma a verla.
 */

export function emailDisponible(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export async function enviarEmail(opts: {
  to: string;
  subject: string;
  html: string;
}): Promise<boolean> {
  if (!emailDisponible()) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM,
        to: opts.to,
        subject: opts.subject,
        html: opts.html,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Escapa texto para interpolar de forma segura en HTML (evita inyección). */
export function escaparHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Plantilla mínima y sobria para avisos a apoderados (sin datos sensibles). */
export function plantillaAviso(titulo: string, detalle: string, colegio: string): string {
  const t = escaparHtml(titulo);
  const d = escaparHtml(detalle);
  const c = escaparHtml(colegio);
  return `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto">
    <h2 style="color:#1c4438;margin:0 0 8px">${t}</h2>
    <p style="color:#46574f;margin:0 0 16px">${d}</p>
    <p style="color:#8a9188;font-size:13px;margin:0">
      Ingresa a la plataforma de ${c} para ver el detalle. Este es un aviso
      automático; por favor no respondas a este correo.
    </p>
  </div>`;
}
