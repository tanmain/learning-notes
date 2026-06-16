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
import { RaceSimulator } from "./RaceSimulator";
import { InterleaveLab } from "./InterleaveLab";
import { LostUpdateLab } from "./LostUpdateLab";
import { IsolationMatrix } from "./IsolationMatrix";
import { SerializabilityExplorer } from "./SerializabilityExplorer";

export const metadata: Metadata = {
  title: "Transactions",
  description:
    "ACID demystified — the race conditions weak isolation lets through (dirty reads, read/write skew, lost updates) and how serializability shuts them all down.",
};

const CONCEPTS = `Chapter 7 — Transactions (DDIA, Kleppmann).

A transaction groups multiple reads and writes on multiple objects into one logical unit that either fully commits or fully aborts (rollback). Transactions exist to give applications safety guarantees so they can ignore certain faults and concurrency problems.

ACID: Atomicity = abortability; if a fault occurs partway, all writes in the transaction are discarded (it is NOT about concurrency). Consistency = application-defined invariants hold; this is a property of the application, not the database (A, I, D are database properties). Isolation = concurrently executing transactions are isolated; the strongest form is serializability. Durability = once committed, data survives crashes (written to nonvolatile storage / replicated to nodes). Atomicity is implemented with a write-ahead log for crash recovery; isolation can be implemented with locks. BASE (Basically Available, Soft state, Eventual consistency) is the vague opposite marketing term. The whole point of aborts is to enable safe retries.

Weak isolation levels trade safety for performance. Read Committed: no dirty reads (only see committed data) and no dirty writes (only overwrite committed data); dirty writes prevented with row-level write locks held to commit; dirty reads avoided by remembering both old and new values and serving the old value to readers. Snapshot Isolation (called repeatable read in PostgreSQL/MySQL, serializable in Oracle): each transaction reads from a consistent snapshot of the database, implemented with multi-version concurrency control (MVCC) keeping several committed versions; prevents read skew (non-repeatable read), important for backups and analytic queries. Lost update: two read-modify-write cycles race and one clobbers the other; fixes are atomic operations (UPDATE x = x + 1), explicit locks (SELECT ... FOR UPDATE), automatic detection, and compare-and-set (UPDATE ... WHERE value = old). Write skew: two transactions read the same objects then update different objects, breaking an invariant (e.g. on-call doctors both go off call); only true serializable isolation prevents it (or explicit FOR UPDATE locks). Phantoms: a write changes the result of another transaction's search query.

Serializability is the strongest level: the result equals some serial execution; prevents ALL race conditions. Three implementations: (1) Actual serial execution on a single thread using stored procedures (VoltDB, Redis, Datomic), partitioned for multi-core. (2) Two-phase locking (2PL), pessimistic: shared locks for reads, exclusive for writes, held until end of transaction; writers block readers and vice versa; needs predicate locks / index-range locks to stop phantoms; suffers deadlocks and unstable, high-percentile latency. (3) Serializable Snapshot Isolation (SSI), optimistic: runs on a snapshot and aborts transactions at commit if they acted on an outdated premise (detecting stale MVCC reads and writes that affect prior reads); no blocking, scales across cores/partitions, but abort rate rises with contention.`;

