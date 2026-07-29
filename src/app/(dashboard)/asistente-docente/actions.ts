"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requerirSesion } from "@/lib/sesion";
import { prisma } from "@/lib/prisma";
import { generarBorradorDocente, type ResultadoBorrador } from "@/lib/ia/docente";
import {
  generarMaterialImprimible,
  type ResultadoMaterial,
} from "@/lib/ia/material";
import { generarPdfMaterial } from "@/lib/pdf/material";
import { corregirRespuestas, type ResultadoCorreccion } from "@/lib/ia/correccion";

// Solo staff docente/directivo genera borradores (no apoderado, no PIE acotado).
const ROLES_DOCENTE = new Set(["ADMIN", "DIRECTOR", "UTP", "PROFESOR_JEFE", "PROFESOR", "INSPECTOR"]);

const esquema = z.discriminatedUnion("tipo", [
  z.object({
    tipo: z.literal("planificacion"),
    asignaturaId: z.string().min(1),
    titulo: z.string().trim().min(3, "Indica el título de la unidad").max(160),
    numeroClases: z.coerce.number().int().min(1).max(40),
  }),
  z.object({
    tipo: z.literal("retroalimentacion"),
    nombrePila: z.string().trim().min(1, "Indica el nombre de pila").max(60),
    area: z.string().trim().min(2, "Indica el área o asignatura").max(80),
    fortalezas: z.string().trim().min(3, "Describe las fortalezas").max(1000),
    aspectos: z.string().trim().min(3, "Describe los aspectos a mejorar").max(1000),
  }),
  z.object({
    tipo: z.literal("resumen-consejo"),
    cursoId: z.string().min(1, "Selecciona un curso"),
  }),
  z.object({
    tipo: z.literal("comunicado"),
    proposito: z.string().trim().min(3, "Indica el propósito").max(200),
    audiencia: z.string().trim().min(2, "Indica los destinatarios").max(120),
    puntos: z.string().trim().min(3, "Indica los puntos a incluir").max(1500),
  }),
]);

export async function generarBorrador(input: unknown): Promise<ResultadoBorrador> {
  const parsed = esquema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }
  const { user } = await requerirSesion();
  if (!ROLES_DOCENTE.has(user.rol)) {
    return { ok: false, error: "No tienes permiso para usar esta herramienta." };
  }
  return generarBorradorDocente(
    { id: user.id, rol: user.rol, colegioId: user.colegioId, nombre: user.name },
    parsed.data
  );
}

// ── Material imprimible (guías y evaluaciones) ────────────────────────────────

const esquemaMaterial = z.object({
  tipoMaterial: z.enum(["guia", "evaluacion"]),
  asignaturaId: z.string().min(1, "Selecciona una asignatura"),
  tema: z.string().trim().min(3, "Indica el tema del material").max(200),
  numeroItems: z.coerce.number().int().min(3).max(20),
  dificultad: z.enum(["basica", "media", "avanzada"]),
});

export async function generarMaterial(input: unknown): Promise<ResultadoMaterial> {
  const parsed = esquemaMaterial.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }
  const { user } = await requerirSesion();
  if (!ROLES_DOCENTE.has(user.rol)) {
    return { ok: false, error: "No tienes permiso para usar esta herramienta." };
  }
  return generarMaterialImprimible(
    { id: user.id, rol: user.rol, colegioId: user.colegioId, nombre: user.name },
    parsed.data
  );
}

// El material vuelve del cliente (posiblemente editado) y se revalida completo
// antes de dibujar el PDF: nunca confiamos en el JSON del navegador.
const esquemaItemPdf = z.object({
  tipo: z.enum(["seleccion", "verdadero_falso", "desarrollo"]),
  enunciado: z.string().trim().min(1).max(1200),
  alternativas: z.array(z.string().trim().min(1).max(300)).min(2).max(6).optional(),
  respuesta: z.string().trim().max(1200).default(""),
  puntaje: z.coerce.number().int().min(1).max(10),
});

const esquemaContenidoMaterial = z.object({
  tipoMaterial: z.enum(["guia", "evaluacion"]),
  titulo: z.string().trim().min(1).max(180),
  asignatura: z.string().trim().min(1).max(120),
  nivel: z.string().trim().min(1).max(40),
  instrucciones: z.string().trim().max(800).default(""),
  items: z.array(esquemaItemPdf).min(1).max(30),
  oaCodigos: z.array(z.string().max(30)).max(12).default([]),
});

