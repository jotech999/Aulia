"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requerirSesion } from "@/lib/sesion";
import { registrarAuditoria } from "@/lib/auditoria";
import { puedeGestionarFinanzas, generarCuotasPlan } from "@/lib/finanzas";
import { crearTransaccionWebpay } from "@/lib/webpay";
import { fechaDesdeISO, hoyEnSantiago, formatearFechaLarga, isoDesdeFecha } from "@/lib/fecha";
import { notificarApoderadosDeEstudiante } from "@/lib/notificaciones";

type Resultado<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const planSchema = z.object({
  anio: z.number().int().min(2000).max(2100),
  matricula: z.number().int().min(0).max(100_000_000),
  arancelAnual: z.number().int().min(0).max(1_000_000_000),
  cuotas: z.number().int().min(1).max(12),
});

export async function configurarPlan(input: unknown): Promise<Resultado> {
  const parsed = planSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Datos del plan inválidos." };
  const { user } = await requerirSesion();
  if (!puedeGestionarFinanzas(user.rol)) return { ok: false, error: "Sin permiso." };
  const d = parsed.data;
  await prisma.planCobro.upsert({
    where: { colegioId_anio: { colegioId: user.colegioId, anio: d.anio } },
    update: { matricula: d.matricula, arancelAnual: d.arancelAnual, cuotas: d.cuotas },
    create: { colegioId: user.colegioId, anio: d.anio, matricula: d.matricula, arancelAnual: d.arancelAnual, cuotas: d.cuotas },
  });
  revalidatePath("/admin/finanzas");
  return { ok: true };
}

/** Genera las cuotas del plan para los estudiantes de un curso (idempotente). */
export async function generarCuotasCurso(cursoId: string, anio: number): Promise<Resultado<{ n: number }>> {
  const { user } = await requerirSesion();
  if (!puedeGestionarFinanzas(user.rol)) return { ok: false, error: "Sin permiso." };

  const [plan, curso] = await Promise.all([
    prisma.planCobro.findUnique({ where: { colegioId_anio: { colegioId: user.colegioId, anio } } }),
    prisma.curso.findFirst({
      where: { id: cursoId, colegioId: user.colegioId },
      select: { matriculas: { where: { estado: "ACTIVA" }, select: { estudianteId: true } } },
    }),
  ]);
  if (!plan) return { ok: false, error: "Configura primero el plan de cobro del año." };
  if (!curso) return { ok: false, error: "Curso no encontrado." };

  const estIds = curso.matriculas.map((m) => m.estudianteId);
  // Idempotencia acotada al AÑO: un estudiante con cuotas de un año previo debe
  // recibir igualmente las del año nuevo (operación multi-año).
  const yaConCuotas = new Set(
    (await prisma.cuota.findMany({ where: { colegioId: user.colegioId, anio, estudianteId: { in: estIds } }, select: { estudianteId: true }, distinct: ["estudianteId"] })).map((c) => c.estudianteId)
  );
  const calendario = generarCuotasPlan(plan);
  const filas = estIds
    .filter((id) => !yaConCuotas.has(id))
    .flatMap((estudianteId) =>
      calendario.map((c) => ({
        colegioId: user.colegioId,
        estudianteId,
        anio,
        concepto: c.concepto,
        numero: c.numero,
        monto: c.monto,
        vencimiento: fechaDesdeISO(c.vencimientoISO),
      }))
    );
  if (filas.length > 0) await prisma.cuota.createMany({ data: filas });
  revalidatePath("/admin/finanzas");
  return { ok: true, n: filas.length };
}

const pagoManualSchema = z.object({
  cuotaId: z.string().min(1),
  medio: z.enum(["EFECTIVO", "TRANSFERENCIA", "TARJETA", "OTRO"]),
  referencia: z.string().trim().max(120).optional().or(z.literal("")),
});

export async function registrarPagoManual(input: unknown): Promise<Resultado> {
  const parsed = pagoManualSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Datos del pago inválidos." };
  const { user } = await requerirSesion();
  if (!puedeGestionarFinanzas(user.rol)) return { ok: false, error: "Sin permiso." };
  const { cuotaId, medio, referencia } = parsed.data;

  const cuota = await prisma.cuota.findFirst({
    where: { id: cuotaId, colegioId: user.colegioId },
    select: { id: true, estudianteId: true, monto: true, estado: true },
  });
  if (!cuota) return { ok: false, error: "Cuota no encontrada." };
  if (cuota.estado === "PAGADA") return { ok: false, error: "La cuota ya está pagada." };
  if (cuota.estado === "ANULADA") return { ok: false, error: "La cuota está anulada." };

  await prisma.$transaction(async (tx) => {
    const pago = await tx.pago.create({
      data: {
        colegioId: user.colegioId,
        cuotaId: cuota.id,
        estudianteId: cuota.estudianteId,
        monto: cuota.monto,
        medio,
        estado: "CONFIRMADO",
        referencia: referencia || null,
        registradoPorId: user.id,
      },
      select: { id: true },
    });
    await tx.cuota.update({ where: { id: cuota.id }, data: { estado: "PAGADA" } });
    await registrarAuditoria(
      {
        colegioId: user.colegioId,
        usuarioId: user.id,
        accion: "CREAR",
        entidad: "Pago",
        entidadId: pago.id,
        despues: { cuotaId: cuota.id, medio, monto: cuota.monto },
      },
      tx
    );
  });
  revalidatePath("/admin/finanzas");
  return { ok: true };
}

