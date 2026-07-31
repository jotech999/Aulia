"use client";

/**
 * AULI EN LA LANDING — asistente de prospección y captura de correos.
 *
 * Chat guiado (sin costo de IA por visitante y sin exponer la API a anónimos):
 * Auli responde las preguntas frecuentes con contenido curado y, tras cada
 * respuesta, invita a dejar el correo. El lead se guarda en SolicitudDemo
 * (origen "auli") vía la misma acción del formulario de demo, con honeypot
 * y límite por IP.
 */

import { useEffect, useRef, useState } from "react";
import { Auli } from "@/components/ui/auli";
import { solicitarDemo } from "@/app/acciones-demo";

type Burbuja = { rol: "auli" | "visita"; texto: string };

type Tema = {
  id: string;
  chip: string;
  respuesta: string;
};

const TEMAS: Tema[] = [
  {
    id: "que-es",
    chip: "¿Qué es Aulia?",
    respuesta:
      "Aulia es la plataforma de gestión escolar chilena que reemplaza el libro de clases, la planificación, la comunicación con apoderados y la administración — todo en un solo lugar, rápido y pensado para el profesor. Cumple Circular N°30 y Decreto 67 de fábrica, e incluye IA para asistir a dirección y docentes sin costo extra.",
  },
  {
    id: "precio",
    chip: "¿Cuánto cuesta?",
    respuesta:
      "El precio es público (sin \"contáctenos\"): va por estudiante matriculado al año, en UF, con 3 planes — Libro de Clases (0,13 UF/est), Profesor Pro (0,26 UF/est) y Gestión Escolar (0,42 UF/est) — y descuentos por tramos que nunca dan saltos. Incluye usuarios ilimitados, migración, capacitación y soporte. En esta misma página hay una calculadora con tu matrícula exacta.",
  },
  {
    id: "normativa",
    chip: "¿Cumple la normativa?",
    respuesta:
      "Sí, de fábrica: libro de clases según Circular N°30 (todo queda registrado y con respaldo 5 años), evaluación según Decreto 67/2018, exportaciones compatibles con SIGE, y datos de estudiantes tratados como sensibles según la Ley 21.719 — la IA nunca recibe RUT ni datos de salud.",
  },
  {
    id: "migrar",
    chip: "¿Cómo me cambio?",
    respuesta:
      "La migración es asistida y sin costo: importamos cursos, estudiantes y matrícula desde tu sistema actual, y puedes correr en paralelo durante la marcha blanca, sin cortes. Además tienes 60 días de prueba gratis y congelamos tu precio por 2 años al cambiarte.",
  },
  {
    id: "demo",
    chip: "Quiero una demo",
    respuesta:
      "¡Con gusto! Te podemos mostrar Aulia funcionando con datos de ejemplo y resolver las dudas de tu equipo directivo.",
  },
];

// Tras responder un tema, Auli hace la transición a la captura.
const PUENTE: Record<string, string> = {
  "que-es": "¿Te envío un resumen con la ficha y el acceso a una demo a tu correo?",
  precio: "¿Te envío la cotización de referencia y la ficha técnica a tu correo?",
  normativa: "¿Te envío la ficha de cumplimiento (Circular 30, Decreto 67, Ley 21.719) a tu correo?",
  migrar: "¿Te envío el plan de migración y el acceso a la prueba gratis a tu correo?",
  demo: "Solo necesito un par de datos. ¿Cuál es tu nombre?",
};

