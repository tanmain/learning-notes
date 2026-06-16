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
import { TimeoutDilemmaDemo } from "./TimeoutDilemmaDemo";
import { TimeoutTuner } from "./TimeoutTuner";
import { ClockSkewDemo } from "./ClockSkewDemo";
import { FencingTokenDemo } from "./FencingTokenDemo";
import { LockLeaseSim } from "./LockLeaseSim";
import { QuorumDemo } from "./QuorumDemo";

export const metadata: Metadata = {
  title: "The Trouble with Distributed Systems",
  description:
    "Partial failures, unbounded network delays, untrustworthy clocks, and why a node can never really know the truth — the pessimist's tour of distributed systems.",
};

const CONCEPTS = `
Chapter 8 of DDIA — "The Trouble with Distributed Systems" — is a pessimist's catalogue of everything that can go wrong once data leaves a single machine.

FAULTS & PARTIAL FAILURES. A single computer is deterministic: it either works or it crashes cleanly. A distributed system suffers PARTIAL FAILURE — some parts work while others are broken, and the faults are NONDETERMINISTIC and unpredictable. The engineering goal is to build a RELIABLE system from UNRELIABLE components by accepting partial failure and designing fault-tolerance in. Shared-nothing systems communicate only over the network.

UNRELIABLE NETWORKS. The internet and most datacenter networks are ASYNCHRONOUS PACKET NETWORKS with no delivery or timing guarantees. A request may be lost, queued, the remote node may have crashed or paused, or the response may be lost or delayed. If you send a request and get no response, it is IMPOSSIBLE to know why — you cannot distinguish a dead node from a slow one or a dropped packet. The only handling is a TIMEOUT, but there is no correct timeout value: short timeouts detect failures fast but cause false positives (declaring live nodes dead, leading to duplicated actions and extra load from failover); long timeouts wait too long. Delays are UNBOUNDED because of network congestion, switch queueing, busy CPUs, VM pauses, and TCP flow control. Synchronous circuits (telephone) give BOUNDED delay by reserving bandwidth; packet networks instead optimise for bursty traffic and dynamic bandwidth. Timeouts should be chosen experimentally by measuring the round-trip-time distribution and its jitter.

UNRELIABLE CLOCKS. Each machine has its own quartz clock that drifts; NTP synchronises them imperfectly. TIME-OF-DAY (wall-clock) clocks can jump backward when reset by NTP and are unsuitable for measuring elapsed time. MONOTONIC clocks only move forward and are right for measuring durations/timeouts, but their absolute value is meaningless. Relying on clocks for ORDERING events across nodes is tempting but dangerous: LAST-WRITE-WINS (LWW), used in Cassandra and Riak and multi-leader replication, silently DROPS data when clocks disagree. LOGICAL CLOCKS (counters, e.g. Lamport) capture ordering safely without measuring physical time. Clock readings are really a CONFIDENCE INTERVAL, not a point; Google Spanner exploits this with TrueTime, deliberately waiting out the uncertainty interval (using GPS/atomic clocks) so transaction timestamps don't overlap. PROCESS PAUSES (stop-the-world GC, VM suspension, paging, SIGSTOP) mean a node can freeze for seconds with no warning, so a leader holding a time-based LEASE may believe it still holds it after it expired. You cannot assume anything about timing.

KNOWLEDGE, TRUTH & LIES. A node cannot trust its own judgement; distributed systems rely on a QUORUM (majority vote) to decide truth. FENCING TOKENS — monotonically increasing numbers returned with each lock/lease grant — let a storage server reject a stale, paused lock holder by remembering the highest token it has accepted, preventing split-brain corruption. ZooKeeper's zxid or node cversion can serve as fencing tokens. Fencing handles nodes that fail inadvertently. BYZANTINE FAULTS are nodes that actively lie or behave arbitrarily; a system is BYZANTINE FAULT-TOLERANT if it tolerates them (relevant to aerospace and adversarial multi-organisation settings like blockchains), but most datacenter systems assume non-Byzantine nodes.
`;

