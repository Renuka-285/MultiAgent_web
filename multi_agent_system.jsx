import { useState, useEffect, useRef, useCallback } from "react";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const AGENT_COLORS = {
  primary: { bg: "#0f172a", accent: "#38bdf8", text: "#e2e8f0" },
  task:    { bg: "#1e1b4b", accent: "#a78bfa", text: "#ede9fe" },
  calendar:{ bg: "#0c2340", accent: "#34d399", text: "#d1fae5" },
  notes:   { bg: "#1c1917", accent: "#fb923c", text: "#fed7aa" },
};

const SYSTEM_PROMPT = `You are a Primary Manager Agent coordinating a multi-agent AI system. You help users manage tasks, schedules, and information.

You have three sub-agents available:
1. **Task Agent** - Manages to-do items, priorities, deadlines
2. **Calendar Agent** - Handles scheduling, events, reminders  
3. **Notes Agent** - Stores and retrieves information, notes, context

When the user sends a request:
1. Analyze what sub-agents are needed
2. Describe which agents you're coordinating and why
3. Show a clear workflow with steps
4. Produce the final structured response

Format your response as JSON:
{
  "analysis": "brief analysis of the request",
  "agents_invoked": ["task"|"calendar"|"notes"],
  "workflow": ["step 1", "step 2", ...],
  "task_result": null or { "items": [{"id":"t1","title":"...","priority":"high|medium|low","due":"...","status":"pending|done"}] },
  "calendar_result": null or { "events": [{"id":"e1","title":"...","date":"...","time":"...","duration":"..."}] },
  "notes_result": null or { "notes": [{"id":"n1","title":"...","content":"...","tags":["..."]}] },
  "final_response": "friendly summary to the user"
}`;

// ─── DATABASE (in-memory) ─────────────────────────────────────────────────────
const DB = {
  tasks: [
    { id: "t1", title: "Review project proposal", priority: "high", due: "2026-04-10", status: "pending" },
    { id: "t2", title: "Send weekly report", priority: "medium", due: "2026-04-09", status: "pending" },
    { id: "t3", title: "Update dependencies", priority: "low", due: "2026-04-15", status: "done" },
  ],
  events: [
    { id: "e1", title: "Team Standup", date: "2026-04-08", time: "09:00", duration: "30 min" },
    { id: "e2", title: "Product Review", date: "2026-04-09", time: "14:00", duration: "1 hour" },
    { id: "e3", title: "1:1 with Manager", date: "2026-04-10", time: "11:00", duration: "45 min" },
  ],
  notes: [
    { id: "n1", title: "Q2 Goals", content: "Focus on shipping v2.0, reduce tech debt, improve test coverage to 80%.", tags: ["goals", "q2"] },
    { id: "n2", title: "Meeting Notes", content: "Discussed roadmap. Priority: auth module first, then analytics dashboard.", tags: ["meeting", "roadmap"] },
  ],
};

// ─── COMPONENTS ───────────────────────────────────────────────────────────────

function AgentPill({ type, active, pulse }) {
  const c = AGENT_COLORS[type];
  const labels = { primary: "Manager", task: "Task Agent", calendar: "Calendar Agent", notes: "Notes Agent" };
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 12px",
      borderRadius: 20, background: c.bg, border: `1px solid ${c.accent}40`,
      fontSize: 11, fontWeight: 600, color: c.accent, letterSpacing: "0.05em",
      opacity: active ? 1 : 0.4, transition: "all 0.3s",
      boxShadow: active ? `0 0 12px ${c.accent}40` : "none",
    }}>
      {pulse && active && (
        <span style={{
          width: 7, height: 7, borderRadius: "50%", background: c.accent,
          animation: "pulse 1s infinite", display: "inline-block"
        }} />
      )}
      {!pulse && <span style={{ width: 7, height: 7, borderRadius: "50%", background: active ? c.accent : "#555" }} />}
      {labels[type]}
    </div>
  );
}

