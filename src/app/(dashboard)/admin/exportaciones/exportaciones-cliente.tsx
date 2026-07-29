"use client";

import { useState } from "react";

type Curso = { id: string; nivel: string; letra: string };

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const selectCls =
  "rounded-lg border border-borde-fuerte bg-superficie px-3 py-2 text-sm transition focus:border-marca-500 focus:outline-none focus:ring-2 focus:ring-marca-200";

function Boton({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      className="btn btn-primario"
    >
      <span aria-hidden>↓</span>
      {children}
    </a>
  );
}

export function PanelExportaciones({ cursos, anio }: { cursos: Curso[]; anio: number }) {
  const [cursoId, setCursoId] = useState(cursos[0]?.id ?? "");
  const [mes, setMes] = useState(new Date().getUTCMonth() + 1);
  const [semestre, setSemestre] = useState(1);
  const q = (tipo: string, extra = "") => `/api/exportar/${tipo}?cursoId=${cursoId}${extra}`;

  if (cursos.length === 0) {
    return (
      <p className="superficie rounded-xl px-5 py-6 text-sm text-tinta-suave">
        No hay cursos para exportar todavía.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {/* Selector de curso */}
      <div className="superficie flex flex-wrap items-center gap-3 rounded-xl p-4">
        <label className="text-sm font-medium text-tinta">
          Curso
          <select value={cursoId} onChange={(e) => setCursoId(e.target.value)} className={`ml-2 ${selectCls}`}>
            {cursos.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nivel} {c.letra}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Asistencia mensual (apoyo SIGE) */}
      <section className="superficie rounded-xl p-5">
        <h2 className="font-display text-base font-semibold tracking-tight">Asistencia mensual · apoyo SIGE</h2>
        <p className="mt-1 text-sm text-tinta-suave">
          Planilla de asistencia por curso y mes para transcribir a SIGE y dejar respaldo. Debe cuadrar
          con el libro de clases. <span className="text-tinta-tenue">SIGE no importa archivos de asistencia; esta planilla es de apoyo.</span>
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="text-sm text-tinta-suave">
            Mes
            <select value={mes} onChange={(e) => setMes(Number(e.target.value))} className={`ml-2 ${selectCls}`}>
              {MESES.map((m, i) => (
                <option key={i} value={i + 1}>{m}</option>
              ))}
            </select>
          </label>
          <Boton href={q("asistencia-mensual", `&anio=${anio}&mes=${mes}`)}>Descargar planilla ({MESES[mes - 1]})</Boton>
        </div>
      </section>

      {/* Boletines de calificaciones (PDF, una página por estudiante) */}
      <section className="superficie rounded-xl p-5">
        <h2 className="font-display text-base font-semibold tracking-tight">Boletines del curso · PDF</h2>
        <p className="mt-1 text-sm text-tinta-suave">
          Informe de calificaciones de todo el curso en un PDF (una página por estudiante), con membrete,
          promedios por asignatura, promedio general y asistencia. <span className="text-tinta-tenue">Documento interno; el boletín oficial con folio se emite por estudiante desde su ficha.</span>
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="text-sm text-tinta-suave">
            Semestre
            <select value={semestre} onChange={(e) => setSemestre(Number(e.target.value))} className={`ml-2 ${selectCls}`}>
              <option value={1}>1</option>
              <option value={2}>2</option>
            </select>
          </label>
          <Boton href={`/api/boletines/${cursoId}?periodo=${semestre}`}>Semestral</Boton>
          <Boton href={`/api/boletines/${cursoId}?anual=1`}>Anual</Boton>
        </div>
      </section>

      {/* Acta de calificaciones (Decreto 67) */}
      <section className="superficie rounded-xl p-5">
        <h2 className="font-display text-base font-semibold tracking-tight">Acta de calificaciones · Decreto 67</h2>
        <p className="mt-1 text-sm text-tinta-suave">
          Notas finales por asignatura, promedio general, asistencia y situación final (aprobado / reprobado /
          pendiente). <span className="text-tinta-tenue">La situación es preliminar: la promoción bajo 85% de asistencia la decide la dirección. Confirmar el layout con el manual de SIGE-Actas antes de importar.</span>
        </p>
        <div className="mt-3">
          <Boton href={q("acta")}>Descargar acta del curso</Boton>
        </div>
      </section>

      {/* Respaldo Circular 30 */}
      <section className="superficie rounded-xl p-5">
        <h2 className="font-display text-base font-semibold tracking-tight">Respaldo del libro de clases · Circular 30</h2>
        <p className="mt-1 text-sm text-tinta-suave">
          Respaldo interno de los contenidos mínimos del libro (retención ≥5 años). No incluye datos de salud
          ni PIE. <span className="text-tinta-tenue">No reemplaza el envío EDE oficial a Mineduc (que usa un pipeline CEDS cifrado).</span>
        </p>
        <div className="mt-3 flex flex-wrap gap-3">
          <Boton href={q("antecedentes")}>Antecedentes de estudiantes</Boton>
          <Boton href={q("control-asistencia")}>Control de asistencia</Boton>
          <Boton href={q("calificaciones")}>Calificaciones</Boton>
        </div>
      </section>
    </div>
  );
}
