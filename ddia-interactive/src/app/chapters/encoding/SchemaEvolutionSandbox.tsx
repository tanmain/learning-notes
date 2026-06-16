"use client";

import { useMemo, useReducer } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Button, SegmentedControl, Stat } from "@/components/chapter";
import { IconCheck, IconX, IconReset, IconStep } from "@/components/icons";

/**
 * Schema-evolution sandbox — a driveable byte-stream decoder.
 *
 * The user evolves the WRITER's schema (add / remove / rename / retype a field).
 * The writer then EMITS AN ACTUAL BYTE STREAM the way a tag-based binary format
 * (Thrift CompactProtocol / Protocol Buffers) does: each field is a 1-byte
 * header that packs (tag | wire-type) followed by a payload, terminated by a
 * STOP byte. The user picks which reader consumes those bytes:
 *
 *   • old reader (v1)  — only knows the original tags 1–3  → FORWARD compat
 *   • new reader (v2)   — knows exactly the writer's current schema → BACKWARD compat
 *
 * …then STEPS THROUGH the decode one byte at a time. For every header byte the
 * reader looks up the tag in its own schema and the cursor reports the outcome:
 *   decode   — tag known & type matches → value read
 *   skip     — tag unknown to reader    → bytes skipped (the forward-compat trick)
 *   default  — reader expects a tag the stream never carried (optional) → default
 *   missing  — reader REQUIRES a tag the stream lacks → decode FAILS
 *   clash    — tag present but the wire-type disagrees → value misread → FAILS
 *
 * This makes the abstract "forward/backward compatibility" rules concrete: you
 * watch the exact bytes, and watch a reader either cope or break on them.
 */

/* --------------------------------------------------------------- model */

type WireType = "varint" | "len" | "bool";
type FieldType = "int" | "string" | "bool";
type Field = { tag: number; name: string; type: FieldType; required: boolean; value: string };

const WIRE: Record<FieldType, WireType> = { int: "varint", string: "len", bool: "bool" };
const WIRE_LABEL: Record<WireType, string> = { varint: "varint", len: "len-prefix", bool: "bool" };
const TYPE_HUE: Record<FieldType, string> = {
  int: "var(--accent)",
  string: "var(--accent-2)",
  bool: "var(--color-info)",
};

const SEED: Field[] = [
  { tag: 1, name: "userId", type: "int", required: true, value: "1337" },
  { tag: 2, name: "userName", type: "string", required: true, value: "ada" },
  { tag: 3, name: "active", type: "bool", required: false, value: "true" },
];

// The "old" reader (v1) — frozen at the original 3-field contract. The writer's
// current schema *is* the "new" reader (v2), so backward compat reads against it.
const OLD_READER: Field[] = SEED.map((f) => ({ ...f }));

function clone(fs: Field[]): Field[] {
  return fs.map((f) => ({ ...f }));
}

/* ----------------------------------------------------- byte encoding */

type ByteKind = "header" | "payload" | "stop";
type ByteCell = {
  hex: string;
  kind: ByteKind;
  tag?: number; // field this byte belongs to (header + payload)
  hue: string;
  note: string; // tooltip / cursor caption
};

const utf8Len = (s: string) => new TextEncoder().encode(s).length;
const hex = (n: number) => (n & 0xff).toString(16).padStart(2, "0");

