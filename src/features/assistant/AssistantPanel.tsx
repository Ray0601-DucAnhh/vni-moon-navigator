/** Assistant panel: BYOK key setup (memory only), chat with the manual tool
 *  loop, a "Data used" drawer per answer, and visible number-guard flags. */

import { useRef, useState } from "react";
import { useApp } from "../../store/appStore";
import { keyStore } from "../../services/ai/keyStore";
import { AssistantError, activeModel, runChatTurn } from "../../services/ai/client";
import { PROVIDERS, getProvider, type ProviderId } from "../../services/ai/providers";
import { runMockTurn } from "../../services/ai/mockProvider";

/** ?mockai=1 switches to the deterministic mock provider (test mode only). */
const mock = typeof location !== "undefined" && new URLSearchParams(location.search).has("mockai");
import type { ToolCallRecord, ToolContext } from "../../services/ai/tools";
import { guardAnswer, type GuardResult } from "./numberGuard";
import type { SiteData } from "../../services/data/useSiteData";
import type { RegionEntry, SourceRecord } from "../../types";

interface ChatMsg {
  role: "user" | "assistant";
  text: string;
  guard?: GuardResult;
  toolCalls?: ToolCallRecord[];
  error?: string;
}

const SUGGESTIONS = [
  "Explain the selected site right now",
  "Compare IM-2 and Apollo 17 over the next 30 days",
  "When is the next sunset at IM-2?",
  "Can IM-2 talk to Earth right now?",
];

