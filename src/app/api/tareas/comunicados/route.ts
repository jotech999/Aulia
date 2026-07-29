import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { registrarAuditoria } from "@/lib/auditoria";
import { crearNotificaciones } from "@/lib/notificaciones";

export const dynamic = "force-dynamic";

async function ejecutar(request: NextRequest) {
  const secreto = process.env.CRON_SECRET;
  if (!secreto) return NextResponse.json({ error: "Tarea no configurada." }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secreto}`) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  // Lease recuperable: una instancia puede detenerse después de reclamar un
  // trabajo. Pasados 15 minutos vuelve a la cola o se cierra tras 5 intentos.
  const leaseVencido = new Date(Date.now() - 15 * 60 * 1000);
  await prisma.trabajoOutbox.updateMany({
    where: { tipo: "PUBLICAR_COMUNICADO", estado: "PROCESANDO", bloqueadoEn: { lt: leaseVencido }, intentos: { lt: 5 } },
    data: { estado: "PENDIENTE", bloqueadoEn: null, disponibleEn: new Date(), errorCodigo: "LEASE_VENCIDO" },
  });
  await prisma.trabajoOutbox.updateMany({
    where: { tipo: "PUBLICAR_COMUNICADO", estado: "PROCESANDO", bloqueadoEn: { lt: leaseVencido }, intentos: { gte: 5 } },
    data: { estado: "FALLIDO", bloqueadoEn: null, procesadoEn: new Date(), errorCodigo: "INTENTOS_AGOTADOS" },
  });

  const trabajos = await prisma.trabajoOutbox.findMany({
    where: { tipo: "PUBLICAR_COMUNICADO", estado: "PENDIENTE", disponibleEn: { lte: new Date() } },
    orderBy: { disponibleEn: "asc" },
    take: 25,
    select: { id: true, colegioId: true, agregadoId: true, intentos: true },
  });
  let completados = 0;
  for (const trabajo of trabajos) {
    const reclamado = await prisma.trabajoOutbox.updateMany({
      where: { id: trabajo.id, colegioId: trabajo.colegioId, estado: "PENDIENTE" },
      data: { estado: "PROCESANDO", bloqueadoEn: new Date(), intentos: { increment: 1 } },
    });
    if (reclamado.count === 0) continue;
    try {
      await prisma.$transaction(async (tx) => {
        const com = await tx.comunicado.findFirst({
          where: { id: trabajo.agregadoId, colegioId: trabajo.colegioId, estado: "PROGRAMADO", eliminadoEn: null },
          select: { id: true, autorId: true, titulo: true, destinatarios: { select: { apoderadoUsuarioId: true } } },
        });
        if (!com) return null;
        await tx.comunicado.update({ where: { id: com.id }, data: { estado: "PUBLICADO", publicadoEn: new Date() } });
        await registrarAuditoria({ colegioId: trabajo.colegioId, usuarioId: com.autorId, accion: "MODIFICAR", entidad: "Comunicado", entidadId: com.id, antes: { estado: "PROGRAMADO" }, despues: { estado: "PUBLICADO", origen: "PROGRAMACION" } }, tx);
        const usuarios = [...new Set(com.destinatarios.map((destinatario) => destinatario.apoderadoUsuarioId))];
        await crearNotificaciones(usuarios.map((usuarioId) => ({ colegioId: trabajo.colegioId, usuarioId, tipo: "COMUNICADO" as const, titulo: `Nuevo comunicado: ${com.titulo}`, enlace: "/comunicacion" })), tx);
        return com;
      });
      await prisma.trabajoOutbox.update({ where: { id: trabajo.id }, data: { estado: "COMPLETADO", procesadoEn: new Date(), bloqueadoEn: null } });
      completados += 1;
    } catch {
      await prisma.trabajoOutbox.update({
        where: { id: trabajo.id },
        data: trabajo.intentos >= 4
          ? { estado: "FALLIDO", errorCodigo: "PUBLICACION_FALLIDA", bloqueadoEn: null }
          : { estado: "PENDIENTE", errorCodigo: "REINTENTO", bloqueadoEn: null, disponibleEn: new Date(Date.now() + 5 * 60 * 1000) },
      });
    }
  }
  return NextResponse.json({ revisados: trabajos.length, completados });
}

export const GET = ejecutar;
export const POST = ejecutar;
