import { chromium } from "playwright";
import { getEnv } from "@/lib/env";
import type { Course, VerificationResult } from "@/lib/monitor/types";

const PRICE_PATTERN =
  /(?:US\$|\$|S\/|€|£|MX\$|COP\$|CLP\$|ARS\$)\s?([0-9]+(?:[.,][0-9]{1,2})?)/i;

function buildCouponUrl(courseUrl: string, couponCode: string) {
  const url = new URL(courseUrl);
  url.searchParams.set("couponCode", couponCode);
  return url.toString();
}

function parsePrice(text: string) {
  const match = text.match(PRICE_PATTERN);
  if (!match?.[1]) {
    return null;
  }

  const value = Number.parseFloat(match[1].replace(",", "."));
  return Number.isFinite(value) ? value : null;
}

function parseCurrency(text: string) {
  const match = text.match(/US\$|\$|S\/|€|£|MX\$|COP\$|CLP\$|ARS\$/i);
  return match?.[0] ?? null;
}

function classifyPage(text: string, finalPrice: number | null) {
  const lower = text.toLowerCase();

  if (
    lower.includes("performing security verification") ||
    lower.includes("security service to protect against malicious bots") ||
    lower.includes("challenges.cloudflare.com") ||
    lower.includes("performance and security by cloudflare")
  ) {
    return "error" as const;
  }

  if (
    finalPrice === 0 ||
    lower.includes("free") ||
    lower.includes("gratis") ||
    lower.includes("inscríbete gratis") ||
    lower.includes("enroll for free")
  ) {
    return "free" as const;
  }

  if (
    lower.includes("expired") ||
    lower.includes("vencido") ||
    lower.includes("invalid coupon") ||
    lower.includes("cupón no válido") ||
    lower.includes("coupon is no longer")
  ) {
    return "expired_coupon" as const;
  }

  if (
    lower.includes("coupon applied") ||
    lower.includes("cupón aplicado") ||
    lower.includes("aplicado")
  ) {
    return "discount" as const;
  }

  if (finalPrice === null) {
    return "error" as const;
  }

  return "paid" as const;
}

export async function verifyUdemyCoupon(
  course: Course,
  couponCode: string,
): Promise<VerificationResult> {
  const env = getEnv();
  const checkedUrl = buildCouponUrl(course.udemy_url, couponCode);
  const browser = await chromium.launch({
    headless: env.PLAYWRIGHT_HEADLESS !== "false",
  });

  try {
    const context = await browser.newContext({
      locale: env.UDEMY_LOCALE,
      viewport: { width: 1366, height: 900 },
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    });

    const page = await context.newPage();
    await page.goto(checkedUrl, {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => undefined);

    const bodyText = await page.locator("body").innerText({ timeout: 10_000 });
    const compactText = bodyText.replace(/\s+/g, " ").trim();
    const finalPrice = parsePrice(compactText);
    const currency = parseCurrency(compactText);
    const status = classifyPage(compactText, finalPrice);
    const securityVerificationMessage =
      status === "error" && compactText.toLowerCase().includes("security verification")
        ? "Udemy mostró verificación de seguridad/Cloudflare al navegador automatizado."
        : undefined;
    const missingPriceMessage =
      status === "error" && !securityVerificationMessage && finalPrice === null
        ? "No se detectó precio, cupón aplicado ni botón de inscripción en la página de Udemy."
        : undefined;

    return {
      status,
      finalPrice,
      currency,
      detectedLabel: compactText.slice(0, 700),
      checkedUrl: page.url(),
      errorMessage: securityVerificationMessage ?? missingPriceMessage,
    };
  } catch (error) {
    return {
      status: "error",
      finalPrice: null,
      currency: null,
      detectedLabel: null,
      checkedUrl,
      errorMessage: error instanceof Error ? error.message : "Error desconocido",
    };
  } finally {
    await browser.close();
  }
}
