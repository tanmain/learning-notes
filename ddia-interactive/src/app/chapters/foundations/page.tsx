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
import { LatencyPlayground } from "./LatencyPlayground";
import { TailAmplifier } from "./TailAmplifier";
import { ThroughputDemo } from "./ThroughputDemo";
import { FaultLab } from "./FaultLab";
import { FanoutDemo } from "./FanoutDemo";
import { ComplexityLens } from "./ComplexityLens";

export const metadata: Metadata = {
  title: "Reliable, Scalable & Maintainable Applications",
  description:
    "What reliability, scalability, and maintainability really mean for data-intensive systems — faults vs failures, percentile latency, load parameters, and operability — with interactive demos.",
};

const CONCEPTS = `Chapter 1 of DDIA: Reliable, Scalable & Maintainable Applications.
A data-intensive application is assembled from standard building blocks: databases (store data), caches (speed up reads), search indexes (search by keyword/filter), stream processing (send messages asynchronously between processes), and batch processing (periodically crunch accumulated data). The chapter judges every such system on three non-functional properties.

RELIABILITY = continuing to work correctly even in the face of adversity (faults). A FAULT is one component deviating from its spec; a FAILURE is the system as a whole stopping service to users. Fault-tolerant / resilient systems anticipate faults and cope. Prefer TOLERATING faults over preventing them. Three fault classes: (1) Hardware faults — disks, RAM, power; historically handled by redundancy, now there is a move toward tolerating loss of entire machines, which also enables rolling upgrades / patching one node at a time with no downtime. (2) Software errors — systematic, correlated bugs that can take down many nodes at once (redundancy does not help); mitigated by testing, monitoring, process isolation, measuring assumptions. (3) Human errors — leading cause of outages, especially config mistakes; mitigate by minimising opportunities for error, good abstractions/admin UIs, fully featured sandboxes, automated testing, quick rollback / staged rollout, detailed monitoring (telemetry), training.

SCALABILITY = reasonable ways of coping with growth in load. First describe load with LOAD PARAMETERS (e.g. requests/sec, read:write ratio, fan-out). Twitter case study: post tweet ~4.6k/s, home-timeline reads ~300k/s. Approach 1 fan-out on read (insert once, merge/JOIN at read time): cheap writes, expensive reads. Approach 2 fan-out on write (write into each follower's home-timeline cache): cheap reads, but write amplification — a celebrity with 30M followers triggers 30M writes per tweet. Real Twitter uses a HYBRID: fan-out on write for normal users, fan-out on read for celebrities. Describing performance: throughput (records/sec, batch systems) vs response time (what the client sees) vs latency (time a request waits to be handled). The MEAN is a poor summary; use PERCENTILES: p50/median, p95, p99, p999 capture the tail. Amazon uses p999 because the slowest requests often belong to the most valuable, highest-data customers; optimising p9999 is too expensive. SLOs/SLAs define expected performance (e.g. median <200ms, p99 <1s). Queueing delay dominates high percentiles; measure on the client side and keep sending load independently of response time (avoid coordinated omission). Tail-latency amplification: when one request fans out to multiple parallel backend calls, it waits for the slowest, so the chance of a slow request rises. Coping approaches: scaling up (vertical, bigger machine), scaling out (horizontal, many machines), elastic (auto-add resources). Stateless services scale out easily; stateful data systems are much harder to distribute.

MAINTAINABILITY = the majority of software cost is ongoing maintenance. Three design principles: OPERABILITY (make routine tasks easy for operations: monitoring, recovery, upgrades, predictable processes), SIMPLICITY (remove ACCIDENTAL complexity — complexity not inherent to the problem — chiefly via good ABSTRACTION that hides implementation behind clean APIs), and EVOLVABILITY (make future change easy; agile patterns help). Functional requirements (what the app does) vs non-functional requirements (security, reliability, scalability, compatibility, maintainability, compliance).`;

