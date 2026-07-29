import { redirect } from "next/navigation";
import { requerirSesion } from "@/lib/sesion";
import { prisma } from "@/lib/prisma";
import {
  rolElegibleEntrevistas,
  whereEstudiantesEntrevista,
} from "@/lib/entrevistas";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { EstadoVacio } from "@/components/ui/estado-vacio";
import { BotonEnlace } from "@/components/ui/boton";
import { Insignia } from "@/components/ui/insignia";

const fmt = (d: Date) =>
  new Intl.DateTimeFormat("es-CL", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d);

/**
 * Índice de entrevistas / reuniones con apoderados. Es un registro pedagógico
 * (distinto de convivencia escolar) que la profesora pedía poder encontrar como
 * cosa propia. Reutiliza el modelo Entrevista existente; solo lectura + acceso.
 */
export default async function EntrevistasPage() {
  const { user } = await requerirSesion();
  if (!rolElegibleEntrevistas(user.rol)) redirect("/dashboard");

  const entrevistas = await prisma.entrevista.findMany({
    where: {
      colegioId: user.colegioId,
      eliminadaEn: null,
      estudiante: whereEstudiantesEntrevista(user),
    },
    select: {
      id: true,
      apoderado: true,
      motivo: true,
      fecha: true,
      proximaCita: true,
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
    },
    orderBy: { fecha: "desc" },
    take: 100,
  });

  return (
    <div>
      <EncabezadoPagina
        icono="convivencia"
        titulo="Entrevistas de apoderado"
        descripcion="Reuniones con apoderados: motivo, acuerdos y próxima cita. Quedan en la ficha del estudiante."
        acciones={
          <BotonEnlace href="/convivencia/entrevistas/nueva" tamano="sm">
            Registrar entrevista
          </BotonEnlace>
        }
      />

      {entrevistas.length === 0 ? (
        <EstadoVacio
          icono="convivencia"
          titulo="Aún no hay entrevistas registradas"
          descripcion="Cuando registres una reunión con un apoderado, aparecerá aquí."
          accion={{ href: "/convivencia/entrevistas/nueva", etiqueta: "Registrar entrevista" }}
        />
      ) : (
        <ul className="surgir-secuencia mt-2 space-y-2">
          {entrevistas.map((e) => {
            const curso = e.estudiante.matriculas[0]?.curso;
            return (
              <li key={e.id} className="superficie rounded-xl p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-tinta">
                    {e.estudiante.apellidos}, {e.estudiante.nombres}
                    {curso && (
                      <span className="ml-2 text-xs font-normal text-tinta-tenue">
                        {curso.nivel} {curso.letra}
                      </span>
                    )}
                  </p>
                  <span className="text-xs capitalize text-tinta-tenue">{fmt(e.fecha)}</span>
                </div>
                <p className="mt-1 text-sm text-tinta-suave">
                  <span className="font-medium text-tinta">Apoderado:</span> {e.apoderado} ·{" "}
                  <span className="font-medium text-tinta">Motivo:</span> {e.motivo}
                </p>
                {e.proximaCita && (
                  <div className="mt-2">
                    <Insignia tono="marca" punto>
                      Próxima cita: {fmt(e.proximaCita)}
                    </Insignia>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
