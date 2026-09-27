/** Adds Cloudinary on-the-fly optimisation (auto format/quality, bounded width). Safe for client use. */
export function optimizedUrl(url: string, width = 800): string {
  if (!url.includes("res.cloudinary.com") || url.includes("/upload/f_auto")) return url;
  return url.replace("/upload/", `/upload/f_auto,q_auto,c_limit,w_${width}/`);
}

export const PLACEHOLDER_IMAGE = "/placeholder.svg";
