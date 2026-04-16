let userStoriesCsvText = "";
let snapshotCsvText = "";
let loadPromise: Promise<void> | null = null;

export function getUserStoriesCsvText() {
  return userStoriesCsvText;
}

export function getSnapshotCsvText() {
  return snapshotCsvText;
}

export function loadRemoteCSVs(): Promise<void> {
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    // El usuario pidió estas URLs (con cache-buster por timestamp).
    const userStoriesUrl =
      "https://raw.githubusercontent.com/alisonfernandau-source/azure-insights-data-/main/src/data/user_stories.csv?t=" +
      new Date().getTime();
    const snapshotUrl =
      "https://raw.githubusercontent.com/alisonfernandau-source/azure-insights-data-/main/src/data/feature_snapshot_history.csv?t=" +
      new Date().getTime();

    const [userStoriesRes, snapshotRes] = await Promise.all([
      fetch(userStoriesUrl.trim(), { cache: "no-store" }),
      fetch(snapshotUrl.trim(), { cache: "no-store" }),
    ]);

    if (!userStoriesRes.ok) {
      throw new Error(`No se pudo cargar user_stories.csv (${userStoriesRes.status})`);
    }
    if (!snapshotRes.ok) {
      throw new Error(`No se pudo cargar feature_snapshot_history.csv (${snapshotRes.status})`);
    }

    userStoriesCsvText = await userStoriesRes.text();
    snapshotCsvText = await snapshotRes.text();
  })();

  return loadPromise;
}

