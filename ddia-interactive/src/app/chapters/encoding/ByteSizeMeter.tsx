"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { SegmentedControl, Stat, Toggle } from "@/components/chapter";

/**
 * Byte-size meter: encode ONE record four ways and compare the wire size.
 *
 * The byte counts below follow the real on-wire rules described in DDIA, not a
 * fudge factor:
 *   JSON           — UTF-8 text: every field name, all quotes/braces/colons.
 *   MessagePack    — binary JSON: drops structural punctuation but still ships
 *                    each field-name string; ints get a 1-byte type marker.
 *   Thrift Compact — field NAMES gone; a 1-byte header packs (tag-delta|type);
 *                    ints are zig-zag varints; strings are length-prefixed.
 *   Avro           — names AND tags gone; values written back-to-back using the
 *                    *external* schema for ordering. Most compact on the wire.
 */

type Rec = { userId: number; userName: string; active: boolean; favNumber: number };

const ENCODINGS = [
  { label: "JSON", value: "json" },
  { label: "MessagePack", value: "msgpack" },
  { label: "Thrift Compact", value: "thrift" },
  { label: "Avro", value: "avro" },
] as const;
type Enc = (typeof ENCODINGS)[number]["value"];

type Segment = { label: string; bytes: number; hue: string; kind: "name" | "value" | "struct" };

const utf8 = (s: string) => new TextEncoder().encode(s).length;
// bytes a LEB128/varint needs for an unsigned magnitude
const varintLen = (n: number) => {
  let v = Math.max(0, Math.abs(Math.trunc(n)));
  let len = 1;
  while (v >= 0x80) {
    v = Math.floor(v / 128);
    len++;
  }
  return len;
};
// zig-zag maps signed → unsigned so small negatives stay small
const zigzag = (n: number) => (n < 0 ? -2 * n - 1 : 2 * n);

const HUE = {
  name: "var(--accent-2)",
  value: "var(--accent)",
  struct: "var(--color-fg-faint)",
};

function encode(enc: Enc, rec: Rec): Segment[] {
  const segs: Segment[] = [];
  const name = (label: string, bytes: number) => segs.push({ label, bytes, hue: HUE.name, kind: "name" });
  const value = (label: string, bytes: number) => segs.push({ label, bytes, hue: HUE.value, kind: "value" });
  const struct = (label: string, bytes: number) => segs.push({ label, bytes, hue: HUE.struct, kind: "struct" });

  if (enc === "json") {
    // {"userId":<n>,"userName":"<s>","active":<bool>,"favNumber":<n>}
    struct("{", 1);
    name(`"userId":`, utf8(`"userId":`));
    value(String(rec.userId), utf8(String(rec.userId)));
    struct(",", 1);
    name(`"userName":`, utf8(`"userName":`));
    value(`"${rec.userName}"`, utf8(`"${rec.userName}"`));
    struct(",", 1);
    name(`"active":`, utf8(`"active":`));
    value(String(rec.active), utf8(String(rec.active)));
    struct(",", 1);
    name(`"favNumber":`, utf8(`"favNumber":`));
    value(String(rec.favNumber), utf8(String(rec.favNumber)));
    struct("}", 1);
    return segs;
  }

  if (enc === "msgpack") {
    // fixmap header (1) then for each pair: fixstr key + value marker(s).
    struct("map hdr", 1);
    for (const [k, kind] of [
      ["userId", "int"],
      ["userName", "str"],
      ["active", "bool"],
      ["favNumber", "int"],
    ] as const) {
      name(`"${k}"`, 1 + utf8(k)); // fixstr length byte + bytes
      if (kind === "int") {
        const n = k === "userId" ? rec.userId : rec.favNumber;
        // uint8 fits in 1 marker+1 byte; larger uses wider markers
        const body = n < 128 ? 1 : n < 256 ? 2 : n < 65536 ? 3 : 5;
        value(String(n), body);
      } else if (kind === "str") {
        value(`"${rec.userName}"`, 1 + utf8(rec.userName));
      } else {
        value(String(rec.active), 1); // true/false are a single byte
      }
    }
    return segs;
  }

  if (enc === "thrift") {
    // CompactProtocol: 1-byte field header packs (tag-delta<<4 | type).
    struct("hdr ·1", 1);
    value(String(rec.userId), varintLen(zigzag(rec.userId)));
    struct("hdr ·2", 1);
    value(`"${rec.userName}"`, varintLen(utf8(rec.userName)) + utf8(rec.userName));
    struct("hdr ·3", 1); // bool value is folded into the type nibble → no body
    struct("hdr ·4", 1);
    value(String(rec.favNumber), varintLen(zigzag(rec.favNumber)));
    struct("stop", 1);
    return segs;
  }

  // avro — no field names, no tags. values back-to-back in schema order.
  value(String(rec.userId), varintLen(zigzag(rec.userId)));
  value(`"${rec.userName}"`, varintLen(utf8(rec.userName)) + utf8(rec.userName));
  value(String(rec.active), 1);
  value(String(rec.favNumber), varintLen(zigzag(rec.favNumber)));
  return segs;
}

function total(segs: Segment[]): number {
  return segs.reduce((a, s) => a + s.bytes, 0);
}

