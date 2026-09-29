import type { AuthLook } from "@/components/motion/auth-shell";

/** Customer auth pages use the look chosen in settings; `?look=teal|gold` previews the other one. */
export function resolveLook(param: string | undefined, setting: string): AuthLook {
  if (param === "teal" || param === "gold") return param;
  return setting === "gold" ? "gold" : "teal";
}
