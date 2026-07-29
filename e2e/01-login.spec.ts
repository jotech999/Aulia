import { test, expect } from "@playwright/test";
import { login, DEMO_PASSWORD } from "./helpers";

test.describe("Flujo crítico: login", () => {
  test("credenciales válidas entran al dashboard", async ({ page }) => {
    await login(page, "director@demo.cl");
    await expect(page).toHaveURL(/\/dashboard/);
    // El dashboard de dirección saluda por nombre.
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("credenciales inválidas no entran", async ({ page }) => {
    await page.goto("/login");
    await page.fill("#email", "director@demo.cl");
    await page.fill("#password", "clave-incorrecta");
    await page.click('button[type="submit"]');
    // No debe llegar al dashboard.
    await page.waitForTimeout(2000);
    await expect(page).not.toHaveURL(/\/dashboard/);
  });

  test("una ruta protegida sin sesión redirige al login", async ({ page }) => {
    await page.goto("/admin/estudiantes");
    await expect(page).toHaveURL(/\/login/);
  });

  void DEMO_PASSWORD;
});
