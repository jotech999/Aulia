import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Iconos, type NombreIcono } from "@/components/ui/iconos";
import { Isotipo } from "@/components/ui/isotipo";
import { FormularioDemo } from "@/components/landing/form-demo";
import { CalculadoraPrecio } from "@/components/landing/calculadora-precio";
import { PulsoVivo } from "@/components/landing/pulso-vivo";
import { AuliLanding } from "@/components/landing/auli-landing";
import { PLANES, cotizar, formatearCLP, formatearUF } from "@/lib/precios";

export const metadata = {
  // `absolute` evita la plantilla "%s · Aulia" del layout: sin esto el título de
  // la landing quedaba "... hecho para profesores · Aulia", con la marca dos veces.
  title: { absolute: "Aulia — El libro de clases digital hecho para profesores" },
  description:
    "Plataforma de gestión escolar chilena: libro de clases, planificación, comunicación con apoderados y administración. Cumple Circular N°30 y Decreto 67, con IA docente y precio publicado por estudiante.",
};

const MODULOS: { icono: NombreIcono; titulo: string; desc: string }[] = [
  { icono: "libro", titulo: "Libro de clases", desc: "Asistencia, calificaciones y firma de clases en línea, según Circular N°30. Todo auditado, nada se pierde." },
  { icono: "planificacion", titulo: "Planificación", desc: "Planifica por unidad y clase vinculando los OA del currículum, con cobertura curricular para UTP." },
  { icono: "comunicacion", titulo: "Comunicación", desc: "Comunicados a las familias con confirmación de lectura y un portal del apoderado claro y móvil." },
  { icono: "cursos", titulo: "Administración", desc: "Cursos, matrícula, alertas tempranas y reportes normativos (SIGE, actas, respaldo del libro)." },
];

/**
 * Los cuatro diferenciadores que no tienen las plataformas tradicionales chilenas.
 * Van aparte de los módulos porque son la razón de elegirnos, no la lista de features.
 */
const DIFERENCIADORES: { titulo: string; desc: string }[] = [
  {
    titulo: "Pasa lista sin señal",
    desc: "La asistencia se guarda en el teléfono y se sincroniza sola cuando vuelve la conexión. En el patio, en el gimnasio o en un colegio rural, la lista se toma igual.",
  },
  {
    titulo: "IA docente incluida",
    desc: "Guías, evaluaciones, informes al hogar y resúmenes para el consejo, en borrador y en segundos. Sin costo extra por plan y sin enviar datos sensibles al modelo.",
  },
  {
    titulo: "Todo a dos clics (⌘K)",
    desc: "Un buscador global donde escribes lo que quieres hacer. Nadie tiene que aprender dónde está cada cosa: se escribe y se llega.",
  },
  {
    titulo: "Cumplimiento demostrable",
    desc: "Un panel muestra, en vivo, cómo va el colegio en Circular N°30, Decreto 67 y respaldo a 5 años. Cuando llega la Superintendencia, la evidencia ya está lista.",
  },
];

/** Ejemplos de cotización que se muestran junto a la calculadora. */
const EJEMPLOS_MATRICULA = [250, 600, 1100, 1800];

const PREGUNTAS: { q: string; a: string }[] = [
  {
    q: "¿Cuánto demora migrar desde Lirmi, Napsis o Syscol?",
    a: "La migración es asistida y sin costo. En la semana 0 importamos cursos, estudiantes y matrícula desde tu sistema actual con plantillas CSV/Excel validadas; tú revisas y confirmas. Puedes correr en paralelo con tu plataforma anterior durante la marcha blanca, sin cortes.",
  },
  {
    q: "¿Cumple la normativa chilena?",
    a: "Sí, de fábrica: libro de clases según Circular N°30 (con registro de toda acción y respaldo 5 años), evaluación y promoción según Decreto 67/2018, y exportaciones compatibles con SIGE para declarar asistencia y matrícula.",
  },
  {
    q: "¿Qué pasa con los datos de los estudiantes?",
    a: "Se tratan como datos sensibles (Ley 21.719): minimización de datos, campos de salud cifrados y aislamiento estricto entre colegios. El asistente de IA nunca recibe RUT ni datos sensibles — opera solo lectura sobre datos no identificables.",
  },
  {
    q: "¿Necesita una capacitación larga para el equipo?",
    a: "No. El diseño es tan directo que la capacitación es corta por definición: una sesión a dirección/UTP y otra a la sala de profesores, más acompañamiento en la primera toma de asistencia y el primer cierre de notas.",
  },
  {
    q: "¿Funciona bien en el celular?",
    a: "Sí. Tomar asistencia y poner notas se hace desde el teléfono con una interfaz pensada para móvil, no una versión reducida del escritorio. Los apoderados tienen su portal móvil con notas, asistencia y avisos.",
  },
  {
    q: "¿Y si ya pagué el año en otra plataforma?",
    a: "Puedes empezar con la prueba gratis de 60 días y la migración sin costo, corriendo en paralelo. Al cambiarte, congelamos tu precio por 2 años para protegerte del reajuste de la UF.",
  },
  {
    q: "¿Por qué el precio va por estudiante y no una tarifa plana?",
    a: "Porque es lo justo en las dos direcciones: un colegio de 150 estudiantes no debería pagar lo mismo que uno de 1.500. Los tramos son marginales — el descuento por volumen se aplica solo sobre los estudiantes de cada tramo — así que el precio total nunca da saltos. La calculadora de esta página muestra el cálculo completo.",
  },
  {
    q: "¿Qué incluye el precio y qué se cobra aparte?",
    a: "El precio incluye usuarios ilimitados, implementación, capacitación, migración desde tu plataforma actual, soporte y todas las actualizaciones del año. No hay cargo de puesta en marcha ni cobro por usuario adicional. Los valores son netos, sin IVA, y se facturan una vez al año en UF.",
  },
  {
    q: "Somos un colegio municipal o SLEP: ¿cómo se compra?",
    a: "Entregamos la ficha técnica, el certificado de cumplimiento de Circular N°30 y la cotización en UF que el DAEM o el SLEP necesita para una Compra Ágil o una licitación L1. Estamos inscritos para operar por Mercado Público y podemos cotizar por establecimiento o por la comuna completa.",
  },
];

