import { test, expect } from "@playwright/test";

// Smoke-тесты публичных маршрутов на новой B2B-витрине (без web-клиента).
// /owner/* и /shipper/* защищены middleware → проверяем редирект неавторизованного.

test.describe("smoke — public routes", () => {
  test("/ отдаёт лендинг с двумя CTA", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Avito Business" })).toBeVisible();
    await expect(page.getByRole("link", { name: /панель владельца/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /отправщик/i })).toBeVisible();
  });

  test("/owner/login доступен без сессии", async ({ page }) => {
    const response = await page.goto("/owner/login");
    expect(response?.status()).toBeLessThan(400);
    await expect(page).toHaveURL(/\/owner\/login$/);
  });

  test("/shipper/login доступен без сессии", async ({ page }) => {
    const response = await page.goto("/shipper/login");
    expect(response?.status()).toBeLessThan(400);
    await expect(page).toHaveURL(/\/shipper\/login$/);
  });
});

test.describe("smoke — auth redirects", () => {
  test("/owner без cookie → редирект на /owner/login", async ({ page }) => {
    await page.goto("/owner");
    await expect(page).toHaveURL(/\/owner\/login/);
  });

  test("/shipper без cookie → редирект на /shipper/login", async ({ page }) => {
    await page.goto("/shipper");
    await expect(page).toHaveURL(/\/shipper\/login/);
  });
});
