import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export default function ChunkBody({ format, text }) {
  if (format === 'md') {
    return (
      <div className="chunk-md text-base leading-[1.6] text-pretty">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
      </div>
    );
  }
  return <p className="whitespace-pre-line text-base leading-[1.6] text-pretty">{text}</p>;
}
