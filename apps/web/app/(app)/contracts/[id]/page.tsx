"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MonoId } from "@sorolens/ui";
import {
  getContract,
  getContractEvents,
  getContractStorage,
  getContractStats,
  getContractSnapshot,
  getContractInvocations,
  addContractTag,
  removeContractTag,
  ApiError,
} from "@/lib/api";
import type {
  ContractDetail,
  ContractEvent,
  StorageEntry,
  StatsResponse,
  ResourceTrendPoint,
  TimeWindow,
  Invocation,
} from "@/lib/types";
import { getUserId } from "@/lib/user";
import { StatCard } from "@/components/StatCard";
import { TagInput } from "@/components/TagInput";
import {
  CardSkeleton,
  ChartSkeleton,
  TableSkeleton,
} from "@/components/Skeleton";
import { WindowSelector } from "@/components/WindowSelector";
import { EventVolumeChart } from "@/components/EventVolumeChart";
import { InvocationChart } from "@/components/InvocationChart";
import { ResourceTrendChart } from "@/components/ResourceTrendChart";
import { getResourceTrend } from "@/lib/resourceTrend";
import { EventsTable } from "@/components/EventsTable";
import { StoragePanel } from "@/components/StoragePanel";
import { ContractNotesPanel } from "@/components/ContractNotesPanel";
import { SnapshotPanel } from "@/components/SnapshotPanel";
import { HealthScoreCard } from "@/components/HealthScoreCard";
import { AddToGroup } from "@/components/AddToGroup";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { CallTracePanel } from "@/components/CallTracePanel";
import { ContractChangelogPanel } from "@/components/ContractChangelogPanel";
import { useEventStream } from "@/hooks/useEventStream";
import { useUrlSearchParams } from "@/hooks/useUrlSearchParams";

const CONTRACT_TABS = [
  "overview",
  "events",
  "invocations",
  "storage",
  "watchdog",
] as const;
type ContractTab = (typeof CONTRACT_TABS)[number];

interface Props {
  params: Promise<{ id: string }>;
}

export default function ContractDetailPage({ params }: Props) {
  const { id } = use(params);
  return <ContractDetailContent id={id} />;
}

