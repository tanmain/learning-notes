import type { Metadata } from "next";
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
import { UnbundledDbDemo } from "./UnbundledDbDemo";
import { EndToEndDemo } from "./EndToEndDemo";
import { TimelinessIntegrityDemo } from "./TimelinessIntegrityDemo";
import { SurveillanceLens } from "./SurveillanceLens";

export const metadata: Metadata = { title: "The Future of Data Systems" };

const CONCEPTS = `Chapter 12 argues the future is dataflow: building correct systems by composing imperfect parts around immutable, ordered event logs rather than one monolithic database.

DATA INTEGRATION. No single tool fits every access pattern, so data must be kept in sync across many stores. Two ordering mechanisms: distributed transactions use locks for mutual exclusion + atomic commit (2PC) for exactly-once; log-based systems (CDC, event sourcing) use a totally-ordered log plus deterministic retry and idempotence. Updating a derived system from an event log can be made deterministic and idempotent. Derived data is updated asynchronously, so it lacks the timing guarantees (read-your-writes, linearizability) of transactional systems, but asynchrony contains faults locally. Total order broadcast = consensus; building a total order needs a single leader and is hard to scale past one node, and there is no defined order across datacenters/services/clients. Batch vs stream: batch = bounded input, functional/no side effects; stream = unbounded input + managed fault-tolerant state; stream gives low-latency views, batch reprocesses history to derive new views. Derived views enable gradual schema migration (old + new view side by side). Lambda architecture runs a batch system (exact, slow) and a stream system (approximate, fast) in parallel over the same immutable event log.

UNBUNDLING DATABASES. Batch/stream processors are like distributed triggers, stored procedures and materialized-view maintenance; derived stores are like indexes. Federated databases (e.g. PostgreSQL foreign data wrappers / polystores) unify READS behind one query interface; unbundling unifies WRITES — keeping writes in sync across heterogeneous stores, which is the hard part. Prefer an asynchronous log with idempotent writes over distributed transactions: loose coupling makes the system robust to component outages and lets teams develop independently. If one product does everything you need, just use it. Separate stateless application code from durable state. Dataflow: application code reacts to state changes in one place by causing state changes in another (vs treating the DB as a passive variable). A purchase needing an exchange rate can subscribe to a rate stream and keep a local copy (faster, more robust) instead of querying a rate service. Observing derived state = read path vs write path; caches/materialized views precompute; reads can themselves be events.

AIMING FOR CORRECTNESS. The end-to-end argument: low-level reliability (TCP) is not enough; exactly-once / effectively-once = arranging things so the effect is as if no fault occurred, usually via idempotence + an operation/request ID threaded from client to storage (2PC alone is insufficient). Uniqueness constraints require consensus; can be scaled by partitioning on the unique value, or enforced in log-based messaging by a single-threaded stream processor that sequentially decides conflicts. Multi-partition operations (e.g. money transfer across three partitions) achieve atomic-commit-equivalent correctness via a request ID logged once, then deduplicated debit/credit messages. Consistency conflates TIMELINESS (up-to-date reads; violation = eventual consistency) and INTEGRITY (no corruption/contradiction; violation = perpetual inconsistency, the worse one). Dataflow systems preserve integrity (via single-message writes, deterministic derivation, request-ID dedup, immutable reprocessable logs) without atomic commit or synchronous coordination — coordination-avoiding data systems, better performance and fault tolerance. Often acceptable to violate a constraint temporarily and apologize. Trust but verify: audit by actually reading data and restoring backups; event-based systems and Merkle trees (certificate transparency) aid self-auditing.

DOING THE RIGHT THING. Data is about people; treat it with dignity. Biased input yields biased, amplified output; predictive analytics stereotypes ("people like you"); accountability for algorithmic decisions is unclear. Privacy = freedom to choose what to reveal to whom, not secrecy. Tracking users as a side effect is surveillance; if ads fund the service, advertisers are the customer and behavioral data is the core asset. Meaningful consent and opt-out are often impossible (network effects, essential services). Don't install technologies that could enable a future police state; self-regulate, purge data when no longer needed.`;