const esquemaMaterialPdf = z.object({
  material: esquemaContenidoMaterial,
  incluirPauta: z.boolean().default(true),
});

export async function materialAPdf(
  input: unknown
): Promise<{ ok: true; base64: string; nombreArchivo: string } | { ok: false; error: string }> {
  const parsed = esquemaMaterialPdf.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "El material no es válido. Genera uno nuevo e intenta otra vez." };
  }
  const { user } = await requerirSesion();
  if (!ROLES_DOCENTE.has(user.rol)) {
    return { ok: false, error: "No tienes permiso para usar esta herramienta." };
  }

  const colegio = await prisma.colegio.findUnique({
    where: { id: user.colegioId },
    select: { nombre: true },
  });

  const bytes = await generarPdfMaterial(parsed.data.material, {
    colegio: colegio?.nombre ?? "",
    incluirPauta: parsed.data.incluirPauta,
  });

  const slug = parsed.data.material.titulo
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);

  return {
    ok: true,
    base64: Buffer.from(bytes).toString("base64"),
    nombreArchivo: `${slug || "material"}.pdf`,
  };
}

// ── Corrección asistida por IA ────────────────────────────────────────────────

const esquemaCorreccion = z.object({
  material: esquemaContenidoMaterial,
  // Respuestas transcritas por el/la docente; se instruye NO incluir identidad.
  respuestas: z
    .string()
    .trim()
    .min(5, "Transcribe las respuestas del estudiante")
    .max(8000, "Máximo 8000 caracteres"),
});

export async function corregirConIA(input: unknown): Promise<ResultadoCorreccion> {
  const parsed = esquemaCorreccion.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }
  const { user } = await requerirSesion();
  if (!ROLES_DOCENTE.has(user.rol)) {
    return { ok: false, error: "No tienes permiso para usar esta herramienta." };
  }
  return corregirRespuestas(
    { id: user.id, rol: user.rol, colegioId: user.colegioId, nombre: user.name },
    parsed.data.material,
    parsed.data.respuestas
  );
}

// ── Banco de material del colegio ─────────────────────────────────────────────
// Las guías/evaluaciones generadas se pueden guardar y compartir entre el staff
// del mismo colegio (multi-tenant). Solo contenido curricular, sin PII.

const ROLES_DIRECTIVOS = new Set(["ADMIN", "DIRECTOR", "UTP"]);

export async function guardarMaterialEnBanco(
  input: unknown
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = esquemaContenidoMaterial.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "El material no es válido para guardar." };
  }
  const { user } = await requerirSesion();
  if (!ROLES_DOCENTE.has(user.rol)) {
    return { ok: false, error: "No tienes permiso para usar esta herramienta." };
  }
  const m = parsed.data;
  await prisma.materialDocente.create({
    data: {
      colegioId: user.colegioId,
      autorId: user.id,
      tipoMaterial: m.tipoMaterial,
      titulo: m.titulo,
      asignatura: m.asignatura,
      nivel: m.nivel,
      contenido: m,
    },
  });
  revalidatePath("/asistente-docente");
  return { ok: true };
}

export async function eliminarMaterialDelBanco(
  id: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (typeof id !== "string" || !id) return { ok: false, error: "Material inválido." };
  const { user } = await requerirSesion();
  if (!ROLES_DOCENTE.has(user.rol)) {
    return { ok: false, error: "No tienes permiso para usar esta herramienta." };
  }
  // Solo el autor o un directivo pueden retirar material del banco (soft delete).
  const material = await prisma.materialDocente.findFirst({
    where: { id, colegioId: user.colegioId, eliminadoEn: null },
    select: { autorId: true },
  });
  if (!material) return { ok: false, error: "El material no existe o ya fue retirado." };
  if (material.autorId !== user.id && !ROLES_DIRECTIVOS.has(user.rol)) {
    return { ok: false, error: "Solo el autor o dirección pueden retirar este material." };
  }
  await prisma.materialDocente.update({
    where: { id },
    data: { eliminadoEn: new Date() },
  });
  revalidatePath("/asistente-docente");
  return { ok: true };
}
