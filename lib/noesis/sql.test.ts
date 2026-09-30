import { describe, expect, it } from "vitest";
import { assertReadOnly, isUuid, lit } from "./sql";

describe("assertReadOnly", () => {
  it.each([
    "select 1",
    "  SELECT count(*) FROM public.messages",
    "with a as (select 1) select * from a",
    "select 1;",
    "select 'updated_at' as col",
  ])("accepte %s", (sql) => {
    expect(() => assertReadOnly(sql)).not.toThrow();
  });

  it.each([
    "delete from public.messages",
    "update auth.users set email = 'x'",
    "select 1; drop table public.messages",
    "with x as (delete from public.messages returning *) select * from x",
    "insert into a values (1)",
    "select pg_terminate_backend(1)",
    "create table x(id int)",
    "grant all on a to b",
    "copy a to '/tmp/x'",
    "",
  ])("refuse %s", (sql) => {
    expect(() => assertReadOnly(sql)).toThrow(/Requête refusée/);
  });
});

describe("lit", () => {
  it("ts", () => {
    expect(lit.ts(new Date("2026-09-30T12:00:00Z"))).toBe("'2026-09-30T12:00:00.000Z'::timestamptz");
  });
  it("uuid valide / invalide", () => {
    const id = "3f2b8c1e-9a4d-4c6e-8b1f-2a3c4d5e6f70";
    expect(isUuid(id)).toBe(true);
    expect(lit.uuid(id)).toBe(`'${id}'::uuid`);
    expect(() => lit.uuid("x'; drop table a; --")).toThrow();
  });
  it("int", () => {
    expect(lit.int(5)).toBe("5");
    expect(() => lit.int(1.5)).toThrow();
    expect(() => lit.int(Number.NaN)).toThrow();
  });
});