export default function Page() {
  return (
    <ChapterShell slug="future" diagram={<Hero />}>
      {/* ----------------------------------------------------------- intro */}
      <Section
        kicker="The synthesis chapter"
        title="There is no one database to rule them all"
        intro={
          <>
            Every previous chapter sharpened a trade-off — replication vs. consistency, transactions vs.
            throughput, batch vs. stream. This final chapter refuses to pick a winner. Instead it offers a way to
            <em> compose</em> imperfect tools into a system that is, as a whole, correct: treat one immutable,
            ordered <strong>event log</strong> as the source of truth, and let everything else be a{" "}
            <strong>derived view</strong> maintained by dataflow.
          </>
        }
      >
        <Prose>
          <p>
            The recurring discovery of the book is that no single piece of software satisfies every access
            pattern. You want full-text search, so you bolt on Elasticsearch. You want sub-millisecond reads, so
            you add Redis. You want analytics, so the data lands in a warehouse. Each of these is a <em>derived
            data system</em> — a secondary representation of data that already lives somewhere else, kept around
            because it answers one kind of question faster. The engineering problem the chapter tackles is the
            unglamorous one underneath all of it: <strong>how do you keep all those copies in sync</strong>, even
            when machines crash and messages arrive twice?
          </p>
          <p>
            Kleppmann&apos;s answer is a single, opinionated idea threaded through the whole chapter:{" "}
            <strong>dataflow built on an immutable event log</strong>. Writes append events to a log that defines a
            total order. Every derived store — search index, cache, materialized aggregate, ML feature table —
            subscribes to that log and folds the events into its own shape using a <em>deterministic</em>{" "}
            function. Because events are immutable and derivation is deterministic and idempotent, the entire mess
            of heterogeneous stores becomes reasoning-friendly: a view that falls behind just catches up; a view
            that gets corrupted is rebuilt by replaying the log; a brand-new view is created by reprocessing from
            offset zero.
          </p>
        </Prose>
        <Callout variant="insight">
          The whole chapter rhymes with one sentence: <strong>make one log the source of truth, derive everything
          else from it deterministically, and your sprawling collection of databases starts behaving like a single
          coherent system</strong> — without the fragility of a distributed transaction spanning all of them.
        </Callout>
      </Section>

      {/* ----------------------------------------------------- DATA INTEGRATION */}
      <Section
        id="data-integration"
        kicker="Data Integration"
        title="Keeping derived data in sync"
        intro={
          <>
            The moment you have more than one store, you face the integration problem: a write must eventually be
            reflected everywhere it matters. There are two fundamentally different ways to order those writes —
            and the choice colours everything downstream.
          </>
        }
      >
        <Prose>
          <p>
            Suppose a product&apos;s price changes. That fact has to reach the primary database, the search index,
            the cache, and the analytics pipeline. How do you make sure they all agree on what happened, and in
            what order? There are two answers, and they sit at opposite ends of a spectrum.
          </p>
          <p>
            <strong>Distributed transactions</strong> decide on an ordering of writes by using{" "}
            <em>locks for mutual exclusion</em>, and use <em>atomic commit</em> (two-phase commit) to guarantee
            exactly-once effects across all participants. <strong>Log-based systems</strong> — change data capture
            and event sourcing — instead decide ordering by appending to a <em>single totally-ordered log</em>,
            and achieve correctness not through atomic commit but through <em>deterministic retry and
            idempotence</em>. The first relies on coordination at write time; the second relies on the log&apos;s
            order plus the fact that replaying an event has the same effect whether it happens once or three times.
          </p>
          <p>
            Why does the chapter favour the log? Because widespread, performant, interoperable distributed
            transactions across heterogeneous systems essentially do not exist — XA is fragile and slow, and most
            of your stores don&apos;t speak it anyway. An <strong>asynchronous event log with idempotent
            writes</strong> is the most promising, practical way to integrate different data systems today. The
            cost is that derived systems are updated <em>asynchronously</em>, so they don&apos;t offer the timing
            guarantees a transactional system does — no read-your-writes, no linearizability by default. But that
            same asynchrony is a feature: <strong>a fault in one consumer is contained locally</strong> and
            can&apos;t take down the writer or the other consumers.
          </p>
        </Prose>

        <CompareTable
          caption="Two ways to order writes across systems — and the philosophy each implies."
          columns={["Distributed transactions", "Log-based dataflow"]}
          rows={[
            {
              feature: "How writes are ordered",
              values: ["Locks / mutual exclusion at write time.", "Position in a single totally-ordered log."],
            },
            {
              feature: "Exactly-once via",
              values: ["Atomic commit (2PC) across participants.", "Deterministic retry + idempotence."],
            },
            {
              feature: "Timing guarantees",
              values: ["Linearizable, read-your-writes.", "Asynchronous — derived views lag."],
            },
            {
              feature: "Fault behaviour",
              values: ["A stuck participant blocks the commit.", "A faulty consumer is isolated; others proceed."],
            },
            {
              feature: "Across heterogeneous stores",
              values: ["Needs XA; fragile, rarely supported.", "Just consume the log; loosely coupled."],
            },
          ]}
        />

        <Analogy>
          A distributed transaction is a <strong>group photo</strong>: nobody is allowed to move until everyone is
          posed and the shutter fires at one instant — get one fidgety toddler and the whole shot stalls. A
          log-based system is a <strong>shared journal</strong>: events are written down in order, and each reader
          turns the pages at their own pace. A slow reader simply finishes the chapter later; they never freeze
          everyone else mid-pose.
        </Analogy>

        <Prose>
          <p>
            The log isn&apos;t magic, though, and the chapter is honest about its limits. Constructing a{" "}
            <strong>totally ordered log requires all events to pass through a single leader</strong> that decides
            the order. That works beautifully up to the throughput of one node — but there is{" "}
            <em>no defined order</em> for events that originate in different datacenters, in different services, or
            on a client that holds its own state. Agreeing on a single global order is exactly the problem of{" "}
            <strong>total order broadcast</strong>, which is equivalent to <em>consensus</em>; designing a
            consensus algorithm that scales past a single node&apos;s throughput is still an open research problem.
          </p>
        </Prose>

        <Callout variant="tradeoff" title="Total order has a ceiling">
          A single log gives you a clean global order — but only as fast as one leader can ingest. Partition the
          log for throughput and you give up a single total order across partitions; events in different partitions
          have no defined relative order. This is the same wall we hit in the consistency chapter: total order
          broadcast <em>is</em> consensus, and consensus doesn&apos;t shard for free.
        </Callout>

        <Prose>
          <p>
            Two engines maintain these derived views. <strong>Batch processing</strong> consumes a{" "}
            <em>bounded</em> input and has a strongly functional flavour: output depends only on input, with no
            side effects, so a failed job just re-runs. <strong>Stream processing</strong> is the same idea over an{" "}
            <em>unbounded</em> input, with the crucial addition of <em>managed, fault-tolerant state</em>. Streams
            reflect changes in derived views with low delay; batch lets you <strong>reprocess</strong> accumulated
            history to build an entirely new view of existing data. Spark famously does streaming on top of batch
            (micro-batches); Flink does batch as a special case of streaming.
          </p>
          <p>
            Reprocessing is the quiet superpower. Because the log is immutable, you can derive a{" "}
            <strong>new view alongside the old one</strong> and migrate gradually: stand up the new schema as a
            second derived view, let it catch up by replaying history, switch reads over once you trust it, then
            drop the old view. No big-bang migration, no downtime — schema evolution becomes a routine, reversible
            operation rather than a terrifying cutover.
          </p>
        </Prose>

        <Callout variant="note" title="Lambda architecture">
          The <strong>lambda architecture</strong> records all input as immutable events, then runs{" "}
          <em>two</em> systems in parallel over them: a <strong>batch</strong> system (e.g. Hadoop MapReduce) that
          produces a slow but <em>exact</em> view, and a <strong>stream</strong> system (e.g. Storm) that produces
          a fast but <em>approximate</em> view. Reads merge the two. It pioneered &quot;immutable log as source of
          truth&quot; — but maintaining two codebases that must produce the same result is painful, which is why
          unified engines (Flink, Spark Structured Streaming) that reprocess with a single code path are now
          preferred.
        </Callout>

        <RealWorld
          examples={[
            { system: "Apache Kafka", detail: <>The canonical durable, partitioned, totally-ordered (per partition) log used as the integration backbone between heterogeneous stores.</> },
            { system: "Debezium", detail: <>Change-data-capture that turns a database&apos;s replication stream into Kafka events, so a search index or cache can stay in sync with the system of record.</> },
            { system: "Apache Flink", detail: <>Stateful, fault-tolerant stream processing (treats batch as bounded streaming) — maintains derived views with low latency and supports reprocessing.</> },
            { system: "Elasticsearch + Postgres", detail: <>A classic pairing kept in sync by streaming Postgres changes into a Lucene-based search index, rather than dual-writing from the app.</> },
          ]}
        />
      </Section>

      {/* --------------------------------------------------- UNBUNDLING DATABASES */}
      <Section
        id="unbundling"
        kicker="Unbundling Databases"
        title="The database, taken apart"
        intro={
          <>
            A database is really a bundle of features: storage engines, secondary indexes, materialized views,
            triggers, replication. Unbundling means pulling those features out into separate, composable systems
            and wiring them together with a log — so you can mix the best storage engine for each job.
          </>
        }
      >
        <Prose>
          <p>
            Here is the analogy that unlocks the whole section: a stream or batch processor that maintains a
            derived store is doing exactly what a database&apos;s internals already do. A{" "}
            <strong>secondary index</strong> is a derived data structure the database keeps in sync with the table.
            A <strong>materialized view</strong> is a precomputed query result the database refreshes. A{" "}
            <strong>trigger</strong> fires application logic on a write. <em>Batch and stream processors are
            elaborate, distributed implementations of triggers, stored procedures, and materialized-view
            maintenance — and the derived stores they feed are just different kinds of index.</em> Unbundling means
            taking those mechanisms <em>out</em> of one monolithic database and reassembling them from
            independently-chosen pieces.
          </p>
          <p>There are two distinct ways to compose disparate storage and processing tools:</p>
          <ul>
            <li>
              <strong>Federated databases (unifying reads).</strong> Provide one query interface over many
              underlying engines — a <em>polystore</em>. PostgreSQL&apos;s <em>foreign data wrappers</em> are the
              textbook example: you write one SQL query and the server fans it out to a remote Postgres, a CSV
              file, or a NoSQL store. This makes reading across systems pleasant, but it doesn&apos;t touch the
              hard problem.
            </li>
            <li>
              <strong>Unbundled databases (unifying writes).</strong> Ensure that every data change ends up in{" "}
              <em>all</em> the right places, even under faults — synchronising writes across heterogeneous
              technologies. This is &quot;unbundling&quot; the database&apos;s index-maintenance machinery so it
              can keep disparate stores consistent.
            </li>
          </ul>
          <p>
            <strong>Keeping writes in sync is the genuinely hard engineering problem</strong>, and how you solve it
            is the crux. Doing it with distributed transactions across heterogeneous stores is usually the{" "}
            <em>wrong</em> solution — fragile, slow, poorly supported. An <strong>asynchronous event log with
            idempotent writes</strong> is far more robust and practical. The payoff is <em>loose coupling</em>:
            asynchronous streams make the system as a whole resilient to the outage or slowdown of any single
            component, and they let different teams build, improve, and operate their components independently.
          </p>
        </Prose>

        <Callout variant="warning" title="Don't unbundle for fun">
          Unbundling only pays off <strong>when no single product meets all your requirements</strong>. If one
          database genuinely does everything you need, use it — reassembling an equivalent from lower-level
          components is a great way to reinvent, badly, decades of someone else&apos;s engineering. The value of
          composition appears precisely when your needs span what any one tool can offer.
        </Callout>

        <Figure caption="Unbundling: the database's internal index-maintenance is pulled out into separate stores, kept in sync by a log instead of by the storage engine's internals.">
          <svg viewBox="0 0 640 220" className="w-full" role="img" aria-label="A monolithic database versus an unbundled set of stores fed by a log">
            {/* monolith */}
            <g>
              <rect x={20} y={40} width={150} height={140} rx={10} fill="var(--color-ink-900)" stroke="var(--color-line-strong)" strokeWidth={1.3} />
              <text x={95} y={32} textAnchor="middle" className="font-mono" fontSize={10} fontWeight={700} fill="var(--color-fg-muted)">monolithic DB</text>
              {["storage", "2nd index", "mat. view", "triggers"].map((t, i) => (
                <g key={t}>
                  <rect x={36} y={56 + i * 30} width={118} height={22} rx={4} fill="var(--color-ink-850)" stroke="var(--color-line)" strokeWidth={1} />
                  <text x={95} y={71 + i * 30} textAnchor="middle" className="font-mono" fontSize={9} fill="var(--color-fg-faint)">{t}</text>
                </g>
              ))}
            </g>

            <text x={210} y={114} textAnchor="middle" className="font-mono" fontSize={18} fill="var(--accent)">⇢</text>
            <text x={210} y={132} textAnchor="middle" className="font-mono" fontSize={7} fill="var(--color-fg-faint)">unbundle</text>

            {/* log */}
            <rect x={250} y={86} width={70} height={48} rx={8} fill="color-mix(in oklab, var(--accent) 12%, var(--color-ink-900))" stroke="var(--accent)" strokeWidth={1.3} />
            <text x={285} y={108} textAnchor="middle" className="font-mono" fontSize={9} fontWeight={700} fill="var(--accent)">event</text>
            <text x={285} y={120} textAnchor="middle" className="font-mono" fontSize={9} fontWeight={700} fill="var(--accent)">log</text>

            {/* separate stores */}
            {[
              { t: "OLTP store", y: 28, c: "var(--accent-2)" },
              { t: "search index", y: 90, c: "var(--accent)" },
              { t: "cache", y: 152, c: "var(--color-special)" },
            ].map((s) => (
              <g key={s.t}>
                <path
                  d={`M 320 110 C 380 110, 420 ${s.y + 16}, 470 ${s.y + 16}`}
                  fill="none"
                  stroke={s.c}
                  strokeWidth={1.2}
                  strokeOpacity={0.5}
                  className="flow-line"
                  style={{ strokeDasharray: "5 7" } as React.CSSProperties}
                />
                <rect x={470} y={s.y} width={150} height={32} rx={7} fill="var(--color-ink-900)" stroke={s.c} strokeWidth={1.3} strokeOpacity={0.7} />
                <text x={545} y={s.y + 20} textAnchor="middle" className="font-mono" fontSize={10} fontWeight={700} fill={s.c}>{s.t}</text>
              </g>
            ))}
          </svg>
        </Figure>

        <DemoFrame
          title="Unbundled database — one log, many derived views"
          description="Append product events to the immutable log on the left; with 'live dataflow' on, each derived view streams them and folds them into its own shape — a search index, a key-value cache, a live aggregate. Now CRASH one consumer: its view freezes and goes stale while the writer and every healthy view keep moving — the fault is contained locally. Restart it and it replays from its saved cursor to catch up. Add a brand-new consumer and watch it rebuild from offset 0. Flip off 'idempotent' and inject a duplicate delivery to see why deterministic, idempotent derivation is what keeps every view correct."
          right="dataflow"
        >
          <UnbundledDbDemo />
        </DemoFrame>

        <Analogy>
          A bundled database is a <strong>Swiss Army knife</strong> — every tool riveted into one handle. Unbundling
          is laying out a proper <strong>workshop</strong>: a dedicated screwdriver, a real saw, a precision
          caliper, each the best at its job. The price of admission is that you now own the <em>workbench</em> — the
          event log — that keeps every tool working from the same plan. Lose the workbench and you just have a
          drawer of loose blades.
        </Analogy>

        <Prose>
          <p>
            Unbundling also reshapes how application code relates to state. The durable trend is to keep{" "}
            <strong>stateless application logic separate from state management</strong>: don&apos;t bury business
            logic inside stored procedures, and don&apos;t hoard persistent state inside application processes. The
            two specialise and interact while staying independent. <strong>Dataflow</strong> inverts the usual
            relationship: rather than treating the database as a passive variable the application pokes at,{" "}
            <em>application code reacts to a state change in one place by triggering a state change in
            another</em>.
          </p>
          <p>
            The currency-conversion example makes this concrete. A service processing a purchase needs the current
            exchange rate. The <strong>microservices</strong> way: at purchase time, synchronously call an
            exchange-rate service. The <strong>dataflow</strong> way: subscribe to a stream of rate updates ahead
            of time, write each new rate into a <em>local</em> store, and at purchase time just read locally. The
            dataflow version is not only faster (no synchronous network hop on the hot path) — it&apos;s{" "}
            <strong>more robust</strong>, because the purchase still completes even if the rate service is down.
          </p>
        </Prose>

        <CodeBlock
          lang="ts"
          caption="Dataflow vs. microservice: subscribe-ahead-of-time and read locally, instead of a synchronous RPC on the hot path."
          code={`// MICROSERVICE — synchronous dependency on the hot path
async function handlePurchase(order) {
  const rate = await fetch(\`/rates/\${order.currency}\`); // blocks; fails if rate svc is down
  return order.amount * rate.value;
}

// DATAFLOW — react to rate-change events, keep a local copy
rateStream.subscribe(e => localRates.set(e.currency, e.rate)); // ahead of time
function handlePurchase(order) {
  const rate = localRates.get(order.currency);  // local read — fast, fault-isolated
  return order.amount * rate;
}`}
        />

        <Prose>
          <p>
            Finally, the chapter reframes reads and writes as two halves of the same dataflow. The{" "}
            <strong>write path</strong> updates a derived structure (e.g. indexing a document); the{" "}
            <strong>read path</strong> queries it (searching for a keyword). A full-text index moves work onto the
            write path so the read path is cheap; with no index, the read path must scan everything. A{" "}
            <strong>cache</strong> (a.k.a. a materialized view) pushes even further, precomputing results for the
            most common queries while rarer queries fall back to the index. And in the limit, you can model{" "}
            <strong>reads as events too</strong> — sending read and write events through the same stream processor —
            which lets you reconstruct exactly what a user saw before a decision and track causal dependencies.
          </p>
        </Prose>

        <DefinitionGrid
          items={[
            { term: "Federated database", def: <>A polystore: one query interface over many underlying engines (e.g. PostgreSQL foreign data wrappers). Unifies <em>reads</em>.</> },
            { term: "Unbundled database", def: <>Synchronising <em>writes</em> across heterogeneous stores via a log + idempotent consumers — the database&apos;s index maintenance, taken apart.</> },
            { term: "Derived data system", def: <>A secondary representation (index, cache, view) computed from a primary source; can always be rebuilt by reprocessing.</> },
            { term: "Write path vs read path", def: <>Work done when data changes (build the index) vs. work done when data is queried (search it). A cache shifts work toward the write path.</> },
          ]}
        />

        <RealWorld
          examples={[
            { system: "PostgreSQL FDW", detail: <>Foreign data wrappers query remote databases and files as if they were local tables — the federated / read-unification approach.</> },
            { system: "Kafka + Kafka Streams", detail: <>The log plus a stream-processing library that maintains local materialized state stores — unbundling write-synchronisation in practice.</> },
            { system: "Samza", detail: <>LinkedIn&apos;s stream processor built on Kafka, designed precisely for the &quot;turn the database inside out&quot; / unbundling model.</> },
            { system: "Materialize / ksqlDB", detail: <>Maintain incrementally-updated materialized views over event streams — a database&apos;s view-maintenance feature, unbundled into its own engine.</> },
          ]}
        />
      </Section>

      {/* ----------------------------------------------------- AIMING FOR CORRECTNESS */}
      <Section
        id="correctness"
        kicker="Aiming for Correctness"
        title="Correctness without distributed transactions"
        intro={
          <>
            Transactions with serializability and atomic commit are the established way to be correct — but
            they&apos;re expensive and don&apos;t span heterogeneous systems. This section builds correctness for
            dataflow architectures from a different toolkit: end-to-end identifiers, idempotence, and a sharp
            distinction between two things we usually muddle together as &quot;consistency.&quot;
          </>
        }
      >
        <Prose>
          <p>
            If your application can tolerate occasionally losing or corrupting data, life is simple. If it
            can&apos;t, the classical answer is serializable transactions plus atomic commit — and that answer
            isn&apos;t going away. But dataflow systems suggest another way to think about correctness, and it
            starts with the <strong>end-to-end argument</strong>: a function (like duplicate suppression) can only
            be implemented correctly with the knowledge and help of the application at the <em>endpoints</em> of a
            communication system; providing it as a feature of the network alone is impossible.
          </p>
          <p>
            The motivating failure is the duplicate request. You want <strong>exactly-once</strong> (or{" "}
            <em>effectively-once</em>) semantics: arrange the computation so the final effect is the same as if no
            fault had occurred. Suppose a user clicks &quot;pay&quot; and the request times out. Did it succeed?
            If they retry and the first one had actually gone through, they get charged twice. Crucially,{" "}
            <strong>low-level reliability does not fix this</strong>: TCP retransmits lost <em>packets</em>, but a
            timed-out-then-resent <em>request</em> is a brand-new TCP connection carrying a logically duplicate
            operation — TCP never sees it as a duplicate. <strong>Two-phase commit is also insufficient</strong>,
            because it doesn&apos;t prevent the client from submitting the operation twice in the first place.
          </p>
          <p>
            The robust fix is <strong>idempotence anchored by an end-to-end operation ID</strong>. The client
            mints a unique ID (a UUID, or a hash of the form fields) and includes it with the request. It threads
            that <em>same</em> ID through every retry, and the storage layer records which IDs it has already
            applied, rejecting repeats. The ID has to travel <em>all the way</em> from the end-user client to the
            database — an end-to-end transaction identifier — or the gap reopens. Idempotence also needs care:
            you maintain operation-ID metadata and use fencing tokens when failing over between nodes.
          </p>
        </Prose>

        <DemoFrame
          title="Exactly-once needs an end-to-end ID"
          description="Submit “charge $10” over a flaky network that drops requests and triggers client retries. In 'naive' mode the request carries no operation ID, so every retry that lands is applied — wait for a double-charge. Switch to 'end-to-end op-id' and the client re-sends one stable ID on every retry; the database dedupes by ID and the charge applies exactly once, however many copies arrive."
          right="idempotence"
        >
          <EndToEndDemo />
        </DemoFrame>

        <Analogy>
          Think of mailing a cheque with a <strong>numbered invoice</strong>. If you fear it got lost and mail a
          second copy, the recipient sees the same invoice number twice and pays it once — the number is the
          end-to-end ID. A courier&apos;s &quot;guaranteed delivery&quot; (the network layer) doesn&apos;t help:
          it just means <em>both</em> envelopes definitely arrive. Only matching on the invoice number, at the
          endpoint that actually moves the money, prevents paying twice.
        </Analogy>

        <Callout variant="insight" title="Constraints, without locking the world">
          A <strong>uniqueness constraint</strong> (unique username, no double-spend) fundamentally{" "}
          <em>requires consensus</em> — and the usual way to get consensus is a single leader. Log-based messaging
          gets it almost for free: a stream processor consuming one log partition <strong>sequentially on a single
          thread</strong> can deterministically decide which of two conflicting requests came first. It emits a
          &quot;granted&quot; for the first claim of a username and a &quot;rejected&quot; for the rest; the client
          waits for its verdict on an output stream. Partition by the value that must be unique (e.g. hash of the
          username) and this scales out — no atomic commit anywhere.
        </Callout>

        <Prose>
          <p>
            The same trick handles operations spanning <em>multiple</em> partitions, where the textbook approach
            demands an atomic commit. Consider transferring money from account A to account B — three partitions
            are involved (the request ID, the payer A, the payee B). Equivalent correctness is achievable with
            partitioned logs and <strong>no atomic commit</strong>:
          </p>
          <ul>
            <li>The client gives the transfer a unique <strong>request ID</strong> and appends it to a log partitioned by that ID.</li>
            <li>A stream processor reads the request and emits <em>two</em> messages: a <strong>debit</strong> to A (partitioned by A) and a <strong>credit</strong> to B (partitioned by B), each carrying the original request ID.</li>
            <li>Downstream processors consume those streams, <strong>deduplicate by request ID</strong>, and apply the balance changes idempotently.</li>
          </ul>
          <p>
            Because each step is deterministic and idempotent, the transfer is effectively atomic across partitions
            — assembled from single-partition, single-threaded decisions rather than a global lock.
          </p>
        </Prose>

        <Callout variant="tradeoff" title="Timeliness vs. integrity — the key distinction">
          The word &quot;consistency&quot; conflates two very different requirements.{" "}
          <strong>Timeliness</strong> means users see an up-to-date state; violating it gives <em>eventual
          consistency</em> — annoying but self-healing. <strong>Integrity</strong> means absence of corruption: no
          lost data, no contradictions, derivations are correct; violating it gives <em>perpetual
          inconsistency</em> — a permanent wrong answer that won&apos;t fix itself. <strong>Integrity is the one
          that really matters</strong>, and the good news is that dataflow systems are excellent at it.
        </Callout>

        <DemoFrame
          title="Timeliness, integrity & coordination-avoidance"
          description="Pick how a constraint is enforced and watch the trade-off. Synchronous coordination gives perfect timeliness and integrity but high latency and poor fault tolerance. Log-based dataflow preserves full integrity with little coordination — reads just lag. 'Apologize later' is fastest and most available, but lets the constraint break temporarily. Watch the marker move between the safe zone and the perpetual-inconsistency band."
          right="coordination dial"
        >
          <TimelinessIntegrityDemo />
        </DemoFrame>

        <Prose>
          <p>
            When you process events asynchronously, timeliness isn&apos;t guaranteed unless you explicitly build a
            consumer that waits for a message to appear on an output stream. But <strong>integrity is
            central</strong> to streaming and can be preserved without distributed transactions, through a
            combination of: representing each write as a <em>single</em> self-contained message (event sourcing);
            deriving all downstream state with <em>deterministic</em> functions; threading a{" "}
            <em>client-generated request ID</em> for end-to-end dedup and idempotence; and keeping messages{" "}
            <em>immutable</em> so derived data can be reprocessed. The result: <strong>comparable correctness with
            much better performance and operational robustness</strong> than 2PC.
          </p>
          <p>
            This leads to <strong>coordination-avoiding data systems</strong>. Two observations combine: (1)
            dataflow can maintain integrity on derived data without atomic commit, linearizability, or synchronous
            cross-partition coordination; and (2) although <em>strict</em> uniqueness needs timeliness and
            coordination, many applications are perfectly happy with <em>loose</em> constraints that may be briefly
            violated and fixed up afterwards. In many business contexts it&apos;s genuinely fine to violate a
            constraint and <strong>apologize</strong> later — the cost of the occasional refund or apology is far
            lower than the cost of coordinating on every write. Systems that avoid coordination achieve better
            performance and fault tolerance while still giving strong integrity guarantees.
          </p>
        </Prose>

        <Callout variant="note" title="Trust, but verify">
          ACID databases trained us to <em>blindly trust</em> the technology and neglect auditability. But if you
          want to be sure your data is still there, you have to actually <strong>read it and check</strong> — and
          actually restore from backups periodically, not just assume they work. <strong>Self-validating /
          self-auditing</strong> systems continually check their own integrity. Event-based systems audit well
          (the log is the evidence), and cryptographic integrity checking often uses <strong>Merkle trees</strong>{" "}
          — the same structure behind <em>certificate transparency</em>, which verifies TLS certificates, well
          outside the cryptocurrency hype.
        </Callout>

        <RealWorld
          examples={[
            { system: "Stripe idempotency keys", detail: <>A client-supplied <code>Idempotency-Key</code> header makes a retried &quot;create charge&quot; safe — the canonical end-to-end operation ID in production.</> },
            { system: "Kafka exactly-once (EOS)", detail: <>Idempotent producers + transactional writes give effectively-once stream processing without a classic 2PC across external systems.</> },
            { system: "Certificate Transparency", detail: <>Public Merkle-tree logs let anyone audit which TLS certificates a CA issued — self-auditing integrity at internet scale.</> },
            { system: "TigerBeetle", detail: <>A financial datastore built around deterministic, idempotent, log-ordered processing of debits/credits — coordination-avoidance applied to money.</> },
          ]}
        />
      </Section>

      {/* ----------------------------------------------------- DOING THE RIGHT THING */}
      <Section
        id="ethics"
        kicker="Doing the Right Thing"
        title="Data is about people"
        intro={
          <>
            The chapter ends not with a protocol but with a conscience. Most datasets are ultimately about humans
            — their behaviour, interests, and identity — and the engineer who builds the pipes shares
            responsibility for what flows through them. Technical power without ethical reflection is a liability.
          </>
        }
      >
        <Prose>
          <p>
            Kleppmann closes the book by insisting it is <strong>not enough to focus on the technology and ignore
            its consequences</strong> — the ethical responsibility is ours to bear too. Several failure modes
            recur. <strong>Bias in, bias out and amplified</strong>: if the input to an algorithm carries
            systematic bias, the system will learn and magnify it; the belief that biased data can yield fair,
            impartial output is, on its face, absurd. <strong>Stereotyping</strong>: a credit score asks &quot;how
            did <em>you</em> behave?&quot;, but much predictive analytics asks &quot;who is similar to you, and how
            did <em>people like you</em> behave?&quot; — judging an individual by a group. And{" "}
            <strong>accountability evaporates</strong>: when a human errs we can hold them to account; when an
            algorithm wrongly excludes someone from society with little chance of appeal, who is responsible?
          </p>
          <p>
            <strong>Privacy</strong> is widely misunderstood. It does not mean keeping everything secret; it means
            having the <em>freedom to choose</em> what to reveal, to whom, and what to keep private. When a company
            says &quot;trust us with your data,&quot; that right to choose is quietly transferred from the
            individual to the company — and even a promise not to <em>sell</em> data usually reserves broad rights
            to analyse it internally, far beyond what the user can see.
          </p>
        </Prose>

        <Callout variant="warning" title="Surveillance by another name">
          When a system stores only what a user deliberately entered, it serves the user — the user is the
          customer. When a user&apos;s activity is logged as a <em>side effect</em> of using a service, the
          relationship changes: the service develops interests of its own, often funded by advertisers who are the{" "}
          <em>real</em> customers. Kleppmann&apos;s thought experiment: re-read the data industry&apos;s language
          with the word <strong>&quot;data&quot;</strong> replaced by <strong>&quot;surveillance.&quot;</strong>{" "}
          Try it below.
        </Callout>

        <DemoFrame
          title="The surveillance lens"
          description="Flip the toggle to swap the word “data” for “surveillance” in everyday phrases from the data economy, and re-read them. It is the same sentence — only the euphemism has been removed."
          right="thought experiment"
        >
          <SurveillanceLens />
        </DemoFrame>

        <Analogy>
          Imagine a landlord who installs a free smart thermostat in every flat — &quot;to improve your
          comfort.&quot; Helpful, until you learn it also logs when you&apos;re home, who visits, and how long you
          shower, and sells the pattern to insurers. The device never changed; what changed is whose interests it
          quietly serves. Most &quot;free&quot; data services are that thermostat, and the rent you pay is your
          behavioural exhaust.
        </Analogy>

        <Prose>
          <p>
            The notion of <strong>consent</strong> mostly collapses under scrutiny. Users can&apos;t give
            meaningful consent without understanding what happens to their data, and that understanding is rarely
            available. Data from one user also reveals things about <em>other</em> people who never agreed to
            anything. And &quot;just opt out&quot; isn&apos;t a real choice when a service has strong{" "}
            <strong>network effects</strong> or is &quot;regarded by most as essential for basic social
            participation&quot; — declining carries a social and professional cost that only the privileged can
            afford. For those in a less privileged position, surveillance becomes effectively inescapable.
          </p>
          <p>
            There is also a <strong>time dimension</strong>. When you collect data, you must consider not just
            today&apos;s government but every future one — there is no guarantee they will all respect civil
            liberties, and &quot;it is poor civic hygiene to install technologies that could someday facilitate a
            police state.&quot; The honest move is <strong>systems thinking</strong>: predicting consequences by
            reasoning about the entire socio-technical system, not just the code. Data and models should be{" "}
            <em>our tools, not our masters</em> — improving the future over the past takes moral imagination, which
            only humans can supply.
          </p>
        </Prose>

        <Callout variant="insight" title="A professional ethic">
          Kleppmann&apos;s charge to the reader is concrete: stop treating users as metrics to be optimised and
          remember they are humans who deserve dignity and agency; <strong>self-regulate</strong> data collection
          to earn and keep people&apos;s trust; <strong>educate</strong> users about how their data is used instead
          of keeping them in the dark; preserve each person&apos;s control over their own data; and{" "}
          <strong>don&apos;t retain data forever — purge it once it&apos;s no longer needed</strong>. He likens it
          to the industrial revolution: regulation (clean rivers, safe workplaces, no child labour) raised costs
          but benefited society enormously. The same maturation is overdue for data.
        </Callout>

        <RealWorld
          examples={[
            { system: "GDPR / data-protection law", detail: <>Codifies consent, purpose limitation, the right to erasure, and data minimisation — exactly the &quot;purge data when no longer needed&quot; ethic, made statutory.</> },
            { system: "ACM Code of Ethics", detail: <>The professional guideline Kleppmann cites: software engineers have responsibility for the societal consequences of what they build.</> },
            { system: "Recommendation feeds", detail: <>Optimising purely for engagement produces filter bubbles and echo chambers where misinformation and polarisation breed — a systems-thinking failure.</> },
            { system: "Algorithmic risk scores", detail: <>Pretrial and credit-risk models have been shown to encode and amplify historical bias, denying people opportunity with little recourse or accountability.</> },
          ]}
        />
      </Section>

      {/* ------------------------------------------------------- see it explained */}
      <Section
        id="watch"
        kicker="See it explained"
        title="Watch the ideas in motion"
        intro={
          <>
            Two talks that bring this chapter to life. The first is the talk that <em>named</em> this whole way of
            thinking; the second shows the unbundled, stream-as-source-of-truth model running in a real query
            engine.
          </>
        }
      >
        <Prose>
          <p>
            Martin Kleppmann&apos;s <strong>&quot;Turning the database inside-out&quot;</strong> (Strange Loop 2014)
            is the origin of the dataflow framing this chapter rests on: stop hiding the replication log inside the
            database, make it the public interface, and treat every store — indexes, caches, materialized views — as
            a derived stream consumer. Watching it is the fastest way to internalise why an append-only log of
            immutable facts changes how the whole system composes.
          </p>
        </Prose>

        <YouTubeEmbed
          videoId="fU9hR3kiOK0"
          title="Turning the database inside-out with Apache Samza — Martin Kleppmann (Strange Loop 2014)"
          channel="Strange Loop Conference"
        />

        <Prose>
          <p>
            Then Tim Berglund&apos;s <strong>&quot;Processing Streaming Data with KSQL&quot;</strong> (GOTO 2019)
            makes the &quot;materialized view over a stream&quot; idea concrete: you declare derived tables with SQL
            over Kafka topics, and the engine keeps them continuously up to date — exactly the unbundled
            view-maintenance the chapter describes, but as something you can actually type.
          </p>
        </Prose>

        <YouTubeEmbed
          videoId="mJDbQ2gqo2g"
          title="Processing Streaming Data with KSQL — Tim Berglund (GOTO 2019)"
          channel="GOTO Conferences"
        />
      </Section>

      {/* ------------------------------------------------------- synthesis + reading */}
      <Section
        id="in-production"
        kicker="The whole picture"
        title="Where this lives in production"
        intro={
          <>
            The chapter&apos;s thesis isn&apos;t speculative — the log-as-source-of-truth, unbundled, coordination-
            avoiding architecture runs at scale today. A few systems that embody the whole stack, end to end.
          </>
        }
      >
        <RealWorld
          title="Dataflow architectures in the wild"
          examples={[
            {
              system: "LinkedIn / Kafka + Samza",
              detail: (
                <>
                  The birthplace of &quot;turning the database inside-out.&quot; LinkedIn runs Kafka as a central
                  commit log and Samza stream processors that maintain derived stores — the canonical unbundled
                  database, deployed at trillions of messages a day.
                </>
              ),
            },
            {
              system: "Debezium + Elasticsearch",
              detail: (
                <>
                  A very common production pattern: Debezium captures a database&apos;s change log into Kafka, and a
                  consumer keeps a Lucene/Elasticsearch index in sync — the search index as a derived view, never
                  dual-written from the app.
                </>
              ),
            },
            {
              system: "Stripe idempotency keys",
              detail: (
                <>
                  The end-to-end argument as a public API: a client-supplied <code>Idempotency-Key</code> lets a
                  retried &quot;create charge&quot; be applied exactly once. Stripe persists the key and its result,
                  so duplicate requests return the original response instead of charging twice.
                </>
              ),
            },
            {
              system: "Certificate Transparency",
              detail: (
                <>
                  &quot;Trust but verify&quot; at internet scale: append-only Merkle-tree logs of every issued TLS
                  certificate let anyone audit a CA. The log is the evidence — self-auditing integrity, no
                  blockchain required.
                </>
              ),
            },
            {
              system: "Materialize / ksqlDB",
              detail: (
                <>
                  Databases whose entire job is the unbundled view-maintenance feature: define a SQL view over event
                  streams and it stays incrementally up to date, with the stream — not a table — as the source of
                  truth.
                </>
              ),
            },
          ]}
        />

        <FurtherReading
          title="Primary sources & deeper reading"
          sources={[
            {
              title: "Turning the database inside-out with Apache Samza",
              url: "https://www.confluent.io/blog/turning-the-database-inside-out-with-apache-samza/",
              note: "Kleppmann's foundational essay (the Strange Loop transcript): the log as source of truth, indexes/caches/views as derived stream consumers.",
            },
            {
              title: "Questioning the Lambda Architecture",
              url: "https://www.oreilly.com/radar/questioning-the-lambda-architecture/",
              note: "Jay Kreps' argument for the Kappa architecture — one stream-processing code path with reprocessing, instead of parallel batch + stream systems.",
            },
            {
              title: "End-to-End Arguments in System Design (Saltzer, Reed & Clark, 1984)",
              url: "https://web.mit.edu/saltzer/www/publications/endtoend/endtoend.pdf",
              note: "The classic paper behind exactly-once: correctness for things like duplicate suppression can only be guaranteed at the endpoints, not by the network.",
            },
            {
              title: "Online Event Processing (Kleppmann, ACM Queue 2019)",
              url: "https://queue.acm.org/detail.cfm?id=3321612",
              note: "Why distributed transactions failed across heterogeneous stores, and how append-only event logs (OLEP) recover atomicity and integrity without them.",
            },
            {
              title: "Coordination Avoidance in Database Systems (Bailis et al., VLDB 2015)",
              url: "http://www.vldb.org/pvldb/vol8/p185-bailis.pdf",
              note: "The 'invariant confluence' framework: a formal test for which constraints genuinely need coordination and which can be enforced without it.",
            },
            {
              title: "Designing robust and predictable APIs with idempotency",
              url: "https://stripe.com/blog/idempotency",
              note: "Stripe's engineering write-up on idempotency keys — the end-to-end operation ID, productionised for payments.",
            },
          ]}
        />
      </Section>

      {/* ----------------------------------------------------------- practice */}
      <Section id="test" kicker="Practice" title="Test yourself">
        <Prose>
          <p>
            Generate a fresh set of questions on the future of data systems — choose a difficulty, answer, and hit{" "}
            <em>discuss</em> on anything you want to dig into. The tutor below is grounded in this exact chapter.
          </p>
        </Prose>
        <Quiz chapterTitle="The Future of Data Systems" concepts={CONCEPTS} />
        <div className="mt-6">
          <AskClaude chapterTitle="The Future of Data Systems" concepts={CONCEPTS} />
        </div>
      </Section>

      <KeyTakeaways
        points={[
          "No single tool fits every access pattern, so data must be integrated across stores; an asynchronous, totally-ordered event log with idempotent consumers is the most practical integration backbone — far more robust than distributed transactions across heterogeneous systems.",
          "Distributed transactions order writes with locks + atomic commit; log-based dataflow orders them by log position and achieves exactly-once via deterministic retry and idempotence — trading linearizable timeliness for fault isolation and loose coupling.",
          "Unbundling the database means pulling apart its index/view/trigger machinery into composable stores wired by a log. Federated DBs unify reads; unbundling unifies the harder problem of writes. Only unbundle when no single product meets your needs.",
          "Exactly-once correctness is an end-to-end property: TCP and even 2PC can't prevent duplicate requests — only an operation/request ID threaded from client to storage, plus idempotent application, can.",
          "'Consistency' splits into timeliness (up-to-date reads; violation = eventual consistency) and integrity (no corruption; violation = perpetual inconsistency). Integrity is the one that matters, and dataflow preserves it without synchronous coordination.",
          "Coordination-avoiding systems keep strong integrity with low latency and high availability; strict uniqueness still needs consensus, but many constraints can be violated temporarily and fixed by apologizing — and you should audit by actually reading data and restoring backups.",
          "Data is about people: biased input is amplified, predictive analytics stereotypes, and accountability blurs. Treat tracking-as-a-side-effect as surveillance, respect privacy as the freedom to choose what to reveal, self-regulate, and purge data once it's no longer needed.",
        ]}
      />
    </ChapterShell>
  );
}