/** Encode the writer's record into Thrift-CompactProtocol-style bytes. */
function encode(writer: Field[]): ByteCell[] {
  const bytes: ByteCell[] = [];
  // CompactProtocol packs (tag-delta << 4 | type-id) into one header byte.
  const typeId: Record<WireType, number> = { bool: 1, varint: 5, len: 8 };
  let prevTag = 0;
  for (const f of writer) {
    const delta = f.tag - prevTag;
    prevTag = f.tag;
    const wt = WIRE[f.type];
    const header = ((delta & 0x0f) << 4) | typeId[wt];
    bytes.push({
      hex: hex(header),
      kind: "header",
      tag: f.tag,
      hue: TYPE_HUE[f.type],
      note: `header · tag ${f.tag} (Δ${delta}) · ${WIRE_LABEL[wt]}`,
    });
    if (wt === "bool") {
      // bool value folds into the header in CompactProtocol — no payload byte.
      continue;
    }
    if (wt === "varint") {
      const n = Math.max(0, Math.abs(parseInt(f.value || "0", 10) || 0));
      // zig-zag then LEB128 — emit the real continuation bytes.
      let v = n < 0 ? -2 * n - 1 : 2 * n;
      do {
        const b = v & 0x7f;
        v = Math.floor(v / 128);
        bytes.push({
          hex: hex(v > 0 ? b | 0x80 : b),
          kind: "payload",
          tag: f.tag,
          hue: TYPE_HUE[f.type],
          note: `payload · ${f.name} = ${n}`,
        });
      } while (v > 0);
    } else {
      // length-prefixed UTF-8 string: 1 length byte + the bytes themselves.
      const len = utf8Len(f.value);
      bytes.push({ hex: hex(len), kind: "payload", tag: f.tag, hue: TYPE_HUE[f.type], note: `len = ${len}` });
      for (const code of new TextEncoder().encode(f.value)) {
        bytes.push({
          hex: hex(code),
          kind: "payload",
          tag: f.tag,
          hue: TYPE_HUE[f.type],
          note: `payload · "${f.value}"`,
        });
      }
    }
  }
  bytes.push({ hex: "00", kind: "stop", hue: "var(--color-fg-faint)", note: "STOP — end of record" });
  return bytes;
}

/* ------------------------------------------------------ decode trace */

type StepStatus = "decode" | "skip" | "default" | "missing" | "clash" | "stop";
type DecodeStep = {
  status: StepStatus;
  tag?: number;
  byteRange: [number, number]; // inclusive indices into the byte array consumed by this step
  text: string;
};

const STATUS_TONE: Record<StepStatus, string> = {
  decode: "var(--color-ok)",
  skip: "var(--color-fg-faint)",
  default: "var(--color-warn)",
  missing: "var(--color-fault)",
  clash: "var(--color-fault)",
  stop: "var(--color-fg-faint)",
};

/**
 * Produce the ordered list of decode steps a `reader` performs over `writer`'s
 * byte stream — the heart of forward/backward compatibility.
 */
function trace(writer: Field[], reader: Field[]): { steps: DecodeStep[]; ok: boolean; reason: string } {
  const readerByTag = new Map(reader.map((f) => [f.tag, f] as const));
  const bytes = encode(writer);
  const steps: DecodeStep[] = [];
  let ok = true;
  let firstProblem = "";

  // Walk the field stream in writer order; map byte indices to each field.
  let i = 0;
  for (const wf of writer) {
    const start = i;
    // header byte
    i++;
    // consume payload bytes that share this tag
    while (i < bytes.length && bytes[i].kind === "payload" && bytes[i].tag === wf.tag) i++;
    const end = i - 1;

    const rf = readerByTag.get(wf.tag);
    if (!rf) {
      steps.push({
        status: "skip",
        tag: wf.tag,
        byteRange: [start, end],
        text: `tag ${wf.tag} unknown to reader → skip ${end - start + 1} byte(s)`,
      });
    } else if (rf.type !== wf.type) {
      ok = false;
      const why = `tag ${wf.tag} wire-type clash (${WIRE_LABEL[WIRE[wf.type]]} → reader wants ${WIRE_LABEL[WIRE[rf.type]]})`;
      if (!firstProblem) firstProblem = why;
      steps.push({ status: "clash", tag: wf.tag, byteRange: [start, end], text: `${why} → value misread` });
    } else {
      steps.push({
        status: "decode",
        tag: wf.tag,
        byteRange: [start, end],
        text: `tag ${wf.tag} → decode ${rf.name}`,
      });
    }
  }

  // After the stream: fields the reader expected but the writer never sent.
  const writerTags = new Set(writer.map((f) => f.tag));
  const stopIdx = bytes.length - 1;
  for (const rf of reader) {
    if (writerTags.has(rf.tag)) continue;
    if (rf.required) {
      ok = false;
      const why = `reader REQUIRES tag ${rf.tag} (${rf.name}) but the stream never carried it`;
      if (!firstProblem) firstProblem = why;
      steps.push({ status: "missing", tag: rf.tag, byteRange: [stopIdx, stopIdx], text: `${why} → decode FAILS` });
    } else {
      steps.push({
        status: "default",
        tag: rf.tag,
        byteRange: [stopIdx, stopIdx],
        text: `tag ${rf.tag} (${rf.name}) absent → fill default`,
      });
    }
  }

  steps.push({ status: "stop", byteRange: [stopIdx, stopIdx], text: "STOP — record complete" });

  return { ok, steps, reason: ok ? "every required field resolves by tag" : firstProblem };
}

