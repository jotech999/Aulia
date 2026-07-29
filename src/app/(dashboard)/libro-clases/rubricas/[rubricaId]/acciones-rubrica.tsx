"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  archivarRubrica,
  crearVersionRubrica,
  eliminarRubrica,
  publicarRubrica,
} from "../actions";
import { Boton } from "@/components/ui/boton";
import { confirmar } from "@/components/ui/confirmar";
import { toast } from "@/components/ui/toast";

export function AccionesRubrica({
  rubricaId,
  estado,
}: {
  rubricaId: string;
  estado: "BORRADOR" | "PUBLICADA" | "ARCHIVADA";
}) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);

  async function publicar() {
    const ok = await confirmar({
      titulo: "¿Publicar esta versión?",
      mensaje: "El contenido quedará inmutable para preservar las aplicaciones históricas. Los cambios futuros se harán en una nueva versión.",
      textoConfirmar: "Publicar versión",
    });
    if (!ok) return;
    setOcupado(true);
    const resultado = await publicarRubrica(rubricaId);
    setOcupado(false);
    if (!resultado.ok) return toast.error(resultado.error);
    toast.exito("Versión publicada y lista para usar.");
    router.refresh();
  }

  async function nuevaVersion() {
    setOcupado(true);
    const resultado = await crearVersionRubrica(rubricaId);
    setOcupado(false);
    if (!resultado.ok) return toast.error(resultado.error);
    toast.exito("Nueva versión creada como borrador.");
    router.push(`/libro-clases/rubricas/${resultado.id}`);
  }

  async function archivar() {
    const ok = await confirmar({
      titulo: "¿Archivar el instrumento?",
      mensaje: "Dejará de estar disponible para nuevas evaluaciones. Las aplicaciones existentes se conservarán.",
      textoConfirmar: "Archivar",
    });
    if (!ok) return;
    setOcupado(true);
    const resultado = await archivarRubrica(rubricaId);
    setOcupado(false);
    if (!resultado.ok) return toast.error(resultado.error);
    toast.exito("Instrumento archivado.");
    router.refresh();
  }

  async function eliminar() {
    const ok = await confirmar({
      titulo: "¿Eliminar el instrumento del banco?",
      mensaje: "Se ocultará mediante eliminación lógica. Las evaluaciones y aplicaciones históricas no se borrarán.",
      textoConfirmar: "Eliminar",
      peligro: true,
    });
    if (!ok) return;
    setOcupado(true);
    const resultado = await eliminarRubrica(rubricaId);
    setOcupado(false);
    if (!resultado.ok) return toast.error(resultado.error);
    toast.exito("Instrumento eliminado del banco.");
    router.push("/libro-clases/rubricas");
  }

  return (
    <div className="flex flex-wrap justify-end gap-2">
      {estado === "BORRADOR" && (
        <Boton type="button" tamano="sm" onClick={publicar} disabled={ocupado}>
          {ocupado ? "Procesando…" : "Publicar versión"}
        </Boton>
      )}
      {estado !== "BORRADOR" && (
        <Boton type="button" tamano="sm" variante="secundario" onClick={nuevaVersion} disabled={ocupado}>
          Crear nueva versión
        </Boton>
      )}
      {estado === "PUBLICADA" && (
        <Boton type="button" tamano="sm" variante="fantasma" onClick={archivar} disabled={ocupado}>
          Archivar
        </Boton>
      )}
      <Boton type="button" tamano="sm" variante="peligro" onClick={eliminar} disabled={ocupado}>
        Eliminar
      </Boton>
    </div>
  );
}
