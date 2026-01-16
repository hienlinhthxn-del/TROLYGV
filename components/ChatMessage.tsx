
import React from 'react';
import { Message } from '../types';

interface ChatMessageProps {
  message: Message;
  onAction?: () => void;
}

const ChatMessage: React.FC<ChatMessageProps> = ({ message, onAction }) => {
  const isUser = message.role === 'user';

  const getDomain = (url: string) => {
    try {
      const domain = new URL(url).hostname;
      return domain.replace('www.', '');
    } catch (e) {
      return 'Nguồn';
    }
  };

  const getFileIcon = (mimeType?: string) => {
    if (!mimeType) return 'fa-file';
    if (mimeType.includes('pdf')) return 'fa-file-pdf text-rose-500';
    if (mimeType.includes('word') || mimeType.includes('officedocument.wordprocessingml')) return 'fa-file-word text-blue-500';
    if (mimeType.includes('excel') || mimeType.includes('officedocument.spreadsheetml')) return 'fa-file-excel text-emerald-500';
    if (mimeType.includes('powerpoint') || mimeType.includes('officedocument.presentationml')) return 'fa-file-powerpoint text-orange-500';
    return 'fa-file-lines text-slate-400';
  };

  return (
    <div className={`flex w-full mb-8 message-appear ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`flex max-w-[92%] md:max-w-[85%] ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
        <div className={`flex-shrink-0 flex items-center justify-center w-9 h-9 rounded-xl shadow-sm transition-transform hover:scale-105 relative
          ${isUser ? 'ml-3 bg-indigo-600 text-white' : 'mr-3 bg-white text-indigo-600 border border-indigo-100'}`}>
          <i className={`fas ${isUser ? 'fa-user' : 'fa-robot'} text-sm`}></i>
          {!isUser && (
            <div className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-500 rounded-full border-2 border-white flex items-center justify-center">
              <i className="fas fa-shield text-[6px] text-white"></i>
            </div>
          )}
        </div>
        
        <div className="flex flex-col space-y-1">
          <div className={`relative px-5 py-3.5 rounded-2xl text-[14.5px] leading-relaxed shadow-sm transition-all
            ${isUser 
              ? 'bg-indigo-600 text-white rounded-tr-none border border-indigo-500' 
              : 'bg-gradient-to-br from-blue-50 via-white to-purple-50 text-slate-700 rounded-tl-none border border-blue-100/50'}`}>
            
            {message.attachments && message.attachments.length > 0 && (
              <div className={`mb-3 flex flex-wrap gap-2 ${isUser ? 'justify-end' : 'justify-start'}`}>
                {message.attachments.map((at, i) => (
                  <div key={i} className="max-w-[250px] relative group">
                    {at.type === 'image' && at.data ? (
                      <div className="relative">
                        <img 
                          src={`data:${at.mimeType};base64,${at.data}`} 
                          alt={at.name} 
                          className="rounded-lg border border-white/20 shadow-sm max-h-40 object-cover" 
                        />
                        <div className="absolute top-2 right-2 px-1.5 py-0.5 bg-emerald-500/80 backdrop-blur-sm rounded text-[8px] font-black text-white uppercase flex items-center">
                           <i className="fas fa-lock mr-1"></i>Secure
                        </div>
                      </div>
                    ) : (
                      <div className={`flex items-center space-x-2 px-3 py-2 rounded-xl text-[11px] font-bold border transition-colors ${isUser ? 'bg-white/10 border-white/20 text-white hover:bg-white/20' : 'bg-white border-slate-100 text-slate-600 hover:bg-slate-50'}`}>
                        <i className={`fas ${at.type === 'link' ? 'fa-link' : getFileIcon(at.mimeType)}`}></i>
                        <span className="truncate">{at.name}</span>
                        <i className="fas fa-check-shield text-emerald-400 text-[8px]" title="Đã quét tệp"></i>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {message.isThinking && !message.content ? (
              <div className="flex items-center space-x-2 py-1">
                <div className="flex space-x-1">
                  <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce"></div>
                  <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:0.2s]"></div>
                  <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:0.4s]"></div>
                </div>
                <span className="text-[11px] text-slate-400 ml-2 font-medium">Bảo mật hóa & Đang chuẩn bị...</span>
              </div>
            ) : (
              <>
                <div className={`whitespace-pre-wrap ${message.isStreaming ? 'typing-cursor' : ''}`}>
                    {message.content}
                </div>
                {onAction && !message.isStreaming && (
                  <div className="mt-3 pt-3 border-t border-slate-100 flex justify-end">
                    <button 
                      onClick={onAction}
                      className="flex items-center space-x-2 px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-lg text-[10px] font-black uppercase tracking-wider hover:bg-indigo-100 transition-all active:scale-95"
                    >
                      <i className="fas fa-file-pen"></i>
                      <span>Chỉnh sửa tài liệu an toàn</span>
                    </button>
                  </div>
                )}
              </>
            )}
            
            <div className={`text-[9px] mt-2 font-medium opacity-50 uppercase tracking-tighter ${isUser ? 'text-right' : 'text-left'}`}>
              {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              {!isUser && <span className="ml-2 text-emerald-500">• Encrypted Session</span>}
            </div>
          </div>

          {!isUser && message.sources && message.sources.length > 0 && !message.isStreaming && (
            <div className="mt-2 ml-1 animate-in fade-in slide-in-from-top-1 duration-500">
              <div className="flex items-center text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                <i className="fas fa-microchip mr-1.5 text-indigo-400"></i>
                Nguồn tham khảo đã xác thực
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {message.sources.map((source, idx) => (
                  <a 
                    key={idx} 
                    href={source.uri} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="citation-card group flex items-start p-2.5 bg-white rounded-xl border border-slate-100 hover:border-indigo-200 hover:bg-indigo-50/30 transition-all"
                  >
                    <div className="bg-slate-50 group-hover:bg-white p-1.5 rounded-lg mr-2.5 transition-colors">
                      <i className="fas fa-globe text-slate-400 group-hover:text-indigo-500 text-[10px]"></i>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-bold text-slate-700 truncate group-hover:text-indigo-700">
                        {source.title || 'Thông tin hỗ trợ'}
                      </p>
                      <p className="text-[9px] text-slate-400 font-medium">
                        {getDomain(source.uri)}
                      </p>
                    </div>
                    <i className="fas fa-external-link-alt text-[8px] text-slate-300 group-hover:text-indigo-300 mt-1 ml-1"></i>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ChatMessage;
