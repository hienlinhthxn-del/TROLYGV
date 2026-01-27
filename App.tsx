
import React, { useState, useRef, useEffect, useMemo, Suspense, lazy } from 'react';
import { Message, TeacherPersona, GroundingSource, Classroom, CloudDocument, Attachment, ViewType, ExamQuestion } from './types';
import { PERSONAS, INITIAL_GREETING, QUICK_PROMPTS } from './constants';
import { geminiService, FilePart } from './services/geminiService';
import ChatMessage from './components/ChatMessage';

// Lazy loading các component lớn
const ClassroomManager = lazy(() => import('./components/ClassroomManager'));
const Workspace = lazy(() => import('./components/Workspace'));
const ExamCreator = lazy(() => import('./components/ExamCreator'));
const CloudDrive = lazy(() => import('./components/CloudDrive'));
const UtilityKit = lazy(() => import('./components/UtilityKit'));
const SecurityCenter = lazy(() => import('./components/SecurityCenter'));
const StudentPractice = lazy(() => import('./components/StudentPractice'));
const WorksheetCreator = lazy(() => import('./components/WorksheetCreator'));

const LoadingView = () => (
  <div className="h-full flex flex-col items-center justify-center space-y-4 animate-in fade-in duration-500">
    <div className="relative">
      <div className="w-16 h-16 border-4 border-indigo-50 rounded-full"></div>
      <div className="absolute top-0 left-0 w-16 h-16 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
    </div>
    <div className="text-center">
      <p className="text-[10px] font-black text-slate-800 uppercase tracking-[0.3em]">EduAssist AI</p>
      <p className="text-[9px] text-slate-400 font-bold uppercase mt-1">Đang tải mô-đun an toàn...</p>
    </div>
  </div>
);