export function ByteSizeMeter() {
  const [enc, setEnc] = useState<Enc>("json");
  const [longName, setLongName] = useState(false);

  const rec: Rec = useMemo(
    () => ({
      userId: 1337,
      userName: longName ? "martin_kleppmann" : "ada",
      active: true,
      favNumber: 42,
    }),
    [longName]
  );

  // Compute every encoding so the comparison bars are live.
  const all = useMemo(
    () =>
      ENCODINGS.map((e) => {
        const segs = encode(e.value, rec);
        return { ...e, segs, bytes: total(segs) };
      }),
    [rec]
  );
  const max = Math.max(...all.map((a) => a.bytes));
  const jsonBytes = all.find((a) => a.value === "json")!.bytes;
  const active = all.find((a) => a.value === enc)!;
  const saved = Math.round((1 - active.bytes / jsonBytes) * 100);

  return (
    <div className="space-y-5">
      {/* the record under test */}
      <div className="rounded-lg border border-line bg-ink-950/50 p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="font-mono text-[10px] uppercase tracking-wider text-fg-faint">record under test</span>
          <Toggle label="long string" checked={longName} onChange={setLongName} />
        </div>
        <code className="block font-mono text-[12px] leading-relaxed text-fg/90">
          {`{ userId: ${rec.userId}, userName: "${rec.userName}", active: ${rec.active}, favNumber: ${rec.favNumber} }`}
        </code>
      </div>

      <SegmentedControl<Enc> value={enc} onChange={setEnc} options={ENCODINGS.map((e) => ({ label: e.label, value: e.value }))} />

      {/* byte breakdown for the chosen encoding */}
      <div>
        <div className="mb-2 flex items-baseline justify-between">
          <span className="font-mono text-[10px] uppercase tracking-wider text-fg-faint">
            {active.label} — byte layout
          </span>
          <span className="font-mono text-xs accent-text">{active.bytes} bytes</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {active.segs
            .filter((s) => s.bytes > 0)
            .map((s, i) => (
              <motion.span
                key={`${enc}-${i}-${s.label}`}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.02 }}
                className="group relative inline-flex flex-col items-center"
                title={`${s.label} · ${s.bytes} byte${s.bytes === 1 ? "" : "s"}`}
              >
                <span
                  className="rounded border px-2 py-1 font-mono text-[11px]"
                  style={{
                    borderColor: `color-mix(in oklab, ${s.hue} 55%, transparent)`,
                    background: `color-mix(in oklab, ${s.hue} 14%, var(--color-ink-950))`,
                    color: s.kind === "struct" ? "var(--color-fg-faint)" : s.hue,
                  }}
                >
                  {s.label}
                </span>
                <span className="mt-0.5 font-mono text-[8px] text-fg-faint">{s.bytes}B</span>
              </motion.span>
            ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-4 font-mono text-[9px] uppercase tracking-wider text-fg-faint">
          <Legend hue={HUE.name} label="field name" />
          <Legend hue={HUE.value} label="value" />
          <Legend hue={HUE.struct} label="framing" />
        </div>
        {enc === "avro" && (
          <p className="mt-3 text-[12px] leading-relaxed text-fg-muted">
            Avro ships <strong className="text-fg">zero</strong> field names and{" "}
            <strong className="text-fg">zero</strong> tags inside the record — readers rely on the{" "}
            <span className="accent-text">writer&apos;s schema</span>, stored once per file or negotiated on the
            connection. That is why it is the most compact, and why a reader cannot decode a single record without
            knowing the exact schema that wrote it.
          </p>
        )}
      </div>

      {/* live comparison bars */}
      <div className="space-y-2.5 rounded-lg border border-line bg-ink-900/40 p-4">
        <div className="font-mono text-[10px] uppercase tracking-wider text-fg-faint">size on the wire</div>
        {all.map((a) => (
          <div key={a.value} className="flex items-center gap-3">
            <span className="w-28 shrink-0 font-mono text-[11px] text-fg-muted">{a.label}</span>
            <div className="relative h-5 flex-1 overflow-hidden rounded bg-ink-950">
              <motion.div
                className="h-full rounded"
                style={{
                  background:
                    a.value === enc
                      ? "var(--accent)"
                      : "color-mix(in oklab, var(--accent) 30%, var(--color-ink-700))",
                }}
                animate={{ width: `${(a.bytes / max) * 100}%` }}
                transition={{ type: "spring", stiffness: 160, damping: 22 }}
              />
            </div>
            <span className="w-12 shrink-0 text-right font-mono text-[11px] tabular-nums accent-text">
              {a.bytes}B
            </span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Stat label="JSON baseline" value={jsonBytes} unit="B" tone="info" />
        <Stat label={`${active.label}`} value={active.bytes} unit="B" tone="accent" />
        <Stat
          label="vs JSON"
          value={saved >= 0 ? `−${saved}` : `+${-saved}`}
          unit="%"
          tone={saved > 0 ? "ok" : "default"}
        />
      </div>
    </div>
  );
}

function Legend({ hue, label }: { hue: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-[2px]" style={{ background: `color-mix(in oklab, ${hue} 60%, transparent)` }} />
      {label}
    </span>
  );
}
