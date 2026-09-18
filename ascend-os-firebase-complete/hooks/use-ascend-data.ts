import { useCallback, useEffect, useMemo, useState } from "react";
import {
  GoogleAuthProvider,
  linkWithPopup,
  onAuthStateChanged,
  signInAnonymously,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  writeBatch,
} from "firebase/firestore";
import { firebaseAuth, firebaseConfigured, firestore } from "@/lib/firebase";

export type Routine = {
  id: string;
  time: string;
  title: string;
  meta: string;
  done: boolean;
  completedOn?: string | null;
  days?: number[];
};

export type Expense = {
  id: string;
  description: string;
  amount: number;
  createdAt: number;
  category?: ExpenseCategory;
};

export type ExpenseCategory = "Food" | "Transport" | "Bills" | "Shopping" | "Health" | "Fun" | "Other";

export type Lift = {
  id: string;
  exercise: string;
  weight: number;
  reps: number;
  createdAt: number;
};

export type BodyLog = {
  id: string;
  weight: number;
  bodyFat?: number;
  waist?: number;
  createdAt: number;
};

export type HabitKey = "training" | "deepWork" | "noSpend";
export type Habit = { streak: number; completedToday: boolean; lastCompletedDate?: string | null };

export type Wellness = {
  trackedOn: string;
  allowance: number;
  protein: number;
  proteinGoal: number;
  water: number;
  waterGoal: number;
  note: string;
  skinMorning: boolean;
  skinNight: boolean;
  notificationsEnabled: boolean;
  notificationSound: boolean;
  pushToken?: string;
  theme?: "dark" | "light";
  monthlyBudget: number;
  savingsGoal: number;
  habits: Record<HabitKey, Habit>;
};

type StoredData = {
  routines: Routine[];
  expenses: Expense[];
  lifts: Lift[];
  bodyLogs: BodyLog[];
  wellness: Wellness;
};

const STORAGE_KEY = "ascend-os:data:v3";

const dateKey = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const today = dateKey();
const normalizeRoutine = (routine: Routine): Routine => ({
  ...routine,
  days: routine.days?.length ? routine.days : [0, 1, 2, 3, 4, 5, 6],
  done: routine.completedOn ? routine.completedOn === today : routine.done,
});

const normalizeWellness = (value: Wellness): Wellness => ({
  ...value,
  ...(value.trackedOn && value.trackedOn !== today ? {
    trackedOn: today,
    protein: 0,
    water: 0,
    note: "",
    skinMorning: false,
    skinNight: false,
  } : { trackedOn: today }),
  habits: Object.fromEntries(
    Object.entries(value.habits).map(([key, habit]) => [key, {
      ...habit,
      completedToday: habit.lastCompletedDate ? habit.lastCompletedDate === today : habit.completedToday,
    }]),
  ) as Wellness["habits"],
});

export const initialRoutines: Routine[] = [
  { id: "morning", time: "06:30", title: "Morning activation", meta: "Hydrate · sunlight · mobility", done: true, completedOn: today, days: [0, 1, 2, 3, 4, 5, 6] },
  { id: "deep-work", time: "07:15", title: "Deep work block", meta: "90 minutes · priority one", done: true, completedOn: today, days: [1, 2, 3, 4, 5] },
  { id: "fuel", time: "12:30", title: "Fuel & reset", meta: "Protein lunch · 10 min walk", done: false, completedOn: null, days: [0, 1, 2, 3, 4, 5, 6] },
  { id: "training", time: "17:45", title: "Upper body strength", meta: "Push focus · progressive overload", done: false, completedOn: null, days: [1, 2, 4, 5, 6] },
  { id: "shutdown", time: "21:30", title: "Night shutdown", meta: "Skincare · reflect · prepare", done: false, completedOn: null, days: [0, 1, 2, 3, 4, 5, 6] },
];

export const initialWellness: Wellness = {
  trackedOn: today,
  allowance: 127,
  protein: 118,
  proteinGoal: 160,
  water: 6,
  waterGoal: 8,
  note: "",
  skinMorning: true,
  skinNight: false,
  notificationsEnabled: false,
  notificationSound: true,
  theme: "dark",
  monthlyBudget: 1800,
  savingsGoal: 600,
  habits: {
    training: { streak: 18, completedToday: false, lastCompletedDate: null },
    deepWork: { streak: 12, completedToday: true, lastCompletedDate: today },
    noSpend: { streak: 6, completedToday: false, lastCompletedDate: null },
  },
};

const defaultData: StoredData = {
  routines: initialRoutines,
  expenses: [],
  lifts: [],
  bodyLogs: [],
  wellness: initialWellness,
};

function readLocal(): StoredData {
  if (typeof window === "undefined") return defaultData;
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null") as Partial<StoredData> | null;
    if (!parsed) return defaultData;
    return {
      routines: (parsed.routines?.length ? parsed.routines : initialRoutines).map(normalizeRoutine),
      expenses: parsed.expenses || [],
      lifts: parsed.lifts || [],
      bodyLogs: parsed.bodyLogs || [],
      wellness: normalizeWellness({ ...initialWellness, ...parsed.wellness, habits: { ...initialWellness.habits, ...parsed.wellness?.habits } }),
    };
  } catch {
    return defaultData;
  }
}

