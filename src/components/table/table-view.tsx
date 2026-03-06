import { ExportMediaModal } from '@/components/modals/export-media';
import { useCapturedRecords, useClearCaptures } from '@/core/database/hooks';
import { Extension, ExtensionType } from '@/core/extensions';
import { useTranslation } from '@/i18n';
import { Tweet, User } from '@/types';
import { useToggle } from '@/utils/common';
import { ColumnDef } from '@tanstack/table-core';
import { useState } from 'preact/hooks';

import { BaseTableView } from './base';
import { columns as columnsTweet } from './columns-tweet';
import { columns as columnsUser } from './columns-user';

type TableViewProps = {
  title: string;
  extension: Extension;
};

type InferDataType<T> = T extends ExtensionType.TWEET ? Tweet : User;
type DiffTab = 'added' | 'removed' | 'changed';

type FollowingSnapshotUser = {
  id: string;
  screen_name?: string;
  name?: string;
  profile_image_url?: string;
};

type FollowingSnapshotData = {
  createdAt: number;
  count: number;
  users: FollowingSnapshotUser[];
};

type SnapshotCandidate = {
  [key: string]: unknown;
  result?: SnapshotCandidate;
  data?: {
    user?: SnapshotCandidate;
    legacy?: SnapshotCandidate;
  };
  user?: SnapshotCandidate;
  legacy?: SnapshotCandidate;
  core?: SnapshotCandidate;
  avatar?: SnapshotCandidate;
  rest_id?: string | number;
  restId?: string | number;
  id_str?: string | number;
  id?: string | number;
  screen_name?: string;
  screenName?: string;
  username?: string;
  user_name?: string;
  handle?: string;
  name?: string;
  display_name?: string;
  displayName?: string;
  full_name?: string;
  fullName?: string;
  profile_image_url_https?: string;
  profile_image_url?: string;
  profileImageUrl?: string;
  avatar_url?: string;
  avatarUrl?: string;
  image_url?: string;
  imageUrl?: string;
};

const SNAPSHOT_KEY_PREFIX = 'twe:snapshot:';

function storageGetJSON<T>(key: string, defaultValue: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return defaultValue;
    return JSON.parse(raw) as T;
  } catch {
    return defaultValue;
  }
}

function storageSetJSON<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
}

function pickSnapshotUsers(records: User[]): FollowingSnapshotUser[] {
  return records
    .map((u) => {
      const a = u as unknown as SnapshotCandidate;

      // The captured record shape varies across modules and Twitter GraphQL responses.
      // Try common nesting patterns first.
      const root =
        a?.user?.result ?? a?.result ?? a?.data?.user?.result ?? a?.data?.user ?? a?.user ?? a;

      const legacy = root?.legacy ?? root?.data?.legacy ?? a?.legacy ?? null;
      const core = root?.core ?? a?.core ?? null;
      const avatar = root?.avatar ?? a?.avatar ?? null;
      // Prefer Twitter's numeric id (rest_id) when available.
      const idRaw =
        root?.rest_id ??
        root?.restId ??
        a?.rest_id ??
        a?.restId ??
        legacy?.id_str ??
        a?.id_str ??
        a?.id;

      const id = idRaw != null ? String(idRaw) : '';
      if (!id) return null;

      const screen_name =
        core?.screen_name ??
        core?.screenName ??
        legacy?.screen_name ??
        legacy?.screenName ??
        root?.screen_name ??
        root?.screenName ??
        root?.username ??
        root?.user_name ??
        root?.handle ??
        a?.screen_name ??
        a?.screenName ??
        a?.username ??
        a?.user_name ??
        a?.handle;

      const name =
        core?.name ??
        legacy?.name ??
        root?.name ??
        a?.name ??
        root?.display_name ??
        root?.displayName ??
        root?.full_name ??
        root?.fullName ??
        legacy?.display_name ??
        legacy?.displayName ??
        a?.display_name ??
        a?.displayName ??
        a?.full_name ??
        a?.fullName;

      const profile_image_url =
        avatar?.image_url ??
        avatar?.imageUrl ??
        legacy?.profile_image_url_https ??
        legacy?.profile_image_url ??
        legacy?.profileImageUrl ??
        root?.profile_image_url_https ??
        root?.profile_image_url ??
        root?.profileImageUrl ??
        root?.avatar_url ??
        root?.avatarUrl ??
        root?.avatar ??
        a?.profile_image_url_https ??
        a?.profile_image_url ??
        a?.profileImageUrl ??
        a?.avatar_url ??
        a?.avatarUrl ??
        a?.avatar;

      return {
        id,
        screen_name: screen_name ? String(screen_name) : undefined,
        name: name ? String(name) : undefined,
        profile_image_url: profile_image_url ? String(profile_image_url) : undefined,
      } as FollowingSnapshotUser;
    })
    .filter((x): x is FollowingSnapshotUser => !!x);
}

