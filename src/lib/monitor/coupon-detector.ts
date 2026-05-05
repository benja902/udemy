import * as cheerio from "cheerio";
import { chromium } from "playwright";
import { getEnv } from "@/lib/env";
import type { CouponDetection, CouponSource } from "@/lib/monitor/types";

const DEFAULT_COUPON_REGEX =
  "\\b[A-Z0-9][A-Z0-9_-]{3,30}\\b";

const IGNORED_CODES = new Set([
  "CUPON",
  "CUPÓN",
  "UDEMY",
  "GRATIS",
  "FREE",
  "CURSOS",
  "CURSO",
  "DESCUENTO",
  "DESCUENTOS",
  "OFERTA",
  "OFERTAS",
  "TODOS",
  "PROYECTOS",
  "PUBLICIDAD",
  "CODIGO",
  "CODIGO369",
]);

const CONTEXT_WORDS = [
  "coupon",
  "cupon",
  "cupón",
  "codigo",
  "código",
  "udemy",
  "gratis",
  "free",
  "descuento",
  "promo",
  "oferta",
];

function normalizeCode(code: string) {
  return code
    .trim()
    .replace(/^["'`]+|["'`.,;:!?]+$/g, "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toUpperCase();
}

function isCouponCandidate(code: string) {
  if (code.length < 4 || code.length > 30) {
    return false;
  }

  if (/^\d+[KMB]$/.test(code)) {
    return false;
  }

  if (/^\d{4}$/.test(code)) {
    return false;
  }

  if (IGNORED_CODES.has(code)) {
    return false;
  }

  return /^[A-Z0-9][A-Z0-9_-]+$/.test(code);
}

function findCouponBlockInText(text: string) {
  const inlineBlockMatch = text.match(
    /CUP[OÓ]N\s+([A-Z0-9][A-Z0-9_-]{3,30})\s+EN\s+UDEMY/i,
  );
  const inlineCandidate = inlineBlockMatch?.[1]
    ? normalizeCode(inlineBlockMatch[1])
    : null;

  if (inlineCandidate && isCouponCandidate(inlineCandidate)) {
    return {
      code: inlineCandidate,
      rawContext: inlineBlockMatch?.[0]?.replace(/\s+/g, " ").trim() ?? null,
    };
  }

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (let index = 0; index < lines.length; index += 1) {
    const normalizedLine = normalizeCode(lines[index]);

    if (normalizedLine !== "CUPON") {
      continue;
    }

    const nearbyLines = lines.slice(index + 1, index + 5);
    const candidateLine = nearbyLines.find((line) => {
      const normalized = normalizeCode(line);
      return isCouponCandidate(normalized);
    });

    if (candidateLine) {
      const code = normalizeCode(candidateLine);
      return {
        code,
        rawContext: lines.slice(index, index + 5).join(" "),
      };
    }
  }

  return null;
}

function findCouponInText(text: string, couponRegex: string | null) {
  const blockDetection = findCouponBlockInText(text);

  if (blockDetection) {
    return blockDetection;
  }

  const regex = new RegExp(couponRegex || DEFAULT_COUPON_REGEX, "g");
  const matches = Array.from(text.matchAll(regex));

  for (const match of matches) {
    if (!match[0] || match.index === undefined) {
      continue;
    }

    const candidate = normalizeCode(match[0]);
    const context = contextAround(text, match.index, match[0].length);

    if (isCouponCandidate(candidate) && hasUsefulContext(context)) {
      return {
        code: candidate,
        rawContext: context,
      };
    }
  }

  return null;
}

async function detectRenderedCoupon(source: CouponSource) {
  const env = getEnv();
  const browser = await chromium.launch({
    headless: env.PLAYWRIGHT_HEADLESS !== "false",
  });

  try {
    const page = await browser.newPage({
      locale: env.UDEMY_LOCALE,
      viewport: { width: 1366, height: 900 },
    });

    await page.goto(source.source_url, {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => undefined);

    if (source.coupon_selector) {
      const selectedText = await page
        .locator(source.coupon_selector)
        .first()
        .innerText({ timeout: 5_000 })
        .catch(() => "");
      const selectedDetection = findCouponInText(selectedText, source.coupon_regex);

      if (selectedDetection) {
        return selectedDetection;
      }
    }

    const pageText = await page.locator("body").innerText({ timeout: 10_000 });
    return findCouponInText(pageText, source.coupon_regex);
  } finally {
    await browser.close();
  }
}

function contextAround(text: string, index: number, length: number) {
  const start = Math.max(0, index - 140);
  const end = Math.min(text.length, index + length + 140);
  return text.slice(start, end).replace(/\s+/g, " ").trim();
}

function hasUsefulContext(context: string) {
  const lower = context.toLowerCase();
  return CONTEXT_WORDS.some((word) => lower.includes(word));
}

export async function detectCoupon(source: CouponSource): Promise<CouponDetection> {
  const response = await fetch(source.source_url, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (compatible; UdemyCouponMonitor/1.0; +https://example.local)",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`No se pudo leer la fuente ${source.source_url}: ${response.status}`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);

  if (source.coupon_selector) {
    const selectedText = $(source.coupon_selector).first().text().trim();
    if (selectedText) {
      const selectedDetection = findCouponInText(selectedText, source.coupon_regex);

      if (selectedDetection) {
        return selectedDetection;
      }
    }
  }

  const pageText = $("body").text().replace(/\s+/g, " ");
  const staticDetection = findCouponInText(pageText, source.coupon_regex);

  if (staticDetection) {
    return staticDetection;
  }

  const renderedDetection = await detectRenderedCoupon(source);

  if (renderedDetection) {
    return renderedDetection;
  }

  return {
    code: null,
    rawContext: pageText.slice(0, 500),
  };
}
