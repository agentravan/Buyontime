import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { AddressBook } from "@/components/store/address-book";

export const metadata: Metadata = { title: "Addresses", robots: { index: false } };

export default async function AddressesPage() {
  const user = await requireUser();
  const addresses = await db.address.findMany({ where: { userId: user.id }, orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }] });
  return (
    <div>
      <h1 className="mb-4 text-xl font-extrabold">Saved addresses</h1>
      <AddressBook addresses={addresses.map((a) => ({ id: a.id, name: a.name, phone: a.phone, line1: a.line1, line2: a.line2, landmark: a.landmark, city: a.city, district: a.district, state: a.state, pincode: a.pincode, isDefault: a.isDefault }))} />
    </div>
  );
}