type Paso = "temas" | "ofrecer" | "nombre" | "correo" | "colegio" | "cargo" | "listo";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function AuliLanding() {
  const [abierto, setAbierto] = useState(false);
  const [saludo, setSaludo] = useState(false); // globito "¿Te ayudo?"
  const [burbujas, setBurbujas] = useState<Burbuja[]>([]);
  const [paso, setPaso] = useState<Paso>("temas");
  const [entrada, setEntrada] = useState("");
  const [lead, setLead] = useState({ nombre: "", email: "", colegio: "", cargo: "" });
  const [enviando, setEnviando] = useState(false);
  const [temasVistos, setTemasVistos] = useState<string[]>([]);
  const finRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Globito de invitación a los 6 s (solo si no se ha abierto).
  useEffect(() => {
    const t = setTimeout(() => setSaludo(true), 6000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [burbujas, paso]);

  useEffect(() => {
    if (abierto && ["nombre", "correo", "colegio", "cargo"].includes(paso)) {
      inputRef.current?.focus();
    }
  }, [abierto, paso]);

  function decirAuli(texto: string) {
    setBurbujas((b) => [...b, { rol: "auli", texto }]);
  }

  function abrir() {
    setSaludo(false);
    setAbierto(true);
    if (burbujas.length === 0) {
      decirAuli(
        "¡Hola! Soy Auli, la pizarra de Aulia. Puedo contarte qué hace la plataforma, cuánto cuesta o cómo cambiarte. ¿Qué te interesa?"
      );
    }
  }

  function elegirTema(t: Tema) {
    setBurbujas((b) => [...b, { rol: "visita", texto: t.chip }]);
    setTemasVistos((v) => (v.includes(t.id) ? v : [...v, t.id]));
    setTimeout(() => {
      decirAuli(t.respuesta);
      if (t.id === "demo") {
        setTimeout(() => {
          decirAuli(PUENTE.demo);
          setPaso("nombre");
        }, 350);
      } else {
        setTimeout(() => {
          decirAuli(PUENTE[t.id]);
          setPaso("ofrecer");
        }, 350);
      }
    }, 350);
  }

  function aceptarOferta() {
    setBurbujas((b) => [...b, { rol: "visita", texto: "Sí, envíamelo" }]);
    setTimeout(() => {
      decirAuli("¡Perfecto! ¿Cuál es tu nombre?");
      setPaso("nombre");
    }, 300);
  }

  function rechazarOferta() {
    setBurbujas((b) => [...b, { rol: "visita", texto: "Ahora no, gracias" }]);
    setTimeout(() => {
      decirAuli("Sin problema. ¿Quieres que te cuente algo más?");
      setPaso("temas");
    }, 300);
  }

  async function avanzar() {
    const v = entrada.trim();
    if (!v || enviando) return;

    if (paso === "nombre") {
      if (v.length < 2) return;
      setBurbujas((b) => [...b, { rol: "visita", texto: v }]);
      setLead((l) => ({ ...l, nombre: v }));
      setEntrada("");
      setTimeout(() => {
        decirAuli(`Un gusto, ${v.split(" ")[0]}. ¿A qué correo te envío la información?`);
        setPaso("correo");
      }, 300);
      return;
    }

    if (paso === "correo") {
      if (!EMAIL_RE.test(v)) {
        decirAuli("Mmm, ese correo no me calza. ¿Puedes revisarlo? (ej: nombre@colegio.cl)");
        return;
      }
      setBurbujas((b) => [...b, { rol: "visita", texto: v }]);
      setLead((l) => ({ ...l, email: v }));
      setEntrada("");
      setTimeout(() => {
        decirAuli("¡Anotado! ¿De qué colegio o institución eres? (opcional)");
        setPaso("colegio");
      }, 300);
      return;
    }

    if (paso === "colegio") {
      setBurbujas((b) => [...b, { rol: "visita", texto: v }]);
      setLead((l) => ({ ...l, colegio: v }));
      setEntrada("");
      setTimeout(() => {
        decirAuli("¿Y cuál es tu cargo? (directora, UTP, sostenedor, profesor…)");
        setPaso("cargo");
      }, 300);
      return;
    }

    if (paso === "cargo") {
      setBurbujas((b) => [...b, { rol: "visita", texto: v }]);
      setEntrada("");
      await guardar({ ...lead, cargo: v });
    }
  }

  async function omitir() {
    if (paso === "colegio") {
      setPaso("cargo");
      setTimeout(() => decirAuli("¿Y cuál es tu cargo? (opcional)"), 200);
    } else if (paso === "cargo") {
      await guardar(lead);
    }
  }

  async function guardar(datos: typeof lead) {
    setEnviando(true);
    const temas = temasVistos.length ? `Temas consultados con Auli: ${temasVistos.join(", ")}.` : "";
    const res = await solicitarDemo({
      nombre: datos.nombre,
      email: datos.email,
      colegio: datos.colegio,
      cargo: datos.cargo,
      mensaje: temas,
      origen: "auli",
    });
    setEnviando(false);
    if (res.ok) {
      decirAuli(
        `¡Listo, ${datos.nombre.split(" ")[0]}! Te escribiremos a ${datos.email} con la información y los pasos para la demo. Mientras tanto, puedes seguir explorando la página — la calculadora de precios está más abajo.`
      );
      setPaso("listo");
    } else {
      decirAuli(res.error);
      setPaso("correo");
    }
  }

  const enCaptura = ["nombre", "correo", "colegio", "cargo"].includes(paso);
  const temasPendientes = TEMAS.filter((t) => !temasVistos.includes(t.id));

  return (
    <>
      {/* Lanzador flotante con globito de invitación */}
      <div className="fixed bottom-5 right-5 z-40 flex items-end gap-2">
        {saludo && !abierto && (
          <div className="animar-surgir mb-1 max-w-[190px] rounded-2xl rounded-br-sm border border-borde bg-superficie px-3.5 py-2.5 text-sm text-tinta shadow-flotante">
            ¡Hola! ¿Te cuento cuánto cuesta Aulia para tu colegio?
          </div>
        )}
        <button
          type="button"
          onClick={() => (abierto ? setAbierto(false) : abrir())}
          aria-label="Conversar con Auli, la asistente de Aulia"
          aria-expanded={abierto}
          className="encabezado-cine flex items-center gap-2 rounded-full py-2.5 pl-2.5 pr-4 text-sm font-semibold text-white shadow-flotante transition-transform hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-marca-300"
        >
          <Auli className="h-9 w-9 drop-shadow-sm" />
          <span className="hidden sm:inline">Auli</span>
        </button>
      </div>

      {/* Panel de conversación */}
      {abierto && (
        <aside
          role="dialog"
          aria-label="Auli, asistente de Aulia"
          className="animar-surgir fixed bottom-20 right-4 z-50 flex max-h-[75vh] w-[min(94vw,390px)] flex-col overflow-hidden rounded-2xl border border-borde bg-superficie shadow-flotante sm:bottom-24 sm:right-5"
        >
          <header className="encabezado-cine flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2.5">
              <Auli className="h-9 w-9 drop-shadow-sm" />
              <div>
                <p className="font-display text-sm font-bold text-white">Auli</p>
                <p className="text-xs text-white/70">Te ayudo a conocer Aulia</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setAbierto(false)}
              aria-label="Cerrar"
              className="rounded-lg p-1.5 text-white/80 transition-colors hover:bg-white/15 hover:text-white"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
                <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
              </svg>
            </button>
          </header>

          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {burbujas.map((m, i) => (
              <div key={i} className={m.rol === "visita" ? "flex justify-end" : "flex justify-start"}>
                <div
                  className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                    m.rol === "visita"
                      ? "rounded-br-sm bg-marca-600 text-white"
                      : "rounded-bl-sm border border-borde bg-superficie-2 text-tinta"
                  }`}
                >
                  {m.texto}
                </div>
              </div>
            ))}

            {/* Chips de temas */}
            {paso === "temas" && temasPendientes.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {temasPendientes.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => elegirTema(t)}
                    className="rounded-full border border-marca-300 bg-marca-50 px-3.5 py-1.5 text-sm font-medium text-marca-700 transition-colors hover:border-marca-500 hover:bg-marca-100"
                  >
                    {t.chip}
                  </button>
                ))}
              </div>
            )}

            {/* Oferta sí/no */}
            {paso === "ofrecer" && (
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  onClick={aceptarOferta}
                  className="rounded-full bg-marca-600 px-4 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-marca-700"
                >
                  Sí, envíamelo
                </button>
                <button
                  type="button"
                  onClick={rechazarOferta}
                  className="rounded-full border border-borde-fuerte px-4 py-1.5 text-sm font-medium text-tinta-suave transition-colors hover:text-tinta"
                >
                  Ahora no
                </button>
              </div>
            )}

            {/* Al terminar, dejar volver a los temas */}
            {paso === "listo" && temasPendientes.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {temasPendientes.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => elegirTema(t)}
                    className="rounded-full border border-marca-300 bg-marca-50 px-3.5 py-1.5 text-sm font-medium text-marca-700 transition-colors hover:border-marca-500 hover:bg-marca-100"
                  >
                    {t.chip}
                  </button>
                ))}
              </div>
            )}

            <div ref={finRef} />
          </div>

          {/* Entrada de texto solo durante la captura */}
          {enCaptura && (
            <div className="border-t border-borde px-3 py-3">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  avanzar();
                }}
                className="flex items-center gap-2"
              >
                <input
                  ref={inputRef}
                  value={entrada}
                  onChange={(e) => setEntrada(e.target.value)}
                  type={paso === "correo" ? "email" : "text"}
                  inputMode={paso === "correo" ? "email" : "text"}
                  autoComplete={paso === "correo" ? "email" : paso === "nombre" ? "name" : "off"}
                  placeholder={
                    paso === "nombre"
                      ? "Tu nombre…"
                      : paso === "correo"
                        ? "tu@correo.cl"
                        : paso === "colegio"
                          ? "Nombre del colegio…"
                          : "Tu cargo…"
                  }
                  maxLength={160}
                  className="min-w-0 flex-1 rounded-lg border border-borde-fuerte bg-superficie px-3 py-2.5 text-sm transition focus:border-marca-500 focus:outline-none focus:ring-2 focus:ring-marca-200"
                />
                <button
                  type="submit"
                  disabled={enviando || !entrada.trim()}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-marca-600 text-white transition-colors hover:bg-marca-700 disabled:opacity-40"
                  aria-label="Enviar"
                >
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
                    <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </form>
              {(paso === "colegio" || paso === "cargo") && (
                <button
                  type="button"
                  onClick={omitir}
                  disabled={enviando}
                  className="mt-1.5 text-xs font-medium text-tinta-tenue hover:text-tinta-suave"
                >
                  Omitir este dato →
                </button>
              )}
              <p className="mt-1.5 text-[10px] leading-snug text-tinta-tenue">
                Usamos tu correo solo para enviarte información de Aulia. Sin spam.
              </p>
            </div>
          )}
        </aside>
      )}
    </>
  );
}