function WorkflowStep({ step, index, done }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0",
      opacity: done ? 1 : 0.4, transition: "opacity 0.4s" }}>
      <div style={{
        width: 22, height: 22, borderRadius: "50%", display: "flex", alignItems: "center",
        justifyContent: "center", fontSize: 10, fontWeight: 700,
        background: done ? "#38bdf8" : "#1e293b", color: done ? "#0f172a" : "#64748b",
        border: `1px solid ${done ? "#38bdf8" : "#334155"}`, flexShrink: 0,
        transition: "all 0.4s"
      }}>{done ? "✓" : index + 1}</div>
      <span style={{ fontSize: 12, color: done ? "#94a3b8" : "#475569" }}>{step}</span>
    </div>
  );
}

function TaskCard({ item }) {
  const pColors = { high: "#ef4444", medium: "#f59e0b", low: "#10b981" };
  return (
    <div style={{ background: "#1e1b4b", border: "1px solid #312e81", borderRadius: 8,
      padding: "10px 14px", marginBottom: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 13, color: "#ede9fe", fontWeight: 500,
          textDecoration: item.status === "done" ? "line-through" : "none", opacity: item.status === "done" ? 0.5 : 1 }}>
          {item.title}
        </span>
        <span style={{ fontSize: 10, fontWeight: 700, color: pColors[item.priority],
          background: pColors[item.priority] + "20", padding: "2px 8px", borderRadius: 10 }}>
          {item.priority}
        </span>
      </div>
      <div style={{ fontSize: 11, color: "#6d6d8a", marginTop: 4 }}>Due: {item.due}</div>
    </div>
  );
}

function EventCard({ item }) {
  return (
    <div style={{ background: "#0c2340", border: "1px solid #1e4070", borderRadius: 8,
      padding: "10px 14px", marginBottom: 6, display: "flex", gap: 12, alignItems: "center" }}>
      <div style={{ background: "#34d39920", borderRadius: 6, padding: "6px 10px", textAlign: "center", minWidth: 44 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: "#34d399", lineHeight: 1 }}>
          {item.date.split("-")[2]}
        </div>
        <div style={{ fontSize: 9, color: "#6ee7b7", textTransform: "uppercase" }}>
          {new Date(item.date).toLocaleString("en", { month: "short" })}
        </div>
      </div>
      <div>
        <div style={{ fontSize: 13, color: "#d1fae5", fontWeight: 500 }}>{item.title}</div>
        <div style={{ fontSize: 11, color: "#6ee7b7" }}>{item.time} · {item.duration}</div>
      </div>
    </div>
  );
}

function NoteCard({ item }) {
  return (
    <div style={{ background: "#1c1917", border: "1px solid #292524", borderRadius: 8,
      padding: "10px 14px", marginBottom: 6 }}>
      <div style={{ fontSize: 13, color: "#fed7aa", fontWeight: 600, marginBottom: 4 }}>{item.title}</div>
      <div style={{ fontSize: 12, color: "#a8a29e", lineHeight: 1.5 }}>{item.content}</div>
      <div style={{ marginTop: 6, display: "flex", gap: 4 }}>
        {item.tags.map(t => (
          <span key={t} style={{ fontSize: 10, color: "#fb923c", background: "#fb923c15",
            padding: "2px 6px", borderRadius: 8 }}>#{t}</span>
        ))}
      </div>
    </div>
  );
}