function diffById(
  oldUsers: FollowingSnapshotUser[],
  newUsers: FollowingSnapshotUser[],
): {
  added: FollowingSnapshotUser[];
  removed: FollowingSnapshotUser[];
  changed: Array<{ id: string; from: FollowingSnapshotUser; to: FollowingSnapshotUser }>;
} {
  const oldMap = new Map(oldUsers.map((u) => [u.id, u] as const));
  const newMap = new Map(newUsers.map((u) => [u.id, u] as const));

  const added: FollowingSnapshotUser[] = [];
  const removed: FollowingSnapshotUser[] = [];
  const changed: Array<{ id: string; from: FollowingSnapshotUser; to: FollowingSnapshotUser }> = [];

  for (const [id, nu] of newMap) {
    const ou = oldMap.get(id);
    if (!ou) {
      added.push(nu);
      continue;
    }
    const oScreen = ou.screen_name || undefined;
    const nScreen = nu.screen_name || undefined;
    const oName = ou.name || undefined;
    const nName = nu.name || undefined;
    const oAvatar = ou.profile_image_url || undefined;
    const nAvatar = nu.profile_image_url || undefined;

    if (oScreen !== nScreen || oName !== nName || oAvatar !== nAvatar) {
      changed.push({ id, from: ou, to: nu });
    }
  }

  for (const [id, ou] of oldMap) {
    if (!newMap.has(id)) removed.push(ou);
  }

  return { added, removed, changed };
}

/**
 * Common table view.
 */
