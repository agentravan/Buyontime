import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ProfileForm } from "@/components/store/profile-form";

export const metadata: Metadata = { title: "Profile", robots: { index: false } };

export default async function ProfilePage() {
  const user = await requireUser();
  const full = await db.user.findUniqueOrThrow({ where: { id: user.id } });
  return (
    <div>
      <h1 className="mb-4 text-xl font-extrabold">Profile & security</h1>
      <ProfileForm
        profile={{
          name: full.name, email: full.email, phone: full.phone ?? "",
          dateOfBirth: full.dateOfBirth ? full.dateOfBirth.toISOString().slice(0, 10) : "",
          gender: full.gender ?? "", emailOptIn: full.emailOptIn, smsOptIn: full.smsOptIn, whatsappOptIn: full.whatsappOptIn,
        }}
      />
    </div>
  );
}