export default function Page() {
  return (
    <ChapterShell slug="foundations" diagram={<Hero />}>
      {/* ---------------------------------------------------------------- Intro */}
      <Section
        kicker="The brief"
        title="Three words you'll be judged by"
        intro="Almost every modern application is data-intensive rather than compute-intensive — the hard part isn't raw CPU, it's the amount, complexity, and rate of change of the data."
      >
        <Prose>
          <p>
            We build data systems out of a small set of <strong>standard building blocks</strong>: a{" "}
            <strong>database</strong> to store data, a <strong>cache</strong> to speed up expensive reads, a{" "}
            <strong>search index</strong> to query by keyword or filter, <strong>stream processing</strong> to send
            messages to other processes asynchronously, and <strong>batch processing</strong> to periodically crunch
            large amounts of accumulated data. The interesting engineering is in <em>how you stitch them together</em>{" "}
            and the guarantees the composite gives your users.
          </p>
          <p>
            Kleppmann frames the whole book around three properties that every such system is measured against. They
            sound soft, almost like buzzwords — so this chapter&apos;s job is to give each a{" "}
            <strong>precise, measurable meaning</strong>:
          </p>
          <ul>
            <li>
              <strong>Reliability</strong> — the system works <em>correctly</em> (right answer, good performance) even
              when things go wrong: hardware dies, software has bugs, and humans make mistakes.
            </li>
            <li>
              <strong>Scalability</strong> — as load grows, you have <em>reasonable ways</em> to keep performance
              acceptable, described with concrete load parameters rather than hand-waving.
            </li>
            <li>
              <strong>Maintainability</strong> — different engineers can work on the system <em>productively</em> over
              its long life, because most of a system&apos;s cost is paid <em>after</em> it first ships.
            </li>
          </ul>
        </Prose>
        <Callout variant="note" title="Functional vs non-functional">
          These three are <strong>non-functional requirements</strong> — general properties like security,
          compatibility, and compliance — as opposed to <strong>functional requirements</strong> (what the app should
          actually <em>do</em>). The functional part is table stakes; this book is about getting the non-functional
          part right at scale.
        </Callout>
      </Section>

      {/* ---------------------------------------------------------- Reliability */}
      <Section
        id="reliability"
        kicker="Pillar I"
        title="Reliability"
        intro="Continuing to work correctly even in the face of adversity. The central distinction: a fault is not a failure — and good systems make sure faults never become failures."
      >
        <Prose>
          <p>
            A reliable system meets a few user expectations: it performs the function the user expected, it tolerates
            the user making mistakes or using it in unexpected ways, its performance is good enough under the expected
            load, and it prevents unauthorised access and abuse. The interesting word is{" "}
            <em>continuing</em> — reliability is about behaviour <strong>under adversity</strong>.
          </p>
          <p>
            The single most important vocabulary in this section is the difference between a fault and a failure. A{" "}
            <strong>fault</strong> is one component of the system <em>deviating from its spec</em> — a disk returns
            garbage, a process crashes, a network packet is dropped. A <strong>failure</strong> is when the system{" "}
            <em>as a whole</em> stops providing the required service to the user. Systems that anticipate faults and
            cope with them are called <strong>fault-tolerant</strong> or <strong>resilient</strong>. The entire game
            is to stop faults from cascading into failures.
          </p>
          <p>
            Counter-intuitively, you should generally <strong>prefer tolerating faults over preventing them</strong>.
            You can&apos;t prevent a cosmic ray flipping a bit or a human mistyping a hostname — but you can build
            systems that keep serving when those things happen. Deliberately triggering faults (Netflix&apos;s Chaos
            Monkey) is a way to <em>exercise</em> that tolerance so it actually works when a real fault arrives.
          </p>
        </Prose>

        <Analogy title="Analogy — a passenger jet">
          A jet has two or three of every critical system — engines, hydraulics, flight computers. An engine flaming
          out at altitude is a <em>fault</em>: a component left its spec. But the plane keeps flying on the others, so
          it never becomes a <em>failure</em>. Reliability engineering is designing so that the loss of any single
          part is a shrug, not a catastrophe — and then running drills to prove it.
        </Analogy>

        <Prose>
          <p>
            DDIA groups the adversity into three classes. The crucial subtlety is that{" "}
            <strong>they don&apos;t respond to the same medicine</strong> — the mitigation that saves you from one can
            be useless against another:
          </p>
        </Prose>

        <DefinitionGrid
          items={[
            {
              term: "Hardware faults",
              def: (
                <>
                  Disks crash, RAM goes bad, power is lost. These are largely <em>independent</em> and random.
                  Historically masked by redundancy (RAID, dual power). As fleets grow, the move is toward{" "}
                  <strong>tolerating the loss of entire machines</strong> — which also enables{" "}
                  <strong>rolling upgrades</strong>, patching one node at a time with no downtime.
                </>
              ),
            },
            {
              term: "Software errors",
              def: (
                <>
                  Systematic bugs triggered by a specific input or condition. Unlike hardware faults they are{" "}
                  <strong>correlated</strong> — the same bad input crashes <em>every</em> node at once, so redundancy
                  does <em>not</em> help. Fought with testing, process isolation, monitoring, and checking assumptions.
                </>
              ),
            },
            {
              term: "Human errors",
              def: (
                <>
                  Operators are the <strong>leading cause of outages</strong> — usually a bad config push. Mitigate by
                  minimising opportunities for error (good admin UIs), realistic <strong>sandboxes</strong>, automated
                  tests, <strong>fast rollback</strong> and staged rollout, and detailed monitoring (telemetry).
                </>
              ),
            },
            {
              term: "Telemetry",
              def: (
                <>
                  Detailed, clear monitoring — performance metrics and error rates — so you can spot a fault early and
                  diagnose its cause. You can&apos;t tolerate what you can&apos;t see; observability is the precondition
                  for every other mitigation here.
                </>
              ),
            },
          ]}
        />

        <Callout variant="warning" title="Redundancy is not a cure-all">
          Adding replicas protects you against <em>uncorrelated</em> faults like a single dead disk. It does{" "}
          <strong>nothing</strong> against a systematic software bug or a bad config — every identical replica runs the
          same broken code and falls over together. Match the mitigation to the fault class.
        </Callout>

        <DemoFrame
          title="Fault Tolerance Lab"
          description="Inject a fault into a 5-node cluster and toggle the mitigations. Watch when a fault stays contained versus when it cascades into a full system failure — and discover which mitigation actually matches which fault."
          right="fault ≠ failure"
        >
          <FaultLab />
        </DemoFrame>

        <RealWorld
          examples={[
            {
              system: "Amazon S3",
              detail: (
                <>
                  Stores every object redundantly across multiple devices and facilities, designed for{" "}
                  <code>11 nines</code> of durability so independent disk failures never lose data.
                </>
              ),
            },
            {
              system: "Netflix Simian Army",
              detail: (
                <>
                  <strong>Chaos Monkey</strong> kills random production instances; its siblings go further —{" "}
                  <strong>Latency Monkey</strong> injects artificial delays and <strong>Chaos Gorilla</strong>{" "}
                  simulates the loss of an entire AWS availability zone — turning fault tolerance from a hope into a
                  continuously <em>tested</em> property.
                </>
              ),
            },
            {
              system: "Kubernetes",
              detail: (
                <>
                  Reschedules pods off a dead node automatically and supports rolling deployments, so you patch and
                  recover one node at a time without taking the service down.
                </>
              ),
            },
          ]}
        />

        <Callout variant="insight">
          Reliability is measurable as <strong>availability</strong> (the fraction of time the service is up) and{" "}
          <strong>durability</strong> (the probability data survives). A &quot;fault-tolerant&quot; system isn&apos;t
          one with no faults — it&apos;s one where faults are routine, expected, and absorbed.
        </Callout>
      </Section>

      {/* ---------------------------------------------------------- Scalability */}
      <Section
        id="scalability"
        kicker="Pillar II"
        title="Scalability"
        intro="Scalability is not a yes/no label on a system — it's the question 'if load grows in a particular way, what are our options for coping?' You must first describe load before you can reason about growth."
      >
        <Prose>
          <p>
            You can&apos;t say a system &quot;is scalable&quot; in the abstract. Scalability is the ability to cope with
            increased load, and the first step is to <strong>describe the current load precisely</strong> using{" "}
            <strong>load parameters</strong> — the numbers that best characterise what stresses <em>your</em> system.
            The right parameter depends on the architecture: requests per second to a web server, the ratio of reads to
            writes in a database, the number of simultaneous users, the hit rate on a cache, or — as we&apos;ll see —
            the fan-out of a social graph.
          </p>
          <p>
            Only once load is described can you ask the two scalability questions: <em>when load increases, how is
            performance affected?</em> and <em>when load increases, how much do you need to grow resources to keep
            performance constant?</em>
          </p>
        </Prose>

        <Callout variant="note" title="The famous Twitter example">
          Twitter&apos;s real stress isn&apos;t tweet volume (~4.6k posts/sec); it&apos;s the{" "}
          <strong>fan-out</strong> — each user&apos;s home timeline must merge tweets from everyone they follow, at{" "}
          <strong>~300k reads/sec</strong>. The key load parameter is the <em>distribution of followers per user</em>,
          because that determines how much work a single tweet creates.
        </Callout>

        <DemoFrame
          title="Fan-out: choosing where to pay the cost"
          description="Two ways to build a home timeline. Move the followers slider up to a celebrity and switch approaches — see write amplification explode under fan-out-on-write, and why Twitter landed on a hybrid."
          right="load parameter = follower fan-out"
        >
          <FanoutDemo />
        </DemoFrame>

        <Prose>
          <p>
            The fan-out demo shows the core lesson: scalability is about <strong>deciding where to pay a cost</strong>.
            Fan-out on read keeps writes trivial but does expensive work on the hot read path; fan-out on write makes
            reads a single lookup but turns a celebrity&apos;s tweet into tens of millions of writes. There is no free
            lunch — only a trade you pick deliberately, informed by your load parameters (here, the ~65:1 read:write
            ratio and the heavy tail of follower counts).
          </p>
        </Prose>

        <Prose>
          <h3>Describing performance: throughput, latency, and the lie of the mean</h3>
          <p>
            Two different lenses describe performance. In a batch system like Hadoop we care about{" "}
            <strong>throughput</strong> — records processed per second. In an online system we care about{" "}
            <strong>response time</strong> — what the client actually experiences, end to end. Note the precise
            distinction the book draws: <strong>response time</strong> is what the client sees (service time + network
            delays + queueing), whereas <strong>latency</strong> is specifically the duration a request spends{" "}
            <em>waiting</em> to be handled.
          </p>
          <p>
            It&apos;s tempting to report the <strong>mean</strong> (average) response time, but the mean is a poor
            summary: it doesn&apos;t tell you how many users actually experienced that delay, and a few huge outliers
            drag it around. Far better to use <strong>percentiles</strong>. The <strong>median (p50)</strong> is your
            &quot;typical&quot; experience — half of requests are faster, half slower. The <strong>tail</strong> —{" "}
            <strong>p95, p99, p999</strong> — tells you how bad your outliers are, and the tail is where your most
            important users often live.
          </p>
        </Prose>

        <DemoFrame
          title="Latency Playground — why the tail is the story"
          description="Generate a stream of requests under adjustable load, watch the response-time distribution form, and compare the mean against p50/p95/p99/p999. Then crank up fan-out to see how parallel backend calls amplify the tail."
          right="mean vs p50 / p95 / p99 / p999"
        >
          <LatencyPlayground />
        </DemoFrame>

        <Prose>
          <p>
            Two effects in that playground are worth naming. First, <strong>queueing delay dominates the high
            percentiles</strong>: a server has limited cores, so a few slow requests block the ones behind them
            (head-of-line blocking), and as utilisation approaches 100% the wait time blows up. This is also why you
            must <strong>measure response times on the client side</strong> and, when generating artificial load, keep
            sending requests <em>independently</em> of how fast responses come back — otherwise you accidentally let
            the server off the hook (this artefact is called <em>coordinated omission</em>).
          </p>
          <p>
            Second, <strong>tail-latency amplification</strong>: if a single end-user request fans out to several
            backend calls in parallel, the user waits for the <em>slowest</em> of them. A slowness that affects only
            1% of <em>calls</em> can affect a much larger fraction of <em>requests</em> once each request makes many
            calls — exactly what the next demo lets you drive by hand.
          </p>
        </Prose>

        <DemoFrame
          title="Tail-Latency Amplifier — drive it yourself"
          description="One request fans out to N parallel backend shards and can only return when the slowest answers. Fire requests (or run a live stream), click any shard to turn it into a slow straggler, and drag the fan-out up — watch the measured 'slow rate' track the 1−(1−p)ⁿ amplification law. Then flip on hedged requests to pull the tail back down."
          right="1 − (1 − p)ⁿ"
        >
          <TailAmplifier />
        </DemoFrame>

        <Callout variant="note" title="The fix from 'The Tail at Scale'">
          Dean &amp; Barroso&apos;s answer to amplification is <strong>hedged requests</strong>: if a call hasn&apos;t
          come back by, say, the p95 mark, fire a duplicate to another replica and take whichever returns first. It
          costs a few percent of extra load but dramatically tightens the tail — toggle it in the demo and watch p99
          collapse.
        </Callout>

        <Analogy title="Analogy — the airport security line">
          Mean wait time is a comforting lie. If 99 travellers clear security in 3 minutes but one gets pulled for a
          full bag search and waits 40 minutes, the &quot;average&quot; looks fine while a real person missed their
          flight. Airlines and Amazon alike design for the <strong>p999</strong> traveller, because the person with the
          worst experience is often the one with the most baggage — or, online, the most data and the most value.
        </Analogy>

        <Callout variant="insight" title="Why Amazon obsesses over p999">
          Amazon specifies internal response-time requirements at the <strong>99.9th percentile</strong>, because the
          customers with the slowest requests are usually those with the most data — and the most purchases. They are
          the customers you least want to lose. But optimising the <strong>99.99th</strong> percentile is deliberately{" "}
          <em>not</em> done: the cost of chasing those last outliers outweighs the benefit.
        </Callout>

        <CompareTable
          columns={["Mean", "p50 (median)", "p99 / p999 (tail)"]}
          rows={[
            {
              feature: "Tells you",
              values: [
                "A single number skewed by outliers",
                'Your "typical" request',
                "How bad your worst requests are",
              ],
            },
            {
              feature: "Hides",
              values: [
                "Who actually waited that long",
                "The entire tail above it",
                "Nothing — it's the point",
              ],
            },
            {
              feature: "Used for",
              values: [
                "Rough capacity math only",
                "Dashboards, sanity checks",
                <Fragment key={2}>
                  <strong>SLOs &amp; SLAs</strong>, alerting
                </Fragment>,
              ],
            },
          ]}
          caption="An SLA might promise: median < 200ms AND p99 < 1s. Miss it and customers can demand a refund."
        />

        <Prose>
          <h3>Approaches for coping with load</h3>
          <p>
            When load outgrows a single machine, you have three moves. <strong>Scaling up</strong> (vertical scaling)
            means a more powerful machine — simple, but there&apos;s a ceiling and it&apos;s one fault domain.{" "}
            <strong>Scaling out</strong> (horizontal scaling) distributes load across many smaller machines — this is a{" "}
            <em>shared-nothing</em> architecture. <strong>Elastic</strong> systems automatically add resources when
            they detect rising load, which is invaluable when load is unpredictable but adds operational complexity.
          </p>
          <p>
            A crucial caveat: distributing <strong>stateless</strong> services across machines is straightforward, but
            taking a <strong>stateful</strong> data system from a single node to a distributed setup introduces a lot
            of complexity (replication, partitioning, consistency — the entire Part II of this book). Until recently the
            common wisdom was to keep your database on a single node until scaling cost or availability forced your hand.
          </p>
        </Prose>

        <DemoFrame
          title="Throughput vs response time — find the knee"
          description="Push offered load up against a fixed capacity and watch the classic hockey stick: throughput plateaus at capacity while response time runs away as utilisation → 100%. Then change your scaling strategy to move the knee."
          right="ρ → 1 ⇒ wait → ∞"
        >
          <ThroughputDemo />
        </DemoFrame>

        <Callout variant="tradeoff">
          There is no one-size-fits-all scalable architecture. The right design depends entirely on your load
          parameters — read/write ratio, data volume, access patterns, response-time targets. An architecture tuned for
          100,000 reads/sec of 1 KB records looks nothing like one for 3 writes/min of 2 GB records.
        </Callout>

        <RealWorld
          title="Scalability in the wild"
          examples={[
            {
              system: "Twitter timelines",
              detail: (
                <>
                  The fan-out-on-write side runs on a forked <strong>Redis</strong> cluster doing roughly{" "}
                  <code>30 billion timeline writes/day</code>. Each home timeline is capped at the last{" "}
                  <strong>~800 tweet IDs</strong> and replicated across <strong>3 machines</strong> — and celebrities
                  are pulled out into a fan-out-on-read path, exactly the hybrid the book describes.
                </>
              ),
            },
            {
              system: "Amazon DynamoDB",
              detail: (
                <>
                  AWS markets it as delivering <strong>single-digit-millisecond</strong> performance{" "}
                  <em>at any scale</em> — the load parameter (table size) is decoupled from response time by automatic
                  partitioning, the textbook scale-out / shared-nothing move.
                </>
              ),
            },
            {
              system: "Google Search",
              detail: (
                <>
                  A single query fans out to thousands of leaf servers, so it is the canonical{" "}
                  <strong>tail-at-scale</strong> case: even a 1-in-100 slow leaf would make most queries slow, which is
                  why Google pioneered <strong>hedged / tied requests</strong> to tame the tail.
                </>
              ),
            },
            {
              system: "Google SRE example",
              detail: (
                <>
                  The SRE book illustrates why the mean lies with a real shape: a typical request is served in{" "}
                  <code>~50 ms</code>, yet <strong>5% of requests are 20× slower</strong> — so SLOs are written on
                  high percentiles, not averages.
                </>
              ),
            },
          ]}
        />
      </Section>

      {/* ------------------------------------------------------- Maintainability */}
      <Section
        id="maintainability"
        kicker="Pillar III"
        title="Maintainability"
        intro="The majority of the cost of software is not its initial development — it's the ongoing maintenance: fixing bugs, keeping systems running, adapting to new requirements, and paying down complexity."
      >
        <Prose>
          <p>
            Most software cost is paid <em>after</em> launch. So we should design to minimise the pain of maintenance.
            DDIA distils this into three design principles:
          </p>
          <ul>
            <li>
              <strong>Operability</strong> — make it easy for operations teams to keep the system running smoothly.
            </li>
            <li>
              <strong>Simplicity</strong> — make it easy for new engineers to understand the system by removing as much
              complexity as possible.
            </li>
            <li>
              <strong>Evolvability</strong> (extensibility) — make it easy to change the system to meet future,
              unanticipated requirements.
            </li>
          </ul>
          <p>
            <strong>Operability</strong> is about making routine tasks easy: monitoring health and quickly restoring
            service, tracking down the cause of problems, keeping software and platforms patched, anticipating future
            problems (capacity planning), preserving organisational knowledge, and defining processes that make
            operations <em>predictable</em>. Good operability means automating the routine so humans focus on the novel.
          </p>
          <p>
            <strong>Simplicity</strong> is about managing complexity. The key move is distinguishing{" "}
            <strong>essential complexity</strong> — inherent in the problem the software solves, as seen by users — from{" "}
            <strong>accidental complexity</strong> — complexity that is <em>not</em> inherent, an artefact of our
            implementation. The best tool we have for removing accidental complexity is <strong>abstraction</strong>:
            hiding implementation detail behind a clean, well-defined interface. A good abstraction lets you reason
            about a large system in small, independent pieces.
          </p>
        </Prose>

        <DemoFrame
          title="Complexity Lens — abstraction vs the big ball of mud"
          description="Wire up a service graph and watch coupling explode as O(n²) when everything knows about everything. Toggle on a clean abstraction layer and the same modules route through one interface — O(n) coupling — and the maintainability scores recover."
          right="O(n²) → O(n)"
        >
          <ComplexityLens />
        </DemoFrame>

        <Analogy title="Analogy — wiring a house">
          Imagine every appliance wired directly to every other appliance — a rat&apos;s nest where touching the toaster
          might kill the lights. Instead we put a <strong>standardised socket</strong> (an abstraction) on the wall:
          appliances only know &quot;240V at this plug shape.&quot; The wiring behind the wall can be re-routed without
          any appliance noticing. That socket is exactly what a clean API does for a software module.
        </Analogy>

        <CodeBlock
          lang="typescript"
          caption="Accidental complexity (left in your head) vs an abstraction that hides it"
          code={`// Accidental complexity: every caller re-implements the messy detail.
const rows = await db.query(
  "SELECT * FROM orders WHERE user_id = $1 AND status != 'deleted' " +
  "ORDER BY created_at DESC LIMIT $2 OFFSET $3",
  [userId, pageSize, page * pageSize]
);
// ...and the same 4 lines, copy-pasted, in 20 other places. Change the
// soft-delete rule once and you must find all 20.

// Simplicity via abstraction: the rule lives in ONE place behind a clean API.
const orders = await orderRepo.listForUser(userId, { page, pageSize });
// Callers don't know (or care) how soft-deletes, paging, or ordering work.
// Evolvable: swap the storage engine without touching a single caller.`}
        />

        <Prose>
          <p>
            <strong>Evolvability</strong> acknowledges that requirements always change — new features, new regulations,
            new scale. <strong>Agile</strong> working patterns (TDD, refactoring) provide a framework for adapting, and
            simplicity and good abstractions are what make a system evolvable in the first place. The easier a system is
            to understand and modify, the more confidently you can change it without breaking things.
          </p>
        </Prose>

        <RealWorld
          examples={[
            {
              system: "Stripe API",
              detail: (
                <>
                  A famously clean abstraction over a brutally complex domain (cards, banks, currencies, fraud,
                  regulation). Callers say <code>charge($20)</code>; all the accidental complexity hides behind the API.
                </>
              ),
            },
            {
              system: "Prometheus + Grafana",
              detail: (
                <>
                  Operability in practice — metrics, dashboards, and alerting that turn an opaque system into one whose
                  health and failures are visible and diagnosable.
                </>
              ),
            },
            {
              system: "Terraform / IaC",
              detail: (
                <>
                  Makes operations <strong>predictable and repeatable</strong>: infrastructure is code, reviewed and
                  versioned, so changes are deliberate and reversible rather than ad-hoc and forgotten.
                </>
              ),
            },
          ]}
        />

        <Callout variant="insight">
          Reliability, scalability, and maintainability aren&apos;t independent — they reinforce each other. Simple
          systems (maintainability) have fewer places for bugs to hide (reliability) and are easier to reason about when
          you redesign for growth (scalability). Complexity is the common enemy of all three.
        </Callout>
      </Section>

      {/* ------------------------------------------------------- See it explained */}
      <Section
        id="watch"
        kicker="See it explained"
        title="Watch it explained"
        intro="Two videos that pair well with this chapter — a walkthrough of the three pillars, and the canonical talk on why your latency numbers are probably lying to you."
      >
        <YouTubeEmbed
          videoId="LK6ka9gcCCo"
          title="Designing Data-Intensive Applications — Chapter 1: Reliability, Scalability, Maintainability"
          channel="DDIA chapter walkthrough"
        />
        <Prose>
          <p>
            For the percentile and tail-latency material specifically, Gil Tene&apos;s talk is the classic reference —
            it&apos;s where the term <em>coordinated omission</em> comes from and why the book insists you measure on
            the client side and keep sending load independently of response time.
          </p>
        </Prose>
        <YouTubeEmbed
          videoId="lJ8ydIuPFeU"
          title="How NOT to Measure Latency"
          channel="Gil Tene · Strange Loop"
        />
      </Section>

      {/* ----------------------------------------------------------- Go deeper */}
      <Section
        id="further"
        kicker="Go deeper"
        title="Further reading"
        intro="Primary sources behind this chapter — the canonical tail-latency paper, the SRE playbook on SLOs, and the engineering write-ups behind the systems referenced above."
      >
        <FurtherReading
          sources={[
            {
              title: "The Tail at Scale — Dean & Barroso (CACM, 2013)",
              url: "https://cacm.acm.org/research/the-tail-at-scale/",
              note: "The foundational paper on why tail latency dominates at scale, and the techniques (hedged & tied requests) that tame it.",
            },
            {
              title: "Google SRE Book — Service Level Objectives",
              url: "https://sre.google/sre-book/service-level-objectives/",
              note: "Free online chapter on SLIs/SLOs/SLAs and why latency targets are written in high percentiles, not averages.",
            },
            {
              title: "On Coordinated Omission — ScyllaDB",
              url: "https://www.scylladb.com/2021/04/22/on-coordinated-omission/",
              note: "A clear, modern explainer of Gil Tene's coordinated-omission trap and how honest load tools correct for it.",
            },
            {
              title: "Principles of Chaos Engineering",
              url: "https://principlesofchaos.org/",
              note: "The discipline that grew out of Netflix's Chaos Monkey — experimenting on production to build confidence it tolerates faults.",
            },
            {
              title: "30 Billion Redis Updates Per Day — Twitter timelines (VMware Tanzu)",
              url: "https://blogs.vmware.com/tanzu/case-study-staple-yourself-to-a-tweet-to-understand-30-billion-redis-updates-per-day",
              note: "Walks the exact fan-out path: the fanout daemon, ~800 tweet IDs per timeline, and 3× Redis replication.",
            },
            {
              title: "Amazon DynamoDB — Developer Guide",
              url: "https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Introduction.html",
              note: "AWS's own description of a shared-nothing store with single-digit-millisecond latency at any scale.",
            },
          ]}
        />
      </Section>

      {/* ---------------------------------------------------------- Test yourself */}
      <Section id="test" kicker="Practice" title="Test yourself" intro="A fresh, auto-generated quiz on this chapter — then talk it through with an AI tutor grounded in these exact concepts.">
        <Quiz chapterTitle="Reliable, Scalable & Maintainable Applications" concepts={CONCEPTS} />
        <div className="mt-6">
          <AskClaude chapterTitle="Reliable, Scalable & Maintainable Applications" concepts={CONCEPTS} />
        </div>
      </Section>

      <KeyTakeaways
        points={[
          "Reliability, scalability, and maintainability are non-functional requirements — define each precisely and measure it, don't treat them as buzzwords.",
          "A fault is one component leaving its spec; a failure is the whole system stopping. Design to tolerate faults so they never become failures — and prefer tolerating over preventing.",
          "Match the mitigation to the fault: redundancy beats independent hardware faults, but only testing/monitoring and staged rollout + rollback contain correlated software bugs and human config errors.",
          "Describe load with explicit load parameters before reasoning about growth — Twitter's was follower fan-out, which drove the move from fan-out-on-read to a hybrid scheme.",
          "Summarise performance with percentiles, not the mean: p50 is typical, p99/p999 is the tail — and the tail (driven by queueing and fan-out amplification) is where your most valuable users live. SLAs are written in percentiles.",
          "Cope with growth by scaling up, scaling out (shared-nothing), or going elastic; stateless tiers distribute easily, stateful data systems are the hard part.",
          "Most software cost is maintenance. Pursue operability, simplicity (remove ACCIDENTAL complexity via abstraction), and evolvability — and remember complexity is the shared enemy of all three pillars.",
        ]}
      />
    </ChapterShell>
  );
}
