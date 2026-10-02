import { redirect } from "next/navigation";

/** Spin & Win lives in a popup on the home page; this address is kept so old links still work. */
export default function SpinPage() {
  redirect("/?spin=1");
}
