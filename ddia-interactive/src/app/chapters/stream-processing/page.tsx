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
import { LogConsumerDemo } from "./LogConsumerDemo";
import { BrokerReplayDemo } from "./BrokerReplayDemo";
import { WindowDemo } from "./WindowDemo";
import { CdcDemo } from "./CdcDemo";
import { EventTimeDemo } from "./EventTimeDemo";

export const metadata: Metadata = { title: "Stream Processing" };

const CONCEPTS = `Stream processing handles unbounded data processed incrementally as it arrives, unlike batch processing over a bounded dataset. A record is an event: something that happened at a point in time, generated once by a producer (publisher) and consumed by many consumers (subscribers); related events form a topic or stream.

Transmitting event streams: polling a datastore is expensive for continual processing, so messaging systems notify consumers. Direct messaging (UDP multicast, ZeroMQ, StatsD, webhooks) is low-latency but assumes producers/consumers are always online and tolerates little fault. Message brokers (RabbitMQ, ActiveMQ, JMS/AMQP, Google Cloud Pub/Sub) centralize durability; consumers are asynchronous. Key questions: what if producers outrun consumers (drop, buffer, or apply backpressure/flow control) and what if nodes crash (durability via disk/replication). AMQP/JMS brokers delete messages on acknowledgement (destructive read), use load balancing (one consumer per message) or fan-out (all consumers); load balancing plus redelivery reorders messages.

Log-based message brokers (Apache Kafka, Amazon Kinesis, Twitter DistributedLog) combine durable storage with low-latency notification. A log is an append-only sequence on disk; producers append, consumers read sequentially. Logs are partitioned across machines for throughput; within a partition each message gets a monotonically increasing offset (like an LSN). Reading is non-destructive, so fan-out is free and consumers track their own offset, enabling replay. A consumer that lags past a trimmed/old segment misses messages, but only that consumer is affected. Offset acts like single-leader replication: broker = leader, consumer = follower.

Databases and streams: a replication log is a stream of write events. Dual writes (writing to DB then index then cache directly) cause race conditions and partial-failure inconsistency. Change data capture (CDC) observes all DB changes and extracts them as a stream to derived data systems (search index, cache, warehouse) — making one DB the leader and the others followers; tools: Debezium, Maxwell, Bottled Water, Kafka Connect. Log compaction keeps only the latest value per key (tombstones mark deletes). Event sourcing stores all application state changes as an immutable log of events (distinct from commands, which may be rejected); current state is derived by replaying events, with snapshots for speed. CQRS separates write form from read form. Downside: derived views are asynchronous (read-your-writes issues).

Processing streams: an operator/job transforms input streams to output streams, but a stream never ends. Complex event processing (CEP: Esper) searches for patterns; stream analytics (Storm, Spark Streaming, Flink, Samza, Kafka Streams) computes aggregations over windows. Event time vs processing time: windowing by the processing machine's clock breaks under lag; use event time but handle straggler events (ignore-and-count, or publish a correction). Windows: tumbling (fixed, non-overlapping), hopping (fixed, overlapping by a hop), sliding (per-event neighbourhood), session (closes after inactivity gap). Joins: stream-stream (maintain windowed state by key), stream-table (enrich events via a local CDC-fed copy of a table), table-table (materialized view maintenance); time-dependence causes slowly-changing-dimension nondeterminism, fixed by versioned identifiers. Fault tolerance: exactly-once / effectively-once via micro-batching (Spark Streaming), checkpointing (Flink), distributed transactions, or idempotence; recover operator state via local replication or snapshots to durable storage (Flink to HDFS, Kafka Streams/Samza to a compacted Kafka topic, VoltDB by redundant processing).`;

export default function Page() {
  return (
    <ChapterShell slug="stream-processing" diagram={<Hero />}>
      {/* ============================================================ intro */}
      <Section
        kicker="The shift"
        title="From bounded files to never-ending data"
        intro="Batch jobs read a fixed input and finish. The real world doesn't pause: clicks, sensor readings, payments, and log lines arrive without end. Stream processing is the discipline of computing over data that is still being written."
      >
        <Prose>
          <p>
            In the previous chapter, a <strong>batch job</strong> read a complete, immutable input, ran a
            computation, and produced an output. Its defining luxury was that the input <em>stopped</em>. A stream
            turns that assumption inside out. The input is <strong>unbounded</strong>: it has a beginning but no end,
            so you can never wait for &ldquo;all&rdquo; the data before computing. Instead you process records{" "}
            <em>incrementally</em>, as soon as they appear, and your job — once started — runs forever.
          </p>
          <p>
            The atom of a stream is the <strong>event</strong>: a small, immutable, self-contained record describing
            something that happened at a point in time, usually stamped with a clock reading. An event is generated{" "}
            <em>once</em> by a <strong>producer</strong> (also called a publisher or sender) and may then be read by
            many <strong>consumers</strong> (subscribers or recipients). Events about the same thing are grouped into
            a <strong>topic</strong> or <strong>stream</strong>. This chapter answers three questions in turn: how do
            we <em>transmit</em> events from producers to consumers, what is the deep relationship between{" "}
            <em>databases and streams</em>, and how do we actually <em>process</em> an endless stream to get useful
            answers?
          </p>
        </Prose>
        <Callout variant="insight">
          One idea runs through the entire chapter: a <strong>durable, ordered log</strong> plus{" "}
          <strong>independent cursors</strong>. Once events are written down in order and reading them is
          non-destructive, you get fan-out, replay, derived views, and a clean recovery story almost for free. Keep
          the hero diagram above in mind — it is the spine of everything below.
        </Callout>
      </Section>

      {/* ===================================================== 1. transmit */}
      <Section
        id="transmitting"
        kicker="Part 1 · Transmitting Event Streams"
        title="Getting events from producers to consumers"
        intro="A file or database can connect a producer to a consumer, but polling for new rows is wasteful. Messaging systems exist to push events the moment they appear — and they differ enormously in what happens under load and under failure."
      >
        <Prose>
          <p>
            The crudest pipe is a shared datastore: the producer inserts rows, and each consumer periodically{" "}
            <strong>polls</strong> for rows that appeared since it last looked. This works, but for continual
            low-latency processing it is expensive — the more often you poll for freshness, the more pointless empty
            queries you run. Databases offer <strong>triggers</strong>, but they are limited and fragile. So a family
            of specialised tools grew up purely to <em>deliver event notifications</em>.
          </p>
          <p>
            When evaluating any messaging system, DDIA reduces the design space to two questions:
          </p>
          <ul>
            <li>
              <strong>What if producers outrun consumers?</strong> The system can <em>drop</em> messages,{" "}
              <em>buffer</em> them in a queue (which can grow without bound), or apply <strong>backpressure</strong>{" "}
              (a.k.a. flow control) — blocking the producer until the consumer catches up.
            </li>
            <li>
              <strong>What if a node crashes or goes offline?</strong> Are messages lost? Durability costs something:
              writing to disk, replicating, or both.
            </li>
          </ul>
          <p>
            <strong>Direct messaging</strong> systems skip any intermediary. UDP multicast (low latency, app-level
            recovery of lost packets), brokerless libraries like <em>ZeroMQ</em>, metrics agents like{" "}
            <em>StatsD</em> over unreliable UDP, and <strong>webhooks</strong> (one service calls another&apos;s
            registered callback URL) all push straight from producer to consumer. They are fast but brittle: they
            assume both sides are always online, and the application must itself tolerate message loss. If a consumer
            is offline, it simply misses messages.
          </p>
          <p>
            A <strong>message broker</strong> (message queue) inserts a server in the middle. Producers and consumers
            connect to it as clients; the broker absorbs the durability problem so individual clients can come and
            go. Consumers become <em>asynchronous</em>: a producer waits only for the broker to acknowledge that it
            buffered the message, not for any consumer to process it. Brokers in the JMS/AMQP tradition (RabbitMQ,
            ActiveMQ, IBM MQ, Azure Service Bus, Google Cloud Pub/Sub) usually <strong>delete a message once it has
            been acknowledged</strong> — which makes the read destructive and the broker unsuitable for long-term
            storage. They assume the working set (the backlog) stays small.
          </p>
          <p>
            When several consumers share one topic, two patterns appear. <strong>Load balancing</strong> delivers
            each message to <em>one</em> of the consumers, spreading work — but combined with redelivery on failure,
            it <em>reorders</em> messages. <strong>Fan-out</strong> delivers every message to <em>all</em> consumers.
            To stop messages being lost, brokers use <strong>acknowledgements</strong>: a consumer must explicitly
            confirm it finished processing before the broker drops the message.
          </p>
        </Prose>

        <DefinitionGrid
          items={[
            { term: "Producer / Consumer", def: <>The writer and reader of events. One producer, potentially many consumers; both are decoupled by the transport.</> },
            { term: "Topic / Stream", def: <>A named group of related events. In a log, often realised as a set of partitions.</> },
            { term: "Backpressure", def: <>Flow control: the consumer (via the broker) slows or blocks the producer instead of dropping or unboundedly buffering.</> },
            { term: "Acknowledgement", def: <>A consumer&apos;s explicit signal that a message was processed, so the broker can stop redelivering it.</> },
            { term: "Load balancing", def: <>Each message goes to exactly one consumer in a group — parallelism, but redelivery can reorder.</> },
            { term: "Fan-out", def: <>Each message is delivered to every consumer independently — no contention between them.</> },
          ]}
        />

        <Analogy title="Two ways to run a newsroom">
          A <em>direct-messaging</em> reporter phones each subscriber personally with breaking news — fast, but if
          your line is busy, you miss the story forever. A <em>message broker</em> is the wire service: reporters
          file to the agency, the agency holds the bulletin, and subscribers pull it whenever they reconnect. The{" "}
          <em>log-based</em> broker is the bound newspaper archive: every edition is kept in order on the shelf, and
          any number of readers can start from any past date and read forward at their own pace.
        </Analogy>

        <Prose>
          <p>
            That archive analogy is the crucial move. A classic broker treats a read as <em>consuming</em> (and
            therefore destroying) a message; add a new consumer and the messages it missed are simply gone. A{" "}
            <strong>log-based message broker</strong> fixes this by borrowing the database&apos;s most durable
            structure — the <strong>append-only log</strong>. A log is just a sequence of records appended to disk in
            order. A producer publishes by appending to the end; a consumer reads sequentially and, on reaching the
            end, waits for a notification that more has arrived.
          </p>
          <p>
            To exceed one disk&apos;s throughput, the log is <strong>partitioned</strong> across machines; a topic is
            a group of partitions carrying the same kind of message. Within each partition the broker assigns every
            message a monotonically increasing <strong>offset</strong>. Because reading does not delete anything,
            fan-out is trivial — consumers read independently without affecting each other — and each consumer simply
            remembers <em>its own offset</em>. Everything below that offset is processed; everything above is not yet
            seen. This is almost exactly single-leader replication, with the broker as leader and each consumer as a
            follower tracking a log sequence number.
          </p>
        </Prose>

        <Callout variant="tradeoff">
          Log-based brokers parallelise only up to the <strong>partition count</strong>: a consumer group can have at
          most as many active workers as there are partitions, and one slow message holds up everything behind it in
          its partition. So prefer a <strong>log</strong> when throughput is high, messages are cheap to process, and
          order matters; prefer a <strong>JMS/AMQP</strong> broker when messages are expensive and individually
          parallelisable and ordering is unimportant.
        </Callout>

        <DemoFrame
          title="Partitioned log + independent consumer offsets"
          description="One producer appends events to an append-only partition; two consumers read the same log at their own offsets. Slow Consumer B builds lag — and if it falls behind a trimmed segment, it misses data. Replay it from the start to re-read history."
          right="reading ≠ deleting"
        >
          <LogConsumerDemo />
        </DemoFrame>

        <RealWorld
          examples={[
            { system: "Apache Kafka", detail: <>The canonical partitioned log: topics split into partitions, per-partition offsets, configurable retention, and consumer groups that own partitions.</> },
            { system: "Amazon Kinesis", detail: <>Managed log of ordered <em>shards</em>; consumers track per-shard sequence numbers, much like Kafka offsets.</> },
            { system: "RabbitMQ / ActiveMQ", detail: <>Classic JMS/AMQP brokers: acknowledge-and-delete semantics, per-message load balancing, good when work units are heavy and order is flexible.</> },
            { system: "Google Cloud Pub/Sub", detail: <>Hosted broker with at-least-once delivery, acknowledgements, and decoupled async fan-out to many subscriptions.</> },
          ]}
        />

        <Callout variant="warning">
          A log only retains a finite history: old segments are deleted or archived. If a consumer falls so far behind
          that its offset points into a deleted segment, it <strong>silently skips</strong> the missing messages.
          Monitor consumer lag and alert when it approaches the retention horizon — the demo above lets you trigger
          exactly this failure.
        </Callout>

        <DemoFrame
          title="Drive the broker: offsets, fan-out, replay & at-least-once"
          description="You are the producer and the operator. Append events to the partition, then advance two independent consumer groups one record at a time. Advancing one never disturbs the other (free fan-out). Replay a group from offset 0 to re-derive its state from the whole log — and read-without-committing then crash to see records reprocessed (at-least-once)."
          right="the offset is yours to control"
        >
          <BrokerReplayDemo />
        </DemoFrame>

        <Callout variant="insight">
          Because the consumer — not the broker — owns the offset, you can rewind it at will. Move a group back to{" "}
          <strong>offset 0</strong> and it rebuilds its entire derived state by replaying history; jump it to the head
          and it skips the backlog. This single lever — a cursor the reader controls over an immutable log — is what
          makes a search index, a cache, and a warehouse all <em>derivable from the same topic</em>.
        </Callout>
      </Section>

      {/* ============================================== 2. databases & streams */}
      <Section
        id="databases"
        kicker="Part 2 · Databases & Streams"
        title="A write is an event; a database is a stream you stopped looking at"
        intro="Replication logs already are streams of write events. Embracing that fact gives us change data capture and event sourcing — and a principled way to keep search indexes, caches, and warehouses in sync without the race conditions of dual writes."
      >
        <Prose>
          <p>
            There is a quiet equivalence at the heart of this chapter: a database&apos;s <strong>replication log</strong>{" "}
            is a stream of write events. The leader emits every change as it commits transactions; followers consume
            that stream and replay it to converge on an identical copy. A database <em>is</em> a stream processor that
            happens to only feed itself.
          </p>
          <p>
            The trouble starts when you need the same data in several systems — the primary store <em>and</em> a search
            index <em>and</em> a cache. The naive fix is <strong>dual writes</strong>: application code writes to each
            destination directly. This is broken in two ways. Under concurrency it has a{" "}
            <strong>race condition</strong>: two writers can apply their updates to the destinations in different
            orders, so one store ends on value A while another ends on value B — permanently, silently inconsistent.
            And under <strong>partial failure</strong>, one write may succeed while another fails, leaving the systems
            disagreeing with no automatic repair.
          </p>
        </Prose>

        <DemoFrame
          title="Dual writes vs change data capture"
          description="Two writers race to set the same key. With dual writes, each store is updated independently and they can diverge forever. With CDC, every store consumes the DB's single ordered log and they all converge. Run the interleaving and compare."
          right="one leader · many followers"
        >
          <CdcDemo />
        </DemoFrame>

        <Prose>
          <p>
            The principled alternative is <strong>change data capture (CDC)</strong>: observe all changes written to a
            database and extract them as an ordered stream that other systems consume. Now one database is the
            authoritative <strong>leader</strong> (the system of record) and the search index, cache, and warehouse
            are <strong>followers</strong> — <em>derived data systems</em>, each just another view of the same truth.
            Because they all replay the <em>same</em> totally-ordered log, they converge deterministically. Triggers
            can implement CDC but are fragile and slow; parsing the replication log directly is far more robust.
          </p>
          <p>
            A log that records every change forever would exhaust the disk, so it is truncated by{" "}
            <strong>log compaction</strong>: the storage engine periodically scans for records with the same key,
            discards superseded versions, and keeps only the latest value per key. A deletion is represented by a
            special null value called a <strong>tombstone</strong>. The result is a compacted log you can replay from
            scratch to rebuild a complete, current snapshot — and a consumer can bootstrap from a consistent snapshot
            that corresponds to a known offset, then stream forward.
          </p>
        </Prose>

        <CodeBlock
          lang="text"
          caption="Log compaction keeps only the latest value per key; a tombstone marks a deletion."
          code={`raw change log (append-only):
  off 0   SET   user:42  {name:"Ada"}
  off 1   SET   user:42  {name:"Ada Lovelace"}
  off 2   SET   user:99  {name:"Alan"}
  off 3   DEL   user:99                      # tombstone
  off 4   SET   user:42  {name:"Ada L."}

after compaction (rebuildable snapshot):
  user:42  {name:"Ada L."}    # only the latest survives
  user:99  <tombstone>        # deletion retained until fully propagated`}
        />

        <Prose>
          <p>
            Push this idea one level up the stack and you get <strong>event sourcing</strong>. Instead of capturing
            low-level row diffs, the application itself records every state change as a log of immutable,
            domain-meaningful <strong>events</strong> (&ldquo;item added to cart&rdquo;, &ldquo;seat reserved&rdquo;).
            Current state is not stored directly; it is <em>derived</em> by replaying the event log (with periodic{" "}
            <strong>snapshots</strong> so you don&apos;t replay from the dawn of time on every read).
          </p>
          <p>
            Event sourcing is careful to distinguish <strong>commands</strong> from <strong>events</strong>. A request
            arrives first as a <em>command</em> — it may still fail validation (the seat is taken, the balance is too
            low). Validation must happen <em>synchronously</em>, before the event is created — for instance inside a
            serializable transaction that atomically checks the invariant and appends the event. Once written, an{" "}
            <strong>event is immutable and durable</strong>, and a downstream consumer is never allowed to reject it.
            (If validation must be async, split it: emit a tentative <em>reservation</em> event, then a separate{" "}
            <em>confirmation</em> event once it is validated.)
          </p>
          <p>
            Mutable state and an append-only log of immutable events are not in conflict — the state is simply the{" "}
            <em>result</em> of folding the events over time. The classic precedent is <strong>financial bookkeeping</strong>:
            the <em>ledger</em> is an append-only log of transactions, and the balance sheet is a derived view. When an
            accountant makes a mistake, they don&apos;t erase the entry; they post a <em>compensating</em> transaction.
            That immutability is a feature: it captures intent that destructive updates throw away (removing a cart item
            loses the fact that it was ever there), aids debugging and auditing, and guards against buggy code
            corrupting data irrecoverably.
          </p>
        </Prose>

        <Analogy title="The accountant's ledger">
          A bank never overwrites your balance. It appends debits and credits to an immutable ledger, and your balance
          is computed by summing them. Made an error? You don&apos;t reach back and alter history — you post a
          correcting entry. Event sourcing applies the same rule to software: the log of what happened is the truth,
          and every queryable view is just an addition of the ledger.
        </Analogy>

        <Callout variant="note">
          Separating the form data is <em>written</em> from the form it is <em>read</em> is called{" "}
          <strong>CQRS</strong> (command query responsibility segregation). It dissolves the fallacy that data must be
          stored in the shape you query it — write an event log once, then materialise as many tailored read views as
          you like (a search index for search, a denormalised table for a dashboard, a graph for recommendations).
        </Callout>

        <CompareTable
          caption="Three views of the same idea — an ordered stream of changes feeding derived state."
          columns={["Change data capture", "Event sourcing"]}
          rows={[
            { feature: "Abstraction level", values: ["Low-level DB row changes (insert/update/delete)", "High-level domain events with business meaning"] },
            { feature: "Source of truth", values: ["The primary database; the log is extracted from it", "The event log itself; state is derived from it"] },
            { feature: "Mutability", values: ["DB rows mutate; log mirrors the latest write", "Events are immutable and append-only"] },
            { feature: "Rebuild state by", values: ["Snapshot at an offset, then apply later changes", "Replay events from a snapshot forward"] },
            { feature: "Reject a change?", values: ["No — it already happened in the DB", <Fragment key={1}>Only a <em>command</em> can be rejected, before it becomes an event</Fragment>] },
            { feature: "Typical tools", values: ["Debezium, Maxwell, Kafka Connect, Bottled Water", "Event Store, Kafka + downstream consumers"] },
          ]}
        />

        <RealWorld
          examples={[
            { system: "Debezium / Maxwell", detail: <>Stream MySQL binlog and Postgres WAL changes into Kafka as a CDC feed for indexes, caches, and warehouses.</> },
            { system: "Kafka Connect", detail: <>Integrates CDC sources and sinks, exporting a compacted change stream to many databases and search indexes.</> },
            { system: "LinkedIn Databus / Facebook Wormhole", detail: <>Large-scale internal CDC pipelines that propagate every database change to derived systems.</> },
            { system: "Druid · RethinkDB · Firebase", detail: <>Druid ingests directly from Kafka; RethinkDB/Firebase/CouchDB expose change feeds so clients subscribe to live updates.</> },
          ]}
        />

        <Callout variant="warning">
          The price of derived views is that consumers of the log are <strong>asynchronous</strong>. A user can write
          to the log and then immediately read a derived view that <em>hasn&apos;t caught up yet</em> — a
          read-your-own-writes violation. And immutable history is cheap only for append-heavy data; workloads with
          heavy updates/deletes on a small dataset suffer from fragmentation, compaction cost, and the occasional hard
          requirement to truly delete data (Datomic calls deliberate history rewriting <em>excision</em>).
        </Callout>
      </Section>

      {/* =================================================== 3. processing */}
      <Section
        id="processing"
        kicker="Part 3 · Processing Streams"
        title="Computing over data that never stops"
        intro="Once events flow, you can store them, alert on them, or — most interestingly — transform them into new derived streams. But an endless input forces hard questions about time, windows, joins, and exactly-once correctness."
      >
        <Prose>
          <p>
            Given a stream, you can do three things with it: <strong>write</strong> it into a store (database, cache,
            index) for later querying; <strong>push</strong> it to people (emails, notifications, a live dashboard);
            or <strong>process</strong> one or more input streams into one or more output streams. That last option —
            an <strong>operator job</strong> — is the analogue of a batch job, with one defining difference:{" "}
            <em>a stream never ends</em>, so the job runs indefinitely and can never declare itself &ldquo;done&rdquo;.
          </p>
          <p>
            Two flavours of processing dominate. <strong>Complex event processing</strong> (CEP) inverts the usual
            database model: instead of running queries over stored data, you store <em>long-lived queries</em> and let
            events flow past them, emitting a <em>complex event</em> when a pattern matches (e.g. &ldquo;three failed
            logins then a password reset within five minutes&rdquo;). <strong>Stream analytics</strong> cares less
            about specific sequences and more about <em>aggregations</em> and statistics — rolling counts, rates,
            percentiles — over time windows.
          </p>
        </Prose>

        <RealWorld
          examples={[
            { system: "Apache Flink", detail: <>Event-time windowing, stateful operators, and exactly-once via periodic distributed checkpoints to durable storage.</> },
            { system: "Kafka Streams / Samza", detail: <>Library-style stream processing; operator state replicated to a compacted Kafka topic for recovery.</> },
            { system: "Spark Streaming", detail: <>Micro-batching: the stream is sliced into ~1-second batches, each processed with batch exactly-once semantics.</> },
            { system: "Esper · TIBCO StreamBase", detail: <>Complex event processing engines that match stored pattern queries against flowing events.</> },
          ]}
        />

        <Prose>
          <p>
            The deepest subtlety in stream analytics is <strong>time</strong>. Every event has an <strong>event
            time</strong> — when it actually happened on the originating device — but it reaches the processor at a
            later <strong>processing time</strong>, delayed by the network, queues, retries, and restarts. If you
            window by the processing machine&apos;s local clock (the simple default), a lag spike makes a burst of old
            events all land &ldquo;now&rdquo; and pile into the wrong bucket, corrupting your per-minute rate.{" "}
            <em>Confusing event time with processing time produces bad data.</em>
          </p>
          <p>
            Windowing by <strong>event time</strong> gives correct counts, but raises a new problem: you can never be
            sure you&apos;ve seen <em>all</em> the events for a window. You time out and declare the window complete
            after a quiet period — but <strong>straggler</strong> events may still arrive late (a phone that was
            offline finally reconnects). You then choose: <em>ignore</em> stragglers (and track a dropped-events
            metric), or publish a <strong>correction</strong> — an updated window value, possibly retracting the old
            output. To fight unreliable device clocks, log three timestamps (event time per device, send time per
            device, receive time per server), estimate the clock offset, and correct the event time.
          </p>
        </Prose>

        <DemoFrame
          title="Event time vs processing time (and stragglers)"
          description="The same events bucketed into 1-minute windows by two different clocks. By processing time, a lag spike smears events into later windows. By event time, counts are correct — but late stragglers are only counted if they fall inside your allowed lateness."
          right="when did it happen?"
        >
          <EventTimeDemo />
        </DemoFrame>

        <Callout variant="warning">
          Processing time is seductive because it&apos;s a single local clock with no coordination — but it is{" "}
          <em>unreliable</em>. The processor may queue events during a backlog, restart and replay, or run faster than
          real time when catching up. Any rate or count that must reflect reality should be computed on{" "}
          <strong>event time</strong>, with explicit handling for late data.
        </Callout>

        <Prose>
          <p>
            To aggregate over time you choose a <strong>window</strong> type, and the choice changes the answer:
          </p>
          <ul>
            <li><strong>Tumbling</strong> — fixed length, non-overlapping. 10:03:00–10:03:59, then 10:04:00–10:04:59. Each event in exactly one window.</li>
            <li><strong>Hopping</strong> — fixed length but overlapping by a <em>hop</em> smaller than the size (a 5-minute window hopping every minute), so each event appears in several windows; used to smooth a rate.</li>
            <li><strong>Sliding</strong> — one window per event, grouping events that occur within some interval of each other rather than snapping to fixed boundaries.</li>
            <li><strong>Session</strong> — no fixed length; a window grows while a user is active and closes after a gap of inactivity (say 30 minutes). The staple of web analytics.</li>
          </ul>
        </Prose>

        <DemoFrame
          title="Windowing: tumbling vs hopping vs sliding vs session"
          description="One fixed stream of timestamped events, aggregated four ways. Switch the strategy and resize the window to watch the windows tile, overlap, or stretch — and see why overlapping windows count events more than once."
          right="same stream, different question"
        >
          <WindowDemo />
        </DemoFrame>

        <Prose>
          <p>
            Joins are harder on streams than on tables because new events can appear at any time on either side. DDIA
            distinguishes three, by what kind of state the operator must keep:
          </p>
          <ul>
            <li>
              <strong>Stream-stream join</strong> (e.g. correlate a search event with its later click). The processor
              keeps <em>windowed state</em> indexed by a join key (session ID): when an event arrives it is added to
              its index and checked against the other index for a match. State must be expired as the window ages.
            </li>
            <li>
              <strong>Stream-table join</strong> — <em>enriching</em> activity events with reference data (attach the
              full user profile given a user ID). Querying a remote DB per event is slow and risks overloading it;
              instead keep a <em>local copy</em> of the table inside the processor, kept fresh via{" "}
              <strong>change data capture</strong>, and join without a network round trip.
            </li>
            <li>
              <strong>Table-table join</strong> — maintaining a materialised view (a Twitter timeline updated as
              tweets and follows change). The processor holds the follower set so it knows which timelines to update.
            </li>
          </ul>
          <p>
            All three need state, which raises <strong>time-dependence</strong>: if the joined-with state changes over
            time, <em>which version</em> do you join against? If event ordering across streams is undetermined, the
            join becomes <strong>nondeterministic</strong> — the infamous <strong>slowly changing dimension</strong>{" "}
            (SCD) problem. The fix is to version the reference data: give each change a unique identifier (e.g. a new
            tax-rate ID at every rate change) and have each event reference the version in force at its time — at the
            cost of making log compaction impossible for that data.
          </p>
        </Prose>

        <CompareTable
          caption="Stream join types and the state each operator must maintain."
          columns={["What it joins", "State kept", "Example"]}
          rows={[
            { feature: "Stream-stream", values: ["Two event streams", "Windowed events indexed by key, expired as the window ages", "Search event ⋈ click event by session"] },
            { feature: "Stream-table", values: ["Events ⋈ reference table", "A local, CDC-fed copy of the table", "Activity events enriched with user profiles"] },
            { feature: "Table-table", values: ["Two changing tables", "Materialised view + the inputs that maintain it", "Timeline updated by tweets and follows"] },
          ]}
        />

        <Analogy title="Two clocks on the wall">
          Imagine timing runners with a stopwatch you only glance at when each runner crosses the line. If you got
          distracted (a processing lag) and three runners crossed while you looked away, glancing now records all
          three at the <em>current</em> time — nonsense. The honest record uses each runner&apos;s <em>own</em>{" "}
          finish photo (event time). But the photo from the runner whose camera was slow arrives late — after
          you&apos;ve already posted the results — and you must decide whether to amend the leaderboard or ignore the
          straggler.
        </Analogy>

        <Prose>
          <p>
            Finally, <strong>fault tolerance</strong>. Batch frameworks recover trivially: a failed task re-runs on
            another machine, inputs are immutable, and output goes to a fresh file, so even though records may be
            processed multiple times the <em>visible</em> result is as if processed once —{" "}
            <strong>exactly-once</strong> (more honestly, <em>effectively-once</em>) semantics. Streams can&apos;t
            wait for a job to finish before revealing output, so they use other tricks:
          </p>
          <ul>
            <li><strong>Micro-batching</strong> (Spark Streaming): chop the stream into ~1-second blocks and treat each like a tiny batch job.</li>
            <li><strong>Checkpointing</strong> (Flink): periodically snapshot operator state to durable storage; on crash, restart from the last checkpoint.</li>
            <li><strong>Distributed transactions / 2PC</strong> (Google Cloud Dataflow, VoltDB): make output and state changes atomic so partial effects never become visible.</li>
            <li><strong>Idempotence</strong>: design operations so applying them twice equals applying once (often by attaching metadata that records whether an update was already applied) — cheap exactly-once.</li>
          </ul>
          <p>
            Any stateful operator must be able to <em>recover its state</em> after a crash. Keeping state in a remote
            replicated datastore is correct but slow; keeping it <em>local</em> and replicating it periodically is the
            fast path. Flink snapshots state to HDFS; Kafka Streams and Samza replicate state changes to a compacted
            Kafka topic; VoltDB redundantly processes each input on several nodes.
          </p>
        </Prose>

        <Callout variant="insight">
          The catch with exactly-once is the boundary: micro-batching and checkpointing can discard the partial output
          of a failed task <em>only while it&apos;s still inside the framework</em>. The moment output leaves — an
          email is sent, a row is written to an external DB — the framework can&apos;t take it back. So genuine
          end-to-end exactly-once needs either distributed transactions spanning those side effects, or{" "}
          <strong>idempotent</strong> writes that are safe to retry.
        </Callout>

        <Figure caption="Fault-tolerance strategies trade latency, complexity, and how far &lsquo;exactly-once&rsquo; really reaches.">
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              { name: "Micro-batching", tone: "var(--accent)", note: "Spark Streaming · ~1s blocks reuse batch semantics; adds latency" },
              { name: "Checkpointing", tone: "var(--accent-2)", note: "Flink · periodic state snapshots to durable storage; restart from last" },
              { name: "Distributed txn / 2PC", tone: "var(--color-special)", note: "Dataflow, VoltDB · atomic output + state; correct but heavy" },
              { name: "Idempotence", tone: "var(--color-ok)", note: "Dedup metadata · retries are safe; cheapest path to effectively-once" },
            ].map((s) => (
              <div key={s.name} className="rounded-lg border border-line bg-ink-900/60 p-4">
                <div className="font-mono text-sm font-medium" style={{ color: s.tone }}>{s.name}</div>
                <div className="mt-1 text-[13px] leading-relaxed text-fg-muted">{s.note}</div>
              </div>
            ))}
          </div>
        </Figure>

        <RealWorld
          title="How real pipelines combine these ideas"
          examples={[
            {
              system: "Uber · ad events",
              detail: (
                <>
                  A Flink job consumes raw ad events from Kafka, keys them by ad ID + minute-truncated timestamp, and
                  aggregates into <em>1-minute tumbling windows</em>. End-to-end exactly-once comes from{" "}
                  <em>three</em> mechanisms stacked together: Kafka read-committed consumption, checkpoint-aligned 2PC
                  commits (~every 2 minutes), and a per-record UUID for idempotent upserts into Apache Pinot — exactly
                  the &ldquo;atomic output, or idempotent writes&rdquo; boundary problem from the callout above.
                </>
              ),
            },
            {
              system: "Shopify · CDC",
              detail: (
                <>
                  Log-based change data capture with <strong>Debezium</strong> streams every row change from 100+
                  sharded MySQL databases into Kafka, replacing slow batch extraction and unifying batch and streaming
                  sources — one ordered log feeding many derived systems.
                </>
              ),
            },
            {
              system: "WePay · Debezium",
              detail: (
                <>
                  Ran Debezium in production to turn the MySQL binlog into a Kafka stream feeding a real-time BigQuery
                  warehouse pipeline and downstream microservices — CDC as the company-wide data-integration backbone.
                </>
              ),
            },
            {
              system: "LinkedIn · the log",
              detail: (
                <>
                  Kafka itself grew out of LinkedIn&apos;s realisation (Jay Kreps&apos; &ldquo;The Log&rdquo;) that an
                  append-only, totally-ordered log is the unifying primitive behind replication, CDC, and stream
                  processing — the thesis this whole chapter rests on.
                </>
              ),
            },
          ]}
        />
      </Section>

      {/* =================================================== see it explained */}
      <Section
        id="watch"
        kicker="See it explained"
        title="Two short talks that make it click"
        intro="A lightboard primer on what Kafka actually is, and the talk that reframed the whole field — Martin Kleppmann turning the database inside out."
      >
        <Prose>
          <p>
            If the append-only-log-plus-cursors idea still feels abstract, these two help. The first is a five-minute
            whiteboard explanation of Kafka&apos;s core nouns — topics, partitions, offsets, producers, consumers. The
            second is the influential Strange Loop talk that argues a stream processor reading a durable log{" "}
            <em>is</em> a database with its internals exposed — the conceptual spine of Part 2 of this chapter.
          </p>
        </Prose>

        <YouTubeEmbed
          videoId="06iRM1Ghr1k"
          title="What is Apache Kafka? (A Confluent Lightboard by Tim Berglund)"
          channel="Confluent"
        />
        <YouTubeEmbed
          videoId="fU9hR3kiOK0"
          title="Turning the database inside out with Apache Samza — Martin Kleppmann"
          channel="Strange Loop"
        />
      </Section>

      {/* ==================================================== further reading */}
      <Section
        id="further-reading"
        kicker="Go deeper"
        title="Primary sources & deep dives"
        intro="The original writing behind this chapter's ideas — read the Kafka design doc and Kleppmann's log post first, then the watermark literature when you need event-time rigour."
      >
        <FurtherReading
          sources={[
            {
              title: "The Log: What every software engineer should know about real-time data's unifying abstraction",
              url: "https://engineering.linkedin.com/distributed-systems/log-what-every-software-engineer-should-know-about-real-time-datas-unifying",
              note: "Jay Kreps (LinkedIn). The foundational essay: the log as the unifying primitive behind replication, CDC, and stream processing.",
            },
            {
              title: "Turning the database inside-out — transcript & slides",
              url: "https://martin.kleppmann.com/2015/03/04/turning-the-database-inside-out.html",
              note: "Martin Kleppmann. The written form of the talk above, by DDIA's own author — CDC, event sourcing, and derived views.",
            },
            {
              title: "Apache Kafka — Design & the Log",
              url: "https://kafka.apache.org/documentation/#design",
              note: "Official docs: partitioned commit log, per-partition offsets, consumer-controlled position, and retention.",
            },
            {
              title: "Apache Flink — Timely Stream Processing",
              url: "https://nightlies.apache.org/flink/flink-docs-stable/docs/concepts/time/",
              note: "How watermarks bound event-time progress and let windows fire correctly over out-of-order streams.",
            },
            {
              title: "MillWheel: Fault-Tolerant Stream Processing at Internet Scale",
              url: "https://research.google/pubs/pub41378/",
              note: "Google's VLDB paper that introduced low watermarks and exactly-once via persistent state and checkpoints.",
            },
            {
              title: "Capturing Every Change From Shopify's Sharded Monolith",
              url: "https://shopify.engineering/capturing-every-change-shopify-sharded-monolith",
              note: "A production CDC story: choosing Debezium to stream 100+ MySQL shards into Kafka.",
            },
          ]}
        />
      </Section>

      {/* ==================================================== test yourself */}
      <Section id="test" kicker="Practice" title="Test yourself">
        <Prose>
          <p>
            A live, never-the-same-twice quiz on this chapter. Read carefully — the tempting wrong answers are the
            common misconceptions. Hit <em>discuss</em> on any question to talk it through with the AI tutor, who is
            grounded in this exact chapter.
          </p>
        </Prose>
        <Quiz chapterTitle="Stream Processing" concepts={CONCEPTS} />
        <div className="mt-6">
          <AskClaude chapterTitle="Stream Processing" concepts={CONCEPTS} />
        </div>
      </Section>

      <KeyTakeaways
        points={[
          "A stream is unbounded data processed incrementally; the atom is an immutable event produced once and consumed by many.",
          "Direct messaging is fast but brittle; brokers add durability and async decoupling, with backpressure, drop, or buffer as the only answers to an overwhelmed consumer.",
          "Log-based brokers (Kafka, Kinesis) make reads non-destructive: per-partition offsets give free fan-out, replay, and single-leader-style consumer recovery — only a too-slow consumer loses data when segments are trimmed.",
          "Dual writes race and diverge; change data capture turns one database into the leader and feeds derived indexes, caches, and warehouses from its single ordered log.",
          "Event sourcing stores immutable domain events (commands may be rejected, events may not) and derives state by replay; CQRS separates the write form from many tailored read views.",
          "Window by event time, not processing time, and plan for stragglers (ignore-and-count or publish a correction); window choice — tumbling, hopping, sliding, session — changes the answer.",
          "Exactly-once is really effectively-once: achieved by micro-batching, checkpointing, distributed transactions, or idempotence, with recoverable operator state via local replication or snapshots.",
        ]}
      />
    </ChapterShell>
  );
}
