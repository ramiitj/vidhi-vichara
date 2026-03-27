import React, { useState, useEffect, useRef } from 'react';
import { auth, db } from './firebase';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, User } from 'firebase/auth';
import { collection, query, where, orderBy, onSnapshot, addDoc, serverTimestamp, doc, updateDoc, getDoc, getDocs, deleteDoc } from 'firebase/firestore';
import { Scale, MessageSquare, FileText, Upload, Send, LogOut, Menu, X, ChevronRight, AlertTriangle, AlertCircle, CheckCircle, Settings, Mic, MicOff, Download, Network, Clock, Info, Languages, Volume2, Trash2, Search, Filter, CheckSquare, ThumbsUp, ThumbsDown, MessageSquarePlus, Plus, Calendar, Share2 } from 'lucide-react';
import { AnalysisDashboard } from './components/AnalysisDashboard';
import ReactMarkdown from 'react-markdown';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import AdminPanel from './AdminPanel';
import jsPDF from 'jspdf';
import * as d3 from 'd3';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Types
interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: any;
  driftResult?: DriftResult;
  feedback?: {
    rating: 'helpful' | 'unhelpful';
    comment?: string;
  };
}

interface Task {
  id: string;
  title: string;
  completed: boolean;
  linkedId?: string; // conversation or document ID
  linkedType?: 'conversation' | 'document';
  createdAt: any;
}

interface DriftResult {
  drift_score: number;
  alignment_status: string;
  executive_summary: string;
  changes: string[];
  risk_areas: string[];
  suggestions: string[];
  citations?: { source: string; target: string }[];
  timeline?: { date: string; event: string; drift_impact: string }[];
  chain_of_authority: string;
  pdf_overview?: string;
  pdf_statutory_authority?: string;
  pdf_conclusion?: string;

  // Legacy compatibility fields
  drift_score: number;
  alignment_status: string;
  changes: string[];
  citations?: { source: string; target: string }[];
  timeline?: { date: string; event: string; drift_impact: string }[];
}

// Helper functions for drift scoring
function getScoreBand(score: number): ScoreBand {
  if (score >= 90) return 'fully_conforming';
  if (score >= 75) return 'substantially_conforming';
  if (score >= 50) return 'marginal';
  if (score >= 25) return 'significantly_drifting';
  return 'ultra_vires';
}

function getAlertClassification(result: DriftResult): AlertClassification {
  const dims = result.dimensions;
  const overall = result.overall_score ?? result.drift_score;
  if (!dims) {
    if (overall < 50) return 'CRITICAL';
    if (overall < 75) return 'AMBER';
    return 'GREEN';
  }
  const scores = [
    dims.d1_delegation_scope.score,
    dims.d2_substantive_alignment.score,
    dims.d3_procedural_mandate.score,
    dims.d4_object_purpose.score,
    dims.d5_non_contravention.score,
    dims.d6_temporal_territorial.score,
    dims.d7_reasonableness.score,
  ];
  if (overall < 50 || dims.d1_delegation_scope.score < 40) return 'CRITICAL';
  const belowFifty = scores.filter(s => s < 50).length;
  const marginal = scores.filter(s => s >= 50 && s < 75).length;
  if (belowFifty > 0 || marginal >= 2) return 'RED';
  if (marginal > 0) return 'AMBER';
  return 'GREEN';
}

function getScoreBandLabel(input: ScoreBand | number): string {
  if (typeof input === 'number') {
    if (input >= 90) return 'Fully Conforming';
    if (input >= 75) return 'Substantially Conforming';
    if (input >= 50) return 'Marginal / Partially Drifting';
    if (input >= 25) return 'Significantly Drifting';
    return 'Ultra Vires';
  }
  const labels: Record<ScoreBand, string> = {
    fully_conforming: 'Fully Conforming',
    substantially_conforming: 'Substantially Conforming',
    marginal: 'Marginal / Partially Drifting',
    significantly_drifting: 'Significantly Drifting',
    ultra_vires: 'Ultra Vires',
  };
  return labels[input];
}

function getScoreColor(score: number): string {
  if (score >= 90) return '#138808';
  if (score >= 75) return '#2E8B57';
  if (score >= 50) return '#FF9933';
  if (score >= 25) return '#E65100';
  return '#D32F2F';
}

function getAlertColor(alert: AlertClassification): string {
  const colors: Record<AlertClassification, string> = {
    GREEN: '#138808',
    AMBER: '#FF9933',
    RED: '#D32F2F',
    CRITICAL: '#8B0000',
  };
  return colors[alert];
}

function computeOverallScore(dims: DriftResult['dimensions']): number {
  if (!dims) return 0;
  return Math.round(
    dims.d1_delegation_scope.score * 0.20 +
    dims.d2_substantive_alignment.score * 0.20 +
    dims.d3_procedural_mandate.score * 0.15 +
    dims.d4_object_purpose.score * 0.15 +
    dims.d5_non_contravention.score * 0.15 +
    dims.d6_temporal_territorial.score * 0.05 +
    dims.d7_reasonableness.score * 0.10
  );
}

function normalizeDriftResult(raw: any): DriftResult {
  // If it already has the new format dimensions, use them
  if (raw.dimensions) {
    const overall = raw.overall_score ?? computeOverallScore(raw.dimensions);
    const band = raw.score_band ?? getScoreBand(overall);
    return {
      ...raw,
      overall_score: overall,
      score_band: band,
      alert_classification: raw.alert_classification ?? getAlertClassification({ ...raw, overall_score: overall }),
      drift_score: raw.drift_score ?? overall,
      alignment_status: raw.alignment_status ?? getScoreBandLabel(band),
      changes: raw.changes ?? (raw.provision_mappings || []).map((p: ProvisionMapping) => `${p.instrument_provision}: ${p.alignment}`),
      executive_summary: raw.executive_summary ?? '',
      chain_of_authority: raw.chain_of_authority ?? '',
      risk_areas: raw.risk_areas ?? [],
      suggestions: raw.suggestions ?? [],
    };
  }
  // Legacy format — return as-is with defaults
  return {
    ...raw,
    drift_score: raw.drift_score ?? 0,
    alignment_status: raw.alignment_status ?? 'Unknown',
    executive_summary: raw.executive_summary ?? raw.explanation ?? '',
    chain_of_authority: raw.chain_of_authority ?? '',
    risk_areas: raw.risk_areas ?? [],
    suggestions: raw.suggestions ?? [],
    changes: raw.changes ?? [],
  };
}

interface Conversation {
  id: string;
  title: string;
  documentId?: string;
  documentName?: string;
  messages: Message[];
  updatedAt: any;
  isPublic?: boolean;
}

interface Document {
  id: string;
  name: string;
  status: 'processing' | 'ready' | 'error';
  pageCount?: number;
  textContent?: string;
  uploadedAt?: any;
  snippet?: string;
}

import { AboutModal } from './AboutModal';
import { AdminModal } from './AdminModal';
import { ErrorBoundary } from './components/ErrorBoundary';
import LandingPage from './LandingPage';
import { ShareModal } from './ShareModal';
import { Toaster } from 'sonner';
import { useLanguage, TranslatedText, useTranslatedString } from './contexts/LanguageContext';
import { generateChatResponse, generateEmbeddings, cosineSimilarity, transcribeAudio, generateTTS, translateText, generateDocumentTitle, ocrDocument } from './geminiService';
import { Joyride, type Step } from 'react-joyride';

const JoyrideAny = Joyride as any;

