// Test stub — Firestore surface used by src/backend.js.
// Every read rejects, which is exactly how the app detects "Firestore not
// reachable" and falls back to local mode. That's the path we want to test.
const fail = async () => {
  throw new Error("STUB_OFFLINE");
};

export const getFirestore = () => ({ type: "stub" });
export const doc = (...a) => ({ path: a.slice(1).join("/") });
export const collection = (...a) => ({ path: a.slice(1).join("/") });
export const getDoc = fail;
export const getDocs = fail;
export const setDoc = fail;
export const addDoc = fail;
export const updateDoc = fail;
export const deleteDoc = fail;
export const onSnapshot = () => () => {};
export const query = (...a) => a[0];
export const orderBy = () => ({});
export const where = () => ({});
export const limit = () => ({});
export const runTransaction = fail;
export const serverTimestamp = () => Date.now();
