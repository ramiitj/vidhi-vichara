import React from 'react';
import { ArrowLeft, Heart, Globe, Shield, HeartHandshake } from 'lucide-react';
import { TranslatedText } from './contexts/LanguageContext';

export default function About() {
  return (
    <div className="min-h-screen bg-navy text-text-primary overflow-y-auto">
      <header className="h-14 border-b border-navy-border flex items-center px-4 gap-4 sticky top-0 bg-navy/90 backdrop-blur z-10">
        <a href="/" className="flex items-center gap-2 text-text-secondary hover:text-saffron transition-colors">
          <ArrowLeft className="w-5 h-5" />
          <span><TranslatedText text="Back to Chat" /></span>
        </a>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12 space-y-16">
        <section className="text-center space-y-6">
          <h1 className="text-4xl md:text-5xl font-serif text-saffron"><TranslatedText text="Democratizing Legal Knowledge for Bharat" /></h1>
          <p className="text-lg text-text-secondary leading-relaxed max-w-2xl mx-auto">
            <TranslatedText text="Vidhi-Vichara is more than just an app—it's a mission. Built to give every Indian instant, accessible, and accurate legal guidance in their own language." />
          </p>
        </section>

        <section className="bg-navy-light border border-navy-border rounded-2xl p-8 space-y-4">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-16 h-16 bg-saffron/10 rounded-full flex items-center justify-center text-saffron font-serif text-2xl">
              VR
            </div>
            <div>
              <h2 className="text-2xl font-serif">Venkat Ram Reddy Ganuthula</h2>
              <p className="text-text-secondary"><TranslatedText text="Creator & Founder" /></p>
            </div>
          </div>
          <p className="text-lg leading-relaxed">
            <TranslatedText text="Passionate about social impact, believes in building Solutions for Bharat." />
          </p>
        </section>

        <section className="space-y-8">
          <h2 className="text-2xl font-serif text-center mb-10"><TranslatedText text="Our Pillars" /></h2>
          
          <div className="grid md:grid-cols-3 gap-6">
            <div className="bg-navy-light border border-navy-border p-6 rounded-2xl space-y-4 hover:border-saffron/50 transition-colors">
              <Globe className="w-8 h-8 text-saffron" />
              <h3 className="text-xl font-semibold"><TranslatedText text="Inclusive Technology" /></h3>
              <p className="text-text-secondary leading-relaxed">
                <TranslatedText text="Breaking language barriers with support for 23 Indian languages, making legal information accessible to every citizen." />
              </p>
            </div>

            <div className="bg-navy-light border border-navy-border p-6 rounded-2xl space-y-4 hover:border-saffron/50 transition-colors">
              <Shield className="w-8 h-8 text-saffron" />
              <h3 className="text-xl font-semibold"><TranslatedText text="Empowerment" /></h3>
              <p className="text-text-secondary leading-relaxed">
                <TranslatedText text="Turning confusing legal jargon into simple, actionable advice that anyone can understand." />
              </p>
            </div>

            <div className="bg-navy-light border border-navy-border p-6 rounded-2xl space-y-4 hover:border-saffron/50 transition-colors">
              <HeartHandshake className="w-8 h-8 text-saffron" />
              <h3 className="text-xl font-semibold"><TranslatedText text="Served with Empathy" /></h3>
              <p className="text-text-secondary leading-relaxed">
                <TranslatedText text="An AI companion that listens first, understands your situation, and provides guidance with care." />
              </p>
            </div>
          </div>
        </section>

        <footer className="text-center pt-12 border-t border-navy-border text-text-secondary flex items-center justify-center gap-2">
          <TranslatedText text="Built with" /> <Heart className="w-4 h-4 text-red-500 fill-current" /> <TranslatedText text="for Bharat by Venkat Ram Reddy Ganuthula" />
        </footer>
      </main>
    </div>
  );
}