/* ----------------------------------------------------------- reducer */

type ReaderChoice = "old" | "new";

type State = {
  writer: Field[];
  readerChoice: ReaderChoice;
  cursor: number; // how many decode steps have been run
};

type Action =
  | { type: "add" }
  | { type: "remove"; tag: number }
  | { type: "rename"; tag: number; name: string }
  | { type: "retype"; tag: number; t: FieldType }
  | { type: "required"; tag: number }
  | { type: "value"; tag: number; v: string }
  | { type: "reader"; choice: ReaderChoice }
  | { type: "step" }
  | { type: "rewind" }
  | { type: "reset" };

function reducer(state: State, action: Action): State {
  // Any schema edit invalidates an in-progress decode → rewind the cursor.
  const edited = (writer: Field[]): State => ({ ...state, writer, cursor: 0 });
  switch (action.type) {
    case "add": {
      const tag = (state.writer.length ? Math.max(...state.writer.map((f) => f.tag)) : 0) + 1;
      return edited([
        ...state.writer,
        { tag, name: `field${tag}`, type: "string", required: false, value: "new" },
      ]);
    }
    case "remove":
      return edited(state.writer.filter((f) => f.tag !== action.tag));
    case "rename":
      return edited(state.writer.map((f) => (f.tag === action.tag ? { ...f, name: action.name } : f)));
    case "retype":
      return edited(state.writer.map((f) => (f.tag === action.tag ? { ...f, type: action.t } : f)));
    case "required":
      return edited(state.writer.map((f) => (f.tag === action.tag ? { ...f, required: !f.required } : f)));
    case "value":
      return edited(state.writer.map((f) => (f.tag === action.tag ? { ...f, value: action.v } : f)));
    case "reader":
      return { ...state, readerChoice: action.choice, cursor: 0 };
    case "step":
      return { ...state, cursor: state.cursor + 1 };
    case "rewind":
      return { ...state, cursor: 0 };
    case "reset":
      return { writer: clone(SEED), readerChoice: "old", cursor: 0 };
    default:
      return state;
  }
}

/* --------------------------------------------------------- component */

