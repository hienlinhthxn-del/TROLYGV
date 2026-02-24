
import React, { useState, useRef, useEffect, useMemo, Suspense, lazy } from 'react';
import { Message, TeacherPersona, GroundingSource, Classroom, CloudDocument, Attachment, ViewType, ExamQuestion, Assignment } from './types';
import { PERSONAS, INITIAL_GREETING, QUICK_PROMPTS } from './constants';
import { geminiService, FilePart } from './services/geminiService';
import ChatMessage from './components/ChatMessage';
import ApiKeySettings from './components/ApiKeySettings';
import { downloadLessonPlanAsDocx } from './docxHelper';

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

  // Guard: if the app hard-crashes during render/effects, show a friendly fallback instead of blank screen.
  const [fatalError, setFatalError] = useState<string | null>(null);

  // State để kiểm tra link chia sẻ ngay khi vào app
  const [isCheckingLink, setIsCheckingLink] = useState(() => {
    return new URLSearchParams(window.location.search).has('exam') || !!localStorage.getItem('shared_exam_data');
  });

  const [practiceData, setPracticeData] = useState<{ subject: string, grade: string, questions: ExamQuestion[], assignmentId: string | null } | null>(null);

  const [chatSearchQuery, setChatSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([]);
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [tempLink, setTempLink] = useState('');
  const [showApiKeySettings, setShowApiKeySettings] = useState(false);
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

  // Xử lý dán ảnh trực tiếp vào Chat
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (view !== 'chat') return;

      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const file = items[i].getAsFile();
          if (file) {
            e.preventDefault();
            const reader = new FileReader();
            reader.onloadend = () => {
              const base64Data = (reader.result as string).split(',')[1];
              setPendingAttachments(prev => [...prev, {
                type: 'image',
                name: `Pasted_Image_${Date.now()}.png`,
                data: base64Data,
                mimeType: file.type
              }]);
            };
            reader.readAsDataURL(file);
          }
        }
      }
    };

    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [view]);

  useEffect(() => {
    // Capture unexpected runtime errors to avoid a blank page.
    const onError = (event: ErrorEvent) => {
      const msg = event?.error?.message || event?.message || 'Unknown error';
      console.error('[App] Fatal error:', event?.error || event);
      setFatalError(msg);
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      const reason: any = (event as any)?.reason;
      const msg = reason?.message || String(reason || 'Unhandled rejection');
      console.error('[App] Unhandled rejection:', reason);
      setFatalError(msg);
    };
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  if (fatalError) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="w-full max-w-2xl rounded-3xl border border-rose-200 bg-white shadow-xl p-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-rose-50 flex items-center justify-center text-rose-600">
              <i className="fas fa-triangle-exclamation"></i>
            </div>
            <div>
              <div className="text-sm font-black text-slate-900 uppercase tracking-widest">Ứng dụng bị lỗi</div>
              <div className="text-xs text-slate-500 font-semibold mt-1">Không hiển thị trắng trang nữa; lỗi được ghi bên dưới.</div>
            </div>
          </div>

          <pre className="mt-4 text-xs bg-slate-900 text-slate-100 rounded-2xl p-4 overflow-auto">{fatalError}</pre>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-bold text-xs uppercase tracking-widest"
              onClick={() => window.location.reload()}
            >
              Tải lại
            </button>
            <button
              className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 font-bold text-xs uppercase tracking-widest"
              onClick={() => {
                try {
                  localStorage.removeItem('google_api_key');
                  localStorage.removeItem('manually_entered_api_key');
                  localStorage.removeItem('preferred_gemini_model');
                  localStorage.removeItem('preferred_gemini_version');
                } catch { }
                window.location.reload();
              }}
            >
              Xoá cấu hình AI & tải lại
            </button>
          </div>
        </div>
      </div>
    );
  }

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
    const urlParams = new URLSearchParams(window.location.search);
    const submissionParam = urlParams.get('submission');

    if (submissionParam) {
      try {
        const decodedData = JSON.parse(atob(submissionParam));
        const { aid, sid, sc } = decodedData;

        if (!aid || !sid || !sc) throw new Error("Dữ liệu nộp bài không đầy đủ.");

        // Tải dữ liệu lớp học mới nhất từ localStorage để cập nhật
        const savedClass = localStorage.getItem('edu_classroom_data');
        const currentClassroomData: Classroom = savedClass ? JSON.parse(savedClass) : classroom;

        const assignmentIndex = currentClassroomData.assignments.findIndex(a => a.id === aid);
        if (assignmentIndex === -1) throw new Error("Không tìm thấy bài tập tương ứng.");

        const student = currentClassroomData.students.find(s => s.name.trim().toLowerCase() === sid.trim().toLowerCase());
        if (!student) throw new Error(`Không tìm thấy học sinh tên "${sid}" trong lớp.`);

        const updatedAssignments = [...currentClassroomData.assignments];
        const targetAssignment = { ...updatedAssignments[assignmentIndex] };
        const gradeIndex = targetAssignment.grades.findIndex(g => g.studentId === student.id);
        const newGrade = { studentId: student.id, score: sc, feedback: 'Nộp bài tự động qua link.' };

        if (gradeIndex > -1) {
          targetAssignment.grades[gradeIndex] = newGrade;
        } else {
          targetAssignment.grades.push(newGrade);
        }
        updatedAssignments[assignmentIndex] = targetAssignment;

        const updatedClassroomData = { ...currentClassroomData, assignments: updatedAssignments };

        // Cập nhật cả state và localStorage
        setClassroom(updatedClassroomData);
        localStorage.setItem('edu_classroom_data', JSON.stringify(updatedClassroomData));

        alert(`✅ Đã cập nhật điểm ${sc} cho em ${student.name} vào bài tập "${targetAssignment.title}".`);

        // Dọn dẹp URL và chuyển hướng người dùng
        window.history.replaceState({}, document.title, window.location.pathname);
        setView('classroom');
        return; // Dừng xử lý để không chạy checkSharedExam
      } catch (e) {
        alert(`Lỗi khi xử lý link nộp bài: ${e instanceof Error ? e.message : 'Dữ liệu không hợp lệ.'}`);
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    }

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
            try {
              if (sharedExam.startsWith('v2_') && 'DecompressionStream' in window) {
                // --- GIẢI NÉN GZIP (MỚI) ---
                const base64 = sharedExam.substring(3).replace(/-/g, '+').replace(/_/g, '/');
                const padded = base64.padEnd(base64.length + (4 - base64.length % 4) % 4, '=');
                const binaryString = atob(padded);
                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                  bytes[i] = binaryString.charCodeAt(i);
                }
                const stream = new Blob([bytes]).stream();
                // @ts-ignore
                const decompressed = stream.pipeThrough(new DecompressionStream('gzip'));
                const response = new Response(decompressed);
                data = await response.json();
              } else {
                // --- GIẢI MÃ CŨ (Base64) ---
                let cleanBase64 = sharedExam.trim()
                  .replace(/\s/g, '')
                  .replace(/-/g, '+')
                  .replace(/_/g, '/');

                while (cleanBase64.length % 4 !== 0) {
                  cleanBase64 += '=';
                }

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
              }
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
                inflatedQuestions = data.q.map((item: any, idx: number) => {
                  const rawOptions = item[2] || [];
                  const options = rawOptions.map((opt: any) => {
                    // Nếu là array [text, image]
                    if (Array.isArray(opt)) {
                      return { text: opt[0] || '', image: opt[1] || '' };
                    }
                    // Nếu là object cũ {text, image}
                    if (typeof opt === 'object' && opt !== null) {
                      return { text: opt.text || opt.label || '', image: opt.image || '' };
                    }
                    // Nếu là string/number
                    return { text: String(opt), image: '' };
                  });

                  return {
                    id: `share-${Date.now()}-${idx}`,
                    type: item[0] === 2 ? 'Tự luận' : 'Trắc nghiệm', // 2: Tự luận, 1: Trắc nghiệm
                    content: item[1] || '',
                    options: options,
                    answer: item[3] || '',
                    explanation: item[4] || '',
                    image: item[5] || '',
                    level: 'Thông hiểu'
                  };
                });
              } else {
                // FORMAT ĐẦY ĐỦ (Legacy)
                const sourceQuestions = data.q || data.questions || [];
                inflatedQuestions = sourceQuestions.map((q: any, idx: number) => {
                  const rawOptions = q.options || q[2] || [];
                  const options = rawOptions.map((opt: any) => {
                    if (Array.isArray(opt)) return { text: opt[0] || '', image: opt[1] || '' };
                    if (typeof opt === 'object' && opt !== null) return { text: opt.text || opt.label || '', image: opt.image || '' };
                    return { text: String(opt), image: '' };
                  });

                  return {
                    ...q,
                    id: q.id || `share-old-${idx}`,
                    type: q.type || (q[0] === 2 ? 'Tự luận' : 'Trắc nghiệm'),
                    content: q.content || q[1] || '',
                    options: options,
                    answer: q.answer || q[3] || '',
                    explanation: q.explanation || q[4] || '',
                    image: q.image || q[5] || ''
                  };
                });
              }

              setPracticeData({
                subject: data.s || data.subject || 'Chưa rõ',
                grade: data.g || data.grade || '?',
                questions: inflatedQuestions,
                assignmentId: data.aid || null
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
    // Tự động xóa cấu hình model cũ bị lỗi (gemini-2.0-flash-exp) để tránh lỗi 404
    const savedModel = localStorage.getItem('preferred_gemini_model');
    if (savedModel && ['gemini-2.0-flash-exp', 'gemini-1.5-flash-002', 'gemini-1.0-pro'].includes(savedModel)) {
      localStorage.removeItem('preferred_gemini_model');
      localStorage.removeItem('preferred_gemini_version');
    }

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

  // Listen for global request to open API Key settings (from child components)
  useEffect(() => {
    const handler = () => setShowApiKeySettings(true);
    window.addEventListener('openApiSettings', handler as EventListener);
    return () => window.removeEventListener('openApiSettings', handler as EventListener);
  }, []);

  const updateClassroom = (updated: Classroom) => {
    setClassroom(updated);
    localStorage.setItem('edu_classroom_data', JSON.stringify(updated));
  };

  const handleCreateAssignmentFromExam = (title: string): string => {
    const newAssignment: Assignment = {
      id: Date.now().toString(),
      title: title,
      dueDate: new Date().toISOString().split('T')[0],
      status: 'Đang mở',
      submissions: [],
      grades: []
    };
    const updatedClassroom = { ...classroom, assignments: [...classroom.assignments, newAssignment] };
    updateClassroom(updatedClassroom);
    alert(`✅ Đã tạo bài tập "${title}" trong Quản lý lớp học!`);
    return newAssignment.id;
  };

  const sendToWorkspace = (content: string) => {
    setWorkspaceContent(content);
    setView('workspace');
    localStorage.setItem('edu_workspace_content', content);
  };

  const startPractice = (subject: string, grade: string, questions: ExamQuestion[], assignmentId: string | null) => {
    setPracticeData({ subject, grade, questions, assignmentId });
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
        if ((chunk as any).grounding?.groundingChunks) {
          const newSources = ((chunk as any).grounding.groundingChunks as any[])
            .filter((c: any) => c.web)
            .map((c: any) => ({ title: c.web.title, uri: c.web.uri }));
          if (newSources.length > 0) {
            sources = Array.from(new Map([...sources, ...newSources].map(item => [item.uri, item])).values());
          }
        }
        setMessages(prev => prev.map(msg => msg.id === assistantId ? { ...msg, content: fullContent, isThinking: false, sources: sources.length > 0 ? sources : undefined } : msg));
      }
      setMessages(prev => prev.map(msg => msg.id === assistantId ? { ...msg, isStreaming: false } : msg));

      // Tách riêng phần gợi ý để nếu lỗi (hết quota) thì không làm mất nội dung chính
      try {
        setIsGeneratingSuggestions(true);
        const suggestions = await geminiService.generateSuggestions([messageContent, fullContent], currentPersona.name);
        setDynamicSuggestions(suggestions);
      } catch (suggestionError) {
        console.warn("Suggestion generation failed:", suggestionError);
      } finally {
        setIsGeneratingSuggestions(false);
      }

    } catch (error: any) {
      console.error("Chat Stream Error Details:", error);
      let errorMessage = error instanceof Error ? error.message : "Đã có lỗi xảy ra trong quá trình trao đổi.";

      if (errorMessage.includes('429') || errorMessage.toLowerCase().includes('quota') || errorMessage.includes('resource_exhausted')) {
        errorMessage = "Hết lượt sử dụng miễn phí (Quota Exceeded). Vui lòng vào Cài đặt (🔑) để nhập API Key mới.";
        setShowApiKeySettings(true);
      } else if (errorMessage.includes('404') || errorMessage.toLowerCase().includes('not found')) {
        errorMessage = "Mô hình AI hiện tại không khả dụng (404). Hệ thống đã tự động đặt lại cấu hình. Vui lòng thử lại.";
        localStorage.removeItem('preferred_gemini_model');
        localStorage.removeItem('preferred_gemini_version');
      }

      setMessages(prev => prev.map(msg => msg.id === assistantId ? {
        ...msg,
        content: msg.content ? `${msg.content}\n\n⚠️ **Lỗi:** ${errorMessage}` : `⚠️ ${errorMessage}`,
        isThinking: false,
        isStreaming: false
      } : msg));
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
          assignmentId={practiceData.assignmentId}
          onExit={() => { setPracticeData(null); setView('exam'); }}
          isStandalone={true}
        />
      </Suspense>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-white sm:bg-slate-50">
      {isSidebarOpen && <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-40 lg:hidden" onClick={() => setIsSidebarOpen(false)}></div>}

      <aside className={`fixed lg:static inset-y-0 left-0 z-50 w-72 bg-white border-r border-slate-200 transform transition-all duration-300 ease-out shadow-2xl lg:shadow-none ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
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
                { id: 'cloud', icon: 'fa-book-bookmark', label: 'Thư viện của tôi' },
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
            <button onClick={() => setShowApiKeySettings(true)} title="Cài đặt API Key" className="w-10 h-10 flex items-center justify-center text-amber-500 hover:text-amber-600 hover:bg-amber-50 rounded-xl transition-all"><i className="fas fa-key"></i></button>
            <button onClick={() => setView('security')} className="w-10 h-10 flex items-center justify-center text-emerald-500 hover:text-emerald-600 hover:bg-white rounded-xl transition-all"><i className="fas fa-shield-halved"></i></button>
          </div>
        </header>

        <div className="flex-1 overflow-hidden p-0 sm:p-6 lg:pt-2 pb-[80px] lg:pb-0">
          <Suspense fallback={<LoadingView />}>
            {view === 'chat' && (
              <div className="h-full flex flex-col max-w-5xl mx-auto bg-white rounded-none sm:rounded-[40px] border-none sm:border border-slate-200 shadow-xl overflow-hidden">
                <div className="flex-1 overflow-y-auto px-6 py-8 custom-scrollbar">
                  {filteredMessages.map((msg) => (
                    <ChatMessage
                      key={msg.id}
                      message={msg}
                      onAction={msg.role === 'assistant' ? () => sendToWorkspace(msg.content) : undefined}
                      onExportWord={msg.role === 'assistant' ? () => downloadLessonPlanAsDocx(msg.content) : undefined}
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

            {view === 'classroom' && <ClassroomManager classroom={classroom} onUpdate={updateClassroom} onAIAssist={(p, atts) => { setInput(p); if (atts) setPendingAttachments(atts); setView('chat'); }} />}
            {view === 'workspace' && <Workspace initialContent={workspaceContent} onSave={(c) => setWorkspaceContent(c)} onSaveToCloud={handleSaveToCloud} />}
            {view === 'exam' && <ExamCreator onExportToWorkspace={sendToWorkspace} onStartPractice={startPractice} onCreateAssignment={handleCreateAssignmentFromExam} />}
            {view === 'worksheet' && <WorksheetCreator />}
            {view === 'cloud' && <CloudDrive documents={cloudDocs} onOpen={handleOpenCloudDoc} onDelete={handleDeleteCloudDoc} />}
            {view === 'utility' && <UtilityKit onSendToWorkspace={sendToWorkspace} onSaveToLibrary={handleSaveToCloud} />}
            {view === 'security' && <SecurityCenter onClearAllData={handleClearAllData} />}
          </Suspense>
        </div>

        {/* Mobile Bottom Navigation */}
        <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 px-6 py-3 flex justify-between items-center z-30 shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
          <button onClick={() => setView('chat')} className={`flex flex-col items-center space-y-1 ${view === 'chat' ? 'text-indigo-600' : 'text-slate-400'}`}>
            <i className="fas fa-comment-dots text-xl"></i>
            <span className="text-[9px] font-bold">Chat AI</span>
          </button>
          <button onClick={() => setView('utility')} className={`flex flex-col items-center space-y-1 ${view === 'utility' ? 'text-indigo-600' : 'text-slate-400'}`}>
            <i className="fas fa-wand-magic-sparkles text-xl"></i>
            <span className="text-[9px] font-bold">Tiện ích</span>
          </button>
          <button onClick={() => setView('classroom')} className={`flex flex-col items-center space-y-1 ${view === 'classroom' ? 'text-indigo-600' : 'text-slate-400'}`}>
            <i className="fas fa-users-viewfinder text-xl"></i>
            <span className="text-[9px] font-bold">Lớp học</span>
          </button>
          <button onClick={() => setView('cloud')} className={`flex flex-col items-center space-y-1 ${view === 'cloud' ? 'text-indigo-600' : 'text-slate-400'}`}>
            <i className="fas fa-book-bookmark text-xl"></i>
            <span className="text-[9px] font-bold">Thư viện</span>
          </button>
          <button onClick={() => setIsSidebarOpen(true)} className="flex flex-col items-center space-y-1 text-slate-400">
            <i className="fas fa-bars text-xl"></i>
            <span className="text-[9px] font-bold">Menu</span>
          </button>
        </div>
      </main>

      {/* API Key Settings Modal */}
      <ApiKeySettings isOpen={showApiKeySettings} onClose={() => setShowApiKeySettings(false)} />
    </div>
  );
};

export default App;
