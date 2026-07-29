import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requerirRol } from "@/lib/sesion";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { EstadoVacio } from "@/components/ui/estado-vacio";
import { nombreCurso } from "@/lib/cursos";


function tiempoRelativo(d: Date): string {
  const seg = Math.round((Date.now() - d.getTime()) / 1000);
  if (seg < 60) return "recién";
  const min = Math.round(seg / 60);
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const dias = Math.round(h / 24);
  if (dias < 7) return `hace ${dias} d`;
  return new Intl.DateTimeFormat("es-CL", { day: "numeric", month: "short" }).format(d);
}

export default async function MensajesPage() {
  const { user } = await requerirRol("APODERADO", "PROFESOR_JEFE", "ADMIN", "DIRECTOR", "UTP");
  const soyApoderado = user.rol === "APODERADO";

  // Estudiantes cuyos hilos ve este usuario (multi-tenant + pertenencia).
  const whereEst: Prisma.EstudianteWhereInput = soyApoderado
    ? { colegioId: user.colegioId, apoderados: { some: { usuarioId: user.id } } }
    : user.rol === "PROFESOR_JEFE"
      ? { colegioId: user.colegioId, matriculas: { some: { estado: "ACTIVA", curso: { profesorJefeId: user.id } } } }
      : { colegioId: user.colegioId };

  const mensajes = await prisma.mensajeDirecto.findMany({
    where: { colegioId: user.colegioId, estudiante: whereEst },
    orderBy: { creadoEn: "desc" },
    take: 500,
    select: { estudianteId: true, deApoderado: true, cuerpo: true, creadoEn: true, leidoEn: true },
  });

  const idsConMensaje = [...new Set(mensajes.map((m) => m.estudianteId))];

  // Apoderado: mostramos a todos sus pupilos (aunque no tengan mensajes, para
  // iniciar la conversación). Staff: solo estudiantes con mensajes.
  const estudiantes = await prisma.estudiante.findMany({
    where: soyApoderado
      ? whereEst
      : { colegioId: user.colegioId, id: { in: idsConMensaje.length ? idsConMensaje : ["—"] } },
    select: {
      id: true,
      nombres: true,
      apellidos: true,
      matriculas: {
        where: { estado: "ACTIVA" },
        select: { curso: { select: { nivel: true, letra: true, profesorJefe: { select: { nombre: true } } } } },
        take: 1,
      },
    },
  });

  // Último mensaje y no leídos por estudiante. No leído = de la contraparte y sin leer.
  const conversaciones = estudiantes
    .map((e) => {
      const suyos = mensajes.filter((m) => m.estudianteId === e.id);
      const ultimo = suyos[0]; // ya vienen desc
      const noLeidos = suyos.filter((m) => m.deApoderado !== soyApoderado && m.leidoEn === null).length;
      const curso = e.matriculas[0]?.curso ?? null;
      return {
        id: e.id,
        nombre: `${e.nombres} ${e.apellidos}`,
        curso: curso ? nombreCurso(curso) : null,
        contraparte: soyApoderado
          ? curso?.profesorJefe?.nombre ?? "Profesor jefe"
          : `Apoderado de ${e.nombres.split(" ")[0]}`,
        ultimo: ultimo
          ? { texto: ultimo.cuerpo, cuando: ultimo.creadoEn, mio: ultimo.deApoderado === soyApoderado }
          : null,
        noLeidos,
      };
    })
    // No leídos primero; luego por actividad reciente; los sin mensajes al final.
    .sort((a, b) => {
      if (a.noLeidos !== b.noLeidos) return b.noLeidos - a.noLeidos;
      const ta = a.ultimo?.cuando.getTime() ?? 0;
      const tb = b.ultimo?.cuando.getTime() ?? 0;
      return tb - ta;
    });

  const destino = (id: string) =>
    soyApoderado ? `/mi-pupilo/${id}#mensajes` : `/admin/estudiantes/${id}#mensajes`;

  return (
    <div>
      <EncabezadoPagina
        icono="comunicacion"
        titulo="Mensajes"
        descripcion={
          soyApoderado
            ? "Conversaciones con el profesor jefe de cada pupilo."
            : "Conversaciones directas con los apoderados de tu curso."
        }
      />

      {conversaciones.length === 0 ? (
        <EstadoVacio
          icono="comunicacion"
          titulo="Sin conversaciones"
          descripcion={
            soyApoderado
              ? "Cuando escribas al profesor jefe desde la ficha de tu pupilo, la conversación aparecerá aquí."
              : "Cuando un apoderado te escriba (o tú a él desde la ficha del estudiante), la conversación aparecerá aquí."
          }
        />
      ) : (
        <ul className="overflow-hidden rounded-xl border border-borde bg-superficie shadow-suave">
          {conversaciones.map((c) => (
            <li key={c.id} className="border-b border-borde last:border-0">
              <Link
                href={destino(c.id)}
                className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-superficie-2"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-marca-100 text-sm font-semibold text-marca-700">
                  {c.nombre.split(" ").slice(0, 2).map((p) => p[0]).join("")}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 truncate font-semibold text-tinta">
                    {soyApoderado ? c.contraparte : c.nombre}
                    {c.curso && (
                      <span className="shrink-0 rounded bg-superficie-3 px-1.5 py-0.5 text-[11px] font-medium text-tinta-tenue">
                        {c.curso}
                      </span>
                    )}
                  </p>
                  <p className="truncate text-xs text-tinta-tenue">
                    {c.ultimo
                      ? `${c.ultimo.mio ? "Tú: " : ""}${c.ultimo.texto}`
                      : soyApoderado
                        ? `Escríbele a ${c.contraparte}`
                        : "Sin mensajes aún"}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  {c.ultimo && (
                    <span className="text-[11px] text-tinta-tenue">{tiempoRelativo(c.ultimo.cuando)}</span>
                  )}
                  {c.noLeidos > 0 && (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-marca-600 px-1.5 text-[11px] font-bold text-white">
                      {c.noLeidos > 9 ? "9+" : c.noLeidos}
                    </span>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
