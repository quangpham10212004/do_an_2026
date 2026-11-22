"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { homePathFor, useAuth } from "@/lib/auth";
import Landing from "@/components/landing/Landing";

export default function Home() {
  const { ready, user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (ready && user) router.replace(homePathFor(user.role));
  }, [ready, user, router]);

  return <Landing />;
}
