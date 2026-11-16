import { initializeApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  getAuth,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  getFirestore,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import type { AppPersistentState, EncryptedMoodJournalEntry } from '../types/lifeworld';
import {
  decryptPayloadAes256,
  encryptPayloadAes256,
  type EncryptedEnvelope,
} from './cryptoVault';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
auth.languageCode = 'vi';

export type AuthProviderKind = 'google' | 'email' | 'phone';

export interface UnifiedAuthUser {
  uid: string;
  displayName: string;
  provider: AuthProviderKind;
  email: string | null;
  phoneNumber: string | null;
  photoUrl: string | null;
}

export type DatabaseConnectionState = 'checking' | 'connected' | 'offline' | 'error';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function testFirestoreConnectionOnce(): Promise<DatabaseConnectionState> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return 'connected';
  } catch (error) {
    const msg = error instanceof Error ? error.message.toLowerCase() : '';
    if (msg.includes('the client is offline') || msg.includes('unavailable')) {
      return 'offline';
    }
    if (msg.includes('permission') || msg.includes('missing or insufficient permissions')) {
      return 'connected';
    }
    return 'error';
  }
}

export function mapFirebaseUserToUnified(user: User): UnifiedAuthUser {
  const providerId = user.providerData?.[0]?.providerId;
  const provider: AuthProviderKind =
    providerId === 'password' ? 'email' : providerId === 'phone' ? 'phone' : 'google';
  const fallbackName = user.email?.split('@')[0] || 'Thành viên AI Life World';
  return {
    uid: user.uid,
    displayName: (user.displayName || fallbackName).slice(0, 120),
    provider,
    email: user.email || null,
    phoneNumber: user.phoneNumber || null,
    photoUrl: user.photoURL || null,
  };
}

export async function signInWithGooglePopup(): Promise<UnifiedAuthUser> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const cred = await signInWithPopup(auth, provider);
  return mapFirebaseUserToUnified(cred.user);
}

export async function signInWithEmailPassword(
  email: string,
  password: string
): Promise<UnifiedAuthUser> {
  const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
  return mapFirebaseUserToUnified(cred.user);
}

export async function registerWithEmailPassword(
  email: string,
  password: string,
  displayName: string
): Promise<UnifiedAuthUser> {
  const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
  if (displayName.trim()) {
    await updateProfile(cred.user, { displayName: displayName.trim().slice(0, 120) });
  }
  return mapFirebaseUserToUnified(cred.user);
}

export async function signOutFirebaseSession(): Promise<void> {
  await signOut(auth);
}

function toSafeFirestoreDocId(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 120);
  return cleaned || `doc-${Date.now()}`;
}

