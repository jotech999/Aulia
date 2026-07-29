"use server";

import { randomInt } from "node:crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { Rol } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requerirSesion } from "@/lib/sesion";
import { registrarAuditoria } from "@/lib/auditoria";
import { normalizarRut, validarRut } from "@/lib/rut";
import { fechaDesdeISO } from "@/lib/fecha";

type Resultado =
  | { ok: true; estudianteId: string; apoderadoClaveTemporal?: string }
  | { ok: false; error: string };

const ROLES = new Set(["ADMIN", "DIRECTOR"]);

const schema = z.object({
  rut: z.string().trim().min(1, "Indica el RUT del estudiante"),
  nombres: z.string().trim().min(1, "Indica los nombres").max(120),
  apellidos: z.string().trim().min(1, "Indica los apellidos").max(120),
  fechaNacimiento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  cursoId: z.string().min(1, "Selecciona un curso"),
  // Apoderado opcional
  apoderado: z
    .object({
      rut: z.string().trim().min(1),
      nombre: z.string().trim().min(1).max(120),
      email: z.string().trim().email("Email de apoderado inválido"),
      parentesco: z.string().trim().min(1).max(30),
    })
    .optional(),
});

/** Error de negocio que revierte la transacción con un mensaje para el usuario. */
class ErrorMatricula extends Error {}

/** Clave temporal para el primer acceso del apoderado (sin caracteres ambiguos). */
function claveTemporal(): string {
  const abc = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // sin O/0/I/1/L
  let s = "";
  for (let i = 0; i < 8; i++) s += abc[randomInt(0, abc.length)];
  return `Aulia-${s}`;
}

/**
 * Crea un estudiante, lo matricula en un curso (ACTIVA) y, opcionalmente, crea o
 * enlaza a su apoderado. Solo ADMIN/DIRECTOR. Multi-tenant: curso y datos del
 * colegio de la sesión. La matrícula es del libro de clases → auditada
 * (Circular 30). Datos de menores minimizados (Ley 21.719).
 */
export async function crearMatricula(input: unknown): Promise<Resultado> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  const d = parsed.data;

  const { user } = await requerirSesion();
  if (!ROLES.has(user.rol)) return { ok: false, error: "No tienes permiso para matricular." };

  const rut = normalizarRut(d.rut);
  if (!rut || !validarRut(rut)) return { ok: false, error: "RUT del estudiante inválido (dígito verificador)." };

  // Curso del colegio de la sesión.
  const curso = await prisma.curso.findFirst({ where: { id: d.cursoId, colegioId: user.colegioId }, select: { id: true } });
  if (!curso) return { ok: false, error: "Curso no encontrado." };

  // Estudiante no debe existir ya en el colegio.
  const yaExiste = await prisma.estudiante.findFirst({ where: { colegioId: user.colegioId, rut }, select: { id: true } });
  if (yaExiste) return { ok: false, error: "Ya existe un estudiante con ese RUT en el colegio." };

  // Apoderado: valida y resuelve si ya existe (por email) o se crea.
  let apoRut: string | null = null;
  if (d.apoderado) {
    apoRut = normalizarRut(d.apoderado.rut);
    if (!apoRut || !validarRut(apoRut)) return { ok: false, error: "RUT del apoderado inválido." };
  }

  const fechaMatricula = new Date();
  let claveTemp: string | undefined;

  try {
    const estudianteId = await prisma.$transaction(async (tx) => {
      const est = await tx.estudiante.create({
        data: {
          colegioId: user.colegioId,
          rut,
          nombres: d.nombres,
          apellidos: d.apellidos,
          fechaNacimiento: d.fechaNacimiento ? fechaDesdeISO(d.fechaNacimiento) : null,
        },
        select: { id: true },
      });

      const mat = await tx.matricula.create({
        data: { colegioId: user.colegioId, estudianteId: est.id, cursoId: d.cursoId, fecha: fechaMatricula, estado: "ACTIVA" },
        select: { id: true },
      });
      // Auditoría de la matrícula (libro de clases).
      await registrarAuditoria(
        { colegioId: user.colegioId, usuarioId: user.id, accion: "CREAR", entidad: "Matricula", entidadId: mat.id, despues: { cursoId: d.cursoId } },
        tx
      );

      if (d.apoderado && apoRut) {
        const email = d.apoderado.email.toLowerCase();
        // Resolución de la cuenta del apoderado por RUT (identificador nacional).
        // Solo se ENLAZA una cuenta existente si RUT y email coinciden (misma
        // identidad): evita vincular los datos de un menor a una cuenta ajena
        // conociendo solo un email (fuga de datos, Ley 21.719).
        let apoUsuarioId: string;
        let enlazado = false;
        const porRut = await tx.usuario.findUnique({ where: { rut: apoRut }, select: { id: true, email: true } });
        if (porRut) {
          if (porRut.email !== email) {
            throw new ErrorMatricula("Ese RUT de apoderado ya está registrado con otro email. Verifica los datos.");
          }
          apoUsuarioId = porRut.id;
          enlazado = true;
        } else {
          // Nadie con ese RUT: el email tampoco debe pertenecer a otra persona.
          const porEmail = await tx.usuario.findUnique({ where: { email }, select: { id: true } });
          if (porEmail) throw new ErrorMatricula("Ese email ya está en uso por otra persona.");
          claveTemp = claveTemporal();
          const hash = await bcrypt.hash(claveTemp, 10);
          const u = await tx.usuario.create({
            data: { rut: apoRut, nombre: d.apoderado.nombre, email, passwordHash: hash },
            select: { id: true },
          });
          apoUsuarioId = u.id;
        }
        // Membresía APODERADO en el colegio de la sesión (idempotente).
        await tx.membresia.upsert({
          where: { usuarioId_colegioId_rol: { usuarioId: apoUsuarioId, colegioId: user.colegioId, rol: Rol.APODERADO } },
          update: {},
          create: { usuarioId: apoUsuarioId, colegioId: user.colegioId, rol: Rol.APODERADO },
        });
        // Vínculo apoderado ↔ estudiante.
        const vinculo = await tx.apoderado.create({
          data: { usuarioId: apoUsuarioId, estudianteId: est.id, parentesco: d.apoderado.parentesco },
          select: { id: true },
        });
        await registrarAuditoria(
          { colegioId: user.colegioId, usuarioId: user.id, accion: "CREAR", entidad: "Apoderado", entidadId: vinculo.id, despues: { estudianteId: est.id, parentesco: d.apoderado.parentesco, enlazado } },
          tx
        );
      }

      return est.id;
    });

    revalidatePath("/admin/estudiantes");
    return { ok: true, estudianteId, apoderadoClaveTemporal: claveTemp };
  } catch (e) {
    if (e instanceof ErrorMatricula) return { ok: false, error: e.message };
    // Colisión de una restricción única (RUT/email ya en uso), por carrera.
    if (typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002") {
      return { ok: false, error: "Ese RUT o email ya está en uso. Revisa los datos e intenta de nuevo." };
    }
    console.error("[matricular]", e instanceof Error ? e.message : "error");
    return { ok: false, error: "No se pudo completar la matrícula. Reintenta." };
  }
}
