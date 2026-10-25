import { Suspense } from "react";
import { cookies } from "next/headers";
import { COOKIE, isValidSession } from "@/lib/auth";
import Converter from "@/components/Converter";
import LoginForm from "@/components/LoginForm";

async function Gate() {
  const cookieStore = await cookies();
  return isValidSession(cookieStore.get(COOKIE)?.value) ? <Converter /> : <LoginForm />;
}

export default function Home() {
  return (
    <Suspense fallback={null}>
      <Gate />
    </Suspense>
  );
}
