import Link from "next/link";
import { listItemViews } from "@/lib/items/store";
import { listProjects } from "@/lib/projects/store";
import { listSharedItems } from "@/lib/shared/store";

export const dynamic = "force-dynamic";

export default async function SharedPage() {
  const [shared, projects] = await Promise.all([listSharedItems(), listProjects()]);

  // Map each shared item to the projects that reference it.
  const refs = new Map<string, { id: string; name: string }[]>();
  for (const p of projects) {
    for (const item of await listItemViews(p.id)) {
      if (!item.sharedRef) continue;
      const sid = item.sharedRef.replace(/^shared\//, "");
      const arr = refs.get(sid) ?? [];
      if (!arr.some((x) => x.id === p.id)) arr.push({ id: p.id, name: p.name });
      refs.set(sid, arr);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-kicker">Shared</div>
          <h1 className="page-title">Shared items</h1>
          <p className="page-desc">
            One canonical card referenced by several projects. Create these from a card&apos;s
            editor via <b>Make shared</b> to refactor duplicated work into one place.
          </p>
        </div>
      </div>

      {shared.length === 0 ? (
        <div className="empty">No shared items yet.</div>
      ) : (
        <div className="grid-cards">
          {shared.map((item) => {
            const using = refs.get(item.id) ?? [];
            return (
              <div key={item.id} className="panel" style={{ padding: 18 }}>
                <div className="card-meta" style={{ marginTop: 0, marginBottom: 8 }}>
                  <span className="chip chip-shared">⊞ shared</span>
                  <span className="chip">{item.category}</span>
                </div>
                <h3 style={{ fontSize: 17 }}>{item.title}</h3>
                {item.description && <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>{item.description}</p>}
                <div style={{ marginTop: 12 }}>
                  <span className="field-label">Referenced by</span>
                  {using.length === 0 ? (
                    <span className="muted" style={{ fontSize: 13 }}>No projects yet</span>
                  ) : (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {using.map((p) => (
                        <Link key={p.id} href={`/projects/${p.id}`} className="chip">{p.name}</Link>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