export default function Page() {
  return (
    <ChapterShell slug="distributed-trouble" diagram={<Hero />}>
      {/* ---------------------------------------------------------------- Intro */}
      <Section
        kicker="The pessimist's tour"
        title="Working with the messy physical world"
        intro="On one machine, software is deterministic. The moment your data spans many machines connected by a network, you inherit a world of unpredictable, partial, nondeterministic failure — and you must build something reliable on top of it anyway."
      >
        <Prose>
          <p>
            A program running on a single computer normally behaves <em>deterministically</em>: given the same
            inputs it produces the same outputs, and when the hardware is faulty it tends to fail completely —
            a kernel panic, a crash, a blue screen — rather than returning subtly wrong answers. There is no
            good reason for single-machine software to be flaky.
          </p>
          <p>
            Distributed systems are different in kind, not just degree. Once you have multiple nodes connected
            by a network, you confront the messy reality of the physical world: some components work while
            others are broken in unpredictable ways. This is <strong>partial failure</strong>, and its defining
            property is that it is <strong>nondeterministic</strong>. A request might succeed, fail, or hang —
            and running it again might do something different. The whole discipline of this chapter is learning
            to <strong>build a reliable system from unreliable components</strong> by confronting, rather than
            wishing away, every way things can break.
          </p>
        </Prose>
        <Callout variant="note" title="Why so pessimistic?">
          This chapter is deliberately a catalogue of failure modes. The payoff comes in Chapter 9: once you
          accept exactly how networks, clocks, and nodes betray you, you can reason precisely about which
          guarantees (linearizability, consensus) are achievable and at what cost.
        </Callout>
      </Section>

      {/* ----------------------------------------------- 1 · Partial failures */}
      <Section
        id="faults"
        kicker="Faults & Partial Failures"
        title="A reliable system from unreliable parts"
        intro="Single computers fail cleanly. Distributed systems fail partially, nondeterministically, and silently. Fault tolerance has to be designed in — it is never free."
      >
        <Prose>
          <p>
            On a single node we lean on an implicit contract: the machine is either up or down, and we don&apos;t
            normally have to handle &quot;half up.&quot; Distributed systems break that contract. A node can be
            reachable but slow; a disk can accept writes but corrupt them; one replica can be hours behind
            another. Because faults are <strong>partial</strong>, the system as a whole occupies a fuzzy
            superposition of healthy and broken states at the same time.
          </p>
          <p>
            The pragmatic response is not to chase perfect components — they don&apos;t exist at scale — but to
            assume failure is the normal case and contain its blast radius. That means timeouts, retries with
            idempotency, redundancy, health checks, and the explicit question for every operation: <em>what
            happens if this never returns?</em> A system that has never been tested against partial failure has
            simply never observed the failures it will eventually exhibit.
          </p>
        </Prose>

        <Analogy title="Analogy · the relay race">
          A solo sprinter either finishes the race or visibly pulls up injured — you always know the state. A
          relay team is a distributed system: the baton (your request) is handed between runners across a track
          you can&apos;t fully see. A runner might drop it, stumble, or sprint perfectly while you, at the finish
          line, simply see no one arriving. From where you stand, &quot;dropped the baton,&quot; &quot;tripped
          but recovering,&quot; and &quot;running fine, just not here yet&quot; look identical: nobody has
          crossed the line. You have to plan the whole race around that ambiguity.
        </Analogy>

        <Callout variant="insight">
          The core mental shift: stop asking &quot;is the system working?&quot; and start asking &quot;which
          parts are working, which are degraded, and does my design still produce a correct outcome in every
          combination?&quot;
        </Callout>

        <RealWorld
          examples={[
            {
              system: "Netflix Chaos Monkey",
              detail: (
                <>
                  Deliberately kills production instances during business hours so engineers are forced to make
                  services survive partial failure rather than assume it away.
                </>
              ),
            },
            {
              system: "AWS / GCP zones",
              detail: (
                <>
                  Designed around the premise that any single availability zone can fail; resilient apps
                  replicate across zones so a partial outage never becomes a total one.
                </>
              ),
            },
            {
              system: "Erlang/OTP",
              detail: (
                <>
                  Built on &quot;let it crash&quot; — supervised processes are expected to die, and supervisors
                  restart them, turning unpredictable faults into a recoverable, bounded event.
                </>
              ),
            },
          ]}
        />
      </Section>

      {/* ----------------------------------------------- 2 · Unreliable networks */}
      <Section
        id="networks"
        kicker="Unreliable Networks"
        title="Silence is ambiguous"
        intro="Shared-nothing systems talk only over the network — and the network gives no guarantees. When a reply doesn't come, you cannot tell a dead node from a slow one. That single ambiguity shapes everything."
      >
        <Prose>
          <p>
            In a <strong>shared-nothing</strong> architecture, machines coordinate purely by sending messages
            over the network. The internet and most internal datacenter networks are{" "}
            <strong>asynchronous packet networks</strong>: you hand a packet to the network, and it makes no
            promise about <em>when</em> it will arrive or <em>whether</em> it will arrive at all. When you send
            a request and wait, any of these may have happened:
          </p>
          <ul>
            <li>The request was lost (a cable was unplugged, a switch dropped it).</li>
            <li>The request is sitting in a queue and will be delivered later.</li>
            <li>The remote node has failed (crashed or powered off).</li>
            <li>The remote node is alive but temporarily stopped responding (a GC pause).</li>
            <li>The response was generated but lost on the way back.</li>
            <li>The response is merely delayed and will arrive eventually.</li>
          </ul>
          <p>
            Crucially, from the sender&apos;s vantage point these are <strong>indistinguishable</strong>. You
            observe one thing — <em>no response yet</em> — which is consistent with every cause above. The only
            tool you have is a <strong>timeout</strong>: wait some bounded time, then give up and assume the
            response isn&apos;t coming. But giving up is a <em>guess</em>, not knowledge. If you want certainty
            that a request succeeded, you need a positive acknowledgement from the application itself; if
            something went wrong, you must assume you will get no response at all.
          </p>
        </Prose>

        <Analogy title="Analogy · the unanswered text">
          You text a friend &quot;running late?&quot; and hear nothing for ten minutes. Are they driving (busy,
          will reply soon)? Did the message fail to send? Did they read it and forget? Are they fine but in a
          tunnel? You genuinely cannot tell from the silence. Eventually you give up waiting and just leave —
          that deadline is your timeout. And if they were merely in a tunnel, you&apos;ve now &quot;declared
          them a no-show&quot; while they were on their way.
        </Analogy>

        <DemoFrame
          label="Live demo · timeout dilemma"
          title="Send a request across an unreliable network"
          description="Set the network's delay, jitter, and packet-loss rate, then pick a timeout and fire requests. The top shows what the CLIENT observes; below the divider is the hidden truth. Watch how often a 'dead node' verdict is actually wrong — that's the false-positive rate short timeouts buy you."
          right={<>can&apos;t tell slow from dead</>}
        >
          <TimeoutDilemmaDemo />
        </DemoFrame>

        <Prose>
          <p>
            Why are the delays <strong>unbounded</strong> rather than merely large? Because queueing compounds
            at every hop. When several nodes send to the same destination at once, the network switch queues
            the packets and feeds them through one at a time — and discards them if its buffer fills. When the
            destination&apos;s CPU cores are busy, the OS queues the incoming data until the application is
            ready. In virtualised environments the whole guest OS can be paused for tens of milliseconds while
            another VM uses the core, so packets pile up. And TCP&apos;s own <em>flow control</em> makes senders
            throttle themselves, adding yet more queueing. None of these has a fixed upper bound.
          </p>
        </Prose>

        <Figure caption="A short timeout slices off the long tail of slow-but-alive nodes; a long timeout delays detecting truly dead ones. Drag the line — no value wins both.">
          <TimeoutTuner />
        </Figure>

        <Callout variant="tradeoff" title="The timeout trade-off">
          A <strong>short</strong> timeout detects genuine failures quickly but frequently mislabels a slow node
          as dead — and a premature death declaration is expensive: another node must take over (extra load on
          the survivors and the network), and any action the &quot;dead&quot; node was performing may now be
          executed twice. A <strong>long</strong> timeout avoids false alarms but leaves a truly dead node
          undetected for longer. There is no universally correct value.
        </Callout>

        <CompareTable
          caption="Circuit-switched vs packet-switched networks — bounded delay costs you utilisation."
          columns={["Synchronous circuit (phone)", "Async packets (TCP/IP)"]}
          rows={[
            {
              feature: "Delay",
              values: [
                "Bounded — fixed max end-to-end latency",
                "Unbounded — congestion & queueing have no cap",
              ],
            },
            {
              feature: "Bandwidth",
              values: [
                "Reserved up front; nobody else can use it",
                "Opportunistic; uses whatever is free right now",
              ],
            },
            {
              feature: "Bursty traffic",
              values: [
                "Wasteful — reserved capacity sits idle",
                "Efficient — adapts the send rate dynamically",
              ],
            },
            {
              feature: "Failure detection",
              values: ["Easy — silence really means failure", "Hard — silence is ambiguous"],
            },
          ]}
        />

        <Prose>
          <p>
            Rather than guess a constant, mature systems <strong>measure</strong>. Sample the round-trip-time
            distribution over a long window, track its variability (<em>jitter</em>), and adjust timeouts
            automatically to the observed tail. Phi-accrual detectors (used by Akka and Cassandra) go further:
            instead of a binary alive/dead, they emit a continuous <em>suspicion level</em> from the recent
            heartbeat distribution.
          </p>
        </Prose>

        <RealWorld
          examples={[
            {
              system: "Cassandra / Akka",
              detail: (
                <>
                  Use a <strong>phi-accrual failure detector</strong> that adapts to measured heartbeat timing
                  rather than a fixed timeout, lowering false positives under jitter.
                </>
              ),
            },
            {
              system: "TCP",
              detail: (
                <>
                  Computes its retransmission timeout from a smoothed RTT estimate plus a variance term — a
                  textbook example of an experimentally-tuned, adaptive timeout.
                </>
              ),
            },
            {
              system: "gRPC",
              detail: (
                <>
                  Forces you to confront the ambiguity: deadlines are first-class, and a deadline-exceeded
                  error explicitly does <em>not</em> tell you whether the server did the work.
                </>
              ),
            },
          ]}
        />
      </Section>

      {/* ----------------------------------------------- 3 · Unreliable clocks */}
      <Section
        id="clocks"
        kicker="Unreliable Clocks"
        title="Time is a local opinion"
        intro="Every machine has its own drifting quartz clock. Trusting wall-clock timestamps to order events across nodes is how distributed systems lose data silently — no crash, no error, just a write that quietly vanishes."
      >
        <Prose>
          <p>
            Time feels absolute, but in a distributed system it is a per-node opinion. Each machine has its own
            quartz oscillator that runs slightly fast or slow and <em>drifts</em> relative to its neighbours.{" "}
            <strong>NTP</strong> nudges these clocks toward a reference, but only imperfectly and with its own
            network delays. Worse, there are two very different kinds of clock, and confusing them is a classic
            bug source.
          </p>
        </Prose>

        <DefinitionGrid
          items={[
            {
              term: "Time-of-day clock",
              def: (
                <>
                  Wall-clock time per a calendar (e.g. <code>System.currentTimeMillis()</code>). If it drifts
                  too far, NTP can <strong>forcibly reset it</strong>, making it jump <em>backward</em>. That
                  makes it unsuitable for measuring elapsed time.
                </>
              ),
            },
            {
              term: "Monotonic clock",
              def: (
                <>
                  e.g. <code>System.nanoTime()</code>. Guaranteed to only move forward, so it&apos;s right for
                  durations and timeouts. NTP may slew its rate by ≤0.05% but can never make it jump. Its{" "}
                  <strong>absolute value is meaningless</strong>.
                </>
              ),
            },
            {
              term: "Logical clock",
              def: (
                <>
                  A counter (e.g. Lamport timestamps) that captures only <em>relative ordering</em> of events,
                  not physical time. The safe tool for ordering across nodes.
                </>
              ),
            },
            {
              term: "Clock confidence interval",
              def: (
                <>
                  A reading is really a <em>range</em> — &quot;95% sure it&apos;s between 10.3 and 10.5&quot; —
                  not a point. Spanner&apos;s TrueTime exposes this interval explicitly.
                </>
              ),
            },
          ]}
        />

        <Callout variant="warning" title="Silent corruption, not a crash">
          If software relies on synchronised clocks, the failure mode is usually <strong>not</strong> a dramatic
          crash — it&apos;s subtle, silent data loss. You must monitor the clock offset between machines as
          carefully as any other critical metric.
        </Callout>

        <Prose>
          <p>
            The most dangerous habit is using wall-clock timestamps to decide the <strong>order</strong> of
            writes across nodes. This is exactly what <strong>last-write-wins (LWW)</strong> does — the strategy
            used by multi-leader replication and by leaderless stores like <strong>Cassandra</strong> and{" "}
            <strong>Riak</strong>. &quot;Most recent&quot; is defined by a local time-of-day clock that may
            simply be wrong, so the write that actually happened later can carry a smaller timestamp and be
            discarded. The losing write vanishes with no error.
          </p>
        </Prose>

        <DemoFrame
          label="Live demo · clock skew"
          title="Last-write-wins drops data when clocks disagree"
          description="Two replicas resolve conflicts by keeping the write with the higher timestamp. Skew Node B's clock, then write on each node and watch which write survives. When B is behind, a write that truly happened last loses — silently."
          right={<>LWW + skew = data loss</>}
        >
          <ClockSkewDemo />
        </DemoFrame>

        <Analogy title="Analogy · backdated letters">
          Two clerks file changes to the same record and resolve disputes by trusting the date written on each
          letter. One clerk&apos;s desk calendar is three days slow. He writes his update <em>today</em>, but
          dates it three days ago. When the letters are compared, his genuinely newer change looks older and
          gets shredded — and because the rule (&quot;keep the latest date&quot;) was followed faithfully,
          nobody notices the mistake.
        </Analogy>

        <Prose>
          <p>
            How do the systems that <em>must</em> use physical time cope? They treat a clock reading as an
            interval and <strong>wait out the uncertainty</strong>. Google&apos;s <strong>Spanner</strong>{" "}
            implements snapshot isolation across datacenters with TrueTime: if interval A ends before interval B
            begins, then A definitively happened before B. To guarantee non-overlap, Spanner deliberately waits
            for the length of the confidence interval before committing — which only stays cheap because Google
            keeps the uncertainty tiny with GPS receivers and atomic clocks in every datacenter.
          </p>
        </Prose>

        <CodeBlock
          lang="text"
          caption="Spanner's commit-wait: sleep out the clock uncertainty so timestamp intervals can't overlap."
          code={`# Two transactions, each timestamped with a TrueTime INTERVAL
A = [A.earliest, A.latest]
B = [B.earliest, B.latest]

# B is safely "after" A only if the intervals don't overlap:
#     A.earliest < A.latest < B.earliest < B.latest
#
# So before committing, Spanner deliberately WAITS:
commit_ts = TrueTime.now().latest
while TrueTime.now().earliest < commit_ts:
    sleep()          # commit-wait: ~2 x clock uncertainty (a few ms)
commit()             # now no later txn can claim an overlapping timestamp`}
        />

        <Callout variant="warning" title="You cannot assume anything about timing">
          A node can be paused for <em>seconds</em> with zero warning: stop-the-world garbage collection, a
          suspended VM, a closed laptop lid, OS context switches, synchronous disk I/O, paging/swapping, or a{" "}
          <code>SIGSTOP</code>. A leader holding a time-based <strong>lease</strong> may still believe the lease
          is valid long after it has expired — which is precisely the setup for the corruption you&apos;ll fence
          off in the next section.
        </Callout>

        <RealWorld
          examples={[
            {
              system: "Cloudflare · 2017",
              detail: (
                <>
                  The 2016→2017 leap second pushed a duration <em>negative</em>. Cloudflare&apos;s RRDNS (in Go)
                  assumed <code>time.Now()</code> never goes backward; the sub-zero value fed a weighted-random
                  picker and made the process <strong>panic</strong>, breaking DNS for some CNAME records — the
                  exact time-of-day-vs-monotonic confusion this chapter warns about.
                </>
              ),
            },
            {
              system: "Google Spanner",
              detail: (
                <>
                  Uses the <strong>TrueTime</strong> API and commit-wait, backed by GPS + atomic clocks, to make
                  cross-datacenter timestamp ordering trustworthy. Reported uncertainty interval is usually only
                  ~1–7&nbsp;ms, so the commit-wait stays cheap.
                </>
              ),
            },
            {
              system: "Cassandra (LWW)",
              detail: (
                <>
                  Resolves conflicts by the highest write timestamp; clock skew between nodes can therefore drop
                  the newer write. Operators are warned to keep NTP tight — and even then, a GC pause can stamp a
                  write with a stale clock reading.
                </>
              ),
            },
          ]}
        />
      </Section>

      {/* ----------------------------------------------- 4 · Knowledge, truth, lies */}
      <Section
        id="truth"
        kicker="Knowledge, Truth & Lies"
        title="No node can trust itself"
        intro="If a node can be slow, paused, or partitioned without knowing it, then its own view of the world is suspect. Truth has to be decided collectively — by quorum — and protected with fencing tokens."
      >
        <Prose>
          <p>
            Put the previous sections together and an unsettling conclusion follows: a node cannot necessarily
            trust its own judgement about its situation. It might believe it&apos;s the leader while a GC pause
            has already cost it the lease; it might think the network is down when in fact <em>it</em> is the
            one cut off. The remedy distributed systems reach for is to stop relying on any single node&apos;s
            opinion and instead decide by <strong>quorum</strong> — a vote among the nodes, usually an absolute
            majority of more than half.
          </p>
        </Prose>

        <DemoFrame
          label="Live demo · quorum"
          title="Truth is whatever the majority agrees on"
          description="Five nodes vote on whether the leader is alive. Click nodes to flip their votes. The verdict is the majority view — and a healthy node stranded in the minority of a partition must accept it and step down."
          right={<>majority &gt; n/2</>}
        >
          <QuorumDemo />
        </DemoFrame>

        <Prose>
          <p>
            A quorum decides <em>who</em> should act, but it doesn&apos;t by itself stop a node that wrongly
            believes it still has permission. Picture a lock service granting a lease so only one client writes
            to a file at a time. A client acquires the lease, then suffers a long GC pause; the lease expires
            and is granted to a second client, which writes. The first client wakes up — oblivious — and sends
            its now-stale write. The storage server has no idea this client is a zombie.
          </p>
          <p>
            The fix is the <strong>fencing token</strong>: every time the lock service grants a lock or lease it
            also returns a number that <em>strictly increases</em> with each grant. Every write to storage must
            carry the client&apos;s current token, and the storage server remembers the highest token it has
            accepted. A write arriving with a <em>lower</em> token than one already processed is rejected. The
            zombie&apos;s stale token can no longer corrupt anything — even though the zombie never realised it
            had lost the lock.
          </p>
        </Prose>

        <DemoFrame
          label="Live demo · fencing tokens"
          title="Fence out the zombie writer"
          description="Step through a leader that pauses, loses its lease, and wakes up to send a stale write. With fencing ON, the storage server rejects the lower token and integrity holds. Toggle fencing OFF, replay, and watch the stale write corrupt the data."
          right={<>reject token &lt; max</>}
        >
          <FencingTokenDemo />
        </DemoFrame>

        <Prose>
          <p>
            Reading the storyboard is one thing; <em>driving</em> the failure is another. In the sandbox below you
            advance a shared clock one tick at a time and inject a stop-the-world GC pause into the client that
            currently holds the lease. The frozen client stops perceiving time, so its lease lapses without its
            knowledge, the lock service hands the lease to the other client with a higher token, and when the
            zombie finally thaws it fires its stale write. Whether that write corrupts the data depends entirely on
            one toggle.
          </p>
        </Prose>

        <DemoFrame
          label="Interactive sim · distributed lock gone wrong"
          title="Drive the lease expiry yourself"
          description="Pause Client A while it holds the lease, then step the clock. Watch the lease expire, Client B take over with a higher token, and the thawed A attempt a stale write. With fencing ON the storage server rejects it; flip fencing OFF and Replay to watch the same sequence corrupt the data. Follow the event log to trace the causality tick by tick."
          right={<>step time · inject pauses</>}
        >
          <LockLeaseSim />
        </DemoFrame>

        <Analogy title="Analogy · the numbered hospital bracelet">
          A patient is admitted and given wristband #33 authorising a procedure. They&apos;re moved between
          wards; a clerical delay means a fresh band #34 is issued for an updated order. Later the old #33 order
          resurfaces and someone tries to act on it. Because every order is stamped with an{" "}
          <em>ever-increasing</em> band number and the ward only honours the latest, #33 is refused on sight —
          even though the person carrying it sincerely believed it was still valid. The monotonic number, not
          anyone&apos;s belief, is the source of truth.
        </Analogy>

        <Callout variant="insight" title="Detecting honest mistakes vs lies">
          Fencing tokens stop a node that is <strong>inadvertently</strong> acting in error — a paused or
          partitioned node that genuinely thinks it still holds the lock. They assume nodes follow the protocol
          honestly, even when buggy or slow.
        </Callout>

        <Prose>
          <p>
            That assumption breaks under <strong>Byzantine faults</strong>: nodes that actively <em>lie</em> or
            behave arbitrarily — sending different stories to different peers, forging tokens, or colluding. A
            system is <strong>Byzantine fault-tolerant</strong> if it keeps working correctly even when some
            nodes misbehave maliciously. This matters in aerospace (cosmic-ray bit-flips and safety-critical
            redundancy) and in settings spanning multiple organisations where some participants may try to
            cheat — most famously, public blockchains. Most datacenter systems, where you control all the nodes,
            deliberately assume faults are <em>non-Byzantine</em>, because Byzantine tolerance is far more
            expensive.
          </p>
        </Prose>

        <CompareTable
          caption="Two classes of misbehaviour demand very different defences."
          columns={["Non-Byzantine fault", "Byzantine fault"]}
          rows={[
            {
              feature: "Node behaviour",
              values: ["Crashes, pauses, or is partitioned — but honest", "Lies, forges, or acts arbitrarily / maliciously"],
            },
            {
              feature: "Typical defence",
              values: ["Quorums, timeouts, fencing tokens", "BFT consensus (PBFT), cryptographic signatures, proof-of-work"],
            },
            {
              feature: "Where it matters",
              values: ["Ordinary datacenters you fully control", "Aerospace, adversarial multi-party systems, blockchains"],
            },
            {
              feature: "Cost",
              values: ["Modest — the common assumption", "High — more nodes, more rounds, heavy crypto"],
            },
          ]}
        />

        <RealWorld
          examples={[
            {
              system: "ZooKeeper",
              detail: (
                <>
                  Provides fencing out of the box: the transaction id <code>zxid</code> or node version{" "}
                  <code>cversion</code> increases monotonically and can be used directly as a fencing token.
                </>
              ),
            },
            {
              system: "etcd / Consul",
              detail: (
                <>
                  Leases carry monotonically increasing revisions; clients fence writes with them to block stale
                  lock holders after a pause or partition.
                </>
              ),
            },
            {
              system: "Bitcoin & PBFT",
              detail: (
                <>
                  Byzantine-fault-tolerant by design — they assume some participants are actively adversarial and
                  reach agreement anyway, at significant cost.
                </>
              ),
            },
          ]}
        />
      </Section>

      {/* ----------------------------------------------- When it goes wrong */}
      <Section
        id="incidents"
        kicker="When it goes wrong"
        title="Three failures, straight from the field"
        intro="These aren't hypotheticals. Each of these production incidents is one of this chapter's failure modes playing out at scale — a partition, a clock bug, and a paused process losing its lease."
      >
        <RealWorld
          title="Real incidents"
          examples={[
            {
              system: "GitHub · Oct 2018",
              detail: (
                <>
                  Replacing failing optical gear caused a <strong>43-second network partition</strong> between two
                  US datacenters. The East Coast primary had accepted writes that never replicated; meanwhile{" "}
                  <code>Orchestrator</code> (managing MySQL failover via Raft) formed a quorum on the West Coast and
                  promoted a new primary there. The two sides <strong>diverged</strong> and could not be cleanly
                  reconciled — degrading the service for ~24 hours. A textbook split-brain born from one brief
                  partition.
                </>
              ),
            },
            {
              system: "Cloudflare · 2017 leap second",
              detail: (
                <>
                  At 00:00 UTC the extra second drove a computed duration <em>below zero</em>. The Go DNS service
                  RRDNS assumed <code>time.Now()</code> was monotonic; the negative value reached a weighted-random
                  picker and triggered a <strong>panic</strong>, erroring a fraction of DNS queries until clocks
                  were patched to clamp backward jumps. Pure time-of-day-vs-monotonic confusion.
                </>
              ),
            },
            {
              system: "Redlock vs fencing (Kleppmann)",
              detail: (
                <>
                  Martin Kleppmann&apos;s analysis shows why a lock service without <strong>fencing tokens</strong>{" "}
                  (such as Redis Redlock) can&apos;t protect correctness: a GC-paused client wakes after its lease
                  expired and corrupts data, because storage has no monotonic token to reject the stale writer — the
                  exact scenario in the sim above.
                </>
              ),
            },
          ]}
        />
        <Callout variant="insight" title="The pattern repeats">
          A partition you can&apos;t see, a clock that moved backward, a process frozen past its lease — every one
          of these incidents is a node trusting something it shouldn&apos;t: the network, its clock, or its own
          belief that it still holds the lock. The defences are exactly the ones in this chapter.
        </Callout>
      </Section>

      {/* ----------------------------------------------- See it explained */}
      <Section
        id="watch"
        kicker="See it explained"
        title="Two short lectures"
        intro="Martin Kleppmann — author of DDIA — recorded his Cambridge distributed-systems course and released it freely. Two segments map directly onto this chapter: why physical clocks can't be trusted, and what it means for nodes to actively lie."
      >
        <YouTubeEmbed
          videoId="FQ_2N3AQu0M"
          title="Distributed Systems 3.1: Physical time"
          channel="Martin Kleppmann"
        />
        <Prose>
          <p>
            The clip above unpacks quartz drift, the time-of-day vs monotonic clock distinction, and why NTP can
            yank a wall clock backward — the foundations of this chapter&apos;s &quot;Unreliable Clocks&quot;
            section. The next one steps up from honest-but-paused nodes to nodes that <em>lie</em>: the Byzantine
            generals problem behind Byzantine fault tolerance.
          </p>
        </Prose>
        <YouTubeEmbed
          videoId="LoGx_ldRBU0"
          title="Distributed Systems 2.2: The Byzantine generals problem"
          channel="Martin Kleppmann"
        />
      </Section>

      {/* ----------------------------------------------- Test yourself */}
      <Section id="test" kicker="Practice" title="Test yourself">
        <FurtherReading
          title="Go deeper — primary sources"
          sources={[
            {
              title: "How to do distributed locking — Martin Kleppmann",
              url: "https://martin.kleppmann.com/2016/02/08/how-to-do-distributed-locking.html",
              note: "The canonical fencing-token argument: why a lock without monotonic tokens can't guarantee correctness (the Redlock critique).",
            },
            {
              title: "The Network Is Reliable — Bailis & Kingsbury, ACM Queue",
              url: "https://queue.acm.org/detail.cfm?id=2655736",
              note: "An informal survey of real-world network partitions — evidence that the 'reliable network' is a fallacy.",
            },
            {
              title: "Spanner: Google's Globally-Distributed Database (OSDI 2012)",
              url: "https://research.google.com/archive/spanner-osdi2012.pdf",
              note: "The TrueTime paper: GPS + atomic clocks expose clock uncertainty as an interval, and commit-wait sleeps it out.",
            },
            {
              title: "Jepsen — distributed systems safety analyses",
              url: "https://jepsen.io/analyses",
              note: "Kyle Kingsbury's in-depth reports finding consistency bugs by injecting partitions, clock skew, and pauses.",
            },
            {
              title: "How and why the leap second affected Cloudflare DNS",
              url: "https://blog.cloudflare.com/how-and-why-the-leap-second-affected-cloudflare-dns/",
              note: "Post-mortem of a non-monotonic time.Now() causing a negative duration and a panic.",
            },
            {
              title: "GitHub — October 21 post-incident analysis",
              url: "https://github.blog/2018-10-30-oct21-post-incident-analysis/",
              note: "A 43-second partition + automated failover producing a cross-datacenter split-brain.",
            },
          ]}
        />
        <Prose>
          <p>
            Generate a fresh set of questions to pressure-test your grasp of partial failure, the timeout
            dilemma, clock skew, fencing, and Byzantine faults — then talk any of them through with the tutor.
          </p>
        </Prose>
        <Quiz chapterTitle="The Trouble with Distributed Systems" concepts={CONCEPTS} />
        <div className="mt-6">
          <AskClaude chapterTitle="The Trouble with Distributed Systems" concepts={CONCEPTS} />
        </div>
      </Section>

      <KeyTakeaways
        points={[
          "Distributed systems fail partially and nondeterministically — the goal is to build reliability from unreliable components, never to assume the components are reliable.",
          "On an asynchronous packet network, no reply is ambiguous: a dead node, a slow node, and a dropped packet look identical from the outside.",
          "Timeouts are the only handle on that ambiguity, but there is no correct value — short timeouts cause false-positive failures, long ones delay real detection, and delays are unbounded.",
          "There are two clocks: monotonic clocks for measuring elapsed time, and time-of-day clocks (which can jump backward) for wall-clock time. Never confuse them.",
          "Ordering events by wall-clock timestamp — last-write-wins — silently drops data when clocks disagree; logical clocks order events safely, and Spanner waits out its clock uncertainty interval.",
          "A node can be paused for seconds (GC, VM, paging) with no warning, so it cannot trust its own sense of time or that it still holds a lease.",
          "No node can trust itself: decide truth by quorum, protect locks with monotonically increasing fencing tokens, and only pay for Byzantine fault tolerance when nodes might actively lie.",
        ]}
      />
    </ChapterShell>
  );
}