export function AssistantPanel({
  data,
  regions,
  sources,
}: {
  data: SiteData;
  regions: RegionEntry[];
  sources: SourceRecord[];
}) {
  const setPanel = useApp((s) => s.setPanel);
  const [hasKeyState, setHasKey] = useState(keyStore.has());
  const hasKey = mock || hasKeyState;
  const [keyNotice, setKeyNotice] = useState<string | null>(null);
  const [providerId, setProviderId] = useState<ProviderId>(keyStore.provider());
  const [modelInput, setModelInput] = useState<string>("");
  const prov = getProvider(providerId);
  const useKey = () => {
    keyStore.set(keyRef.current?.value ?? "", providerId, prov.modelEditable ? modelInput : null);
    if (keyRef.current) keyRef.current.value = "";
    setKeyNotice(null);
    setHasKey(keyStore.has());
  };
  const [busy, setBusy] = useState(false);
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const keyRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    const history = [...msgs.filter((m) => !m.error), { role: "user" as const, text: q }];
    setMsgs((m) => [...m, { role: "user", text: q }]);
    setBusy(true);
    try {
      const st = useApp.getState();
      const ctx: ToolContext = {
        sites: data.sites,
        regions,
        sources,
        loaded: data.loaded,
        selectedSiteId: st.selectedSiteId ?? "im2",
        utcMs: st.utcMs,
        ensure: data.ensure,
        compareIds: st.compareIds,
      };
      const r = await (mock ? runMockTurn : runChatTurn)(
        history.map((m) => ({ role: m.role, text: m.text })),
        ctx,
      );
      const guard = guardAnswer(r.text, r.toolCalls.map((t) => t.output), q);
      setMsgs((m) => [...m, { role: "assistant", text: r.text, guard, toolCalls: r.toolCalls }]);
    } catch (e) {
      const err = e as AssistantError;
      setMsgs((m) => [...m, { role: "assistant", text: "", error: err.message }]);
      if (err.kind === "auth") {
        keyStore.forget();
        setKeyNotice(err.message + " The key was removed from this tab's memory.");
        setHasKey(false);
      }
    } finally {
      setBusy(false);
      requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: 1e6 }));
    }
  };

  return (
    <aside className="right-panel" aria-label="Assistant">
      <header>
        <div style={{ flex: 1 }}>
          <h2>Assistant</h2>
          <span className="note" style={{ margin: 0 }}>
            Explains this app's computed data only &#183; {mock ? "MOCK provider (test mode)" : hasKey ? `${getProvider(keyStore.provider()).label} · ${activeModel()}` : "bring your own key"}
          </span>
        </div>
        {hasKey && (
          <button
            className="btn sm"
            onClick={() => {
              keyStore.forget();
              setHasKey(false);
            }}
            title="Remove the key from this tab's memory"
          >
            Forget key
          </button>
        )}
        <button className="close-x" aria-label="Close panel" onClick={() => setPanel("none")}>&#10005;</button>
      </header>

      {!hasKey ? (
        <div className="panel-body">
          {keyNotice && (
            <p className="note" role="alert" style={{ color: "var(--danger)", marginTop: 0 }}>{keyNotice}</p>
          )}
          <p className="note" style={{ marginTop: 0 }}>
            The assistant uses <strong>your own API key</strong> from the AI provider you choose, sent
            directly from this browser tab to that provider (<span className="mono">{prov.host}</span>).
          </p>
          <label className="note" htmlFor="aiprovider">AI provider</label>
          <select
            id="aiprovider"
            className="keyfield"
            value={providerId}
            onChange={(e) => {
              setProviderId(e.target.value as ProviderId);
              setModelInput("");
            }}
          >
            {PROVIDERS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label} - {p.cost.split(" (")[0]}
              </option>
            ))}
          </select>
          <p className="note" style={{ margin: "6px 0 10px" }}>
            {prov.cost}. Get a key:{" "}
            <a href={prov.keyUrl} target="_blank" rel="noreferrer noopener">{prov.keyUrl.replace("https://", "")}</a>
            {prov.note && <><br />{prov.note}</>}
          </p>
          {prov.modelEditable && (
            <>
              <label className="note" htmlFor="aimodel">
                Model (must support tool calling)
                {prov.modelsUrl && (
                  <>
                    {" - "}
                    <a href={prov.modelsUrl} target="_blank" rel="noreferrer noopener">list</a>
                  </>
                )}
              </label>
              <input
                id="aimodel"
                className="keyfield"
                type="text"
                value={modelInput}
                placeholder={prov.defaultModel}
                autoComplete="off"
                spellCheck={false}
                onChange={(e) => setModelInput(e.target.value)}
                style={{ marginBottom: 10 }}
              />
            </>
          )}
          <ul style={{ paddingLeft: 18, margin: "6px 0" }}>
            <li className="note">Held in this tab's memory only - never saved to disk, cookies, storage or any VNI server.</li>
            <li className="note">Cleared when you reload or close the tab, or press "Forget key".</li>
            <li className="note">Anyone with access to this browser session could read it - use a key you can revoke. Usage is billed or rate-limited by the provider, not by VNI.</li>
          </ul>
          <label className="note" htmlFor="apikey">{prov.label} API key</label>
          <input
            id="apikey"
            ref={keyRef}
            className="keyfield"
            type="password"
            placeholder={prov.keyPlaceholder}
            autoComplete="off"
            onKeyDown={(e) => {
              if (e.key === "Enter") useKey();
            }}
          />
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button className="btn primary" onClick={useKey}>
              Use key (this tab only)
            </button>
          </div>
          <p className="note" style={{ marginTop: 14 }}>
            The rest of the app works fully without any key - the assistant is an optional layer that
            explains the same computed results.
          </p>
        </div>
      ) : (
        <>
          <div className="panel-body" ref={scrollRef}>
            {mock && (
              <p className="note caution" role="status" style={{ marginTop: 0 }}>
                TEST MODE - mock provider, not a real AI. Answers are templated from the same app tools to
                verify the interface; the real-provider test is pending a user-entered key.
              </p>
            )}
            {msgs.length === 0 && (
              <>
                <p className="note" style={{ marginTop: 0 }}>
                  Ask about any of the 14 analysed sites. Every number is checked against the app's
                  computed data; anything unverified is <mark>flagged</mark>.
                </p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {SUGGESTIONS.map((s) => (
                    <button key={s} className="btn sm" onClick={() => send(s)}>{s}</button>
                  ))}
                </div>
              </>
            )}
            <div className="chat-msgs">
              {msgs.map((m, i) => (
                <div key={i} className={`msg ${m.role}`}>
                  {m.error ? (
                    <span style={{ color: "var(--danger)" }}>{m.error}</span>
                  ) : m.guard ? (
                    <>
                      <span>
                        {m.guard.segments.map((s, j) =>
                          s.flagged ? (
                            <mark key={j} title="Not found in this turn's tool data - treat with caution">{s.text}</mark>
                          ) : (
                            <span key={j}>{s.text}</span>
                          ),
                        )}
                      </span>
                      <div className="tool-trace" style={{ marginTop: 6 }}>
                        {m.guard.flaggedCount > 0
                          ? `⚠ ${m.guard.flaggedCount} of ${m.guard.totalNumbers} numbers not matched to app data`
                          : m.guard.totalNumbers > 0
                            ? `✓ all ${m.guard.totalNumbers} numbers match app data`
                            : null}
                      </div>
                      {m.toolCalls && m.toolCalls.length > 0 && (
                        <details className="data-used">
                          <summary className="tool-trace" style={{ cursor: "pointer" }}>
                            Data used: {m.toolCalls.map((t) => t.name).join(", ")}
                          </summary>
                          <pre>{JSON.stringify(m.toolCalls, null, 1)}</pre>
                        </details>
                      )}
                    </>
                  ) : (
                    m.text
                  )}
                </div>
              ))}
              {busy && <div className="msg assistant" aria-live="polite">Thinking&#8230; (calling app data tools)</div>}
            </div>
          </div>
          <div className="chat-input">
            <textarea
              ref={inputRef}
              placeholder="Ask about any of the 14 sites..."
              aria-label="Message the assistant"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  const v = inputRef.current?.value ?? "";
                  if (inputRef.current) inputRef.current.value = "";
                  void send(v);
                }
              }}
            />
            <button
              className="btn primary"
              disabled={busy}
              onClick={() => {
                const v = inputRef.current?.value ?? "";
                if (inputRef.current) inputRef.current.value = "";
                void send(v);
              }}
            >
              Send
            </button>
          </div>
        </>
      )}
    </aside>
  );
}
