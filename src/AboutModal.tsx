import React from 'react';
import { Heart, Globe, Shield, HeartHandshake, BookOpen, Target, User, Award, Eye, Zap, Users } from 'lucide-react';
import { Modal } from './components/Modal';
import { TranslatedText } from './contexts/LanguageContext';

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AboutModal({ isOpen, onClose }: AboutModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={<TranslatedText text="About Vidhi-Vichara" />}>
      <div className="space-y-12 text-ink">
        <section className="text-center space-y-6">
          <BookOpen className="w-16 h-16 mx-auto text-saffron" />
          <h1 className="text-3xl md:text-4xl font-serif text-saffron font-bold"><TranslatedText text="Democratizing Legal Knowledge for Bharat" /></h1>
          <p className="text-lg text-ink-light leading-relaxed max-w-3xl mx-auto">
            <TranslatedText text="Vidhi-Vichara is an AI-powered platform designed to bridge the gap between complex laws and ordinary citizens. Its core objective is to make executive actions, rules, notifications, and guidelines transparent by analyzing their alignment with the original intent of legislation passed by Parliament and State Legislatures." />
          </p>
          <p className="text-lg text-ink-light leading-relaxed max-w-3xl mx-auto">
            <TranslatedText text="By detecting 'executive drift' in real time and presenting clear, visual, and easy-to-understand insights, Vidhi-Vichara empowers citizens, officers, researchers, and policymakers to ensure governance remains faithful to the spirit of the Indian Constitution." />
          </p>
        </section>

        <section className="space-y-8">
          <div className="flex items-center gap-3 mb-6">
            <Target className="w-6 h-6 text-saffron" />
            <h2 className="text-2xl font-serif font-bold"><TranslatedText text="Our Objectives" /></h2>
          </div>
          <div className="grid md:grid-cols-1 gap-4">
            {[
              "Enable every Indian to understand how rules and notifications relate to the parent laws",
              "Promote transparency and accountability in executive rule-making",
              "Reduce legal confusion through simple explanations and visual drift analysis",
              "Support better compliance and informed decision-making for citizens and government departments",
              "Build a public good tool that can eventually be adopted and strengthened by the system itself"
            ].map((obj, i) => (
              <div key={i} className="flex items-start gap-3 bg-parchment-dark/50 p-4 rounded-xl border border-parchment-border/30">
                <div className="w-1.5 h-1.5 rounded-full bg-saffron mt-2 shrink-0" />
                <p className="text-ink-light"><TranslatedText text={obj} /></p>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-parchment-dark border border-parchment-border rounded-2xl p-8 space-y-6">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-16 h-16 bg-saffron/10 rounded-full flex items-center justify-center text-saffron font-serif text-2xl font-bold border-2 border-saffron/20">
              VR
            </div>
            <div>
              <h2 className="text-2xl font-serif font-bold">
                <a 
                  href="https://www.linkedin.com/in/ganuthula/" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="hover:text-saffron transition-colors underline decoration-saffron/30 underline-offset-4"
                >
                  Venkat Ram Reddy Ganuthula
                </a>
              </h2>
              <p className="text-ink-light font-medium"><TranslatedText text="Creator & Founder" /></p>
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-ink-light">
              <Award className="w-4 h-4 text-saffron" />
              <p><TranslatedText text="Assistant Professor, IIT Jodhpur" /></p>
            </div>
            <div className="flex items-start gap-2 text-ink-light">
              <Heart className="w-4 h-4 text-saffron mt-1 shrink-0" />
              <p><TranslatedText text="Passionate about using technology for social impact and building solutions rooted in Bharat." /></p>
            </div>
          </div>
        </section>

        <section className="space-y-8">
          <div className="flex items-center gap-3 mb-6">
            <Zap className="w-6 h-6 text-saffron" />
            <h2 className="text-2xl font-serif font-bold"><TranslatedText text="Our Pillars" /></h2>
          </div>
          
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-parchment-dark border border-parchment-border p-6 rounded-2xl space-y-4 hover:border-saffron/50 transition-colors">
              <Globe className="w-8 h-8 text-saffron" />
              <h3 className="text-xl font-semibold"><TranslatedText text="Inclusive Technology" /></h3>
              <p className="text-ink-light leading-relaxed">
                <TranslatedText text="Making legal analysis accessible in multiple Indian languages" />
              </p>
            </div>

            <div className="bg-parchment-dark border border-parchment-border p-6 rounded-2xl space-y-4 hover:border-saffron/50 transition-colors">
              <Eye className="w-8 h-8 text-saffron" />
              <h3 className="text-xl font-semibold"><TranslatedText text="Transparency" /></h3>
              <p className="text-ink-light leading-relaxed">
                <TranslatedText text="Clearly showing how executive actions align (or drift) from original legislation" />
              </p>
            </div>

            <div className="bg-parchment-dark border border-parchment-border p-6 rounded-2xl space-y-4 hover:border-saffron/50 transition-colors">
              <Shield className="w-8 h-8 text-saffron" />
              <h3 className="text-xl font-semibold"><TranslatedText text="Simplicity" /></h3>
              <p className="text-ink-light leading-relaxed">
                <TranslatedText text="Converting complex legal comparisons into understandable text and visual reports" />
              </p>
            </div>

            <div className="bg-parchment-dark border border-parchment-border p-6 rounded-2xl space-y-4 hover:border-saffron/50 transition-colors">
              <Users className="w-8 h-8 text-saffron" />
              <h3 className="text-xl font-semibold"><TranslatedText text="Public Good" /></h3>
              <p className="text-ink-light leading-relaxed">
                <TranslatedText text="Built as a not-for-profit initiative, designed to serve citizens and strengthen governance" />
              </p>
            </div>
          </div>
        </section>

        <footer className="text-center pt-8 border-t border-parchment-border text-ink-light flex items-center justify-center gap-2">
          <TranslatedText text="Built with" /> <Heart className="w-4 h-4 text-danger fill-current" /> <TranslatedText text="for Bharat by Venkat Ram Reddy Ganuthula" />
        </footer>
      </div>
    </Modal>
  );
}
