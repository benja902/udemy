import type { Course, VerificationResult } from "@/lib/monitor/types";

type Codigo369Course = {
  titulo?: string;
  precio_udemy?: string;
  etiquetas?: string;
  url?: string;
  cupon?: string;
  fechacaduca?: string;
};

const CODIGO369_URL = "https://codigo369.com/";
const CODIGO369_SUPABASE_URL = "https://whwourhkfiihlrdgaxhn.supabase.co";

function getUdemySlug(courseUrl: string) {
  const url = new URL(courseUrl);
  const parts = url.pathname.split("/").filter(Boolean);
  const courseIndex = parts.indexOf("course");
  return courseIndex >= 0 ? parts[courseIndex + 1] : parts.at(-1);
}

function getCourseUrlWithCoupon(courseUrl: string, couponCode: string) {
  const url = new URL(courseUrl);
  url.searchParams.set("couponCode", couponCode);
  return url.toString();
}

function parseSourcePrice(priceText: string | undefined) {
  if (!priceText) {
    return {
      finalPrice: null,
      currency: null,
    };
  }

  const match = priceText.match(/(US\$|\$|S\/|€|£)\s?([0-9]+(?:[.,][0-9]{1,2})?)/i);

  if (!match?.[2]) {
    return {
      finalPrice: null,
      currency: null,
    };
  }

  return {
    finalPrice: Number.parseFloat(match[2].replace(",", ".")),
    currency: match[1],
  };
}

function parseExpirationDate(expirationText: string | undefined) {
  if (!expirationText || expirationText === "-") {
    return null;
  }

  const numericMatch = expirationText.match(
    /(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/,
  );

  if (numericMatch) {
    const [, day, month, year, hour = "23", minute = "59"] = numericMatch;
    return new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
    );
  }

  const spanishMonths: Record<string, number> = {
    enero: 0,
    febrero: 1,
    marzo: 2,
    abril: 3,
    mayo: 4,
    junio: 5,
    julio: 6,
    agosto: 7,
    septiembre: 8,
    setiembre: 8,
    octubre: 9,
    noviembre: 10,
    diciembre: 11,
  };

  const textMatch = expirationText
    .toLowerCase()
    .match(/(\d{1,2})\s+de\s+([a-záéíóú]+)\s+(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);

  if (!textMatch) {
    return null;
  }

  const [, day, monthName, year, hour = "23", minute = "59"] = textMatch;
  const month = spanishMonths[monthName.normalize("NFD").replace(/\p{Diacritic}/gu, "")];

  if (month === undefined) {
    return null;
  }

  return new Date(Number(year), month, Number(day), Number(hour), Number(minute));
}

async function getCodigo369AnonKey() {
  const html = await fetch(CODIGO369_URL, { cache: "no-store" }).then((response) =>
    response.text(),
  );
  const scriptPath = html.match(/<script[^>]+src="([^"]*assets\/index-[^"]+\.js)"/)?.[1];

  if (!scriptPath) {
    throw new Error("No se encontró el bundle de codigo369.com.");
  }

  const scriptUrl = new URL(scriptPath, CODIGO369_URL).toString();
  const js = await fetch(scriptUrl, { cache: "no-store" }).then((response) => response.text());
  const token = js.match(/eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/)?.[0];

  if (!token) {
    throw new Error("No se encontró la anon key pública de codigo369.com.");
  }

  return token;
}

export async function verifyCourseFromSource(params: {
  sourceUrl: string;
  course: Course;
  couponCode: string;
}): Promise<VerificationResult | null> {
  const { sourceUrl, course, couponCode } = params;
  const host = new URL(sourceUrl).hostname.replace(/^www\./, "");

  if (host !== "codigo369.com") {
    return null;
  }

  const slug = getUdemySlug(course.udemy_url);

  if (!slug) {
    return null;
  }

  const token = await getCodigo369AnonKey();
  const endpoint = new URL("/rest/v1/cursos", CODIGO369_SUPABASE_URL);
  endpoint.searchParams.set("select", "*");
  endpoint.searchParams.set("url", `ilike.%${slug}%`);

  const response = await fetch(endpoint, {
    headers: {
      apikey: token,
      authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`codigo369.com respondió ${response.status} al buscar el curso.`);
  }

  const courses = (await response.json()) as Codigo369Course[];
  const sourceCourse = courses[0];

  if (!sourceCourse) {
    return null;
  }

  const sourceCoupon = sourceCourse.cupon?.trim().toUpperCase();
  const couponMatches = sourceCoupon === couponCode.toUpperCase();
  const priceText = sourceCourse.precio_udemy ?? "";
  const etiquetas = sourceCourse.etiquetas ?? "";
  const expiresAt = parseExpirationDate(sourceCourse.fechacaduca);
  const isExpired = expiresAt ? expiresAt.getTime() < Date.now() : false;
  const isFree =
    !isExpired &&
    couponMatches &&
    (priceText.toUpperCase().includes("GRATIS") || etiquetas.toLowerCase().includes("#gratis"));
  const { finalPrice, currency } = parseSourcePrice(priceText);

  return {
    status: isExpired ? "expired_coupon" : isFree ? "free" : couponMatches ? "discount" : "paid",
    finalPrice: isFree ? 0 : finalPrice,
    currency: isFree ? null : currency,
    detectedLabel: [
      sourceCourse.titulo?.trim(),
      priceText,
      sourceCourse.fechacaduca,
      `Cupón fuente: ${sourceCourse.cupon ?? "-"}`,
    ]
      .filter(Boolean)
      .join(" | "),
    checkedUrl: getCourseUrlWithCoupon(course.udemy_url, couponCode),
  };
}
