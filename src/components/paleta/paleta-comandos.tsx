"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Iconos } from "@/components/ui/iconos";
import { type Comando, comandosPara, normalizar } from "./comandos";
import { buscarEnColegio, type ResultadosBusqueda } from "./acciones";

/**
 * Paleta de comandos (⌘K / Ctrl+K). Responde a la crítica de que "hay muchos
 * elementos y es difícil encontrar dónde ingresar": el docente escribe la
 * acción y salta directo, sin recorrer menús. Determinista, rápida, por teclado.
 * El catálogo y el filtrado por rol viven en `./comandos` (módulo puro y testeable).
 */

const EVENTO_ABRIR = "educhile:abrir-paleta";

/** Botón/atajo para abrir la paleta. Se coloca en la barra lateral y el header. */
export function BotonPaleta({ compacto = false }: { compacto?: boolean }) {
  const abrir = () => window.dispatchEvent(new Event(EVENTO_ABRIR));
  if (compacto) {
    return (
      <button
        type="button"
        onClick={abrir}
        aria-label="Buscar"
        className="flex h-9 w-9 items-center justify-center rounded-lg text-tinta-suave transition-colors hover:bg-superficie-3"
      >
        <IconoBuscar />
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={abrir}
      className="flex w-full items-center gap-2 rounded-lg border border-borde bg-superficie-2 px-3 py-2 text-left text-sm text-tinta-tenue transition-colors hover:border-borde-fuerte hover:text-tinta-suave"
    >
      <IconoBuscar />
      <span className="flex-1">Buscar en el colegio…</span>
      <kbd className="rounded border border-borde bg-superficie px-1.5 py-0.5 font-sans text-[10px] font-semibold text-tinta-tenue">
        ⌘K
      </kbd>
    </button>
  );
}

function IconoBuscar({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className={className} aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" strokeLinecap="round" />
    </svg>
  );
}

export function PaletaComandos({ rol }: { rol: string }) {
  const router = useRouter();
  const [abierta, setAbierta] = useState(false);
  const [consulta, setConsulta] = useState("");
  const [indice, setIndice] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listaRef = useRef<HTMLDivElement>(null);

  const VACIO: ResultadosBusqueda = useMemo(
    () => ({ estudiantes: [], cursos: [], apoderados: [] }),
    []
  );
  const [dinamicos, setDinamicos] = useState<ResultadosBusqueda>(VACIO);
  const [buscando, setBuscando] = useState(false);
  // El staff docente/admin salta desde aquí a la ficha de un estudiante, a un
  // curso o a una familia. El servidor vuelve a comprobar el alcance de cada
  // rol; esto solo evita ir a preguntar cuando ya se sabe que no habrá nada.
  const puedeBuscarEnColegio =
    rol !== "APODERADO" && rol !== "ESTUDIANTE" && rol !== "SOSTENEDOR";

  const disponibles = useMemo(() => comandosPara(rol), [rol]);

  const comandoResultados = useMemo(() => {
    const q = normalizar(consulta.trim());
    if (!q) return disponibles;
    return disponibles.filter((c) => {
      const heno = normalizar(`${c.label} ${c.grupo} ${c.claves ?? ""}`);
      return q.split(/\s+/).every((t) => heno.includes(t));
    });
  }, [consulta, disponibles]);

  // Búsqueda en la base (con rebote): estudiantes, cursos y apoderados.
  useEffect(() => {
    if (!puedeBuscarEnColegio || consulta.trim().length < 2) {
      setDinamicos(VACIO);
      setBuscando(false);
      return;
    }
    let vigente = true;
    setBuscando(true);
    const t = setTimeout(async () => {
      try {
        const res = await buscarEnColegio(consulta);
        if (vigente) setDinamicos(res);
      } catch {
        if (vigente) setDinamicos(VACIO);
      } finally {
        if (vigente) setBuscando(false);
      }
    }, 200);
    return () => {
      vigente = false;
      clearTimeout(t);
    };
  }, [consulta, puedeBuscarEnColegio, VACIO]);

  const resultados = useMemo<Comando[]>(() => {
    // Los cursos van primero: escribir "5b" tiene una intención muy concreta y
    // no debería quedar sepultado bajo las secciones fijas que también encajan.
    const cursos: Comando[] = dinamicos.cursos.map((c) => ({
      grupo: "Cursos",
      label: c.detalle ? `${c.nombre} — ${c.detalle}` : c.nombre,
      // No existe una ficha de curso; el destino útil al escribir "5b" es
      // abrirlo para pasar la lista, que es la acción diaria sobre un curso.
      href: `/libro-clases/asistencia?cursoId=${c.id}`,
      icono: "cursos",
    }));
    const fichas: Comando[] = dinamicos.estudiantes.map((e) => ({
      grupo: "Estudiantes",
      label: e.curso ? `${e.nombre} · ${e.curso}` : e.nombre,
      href: `/admin/estudiantes/${e.id}`,
      icono: "estudiantes",
    }));
    const familias: Comando[] = dinamicos.apoderados.map((a) => ({
      grupo: "Apoderados",
      label: a.detalle ? `${a.nombre} — ${a.detalle}` : a.nombre,
      href: `/admin/personas?q=${encodeURIComponent(a.nombre)}`,
      icono: "convivencia",
    }));
    return [...cursos, ...fichas, ...familias, ...comandoResultados];
  }, [comandoResultados, dinamicos]);

  // Agrupar preservando el orden de aparición.
  const grupos = useMemo(() => {
    const m = new Map<string, Comando[]>();
    for (const c of resultados) {
      (m.get(c.grupo) ?? m.set(c.grupo, []).get(c.grupo)!).push(c);
    }
    return [...m.entries()];
  }, [resultados]);

  // El índice vuelve al inicio tanto al teclear como cuando aterrizan los
  // resultados de la base: esos se anteponen a la lista, y sin esto pulsar
  // Enter justo en ese instante abría un elemento distinto del resaltado.
  useEffect(() => setIndice(0), [consulta, dinamicos]);

  // Abrir con ⌘K / Ctrl+K y por evento del botón.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setAbierta((v) => !v);
      } else if (e.key === "Escape") {
        setAbierta(false);
      }
    }
    function onAbrir() {
      setAbierta(true);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener(EVENTO_ABRIR, onAbrir);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(EVENTO_ABRIR, onAbrir);
    };
  }, []);

  useEffect(() => {
    if (abierta) {
      setConsulta("");
      setIndice(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [abierta]);

  function seleccionar(c: Comando | undefined) {
    if (!c) return;
    setAbierta(false);
    router.push(c.href);
  }

  function onKeyLista(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setIndice((i) => Math.min(i + 1, resultados.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setIndice((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      seleccionar(resultados[indice]);
    }
  }

  useEffect(() => {
    if (!abierta) return;
    const el = listaRef.current?.querySelector<HTMLElement>(`[data-idx="${indice}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [indice, abierta]);

  if (!abierta) return null;

  let idxGlobal = -1;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[10vh]">
      <div
        className="absolute inset-0 bg-tinta/30 backdrop-blur-[2px]"
        onClick={() => setAbierta(false)}
        aria-hidden
      />
      <div
        role="dialog"
        aria-label="Buscar en el colegio"
        className="animar-surgir relative w-full max-w-lg overflow-hidden rounded-xl border border-borde bg-superficie shadow-flotante"
        onKeyDown={onKeyLista}
      >
        <div className="flex items-center gap-2.5 border-b border-borde px-4 py-3">
          <span className="text-tinta-tenue">
            <IconoBuscar className="h-5 w-5" />
          </span>
          <input
            ref={inputRef}
            value={consulta}
            onChange={(e) => setConsulta(e.target.value)}
            placeholder="Busca una acción, un estudiante, un curso (5B) o un apoderado…"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-tinta-tenue"
            aria-label="Buscar en el colegio"
          />
          <kbd className="rounded border border-borde bg-superficie-2 px-1.5 py-0.5 text-[10px] font-semibold text-tinta-tenue">
            esc
          </kbd>
        </div>

        <div ref={listaRef} className="max-h-[60vh] overflow-y-auto p-2">
          {resultados.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-tinta-tenue">
              {buscando ? "Buscando…" : `Sin resultados para “${consulta}”.`}
            </p>
          ) : (
            grupos.map(([grupo, items]) => (
              <div key={grupo} className="mb-1">
                <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-tinta-tenue">
                  {grupo}
                </p>
                {items.map((c) => {
                  idxGlobal++;
                  const activo = idxGlobal === indice;
                  const Icono = Iconos[c.icono];
                  const mio = idxGlobal;
                  return (
                    <button
                      key={c.href + c.label}
                      type="button"
                      data-idx={mio}
                      onMouseMove={() => setIndice(mio)}
                      onClick={() => seleccionar(c)}
                      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                        activo ? "bg-marca-50 text-marca-700" : "text-tinta hover:bg-superficie-3"
                      }`}
                    >
                      <Icono
                        className={`h-[18px] w-[18px] shrink-0 ${
                          activo ? "text-marca-600" : "text-tinta-tenue"
                        }`}
                      />
                      <span className="flex-1">{c.label}</span>
                      {activo && (
                        <span className="text-xs text-marca-600" aria-hidden>
                          ↵
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
