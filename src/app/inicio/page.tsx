import { permanentRedirect } from "next/navigation";

/**
 * /inicio existía como una segunda landing con la marca antigua "EduChile", precios
 * en dólares y cifras de tracción que no podíamos respaldar ("500+ escuelas",
 * "50K+ usuarios activos", "98% satisfacción"). Tener dos sitios comerciales
 * contradictorios confunde a quien llega, y publicar tracción inventada es un riesgo
 * real frente al SERNAC y frente a un sostenedor que compara antes de firmar.
 * La landing comercial única es "/".
 *
 * Se conserva la ruta con redirección permanente para no romper enlaces ya compartidos.
 */
export default function InicioPage() {
  permanentRedirect("/");
}
