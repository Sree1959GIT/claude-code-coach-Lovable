/** S5 — Shared heading wrapper for the grouped admin pages. */

import type { ReactNode } from "react";

export function AdminSection(props: { title: string; blurb: string; children: ReactNode }) {
  return (
    <section className="mb-12">
      <h2 className="text-lg font-semibold tracking-tight">{props.title}</h2>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{props.blurb}</p>
      {props.children}
    </section>
  );
}
