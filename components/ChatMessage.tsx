import React from 'react';
import { Message } from '../types';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface ChatMessageProps {
  message: Message;
  onAction?: () => void;
}

const ChatMessage: React.FC<ChatMessageProps> = ({ message, onAction }) => {
  const isUser = message.role === 'user';

  return (
    <div className={`flex items-start gap-4 my-6 animate-in fade-in slide-in-from-bottom-2 duration-500 ${isUser ? 'justify-end' : ''}`}>
      {!isUser && (
        <div className="w-10 h-10 flex-shrink-0 bg-indigo-600 text-white rounded-full flex items-center justify-center shadow-lg">
          <i className="fas fa-robot"></i>
        </div>
      )}
      <div className={`max-w-xl p-5 rounded-[28px] ${isUser ? 'bg-slate-900 text-white' : 'bg-slate-50 text-slate-800'}`}>
        <div className="prose prose-sm prose-slate max-w-none">
          {message.isThinking ? (
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-current rounded-full animate-bounce"></div>
              <div className="w-2 h-2 bg-current rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
              <div className="w-2 h-2 bg-current rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
            </div>
          ) : (
            <Markdown remarkPlugins={[remarkGfm]}>{message.content}</Markdown>
          )}
        </div>
      </div>
    </div>
  );
};

export default ChatMessage;