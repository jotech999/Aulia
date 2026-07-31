import { prisma } from "@/lib/prisma";
import { requerirRol } from "@/lib/sesion";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { TablaProspectos } from "./prospectos-cliente";

export const dynamic = "force-dynamic";

/**
 * PROSPECTOS — la base de correos que Auli y el formulario de la landing
 * recopilan (pre-venta, sin colegioId). Solo ADMIN.
 */
export default async function ProspectosPage() {
  await requerirRol("ADMIN");

  const filas = await prisma.solicitudDemo.findMany({
    orderBy: { creadoEn: "desc" },
    take: 500,
  });

  const prospectos = filas.map((f) => ({
    id: f.id,
    nombre: f.nombre,
    email: f.email,
    colegio: f.colegio,
    cargo: f.cargo,
    telefono: f.telefono,
    mensaje: f.mensaje,
    origen: f.origen,
    creadoEn: f.creadoEn.toISOString(),
    contactado: f.contactado,
  }));

  const pendientes = prospectos.filter((p) => !p.contactado).length;

  return (
    <div className="mx-auto max-w-5xl">
      <EncabezadoPagina
        icono="comunicacion"
        titulo="Prospectos"
        descripcion={`Correos recopilados por Auli y el formulario de la landing. ${
          pendientes > 0 ? `${pendientes} por contactar.` : "Todo contactado."
        }`}
      />
      <div className="mt-5">
        <TablaProspectos prospectos={prospectos} />
      </div>
    </div>
  );
}