export function TableView({ title, extension }: TableViewProps) {
  const { t } = useTranslation();

  // Infer data type (Tweet or User) from extension type.
  type DataType = InferDataType<typeof extension.type>;

  // Query records from the database.
  const { name, type } = extension;
  const records = useCapturedRecords(name, type);
  const clearCapturedData = useClearCaptures(name);
  const isFollowSnapshotExtension = name === 'FollowersModule' || name === 'FollowingModule';

  // Control modal visibility for exporting media.
  const [showExportMediaModal, toggleShowExportMediaModal] = useToggle();
  const [lastDiff, setLastDiff] = useState<null | {
    prevCreatedAt?: number;
    prevCount?: number;
    currentCount: number;
    added: FollowingSnapshotUser[];
    removed: FollowingSnapshotUser[];
    changed: Array<{ id: string; from: FollowingSnapshotUser; to: FollowingSnapshotUser }>;
  }>(null);
  const [activeDiffTab, setActiveDiffTab] = useState<DiffTab>('added');
  const snapshotKey = `${SNAPSHOT_KEY_PREFIX}${name}:${type}`;

  const saveSnapshot = () => {
    if (type !== ExtensionType.USER || !isFollowSnapshotExtension) return;
    const list = pickSnapshotUsers((records ?? []) as unknown as User[]);
    const snapshot: FollowingSnapshotData = {
      createdAt: Date.now(),
      count: list.length,
      users: list,
    };
    storageSetJSON(snapshotKey, snapshot);
    alert(`Snapshot saved. Users: ${list.length}`);
    setLastDiff(null);
    setActiveDiffTab('added');
  };

  const compareWithLastSnapshot = () => {
    if (type !== ExtensionType.USER || !isFollowSnapshotExtension) return;
    const prev = storageGetJSON<FollowingSnapshotData | null>(snapshotKey, null);
    if (!prev?.users || !Array.isArray(prev.users)) {
      alert('No previous snapshot found. Please save a snapshot first.');
      return;
    }

    const current = pickSnapshotUsers((records ?? []) as unknown as User[]);
    const { added, removed, changed } = diffById(prev.users, current);

    setLastDiff({
      prevCreatedAt: prev.createdAt,
      prevCount: prev.count,
      currentCount: current.length,
      added,
      removed,
      changed,
    });
    setActiveDiffTab('added');
  };

  const columns = (
    type === ExtensionType.TWEET ? columnsTweet : columnsUser
  ) as ColumnDef<DataType>[];

  return (
    <>
      <BaseTableView
        title={title}
        records={records ?? []}
        columns={columns}
        clear={clearCapturedData}
        renderActions={() => (
          <div class="flex gap-2">
            {type === ExtensionType.TWEET ? (
              <button class="btn btn-secondary" onClick={toggleShowExportMediaModal}>
                {t('Export Media')}
              </button>
            ) : null}

            {type === ExtensionType.USER && isFollowSnapshotExtension ? (
              <>
                <button class="btn btn-secondary" onClick={saveSnapshot}>
                  Save Snapshot
                </button>
                <button class="btn btn-secondary" onClick={compareWithLastSnapshot}>
                  Compare Snapshot
                </button>
                {lastDiff ? (
                  <button class="btn" onClick={() => setLastDiff(null)}>
                    Clear Diff
                  </button>
                ) : null}
              </>
            ) : null}
          </div>
        )}
        renderExtra={(table) =>
          type === ExtensionType.TWEET ? (
            <ExportMediaModal
              title={title}
              table={table}
              isTweet={true}
              show={showExportMediaModal}
              onClose={toggleShowExportMediaModal}
            />
          ) : (
            <></>
          )
        }
      />

      {type === ExtensionType.USER && isFollowSnapshotExtension && lastDiff ? (
        <div class="mt-4 rounded-box border border-base-300 p-4">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="font-semibold">Snapshot Diff</div>
            <div class="text-sm opacity-70">
              Current: {lastDiff.currentCount} · Added: {lastDiff.added.length} · Removed:{' '}
              {lastDiff.removed.length} · Changed: {lastDiff.changed.length}
            </div>
          </div>

          <div class="mt-3">
            <div class="tabs tabs-boxed">
              <button
                type="button"
                class={`tab ${activeDiffTab === 'added' ? 'tab-active' : ''}`}
                onClick={() => setActiveDiffTab('added')}
              >
                Added
              </button>
              <button
                type="button"
                class={`tab ${activeDiffTab === 'removed' ? 'tab-active' : ''}`}
                onClick={() => setActiveDiffTab('removed')}
              >
                Removed
              </button>
              <button
                type="button"
                class={`tab ${activeDiffTab === 'changed' ? 'tab-active' : ''}`}
                onClick={() => setActiveDiffTab('changed')}
              >
                Changed
              </button>
            </div>

            {activeDiffTab === 'added' ? (
              <div class="mt-4">
                <div class="font-semibold">Added ({lastDiff.added.length})</div>
                <div class="overflow-x-auto">
                  <table class="table table-sm">
                    <thead>
                      <tr>
                        <th>Avatar</th>
                        <th>UID</th>
                        <th>Username</th>
                        <th>Name</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lastDiff.added.map((u) => (
                        <tr key={`a-${u.id}`}>
                          <td>
                            {u.profile_image_url ? (
                              <img
                                src={u.profile_image_url}
                                alt="avatar"
                                class="h-8 w-8 rounded-full"
                                loading="lazy"
                                referrerPolicy="no-referrer"
                              />
                            ) : (
                              <div class="h-8 w-8 rounded-full bg-base-200" />
                            )}
                          </td>
                          <td class="font-mono text-xs">{u.id}</td>
                          <td class="font-mono text-xs">
                            {u.screen_name ? `@${u.screen_name}` : ''}
                          </td>
                          <td>{u.name ?? ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            {activeDiffTab === 'removed' ? (
              <div class="mt-4">
                <div class="font-semibold">Removed ({lastDiff.removed.length})</div>
                <div class="overflow-x-auto">
                  <table class="table table-sm">
                    <thead>
                      <tr>
                        <th>Avatar</th>
                        <th>UID</th>
                        <th>Username</th>
                        <th>Name</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lastDiff.removed.map((u) => (
                        <tr key={`r-${u.id}`}>
                          <td>
                            {u.profile_image_url ? (
                              <img
                                src={u.profile_image_url}
                                alt="avatar"
                                class="h-8 w-8 rounded-full"
                                loading="lazy"
                                referrerPolicy="no-referrer"
                              />
                            ) : (
                              <div class="h-8 w-8 rounded-full bg-base-200" />
                            )}
                          </td>
                          <td class="font-mono text-xs">{u.id}</td>
                          <td class="font-mono text-xs">
                            {u.screen_name ? `@${u.screen_name}` : ''}
                          </td>
                          <td>{u.name ?? ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            {activeDiffTab === 'changed' ? (
              <div class="mt-4">
                <div class="font-semibold">Changed ({lastDiff.changed.length})</div>
                <div class="overflow-x-auto">
                  <table class="table table-sm">
                    <thead>
                      <tr>
                        <th>UID</th>
                        <th>Username</th>
                        <th>Name</th>
                        <th>Avatar</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lastDiff.changed.map((c) => (
                        <tr key={`c-${c.id}`}>
                          <td class="font-mono text-xs">{c.id}</td>
                          <td class="text-xs">
                            <div class="font-mono">
                              {c.from.screen_name ? `@${c.from.screen_name}` : ''}
                            </div>
                            <div class="opacity-70 font-mono">
                              → {c.to.screen_name ? `@${c.to.screen_name}` : ''}
                            </div>
                          </td>
                          <td class="text-xs">
                            <div>{c.from.name ?? ''}</div>
                            <div class="opacity-70">→ {c.to.name ?? ''}</div>
                          </td>
                          <td>
                            <div class="flex items-center gap-2">
                              {c.from.profile_image_url ? (
                                <img
                                  src={c.from.profile_image_url}
                                  alt="from"
                                  class="h-8 w-8 rounded-full"
                                  loading="lazy"
                                  referrerPolicy="no-referrer"
                                />
                              ) : (
                                <div class="h-8 w-8 rounded-full bg-base-200" />
                              )}
                              <div class="opacity-70">→</div>
                              {c.to.profile_image_url ? (
                                <img
                                  src={c.to.profile_image_url}
                                  alt="to"
                                  class="h-8 w-8 rounded-full"
                                  loading="lazy"
                                  referrerPolicy="no-referrer"
                                />
                              ) : (
                                <div class="h-8 w-8 rounded-full bg-base-200" />
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
