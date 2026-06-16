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
import { LinearizabilityLab } from "./LinearizabilityLab";
import { RaftConsole } from "./RaftConsole";
import { LamportClocks } from "./LamportClocks";
import { TwoPhaseCommit } from "./TwoPhaseCommit";

export const metadata: Metadata = {
  title: "Consistency & Consensus",
  description:
    "Linearizability, causal ordering, total order broadcast, and consensus — how unreliable nodes agree on a single truth.",
};

const CONCEPTS = `Chapter 9 of DDIA: Consistency and Consensus. The goal is to tolerate faults rather than letting the whole
system fail, and to build general-purpose abstractions on which applications can rely.

Consistency guarantees: replicated systems usually offer at least eventual consistency (convergence) — a weak guarantee
where reads may return stale data but inconsistencies are temporary. Stronger guarantees cost performance and/or fault
tolerance.

Linearizability (atomic / strong consistency): make the system behave as if there is only ONE copy of the data and every
operation on it is atomic. It is a recency guarantee: once one read returns a new value, all later reads (in real time)
must return that value or newer. Operations modeled as read(x), write(x,v), and compare-and-set cas(x_old, v_new).
Contrast with serializability, which is about transactions executing in SOME serial order (an isolation property);
linearizability is about single-object recency. Uses: locks and leader election (only one leader — needs a linearizable
lock; ZooKeeper/etcd), uniqueness constraints (username/email), cross-channel timing dependencies. Implementations:
single-leader replication is potentially linearizable; consensus algorithms are linearizable; multi-leader is not;
leaderless (quorum) is probably not. The CAP theorem (consistent vs available when partitioned) considers only
linearizability and only network partitions, so it is of limited practical use. The real reason to drop linearizability
is usually performance, not just fault tolerance — it is slow even without faults.

Ordering guarantees: causality defines a PARTIAL order (concurrent events are incomparable); linearizability implies a
TOTAL order of operations. Causal consistency is the strongest model that does not slow down under network delays and
stays available during partitions. To track causality the database must know which version was read (version numbers
passed back on writes). Sequence numbers can be made consistent with causality: a single leader increments a counter;
without a leader, use Lamport timestamps — a pair (counter, nodeId) where every node tracks the max counter seen and
bumps to max+1 on receive, giving a total order consistent with happens-before. Total order broadcast (atomic
broadcast): reliable delivery + totally ordered delivery; equivalent to repeated consensus; the basis of state machine
replication and of building linearizable storage (e.g. a linearizable compare-and-set register or log). ZooKeeper and
etcd implement total order broadcast.

Distributed transactions & consensus: consensus = getting several nodes to agree on a value. Needed for leader election
and atomic commit. Two-phase commit (2PC) uses a coordinator: phase 1 prepare (participants vote yes/no; a yes is a
binding promise and forces a disk write), phase 2 commit/abort (unanimity of yes required to commit). 2PC is a BLOCKING
protocol: if the coordinator crashes after participants prepared, they are stuck in-doubt holding locks until it
recovers. XA is the cross-system 2PC standard. Heavy performance cost from fsyncs and round-trips. Fault-tolerant
consensus must satisfy uniform agreement, integrity, validity, and termination (a liveness/fault-tolerance property).
Algorithms: Paxos, Raft, Zab, Viewstamped Replication. They use an epoch/term/ballot/view number; the leader is unique
within an epoch; a quorum (strict majority) must vote, and the two rounds of voting (elect leader, then vote on
proposals) must overlap. Unlike 2PC, consensus needs only a majority, not every participant. Cost: a kind of synchronous
replication; sensitive to timeouts causing spurious elections; usually static membership. Coordination services
(ZooKeeper, etcd, Consul, Chubby) provide linearizable atomic ops, total ordering with fencing tokens, failure detection
via sessions, change notifications, service discovery, and membership.`;