export default function App() {
  const { language, setLanguage, t } = useLanguage();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [showLanding, setShowLanding] = useState(true);

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [privateMode, setPrivateMode] = useState(false);
  const [privateConversations, setPrivateConversations] = useState<Conversation[]>([]);
  const [privateDocuments, setPrivateDocuments] = useState<Document[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);

  const placeholder = useTranslatedString('Ask about legal alignment in any Indian language...');
  const emailPlaceholder = useTranslatedString('Email address');
  const passwordPlaceholder = useTranslatedString('Password');
  const translatedAppTitle = useTranslatedString('Vidhi-Vichara');
  const searchPlaceholder = useTranslatedString('Search documents & chats...');
  const taskPlaceholder = useTranslatedString('e.g., Review Section 4 of the new circular');
  const feedbackPlaceholder = useTranslatedString('Tell us more (optional)...');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [authError, setAuthError] = useState('');

  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [shareInfo, setShareInfo] = useState<{ id: string; title: string; summary: string } | null>(null);
  const [sharedConversation, setSharedConversation] = useState<Conversation | null>(null);
  const [isSharedView, setIsSharedView] = useState(false);
  const [runTour, setRunTour] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [feedbackComment, setFeedbackComment] = useState<{ msgIdx: number; comment: string } | null>(null);
  const [alertInfo, setAlertInfo] = useState<{ title: string; message: string } | null>(null);
  const [confirmInfo, setConfirmInfo] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);

  const showAlert = (title: string, message: string) => setAlertInfo({ title, message });
  const showConfirm = (title: string, message: string, onConfirm: () => void) => setConfirmInfo({ title, message, onConfirm });

  useEffect(() => {
    const hasSeenTour = localStorage.getItem('vidhi_vichara_tour_seen');
    if (!hasSeenTour && user) {
      setRunTour(true);
    }
  }, [user]);

  const tourSteps: Step[] = [
    {
      target: '.sidebar-docs',
      content: 'Upload and manage your legal documents here. They will be used as context for your queries.',
      placement: 'right',
    },
    {
      target: '.sidebar-chats',
      content: 'Access your recent conversations and alignment analyses here.',
      placement: 'right',
    },
    {
      target: '.private-mode-toggle',
      content: 'Enable Private Mode to keep your documents and chats stored only in your browser session.',
      placement: 'right',
    },
    {
      target: '.language-toggle-buttons',
      content: 'Quickly switch between English and your preferred Indian language.',
      placement: 'bottom',
    },
    {
      target: '.chat-input-area',
      content: 'Ask any legal question or check alignment between directives and parent legislation.',
      placement: 'top',
    }
  ];

  const handleTourCallback = (data: any) => {
    const { status } = data;
    if (['finished', 'skipped'].includes(status)) {
      localStorage.setItem('vidhi_vichara_tour_seen', 'true');
      setRunTour(false);
    }
  };

  const handleShare = async (convId: string, title: string, summary: string) => {
    if (privateMode) {
      showAlert('Private Mode', 'Sharing is not available in Private Mode. Please disable it to share analysis.');
      return;
    }
    try {
      await updateDoc(doc(db, 'conversations', convId), { isPublic: true });
      setShareInfo({ id: convId, title, summary });
      setIsShareOpen(true);
      logActivity('share_analysis', { conversationId: convId });
    } catch (e) {
      console.error("Failed to share analysis", e);
      showAlert('Error', 'Failed to make analysis public. Please try again.');
    }
  };
  const logActivity = async (action: string, metadata: any = {}, uid?: string, overridePrivateMode = false) => {
    const targetUid = uid || user?.uid;
    if (!targetUid || (privateMode && !overridePrivateMode)) return;
    try {
      await addDoc(collection(db, 'user_activity'), {
        userId: targetUid,
        action,
        metadata,
        timestamp: serverTimestamp()
      });
    } catch (e) {
      console.error("Failed to log activity", e);
    }
  };

  useEffect(() => {
    // Apply branding settings
    const unsubSettings = onSnapshot(doc(db, 'settings', 'global'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.themeColor) {
          document.documentElement.style.setProperty('--color-saffron', data.themeColor);
        }
      }
    });

    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setLoading(false);
    });

    const params = new URLSearchParams(window.location.search);
    const shareId = params.get('share');
    if (shareId) {
      setIsSharedView(true);
      const fetchShared = async () => {
        try {
          const docRef = doc(db, 'conversations', shareId);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            const data = docSnap.data();
            if (data.isPublic) {
              setSharedConversation({ id: docSnap.id, ...data } as Conversation);
            } else {
              showAlert('Private Conversation', 'This conversation is not public.');
            }
          } else {
            showAlert('Not Found', 'This conversation does not exist.');
          }
        } catch (e) {
          console.error("Error fetching shared conversation", e);
        }
      };
      fetchShared();
    }

    return () => {
      unsubscribe();
      unsubSettings();
    };
  }, []);

  useEffect(() => {
    if (!user) return;

    const qConvs = query(
      collection(db, 'conversations'),
      where('userId', '==', user.uid)
    );
    const unsubConvs = onSnapshot(qConvs, (snap) => {
      const convs = snap.docs.map(d => ({ id: d.id, ...d.data() } as Conversation));
      convs.sort((a, b) => {
        const timeA = a.updatedAt?.toMillis ? a.updatedAt.toMillis() : (a.updatedAt?.getTime ? a.updatedAt.getTime() : 0);
        const timeB = b.updatedAt?.toMillis ? b.updatedAt.toMillis() : (b.updatedAt?.getTime ? b.updatedAt.getTime() : 0);
        return timeB - timeA;
      });
      setConversations(convs);
    });

    const qDocs = query(
      collection(db, 'documents'),
      where('userId', '==', user.uid)
    );
    const unsubDocs = onSnapshot(qDocs, (snap) => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() } as Document));
      docs.sort((a, b) => {
        const timeA = a.uploadedAt?.toMillis ? a.uploadedAt.toMillis() : (a.uploadedAt?.getTime ? a.uploadedAt.getTime() : 0);
        const timeB = b.uploadedAt?.toMillis ? b.uploadedAt.toMillis() : (b.uploadedAt?.getTime ? b.uploadedAt.getTime() : 0);
        return timeB - timeA;
      });
      setDocuments(docs);
    });

    const qTasks = query(
      collection(db, 'tasks'),
      where('userId', '==', user.uid)
    );
    const unsubTasks = onSnapshot(qTasks, (snap) => {
      const tks = snap.docs.map(d => ({ id: d.id, ...d.data() } as Task));
      tks.sort((a, b) => {
        const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt?.getTime ? a.createdAt.getTime() : 0);
        const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt?.getTime ? b.createdAt.getTime() : 0);
        return timeB - timeA;
      });
      setTasks(tks);
    });

    return () => {
      unsubConvs();
      unsubDocs();
      unsubTasks();
    };
  }, [user]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversations, activeConvId, isTyping]);

  if (showLanding) {
    return (
      <>
        <LandingPage 
          onNavigate={() => setShowLanding(false)} 
        />
      </>
    );
  }

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    try {
      if (isSignUp) {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        logActivity('sign_up', {}, cred.user.uid);
      } else {
        const cred = await signInWithEmailAndPassword(auth, email, password);
        logActivity('sign_in', {}, cred.user.uid);
      }
    } catch (error: any) {
      setAuthError(error.message);
    }
  };

  const handleLogout = () => {
    auth.signOut();
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !user) return;

    setIsUploading(true);
    try {
      for (const file of Array.from(files)) {
        let fullText = "";
        
        if (file.type.startsWith('image/') || file.type === 'application/pdf') {
          // OCR
          const base64 = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.readAsDataURL(file);
          });
          const base64String = base64.split(',')[1];
          console.log(`OCR processing ${file.name}, type: ${file.type}, size: ${base64String.length}`);
          fullText = await ocrDocument(base64String, file.type);
          console.log(`OCR result for ${file.name}: ${fullText.slice(0, 100)}...`);
          
          if (!fullText && file.type === 'application/pdf') {
            // Fallback to pdfParse if OCR fails for PDF
            const formData = new FormData();
            formData.append('files', file);
            const res = await fetch('/api/parse-pdf', {
              method: 'POST',
              body: formData
            });
            if (res.ok) {
              const data = await res.json();
              fullText = data.textContent;
            }
          }
        } else {
          // Use existing /api/parse-pdf
          const formData = new FormData();
          formData.append('files', file);
          const res = await fetch('/api/parse-pdf', {
            method: 'POST',
            body: formData
          });
          if (!res.ok) throw new Error("Upload failed");
          const data = await res.json();
          fullText = data.textContent;
        }

        if (!fullText) continue;

        const fileName = file.name;
        const extension = fileName.split('.').pop();
        
        // Generate a two-word title based on content
        const aiTitle = await generateDocumentTitle(fullText);
        const title = aiTitle.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_');
        const newFileName = `${title}.${extension}`;
        const pageCount = Math.ceil(fullText.length / 3000);
        const snippet = fullText.slice(0, 100).replace(/\s+/g, ' ').trim() + '...';

        // Chunk the text
        const allChunks = [];
        const CHUNK_SIZE = 1500;
        const OVERLAP = 200;
        for (let i = 0; i < fullText.length; i += CHUNK_SIZE - OVERLAP) {
          allChunks.push({
            docName: fileName,
            text: fullText.slice(i, i + CHUNK_SIZE),
            index: allChunks.length,
          });
        }

        // Generate embeddings for chunks (batching them)
        const BATCH_SIZE = 100;
        for (let i = 0; i < allChunks.length; i += BATCH_SIZE) {
          const batch = allChunks.slice(i, i + BATCH_SIZE);
          const embeddings = await generateEmbeddings(batch.map(c => c.text));
          batch.forEach((chunk, idx) => {
            chunk.embedding = embeddings[idx] || [];
          });
        }

        // Store chunks in Firestore if not in private mode
        if (!privateMode) {
          const docRef = await addDoc(collection(db, 'documents'), {
            userId: user.uid,
            name: newFileName,
            uploadedAt: serverTimestamp(),
            status: 'ready',
            pageCount: pageCount,
            textContent: fullText.slice(0, 50000),
            snippet
          });
          setActiveDocId(docRef.id);
          logActivity('upload_document', { fileName: newFileName, pageCount: pageCount });

          const collectionName = 'user_chunks';
          for (const chunk of allChunks) {
            await addDoc(collection(db, collectionName), {
              ...chunk,
              docId: docRef.id,
              userId: user.uid,
              createdAt: serverTimestamp()
            });
          }
        } else {
          const newDoc: Document = {
            id: 'private-' + Date.now(),
            name: newFileName,
            status: 'ready',
            pageCount: pageCount,
            textContent: fullText.slice(0, 50000),
            uploadedAt: new Date(),
            snippet
          };
          setPrivateDocuments(prev => [...prev, newDoc]);
          setActiveDocId(newDoc.id);
        }
      }
    } catch (error) {
      console.error("Upload failed", error);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const toggleRecording = async () => {
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mediaRecorder = new MediaRecorder(stream);
        mediaRecorderRef.current = mediaRecorder;
        const audioChunks: Blob[] = [];

        mediaRecorder.ondataavailable = (e) => {
          audioChunks.push(e.data);
        };

        mediaRecorder.onstop = async () => {
          const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
          
          setIsTyping(true);
          try {
            const reader = new FileReader();
            reader.readAsDataURL(audioBlob);
            reader.onloadend = async () => {
              const base64data = reader.result as string;
              const base64String = base64data.split(',')[1];
              
              const transcribedText = await transcribeAudio(base64String, 'audio/webm');
              if (transcribedText) {
                setInput(prev => prev + (prev ? ' ' : '') + transcribedText);
              }
              setIsTyping(false);
            };
          } catch (error) {
            console.error("Transcription error", error);
            setIsTyping(false);
          }
          
          stream.getTracks().forEach(track => track.stop());
        };

        mediaRecorder.start();
        setIsRecording(true);
      } catch (error) {
        console.error("Microphone access denied", error);
      }
    }
  };

  const playAudio = async (text: string) => {
    try {
      const audioBase64 = await generateTTS(text);
      if (audioBase64) {
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        const binaryString = window.atob(audioBase64);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        
        // The data is 16-bit PCM, 24000Hz, mono
        const buffer = new Int16Array(bytes.buffer);
        const audioBuffer = audioCtx.createBuffer(1, buffer.length, 24000);
        const channelData = audioBuffer.getChannelData(0);
        for (let i = 0; i < buffer.length; i++) {
          channelData[i] = buffer[i] / 32768.0;
        }
        
        const source = audioCtx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioCtx.destination);
        source.start();
        return new Promise(resolve => {
          source.onended = resolve;
        });
      }
    } catch (error) {
      console.error("TTS error", error);
    }
  };

  const goHome = () => {
    setShowLanding(true);
    setSidebarOpen(false);
  };

  const deleteDocument = async (docId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) return;
    
    showConfirm(
      'Delete Document',
      'Are you sure you want to delete this document? This action cannot be undone.',
      async () => {
        try {
          if (privateMode) {
            setPrivateDocuments(prev => prev.filter(d => d.id !== docId));
          } else {
            await deleteDoc(doc(db, 'documents', docId));
            // Also delete associated chunks
            const q = query(collection(db, 'user_chunks'), where('docId', '==', docId));
            const snap = await getDocs(q);
            for (const d of snap.docs) {
              await deleteDoc(d.ref);
            }
          }
          if (activeDocId === docId) setActiveDocId(null);
          logActivity('delete_document', { docId });
        } catch (error) {
          console.error("Delete document failed", error);
        }
      }
    );
  };

  const deleteConversation = async (convId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) return;
    
    showConfirm(
      'Delete Conversation',
      'Are you sure you want to delete this conversation?',
      async () => {
        try {
          if (privateMode) {
            setPrivateConversations(prev => prev.filter(c => c.id !== convId));
          } else {
            await deleteDoc(doc(db, 'conversations', convId));
          }
          if (activeConvId === convId) setActiveConvId(null);
          logActivity('delete_conversation', { convId });
        } catch (error) {
          console.error("Delete conversation failed", error);
        }
      }
    );
  };

  const exportChatHistory = () => {
    const activeConversation = (privateMode ? privateConversations : conversations).find(c => c.id === activeConvId);
    if (!activeConvId || !activeConversation || activeConversation.messages.length === 0) return;
    
    const conversationTitle = activeConversation.title || 'Vidhi-Vichara_Chat';
    const timestamp = new Date().toLocaleString();
    
    let content = `VIDHI-VICHARA: LEGAL AI ANALYSIS\n`;
    content += `====================================\n`;
    content += `Conversation: ${conversationTitle}\n`;
    content += `Export Date: ${timestamp}\n`;
    content += `====================================\n\n`;
    
    activeConversation.messages.forEach((msg, index) => {
      const role = msg.role === 'user' ? 'USER' : 'VIDHI-VICHARA AI';
      const time = new Date(msg.timestamp).toLocaleTimeString();
      content += `[${role}] (${time})\n`;
      content += `${msg.content}\n`;
      if (msg.driftResult) {
        const dr = msg.driftResult;
        const score = dr.overall_score ?? dr.drift_score;
        content += `\n[DRIFT ANALYSIS SUMMARY]\n`;
        content += `Overall Score: ${score}% | Status: ${dr.alignment_status}\n`;
        if (dr.alert_classification) content += `Alert: ${dr.alert_classification}\n`;
        if (dr.instrument_profile) {
          content += `Instrument: ${dr.instrument_profile.title} (${dr.instrument_profile.type})\n`;
          if (dr.instrument_profile.issuing_authority) content += `Authority: ${dr.instrument_profile.issuing_authority}\n`;
        }
        if (dr.parent_act) {
          content += `Parent Act: ${dr.parent_act.name} (${dr.parent_act.year})\n`;
        }
        if (dr.dimensions) {
          content += `\n7-Dimension Scores:\n`;
          content += `  D1 Delegation Scope: ${dr.dimensions.d1_delegation_scope?.score}/100\n`;
          content += `  D2 Substantive Alignment: ${dr.dimensions.d2_substantive_alignment?.score}/100\n`;
          content += `  D3 Procedural Mandate: ${dr.dimensions.d3_procedural_mandate?.score}/100\n`;
          content += `  D4 Object & Purpose: ${dr.dimensions.d4_object_purpose?.score}/100\n`;
          content += `  D5 Non-Contravention: ${dr.dimensions.d5_non_contravention?.score}/100\n`;
          content += `  D6 Temporal/Territorial: ${dr.dimensions.d6_temporal_territorial?.score}/100\n`;
          content += `  D7 Reasonableness: ${dr.dimensions.d7_reasonableness?.score}/100\n`;
        }
        if (dr.risk_areas?.length) content += `\nRisk Areas: ${dr.risk_areas.join('; ')}\n`;
        if (dr.suggestions?.length) content += `Suggestions: ${dr.suggestions.join('; ')}\n`;
      }
      content += `------------------------------------\n\n`;
    });
    
    content += `\n\n© Vidhi-Vichara | IIT Jodhpur Research Project\n`;
    content += `Disclaimer: This AI-generated conversation is for informational purposes only and does not constitute legal advice.`;
    
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${conversationTitle.replace(/[^\w\s]/gi, '').replace(/\s+/g, '_')}_${Date.now()}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    logActivity('export_chat', { conversationId: activeConvId });
  };

  const addTask = async (title: string, linkedId?: string, linkedType?: 'conversation' | 'document') => {
    if (!user) return;
    try {
      await addDoc(collection(db, 'tasks'), {
        userId: user.uid,
        title,
        completed: false,
        linkedId: linkedId || null,
        linkedType: linkedType || null,
        createdAt: serverTimestamp()
      });
      logActivity('add_task', { title });
    } catch (error) {
      console.error("Add task failed", error);
    }
  };

  const toggleTask = async (taskId: string, completed: boolean) => {
    try {
      await updateDoc(doc(db, 'tasks', taskId), {
        completed: !completed
      });
      logActivity('toggle_task', { taskId, completed: !completed });
    } catch (error) {
      console.error("Toggle task failed", error);
    }
  };

  const deleteTask = async (taskId: string) => {
    try {
      await deleteDoc(doc(db, 'tasks', taskId));
      logActivity('delete_task', { taskId });
    } catch (error) {
      console.error("Delete task failed", error);
    }
  };

  const submitFeedback = async (msgIdx: number, rating: 'helpful' | 'unhelpful', comment?: string) => {
    if (!activeConvId || !activeConversation) return;
    
    const updatedMessages = [...activeConversation.messages];
    updatedMessages[msgIdx] = {
      ...updatedMessages[msgIdx],
      feedback: { rating, comment }
    };

    try {
      if (privateMode) {
        setPrivateConversations(prev => prev.map(c => 
          c.id === activeConvId ? { ...c, messages: updatedMessages } : c
        ));
      } else {
        await updateDoc(doc(db, 'conversations', activeConvId), {
          messages: updatedMessages
        });
      }
      logActivity('submit_feedback', { rating, hasComment: !!comment });
    } catch (error) {
      console.error("Submit feedback failed", error);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || !user) return;

    const text = input;
    setInput('');
    setIsTyping(true);

    try {
      let convId = activeConvId;
      let docContext = '';
      let docName = '';

      if (activeDocId) {
        if (privateMode) {
          const pDoc = privateDocuments.find(d => d.id === activeDocId);
          if (pDoc) {
            docContext = pDoc.textContent || '';
            docName = pDoc.name || '';
          }
        } else {
          const docSnap = await getDoc(doc(db, 'documents', activeDocId));
          if (docSnap.exists()) {
            docContext = docSnap.data().textContent || '';
            docName = docSnap.data().name || '';
          }
        }
      }

      const activeConv = privateMode 
        ? privateConversations.find(c => c.id === convId)
        : conversations.find(c => c.id === convId);
      const history = activeConv ? activeConv.messages : [];

      // Optimistically add user message
      const newUserMsg: Message = { role: 'user', content: text, timestamp: new Date() };
      
      logActivity('send_message', { messageLength: text.length, hasContext: !!docContext });

      if (privateMode) {
        if (!convId) {
          convId = 'private-conv-' + Date.now();
          setActiveConvId(convId);
          setPrivateConversations(prev => [...prev, {
            id: convId!,
            title: text.slice(0, 50) + (text.length > 50 ? '...' : ''),
            documentId: activeDocId || undefined,
            documentName: docName || undefined,
            messages: [newUserMsg],
            updatedAt: new Date()
          }]);
        } else {
          setPrivateConversations(prev => prev.map(c => 
            c.id === convId ? { ...c, messages: [...c.messages, newUserMsg], updatedAt: new Date() } : c
          ));
        }
      } else {
        if (!convId) {
          // Create new conversation
          const newConvRef = await addDoc(collection(db, 'conversations'), {
            userId: user.uid,
            title: text.slice(0, 50) + (text.length > 50 ? '...' : ''),
            documentId: activeDocId || null,
            documentName: docName || null,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            messages: [newUserMsg]
          });
          convId = newConvRef.id;
          setActiveConvId(convId);
        } else {
          // Update existing
          await updateDoc(doc(db, 'conversations', convId), {
            messages: [...history, newUserMsg],
            updatedAt: serverTimestamp()
          });
        }
      }

      // 1. Embed the user query
      const queryEmbeddings = await generateEmbeddings([text]);
      const queryEmbedding = queryEmbeddings[0] || [];

      // 2. Semantic Search across user documents and global knowledgebase
      let relevantChunks: any[] = [];
      const allAvailableChunks: any[] = [];
      
      // Fetch user chunks only if not in private mode
      if (!privateMode) {
        let userChunksQuery = query(collection(db, 'user_chunks'), where('userId', '==', user.uid));
        if (activeDocId) {
          userChunksQuery = query(userChunksQuery, where('docId', '==', activeDocId));
        }
        const userChunksSnap = await getDocs(userChunksQuery);
        userChunksSnap.forEach(doc => allAvailableChunks.push(doc.data()));
      }

      // Fetch global knowledgebase chunks
      const kbChunksQuery = query(collection(db, 'knowledgebase_chunks'));
      const kbChunksSnap = await getDocs(kbChunksQuery);
      kbChunksSnap.forEach(doc => allAvailableChunks.push(doc.data()));
      
      if (allAvailableChunks.length > 0 && queryEmbedding.length > 0) {
        // Calculate similarity
        const scoredChunks = allAvailableChunks.map(chunk => ({
          ...chunk,
          score: cosineSimilarity(queryEmbedding, chunk.embedding || [])
        }));
        
        // Sort by score descending and take top 10
        scoredChunks.sort((a, b) => b.score - a.score);
        relevantChunks = scoredChunks.slice(0, 10);
      }

      let ragContext = "";
      if (relevantChunks.length > 0) {
        ragContext = "\n\n[Relevant Legal Context from Uploaded Documents]\n";
        relevantChunks.forEach(chunk => {
          ragContext += `Document: ${chunk.docName}\n${chunk.text}\n...\n`;
        });
      }

      if (docContext) {
        ragContext += `\n\n[Current Document Context]\n${docContext}\n`;
      }

      const isAlignmentCheck = /align|drift|check|compare|evaluate|assess|verify|legal status|compliance|analysis|report/i.test(text);
      
      let systemPrompt = `You are Vidhi-Vichara (विधि-विचार), an AI legal alignment assistant created by researchers at IIT Jodhpur, India. Your purpose is to help users understand whether executive actions, statutory instruments, circulars, notifications, and directives are legally aligned with their parent legislation.`;

      if (isAlignmentCheck) {
        systemPrompt += `
ANALYSIS MODE: When a user asks you to check alignment between an executive action and a reference law, respond with structured JSON embedded in your response. Use this exact format:
\`\`\`json
{
  "drift_score": <number 0-100>,
  "alignment_status": "<Fully Aligned | Largely Aligned | Moderate Drift | Significant Drift | Critical Divergence>",
  "changes": ["<specific change identified>"],
  "explanation": "<detailed paragraph explaining the analysis>",
  "risk_areas": ["<specific legal risk>"],
  "suggestions": ["<actionable recommendation>"],
  "citations": [
    { "source": "<Section/Clause in Directive>", "target": "<Section/Clause in Parent Act>" }
  ],
  "timeline": [
    { "date": "YYYY-MM-DD or Year", "event": "<Amendment or Notification Title>", "drift_impact": "<Increased | Decreased | Neutral>" }
  ]
}
\`\`\`
`;
      } else {
        systemPrompt += `
CONVERSATIONAL MODE: For follow-up questions, respond conversationally without JSON. Be helpful, precise, and cite specific sections.
`;
      }
      
      systemPrompt += `
LIMITATIONS: 
- Never provide definitive legal advice.
- If you are uncertain about a legal interpretation, say so explicitly.
- End every drift analysis with: "⚖️ This analysis is for informational purposes only and does not constitute legal advice. Please consult a qualified legal professional for specific legal matters."
`;

      try {
        const settingsDoc = await getDoc(doc(db, 'settings', 'global'));
        if (settingsDoc.exists() && settingsDoc.data().systemPrompt) {
          systemPrompt = settingsDoc.data().systemPrompt;
        }
      } catch (e) {
        console.error("Failed to fetch system prompt from settings", e);
      }

      const data = await generateChatResponse(text, history, ragContext, systemPrompt, language);
      
      // Save AI response
      const aiMsg: Message = {
        role: 'assistant',
        content: data.message,
        timestamp: new Date(),
        driftResult: data.driftResult
      };

      if (privateMode) {
        setPrivateConversations(prev => prev.map(c => 
          c.id === convId ? { ...c, messages: [...c.messages, aiMsg], updatedAt: new Date() } : c
        ));
      } else {
        const finalConvSnap = await getDoc(doc(db, 'conversations', convId!));
        if (finalConvSnap.exists()) {
          const currentMessages = finalConvSnap.data().messages || [];
          await updateDoc(doc(db, 'conversations', convId!), {
            messages: [...currentMessages, aiMsg],
            updatedAt: serverTimestamp()
          });
        }
      }

    } catch (error) {
      console.error("Chat error", error);
    } finally {
      setIsTyping(false);
    }
  };

  const activeConversation = (privateMode ? privateConversations : conversations).find(c => c.id === activeConvId);
  const activeDocument = (privateMode ? privateDocuments : documents).find(d => d.id === activeDocId);

  const filteredConversations = (privateMode ? privateConversations : conversations).filter(c => 
    c.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.messages.some(m => m.content.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const filteredDocuments = (privateMode ? privateDocuments : documents).filter(d => 
    d.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    d.textContent?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-parchment text-ink"><TranslatedText text="Loading..." /></div>;
  }

  if (isSharedView) {
    return (
      <div className="min-h-screen bg-parchment text-ink flex flex-col font-serif">
        <header className="p-4 border-b border-parchment-border bg-parchment-dark/50 flex items-center justify-between sticky top-0 z-10 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <Scale className="w-8 h-8 text-saffron" />
            <div>
              <h1 className="text-xl font-bold tracking-tight">Vidhi-Vichara</h1>
              <p className="text-[10px] text-ink-light font-bold uppercase tracking-widest opacity-60">Public Analysis View</p>
            </div>
          </div>
          <button 
            onClick={() => window.location.href = '/'}
            className="px-4 py-2 bg-ink text-parchment rounded-xl text-xs font-bold hover:bg-saffron hover:text-navy transition-all shadow-md"
          >
            <TranslatedText text="Go to Application" />
          </button>
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-8 max-w-4xl mx-auto w-full space-y-8">
          {sharedConversation ? (
            <>
              <div className="space-y-2 border-b border-parchment-border pb-6">
                <h2 className="text-3xl font-bold text-ink">{sharedConversation.title}</h2>
                <p className="text-sm text-ink-light">
                  <TranslatedText text="Analysis generated on" /> {sharedConversation.updatedAt?.toDate ? sharedConversation.updatedAt.toDate().toLocaleDateString() : 'recent date'}
                </p>
              </div>

              <div className="space-y-12">
                {sharedConversation.messages.map((msg, idx) => (
                  <div key={idx} className="space-y-6">
                    {msg.driftResult && (
                      <DriftCard 
                        result={msg.driftResult} 
                        user={null} 
                        privateMode={false} 
                        logActivity={() => {}} 
                        showAlert={showAlert}
                        documentName={sharedConversation.documentName}
                        msgIdx={idx}
                        onFeedback={() => {}}
                        documents={documents}
                        activeDocId={activeDocId}
                      />
                    )}
                    {msg.content && !msg.driftResult && (
                      <div className="prose prose-sm max-w-none bg-white/50 p-6 rounded-2xl border border-parchment-border shadow-sm">
                        <ReactMarkdown>{msg.content}</ReactMarkdown>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <footer className="pt-12 pb-8 text-center border-t border-parchment-border mt-12">
                <p className="text-xs text-ink-light mb-4 italic">
                  <TranslatedText text="This analysis was generated using Vidhi-Vichara AI. Legal interpretations should be verified by qualified professionals." />
                </p>
                <div className="flex justify-center gap-4">
                  <button onClick={() => window.location.href = '/'} className="text-saffron font-bold text-sm hover:underline">
                    <TranslatedText text="Create your own analysis" />
                  </button>
                </div>
              </footer>
            </>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center space-y-4 py-20">
              <div className="w-16 h-16 rounded-full bg-parchment-dark flex items-center justify-center text-ink-light animate-pulse">
                <Search className="w-8 h-8" />
              </div>
              <h2 className="text-2xl text-ink"><TranslatedText text="Fetching Analysis..." /></h2>
              <p className="text-ink-light max-w-xs mx-auto"><TranslatedText text="Please wait while we retrieve the shared legal alignment report." /></p>
            </div>
          )}
        </main>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-parchment flex flex-col items-center justify-center p-4 text-center relative overflow-hidden">
        {/* Top right buttons */}
        <div className="absolute top-4 right-4 flex items-center gap-4 z-20">
          <button onClick={() => setIsAboutOpen(true)} className="text-ink-light hover:text-saffron transition-colors flex items-center gap-1" title="About Vidhi-Vichara">
            <Info className="w-5 h-5" />
            <span className="text-sm font-medium"><TranslatedText text="About" /></span>
          </button>
          <button 
            onClick={() => {
              if (user?.email === "kannaganuthula@gmail.com") {
                setIsAdminOpen(true);
              } else {
                showAlert("Admin Access", "Only authorized administrators can access this dashboard.");
              }
            }} 
            className="text-ink-light hover:text-saffron transition-colors flex items-center gap-1" 
            title="Admin Access"
          >
            <Settings className="w-5 h-5" />
            <span className="text-sm font-medium"><TranslatedText text="Admin" /></span>
          </button>
        </div>

        <Scale className="w-16 h-16 text-saffron mb-6" />
        <h1 className="text-4xl md:text-5xl font-serif mb-2">Vidhi-Vichara</h1>
        <h2 className="text-2xl md:text-3xl font-serif text-ink-light mb-8">विधि-विचार</h2>
        
        <form onSubmit={handleAuth} className="w-full max-w-sm bg-parchment-dark p-8 rounded-2xl border border-parchment-border shadow-xl relative z-10">
          <h3 className="text-xl font-semibold mb-6">{isSignUp ? <TranslatedText text="Create Account" /> : <TranslatedText text="Sign In" />}</h3>
          
          {authError && <div className="mb-4 p-3 bg-danger/10 border border-danger/20 text-danger rounded-lg text-sm">{authError}</div>}
          
          <div className="space-y-4 mb-6">
            <input 
              type="email" 
              placeholder={emailPlaceholder} 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-parchment border border-parchment-border rounded-lg px-4 py-3 focus:border-saffron focus:outline-none transition-colors"
              required
            />
            <input 
              type="password" 
              placeholder={passwordPlaceholder} 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-parchment border border-parchment-border rounded-lg px-4 py-3 focus:border-saffron focus:outline-none transition-colors"
              required
            />
          </div>
          
          <button
            type="submit"
            className="w-full bg-saffron hover:bg-saffron-hover text-navy font-semibold py-3 px-8 rounded-xl transition-colors mb-4"
          >
            <TranslatedText text={isSignUp ? 'Sign Up' : 'Sign In'} />
          </button>
          
          <button 
            type="button"
            onClick={() => setIsSignUp(!isSignUp)}
            className="text-sm text-ink-light hover:text-saffron transition-colors"
          >
            {isSignUp ? <TranslatedText text="Already have an account? Sign in" /> : <TranslatedText text="Don't have an account? Sign up" />}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-parchment text-ink overflow-hidden">
      {/* Sidebar */}
      <div className={cn(
        "fixed inset-y-0 left-0 z-50 w-72 bg-parchment-dark border-r border-parchment-border transform transition-transform duration-300 ease-in-out md:relative md:translate-x-0 flex flex-col",
        sidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="p-4 border-b border-parchment-border space-y-4">
          <div className="flex items-center justify-between">
            <button 
              onClick={goHome}
              className="flex items-center gap-2 text-saffron hover:text-saffron-hover transition-colors group"
              title="Back to Home"
            >
              <Scale className="w-6 h-6 group-hover:scale-110 transition-transform" />
              <span className="font-serif text-xl"><TranslatedText text="Vidhi-Vichara" /></span>
            </button>
            <button onClick={() => setSidebarOpen(false)} className="md:hidden text-ink-light">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-light/50" />
            <input 
              type="text"
              placeholder={searchPlaceholder}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-parchment border border-parchment-border rounded-lg pl-9 pr-3 py-2 text-sm focus:border-saffron focus:outline-none transition-colors"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold text-ink-light/70 uppercase tracking-wider flex items-center gap-2">
                <FileText className="w-3 h-3" />
                <TranslatedText text="Documents" />
              </h3>
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleUpload} 
                className="hidden" 
                accept=".pdf,.txt"
                multiple
              />
            </div>
            <div className="space-y-1 sidebar-docs">
              {filteredDocuments.map(doc => (
                <div key={doc.id} className="group relative">
                  <button
                    onClick={() => setActiveDocId(doc.id)}
                    className={cn(
                      "w-full text-left px-3 py-2 rounded-lg text-sm flex flex-col gap-0.5 transition-colors pr-8",
                      activeDocId === doc.id ? "bg-chat-user text-ink" : "text-ink-light hover:bg-parchment"
                    )}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <FileText className="w-4 h-4 shrink-0" />
                      <span className="truncate font-medium">{doc.name}</span>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-ink-light/60">
                      {doc.pageCount && <span>{doc.pageCount} <TranslatedText text="pages" /></span>}
                      {doc.uploadedAt && <span>• {new Date(doc.uploadedAt.toMillis ? doc.uploadedAt.toMillis() : doc.uploadedAt).toLocaleDateString()}</span>}
                    </div>
                    {doc.snippet && (
                      <p className="text-[10px] text-ink-light/40 truncate italic mt-0.5">
                        {doc.snippet}
                      </p>
                    )}
                    {doc.status === 'processing' && <span className="absolute right-8 top-3 text-[10px] text-saffron animate-pulse">...</span>}
                  </button>
                  <button 
                    onClick={(e) => deleteDocument(doc.id, e)}
                    className="absolute right-2 top-3 p-1 text-ink-light hover:text-danger opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              {filteredDocuments.length === 0 && (
                <p className="text-sm text-ink-light/70 italic px-3"><TranslatedText text={searchTerm ? "No matches found" : "No documents uploaded"} /></p>
              )}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold text-ink-light/70 uppercase tracking-wider flex items-center gap-2">
                <MessageSquare className="w-3 h-3" />
                <TranslatedText text="Recent Chats" />
              </h3>
              <button 
                onClick={() => { setActiveConvId(null); setActiveDocId(null); }}
                className="text-saffron hover:text-saffron-hover text-xs"
              >
                <TranslatedText text="New" />
              </button>
            </div>
            <div className="space-y-1 sidebar-chats">
              {filteredConversations.map(conv => (
                <div key={conv.id} className="group relative">
                  <button
                    onClick={() => {
                      setActiveConvId(conv.id);
                      if (conv.documentId) setActiveDocId(conv.documentId);
                    }}
                    className={cn(
                      "w-full text-left px-3 py-2 rounded-lg text-sm truncate flex items-center gap-2 transition-colors pr-8",
                      activeConvId === conv.id ? "bg-chat-user text-ink" : "text-ink-light hover:bg-parchment"
                    )}
                  >
                    <MessageSquare className="w-4 h-4 shrink-0" />
                    <span className="truncate">{conv.title}</span>
                  </button>
                  <button 
                    onClick={(e) => deleteConversation(conv.id, e)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-ink-light hover:text-danger opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              {filteredConversations.length === 0 && (
                <p className="text-sm text-ink-light/70 italic px-3"><TranslatedText text={searchTerm ? "No matches found" : "No conversations"} /></p>
              )}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold text-ink-light/70 uppercase tracking-wider flex items-center gap-2">
                <CheckSquare className="w-3 h-3" />
                <TranslatedText text="Tasks" />
              </h3>
              <button 
                onClick={() => setShowTaskModal(true)}
                className="text-saffron hover:text-saffron-hover"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-2 sidebar-tasks">
              {tasks.slice(0, 5).map(task => (
                <div key={task.id} className="group flex items-start gap-2 px-3 py-2 rounded-lg hover:bg-parchment transition-colors">
                  <button 
                    onClick={() => toggleTask(task.id, task.completed)}
                    className={cn(
                      "mt-0.5 shrink-0 w-4 h-4 rounded border flex items-center justify-center transition-colors",
                      task.completed ? "bg-success border-success text-white" : "border-parchment-border text-transparent"
                    )}
                  >
                    <CheckCircle className="w-3 h-3" />
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className={cn(
                      "text-xs truncate transition-all",
                      task.completed ? "text-ink-light/50 line-through" : "text-ink"
                    )}>
                      {task.title}
                    </p>
                    {task.linkedId && (
                      <div className="flex items-center gap-1 text-[9px] text-saffron/70 mt-0.5">
                        <Clock className="w-2 h-2" />
                        <span className="truncate"><TranslatedText text="Linked" /></span>
                      </div>
                    )}
                  </div>
                  <button 
                    onClick={() => deleteTask(task.id)}
                    className="opacity-0 group-hover:opacity-100 text-ink-light hover:text-danger transition-opacity"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
              {tasks.length === 0 && (
                <p className="text-sm text-ink-light/70 italic px-3"><TranslatedText text="No active tasks" /></p>
              )}
              {tasks.length > 5 && (
                <button className="text-[10px] text-saffron px-3 hover:underline"><TranslatedText text="View all tasks" /></button>
              )}
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-parchment-border space-y-2">
          <button
            onClick={() => {
              const newMode = !privateMode;
              if (newMode) {
                logActivity('enable_private_mode');
              } else {
                logActivity('disable_private_mode', {}, undefined, true);
              }
              setPrivateMode(newMode);
              setActiveConvId(null);
              setActiveDocId(null);
            }}
            className={cn(
              "flex items-center justify-between w-full px-3 py-2 rounded-lg transition-colors private-mode-toggle",
              privateMode ? "bg-saffron/20 text-saffron" : "text-ink-light hover:bg-parchment hover:text-ink"
            )}
          >
            <div className="flex items-center gap-2">
              <Network className="w-4 h-4" />
              <span className="text-sm"><TranslatedText text="Private Mode" /></span>
            </div>
            <div className={cn(
              "w-8 h-4 rounded-full transition-colors relative",
              privateMode ? "bg-saffron" : "bg-parchment-border"
            )}>
              <div className={cn(
                "absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white transition-transform",
                privateMode ? "translate-x-4" : "translate-x-0"
              )} />
            </div>
          </button>
          {(user.email === 'kannaganuthula@gmail.com' || user.email === 'kannaganthula@gmail.com') && (
            <button
              onClick={() => setIsAdminOpen(true)}
              className="flex items-center gap-2 text-saffron hover:text-saffron-hover transition-colors w-full px-3 py-2 rounded-lg hover:bg-parchment-dark"
            >
              <Settings className="w-4 h-4" />
              <span className="text-sm"><TranslatedText text="Admin Panel" /></span>
            </button>
          )}
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 text-ink-light hover:text-ink transition-colors w-full px-3 py-2 rounded-lg hover:bg-parchment"
          >
            <LogOut className="w-4 h-4" />
            <span className="text-sm"><TranslatedText text="Sign Out" /></span>
          </button>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0 bg-parchment">
        {/* Header */}
        <header className="h-14 border-b border-parchment-border flex items-center px-4 gap-4 sticky top-0 bg-parchment/90 backdrop-blur z-10">
          <button onClick={() => setSidebarOpen(true)} className="md:hidden text-ink-light">
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex-1 truncate">
            <h1 className="font-serif text-lg truncate flex items-center gap-2">
              {activeConversation?.title || <TranslatedText text="New Conversation" />}
              {activeConversation && (
                <button 
                  onClick={(e) => deleteConversation(activeConversation.id, e)}
                  className="text-ink-light hover:text-danger p-1 transition-colors"
                  title="Delete Conversation"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </h1>
            {activeDocument && (
              <div className="flex items-center gap-1 text-xs text-success">
                <CheckCircle className="w-3 h-3" />
                <span className="truncate"><TranslatedText text="Context" />: {activeDocument.name}</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-4">
            {activeConvId && activeConversation && activeConversation.messages.length > 0 && (
              <button
                onClick={exportChatHistory}
                className="text-ink-light hover:text-saffron transition-colors flex items-center gap-1"
                title="Export Chat History"
              >
                <Download className="w-5 h-5" />
                <span className="hidden lg:inline text-[10px] font-bold uppercase tracking-widest"><TranslatedText text="Export Chat" /></span>
              </button>
            )}
            <button onClick={() => setIsAboutOpen(true)} className="text-ink-light hover:text-saffron transition-colors" title="About Vidhi-Vichara">
              <Info className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Chat Messages */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
          {!activeConversation && (
            <div className="h-full flex flex-col items-center justify-center text-center max-w-lg mx-auto space-y-6">
              <Scale className="w-12 h-12 text-saffron/50" />
              <div className="space-y-2">
                <h2 className="text-2xl font-serif"><TranslatedText text="Welcome" /></h2>
                <h3 className="text-xl font-serif text-saffron"><TranslatedText text="I am Vidhi-Vichara" /></h3>
              </div>
              <p className="text-ink-light">
                <TranslatedText text="Evaluate executive actions, statutory instruments, and directives against pertinent laws. Upload your documents to get started." />
              </p>
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 px-6 py-3 bg-saffron text-navy rounded-lg hover:bg-saffron-hover transition-colors font-bold"
              >
                <Upload className="w-5 h-5" />
                <TranslatedText text="Upload Documents" />
              </button>
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleUpload} 
                className="hidden" 
                accept=".pdf,.txt"
                multiple
              />
            </div>
          )}

          {activeConversation?.messages.map((msg, idx) => (
            <div key={idx} className={cn(
              "flex gap-4 max-w-3xl mx-auto",
              msg.role === 'user' ? "flex-row-reverse" : ""
            )}>
              <div className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
                msg.role === 'user' ? "bg-saffron text-navy" : "bg-parchment-dark border border-parchment-border text-saffron"
              )}>
                {msg.role === 'user' ? <span className="font-bold text-sm">{user.email?.[0].toUpperCase() || 'U'}</span> : <Scale className="w-4 h-4" />}
              </div>
              <div className={cn(
                "px-4 py-3 rounded-2xl max-w-[85%] break-words overflow-hidden",
                msg.role === 'user' ? "bg-chat-user text-ink rounded-tr-none" : "bg-chat-ai border border-parchment-border rounded-tl-none"
              )}>
                {msg.role === 'assistant' && (
                  <button onClick={() => playAudio(msg.content)} className="float-right ml-2 text-ink-light hover:text-saffron">
                    <Volume2 className="w-4 h-4" />
                  </button>
                )}
                {msg.driftResult && (
                  <DriftCard 
                    result={msg.driftResult} 
                    user={user} 
                    privateMode={privateMode} 
                    logActivity={logActivity} 
                    showAlert={showAlert}
                    documentName={activeConversation?.documentName}
                    msgIdx={idx}
                    onFeedback={submitFeedback}
                    initialFeedback={msg.feedback}
                    conversationId={activeConversation?.id}
                    conversationTitle={activeConversation?.title}
                    onShare={handleShare}
                    documents={documents}
                    activeDocId={activeDocId}
                  />
                )}
                {!msg.driftResult && msg.content && (
                  <div className="prose prose-sm max-w-none prose-headings:font-serif prose-headings:text-ink prose-p:text-black prose-p:text-justify prose-strong:text-orange-500 prose-li:text-black">
                    <ReactMarkdown
                      components={{
                        code({ node, className, children, ...props }) {
                          return (
                            <span className={cn("bg-parchment-dark px-1.5 py-0.5 rounded font-mono text-xs", className)} {...props}>
                              {children}
                            </span>
                          );
                        }
                      }}
                    >
                      {msg.content}
                    </ReactMarkdown>
                  </div>
                )}

                {msg.role === 'assistant' && (
                  <div className="mt-3 pt-3 border-t border-parchment-border flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <button 
                        onClick={() => submitFeedback(idx, 'helpful')}
                        className={cn(
                          "p-1 rounded transition-colors",
                          msg.feedback?.rating === 'helpful' ? "text-success bg-success/10" : "text-ink-light hover:text-success hover:bg-success/5"
                        )}
                        title="Helpful"
                      >
                        <ThumbsUp className="w-3.5 h-3.5" />
                      </button>
                      <button 
                        onClick={() => submitFeedback(idx, 'unhelpful')}
                        className={cn(
                          "p-1 rounded transition-colors",
                          msg.feedback?.rating === 'unhelpful' ? "text-danger bg-danger/10" : "text-ink-light hover:text-danger hover:bg-danger/5"
                        )}
                        title="Unhelpful"
                      >
                        <ThumbsDown className="w-3.5 h-3.5" />
                      </button>
                      <button 
                        onClick={() => setFeedbackComment({ msgIdx: idx, comment: msg.feedback?.comment || '' })}
                        className={cn(
                          "p-1 rounded transition-colors",
                          msg.feedback?.comment ? "text-saffron bg-saffron/10" : "text-ink-light hover:text-saffron hover:bg-saffron/5"
                        )}
                        title="Add Comment"
                      >
                        <MessageSquarePlus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    {msg.feedback?.rating && (
                      <span className="text-[10px] text-ink-light/50 font-medium uppercase tracking-wider">
                        <TranslatedText text="Feedback received" />
                      </span>
                    )}
                  </div>
                )}

                {feedbackComment?.msgIdx === idx && (
                  <div className="mt-3 p-3 bg-parchment-dark rounded-lg border border-parchment-border animate-in fade-in slide-in-from-top-2">
                    <textarea
                      value={feedbackComment.comment}
                      onChange={(e) => setFeedbackComment({ ...feedbackComment, comment: e.target.value })}
                      placeholder={feedbackPlaceholder}
                      className="w-full bg-parchment border border-parchment-border rounded-md p-2 text-xs focus:border-saffron focus:outline-none resize-none"
                      rows={2}
                    />
                    <div className="flex justify-end gap-2 mt-2">
                      <button 
                        onClick={() => setFeedbackComment(null)}
                        className="px-2 py-1 text-[10px] text-ink-light hover:text-ink"
                      >
                        <TranslatedText text="Cancel" />
                      </button>
                      <button 
                        onClick={() => {
                          submitFeedback(idx, msg.feedback?.rating || 'helpful', feedbackComment.comment);
                          setFeedbackComment(null);
                        }}
                        className="px-2 py-1 bg-saffron text-navy text-[10px] font-bold rounded"
                      >
                        <TranslatedText text="Save" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}

          {isTyping && (
            <div className="flex gap-4 max-w-3xl mx-auto">
              <div className="w-8 h-8 rounded-full bg-parchment-dark border border-parchment-border text-saffron flex items-center justify-center shrink-0">
                <Scale className="w-4 h-4" />
              </div>
              <div className="px-4 py-3 rounded-2xl bg-chat-ai border border-parchment-border rounded-tl-none flex items-center gap-2">
                <div className="w-2 h-2 bg-text-dim rounded-full animate-bounce" />
                <div className="w-2 h-2 bg-text-dim rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                <div className="w-2 h-2 bg-text-dim rounded-full animate-bounce" style={{ animationDelay: '0.4s' }} />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="p-4 bg-parchment/90 backdrop-blur border-t border-parchment-border chat-input-area">
          <div className="max-w-3xl mx-auto">
              {isUploading && (
                <div className="mb-2 text-xs text-saffron animate-pulse flex items-center gap-2">
                  <Upload className="w-3 h-3" /> <TranslatedText text="Uploading document..." />
                </div>
              )}
              
              {activeDocument && !activeConversation && (
                <div className="flex gap-2 mb-3 overflow-x-auto pb-2 scrollbar-hide">
                  {['Check alignment with parent Act', 'Summarize key provisions', 'Identify potential ultra vires sections'].map(suggestion => (
                    <button
                      key={suggestion}
                      onClick={() => setInput(suggestion)}
                      className="whitespace-nowrap px-3 py-1.5 bg-parchment-dark border border-parchment-border rounded-full text-xs text-ink-light hover:text-ink hover:border-saffron transition-colors"
                    >
                      <TranslatedText text={suggestion} />
                    </button>
                  ))}
                </div>
              )}

            <div className="relative flex items-end gap-2 bg-parchment-dark border border-parchment-border rounded-2xl p-2 focus-within:border-saffron transition-colors">
              <button 
                onClick={toggleRecording}
                className={cn("p-2 transition-colors shrink-0", isRecording ? "text-danger animate-pulse" : "text-ink-light hover:text-saffron")}
                title={isRecording ? "Stop Recording" : "Start Recording"}
              >
                {isRecording ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              </button>
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder={placeholder}
                className="flex-1 max-h-32 min-h-[40px] bg-transparent border-none focus:ring-0 resize-none py-2 text-sm"
                rows={1}
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || isTyping}
                className="p-2 bg-saffron text-navy rounded-xl hover:bg-saffron-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
              >
                <Send className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </div>
      <AboutModal isOpen={isAboutOpen} onClose={() => setIsAboutOpen(false)} />
      <ErrorBoundary>
        <AdminModal isOpen={isAdminOpen} onClose={() => setIsAdminOpen(false)} />
      </ErrorBoundary>
      <Toaster position="top-right" />
      
      {showTaskModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-navy/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-parchment w-full max-w-md rounded-2xl shadow-2xl border border-parchment-border overflow-hidden animate-in zoom-in-95">
            <div className="p-6 border-b border-parchment-border flex items-center justify-between bg-parchment-dark">
              <h2 className="text-xl font-serif flex items-center gap-2">
                <CheckSquare className="w-5 h-5 text-saffron" />
                <TranslatedText text="New Research Task" />
              </h2>
              <button onClick={() => setShowTaskModal(false)} className="text-ink-light hover:text-ink">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-ink-light uppercase tracking-wider mb-1.5">
                  <TranslatedText text="Task Description" />
                </label>
                <input 
                  type="text"
                  id="task-title"
                  placeholder={taskPlaceholder}
                  className="w-full bg-parchment-dark border border-parchment-border rounded-xl px-4 py-3 focus:border-saffron focus:outline-none transition-colors"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const input = e.currentTarget;
                      if (input.value.trim()) {
                        addTask(input.value.trim(), activeConvId || activeDocId || undefined, activeConvId ? 'conversation' : activeDocId ? 'document' : undefined);
                        setShowTaskModal(false);
                      }
                    }
                  }}
                />
              </div>
              
              {(activeConvId || activeDocId) && (
                <div className="p-3 bg-saffron/5 border border-saffron/20 rounded-lg flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-saffron/10 flex items-center justify-center text-saffron">
                    {activeConvId ? <MessageSquare className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-ink-light font-bold uppercase tracking-wider"><TranslatedText text="Link to current" /></p>
                    <p className="text-xs truncate font-medium">
                      {activeConvId ? activeConversation?.title : activeDocument?.name}
                    </p>
                  </div>
                </div>
              )}
            </div>
            <div className="p-6 bg-parchment-dark border-t border-parchment-border flex justify-end gap-3">
              <button 
                onClick={() => setShowTaskModal(false)}
                className="px-6 py-2 text-sm font-medium text-ink-light hover:text-ink transition-colors"
              >
                <TranslatedText text="Cancel" />
              </button>
              <button 
                onClick={() => {
                  const input = document.getElementById('task-title') as HTMLInputElement;
                  if (input.value.trim()) {
                    addTask(input.value.trim(), activeConvId || activeDocId || undefined, activeConvId ? 'conversation' : activeDocId ? 'document' : undefined);
                    setShowTaskModal(false);
                  }
                }}
                className="px-6 py-2 bg-saffron hover:bg-saffron-hover text-navy font-bold rounded-xl transition-colors shadow-lg shadow-saffron/20"
              >
                <TranslatedText text="Create Task" />
              </button>
            </div>
          </div>
        </div>
      )}
      {shareInfo && (
        <ShareModal
          isOpen={isShareOpen}
          onClose={() => setIsShareOpen(false)}
          shareUrl={`${window.location.origin}?share=${shareInfo.id}`}
          title={shareInfo.title}
          summary={shareInfo.summary}
        />
      )}

      {alertInfo && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-navy/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-parchment w-full max-w-sm rounded-2xl shadow-2xl border border-parchment-border overflow-hidden animate-in zoom-in-95">
            <div className="p-6 text-center">
              <div className="w-12 h-12 rounded-full bg-saffron/10 flex items-center justify-center text-saffron mx-auto mb-4">
                <AlertCircle className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-serif mb-2"><TranslatedText text={alertInfo.title} /></h3>
              <p className="text-sm text-ink-light mb-6"><TranslatedText text={alertInfo.message} /></p>
              <button 
                onClick={() => setAlertInfo(null)}
                className="w-full py-2 bg-saffron hover:bg-saffron-hover text-navy font-bold rounded-xl transition-colors"
              >
                <TranslatedText text="OK" />
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmInfo && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-navy/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-parchment w-full max-w-sm rounded-2xl shadow-2xl border border-parchment-border overflow-hidden animate-in zoom-in-95">
            <div className="p-6 text-center">
              <div className="w-12 h-12 rounded-full bg-danger/10 flex items-center justify-center text-danger mx-auto mb-4">
                <AlertCircle className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-serif mb-2"><TranslatedText text={confirmInfo.title} /></h3>
              <p className="text-sm text-ink-light mb-6"><TranslatedText text={confirmInfo.message} /></p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setConfirmInfo(null)}
                  className="flex-1 py-2 text-sm font-medium text-ink-light hover:text-ink transition-colors"
                >
                  <TranslatedText text="Cancel" />
                </button>
                <button 
                  onClick={() => { confirmInfo.onConfirm(); setConfirmInfo(null); }}
                  className="flex-1 py-2 bg-danger hover:bg-danger-hover text-white font-bold rounded-xl transition-colors shadow-lg shadow-danger/20"
                >
                  <TranslatedText text="Delete" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      <JoyrideAny
        steps={tourSteps}
        run={runTour}
        continuous
        showSkipButton
        showProgress
        callback={handleTourCallback}
        locale={{ skip: 'Skip Tour' }}
        styles={{
          options: {
            primaryColor: '#FF9933',
            textColor: '#2C1E16',
            backgroundColor: '#FFFFFF',
            arrowColor: '#FFFFFF',
            zIndex: 1000,
          },
          tooltipContainer: {
            textAlign: 'left',
            borderRadius: '16px',
            border: '1px solid #E2DCD0',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
          },
          buttonNext: {
            borderRadius: '8px',
            backgroundColor: '#FF9933',
            color: '#FFFFFF',
          },
          buttonBack: {
            marginRight: '10px',
            color: '#5C4E46',
          },
          buttonSkip: {
            color: '#D32F2F',
            fontWeight: 'bold',
          }
        }}
      />
    </div>
  );
}

function CitationGraph({ citations }: { citations: { source: string; target: string }[] }) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || !citations || citations.length === 0) return;

    const width = 800;
    const height = 400;
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const nodes = Array.from(new Set(citations.flatMap(c => [c.source, c.target]))).map(id => ({ id }));
    const links = citations.map(c => ({ source: c.source, target: c.target }));

    const simulation = d3.forceSimulation(nodes as any)
      .force("link", d3.forceLink(links).id((d: any) => d.id).distance(300)) // Increased distance
      .force("charge", d3.forceManyBody().strength(-1200)) // Stronger repulsion
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collide", d3.forceCollide().radius(120)); // Larger collision radius

    // Add arrow markers for directional citations
    svg.append("defs").selectAll("marker")
      .data(["end"])
      .join("marker")
      .attr("id", "arrowhead")
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", 28) // Offset to sit outside the node rect
      .attr("refY", 0)
      .attr("markerWidth", 5)
      .attr("markerHeight", 5)
      .attr("orient", "auto")
      .append("path")
      .attr("fill", "#4b5563")
      .attr("opacity", 0.6)
      .attr("d", "M0,-5L10,0L0,5");

    const link = svg.append("g")
      .selectAll("line")
      .data(links)
      .join("line")
      .attr("stroke", "#4b5563")
      .attr("stroke-opacity", 0.25)
      .attr("stroke-width", 1.5)
      .attr("marker-end", "url(#arrowhead)");

    const node = svg.append("g")
      .selectAll("circle")
      .data(nodes)
      .join("circle")
      .attr("r", 5)
      .attr("fill", "#FF9933")
      .attr("stroke", "#2C1E16")
      .attr("stroke-width", 1);

    const textGroup = svg.append("g")
      .selectAll("g")
      .data(nodes)
      .join("g");

    textGroup.append("rect")
      .attr("fill", "#FFFFFF")
      .attr("stroke", "#FF9933")
      .attr("stroke-width", 1.5)
      .attr("rx", 6)
      .attr("ry", 6)
      .style("filter", "drop-shadow(0px 2px 4px rgba(0,0,0,0.1))");

    textGroup.append("text")
      .text((d: any) => d.id)
      .attr("font-size", 16)
      .attr("font-family", "'Crimson Text', serif")
      .attr("font-weight", "bold")
      .attr("text-anchor", "middle")
      .attr("dy", ".35em")
      .attr("fill", "#2C1E16")
      .style("pointer-events", "none")
      .style("text-transform", "uppercase")
      .style("letter-spacing", "0.05em");

    // Size rects to fit text accurately
    textGroup.selectAll("rect")
      .attr("width", function(this: any) {
        const t = d3.select(this.parentNode).select("text").node() as SVGTextElement;
        return t.getBBox().width + 16;
      })
      .attr("height", 22)
      .attr("x", function(this: any) {
        const t = d3.select(this.parentNode).select("text").node() as SVGTextElement;
        return - (t.getBBox().width + 16) / 2;
      })
      .attr("y", -11);

    simulation.on("tick", () => {
      nodes.forEach((d: any) => {
        d.x = Math.max(120, Math.min(width - 120, d.x));
        d.y = Math.max(60, Math.min(height - 60, d.y));
      });

      link
        .attr("x1", (d: any) => d.source.x)
        .attr("y1", (d: any) => d.source.y)
        .attr("x2", (d: any) => d.target.x)
        .attr("y2", (d: any) => d.target.y);

      node
        .attr("cx", (d: any) => d.x)
        .attr("cy", (d: any) => d.y);

      textGroup
        .attr("transform", (d: any) => `translate(${d.x},${d.y})`);
    });

    // Run simulation for a bit to stabilize
    for (let i = 0; i < 100; ++i) simulation.tick();

    return () => {
      simulation.stop();
    };
  }, [citations]);

  return (
    <div className="relative overflow-hidden">
      <div className="absolute top-0 left-0 z-10">
        <p className="text-[9px] font-bold text-ink-light uppercase tracking-widest opacity-40">
          <TranslatedText text="Interactive Legal Network" />
        </p>
      </div>
      <svg 
        ref={svgRef} 
        viewBox="0 0 800 400" 
        className="w-full h-auto max-h-[500px]"
      />
      <div className="absolute bottom-0 right-0 text-right">
        <p className="text-[9px] italic text-ink-light opacity-40">
          <TranslatedText text="Nodes represent statutes; edges represent citations" />
        </p>
      </div>
    </div>
  );
}

function DriftCard({ 
  result, 
  user, 
  privateMode, 
  logActivity, 
  showAlert, 
  documentName,
  msgIdx,
  onFeedback,
  initialFeedback,
  conversationId,
  conversationTitle,
  onShare,
  documents,
  activeDocId
}: { 
  result: DriftResult, 
  user: User | null, 
  privateMode: boolean, 
  logActivity: (action: string, metadata?: any) => void, 
  showAlert: (title: string, message: string) => void,
  documentName?: string,
  msgIdx: number,
  onFeedback: (idx: number, rating: 'helpful' | 'unhelpful', comment?: string) => void,
  initialFeedback?: { rating: 'helpful' | 'unhelpful'; comment?: string },
  conversationId?: string,
  conversationTitle?: string,
  onShare?: (id: string, title: string, summary: string) => void,
  documents: any[],
  activeDocId: string | null
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [feedbackRating, setFeedbackRating] = useState<'helpful' | 'unhelpful' | null>(initialFeedback?.rating || null);
  const [feedbackComment, setFeedbackComment] = useState(initialFeedback?.comment || '');
  const [showCommentForm, setShowCommentForm] = useState(false);

  const overallScore = result.overall_score ?? result.drift_score;
  const scoreColor = getScoreColor(overallScore);
  const borderStyle = { borderColor: scoreColor + '33' };

  const exportPDF = async (result: DriftResult) => {
    setIsExporting(true);

    try {
      const doc = new jsPDF('p', 'mm', 'a4');
      const margin = 20;
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const contentWidth = pageWidth - 2 * margin;
      let yPos = margin;

      // Helper function to add text with wrapping and page breaks
      const addWrappedText = (text: string, fontSize: number, isBold: boolean, color: number[] = [0, 0, 0], align: 'left' | 'center' | 'justify' = 'left') => {
        doc.setFontSize(fontSize);
        doc.setFont('helvetica', isBold ? 'bold' : 'normal');
        doc.setTextColor(color[0], color[1], color[2]);
        
        const lines = doc.splitTextToSize(text || '', contentWidth);
        const textHeight = lines.length * fontSize * 0.4;
        
        if (yPos + textHeight > pageHeight - margin) {
          doc.addPage();
          yPos = margin;
        }

        if (align === 'center') {
          doc.text(text, pageWidth / 2, yPos, { align: 'center', maxWidth: contentWidth });
        } else if (align === 'justify') {
          doc.text(text, margin, yPos, { align: 'justify', maxWidth: contentWidth });
        } else {
          doc.text(text, margin, yPos, { maxWidth: contentWidth });
        }
        
        yPos += textHeight + fontSize * 0.2; // paragraph spacing
      };

      // Title
      addWrappedText(`Alignment Analysis: ${documentName || 'Document'}`, 18, true, [44, 30, 22], 'center');
      yPos += 10;

      // Intro
      addWrappedText("Namaste! I am Vidhi-Vichara, an AI legal alignment assistant created by researchers at IIT Jodhpur. I have analyzed the provided Reserve Bank of India directive against its parent legislation to determine its legal alignment.", 11, true, [44, 30, 22], 'justify');
      yPos += 8;

      // Statutory Authority and Alignment
      addWrappedText('Statutory Authority and Alignment', 14, true, [255, 153, 51]);
      yPos += 2;
      addWrappedText(result.pdf_statutory_authority || "Information not available.", 11, false, [60, 60, 60], 'justify');
      yPos += 8;

      // Key Changes and Compliance
      addWrappedText('Key Changes and Compliance', 14, true, [255, 153, 51]);
      yPos += 2;
      addWrappedText(result.pdf_overview || "Information not available.", 11, false, [60, 60, 60], 'justify');
      yPos += 8;

      // Alignment Verdict
      addWrappedText(result.pdf_conclusion || "Information not available.", 11, true, [44, 30, 22], 'justify');
      yPos += 12;

      // Add Visuals on Page 2
      doc.addPage();
      yPos = margin;
      
      const { toJpeg } = await import('html-to-image');
      
      const addVisual = async (elementId: string, title: string) => {
        const el = document.getElementById(elementId) || document.querySelector(`[data-pdf-visual="${elementId}"]`) as HTMLElement;
        if (el) {
          if (yPos > pageHeight - margin - 60) {
            doc.addPage();
            yPos = margin;
          }
          
          addWrappedText(title, 14, true, [44, 30, 22]);
          yPos += 5;
          
          const dataUrl = await toJpeg(el, { 
            pixelRatio: 1.5,
            quality: 0.9,
            backgroundColor: '#F4F1EA',
            style: { transform: 'scale(1)', transformOrigin: 'top left' }
          });
          
          const img = new Image();
          img.src = dataUrl;
          await new Promise((resolve) => { img.onload = resolve; });
          
          const imgHeight = (img.height * contentWidth) / img.width;
          
          if (yPos + imgHeight > pageHeight - margin) {
            doc.addPage();
            yPos = margin;
          }
          
          doc.addImage(dataUrl, 'JPEG', margin, yPos, contentWidth, imgHeight);
          yPos += imgHeight + 15;
        }
      };

      await addVisual('pdf-charts-container', 'Alignment Analyses');
      await addVisual('citation-graph', 'Citation Graph');
      await addVisual('chain-of-authority', 'Chain of Authority');

      // Disclaimer
      if (yPos > pageHeight - margin - 20) {
        doc.addPage();
        yPos = margin;
      }
      yPos += 10;
      addWrappedText('⚖️ This analysis is for informational purposes only and does not constitute legal advice. Please consult a qualified legal professional for specific legal matters.', 9, false, [100, 100, 100], 'center');

      doc.save(`Report_${conversationId || 'analysis'}.pdf`);
      
      if (!privateMode && user) {
        try {
          await addDoc(collection(db, 'reports'), {
            userId: user.uid,
            driftResult: result,
            createdAt: serverTimestamp(),
            type: 'pdf_export',
            documentName: documentName || null
          });
          logActivity('export_pdf', { score: result.drift_score, documentName });
        } catch (e) {
          console.error("Failed to save report to history", e);
        }
      }
    } catch (err) {
      console.error("PDF Export failed:", err);
      showAlert("Export Failed", "Failed to generate PDF report. Please try again.");
    } finally {
      setIsExporting(false);
    }
  };

  const handleFeedback = (rating: 'helpful' | 'unhelpful') => {
    setFeedbackRating(rating);
    onFeedback(msgIdx, rating, feedbackComment);
  };

  const submitComment = () => {
    if (feedbackRating) {
      onFeedback(msgIdx, feedbackRating, feedbackComment);
      setShowCommentForm(false);
    }
  };

  return (
    <div className="mb-8">
      <div ref={cardRef} data-report-card className="rounded-2xl border-2 overflow-hidden bg-parchment shadow-lg transition-all hover:shadow-xl" style={borderStyle}>
        <div className="p-10 space-y-10 text-sm leading-relaxed font-serif">
          
          {/* Intro Banner */}
          <div className="p-6 bg-saffron/10 rounded-xl border border-saffron/30">
            <p className="text-lg text-ink font-medium italic">
              "Namaste! I am Vidhi-Vichara, an AI legal alignment assistant created by researchers at IIT Jodhpur. I have analyzed the provided Reserve Bank of India directive against its parent legislation to determine its legal alignment."
            </p>
          </div>

          {/* Statutory Authority and Alignment */}
          <div className="space-y-4">
            <h3 className="text-xl font-bold text-[#FF9933] border-b-2 border-[#FF9933]/20 pb-2">Statutory Authority and Alignment</h3>
            <p className="text-base text-ink text-justify">
              {result.pdf_statutory_authority || "Information not available."}
            </p>
          </div>

          {/* Key Changes and Compliance */}
          <div className="space-y-4">
            <h3 className="text-xl font-bold text-[#FF9933] border-b-2 border-[#FF9933]/20 pb-2">Key Changes and Compliance</h3>
            <p className="text-base text-ink text-justify">
              {result.pdf_overview || "Information not available."}
            </p>
          </div>

          {/* Alignment Verdict */}
          <div className="space-y-4">
            <p className="text-base text-ink text-justify font-medium">
              {result.pdf_conclusion || "Information not available."}
            </p>
          </div>

          {/* Visuals */}
          <div className="pt-8 border-t border-parchment-border/50 space-y-10">
            <AnalysisDashboard data={result} hideDownload={true} />
            
            {result.citations?.length > 0 && (
              <div data-pdf-visual="citation-graph" className="bg-white/40 rounded-3xl border border-parchment-border shadow-sm overflow-hidden p-6">
                <h4 className="flex items-center gap-2 font-bold text-ink mb-6 text-base justify-center">
                  <Network className="w-5 h-5 text-saffron" /> Citation Graph
                </h4>
                <CitationGraph citations={result.citations} />
              </div>
            )}

            {result.chain_of_authority && (
              <div data-pdf-visual="chain-of-authority" className="bg-white/40 rounded-3xl border border-parchment-border shadow-sm overflow-hidden p-6">
                <h4 className="flex items-center gap-2 font-bold text-ink mb-8 text-base justify-center">
                  <Info className="w-5 h-5 text-saffron" /> Chain of Authority
                </h4>
                <div className="flex flex-col items-center gap-2">
                  {result.chain_of_authority.split(/->|\n/).map((node, i, arr) => (
                    <React.Fragment key={i}>
                      <div className="px-6 py-3 bg-white border-2 border-saffron rounded-xl text-ink font-bold text-center shadow-sm">
                        {node.trim()}
                      </div>
                      {i < arr.length - 1 && (
                        <div className="text-saffron font-bold text-xl">↓</div>
                      )}
                    </React.Fragment>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Disclaimer */}
          <div className="pt-8 border-t border-parchment-border/50 text-center">
            <p className="text-xs text-ink-light/80 italic">
              ⚖️ This analysis is for informational purposes only and does not constitute legal advice. Please consult a qualified legal professional for specific legal matters.
            </p>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-4 mt-4">
        <button 
          onClick={() => exportPDF(result)}
          disabled={isExporting}
          className={cn(
            "flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-3 rounded-xl transition-all shadow-md hover:shadow-lg font-bold text-sm",
            isExporting 
              ? "bg-parchment-dark text-ink-light cursor-not-allowed" 
              : "bg-ink text-parchment hover:bg-saffron hover:text-navy"
          )}
        >
          {isExporting ? (
            <div className="w-4 h-4 border-2 border-ink-light border-t-transparent rounded-full animate-spin" />
          ) : (
            <Download className="w-4 h-4" />
          )}
          <TranslatedText text={isExporting ? "Generating Report..." : "Download Detailed PDF Report"} />
        </button>

        {conversationId && onShare && !privateMode && (
          <button 
            onClick={() => onShare(conversationId, conversationTitle || 'Analysis Report', '')}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-white border-2 border-parchment-border text-ink hover:border-saffron hover:text-saffron transition-all shadow-md hover:shadow-lg font-bold text-sm"
          >
            <Share2 className="w-4 h-4" />
            <TranslatedText text="Share Analysis" />
          </button>
        )}
      </div>
    </div>
  );
}
