import { test, expect } from "@playwright/test";
import { login } from "./helpers";

test.describe("Flujo crítico: firma de clases", () => {
  test("el profesor abre el registro de una asignatura", async ({ page }) => {
    await login(page, "cvargas@demo.cl");
    await page.goto("/libro-clases/firma");

    const primera = page.locator('a[href*="/libro-clases/firma?asignaturaId="]').first();
    await expect(primera).toBeVisible();
    await primera.click();

    // La vista de firma permite registrar contenidos de la clase.
    await expect(page.locator("textarea").first()).toBeVisible();
  });
});
