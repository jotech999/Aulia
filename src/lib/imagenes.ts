/**
 * COMPRESIÓN DE FOTOS EN EL NAVEGADOR, antes de mandarlas a analizar.
 *
 * Una foto de un teléfono actual pesa entre 3 y 8 MB. Mandarla tal cual sería
 * lento con el wifi de un colegio, chocaría con el límite de tamaño de las
 * server actions y costaría más de lo necesario en el modelo. Redimensionar a
 * 1600 px de lado mayor conserva de sobra la legibilidad de la letra manuscrita
 * y baja el archivo a unos pocos cientos de kB.
 *
 * Todo ocurre en el dispositivo: la foto original nunca sale del teléfono.
 */

export type ImagenComprimida = {
  base64: string;
  tipo: "image/jpeg";
  /** Para la vista previa, sin volver a leer el archivo. */
  urlPrevia: string;
};

const LADO_MAXIMO = 1600;
const CALIDAD = 0.78;

export async function comprimirImagen(archivo: File): Promise<ImagenComprimida> {
  if (!archivo.type.startsWith("image/")) {
    throw new Error("Ese archivo no es una imagen.");
  }

  const bitmap = await crearBitmap(archivo);
  const escala = Math.min(1, LADO_MAXIMO / Math.max(bitmap.width, bitmap.height));
  const ancho = Math.max(1, Math.round(bitmap.width * escala));
  const alto = Math.max(1, Math.round(bitmap.height * escala));

  const lienzo = document.createElement("canvas");
  lienzo.width = ancho;
  lienzo.height = alto;
  const ctx = lienzo.getContext("2d");
  if (!ctx) throw new Error("Este navegador no puede procesar la imagen.");
  // Fondo blanco: un PNG con transparencia sobre JPEG saldría negro y la hoja
  // escaneada se volvería ilegible.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, ancho, alto);
  ctx.drawImage(bitmap, 0, 0, ancho, alto);
  if ("close" in bitmap && typeof bitmap.close === "function") bitmap.close();

  const urlPrevia = lienzo.toDataURL("image/jpeg", CALIDAD);
  const coma = urlPrevia.indexOf(",");
  return { base64: urlPrevia.slice(coma + 1), tipo: "image/jpeg", urlPrevia };
}

/**
 * `createImageBitmap` respeta la orientación EXIF y es mucho más rápido, pero
 * Safari antiguo no admite la opción; ahí se cae a `<img>`.
 */
async function crearBitmap(archivo: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(archivo, { imageOrientation: "from-image" });
    } catch {
      /* sigue con el respaldo */
    }
  }
  return new Promise((resolver, rechazar) => {
    const url = URL.createObjectURL(archivo);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolver(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      rechazar(new Error("No se pudo abrir la imagen."));
    };
    img.src = url;
  });
}
