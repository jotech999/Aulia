"use server";

import { z } from "zod";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { estaBloqueado, registrarFallo } from "@/lib/rate-limit";

const schema = z.object({
  nombre: z.string().trim().min(2, "Ingresa tu nombre.").max(120),
  email: z.string().trim().email("Ingresa un email válido.").max(160),
  colegio: z.string().trim().max(160).optional().or(z.literal("")),
  cargo: z.string().trim().max(80).optional().or(z.literal("")),
  telefono: z.string().trim().max(40).optional().or(z.literal("")),
  mensaje: z.string().trim().max(1000).optional().or(z.literal("")),
  // Honeypot anti-bot: campo oculto que un humano deja vacío.
  sitio: z.string().max(0).optional(),
  // Origen del lead: formulario clásico o conversación con Auli.
  origen: z.enum(["landing", "auli"]).optional(),
});

type Resultado = { ok: true } | { ok: false; error: string };

export async function solicitarDemo(input: unknown): Promise<Resultado> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }
  const d = parsed.data;
  if (d.sitio) return { ok: true }; // bot: fingimos éxito y no guardamos.

  // Límite por IP (defensa anti-flood además del honeypot): máx. 5 solicitudes
  // en 15 min por red. Usa el limitador compartido (cross-instance serverless).
  const cabeceras = await headers();
  const ip =
    cabeceras.get("x-forwarded-for")?.split(",")[0].trim() ||
    cabeceras.get("x-real-ip") ||
    "";
  const clave = ip ? `demo:${ip}` : null;
  if (clave && (await estaBloqueado(clave))) {
    return {
      ok: false,
      error: "Recibimos varias solicitudes desde tu red. Intenta nuevamente en unos minutos.",
    };
  }

  try {
    await prisma.solicitudDemo.create({
      data: {
        nombre: d.nombre,
        email: d.email,
        colegio: d.colegio || null,
        cargo: d.cargo || null,
        telefono: d.telefono || null,
        mensaje: d.mensaje || null,
        origen: d.origen ?? "landing",
      },
    });
    if (clave) await registrarFallo(clave); // cuenta la solicitud para el límite
    return { ok: true };
  } catch {
    return { ok: false, error: "No se pudo registrar la solicitud. Intenta de nuevo." };
  }
}
