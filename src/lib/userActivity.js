import { supabase } from "./supabase";

// Records that an account is alive, and that it once installed the app.
//
// Two columns on the users row, users.last_seen_at and users.installed_at,
// both written from here and neither ever read from here. That asymmetry is
// deliberate and is the reason this file looks the way it does.
//
// THE BROWSER CANNOT READ WHAT IT WRITES. 20260612000001_users_select_lockdown
// narrowed the SELECT grant on users to a fixed column list, and neither of
// these two columns is on it. The database will take the write and refuse the
// read, whatever the caller's role. So nothing here can check the current
// value before writing, or confirm afterwards what the column now holds. Every
// "have we already done this" question is answered by localStorage instead,
// which is per device and per browser and is the only memory this code has.
//
// EVERY GUARD IS THEREFORE A LOCAL GUESS, NOT A FACT. A user with a phone and
// a laptop has two independent guards. Clearing site data resets them. That is
// accepted: the cost of a guess being wrong is one extra UPDATE of a timestamp
// column, which is why these two columns were chosen for this treatment in the
// first place.
//
// WHAT THE RLS POLICY ALLOWS. users_self_update_safe_fields lets a signed-in
// user update their own row as long as role, is_disabled and status come out
// unchanged. Both patches below set exactly one timestamp column and touch
// nothing else, so both pass. If that ever stops being true the write returns
// zero rows rather than an error, which is why the write checks the returned
// row count and not just the error.
//
// NOTHING HERE MAY BLOCK OR BREAK STARTUP. This runs while a farmer is waiting
// to see a price. Every function returns a boolean instead of throwing, every
// failure warns and continues, and the caller is expected never to await it.

const LAST_SEEN_KEY = "urimalu.lastSeenWrite";
const INSTALLED_KEY_PREFIX = "urimalu.installedWrite.";
const LOG = "[activity]";

// The local calendar date as YYYY-MM-DD.
//
// Local, not UTC, and not toISOString().slice(0, 10). India is UTC+5:30, so a
// UTC date rolls over at 5:30am local time. A merchant opening the app at 6am
// and again at 9pm would count as two days on a UTC key and as one here, and
// one is the honest answer to "did this account show up today".
function localDateKey(now = new Date()) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// localStorage access that cannot throw. Private browsing, a blocked storage
// setting and a full quota all raise here, and none of them is a reason to
// interrupt the app. A failed read reports "no guard stored", so the worst case
// is that the write below runs again, which is harmless.
function readStorage(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore. The guard simply will not persist on this device, so the write
    // repeats on the next app start rather than once per day.
  }
}

// One timestamp column on one row, with the outcome reported honestly.
//
// select("id") is not decoration. An RLS refusal on an UPDATE is not an error:
// PostgREST returns success with zero rows affected. Without the returned row
// this code could not tell a real write from a silent refusal, and would then
// store a guard saying "done" for something that never happened. id is inside
// the users column grant, so asking for it back is allowed where asking for the
// timestamp itself would not be.
async function stampColumn(userId, patch, label) {
  if (!supabase) {
    console.warn(`${LOG} skipped ${label}: the database client is not configured`);
    return false;
  }

  const { data, error } = await supabase
    .from("users")
    .update(patch)
    .eq("id", userId)
    .select("id");

  if (error) {
    console.warn(`${LOG} could not record ${label}:`, error.message || error);
    return false;
  }
  if (!data || data.length === 0) {
    console.warn(`${LOG} the ${label} write was refused, no row was updated`);
    return false;
  }
  return true;
}

// Stamp last_seen_at, at most once per calendar day per device.
//
// The guard holds the user id and the local date together in one value, so two
// people sharing one phone each get their own write on the day they use it: the
// second sign-in reads a guard carrying the first person's id, does not match,
// and writes. A boolean guard would have hidden the second person entirely.
//
// The guard is stored only after a confirmed write, so a failure today is
// retried on the next app start rather than being marked done.
export async function recordLastSeen(userId) {
  if (!userId) return false;

  const guard = `${userId}|${localDateKey()}`;
  if (readStorage(LAST_SEEN_KEY) === guard) return false;

  const written = await stampColumn(
    userId,
    { last_seen_at: new Date().toISOString() },
    "last_seen_at",
  );
  if (written) writeStorage(LAST_SEEN_KEY, guard);
  return written;
}

// Stamp installed_at once per user per device.
//
// THE CALLER DECIDES WHETHER THE APP IS INSTALLED, NOT THIS FILE.
// InstallPromptProvider already owns that question: it holds the single
// appinstalled listener in the app, watches the standalone display mode, and
// persists a confirmed install across reloads. A second listener here would be
// a second answer to a question that already has one, and the two would drift.
//
// The key is suffixed with the user id rather than holding it as a value,
// because unlike the daily stamp above this one is never meant to repeat. Two
// accounts on one installed device must each be recorded once and then never
// again, and separate keys give each of them a guard the other cannot spend.
//
// A user who installs on a second device overwrites the timestamp with the
// later date, because this code cannot read the column to find out it was
// already set. The count that matters downstream is how many accounts have a
// non-null value here, and that count is unaffected.
export async function recordInstalled(userId) {
  if (!userId) return false;

  const key = `${INSTALLED_KEY_PREFIX}${userId}`;
  if (readStorage(key) === "true") return false;

  const written = await stampColumn(
    userId,
    { installed_at: new Date().toISOString() },
    "installed_at",
  );
  if (written) writeStorage(key, "true");
  return written;
}

// The single entry point the app calls, and the one that cannot reject.
//
// The two writes run in sequence rather than together on purpose: they are two
// separate UPDATEs on the same row, and firing them at once would have them
// race for the same row lock for no gain on a path nobody is waiting for.
//
// This swallows everything. recordLastSeen and recordInstalled already catch
// their own failures, so a rejection reaching here means something unforeseen,
// and the answer to that is still a console warning and a return.
export async function recordUserActivity(userId, { isInstalled = false } = {}) {
  if (!userId) return;

  try {
    await recordLastSeen(userId);
    if (isInstalled) await recordInstalled(userId);
  } catch (err) {
    console.warn(`${LOG} the activity write failed unexpectedly:`, err);
  }
}
