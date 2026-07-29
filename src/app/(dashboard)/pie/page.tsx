import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requerirRol } from "@/lib/sesion";
import { cifradoDisponible } from "@/lib/cifrado";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { EstadoVacio } from "@/components/ui/estado-vacio";
import { SelectorEstudiante } from "./selector-cliente";

export default async function PiePage() {
  const { user } = await requerirRol("ADMIN", "DIRECTOR", "PIE");

  const [fichas, estudiantes] = await Promise.all([
    prisma.fichaPie.findMany({
      where: { colegioId: user.colegioId, eliminadaEn: null },
      select: {
        estudianteId: true,
        profesionalACargo: true,
        actualizadaEn: true,
        estudiante: {
          select: {
            nombres: true,
            apellidos: true,
            matriculas: {
              where: { estado: "ACTIVA" },
              select: { curso: { select: { nivel: true, letra: true } } },
              take: 1,
            },
          },
        },
        _count: { select: { sesiones: { where: { eliminadaEn: null } } } },
      },
      orderBy: { actualizadaEn: "desc" },
    }),
    prisma.estudiante.findMany({
      where: { colegioId: user.colegioId },
      select: {
        id: true,
        nombres: true,
        apellidos: true,
        matriculas: {
          where: { estado: "ACTIVA" },
          select: { curso: { select: { nivel: true, letra: true } } },
          take: 1,
        },
      },
      orderBy: [{ apellidos: "asc" }, { nombres: "asc" }],
      take: 1000,
    }),
  ]);

  const opciones = estudiantes.map((e) => ({
    id: e.id,
    nombre: `${e.apellidos}, ${e.nombres}`,
    curso: e.matriculas[0] ? `${e.matriculas[0].curso.nivel} ${e.matriculas[0].curso.letra}` : "",
  }));

  return (
    <div className="mx-auto max-w-3xl">
      <EncabezadoPagina
        icono="escudo"
        titulo="Registros PIE"
        descripcion="Programa de Integración Escolar — información confidencial de apoyo."
      />

      {!cifradoDisponible() && (
        <p className="mb-4 rounded-lg border border-alerta/30 bg-alerta-suave px-3 py-2.5 text-sm text-alerta">
          El cifrado PIE no está configurado (falta PIE_ENCRYPTION_KEY). No se
          pueden crear ni ver diagnósticos hasta configurarlo.
        </p>
      )}

      <div className="superficie rounded-xl p-5">
        <p className="text-sm font-medium text-tinta">Abrir ficha de un estudiante</p>
        <p className="mt-0.5 text-xs text-tinta-tenue">
          Elige un estudiante para ver o crear su ficha de apoyo.
        </p>
        <div className="mt-3">
          <SelectorEstudiante estudiantes={opciones} />
        </div>
      </div>

      <h2 className="mt-8 font-display text-lg font-semibold tracking-tight">
        Fichas activas ({fichas.length})
      </h2>
      {fichas.length === 0 ? (
        <EstadoVacio
          icono="escudo"
          titulo="Sin fichas de apoyo"
          descripcion="Cuando registres una ficha PIE de un estudiante, aparecerá aquí."
        />
      ) : (
        <ul className="mt-3 space-y-2">
          {fichas.map((f) => (
            <li key={f.estudianteId}>
              <Link
                href={`/pie/${f.estudianteId}`}
                className="superficie tarjeta-int flex items-center justify-between gap-3 rounded-xl p-4"
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold text-tinta">
                    {f.estudiante.apellidos}, {f.estudiante.nombres}
                  </p>
                  <p className="text-xs text-tinta-tenue">
                    {f.estudiante.matriculas[0]
                      ? `${f.estudiante.matriculas[0].curso.nivel} ${f.estudiante.matriculas[0].curso.letra} · `
                      : ""}
                    {f._count.sesiones} {f._count.sesiones === 1 ? "sesión" : "sesiones"}
                    {f.profesionalACargo ? ` · ${f.profesionalACargo}` : ""}
                  </p>
                </div>
                <span className="text-tinta-tenue" aria-hidden>→</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