export function SchemaEvolutionSandbox() {
  const [state, dispatch] = useReducer(reducer, undefined, () => ({
    writer: clone(SEED),
    readerChoice: "old" as ReaderChoice,
    cursor: 0,
  }));

  // Two honest compatibility scenarios, matching DDIA's definitions exactly:
  //  • old reader (v1) decodes the user's EVOLVED writer bytes   → FORWARD compat
  //  • new reader (= evolved schema) decodes the OLD seed bytes  → BACKWARD compat
  const old = state.readerChoice === "old";
  const writerSchema = old ? state.writer : SEED; // whose bytes are on the wire
  const reader = old ? OLD_READER : state.writer; // who is decoding them
  const bytes = useMemo(() => encode(writerSchema), [writerSchema]);
  const { steps, ok, reason } = useMemo(() => trace(writerSchema, reader), [writerSchema, reader]);

  const finished = state.cursor >= steps.length;
  const runSteps = steps.slice(0, state.cursor);
  // Bytes already consumed (for highlighting), and the byte(s) the *current* step touches.
  const activeStep = steps[state.cursor];
  const consumedUpto = state.cursor > 0 ? Math.max(...runSteps.map((s) => s.byteRange[1]), -1) : -1;

  // Direction label: which compatibility flavour is being demonstrated.
  const compat = old
    ? { name: "Forward compatibility", gloss: "OLD reader (v1) decodes the NEW writer's bytes", wire: "new writer (your evolved schema)" }
    : { name: "Backward compatibility", gloss: "NEW reader (your schema) decodes OLD v1 data", wire: "old writer (the original v1 seed)" };

  const totalBytes = bytes.reduce((a) => a + 1, 0);
  const diverged = JSON.stringify(state.writer) !== JSON.stringify(SEED);

  return (
    <div className="space-y-5">
      {/* ── 1. evolve the writer schema ─────────────────────────────── */}
      <div className="panel p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="font-mono text-xs font-medium text-fg">Writer schema</div>
            <div className="font-mono text-[9px] text-fg-faint">evolve it — these fields become the bytes below</div>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => dispatch({ type: "add" })}>
              + add field
            </Button>
            <Button size="sm" variant="ghost" onClick={() => dispatch({ type: "reset" })}>
              <IconReset size={13} /> reset
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <AnimatePresence initial={false}>
            {state.writer.map((f) => (
              <motion.div
                key={f.tag}
                layout
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.22 }}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-ink-950/50 p-2.5"
              >
                <span
                  className="grid h-6 w-6 shrink-0 place-items-center rounded-md font-mono text-[11px] font-bold text-ink-950"
                  style={{ background: TYPE_HUE[f.type] }}
                  title={`field tag ${f.tag}`}
                >
                  {f.tag}
                </span>
                <input
                  value={f.name}
                  onChange={(e) => dispatch({ type: "rename", tag: f.tag, name: e.target.value })}
                  spellCheck={false}
                  className="min-w-0 flex-1 rounded border border-line bg-ink-900 px-2 py-1 font-mono text-[12px] text-fg outline-none focus:border-accent"
                />
                <input
                  value={f.value}
                  onChange={(e) => dispatch({ type: "value", tag: f.tag, v: e.target.value })}
                  spellCheck={false}
                  title="field value (encoded into the bytes)"
                  className="w-20 rounded border border-line bg-ink-900 px-2 py-1 font-mono text-[12px] text-fg-muted outline-none focus:border-accent"
                />
                <select
                  value={f.type}
                  onChange={(e) => dispatch({ type: "retype", tag: f.tag, t: e.target.value as FieldType })}
                  className="rounded border border-line bg-ink-900 px-1.5 py-1 font-mono text-[11px] text-fg-muted outline-none focus:border-accent"
                >
                  <option value="int">int</option>
                  <option value="string">string</option>
                  <option value="bool">bool</option>
                </select>
                <button
                  type="button"
                  onClick={() => dispatch({ type: "required", tag: f.tag })}
                  title="toggle required / optional"
                  className={`shrink-0 rounded px-1.5 py-1 font-mono text-[9px] uppercase tracking-wide transition-colors hover:border-line-strong ${
                    f.required ? "border border-fault/50 text-fault" : "border border-line text-fg-faint"
                  }`}
                >
                  {f.required ? "required" : "optional"}
                </button>
                <button
                  type="button"
                  onClick={() => dispatch({ type: "remove", tag: f.tag })}
                  title="remove field"
                  className="shrink-0 rounded p-1 text-fg-faint transition-colors hover:text-fault"
                >
                  <IconX size={13} />
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
          {state.writer.length === 0 && (
            <div className="rounded-lg border border-dashed border-line p-3 text-center font-mono text-[11px] text-fg-faint">
              empty record — the writer emits only a STOP byte
            </div>
          )}
        </div>
      </div>

      {/* ── 2. the emitted byte stream ──────────────────────────────── */}
      <div className="rounded-lg border border-line bg-ink-950/50 p-4">
        <div className="mb-1 flex items-baseline justify-between">
          <span className="font-mono text-[10px] uppercase tracking-wider text-fg-faint">
            bytes on the wire · CompactProtocol-style
          </span>
          <span className="font-mono text-xs accent-text">{totalBytes} bytes</span>
        </div>
        <div className="mb-2.5 font-mono text-[10px] text-fg-faint">
          emitted by the <span style={{ color: old ? "var(--accent)" : "var(--color-warn)" }}>{compat.wire}</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {bytes.map((b, idx) => {
            const consumed = idx <= consumedUpto;
            const isActive =
              activeStep &&
              activeStep.status !== "missing" &&
              activeStep.status !== "default" &&
              idx >= activeStep.byteRange[0] &&
              idx <= activeStep.byteRange[1];
            const tone = isActive && activeStep ? STATUS_TONE[activeStep.status] : b.hue;
            return (
              <motion.span
                key={`${idx}-${b.hex}-${b.kind}`}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{
                  opacity: 1,
                  scale: isActive ? 1.12 : 1,
                  y: isActive ? -2 : 0,
                }}
                transition={{ duration: 0.18 }}
                title={b.note}
                className="relative inline-flex flex-col items-center"
              >
                <span
                  className="rounded border px-2 py-1 font-mono text-[11px] tabular-nums"
                  style={{
                    borderColor: `color-mix(in oklab, ${tone} ${isActive ? 90 : b.kind === "header" ? 60 : 35}%, transparent)`,
                    background: `color-mix(in oklab, ${tone} ${isActive ? 28 : b.kind === "header" ? 16 : 9}%, var(--color-ink-950))`,
                    color: b.kind === "stop" ? "var(--color-fg-faint)" : tone,
                    opacity: consumed || isActive || state.cursor === 0 ? 1 : 0.4,
                  }}
                >
                  {b.hex}
                </span>
                <span className="mt-0.5 font-mono text-[7px] uppercase text-fg-faint">{b.kind[0]}</span>
              </motion.span>
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap gap-3 font-mono text-[9px] uppercase tracking-wider text-fg-faint">
          <Legend swatch="var(--accent)" label="header byte (tag|type)" outline />
          <Legend swatch="var(--color-fg-faint)" label="payload / stop" />
        </div>
      </div>

      {/* ── 3. pick the reader & step the decode ────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="font-mono text-[10px] uppercase tracking-wider text-fg-faint">Decoder</span>
          <SegmentedControl<ReaderChoice>
            value={state.readerChoice}
            onChange={(c) => dispatch({ type: "reader", choice: c })}
            options={[
              { label: "Old reader v1", value: "old" },
              { label: "New reader v2", value: "new" },
            ]}
          />
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => dispatch({ type: "step" })} disabled={finished}>
            <IconStep size={13} /> {state.cursor === 0 ? "decode" : "next byte"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => dispatch({ type: "rewind" })}>
            <IconReset size={13} /> rewind
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.1fr]">
        {/* reader schema */}
        <div className="panel p-4">
          <div className="mb-3">
            <div className="font-mono text-xs font-medium text-fg">
              {state.readerChoice === "old" ? "Old reader (v1)" : "New reader (v2)"}
            </div>
            <div className="font-mono text-[9px] text-fg-faint">
              {state.readerChoice === "old"
                ? "frozen at the original tags 1–3"
                : "knows exactly the writer's current schema"}
            </div>
          </div>
          <div className="space-y-2">
            {reader.map((f) => {
              const stepForTag = runSteps.find((s) => s.tag === f.tag);
              const tone = stepForTag ? STATUS_TONE[stepForTag.status] : "var(--color-fg-faint)";
              return (
                <div key={f.tag} className="flex items-center gap-2 rounded-lg border border-line bg-ink-950/50 p-2">
                  <span
                    className="grid h-5 w-5 shrink-0 place-items-center rounded font-mono text-[10px] font-bold text-ink-950"
                    style={{ background: TYPE_HUE[f.type] }}
                  >
                    {f.tag}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-fg-muted">{f.name}</span>
                  <span className="font-mono text-[9px] text-fg-faint">{f.type}</span>
                  <span
                    className="shrink-0 rounded px-1 py-0.5 font-mono text-[8px] uppercase"
                    style={{ color: f.required ? "var(--color-fault)" : "var(--color-fg-faint)" }}
                  >
                    {f.required ? "req" : "opt"}
                  </span>
                  {stepForTag && (
                    <motion.span
                      key={stepForTag.status}
                      initial={{ scale: 0.6, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="shrink-0 rounded px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-wide"
                      style={{ color: tone, background: `color-mix(in oklab, ${tone} 16%, transparent)` }}
                    >
                      {stepForTag.status}
                    </motion.span>
                  )}
                </div>
              );
            })}
            {reader.length === 0 && (
              <div className="rounded-lg border border-dashed border-line p-3 text-center font-mono text-[11px] text-fg-faint">
                empty reader
              </div>
            )}
          </div>
        </div>

        {/* decode trace */}
        <div className="panel p-4">
          <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-fg-faint">decode trace</div>
          <div className="max-h-[228px] space-y-1.5 overflow-y-auto">
            <AnimatePresence initial={false}>
              {runSteps.map((s, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex items-start gap-2 font-mono text-[11px] leading-snug"
                  style={{ color: STATUS_TONE[s.status] }}
                >
                  <span className="text-fg-faint">{String(i).padStart(2, "0")}</span>
                  <span>{s.text}</span>
                </motion.div>
              ))}
            </AnimatePresence>
            {state.cursor === 0 && (
              <div className="font-mono text-[11px] text-fg-faint">
                Press <span className="accent-text">decode</span> to step the {state.readerChoice === "old" ? "v1" : "v2"}{" "}
                reader through the byte stream.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── 4. verdict ──────────────────────────────────────────────── */}
      <AnimatePresence>
        {finished && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="rounded-lg border p-4"
            style={{
              borderColor: ok
                ? "color-mix(in oklab, var(--color-ok) 45%, transparent)"
                : "color-mix(in oklab, var(--color-fault) 45%, transparent)",
              background: ok
                ? "color-mix(in oklab, var(--color-ok) 8%, var(--color-ink-900))"
                : "color-mix(in oklab, var(--color-fault) 8%, var(--color-ink-900))",
            }}
          >
            <div className="flex items-center gap-2.5">
              <span
                className="grid h-7 w-7 shrink-0 place-items-center rounded-full"
                style={{
                  background: ok
                    ? "color-mix(in oklab, var(--color-ok) 22%, transparent)"
                    : "color-mix(in oklab, var(--color-fault) 22%, transparent)",
                  color: ok ? "var(--color-ok)" : "var(--color-fault)",
                }}
              >
                {ok ? <IconCheck size={16} /> : <IconX size={16} />}
              </span>
              <div>
                <div
                  className="font-mono text-xs font-semibold"
                  style={{ color: ok ? "var(--color-ok)" : "var(--color-fault)" }}
                >
                  {compat.name}: {ok ? "HOLDS" : "BROKEN"}
                </div>
                <div className="font-mono text-[9px] uppercase tracking-wider text-fg-faint">{compat.gloss}</div>
              </div>
            </div>
            <div className="mt-2.5 text-[12px] leading-relaxed text-fg-muted">{reason}</div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Wire bytes" value={totalBytes} tone="accent" />
        <Stat label="Decoding as" value={<span className="text-sm">{state.readerChoice === "old" ? "v1 (old)" : "v2 (new)"}</span>} tone="info" />
        <Stat label="Writer" value={diverged ? "evolved" : "seed"} tone={diverged ? "warn" : "default"} />
      </div>

      <p className="font-body text-sm leading-relaxed text-fg-muted">
        <span className="accent-text font-mono text-xs">try this →</span>{" "}
        <strong className="text-fg">Rename</strong> a field, then decode with the <strong className="text-fg">old
        reader v1</strong>: still fine, because the bytes key on the <strong className="text-fg">tag number</strong>, not
        the name. <strong className="text-fg">Add a field</strong> and decode with v1 again — its bytes get{" "}
        <span className="text-fg-faint">skipped</span> (<em className="not-italic text-ok">forward compatibility</em>:
        old code tolerates new fields). Now make that added field{" "}
        <strong className="text-fault">required</strong> and switch to the{" "}
        <strong className="text-fg">new reader v2</strong> — it decodes the original v1 data, which never carried that
        tag, so <span className="text-fault">backward compatibility breaks</span>. Drop the <code>required</code> flag (or
        give the field a default) and watch it heal.
      </p>
    </div>
  );
}

/* ---------------------------------------------------------- sub-views */

function Legend({ swatch, label, outline }: { swatch: string; label: string; outline?: boolean }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className="h-2.5 w-2.5 rounded-[2px]"
        style={
          outline
            ? { border: `1px solid ${swatch}`, background: `color-mix(in oklab, ${swatch} 22%, transparent)` }
            : { background: `color-mix(in oklab, ${swatch} 60%, transparent)` }
        }
      />
      {label}
    </span>
  );
}
