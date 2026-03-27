import React, { useState, useEffect } from 'react';
import { db } from './firebase';
import { collection, query, onSnapshot, addDoc, serverTimestamp, doc, updateDoc } from 'firebase/firestore';
import { Settings, Users, Database, ExternalLink, Upload, FileText, CheckCircle, ArrowLeft } from 'lucide-react';
import { generateEmbeddings } from './geminiService';
import { TranslatedText } from './contexts/LanguageContext';

export default function AdminPanel() {
  const [activeTab, setActiveTab] = useState<'settings' | 'knowledgebase' | 'users'>('settings');
  const [settings, setSettings] = useState({
    systemPrompt: '',
    themeColor: '#D4A843'
  });
  const [kbDocs, setKbDocs] = useState<any[]>([]);
  const [conversations, setConversations] = useState<any[]>([]);
  const [userUploads, setUserUploads] = useState<any[]>([]);
  const [userActivity, setUserActivity] = useState<any[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    // Fetch settings
    const unsubSettings = onSnapshot(doc(db, 'settings', 'global'), (doc) => {
      if (doc.exists()) {
        setSettings(doc.data() as any);
      }
    });

    // Fetch knowledgebase
    const unsubKb = onSnapshot(collection(db, 'knowledgebase'), (snap) => {
      setKbDocs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // Fetch conversations
    const unsubConvs = onSnapshot(collection(db, 'conversations'), (snap) => {
      setConversations(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // Fetch user uploads
    const unsubUploads = onSnapshot(collection(db, 'documents'), (snap) => {
      setUserUploads(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // Fetch user activity
    const unsubActivity = onSnapshot(collection(db, 'user_activity'), (snap) => {
      setUserActivity(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // Fetch reports
    const unsubReports = onSnapshot(collection(db, 'reports'), (snap) => {
      setReports(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => {
      unsubSettings();
      unsubKb();
      unsubConvs();
      unsubUploads();
      unsubActivity();
      unsubReports();
    };
  }, []);

  const handleSaveSettings = async () => {
    setIsSaving(true);
    try {
      await updateDoc(doc(db, 'settings', 'global'), settings);
    } catch (error: any) {
      if (error.code === 'not-found') {
        // Create if doesn't exist
        await addDoc(collection(db, 'settings'), settings);
      }
    }
    setIsSaving(false);
  };

  const handleUploadKb = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('files', file);

      const res = await fetch('/api/parse-pdf', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();

      if (data.success && data.textContent) {
        const fullText = data.textContent;
        const fileName = file.name;

        // Chunk the text
        const allChunks = [];
        const CHUNK_SIZE = 2000;
        const OVERLAP = 300;
        for (let i = 0; i < fullText.length; i += CHUNK_SIZE - OVERLAP) {
          allChunks.push({
            docName: fileName,
            text: fullText.slice(i, i + CHUNK_SIZE),
            index: allChunks.length,
          });
        }

        // Generate embeddings for chunks (batching them)
        const BATCH_SIZE = 200;
        for (let i = 0; i < allChunks.length; i += BATCH_SIZE) {
          const batch = allChunks.slice(i, i + BATCH_SIZE);
          const embeddings = await generateEmbeddings(batch.map(c => c.text));
          batch.forEach((chunk, idx) => {
            chunk.embedding = embeddings[idx] || [];
          });
        }

        // Store chunks in Firestore
        const collectionName = 'knowledgebase_chunks';
        for (const chunk of allChunks) {
          await addDoc(collection(db, collectionName), {
            ...chunk,
            userId: 'global',
            createdAt: serverTimestamp()
          });
        }

        await addDoc(collection(db, 'knowledgebase'), {
          name: file.name,
          uploadedAt: serverTimestamp(),
          chunksCount: allChunks.length
        });
      }
    } catch (error) {
      console.error("Upload failed", error);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-parchment text-ink p-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6">
          <a href="/" className="inline-flex items-center gap-2 text-ink-light hover:text-saffron transition-colors">
            <ArrowLeft className="w-5 h-5" />
            <span><TranslatedText text="Back to Chat" /></span>
          </a>
        </div>
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-serif text-saffron"><TranslatedText text="Admin Dashboard" /></h1>
          <a 
            href="https://console.cloud.google.com/billing" 
            target="_blank" 
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-ink-light hover:text-ink transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            <TranslatedText text="Billing & Expenses" />
          </a>
        </div>

        <div className="flex gap-8">
          {/* Sidebar */}
          <div className="w-64 shrink-0 space-y-2">
            <button
              onClick={() => setActiveTab('settings')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${activeTab === 'settings' ? 'bg-saffron text-navy font-semibold' : 'hover:bg-parchment-dark text-ink-light'}`}
            >
              <Settings className="w-5 h-5" />
              <TranslatedText text="Settings & Branding" />
            </button>
            <button
              onClick={() => setActiveTab('knowledgebase')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${activeTab === 'knowledgebase' ? 'bg-saffron text-navy font-semibold' : 'hover:bg-parchment-dark text-ink-light'}`}
            >
              <Database className="w-5 h-5" />
              <TranslatedText text="Parent Acts / RAG" />
            </button>
            <button
              onClick={() => setActiveTab('users')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${activeTab === 'users' ? 'bg-saffron text-navy font-semibold' : 'hover:bg-parchment-dark text-ink-light'}`}
            >
              <Users className="w-5 h-5" />
              <TranslatedText text="Users & Behavior" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 bg-parchment-dark border border-parchment-border rounded-2xl p-6">
            {activeTab === 'settings' && (
              <div className="space-y-6">
                <h2 className="text-xl font-semibold mb-4"><TranslatedText text="System Settings" /></h2>
                
                <div>
                  <label className="block text-sm text-ink-light mb-2"><TranslatedText text="Theme Color (Hex)" /></label>
                  <div className="flex items-center gap-4">
                    <input 
                      type="color" 
                      value={settings.themeColor}
                      onChange={(e) => setSettings({...settings, themeColor: e.target.value})}
                      className="w-12 h-12 rounded cursor-pointer bg-transparent border-none p-0"
                    />
                    <input 
                      type="text" 
                      value={settings.themeColor}
                      onChange={(e) => setSettings({...settings, themeColor: e.target.value})}
                      className="bg-parchment border border-parchment-border rounded-lg px-4 py-2 focus:border-saffron focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm text-ink-light mb-2"><TranslatedText text="Global System Prompt" /></label>
                  <textarea 
                    value={settings.systemPrompt}
                    onChange={(e) => setSettings({...settings, systemPrompt: e.target.value})}
                    className="w-full h-64 bg-parchment border border-parchment-border rounded-lg p-4 focus:border-saffron focus:outline-none font-mono text-sm"
                    placeholder="Enter the system prompt for Gemini..."
                  />
                </div>

                <button 
                  onClick={handleSaveSettings}
                  disabled={isSaving}
                  className="bg-saffron text-navy px-6 py-2 rounded-lg font-semibold hover:bg-saffron-hover transition-colors disabled:opacity-50"
                >
                  {isSaving ? <TranslatedText text="Saving..." /> : <TranslatedText text="Save Settings" />}
                </button>
              </div>
            )}

            {activeTab === 'knowledgebase' && (
              <div>
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-semibold"><TranslatedText text="Parent Legislation Knowledge Base" /></h2>
                  <label className="cursor-pointer bg-saffron text-navy px-4 py-2 rounded-lg font-semibold hover:bg-saffron-hover transition-colors flex items-center gap-2">
                    <Upload className="w-4 h-4" />
                    {isUploading ? <TranslatedText text="Uploading..." /> : <TranslatedText text="Upload Parent Act / Legislation" />}
                    <input type="file" className="hidden" onChange={handleUploadKb} accept=".pdf,.txt" disabled={isUploading} />
                  </label>
                </div>
                <p className="text-ink-light mb-6 text-sm">
                  <TranslatedText text="Documents uploaded here will be used to ground the AI's analyses (RAG) across all users." />
                </p>

                <div className="space-y-3">
                  {kbDocs.map(doc => (
                    <div key={doc.id} className="flex items-center justify-between p-4 bg-parchment rounded-xl border border-parchment-border">
                      <div className="flex items-center gap-3">
                        <FileText className="w-5 h-5 text-saffron" />
                        <span>{doc.name}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-ink-light">
                        <CheckCircle className="w-4 h-4 text-success" />
                        {doc.chunksCount || 0} <TranslatedText text="chunks indexed" />
                      </div>
                    </div>
                  ))}
                  {kbDocs.length === 0 && (
                    <div className="text-center py-12 text-ink-light border border-dashed border-parchment-border rounded-xl">
                      <TranslatedText text="No documents in knowledgebase yet." />
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'users' && (
              <div className="space-y-8">
                <div>
                  <h2 className="text-xl font-semibold mb-6"><TranslatedText text="User Conversations" /></h2>
                  <div className="space-y-4">
                    {conversations.map(conv => (
                      <div key={conv.id} className="p-4 bg-parchment rounded-xl border border-parchment-border">
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="font-semibold">{conv.title}</h3>
                          <span className="text-xs text-ink-light"><TranslatedText text="User:" /> {conv.userId}</span>
                        </div>
                        <p className="text-sm text-ink-light">
                          {conv.messages?.length || 0} <TranslatedText text="messages" /> • <TranslatedText text="Context:" /> {conv.documentName || <TranslatedText text="None" />}
                        </p>
                      </div>
                    ))}
                    {conversations.length === 0 && (
                      <div className="text-center py-12 text-ink-light border border-dashed border-parchment-border rounded-xl">
                        <TranslatedText text="No user conversations yet." />
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <h2 className="text-xl font-semibold mb-6"><TranslatedText text="User Uploads" /></h2>
                  <div className="space-y-4">
                    {userUploads.map(doc => (
                      <div key={doc.id} className="p-4 bg-parchment rounded-xl border border-parchment-border">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-3">
                            <FileText className="w-5 h-5 text-saffron" />
                            <h3 className="font-semibold">{doc.name}</h3>
                          </div>
                          <span className="text-xs text-ink-light"><TranslatedText text="User:" /> {doc.userId}</span>
                        </div>
                        <p className="text-sm text-ink-light">
                          {doc.pageCount || 0} <TranslatedText text="pages" /> • <TranslatedText text="Status:" /> {doc.status}
                        </p>
                      </div>
                    ))}
                    {userUploads.length === 0 && (
                      <div className="text-center py-12 text-ink-light border border-dashed border-parchment-border rounded-xl">
                        <TranslatedText text="No user uploads yet." />
                      </div>
                    )}
                  </div>
                </div>
                <div>
                  <h2 className="text-xl font-semibold mb-6"><TranslatedText text="User Reports (PDF Exports)" /></h2>
                  <div className="space-y-4">
                    {reports.map(report => (
                      <div key={report.id} className="p-4 bg-parchment rounded-xl border border-parchment-border">
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="font-semibold"><TranslatedText text="Drift Score:" /> {report.driftResult?.drift_score}</h3>
                          <span className="text-xs text-ink-light"><TranslatedText text="User:" /> {report.userId}</span>
                        </div>
                        <p className="text-sm text-ink-light">
                          <TranslatedText text="Status:" /> {report.driftResult?.alignment_status}
                        </p>
                      </div>
                    ))}
                    {reports.length === 0 && (
                      <div className="text-center py-12 text-ink-light border border-dashed border-parchment-border rounded-xl">
                        <TranslatedText text="No reports generated yet." />
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <h2 className="text-xl font-semibold mb-6"><TranslatedText text="User Activity" /></h2>
                  <div className="space-y-4">
                    {userActivity.map(activity => (
                      <div key={activity.id} className="p-4 bg-parchment rounded-xl border border-parchment-border">
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="font-semibold capitalize">{activity.action.replace('_', ' ')}</h3>
                          <span className="text-xs text-ink-light"><TranslatedText text="User:" /> {activity.userId}</span>
                        </div>
                        <p className="text-sm text-ink-light">
                          {JSON.stringify(activity.metadata)}
                        </p>
                      </div>
                    ))}
                    {userActivity.length === 0 && (
                      <div className="text-center py-12 text-ink-light border border-dashed border-parchment-border rounded-xl">
                        <TranslatedText text="No user activity logged yet." />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