export default function Page() {
  return (
    <ChapterShell slug="consistency-consensus" diagram={<Hero />}>
      {/* =============================== Intro =============================== */}
      <Section
        id="intro"
        kicker="Why this chapter"
        title="From tolerating faults to agreeing on truth"
        intro="The simplest way to handle a fault is to let the whole service fail. This chapter is about the better options — general-purpose abstractions that let a herd of unreliable machines behave like one trustworthy one."
      >
        <Prose>
          <p>
            In a distributed system, the same write arrives at different nodes at different times; networks delay,
            reorder, and drop messages; clocks drift; and nodes crash without warning. The previous chapter was the
            pessimist&apos;s tour of everything that can go wrong. This chapter is the constructive answer: a ladder of{" "}
            <strong>consistency guarantees</strong> — from weak-but-fast to strong-but-expensive — and the algorithms
            that implement the strong end of the ladder.
          </p>
          <p>
            The summit is <em>consensus</em>: getting several nodes to agree on a single value despite faults. It sounds
            modest, but it is one of the most important and subtle results in distributed computing. Get it, and you can
            elect a leader, commit a transaction atomically across machines, enforce a uniqueness constraint, or build a
            linearizable register. Crucially, many of these problems turn out to be <strong>equivalent</strong> — solve
            one and you can solve the rest.
          </p>
        </Prose>
        <Callout variant="note" title="The throughline">
          Linearizability, total order broadcast, and consensus are three faces of the same idea: imposing a single,
          agreed-upon order on events. The rest of this page builds that idea up one layer at a time.
        </Callout>
      </Section>

      {/* ==================== 1 · Consistency Guarantees ==================== */}
      <Section
        id="consistency"
        kicker="Consistency Guarantees"
        title="A ladder from eventual to strong"
        intro="Most replicated databases give you at least eventual consistency. Understanding exactly what that does — and doesn't — promise is the foundation for everything else."
      >
        <Prose>
          <p>
            <strong>Eventual consistency</strong> is the weakest useful guarantee: if you stop writing and wait long
            enough, all replicas <em>converge</em> to the same value. The catch is the word <em>eventually</em> — it
            says nothing about <em>when</em>, and until convergence happens a read can return any stale value, including
            a value older than one you previously read yourself. Builders who rely on weak guarantees must stay
            constantly aware of their sharp edges, because the bugs they cause are rare, timing-dependent, and brutal to
            reproduce.
          </p>
          <p>
            Stronger models tighten what a read may return. The strongest single-object model is{" "}
            <strong>linearizability</strong> (next section). In between sit guarantees like reading your own writes,
            monotonic reads, and <strong>causal consistency</strong>. The fundamental tension never goes away: stronger
            guarantees generally cost <em>latency</em> and <em>availability</em>, while weaker guarantees buy speed and
            fault tolerance at the price of programmer headaches.
          </p>
        </Prose>

        <DefinitionGrid
          items={[
            {
              term: "Eventual consistency",
              def: <>Replicas converge if writes stop. No bound on staleness or on when convergence happens.</>,
            },
            {
              term: "Read-your-writes",
              def: <>A user always sees their own updates, even if other users see them later.</>,
            },
            {
              term: "Monotonic reads",
              def: <>You never see time go backwards — reads don&apos;t jump to an older value than one already seen.</>,
            },
            {
              term: "Linearizability",
              def: <>The strongest: behave as if there is a single copy and every operation is atomic and instantaneous.</>,
            },
          ]}
        />

        <Analogy title="Analogy — the group chat">
          Eventual consistency is a group chat with flaky reception. Everyone <em>eventually</em> sees every message, but
          for a while you might see a reply before the message it answers, or a friend quotes a message that hasn&apos;t
          reached your phone yet. Nothing is lost forever — but at any instant, no two phones are guaranteed to show the
          same transcript.
        </Analogy>

        <RealWorld
          examples={[
            {
              system: "Amazon DynamoDB",
              detail: <>Offers a fast <em>eventually consistent</em> read by default and a slower <em>strongly consistent</em> read as an explicit, more expensive option.</>,
            },
            {
              system: "Apache Cassandra",
              detail: <>Leaderless, tunable consistency: weak by default, but quorum reads/writes (<code>w + r &gt; n</code>) tighten it — though still not full linearizability.</>,
            },
            {
              system: "PostgreSQL replicas",
              detail: <>Async streaming replicas serve eventually-consistent reads; a stale follower can lag behind the primary by seconds.</>,
            },
          ]}
        />
      </Section>

      {/* ======================= 2 · Linearizability ======================= */}
      <Section
        id="linearizability"
        kicker="Linearizability"
        title="Pretending there is only one copy"
        intro="Linearizability makes a replicated, distributed register behave as if it were a single variable that every operation touches atomically — a recency guarantee that turns out to be both powerful and costly."
      >
        <Prose>
          <p>
            Formally, <strong>linearizability</strong> (a.k.a. atomic consistency or strong consistency) says: even
            though data is spread across many replicas, the system must <em>look</em> like there is exactly one copy,
            and every operation on it takes effect <em>atomically</em> at some single instant between its invocation and
            its response. The key consequence is a <strong>recency guarantee</strong>: the moment one read observes a
            new value, every read that <em>starts later in real time</em> must also observe that value (or a newer one).
            Time may not appear to run backwards.
          </p>
          <p>
            The model uses three operations on a register <code>x</code>: <code>read(x) ⇒ v</code>,{" "}
            <code>write(x, v) ⇒ ok</code>, and the atomic{" "}
            <code>cas(x, v_old, v_new)</code> — compare-and-set, which writes <code>v_new</code> only if{" "}
            <code>x</code> currently equals <code>v_old</code>. A history of overlapping operations is{" "}
            <strong>linearizable</strong> if you can place each one at a single point in time (its{" "}
            <em>linearization point</em>) such that (1) the order respects real time and (2) the resulting sequence is a
            valid run of a single register. The lab below lets you test exactly this.
          </p>
          <p>
            Do not confuse it with <strong>serializability</strong>. Serializability is an <em>isolation</em> property
            about <em>transactions</em> (groups of operations on multiple objects) appearing to run in <em>some</em>{" "}
            serial order — that order need not match wall-clock time. Linearizability is about the <em>recency</em> of
            reads and writes on a <em>single</em> object. A system can offer one without the other;{" "}
            <strong>strict serializability</strong> is the combination of both.
          </p>
        </Prose>

        <CompareTable
          caption="Two guarantees that are often conflated"
          columns={["Linearizability", "Serializability"]}
          rows={[
            { feature: "Scope", values: ["A single object / register", "Transactions over many objects"] },
            { feature: "Property type", values: ["Recency (real-time)", "Isolation (serial equivalence)"] },
            { feature: "Cares about wall-clock?", values: ["Yes — respects real-time order", "No — any serial order is fine"] },
            { feature: "Typical mechanism", values: ["Single leader / consensus", "2PL, serializable snapshot isolation"] },
          ]}
        />

        <Analogy title="Analogy — the stadium scoreboard">
          Picture one giant scoreboard everyone in the stadium can see. When a goal is scored, the number flips{" "}
          <em>instantaneously</em> for the whole crowd at once. There is exactly one board, so two fans can never disagree
          about the current score, and once <em>you</em> see 2–1, nobody sitting near you can still be reading 1–1. That
          single, atomic, always-current board is a linearizable register — even if, behind the scenes, the score is
          relayed through many cables and screens.
        </Analogy>

        <DemoFrame
          label="Live demo · centerpiece"
          title="Linearizability Lab"
          description="Schedule concurrent reads and writes on one register on a real-time line. The checker searches for a single total order that respects both real time and the register's sequential spec — and tells you the instant no such order exists."
          right={<>register · CAS-free</>}
        >
          <LinearizabilityLab />
        </DemoFrame>

        <Callout variant="insight" title="Why a single leader is only *potentially* linearizable">
          Reads served by an asynchronous follower can be stale, breaking recency. Even a <em>leader</em> can serve
          stale data: in Kyle Kingsbury&apos;s 2014 Jepsen test, etcd&apos;s &quot;consistent&quot; reads only checked
          whether a node still believed itself leader — so during a partition a deposed leader happily returned an old
          value after a newer write had committed elsewhere. The fix was a <strong>quorum read</strong>: route the read
          through the consensus log so a majority confirms you are still leader. That extra round-trip is the real price
          of recency.
        </Callout>

        <Prose>
          <p>
            <strong>Where you actually need it.</strong> Linearizability is not a luxury for a handful of problems —
            it&apos;s a correctness requirement. <em>Leader election</em> relies on a linearizable lock so that all nodes
            agree on exactly one leader; otherwise you get split brain. <em>Uniqueness constraints</em> (one account per
            username, no double-spend) are really a lock on the contended value and need linearizability to be hard
            guarantees. And <em>cross-channel timing dependencies</em> — &quot;the message queue tells the worker an
            image is ready, but the worker reads the database and finds nothing&quot; — are linearizability violations in
            disguise.
          </p>
        </Prose>

        <RealWorld
          examples={[
            {
              system: "ZooKeeper / etcd",
              detail: <>Provide linearizable writes and compare-and-set, the backbone for distributed locks and leader election across the industry.</>,
            },
            {
              system: "Single-leader RDBMS",
              detail: <>PostgreSQL / MySQL on the primary are linearizable for a row; the danger is silently reading a lagging replica.</>,
            },
            {
              system: "Multi-leader & Dynamo-style stores",
              detail: <>Multi-leader replication is <em>not</em> linearizable; leaderless quorum systems are <em>probably not</em>, because concurrent quorums can observe different recencies.</>,
            },
          ]}
        />

        <Callout variant="tradeoff" title="The CAP theorem, demystified">
          CAP is often mis-taught as &quot;pick 2 of 3.&quot; More precisely: when a network is <em>Partitioned</em>, you
          must choose between <em>Consistency</em> (linearizability) and <em>Availability</em>. But CAP only considers
          that one consistency model and that one fault, ignoring latency entirely. The everyday reason teams abandon
          linearizability isn&apos;t partitions at all — it&apos;s that coordinating on every operation is{" "}
          <strong>slow, all the time</strong>.
        </Callout>
      </Section>

      {/* ===================== 3 · Ordering Guarantees ===================== */}
      <Section
        id="ordering"
        kicker="Ordering Guarantees"
        title="Causality, total order, and the clocks that bridge them"
        intro="Linearizability gives a single total order but is expensive. Causality asks for less — only that effects follow their causes — and that turns out to be the strongest order you can keep without paying the coordination tax."
      >
        <Prose>
          <p>
            Ordering and consistency are deeply linked. <strong>Causality</strong> imposes a <em>partial order</em>: if
            event A <em>happened before</em> B (A could have influenced B), then everyone must agree A precedes B; but
            two <em>concurrent</em> events — neither aware of the other — are incomparable and may be ordered either way.
            <strong>Linearizability</strong>, by contrast, imposes a <em>total order</em>: every pair of operations is
            comparable, as if laid on one timeline. A total order is stronger, and strictly costlier.
          </p>
          <p>
            The pivotal result: <strong>causal consistency is the strongest consistency model that does not slow down
            under network delays and stays available during partitions.</strong> If linearizability is too expensive,
            causal consistency is usually the right ceiling to aim for. To preserve causality the database must know{" "}
            <em>which version of the data a write was based on</em> — so clients pass the version number they read back
            on the next write, letting the system reconstruct the happened-before graph.
          </p>
          <p>
            How do you turn that partial order into usable sequence numbers? With a single leader, just increment a
            counter per operation. Without a leader, naive schemes (odd/even per node, wall-clock timestamps, preallocated
            blocks) produce a total order that is <em>not consistent with causality</em>. The elegant fix is{" "}
            <strong>Lamport timestamps</strong>: each event gets a pair <code>(counter, nodeId)</code>; every node and
            client tracks the maximum counter it has seen and, on receiving any message, bumps its counter to{" "}
            <code>max(local, incoming) + 1</code>. Sort by <code>(counter, nodeId)</code> and you get a total order that
            never contradicts happens-before. The demo below lets you trigger the violation and then watch Lamport
            repair it.
          </p>
        </Prose>

        <DemoFrame
          label="Live demo"
          title="Lamport Clocks vs Wall Clocks"
          description="Record local events and pass messages between three processes. Flip between physical timestamps and Lamport timestamps and watch whether the resulting total order ever places a delivery before the send that caused it."
          right={<>(counter, node)</>}
        >
          <LamportClocks />
        </DemoFrame>

        <Analogy title="Analogy — dating your letters">
          Imagine pen-pals with unsynchronized watches. If each dates a letter by their own watch, a reply can be stamped
          <em>earlier</em> than the letter it answers — nonsense. Lamport&apos;s rule: whenever you write a letter, look
          at the highest number on any letter you&apos;ve ever <em>received</em>, add one, and use that. Now every reply
          outranks its prompt, even though no two watches agree on the actual time.
        </Analogy>

        <Prose>
          <p>
            Lamport timestamps give a total order, but only <em>after the fact</em> — you can&apos;t know an
            operation&apos;s final rank until you&apos;ve seen everything that might out-number it. For online systems we
            need ordering decided <em>as messages are delivered</em>. That stronger primitive is{" "}
            <strong>total order broadcast</strong> (atomic broadcast), defined by two properties:
          </p>
          <ul>
            <li>
              <strong>Reliable delivery</strong> — if a message reaches one non-faulty node, it reaches all of them.
            </li>
            <li>
              <strong>Totally ordered delivery</strong> — every node delivers messages in the <em>same</em> order, and
              that order is fixed: you can&apos;t retroactively insert a message earlier once later ones are delivered.
            </li>
          </ul>
          <p>
            This is exactly a <strong>replicated log</strong>: delivering a message is appending to the log. If every
            replica applies the same writes in the same order, the replicas stay identical — this is{" "}
            <strong>state machine replication</strong>. And it composes upward: with total order broadcast you can build
            <em>linearizable</em> storage (append your operation, wait for it to come back, then act), and a linearizable
            compare-and-set register lets you mint sequence numbers for the broadcast. Total order broadcast and
            consensus, we&apos;ll see next, are two names for the same mountain.
          </p>
        </Prose>

        <Figure caption="The ladder of orderings: each rung is strictly stronger and strictly more expensive to maintain.">
          <div className="grid gap-2 p-1 font-mono text-xs sm:grid-cols-3">
            <div className="rounded-lg border border-info/40 bg-info/5 p-4">
              <div className="mb-1 text-info">PARTIAL ORDER</div>
              <div className="text-fg">Causal consistency</div>
              <div className="mt-2 text-[11px] leading-relaxed text-fg-faint">
                Effects follow causes. Concurrent events incomparable. Fast, partition-tolerant.
              </div>
            </div>
            <div className="rounded-lg border border-accent/40 bg-accent/5 p-4">
              <div className="accent-text mb-1">TOTAL ORDER (deferred)</div>
              <div className="text-fg">Lamport timestamps</div>
              <div className="mt-2 text-[11px] leading-relaxed text-fg-faint">
                A consistent-with-causality total order — but only knowable once all ops are collected.
              </div>
            </div>
            <div className="rounded-lg border border-special/40 bg-special/5 p-4">
              <div className="mb-1 text-special">TOTAL ORDER (online)</div>
              <div className="text-fg">Total order broadcast</div>
              <div className="mt-2 text-[11px] leading-relaxed text-fg-faint">
                Order fixed at delivery time. Equivalent to consensus. Enables linearizable storage.
              </div>
            </div>
          </div>
        </Figure>

        <RealWorld
          examples={[
            {
              system: "ZooKeeper (Zab) & etcd (Raft)",
              detail: <>Both implement total order broadcast: every node applies the same sequence of writes, giving state machine replication.</>,
            },
            {
              system: "Apache Kafka",
              detail: <>A partition is a totally-ordered append-only log; consumers replay records in the exact order they were written.</>,
            },
            {
              system: "Version vectors (Dynamo/Riak)",
              detail: <>Track causality (the partial order) so the system can detect concurrent writes and surface conflicts instead of silently losing data.</>,
            },
          ]}
        />
      </Section>

      {/* ============= 4 · Distributed Transactions & Consensus ============ */}
      <Section
        id="consensus"
        kicker="Distributed Transactions & Consensus"
        title="Getting nodes to agree — atomically"
        intro="Consensus is simply several nodes agreeing on one value. From that humble definition flow atomic commit, leader election, and fault-tolerant replication — and the hard-won algorithms (Paxos, Raft, Zab) that make it work."
      >
        <Prose>
          <p>
            Two everyday problems need agreement. <strong>Leader election</strong>: all nodes must concur on which node
            is the leader, or you risk two leaders and split brain. <strong>Atomic commit</strong>: when a transaction
            spans multiple nodes, either <em>all</em> of them commit or <em>all</em> abort — never a half-finished
            result. On a single machine, atomicity is just the order of disk writes (data first, then the commit
            record). Across machines it requires every participant to agree on the same outcome.
          </p>
          <p>
            The classic algorithm is <strong>two-phase commit (2PC)</strong>, coordinated by a transaction manager. In{" "}
            <em>phase 1</em>, the coordinator sends a <code>prepare</code> request and each participant votes{" "}
            <em>yes</em> or <em>no</em>. A <em>yes</em> is a <strong>binding promise</strong> — the participant has
            durably written its prepared state and locked the affected rows, so it cannot back out. In <em>phase 2</em>,
            if (and only if) <em>every</em> participant voted yes, the coordinator durably records <code>commit</code> to
            its own log — the point of no return — and tells everyone to commit; a single <em>no</em> forces a global
            abort. Walk through all three scenarios in the stepper below.
          </p>
        </Prose>

        <DemoFrame
          label="Live demo"
          title="Two-Phase Commit Stepper"
          description="Drive a coordinator and three participants through prepare and commit. Make one participant veto, or crash the coordinator mid-protocol, and watch the prepared participants get stuck in-doubt — holding locks until recovery."
          right={<>blocking protocol</>}
        >
          <TwoPhaseCommit />
        </DemoFrame>

        <Callout variant="warning" title="2PC is a *blocking* protocol">
          If the coordinator crashes after participants have prepared but before delivering the decision, those
          participants are <strong>in doubt</strong>: they hold locks and can neither commit nor abort on their own.
          They must block until the coordinator recovers and reads its log. Three-phase commit (3PC) tries to fix this
          but needs a <em>perfect failure detector</em> — unattainable on a real asynchronous network — so it isn&apos;t
          used in practice.
        </Callout>

        <Prose>
          <p>
            <strong>Fault-tolerant consensus</strong> raises the bar: nodes <em>propose</em> values and the algorithm{" "}
            <em>decides</em> one, satisfying four properties. <em>Uniform agreement</em>: no two nodes decide
            differently. <em>Integrity</em>: no node decides twice. <em>Validity</em>: a decided value was proposed by
            some node. <em>Termination</em>: every non-crashed node eventually decides. The first three are{" "}
            <strong>safety</strong> properties (nothing bad happens); termination is a <strong>liveness</strong> property
            and is what makes the algorithm fault-tolerant — it must finish even if some nodes fail. (Without
            termination you could just appoint a dictator node, but it would take the whole system down with it.)
          </p>
          <p>
            The best-known fault-tolerant consensus algorithms are <strong>Paxos, Raft, Zab, and Viewstamped
            Replication</strong>. Internally they all elect a leader, but the leader is only guaranteed unique{" "}
            <em>within an epoch</em> — called the <code>term</code> in Raft, <code>ballot</code> in Paxos,{" "}
            <code>view</code> in VSR. Whenever the leader looks dead, survivors start an election with an incremented,
            totally-ordered epoch number; a higher epoch always wins, killing off zombie leaders. A leader can&apos;t
            trust its own judgement — for every decision it must collect votes from a <strong>quorum</strong> (a strict
            majority), and the quorums for electing a leader and for accepting its proposals must <em>overlap</em>. The
            console below is a hands-on Raft.
          </p>
        </Prose>

        <DemoFrame
          label="Live demo · centerpiece"
          title="Raft Console — election, partitions & log reconciliation"
          description="A 5-node cluster you drive on a logical clock. Step time (or auto-run) and watch heartbeats keep followers in line. Crash the leader and survivors time out, bump their term, and elect a new leader — only a node with an up-to-date log can win. Then partition the network into {n1,n2} | {n3,n4,n5}: the minority cannot elect or commit, so split-brain is prevented. Heal it and watch the stale leader step down as logs reconcile."
          right={<>quorum = 3 / 5</>}
        >
          <RaftConsole />
        </DemoFrame>

        <Callout variant="insight" title="Consensus = total order broadcast = repeated agreement">
          Running consensus once per slot in a log gives you total order broadcast: <em>agreement</em> means all nodes
          deliver the same messages in the same order, <em>integrity</em> means none are duplicated, <em>validity</em>{" "}
          means none are corrupted, and <em>termination</em> means none are lost. This is why a consensus system is the
          natural engine for state machine replication.
        </Callout>

        <CompareTable
          caption="Two-phase commit vs fault-tolerant consensus"
          columns={["Two-Phase Commit", "Consensus (Raft/Paxos)"]}
          rows={[
            { feature: "Votes needed", values: [<Fragment key={0}><strong>Every</strong> participant must say yes</Fragment>, <Fragment key={1}>Only a <strong>quorum</strong> (majority)</Fragment>] },
            { feature: "Tolerates a node failing?", values: ["No — one crash can block or abort", "Yes — minority can fail, majority proceeds"] },
            { feature: "Coordinator crash", values: ["Blocks: participants in-doubt", "New leader elected in a higher term"] },
            { feature: "Primary use", values: ["Atomic commit across systems (XA)", "Leader election, replicated logs"] },
            { feature: "Liveness", values: ["Blocking", "Live while a majority survives"] },
          ]}
        />

        <Analogy title="Analogy — the committee that always has quorum">
          Two-phase commit is a committee whose rule is <em>unanimity</em>: if a single member is absent or objects, no
          motion passes — and if the chair walks out mid-vote, everyone sits frozen, unable to act. Consensus is a
          committee that only needs a <em>majority present</em> to decide. If the chair vanishes, the remaining members
          simply hold a new election (a new &quot;term&quot;) and carry on. Because any two majorities of the same
          committee must share at least one member, no two majorities can ever ratify contradictory decisions — that
          overlap is precisely why a quorum is safe.
        </Analogy>

        <Prose>
          <p>
            Consensus isn&apos;t free. The voting round before any decision is a form of <em>synchronous</em>{" "}
            replication, which adds latency. A strict majority must always be reachable, so a minority partition simply
            stops. Most algorithms assume <em>static membership</em> — adding or removing nodes safely is far less
            well-understood. And because failure detection rests on <em>timeouts</em>, a flaky wide-area link can make
            nodes wrongly suspect a healthy leader, triggering election storms that burn all the cluster&apos;s time
            campaigning instead of working.
          </p>
          <p>
            In practice you rarely implement consensus yourself. Instead you lean on a <strong>coordination service</strong>{" "}
            — ZooKeeper, etcd, or Consul — modeled after Google&apos;s Chubby. They hold a small amount of slow-changing,
            in-memory data (&quot;node 10.1.1.23 is leader for partition 7&quot;) replicated by fault-tolerant total
            order broadcast, and expose exactly the primitives distributed systems need.
          </p>
        </Prose>

        <CodeBlock
          lang="text"
          caption="A fencing token from a coordination service prevents a paused leader from corrupting state."
          code={`# Acquire a lock and get a monotonically increasing fencing token
zk.create("/lock/partition-7", ephemeral=True)   # session-bound lock
token = 33                                        # bumps every acquisition

# Every write to the protected resource carries the token:
write(resource, data, fencing_token=33)

# If this client paused (GC/STW) and another took the lock (token=34),
# the storage layer rejects the stale write:
write(resource, data, fencing_token=33)  ->  REJECTED (saw 34)`}
        />

        <DefinitionGrid
          items={[
            {
              term: "Epoch / term / ballot",
              def: <>A monotonically increasing number that makes the leader unique <em>within</em> it; higher always wins.</>,
            },
            {
              term: "Quorum",
              def: <>A strict majority of nodes. Election and proposal quorums must overlap so decisions can&apos;t conflict.</>,
            },
            {
              term: "Fencing token",
              def: <>An increasing number handed out with a lock; lets storage reject writes from a stale, paused lock-holder.</>,
            },
            {
              term: "In-doubt transaction",
              def: <>A 2PC participant that prepared but hasn&apos;t heard the verdict — locked and stuck until the coordinator recovers.</>,
            },
          ]}
        />

        <RealWorld
          examples={[
            {
              system: "Google Chubby / Spanner",
              detail: <>Chubby (Paxos) underpins Google&apos;s locking and naming; Spanner uses Paxos groups for globally-consistent transactions.</>,
            },
            {
              system: "etcd (Raft) in Kubernetes",
              detail: <>Every Kubernetes object lives in etcd; Raft keeps it consistent. Clusters run an <em>odd</em> size so a partition always has a majority side — a 3-node cluster tolerates 1 failure, a 5-node cluster tolerates 2; lose the majority and etcd goes read-only rather than risk divergence.</>,
            },
            {
              system: "Apache ZooKeeper (Zab)",
              detail: <>Leader election, locks with fencing tokens, session-based failure detection, and service discovery for Kafka, HBase, and more.</>,
            },
            {
              system: "XA transactions",
              detail: <>The 2PC standard supported by PostgreSQL, MySQL, Oracle, SQL Server, and brokers like ActiveMQ and IBM MQ.</>,
            },
          ]}
        />
      </Section>

      {/* ========================= See it explained ========================= */}
      <Section
        id="watch"
        kicker="See it explained"
        title="Two talks that make it click"
        intro="Reading about consensus is one thing; watching a leader fail over and an eventual-consistency anomaly unfold is another. Both videos below are by people who built or wrote the canonical material."
      >
        <Prose>
          <p>
            First, John Ousterhout — Raft&apos;s co-creator — on <em>why</em> Raft was designed to be understandable,
            walking through leader election and log replication in the same terms as the console above. Then Martin
            Kleppmann (author of this very book) on eventual consistency, the weak end of the ladder we started from.
          </p>
        </Prose>

        <YouTubeEmbed
          videoId="vYp4LYbnnW8"
          title="Designing for Understandability: The Raft Consensus Algorithm"
          channel="John Ousterhout · CS @ Illinois"
        />

        <YouTubeEmbed
          videoId="9uCP3qHNbWw"
          title="Distributed Systems 7.3: Eventual consistency"
          channel="Martin Kleppmann · Cambridge"
        />

        <Callout variant="note" title="Want the interactive version?">
          The official Raft visualization at <strong>raft.github.io</strong> and the gentler walkthrough at{" "}
          <strong>thesecretlivesofdata.com</strong> both animate elections, heartbeats, and split votes live — a perfect
          companion to the console above. Links in Further reading.
        </Callout>
      </Section>

      {/* =========================== Further reading ======================== */}
      <Section
        id="further-reading"
        kicker="Go deeper"
        title="Primary sources & field reports"
        intro="The papers that defined consensus, the visualizations that demystify it, and the empirical tests that show what real systems actually do under partition."
      >
        <FurtherReading
          sources={[
            {
              title: "In Search of an Understandable Consensus Algorithm (Raft)",
              url: "https://raft.github.io/raft.pdf",
              note: "Ongaro & Ousterhout's Raft paper — leader election, log replication, and the safety argument, all written to be readable.",
            },
            {
              title: "The Raft visualization & resource hub",
              url: "https://raft.github.io/",
              note: "Drive an interactive cluster: trigger elections, drop packets, watch terms advance — plus links to 100+ implementations.",
            },
            {
              title: "The Secret Lives of Data — Raft, illustrated",
              url: "https://thesecretlivesofdata.com/raft/",
              note: "A guided, animated tour of Raft from the consensus problem through network failures. The gentlest possible on-ramp.",
            },
            {
              title: "Paxos Made Simple — Leslie Lamport",
              url: "https://lamport.azurewebsites.net/pubs/paxos-simple.pdf",
              note: "The 13-page note where Lamport re-explains Paxos with \"no formula more complicated than n1 > n2.\"",
            },
            {
              title: "Please stop calling databases CP or AP — Martin Kleppmann",
              url: "https://martin.kleppmann.com/2015/05/11/please-stop-calling-databases-cp-or-ap.html",
              note: "Why the CAP theorem's narrow definitions make \"CP vs AP\" labels misleading in practice.",
            },
            {
              title: "Jepsen: etcd and Consul",
              url: "https://aphyr.com/posts/316-jepsen-etcd-and-consul",
              note: "The classic teardown showing how \"consistent\" reads served stale data under partition — and how quorum reads fixed it.",
            },
            {
              title: "etcd documentation — Raft & operating a cluster",
              url: "https://etcd.io/docs/latest/learning/",
              note: "How a production coordination store applies Raft: membership, quorum sizing, linearizable vs serializable reads.",
            },
            {
              title: "Apache ZooKeeper — internals & the Zab protocol",
              url: "https://zookeeper.apache.org/doc/current/zookeeperInternals.html",
              note: "How ZooKeeper guarantees total order broadcast, plus why writes are linearizable but plain reads aren't (use sync()).",
            },
          ]}
        />
      </Section>

      {/* ============================ Test yourself ========================= */}
      <Section id="test" kicker="Practice" title="Test yourself">
        <Prose>
          <p>
            Generate a fresh quiz on consistency and consensus, then push the tutor on anything that&apos;s still fuzzy —
            the distinction between linearizability and serializability and the 2PC-vs-consensus trade-off are favorite
            sources of confusion.
          </p>
        </Prose>
        <Quiz chapterTitle="Consistency & Consensus" concepts={CONCEPTS} />
        <div className="mt-6">
          <AskClaude chapterTitle="Consistency & Consensus" concepts={CONCEPTS} />
        </div>
      </Section>

      <KeyTakeaways
        points={[
          "Eventual consistency only promises convergence if writes stop — it says nothing about staleness or timing, so weak guarantees demand constant vigilance.",
          "Linearizability makes a distributed register behave like one atomic variable: a recency guarantee where, once a new value is read, all later reads must see it or newer.",
          "Linearizability is about single-object recency in real time; serializability is about transactions running in some serial order. They are different guarantees that combine into strict serializability.",
          "Causality is a partial order (concurrent events are incomparable); causal consistency is the strongest model that stays fast and available — Lamport timestamps give a total order consistent with it.",
          "Total order broadcast, linearizable storage, and consensus are mutually reducible — solving one solves the others, and a replicated log is the shared shape underneath.",
          "Two-phase commit needs unanimous yes votes and blocks if the coordinator crashes; fault-tolerant consensus needs only a majority and keeps making progress while one survives.",
          "Because any two majorities of a cluster must share a node, a partitioned minority can never elect a rival leader or commit — split brain is prevented by refusing to make progress, and a higher epoch number fences any stale leader on heal.",
          "Don't build consensus yourself: ZooKeeper, etcd, and Consul package leader election, linearizable locks with fencing tokens, and failure detection for you.",
        ]}
      />
    </ChapterShell>
  );
}