/**
 * Inicia un pago Webpay de una cuota (apoderado del pupilo o gestión). Crea un
 * Pago INICIADO con el token y devuelve la URL de redirección a Webpay.
 */
export async function iniciarPagoWebpay(cuotaId: string): Promise<Resultado<{ url: string; token: string }>> {
  const { user } = await requerirSesion();
  const cuota = await prisma.cuota.findFirst({
    where: {
      id: cuotaId,
      colegioId: user.colegioId,
      // Apoderado: solo cuotas de sus pupilos. Gestión: cualquiera del colegio.
      ...(puedeGestionarFinanzas(user.rol)
        ? {}
        : { estudiante: { apoderados: { some: { usuarioId: user.id } } } }),
    },
    select: { id: true, estudianteId: true, monto: true, estado: true },
  });
  if (!cuota) return { ok: false, error: "Cuota no encontrada." };
  if (cuota.estado === "PAGADA") return { ok: false, error: "La cuota ya está pagada." };

  // Idempotencia: evita generar dos transacciones para la misma cuota (doble
  // cobro si el apoderado abre dos pestañas). Reutiliza la ventana de 30 min.
  const enCurso = await prisma.pago.findFirst({
    where: { cuotaId: cuota.id, medio: "WEBPAY", estado: "INICIADO", creadoEn: { gt: new Date(Date.now() - 30 * 60 * 1000) } },
    select: { id: true },
  });
  if (enCurso) return { ok: false, error: "Ya hay un pago en curso para esta cuota. Espera unos minutos o revisa tu banco." };

  const buyOrder = `EC-${cuota.id.slice(-10)}-${Date.now().toString().slice(-6)}`;
  const sessionId = user.id.slice(-12);
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host") ?? "localhost:3000"}`;
  const returnUrl = `${origin}/api/pago/webpay`;

  try {
    const { token, url } = await crearTransaccionWebpay(buyOrder, sessionId, cuota.monto, returnUrl);
    await prisma.pago.create({
      data: {
        colegioId: user.colegioId,
        cuotaId: cuota.id,
        estudianteId: cuota.estudianteId,
        monto: cuota.monto,
        medio: "WEBPAY",
        estado: "INICIADO",
        referencia: token,
        registradoPorId: user.id, // iniciador (para auditar la confirmación)
      },
    });
    return { ok: true, url, token };
  } catch {
    return { ok: false, error: "No se pudo iniciar el pago. Intenta más tarde." };
  }
}

// ── Recordatorios de cuotas vencidas ─────────────────────────────────────────

const NOMBRE_CONCEPTO: Record<string, string> = {
  MATRICULA: "matrícula",
  MENSUALIDAD: "mensualidad",
  OTRO: "cuota",
};

/**
 * Envía a los apoderados el recordatorio de sus cuotas VENCIDAS impagas
 * (campana + push + email de respaldo). Anti-spam: máximo un recordatorio por
 * cuota cada 7 días (`recordatorioEnviadoEn`). Minimización: el aviso no
 * incluye montos; el detalle se ve dentro del portal. Auditado.
 */
export async function enviarRecordatoriosCuotas(): Promise<
  Resultado<{ enviados: number; omitidos: number }>
> {
  const { user } = await requerirSesion();
  if (!puedeGestionarFinanzas(user.rol)) {
    return { ok: false, error: "No tienes permiso para gestionar finanzas." };
  }

  const hoy = hoyEnSantiago();
  const hace7dias = new Date(Date.now() - 7 * 86_400_000);

  // Cuotas impagas ya vencidas, sin recordatorio reciente. Tope defensivo.
  const vencidas = await prisma.cuota.findMany({
    where: {
      colegioId: user.colegioId,
      estado: { in: ["PENDIENTE", "VENCIDA"] },
      vencimiento: { lt: fechaDesdeISO(hoy) },
      OR: [{ recordatorioEnviadoEn: null }, { recordatorioEnviadoEn: { lt: hace7dias } }],
      estudiante: { matriculas: { some: { estado: "ACTIVA" } } },
    },
    select: { id: true, estudianteId: true, concepto: true, numero: true, vencimiento: true },
    orderBy: { vencimiento: "asc" },
    take: 300,
  });

  if (vencidas.length === 0) {
    return { ok: true, enviados: 0, omitidos: 0 };
  }

  let enviados = 0;
  for (const c of vencidas) {
    const concepto = NOMBRE_CONCEPTO[c.concepto] ?? "cuota";
    await notificarApoderadosDeEstudiante(user.colegioId, c.estudianteId, {
      tipo: "GENERAL",
      titulo: "Recordatorio: cuota vencida",
      cuerpo: `La ${concepto} N°${c.numero} venció el ${formatearFechaLarga(isoDesdeFecha(c.vencimiento))}. Puedes revisarla y pagarla en línea desde tu portal.`,
      enlace: "/mi-cuenta",
    });
    await prisma.cuota.update({
      where: { id: c.id },
      data: { recordatorioEnviadoEn: new Date() },
    });
    enviados++;
  }

  await registrarAuditoria({
    colegioId: user.colegioId,
    usuarioId: user.id,
    accion: "MODIFICAR",
    entidad: "Cuota",
    entidadId: "recordatorios",
    despues: { recordatoriosEnviados: enviados }, // metadatos, sin PII
  });

  revalidatePath("/admin/finanzas");
  return { ok: true, enviados, omitidos: 0 };
}
