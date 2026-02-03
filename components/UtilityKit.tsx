
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { geminiService, FilePart } from '../services/geminiService';
import { readContentFromFile } from '../fileReader';
import { downloadLessonPlanAsDocx } from '../docxHelper';
import { Attachment, Message, TeacherPersona } from '../types';
import { PERSONAS } from '../constants';
import ChatMessage from './ChatMessage';
import Crossword from './Crossword';

interface UtilityKitProps {
  onSendToWorkspace: (content: string) => void;
  onSaveToLibrary: (name: string, content: string) => void;
}

interface SavedLessonPlan {
  id: string;
  topic: string;
  subject: string;
  grade: string;
  content: string;
  timestamp: string;
}

// Component Quiz Player nội bộ
const QuizPlayer: React.FC<{ data: any[]; onShare?: () => void }> = ({ data, onShare }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [showScore, setShowScore] = useState(false);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [timeLeft, setTimeLeft] = useState(15);

  useEffect(() => {
    setTimeLeft(15);
  }, [currentIndex]);

  const checkCorrectness = (q: any, opt: any, idx: number) => {
    if (!q || !opt) return false;

    const ansVal = typeof q.answer === 'string' ? q.answer : (q.answer.text || '');
    const ansStr = String(ansVal).trim();

    const optVal = typeof opt === 'string' ? opt : (opt.text || '');
    const optStr = String(optVal).trim();

    if (ansStr.toLowerCase() === optStr.toLowerCase()) return true;

    if (idx >= 0) {
      const letter = String.fromCharCode(65 + idx);
      const letterLower = letter.toLowerCase();
      const ansLower = ansStr.toLowerCase();
      if (ansLower === letterLower) return true;
      if (ansLower.startsWith(`${letterLower}.`) || ansLower.startsWith(`${letterLower} `) || ansLower.startsWith(`${letterLower})`)) return true;
    }
    return false;
  };

  const handleAnswerClick = (option: any, index: number) => {
    if (selectedOption) return;

    const correct = checkCorrectness(data[currentIndex], option, index);
    setSelectedOption(option);
    setIsCorrect(correct);

    if (correct) {
      setScore(prev => prev + 1);
    }

    setTimeout(() => {
      const nextQuestion = currentIndex + 1;
      if (nextQuestion < data.length) {
        setCurrentIndex(nextQuestion);
        setSelectedOption(null);
        setIsCorrect(null);
      } else {
        setShowScore(true);
      }
    }, 2000);
  };

  useEffect(() => {
    if (showScore || selectedOption) return;

    if (timeLeft === 0) {
      handleAnswerClick('TIMEOUT', -1);
      return;
    }

    const timer = setInterval(() => {
      setTimeLeft(prev => prev - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft, showScore, selectedOption]);

  const restartQuiz = () => {
    setCurrentIndex(0);
    setScore(0);
    setShowScore(false);
    setSelectedOption(null);
    setIsCorrect(null);
    setTimeLeft(15);
  };

  if (showScore) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center animate-in zoom-in duration-300">
        <div className="text-6xl mb-4">🏆</div>
        <h3 className="text-2xl font-black text-slate-800 mb-2">Hoàn thành xuất sắc!</h3>
        <p className="text-lg text-slate-600 mb-6">Thầy/Cô đã trả lời đúng <span className="text-indigo-600 font-bold text-2xl">{score}</span> / {data.length} câu.</p>
        <button onClick={restartQuiz} className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold shadow-lg hover:bg-indigo-700 transition-all">
          🔄 Chơi lại
        </button>
      </div>
    );
  }

  const currentQuestion = data[currentIndex];

  // Xử lý thông minh: Tách hình ảnh ra khỏi nội dung câu hỏi nếu AI gộp chung
  let displayQuestion = currentQuestion.question;
  let displayImage = currentQuestion.image;

  if (!displayImage && displayQuestion) {
    const imgMatch = displayQuestion.match(/\[(HÌNH ẢNH|IMAGE|IMG|HÌNH):(.*?)\]/i);
    if (imgMatch) {
      displayImage = imgMatch[0]; // Lấy cả cụm [HÌNH ẢNH: ...]
      displayQuestion = displayQuestion.replace(imgMatch[0], '').trim();
    }
  }

  return (
    <div className="flex flex-col h-full p-4">
      <div className="flex justify-between items-center mb-6">
        <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Câu hỏi {currentIndex + 1}/{data.length}</span>
        <div className={`flex items-center space-x-1 px-3 py-1 rounded-full border ${timeLeft <= 5 ? 'bg-rose-50 border-rose-200 text-rose-600 animate-pulse' : 'bg-slate-50 border-slate-200 text-slate-500'}`}>
          <i className="fas fa-clock text-xs"></i>
          <span className="text-xs font-black w-5 text-center">{timeLeft}s</span>
        </div>
        <div className="flex items-center space-x-2">
          {onShare && (
            <button onClick={onShare} className="text-xs font-bold text-indigo-600 hover:bg-indigo-50 px-3 py-1 rounded-full transition-colors border border-indigo-100 flex items-center">
              <i className="fas fa-share-nodes mr-1"></i>Chia sẻ
            </button>
          )}
          <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full">Điểm: {score}</span>
        </div>
      </div>

      <div className="flex-1 flex flex-col justify-center">
        {displayImage && (
          displayImage.trim().startsWith('<svg') ? (
            <div className="flex justify-center mb-6 p-4 bg-white rounded-xl shadow-sm border border-slate-200 [&>svg]:max-w-full [&>svg]:h-auto [&>svg]:max-h-60" dangerouslySetInnerHTML={{ __html: displayImage }} />
          ) : (
            // Kiểm tra xem có phải là URL ảnh hoặc Base64 không
            /^(http|https|data:image)/i.test(displayImage) ? (
              <div className="flex justify-center mb-6">
                <img src={displayImage} alt="Minh họa" className="max-h-48 rounded-xl shadow-sm border border-slate-200 object-contain" />
              </div>
            ) : (
              // Trường hợp còn lại: Là mô tả văn bản (VD: [HÌNH ẢNH: ...]) -> Hiển thị khung text
              <div className="flex justify-center mb-6 p-6 bg-amber-50 rounded-xl border border-amber-200 text-amber-800 text-sm font-medium italic text-center max-w-md mx-auto shadow-sm">
                <i className="fas fa-image text-2xl mb-2 block text-amber-400"></i>
                {displayImage.replace(/[\[\]]/g, '').replace(/^(HÌNH ẢNH|IMAGE|IMG|HÌNH):/i, '').trim()}
              </div>
            )
          )
        )}
        <h3 className="text-xl font-bold text-slate-800 mb-8 text-center leading-relaxed">{displayQuestion}</h3>

        <div className="grid grid-cols-1 gap-3">
          {currentQuestion.options.map((option: any, index: number) => {
            const optText = typeof option === 'string' ? option : (option.text || '');
            const optImg = typeof option === 'string' ? '' : (option.image || '');
            const isSelected = selectedOption === option;
            const isCorrectAnswer = checkCorrectness(currentQuestion, option, index);

            let btnClass = "p-4 rounded-xl border-2 text-left font-medium transition-all relative overflow-hidden ";
            if (isSelected) {
              btnClass += isCorrectAnswer
                ? "bg-emerald-100 border-emerald-500 text-emerald-800"
                : "bg-rose-100 border-rose-500 text-rose-800";
            } else if (selectedOption && isCorrectAnswer) {
              btnClass += "bg-emerald-50 border-emerald-300 text-emerald-700";
            } else {
              btnClass += "bg-white border-slate-200 hover:border-indigo-400 hover:bg-indigo-50 text-slate-700";
            }

            return (
              <button
                key={index}
                onClick={() => handleAnswerClick(option, index)}
                disabled={!!selectedOption}
                className={btnClass}
              >
                <div className="flex items-center">
                  <span className="mr-3 font-black opacity-50">{String.fromCharCode(65 + index)}.</span>
                  <div className="flex-1">
                    {optText.trim().startsWith('<svg') ? (
                      <div className="inline-block align-middle [&>svg]:h-12 [&>svg]:w-auto" dangerouslySetInnerHTML={{ __html: optText }} />
                    ) : (
                      <span className="text-[15px] font-bold">{optText}</span>
                    )}
                  </div>
                </div>

                {optImg && (
                  <div className="mt-3">
                    {optImg.trim().startsWith('<svg') ? (
                      <div className="inline-block align-middle [&>svg]:h-20 [&>svg]:w-auto" dangerouslySetInnerHTML={{ __html: optImg }} />
                    ) : (
                      <img src={optImg} alt="Option placeholder" className="h-20 object-contain rounded-lg" onError={(e) => {
                        // Fallback nếu không phải URL/base64
                        e.currentTarget.style.display = 'none';
                      }} />
                    )}
                    {/* Hiển thị mô tả nếu không phải SVG hay Image */}
                    {!optImg.trim().startsWith('<svg') && !/^(http|https|data:image)/i.test(optImg) && (
                      <div className="text-[10px] italic text-slate-400 mt-1">{optImg}</div>
                    )}
                  </div>
                )}

                {isSelected && (
                  <span className="absolute right-4 top-1/2 -translate-y-1/2">
                    {isCorrectAnswer ? <i className="fas fa-check-circle text-emerald-600 text-xl"></i> : <i className="fas fa-times-circle text-rose-600 text-xl"></i>}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {selectedOption && currentQuestion.explanation && (
        <div className="mt-4 p-3 bg-blue-50 text-blue-800 text-sm rounded-lg animate-in fade-in slide-in-from-bottom-2">
          <i className="fas fa-info-circle mr-2"></i>{currentQuestion.explanation}
        </div>
      )}
    </div>
  );
};

const UtilityKit: React.FC<UtilityKitProps> = ({ onSendToWorkspace, onSaveToLibrary }) => {
  const [activeTab, setActiveTab] = useState<'games' | 'images' | 'tts' | 'lesson_plan' | 'video' | 'assistant' | 'pdf_tools'>('games');
  const [subject, setSubject] = useState('Toán');
  const [gameType, setGameType] = useState<'idea' | 'crossword' | 'quiz'>('idea');
  const [quizMode, setQuizMode] = useState<'topic' | 'file'>('topic');
  const [quizFile, setQuizFile] = useState<File | null>(null);
  const [grade, setGrade] = useState('Lớp 1');
  const [topic, setTopic] = useState('');
  const [videoStyle, setVideoStyle] = useState('Hoạt hình đơn giản');
  const [voiceName, setVoiceName] = useState<'Kore' | 'Puck'>('Kore');
  const [quizCount, setQuizCount] = useState(5);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([]);
  const [lessonHistory, setLessonHistory] = useState<SavedLessonPlan[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [activeAssistant, setActiveAssistant] = useState<TeacherPersona | null>(null);
  const [assistantMessages, setAssistantMessages] = useState<Message[]>([]);
  const [assistantInput, setAssistantInput] = useState('');
  const [isAssistantLoading, setIsAssistantLoading] = useState(false);
  const [useTemplateMode, setUseTemplateMode] = useState(false);
  const [templateFile, setTemplateFile] = useState<File | null>(null);
  const [planFile, setPlanFile] = useState<File | null>(null);
  const [additionalPrompt, setAdditionalPrompt] = useState('');
  const [docxFont, setDocxFont] = useState('Times New Roman');
  const [docxFontSize, setDocxFontSize] = useState(13);
  const [docxAlignment, setDocxAlignment] = useState<"left" | "center" | "right" | "justify">('justify');
  const [docxLineSpacing, setDocxLineSpacing] = useState(1.5);

  // State cho PDF Tools
  const [pdfToolFile, setPdfToolFile] = useState<File | null>(null);
  const [pdfPageCount, setPdfPageCount] = useState(0);
  const [splitRange, setSplitRange] = useState({ start: 1, end: 1 });

  const audioRef = useRef<HTMLAudioElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const assistantMessagesEndRef = useRef<HTMLDivElement>(null);

  const ASSISTANT_PERSONAS = useMemo(() => {
    const ids = ['lesson-planner', 'student-advisor', 'admin-writer', 'form-creator', 'paperwork-assistant'];
    return PERSONAS.filter(p => ids.includes(p.id));
  }, []);

  useEffect(() => {
    if (activeAssistant) {
      geminiService.initChat(activeAssistant.instruction);
      setAssistantMessages([{ id: 'greeting', role: 'assistant', content: `Xin chào, tôi là ${activeAssistant.name}. Tôi có thể giúp gì cho Thầy/Cô?`, timestamp: new Date() }]);
    }
  }, [activeAssistant]);

  // Xử lý dán ảnh trực tiếp
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (activeTab !== 'assistant') return;

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
  }, [activeTab]);

  // Tải danh sách giọng đọc ngay khi mở tiện ích
  useEffect(() => {
    const loadVoices = () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.getVoices();
      }
    };
    loadVoices();
    if ('speechSynthesis' in window) window.speechSynthesis.onvoiceschanged = loadVoices;
  }, []);

  // Scroll to bottom of assistant chat
  useEffect(() => {
    assistantMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [assistantMessages]);

  // Tải lịch sử giáo án
  useEffect(() => {
    const saved = localStorage.getItem('edu_lesson_history');
    if (saved) setLessonHistory(JSON.parse(saved));
  }, []);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const reader = new FileReader();
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
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeAttachment = (index: number) => {
    setPendingAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const getFileParts = (): FilePart[] => {
    return pendingAttachments
      .filter(at => at.data && at.mimeType)
      .map(at => ({
        inlineData: { data: at.data!, mimeType: at.mimeType! }
      }));
  };

  const generateLessonPlan = async () => {
    setIsProcessing(true);
    setResult(null);
    setAudioUrl(null);

    let prompt = '';

    try {
      if (useTemplateMode) {
        if (!templateFile || !planFile) {
          alert("Vui lòng tải lên cả File Mẫu và File Kế Hoạch!");
          setIsProcessing(false);
          return;
        }

        const templateText = await readContentFromFile(templateFile);
        const planText = await readContentFromFile(planFile);

        prompt = `
          Đóng vai trò là một chuyên gia sư phạm và trợ lý giáo viên đắc lực.
          Nhiệm vụ của bạn là soạn thảo một GIÁO ÁN CHI TIẾT (Kế hoạch bài dạy) dựa trên hai nguồn thông tin đầu vào sau đây:

          ${additionalPrompt ? `YÊU CẦU BỔ SUNG CỤ THỂ TỪ GIÁO VIÊN (ƯU TIÊN CAO NHẤT):
          "${additionalPrompt}"
          Lưu ý: Hãy thực hiện chính xác các yêu cầu này, ưu tiên hơn các nội dung mặc định.` : ''}

          1. CẤU TRÚC VÀ ĐỊNH DẠNG (FILE MẪU):
          Hãy tuân thủ chặt chẽ cấu trúc các mục, các phần trình bày trong văn bản dưới đây:
          """
          ${templateText}
          """

          2. NỘI DUNG VÀ YÊU CẦU CỤ THỂ (KẾ HOẠCH CỦA GIÁO VIÊN):
          Dựa vào nội dung bài học, thời lượng và yêu cầu cần đạt trong văn bản dưới đây để triển khai nội dung:
          """
          ${planText}
          """

          YÊU CẦU ĐẦU RA:
          - **Tuân thủ cấu trúc:** Giữ nguyên các tiêu đề mục (I, II, III, 1, 2, a, b...) như trong File Mẫu.
          - **Triển khai nội dung:** Điền nội dung kiến thức từ Kế Hoạch vào khung mẫu.
          - **Hoạt động chi tiết:** Viết rõ hoạt động của Giáo viên (GV) và Học sinh (HS). Nếu kế hoạch chỉ ghi vắn tắt, hãy đề xuất các hoạt động sư phạm phù hợp.
          - **Ngôn ngữ:** Sử dụng ngôn ngữ sư phạm, trang trọng, rõ ràng.
          - **Định dạng:** Trả về kết quả dưới dạng Markdown để dễ dàng hiển thị.
          - **Tuân thủ chỉ đạo:** Nếu có yêu cầu bổ sung từ giáo viên, hãy thực hiện chính xác, không tự ý thay đổi ý định của giáo viên.
          - **QUAN TRỌNG: Không sử dụng dấu hoa thị (*) cho các mục liệt kê hoặc nhấn mạnh. Thay vào đó, hãy dùng dấu gạch ngang (-) cho các mục liệt kê và chỉ in đậm (sử dụng **text**) khi cần nhấn mạnh.**
        `;
      } else {
        if (!topic.trim()) {
          setIsProcessing(false);
          return;
        }
        prompt = `Hãy soạn một GIÁO ÁN CHI TIẾT theo đúng quy định của CÔNG VĂN 2345/BGDĐT-GDTH cho cấp Tiểu học.
        Môn học: ${subject}. Lớp: ${grade}. 
        Tên bài dạy: "${topic}".
        
        ${additionalPrompt ? `YÊU CẦU BỔ SUNG CỤ THỂ TỪ GIÁO VIÊN (ƯU TIÊN CAO NHẤT):
        "${additionalPrompt}"
        Lưu ý: Hãy thực hiện chính xác các yêu cầu này.` : ''}

        YÊU CẦU VỀ HÌNH THỨC VÀ TRÌNH BÀY (BẮT BUỘC):
        - **Phông chữ & Định dạng:** Soạn thảo nội dung với tư duy sử dụng phông chữ **Times New Roman**, cỡ chữ 13-14 (chuẩn văn bản hành chính Việt Nam).
        - **Trình bày:** Văn bản phải khoa học, các mục lớn (I, II, III...) in đậm rõ ràng, tách biệt.
        - **Ngôn ngữ:** Sử dụng ngôn ngữ sư phạm chuẩn mực, trong sáng, súc tích.
        - **Kỹ thuật:** Trình bày dưới dạng Markdown chuẩn để khi copy sang Word không bị lỗi định dạng.
        - **Tuân thủ chỉ đạo:** Nếu có yêu cầu bổ sung từ giáo viên, hãy thực hiện chính xác.
        - **QUAN TRỌNG: Không sử dụng dấu hoa thị (*) cho các mục liệt kê hoặc nhấn mạnh. Thay vào đó, hãy dùng dấu gạch ngang (-) cho các mục liệt kê và chỉ in đậm (sử dụng **text**) khi cần nhấn mạnh.**
        
        Yêu cầu cấu trúc giáo án phải có đầy đủ các mục:
        I. MỤC TIÊU:
        1. Kiến thức: Nêu cụ thể kiến thức đạt được.
        2. Năng lực: (Năng lực chung và năng lực đặc thù môn học).
        3. Phẩm chất: (Yêu nước, nhân ái, chăm chỉ, trung thực, trách nhiệm).
        
        II. THIẾT BỊ DẠY HỌC VÀ HỌC LIỆU:
        - Liệt kê đồ dùng của giáo viên và học sinh.
        
        III. CÁC HOẠT ĐỘNG DẠY HỌC CHỦ YẾU:
        1. Hoạt động Khởi động (Mở đầu): Ổn định và kết nối kiến thức cũ.
        2. Hoạt động Hình thành kiến thức mới (Khám phá): Tiến trình tổ chức cụ thể.
        3. Hoạt động Luyện tập, thực hành: Các bài tập củng cố.
        4. Hoạt động Vận dụng, trải nghiệm: Gắn liền thực tiễn.
        
        IV. ĐIỀU CHỈNH SAU BÀI DẠY (Nếu có).

        Lưu ý: Nội dung phải sáng tạo, sinh động, phù hợp tâm sinh lý lứa tuổi tiểu học.`;
      }

      let fullContent = '';
      const stream = geminiService.sendMessageStream(prompt, getFileParts());
      for await (const chunk of stream) {
        fullContent += chunk.text;
        setResult(fullContent);
      }
    } catch (error: any) {
      console.error("Lesson Plan Error:", error);
      alert(`Lỗi khi soạn giáo án: ${error.message || "Không thể kết nối với AI"}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const generateGame = async () => {
    if (!topic.trim()) return;
    setIsProcessing(true);
    setResult(null);
    setAudioUrl(null);

    const prompt = `Hãy thiết kế 3 trò chơi khởi động (warm-up games) ngắn gọn, vui nhộn cho học sinh tiểu học.
    Môn học: ${subject}. Chủ đề bài học: "${topic}".
    ${pendingAttachments.length > 0 ? "Hãy dựa trên (các) tệp mẫu đính kèm để học phong cách hoặc nội dung tham khảo." : ""}
    Yêu cầu:
    - Có tên trò chơi bắt tai.
    - Cách chơi đơn giản (dưới 5 phút).
    - Cần ít đạo cụ.
    - Phù hợp tâm lý trẻ em.
    Trả về nội dung chi tiết từng trò chơi.`;

    try {
      let fullContent = '';
      const stream = geminiService.sendMessageStream(prompt, getFileParts());
      for await (const chunk of stream) {
        fullContent += chunk.text;
        setResult(fullContent);
      }
    } catch (error: any) {
      console.error("Game Generation Error:", error);
      alert(`Lỗi khi tạo trò chơi: ${error.message || "Không thể kết nối với AI"}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const generateAIVisual = async () => {
    if (!topic.trim()) {
      alert("Vui lòng nhập mô tả hình ảnh!");
      return;
    }
    setIsProcessing(true);
    setResult(null);
    setAudioUrl(null);

    try {
      // Dịch và tối ưu prompt sang tiếng Anh để AI vẽ đẹp hơn
      const translationPrompt = `Convert this Vietnamese educational concept into a descriptive English image prompt. Style: educational illustration, clear, high quality, white background. Concept: "${topic}"`;

      let optimizedPrompt = topic;
      try {
        const translation = await geminiService.generateText(translationPrompt);
        // Làm sạch kết quả trả về
        optimizedPrompt = translation.replace(/^(Prompt:|Translation:|Description:)/i, '').replace(/["']/g, '').trim();
      } catch (err) {
        console.warn("Translation failed, using original topic", err);
      }

      console.log("[UtilityKit] Generating image with prompt:", optimizedPrompt);
      const imageUrl = await geminiService.generateImage(optimizedPrompt);
      setResult(imageUrl);
    } catch (error: any) {
      console.error("Image generation error:", error);
      alert(`Không thể tạo hình ảnh: ${error.message || "Lỗi kết nối"}. Thầy Cô vui lòng thử lại nhé!`);
    } finally {
      setIsProcessing(false);
    }
  };

  const generateCrossword = async () => {
    if (!topic.trim()) {
      alert("Vui lòng nhập chủ đề cho ô chữ!");
      return;
    }
    setIsProcessing(true);
    setResult(null);
    setAudioUrl(null);

    try {
      const crosswordData = await geminiService.generateCrossword(topic);
      if (crosswordData && crosswordData.words && crosswordData.words.length > 0) {
        setResult(crosswordData);
      } else {
        throw new Error("AI không thể tạo ô chữ với chủ đề này. Vui lòng thử một chủ đề khác tổng quát hơn.");
      }
    } catch (error: any) {
      alert(`Không thể tạo ô chữ: ${error.message || "Lỗi kết nối"}. Thầy Cô vui lòng thử lại nhé!`);
    } finally {
      setIsProcessing(false);
    }
  };

  const generateQuiz = async () => {
    if (!topic.trim()) {
      alert("Vui lòng nhập chủ đề cho Quiz!");
      return;
    }
    setIsProcessing(true);
    setResult(null);
    setAudioUrl(null);

    try {
      const quizContent = await geminiService.generateQuiz(topic, quizCount, additionalPrompt);
      if (Array.isArray(quizContent)) {
        setResult(quizContent);
      } else if (quizContent && quizContent.questions && Array.isArray(quizContent.questions)) {
        setResult(quizContent.questions);
      } else {
        setResult(quizContent);
      }
    } catch (error: any) {
      alert(`Không thể tạo Quiz: ${error.message || "Lỗi kết nối"}. Thầy Cô vui lòng thử lại nhé!`);
    } finally {
      setIsProcessing(false);
    }
  };

  const generateQuizFromUpload = async () => {
    setIsProcessing(true);
    setResult(null);
    setAudioUrl(null);

    try {
      // Ưu tiên sử dụng pendingAttachments nếu có (để hỗ trợ nhiều file)
      const fileParts = getFileParts();

      if (fileParts.length === 0 && quizFile) {
        // Fallback cho logic cũ hoặc nếu người dùng chỉ chọn 1 file qua input riêng
        const reader = new FileReader();
        const base64Promise = new Promise<string>((resolve) => {
          reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
          reader.readAsDataURL(quizFile);
        });
        const base64Data = await base64Promise;
        fileParts.push({ inlineData: { data: base64Data, mimeType: quizFile.type } });
      }

      if (fileParts.length === 0) {
        alert("Vui lòng chọn file đề thi (Ảnh/PDF)!");
        setIsProcessing(false);
        return;
      }

      // --- TỰ ĐỘNG CHUYỂN PDF SANG ẢNH ĐỂ TRÁNH LỖI GEMINI ---
      const convertPdfToImages = async (base64: string): Promise<any[]> => {
        try {
          // @ts-ignore
          const pdfjsLib = await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.379/+esm');
          // @ts-ignore
          pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.379/build/pdf.worker.min.mjs';

          const loadingTask = pdfjsLib.getDocument({ data: atob(base64) });
          const pdf = await loadingTask.promise;
          const images: any[] = [];

          // Giới hạn xử lý 5 trang đầu để tránh quá tải payload (Gemini giới hạn request)
          const maxPages = Math.min(pdf.numPages, 5);

          for (let i = 1; i <= maxPages; i++) {
            const page = await pdf.getPage(i);
            // Tăng scale lên 2.0 để ảnh rõ nét hơn cho AI nhận diện hình vẽ/chữ nhỏ
            const viewport = page.getViewport({ scale: 2.0 });
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.height = viewport.height;
            canvas.width = viewport.width;

            await page.render({ canvasContext: context!, viewport: viewport }).promise;
            const imgData = canvas.toDataURL('image/jpeg', 0.85); // Tăng chất lượng ảnh
            images.push({
              inlineData: {
                data: imgData.split(',')[1],
                mimeType: 'image/jpeg'
              }
            });
          }
          return images;
        } catch (e) {
          console.error("PDF Convert Error:", e);
          alert("Không thể chuyển đổi PDF tự động. Hệ thống sẽ thử gửi file gốc...");
          return null as any; // Fallback to original
        }
      };

      const finalFileParts: any[] = [];
      for (const part of fileParts) {
        if (part.inlineData.mimeType === 'application/pdf') {
          const images = await convertPdfToImages(part.inlineData.data);
          if (images) {
            finalFileParts.push(...images);
          } else {
            finalFileParts.push(part); // Fallback nếu lỗi convert
          }
        } else {
          finalFileParts.push(part);
        }
      }
      // -------------------------------------------------------------


      const prompt = `Bạn là một trợ lý số hóa đề thi chuyên nghiệp.
      Hãy phân tích tài liệu (Ảnh/PDF) và trích xuất TOÀN BỘ các câu hỏi (thường từ 20 đến 30 câu).
      
      ${additionalPrompt ? `YÊU CẦU CỤ THỂ CỦA GIÁO VIÊN:
      "${additionalPrompt}"
      (Hãy ưu tiên thực hiện yêu cầu này khi xử lý nội dung)` : ''}

      Đặc biệt lưu ý đây là dạng đề thi kiểu ViOlympic Toán hoặc Trạng Nguyên Tiếng Việt:
      - Rất nhiều câu hỏi dựa trên quy luật hình ảnh, dãy số trong hình, hoặc điền từ vào hình.
      - Hãy mô tả kỹ các quy luật này trong nội dung câu hỏi để học sinh có thể hiểu được mà không cần nhìn ảnh gốc (nếu ảnh gốc quá phức tạp).
      - Nếu đáp án là hình ảnh, hãy mô tả chúng trong trường image của options.
      - BẮT BUỘC: Nếu câu hỏi có hình ảnh, phải điền mô tả hoặc SVG vào trường "image".
      - Cố gắng trích xuất đủ số lượng câu hỏi có trong đề (thường là 20-30 câu).`;

      // Sử dụng hàm đã được tối ưu trong geminiService
      const json = await geminiService.generateExamQuestionsStructured(prompt, finalFileParts);

      if (json && json.questions) {
        setResult(json.questions);
      } else {
        setResult(json);
      }
    } catch (error: any) {
      console.error("Quiz Upload Error:", error);

      const errorMessage = error.message || "Lỗi không xác định";

      // Kịch bản 1: Lỗi đặc biệt, đã có hướng dẫn cụ thể (như chụp ảnh màn hình) -> Chỉ hiển thị alert.
      if (errorMessage.includes("chụp ảnh màn hình") || errorMessage.includes("screenshot")) {
        alert(`⚠️ Lỗi bóc tách đề:\n\n${errorMessage}`);
      }
      // Kịch bản 2: Lỗi chung khi tải file PDF -> Gợi ý cắt file.
      else if (pendingAttachments.some(f => f.mimeType?.includes('pdf'))) {
        if (window.confirm(`⚠️ Gặp sự cố khi xử lý file PDF: ${errorMessage}\n\nNguyên nhân thường do file đề thi quá dài hoặc có định dạng phức tạp.\n\nThầy/Cô có muốn chuyển sang công cụ "Cắt PDF" để chia nhỏ file và thử lại không? (Khuyên dùng)`)) {
          setActiveTab('pdf_tools');
          setResult(null);
          setPendingAttachments([]); // Xóa file đang treo để người dùng chọn lại file gốc
        }
      } else {
        // Kịch bản 3: Lỗi chung với các loại file khác (ảnh,...)
        alert(`Lỗi bóc tách đề: ${errorMessage}`);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleShareQuiz = async () => {
    if (!result || !Array.isArray(result)) return;

    try {
      const quizData = {
        s: subject,
        g: grade,
        q: result.map((q: any) => ([
          1, // MCQ type
          q.question,
          q.options,
          q.answer,
          q.explanation,
          q.image || '' // Image
        ]))
      };

      const json = JSON.stringify(quizData);
      let finalCode = '';

      // @ts-ignore
      if (window.CompressionStream) {
        const stream = new Blob([json]).stream();
        // @ts-ignore
        const compressed = stream.pipeThrough(new CompressionStream('gzip'));
        const response = new Response(compressed);
        const blob = await response.blob();
        const buffer = await blob.arrayBuffer();
        const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
        finalCode = 'v2_' + base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      } else {
        const utf8Bytes = new TextEncoder().encode(json);
        let binary = '';
        utf8Bytes.forEach(byte => binary += String.fromCharCode(byte));
        finalCode = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      }

      const url = `${window.location.origin}${window.location.pathname}?exam=${finalCode}`;
      await navigator.clipboard.writeText(url);
      alert("✅ Đã sao chép Link Quiz!\n\nThầy/Cô hãy gửi link này cho học sinh để luyện tập nhé.");
    } catch (e) {
      console.error("Share error", e);
      alert("Lỗi khi tạo link chia sẻ.");
    }
  };

  const handleSendAssistantMessage = async () => {
    const messageContent = assistantInput.trim();
    if ((!messageContent && pendingAttachments.length === 0) || isAssistantLoading || !activeAssistant) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: messageContent || (pendingAttachments.length > 0 ? `[Đã gửi ${pendingAttachments.length} tệp đính kèm]` : ''),
      timestamp: new Date(),
    };

    setAssistantMessages(prev => [...prev, userMessage]);
    setAssistantInput('');

    const currentAttachments = getFileParts();
    setPendingAttachments([]);
    setIsAssistantLoading(true);

    const assistantId = (Date.now() + 1).toString();
    setAssistantMessages(prev => [...prev, { id: assistantId, role: 'assistant', content: '', timestamp: new Date(), isThinking: true, isStreaming: true }]);

    try {
      let fullContent = '';
      const stream = geminiService.sendMessageStream(messageContent, currentAttachments);

      for await (const chunk of stream) {
        fullContent += chunk.text;
        setAssistantMessages(prev => prev.map(msg => msg.id === assistantId ? { ...msg, content: fullContent, isThinking: false } : msg));
      }
      setAssistantMessages(prev => prev.map(msg => msg.id === assistantId ? { ...msg, isStreaming: false } : msg));
    } catch (error: any) {
      const errorMessage = error instanceof Error ? error.message : "Đã có lỗi xảy ra.";
      setAssistantMessages(prev => prev.map(msg => msg.id === assistantId ? { ...msg, content: `⚠️ Lỗi: ${errorMessage} `, isThinking: false, isStreaming: false } : msg));
    } finally {
      setIsAssistantLoading(false);
    }
  };

  const handlePlayWithVoiceover = () => {
    if (!result || !topic) return;

    if (isPlaying) {
      window.speechSynthesis.cancel();
      setIsPlaying(false);
      return;
    }

    // Dừng mọi giọng nói đang phát
    window.speechSynthesis.cancel();
    setIsPlaying(true);

    const utterance = new SpeechSynthesisUtterance(topic);
    utterance.lang = 'vi-VN';
    utterance.rate = 0.9;

    const voices = window.speechSynthesis.getVoices();
    const viVoices = voices.filter(v => v.lang.includes('vi'));
    if (viVoices.length > 0) {
      // Cố gắng tìm một giọng nữ chuẩn
      utterance.voice = viVoices.find(v => v.name.toLowerCase().includes('hoai') || v.name.toLowerCase().includes('my') || v.name.toLowerCase().includes('nu') || v.name.toLowerCase().includes('female') || v.name.toLowerCase().includes('google')) || viVoices[0];
    }

    utterance.onend = () => {
      setIsPlaying(false);
    };
    utterance.onerror = () => {
      setIsPlaying(false);
    };
    window.speechSynthesis.speak(utterance);
  };

  const generateVideo = async () => {
    if (!topic.trim()) {
      alert("Vui lòng nhập kịch bản hoặc mô tả video!");
      return;
    }
    setIsProcessing(true);
    setResult(null);
    setAudioUrl(null);

    let optimizedPrompt = topic;

    // Bước 1: Dịch (Có thể lỗi Key, nhưng không nên chặn quy trình)
    try {
      const translationPrompt = `Convert this Vietnamese educational script into a descriptive English video prompt.Style: ${videoStyle}, short animation, simple, for kids, educational.Script: "${topic}"`;
      const translation = await geminiService.generateText(translationPrompt);
      optimizedPrompt = translation.replace(/^(Prompt:|Translation:|Description:)/i, '').replace(/["']/g, '').trim();
    } catch (err: any) {
      console.warn("Translation failed, using original topic. Error:", err);
      // Nếu lỗi do hết Key, thông báo nhẹ nhưng vẫn tiếp tục
      if (err.message && (err.message.includes("429") || err.message.includes("quota"))) {
        // Không làm gì cả, silent fallback
      }
      optimizedPrompt = `${topic}, ${videoStyle}, animation for kids`; // Fallback
    }

    // Bước 2: Tạo video (Quan trọng)
    try {
      const videoUrl = await geminiService.generateVideo(optimizedPrompt);
      setResult(videoUrl);
    } catch (error: any) {
      console.error("Video Gen Error:", error);
      alert(`⚠️ Không thể tạo video: ${error.message || "Lỗi kết nối"}. \n\nMẹo: Thầy Cô vui lòng thử lại sau 1-2 phút vì máy chủ tạo ảnh có thể đang quá tải.`);
    } finally {
      setIsProcessing(false);
    }
  };

  const generateTTS = async () => {
    if (!topic.trim()) {
      alert("Vui lòng nhập văn bản cần đọc!");
      return;
    }
    setIsProcessing(true);
    setResult(null);
    setAudioUrl(null);
    setIsPlaying(false);

    try {
      // Kiểm tra tính khả dụng của SpeechSynthesis
      if ('speechSynthesis' in window) {
        setResult("Hệ thống đã sẵn sàng. Thầy Cô nhấn Phát để bắt đầu.");
      } else {
        const url = await geminiService.generateSpeech(topic, voiceName);
        if (url) {
          setAudioUrl(url);
          setResult("Đã tạo xong giọng đọc từ máy chủ. Thầy Cô nhấn Phát để nghe.");
        } else {
          alert("Trình duyệt và máy chủ hiện không hỗ trợ giọng nói.");
        }
      }
    } catch (error: any) {
      console.error("TTS error:", error);
      alert("Lỗi khi chuẩn bị giọng đọc: " + (error.message || "Lỗi không xác định"));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSaveLesson = () => {
    if (!result || activeTab !== 'lesson_plan') return;
    const newPlan: SavedLessonPlan = {
      id: Date.now().toString(),
      topic,
      subject,
      grade,
      content: result,
      timestamp: new Date().toISOString()
    };
    const updated = [newPlan, ...lessonHistory];
    setLessonHistory(updated);
    localStorage.setItem('edu_lesson_history', JSON.stringify(updated));
    alert("✅ Đã lưu giáo án vào lịch sử!");
  };

  const handleDeleteLesson = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm("Bạn có chắc muốn xóa giáo án này khỏi lịch sử?")) {
      const updated = lessonHistory.filter(p => p.id !== id);
      setLessonHistory(updated);
      localStorage.setItem('edu_lesson_history', JSON.stringify(updated));
    }
  };

  const handleSelectLesson = (plan: SavedLessonPlan) => {
    setTopic(plan.topic);
    setSubject(plan.subject);
    setGrade(plan.grade);
    setResult(plan.content);
    setShowHistory(false);
  };

  const handleSaveToLibrary = () => {
    if (!result) return;
    const name = prompt("Đặt tên cho tài liệu:", topic || `Tài liệu ${subject} `);
    if (name) {
      const contentToSave = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
      onSaveToLibrary(name, contentToSave);
      alert("✅ Đã lưu tài liệu vào Thư viện thành công!");
    }
  };

  const handlePrintCrossword = () => {
    if (!result || !result.size || !result.words) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const { size, words } = result;

    // Xác định các ô cần tô đen/trắng
    const gridMap = Array(size).fill(null).map(() => Array(size).fill(false));
    words.forEach((word: any) => {
      for (let i = 0; i < word.word.length; i++) {
        if (word.direction === 'across') {
          gridMap[word.row][word.col + i] = true;
        } else {
          gridMap[word.row + i][word.col] = true;
        }
      }
    });

    let gridHtml = `<div class="grid" style="grid-template-columns: repeat(${size}, 1fr);">`;
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const isActive = gridMap[r][c];
        gridHtml += `<div class="cell ${isActive ? 'active' : 'black'}"></div>`;
      }
    }
    gridHtml += `</div>`;

    const html = `
        <!DOCTYPE html>
          <html>
            <head>
              <title>Ô chữ: ${topic}</title>
              <style>
                body { font-family: 'Times New Roman', serif; padding: 40px; max-width: 800px; margin: 0 auto; }
                h1 { text-align: center; text-transform: uppercase; color: #333; margin-bottom: 10px; }
                .sub-title { text-align: center; margin-bottom: 30px; font-style: italic; color: #666; }
                .container { display: flex; flex-direction: column; align-items: center; gap: 30px; }
                .grid { display: grid; border: 2px solid #333; width: 100%; max-width: 500px; aspect-ratio: 1/1; background: #333; gap: 1px; }
                .cell { background: #fff; position: relative; }
                .cell.black { background: #333; }
                .clues-container { width: 100%; display: grid; grid-template-columns: 1fr 1fr; gap: 40px; }
                .clues-col h3 { border-bottom: 2px solid #eee; padding-bottom: 10px; margin-bottom: 15px; }
                ul { list-style: none; padding: 0; }
                li { margin-bottom: 10px; line-height: 1.4; }
                .footer { margin-top: 50px; text-align: center; font-size: 12px; color: #999; border-top: 1px solid #eee; padding-top: 10px; }
              </style>
            </head>
            <body>
              <h1>Trò chơi Ô chữ</h1>
              <p class="sub-title">Chủ đề: ${topic}</p>
              <div class="container">
                ${gridHtml}
                <div class="clues-container">
                  <div class="clues-col">
                    <h3>Hàng ngang</h3>
                    <ul>${words.filter((w: any) => w.direction === 'across').map((w: any) => `<li><b>(${w.col + 1}, ${w.row + 1}):</b> ${w.clue}</li>`).join('')}</ul>
                  </div>
                  <div class="clues-col">
                    <h3>Hàng dọc</h3>
                    <ul>${words.filter((w: any) => w.direction === 'down').map((w: any) => `<li><b>(${w.col + 1}, ${w.row + 1}):</b> ${w.clue}</li>`).join('')}</ul>
                  </div>
                </div>
              </div>
              <div class="footer">Được tạo bởi Trợ lý Giáo viên AI</div>
              <script>setTimeout(() => window.print(), 500);</script>
            </body>
          </html>`;

    printWindow.document.write(html);
    printWindow.document.close();
  };

  const handlePdfToolUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== 'application/pdf') {
      alert('Vui lòng chọn file PDF!');
      return;
    }
    setPdfToolFile(file);

    // @ts-ignore
    const { PDFDocument } = await import('https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/+esm');

    const arrayBuffer = await file.arrayBuffer();
    const pdfDoc = await PDFDocument.load(arrayBuffer);
    const count = pdfDoc.getPageCount();
    setPdfPageCount(count);
    setSplitRange({ start: 1, end: Math.min(count, 5) }); // Mặc định cắt 5 trang đầu
  };

  const handleSplitPdf = async () => {
    if (!pdfToolFile) return;

    // @ts-ignore
    const { PDFDocument } = await import('https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/+esm');

    const arrayBuffer = await pdfToolFile.arrayBuffer();
    const pdfDoc = await PDFDocument.load(arrayBuffer);
    const newPdf = await PDFDocument.create();

    const pageIndices = Array.from({ length: splitRange.end - splitRange.start + 1 }, (_, i) => splitRange.start - 1 + i);
    const pages = await newPdf.copyPages(pdfDoc, pageIndices);
    pages.forEach(page => newPdf.addPage(page));

    const pdfBytes = await newPdf.save();
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Cat_Trang_${splitRange.start} -${splitRange.end}_${pdfToolFile.name} `;
    link.click();
  };

  return (
    <div className="h-full flex flex-col space-y-6 animate-in fade-in duration-500 overflow-hidden">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-slate-800 tracking-tight">Kho Tiện ích Sáng tạo</h2>
          <p className="text-sm text-slate-500 font-medium">Biến bài giảng trở nên sinh động và cuốn hút hơn.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2 bg-white p-1 rounded-2xl shadow-sm h-fit">
        <button
          onClick={() => { setActiveTab('lesson_plan'); setResult(null); setAudioUrl(null); }}
          className={`flex items-center justify-center space-x-2 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'lesson_plan' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-50'}`}
        >
          <i className="fas fa-file-signature"></i>
          <span>Giáo án 2345</span>
        </button>
        <button
          onClick={() => { setActiveTab('games'); setResult(null); setAudioUrl(null); }}
          className={`flex items-center justify-center space-x-2 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'games' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-50'}`}
        >
          <i className="fas fa-gamepad"></i>
          <span>Trò chơi</span>
        </button>
        <button
          onClick={() => { setActiveTab('images'); setResult(null); setAudioUrl(null); }}
          className={`flex items-center justify-center space-x-2 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'images' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-50'}`}
        >
          <i className="fas fa-image"></i>
          <span>Minh họa AI</span>
        </button>
        <button
          onClick={() => { setActiveTab('tts'); setResult(null); setAudioUrl(null); }}
          className={`flex items-center justify-center space-x-2 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'tts' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-50'}`}
        >
          <i className="fas fa-volume-up"></i>
          <span>Giọng đọc</span>
        </button>
        <button
          onClick={() => { setActiveTab('video'); setResult(null); setAudioUrl(null); }}
          className={`flex items-center justify-center space-x-2 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'video' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-50'}`}
        >
          <i className="fas fa-film"></i>
          <span>Tạo Video</span>
        </button>
        <button
          onClick={() => { setActiveTab('assistant'); setResult(null); setAudioUrl(null); }}
          className={`flex items-center justify-center space-x-2 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'assistant' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-50'}`}
        >
          <i className="fas fa-user-robot"></i>
          <span>Trợ lý Chat</span>
        </button>
        <button
          onClick={() => { setActiveTab('pdf_tools'); setResult(null); setAudioUrl(null); }}
          className={`flex items-center justify-center space-x-2 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'pdf_tools' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-50'}`}
        >
          <i className="fas fa-scissors"></i>
          <span>Cắt PDF</span>
        </button>
      </div>

      {/* Helper function to handle speech */}
      {(() => {
        // Pre-load voices for the browser
        if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
          window.speechSynthesis.getVoices();
        }
        return null;
      })()}

      {activeTab === 'assistant' ? (
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6 overflow-hidden min-h-0">
          <div className="lg:col-span-1 bg-white p-6 rounded-[32px] border border-slate-200 shadow-sm space-y-5 flex flex-col h-full overflow-y-auto custom-scrollbar">
            <h3 className="text-sm font-black uppercase tracking-widest text-slate-800">Chọn Trợ lý Thông minh</h3>
            <div className="space-y-3">
              {ASSISTANT_PERSONAS.map(persona => (
                <button
                  key={persona.id}
                  onClick={() => setActiveAssistant(persona)}
                  className={`w-full p-4 rounded-2xl border text-left transition-all flex items-start space-x-4 ${activeAssistant?.id === persona.id ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg' : 'bg-slate-50 border-slate-100 hover:border-indigo-200'}`}
                >
                  <div className={`w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center ${activeAssistant?.id === persona.id ? 'bg-white/20' : 'bg-white'}`}>
                    <i className={`fas ${persona.icon} ${activeAssistant?.id === persona.id ? 'text-white' : 'text-indigo-600'}`}></i>
                  </div>
                  <div>
                    <p className="font-black text-sm">{persona.name}</p>
                    <p className={`text-xs mt-1 ${activeAssistant?.id === persona.id ? 'text-indigo-200' : 'text-slate-500'}`}>{persona.description}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
          <div className="lg:col-span-2 bg-white rounded-[40px] border border-slate-200 shadow-sm overflow-hidden flex flex-col min-h-0">
            {activeAssistant ? (
              <>
                <div className="px-8 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Trò chuyện với: {activeAssistant.name}</span>
                  <button onClick={() => setActiveAssistant(null)} className="text-xs font-bold text-slate-400 hover:text-rose-500">Đổi trợ lý</button>
                </div>
                <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                  {assistantMessages.map(msg => <ChatMessage key={msg.id} message={msg} />)}
                  <div ref={assistantMessagesEndRef} />
                </div>
                <div className="p-6 bg-white border-t border-slate-100">
                  {pendingAttachments.length > 0 && (
                    <div className="flex gap-2 mb-3 overflow-x-auto pb-2 custom-scrollbar">
                      {pendingAttachments.map((att, idx) => (
                        <div key={idx} className="relative shrink-0 group">
                          {att.type === 'image' ? (
                            <img src={`data:${att.mimeType}; base64, ${att.data} `} className="h-16 w-auto rounded-lg border border-slate-200 shadow-sm object-cover" alt={att.name} />
                          ) : (
                            <div className="h-16 w-16 flex flex-col items-center justify-center bg-slate-50 rounded-lg border border-slate-200 p-1">
                              <i className={`fas ${att.mimeType?.includes('pdf') ? 'fa-file-pdf text-rose-500' : 'fa-file-lines text-blue-500'} text - xl mb - 1`}></i>
                              <span className="text-[8px] text-slate-500 truncate w-full text-center">{att.name}</span>
                            </div>
                          )}
                          <button onClick={() => removeAttachment(idx)} className="absolute -top-2 -right-2 bg-rose-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px] shadow-md hover:bg-rose-600"><i className="fas fa-times"></i></button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="relative flex items-end bg-slate-50 border-2 border-slate-100 rounded-[28px] p-2 focus-within:border-indigo-400 focus-within:bg-white transition-all">
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="w-10 h-12 flex items-center justify-center text-slate-400 hover:text-indigo-600 transition-colors rounded-xl hover:bg-indigo-50 mr-1"
                      title="Đính kèm tệp (Ảnh, PDF...)"
                    >
                      <i className="fas fa-paperclip"></i>
                    </button>
                    <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileChange} />

                    <textarea
                      value={assistantInput}
                      onChange={e => setAssistantInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendAssistantMessage(); } }}
                      placeholder={`Hỏi ${activeAssistant.name}...`}
                      className="flex-1 bg-transparent border-none focus:ring-0 py-3 px-2 text-[14px] font-medium text-slate-700 resize-none max-h-[200px]"
                      rows={1}
                    />
                    <button
                      onClick={handleSendAssistantMessage}
                      disabled={isAssistantLoading}
                      className={`w-12 h-12 flex items-center justify-center rounded-2xl transition-all ${assistantInput.trim() || pendingAttachments.length > 0 ? 'bg-indigo-600 text-white shadow-lg' : 'bg-slate-200 text-slate-400'}`}
                    >
                      <i className={`fas ${isAssistantLoading ? 'fa-circle-notch fa-spin' : 'fa-paper-plane'}`}></i>
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center opacity-20">
                <div className="w-24 h-24 bg-slate-50 rounded-[40px] flex items-center justify-center mb-6">
                  <i className="fas fa-user-robot text-5xl text-slate-300"></i>
                </div>
                <p className="text-sm font-black uppercase tracking-[0.4em] text-slate-400">Vui lòng chọn một trợ lý</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6 overflow-hidden min-h-0">
          <div className="lg:col-span-1 bg-white p-6 rounded-[32px] border border-slate-200 shadow-sm space-y-5 flex flex-col h-full overflow-y-auto custom-scrollbar">
            <div className="space-y-4 flex-1 flex flex-col">
              {(activeTab === 'games' || activeTab === 'lesson_plan' || activeTab === 'pdf_tools') && (
                <>
                  {activeTab === 'games' && (
                    <div className="mb-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Loại trò chơi</label>
                      <div className="grid grid-cols-3 gap-2 mt-1 bg-slate-100 p-1 rounded-xl">
                        <button onClick={() => { setGameType('idea'); setResult(null); }} className={`py-2 rounded-lg text-[9px] font-bold uppercase ${gameType === 'idea' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500'}`}>Soạn Ý tưởng</button>
                        <button onClick={() => { setGameType('crossword'); setResult(null); }} className={`py-2 rounded-lg text-[9px] font-bold uppercase ${gameType === 'crossword' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500'}`}>Tạo Ô chữ</button>
                        <button onClick={() => { setGameType('quiz'); setResult(null); }} className={`py-2 rounded-lg text-[9px] font-bold uppercase ${gameType === 'quiz' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500'}`}>Quiz Thi đua</button>
                      </div>
                      {gameType === 'quiz' && (
                        <div className="mt-3 animate-in fade-in slide-in-from-top-1">
                          <div className="flex bg-slate-100 p-1 rounded-xl mb-3">
                            <button onClick={() => setQuizMode('topic')} className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold uppercase ${quizMode === 'topic' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500'}`}>Từ Chủ đề</button>
                            <button onClick={() => setQuizMode('file')} className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold uppercase ${quizMode === 'file' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500'}`}>Từ File Ảnh/PDF</button>
                          </div>

                          {quizMode === 'topic' ? (
                            <>
                              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Số lượng câu hỏi</label>
                              <div className="flex items-center space-x-2 mt-1">
                                {[5, 10, 15].map(num => (
                                  <button
                                    key={num}
                                    onClick={() => setQuizCount(num)}
                                    className={`flex-1 py-2 rounded-xl text-[10px] font-bold border transition-all ${quizCount === num ? 'bg-indigo-50 text-indigo-600 border-indigo-200 shadow-sm' : 'bg-white text-slate-400 border-slate-100 hover:border-indigo-100'}`}
                                  >
                                    {num} câu
                                  </button>
                                ))}
                              </div>
                            </>
                          ) : (
                            <div>
                              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Tải lên đề thi (Ảnh/PDF - Chọn nhiều file)</label>
                              <input
                                type="file"
                                multiple
                                accept="image/*,.pdf"
                                onChange={(e) => {
                                  if (e.target.files) {
                                    handleFileChange(e as any);
                                  }
                                }}
                                className="mt-1 block w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                              />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  {activeTab === 'lesson_plan' && (
                    <div className="flex justify-end mb-2 space-x-2">
                      <button
                        onClick={() => setUseTemplateMode(!useTemplateMode)}
                        className={`text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-lg transition-colors border ${useTemplateMode ? 'bg-indigo-600 text-white border-indigo-600' : 'text-indigo-600 hover:bg-indigo-50 border-indigo-100'}`}
                      >
                        <i className={`fas ${useTemplateMode ? 'fa-toggle-on' : 'fa-toggle-off'} mr - 1`}></i>
                        {useTemplateMode ? 'Theo Mẫu & Kế hoạch' : 'Soạn nhanh'}
                      </button>
                      <button
                        onClick={() => setShowHistory(!showHistory)}
                        className="text-[10px] font-bold uppercase tracking-widest text-indigo-600 hover:bg-indigo-50 px-3 py-1.5 rounded-lg transition-colors border border-indigo-100"
                      >
                        {showHistory ? <><i className="fas fa-times mr-1"></i>Đóng lịch sử</> : <><i className="fas fa-clock-rotate-left mr-1"></i>Lịch sử giáo án</>}
                      </button>
                    </div>
                  )}

                  {showHistory && activeTab === 'lesson_plan' ? (
                    <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
                      {lessonHistory.length === 0 ? (
                        <p className="text-xs text-slate-400 text-center py-4">Chưa có giáo án nào được lưu.</p>
                      ) : (
                        lessonHistory.map(plan => (
                          <div key={plan.id} onClick={() => handleSelectLesson(plan)} className="p-3 bg-slate-50 rounded-xl border border-slate-100 cursor-pointer hover:bg-indigo-50 hover:border-indigo-200 transition-all group relative">
                            <div className="font-bold text-xs text-slate-700 line-clamp-2 mb-1">{plan.topic}</div>
                            <div className="flex justify-between items-center">
                              <span className="text-[9px] text-slate-400 font-medium uppercase">{plan.subject} - {plan.grade}</span>
                              <span className="text-[9px] text-slate-400">{new Date(plan.timestamp).toLocaleDateString('vi-VN')}</span>
                            </div>
                            <button onClick={(e) => handleDeleteLesson(plan.id, e)} className="absolute top-2 right-2 text-slate-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity"><i className="fas fa-trash"></i></button>
                          </div>
                        ))
                      )}
                    </div>
                  ) : useTemplateMode ? (
                    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
                      <div className="p-4 bg-blue-50 rounded-xl border border-blue-100 text-blue-800 text-xs">
                        <i className="fas fa-info-circle mr-2"></i>
                        Tính năng này giúp AI soạn giáo án theo đúng <b>Cấu trúc File Mẫu</b> (Word) và <b>Nội dung Kế hoạch</b> (Excel/Word) của Thầy Cô.
                      </div>

                      <div>
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">1. Tải lên File Mẫu (Cấu trúc)</label>
                        <div className="mt-1 flex items-center space-x-2">
                          <input
                            type="file"
                            accept=".docx,.doc,.txt"
                            onChange={(e) => setTemplateFile(e.target.files ? e.target.files[0] : null)}
                            className="block w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                          />
                        </div>
                        {templateFile && <p className="mt-1 text-[10px] text-emerald-600 font-bold"><i className="fas fa-check mr-1"></i>Đã chọn: {templateFile.name}</p>}
                      </div>

                      <div>
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">2. Tải lên File Kế hoạch (Nội dung)</label>
                        <div className="mt-1 flex items-center space-x-2">
                          <input
                            type="file"
                            accept=".xlsx,.xls,.docx,.doc,.txt"
                            onChange={(e) => setPlanFile(e.target.files ? e.target.files[0] : null)}
                            className="block w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                          />
                        </div>
                        {planFile && <p className="mt-1 text-[10px] text-emerald-600 font-bold"><i className="fas fa-check mr-1"></i>Đã chọn: {planFile.name}</p>}
                      </div>
                    </div>
                  ) : (
                    activeTab === 'pdf_tools' ? (
                      <div className="space-y-4 animate-in fade-in">
                        <div className="p-4 bg-indigo-50 rounded-xl border border-indigo-100 text-indigo-800 text-xs">
                          <i className="fas fa-info-circle mr-2"></i>
                          Công cụ giúp Thầy Cô chia nhỏ file đề thi lớn để AI xử lý dễ dàng hơn.
                        </div>
                        <div>
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Chọn File PDF gốc</label>
                          <input
                            type="file"
                            accept=".pdf"
                            onChange={handlePdfToolUpload}
                            className="mt-1 block w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                          />
                        </div>
                        {pdfToolFile && (
                          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                            <p className="text-xs font-bold text-slate-700"><i className="fas fa-file-pdf mr-2 text-rose-500"></i>{pdfToolFile.name} ({pdfPageCount} trang)</p>
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="text-[9px] font-black text-slate-400 uppercase">Từ trang</label>
                                <input type="number" min="1" max={pdfPageCount} value={splitRange.start} onChange={(e) => setSplitRange(prev => ({ ...prev, start: parseInt(e.target.value) }))} className="w-full mt-1 px-3 py-2 rounded-lg border border-slate-200 text-xs font-bold" />
                              </div>
                              <div>
                                <label className="text-[9px] font-black text-slate-400 uppercase">Đến trang</label>
                                <input type="number" min="1" max={pdfPageCount} value={splitRange.end} onChange={(e) => setSplitRange(prev => ({ ...prev, end: parseInt(e.target.value) }))} className="w-full mt-1 px-3 py-2 rounded-lg border border-slate-200 text-xs font-bold" />
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Môn học</label>
                          <select
                            value={subject}
                            onChange={e => setSubject(e.target.value)}
                            className="w-full mt-1 bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-xs font-bold focus:ring-2 focus:ring-indigo-500 outline-none"
                          >
                            <option>Toán</option>
                            <option>Tiếng Việt</option>
                            <option>Tiếng Anh</option>
                            <option>Đạo đức</option>
                            <option>Tự nhiên & Xã hội</option>
                            <option>Lịch sử & Địa lí</option>
                            <option>Khoa học</option>
                            <option>Công nghệ</option>
                            <option>Tin học</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Lớp</label>
                          <select
                            value={grade}
                            onChange={e => setGrade(e.target.value)}
                            className="w-full mt-1 bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-xs font-bold focus:ring-2 focus:ring-indigo-500 outline-none"
                          >
                            <option>Lớp 1</option>
                            <option>Lớp 2</option>
                            <option>Lớp 3</option>
                            <option>Lớp 4</option>
                            <option>Lớp 5</option>
                          </select>
                        </div>
                      </div>
                    ))}
                </>
              )}

              {activeTab === 'images' && (
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Môn học minh họa</label>
                  <select
                    value={subject}
                    onChange={e => setSubject(e.target.value)}
                    className="w-full mt-1 bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-xs font-bold focus:ring-2 focus:ring-indigo-500 outline-none"
                  >
                    <option>Toán</option>
                    <option>Tiếng Việt</option>
                    <option>Khoa học</option>
                    <option>Lịch sử & Địa lí</option>
                  </select>
                </div>
              )}

              {activeTab === 'video' && (
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Phong cách Video</label>
                  <select
                    value={videoStyle}
                    onChange={e => setVideoStyle(e.target.value)}
                    className="w-full mt-1 bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-xs font-bold focus:ring-2 focus:ring-indigo-500 outline-none"
                  >
                    <option>Hoạt hình đơn giản</option>
                    <option>Tranh vẽ màu nước</option>
                    <option>Phong cách 3D</option>
                  </select>
                </div>
              )}

              {activeTab === 'tts' && (
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Giọng đọc</label>
                  <div className="grid grid-cols-2 gap-2 mt-1">
                    <button
                      onClick={() => setVoiceName('Kore')}
                      className={`py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${voiceName === 'Kore' ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' : 'bg-slate-50 text-slate-400 border-slate-100'}`}
                    >
                      <i className="fas fa-mars mr-2"></i>Giọng Nam
                    </button>
                    <button
                      onClick={() => setVoiceName('Puck')}
                      className={`py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${voiceName === 'Puck' ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' : 'bg-slate-50 text-slate-400 border-slate-100'}`}
                    >
                      <i className="fas fa-venus mr-2"></i>Giọng Nữ
                    </button>
                  </div>
                </div>
              )}

              {!showHistory && !(activeTab === 'lesson_plan' && useTemplateMode) && !(activeTab === 'games' && gameType === 'quiz' && quizMode === 'file') && activeTab !== 'pdf_tools' && (
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
                    {activeTab === 'lesson_plan' ? 'Tên bài dạy' : activeTab === 'games' ? (gameType === 'crossword' ? 'Chủ đề ô chữ' : gameType === 'quiz' ? 'Chủ đề Quiz' : 'Chủ đề bài học') : activeTab === 'images' ? 'Mô tả hình ảnh' : activeTab === 'video' ? 'Kịch bản / Mô tả video' : 'Văn bản cần đọc'}
                  </label>
                  <textarea
                    value={topic}
                    onChange={e => setTopic(e.target.value)}
                    placeholder={activeTab === 'lesson_plan' ? "VD: Bài 12: Phép cộng trong phạm vi 10..." : activeTab === 'games' ? (gameType === 'crossword' ? 'VD: Động vật hoang dã' : gameType === 'quiz' ? 'VD: Lịch sử Việt Nam' : 'VD: Phép nhân số có 1 chữ số...') : activeTab === 'images' ? "VD: Một chú voi con đang tung tăng trong rừng..." : activeTab === 'video' ? "VD: Một quả táo rơi từ trên cây xuống. Newton ngồi dưới gốc cây và suy ngẫm..." : "VD: Ngày xửa ngày xưa, ở một ngôi làng nhỏ..."}
                    className="w-full mt-1 bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-xs focus:ring-2 focus:ring-indigo-500 outline-none h-32 resize-none leading-relaxed"
                  />
                </div>
              )}

              {!showHistory && ((activeTab === 'lesson_plan' && !useTemplateMode) || (activeTab === 'games' && gameType === 'quiz')) && (
                <div className="mt-3">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Yêu cầu thêm cho AI (Tùy chọn)</label>
                  <textarea
                    value={additionalPrompt}
                    onChange={e => setAdditionalPrompt(e.target.value)}
                    placeholder={activeTab === 'lesson_plan' ? "VD: Soạn kỹ phần khởi động, thêm trò chơi, chú trọng phẩm chất nhân ái..." : "VD: Tập trung vào hình học, mức độ khó, giải thích chi tiết..."}
                    className="w-full mt-1 bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-xs focus:ring-2 focus:ring-indigo-500 outline-none h-20 resize-none leading-relaxed"
                  />
                </div>
              )}

              {!showHistory && activeTab !== 'pdf_tools' && (
                <div className="pt-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 flex items-center justify-between">
                    <span>Tài liệu mẫu tham khảo (Tùy chọn)</span>
                    <button onClick={() => fileInputRef.current?.click()} className="text-indigo-600 hover:underline">Thêm tệp</button>
                  </label>
                  <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileChange} />
                  <div className="mt-2 space-y-2">
                    {pendingAttachments.map((at, i) => (
                      <div key={i} className="flex items-center justify-between p-2 bg-slate-50 rounded-lg border border-slate-100 text-[10px] font-bold text-slate-600">
                        <div className="flex items-center space-x-2 truncate">
                          <i className={`fas ${at.mimeType?.includes('pdf') ? 'fa-file-pdf text-rose-500' : 'fa-file-lines text-blue-500'} `}></i>
                          <span className="truncate">{at.name}</span>
                        </div>
                        <button onClick={() => removeAttachment(i)} className="text-slate-300 hover:text-rose-500">
                          <i className="fas fa-times"></i>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {!showHistory && (
              <button
                onClick={activeTab === 'lesson_plan' ? generateLessonPlan : activeTab === 'games' ? (gameType === 'crossword' ? generateCrossword : gameType === 'quiz' ? (quizMode === 'file' ? generateQuizFromUpload : generateQuiz) : generateGame) : activeTab === 'images' ? generateAIVisual : activeTab === 'video' ? generateVideo : activeTab === 'pdf_tools' ? handleSplitPdf : generateTTS}
                disabled={isProcessing || (activeTab === 'lesson_plan' && useTemplateMode ? (!templateFile || !planFile) : activeTab === 'pdf_tools' ? !pdfToolFile : (activeTab === 'games' && gameType === 'quiz' && quizMode === 'file' ? pendingAttachments.length === 0 : !topic.trim()))}
                className={`w-full py-4 mt-auto rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl transition-all active:scale-95 disabled:opacity-50 ${activeTab === 'pdf_tools' ? 'bg-emerald-600 text-white shadow-emerald-100 hover:bg-emerald-700' : 'bg-indigo-600 text-white shadow-indigo-100 hover:bg-indigo-700'}`}
              >
                {isProcessing ? <i className="fas fa-spinner fa-spin mr-2"></i> : <i className="fas fa-magic mr-2"></i>}
                {isProcessing ? 'Đang thực hiện...' : activeTab === 'lesson_plan' ? 'Bắt đầu soạn giáo án' : activeTab === 'games' ? (gameType === 'crossword' ? 'Tạo ô chữ' : gameType === 'quiz' ? 'Tạo Quiz' : 'Bắt đầu sáng tạo') : activeTab === 'images' ? 'Tạo Hình ảnh' : activeTab === 'video' ? 'Tạo Video' : activeTab === 'pdf_tools' ? 'Cắt & Tải về' : activeTab === 'tts' ? 'Tạo Giọng đọc' : 'Bắt đầu sáng tạo'}
              </button>
            )}
          </div>

          <div className="lg:col-span-2 bg-white rounded-[40px] border border-slate-200 shadow-sm overflow-hidden flex flex-col min-h-0">
            <div className="px-8 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Kết quả sáng tạo AI</span>
              {result && (activeTab === 'games' || activeTab === 'lesson_plan') && (
                <div className="flex flex-wrap items-center gap-2">
                  {activeTab === 'lesson_plan' && (
                    <>
                      <div className="flex items-center space-x-2 p-1 bg-slate-100 rounded-xl border border-slate-200">
                        <select value={docxFont} onChange={e => setDocxFont(e.target.value)} className="bg-transparent text-xs font-bold text-slate-600 border-0 focus:ring-0 py-1.5">
                          <option>Times New Roman</option>
                          <option>Arial</option>
                          <option>Calibri</option>
                          <option>Garamond</option>
                        </select>
                        <div className="w-px h-4 bg-slate-200"></div>
                        <select value={docxFontSize} onChange={e => setDocxFontSize(Number(e.target.value))} className="bg-transparent text-xs font-bold text-slate-600 border-0 focus:ring-0 py-1.5">
                          <option>12</option>
                          <option>13</option>
                          <option>14</option>
                        </select>
                        <div className="w-px h-4 bg-slate-200"></div>
                        <select value={docxAlignment} onChange={e => setDocxAlignment(e.target.value as any)} className="bg-transparent text-xs font-bold text-slate-600 border-0 focus:ring-0 py-1.5" title="Căn lề">
                          <option value="justify">Đều</option>
                          <option value="left">Trái</option>
                          <option value="center">Giữa</option>
                          <option value="right">Phải</option>
                        </select>
                        <div className="w-px h-4 bg-slate-200"></div>
                        <select value={docxLineSpacing} onChange={e => setDocxLineSpacing(Number(e.target.value))} className="bg-transparent text-xs font-bold text-slate-600 border-0 focus:ring-0 py-1.5" title="Giãn dòng">
                          <option value={1.0}>1.0</option>
                          <option value={1.15}>1.15</option>
                          <option value={1.5}>1.5</option>
                          <option value={2.0}>2.0</option>
                        </select>
                      </div>
                      <button
                        onClick={() => downloadLessonPlanAsDocx(result, topic ? `Giao_an_${topic.replace(/\s+/g, '_')}.docx` : "Giao_an_AI.docx", { font: docxFont, fontSize: docxFontSize, alignment: docxAlignment, lineSpacing: docxLineSpacing })}
                        className="px-4 py-2 bg-blue-50 text-blue-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-100 transition-all border border-blue-100"
                      >
                        <i className="fas fa-file-word mr-2"></i>Tải về (.docx)
                      </button>
                      <button
                        onClick={handleSaveLesson}
                        className="px-4 py-2 bg-emerald-50 text-emerald-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-100 transition-all border border-emerald-100"
                      >
                        <i className="fas fa-save mr-2"></i>Lưu giáo án
                      </button>
                    </>
                  )}
                  {activeTab === 'games' && gameType === 'crossword' && (
                    <button
                      onClick={handlePrintCrossword}
                      className="px-4 py-2 bg-emerald-50 text-emerald-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-100 transition-all"
                    >
                      <i className="fas fa-print mr-2"></i>In phiếu
                    </button>
                  )}
                  <button
                    onClick={() => onSendToWorkspace(result)}
                    className="px-4 py-2 bg-indigo-50 text-indigo-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-100 transition-all"
                  >
                    {activeTab === 'lesson_plan' ? 'Đưa vào Giáo án' : 'Đưa vào Soạn thảo'}
                  </button>
                  <button
                    onClick={handleSaveToLibrary}
                    className="px-4 py-2 bg-purple-50 text-purple-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-purple-100 transition-all"
                  >
                    <i className="fas fa-book-bookmark mr-2"></i>Lưu Thư viện
                  </button>
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
              {isProcessing ? (
                <div className="h-full flex flex-col items-center justify-center space-y-6">
                  <div className="relative">
                    <div className="w-20 h-20 border-4 border-indigo-100 rounded-full"></div>
                    <div className="absolute top-0 left-0 w-20 h-20 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                  </div>
                  <div className="text-center">
                    <p className="text-xs font-black text-slate-800 uppercase tracking-widest">AI đang làm việc</p>
                    <p className="text-[10px] text-slate-400 font-bold uppercase mt-1 tracking-tighter">Vui lòng đợi trong giây lát</p>
                  </div>
                </div>
              ) : result ? (
                <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                  {activeTab === 'games' && gameType === 'crossword' && typeof result === 'object' ? (
                    <Crossword data={result} />
                  ) : activeTab === 'games' && gameType === 'quiz' && Array.isArray(result) ? (
                    <QuizPlayer data={result} onShare={handleShareQuiz} />
                  ) : activeTab === 'images' ? (
                    <div className="flex flex-col items-center">
                      <div className="relative group">
                        <img src={result} alt="AI Visual" className="w-full max-w-lg rounded-[32px] shadow-2xl border-4 border-white" />
                        <div className="absolute inset-0 bg-indigo-600/10 opacity-0 group-hover:opacity-100 transition-opacity rounded-[32px] pointer-events-none"></div>
                      </div>
                      <div className="mt-8 flex space-x-3">
                        <a href={result} download="MinhHoa_AI.png" className="px-8 py-4 bg-indigo-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-700 shadow-xl shadow-indigo-100 active:scale-95 transition-all">
                          <i className="fas fa-download mr-2"></i>Tải hình ảnh (.png)
                        </a>
                      </div>
                    </div>
                  ) : activeTab === 'video' ? (
                    <div className="flex flex-col items-center">
                      <div className="relative group w-full max-w-lg aspect-video bg-black rounded-[32px] shadow-2xl border-4 border-white overflow-hidden">
                        <img
                          src={result}
                          alt="Video Scene"
                          className={`w-full h-full object-cover transition-transform duration-[20s] ease-linear ${isPlaying ? 'scale-125' : 'scale-100'}`}
                        />
                        {!isPlaying && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/10 transition-all cursor-pointer" onClick={handlePlayWithVoiceover}>
                            <div className="w-16 h-16 bg-white/90 rounded-full flex items-center justify-center shadow-lg backdrop-blur-sm text-indigo-600 pl-1">
                              <i className="fas fa-play text-2xl"></i>
                            </div>
                          </div>
                        )}
                      </div>
                      <div className="mt-8 flex flex-col items-center space-y-3">
                        <div className="flex space-x-3">
                          <button onClick={handlePlayWithVoiceover} className={`px-8 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl active:scale-95 transition-all ${isPlaying ? 'bg-rose-500 text-white shadow-rose-100' : 'bg-purple-600 text-white shadow-purple-100 hover:bg-purple-700'}`}>
                            <i className={`fas ${isPlaying ? 'fa-stop' : 'fa-play'} mr-2`}></i>{isPlaying ? 'Dừng phát' : 'Phát Video AI'}
                          </button>
                          <a href={result} download="Video_Scene.png" className="px-8 py-4 bg-indigo-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-700 shadow-xl shadow-indigo-100 active:scale-95 transition-all flex items-center">
                            <i className="fas fa-download mr-2"></i>Tải Ảnh nền
                          </a>
                        </div>
                        <p className="text-[10px] text-slate-400 font-medium">Video được tạo từ công nghệ biến ảnh tĩnh thành động (Ken Burns Effect).</p>
                      </div>
                    </div>
                  ) : activeTab === 'tts' ? (
                    <div className="flex flex-col items-center justify-center h-full space-y-8">
                      <div className="w-24 h-24 bg-emerald-50 rounded-full flex items-center justify-center text-emerald-600 animate-pulse">
                        <i className="fas fa-volume-high text-3xl"></i>
                      </div>
                      <div className="text-center space-y-4">
                        <p className="text-lg font-bold text-slate-700">{result}</p>
                        {(audioUrl || result) && (
                          <div className="bg-slate-50 p-6 rounded-[32px] border border-slate-100 shadow-inner w-full max-w-sm">
                            <audio ref={audioRef} src={audioUrl || ''} className="hidden" />
                            <div className="flex items-center justify-center space-x-4">
                              <button
                                onClick={() => {
                                  if (audioUrl) {
                                    audioRef.current?.play();
                                    setIsPlaying(true);
                                  } else if ('speechSynthesis' in window) {
                                    window.speechSynthesis.cancel();
                                    const utterance = new SpeechSynthesisUtterance(topic);
                                    utterance.lang = 'vi-VN';
                                    utterance.rate = 0.9;

                                    const voices = window.speechSynthesis.getVoices();
                                    const viVoices = voices.filter(v => v.lang.includes('vi'));
                                    if (viVoices.length > 0) {
                                      if (voiceName === 'Kore') {
                                        utterance.voice = viVoices.find(v => v.name.toLowerCase().includes('nam') || v.name.toLowerCase().includes('male') || v.name.toLowerCase().includes('minh') || v.name.toLowerCase().includes('khang')) || viVoices[0];
                                      } else {
                                        utterance.voice = viVoices.find(v => v.name.toLowerCase().includes('hoai') || v.name.toLowerCase().includes('my') || v.name.toLowerCase().includes('nu') || v.name.toLowerCase().includes('female') || v.name.toLowerCase().includes('google') || v.name.toLowerCase().includes('thao') || v.name.toLowerCase().includes('linh')) || viVoices[0];
                                      }
                                    }

                                    utterance.onstart = () => setIsPlaying(true);
                                    utterance.onend = () => setIsPlaying(false);
                                    utterance.onerror = () => setIsPlaying(false);

                                    window.speechSynthesis.speak(utterance);
                                  }
                                }}
                                className={`w-16 h-16 rounded-full flex items-center justify-center shadow-lg active:scale-90 transition-all ${isPlaying ? 'bg-emerald-500 text-white animate-pulse' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}
                              >
                                <i className={`fas ${isPlaying ? 'fa-waveform' : 'fa-play'} text-xl ${!isPlaying && 'ml-1'}`}></i>
                              </button>
                              <button
                                onClick={() => {
                                  if (audioUrl) {
                                    audioRef.current?.pause();
                                  }
                                  window.speechSynthesis.cancel();
                                  setIsPlaying(false);
                                }}
                                className="w-12 h-12 bg-white text-slate-400 border border-slate-200 rounded-full flex items-center justify-center hover:text-indigo-600 transition-all"
                              >
                                <i className="fas fa-pause"></i>
                              </button>
                            </div>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest text-center mt-4">
                              {isPlaying ? 'Đang phát giọng đọc...' : `Giọng ${voiceName === 'Kore' ? 'Nam' : 'Nữ'} • ${audioUrl ? 'Máy chủ' : 'Hệ thống'}`}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="p-4">
                      {activeTab === 'pdf_tools' ? (
                        <div className="text-center py-10 text-slate-400">
                          <i className="fas fa-file-pdf text-4xl mb-3 opacity-30"></i>
                          <p className="text-xs font-bold uppercase">File PDF đã được tải xuống máy của bạn.</p>
                        </div>
                      ) : (
                        <div className="whitespace-pre-wrap text-[15px] leading-relaxed text-slate-700 font-medium">
                          {typeof result === 'string' ? result : JSON.stringify(result, null, 2)}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center opacity-20">
                  <div className="w-24 h-24 bg-slate-50 rounded-[40px] flex items-center justify-center mb-6">
                    <i className={`fas ${activeTab === 'games' ? (gameType === 'crossword' ? 'fa-puzzle-piece' : 'fa-gamepad') : activeTab === 'images' ? 'fa-image' : activeTab === 'video' ? 'fa-film' : activeTab === 'pdf_tools' ? 'fa-scissors' : 'fa-microphone'} text - 5xl text - slate - 300`}></i>
                  </div>
                  <p className="text-sm font-black uppercase tracking-[0.4em] text-slate-400">Đang chờ ý tưởng của Thầy Cô</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Force update to fix build error
export default UtilityKit;