export async function syncFirebaseUserProfile(user: UnifiedAuthUser): Promise<void> {
  if (!auth.currentUser) return;
  const uid = auth.currentUser.uid;
  const publicPath = `users/${uid}`;
  const publicRef = doc(db, 'users', uid);

  try {
    const snap = await getDoc(publicRef);
    const displayName = (user.displayName || 'Thành viên AI Life World').slice(0, 120);
    const photoUrl =
      user.photoUrl && user.photoUrl.trim().length > 0 && user.photoUrl.length <= 512
        ? user.photoUrl.trim()
        : undefined;

    if (!snap.exists()) {
      const payload: Record<string, unknown> = {
        uid,
        displayName,
        provider: user.provider,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (photoUrl) payload.photoUrl = photoUrl;
      await setDoc(publicRef, payload);
    } else {
      const payload: Record<string, unknown> = {
        displayName,
        provider: user.provider,
        updatedAt: serverTimestamp(),
      };
      if (photoUrl) payload.photoUrl = photoUrl;
      await updateDoc(publicRef, payload);
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, publicPath);
  }

  const privatePath = `users/${uid}/private/contact`;
  const privateRef = doc(db, 'users', uid, 'private', 'contact');
  try {
    const snap = await getDoc(privateRef);
    const email = user.email ? user.email.trim().slice(0, 200) : undefined;
    const phoneNumber = user.phoneNumber ? user.phoneNumber.trim().slice(0, 32) : undefined;
    if (!snap.exists()) {
      const payload: Record<string, unknown> = { uid, updatedAt: serverTimestamp() };
      if (email) payload.email = email;
      if (phoneNumber) payload.phoneNumber = phoneNumber;
      await setDoc(privateRef, payload);
    } else {
      const payload: Record<string, unknown> = { updatedAt: serverTimestamp() };
      if (email) payload.email = email;
      if (phoneNumber) payload.phoneNumber = phoneNumber;
      await updateDoc(privateRef, payload);
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, privatePath);
  }
}

export async function pushWellnessSyncToCloud(state: AppPersistentState, level: number): Promise<void> {
  if (!auth.currentUser) return;
  const uid = auth.currentUser.uid;
  const docId = 'current';
  const docPath = `users/${uid}/wellnessSync/${docId}`;
  const ref = doc(db, 'users', uid, 'wellnessSync', docId);

  try {
    const envelope = await encryptPayloadAes256({
      ...state,
      moodJournals: [],
      auditLog: state.auditLog.slice(0, 15),
    });

    const snap = await getDoc(ref);
    const base = {
      id: docId,
      ownerId: uid,
      schemaVersion: state.schemaVersion,
      xp: Math.max(0, state.game.xp),
      level: Math.max(1, level),
      streakDays: Math.max(0, state.streakDays),
      encryptedCiphertextHex: envelope.ciphertextBase64.slice(0, 240000),
      encryptedIvHex: envelope.ivHex.slice(0, 64),
      encryptedAlgorithm: envelope.algorithm.slice(0, 64),
      keyFingerprint: envelope.keyFingerprint.slice(0, 64),
      encryptedAt: envelope.encryptedAt.slice(0, 64),
      updatedAt: serverTimestamp(),
    };

    if (!snap.exists()) {
      await setDoc(ref, { ...base, createdAt: serverTimestamp() });
    } else {
      await updateDoc(ref, {
        schemaVersion: base.schemaVersion,
        xp: base.xp,
        level: base.level,
        streakDays: base.streakDays,
        encryptedCiphertextHex: base.encryptedCiphertextHex,
        encryptedIvHex: base.encryptedIvHex,
        encryptedAlgorithm: base.encryptedAlgorithm,
        keyFingerprint: base.keyFingerprint,
        encryptedAt: base.encryptedAt,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, docPath);
  }
}

export async function pullWellnessSyncFromCloud(): Promise<Partial<AppPersistentState> | null> {
  if (!auth.currentUser) return null;
  const uid = auth.currentUser.uid;
  const docPath = `users/${uid}/wellnessSync/current`;
  try {
    const snap = await getDoc(doc(db, 'users', uid, 'wellnessSync', 'current'));
    if (!snap.exists()) return null;
    const data = snap.data();
    if (!data.encryptedCiphertextHex || !data.encryptedIvHex) return null;
    const envelope: EncryptedEnvelope = {
      algorithm:
        data.encryptedAlgorithm === 'XOR-OBFUSCATED-FALLBACK'
          ? 'XOR-OBFUSCATED-FALLBACK'
          : 'AES-GCM-256',
      ivHex: String(data.encryptedIvHex),
      ciphertextBase64: String(data.encryptedCiphertextHex),
      encryptedAt: String(data.encryptedAt || new Date().toISOString()),
      keyFingerprint: String(data.keyFingerprint || 'CLOUD'),
    };
    return await decryptPayloadAes256<AppPersistentState>(envelope);
  } catch (err) {
    // Graceful decryption mismatch if user opened on another device key without throwing fatal crash
    if (err instanceof Error && err.message.includes('OperationError')) {
      return null;
    }
    handleFirestoreError(err, OperationType.GET, docPath);
  }
}

export async function pushEncryptedJournalToCloud(entry: EncryptedMoodJournalEntry): Promise<void> {
  if (!auth.currentUser || !entry.encryptedEnvelope) return;
  const uid = auth.currentUser.uid;
  const entryId = toSafeFirestoreDocId(entry.id);
  const docPath = `users/${uid}/encryptedJournals/${entryId}`;
  const ref = doc(db, 'users', uid, 'encryptedJournals', entryId);

  try {
    const snap = await getDoc(ref);
    const base = {
      id: entryId,
      ownerId: uid,
      moodScore: entry.moodScore,
      moodLabel: entry.moodLabel.slice(0, 64),
      encryptedCiphertextHex: entry.encryptedEnvelope.ciphertextBase64.slice(0, 60000),
      encryptedIvHex: entry.encryptedEnvelope.ivHex.slice(0, 64),
      encryptedAlgorithm: entry.encryptedEnvelope.algorithm.slice(0, 64),
      keyFingerprint: entry.encryptedEnvelope.keyFingerprint.slice(0, 64),
      encryptedAt: entry.encryptedEnvelope.encryptedAt.slice(0, 64),
      clientCreatedAt: entry.createdAt.slice(0, 64),
      updatedAt: serverTimestamp(),
    };
    if (!snap.exists()) {
      await setDoc(ref, { ...base, createdAt: serverTimestamp() });
    } else {
      await updateDoc(ref, base);
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, docPath);
  }
}

export async function listEncryptedJournalsFromCloud(): Promise<EncryptedMoodJournalEntry[]> {
  if (!auth.currentUser) return [];
  const uid = auth.currentUser.uid;
  const colPath = `users/${uid}/encryptedJournals`;
  try {
    const q = query(collection(db, 'users', uid, 'encryptedJournals'), where('ownerId', '==', uid));
    const snap = await getDocs(q);
    const list: EncryptedMoodJournalEntry[] = [];
    for (const d of snap.docs) {
      const data = d.data();
      const envelope: EncryptedEnvelope = {
        algorithm:
          data.encryptedAlgorithm === 'XOR-OBFUSCATED-FALLBACK'
            ? 'XOR-OBFUSCATED-FALLBACK'
            : 'AES-GCM-256',
        ivHex: String(data.encryptedIvHex || ''),
        ciphertextBase64: String(data.encryptedCiphertextHex || ''),
        encryptedAt: String(data.encryptedAt || ''),
        keyFingerprint: String(data.keyFingerprint || ''),
      };
      let note = 'Nhật ký đã mã hóa trên thiết bị khác (không cùng khóa giải mã).';
      let tags: string[] = [];
      try {
        const decoded = await decryptPayloadAes256<{ note: string; tags?: string[] }>(envelope);
        note = decoded.note;
        tags = decoded.tags || [];
      } catch {
        // different device key
      }
      list.push({
        id: String(data.id || d.id),
        createdAt: String(data.clientCreatedAt || new Date().toISOString()),
        moodScore: (Number(data.moodScore) as 1 | 2 | 3 | 4 | 5) || 3,
        moodLabel: String(data.moodLabel || 'Cân bằng'),
        tags,
        note,
        encryptedEnvelope: envelope,
      });
    }
    return list;
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, colPath);
  }
}

export async function deleteCloudUserData(): Promise<void> {
  if (!auth.currentUser) return;
  const uid = auth.currentUser.uid;
  try {
    await deleteDoc(doc(db, 'users', uid, 'wellnessSync', 'current'));
    const q = query(collection(db, 'users', uid, 'encryptedJournals'), where('ownerId', '==', uid));
    const snap = await getDocs(q);
    for (const d of snap.docs) {
      await deleteDoc(d.ref);
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `users/${uid}`);
  }
}

export { firebaseConfig };