export default function Page() {
  return (
    <ChapterShell slug="transactions" diagram={<Hero />}>
      <Prose>
        <p>
          Distributed data systems fail in maddening ways: a process crashes mid-write, the network drops a
          packet, two clients touch the same record at the same instant. Building fault-tolerant mechanisms by
          hand for every one of these cases is enormous, error-prone work. For decades the answer has been a
          single abstraction that absorbs most of that complexity for you: the <strong>transaction</strong>.
        </p>
        <p>
          A transaction lets an application group several reads and writes into one logical unit. Conceptually
          all of them execute as a single operation: either the whole thing <em>commits</em> (succeeds) or it{" "}
          <em>aborts</em> (rolls back), and a rolled-back transaction can be safely retried. In exchange for
          adopting this model, the application gets to ignore a whole catalogue of partial-failure and
          concurrency scenarios — the database promises they will not be observable. This chapter is about
          exactly how strong that promise is, and where it quietly leaks.
        </p>
      </Prose>

      {/* ───────────────────────────── SECTION 1 ───────────────────────────── */}
      <Section
        id="concept"
        kicker="The Concept of a Transaction"
        title="What a transaction actually guarantees"
        intro="ACID is four letters doing very different jobs — and only some of them are the database's responsibility."
      >
        <Prose>
          <p>
            The safety guarantees of transactions are usually described by the acronym <strong>ACID</strong>:
            Atomicity, Consistency, Isolation, Durability. The branding is tidy; the reality is that the four
            letters mean quite different things and not all of them are even properties of the database.
          </p>
          <ul>
            <li>
              <strong>Atomicity</strong> is <em>not</em> about concurrency. It describes what happens when a
              client issues several writes and a fault strikes partway through: the database discards every
              write the transaction made so far. Kleppmann notes <em>abortability</em> would have been a clearer
              name. Atomicity is what makes a failed transaction leave <em>no trace</em>, so a retry is safe.
            </li>
            <li>
              <strong>Consistency</strong> (the ACID sense) means your application&apos;s <em>invariants</em> —
              credits equal debits, a username is unique — always hold. Crucially this is a property of the{" "}
              <em>application</em>, not the database. The database can only enforce the invariants you can
              express to it (constraints, foreign keys); the rest is on you.
            </li>
            <li>
              <strong>Isolation</strong> means concurrently executing transactions do not step on each other.
              The classical, strongest interpretation is <em>serializability</em>: each transaction may pretend
              it is the only one running, and the end result is as if they had all run one after another. As
              we&apos;ll see, most databases default to something far weaker.
            </li>
            <li>
              <strong>Durability</strong> means once a transaction commits, its writes survive a crash. On a
              single node that means the data reached nonvolatile storage (and the write-ahead log); in a
              replicated system it means the data was copied to some number of nodes.
            </li>
          </ul>
          <p>
            Under the hood the mechanisms are humble: atomicity falls out of a{" "}
            <strong>write-ahead log</strong> used for crash recovery, and isolation can be implemented by taking
            a <strong>lock</strong> on each object so only one transaction touches it at a time. The one-line
            definition worth memorizing: <em>a transaction is a mechanism for grouping multiple operations on
            multiple objects into one unit of execution.</em>
          </p>
        </Prose>

        <DefinitionGrid
          items={[
            { term: "Atomicity", def: <>All-or-nothing on fault. Better named <em>abortability</em>; enables safe retries.</> },
            { term: "Consistency", def: <>Application invariants hold. A property of your app, not the database.</> },
            { term: "Isolation", def: <>Concurrent transactions don&apos;t interfere. Strongest form = serializability.</> },
            { term: "Durability", def: <>Committed data survives crashes — on disk (WAL) and/or replicated.</> },
          ]}
        />

        <Analogy title="Analogy — the bank wire">
          Wiring money is two writes: <strong>debit</strong> your account, <strong>credit</strong> theirs. If the
          power cut after the debit but before the credit, the money would simply vanish. Atomicity is the bank
          clerk&apos;s rule that the transfer either happens completely or not at all — there is never a moment
          a customer can observe where the cash has left one account but not arrived in the other. Durability is
          the stamped paper receipt: once the clerk hands it over, the transfer stands even if the lights go
          out a second later.
        </Analogy>

        <Callout variant="insight">
          The single most useful reframing in this chapter: <strong>atomicity is about aborting</strong>, not
          about doing things simultaneously. The entire point of being able to abort is that retrying becomes
          safe — a botched attempt leaves the database exactly as it was.
        </Callout>

        <Prose>
          <p>
            Not everyone keeps transactions. The marketing counter-acronym <strong>BASE</strong> (Basically
            Available, Soft state, Eventual consistency) is deliberately vague, and in leaderless systems it is
            the application&apos;s job to recover from partial failures. That freedom is sometimes worth it —
            but you are trading away the guarantee, not getting it for free.
          </p>
        </Prose>

        <DemoFrame
          title="Anatomy of a transaction"
          description="Run two increments concurrently and pick a remedy. The naive read-modify-write loses an update; the four ACID-safe strategies each preserve both. Step through to see exactly where the clobber happens."
          right={<>read-modify-write</>}
        >
          <LostUpdateLab />
        </DemoFrame>

        <RealWorld
          examples={[
            { system: "PostgreSQL", detail: <>Full ACID with a write-ahead log; atomic <code>UPDATE x = x + 1</code> and <code>SELECT … FOR UPDATE</code> row locks.</> },
            { system: "MySQL / InnoDB", detail: <>ACID transactions with the WAL-style redo log; the MyISAM engine, by contrast, had no transactions at all.</> },
            { system: "MongoDB", detail: <>Single-document writes are atomic; multi-document ACID transactions were added in 4.0. Provides atomic field operators like <code>$inc</code>.</> },
            { system: "Redis", detail: <>Atomic operations on data structures (<code>INCR</code>, <code>LPUSH</code>); MULTI/EXEC blocks run on a single thread.</> },
          ]}
        />
      </Section>

      {/* ───────────────────────────── SECTION 2 ───────────────────────────── */}
      <Section
        id="weak-isolation"
        kicker="Weak Isolation Levels"
        title="The races weak isolation lets through"
        intro="Serializable isolation is expensive, so most databases ship something weaker by default. Knowing exactly what each level does — and doesn't — prevent is a survival skill."
      >
        <Prose>
          <p>
            Concurrency bugs — race conditions — appear whenever one transaction reads data another is
            concurrently modifying, or two transactions try to modify the same data at once. Databases have
            long tried to hide these behind <strong>transaction isolation</strong>. The catch is that the
            strongest isolation (serializability) has a real performance cost, so systems overwhelmingly default
            to <em>weaker</em> levels that prevent <em>some</em> anomalies but not all. These bugs are vicious
            precisely because they only surface under unlucky timing — they pass every unit test and then
            corrupt data once a quarter under load.
          </p>
          <p>
            <strong>Read Committed</strong>, the most common default, makes exactly two promises. First, no{" "}
            <em>dirty reads</em>: you only see data that has been committed — a transaction&apos;s writes become
            visible to others only when it commits. Second, no <em>dirty writes</em>: you only overwrite data
            that has been committed, so concurrent writes to the same object are serialized. Dirty writes are
            prevented with <strong>row-level locks</strong> held until commit or abort. Dirty reads are
            <em>not</em> typically prevented with read locks (a single long writer would stall every reader);
            instead the database remembers both the old committed value and the in-flight new value, and hands
            readers the old one until the writer commits.
          </p>
        </Prose>

        <DemoFrame
          label="Concurrency race simulator"
          title="Step through the classic anomalies"
          description="Two transactions, T1 and T2, interleave over shared rows. Choose an anomaly and an isolation level, then advance step by step and watch the committed database, each transaction's read register, and buffered writes. Read Uncommitted exposes a dirty read; Read Committed hides it; Snapshot Isolation catches lost updates but still permits write skew; only Serializable shuts every door."
          right={<>T1 ⇄ T2</>}
        >
          <RaceSimulator />
        </DemoFrame>

        <Callout variant="warning" title="Read Committed is not enough for read-modify-write">
          Read Committed gives you no <em>dirty</em> reads, but two reads in the <em>same</em> transaction can
          still see different committed states (a moving target). That non-repeatable read — and the lost
          updates and write skew that build on it — sail right through. Read Committed protects individual
          reads and writes, not multi-step <em>logic</em>.
        </Callout>

        <Prose>
          <p>
            <strong>Snapshot Isolation</strong> closes the read-skew gap. Each transaction reads from a{" "}
            <em>consistent snapshot</em> of the database: it sees all data as of the moment it began, regardless
            of what commits afterward. This matters enormously for long-running reads — <em>backups</em> and{" "}
            <em>analytic queries / integrity checks</em> would otherwise observe different parts of the database
            at different points in time and produce nonsense. The implementation is <strong>multi-version
            concurrency control (MVCC)</strong>: the database retains several committed versions of each object
            and shows each transaction the versions that were committed when it started, while still using write
            locks to prevent dirty writes.
          </p>
          <p>
            A genuinely confusing piece of trivia, and an exam favorite: the names are a mess. Snapshot isolation
            is called <em>serializable</em> in Oracle and <em>repeatable read</em> in PostgreSQL and MySQL — even
            though it is <strong>not</strong> actually serializable. (The subtle distinction with plain Read
            Committed: Read Committed takes a fresh snapshot for <em>each query</em>, while snapshot isolation
            uses one snapshot for the <em>entire transaction</em>.)
          </p>
        </Prose>

        <CompareTable
          caption="What each level prevents — and the cost it pays to do so."
          columns={["Read Committed", "Snapshot Isolation", "Serializable"]}
          rows={[
            {
              feature: "Dirty read",
              values: ["prevented", "prevented", "prevented"],
            },
            {
              feature: "Read skew",
              values: ["possible", "prevented (consistent snapshot)", "prevented"],
            },
            {
              feature: "Lost update",
              values: ["possible", "detected (first-committer-wins)*", "prevented"],
            },
            {
              feature: "Write skew / phantoms",
              values: ["possible", "possible", "prevented"],
            },
            {
              feature: "Mechanism",
              values: ["row write-locks; old value for readers", "MVCC snapshot per transaction", "serial / 2PL / SSI"],
            },
            {
              feature: "Aka",
              values: ["—", "“repeatable read” (PG/MySQL), “serializable” (Oracle)", "true serializability"],
            },
          ]}
        />

        <Prose>
          <p>
            * Lost-update handling under snapshot isolation varies by vendor: PostgreSQL&apos;s repeatable read
            and Oracle&apos;s serializable detect it and abort the loser, whereas <strong>MySQL/InnoDB&apos;s
            repeatable read does not</strong> — a sharp edge worth remembering.
          </p>
          <p>
            The <strong>lost update</strong> problem itself is the canonical read-modify-write race: an
            application reads a value, modifies it in application code, and writes it back; if two transactions
            do this concurrently, the later write clobbers the earlier one. DDIA lists four remedies, which the
            demo above lets you run directly:
          </p>
          <ul>
            <li>
              <strong>Atomic write operations</strong> — push the whole thing into the database:{" "}
              <code>UPDATE counters SET value = value + 1 WHERE key = &apos;foo&apos;</code>. No stale value ever
              leaves the engine.
            </li>
            <li>
              <strong>Explicit locking</strong> — <code>SELECT … FOR UPDATE</code> locks the rows you intend to
              modify so the second transaction must wait.
            </li>
            <li>
              <strong>Automatic detection</strong> — let them race, and have the transaction manager abort and
              retry any transaction that lost an update.
            </li>
            <li>
              <strong>Compare-and-set</strong> — <code>UPDATE … WHERE content = &apos;old&apos;</code>; if the
              value changed under you, the update affects zero rows and you retry.
            </li>
          </ul>
          <p>
            With multi-leader or leaderless replication, compare-and-set breaks down — there is no single
            up-to-date copy to compare against. Those systems instead let concurrent writes create conflicting
            versions (<em>siblings</em>) and resolve them afterward with application code or CRDT-style merge
            structures.
          </p>
        </Prose>

        <Analogy title="Analogy — the shared shopping list">
          You and your housemate both glance at the fridge: &ldquo;we have 12 eggs.&rdquo; Each of you, not
          knowing the other looked, crosses out 12 and writes 13 after buying a dozen. The list says 13; you
          actually have 24. That is a <strong>lost update</strong>. The fix that always works is to never copy
          the number into your head at all — write <em>&ldquo;+12&rdquo;</em> on the list and let whoever
          totals it add them up. That is exactly what an atomic <code>value = value + 1</code> does.
        </Analogy>

        <Prose>
          <p>
            <strong>Write skew</strong> is the subtlest anomaly and the reason snapshot isolation is not enough.
            Imagine two on-call doctors, Alice and Bob, each feeling unwell. Each transaction checks &ldquo;are
            at least two doctors on call?&rdquo;, sees 2, concludes it is safe to go off call, and updates its{" "}
            <em>own</em> row. Under snapshot isolation both read 2 from their snapshots, both commit, and now{" "}
            <em>nobody</em> is on call — the invariant is violated even though neither transaction wrote the same
            row. Atomic operations can&apos;t help (multiple objects are involved); the robust fixes are true
            serializable isolation, or explicitly locking the rows the decision depends on with{" "}
            <code>FOR UPDATE</code>.
          </p>
        </Prose>

        <CodeBlock
          lang="sql"
          caption="Materializing the conflict: lock the rows the decision depends on so the second transaction must wait."
          code={`BEGIN TRANSACTION;

SELECT * FROM doctors
  WHERE on_call = true
  AND shift_id = 1234 FOR UPDATE;     -- lock all matching rows

UPDATE doctors
  SET on_call = false
  WHERE name = 'Alice'
  AND shift_id = 1234;

COMMIT;`}
        />

        <DemoFrame
          label="Driveable interleaving"
          title="Build the anomaly yourself, then prevent it"
          description="You are the scheduler. Each transaction is a little program; click 'run next op' on T1 or T2 to choose whose operation fires next. Interleave the two reads before either write to make a lost update — or two on-call checks before either doctor steps down to make write skew — emerge in the shared store. Then switch the isolation level and hit 'Replay this order' to run the exact same interleaving and watch the database abort the offender. Read Committed lets both through; Snapshot catches the lost update but not write skew; Serializable shuts both doors."
          right={<>you drive the schedule</>}
        >
          <InterleaveLab />
        </DemoFrame>

        <Callout variant="insight" title="Why the same interleaving has different fates">
          The power of replaying an <em>identical</em> step order under each level is that it isolates the
          one variable that matters: the concurrency-control algorithm. Read Committed never aborts, so the
          stale write lands. Snapshot Isolation aborts only when you <em>write</em> a row that changed since
          your snapshot (first-committer-wins) — which is why it stops lost updates but is blind to write
          skew, where the rows written are different from the rows read. Serializable aborts whenever a value
          you merely <em>read</em> was overwritten by a committed peer, catching both.
        </Callout>

        <Figure caption="Pick a level and watch which anomalies it stops. Each step up the ladder costs concurrency.">
          <IsolationMatrix />
        </Figure>

        <RealWorld
          examples={[
            { system: "PostgreSQL", detail: <>Default is Read Committed; <code>REPEATABLE READ</code> is true snapshot isolation (MVCC) and aborts on lost update with a <code>40001</code> serialization failure.</> },
            { system: "Oracle", detail: <>Its level named <code>SERIALIZABLE</code> is in fact snapshot isolation — the most famous naming trap in databases.</> },
            { system: "MySQL / InnoDB", detail: <>Default <code>REPEATABLE READ</code> uses MVCC consistent reads but isn&apos;t even full SI: it does <em>not</em> detect lost updates, and a concurrent <code>UPDATE</code> can see rows your snapshot can&apos;t. Use <code>SELECT … FOR UPDATE</code>.</> },
            { system: "Riak / Dynamo-style", detail: <>Leaderless replication keeps conflicting <em>siblings</em> and merges them (CRDTs / app logic) — compare-and-set doesn&apos;t apply with no single up-to-date copy.</> },
          ]}
        />
      </Section>

      {/* ───────────────────────────── SECTION 3 ───────────────────────────── */}
      <Section
        id="serializability"
        kicker="Serializability"
        title="Shutting every door at once"
        intro="The strongest isolation level guarantees the outcome is equivalent to running transactions one at a time. Three very different techniques achieve it."
      >
        <Prose>
          <p>
            <strong>Serializability</strong> is the gold standard: even though transactions run in parallel, the
            result is guaranteed to be the same as <em>some</em> serial order — one transaction at a time, no
            concurrency. By definition it prevents <em>all</em> race conditions, including the write skew and
            phantoms that defeat snapshot isolation. The obvious question is why anyone runs anything weaker. The
            answer is cost: every technique for achieving serializability sacrifices either throughput, latency
            stability, or both. There are three families.
          </p>
          <p>
            <strong>1. Actual serial execution.</strong> The bluntest solution: remove concurrency entirely and
            run transactions one at a time on a single thread. This only became viable once RAM grew cheap
            enough to hold the working set and once people realized OLTP transactions are usually short. The
            catch is the network round trip — an interactive multi-statement transaction would leave the single
            thread idle while it waits on the application. So these systems forbid interactive transactions and
            require each transaction to be submitted ahead of time as a <strong>stored procedure</strong>, with
            all its data already in memory, so it runs to completion in microseconds. Modern engines use
            general-purpose languages (VoltDB: Java/Groovy, Datomic: Java/Clojure, Redis: Lua) rather than the
            archaic vendor stored-procedure dialects. Throughput is then capped by a single CPU core, so you{" "}
            <strong>partition</strong> the data and give each core its own partition — at the price that any
            transaction spanning partitions is dramatically slower.
          </p>
          <p>
            <strong>2. Two-phase locking (2PL).</strong> The traditional implementation — and note it is a
            completely different thing from two-phase <em>commit</em> (2PC). Reads take a <em>shared</em> lock,
            writes take an <em>exclusive</em> lock, a read-then-write can upgrade, and every lock is held until
            the transaction ends. The &ldquo;two phases&rdquo; are acquiring locks (growing) and releasing them
            all at the end (shrinking). Because writers block readers and readers block writers, it protects
            against every anomaly — but the performance is brutal. Transactions queue behind each other,{" "}
            <strong>deadlocks</strong> occur and must be detected and resolved by aborting a victim, and latency
            at high percentiles is wildly unstable: one slow transaction holding many locks can stall the whole
            system. To stop phantoms, 2PL needs <strong>predicate locks</strong> (a lock over all rows matching
            a search condition, even ones that don&apos;t exist yet); since those are slow to check, real systems
            approximate them with cheaper <strong>index-range locks</strong>.
          </p>
          <p>
            <strong>3. Serializable Snapshot Isolation (SSI).</strong> The newcomer, and possibly the future
            default. SSI is <em>optimistic</em>: instead of blocking when something might go wrong, transactions
            run on a snapshot and the database checks <em>at commit time</em> whether they acted on an outdated
            premise — aborting and retrying any that did. It detects trouble two ways: noticing when a
            transaction <strong>read a stale MVCC version</strong> (and a writer it ignored has since committed),
            and noticing <strong>writes that affect prior reads</strong> via index-range locks that{" "}
            <em>flag</em> rather than block. The payoff is large: writers never block readers and vice versa
            (unlike 2PL), and it scales across cores and partitions (unlike serial execution). The cost is the
            abort rate, which climbs with contention, so SSI wants read-write transactions to be short.
          </p>
        </Prose>

        <Callout variant="tradeoff" title="Pessimistic vs optimistic">
          2PL and serial execution are <strong>pessimistic</strong>: assume the worst and prevent it up front by
          waiting (or by holding an exclusive lock on the entire database, in serial execution&apos;s case). SSI
          is <strong>optimistic</strong>: assume the best, let transactions proceed, and clean up afterward by
          aborting the few that conflicted. When there is spare capacity and contention is low, optimism wins;
          when contention is high, all those retries become pure waste.
        </Callout>

        <DemoFrame
          title="Three roads to the same guarantee"
          description="All three techniques deliver serializability, but handle a conflict between T1 and T2 completely differently — serialized on one thread, blocked on locks, or run in parallel and aborted on conflict. Switch between them and compare the concurrency, scaling, and abort trade-offs."
          right={<>pessimistic vs optimistic</>}
        >
          <SerializabilityExplorer />
        </DemoFrame>

        <Analogy title="Analogy — the single-lane bridge vs the toll cameras">
          Imagine a one-lane bridge cars must cross without colliding. <strong>2PL</strong> puts a gatekeeper at
          each end: a car grabs the whole bridge, everyone else waits, and if two gatekeepers each wait for the
          other you get a deadlock. <strong>Serial execution</strong> is simpler still — there is only ever one
          car on the road at a time, period. <strong>SSI</strong> tears down the gates and lets everyone drive
          across at once with <em>cameras</em> watching; almost always it&apos;s fine, but if the footage later
          shows two cars would have collided, one driver is sent back to try again. No waiting in the common
          case — you pay only when there was a real conflict.
        </Analogy>

        <DefinitionGrid
          items={[
            { term: "Serial execution", def: <>One transaction at a time on a single thread, via stored procedures; partition for multi-core. Pessimistic.</> },
            { term: "Two-phase locking (2PL)", def: <>Shared/exclusive locks held to end-of-transaction. Correct but deadlock-prone with unstable tail latency. Pessimistic.</> },
            { term: "Predicate / index-range lock", def: <>Locks over rows matching a search condition (not just existing rows) to stop phantoms.</> },
            { term: "Serializable snapshot (SSI)", def: <>Run on a snapshot, abort at commit if a premise went stale. No blocking; abort rate grows with contention. Optimistic.</> },
          ]}
        />

        <Callout variant="note" title="2PL ≠ 2PC">
          Two-phase <em>locking</em> is a concurrency-control technique for serializability on a single database.
          Two-phase <em>commit</em> is an atomic-commit protocol across multiple nodes (Chapter 9). They share a
          name and almost nothing else — a classic source of interview confusion.
        </Callout>

        <RealWorld
          examples={[
            { system: "VoltDB / H-Store", detail: <>Serial execution: transactions are stored procedures run single-threaded per partition, in memory.</> },
            { system: "Redis · Datomic", detail: <>Also serialize on a single thread; transaction logic is submitted as Lua (Redis) or Clojure/Java (Datomic).</> },
            { system: "MySQL (InnoDB) · SQL Server", detail: <>Implement <code>SERIALIZABLE</code> with two-phase locking (InnoDB uses next-key / gap locks for phantoms).</> },
            { system: "PostgreSQL", detail: <>Since 9.1, <code>SERIALIZABLE</code> uses SSI — the first production SSI implementation (Ports &amp; Grittner, building on Cahill&apos;s thesis).</> },
            { system: "CockroachDB", detail: <>Defaults to <code>SERIALIZABLE</code> via distributed SSI — serializable across nodes by design; <code>READ COMMITTED</code> was added later as an opt-in.</> },
            { system: "FoundationDB", detail: <>Optimistic serializable concurrency across a distributed cluster; conflicts are detected at commit and the loser retries.</> },
          ]}
        />

        <Callout variant="warning" title="Even 'serializable' has been caught leaking">
          Labels are not proofs. Jepsen&apos;s 2020 analysis found PostgreSQL 12.3&apos;s{" "}
          <code>SERIALIZABLE</code> permitted a <em>G2-item</em> anomaly (a read-write dependency cycle)
          during normal operation — every observed case involved a <strong>freshly inserted row</strong>,
          i.e. a phantom the conflict detector mis-attributed. PostgreSQL fixed it in the next minor
          release. The lesson DDIA hammers home: verify the guarantee your workload actually needs;
          don&apos;t trust the name on the dial.
        </Callout>
      </Section>

      {/* ───────────────────────────── SEE IT EXPLAINED ───────────────────────────── */}
      <Section
        id="watch"
        kicker="See it explained"
        title="Two walkthroughs on video"
        intro="If the anomalies still feel slippery, these explainers narrate the same ACID properties and isolation levels with worked examples."
      >
        <YouTubeEmbed
          videoId="pomxJOFVcQs"
          title="Relational Database ACID Transactions (Explained by Example)"
          channel="Hussein Nasser"
        />
        <Prose>
          <p>
            Hussein Nasser walks through atomicity, consistency, isolation and durability with concrete
            read/write traces — a good companion to the &ldquo;atomicity is really abortability&rdquo;
            reframing above. For a focused tour of the four isolation levels and the read phenomena
            (dirty / non-repeatable / phantom) each one allows, this second explainer is a tight
            complement:
          </p>
        </Prose>
        <YouTubeEmbed
          videoId="SnDJ7MPmu84"
          title="Mastering Database Isolation Levels: ACID Properties Explained with Examples"
          channel="Better Dev with Anubhav"
        />
      </Section>

      {/* ───────────────────────────── FURTHER READING ───────────────────────────── */}
      <Section
        id="further"
        kicker="Go deeper"
        title="Primary sources & further reading"
        intro="The canonical papers behind this chapter, the vendor docs that contradict their own labels, and Jepsen's empirical tests of what these systems actually do."
      >
        <FurtherReading
          sources={[
            {
              title: "A Critique of ANSI SQL Isolation Levels (Berenson, Bernstein, Gray, Melton, O'Neil, O'Neil, 1995)",
              url: "https://arxiv.org/pdf/cs/0701157",
              note: "The paper that exposed the ambiguity in the ANSI levels and formally defined Snapshot Isolation.",
            },
            {
              title: "Serializable Snapshot Isolation in PostgreSQL (Ports & Grittner, VLDB 2012)",
              url: "https://arxiv.org/pdf/1208.4179",
              note: "How Postgres turned Cahill's SSI thesis into the first production serializable-via-SSI implementation.",
            },
            {
              title: "PostgreSQL Documentation — 13.2 Transaction Isolation",
              url: "https://www.postgresql.org/docs/current/transaction-iso.html",
              note: "Confirms Repeatable Read = snapshot isolation, and that Serializable adds SSI monitoring with no extra blocking.",
            },
            {
              title: "MySQL Reference — Consistent Nonlocking Reads (InnoDB)",
              url: "https://dev.mysql.com/doc/refman/8.0/en/innodb-consistent-read.html",
              note: "The MVCC mechanism behind InnoDB's default Repeatable Read — and why it can show a state that never existed.",
            },
            {
              title: "Jepsen: PostgreSQL 12.3",
              url: "https://jepsen.io/analyses/postgresql-12.3",
              note: "Empirically catches Serializable leaking a G2-item cycle via freshly inserted rows; later patched.",
            },
            {
              title: "Postgres source — README-SSI",
              url: "https://github.com/postgres/postgres/blob/master/src/backend/storage/lmgr/README-SSI",
              note: "The implementers' own notes on detecting dangerous read-write dependency structures.",
            },
            {
              title: "CockroachDB — No Dirty Reads: SQL isolation levels explained",
              url: "https://www.cockroachlabs.com/blog/sql-isolation-levels-explained/",
              note: "A modern, opinionated tour of the levels from a database that defaults to serializable.",
            },
          ]}
        />
      </Section>

      {/* ───────────────────────────── PRACTICE ───────────────────────────── */}
      <Section id="test" kicker="Practice" title="Test yourself">
        <Prose>
          <p>
            Generate a fresh set of questions on transactions and isolation, then check your reasoning. Stuck on
            one? Hit <em>Discuss</em> and the AI tutor — grounded in this chapter — will walk you through it.
          </p>
        </Prose>
        <Quiz chapterTitle="Transactions" concepts={CONCEPTS} />
        <div className="mt-6">
          <AskClaude chapterTitle="Transactions" concepts={CONCEPTS} />
        </div>
      </Section>

      <KeyTakeaways
        points={[
          "A transaction groups many reads/writes into one all-or-nothing unit — commit makes everything durable, abort leaves no trace so retries are safe.",
          "In ACID, atomicity is really 'abortability' and consistency is the application's job; only atomicity, isolation, and durability are properties the database provides.",
          "Read Committed only stops dirty reads and dirty writes; Snapshot Isolation adds a consistent per-transaction view via MVCC (and is confusingly called 'repeatable read' or even 'serializable').",
          "Lost updates come from read-modify-write races — fix them with atomic operations, explicit FOR UPDATE locks, automatic detection, or compare-and-set.",
          "Write skew and phantoms slip past snapshot isolation entirely; only true serializability (or explicit locks on the rows a decision depends on) prevents them.",
          "Serializability has three implementations: actual serial execution (single thread + stored procedures), two-phase locking (pessimistic, deadlock-prone), and serializable snapshot isolation (optimistic, abort-on-conflict).",
          "Pessimistic control waits to avoid trouble; optimistic SSI lets transactions run and aborts the losers — better under low contention, worse when conflicts are frequent.",
        ]}
      />
    </ChapterShell>
  );
}
