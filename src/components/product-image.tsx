import Image from "next/image";
import { optimizedUrl, PLACEHOLDER_IMAGE } from "@/lib/images";
import { cn } from "@/lib/utils";

/** next/image wrapper: optimises remote Cloudinary images, serves local SVG/seed assets unoptimised. */
export function ProductImage({
  src, alt, className, sizes = "(max-width: 640px) 50vw, 25vw", priority, fill = true, width, height,
}: { src: string | null | undefined; alt: string; className?: string; sizes?: string; priority?: boolean; fill?: boolean; width?: number; height?: number }) {
  const url = src ? optimizedUrl(src) : PLACEHOLDER_IMAGE;
  const unoptimized = url.endsWith(".svg") || url.startsWith("/uploads/");
  if (!fill) {
    return <Image src={url} alt={alt} width={width ?? 80} height={height ?? 80} className={cn("object-cover", className)} unoptimized={unoptimized} />;
  }
  return <Image src={url} alt={alt} fill sizes={sizes} priority={priority} className={cn("object-cover", className)} unoptimized={unoptimized} />;
}
