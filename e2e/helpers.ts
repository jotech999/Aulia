import { type Page, expect } from "@playwright/test";

export const DEMO_PASSWORD = "demo1234";

/** Inicia sesión con un email demo y espera a llegar al dashboard. */
export async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.fill("#email", email);
  await page.fill("#password", DEMO_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard", { timeout: 15_000 });
}

/** Abre el buscador global (⌘K) — utilidad de navegación. */
export async function irADashboard(page: Page) {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/dashboard/);
}

// ── Utilidades de regresión visual/estructural para móvil ────────────────────

/**
 * Falla si la PÁGINA se desborda horizontalmente. Es el síntoma clásico de un
 * ancho fijo suelto (una tabla sin contenedor de scroll, una rejilla de N
 * columnas sin punto de quiebre): el usuario termina arrastrando toda la
 * pantalla de lado y el contenido queda cortado.
 *
 * OJO con la medida: se compara contra `documentElement.clientWidth` (el
 * viewport de maquetación) y NO contra `window.innerWidth`. Cuando el contenido
 * es más ancho que la pantalla, el navegador móvil aleja la página y
 * `innerWidth` crece hasta igualar al contenido — con esa referencia el
 * desborde nunca se detecta (nos pasó al escribir esta prueba).
 *
 * Un desborde DENTRO de un contenedor con overflow-x propio es válido y no se
 * marca: esa es justamente la solución correcta para las tablas anchas.
 */
export async function sinDesbordeHorizontal(page: Page, ruta: string) {
  const medida = await page.evaluate(() => {
    const doc = document.documentElement;
    const ancho = doc.clientWidth;
    const culpables = [...document.querySelectorAll<HTMLElement>("body *")]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.right <= ancho + 1) return false;
        // ¿Algún ancestro se encarga de desplazarlo? Entonces está bien.
        for (let p = el.parentElement; p; p = p.parentElement) {
          const ov = getComputedStyle(p).overflowX;
          if (ov === "auto" || ov === "scroll") return false;
        }
        return true;
      })
      .slice(0, 5)
      .map((el) => `${el.tagName}.${el.className?.toString().slice(0, 70)}`);
    return { scrollW: doc.scrollWidth, ancho, culpables };
  });

  expect(
    medida.scrollW,
    `${ruta} se desborda a lo ancho (${medida.scrollW}px de contenido en una pantalla de ${medida.ancho}px). Elementos sueltos: ${medida.culpables.join(" | ") || "—"}`
  ).toBeLessThanOrEqual(medida.ancho + 1);
}

/**
 * Falla si hay contenido RECORTADO sin forma de alcanzarlo: un contenedor con
 * `overflow-x: hidden` cuyo contenido es más ancho que él. No produce barra de
 * desplazamiento —así que la prueba anterior no lo ve— pero en el teléfono
 * significa columnas o botones que simplemente no existen para la persona.
 */
export async function sinContenidoRecortado(page: Page, ruta: string, tolerancia = 8) {
  const recortados = await page.evaluate((tol) => {
    return [...document.querySelectorAll<HTMLElement>("body *")]
      .filter((el) => {
        const ov = getComputedStyle(el).overflowX;
        if (ov !== "hidden" && ov !== "clip") return false;
        return el.scrollWidth - el.clientWidth > tol && el.clientWidth > 0;
      })
      .slice(0, 5)
      .map(
        (el) =>
          `${el.tagName}.${el.className?.toString().slice(0, 60)} (contenido ${el.scrollWidth}px en ${el.clientWidth}px)`
      );
  }, tolerancia);

  expect(
    recortados,
    `${ruta} recorta contenido sin permitir desplazarlo: ${recortados.join(" | ")}`
  ).toEqual([]);
}

/** Rectángulos que se solapan (para detectar controles tapados). */
export function seSolapan(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number }
) {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}