const makeId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

export function useAscendData() {
  const local = useMemo(readLocal, []);
  const [routines, setRoutines] = useState(local.routines);
  const [expenses, setExpenses] = useState(local.expenses);
  const [lifts, setLifts] = useState(local.lifts);
  const [bodyLogs, setBodyLogs] = useState(local.bodyLogs);
  const [wellness, setWellness] = useState(local.wellness);
  const [user, setUser] = useState<User | null>(null);
  const [mode, setMode] = useState<"local" | "syncing" | "cloud">(firebaseConfigured ? "syncing" : "local");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!firebaseAuth) return;
    const auth = firebaseAuth;
    const unsubscribe = onAuthStateChanged(auth, async (nextUser) => {
      if (nextUser) {
        setUser(nextUser);
        return;
      }
      try {
        await signInAnonymously(auth);
      } catch (cause) {
        setMode("local");
        setError(cause instanceof Error ? cause.message : "Firebase sign-in failed. Using this device only.");
      }
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!user || !firestore) return;
    const db = firestore;
    let cancelled = false;
    const unsubscribers: Array<() => void> = [];

    const connect = async () => {
      setMode("syncing");
      const root = doc(db, "users", user.uid);
      const routinesRef = collection(root, "routines");
      const routineSnapshot = await getDocs(routinesRef);
      if (routineSnapshot.empty) {
        const batch = writeBatch(db);
        (routines.length ? routines : initialRoutines).forEach((routine) => batch.set(doc(routinesRef, routine.id), routine));
        await batch.commit();
      } else {
        const legacy = routineSnapshot.docs.filter((item) => item.data().completedOn === undefined);
        if (legacy.length) {
          const batch = writeBatch(db);
          legacy.forEach((item) => batch.set(item.ref, { completedOn: item.data().done ? today : null }, { merge: true }));
          await batch.commit();
        }
      }

      const expensesRef = collection(root, "expenses");
      if ((await getDocs(expensesRef)).empty && expenses.length) {
        const batch = writeBatch(db);
        expenses.forEach((item) => batch.set(doc(expensesRef, item.id), item));
        await batch.commit();
      }

      const liftsRef = collection(root, "lifts");
      if ((await getDocs(liftsRef)).empty && lifts.length) {
        const batch = writeBatch(db);
        lifts.forEach((item) => batch.set(doc(liftsRef, item.id), item));
        await batch.commit();
      }

      const bodyRef = collection(root, "bodyLogs");
      if ((await getDocs(bodyRef)).empty && bodyLogs.length) {
        const batch = writeBatch(db);
        bodyLogs.forEach((item) => batch.set(doc(bodyRef, item.id), item));
        await batch.commit();
      }

      const settingsRef = doc(root, "settings", "dashboard");
      const settingsSnapshot = await getDoc(settingsRef);
      if (!settingsSnapshot.exists()) await setDoc(settingsRef, wellness);
      else if (settingsSnapshot.data().trackedOn !== today) {
        await setDoc(settingsRef, normalizeWellness({ ...wellness, ...settingsSnapshot.data() } as Wellness), { merge: true });
      }

      if (cancelled) return;
      unsubscribers.push(
        onSnapshot(query(routinesRef, orderBy("time")), (snapshot) => {
          setRoutines(snapshot.docs.map((item) => normalizeRoutine({ id: item.id, ...item.data() } as Routine)));
          setMode("cloud");
        }),
        onSnapshot(query(expensesRef, orderBy("createdAt", "desc")), (snapshot) => {
          setExpenses(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })) as Expense[]);
        }),
        onSnapshot(query(liftsRef, orderBy("createdAt", "desc")), (snapshot) => {
          setLifts(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })) as Lift[]);
        }),
        onSnapshot(query(bodyRef, orderBy("createdAt", "desc")), (snapshot) => {
          setBodyLogs(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })) as BodyLog[]);
        }),
        onSnapshot(settingsRef, (snapshot) => {
          if (snapshot.exists()) {
            const next = snapshot.data() as Partial<Wellness>;
            setWellness((current) => normalizeWellness({ ...current, ...next, habits: { ...current.habits, ...next.habits } }));
          }
        }),
      );
    };

    connect().catch((cause) => {
      setMode("local");
      setError(cause instanceof Error ? cause.message : "Cloud sync failed. Changes remain available on this device.");
    });
    return () => {
      cancelled = true;
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [user]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ routines, expenses, lifts, bodyLogs, wellness }));
  }, [bodyLogs, expenses, lifts, mode, routines, wellness]);

  const rootRef = useCallback(() => (user && firestore ? doc(firestore, "users", user.uid) : null), [user]);

  const createRoutine = async (input: Omit<Routine, "id" | "done">) => {
    const item = { ...input, id: makeId(), done: false, completedOn: null };
    const root = rootRef();
    if (root && mode !== "local") await setDoc(doc(root, "routines", item.id), item);
    else setRoutines((current) => [...current, item].sort((a, b) => a.time.localeCompare(b.time)));
  };

  const updateRoutine = async (id: string, changes: Partial<Omit<Routine, "id">>) => {
    const normalizedChanges = changes.done === undefined ? changes : { ...changes, completedOn: changes.done ? dateKey() : null };
    const root = rootRef();
    if (root && mode !== "local") await setDoc(doc(root, "routines", id), normalizedChanges, { merge: true });
    else setRoutines((current) => current.map((item) => (item.id === id ? { ...item, ...normalizedChanges } : item)).sort((a, b) => a.time.localeCompare(b.time)));
  };

  const deleteRoutine = async (id: string) => {
    const root = rootRef();
    if (root && mode !== "local") await deleteDoc(doc(root, "routines", id));
    else setRoutines((current) => current.filter((item) => item.id !== id));
  };

  const addExpense = async (description: string, amount: number, category: ExpenseCategory = "Other") => {
    const item: Expense = { id: makeId(), description, amount, category, createdAt: Date.now() };
    const root = rootRef();
    if (root && mode !== "local") await setDoc(doc(root, "expenses", item.id), item);
    else setExpenses((current) => [item, ...current]);
  };

  const deleteExpense = async (id: string) => {
    const root = rootRef();
    if (root && mode !== "local") await deleteDoc(doc(root, "expenses", id));
    else setExpenses((current) => current.filter((item) => item.id !== id));
  };

  const addLift = async (exercise: string, weight: number, reps: number) => {
    const item: Lift = { id: makeId(), exercise, weight, reps, createdAt: Date.now() };
    const root = rootRef();
    if (root && mode !== "local") await setDoc(doc(root, "lifts", item.id), item);
    else setLifts((current) => [item, ...current]);
  };

  const deleteLift = async (id: string) => {
    const root = rootRef();
    if (root && mode !== "local") await deleteDoc(doc(root, "lifts", id));
    else setLifts((current) => current.filter((item) => item.id !== id));
  };

  const addBodyLog = async (weight: number, bodyFat?: number, waist?: number) => {
    const item: BodyLog = { id: makeId(), weight, bodyFat, waist, createdAt: Date.now() };
    const root = rootRef();
    if (root && mode !== "local") await setDoc(doc(root, "bodyLogs", item.id), item);
    else setBodyLogs((current) => [item, ...current]);
  };

  const deleteBodyLog = async (id: string) => {
    const root = rootRef();
    if (root && mode !== "local") await deleteDoc(doc(root, "bodyLogs", id));
    else setBodyLogs((current) => current.filter((item) => item.id !== id));
  };

  const updateWellness = async (changes: Partial<Wellness>) => {
    const datedChanges = { ...changes, trackedOn: dateKey() };
    setWellness((current) => ({ ...current, ...datedChanges }));
    const root = rootRef();
    if (root && mode !== "local") await setDoc(doc(root, "settings", "dashboard"), datedChanges, { merge: true });
  };

  const toggleHabit = async (key: HabitKey) => {
    const current = wellness.habits[key];
    const currentDate = dateKey();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const wasCompletedToday = current.lastCompletedDate ? current.lastCompletedDate === currentDate : current.completedToday;
    const nextStreak = wasCompletedToday
      ? Math.max(0, current.streak - 1)
      : current.lastCompletedDate === dateKey(yesterday)
        ? current.streak + 1
        : 1;
    const updated = {
      ...wellness.habits,
      [key]: {
        completedToday: !wasCompletedToday,
        lastCompletedDate: wasCompletedToday ? null : currentDate,
        streak: nextStreak,
      },
    };
    setWellness((value) => ({ ...value, trackedOn: currentDate, habits: updated }));
    const root = rootRef();
    if (root && mode !== "local") await setDoc(doc(root, "settings", "dashboard"), { habits: updated, trackedOn: currentDate }, { merge: true });
  };

  const connectGoogle = async () => {
    if (!firebaseAuth) throw new Error("Add the Firebase environment variables first.");
    const provider = new GoogleAuthProvider();
    if (firebaseAuth.currentUser?.isAnonymous) {
      try {
        await linkWithPopup(firebaseAuth.currentUser, provider);
        return;
      } catch (cause) {
        const code = typeof cause === "object" && cause && "code" in cause ? String(cause.code) : "";
        if (!code.includes("credential-already-in-use") && !code.includes("email-already-in-use")) throw cause;
      }
    }
    await signInWithPopup(firebaseAuth, provider);
  };

  const disconnect = async () => {
    if (firebaseAuth) await signOut(firebaseAuth);
  };

  return {
    routines,
    expenses,
    lifts,
    bodyLogs,
    wellness,
    user,
    mode,
    error,
    createRoutine,
    updateRoutine,
    deleteRoutine,
    addExpense,
    deleteExpense,
    addLift,
    deleteLift,
    addBodyLog,
    deleteBodyLog,
    updateWellness,
    toggleHabit,
    connectGoogle,
    disconnect,
  };
}
