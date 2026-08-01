import { notFound } from "next/navigation";
import { requerirSesion } from "@/lib/sesion";
import { iaDisponible } from "@/lib/ia/cliente";
import { ROLES_GESTION_RUBRICAS } from "@/lib/rubricas";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { EstadoVacio } from "@/components/ui/estado-vacio";
import { EditorRubrica } from "../editor-rubrica";
import { asignaturasAccesiblesRubricas, oasParaEditor } from "../consultas";

export default async function NuevaRubricaPage() {
  const { user } = await requerirSesion();
  const esGestion = ROLES_GESTION_RUBRICAS.has(user.rol);
  if (!esGestion && !["PROFESOR", "PROFESOR_JEFE"].includes(user.rol)) notFound();

  const asignaturas = await asignaturasAccesiblesRubricas(user);
  if (!esGestion && asignaturas.length === 0) {
    return (
      <div>
        <EncabezadoPagina
          icono="calificaciones"
          titulo="Nuevo instrumento"
          volver={{ href: "/libro-clases/rubricas", etiqueta: "Volver al banco" }}
        />
        <EstadoVacio
          icono="calificaciones"
          titulo="Sin asignaturas autorizadas"
          descripcion="Necesitas una asignatura a cargo o una jefatura de curso para crear instrumentos."
        />
      </div>
    );
  }
  const oas = await oasParaEditor(asignaturas, esGestion);

  return (
    <div>
      <EncabezadoPagina
        icono="calificaciones"
        titulo="Nuevo instrumento"
        descripcion="Diseña un borrador reutilizable. Podrás revisarlo antes de publicar una versión inmutable."
        volver={{ href: "/libro-clases/rubricas", etiqueta: "Volver al banco" }}
      />
      <EditorRubrica
        asignaturas={asignaturas.map((asignatura) => ({
          id: asignatura.id,
          nombre: asignatura.nombre,
          curso: `${asignatura.curso.nivel} ${asignatura.curso.letra}`,
        }))}
        oas={oas}
        permiteGenerica={esGestion}
        iaActiva={iaDisponible()}
      />
    </div>
  );
}
