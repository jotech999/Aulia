import { prisma } from "@/lib/prisma";
import { requerirSesion } from "@/lib/sesion";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { FormularioSolicitud } from "./formulario-solicitud";
import { ETIQUETA_TIPO } from "@/lib/privacidad";
import { BandejaPrivacidad } from "./bandeja-privacidad";

const ESTADO: Record<string, string> = {
  RECIBIDA: "Recibida", VERIFICANDO_IDENTIDAD: "Verificando identidad", EN_PROCESO: "En proceso",
  RESPONDIDA: "Respondida", RECHAZADA: "Rechazada", CANCELADA: "Cancelada",
};

export default async function PrivacidadPage() {
  const { user } = await requerirSesion();
  const solicitudes = await prisma.solicitudTitular.findMany({
    where: { colegioId: user.colegioId, titularUsuarioId: user.id },
    select: { id: true, tipo: true, estado: true, recibidaEn: true, respuesta: true, eventos: { orderBy: { creadoEn: "asc" }, select: { estadoNuevo: true, creadoEn: true, nota: true } } },
    orderBy: { recibidaEn: "desc" },
  });
  const puedeGestionar = ["ADMIN", "DIRECTOR"].includes(user.rol);
  const bandeja = puedeGestionar ? await prisma.solicitudTitular.findMany({
    where: { colegioId: user.colegioId, estado: { notIn: ["RESPONDIDA", "RECHAZADA", "CANCELADA"] } },
    select: {
      id: true,
      tipo: true,
      estado: true,
      descripcion: true,
      titularUsuarioId: true,
      recibidaEn: true,
      vencimientoEn: true,
    },
    orderBy: [{ vencimientoEn: "asc" }, { recibidaEn: "asc" }], take: 100,
  }) : [];
  const titulares = puedeGestionar && bandeja.length > 0
    ? await prisma.usuario.findMany({
        where: {
          id: { in: [...new Set(bandeja.map((solicitud) => solicitud.titularUsuarioId))] },
          membresias: { some: { colegioId: user.colegioId, activa: true } },
        },
        select: { id: true, nombre: true, email: true },
      })
    : [];
  const titularPorId = new Map(titulares.map((titular) => [titular.id, titular]));
  return (
    <div className="space-y-6">
      <EncabezadoPagina icono="candado" titulo="Privacidad y mis datos" descripcion="Controla tus datos y sigue tus solicitudes en un espacio seguro." />
      <div className="rounded-2xl border border-marca-100 bg-marca-50 p-5 text-sm text-marca-800">
        <p className="font-semibold">Tus derechos, en lenguaje claro</p>
        <p className="mt-1 leading-6">Puedes pedir acceso, corrección, portabilidad, oposición, bloqueo o supresión. Algunos registros escolares deben conservarse por obligación legal; si una supresión no procede, el colegio debe explicarte el fundamento y las alternativas.</p>
        <p className="mt-2 text-xs opacity-80">Centro preparado para la entrada en vigencia de la Ley 21.719 el 1 de diciembre de 2026.</p>
      </div>
      <FormularioSolicitud />
      <section>
        <h2 className="font-display text-lg font-semibold text-tinta">Mis solicitudes</h2>
        {solicitudes.length === 0 ? <p className="mt-3 rounded-xl border border-borde bg-superficie p-5 text-sm text-tinta-suave">Aún no has enviado solicitudes.</p> : (
          <ul className="mt-3 space-y-3">{solicitudes.map((s) => (
            <li key={s.id} className="superficie rounded-xl p-4">
              <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold text-tinta">{ETIQUETA_TIPO[s.tipo]}</p><span className="rounded-full bg-superficie-3 px-2.5 py-1 text-xs font-semibold text-tinta-suave">{ESTADO[s.estado]}</span></div>
              <p className="mt-1 text-xs text-tinta-tenue">Recibida {new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeZone: "America/Santiago" }).format(s.recibidaEn)}</p>
              {s.respuesta && <p className="mt-3 rounded-lg bg-exito-suave p-3 text-sm text-exito">{s.respuesta}</p>}
              <ol className="mt-3 border-l border-borde pl-3 text-xs text-tinta-suave">{s.eventos.map((e, i) => <li key={i} className="py-1"><strong>{ESTADO[e.estadoNuevo]}</strong>{e.nota ? ` · ${e.nota}` : ""}</li>)}</ol>
            </li>
          ))}</ul>
        )}
      </section>
      {puedeGestionar && <BandejaPrivacidad solicitudes={bandeja.map((s) => ({
        id: s.id,
        tipo: s.tipo,
        estado: s.estado,
        descripcion: s.descripcion ?? "Sin detalle adicional.",
        recibidaEn: s.recibidaEn.toISOString(),
        vencimientoEn: s.vencimientoEn.toISOString(),
        titular: titularPorId.get(s.titularUsuarioId) ?? { nombre: "Usuario no disponible", email: "" },
      }))} />}
    </div>
  );
}
