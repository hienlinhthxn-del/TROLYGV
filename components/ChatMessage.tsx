import React from 'react';
import { Message } from '../types';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface ChatMessageProps {
  message: Message;
  onAction?: () => void;
  onExportWord?: () => void;
}

const ChatMessage: React.FC<ChatMessageProps> = ({ message, onAction, onExportWord }) => {
  const isUser = message.role === 'user';

  return (
    <div className={`flex items-start gap-4 my-6 animate-in fade-in slide-in-from-bottom-2 duration-500 ${isUser ? 'justify-end' : ''}`}>
      {!isUser && (
        <div className="w-10 h-10 flex-shrink-0 bg-indigo-600 text-white rounded-full flex items-center justify-center shadow-lg">
          <i className="fas fa-robot"></i>
        </div>
      )}
      <div className="flex flex-col gap-2 max-w-xl">
        <div className={`p-5 rounded-[28px] ${isUser ? 'bg-slate-900 text-white shadow-xl shadow-slate-100' : 'bg-slate-50 text-slate-800'}`}>
          <div className="prose prose-sm prose-slate max-w-none prose-headings:mb-2 prose-p:mb-2">
            {message.isThinking ? (
              <div className="flex items-center space-x-2 p-2">
                <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
              </div>
            ) : (
              <Markdown remarkPlugins={[remarkGfm]}>{message.content}</Markdown>
            )}
          </div>
        </div>

        {!isUser && !message.isThinking && (onAction || onExportWord) && (
          <div className="flex items-center gap-2 ml-2">
            {onAction && (
              <button
                onClick={onAction}
                className="text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 px-3 py-1.5 rounded-full transition-all"
                title="Đưa nội dung này vào trang soạn thảo"
              >
                <i className="fas fa-file-pen mr-1.5"></i>Soạn thảo
              </button>
            )}
            {onExportWord && (
              <button
                onClick={onExportWord}
                className="text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-full transition-all"
                title="Xuất nội dung này ra file Word (.docx)"
              >
                <i className="fas fa-file-word mr-1.5"></i>Tải Word
              </button>
            )}
            <button
              onClick={() => {
                navigator.clipboard.writeText(message.content);
                // Optionally show a "Copied" toast
              }}
              className="text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 px-3 py-1.5 rounded-full transition-all"
              title="Sao chép nội dung"
            >
              <i className="fas fa-copy mr-1.5"></i>Copy
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatMessage;