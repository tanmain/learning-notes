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
import { LeaderFollowerDemo } from "./LeaderFollowerDemo";
import { LagAnomaliesDemo } from "./LagAnomaliesDemo";
import { ConflictDemo } from "./ConflictDemo";
import { QuorumDemo } from "./QuorumDemo";

export const metadata: Metadata = { title: "Replication" };

const CONCEPTS = `Replication keeps copies of the same data on multiple machines (replicas) to put data near users, increase read throughput, and tolerate node failures. The hard part is propagating CHANGES. Three approaches: single-leader, multi-leader, and leaderless.

Single-leader (master/slave, active/passive): one replica is the leader; all writes go to it. The leader streams a replication log (change stream) to followers, which apply it. Reads may go to any replica. Replication can be synchronous (follower confirms before the write returns; guarantees an up-to-date copy but blocks if the follower is down) or asynchronous (leader doesn't wait; durable only on the leader, but stays available). Semi-synchronous = one synchronous follower, the rest async. Replication log implementations: statement-based (breaks on NOW(), RAND(), auto-increment), write-ahead-log (WAL) shipping (couples to storage engine, blocks zero-downtime upgrades), logical/row-based log (decoupled, good for change data capture), and trigger-based (flexible, higher overhead). New followers catch up from a snapshot + the log since. Failover promotes a follower when the leader dies; dangers: lost async writes, split brain (two leaders), wrong failure-detection timeout.

Replication lag: with async followers, reads can be stale (eventual consistency). Three guarantees that lag can violate: (1) read-after-write / read-your-writes — you must see your own writes (fix: read your own data from the leader); (2) monotonic reads — never see time go backward across successive reads (fix: pin a user to one replica); (3) consistent-prefix reads — writes seen in commit order (a problem across partitions; fix: keep causally related writes together).

Multi-leader: several leaders accept writes (multi-datacenter, offline clients, collaborative editing). Better latency and datacenter-outage tolerance, but writes can CONFLICT. Conflict resolution must be convergent: last-write-wins (LWW, lossy), highest-replica-ID (lossy), merge/siblings, or custom on-read/on-write handlers. Topologies: all-to-all, circular, star. Causal ordering needs version vectors.

Leaderless (Dynamo-style: Riak, Cassandra, Voldemort): clients write to all replicas and read from many in parallel; version numbers pick the newest. Anti-entropy and read repair heal stale replicas. Quorum: with n replicas, w writes and r reads, if w + r > n the read and write sets overlap, so you read the latest value. Sloppy quorums + hinted handoff raise availability but weaken the overlap guarantee. Concurrent writes are detected via happens-before (version vectors); concurrent siblings may need CRDTs or tombstones.`;

export default function Page() {
  return (
    <ChapterShell slug="replication" diagram={<Hero />}>
      <Prose>
        <p>
          A single machine is a single point of failure, a bottleneck for reads, and far away from
          most of your users. <strong>Replication</strong> answers all three at once: keep a copy of
          the same data on several machines — each a <em>replica</em> — so you can survive a crash,
          fan out reads, and serve users from a nearby datacenter. The catch is almost never storing
          the copies; it&apos;s keeping them in sync <em>as the data changes</em>. Three families of
          algorithms tackle that problem, and each makes a different bargain between consistency,
          availability, and write throughput. This chapter is a tour of those bargains.
        </p>
      </Prose>

      {/* ============================================================ LEADERS */}
      <Section
        id="leaders"
        kicker="Leaders & Followers"
        title="Leaders & Followers"
        intro="The default answer: elect one writer, and make everyone else copy it — in order."
      >
        <Prose>
          <p>
            In <strong>leader-based replication</strong> (also called active/passive or
            master&ndash;slave), one replica is designated the <em>leader</em>. Every write must go
            to the leader, which first applies it locally and then ships the change to all of its{" "}
            <em>followers</em> as an ordered <strong>replication log</strong>. Each follower applies
            the log in the same sequence, so it deterministically replays the leader&apos;s history.
            Reads can be served by any replica; writes are accepted only by the leader. This is the
            scheme behind PostgreSQL, MySQL, Oracle Data Guard, SQL Server Always On, MongoDB, and
            even message brokers like Kafka.
          </p>
          <p>
            The pivotal design choice is <strong>synchronous vs asynchronous</strong>. With
            synchronous replication the leader waits for the follower to confirm it has the write
            before reporting success: the follower is guaranteed current, but if it stalls, the
            write cannot complete and the system blocks. Pure synchronous replication across many
            followers is therefore impractical &mdash; one slow node freezes all writes. In practice
            databases offer <em>semi-synchronous</em> replication: exactly one follower is
            synchronous (so at least two nodes always hold the latest data) and the rest are
            asynchronous. Fully asynchronous replication keeps the leader fast and available, but a
            write acknowledged by the leader can be lost if the leader crashes before any follower
            receives it.
          </p>
        </Prose>

        <Analogy>
          Think of a newsroom. The editor-in-chief (the leader) is the only person allowed to set
          the official story. Reporters (followers) copy each approved edit into their own notebooks
          in the exact order the editor made them. You can ask any reporter for the news, but only
          the editor can change it. A <em>synchronous</em> follower is the deputy sitting beside the
          editor, initialing every change before it&apos;s announced; the <em>asynchronous</em>{" "}
          reporters get the memo whenever it reaches them.
        </Analogy>

        <DemoFrame
          title="Single-leader cluster — drive a write, then crash the leader"
          description="One leader streams its change log to three asynchronous followers. Crank the replication lag up or down, write a new version, and step time to watch the log records crawl outward. Read a follower before it catches up to see a read-your-writes violation in red. Then kill the leader mid-flight and promote a follower: the failover keeps the most caught-up replica — and any write the dead leader had acknowledged but not yet shipped is lost for good."
          right={<span>leader + 3 followers · failover</span>}
        >
          <LeaderFollowerDemo />
        </DemoFrame>

        <Prose>
          <p>
            What gets shipped over that log matters enormously.{" "}
            <strong>Statement-based replication</strong> forwards the literal SQL, which breaks the
            instant a statement is non-deterministic &mdash; <code>NOW()</code>, <code>RAND()</code>,
            or an auto-increment evaluated in a different order yields divergent replicas.{" "}
            <strong>Write-ahead-log (WAL) shipping</strong> streams the byte-level changes the
            storage engine already records; it is efficient but couples the log to the engine&apos;s
            on-disk format, so leader and followers usually must run the identical database version
            &mdash; killing zero-downtime upgrades. <strong>Logical (row-based) log replication</strong>{" "}
            decouples from the engine by describing changes per row (MySQL&apos;s binlog), which also
            makes the log parseable by outside consumers &mdash; the foundation of{" "}
            <em>change data capture</em>. <strong>Trigger-based replication</strong> moves the work
            into application code for maximum flexibility, at the cost of overhead and bugs.
          </p>
        </Prose>

        <CompareTable
          caption="Four ways to encode the replication log, and what each one costs."
          columns={["Statement", "WAL shipping", "Logical (row) log", "Trigger-based"]}
          rows={[
            {
              feature: "What ships",
              values: [
                "The literal SQL statement",
                "Byte-level storage-engine writes",
                "Per-row before/after values",
                "Custom records written by app triggers",
              ],
            },
            {
              feature: "Main hazard",
              values: [
                <Fragment key={0}>Non-determinism (<code>NOW()</code>, <code>RAND()</code>, auto-increment)</Fragment>,
                "Tightly coupled to engine internals",
                "Slightly larger log",
                "High overhead, error-prone",
              ],
            },
            {
              feature: "Cross-version upgrades",
              values: ["Often OK", "Usually impossible", "Backwards-compatible", "Fully flexible"],
            },
            {
              feature: "Used by",
              values: ["Legacy MySQL", "PostgreSQL, Oracle", "MySQL binlog, CDC tools", "Bucardo, app layer"],
            },
          ]}
        />

        <Callout variant="warning" title="Failover is where leaders bite back">
          When a leader dies, a follower must be promoted (<strong>failover</strong>). Three things
          routinely go wrong: with async replication the new leader may be <em>missing</em> the old
          leader&apos;s last writes (which are then lost, or worse, conflict with external systems
          that already saw them); two nodes may both believe they are leader (<strong>split
          brain</strong>), corrupting data; and the failure-detection timeout is a guess &mdash; too
          short and you trigger needless failovers, too long and you extend the outage. Many teams
          deliberately keep failover <em>manual</em> for exactly these reasons.
        </Callout>

        <RealWorld
          examples={[
            {
              system: "PostgreSQL",
              detail: <>Streams the WAL to hot-standby replicas; supports synchronous, quorum-based, and async standbys.</>,
            },
            {
              system: "MySQL",
              detail: <>The binlog is a logical row-based log, which is also what tools like Debezium tap for change data capture.</>,
            },
            {
              system: "MongoDB",
              detail: <>A replica set elects a primary; on primary failure the set runs a Raft-like election to promote a secondary.</>,
            },
            {
              system: "Kafka",
              detail: (
                <>
                  Each partition has a leader broker and in-sync-replica (ISR) followers. With{" "}
                  <code>acks=all</code> and <code>min.insync.replicas</code> set, a producer&apos;s write
                  is acknowledged only once enough ISR members have it &mdash; quorum-style durability on
                  top of a single leader.
                </>
              ),
            },
            {
              system: "GitHub (Oct 2018)",
              detail: (
                <>
                  A 43-second network partition let automation fail MySQL writes over to the US-West
                  datacenter while the isolated US-East primaries kept taking writes &mdash; a textbook{" "}
                  <strong>split brain</strong>. Reconciling the divergent histories degraded GitHub for
                  over 24 hours and required a custom <code>gh-mysql-rewind</code> tool.
                </>
              ),
            },
          ]}
        />

        <Callout variant="insight">
          Single-leader replication gives you a clean mental model &mdash; one ordered history that
          every replica replays &mdash; and that ordering is exactly why it sidesteps write
          conflicts entirely. Everything later in the chapter is a story about what you give up when
          you relax the &ldquo;one leader, in order&rdquo; rule.
        </Callout>
      </Section>

      {/* ======================================================= REPLICATION LAG */}
      <Section
        id="lag"
        kicker="Replication Lag"
        title="The Problems with Replication Lag"
        intro="Asynchronous followers are eventually consistent — and 'eventually' is where the bugs live."
      >
        <Prose>
          <p>
            Read scaling is the seductive promise of followers: add more read replicas, serve more
            read traffic. But it only works with <em>asynchronous</em> replication &mdash; a
            synchronous fan-out to dozens of followers would stall on the first slow node. The price
            of async is <strong>replication lag</strong>: the window during which a follower trails
            the leader. Usually it&apos;s a fraction of a second; under load or network trouble it
            can stretch to seconds or minutes. The database is{" "}
            <strong>eventually consistent</strong> &mdash; if writes stop, followers converge &mdash;
            but &ldquo;eventually&rdquo; has no upper bound, and three specific guarantees can break
            in the meantime.
          </p>
        </Prose>

        <DefinitionGrid
          items={[
            {
              term: "Read-after-write",
              def: (
                <>
                  Also <em>read-your-writes</em>. A user must always see updates they themselves just
                  submitted &mdash; even if everyone else still sees the old value.
                </>
              ),
            },
            {
              term: "Monotonic reads",
              def: (
                <>
                  Weaker than strong consistency, stronger than eventual: once you have seen a value,
                  later reads never show an <em>older</em> one. Time may not run backward.
                </>
              ),
            },
            {
              term: "Consistent prefix",
              def: (
                <>
                  If writes happened in a certain order, every reader sees them in that same order
                  &mdash; you never see an effect before its cause.
                </>
              ),
            },
            {
              term: "Eventual consistency",
              def: <>If you stop writing and wait &ldquo;long enough&rdquo;, all replicas converge to the same value. The catch is the unbounded wait.</>,
            },
          ]}
        />

        <DemoFrame
          title="Three lag anomalies, narrated step by step"
          description="Each tab walks through the exact sequence of replica states that produces a surprising result — your own comment vanishing, time running backward, or an answer arriving before its question. Step through the timeline and read off the fix at the end."
          right={<span>step-through</span>}
        >
          <LagAnomaliesDemo />
        </DemoFrame>

        <Analogy>
          You text a friend <em>&ldquo;running 5 min late&rdquo;</em> and immediately refresh the
          chat &mdash; but your phone reloaded from a replica that hasn&apos;t synced, so your own
          message isn&apos;t there. That&apos;s a read-your-writes violation. Now imagine you{" "}
          <em>do</em> see it, then refresh again and it disappears &mdash; the second refresh hit an
          even staler replica. That&apos;s a monotonic-reads violation: the conversation slid
          backward in time.
        </Analogy>

        <Callout variant="note" title="The pragmatic fixes">
          You rarely need full strong consistency to kill these bugs. Read a user&apos;s <em>own</em>{" "}
          data from the leader (read-your-writes); pin each user to a single replica via a hash of
          their ID (monotonic reads); and keep causally related writes in the same partition, or
          carry causal metadata, so order is preserved (consistent prefix). Better still, a system
          that offers real <strong>transactions</strong> can give the application a single strong
          guarantee instead of forcing it to assemble these defenses by hand.
        </Callout>

        <RealWorld>
          The consistent-prefix problem is sharpest in <strong>partitioned (sharded)</strong>{" "}
          databases, where each partition replicates independently and there is no global write
          order. DDIA&apos;s own example: Mr Poons asks &ldquo;how far into the future can you
          see?&rdquo; and Mrs Cake answers &ldquo;about ten seconds&rdquo; &mdash; if the question
          and answer live on different partitions, an observer can receive the answer before the
          question.
        </RealWorld>
      </Section>

      {/* ========================================================= MULTI-LEADER */}
      <Section
        id="multi-leader"
        kicker="Multi-Leader"
        title="Multi-Leader Replication"
        intro="Let more than one node accept writes — and inherit the hardest problem in the chapter: conflicts."
      >
        <Prose>
          <p>
            Single-leader has one structural weakness: every write funnels through one node, often in
            one datacenter. <strong>Multi-leader replication</strong> (master&ndash;master,
            active/active) lets several nodes accept writes, each acting as a follower to the others.
            It rarely makes sense inside a single datacenter, but it shines in three settings.{" "}
            <strong>Multi-datacenter operation</strong>: put a leader in each region, so every write
            is handled locally and replicated across the WAN asynchronously &mdash; hiding inter-region
            latency, surviving a whole-datacenter outage, and tolerating a flaky link far better than
            a single leader whose writes must cross that link synchronously.{" "}
            <strong>Offline clients</strong>: a calendar app on your laptop is effectively its own
            leader, syncing when it reconnects (CouchDB was designed for this).{" "}
            <strong>Collaborative editing</strong>: Google Docs applies your keystrokes locally and
            replicates them asynchronously, which is multi-leader replication at the granularity of a
            character.
          </p>
          <p>
            The price is the one problem single-leader never has: <strong>write conflicts</strong>.
            If two leaders accept a change to the same field before they&apos;ve heard from each
            other, there is no single authority to say which one &ldquo;wins.&rdquo; In single-leader
            the second writer simply blocks behind the first; in multi-leader both succeed locally
            and the conflict is only discovered <em>later</em>, asynchronously, when the writes meet.
          </p>
        </Prose>

        <DemoFrame
          title="Concurrent writes collide — pick a convergence strategy"
          description="Two datacenters edit the same title at the same time. Replicate across the link, then resolve the conflict three different ways. Watch which strategies silently throw a write away and which preserve both — every replica must end on the same value (convergence), but 'same' isn't always 'correct'."
          right={<span>2 leaders</span>}
        >
          <ConflictDemo />
        </DemoFrame>

        <Prose>
          <p>
            Whatever you choose, resolution must be <strong>convergent</strong>: once all changes
            have propagated, every replica must arrive at the <em>same</em> final value &mdash;
            otherwise replicas permanently disagree. The blunt option is{" "}
            <strong>last-write-wins (LWW)</strong>: tag each write with a timestamp or UUID and keep
            the highest. It always converges, but it is <em>dangerously</em> lossy &mdash; the
            &ldquo;losing&rdquo; write vanishes, and clock skew decides the winner. Picking a winning
            replica ID is equally lossy. The safer family records <em>all</em> conflicting values as
            siblings and surfaces them &mdash; on write (a conflict handler runs) or on read (the
            application, or the user, merges them, as in CouchDB).
          </p>
          <p>
            Writes also have to physically reach every leader, which is the job of the{" "}
            <strong>replication topology</strong>. <em>All-to-all</em> is the most fault-tolerant
            &mdash; messages route around a failed node &mdash; but messages can overtake one another,
            so you need <strong>version vectors</strong> to order causally related writes.{" "}
            <em>Circular</em> and <em>star</em> topologies use fewer links but a single node failure
            can interrupt the whole flow; to stop infinite loops, each write is tagged with the IDs
            of nodes it has already visited.
          </p>
        </Prose>

        <CodeBlock
          lang="text"
          caption="Convergence is necessary but not sufficient — LWW converges by discarding data."
          code={`# Two concurrent writes to key "title" (no happens-before between them):
  DC-1  title = "B/H Frosting"    ts=1003
  DC-2  title = "B & H Frosting"  ts=1001

# Last-write-wins keeps the higher timestamp:
  resolve(LWW)  -> "B/H Frosting"        # DC-2's edit is LOST

# Sibling-merge keeps both for the app to reconcile:
  resolve(merge) -> ["B/H Frosting",
                     "B & H Frosting"]    # nothing lost; app decides`}
        />

        <Analogy>
          Multi-leader replication is a shared Google Doc with everyone offline. Each person edits
          their local copy freely; when the wifi comes back, the copies have to be reconciled. If the
          app just keeps &ldquo;whoever saved last&rdquo; (LWW), someone&apos;s paragraph silently
          disappears. If instead it shows both versions side by side and asks a human to merge, no
          words are lost &mdash; but someone has to do the work.
        </Analogy>

        <RealWorld
          examples={[
            {
              system: "CouchDB",
              detail: <>Multi-leader by design; keeps conflicting revisions and exposes them so the application resolves on read.</>,
            },
            {
              system: "MySQL (Tungsten)",
              detail: <>Tungsten Replicator enables active/active MySQL but does not even attempt automatic conflict detection.</>,
            },
            {
              system: "PostgreSQL BDR",
              detail: <>Bi-Directional Replication offers multi-master Postgres but does not guarantee causal ordering of writes.</>,
            },
            {
              system: "Google Docs",
              detail: <>Per-keystroke multi-leader replication, reconciled with operational transforms / CRDTs to avoid lost edits.</>,
            },
          ]}
        />

        <Callout variant="tradeoff">
          Multi-leader buys you local-write latency and datacenter independence at the cost of
          living with conflicts forever. The book is blunt: auto-incrementing keys, triggers, and
          integrity constraints all become hazards, so multi-leader is often considered{" "}
          &ldquo;dangerous territory&rdquo; and avoided unless its specific benefits are truly
          needed.
        </Callout>
      </Section>

      {/* ========================================================== LEADERLESS */}
      <Section
        id="leaderless"
        kicker="Leaderless"
        title="Leaderless Replication"
        intro="Abolish the leader entirely. Clients write to many replicas and read from many — and arithmetic decides correctness."
      >
        <Prose>
          <p>
            <strong>Leaderless replication</strong> &mdash; popularized by Amazon&apos;s Dynamo and
            adopted by Riak, Cassandra, and Voldemort &mdash; throws out the leader. A client sends
            each write to <em>all</em> replicas in parallel and each read to <em>several</em> in
            parallel, using <strong>version numbers</strong> to recognize the newest value. There is
            no failover because there is no leader to fail: if a replica is down, the write simply
            goes to the others. When a stale node comes back, two mechanisms heal it &mdash;{" "}
            <strong>read repair</strong> (a client noticing a stale response writes the fresh value
            back) and an <strong>anti-entropy</strong> background process that continuously copies
            missing data between replicas.
          </p>
          <p>
            Correctness rests on a piece of arithmetic. With <code>n</code> replicas, require every
            write to be acknowledged by <code>w</code> nodes and every read to gather <code>r</code>{" "}
            responses. If <strong>
              <code>w + r &gt; n</code>
            </strong>
            , the set of nodes you wrote to and the set you read from <em>must</em> overlap by at
            least one node &mdash; and that node carries the latest value, so the read is guaranteed
            to see it. A typical choice is an odd <code>n</code> with{" "}
            <code>w = r = (n + 1) / 2</code>. Tune <code>w</code> down for write availability,{" "}
            <code>r</code> down for read availability &mdash; as long as their sum still clears{" "}
            <code>n</code>.
          </p>
        </Prose>

        <DemoFrame
          title="Quorum sandbox — make w + r > n hold (or watch it break)"
          description="Set the number of replicas n and the read/write quorums w and r. The ring shows which nodes acked the latest write (they hold v2) and which nodes the read contacted. When w + r > n the two sets are forced to overlap on a fresh node; drop below the line and re-roll to see the read miss the new value entirely."
          right={<span>Dynamo-style</span>}
        >
          <QuorumDemo />
        </DemoFrame>

        <Analogy>
          Imagine a rumor spread among <code>n</code> friends. To plant it you whisper it to{" "}
          <code>w</code> of them; to learn the current rumor you ask <code>r</code> of them and
          believe whoever heard it most recently. If <code>w + r &gt; n</code>, the people you told
          and the people you ask can&apos;t be two disjoint cliques &mdash; at least one friend is in
          both, and they&apos;ll repeat your latest version. If the two groups can avoid each other
          entirely, you might hear yesterday&apos;s gossip.
        </Analogy>

        <Callout variant="warning" title="The quorum guarantee is leakier than it looks">
          <code>w + r &gt; n</code> is necessary but not airtight. <strong>Sloppy quorums</strong>{" "}
          accept writes on whichever <code>w</code> nodes are reachable &mdash; possibly outside the
          value&apos;s designated &ldquo;home&rdquo; nodes &mdash; so the read and write sets may no
          longer overlap (those writes return home later via <strong>hinted handoff</strong>). Beyond
          that: concurrent writes can interleave, a write may land on only some replicas before a
          concurrent read, a partial write is never rolled back, and restoring a node from an old
          replica can quietly break the quorum count. Dynamo-style stores are built for use cases
          that <em>tolerate</em> eventual consistency, not for ones that demand strict guarantees.
        </Callout>

        <Prose>
          <p>
            Because any replica accepts writes, the system must detect <strong>concurrent writes</strong>{" "}
            and converge. The key idea is the <strong>happens-before</strong> relationship: operation
            A happens before B if B could have known about A. If neither happens before the other,
            they are <strong>concurrent</strong> &mdash; and concurrency, not wall-clock time, is what
            defines a conflict. The server captures this with a version number per key: a client must
            read before it writes, the read returns the current version (and any un-overwritten
            siblings), and the write echoes that version back. The server then overwrites everything
            at or below that version but <em>keeps</em> anything newer &mdash; preserving genuinely
            concurrent values as <strong>siblings</strong> (Riak&apos;s term).
          </p>
          <p>
            Merging siblings is the same hard problem as multi-leader conflict resolution. LWW
            discards data; smarter merges need application logic, and deletions need a{" "}
            <strong>tombstone</strong> (a marker that an item was removed) so a union of siblings
            doesn&apos;t resurrect it. To track causality across <em>multiple</em> replicas you need a
            version number per replica per key &mdash; the collection of them is a{" "}
            <strong>version vector</strong> (Riak&apos;s &ldquo;causal context&rdquo;), which lets the
            database tell a true overwrite apart from concurrent siblings. <strong>CRDTs</strong> are
            data structures designed to make this merge automatic and correct.
          </p>
        </Prose>

        <CompareTable
          caption="The three replication models, side by side."
          columns={["Single-leader", "Multi-leader", "Leaderless"]}
          rows={[
            {
              feature: "Accepts writes",
              values: ["One node", "Several leaders", "Any replica"],
            },
            {
              feature: "Write conflicts",
              values: ["Impossible (one order)", "Possible — must resolve", "Possible — siblings / version vectors"],
            },
            {
              feature: "On node failure",
              values: ["Failover (risky)", "Others keep serving", "No failover; quorum continues"],
            },
            {
              feature: "Reading latest value",
              values: ["From leader, always", "Eventually consistent", "Guaranteed iff w + r > n"],
            },
            {
              feature: "Examples",
              values: ["PostgreSQL, MySQL, MongoDB", "CouchDB, BDR, Tungsten", "Dynamo, Cassandra, Riak"],
            },
          ]}
        />

        <Figure caption="Detecting concurrency: A → B means 'A happens-before B'. If neither arrow exists, the writes are concurrent and must be merged, not ordered.">
          <svg viewBox="0 0 460 150" className="mx-auto w-full max-w-xl" role="img" aria-label="Happens-before versus concurrent writes">
            {/* sequential (happens-before) */}
            <text x={20} y={24} className="font-mono" fontSize={11} fill="var(--color-ok)">
              happens-before (safe to order)
            </text>
            <circle cx={50} cy={60} r={16} fill="color-mix(in oklab, var(--color-ok) 22%, var(--color-ink-850))" stroke="var(--color-ok)" strokeWidth={1.5} />
            <text x={50} y={64} textAnchor="middle" className="font-mono" fontSize={9} fill="var(--color-fg)">
              v1
            </text>
            <line x1={70} y1={60} x2={120} y2={60} stroke="var(--color-ok)" strokeWidth={1.5} markerEnd="url(#arrow-ok)" />
            <circle cx={140} cy={60} r={16} fill="color-mix(in oklab, var(--color-ok) 22%, var(--color-ink-850))" stroke="var(--color-ok)" strokeWidth={1.5} />
            <text x={140} y={64} textAnchor="middle" className="font-mono" fontSize={9} fill="var(--color-fg)">
              v2
            </text>
            <text x={95} y={48} textAnchor="middle" className="font-mono" fontSize={8} fill="var(--color-fg-faint)">
              read then write
            </text>

            {/* divider */}
            <line x1={235} y1={20} x2={235} y2={132} stroke="var(--color-line-strong)" strokeWidth={1} strokeDasharray="3 4" />

            {/* concurrent */}
            <text x={258} y={24} className="font-mono" fontSize={11} fill="var(--color-fault)">
              concurrent (must merge)
            </text>
            <circle cx={285} cy={84} r={16} fill="var(--color-ink-800)" stroke="var(--color-line-strong)" strokeWidth={1.5} />
            <text x={285} y={88} textAnchor="middle" className="font-mono" fontSize={9} fill="var(--color-fg-muted)">
              v0
            </text>
            <line x1={301} y1={78} x2={350} y2={56} stroke="var(--color-fault)" strokeWidth={1.5} markerEnd="url(#arrow-bad)" />
            <line x1={301} y1={90} x2={350} y2={112} stroke="var(--color-fault)" strokeWidth={1.5} markerEnd="url(#arrow-bad)" />
            <circle cx={372} cy={50} r={16} fill="color-mix(in oklab, var(--accent) 22%, var(--color-ink-850))" stroke="var(--accent)" strokeWidth={1.5} />
            <text x={372} y={54} textAnchor="middle" className="font-mono" fontSize={9} fill="var(--color-fg)">
              vA
            </text>
            <circle cx={372} cy={118} r={16} fill="color-mix(in oklab, var(--color-info) 22%, var(--color-ink-850))" stroke="var(--color-info)" strokeWidth={1.5} />
            <text x={372} y={122} textAnchor="middle" className="font-mono" fontSize={9} fill="var(--color-fg)">
              vB
            </text>
            <text x={420} y={88} textAnchor="middle" className="font-mono" fontSize={8} fill="var(--color-fg-faint)">
              siblings
            </text>

            <defs>
              <marker id="arrow-ok" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                <path d="M0,0 L6,3 L0,6 Z" fill="var(--color-ok)" />
              </marker>
              <marker id="arrow-bad" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                <path d="M0,0 L6,3 L0,6 Z" fill="var(--color-fault)" />
              </marker>
            </defs>
          </svg>
        </Figure>

        <RealWorld
          examples={[
            {
              system: "Cassandra",
              detail: <>Tunable consistency: per-query you set how many replicas must ack (e.g. QUORUM) to satisfy w + r &gt; n.</>,
            },
            {
              system: "Riak",
              detail: <>Stores concurrent values as siblings with version vectors (&ldquo;causal context&rdquo;); offers CRDT data types.</>,
            },
            {
              system: "DynamoDB",
              detail: <>The commercial descendant of the Dynamo paper; offers eventually-consistent and strongly-consistent reads.</>,
            },
          ]}
        />
      </Section>

      {/* ============================================================ WATCH */}
      <Section
        id="watch"
        kicker="See it explained"
        title="Watch it explained"
        intro="Two short lectures from Martin Kleppmann — the author of this very book — covering leader-based replication and quorums on a whiteboard."
      >
        <Prose>
          <p>
            If the trade-offs above still feel abstract, hear them from the source. These are from{" "}
            <strong>Martin Kleppmann&apos;s</strong> University of Cambridge distributed-systems course,
            which is the natural video companion to DDIA. The first lecture builds up replication and why
            asynchronous followers go stale; the second derives the <code>w + r &gt; n</code> quorum
            condition you just played with.
          </p>
        </Prose>

        <YouTubeEmbed
          videoId="mBUCF1WGI_I"
          title="Distributed Systems 5.1: Replication"
          channel="Martin Kleppmann · Cambridge"
        />
        <YouTubeEmbed
          videoId="uNxl3BFcKSA"
          title="Distributed Systems 5.2: Quorums"
          channel="Martin Kleppmann · Cambridge"
        />
      </Section>

      {/* ===================================================== FURTHER READING */}
      <Section
        id="further-reading"
        kicker="Go deeper"
        title="Primary sources"
        intro="The papers, docs, and incident write-ups behind this chapter — read them to see the real systems, not the simplified models."
      >
        <Prose>
          <p>
            DDIA distills decades of systems work; the citations below are where that work actually
            lives. The Dynamo paper is the origin of leaderless quorums; the PostgreSQL and Cassandra
            docs show how single-leader and tunable-quorum replication are configured in production; the
            Jepsen analysis is a sober reminder that &ldquo;majority&rdquo; guarantees are easy to break;
            and GitHub&apos;s post-incident analysis is what failover gone wrong looks like at scale.
          </p>
        </Prose>

        <FurtherReading
          sources={[
            {
              title: "Dynamo: Amazon's Highly Available Key-value Store (SOSP 2007)",
              url: "https://www.allthingsdistributed.com/files/amazon-dynamo-sosp2007.pdf",
              note: "The paper that introduced sloppy quorums, hinted handoff, vector clocks, and anti-entropy — the blueprint for Cassandra and Riak.",
            },
            {
              title: "PostgreSQL — Replication configuration (synchronous_standby_names)",
              url: "https://www.postgresql.org/docs/current/runtime-config-replication.html",
              note: "How real single-leader replication is tuned: synchronous_commit levels and quorum-based ANY num_sync standbys.",
            },
            {
              title: "Cassandra — How are consistent read and write operations handled?",
              url: "https://docs.datastax.com/en/cassandra-oss/3.0/cassandra/dml/dmlAboutDataConsistency.html",
              note: "Tunable consistency (ONE / QUORUM / ALL) and read repair — leaderless w + r > n applied per query.",
            },
            {
              title: "Riak — Causal Context (vector clocks & dotted version vectors)",
              url: "https://docs.riak.com/riak/kv/latest/learn/concepts/causal-context/index.html",
              note: "Why concurrent writes become siblings, and how version vectors tell a true overwrite from a real conflict.",
            },
            {
              title: "Jepsen: MongoDB 4.2.6",
              url: "https://jepsen.io/analyses/mongodb-4.2.6",
              note: "An independent safety analysis finding stale reads and lost writes under default settings — replication guarantees, stress-tested.",
            },
            {
              title: "GitHub — October 21 post-incident analysis",
              url: "https://github.blog/news-insights/company-news/oct21-post-incident-analysis/",
              note: "A 43-second partition triggered a MySQL split brain and 24+ hours of degradation — failover failure modes, in the wild.",
            },
          ]}
        />
      </Section>

      {/* =============================================================== TEST */}
      <Section id="test" kicker="Practice" title="Test Yourself">
        <Prose>
          <p>
            Replication is a chapter of trade-offs, and the fastest way to cement them is to defend
            your reasoning. Generate a quiz, then click <em>discuss</em> on any question to pull the
            answer apart with the AI tutor &mdash; it&apos;s grounded in exactly this chapter.
          </p>
        </Prose>
        <Quiz chapterTitle="Replication" concepts={CONCEPTS} />
        <div className="mt-6">
          <AskClaude chapterTitle="Replication" concepts={CONCEPTS} />
        </div>
      </Section>

      <KeyTakeaways
        points={[
          "Replication exists for three reasons — locality, read throughput, and fault tolerance — but the hard part is propagating changes, not storing copies.",
          "Single-leader replication funnels all writes through one ordered log, which is why it has no write conflicts; synchronous followers stay current but block, async followers stay available but can lose the leader's last writes on failover.",
          "Asynchronous replication is eventually consistent, and lag breaks three concrete guarantees: read-your-writes (read your own data from the leader), monotonic reads (pin a user to one replica), and consistent-prefix (keep causal writes together).",
          "Multi-leader replication wins on local-write latency and datacenter independence but inherits write conflicts; resolution must be convergent, and last-write-wins converges by silently discarding data.",
          "Leaderless (Dynamo-style) replication has no leader and no failover; a read sees the latest write only when w + r > n forces the read and write sets to overlap.",
          "Sloppy quorums, concurrent writes, and clock skew all leak through the quorum guarantee — concurrency is defined by happens-before, and version vectors plus CRDTs are how you merge concurrent siblings without losing data.",
          "There is no universally 'best' model: you are choosing where to spend consistency, availability, and write throughput for your specific workload.",
        ]}
      />
    </ChapterShell>
  );
}
