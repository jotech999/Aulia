"use server";

import { randomInt } from "node:crypto";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { Rol } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requerirSesion } from "@/lib/sesion";
import { registrarAuditoria } from "@/lib/auditoria";
import { normalizarRut, validarRut } from "@/lib/rut";
import {
  crearPersonaSchema,
  puedeOtorgar,
  ROLES_GESTIONAR_PERSONAS,
  ROLES_VER_PERSONAS,
} from "@/lib/personas";
import { buscarApoderadosVinculables } from "./consultas";

type Resultado<T = object> = ({ ok: true } & T) | { ok: false; error: string };

/** Clave temporal legible para el primer acceso (sin caracteres ambiguos). */
function claveTemporal(): string {
  const abc = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // sin O/0/I/1/L
  let s = "";
  for (let i = 0; i < 8; i++) s += abc[randomInt(0, abc.length)];
  return `Aulia-${s}`;
}

class ErrorPersona extends Error {}

/**
 * Da de alta a una persona en el colegio con un rol.
 *
 * Si el RUT ya tiene cuenta (otro colegio, u otro rol en este), se REUTILIZA la
 * cuenta y solo se agrega la membresía: una misma persona puede ser profesora
 * en un colegio y apoderada en otro sin duplicar identidad. La clave temporal
 * se entrega únicamente cuando la cuenta se crea por primera vez.
 */
export async function crearPersona(
  input: unknown
): Promise<Resultado<{ claveTemporal?: string; reutilizada: boolean }>> {
  const parsed = crearPersonaSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }
  const d = parsed.data;

  const { user } = await requerirSesion();
  if (!ROLES_GESTIONAR_PERSONAS.has(user.rol)) {
    return { ok: false, error: "No tienes permiso para dar de alta personas." };
  }
  if (!puedeOtorgar(user.rol, d.rol)) {
    return { ok: false, error: `Tu rol no puede otorgar el rol ${d.rol}.` };
  }

  const rut = normalizarRut(d.rut);
  if (!rut || !validarRut(rut)) return { ok: false, error: "El RUT no es válido." };
  const email = d.email.toLowerCase();

  try {
    const salida = await prisma.$transaction(async (tx) => {
      const existentePorRut = await tx.usuario.findUnique({
        where: { rut },
        select: { id: true, email: true, nombre: true },
      });
      const existentePorEmail = await tx.usuario.findUnique({
        where: { email },
        select: { id: true, rut: true },
      });

      // Incoherencias de identidad: mejor detenerse que crear un duplicado.
      if (existentePorRut && existentePorEmail && existentePorRut.id !== existentePorEmail.id) {
        throw new ErrorPersona(
          "Ese RUT y ese correo pertenecen a personas distintas. Revisa los datos."
        );
      }
      if (existentePorEmail && !existentePorRut) {
        throw new ErrorPersona(
          "Ese correo ya está registrado con otro RUT. Usa el correo real de la persona."
        );
      }
      // Cuenta existente con OTRO correo: no se enlaza en silencio, porque
      // quien da el alta creería haber fijado un correo que no quedó guardado.
      if (existentePorRut && existentePorRut.email !== email) {
        throw new ErrorPersona(
          `Ese RUT ya tiene cuenta en Aulia con el correo ${existentePorRut.email}. Usa ese correo para agregarle este rol, o corrige el RUT.`
        );
      }

      let usuarioId: string;
      let clave: string | undefined;
      const reutilizada = Boolean(existentePorRut);

      if (existentePorRut) {
        usuarioId = existentePorRut.id;
        // No se pisa el nombre ni la clave de una cuenta existente.
      } else {
        clave = claveTemporal();
        const creado = await tx.usuario.create({
          data: {
            rut,
            nombre: d.nombre,
            email,
            passwordHash: await bcrypt.hash(clave, 10),
            telefono: d.telefono || null,
          },
          select: { id: true },
        });
        usuarioId = creado.id;
      }

      const yaTiene = await tx.membresia.findUnique({
        where: {
          usuarioId_colegioId_rol: { usuarioId, colegioId: user.colegioId, rol: d.rol as Rol },
        },
        select: { id: true, activa: true },
      });
      if (yaTiene?.activa) {
        throw new ErrorPersona("Esa persona ya tiene ese rol en el colegio.");
      }

      await tx.membresia.upsert({
        where: {
          usuarioId_colegioId_rol: { usuarioId, colegioId: user.colegioId, rol: d.rol as Rol },
        },
        create: { usuarioId, colegioId: user.colegioId, rol: d.rol as Rol },
        update: { activa: true, revocadaEn: null },
      });

      await registrarAuditoria(
        {
          colegioId: user.colegioId,
          usuarioId: user.id,
          accion: "CREAR",
          entidad: "Membresia",
          entidadId: usuarioId,
          // Sin PII: el rol y si la cuenta ya existía. El nombre no se registra.
          despues: { rol: d.rol, cuentaReutilizada: reutilizada },
        },
        tx
      );

      return { clave, reutilizada };
    });

    revalidatePath("/admin/personas");
    return { ok: true, claveTemporal: salida.clave, reutilizada: salida.reutilizada };
  } catch (e) {
    if (e instanceof ErrorPersona) return { ok: false, error: e.message };
    console.error("[crearPersona]", e instanceof Error ? e.message : "error");
    return { ok: false, error: "No se pudo dar de alta a la persona." };
  }
}

/**
 * Revoca o reactiva el acceso de una persona a este colegio. Nunca borra la
 * cuenta ni su historial: la trazabilidad del libro de clases debe conservarse
 * (Circular 30). Un usuario no puede revocarse a sí mismo.
 */