const App: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([
    { id: '1', role: 'assistant', content: INITIAL_GREETING, timestamp: new Date() }
  ]);
  const [input, setInput] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [currentPersona, setCurrentPersona] = useState<TeacherPersona>(PERSONAS[0]);
  const [isLoading, setIsLoading] = useState(false);
  const [isGeneratingSuggestions, setIsGeneratingSuggestions] = useState(false);
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [view, setView] = useState<ViewType>('chat');
  const [workspaceContent, setWorkspaceContent] = useState('');
  const [cloudDocs, setCloudDocs] = useState<CloudDocument[]>([]);
  const [dynamicSuggestions, setDynamicSuggestions] = useState<string[]>([]);

  // State để kiểm tra link chia sẻ ngay khi vào app
  const [isCheckingLink, setIsCheckingLink] = useState(() => {
    return new URLSearchParams(window.location.search).has('exam') || !!localStorage.getItem('shared_exam_data');
  });

  const [practiceData, setPracticeData] = useState<{ subject: string, grade: string, questions: ExamQuestion[] } | null>(null);

  const [chatSearchQuery, setChatSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([]);
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [tempLink, setTempLink] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [classroom, setClassroom] = useState<Classroom>({
    id: 'class-1',
    name: 'Lớp 10A1',
    students: [
      { id: '1', name: 'Nguyễn Văn An', code: 'HS001', gender: 'Nam' },
      { id: '2', name: 'Trần Thị Bình', code: 'HS002', gender: 'Nữ' },
      { id: '3', name: 'Lê Hoàng Long', code: 'HS003', gender: 'Nam' }
    ],
    assignments: [],
    attendance: []
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchQuery(chatSearchQuery);
    }, 300);
    return () => clearTimeout(handler);
  }, [chatSearchQuery]);

  const filteredMessages = useMemo(() => {
    if (!debouncedSearchQuery.trim()) return messages;
    const query = debouncedSearchQuery.toLowerCase();
    return messages.filter(m => m.content.toLowerCase().includes(query));
  }, [messages, debouncedSearchQuery]);

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  useEffect(() => {
    if (view === 'chat' && !debouncedSearchQuery) scrollToBottom();
  }, [messages, view, debouncedSearchQuery]);

  // Xử lý link chia sẻ đề thi
  useEffect(() => {
    const checkSharedExam = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const sharedExam = urlParams.get('exam');
      const localSharedData = localStorage.getItem('shared_exam_data');

      if (sharedExam || localSharedData) {
        setIsCheckingLink(true);
        try {
          // Đợi một chút để UI ổn định
          await new Promise(resolve => setTimeout(resolve, 300));

          let data: any = null;

          // Ưu tiên 1: Lấy từ localStorage (do index.html đã xử lý trước)
          if (localSharedData) {
            try {
              data = JSON.parse(localSharedData);
              localStorage.removeItem('shared_exam_data'); // Xóa sau khi đọc
              console.log("✅ Loaded exam from localStorage (pre-decoded)");
            } catch (e) {
              console.error("Error parsing local shared data", e);
            }
          }

          // Ưu tiên 2: Nếu không có trong storage thì tự decode từ URL
          if (!data && sharedExam) {
            // 1. VỆ SINH CHUỖI BASE64 CỰC KỲ CẨN THẬN
            let cleanBase64 = sharedExam.trim()
              .replace(/\s/g, '')
              .replace(/-/g, '+')
              .replace(/_/g, '/');

            while (cleanBase64.length % 4 !== 0) {
              cleanBase64 += '=';
            }

            try {
              // 2. GIẢI MÃ AN TOÀN với TextDecoder
              const decodeData = (base64String: string): any => {
                try {
                  const binaryString = atob(base64String);
                  const bytes = new Uint8Array(binaryString.length);
                  for (let i = 0; i < binaryString.length; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                  }
                  const decoder = new TextDecoder('utf-8');
                  const jsonString = decoder.decode(bytes);
                  return JSON.parse(jsonString);
                } catch (e) {
                  // Fallback methods...
                  try {
                    const decoded = decodeURIComponent(escape(atob(base64String)));
                    return JSON.parse(decoded);
                  } catch (e2) {
                    const rawDecoded = atob(base64String);
                    return JSON.parse(rawDecoded);
                  }
                }
              };
              data = decodeData(cleanBase64);
            } catch (innerError: any) {
              // Xử lý lỗi decode ở dưới
              throw innerError;
            }
          }

          try {
            if (data && (data.q || data.questions)) {
              let inflatedQuestions: ExamQuestion[] = [];

              if (data.q && Array.isArray(data.q)) {
                // FORMAT RÚT GỌN (Minified)
                inflatedQuestions = data.q.map((item: any, idx: number) => ({
                  id: `share-${Date.now()}-${idx}`,
                  type: item[0] === 1 ? 'Trắc nghiệm' : 'Tự luận',
                  content: item[1] || '',
                  options: item[2] || [],
                  answer: item[3] || '',
                  explanation: item[4] || '',
                  image: item[5] || '',
                  level: 'Thông hiểu'
                }));
              } else {
                // FORMAT ĐẦY ĐỦ (Legacy)
                const sourceQuestions = data.q || data.questions || [];
                inflatedQuestions = sourceQuestions.map((q: any, idx: number) => ({
                  ...q,
                  id: q.id || `share-old-${idx}`,
                  type: q.type || (q[0] === 1 ? 'Trắc nghiệm' : 'Tự luận'),
                  content: q.content || q[1] || '',
                  options: q.options || q[2] || [],
                  answer: q.answer || q[3] || '',
                  explanation: q.explanation || q[4] || '',
                  image: q.image || q[5] || ''
                }));
              }

              setPracticeData({
                subject: data.s || data.subject || 'Chưa rõ',
                grade: data.g || data.grade || '?',
                questions: inflatedQuestions
              });

              setView('practice');
              console.log("✅ Successfully loaded shared exam:", inflatedQuestions.length, "questions");
            } else {
              throw new Error("Dữ liệu không đúng cấu trúc đề thi.");
            }
          } catch (innerError: any) {
            console.error("❌ Decode/Parse error:", innerError);

            let errorMsg = "⚠️ KHÔNG THỂ MỞ ĐỀ THI\n\n";
            if (sharedExam && sharedExam.length > 2500) {
              errorMsg += "Lý do: Link này quá dài, dữ liệu đã bị các ứng dụng (Zalo/Messenger) cắt bớt khi gửi.\n\n";
            } else {
              errorMsg += `Lý do: ${innerError.message || 'Link bị lỗi định dạng hoặc copy thiếu ký tự.'}\n\n`;
            }

            errorMsg += "💡 GIẢI PHÁP:\n1. Copy lại toàn bộ link một lần nữa.\n2. Yêu cầu giáo viên gửi 'MÃ ĐỀ THI' (chuỗi ký tự dài).\n3. Thử mở trên máy tính.";

            if (confirm(errorMsg + "\n\n❓ Bạn có muốn thử nhập thủ công MÃ ĐỀ không?")) {
              const manualInput = prompt("Dán Mã Đề (hoặc Link) vào đây:");
              if (manualInput) {
                // Tách lấy param exam nếu user dán cả link
                let codeOnly = manualInput;
                if (manualInput.includes('exam=')) {
                  codeOnly = manualInput.split('exam=')[1].split('&')[0];
                }
                // Reload location với code mới (đơn giản nhất)
                window.location.href = `${window.location.origin}${window.location.pathname}?exam=${codeOnly}`;
              }
            }
          }
        } catch (e) {
          console.error("Critical link check error:", e);
        } finally {
          setIsCheckingLink(false);
        }
      }
    };

    checkSharedExam();
  }, []);

  // Logic chạy khi đổi Persona hoặc khi ứng dụng khởi tạo
  useEffect(() => {
    geminiService.initChat(currentPersona.instruction);
    setDynamicSuggestions([]);

    const savedHistory = localStorage.getItem('edu_search_history');
    if (savedHistory) setSearchHistory(JSON.parse(savedHistory));

    const savedClass = localStorage.getItem('edu_classroom_data');
    if (savedClass) setClassroom(JSON.parse(savedClass));

    const savedWorkspace = localStorage.getItem('edu_workspace_content');
    if (savedWorkspace) setWorkspaceContent(savedWorkspace);

    const savedCloud = localStorage.getItem('edu_cloud_docs');
    if (savedCloud) setCloudDocs(JSON.parse(savedCloud));
  }, [currentPersona]);

  const updateClassroom = (updated: Classroom) => {
    setClassroom(updated);
    localStorage.setItem('edu_classroom_data', JSON.stringify(updated));
  };

  const sendToWorkspace = (content: string) => {
    setWorkspaceContent(content);
    setView('workspace');
    localStorage.setItem('edu_workspace_content', content);
  };

  const startPractice = (subject: string, grade: string, questions: ExamQuestion[]) => {
    setPracticeData({ subject, grade, questions });
    setView('practice');
  };

  const handleSaveToCloud = (name: string, content: string) => {
    const newDoc: CloudDocument = {
      id: Date.now().toString(),
      name: name || `Tài liệu ${new Date().toLocaleDateString('vi-VN')}`,
      content: content,
      updatedAt: new Date().toISOString(),
      size: `${(new Blob([content]).size / 1024).toFixed(1)} KB`,
      isEncrypted: true
    };
    const updatedDocs = [newDoc, ...cloudDocs];
    setCloudDocs(updatedDocs);
    localStorage.setItem('edu_cloud_docs', JSON.stringify(updatedDocs));
  };

  const handleDeleteCloudDoc = (id: string) => {
    if (window.confirm('Thầy Cô chắc chắn muốn xóa tài liệu này vĩnh viễn?')) {
      const updatedDocs = cloudDocs.filter(d => d.id !== id);
      setCloudDocs(updatedDocs);
      localStorage.setItem('edu_cloud_docs', JSON.stringify(updatedDocs));
    }
  };

  const handleOpenCloudDoc = (doc: CloudDocument) => {
    setWorkspaceContent(doc.content);
    setView('workspace');
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      // Kiểm tra các định dạng không hỗ trợ trực tiếp (như Word)
      if (file.name.endsWith('.doc') || file.name.endsWith('.docx')) {
        alert(`Tệp "${file.name}" là định dạng Word. Hiện tại AI hỗ trợ tốt nhất qua tệp PDF. Vui lòng chuyển (Save as) tệp Word sang PDF rồi tải lên lại nhé!`);
        continue;
      }

      const reader = new FileReader();

      // Nếu là tệp văn bản, đọc dưới dạng text để nối vào câu hỏi
      if (file.type === 'text/plain' || file.name.endsWith('.txt') || file.name.endsWith('.md') || file.name.endsWith('.csv')) {
        reader.onloadend = () => {
          const textContent = reader.result as string;
          setPendingAttachments(prev => [...prev, {
            type: 'file',
            name: file.name,
            data: btoa(unescape(encodeURIComponent(textContent))), // Lưu base64 cho đồng nhất nhưng đánh dấu là text
            mimeType: 'text/plain'
          }]);
        };
        reader.readAsText(file);
      } else {
        // Các tệp đa phương tiện hoặc PDF (đọc as DataURL)
        reader.onloadend = () => {
          const base64Data = (reader.result as string).split(',')[1];
          setPendingAttachments(prev => [...prev, {
            type: file.type.startsWith('image/') ? 'image' : 'file',
            name: file.name,
            data: base64Data,
            mimeType: file.type
          }]);
        };
        reader.readAsDataURL(file);
      }
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleAddLink = () => {
    if (!tempLink.trim()) return;
    setPendingAttachments(prev => [...prev, {
      type: 'link',
      name: tempLink.trim(),
      url: tempLink.trim()
    }]);
    setTempLink('');
    setShowLinkInput(false);
  };

  const removePendingAttachment = (index: number) => {
    setPendingAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const handleSendMessage = async (text?: string) => {
    const messageContent = text || input;
    if ((!messageContent.trim() && pendingAttachments.length === 0) || isLoading) return;
    if (view !== 'chat') setView('chat');

    const newHistory = [messageContent.trim(), ...searchHistory.filter(h => h !== messageContent.trim())].slice(0, 10);
    setSearchHistory(newHistory);
    localStorage.setItem('edu_search_history', JSON.stringify(newHistory));

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: messageContent,
      timestamp: new Date(),
      attachments: [...pendingAttachments]
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    const currentAttachments = [...pendingAttachments];
    setPendingAttachments([]);
    setIsLoading(true);

    const assistantId = (Date.now() + 1).toString();
    setMessages(prev => [...prev, { id: assistantId, role: 'assistant', content: '', timestamp: new Date(), isThinking: true, isStreaming: true }]);

    try {
      let fullContent = '';
      let sources: GroundingSource[] = [];
      const fileParts: FilePart[] = [];
      let enrichedPrompt = messageContent;

      currentAttachments.forEach(at => {
        if (at.type === 'file' || at.type === 'image') {
          if (at.data && at.mimeType) {
            // Chỉ gửi as inlineData nếu là định dạng Gemini hỗ trợ (PDF, Image, Video, Audio)
            const isSupportedMedia = at.mimeType === 'application/pdf' ||
              at.mimeType.startsWith('image/') ||
              at.mimeType.startsWith('video/') ||
              at.mimeType.startsWith('audio/');

            if (isSupportedMedia) {
              fileParts.push({ inlineData: { data: at.data, mimeType: at.mimeType } });
            } else if (at.mimeType === 'text/plain') {
              // Nếu là text, giải mã và đưa vào prompt
              try {
                const decodedText = decodeURIComponent(escape(atob(at.data)));
                enrichedPrompt = `\n[NỘI DUNG TỆP ${at.name}]:\n${decodedText}\n\n${enrichedPrompt}`;
              } catch (e) {
                console.error("Error decoding text file", e);
              }
            } else {
              console.warn(`Bỏ qua tệp không hỗ trợ: ${at.mimeType}`);
            }
          }
        } else if (at.type === 'link') {
          enrichedPrompt = `[THAM KHẢO LIÊN KẾT: ${at.url}]: \n\n${enrichedPrompt}`;
        }
      });

      if (fileParts.length > 0 || currentAttachments.some(a => a.mimeType === 'text/plain')) {
        enrichedPrompt = `Dựa trên dữ liệu đính kèm, hãy thực hiện yêu cầu: ${enrichedPrompt}`;
      }

      const stream = geminiService.sendMessageStream(enrichedPrompt, fileParts);

      for await (const chunk of stream) {
        fullContent += chunk.text;
        if (chunk.grounding?.groundingChunks) {
          const newSources = (chunk.grounding.groundingChunks as any[])
            .filter((c: any) => c.web)
            .map((c: any) => ({ title: c.web.title, uri: c.web.uri }));
          if (newSources.length > 0) {
            sources = Array.from(new Map([...sources, ...newSources].map(item => [item.uri, item])).values());
          }
        }
        setMessages(prev => prev.map(msg => msg.id === assistantId ? { ...msg, content: fullContent, isThinking: false, sources: sources.length > 0 ? sources : undefined } : msg));
      }
      setMessages(prev => prev.map(msg => msg.id === assistantId ? { ...msg, isStreaming: false } : msg));

      setIsGeneratingSuggestions(true);
      const suggestions = await geminiService.generateSuggestions([messageContent, fullContent], currentPersona.name);
      setDynamicSuggestions(suggestions);
      setIsGeneratingSuggestions(false);
    } catch (error: any) {
      console.error("Chat Stream Error Details:", error);
      const errorMessage = error instanceof Error ? error.message : "Đã có lỗi xảy ra trong quá trình trao đổi.";
      setMessages(prev => prev.map(msg => msg.id === assistantId ? { ...msg, content: `⚠️ Lỗi kết nối hoặc vấn đề bảo mật: ${errorMessage}. Thầy/Cô hãy tải lại trang (F5) hoặc kiểm tra lại mạng nhé!`, isThinking: false, isStreaming: false } : msg));
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearAllData = () => {
    if (window.confirm("Xóa sạch toàn bộ dữ liệu?")) {
      localStorage.clear();
      window.location.reload();
    }
  };

  if (isCheckingLink) {
    return <LoadingView />;
  }

  if (view === 'practice' && practiceData) {
    return (
      <Suspense fallback={<LoadingView />}>
        <StudentPractice
          subject={practiceData.subject}
          grade={practiceData.grade}
          questions={practiceData.questions}
          onExit={() => { setPracticeData(null); setView('exam'); }}
          isStandalone={true}
        />
      </Suspense>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-white sm:bg-slate-50">
      {isSidebarOpen && <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-20 lg:hidden" onClick={() => setIsSidebarOpen(false)}></div>}

      <aside className={`fixed lg:static inset-y-0 left-0 z-30 w-72 bg-white border-r border-slate-200 transform transition-all duration-300 ease-out shadow-2xl lg:shadow-none ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        <div className="flex flex-col h-full">
          <div className="p-6 border-b border-slate-100">
            <div className="flex items-center space-x-3 mb-2">
              <div className="p-2.5 bg-indigo-600 rounded-2xl shadow-xl"><i className="fas fa-graduation-cap text-white text-lg"></i></div>
              <h1 className="text-xl font-black text-slate-800">EduAssist</h1>
            </div>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest ml-1">An toàn & Bảo mật</p>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
            <div className="space-y-1">
              {[
                { id: 'chat', icon: 'fa-comment-dots', label: 'Hỏi đáp AI' },
                { id: 'utility', icon: 'fa-wand-magic-sparkles', label: 'Tiện ích Sáng tạo' },
                { id: 'exam', icon: 'fa-file-lines', label: 'Soạn đề thi AI' },
                { id: 'worksheet', icon: 'fa-child-reaching', label: 'Phiếu học tập Lớp 1' },
                { id: 'workspace', icon: 'fa-file-pen', label: 'Soạn thảo tài liệu' },
                { id: 'classroom', icon: 'fa-users-viewfinder', label: 'Quản lý lớp học' },
                { id: 'cloud', icon: 'fa-cloud-arrow-up', label: 'Lưu trữ Online' },
                { id: 'security', icon: 'fa-shield-halved', label: 'Trung tâm Bảo mật' },
              ].map(item => (
                <button
                  key={item.id}
                  onClick={() => { setView(item.id as ViewType); setIsSidebarOpen(false); }}
                  className={`w-full flex items-center space-x-3 p-3.5 rounded-2xl transition-all ${view === item.id ? 'bg-indigo-50 text-indigo-700 border border-indigo-100 shadow-sm' : 'text-slate-600 hover:bg-slate-50 border border-transparent'}`}
                >
                  <div className={`w-9 h-9 flex items-center justify-center rounded-xl ${view === item.id ? 'bg-indigo-100' : 'bg-slate-50'}`}><i className={`fas ${item.icon}`}></i></div>
                  <span className="text-[13px] font-bold">{item.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col relative bg-white lg:bg-transparent overflow-hidden">
        <header className="flex items-center justify-between h-16 px-6 border-b border-slate-200 lg:border-none bg-white lg:bg-transparent z-10">
          <button onClick={() => setIsSidebarOpen(true)} className="lg:hidden p-2 text-slate-500 hover:bg-slate-100 rounded-lg"><i className="fas fa-bars"></i></button>
          <div className="flex items-center space-x-3">
            <button onClick={() => setView('security')} className="w-10 h-10 flex items-center justify-center text-emerald-500 hover:text-emerald-600 hover:bg-white rounded-xl transition-all"><i className="fas fa-shield-halved"></i></button>
          </div>
        </header>

        <div className="flex-1 overflow-hidden p-0 sm:p-6 lg:pt-2">
          <Suspense fallback={<LoadingView />}>
            {view === 'chat' && (
              <div className="h-full flex flex-col max-w-5xl mx-auto bg-white rounded-none sm:rounded-[40px] border-none sm:border border-slate-200 shadow-xl overflow-hidden">
                <div className="flex-1 overflow-y-auto px-6 py-8 custom-scrollbar">
                  {filteredMessages.map((msg) => (
                    <ChatMessage
                      key={msg.id}
                      message={msg}
                      onAction={msg.role === 'assistant' ? () => sendToWorkspace(msg.content) : undefined}
                    />
                  ))}
                  <div ref={messagesEndRef} />
                </div>

                <div className="p-6 bg-white border-t border-slate-100">
                  <div className="relative group max-w-4xl mx-auto">
                    <div className="relative flex items-end bg-slate-50 border-2 border-slate-100 rounded-[28px] p-2 focus-within:border-indigo-400 focus-within:bg-white transition-all">
                      <button onClick={() => fileInputRef.current?.click()} className="w-12 h-12 flex items-center justify-center text-slate-400 hover:text-indigo-600"><i className="fas fa-paperclip"></i></button>
                      <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileChange} />
                      <textarea
                        ref={textareaRef}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder={`Hỏi ${currentPersona.name}...`}
                        className="flex-1 bg-transparent border-none focus:ring-0 py-3 px-2 text-[14px] font-medium text-slate-700 resize-none max-h-[200px]"
                        rows={1}
                      />
                      <button
                        onClick={() => handleSendMessage()}
                        disabled={isLoading}
                        className={`w-12 h-12 flex items-center justify-center rounded-2xl transition-all ${input.trim() ? 'bg-indigo-600 text-white shadow-lg' : 'bg-slate-200 text-slate-400'}`}
                      >
                        <i className={`fas ${isLoading ? 'fa-circle-notch fa-spin' : 'fa-paper-plane'}`}></i>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {view === 'classroom' && <ClassroomManager classroom={classroom} onUpdate={updateClassroom} onAIAssist={(p) => { setInput(p); setView('chat'); }} />}
            {view === 'workspace' && <Workspace initialContent={workspaceContent} onSave={(c) => setWorkspaceContent(c)} onSaveToCloud={handleSaveToCloud} />}
            {view === 'exam' && <ExamCreator onExportToWorkspace={sendToWorkspace} onStartPractice={startPractice} />}
            {view === 'worksheet' && <WorksheetCreator />}
            {view === 'cloud' && <CloudDrive documents={cloudDocs} onOpen={handleOpenCloudDoc} onDelete={handleDeleteCloudDoc} />}
            {view === 'utility' && <UtilityKit onSendToWorkspace={sendToWorkspace} />}
            {view === 'security' && <SecurityCenter onClearAllData={handleClearAllData} />}
          </Suspense>
        </div>
      </main>
    </div>
  );
};

export default App;
