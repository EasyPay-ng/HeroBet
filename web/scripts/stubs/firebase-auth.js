// Test stub — Firebase Auth surface used by src/backend.js.
export const getAuth = () => ({ currentUser: null });
export const onAuthStateChanged = () => () => {};
export const signInAnonymously = async () => ({ user: { uid: "stub", isAnonymous: true } });
export const signInWithEmailAndPassword = async () => ({ user: { uid: "stub" } });
export const createUserWithEmailAndPassword = async () => ({ user: { uid: "stub" } });
export const signOut = async () => {};
export const updateProfile = async () => {};
