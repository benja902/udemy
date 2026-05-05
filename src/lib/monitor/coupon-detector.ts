import * as cheerio from "cheerio";
import type { CouponDetection, CouponSource } from "@/lib/monitor/types";

const DEFAULT_COUPON_REGEX =
  "\\b[A-Z0-9][A-Z0-9_-]{3,30}\\b";

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
  return code.trim().replace(/^["'`]+|["'`.,;:!?]+$/g, "").toUpperCase();
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
      const regex = new RegExp(source.coupon_regex || DEFAULT_COUPON_REGEX, "i");
      const match = selectedText.match(regex);

      if (match?.[0]) {
        return {
          code: normalizeCode(match[0]),
          rawContext: selectedText.slice(0, 500),
        };
      }
    }
  }

  const pageText = $("body").text().replace(/\s+/g, " ");
  const regex = new RegExp(source.coupon_regex || DEFAULT_COUPON_REGEX, "gi");
  const matches = Array.from(pageText.matchAll(regex));

  for (const match of matches) {
    if (!match[0] || match.index === undefined) {
      continue;
    }

    const candidate = normalizeCode(match[0]);
    const context = contextAround(pageText, match.index, match[0].length);

    if (hasUsefulContext(context)) {
      return {
        code: candidate,
        rawContext: context,
      };
    }
  }

  return {
    code: null,
    rawContext: pageText.slice(0, 500),
  };
}
