import "server-only";
import { demo } from "@/lib/demo";
import { isDemo } from "@/lib/env";
import { runNoesisSql } from "@/lib/noesis/client";
import { mapUserDetail, mapUsers, userDetailSql, usersListSql, type UserDetail, type UserRow } from "@/lib/noesis/queries";
import { isUuid } from "@/lib/noesis/sql";
import { settle, type Result } from "@/lib/result";
import { memo } from "./memo";

export async function getUsers(): Promise<Result<UserRow[]>> {
  if (isDemo()) return { ok: true, data: demo.users() };
  return settle(memo("users", 60_000, async () => mapUsers(await runNoesisSql(usersListSql()))));
}

export async function getUserDetail(id: string): Promise<Result<UserDetail | null>> {
  if (isDemo()) return { ok: true, data: demo.userDetail(id) };
  if (!isUuid(id)) return { ok: true, data: null };
  return settle(memo(`user:${id}`, 60_000, async () => mapUserDetail(await runNoesisSql(userDetailSql(id)))));
}