export async function cambiarAccesoPersona(input: unknown): Promise<Resultado> {
  const datos = input as { membresiaId?: unknown; activa?: unknown };
  const membresiaId = typeof datos.membresiaId === "string" ? datos.membresiaId : "";
  const activa = datos.activa === true;
  if (!membresiaId) return { ok: false, error: "Datos inválidos." };

  const { user } = await requerirSesion();
  if (!ROLES_GESTIONAR_PERSONAS.has(user.rol)) {
    return { ok: false, error: "No tienes permiso para cambiar accesos." };
  }

  const membresia = await prisma.membresia.findFirst({
    where: { id: membresiaId, colegioId: user.colegioId },
    select: { id: true, rol: true, usuarioId: true, activa: true },
  });
  if (!membresia) return { ok: false, error: "Persona no encontrada en este colegio." };
  if (membresia.usuarioId === user.id) {
    return { ok: false, error: "No puedes revocar tu propio acceso." };
  }
  if (membresia.rol === "ADMIN") {
    return { ok: false, error: "El acceso de administración no se cambia desde aquí." };
  }
  if (!puedeOtorgar(user.rol, membresia.rol)) {
    return { ok: false, error: "Tu rol no puede administrar a esa persona." };
  }

  await prisma.$transaction(async (tx) => {
    await tx.membresia.update({
      where: { id: membresiaId },
      data: { activa, revocadaEn: activa ? null : new Date() },
    });
    await registrarAuditoria(
      {
        colegioId: user.colegioId,
        usuarioId: user.id,
        accion: "MODIFICAR",
        entidad: "Membresia",
        entidadId: membresia.usuarioId,
        antes: { activa: membresia.activa },
        despues: { activa, rol: membresia.rol },
      },
      tx
    );
  });

  revalidatePath("/admin/personas");
  return { ok: true };
}

/** Buscador de apoderados ya registrados, para vincularlos a un estudiante. */
export async function buscarApoderados(input: unknown): Promise<
  Resultado<{
    resultados: Awaited<ReturnType<typeof buscarApoderadosVinculables>>;
  }>
> {
  const datos = input as { consulta?: unknown; estudianteId?: unknown };
  const consulta = typeof datos.consulta === "string" ? datos.consulta.slice(0, 120) : "";
  const estudianteId = typeof datos.estudianteId === "string" ? datos.estudianteId : "";
  if (!estudianteId) return { ok: false, error: "Datos inválidos." };

  const { user } = await requerirSesion();
  if (!ROLES_VER_PERSONAS.has(user.rol)) {
    return { ok: false, error: "No tienes permiso para consultar apoderados." };
  }
  // Multi-tenant: el estudiante debe ser del colegio en sesión.
  const est = await prisma.estudiante.findFirst({
    where: { id: estudianteId, colegioId: user.colegioId },
    select: { id: true },
  });
  if (!est) return { ok: false, error: "Estudiante no encontrado." };

  const resultados = await buscarApoderadosVinculables(user.colegioId, consulta, estudianteId);
  return { ok: true, resultados };
}

/**
 * Vincula un apoderado YA REGISTRADO a un estudiante. Es el caso de los
 * hermanos: antes había que reescribir RUT, nombre y correo en cada matrícula.
 */
export async function vincularApoderado(input: unknown): Promise<Resultado> {
  const datos = input as {
    estudianteId?: unknown;
    apoderadoUsuarioId?: unknown;
    parentesco?: unknown;
  };
  const estudianteId = typeof datos.estudianteId === "string" ? datos.estudianteId : "";
  const apoderadoUsuarioId =
    typeof datos.apoderadoUsuarioId === "string" ? datos.apoderadoUsuarioId : "";
  const parentesco =
    typeof datos.parentesco === "string" && datos.parentesco.trim()
      ? datos.parentesco.trim().slice(0, 30)
      : "Apoderado";
  if (!estudianteId || !apoderadoUsuarioId) return { ok: false, error: "Datos inválidos." };

  const { user } = await requerirSesion();
  if (!ROLES_GESTIONAR_PERSONAS.has(user.rol)) {
    return { ok: false, error: "No tienes permiso para vincular apoderados." };
  }

  // Multi-tenant en ambos extremos: estudiante del colegio y apoderado con
  // membresía APODERADO activa en ESTE colegio.
  const [est, membresia, yaVinculado] = await Promise.all([
    prisma.estudiante.findFirst({
      where: { id: estudianteId, colegioId: user.colegioId },
      select: { id: true },
    }),
    prisma.membresia.findFirst({
      where: {
        usuarioId: apoderadoUsuarioId,
        colegioId: user.colegioId,
        rol: "APODERADO",
        activa: true,
      },
      select: { id: true },
    }),
    prisma.apoderado.findFirst({
      where: { usuarioId: apoderadoUsuarioId, estudianteId },
      select: { id: true },
    }),
  ]);
  if (!est) return { ok: false, error: "Estudiante no encontrado." };
  if (!membresia) {
    return { ok: false, error: "Esa persona no está registrada como apoderada del colegio." };
  }
  if (yaVinculado) return { ok: false, error: "Ya está vinculada a este estudiante." };

  await prisma.$transaction(async (tx) => {
    const vinculo = await tx.apoderado.create({
      data: { usuarioId: apoderadoUsuarioId, estudianteId, parentesco },
      select: { id: true },
    });
    await registrarAuditoria(
      {
        colegioId: user.colegioId,
        usuarioId: user.id,
        accion: "CREAR",
        entidad: "Apoderado",
        entidadId: vinculo.id,
        despues: { estudianteId, parentesco, vinculoDeExistente: true },
      },
      tx
    );
  });

  revalidatePath(`/admin/estudiantes/${estudianteId}`);
  revalidatePath("/admin/personas");
  return { ok: true };
}
