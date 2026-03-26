"use server";

import { cookies } from "next/headers";

export const getAuthHeaders = async (): Promise<Record<string, string>> => {
  const token = (await cookies()).get("keystonejs-session")?.value;
  if (token) {
    return { authorization: `Bearer ${token}` };
  }
  return {};
};

export const setAuthToken = async (token: string) => {
  (await cookies()).set("keystonejs-session", token, {
    maxAge: 60 * 60 * 24 * 30,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
};

export const removeAuthToken = async () => {
  (await cookies()).set("keystonejs-session", "", { maxAge: -1 });
};
