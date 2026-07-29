import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { confirmarTransaccionWebpay } from "@/lib/webpay";
import { registrarAuditoria } from "@/lib/auditoria";

/**
 * Retorno de Webpay. Transbank redirige el navegador del pagador aquí con
 * `token_ws` (o `TBK_TOKEN` si el usuario canceló). Confirma la transacción y
 * marca la cuota como pagada. Opera por token (secreto), no por sesión.
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const tokenWs = sp.get("token_ws");
  const tbkToken = sp.get("TBK_TOKEN");
  const base = new URL("/mi-cuenta", req.nextUrl.origin);

  // Cancelación del usuario en Webpay.
  if (!tokenWs && tbkToken) {
    await prisma.pago.updateMany({ where: { referencia: tbkToken, estado: "INICIADO" }, data: { estado: "RECHAZADO" } }).catch(() => {});
    base.searchParams.set("pago", "cancelado");
    return NextResponse.redirect(base);
  }
  if (!tokenWs) {
    base.searchParams.set("pago", "error");
    return NextResponse.redirect(base);
  }

  const pago = await prisma.pago.findFirst({
    where: { referencia: tokenWs, medio: "WEBPAY" },
    select: { id: true, cuotaId: true, estado: true, monto: true, colegioId: true, registradoPorId: true },
  });
  if (!pago) {
    base.searchParams.set("pago", "error");
    return NextResponse.redirect(base);
  }
  // Idempotencia: si ya se procesó, no reconfirmar.
  if (pago.estado === "CONFIRMADO") {
    base.searchParams.set("pago", "ok");
    return NextResponse.redirect(base);
  }

  const auditar = async (estado: "CONFIRMADO" | "RECHAZADO", nota: string) => {
    if (!pago.registradoPorId) return;
    await registrarAuditoria({
      colegioId: pago.colegioId,
      usuarioId: pago.registradoPorId,
      accion: estado === "CONFIRMADO" ? "CREAR" : "MODIFICAR",
      entidad: "Pago",
      entidadId: pago.id,
      despues: { medio: "WEBPAY", estado, monto: pago.monto, nota },
    }).catch(() => {});
  };

  try {
    const res = await confirmarTransaccionWebpay(tokenWs);
    // Defensa en profundidad: el monto confirmado debe coincidir con el fijado.
    if (res.aprobado && res.monto !== pago.monto) {
      await prisma.pago.update({ where: { id: pago.id }, data: { estado: "RECHAZADO" } });
      await auditar("RECHAZADO", "monto no coincide");
      base.searchParams.set("pago", "error");
      return NextResponse.redirect(base);
    }
    if (res.aprobado) {
      // Cierre condicional: solo marca la cuota si SEGUÍA sin pagar (evita que un
      // segundo token pagado re-marque una cuota ya saldada por otro pago).
      const cuota = pago.cuotaId
        ? await prisma.cuota.findUnique({ where: { id: pago.cuotaId }, select: { estado: true } })
        : null;
      const yaPagada = cuota?.estado === "PAGADA";
      await prisma.$transaction([
        prisma.pago.update({ where: { id: pago.id }, data: { estado: "CONFIRMADO" } }),
        ...(pago.cuotaId && !yaPagada ? [prisma.cuota.update({ where: { id: pago.cuotaId }, data: { estado: "PAGADA" } })] : []),
      ]);
      await auditar("CONFIRMADO", yaPagada ? "pago duplicado (requiere reverso manual)" : "pago confirmado");
      base.searchParams.set("pago", yaPagada ? "duplicado" : "ok");
    } else {
      await prisma.pago.update({ where: { id: pago.id }, data: { estado: "RECHAZADO" } });
      await auditar("RECHAZADO", "pago rechazado por Webpay");
      base.searchParams.set("pago", "rechazado");
    }
  } catch {
    base.searchParams.set("pago", "error");
  }
  return NextResponse.redirect(base);
}
