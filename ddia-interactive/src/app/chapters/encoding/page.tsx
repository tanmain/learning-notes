import type { Metadata } from "next";
import { Fragment } from "react";
import {
  ChapterShell,
  Section,
  Prose,
  Analogy,
  RealWorld,
  Callout,
  KeyTakeaways,
  DemoFrame,
  Figure,
  DefinitionGrid,
  CompareTable,
  CodeBlock,
  YouTubeEmbed,
  FurtherReading,
  Quiz,
  AskClaude,
} from "@/components/chapter";
import { Hero } from "./Hero";
import { SchemaEvolutionSandbox } from "./SchemaEvolutionSandbox";
import { ByteSizeMeter } from "./ByteSizeMeter";
import { DataflowExplorer } from "./DataflowExplorer";

export const metadata: Metadata = {
  title: "Encoding & Evolution",
  description:
    "How data crosses the wire and the years: JSON vs Thrift vs Protocol Buffers vs Avro, and forward/backward compatibility as systems evolve.",
};

const CONCEPTS = `
Encoding & Evolution (DDIA Ch. 4). Data has two representations: an in-memory form (objects, structs, lists, pointers) optimised for the CPU, and a self-contained byte sequence used to write to disk or send over a network. Converting in-memory → bytes is encoding (a.k.a. serialization / marshalling); the reverse is decoding (parsing / deserialization / unmarshalling).

Why systems must evolve: a feature change usually changes the stored data. Schema-on-read (schemaless) data ends up a mixture of old and new formats. Large deployments use rolling upgrades — new code reaches a few nodes at a time — so old and new code, and old and new data, all coexist. This demands compatibility in BOTH directions. Backward compatibility: newer code can read data written by older code. Forward compatibility: older code can read data written by newer code (harder, because old code must tolerate additions it doesn't understand).

Language-built-in serialization (Java Serializable, Python pickle) is convenient but a bad idea: tied to one language, a security hole (instantiates arbitrary classes), poor versioning, inefficient.

Textual formats — JSON, XML, CSV — are human-readable and ubiquitous as interchange formats, but have problems: number/precision ambiguity, no distinction of integers vs floats, no native binary strings (people Base64-encode, +33% size), optional/weak schema support, and CSV has no schema at all.

Binary encodings are more compact. JSON has binary variants (MessagePack, BSON, etc.) that still embed field names. Schema-based binary formats omit field names entirely: Apache Thrift (BinaryProtocol and the tighter CompactProtocol, which packs field type + tag number into one byte) and Protocol Buffers use numeric FIELD TAGS instead of names. Schema evolution rules: add a new field with a new tag — old readers skip unknown tags (forward compat); new fields must be optional or have a default so new code can read old data (backward compat). You may only remove an optional field, and you can NEVER reuse a tag. Changing a field's type risks truncation/precision loss.

Apache Avro is different: no tags AND no field names in the record — values are written back-to-back, ordered by the schema. It distinguishes the WRITER'S schema (used to encode) from the READER'S schema (expected on decode); they need not be identical, and Avro resolves differences by matching field names. To stay compatible you may only add/remove fields that have a default value. Avro suits dynamically generated schemas (e.g. dumping a database) and ships the writer's schema once per file, or a version id per record, or negotiates it on a connection.

Modes of dataflow — how encoded data moves between processes: (1) Via databases — writer encodes, a later reader decodes; data outlives code; migrations are expensive so old encodings linger. (2) Via service calls (REST and RPC) — clients and servers; REST dominates public APIs; RPC tries to make a remote call look local but a network call is fundamentally different (unpredictable, can time out, needs idempotence for retries, slower, must marshal types across languages). (3) Via asynchronous message passing — a message broker (RabbitMQ, ActiveMQ, NATS, Apache Kafka) buffers and redelivers messages, decouples sender from recipient in time and space, and fans one message out to many consumers. The actor model encapsulates state + async messaging per actor; distributed actor frameworks (Akka, Orleans, Erlang OTP) embed a broker but often need care to support rolling upgrades.
`;

