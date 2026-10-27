import ReactMarkdown from "react-markdown";

// Safe default (no raw HTML). Links open in a new tab.
const MD_COMPONENTS = {
  p: (p: { children?: React.ReactNode }) => <p className="mb-3 leading-relaxed last:mb-0">{p.children}</p>,
  strong: (p: { children?: React.ReactNode }) => <strong className="font-bold text-portal-on-surface">{p.children}</strong>,
  ul: (p: { children?: React.ReactNode }) => <ul className="mb-3 ml-5 list-disc space-y-1.5 last:mb-0">{p.children}</ul>,
  ol: (p: { children?: React.ReactNode }) => <ol className="mb-3 ml-5 list-decimal space-y-1.5 last:mb-0">{p.children}</ol>,
  h2: (p: { children?: React.ReactNode }) => <h3 className="mb-2 mt-6 text-lg font-bold text-portal-on-surface first:mt-0">{p.children}</h3>,
  h3: (p: { children?: React.ReactNode }) => <h3 className="mb-2 mt-6 text-lg font-bold text-portal-on-surface first:mt-0">{p.children}</h3>,
  a: (p: { children?: React.ReactNode; href?: string }) => (
    <a href={p.href} target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:underline">
      {p.children}
    </a>
  ),
};

/** A service's long pitch (markdown, written in the admin catalog editor). */
export function OfferBody({ body }: { body: string }) {
  return (
    <div className="text-[15px] text-portal-secondary-text">
      <ReactMarkdown components={MD_COMPONENTS}>{body}</ReactMarkdown>
    </div>
  );
}
