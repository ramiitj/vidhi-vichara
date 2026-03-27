import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

import config from '../firebase-applet-config.json';

const { firestoreDatabaseId, ...firebaseConfig } = (config as any).default || config;

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app, firestoreDatabaseId);
export const storage = getStorage(app);