export default function Page() {
  return (
    <ChapterShell slug="encoding" diagram={<Hero />}>
      <Section
        kicker="The problem"
        title="Data outlives code"
        intro={
          <>
            An application&apos;s features change, so its data changes. But you can&apos;t flip every server and every
            stored byte at the same instant — so old and new must coexist, in both directions.
          </>
        }
      >
        <Prose>
          <p>
            Every running program keeps data in two very different shapes. <strong>In memory</strong>, data lives in
            objects, structs, lists, hash tables, and trees wired together with pointers — a layout optimised for the
            CPU to chase efficiently. The moment you want to write that data to a file or send it over a network, you
            must flatten it into a <strong>self-contained sequence of bytes</strong> (a pointer is meaningless to
            another process). Translating in-memory form to bytes is <em>encoding</em> — also called serialization or
            marshalling — and the reverse is <em>decoding</em>.
          </p>
          <p>
            Because data structures and the code that reads them evolve, two versions almost always run at once. You
            ship a <strong>rolling upgrade</strong>: the new build lands on a handful of nodes while the rest still run
            the old one, so there is no downtime — but for a while, requests and stored records flow between mismatched
            versions. With schema-on-read storage you accumulate a literal mixture of old and new record formats. To
            survive this, encodings must preserve compatibility in <strong>both</strong> directions:
          </p>
          <ul>
            <li>
              <strong>Backward compatibility</strong> — newer code can read data written by older code. This is the
              easy direction: you wrote the old format, so you know how to handle it.
            </li>
            <li>
              <strong>Forward compatibility</strong> — older code can read data written by newer code. This is the hard
              direction: old code must gracefully tolerate additions it was never told about.
            </li>
          </ul>
        </Prose>

        <Analogy>
          Think of encoding as <strong>flat-packing furniture</strong>. In your living room a bookshelf is a rigid 3-D
          object; to ship it you break it into flat boards plus an instruction sheet. <em>Backward</em> compatibility is
          a 2026 customer assembling a 2019 kit — the older, simpler instructions still work. <em>Forward</em>{" "}
          compatibility is a 2019 customer who receives a 2026 kit with an extra mounting bracket they&apos;ve never
          seen: a good design lets them ignore the unfamiliar part and still build a working shelf.
        </Analogy>

        <Callout variant="warning" title="Don't reach for language-native serialization">
          Java&apos;s <code>Serializable</code>, Python&apos;s <code>pickle</code>, and Ruby&apos;s <code>Marshal</code>{" "}
          are one import away, but they lock you to a single language, version poorly, are often slow, and are a genuine
          security hole — decoding can be coaxed into instantiating arbitrary classes and running attacker code.
        </Callout>
      </Section>

      <Section
        id="formats"
        kicker="Encoding Formats"
        title="From JSON to schema-based binary"
        intro={
          <>
            Human-readable text is easy to start with and miserable to scale. Schema-based binary formats trade
            readability for compactness, type-safety, and a self-documenting contract.
          </>
        }
      >
        <Prose>
          <p>
            <strong>JSON, XML, and CSV</strong> won as <em>data-interchange</em> formats precisely because a human can
            read them and almost every language can parse them. But that convenience hides sharp edges:
          </p>
          <ul>
            <li>
              <strong>Numbers are ambiguous.</strong> JSON doesn&apos;t distinguish integers from floats and gives no
              precision guarantees; integers above 2<sup>53</sup> silently lose accuracy in IEEE-754 doubles (Twitter
              ships tweet IDs as <em>strings</em> for exactly this reason).
            </li>
            <li>
              <strong>No binary strings.</strong> JSON and XML carry Unicode text but not raw bytes, so people Base64-
              encode binary data — inflating it by roughly <strong>33%</strong>.
            </li>
            <li>
              <strong>Weak or optional schemas.</strong> XML and JSON schema support is optional and fiddly; CSV has no
              schema at all, so the meaning of each column lives only in a human&apos;s head.
            </li>
            <li>
              <strong>Verbosity.</strong> Every record repeats its field names as text, every time.
            </li>
          </ul>
          <p>
            <strong>Binary encodings</strong> attack the size problem. Drop-in binary versions of JSON (MessagePack,
            BSON) keep the field-name strings but strip the punctuation. The real win comes from{" "}
            <strong>schema-based</strong> formats — <strong>Apache Thrift</strong> and{" "}
            <strong>Protocol Buffers</strong> — which replace every field name with a small integer{" "}
            <em>field tag</em> defined once in a schema. Thrift&apos;s <code>CompactProtocol</code> goes further,
            squeezing a field&apos;s type and tag delta into a single byte and using variable-length zig-zag integers.
          </p>
        </Prose>

        <CodeBlock
          lang="protobuf"
          caption="A Protocol Buffers schema. The numbers after = are the field tags that travel on the wire — the names never do."
          code={`message Person {
  required int32  user_id    = 1;   // tag 1
  required string user_name  = 2;   // tag 2
  optional bool   active     = 3;   // tag 3 — addable later, must be optional
  repeated string emails     = 4;   // tag 4
}`}
        />

        <Prose>
          <p>
            This tag indirection is the whole trick behind <strong>schema evolution</strong>. Because the wire format
            keys on the <em>tag number</em>, not the name:
          </p>
          <ul>
            <li>
              <strong>You can rename a field freely</strong> — the bytes don&apos;t carry the name, so old and new code
              still agree as long as the tag is unchanged.
            </li>
            <li>
              <strong>Adding a field</strong> means choosing a fresh tag. Old code hits an unknown tag and{" "}
              <em>skips it</em> (forward compatibility). New code reading old data won&apos;t find the new tag, so the
              field must be <strong>optional</strong> or carry a <strong>default</strong> (backward compatibility).
            </li>
            <li>
              <strong>Removing a field</strong> is the mirror image: you may only drop an <em>optional</em> field, and
              you must <strong>retire its tag forever</strong> — reusing a tag number silently corrupts old data.
            </li>
            <li>
              <strong>Changing a type</strong> is risky: values can be truncated or lose precision (e.g. 32-bit → 16-bit
              int).
            </li>
          </ul>
        </Prose>

        <DemoFrame
          title="Schema-evolution sandbox — decode the actual bytes"
          description="Evolve the writer's schema (add / remove / rename / retype a field) and watch it emit a real CompactProtocol-style byte stream. Then pick a reader — the old v1 reader (forward compat) or the new v2 reader (backward compat) — and step the decode byte-by-byte, watching each field get decoded by tag, skipped, defaulted, or fail."
          right="byte-by-byte decode"
        >
          <SchemaEvolutionSandbox />
        </DemoFrame>

        <Callout variant="insight">
          A field tag is a <strong>stable contract</strong> and a field name is just documentation. That single
          decision — key the bytes on numbers, not strings — is what lets a hundred services on a hundred versions keep
          talking through a rolling upgrade.
        </Callout>

        <Prose>
          <p>
            <strong>Apache Avro</strong> takes a strikingly different route: its encoded records contain{" "}
            <strong>neither field names nor tags</strong>. Values are simply concatenated in the order the schema
            declares, so a parser is helpless without the exact schema that produced the bytes. Avro embraces this by
            distinguishing the <strong>writer&apos;s schema</strong> (whatever version encoded the data) from the{" "}
            <strong>reader&apos;s schema</strong> (whatever the consumer expects). The two need not match; Avro&apos;s
            resolution rules line fields up <em>by name</em>, fill in defaults for fields the reader has but the writer
            lacked, and ignore fields the writer had but the reader doesn&apos;t want.
          </p>
          <p>
            The catch: to stay compatible you may only add or remove fields that <strong>have a default value</strong>,
            and renaming is awkward (backward-compatible via aliases, but not forward-compatible). In exchange, Avro
            shines for <strong>dynamically generated schemas</strong> — dump a relational table and you can mechanically
            emit a fresh Avro schema each time the columns change, with no hand-maintained tag mapping.
          </p>
        </Prose>

        <DemoFrame
          title="Byte-size meter — same record, four encodings"
          description="The identical record is encoded as JSON, MessagePack, Thrift CompactProtocol, and Avro. Hover any chip to see what those bytes are. Toggle a longer string to see how the field-name overhead of text formats dominates small records."
          right="bytes on the wire"
        >
          <ByteSizeMeter />
        </DemoFrame>

        <CompareTable
          caption="How the four encodings handle the things that matter."
          columns={["JSON / XML", "Thrift / Protobuf", "Avro"]}
          rows={[
            {
              feature: "Field identity",
              values: [
                <Fragment key={0}>Field <strong>names</strong> as text, repeated every record</Fragment>,
                <Fragment key={1}>Numeric <strong>tags</strong> in the bytes; names only in schema</Fragment>,
                <Fragment key={2}><strong>Nothing</strong> in the bytes — order comes from the schema</Fragment>,
              ],
            },
            {
              feature: "Schema",
              values: [
                "Optional / often absent",
                "Required; tags pinned by hand",
                "Required; reader & writer schemas resolved",
              ],
            },
            {
              feature: "Compactness",
              values: ["Verbose", "Compact", "Most compact"],
            },
            {
              feature: "Add a field",
              values: [
                "Just emit it",
                "New tag; must be optional / default",
                "Must have a default value",
              ],
            },
            {
              feature: "Rename a field",
              values: [
                <Fragment key={0}><span className="text-fault">Breaks readers keyed on the name</span></Fragment>,
                <Fragment key={1}><span className="text-ok">Free — name isn&apos;t on the wire</span></Fragment>,
                <Fragment key={2}><span className="text-warn">Needs an alias; not forward-compatible</span></Fragment>,
              ],
            },
            {
              feature: "Best fit",
              values: [
                "Public APIs, configs, debugging",
                "Statically-typed cross-service contracts",
                "Dynamically-generated schemas, big data files",
              ],
            },
          ]}
        />

        <DefinitionGrid
          items={[
            {
              term: "Field tag",
              def: (
                <>
                  A small integer that identifies a field on the wire in Thrift/Protobuf. Stable forever; the human
                  name is mere documentation.
                </>
              ),
            },
            {
              term: "Writer's schema",
              def: <>The exact schema version used to <em>encode</em> a given record (Avro).</>,
            },
            {
              term: "Reader's schema",
              def: (
                <>
                  The schema a consumer <em>expects</em> when decoding. In Avro it can differ from the writer&apos;s and
                  is reconciled automatically.
                </>
              ),
            },
            {
              term: "Schema resolution",
              def: (
                <>
                  Avro&apos;s process of matching writer and reader fields by name, applying defaults and dropping
                  extras to bridge versions.
                </>
              ),
            },
          ]}
        />

        <RealWorld
          examples={[
            {
              system: "Protocol Buffers",
              detail: (
                <>
                  Born at Google and the backbone of gRPC; <code>.proto</code> files generate typed stubs in a dozen
                  languages, with tags enforcing compatibility.
                </>
              ),
            },
            {
              system: "Apache Avro + Kafka",
              detail: (
                <>
                  Confluent&apos;s Schema Registry stores Avro schemas and ships a small schema <em>id</em> with each
                  message, so consumers fetch the writer&apos;s schema and resolve against their own.
                </>
              ),
            },
            {
              system: "Apache Thrift",
              detail: (
                <>
                  Created at Facebook for cross-language RPC; offers BinaryProtocol and the tighter CompactProtocol over
                  the same tagged schema.
                </>
              ),
            },
            {
              system: "MessagePack / BSON",
              detail: (
                <>
                  Schemaless binary JSON used by Redis tooling and MongoDB&apos;s storage format — compact, but still
                  carries field names.
                </>
              ),
            },
          ]}
        />
      </Section>

      <Section
        id="watch"
        kicker="See it explained"
        title="Protobuf, by hand"
        intro={
          <>
            If the tags-and-bytes picture hasn&apos;t fully clicked yet, watch someone encode the same record as JSON and
            then as Protocol Buffers, and weigh the bytes side by side.
          </>
        }
      >
        <Prose>
          <p>
            Hussein Nasser&apos;s crash course builds a tiny app twice — once with JSON, once with a{" "}
            <code>.proto</code> schema compiled by <code>protoc</code> — and shows the wire size collapse as the field
            names drop out. It is the same JSON-vs-schema-binary trade-off this chapter draws, made concrete in code.
          </p>
        </Prose>
        <YouTubeEmbed
          videoId="46O73On0gyI"
          title="Protocol Buffers Crash Course — serialize structured data, JSON vs Protobuf"
          channel="Hussein Nasser"
        />
        <Callout variant="note" title="Want the byte-level diff in writing?">
          DDIA&apos;s author, Martin Kleppmann, wrote the canonical companion post that encodes one record in Protobuf
          (33 bytes), Thrift BinaryProtocol (59) and CompactProtocol (34), and Avro (32) — byte for byte. It is linked in
          Further reading below.
        </Callout>
      </Section>

      <Section
        id="dataflow"
        kicker="Modes of Dataflow"
        title="How encoded data moves between processes"
        intro={
          <>
            Encoding only matters because data crosses a boundary. The three ways it crosses — through a database, a
            service call, or a message broker — each demand compatibility, but couple the two sides very differently.
          </>
        }
      >
        <Prose>
          <p>
            <strong>Via databases.</strong> The process that writes encodes; some later process that reads decodes. The
            two never communicate directly — they meet only in stored bytes, often separated by <em>years</em>. Here a
            phrase becomes a design constraint: <strong>data outlives code</strong>. You may replace the entire
            application in minutes, but the five-year-old rows stay in their original encoding unless you pay to rewrite
            them. So a value can be written by new code and later read by old code (during a rolling upgrade) or written
            by old code and read by new code (the usual case) — you need both directions. Mercifully, most relational
            databases let you add a nullable column without rewriting existing rows; old rows simply read back{" "}
            <code>null</code> for the missing column.
          </p>
        </Prose>

        <Analogy title="Analogy">
          A database is a <strong>time capsule</strong>; a service call is a <strong>phone conversation</strong>; a
          message broker is the <strong>postal service</strong>. The time capsule&apos;s author and reader never meet —
          the note must explain itself decades later. A phone call needs both people on the line at the same instant. A
          letter lets you write today and be read whenever the recipient gets around to it, and the post office holds it
          if they&apos;re away.
        </Analogy>

        <Prose>
          <p>
            <strong>Via service calls (REST and RPC).</strong> Processes talk over the network as clients and servers,
            each service typically owned by one team that deploys on its own cadence — so, again, old and new run
            together. <strong>REST</strong> embraces HTTP (URLs, methods, status codes) and dominates public APIs
            because it&apos;s easy to debug and experiment with. <strong>RPC</strong> instead tries to make a remote call
            look like a local function call — convenient, but the abstraction leaks badly, because a network call is a
            fundamentally different beast:
          </p>
          <ul>
            <li>It is <strong>unpredictable</strong>: the network or remote machine may be slow or down.</li>
            <li>
              It can return <strong>nothing</strong> at all — a timeout — leaving you unsure whether the request ran.
            </li>
            <li>
              Retrying may execute the action <strong>twice</strong> unless you design for{" "}
              <strong>idempotence</strong> (deduplication).
            </li>
            <li>Latency is wildly variable and orders of magnitude worse than a function call.</li>
            <li>
              Every argument must be <strong>encoded</strong> to bytes, and the framework must map types across
              languages that don&apos;t share a type system.
            </li>
          </ul>
          <p>
            The modern verdict: stop pretending a remote service is a local object. Newer RPC frameworks (Finagle,
            gRPC) are explicit about asynchrony, using futures/promises. For compatibility, requests need to be{" "}
            <strong>backward compatible</strong> (a new server must read an old client&apos;s call) and responses{" "}
            <strong>forward compatible</strong> (an old client must read a new server&apos;s reply).
          </p>
          <p>
            <strong>Via asynchronous message passing.</strong> A sender delivers a <em>message</em> to a named queue or
            topic on a <strong>message broker</strong> (RabbitMQ, ActiveMQ, NATS, Apache Kafka), which stores it
            temporarily and routes it to one or more consumers. Communication is one-way: the producer sends and{" "}
            <em>forgets</em>. This buys real advantages over direct RPC — the broker buffers if a consumer is overloaded
            or down, redelivers after a crash so messages aren&apos;t lost, frees the sender from knowing the
            recipient&apos;s address, and can <strong>fan one message out to many subscribers</strong>. Above all it{" "}
            <strong>decouples</strong> sender from recipient in both time and space.
          </p>
        </Prose>

        <DemoFrame
          title="Dataflow explorer"
          description="Switch between the three modes and watch the topology. Flip 'recipient down' to see why asynchronous dataflow (database, broker) tolerates an offline consumer, while a synchronous service call simply fails and must be retried."
          right="db · service · broker"
        >
          <DataflowExplorer />
        </DemoFrame>

        <Callout variant="tradeoff" title="Synchronous coupling vs. operational slack">
          RPC is simple to reason about and gives you an immediate answer — but it binds caller and callee to be healthy
          at the same instant, and forces you to handle timeouts and duplicate execution. A broker decouples them and
          absorbs load spikes and outages, at the cost of an extra moving part, eventual (not immediate) delivery, and
          harder end-to-end debugging.
        </Callout>

        <Prose>
          <p>
            One step further sits the <strong>actor model</strong>: concurrency expressed as <em>actors</em> that each
            own private state and communicate only by sending asynchronous messages, so there are no shared-memory race
            conditions to reason about. <strong>Distributed actor frameworks</strong> spread actors across nodes,
            folding a message broker and the actor model into one runtime — location-transparent messaging for free. But
            the wire encoding still matters for rolling upgrades: <strong>Akka</strong> defaults to Java serialization
            (no compatibility — swap in Protobuf), <strong>Orleans</strong> uses a custom format that resists upgrades,
            and <strong>Erlang OTP</strong> makes evolving record schemas surprisingly hard.
          </p>
        </Prose>

        <RealWorld
          title="In the wild"
          examples={[
            {
              system: "Apache Kafka",
              detail: (
                <>
                  A durable, replayable log used as the central nervous system between services; consumers read at their
                  own pace, enabling time-decoupled fan-out.
                </>
              ),
            },
            {
              system: "gRPC",
              detail: (
                <>
                  Protobuf-over-HTTP/2 RPC with generated clients, streaming, and deadlines — the explicit, modern face
                  of remote calls.
                </>
              ),
            },
            {
              system: "RabbitMQ / NATS",
              detail: <>Brokers that buffer, route, and redeliver messages, decoupling producers from consumers.</>,
            },
            {
              system: "Stripe / Twilio webhooks",
              detail: (
                <>
                  Public REST APIs version explicitly and add fields without breaking integrations — backward/forward
                  compatibility as a product promise.
                </>
              ),
            },
          ]}
        />

        <Figure caption="The same record, three journeys. Only the database persists it long enough for 'data outlives code' to bite hardest — but all three demand compatibility in both directions.">
          <div className="grid gap-3 p-2 sm:grid-cols-3">
            {[
              { t: "Database", d: "writer → [stored bytes] → reader, possibly years later", tone: "var(--accent)" },
              { t: "Service", d: "client ⇄ server, synchronous, both up at once", tone: "var(--accent-2)" },
              { t: "Broker", d: "producer → [queue] → many consumers, buffered", tone: "var(--color-special)" },
            ].map((c) => (
              <div
                key={c.t}
                className="rounded-lg border p-4"
                style={{
                  borderColor: `color-mix(in oklab, ${c.tone} 35%, transparent)`,
                  background: `color-mix(in oklab, ${c.tone} 7%, var(--color-ink-900))`,
                }}
              >
                <div className="font-mono text-sm font-semibold" style={{ color: c.tone }}>
                  {c.t}
                </div>
                <div className="mt-1.5 font-mono text-[11px] leading-relaxed text-fg-muted">{c.d}</div>
              </div>
            ))}
          </div>
        </Figure>
      </Section>

      <Section
        id="in-production"
        kicker="In production"
        title="Compatibility as a product promise"
        intro={
          <>
            These rules aren&apos;t academic. Whole platforms are built on keeping old and new readers, writers, and
            stored bytes mutually intelligible — sometimes for a decade.
          </>
        }
      >
        <RealWorld
          title="How real systems keep old and new talking"
          examples={[
            {
              system: "Stripe API",
              detail: (
                <>
                  Versions are <strong>dates</strong> (e.g. <code>2025-04-30</code>); your account is pinned to one.
                  Engineers write only the latest format, and a <em>response compatibility layer</em> transforms each
                  reply backward to whatever version the caller pinned — adding fields and optional params is always a
                  backward-compatible change, so integrations never break.
                </>
              ),
            },
            {
              system: "LinkedIn + Avro",
              detail: (
                <>
                  LinkedIn pioneered Avro-over-Kafka at scale: its client registers each schema with a central registry
                  and stamps a schema <em>id</em> into the Kafka payload, so the Hadoop ingestion jobs (Camus, later
                  Gobblin) fetch the writer&apos;s schema and resolve it against their own — the pattern Confluent later
                  productised.
                </>
              ),
            },
            {
              system: "Confluent Schema Registry",
              detail: (
                <>
                  Enforces compatibility at <em>publish</em> time: <code>BACKWARD</code> (the default) lets new consumers
                  read old data, <code>FORWARD</code> lets old consumers read new data, <code>FULL</code> demands both,
                  and the <code>_TRANSITIVE</code> variants check against <em>every</em> past version, not just the last.
                </>
              ),
            },
            {
              system: "Protocol Buffers `reserved`",
              detail: (
                <>
                  To make &ldquo;never reuse a tag&rdquo; enforceable, <code>.proto</code> files mark retired field
                  numbers (and names) <code>reserved</code>; the compiler then refuses to compile any future schema that
                  tries to claim them back — turning a footgun into a build error.
                </>
              ),
            },
            {
              system: "gRPC",
              detail: (
                <>
                  Protobuf-over-HTTP/2 with generated, type-checked stubs in a dozen languages; the same tag rules that
                  govern storage govern the request/response contract between services on independent deploy cadences.
                </>
              ),
            },
          ]}
        />
      </Section>

      <Section id="further" kicker="Go deeper" title="Further reading">
        <Prose>
          <p>
            Primary sources for every claim in this chapter — start with Kleppmann&apos;s byte-by-byte post (he wrote the
            book), then the official format specs.
          </p>
        </Prose>
        <FurtherReading
          sources={[
            {
              title: "Schema evolution in Avro, Protocol Buffers and Thrift",
              url: "https://martin.kleppmann.com/2012/12/05/schema-evolution-in-avro-protocol-buffers-thrift.html",
              note: "Martin Kleppmann (DDIA's author) encodes one record in each format, byte for byte. The definitive companion to this chapter.",
            },
            {
              title: "Protocol Buffers — Language Guide (proto 3)",
              url: "https://protobuf.dev/programming-guides/proto3/",
              note: "Official guide: field numbers, default values, and the reserved keyword that stops you reusing a retired tag.",
            },
            {
              title: "Apache Avro — Specification (Schema Resolution)",
              url: "https://avro.apache.org/docs/1.11.1/specification/",
              note: "The exact rules for reconciling a writer's schema against a reader's: matching by name, defaults, and dropped fields.",
            },
            {
              title: "Confluent — Schema Evolution & Compatibility Types",
              url: "https://docs.confluent.io/platform/current/schema-registry/fundamentals/schema-evolution.html",
              note: "BACKWARD / FORWARD / FULL and their transitive variants, with which changes each one permits.",
            },
            {
              title: "Apache Thrift — Compact Protocol spec",
              url: "https://github.com/apache/thrift/blob/master/doc/specs/thrift-compact-protocol.md",
              note: "How CompactProtocol packs a field's tag-delta and type into one header byte using ZigZag varints.",
            },
            {
              title: "Stripe — APIs as infrastructure: future-proofing with versioning",
              url: "https://stripe.com/blog/api-versioning",
              note: "Stripe's engineering account of date-based versions and the response layer that keeps old integrations working.",
            },
          ]}
        />
      </Section>

      <Section id="test" kicker="Practice" title="Test yourself">
        <Prose>
          <p>
            Generate a fresh set of questions, or open the tutor and ask anything about encoding formats and dataflow.
            The tutor is grounded in this chapter&apos;s concepts.
          </p>
        </Prose>
        <Quiz chapterTitle="Encoding & Evolution" concepts={CONCEPTS} />
        <div className="mt-6">
          <AskClaude chapterTitle="Encoding & Evolution" concepts={CONCEPTS} />
        </div>
      </Section>

      <KeyTakeaways
        points={[
          "Encoding turns in-memory objects into a self-contained byte sequence; decoding reverses it. Avoid language-native serialization (lock-in, insecurity, poor versioning).",
          "Rolling upgrades force old and new code/data to coexist, demanding backward compatibility (new reads old) AND the harder forward compatibility (old reads new).",
          "Text formats (JSON/XML/CSV) are readable but verbose, weakly schema'd, and ambiguous about numbers and binary data.",
          "Thrift and Protocol Buffers key the wire on numeric field tags, not names — so renames are free, added fields must be optional/defaulted, and tags must never be reused.",
          "Avro puts neither names nor tags in the record, resolving a writer's schema against a reader's schema by name; great for dynamically generated schemas.",
          "Data flows three ways — via databases (data outlives code), via REST/RPC services (synchronous, beware timeouts and idempotence), and via message brokers (async, buffered, fan-out).",
          "A message broker decouples sender and recipient in time and space and survives outages, trading immediacy and simplicity for operational slack.",
        ]}
      />
    </ChapterShell>
  );
}