const COMPARATIVA: { criterio: string; tradicional: string; aulia: string }[] = [
  { criterio: "Velocidad", tradicional: "Pantallas lentas, muchos clics", aulia: "Cada acción en 2 clics o por el buscador ⌘K" },
  { criterio: "Experiencia", tradicional: "Diseño anticuado y confuso", aulia: "Interfaz moderna, pensada para el profesor" },
  { criterio: "Móvil", tradicional: "Apenas usable en el teléfono", aulia: "Toma de asistencia y notas desde el celular" },
  { criterio: "Sin conexión", tradicional: "Si se cae internet, no hay lista", aulia: "La asistencia se guarda y sincroniza sola" },
  { criterio: "Inteligencia artificial", tradicional: "Módulo aparte o no existe", aulia: "IA docente incluida en el plan, sin costo extra" },
  { criterio: "Apoderados", tradicional: "Sin visibilidad o app aparte", aulia: "Portal claro con notas, asistencia y avisos" },
  { criterio: "Precio", tradicional: "\"Contáctenos\" y cotización a puerta cerrada", aulia: "Publicado, con calculadora en el sitio" },
];

function Marca({ claro = false }: { claro?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <Isotipo className="h-9 w-9" />
      <span className={`font-display text-lg font-bold tracking-tight ${claro ? "text-white" : "text-tinta"}`}>Aulia</span>
    </div>
  );
}

/**
 * Vista previa del producto para el héroe: una recreación fiel y ligera del
 * panel de dirección con los tokens reales del sistema. Autocontenida (sin
 * imágenes), decorativa (aria-hidden), para transmitir de un vistazo cómo se
 * ve la plataforma sin cargar capturas pesadas.
 */
