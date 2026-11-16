import { useState } from 'react';
import { X, Sparkles, Loader2, BookOpen } from 'lucide-react';
import { ANATOMICAL_CATALOG } from '@/anatomy/catalog';
import { ANATOMICAL_SYSTEMS } from '@/anatomy/types';
import { api } from '@/services/api';

interface InspectionDrawerProps {
  partId: string | null;
  onClose: () => void;
  onIsolateSystem: (system: (typeof ANATOMICAL_SYSTEMS)[number]['id']) => void;
}

export function InspectionDrawer({
  partId,
  onClose,
  onIsolateSystem,
}: InspectionDrawerProps) {
  const [aiText, setAiText] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState<boolean>(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiCitations, setAiCitations] = useState<
    Array<{ document_id: string; title: string }>
  >([]);
  const [aiProvider, setAiProvider] = useState<string | null>(null);
  const [showAi, setShowAi] = useState<boolean>(false);

  if (!partId) return null;
  const info = ANATOMICAL_CATALOG[partId];
  if (!info) return null;

  const systemMeta = ANATOMICAL_SYSTEMS.find((s) => s.id === info.system);

  const handleRequestAiExplanation = async () => {
    if (aiText) {
      setShowAi(!showAi);
      return;
    }
    setShowAi(true);
    setAiLoading(true);
    setAiError(null);
    try {
      const res = await api.assistantChat({
        question: `Décris succinctement le rôle anatomique et les impacts en micropesanteur de la structure suivante : ${info.name} (${info.latinName}), appartenant au système ${systemMeta?.label ?? info.system}.`,
      });
      setAiText(res.answer);
      setAiCitations(res.citations);
      setAiProvider(res.provider);
    } catch (error) {
      setAiError(
        error instanceof Error
          ? error.message
          : "Assistant indisponible. Aucune réponse sourcée n’a pu être récupérée.",
      );
      setAiCitations([]);
      setAiProvider(null);
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <aside
      aria-label="Anatomical Structure Inspection"
      className="pointer-events-auto absolute left-5 bottom-36 z-20 w-[360px] max-w-[calc(100vw-2.5rem)] max-h-[70vh] overflow-y-auto rounded-xl border border-sky-400/20 p-4 text-slate-100 shadow-2xl backdrop-blur-xl"
      style={{ backgroundColor: 'rgba(11, 17, 32, 0.94)' }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span
              className="inline-block h-2 w-2 shrink-0 rounded-sm"
              style={{ backgroundColor: systemMeta?.accentHex ?? '#38BDF8' }}
              aria-hidden="true"
            />
            <span className="truncate">{systemMeta?.label}</span>
            <span aria-hidden="true">·</span>
            <span className="truncate">{info.region}</span>
          </div>
          <h2 className="mt-1 text-base font-semibold tracking-tight text-white">
            {info.name}
          </h2>
          <p className="text-xs italic text-sky-300/80">{info.latinName}</p>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close inspection panel"
          className="shrink-0 rounded-md p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 cursor-pointer"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <p className="mt-2.5 text-xs leading-relaxed text-slate-300">
        {info.summary}
      </p>

      <div className="mt-3 space-y-1.5 border-t border-slate-800/90 pt-2.5 text-xs">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-slate-400 shrink-0">Vascularisation</span>
          <span className="text-right text-slate-200">{info.vascularSupply}</span>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-slate-400 shrink-0">Innervation</span>
          <span className="text-right text-slate-200">{info.innervation}</span>
        </div>
      </div>

      {/* AI Explanation Accordion / Section */}
      {showAi && (
        <div className="mt-3 rounded-lg border border-cyan-400/25 bg-cyan-950/40 p-2.5 text-xs">
          <div className="flex items-center gap-1.5 font-bold text-cyan-300 mb-1">
            <Sparkles className="h-3.5 w-3.5 text-cyan-400 animate-pulse" />
            <span>
              {aiProvider === 'colab_openai'
                ? 'Assistant IRCO · modèle distant'
                : aiProvider === 'extractive_fallback'
                  ? 'Assistant IRCO · réponse locale'
                  : 'Assistant IRCO'}
            </span>
          </div>
          {aiLoading ? (
            <div className="flex items-center gap-2 py-2 text-slate-300">
              <Loader2 className="h-4 w-4 animate-spin text-cyan-400" />
              <span>              Recherche d’une explication documentée...</span>
            </div>
          ) : aiError ? (
            <p role="alert" className="text-[11px] leading-relaxed text-amber-200">
              {aiError}
            </p>
          ) : (
            <div>
              <p className="text-[11px] leading-relaxed text-slate-200">{aiText}</p>
              {aiCitations.length > 0 && (
                <div className="mt-2 border-t border-cyan-500/20 pt-1 text-[10px] text-cyan-200/70">
                  <span className="font-semibold">Citations : </span>
                  {aiCitations.map((citation) => citation.title).join(', ')}
                </div>
              )}
              <div className="mt-1 text-[9px] text-slate-400 italic">
                * Donnée d'aide à la décision en lecture seule — jamais de diagnostic automatique inventé.
              </div>
            </div>
          )}
        </div>
      )}

      <div className="mt-3 flex items-center justify-between gap-2 pt-2 border-t border-slate-800/90">
        <button
          type="button"
          onClick={handleRequestAiExplanation}
          className="flex items-center gap-1 rounded-lg border border-cyan-400/30 bg-cyan-500/15 px-2.5 py-1.5 text-xs font-medium text-cyan-300 hover:bg-cyan-500/25 hover:text-white transition-colors cursor-pointer"
        >
          <Sparkles className="h-3.5 w-3.5 text-cyan-400" />
          <span>
            {aiError
              ? 'Réessayer'
              : aiText
                ? showAi
                  ? 'Masquer assistant'
                  : 'Voir assistant'
                : 'Demander une explication'}
          </span>
        </button>

        <button
          type="button"
          onClick={() => onIsolateSystem(info.system)}
          className="rounded-lg border border-sky-400/25 bg-sky-500/10 px-3 py-1.5 text-xs font-medium text-sky-300 hover:bg-sky-500/20 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
        >
          Isoler {systemMeta?.label}
        </button>
      </div>
    </aside>
  );
}
