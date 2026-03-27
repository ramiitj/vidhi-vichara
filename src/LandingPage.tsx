import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowRight } from 'lucide-react';
import { TranslatedText } from './contexts/LanguageContext';

export default function LandingPage({ onNavigate }: { onNavigate: () => void }) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const STATIC_IMAGE_URL = 'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?q=80&w=2000&auto=format&fit=crop';

  useEffect(() => {
    setImageUrl(STATIC_IMAGE_URL);
    setLoading(false);
  }, []);

  return (
    <div className="h-screen w-screen bg-stone-900 text-white flex flex-col items-center justify-center relative overflow-hidden">
      {/* Background Image */}
      {imageUrl && (
        <div className="absolute inset-0 z-0">
          <motion.img
            initial={{ opacity: 0, scale: 1.1 }}
            animate={{ opacity: 0.6, scale: 1 }}
            transition={{ duration: 1.5 }}
            src={imageUrl}
            alt="Indian Constitution Background"
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-stone-900/40 via-stone-900/60 to-stone-900" />
        </div>
      )}

      <div className="max-w-4xl w-full text-center space-y-8 relative z-10 p-6">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="space-y-6"
        >
          <div className="flex justify-center">
            <div className="h-1 bg-saffron w-24 rounded-full opacity-50" />
          </div>
          
          <h1 className="text-5xl md:text-7xl font-serif font-bold tracking-tight text-white drop-shadow-lg">
            <TranslatedText text="Vidhi-Vichara" />
          </h1>

          <div className="h-12 flex items-center justify-center overflow-hidden">
            <div className="text-2xl font-serif text-saffron/80 italic">
              <TranslatedText text="Welcome" />
            </div>
          </div>
          
          <p className="text-xl md:text-2xl text-stone-200 leading-relaxed max-w-2xl mx-auto font-light">
            <TranslatedText text="Protecting the basic values of the constitution and legislative aspects. Evaluate executive actions against pertinent laws with precision and integrity." />
          </p>
          
          <div className="pt-8">
            <button 
              onClick={onNavigate}
              className="group inline-flex items-center gap-3 bg-saffron text-navy px-8 py-4 rounded-full text-xl font-bold hover:bg-saffron-hover transition-all transform hover:scale-105 shadow-2xl"
            >
              <TranslatedText text="Enter Application" /> 
              <ArrowRight size={24} className="group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        </motion.div>
      </div>

      {/* Decorative elements */}
      <div className="absolute bottom-0 left-0 w-full h-32 bg-gradient-to-t from-stone-900 to-transparent z-10" />
    </div>
  );
}
