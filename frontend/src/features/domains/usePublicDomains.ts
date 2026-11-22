"use client";

import { useEffect, useState } from "react";
import type { MentorDomain, Uuid } from "@/types";
import { domainsApi } from "./api";

/** Lĩnh vực đã xác thực của một mentor (công khai). `undefined` = đang tải; lỗi thì trả mảng rỗng để hồ sơ vẫn hiển thị. */
export function usePublicMentorDomains(mentorId: Uuid, fallbackDomain?: string, self?: boolean): MentorDomain[] | undefined {
  const [list, setList] = useState<MentorDomain[] | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    domainsApi.publicList(mentorId, { fallbackDomain, self }).then((r) => alive && setList(r.domains)).catch(() => alive && setList([]));
    return () => { alive = false; };
  }, [mentorId, fallbackDomain, self]);
  return list;
}
