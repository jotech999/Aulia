"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Boton } from "@/components/ui/boton";
import { toast } from "@/components/ui/toast";
import { NOMBRE_ROL, type RolAsignable } from "@/lib/personas";
import { crearPersona } from "./actions";

const campo =
  "mt-0.5 w-full min-h-11 rounded-lg border border-borde bg-superficie px-3 text-sm text-tinta outline-none transition focus:border-marca-500 focus:ring-2 focus:ring-marca-200";
const etiqueta = "block text-xs font-medium text-tinta-tenue";

/**
 * Alta de una persona con su rol. Al crear una cuenta nueva se devuelve una
 * clave temporal que hay que entregarle; si el RUT ya tenía cuenta (por ejemplo
 * una apoderada que ahora también es profesora), se reutiliza y conserva su
 * clave actual.
 */
export function NuevaPersona({ rolesPermitidos }: { rolesPermitidos: RolAsignable[] }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clave, setClave] = useState<{ valor: string; nombre: string } | null>(null);

  async function enviar(form: FormData) {
    setError(null);
    setGuardando(true);
    try {
      const nombre = String(form.get("nombre") ?? "");
      const r = await crearPersona({
        rut: String(form.get("rut") ?? ""),
        nombre,
        email: String(form.get("email") ?? ""),
        rol: String(form.get("rol") ?? ""),
        telefono: String(form.get("telefono") ?? ""),
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      if (r.claveTemporal) {
        setClave({ valor: r.claveTemporal, nombre });
      } else {
        toast.exito(
          r.reutilizada
            ? "Persona agregada. Ya tenía cuenta: entra con su clave de siempre."
            : "Persona agregada."
        );
        setAbierto(false);
      }
      router.refresh();
    } finally {
      setGuardando(false);
    }
  }

  if (clave) {
    return (
      <div className="superficie acento-superior rounded-xl p-4">
        <p className="font-semibold text-tinta">Cuenta creada para {clave.nombre}</p>
        <p className="mt-1 text-sm text-tinta-suave">
          Comparte esta clave temporal para su primer acceso. Podrá cambiarla después.
        </p>
        <p className="mt-3 select-all rounded-lg border border-borde bg-superficie-2 px-3 py-2 text-center font-mono text-lg font-bold tracking-wider text-tinta">
          {clave.valor}
        </p>
        <p className="mt-2 text-xs text-tinta-tenue">
          No volverá a mostrarse. Si se pierde, hay que restablecerla.
        </p>
        <div className="mt-3 flex gap-2">
          <Boton
            type="button"
            variante="secundario"
            tamano="sm"
            onClick={() => {
              void navigator.clipboard?.writeText(clave.valor).then(
                () => toast.exito("Clave copiada."),
                () => toast.error("No se pudo copiar.")
              );
            }}
          >
            Copiar clave
          </Boton>
          <Boton
            type="button"
            tamano="sm"
            onClick={() => {
              setClave(null);
              setAbierto(false);
            }}
          >
            Listo
          </Boton>
        </div>
      </div>
    );
  }

  if (!abierto) {
    return (
      <Boton type="button" onClick={() => setAbierto(true)}>
        + Agregar persona
      </Boton>
    );
  }

  return (
    <form action={enviar} className="superficie w-full rounded-xl p-4">
      <p className="font-semibold text-tinta">Nueva persona</p>
      <p className="mt-0.5 text-xs text-tinta-tenue">
        Si el RUT ya tiene cuenta en Aulia, se reutiliza y solo se le agrega este rol.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className={etiqueta}>
          RUT
          <input name="rut" required placeholder="12.345.678-9" className={campo} />
        </label>
        <label className={etiqueta}>
          Rol
          <select name="rol" required defaultValue="PROFESOR" className={campo}>
            {rolesPermitidos.map((r) => (
              <option key={r} value={r}>
                {NOMBRE_ROL[r]}
              </option>
            ))}
          </select>
        </label>
        <label className={`${etiqueta} sm:col-span-2`}>
          Nombre completo
          <input name="nombre" required maxLength={120} className={campo} />
        </label>
        <label className={etiqueta}>
          Correo
          <input name="email" type="email" required maxLength={160} className={campo} />
        </label>
        <label className={etiqueta}>
          Teléfono (opcional)
          <input name="telefono" maxLength={40} className={campo} />
        </label>
      </div>
      {error && <p className="mt-2 text-sm text-peligro">{error}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Boton type="submit" disabled={guardando}>
          {guardando ? "Agregando…" : "Agregar persona"}
        </Boton>
        <button
          type="button"
          onClick={() => setAbierto(false)}
          className="text-sm text-tinta-tenue hover:text-tinta"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
