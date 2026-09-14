/**
 * Phase F4 — encrypted BYOK vault UI.
 * Keys are sent once, encrypted server-side, and only ever shown as last-4.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  listMyProviderKeys,
  saveProviderKey,
  testProviderKey,
  setProviderKeyActive,
  deleteProviderKey,
  type KeyProvider,
} from "@/lib/byok.functions";

const PROVIDERS: { id: KeyProvider; name: string; hint: string }[] = [
  { id: "anthropic", name: "Anthropic", hint: "sk-ant-…" },
  { id: "google", name: "Google AI", hint: "AIza…" },
];

const label = "font-mono text-[10px] uppercase tracking-widest text-muted-foreground";
const btn =
  "bg-primary px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest text-primary-foreground disabled:opacity-50";
const ghost =
  "border border-border px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest disabled:opacity-50 hover:bg-muted";
const input =
  "w-full border border-border bg-background px-3 py-2 font-mono text-xs outline-none focus:border-primary";

export function ByokPanel() {
  const fetchKeys = useServerFn(listMyProviderKeys);
  const save = useServerFn(saveProviderKey);
  const test = useServerFn(testProviderKey);
  const toggle = useServerFn(setProviderKeyActive);
  const remove = useServerFn(deleteProviderKey);

  const [provider, setProvider] = useState<KeyProvider>("anthropic");
  const [keyValue, setKeyValue] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const keys = useQuery({ queryKey: ["byok-keys"], queryFn: () => fetchKeys({}) });
  const stored = keys.data ?? [];

  async function run(id: string, fn: () => Promise<unknown>) {
    setBusy(id);
    try {
      await fn();
      await keys.refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(null);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    await run("save", async () => {
      await save({ data: { provider, key: keyValue.trim(), label: name.trim() || null } });
      setKeyValue("");
      setName("");
      toast.success("Key stored securely");
    });
  }

  return (
    <div className="mt-4 border border-border bg-background p-5">
      <p className={label}>BYOK_Vault</p>
      <p className="mt-1 font-mono text-[11px] text-muted-foreground">
        Keys are encrypted before they are stored and are never shown again — only the last four
        characters.
      </p>

      <form className="mt-4 grid gap-3 sm:grid-cols-[auto_2fr_1fr_auto]" onSubmit={handleSave}>
        <select
          className={`${input} w-36`}
          value={provider}
          onChange={(e) => setProvider(e.target.value as KeyProvider)}
        >
          {PROVIDERS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <input
          className={input}
          type="password"
          autoComplete="off"
          placeholder={PROVIDERS.find((p) => p.id === provider)?.hint}
          value={keyValue}
          onChange={(e) => setKeyValue(e.target.value)}
          required
        />
        <input
          className={input}
          placeholder="Label (optional)"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button className={btn} disabled={busy !== null}>
          {busy === "save" ? "Saving…" : "Save_Key"}
        </button>
      </form>

      {keys.isLoading && <p className={`${label} mt-4`}>Loading…</p>}
      {!keys.isLoading && stored.length === 0 && (
        <p className="mt-4 font-mono text-[11px] text-muted-foreground">No keys stored yet.</p>
      )}

      {stored.length > 0 && (
        <div className="mt-4 overflow-x-auto border border-border">
          <table className="w-full border-collapse font-mono text-[11px]">
            <thead className="bg-muted/40 text-[10px] uppercase tracking-widest text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Provider</th>
                <th className="px-3 py-2 text-left">Key</th>
                <th className="px-3 py-2 text-left">State</th>
                <th className="px-3 py-2 text-left">Last check</th>
                <th className="px-3 py-2 text-left" />
              </tr>
            </thead>
            <tbody>
              {stored.map((k) => (
                <tr key={k.provider} className="border-t border-border">
                  <td className="px-3 py-2 font-bold">
                    {PROVIDERS.find((p) => p.id === k.provider)?.name ?? k.provider}
                    {k.label && (
                      <span className="ml-2 text-[10px] text-muted-foreground">{k.label}</span>
                    )}
                  </td>
                  <td className="px-3 py-2">••••{k.last4}</td>
                  <td className="px-3 py-2">{k.isActive ? "active" : "paused"}</td>
                  <td className="px-3 py-2">
                    <span className={k.lastVerifyStatus === "ok" ? "" : "text-destructive"}>
                      {k.lastVerifyStatus ?? "—"}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap justify-end gap-2">
                      <button
                        className={ghost}
                        disabled={busy !== null}
                        onClick={() =>
                          run(`test:${k.provider}`, async () => {
                            const r = await test({ data: { provider: k.provider } });
                            r.ok ? toast.success("Key works") : toast.error(`Failed: ${r.status}`);
                          })
                        }
                      >
                        {busy === `test:${k.provider}` ? "…" : "Test"}
                      </button>
                      <button
                        className={ghost}
                        disabled={busy !== null}
                        onClick={() =>
                          run(`toggle:${k.provider}`, () =>
                            toggle({ data: { provider: k.provider, isActive: !k.isActive } }),
                          )
                        }
                      >
                        {k.isActive ? "Pause" : "Resume"}
                      </button>
                      <button
                        className={ghost}
                        disabled={busy !== null}
                        onClick={() =>
                          run(`del:${k.provider}`, () =>
                            remove({ data: { provider: k.provider } }),
                          )
                        }
                      >
                        Remove
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