function AgentPanel({ result, type }) {
  if (!result) return null;
  const c = AGENT_COLORS[type];
  const titles = { task: "📋 Tasks", calendar: "📅 Calendar", notes: "📝 Notes" };

  return (
    <div style={{ background: c.bg, border: `1px solid ${c.accent}30`, borderRadius: 10,
      padding: 14, marginBottom: 10, animation: "fadeIn 0.4s ease" }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: c.accent, marginBottom: 10,
        textTransform: "uppercase", letterSpacing: "0.08em" }}>{titles[type]}</div>
      {type === "task" && result.items?.map(i => <TaskCard key={i.id} item={i} />)}
      {type === "calendar" && result.events?.map(i => <EventCard key={i.id} item={i} />)}
      {type === "notes" && result.notes?.map(i => <NoteCard key={i.id} item={i} />)}
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function MultiAgentSystem() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeAgents, setActiveAgents] = useState([]);
  const [workflowSteps, setWorkflowSteps] = useState([]);
  const [doneSteps, setDoneSteps] = useState(0);
  const [dbState, setDbState] = useState(DB);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  const SUGGESTIONS = [
    "Show me all my tasks and upcoming meetings",
    "Schedule a team sync tomorrow at 3pm",
    "What are my high priority tasks this week?",
    "Add a note about the Q2 roadmap discussion",
    "What's on my calendar for April 9th?",
  ];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const animateWorkflow = useCallback(async (steps) => {
    setWorkflowSteps(steps);
    setDoneSteps(0);
    for (let i = 0; i <= steps.length; i++) {
      await new Promise(r => setTimeout(r, 500));
      setDoneSteps(i);
    }
  }, []);

  const sendMessage = useCallback(async (text) => {
    const userText = text || input.trim();
    if (!userText || loading) return;
    setInput("");
    setLoading(true);
    setActiveAgents(["primary"]);
    setWorkflowSteps([]);
    setDoneSteps(0);

    const userMsg = { role: "user", content: userText };
    setMessages(prev => [...prev, userMsg]);

    // Build context with current DB state
    const contextPrompt = `Current database state:
TASKS: ${JSON.stringify(dbState.tasks)}
EVENTS: ${JSON.stringify(dbState.events)}  
NOTES: ${JSON.stringify(dbState.notes)}

User request: ${userText}`;

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: contextPrompt }],
        }),
      });

      const data = await res.json();
      const raw = data.content?.find(b => b.type === "text")?.text || "{}";
      const clean = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

      let parsed;
      try { parsed = JSON.parse(clean); }
      catch { parsed = { analysis: "Processing...", agents_invoked: [], workflow: [], final_response: raw }; }

      // Activate agents and animate workflow
      const invoked = parsed.agents_invoked || [];
      setActiveAgents(["primary", ...invoked]);
      await animateWorkflow(parsed.workflow || ["Analyzing request", "Coordinating agents", "Generating response"]);

      // Update DB if new data came back
      if (parsed.task_result?.items) {
        setDbState(prev => ({ ...prev, tasks: [...prev.tasks, ...parsed.task_result.items.filter(ni => !prev.tasks.find(t => t.id === ni.id))] }));
      }
      if (parsed.calendar_result?.events) {
        setDbState(prev => ({ ...prev, events: [...prev.events, ...parsed.calendar_result.events.filter(ne => !prev.events.find(e => e.id === ne.id))] }));
      }
      if (parsed.notes_result?.notes) {
        setDbState(prev => ({ ...prev, notes: [...prev.notes, ...parsed.notes_result.notes.filter(nn => !prev.notes.find(n => n.id === nn.id))] }));
      }

      const assistantMsg = {
        role: "assistant",
        parsed,
        agentsUsed: invoked,
      };
      setMessages(prev => [...prev, assistantMsg]);
    } catch (err) {
      setMessages(prev => [...prev, { role: "assistant", error: true, parsed: { final_response: "Error connecting to agents. Please try again." } }]);
    } finally {
      setLoading(false);
      setActiveAgents([]);
      inputRef.current?.focus();
    }
  }, [input, loading, dbState, animateWorkflow]);

  return (
    <div style={{
      minHeight: "100vh", background: "#070b14",
      fontFamily: "'DM Mono', 'Fira Mono', 'Courier New', monospace",
      color: "#e2e8f0", display: "flex", flexDirection: "column",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Syne:wght@700;800&display=swap');
        * { box-sizing: border-box; }
        @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.5;transform:scale(1.3)} }
        @keyframes fadeIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        @keyframes spin { to{transform:rotate(360deg)} }
        @keyframes glow { 0%,100%{box-shadow:0 0 20px #38bdf820} 50%{box-shadow:0 0 40px #38bdf840} }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: #0f172a; }
        ::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 2px; }
        textarea:focus { outline: none; }
        textarea { resize: none; }
      `}</style>

      {/* Header */}
      <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid #1e293b",
        background: "#0a0f1e", position: "sticky", top: 0, zIndex: 10 }}>
        <div style={{ maxWidth: 860, margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
            <div>
              <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 20, fontWeight: 800,
                color: "#38bdf8", letterSpacing: "-0.02em" }}>
                ◈ NEXUS
              </div>
              <div style={{ fontSize: 10, color: "#475569", letterSpacing: "0.15em", textTransform: "uppercase" }}>
                Multi-Agent Coordination System
              </div>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {["primary","task","calendar","notes"].map(a => (
                <AgentPill key={a} type={a} active={loading ? activeAgents.includes(a) : true} pulse={loading} />
              ))}
            </div>
          </div>

          {/* Workflow animation */}
          {loading && workflowSteps.length > 0 && (
            <div style={{ marginTop: 12, padding: "10px 14px", background: "#0f172a",
              borderRadius: 8, border: "1px solid #1e293b", animation: "glow 2s infinite" }}>
              <div style={{ fontSize: 10, color: "#38bdf8", fontWeight: 600, marginBottom: 6,
                textTransform: "uppercase", letterSpacing: "0.1em" }}>⚡ Workflow Executing</div>
              {workflowSteps.map((step, i) => (
                <WorkflowStep key={i} step={step} index={i} done={i < doneSteps} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
        <div style={{ maxWidth: 860, margin: "0 auto" }}>

          {messages.length === 0 && (
            <div style={{ textAlign: "center", padding: "40px 0" }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>◈</div>
              <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 24, fontWeight: 800,
                color: "#1e40af", marginBottom: 8 }}>
                NEXUS is ready
              </div>
              <div style={{ fontSize: 13, color: "#475569", marginBottom: 32 }}>
                Ask me to manage your tasks, calendar, and notes
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 500, margin: "0 auto" }}>
                {SUGGESTIONS.map((s, i) => (
                  <button key={i} onClick={() => sendMessage(s)} style={{
                    background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8,
                    padding: "10px 16px", color: "#94a3b8", fontSize: 12, cursor: "pointer",
                    textAlign: "left", transition: "all 0.2s", fontFamily: "inherit",
                  }}
                  onMouseEnter={e => { e.target.style.borderColor = "#38bdf840"; e.target.style.color = "#cbd5e1"; }}
                  onMouseLeave={e => { e.target.style.borderColor = "#1e293b"; e.target.style.color = "#94a3b8"; }}>
                    → {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, idx) => (
            <div key={idx} style={{ marginBottom: 20, animation: "fadeIn 0.3s ease" }}>
              {msg.role === "user" ? (
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <div style={{ background: "#1e3a5f", border: "1px solid #38bdf830",
                    borderRadius: "12px 12px 2px 12px", padding: "10px 14px",
                    maxWidth: "80%", fontSize: 13, color: "#bae6fd", lineHeight: 1.5 }}>
                    {msg.content}
                  </div>
                </div>
              ) : (
                <div>
                  {/* Agent header */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                    <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#0f172a",
                      border: "1px solid #38bdf8", display: "flex", alignItems: "center",
                      justifyContent: "center", fontSize: 12 }}>◈</div>
                    <div>
                      <div style={{ fontSize: 11, color: "#38bdf8", fontWeight: 600 }}>Primary Manager Agent</div>
                      {msg.agentsUsed?.length > 0 && (
                        <div style={{ fontSize: 10, color: "#475569" }}>
                          Coordinated: {msg.agentsUsed.join(", ")} agent(s)
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Analysis */}
                  {msg.parsed?.analysis && (
                    <div style={{ fontSize: 11, color: "#64748b", background: "#0f172a",
                      border: "1px solid #1e293b", borderRadius: 6, padding: "6px 10px", marginBottom: 10 }}>
                      🔍 {msg.parsed.analysis}
                    </div>
                  )}

                  {/* Sub-agent results */}
                  {msg.parsed?.task_result && <AgentPanel result={msg.parsed.task_result} type="task" />}
                  {msg.parsed?.calendar_result && <AgentPanel result={msg.parsed.calendar_result} type="calendar" />}
                  {msg.parsed?.notes_result && <AgentPanel result={msg.parsed.notes_result} type="notes" />}

                  {/* Final response */}
                  <div style={{ background: "#0f172a", border: "1px solid #1e293b",
                    borderRadius: "2px 12px 12px 12px", padding: "12px 16px",
                    fontSize: 13, color: "#cbd5e1", lineHeight: 1.7 }}>
                    {msg.parsed?.final_response || "Processing complete."}
                  </div>
                </div>
              )}
            </div>
          ))}

          {loading && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, animation: "fadeIn 0.3s ease" }}>
              <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#0f172a",
                border: "1px solid #38bdf8", display: "flex", alignItems: "center",
                justifyContent: "center" }}>
                <div style={{ width: 12, height: 12, border: "2px solid #38bdf8",
                  borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
              </div>
              <div style={{ fontSize: 12, color: "#475569" }}>Agents coordinating…</div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* DB Status Bar */}
      <div style={{ borderTop: "1px solid #1e293b", background: "#0a0f1e",
        padding: "8px 24px", display: "flex", gap: 20 }}>
        <div style={{ maxWidth: 860, margin: "0 auto", width: "100%", display: "flex", gap: 16 }}>
          {[
            { label: "Tasks", count: dbState.tasks.length, color: "#a78bfa" },
            { label: "Events", count: dbState.events.length, color: "#34d399" },
            { label: "Notes", count: dbState.notes.length, color: "#fb923c" },
          ].map(({ label, count, color }) => (
            <div key={label} style={{ fontSize: 10, color: "#475569", display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ color, fontWeight: 700 }}>{count}</span> {label} in DB
            </div>
          ))}
          <div style={{ marginLeft: "auto", fontSize: 10, color: "#1e3a5f" }}>
            in-memory · session storage
          </div>
        </div>
      </div>

      {/* Input */}
      <div style={{ padding: "16px 24px 20px", borderTop: "1px solid #1e293b",
        background: "#0a0f1e", position: "sticky", bottom: 0 }}>
        <div style={{ maxWidth: 860, margin: "0 auto", display: "flex", gap: 10 }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
            placeholder="Send a request to the agent system… (Enter to send)"
            rows={2}
            style={{
              flex: 1, background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8,
              padding: "10px 14px", color: "#e2e8f0", fontSize: 13, lineHeight: 1.5,
              fontFamily: "inherit", transition: "border-color 0.2s",
            }}
            onFocus={e => e.target.style.borderColor = "#38bdf840"}
            onBlur={e => e.target.style.borderColor = "#1e293b"}
            disabled={loading}
          />
          <button
            onClick={() => sendMessage()}
            disabled={loading || !input.trim()}
            style={{
              background: loading || !input.trim() ? "#0f172a" : "#38bdf8",
              border: "1px solid #38bdf830", borderRadius: 8,
              color: loading || !input.trim() ? "#334155" : "#0f172a",
              fontWeight: 700, fontSize: 13, padding: "0 20px",
              cursor: loading || !input.trim() ? "default" : "pointer",
              fontFamily: "'Syne', sans-serif", transition: "all 0.2s", whiteSpace: "nowrap",
            }}>
            {loading ? "…" : "→ Send"}
          </button>
        </div>
      </div>
    </div>
  );
}
