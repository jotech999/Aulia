import { prisma } from "@/lib/prisma";
import {
  NOMBRE_TIPO,
  formatearFolio,
  rutEnmascarado,
  nombreParcial,
  type SnapshotCertificado,
  type TipoCertificado,
} from "@/lib/certificados";
import { isoDesdeFecha } from "@/lib/fecha";

export const dynamic = "force-dynamic";

/**
 * Verificación PÚBLICA de un certificado por su token (sin autenticación).
 * Minimización (Ley 21.719): confirma autenticidad mostrando lo mínimo —
 * estado, establecimiento, folio, fechas y RUT enmascarado. NO expone nombre
 * completo, RUT completo ni notas.
 */
export default async function VerificarPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const cert = await prisma.certificado.findUnique({
    where: { tokenVerificacion: token },
    select: {
      tipo: true,
      folio: true,
      datos: true,
      emitidoEn: true,
      vigenciaHasta: true,
      anuladoEn: true,
      estudiante: { select: { nombres: true, apellidos: true, rut: true } },
      colegio: { select: { nombre: true, rbd: true } },
    },
  });

  const Marco = ({ children }: { children: React.ReactNode }) => (
    <main className="mx-auto max-w-lg px-4 py-16">
      <p className="text-sm font-semibold tracking-tight text-tinta-tenue">Aulia</p>
      <h1 className="mt-1 text-2xl font-bold tracking-tight">
        Verificación de documento
      </h1>
      <div className="mt-6">{children}</div>
    </main>
  );

  if (!cert) {
    return (
      <Marco>
        <div className="rounded-xl border border-peligro/20 bg-peligro-suave p-6 text-sm text-peligro">
          No se encontró ningún documento con este código de verificación. El
          código puede ser incorrecto.
        </div>
      </Marco>
    );
  }

  const snap = cert.datos as unknown as SnapshotCertificado;
  const hoy = new Date();
  const anulado = cert.anuladoEn !== null;
  const expirado =
    !anulado && cert.vigenciaHasta !== null && cert.vigenciaHasta < hoy;
  const vigente = !anulado && !expirado;

  const estado = anulado
    ? { txt: "ANULADO", cls: "border-peligro/20 bg-peligro-suave text-peligro" }
    : expirado
      ? { txt: "EXPIRADO", cls: "border-alerta/20 bg-alerta-suave text-alerta" }
      : { txt: "VÁLIDO", cls: "border-exito/20 bg-exito-suave text-exito" };

  const fila = (k: string, v: string) => (
    <div className="flex justify-between gap-4 border-b border-borde py-2 text-sm last:border-0">
      <span className="text-tinta-tenue">{k}</span>
      <span className="text-right font-medium text-tinta">{v}</span>
    </div>
  );

  return (
    <Marco>
      <div className={`rounded-xl border p-4 text-center ${estado.cls}`}>
        <p className="text-xs font-semibold uppercase tracking-wide opacity-70">
          Estado del documento
        </p>
        <p className="mt-1 text-2xl font-bold">{estado.txt}</p>
        {vigente && (
          <p className="mt-1 text-xs opacity-80">
            Documento auténtico emitido por el establecimiento.
          </p>
        )}
      </div>

      <div className="mt-4 rounded-xl border border-borde bg-superficie p-5 shadow-suave">
        {fila("Documento", NOMBRE_TIPO[cert.tipo as TipoCertificado])}
        {fila("Folio", formatearFolio(cert.folio))}
        {fila("Establecimiento", cert.colegio.nombre)}
        {cert.colegio.rbd ? fila("RBD", cert.colegio.rbd) : null}
        {fila(
          "Estudiante",
          nombreParcial(cert.estudiante.nombres, cert.estudiante.apellidos)
        )}
        {fila("RUT", rutEnmascarado(cert.estudiante.rut))}
        {fila("Año escolar", String(snap.anio))}
        {fila("Emitido", isoDesdeFecha(cert.emitidoEn))}
        {cert.vigenciaHasta
          ? fila("Válido hasta", isoDesdeFecha(cert.vigenciaHasta))
          : null}
      </div>

      <p className="mt-4 text-center text-xs text-tinta-tenue">
        Esta página confirma la autenticidad del documento sin exponer datos
        personales. Para ver el contenido completo, solicita el PDF al portador.
      </p>
    </Marco>
  );
}
