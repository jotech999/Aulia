import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requerirSesion } from "@/lib/sesion";
import { whereAsignaturasAccesibles } from "../calificaciones/consultas";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { EstadoVacio } from "@/components/ui/estado-vacio";
import { colorAsignatura } from "@/lib/colores-asignatura";
import { BotonEnlace } from "@/components/ui/boton";
import { Banco } from "./banco-cliente";
import { nombreCurso } from "@/lib/cursos";


export default async function EvaluacionesPage({
  searchParams,
}: {
  searchParams: Promise<{ asignaturaId?: string }>;
}) {
  const { user } = await requerirSesion();
  const sp = await searchParams;

  const asignaturas = await prisma.asignatura.findMany({
    where: whereAsignaturasAccesibles(user),
    select: { id: true, nombre: true, color: true, curso: { select: { nivel: true, letra: true } } },
    orderBy: [{ curso: { nivel: "asc" } }, { nombre: "asc" }],
  });
  const asignaturaSel = sp.asignaturaId ? asignaturas.find((a) => a.id === sp.asignaturaId) : undefined;

  if (!asignaturaSel) {
    return (
      <div>
        <EncabezadoPagina
          icono="calificaciones"
          titulo="Evaluaciones online"
          descripcion="Banco de preguntas y quizzes con corrección automática."
          acciones={<BotonEnlace href="/libro-clases/rubricas" variante="secundario">Rúbricas y pautas</BotonEnlace>}
        />
        {asignaturas.length === 0 ? (
          <EstadoVacio icono="calificaciones" titulo="Sin asignaturas" descripcion="Cuando tengas asignaturas a cargo podrás crear evaluaciones." />
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {asignaturas.map((a) => (
              <li key={a.id}>
                <Link
                  href={`/libro-clases/evaluaciones?asignaturaId=${a.id}`}
                  className="superficie tarjeta-int flex items-center justify-between rounded-xl p-4"
                >
                  <span className="flex items-center gap-1.5">
                    <span
                      className={`h-2.5 w-2.5 shrink-0 rounded-full ${colorAsignatura(a.nombre, a.color).punto}`}
                      aria-hidden
                    />
                    <span className="font-semibold text-tinta">{a.nombre}</span>
                    <span className="ml-1 text-sm text-tinta-suave">{nombreCurso(a.curso)}</span>
                  </span>
                  <span className="text-tinta-tenue" aria-hidden>→</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  const [preguntas, quizzes] = await Promise.all([
    prisma.pregunta.findMany({
      where: { asignaturaId: asignaturaSel.id, colegioId: user.colegioId, eliminadaEn: null },
      orderBy: { creadaEn: "desc" },
      select: {
        id: true, tipo: true, enunciado: true, oaCodigo: true, puntaje: true, vfCorrecta: true,
        alternativas: { select: { id: true, texto: true, correcta: true }, orderBy: { orden: "asc" } },
      },
    }),
    prisma.quiz.findMany({
      where: { asignaturaId: asignaturaSel.id, colegioId: user.colegioId, eliminadoEn: null },
      orderBy: { creadoEn: "desc" },
      select: { id: true, titulo: true, creadoEn: true, _count: { select: { preguntas: true, resultados: true } } },
    }),
  ]);

  return (
    <div>
      <EncabezadoPagina
        icono="calificaciones"
        titulo={asignaturaSel.nombre}
        descripcion={`${nombreCurso(asignaturaSel.curso)} · evaluaciones online`}
        volver={{ href: "/libro-clases/evaluaciones", etiqueta: "Cambiar asignatura" }}
        acciones={<BotonEnlace href="/libro-clases/rubricas" variante="secundario">Rúbricas y pautas</BotonEnlace>}
      />

      {/* Quizzes existentes */}
      <section className="mt-5">
        <h2 className="font-display text-lg font-semibold tracking-tight">Quizzes</h2>
        {quizzes.length === 0 ? (
          <p className="superficie mt-3 rounded-xl px-5 py-4 text-sm text-tinta-suave">
            Aún no hay quizzes. Crea uno con las preguntas del banco.
          </p>
        ) : (
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {quizzes.map((q) => (
              <li key={q.id}>
                <Link href={`/libro-clases/evaluaciones/${q.id}`} className="superficie tarjeta-int flex items-center justify-between rounded-xl p-4">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-tinta">{q.titulo}</p>
                    <p className="text-xs text-tinta-tenue">
                      {q._count.preguntas} pregunta(s) · {q._count.resultados} corregido(s)
                    </p>
                  </div>
                  <span className="text-tinta-tenue" aria-hidden>→</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Banco de preguntas + armado de quiz */}
      <Banco asignaturaId={asignaturaSel.id} preguntas={preguntas} />
    </div>
  );
}
