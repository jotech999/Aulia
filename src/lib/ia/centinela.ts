import { registrarAuditoria } from "@/lib/auditoria";
import { iaDisponible, mensajeErrorIA } from "./cliente";
import { responderAsistente } from "./asistente";
import type { UsuarioIA } from "./alcance";

/**
 * AGENTE CENTINELA: vigilancia proactiva del colegio para dirección/UTP.
 *
 * Es un agente AGÉNTICO de verdad: usa el mismo bucle de herramientas del
 * asistente (listar_cursos, alertas_curso, resumen_asistencia_curso,
 * pendientes_operativos) para explorar el colegio POR SÍ MISMO y redactar un
 * informe de riesgo con intervenciones sugeridas por estudiante y por curso.
 *
 * Mismo marco de cumplimiento del resto de lib/ia: solo lectura, alcance por
 * rol reautorizado en cada herramienta, y auditoría sin PII.
 */

export type ResultadoCentinela = { ok: true; informe: string } | { ok: false; error: string };

const MISION = `MISIÓN CENTINELA (informe proactivo de riesgo para dirección):
1. Usa listar_cursos para conocer los cursos del colegio.
2. Usa alertas_curso en cada curso (puedes llamar varias herramientas a la vez) para detectar estudiantes en riesgo.
3. Usa pendientes_operativos para conocer clases sin firmar y cursos sin lista.
4. Redacta el INFORME CENTINELA en español de Chile con esta estructura:
   - **Pulso general** (2-3 frases del estado del colegio).
   - **Estudiantes que necesitan intervención ya** (máx. 8): nombre, curso, señal de riesgo y UNA intervención concreta y realista para esta semana (citar apoderado, derivar a convivencia, plan de recuperación, etc.).
   - **Cursos a observar**: cursos con señales colectivas y qué mirar.
   - **Higiene operativa**: firmas y listas pendientes, con foco en cerrar la semana limpia.
   - **3 prioridades de la semana** para el equipo directivo, numeradas.
Sé directo, accionable y humano: es una herramienta de gestión, no un reporte burocrático. Si un dato no está disponible, dilo sin inventar.`;

export async function generarInformeCentinela(
  user: UsuarioIA & { nombre?: string | null; colegioNombre?: string }
): Promise<ResultadoCentinela> {
  if (!iaDisponible()) {
    return { ok: false, error: "La IA no está configurada. Falta ANTHROPIC_API_KEY." };
  }
  try {
    const { respuesta, herramientas } = await responderAsistente(user, [
      { rol: "user", texto: MISION },
    ]);
    try {
      await registrarAuditoria({
        colegioId: user.colegioId,
        usuarioId: user.id,
        accion: "CONSULTAR_IA",
        entidad: "informe:centinela",
        entidadId: "centinela",
        despues: { herramientas }, // metadatos, sin PII
      });
    } catch {
      // La auditoría no debe romper la respuesta.
    }
    return { ok: true, informe: respuesta };
  } catch (e) {
    return { ok: false, error: mensajeErrorIA(e).mensaje };
  }
}