function VistaPrevia() {
  const barras = [62, 74, 68, 83, 79, 91, 88, 96];
  return (
    <div className="animar-surgir relative hidden lg:block" aria-hidden>
      {/* Chips flotantes: la plataforma "viva" alrededor del panel */}
      <div className="chip-flotante absolute -left-8 top-10 z-10 flex items-center gap-2 rounded-xl bg-white/95 px-3 py-2 shadow-flotante ring-1 ring-black/5">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-exito-suave text-[11px] font-bold text-exito">✓</span>
        <span className="text-[11px] font-semibold text-tinta">Asistencia sincronizada</span>
      </div>
      <div className="chip-flotante chip-flotante-2 absolute -right-5 bottom-16 z-10 flex items-center gap-2 rounded-xl bg-white/95 px-3 py-2 shadow-flotante ring-1 ring-black/5">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-marca-50 text-[11px]">✨</span>
        <span className="text-[11px] font-semibold text-tinta">IA: informe al hogar listo</span>
      </div>
      <div className="halo-mockup levitar superficie rounded-2xl p-4 shadow-flotante ring-1 ring-black/5">
        {/* Barra de ventana */}
        <div className="flex items-center gap-2 border-b border-borde pb-3">
          <Isotipo className="h-6 w-6" />
          <span className="text-xs font-semibold text-tinta">Panel · Dirección</span>
          <span className="ml-auto flex gap-1">
            <span className="h-2 w-2 rounded-full bg-borde-fuerte" />
            <span className="h-2 w-2 rounded-full bg-borde-fuerte" />
            <span className="h-2 w-2 rounded-full bg-borde-fuerte" />
          </span>
        </div>

        {/* KPIs */}
        <div className="mt-3 grid grid-cols-3 gap-2">
          <div className="acento-superior rounded-xl border border-borde bg-superficie-2 p-3">
            <p className="text-[10px] font-medium text-tinta-tenue">Asistencia hoy</p>
            <p className="cifra mt-0.5 text-xl text-tinta">96,5%</p>
            <p className="text-[10px] font-semibold text-exito">▲ +1,2 pts</p>
          </div>
          <div className="rounded-xl border border-borde bg-superficie-2 p-3">
            <p className="text-[10px] font-medium text-tinta-tenue">Promedio</p>
            <p className="cifra mt-0.5 text-xl text-tinta">5,8</p>
          </div>
          <div className="rounded-xl border border-borde bg-superficie-2 p-3">
            <p className="text-[10px] font-medium text-tinta-tenue">Alertas</p>
            <p className="cifra mt-0.5 text-xl text-peligro">3</p>
          </div>
        </div>

        {/* Mini gráfico de barras */}
        <div className="mt-3 rounded-xl border border-borde bg-superficie-2 p-3">
          <p className="text-[10px] font-medium text-tinta-tenue">Evolución de la asistencia</p>
          <div className="barras-crecen mt-2 flex h-16 items-end gap-1.5">
            {barras.map((h, i) => (
              <span
                key={i}
                className="barra-crece flex-1 rounded-t bg-gradient-to-t from-marca-500 to-marca-300"
                style={{ height: `${h}%`, animationDelay: `${0.5 + i * 0.09}s` }}
              />
            ))}
          </div>
        </div>

        {/* Filas de cursos */}
        <div className="mt-3 space-y-1.5">
          {[
            ["8°A · Jefatura", "97%", true],
            ["I°B · Matemática", "94%", false],
          ].map(([curso, pct, jefe]) => (
            <div key={curso as string} className="flex items-center gap-2 rounded-lg border border-borde bg-superficie px-3 py-2">
              <span className="text-xs font-semibold text-tinta">{curso}</span>
              {jefe && <span className="insignia insignia-marca !py-0 text-[9px]">Jefatura</span>}
              <span className="ml-auto insignia insignia-exito !py-0 text-[10px]">{pct} asist.</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Viñetas de los módulos: mini-interfaces reales, no descripciones ────── */

function VinetaLibro() {
  return (
    <div className="space-y-1.5" aria-hidden>
      {[
        ["Martina Soto", "P", "exito"],
        ["Benjamín Rojas", "P", "exito"],
        ["Sofía González", "A", "peligro"],
      ].map(([nombre, marca, tono]) => (
        <div key={nombre as string} className="flex items-center gap-2 rounded-lg border border-borde bg-superficie px-3 py-1.5">
          <span className="h-5 w-5 rounded-full bg-marca-100" />
          <span className="text-[11px] font-medium text-tinta">{nombre}</span>
          <span
            className={`ml-auto flex h-5 w-5 items-center justify-center rounded-md text-[10px] font-bold ${
              tono === "exito" ? "bg-exito-suave text-exito" : "bg-peligro-suave text-peligro"
            }`}
          >
            {marca}
          </span>
        </div>
      ))}
    </div>
  );
}

function VinetaPlanificacion() {
  return (
    <div aria-hidden>
      <div className="flex flex-wrap gap-1.5">
        {["OA 04", "OA 05", "OA 07"].map((oa) => (
          <span key={oa} className="rounded-md bg-marca-50 px-2 py-1 text-[10px] font-bold text-marca-700">{oa}</span>
        ))}
        <span className="rounded-md border border-dashed border-borde-fuerte px-2 py-1 text-[10px] font-semibold text-tinta-tenue">+ vincular OA</span>
      </div>
      <div className="mt-3 rounded-lg border border-borde bg-superficie p-2.5">
        <div className="flex items-center justify-between text-[10px] font-medium text-tinta-tenue">
          <span>Cobertura curricular</span>
          <span className="cifra font-bold text-marca-700">68%</span>
        </div>
        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-superficie-3">
          <div className="barra-entra h-full w-[68%] rounded-full bg-gradient-to-r from-marca-500 to-marca-300" />
        </div>
      </div>
    </div>
  );
}

function VinetaComunicacion() {
  return (
    <div aria-hidden>
      <div className="rounded-xl rounded-bl-sm border border-borde bg-superficie p-3">
        <p className="text-[11px] font-semibold text-tinta">📌 Reunión de apoderados</p>
        <p className="mt-0.5 text-[10px] text-tinta-suave">Jueves 19:00 · Sala del 8°A</p>
      </div>
      <div className="mt-2 flex items-center gap-1.5 text-[10px] font-semibold text-exito">
        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-exito-suave">✓</span>
        Leído por 28 de 32 familias
      </div>
    </div>
  );
}

function VinetaAdmin() {
  return (
    <div aria-hidden>
      <div className="grid grid-cols-2 gap-1.5">
        <div className="rounded-lg border border-borde bg-superficie p-2.5">
          <p className="text-[9px] font-medium text-tinta-tenue">Matrícula</p>
          <p className="cifra text-base font-bold text-tinta">812</p>
        </div>
        <div className="rounded-lg border border-borde bg-superficie p-2.5">
          <p className="text-[9px] font-medium text-tinta-tenue">Asistencia anual</p>
          <p className="cifra text-base font-bold text-tinta">94,2%</p>
        </div>
      </div>
      <div className="mt-2 flex items-center gap-1.5 rounded-lg border border-alerta/30 bg-alerta-suave px-2.5 py-1.5 text-[10px] font-semibold text-tinta">
        <span className="h-1.5 w-1.5 rounded-full bg-alerta" />
        3 estudiantes con alerta temprana
      </div>
    </div>
  );
}

const VINETAS: Record<string, () => React.JSX.Element> = {
  "Libro de clases": VinetaLibro,
  Planificación: VinetaPlanificacion,
  Comunicación: VinetaComunicacion,
  Administración: VinetaAdmin,
};

export default async function Home() {
  const sesion = await auth();
  if (sesion?.user) redirect("/dashboard");

  // Datos estructurados (schema.org) para buscadores. CLF = código ISO de la UF.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Aulia",
    applicationCategory: "EducationalApplication",
    operatingSystem: "Web",
    inLanguage: "es-CL",
    description:
      "Plataforma de gestión escolar chilena: libro de clases, planificación, comunicación con apoderados y administración. Rápida, moderna y con IA incluida.",
    // El precio se expresa por estudiante matriculado al año, en UF (CLF es el
    // código ISO 4217 de la Unidad de Fomento).
    offers: PLANES.map((p) => ({
      "@type": "Offer",
      name: p.nombre,
      priceCurrency: "CLF",
      priceSpecification: {
        "@type": "UnitPriceSpecification",
        price: String(p.ufPorEstudiante),
        priceCurrency: "CLF",
        unitText: "estudiante/año",
        referenceQuantity: {
          "@type": "QuantitativeValue",
          value: 1,
          unitText: "estudiante",
        },
        minPrice: String(p.pisoUf),
      },
    })),
    provider: {
      "@type": "Organization",
      name: "Aulia",
      url: "https://educhile.cl",
      areaServed: "CL",
      slogan: "El libro de clases que los profesores de verdad quieren usar.",
    },
  };

  return (
    <div className="min-h-screen bg-lienzo">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {/* Salto al contenido (accesibilidad por teclado) */}
      <a
        href="#contenido"
        className="sr-only left-3 top-3 z-50 rounded-lg bg-marca-600 px-4 py-2 text-sm font-semibold text-white shadow-elevada focus:not-sr-only focus:fixed"
      >
        Saltar al contenido
      </a>
      {/* ══ Región cinematográfica: header + héroe comparten el fondo oscuro ══ */}
      <div className="encabezado-cine malla-academica estrellas relative overflow-hidden">
        {/* Aurora animada: luces que derivan lentamente detrás del contenido */}
        <span className="aurora-luz aurora-luz-1" aria-hidden />
        <span className="aurora-luz aurora-luz-2" aria-hidden />
        <span className="aurora-luz aurora-luz-3" aria-hidden />

        {/* Barra superior en cristal sobre el héroe */}
        <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
          <Marca claro />
          <nav className="flex items-center gap-1 sm:gap-2">
            <a href="#modulos" className="hidden rounded-lg px-3 py-2 text-sm font-medium text-white/70 transition-colors hover:bg-white/10 hover:text-white sm:inline-block">
              Módulos
            </a>
            <a href="#planes" className="hidden rounded-lg px-3 py-2 text-sm font-medium text-white/70 transition-colors hover:bg-white/10 hover:text-white sm:inline-block">
              Planes
            </a>
            <a href="#sostenedores" className="hidden rounded-lg px-3 py-2 text-sm font-medium text-white/70 transition-colors hover:bg-white/10 hover:text-white lg:inline-block">
              Sostenedores
            </a>
            <Link
              href="/login"
              className="rounded-lg border border-white/25 bg-white/5 px-4 py-2 text-sm font-semibold text-white backdrop-blur transition-colors hover:bg-white/15"
            >
              Ingresar
            </Link>
          </nav>
        </header>

        {/* Héroe */}
        <section id="contenido" className="relative z-10 mx-auto max-w-6xl px-5 pb-16 pt-10 sm:px-8 sm:pb-20 sm:pt-14">
          <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr]">
            <div className="hero-secuencia max-w-2xl">
              <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wider text-white/70 backdrop-blur">
                <span className="h-1.5 w-1.5 rounded-full bg-acento" />
                Gestión escolar para colegios chilenos
              </p>
              <h1 className="mt-5 font-display text-5xl font-bold leading-[1.02] tracking-tight text-white sm:text-6xl xl:text-[4.4rem]">
                El libro de clases que los profesores{" "}
                <span className="texto-vivo">de verdad</span>{" "}
                quieren usar.
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-white/80 sm:text-xl">
                Asistencia, notas, planificación y comunicación con las familias en una
                plataforma rápida, con IA docente incluida y que pasa lista incluso sin
                señal. Cumple Circular N°30 y Decreto 67 de fábrica.
              </p>
              <div className="mt-9 flex flex-wrap items-center gap-3">
                <a href="#demo" className="boton-brillo group rounded-xl bg-white px-7 py-3.5 text-sm font-bold text-marca-700 shadow-flotante transition-all hover:-translate-y-0.5 hover:shadow-[0_0_36px_rgba(255,255,255,0.35)]">
                  Solicitar demo
                  <span className="ml-2 inline-block transition-transform group-hover:translate-x-1">→</span>
                </a>
                <a href="#planes" className="rounded-xl border border-white/25 px-7 py-3.5 text-sm font-semibold text-white transition-all hover:border-white/50 hover:bg-white/10">
                  Ver precios
                </a>
              </div>
              <p className="mt-5 text-sm text-white/50">
                Prueba de 60 días · migración e implementación sin costo · precio publicado
              </p>
            </div>

            {/* Vista previa del producto — mockup autocontenido con los tokens reales */}
            <VistaPrevia />
          </div>
        </section>

        {/* Cinta deslizante: beneficios en movimiento perpetuo */}
        <div className="relative z-10 border-t border-white/10 bg-white/[0.04] py-3.5">
          <div className="cinta" aria-hidden>
            <div className="cinta-pista">
              {[0, 1].map((copia) => (
                <div key={copia} className="flex shrink-0 items-center gap-10 pr-10">
                  {[
                    "Libro de clases digital",
                    "Asistencia sin señal",
                    "IA docente incluida",
                    "Circular N°30 de fábrica",
                    "Decreto 67",
                    "Portal del apoderado",
                    "Notas desde el celular",
                    "Migración sin costo",
                  ].map((t) => (
                    <span key={t} className="flex items-center gap-10 whitespace-nowrap text-sm font-medium text-white/60">
                      {t}
                      <span className="text-acento/70">✦</span>
                    </span>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
        <span className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-acento/70 to-transparent" aria-hidden />
      </div>

      {/* Tira de métricas de confianza */}
      <section className="mx-auto max-w-6xl px-5 pt-8 sm:px-8">
        <div className="surgir-secuencia grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["2 clics", "para cualquier acción frecuente"],
            ["Circular N°30", "auditoría y respaldo a 5 años"],
            ["Sin señal", "la lista se toma igual"],
            ["IA incluida", "en el plan, sin costo extra"],
          ].map(([valor, etiqueta]) => (
            <div
              key={valor}
              className="superficie superficie-realce rounded-2xl px-5 py-4 text-center transition-transform duration-300 hover:-translate-y-1"
            >
              <p className="cifra texto-degradado text-2xl">{valor}</p>
              <p className="mt-1 text-xs text-tinta-tenue">{etiqueta}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Módulos: tarjetas-vitrina con mini-interfaces reales */}
      <section id="modulos" className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-24">
        <p className="text-center text-xs font-bold uppercase tracking-widest text-marca-600">Módulos</p>
        <h2 className="mt-2 text-center font-display text-3xl font-bold tracking-tight text-tinta sm:text-4xl">
          Todo el colegio, <span className="texto-degradado">en un solo lugar</span>
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-center text-tinta-suave">
          Cuatro módulos que cubren el día a día del establecimiento, del aula a la dirección.
          Así se ven por dentro:
        </p>
        <div className="surgir-secuencia mt-12 grid gap-5 sm:grid-cols-2">
          {MODULOS.map((m) => {
            const Icono = Iconos[m.icono];
            const Vineta = VINETAS[m.titulo];
            return (
              <div key={m.titulo} className="superficie tarjeta-int tarjeta-lumen group overflow-hidden rounded-2xl">
                {/* Viñeta: mini-interfaz del módulo */}
                <div className="relative border-b border-borde bg-gradient-to-br from-superficie-2 to-marca-50/40 p-5 transition-colors duration-300 group-hover:to-marca-50">
                  <div className="mx-auto max-w-[260px] transition-transform duration-300 group-hover:-translate-y-0.5">
                    {Vineta ? <Vineta /> : null}
                  </div>
                </div>
                <div className="flex items-start gap-4 p-6">
                  <span className="icono-gradiente flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white shadow-suave">
                    <Icono className="h-5.5 w-5.5" />
                  </span>
                  <div>
                    <h3 className="font-display text-lg font-semibold tracking-tight text-tinta">{m.titulo}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-tinta-suave">{m.desc}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Diferenciadores: banda oscura cinematográfica a todo el ancho */}
      <section className="revelar-scroll mt-4 sm:mt-8">
        <div className="encabezado-cine malla-academica estrellas relative overflow-hidden py-16 sm:py-24">
          <span className="aurora-luz aurora-luz-1" aria-hidden />
          <span className="aurora-luz aurora-luz-3" aria-hidden />
          <div className="relative z-10 mx-auto max-w-6xl px-5 sm:px-8">
            <p className="text-center text-xs font-bold uppercase tracking-widest text-acento">La diferencia</p>
            <h2 className="mt-2 text-center font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Cuatro cosas que solo encuentras acá
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-center text-white/70">
              Los módulos los tiene todo el mercado. Esto es lo que hace la diferencia
              en un martes cualquiera a las 8:15 de la mañana.
            </p>
            <div className="surgir-secuencia mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {DIFERENCIADORES.map((d, i) => {
                const glifos = [
                  <Iconos.asistencia key="g" className="h-6 w-6" />,
                  <span key="g" className="text-xl leading-none">✨</span>,
                  <span key="g" className="cifra text-sm font-bold leading-none">⌘K</span>,
                  <Iconos.escudo key="g" className="h-6 w-6" />,
                ];
                return (
                  <div
                    key={d.titulo}
                    className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-7 backdrop-blur transition-all duration-300 hover:-translate-y-1.5 hover:border-acento/40 hover:bg-white/10"
                  >
                    <span className="cifra pointer-events-none absolute -right-2 -top-4 text-7xl font-bold text-white/[0.06] transition-colors duration-300 group-hover:text-acento/10" aria-hidden>
                      0{i + 1}
                    </span>
                    <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/15 bg-white/10 text-acento transition-transform duration-300 group-hover:scale-110">
                      {glifos[i]}
                    </span>
                    <h3 className="mt-5 font-display text-lg font-semibold tracking-tight text-white">
                      {d.titulo}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-white/70">{d.desc}</p>
                  </div>
                );
              })}
            </div>
          </div>
          <span className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-acento/60 to-transparent" aria-hidden />
          <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-acento/60 to-transparent" aria-hidden />
        </div>
      </section>

      {/* Hecha por profesores */}
      <section className="overflow-hidden bg-superficie-2 py-16 sm:py-24">
        <div className="revelar-scroll mx-auto grid max-w-6xl items-center gap-12 px-5 sm:px-8 lg:grid-cols-[0.95fr_1.05fr]">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-marca-600">Hecha por profesores, para profesores</p>
            <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-tinta sm:text-4xl">
              Nace en la <span className="texto-degradado">sala de clases</span>, no en una oficina.
            </h2>
            <p className="mt-4 leading-relaxed text-tinta-suave">
              Aulia la diseñamos junto a docentes de aula que conocen el peso de la burocracia: tomar
              asistencia entre el timbre y la lista, ingresar notas apurados, informar a las familias sin
              que se pierda nada. Cada pantalla está pensada para ahorrar minutos que hoy se van en el sistema.
            </p>
            <ul className="mt-7 space-y-3">
              {[
                "Menos clics, más clases.",
                "Cumple la normativa chilena sin que tengas que pensar en ella.",
                "Funciona en el computador del colegio y en tu teléfono.",
              ].map((t) => (
                <li
                  key={t}
                  className="superficie flex items-center gap-3 rounded-xl border border-borde px-4 py-3 text-sm font-medium text-tinta shadow-suave transition-transform duration-300 hover:translate-x-1"
                >
                  <span className="icono-gradiente flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white">✓</span>
                  {t}
                </li>
              ))}
            </ul>
          </div>
          {/*
            Prueba social honesta: en vez de un testimonio inventado o de cifras de
            usuarios que aún no tenemos, mostramos cambios concretos y verificables
            que salieron de sesiones con profesoras de aula. Es específico, es cierto
            y dice más que un "500+ colegios" que no podríamos respaldar.
          */}
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-marca-600">
              Del cuaderno de notas de una profesora al producto
            </p>
            <p className="mt-2 text-sm text-tinta-suave">
              Mejoras que existen porque una docente de aula dijo que faltaban. Sin comité de producto en medio.
            </p>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {[
                ["Nadie dice registro de clases, decimos leccionario.", "Renombramos el módulo y lo agrupamos por mes, como el cuaderno físico.", "-rotate-1"],
                ["El calendario es un muro de texto gris.", "Cada asignatura tiene su color, con contraste verificado.", "rotate-1"],
                ["Tengo que avisarles a los apoderados porque no les llega la nota.", "Al publicar una evaluación, el aviso a la familia sale solo.", "rotate-[0.7deg]"],
                ["Si se cae internet en el gimnasio, pierdo la lista.", "La asistencia se guarda en el teléfono y se sincroniza sola.", "-rotate-[0.7deg]"],
              ].map(([cita, respuesta, giro]) => (
                <figure
                  key={cita}
                  className={`superficie relative rounded-2xl border border-borde p-5 pt-7 shadow-suave transition-all duration-300 hover:rotate-0 hover:shadow-flotante ${giro}`}
                >
                  <span className="pointer-events-none absolute -top-1 left-4 font-display text-6xl font-bold leading-none text-marca-200" aria-hidden>
                    “
                  </span>
                  <blockquote className="relative font-display text-sm italic leading-relaxed text-tinta">
                    {cita}
                  </blockquote>
                  <figcaption className="mt-3 flex items-start gap-2 border-t border-borde pt-3 text-[13px] leading-snug text-tinta-suave">
                    <span className="mt-0.5 shrink-0 font-bold text-exito">→</span>
                    {respuesta}
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* El pulso del colegio: gráficas vivas que se dibujan al hacer scroll */}
      <section className="revelar-scroll mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-24">
        <p className="text-center text-xs font-bold uppercase tracking-widest text-marca-600">Datos en vivo</p>
        <h2 className="mt-2 text-center font-display text-3xl font-bold tracking-tight text-tinta sm:text-4xl">
          El pulso del colegio, <span className="texto-degradado">de un vistazo</span>
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-center text-tinta-suave">
          Dirección y UTP ven la asistencia, el cumplimiento y las alertas del
          establecimiento en tiempo real. Así se ve el panel:
        </p>
        <div className="mt-12">
          <PulsoVivo />
        </div>
      </section>

      {/* Comparativa: enfrentamiento visual "tradicional vs Aulia" */}
      <section className="revelar-scroll mx-auto max-w-5xl px-5 py-16 sm:px-8 sm:py-24">
        <p className="text-center text-xs font-bold uppercase tracking-widest text-marca-600">Comparativa</p>
        <h2 className="mt-2 text-center font-display text-3xl font-bold tracking-tight text-tinta sm:text-4xl">
          Por qué <span className="texto-degradado">cambiarte</span>
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-center text-tinta-suave">
          Frente a las plataformas tradicionales, Aulia pone la rapidez y la experiencia primero.
        </p>
        <div className="mt-12 grid gap-6 lg:grid-cols-2">
          {/* Columna: lo tradicional (apagada, en escala de grises) */}
          <div className="rounded-3xl border border-borde bg-superficie-2 p-6 sm:p-8">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-superficie-3 text-lg grayscale">🗄️</span>
              <div>
                <h3 className="font-display text-lg font-bold tracking-tight text-tinta-suave">Plataformas tradicionales</h3>
                <p className="text-xs text-tinta-tenue">El sistema que hoy todos soportan</p>
              </div>
            </div>
            <ul className="mt-6 space-y-3">
              {COMPARATIVA.map((c) => (
                <li key={c.criterio} className="flex items-start gap-3 rounded-xl px-3 py-2">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-superficie-3 text-[11px] font-bold text-tinta-tenue">✗</span>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-tinta-tenue">{c.criterio}</p>
                    <p className="mt-0.5 text-sm text-tinta-suave">{c.tradicional}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {/* Columna: Aulia (viva, elevada, con marco de marca) */}
          <div className="encabezado-cine relative overflow-hidden rounded-3xl p-6 shadow-elevada sm:p-8 lg:-my-3">
            <span className="aurora-luz aurora-luz-2" aria-hidden />
            <div className="relative z-10">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 backdrop-blur">
                  <Isotipo className="h-6 w-6" />
                </span>
                <div>
                  <h3 className="font-display text-lg font-bold tracking-tight text-white">Aulia</h3>
                  <p className="text-xs text-white/60">La plataforma que quieres abrir</p>
                </div>
                <span className="ml-auto rounded-full border border-acento/40 bg-acento/15 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-acento">
                  Recomendado
                </span>
              </div>
              <ul className="mt-6 space-y-3">
                {COMPARATIVA.map((c) => (
                  <li key={c.criterio} className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 backdrop-blur transition-colors duration-300 hover:bg-white/10">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-exito text-[11px] font-bold text-white">✓</span>
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wide text-white/50">{c.criterio}</p>
                      <p className="mt-0.5 text-sm font-medium text-white">{c.aulia}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Planes */}
      <section id="planes" className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-24">
        <p className="text-center text-xs font-bold uppercase tracking-widest text-marca-600">Planes</p>
        <h2 className="mt-2 text-center font-display text-3xl font-bold tracking-tight text-tinta sm:text-4xl">
          Precio publicado, <span className="texto-degradado">calculado a la vista</span>
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-center text-tinta-suave">
          En este mercado casi nadie publica sus tarifas. Nosotros sí: se paga por
          estudiante matriculado, una vez al año, en UF. Usuarios ilimitados,
          implementación y soporte incluidos.
        </p>

        <div className="surgir-secuencia mt-12 grid items-stretch gap-5 lg:grid-cols-3">
          {PLANES.map((plan) => (
            <div
              key={plan.id}
              className={`relative flex flex-col rounded-2xl p-6 transition-transform duration-300 sm:p-7 ${
                plan.destacado
                  ? // mt-4 en móvil: la insignia sobresale por arriba y en la grilla
                    // apilada quedaba encima de la tarjeta anterior.
                    "encabezado-cine malla-academica estrellas mt-4 overflow-hidden text-white shadow-flotante ring-1 ring-acento/40 lg:mt-0 lg:-my-3 lg:scale-[1.02] lg:hover:scale-[1.035]"
                  : "superficie tarjeta-int tarjeta-lumen hover:-translate-y-1"
              }`}
            >
              {plan.destacado && (
                <>
                  <span className="aurora-luz aurora-luz-2" aria-hidden />
                  <span className="absolute -top-0 left-1/2 z-10 -translate-x-1/2 rounded-b-xl bg-acento px-4 py-1.5 text-[11px] font-bold uppercase tracking-wide text-marca-900 shadow-elevada">
                    ★ Más elegido
                  </span>
                </>
              )}
              <h3 className={`relative font-display text-lg font-semibold tracking-tight ${plan.destacado ? "mt-4 text-white" : "text-tinta"}`}>
                {plan.nombre}
              </h3>
              <p className={`relative mt-1 text-xs ${plan.destacado ? "text-white/60" : "text-tinta-tenue"}`}>
                {plan.resumen}
              </p>

              <div className="relative mt-5 flex items-baseline gap-1.5">
                <span className={`cifra text-5xl tracking-tight ${plan.destacado ? "text-white resplandor-dato" : "texto-degradado"}`}>
                  UF {formatearUF(plan.ufPorEstudiante)}
                </span>
                <span className={`text-sm ${plan.destacado ? "text-white/60" : "text-tinta-tenue"}`}>
                  /estudiante/año
                </span>
              </div>
              <p className={`relative mt-0.5 text-xs ${plan.destacado ? "text-white/60" : "text-tinta-tenue"}`}>
                Mínimo UF {plan.pisoUf} al año · un colegio de 600 estudiantes paga{" "}
                {formatearCLP(cotizar(plan, 600).clpAnual)}
              </p>

              <ul className="relative mt-5 flex-1 space-y-2.5">
                {plan.incluye.map((item) => (
                  <li key={item} className={`flex items-start gap-2.5 text-sm ${plan.destacado ? "text-white/85" : "text-tinta"}`}>
                    <span
                      className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                        plan.destacado ? "bg-white text-marca-700" : "bg-exito-suave text-exito"
                      }`}
                      aria-hidden
                    >
                      ✓
                    </span>
                    {item}
                  </li>
                ))}
              </ul>

              <a
                href="#demo"
                className={`relative mt-6 rounded-xl px-4 py-3 text-center text-sm font-bold transition-all hover:-translate-y-0.5 ${
                  plan.destacado
                    ? "boton-brillo bg-white text-marca-700 shadow-suave hover:shadow-[0_0_28px_rgba(255,255,255,0.3)]"
                    : "btn btn-secundario"
                }`}
              >
                Solicitar demo
              </a>
            </div>
          ))}
        </div>

        {/* Calculadora: el director tiene que ver SU número antes de escribirnos */}
        <div className="relative mt-14">
          {/* Marco luminoso permanente: es EL diferenciador comercial de la página */}
          <div className="pointer-events-none absolute -inset-1 rounded-[28px] bg-gradient-to-r from-marca-400 via-acento to-marca-400 opacity-30 blur-md" aria-hidden />
          <div className="pointer-events-none absolute -inset-px rounded-[26px] bg-gradient-to-r from-marca-400 via-acento to-marca-400 opacity-60" aria-hidden />
          <div className="relative">
            <CalculadoraPrecio />
          </div>
        </div>

        {/* Tabla de referencia por tamaño de establecimiento */}
        <div className="mt-10 overflow-hidden rounded-2xl border border-borde bg-superficie shadow-suave">
          <div className="border-b border-borde bg-superficie-2 px-5 py-3">
            <p className="text-sm font-semibold text-tinta">Referencia rápida por tamaño</p>
            <p className="mt-0.5 text-xs text-tinta-tenue">
              Total anual en UF por establecimiento, con los tramos de volumen ya aplicados.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] text-sm">
              <thead>
                <tr className="border-b border-borde text-left text-xs uppercase tracking-wider text-tinta-tenue">
                  <th scope="col" className="px-5 py-3 font-semibold">Matrícula</th>
                  {PLANES.map((p) => (
                    <th key={p.id} scope="col" className="px-5 py-3 font-semibold">
                      {p.nombre}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-borde">
                {EJEMPLOS_MATRICULA.map((matricula) => (
                  <tr key={matricula}>
                    <th scope="row" className="px-5 py-3 text-left font-semibold text-tinta">
                      {matricula.toLocaleString("es-CL")} estudiantes
                    </th>
                    {PLANES.map((plan) => {
                      const c = cotizar(plan, matricula);
                      return (
                        <td key={plan.id} className="px-5 py-3 text-tinta-suave">
                          <span className="cifra text-tinta">UF {formatearUF(c.ufAnual)}</span>
                          <span className="mt-0.5 block text-xs text-tinta-tenue">
                            ≈ {formatearCLP(c.clpAnual)}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <p className="mx-auto mt-8 max-w-2xl text-center text-sm text-tinta-suave">
          Todos los planes incluyen <strong className="font-semibold text-tinta">prueba gratis de 60 días</strong>,
          migración asistida e implementación sin costo, y{" "}
          <strong className="font-semibold text-tinta">precio congelado por 2 años</strong>.
          Descuento adicional para sostenedores con 2 o más establecimientos. Valores
          netos, sin IVA.
        </p>
      </section>

      {/* Sostenedores y compra pública */}
      <section id="sostenedores" className="bg-superficie-2 py-16 sm:py-24">
        <div className="revelar-scroll mx-auto max-w-6xl px-5 sm:px-8">
          <div className="grid items-start gap-10 lg:grid-cols-[1fr_1fr]">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-marca-600">
                Sostenedores, DAEM y SLEP
              </p>
              <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-tinta sm:text-4xl">
                Pensado para cómo <span className="texto-degradado">compra de verdad</span> un sostenedor.
              </h2>
              <p className="mt-4 leading-relaxed text-tinta-suave">
                La Circular N°30 obliga a tener el libro de clases digital con registro de
                toda acción y respaldo a cinco años. Nosotros entregamos la evidencia de ese
                cumplimiento y la documentación que tu unidad de compras necesita, para que
                el trámite no sea el obstáculo.
              </p>
              <ul className="surgir-secuencia mt-7 space-y-3">
                {[
                  ["Cotización en UF lista para Mercado Público", "Ficha técnica, cotización formal y respaldo de cumplimiento para Compra Ágil o licitación L1, por establecimiento o por la comuna completa."],
                  ["Un contrato para toda la red", "Panel del sostenedor con asistencia, notas, recaudación y alertas de todos tus establecimientos, comparables entre sí. 12% de descuento sobre el total de la red."],
                  ["Implementación por establecimiento, sin cortar el año", "Se puede correr en paralelo con la plataforma actual durante la marcha blanca; la migración de cursos, estudiantes y matrícula la hacemos nosotros."],
                  ["Respaldo y salida sin secuestro de datos", "Exportación completa del libro de clases y de la matrícula cuando quieras, en formato abierto. Tus datos son tuyos, también si te vas."],
                ].map(([titulo, desc], i) => (
                  <li
                    key={titulo}
                    className="superficie tarjeta-lumen group flex items-start gap-4 rounded-2xl border border-borde p-4 shadow-suave transition-all duration-300 hover:-translate-y-0.5 sm:p-5"
                  >
                    <span className="icono-gradiente mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white" aria-hidden>
                      0{i + 1}
                    </span>
                    <span>
                      <strong className="block font-display text-sm font-semibold tracking-tight text-tinta">{titulo}</strong>
                      <span className="mt-1 block text-sm leading-relaxed text-tinta-suave">{desc}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="superficie rounded-3xl border border-borde p-7 shadow-elevada lg:sticky lg:top-8">
              <p className="text-xs font-bold uppercase tracking-widest text-tinta-tenue">
                Ejemplo · red de 3 establecimientos
              </p>
              <p className="mt-2 text-sm text-tinta-suave">
                Plan Gestión Escolar, con el descuento de red aplicado sobre cada
                establecimiento.
              </p>
              <ul className="mt-5 divide-y divide-borde">
                {[420, 780, 1250].map((matricula) => {
                  const c = cotizar(PLANES[2], matricula, { red: true });
                  return (
                    <li key={matricula} className="flex items-baseline justify-between gap-3 py-3">
                      <span className="text-sm text-tinta">
                        {matricula.toLocaleString("es-CL")} estudiantes
                      </span>
                      <span className="text-right">
                        <span className="cifra block text-tinta">UF {formatearUF(c.ufAnual)}</span>
                        <span className="text-xs text-tinta-tenue">{formatearCLP(c.clpAnual)}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
              <div className="encabezado-cine relative mt-4 overflow-hidden rounded-xl p-4">
                <p className="relative text-xs font-medium text-white/70">Total anual de la red</p>
                <p className="cifra resplandor-dato relative mt-0.5 text-3xl text-white">
                  UF{" "}
                  {formatearUF(
                    Math.round(
                      [420, 780, 1250].reduce(
                        (s, m) => s + cotizar(PLANES[2], m, { red: true }).ufAnual,
                        0,
                      ) * 10,
                    ) / 10,
                  )}
                </p>
                <p className="relative mt-0.5 text-xs text-white/60">
                  {formatearCLP(
                    [420, 780, 1250].reduce(
                      (s, m) => s + cotizar(PLANES[2], m, { red: true }).clpAnual,
                      0,
                    ),
                  )}{" "}
                  al año · 2.450 estudiantes · usuarios ilimitados
                </p>
              </div>
              <a
                href="#demo"
                className="btn btn-secundario mt-5 w-full justify-center"
              >
                Pedir cotización para mi red
              </a>
            </div>
          </div>
        </div>
      </section>
      {/* Preguntas frecuentes */}
      <section className="revelar-scroll mx-auto max-w-3xl px-5 py-16 sm:px-8 sm:py-24">
        <p className="text-center text-xs font-bold uppercase tracking-widest text-marca-600">FAQ</p>
        <h2 className="mt-2 text-center font-display text-3xl font-bold tracking-tight text-tinta sm:text-4xl">
          Preguntas <span className="texto-degradado">frecuentes</span>
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-center text-tinta-suave">
          Lo que suele preguntar la dirección antes de cambiarse.
        </p>
        <div className="mt-10 space-y-3">
          {PREGUNTAS.map((p) => (
            <details
              key={p.q}
              className="superficie group rounded-2xl border border-borde px-5 py-4 shadow-suave transition-all duration-300 open:border-marca-300 open:shadow-elevada hover:border-marca-200 [&_summary]:cursor-pointer"
            >
              <summary className="flex list-none items-center justify-between gap-3 font-semibold text-tinta transition-colors group-open:text-marca-700 marker:content-none">
                {p.q}
                <span
                  className="icono-gradiente flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white transition-transform duration-300 group-open:rotate-45"
                  aria-hidden
                >
                  +
                </span>
              </summary>
              <p className="animar-surgir mt-3 border-t border-borde pt-3 text-sm leading-relaxed text-tinta-suave">{p.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* CTA + formulario: el gran final, de vuelta al mundo oscuro del héroe */}
      <section id="demo" className="encabezado-cine malla-academica estrellas relative overflow-hidden py-16 sm:py-24">
        <span className="aurora-luz aurora-luz-1" aria-hidden />
        <span className="aurora-luz aurora-luz-2" aria-hidden />
        <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-acento/60 to-transparent" aria-hidden />
        <div className="revelar-scroll relative z-10 mx-auto grid max-w-5xl items-center gap-12 px-5 sm:px-8 lg:grid-cols-2">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-acento">El siguiente paso</p>
            <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-white sm:text-5xl">
              Conoce Aulia en una demo
            </h2>
            <p className="mt-5 text-lg leading-relaxed text-white/75">
              Te mostramos la plataforma con datos de tu realidad y respondemos tus dudas de implementación,
              migración y precio. Sin compromiso.
            </p>
            <ul className="mt-7 space-y-3 text-sm">
              {["Implementación acompañada", "Migración desde tu sistema actual", "Capacitación a tu equipo"].map((t) => (
                <li key={t} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 font-medium text-white backdrop-blur transition-colors duration-300 hover:bg-white/10">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-acento text-[11px] font-bold text-marca-900">✓</span>
                  {t}
                </li>
              ))}
            </ul>
            <p className="mt-6 text-sm text-white/50">
              Prueba de 60 días · sin costo de implementación · tus datos siempre son tuyos
            </p>
          </div>
          <div className="halo-mockup">
            <FormularioDemo />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative bg-lienzo">
        <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-marca-400/60 to-transparent" aria-hidden />
        <div className="mx-auto grid max-w-6xl gap-8 px-5 py-14 sm:px-8 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2 lg:col-span-1">
            <Marca />
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-tinta-suave">
              El libro de clases moderno para colegios chilenos. Rápido, claro y
              hecho para el aula.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {["Circular N°30", "Decreto 67", "SIGE"].map((sello) => (
                <span key={sello} className="rounded-full border border-borde bg-superficie px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-tinta-suave">
                  {sello}
                </span>
              ))}
            </div>
          </div>
          {[
            {
              titulo: "Producto",
              enlaces: [
                { t: "Módulos", h: "#modulos" },
                { t: "Planes", h: "#planes" },
                { t: "Solicitar demo", h: "#demo" },
                { t: "Ingresar", h: "/login" },
              ],
            },
            {
              titulo: "Cumplimiento",
              enlaces: [
                { t: "Circular N°30", h: "#modulos" },
                { t: "Decreto 67/2018", h: "#modulos" },
                { t: "Exportación SIGE", h: "#modulos" },
                { t: "Protección de datos (Ley 21.719)", h: "#demo" },
              ],
            },
            {
              titulo: "Contacto",
              enlaces: [
                { t: "Agendar demo", h: "#demo" },
                { t: "Migración asistida", h: "#demo" },
                { t: "Soporte", h: "#demo" },
              ],
            },
          ].map((col) => (
            <div key={col.titulo}>
              <p className="text-xs font-semibold uppercase tracking-wider text-tinta-tenue">
                {col.titulo}
              </p>
              <ul className="mt-3 space-y-2">
                {col.enlaces.map((e) => (
                  <li key={e.t}>
                    <a
                      href={e.h}
                      className="text-sm text-tinta-suave transition-colors hover:text-marca-700"
                    >
                      {e.t}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="border-t border-borde">
          <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-5 py-5 text-xs text-tinta-tenue sm:flex-row sm:px-8">
            <p>© {new Date().getUTCFullYear()} Aulia · Gestión escolar para Chile</p>
            <p className="flex items-center gap-1.5">
              Hecho en Chile
              <span aria-hidden>🇨🇱</span>
              para colegios chilenos.
            </p>
          </div>
        </div>
      </footer>

      {/* Auli: asistente de prospección y captura de correos */}
      <AuliLanding />
    </div>
  );
}
