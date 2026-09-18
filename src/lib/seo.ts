export const SITE_NAME = "Claude Architect Prep";
export const SITE_ORIGIN = "https://code-architect-coach.lovable.app";
export const DEFAULT_SHARE_IMAGE = `${SITE_ORIGIN}/og-card.jpg`;

type JsonLd = Record<string, unknown>;

type SeoInput = {
  title: string;
  description: string;
  path: string;
  type?: "website" | "article";
  noIndex?: boolean;
  image?: string | false;
  schema?: JsonLd | JsonLd[];
};

function normalizePath(path: string) {
  if (path === "/") return path;
  const withoutQuery = path.split("?")[0];
  return `/${withoutQuery.replace(/^\/+|\/+$/g, "")}`;
}

export function absoluteUrl(path: string) {
  return `${SITE_ORIGIN}${normalizePath(path)}`;
}

export function createSeo({
  title,
  description,
  path,
  type = "website",
  noIndex = false,
  image = false,
  schema,
}: SeoInput) {
  const url = absoluteUrl(path);
  const meta: Record<string, string>[] = [
    { title },
    { name: "description", content: description },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:type", content: type },
    { property: "og:url", content: url },
    { name: "twitter:card", content: image ? "summary_large_image" : "summary" },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
  ];

  if (noIndex) meta.push({ name: "robots", content: "noindex, nofollow" });
  if (image) {
    meta.push(
      { property: "og:image", content: image },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { property: "og:image:alt", content: "Claude Architect Prep learning dashboard" },
      { name: "twitter:image", content: image },
      { name: "twitter:image:alt", content: "Claude Architect Prep learning dashboard" },
    );
  }

  const schemas = schema ? (Array.isArray(schema) ? schema : [schema]) : [];
  return {
    meta,
    links: [{ rel: "canonical", href: url }],
    scripts: schemas.map((entry) => ({
      type: "application/ld+json",
      children: JSON.stringify(entry),
    })),
  };
}

export function titleCaseSlug(slug: string) {
  return slug
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}