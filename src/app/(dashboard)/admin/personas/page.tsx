import Link from "next/link";
import { requerirSesion } from "@/lib/sesion";
import { notFound } from "next/navigation";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { EstadoVacio } from "@/components/ui/estado-vacio";
import {
  NOMBRE_ROL,
  ROLES_GESTIONAR_PERSONAS,
  ROLES_VER_PERSONAS,
  rolesQuePuedeOtorgar,
} from "@/lib/personas";
import { listarPersonas } from "./consultas";
import { FiltrosPersonas } from "./filtros";
import { NuevaPersona } from "./nueva-persona";
import { AccionesPersona } from "./acciones-persona";

/**
 * DIRECTORIO DE PERSONAS.
 *
 * Una sola guía con todo el que tiene cuenta en el colegio: equipo y familias.
 * Antes no existía: los apoderados solo se creaban escribiéndolos a mano al
 * matricular (y había que reescribirlos para cada hermano), y no había ninguna
 * forma de dar de alta a un profesor o a un director desde la plataforma.
 */
export default async function PersonasPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; rol?: string; inactivos?: string }>;
}) {
  const { user } = await requerirSesion();
  if (!ROLES_VER_PERSONAS.has(user.rol)) notFound();

  const sp = await searchParams;
  const { personas, total, conteoPorRol, acotadoAMisCursos, sinApoderado } = await listarPersonas(user, {
    q: sp.q,
    rol: sp.rol,
    inactivos: sp.inactivos === "1",
  });

  const puedeGestionar = ROLES_GESTIONAR_PERSONAS.has(user.rol);
  // Minimización (Ley 21.719): el RUT completo es dato de administración. UTP e
  // inspectoría lo ven enmascarado: alcanza para distinguir homónimos.
  const verRutCompleto = ROLES_GESTIONAR_PERSONAS.has(user.rol);
  const mostrarRut = (rut: string) =>
    verRutCompleto ? rut : rut.replace(/^(\d{2})[\d.]+(-[\dkK])$/, "$1.···.···$2");
  const rolesPermitidos = rolesQuePuedeOtorgar(user.rol);
  const hayFiltro = Boolean(sp.q || sp.rol);
  const apoderadosVisibles = conteoPorRol["APODERADO"] ?? 0;

  return (
    <div>
      <EncabezadoPagina
        icono="estudiantes"
        titulo="Personas"
        descripcion={
          acotadoAMisCursos
            ? "El equipo del colegio y los apoderados de tus cursos, con sus datos de contacto."
            : "Todo el que tiene cuenta en el colegio: equipo y apoderados. Busca, agrega y administra accesos."
        }
        acciones={
          puedeGestionar && rolesPermitidos.length > 0 ? (
            <NuevaPersona rolesPermitidos={rolesPermitidos} />
          ) : undefined
        }
      />

      <FiltrosPersonas conteoPorRol={conteoPorRol} total={total} />

      {acotadoAMisCursos && (
        <p className="mt-3 rounded-lg border border-marca-200 bg-marca-50 px-3 py-2 text-xs leading-relaxed text-marca-800">
          Ves a los apoderados de los estudiantes de <strong>tus cursos</strong> y al equipo del
          colegio. Las familias de otros cursos no aparecen aquí.
          {apoderadosVisibles === 0 && (
            <>
              {" "}
              <strong>Por ahora no aparece ninguno</strong>: los estudiantes de tus cursos todavía
              no tienen un apoderado registrado en la plataforma.
            </>
          )}
        </p>
      )}

      {personas.length === 0 ? (
        <div className="mt-4">
          <EstadoVacio
            icono="estudiantes"
            titulo={
              hayFiltro
                ? "Sin resultados"
                : acotadoAMisCursos
                  ? "Aún no hay apoderados en tus cursos"
                  : "Aún no hay personas registradas"
            }
            descripcion={
              hayFiltro
                ? "Prueba con otro nombre, correo o RUT, o quita el filtro de rol."
                : "Agrega al equipo del colegio y a los apoderados para que puedan entrar a la plataforma."
            }
          />
        </div>
      ) : (
        <div className="superficie mt-4 overflow-x-auto rounded-xl">
          <table className="w-full min-w-[46rem] text-left text-sm">
            <caption className="sr-only">Personas del colegio</caption>
            <thead className="border-b border-borde bg-superficie-2 text-xs uppercase tracking-wide text-tinta-tenue">
              <tr>
                <th scope="col" className="px-4 py-2.5">
                  Persona
                </th>
                <th scope="col" className="px-4 py-2.5">
                  Rol
                </th>
                <th scope="col" className="px-4 py-2.5">
                  Contacto
                </th>
                <th scope="col" className="px-4 py-2.5">
                  Vínculos
                </th>
                <th scope="col" className="px-3 py-2.5 text-right">
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {personas.map((p) => (
                <tr
                  key={p.membresiaId}
                  className={`border-b border-borde last:border-0 ${p.activa ? "" : "bg-superficie-2/60"}`}
                >
                  <td className="px-4 py-2.5">
                    <p className="font-medium leading-snug text-tinta">{p.nombre}</p>
                    <p className="text-xs tabular-nums text-tinta-tenue">{mostrarRut(p.rut)}</p>
                    {!p.activa && (
                      <span className="mt-1 inline-block rounded-md bg-peligro-suave px-1.5 py-0.5 text-[11px] font-semibold text-peligro">
                        Acceso revocado
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="inline-block rounded-lg bg-superficie-3 px-2 py-0.5 text-xs font-semibold text-tinta-suave">
                      {NOMBRE_ROL[p.rol] ?? p.rol}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <a
                      href={`mailto:${p.email}`}
                      className="block truncate text-marca-700 hover:underline"
                      title={p.email}
                    >
                      {p.email}
                    </a>
                    {p.telefono && (
                      <p className="text-xs tabular-nums text-tinta-tenue">{p.telefono}</p>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-tinta-suave">
                    {p.jefaturas.length > 0 && (
                      <p>
                        <span className="font-semibold text-tinta">Jefatura:</span>{" "}
                        {p.jefaturas.join(", ")}
                      </p>
                    )}
                    {p.asignaturas.length > 0 && (
                      <p className="mt-0.5 line-clamp-2" title={p.asignaturas.join(" · ")}>
                        {p.asignaturas.slice(0, 3).join(" · ")}
                        {p.asignaturas.length > 3 ? ` +${p.asignaturas.length - 3}` : ""}
                      </p>
                    )}
                    {p.pupilos.length > 0 && (
                      <p className="mt-0.5">
                        <span className="font-semibold text-tinta">Pupilos:</span>{" "}
                        {p.pupilos.map((x, i) => (
                          <span key={x.id}>
                            {i > 0 && ", "}
                            <Link
                              href={`/admin/estudiantes/${x.id}`}
                              className="text-marca-700 hover:underline"
                            >
                              {x.nombre}
                            </Link>
                            {x.curso ? ` (${x.curso})` : ""}
                          </span>
                        ))}
                      </p>
                    )}
                    {p.jefaturas.length === 0 &&
                      p.asignaturas.length === 0 &&
                      p.pupilos.length === 0 && <span className="text-tinta-tenue">—</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <AccionesPersona
                      membresiaId={p.membresiaId}
                      nombre={p.nombre}
                      activa={p.activa}
                      puedeGestionar={puedeGestionar && p.rol !== "ADMIN"}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {sinApoderado.length > 0 && (
        <section
          aria-labelledby="sin-apoderado"
          className="mt-5 rounded-xl border border-alerta/25 bg-alerta-suave/50 p-4"
        >
          <h2 id="sin-apoderado" className="text-sm font-semibold text-tinta">
            {sinApoderado.length}{" "}
            {sinApoderado.length === 1
              ? "estudiante sin apoderado registrado"
              : "estudiantes sin apoderado registrado"}
          </h2>
          <p className="mt-0.5 text-xs leading-relaxed text-tinta-suave">
            Sin un apoderado con cuenta no hay a quién avisarle de una evaluación ni con quién
            comunicarse desde la plataforma.{" "}
            {puedeGestionar
              ? "Agrégalo desde la ficha del estudiante con “Vincular apoderado existente”, o créalo aquí con “Agregar persona”."
              : "Pídele a dirección que los registre."}
          </p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {sinApoderado.slice(0, 24).map((e) => (
              <li key={e.id}>
                <Link
                  href={`/admin/estudiantes/${e.id}`}
                  className="inline-block rounded-lg border border-borde bg-superficie px-2 py-1 text-xs text-tinta-suave transition-colors hover:border-borde-fuerte hover:text-tinta"
                >
                  {e.nombre}
                  {e.curso ? <span className="text-tinta-tenue"> · {e.curso}</span> : null}
                </Link>
              </li>
            ))}
            {sinApoderado.length > 24 && (
              <li className="self-center text-xs text-tinta-tenue">
                y {sinApoderado.length - 24} más
              </li>
            )}
          </ul>
        </section>
      )}

      <p className="mt-3 text-xs leading-relaxed text-tinta-tenue">
        {puedeGestionar
          ? "Revocar el acceso no borra a la persona ni sus registros: el libro de clases conserva quién hizo cada cosa (Circular 30). "
          : ""}
        Una misma persona puede tener más de un rol — aparecerá una vez por cada uno.
      </p>
    </div>
  );
}
