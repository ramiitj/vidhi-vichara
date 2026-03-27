import React, { useState } from 'react';
import { X, Copy, Check, Share2, MessageCircle, Twitter, Linkedin, Globe } from 'lucide-react';
import { TranslatedText } from './contexts/LanguageContext';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  shareUrl: string;
  title: string;
  summary?: string;
}

export const ShareModal: React.FC<ShareModalProps> = ({ isOpen, onClose, shareUrl, title, summary }) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const shareText = `Check out this legal alignment analysis on Vidhi-Vichara: ${title}\n\n${summary ? summary.slice(0, 200) + '...' : ''}\n\nView full analysis: ${shareUrl}\n\nPowered by Vidhi-Vichara: ${window.location.origin}`;

  const socialLinks = [
    {
      name: 'WhatsApp',
      icon: <MessageCircle className="w-5 h-5" />,
      color: 'bg-[#25D366]',
      url: `https://wa.me/?text=${encodeURIComponent(shareText)}`
    },
    {
      name: 'Twitter',
      icon: <Twitter className="w-5 h-5" />,
      color: 'bg-[#1DA1F2]',
      url: `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`
    },
    {
      name: 'LinkedIn',
      icon: <Linkedin className="w-5 h-5" />,
      color: 'bg-[#0077B5]',
      url: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`
    }
  ];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-navy/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-parchment w-full max-w-md rounded-2xl shadow-2xl border border-parchment-border overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-6 border-b border-parchment-border flex items-center justify-between bg-parchment-dark/30">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-saffron/20 flex items-center justify-center text-saffron">
              <Share2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-ink leading-tight"><TranslatedText text="Share Analysis" /></h3>
              <p className="text-[10px] text-ink-light uppercase tracking-widest font-bold opacity-60"><TranslatedText text="Public Sharing" /></p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-parchment-dark rounded-full transition-colors">
            <X className="w-5 h-5 text-ink-light" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="space-y-2">
            <label className="text-xs font-bold text-ink-light uppercase tracking-widest"><TranslatedText text="Analysis Title" /></label>
            <div className="p-3 bg-white rounded-xl border border-parchment-border text-sm text-ink font-medium">
              {title}
            </div>
          </div>

          <div className="space-y-3">
            <label className="text-xs font-bold text-ink-light uppercase tracking-widest"><TranslatedText text="Share on Social Media" /></label>
            <div className="grid grid-cols-3 gap-3">
              {socialLinks.map((link) => (
                <a
                  key={link.name}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    "flex flex-col items-center justify-center gap-2 p-4 rounded-xl text-white transition-transform hover:scale-105 active:scale-95",
                    link.color
                  )}
                >
                  {link.icon}
                  <span className="text-[10px] font-bold uppercase tracking-wider">{link.name}</span>
                </a>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-ink-light uppercase tracking-widest"><TranslatedText text="Direct Link" /></label>
            <div className="flex gap-2">
              <div className="flex-1 p-3 bg-white rounded-xl border border-parchment-border text-xs text-ink-light truncate font-mono">
                {shareUrl}
              </div>
              <button
                onClick={handleCopy}
                className={cn(
                  "px-4 rounded-xl font-bold text-xs transition-all flex items-center gap-2 shrink-0",
                  copied ? "bg-success text-white" : "bg-ink text-parchment hover:bg-saffron hover:text-navy"
                )}
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copied ? <TranslatedText text="Copied" /> : <TranslatedText text="Copy" />}
              </button>
            </div>
          </div>

          <div className="p-4 bg-saffron/10 rounded-xl border border-saffron/20 flex gap-3">
            <Globe className="w-5 h-5 text-saffron shrink-0" />
            <p className="text-[11px] text-ink-light leading-relaxed">
              <span className="font-bold text-saffron"><TranslatedText text="Public Access:" /></span>{' '}
              <TranslatedText text="Anyone with this link can view this specific analysis summary and visualization. Your other conversations remain private." />
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
