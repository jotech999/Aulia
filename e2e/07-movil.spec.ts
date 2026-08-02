import { test, expect } from "@playwright/test";
import { login, sinDesbordeHorizontal, sinContenidoRecortado, seSolapan } from "./helpers";

/**
 * REGRESIÓN DE LA VERSIÓN MÓVIL.
 *
 * Esta suite existe por un caso concreto: el cajón de navegación estuvo roto en
 * el teléfono y ninguna prueba lo detectó. La causa fue que el botón del menú
 * vive dentro de la barra superior, que lleva `backdrop-filter`, y un elemento
 * con backdrop-filter se convierte en el bloque contenedor de sus descendientes
 * `position: fixed`. El cajón, que pedía la pantalla completa, se dibujaba
 * dentro de los ~56px de la barra: la plataforma quedaba sin navegación en el
 * celular y solo nos enteramos porque una persona lo reportó.
 *
 * Las pruebas de aquí abajo verifican PROPIEDADES de la interfaz en un teléfono
 * (que el menú cubra la pantalla, que nada se desborde de lado, que los
 * controles principales no queden tapados), no textos concretos: así siguen
 * siendo útiles aunque cambie el contenido.
 *
 * Corre con: npx playwright test --project=movil
 */

const RUTAS_DOCENTE = [
  "/dashboard",
  "/calendario",
  "/libro-clases/horario",
  "/libro-clases/calificaciones",
  "/mensajes",
];

test.describe("Móvil · navegación", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, "cvargas@demo.cl");
  });

  test("el botón Menú abre el cajón y ocupa el alto de la pantalla", async ({ page }) => {
    // La barra lateral de escritorio no debe verse en el teléfono.
    await expect(page.getByRole("button", { name: "Abrir menú" })).toBeVisible();

    await page.getByRole("button", { name: "Abrir menú" }).click();
    const cajon = page.getByRole("dialog", { name: "Menú de navegación" });
    await expect(cajon).toBeVisible();

    const caja = await cajon.boundingBox();
    const alto = page.viewportSize()!.height;
    expect(caja, "el cajón no tiene caja: no se está pintando").not.toBeNull();
    // El bug daba ~56px de alto (el de la barra superior). Exigimos casi toda
    // la pantalla para que una regresión de contención vuelva a saltar aquí.
    expect(
      caja!.height,
      `el cajón mide ${Math.round(caja!.height)}px de alto en una pantalla de ${alto}px: probablemente quedó contenido dentro de la barra superior (backdrop-filter)`
    ).toBeGreaterThan(alto * 0.9);
    expect(caja!.y, "el cajón no arranca desde el borde superior").toBeLessThan(5);
  });

  test("el cajón muestra la navegación y permite llegar a un módulo", async ({ page }) => {
    await page.getByRole("button", { name: "Abrir menú" }).click();
    const cajon = page.getByRole("dialog", { name: "Menú de navegación" });
    await expect(cajon.getByRole("link", { name: "Asistencia" })).toBeVisible();
    await cajon.getByRole("link", { name: "Asistencia" }).click();
    await expect(page).toHaveURL(/\/libro-clases\/asistencia/);
    // Al navegar, el cajón se cierra solo.
    await expect(cajon).toBeHidden();
  });

  test("el cajón se cierra al tocar fuera", async ({ page }) => {
    await page.getByRole("button", { name: "Abrir menú" }).click();
    const cajon = page.getByRole("dialog", { name: "Menú de navegación" });
    await expect(cajon).toBeVisible();
    // Toca bien a la derecha, sobre el telón.
    await page.mouse.click(page.viewportSize()!.width - 15, 300);
    await expect(cajon).toBeHidden();
  });
});

test.describe("Móvil · nada se desborda a lo ancho", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, "cvargas@demo.cl");
  });

  for (const ruta of RUTAS_DOCENTE) {
    test(`${ruta} cabe en el ancho del teléfono`, async ({ page }) => {
      await page.goto(ruta);
      await page.waitForLoadState("networkidle");
      await sinDesbordeHorizontal(page, ruta);
      await sinContenidoRecortado(page, ruta);
    });
  }
});

test.describe("Móvil · dirección", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, "director@demo.cl");
  });

  for (const ruta of ["/dashboard", "/admin/estudiantes", "/admin/cursos", "/cierre-anual"]) {
    test(`${ruta} cabe en el ancho del teléfono`, async ({ page }) => {
      await page.goto(ruta);
      await page.waitForLoadState("networkidle");
      await sinDesbordeHorizontal(page, ruta);
      await sinContenidoRecortado(page, ruta);
    });
  }

  test("las tablas anchas se desplazan dentro de su tarjeta, no arrastrando la página", async ({ page }) => {
    await page.goto("/admin/estudiantes");
    const tabla = page.locator("table").first();
    await expect(tabla).toBeVisible();
    const contenedorDesplaza = await tabla.evaluate((el) => {
      for (let p = el.parentElement; p; p = p.parentElement) {
        const ov = getComputedStyle(p).overflowX;
        if (ov === "auto" || ov === "scroll") return true;
      }
      return false;
    });
    expect(
      contenedorDesplaza,
      "la tabla no tiene un contenedor con overflow-x: en el teléfono se aprieta y corta columnas"
    ).toBe(true);
  });
});

test.describe("Móvil · los controles principales quedan libres", () => {
  test("Auli no tapa la barra de guardar de Asistencia", async ({ page }) => {
    await login(page, "cvargas@demo.cl");
    await page.goto("/libro-clases/asistencia");
    await page.waitForLoadState("networkidle");

    const auli = page.getByRole("button", { name: /Auli/i }).first();
    // Si la IA no está configurada, Auli no se monta: la prueba no aplica.
    if ((await auli.count()) === 0 || !(await auli.isVisible())) test.skip();

    const barra = page.locator('[role="status"]').first();
    if ((await barra.count()) === 0) test.skip();

    const [cajaAuli, cajaBarra] = await Promise.all([auli.boundingBox(), barra.boundingBox()]);
    expect(cajaAuli).not.toBeNull();
    expect(cajaBarra).not.toBeNull();
    expect(
      seSolapan(cajaAuli!, cajaBarra!),
      "el botón de Auli se superpone con la barra de guardar: en el teléfono tapa el control principal"
    ).toBe(false);
  });

  test("el calendario muestra el mes completo sin arrastrar de lado", async ({ page }) => {
    await login(page, "cvargas@demo.cl");
    await page.goto("/calendario");
    await page.waitForLoadState("networkidle");

    // Las 7 columnas de días deben caber en el ancho visible.
    const encabezados = page.locator("table, [class*='grid-cols-7']").first();
    await expect(encabezados).toBeVisible();
    const caja = await encabezados.boundingBox();
    expect(caja).not.toBeNull();
    expect(
      caja!.width,
      "la grilla del mes es más ancha que la pantalla: hay que arrastrar para ver media semana"
    ).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
  });
});

test.describe("Móvil · portal del apoderado", () => {
  test("el panel del apoderado cabe y ofrece a sus pupilos", async ({ page }) => {
    await login(page, "apoderado1@demo.cl");
    await page.waitForLoadState("networkidle");
    await sinDesbordeHorizontal(page, "/dashboard (apoderado)");
    // El acceso a la ficha del pupilo es la acción principal del portal.
    await expect(page.getByRole("link", { name: /Ver ficha|pupilo/i }).first()).toBeVisible();
  });
});
