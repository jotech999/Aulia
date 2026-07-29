"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { crearNotificaciones } from "@/lib/notificaciones";

/**
 * Recepción PÚBLICA de postulaciones de admisión (sin sesión).
 * Defensas: validación estricta, honeypot anti-bots, tope de 3 postulaciones
 * por email/colegio, y solo datos mínimos (sin RUT ni información sensible).
 */

const esquema = z.object({
  colegioId: z.string().min(1),
  nombres: z.string().trim().min(2, "Indica el nombre").max(80),
  apellidos: z.string().trim().min(2, "Indica los apellidos").max(80),
  fechaNacimiento: z
    .string()
    .trim()
    .refine((v) => v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v), "Fecha inválida"),
  nivelSolicitado: z.string().trim().min(2, "Indica el curso al que postula").max(60),
  apoderadoNombre: z.string().trim().min(2, "Indica el nombre del apoderado").max(120),
  email: z.string().trim().email("Correo inválido").max(160),
  telefono: z.string().trim().max(20).optional().default(""),
  comentario: z.string().trim().max(1000).optional().default(""),
  // Honeypot: los humanos no ven este campo; si viene con datos, es un bot.
  sitioWeb: z.string().optional().default(""),
});

export async function enviarPostulacion(formData: FormData): Promise<void> {
  const datos = Object.fromEntries(formData.entries());
  const parsed = esquema.safeParse(datos);
  const colegioId = typeof datos.colegioId === "string" ? datos.colegioId : "";

  if (!parsed.success) {
    redirect(
      `/postulacion/${colegioId}?error=${encodeURIComponent(
        parsed.error.issues[0]?.message ?? "Revisa los datos del formulario."
      )}`
    );
  }
  const d = parsed.data;

  // Honeypot: responde como éxito sin guardar nada (no dar pistas al bot).
  if (d.sitioWeb !== "") redirect(`/postulacion/${d.colegioId}?ok=1`);

  const colegio = await prisma.colegio.findUnique({
    where: { id: d.colegioId },
    select: { id: true, nombre: true },
  });
  if (!colegio) redirect(`/postulacion/${d.colegioId}?error=Colegio%20no%20encontrado`);

  // Tope anti-abuso por email y colegio.
  const previas = await prisma.postulacion.count({
    where: { colegioId: d.colegioId, email: d.email.toLowerCase() },
  });
  if (previas >= 3) {
    redirect(
      `/postulacion/${d.colegioId}?error=${encodeURIComponent(
        "Ya existen postulaciones con este correo. El colegio se contactará contigo."
      )}`
    );
  }

  const post = await prisma.postulacion.create({
    data: {
      colegioId: d.colegioId,
      nombres: d.nombres,
      apellidos: d.apellidos,
      fechaNacimiento: d.fechaNacimiento ? new Date(`${d.fechaNacimiento}T12:00:00Z`) : null,
      nivelSolicitado: d.nivelSolicitado,
      apoderadoNombre: d.apoderadoNombre,
      email: d.email.toLowerCase(),
      telefono: d.telefono || null,
      comentario: d.comentario || null,
    },
    select: { id: true, nivelSolicitado: true },
  });

  // Aviso in-app a dirección/admin del colegio (best-effort).
  try {
    const directivos = await prisma.membresia.findMany({
      where: { colegioId: d.colegioId, activa: true, rol: { in: ["ADMIN", "DIRECTOR"] } },
      select: { usuarioId: true },
    });
    await crearNotificaciones(
      directivos.map((m) => ({
        colegioId: d.colegioId,
        usuarioId: m.usuarioId,
        tipo: "GENERAL" as const,
        titulo: "Nueva postulación de admisión",
        cuerpo: `Postulación a ${post.nivelSolicitado}. Revísala en la bandeja de admisión.`,
        enlace: "/admin/admision",
      }))
    );
  } catch {
    // La notificación es accesoria.
  }

  redirect(`/postulacion/${d.colegioId}?ok=1`);
}
