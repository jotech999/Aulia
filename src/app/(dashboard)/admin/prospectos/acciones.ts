"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requerirRol } from "@/lib/sesion";

/** Marca (o desmarca) un prospecto como contactado. Solo ADMIN. */
export async function marcarContactado(id: string, contactado: boolean) {
  await requerirRol("ADMIN");
  await prisma.solicitudDemo.update({
    where: { id },
    data: { contactado },
  });
  revalidatePath("/admin/prospectos");
}
