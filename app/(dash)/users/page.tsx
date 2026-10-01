import { Tile, Unavailable } from "@/components/bento/tile";
import { UsersTable } from "@/components/users-table";
import { getUsers } from "@/lib/data/users";
import { formatInt } from "@/lib/format";

export default async function UsersPage() {
  const users = await getUsers();
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile tone={users.ok ? "mint" : "muted"} title="Inscrits">
          <div className="text-4xl font-extrabold">{users.ok ? formatInt(users.data.length) : "—"}</div>
        </Tile>
        <Tile tone={users.ok ? "sky" : "muted"} title="Jamais actifs">
          <div className="text-4xl font-extrabold">{users.ok ? formatInt(users.data.filter((u) => !u.lastActivity).length) : "—"}</div>
        </Tile>
      </div>
      {users.ok ? <UsersTable users={users.data} /> : <Tile tone="muted"><Unavailable error={users.error} /></Tile>}
    </div>
  );
}