function ContractDetailContent({ id }: { id: string }) {
  const [searchParams, updateSearchParams] = useUrlSearchParams();
  const search = searchParams.toString();
  const selectedTab = searchParams.get("tab");
  const activeTab: ContractTab = CONTRACT_TABS.includes(
    selectedTab as ContractTab
  )
    ? (selectedTab as ContractTab)
    : "overview";
  const [contract, setContract] = useState<ContractDetail | null>(null);
  const [contractError, setContractError] = useState<string | null>(null);
  const [contractLoading, setContractLoading] = useState(true);

  // User-defined tags are edited inline on this page.
  const [tags, setTags] = useState<string[]>([]);
  const [tagError, setTagError] = useState<string | null>(null);
  const [tagSaving, setTagSaving] = useState(false);

  const [window, setWindow] = useState<TimeWindow>("7d");
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  const [trend, setTrend] = useState<ResourceTrendPoint[]>([]);
  const [trendLoading, setTrendLoading] = useState(true);

  const [events, setEvents] = useState<ContractEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [eventsCursor, setEventsCursor] = useState<string | null>(null);
  const [eventsHasMore, setEventsHasMore] = useState(false);
  const [showFailedOnly, setShowFailedOnly] = useState(false);

  const [invocations, setInvocations] = useState<Invocation[]>([]);
  const [invocationsLoading, setInvocationsLoading] = useState(true);
  const [functionFilter, setFunctionFilter] = useState(
    searchParams.get("function_name") ?? ""
  );
  const [statusFilter, setStatusFilter] = useState(
    searchParams.get("status") ?? ""
  );

  const [storage, setStorage] = useState<StorageEntry[]>([]);
  const [storageLoading, setStorageLoading] = useState(true);
  const [storageCursor, setStorageCursor] = useState<string | null>(null);
  const [storageHasMore, setStorageHasMore] = useState(false);
  const [currentLedger, setCurrentLedger] = useState(0);

  const { isConnected: isStreamConnected } = useEventStream({
    contractId: id,
    onEvent: (newEvent) => {
      setEvents((prev) => {
        if (prev.some((e) => e.id === newEvent.id)) return prev;
        return [newEvent, ...prev];
      });
    },
  });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const data = await getContract(id);
        if (!cancelled) {
          setContract(data);
          setTags(data.tags ?? []);
        }
      } catch (err) {
        if (!cancelled) {
          if (err instanceof ApiError && err.status === 404) {
            notFound();
          }
          // Backend not reachable. Surface a friendly not-found panel
          // rather than a red error, since the user cannot distinguish
          // "we do not have this contract" from "the API is down."
          setContractError("Contract not found");
        }
      } finally {
        if (!cancelled) setContractLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    let cancelled = false;

    async function loadStats() {
      setStatsLoading(true);
      try {
        const data = await getContractStats(id, window);
        if (!cancelled) setStats(data);
      } catch {
        // stats are non-critical
      } finally {
        if (!cancelled) setStatsLoading(false);
      }
    }

    loadStats();
    return () => {
      cancelled = true;
    };
  }, [id, window]);

  useEffect(() => {
    let cancelled = false;

    async function loadTrend() {
      setTrendLoading(true);
      try {
        const data = await getResourceTrend(id, 30);
        if (!cancelled) setTrend(data);
      } catch {
        // non-critical
      } finally {
        if (!cancelled) setTrendLoading(false);
      }
    }

    loadTrend();
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    let cancelled = false;

    async function loadEvents() {
      setEventsLoading(true);
      try {
        const data = await getContractEvents(id, {
          limit: 50,
          in_successful_call: showFailedOnly ? false : undefined,
        });
        if (!cancelled) {
          setEvents(data.events);
          setEventsCursor(data.cursor);
          setEventsHasMore(data.has_more);
        }
      } catch {
        // non-critical
      } finally {
        if (!cancelled) setEventsLoading(false);
      }
    }

    loadEvents();
    return () => {
      cancelled = true;
    };
  }, [id, showFailedOnly]);

  useEffect(() => {
    const params = new URLSearchParams(search);
    setFunctionFilter(params.get("function_name") ?? "");
    setStatusFilter(params.get("status") ?? "");
  }, [search]);

  useEffect(() => {
    if (activeTab !== "invocations") return;
    let cancelled = false;
    const filters = new URLSearchParams(search);
    setInvocationsLoading(true);
    getContractInvocations(id, {
      limit: 50,
      function_name: filters.get("function_name") || undefined,
      status: filters.get("status") || undefined,
    })
      .then((data) => {
        if (!cancelled) setInvocations(data.invocations ?? []);
      })
      .catch(() => {
        if (!cancelled) setInvocations([]);
      })
      .finally(() => {
        if (!cancelled) setInvocationsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeTab, id, search]);

  useEffect(() => {
    let cancelled = false;

    async function loadStorage() {
      setStorageLoading(true);
      try {
        const data = await getContractStorage(id, { limit: 100 });
        if (!cancelled) {
          setStorage(data.entries);
          setStorageCursor(data.cursor);
          setStorageHasMore(data.has_more);
          setCurrentLedger(data.current_ledger);
        }
      } catch {
        // non-critical
      } finally {
        if (!cancelled) setStorageLoading(false);
      }
    }

    loadStorage();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const handleLoadMoreEvents = useCallback(async () => {
    if (!eventsCursor) return;
    try {
      const data = await getContractEvents(id, {
        cursor: eventsCursor,
        limit: 50,
        in_successful_call: showFailedOnly ? false : undefined,
      });
      setEvents((prev) => [...prev, ...data.events]);
      setEventsCursor(data.cursor);
      setEventsHasMore(data.has_more);
    } catch {
      // non-critical
    }
  }, [id, eventsCursor, showFailedOnly]);

  const handleLoadMoreStorage = useCallback(async () => {
    if (!storageCursor) return;
    try {
      const data = await getContractStorage(id, {
        cursor: storageCursor,
        limit: 100,
      });
      setStorage((prev) => [...prev, ...data.entries]);
      setStorageCursor(data.cursor);
      setStorageHasMore(data.has_more);
    } catch {
      // non-critical
    }
  }, [id, storageCursor]);

  const handleAddTag = useCallback(
    async (tag: string) => {
      setTagSaving(true);
      setTagError(null);
      try {
        const res = await addContractTag(id, tag, getUserId());
        setTags(res.tags ?? []);
      } catch (err) {
        setTagError(
          err instanceof ApiError && err.status === 401
            ? "You need a contributor identity to edit tags."
            : "Failed to add tag."
        );
      } finally {
        setTagSaving(false);
      }
    },
    [id]
  );

  const handleRemoveTag = useCallback(
    async (tag: string) => {
      setTagSaving(true);
      setTagError(null);
      try {
        await removeContractTag(id, tag, getUserId());
        setTags((prev) => prev.filter((t) => t !== tag));
      } catch (err) {
        setTagError(
          err instanceof ApiError && err.status === 401
            ? "You need a contributor identity to edit tags."
            : "Failed to remove tag."
        );
      } finally {
        setTagSaving(false);
      }
    },
    [id]
  );

  if (contractLoading) {
    return (
      <div>
        <header className="mb-8">
          <SkeletonHeader />
        </header>
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
        <div className="mb-8 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ChartSkeleton />
          <ChartSkeleton />
        </div>
        <TableSkeleton />
      </div>
    );
  }

  if (contractError) {
    return (
      <div className="mx-auto max-w-xl rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] px-8 py-16 text-center">
        <p className="text-lg font-medium text-[var(--color-text-primary)]">
          {contractError}
        </p>
        <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
          Check the contract ID and try again, or return to the{" "}
          <Link
            href="/contracts"
            className="text-[var(--color-accent)] underline underline-offset-2 hover:opacity-80"
          >
            contracts list
          </Link>
          .
        </p>
      </div>
    );
  }

  const eventVolumeData = stats?.event_volume ?? [];
  const invocationData = stats?.invocation_count ?? [];
  const contractStats = stats?.stats;

  return (
    <div>
      <header className="mb-8">
        <div className="mb-1 text-xs font-medium text-[var(--color-text-secondary)]">
          Contract
        </div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">
            <MonoId value={id} headChars={8} tailChars={8} />
          </h1>
          {contract?.label && (
            <span className="text-lg text-[var(--color-text-secondary)]">
              {contract.label}
            </span>
          )}
          <span
            className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${
              contract?.status === "active"
                ? "bg-green-900/40 text-green-400"
                : contract?.status === "backfilling"
                  ? "bg-blue-900/40 text-blue-400"
                  : contract?.status === "error"
                    ? "bg-red-900/40 text-red-400"
                    : "bg-yellow-900/40 text-yellow-400"
            }`}
          >
            {contract?.status}
          </span>
          <AddToGroup contractId={id} />
          <VerifiedBadge contractId={id} />
        </div>
        {contract?.sync && (
          <div className="mt-1 flex gap-4 text-xs text-[var(--color-text-secondary)]">
            <span>Network: {contract.network}</span>
            <span>
              Last ledger: {contract.sync.last_ledger.toLocaleString()}
            </span>
            <span>
              Last sync: {new Date(contract.sync.last_run_at).toLocaleString()}
            </span>
          </div>
        )}
        <div className="mt-3 max-w-lg">
          <TagInput
            tags={tags}
            onAdd={handleAddTag}
            onRemove={handleRemoveTag}
            disabled={tagSaving}
            error={tagError}
            placeholder="Add a tag (prod, staging…)"
          />
        </div>
      </header>

      <div
        role="tablist"
        aria-label="Contract sections"
        className="mb-6 flex gap-1 overflow-x-auto border-b border-[var(--color-border)]"
      >
        {CONTRACT_TABS.map((tab) => {
          const label = tab[0].toUpperCase() + tab.slice(1);
          return (
            <button
              key={tab}
              id={`contract-tab-${tab}`}
              type="button"
              role="tab"
              aria-selected={activeTab === tab}
              aria-controls={`contract-panel-${tab}`}
              tabIndex={activeTab === tab ? 0 : -1}
              onKeyDown={(event) => {
                const currentIndex = CONTRACT_TABS.indexOf(tab);
                let nextIndex: number | null = null;
                if (event.key === "ArrowRight")
                  nextIndex = (currentIndex + 1) % CONTRACT_TABS.length;
                else if (event.key === "ArrowLeft")
                  nextIndex =
                    (currentIndex - 1 + CONTRACT_TABS.length) %
                    CONTRACT_TABS.length;
                else if (event.key === "Home") nextIndex = 0;
                else if (event.key === "End")
                  nextIndex = CONTRACT_TABS.length - 1;
                if (nextIndex !== null) {
                  event.preventDefault();
                  updateSearchParams((params) =>
                    params.set("tab", CONTRACT_TABS[nextIndex!])
                  );
                }
              }}
              onClick={() =>
                updateSearchParams((params) => params.set("tab", tab))
              }
              className={`border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === tab
                  ? "border-[var(--color-accent)] text-[var(--color-text-primary)]"
                  : "border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      <div
        id="contract-panel-overview"
        role="tabpanel"
        aria-labelledby="contract-tab-overview"
        hidden={activeTab !== "overview"}
      >
        <section className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Events"
            value={contractStats?.total_events?.toLocaleString() ?? "-"}
            subtext="Total indexed"
          />
          <StatCard
            label="Invocations"
            value={contractStats?.total_invocations?.toLocaleString() ?? "-"}
            subtext="Total transactions"
          />
          <StatCard
            label="Storage Entries"
            value={contractStats?.storage_entry_count?.toLocaleString() ?? "-"}
            subtext="Currently tracked"
          />
          <StatCard
            label="Expiring Soon"
            value={contractStats?.expiring_entry_count?.toLocaleString() ?? "-"}
            subtext="Within 7 days"
            variant={
              (contractStats?.expiring_entry_count ?? 0) > 10
                ? "danger"
                : (contractStats?.expiring_entry_count ?? 0) > 0
                  ? "warning"
                  : "default"
            }
          />
        </section>

        <section className="mb-8">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold">Activity</h2>
            <WindowSelector selected={window} onChange={setWindow} />
          </div>
          {statsLoading ? (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <ChartSkeleton />
              <ChartSkeleton />
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="rounded-lg bg-[var(--color-bg-card)] p-4">
                <h3 className="mb-3 text-sm font-medium text-[var(--color-text-secondary)]">
                  Event Volume
                </h3>
                <EventVolumeChart data={eventVolumeData} />
              </div>
              <div className="rounded-lg bg-[var(--color-bg-card)] p-4">
                <h3 className="mb-3 text-sm font-medium text-[var(--color-text-secondary)]">
                  Invocations
                </h3>
                <InvocationChart data={invocationData} />
              </div>
            </div>
          )}
        </section>
      </div>
      <div
        id="contract-panel-events"
        role="tabpanel"
        aria-labelledby="contract-tab-events"
        hidden={activeTab !== "events"}
      >
        <section className="mb-8">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-semibold">Events</h2>
              {isStreamConnected && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-green-900/40 px-2.5 py-0.5 text-xs font-medium text-green-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
                  Live
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => setShowFailedOnly(!showFailedOnly)}
              className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
                showFailedOnly
                  ? "bg-red-500/20 text-red-500 hover:bg-red-500/30"
                  : "bg-[var(--color-bg-card)] text-[var(--color-text-secondary)] hover:bg-[var(--color-border)] hover:text-[var(--color-text-primary)]"
              }`}
            >
              Failed Only
            </button>
          </div>
          {eventsLoading ? (
            <TableSkeleton />
          ) : (
            <EventsTable
              events={events}
              onLoadMore={handleLoadMoreEvents}
              hasMore={eventsHasMore}
            />
          )}
        </section>
      </div>

      <div
        id="contract-panel-overview-details"
        hidden={activeTab !== "overview"}
      >
        <section className="mb-8">
          <h2 className="mb-4 text-xl font-semibold">Call trace</h2>
          <CallTracePanel initialTxHash={events[0]?.tx_hash} />
        </section>

        <section className="mb-8">
          <h2 className="mb-4 text-xl font-semibold">Notes</h2>
          <ContractNotesPanel contractId={id} />
        </section>

        <section className="mb-8" id="changelog">
          <h2 className="mb-4 text-xl font-semibold">Changelog</h2>
          <ContractChangelogPanel contractId={id} />
        </section>

        <section className="mb-8">
          <h2 className="mb-4 text-xl font-semibold">Snapshot / replay</h2>
          <SnapshotPanel contractId={id} currentLedger={currentLedger} />
        </section>
      </div>

      <div
        id="contract-panel-invocations"
        role="tabpanel"
        aria-labelledby="contract-tab-invocations"
        hidden={activeTab !== "invocations"}
      >
        <section className="mb-8">
          <h2 className="mb-4 text-xl font-semibold">Invocations</h2>
          <form
            className="mb-4 flex flex-wrap items-end gap-3"
            aria-label="Invocation filters"
            onSubmit={(event) => {
              event.preventDefault();
              updateSearchParams((params) => {
                if (functionFilter.trim())
                  params.set("function_name", functionFilter.trim());
                else params.delete("function_name");
                if (statusFilter) params.set("status", statusFilter);
                else params.delete("status");
              });
            }}
          >
            <label className="flex flex-col gap-1 text-xs text-[var(--color-text-secondary)]">
              Function
              <input
                type="search"
                value={functionFilter}
                onChange={(event) => setFunctionFilter(event.target.value)}
                className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-card)] px-3 py-1.5 text-xs text-[var(--color-text-primary)]"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-[var(--color-text-secondary)]">
              Status
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-card)] px-3 py-1.5 text-xs text-[var(--color-text-primary)]"
              >
                <option value="">All statuses</option>
                <option value="SUCCESS">Success</option>
                <option value="FAILED">Failed</option>
              </select>
            </label>
            <button
              type="submit"
              className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-xs font-medium text-[var(--color-bg-page)]"
            >
              Apply
            </button>
            {(functionFilter || statusFilter) && (
              <button
                type="button"
                onClick={() => {
                  setFunctionFilter("");
                  setStatusFilter("");
                  updateSearchParams((params) => {
                    params.delete("function_name");
                    params.delete("status");
                  });
                }}
                className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-text-secondary)]"
              >
                Clear
              </button>
            )}
          </form>
          {invocationsLoading ? (
            <TableSkeleton />
          ) : invocations.length === 0 ? (
            <p className="text-sm text-[var(--color-text-secondary)]">
              No invocations match these filters.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-[var(--color-border)]">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-b border-[var(--color-border)] text-xs text-[var(--color-text-secondary)]">
                  <tr>
                    <th className="px-4 py-3">Transaction</th>
                    <th className="px-4 py-3">Function</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Ledger</th>
                    <th className="px-4 py-3">Timestamp</th>
                  </tr>
                </thead>
                <tbody>
                  {invocations.map((invocation) => (
                    <tr
                      key={`${invocation.ledger}:${invocation.tx_hash}`}
                      className="border-b border-[var(--color-border)] last:border-0"
                    >
                      <td className="px-4 py-3 font-mono text-xs">
                        <MonoId
                          value={invocation.tx_hash}
                          headChars={8}
                          tailChars={8}
                        />
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">
                        {invocation.function_name ?? "-"}
                      </td>
                      <td className="px-4 py-3 text-xs">{invocation.status}</td>
                      <td className="px-4 py-3 tabular-nums">
                        {invocation.ledger.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-xs text-[var(--color-text-secondary)]">
                        {new Date(invocation.ledger_closed_at).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <div
        id="contract-panel-storage"
        role="tabpanel"
        aria-labelledby="contract-tab-storage"
        hidden={activeTab !== "storage"}
      >
        <section className="mb-8">
          <h2 className="mb-4 text-xl font-semibold">Storage TTL</h2>
          {storageLoading ? (
            <TableSkeleton />
          ) : (
            <StoragePanel
              entries={storage}
              currentLedger={currentLedger}
              onLoadMore={handleLoadMoreStorage}
              hasMore={storageHasMore}
            />
          )}
        </section>
      </div>

      <div
        id="contract-panel-watchdog"
        role="tabpanel"
        aria-labelledby="contract-tab-watchdog"
        hidden={activeTab !== "watchdog"}
      >
        <section className="mb-8">
          <h2 className="mb-4 text-xl font-semibold">Watchdog</h2>
          <div className="mb-4 flex flex-wrap gap-4 text-sm">
            <Link
              href={`/watchdog/${id}`}
              className="text-[var(--color-accent)] hover:underline"
            >
              Open watchdog details
            </Link>
            <Link
              href={`/compare?ids=${encodeURIComponent(id)}`}
              className="text-[var(--color-accent)] hover:underline"
            >
              Compare contract
            </Link>
          </div>
          <HealthScoreCard contractId={id} />
        </section>
      </div>
    </div>
  );
}

function SkeletonHeader() {
  return (
    <div className="animate-pulse space-y-3">
      <div className="h-3 w-16 rounded bg-[var(--color-border)]" />
      <div className="flex items-center gap-3">
        <div className="h-8 w-48 rounded bg-[var(--color-border)]" />
        <div className="h-5 w-16 rounded-full bg-[var(--color-border)]" />
      </div>
      <div className="flex gap-4">
        <div className="h-3 w-32 rounded bg-[var(--color-border)]" />
        <div className="h-3 w-28 rounded bg-[var(--color-border)]" />
        <div className="h-3 w-36 rounded bg-[var(--color-border)]" />
      </div>
    </div>
  );
}
