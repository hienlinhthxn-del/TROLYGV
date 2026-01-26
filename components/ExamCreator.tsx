
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ExamQuestion, CognitiveLevel, Attachment } from '../types';
import { geminiService, FilePart } from '../services/geminiService';

interface ExamCreatorProps {
  onExportToWorkspace: (content: string) => void;
  onStartPractice?: (subject: string, grade: string, questions: ExamQuestion[]) => void;
}

const SUBJECT_STRANDS: Record<string, string[]> = {
  'Toán': ['Số và Phép tính', 'Hình học và Đo lường', 'Thống kê và Xác suất'],
  'Tiếng Việt': ['Đọc', 'Viết', 'Nói và nghe', 'Kiến thức tiếng Việt'],
  'Tiếng Anh': ['Phonetics', 'Vocabulary', 'Grammar', 'Reading', 'Writing'],
  'Tự nhiên và Xã hội': ['Gia đình', 'Trường học', 'Cộng đồng địa phương', 'Thực vật và động vật', 'Con người và sức khỏe', 'Trái đất và bầu trời'],
  'Khoa học': ['Chất', 'Năng lượng', 'Thực vật và động vật', 'Nấm, Vi khuẩn, Virus', 'Con người và sức khỏe', 'Sinh vật và môi trường']
};

const COGNITIVE_LEVELS: CognitiveLevel[] = ['Nhận biết', 'Thông hiểu', 'Vận dụng', 'Vận dụng cao'];

interface LevelConfig { mcq: number; essay: number; }
interface StrandConfig { [strandName: string]: { [level in CognitiveLevel]: LevelConfig; }; }

const ExamCreator: React.FC<ExamCreatorProps> = ({ onExportToWorkspace, onStartPractice }) => {
  const [config, setConfig] = useState({ subject: 'Toán', grade: '1', topic: '' });
  const [strandMatrix, setStrandMatrix] = useState<StrandConfig>({});
  const [isGenerating, setIsGenerating] = useState(false);
  const [questions, setQuestions] = useState<ExamQuestion[]>([]);
  const [readingPassage, setReadingPassage] = useState<string>('');
  const [viewMode, setViewMode] = useState<'config' | 'matrix'>('config');
  const [examHeader, setExamHeader] = useState<string>('');

  const [showImportModal, setShowImportModal] = useState(false);
  const [pendingImportFile, setPendingImportFile] = useState<Attachment | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const importFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const strands = SUBJECT_STRANDS[config.subject] || [];
    if (strands.length > 0) {
      const initial: StrandConfig = {};
      strands.forEach(s => {
        initial[s] = {
          'Nhận biết': { mcq: 0, essay: 0 },
          'Thông hiểu': { mcq: 0, essay: 0 },
          'Vận dụng': { mcq: 0, essay: 0 },
          'Vận dụng cao': { mcq: 0, essay: 0 }
        };
      });
      const first = strands[0];
      initial[first]['Nhận biết'].mcq = 2;
      initial[first]['Thông hiểu'].mcq = 2;
      initial[first]['Vận dụng'].essay = 1;
      setStrandMatrix(initial);
    }
  }, [config.subject]);

  const stats = useMemo(() => {
    let mcq = 0, essay = 0;
    const strandTotals: Record<string, number> = {};
    const levelTotals: Record<string, { mcq: number, essay: number }> = {};
    COGNITIVE_LEVELS.forEach(l => levelTotals[l] = { mcq: 0, essay: 0 });

    Object.entries(strandMatrix).forEach(([s, levels]) => {
      let st = 0;
      Object.entries(levels).forEach(([l, cfg]) => {
        mcq += cfg.mcq; essay += cfg.essay; st += cfg.mcq + cfg.essay;
        levelTotals[l].mcq += cfg.mcq; levelTotals[l].essay += cfg.essay;
      });
      strandTotals[s] = st;
    });
    return { mcq, essay, total: mcq + essay, strandTotals, levelTotals };
  }, [strandMatrix]);

  const updateCount = (strand: string, level: CognitiveLevel, type: 'mcq' | 'essay', delta: number) => {
    setStrandMatrix(prev => ({
      ...prev,
      [strand]: {
        ...prev[strand],
        [level]: { ...prev[strand][level], [type]: Math.max(0, prev[strand][level][type] + delta) }
      }
    }));
  };

  const handleGenerate = async () => {
    if (stats.total === 0) {
      alert("Vui lòng thiết lập số lượng câu hỏi trong ma trận.");
      return;
    }
    setIsGenerating(true);

    const matrixReq = Object.entries(strandMatrix)
      .filter(([_, levels]) => Object.values(levels).some(l => l.mcq > 0 || l.essay > 0))
      .map(([s, levels]) => {
        const details = Object.entries(levels)
          .map(([l, c]) => (c.mcq > 0 || c.essay > 0) ? `${l} (${c.mcq} Trắc nghiệm, ${c.essay} Tự luận)` : null)
          .filter(x => x).join(', ');
        return `- Mạch [${s}]: ${details}`;
      }).join('\n');

    const prompt = `Bạn là chuyên gia khảo thí Việt Nam. Hãy soạn đề thi mới hoàn toàn:
    - Môn: ${config.subject}, Lớp: ${config.grade}
    - Chủ đề: ${config.topic || 'Kiến thức tổng hợp'}
    - MA TRẬN YÊU CẦU:
    ${matrixReq}
    
    LƯU Ý RIÊNG CHO MÔN TIẾNG VIỆT/TIẾNG ANH:
    - Nếu có mạch "Đọc" hoặc "Đọc hiểu", bạn PHẢI tự sáng tác hoặc trích dẫn một văn bản (truyện ngắn, bài thơ, đoạn văn) phù hợp với lứa tuổi lớp ${config.grade} vào trường "readingPassage".
    - Các câu hỏi thuộc mạch "Đọc" phải khai thác nội dung từ văn bản này.`;

    try {
      const result = await geminiService.generateExamQuestionsStructured(prompt);

      if (!result || !result.questions || !Array.isArray(result.questions)) {
        throw new Error("AI không trả về đúng định dạng câu hỏi.");
      }

      const formatted: ExamQuestion[] = result.questions.map((q: any, i: number) => ({
        id: 'gen-' + Date.now().toString() + i,
        ...q,
        options: q.type === 'Trắc nghiệm' ? (Array.isArray(q.options) ? q.options : []) : undefined
      }));
      setQuestions(formatted);
      setReadingPassage(result.readingPassage || '');
      if (!examHeader) setExamHeader(`ĐỀ KIỂM TRA ĐỊNH KỲ - MÔN ${config.subject.toUpperCase()} LỚP ${config.grade}\nThời gian làm bài: ${stats.total * 3} phút`);
      setViewMode('config');
    } catch (error: any) {
      console.error("Exam Generation Error:", error);
      alert(`Lỗi khi AI đang soạn đề: ${error.message || 'Lỗi không xác định'}. Thầy/Cô vui lòng thử lại nhé!`);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64Data = (reader.result as string).split(',')[1];
      const isPdf = file.type === 'application/pdf';
      setPendingImportFile({
        type: isPdf ? 'file' : 'image',
        name: file.name,
        data: base64Data,
        mimeType: file.type
      });
    };
    reader.readAsDataURL(file);
  };

  const handleImportOldExam = async () => {
    if (!pendingImportFile || !pendingImportFile.data || !pendingImportFile.mimeType) return;
    setIsImporting(true);

    const prompt = `Bạn là chuyên gia số hóa đề thi đa phương thức. Hãy trích xuất TOÀN BỘ câu hỏi từ tài liệu.
    
    YÊU CẦU QUAN TRỌNG VỀ HÌNH ẢNH:
    - Nếu câu hỏi có hình minh họa, đồ thị, sơ đồ hoặc bảng biểu, hãy bóc tách và cung cấp mô tả chi tiết hoặc mã SVG trong trường "image".
    - Không được bỏ sót các dữ kiện nằm trong hình ảnh.`;

    try {
      const filePart: FilePart = {
        inlineData: {
          data: pendingImportFile.data,
          mimeType: pendingImportFile.mimeType
        }
      };

      const result = await geminiService.generateExamQuestionsStructured(prompt, [filePart]);

      if (!result || !result.questions || result.questions.length === 0) {
        throw new Error("AI không tìm thấy câu hỏi nào.");
      }

      const formatted: ExamQuestion[] = result.questions.map((q: any, i: number) => ({
        id: 'imp-' + Date.now().toString() + i,
        ...q,
        options: q.type === 'Trắc nghiệm' ? q.options : undefined
      }));

      setQuestions(prev => [...prev, ...formatted]);
      if (result.readingPassage) setReadingPassage(result.readingPassage);
      setShowImportModal(false);
      setPendingImportFile(null);
      alert(`Đã bóc tách thành công ${formatted.length} câu hỏi.`);
    } catch (error) {
      console.error(error);
      alert("Lỗi bóc tách tài liệu.");
    } finally {
      setIsImporting(false);
    }
  };

  const exportText = () => {
    if (questions.length === 0) return;
    let text = (examHeader || "ĐỀ THI") + "\n\n";

    if (readingPassage) {
      text += "PHẦN ĐỌC HIỂU VĂN BẢN\n";
      text += "---------------------------------\n";
      text += readingPassage + "\n";
      text += "---------------------------------\n\n";
    }

    const mcqs = questions.filter(q => q.type === 'Trắc nghiệm');
    const essays = questions.filter(q => q.type === 'Tự luận');

    if (mcqs.length > 0) {
      text += "I. PHẦN TRẮC NGHIỆM\n\n";
      mcqs.forEach((q, i) => {
        text += `Câu ${i + 1}: ${q.content}\n`;
        if (q.image) text += `[HÌNH ẢNH: ${q.image.substring(0, 100)}...]\n`;
        q.options?.forEach((o, j) => text += `${String.fromCharCode(65 + j)}. ${o}\n`);
        text += "\n";
      });
    }
    if (essays.length > 0) {
      text += "II. PHẦN TỰ LUẬN\n\n";
      essays.forEach((q, i) => {
        text += `Câu ${mcqs.length + i + 1}: ${q.content}\n`;
        if (q.image) text += `[HÌNH ẢNH: ${q.image.substring(0, 100)}...]\n`;
        text += "\n";
      });
    }
    text += "---------------------------------------------------------------\nĐÁP ÁN VÀ HƯỚNG DẪN CHẤM\n\n";
    questions.forEach((q, i) => text += `Câu ${i + 1}: ${q.answer}\n${q.explanation ? `(Giải thích: ${q.explanation})\n` : ''}\n`);
    onExportToWorkspace(text);
  };

  const removeQuestion = (id: string) => {
    setQuestions(prev => prev.filter(q => q.id !== id));
  };

  const renderImage = (imageSrc?: string) => {
    if (!imageSrc) return null;
    if (imageSrc.startsWith('<svg')) {
      return (
        <div className="my-4 p-4 bg-white rounded-2xl border border-slate-100 flex justify-center shadow-inner" dangerouslySetInnerHTML={{ __html: imageSrc }} />
      );
    }
    return (
      <div className="my-4 p-4 bg-indigo-50/50 rounded-2xl border border-indigo-100 flex items-start space-x-3">
        <i className="fas fa-image text-indigo-400 mt-1"></i>
        <p className="text-xs font-medium text-indigo-700 italic">{imageSrc}</p>
      </div>
    );
  };

  const handleShareLink = () => {
    if (questions.length === 0) return;
    const data = {
      subject: config.subject,
      grade: config.grade,
      questions: questions
    };

    try {
      const jsonStr = JSON.stringify(data);
      const encoded = btoa(unescape(encodeURIComponent(jsonStr)));

      // Đảm bảo URL cơ sở chính xác
      const baseUrl = window.location.href.split('?')[0];
      const url = `${baseUrl}?exam=${encoded}`;

      navigator.clipboard.writeText(url).then(() => {
        alert(`🚀 Thành công!\n\nLink luyện tập đã được sao chép. Thầy Cô có thể dán (Ctrl+V) để gửi cho học sinh nhé.`);
      }).catch(err => {
        console.error("Clipboard error:", err);
        // Hiển thị link để copy thủ công nếu clipboard lỗi
        prompt("Thầy Cô hãy copy link dưới đây:", url);
      });
    } catch (e) {
      console.error("Encoding error:", e);
      alert("Có lỗi khi tạo link chia sẻ. Thầy Cô hãy thử lại nhé.");
    }
  };

  const updateQuestionField = (id: string, field: keyof ExamQuestion, value: any) => {
    setQuestions(prev => prev.map(q => q.id === id ? { ...q, [field]: value } : q));
  };

  const updateOption = (qId: string, optIdx: number, value: string) => {
    setQuestions(prev => prev.map(q => {
      if (q.id === qId && q.options) {
        const newOpts = [...q.options];
        newOpts[optIdx] = value;
        return { ...q, options: newOpts };
      }
      return q;
    }));
  };

  return (
    <div className="flex flex-col lg:flex-row h-full gap-6 animate-in fade-in duration-500 overflow-hidden relative">
      <div className="lg:w-[400px] flex-shrink-0 flex flex-col space-y-4 overflow-y-auto custom-scrollbar pb-6 pr-2">
        <div className="bg-white p-6 rounded-[32px] border border-slate-200 shadow-sm space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black uppercase tracking-widest text-slate-800">Ma trận & Cấu hình</h3>
            <div className="bg-emerald-50 px-3 py-1 rounded-full border border-emerald-100 flex items-center space-x-2">
              <span className="text-[10px] font-black text-emerald-600 uppercase">{stats.total} câu</span>
            </div>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <select value={config.subject} onChange={e => setConfig({ ...config, subject: e.target.value })} className="bg-slate-50 border border-slate-100 rounded-xl px-3 py-2.5 text-xs font-bold outline-none">
                {Object.keys(SUBJECT_STRANDS).map(sub => <option key={sub} value={sub}>{sub}</option>)}
              </select>
              <select value={config.grade} onChange={e => setConfig({ ...config, grade: e.target.value })} className="bg-slate-50 border border-slate-100 rounded-xl px-3 py-2.5 text-xs font-bold outline-none">
                {[1, 2, 3, 4, 5].map(g => <option key={g} value={g.toString()}>Lớp {g}</option>)}
              </select>
            </div>

            <div className="space-y-3 pt-2">
              {Object.entries(strandMatrix).map(([strand, levels]) => (
                <div key={strand} className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <h4 className="text-[10px] font-black text-indigo-600 uppercase tracking-widest mb-3 truncate">{strand}</h4>
                  <div className="space-y-2">
                    {COGNITIVE_LEVELS.map(level => (
                      <div key={level} className="grid grid-cols-5 gap-2 items-center">
                        <span className="col-span-2 text-[9px] font-bold text-slate-500 uppercase">{level}</span>
                        <div className="col-span-3 flex items-center space-x-2">
                          <div className="flex-1 flex items-center justify-between bg-white px-2 py-1 rounded-lg border border-slate-100">
                            <button onClick={() => updateCount(strand, level, 'mcq', -1)} className="text-[8px] text-slate-300"><i className="fas fa-minus"></i></button>
                            <span className="text-[10px] font-black text-slate-700">{levels[level].mcq} <small className="text-[7px] text-slate-300">TN</small></span>
                            <button onClick={() => updateCount(strand, level, 'mcq', 1)} className="text-[8px] text-slate-300"><i className="fas fa-plus"></i></button>
                          </div>
                          <div className="flex-1 flex items-center justify-between bg-indigo-50 px-2 py-1 rounded-lg border border-indigo-100">
                            <button onClick={() => updateCount(strand, level, 'essay', -1)} className="text-[8px] text-indigo-300"><i className="fas fa-minus"></i></button>
                            <span className="text-[10px] font-black text-indigo-700">{levels[level].essay} <small className="text-[7px] text-indigo-300">TL</small></span>
                            <button onClick={() => updateCount(strand, level, 'essay', 1)} className="text-[8px] text-indigo-300"><i className="fas fa-plus"></i></button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <button onClick={handleGenerate} disabled={isGenerating || stats.total === 0} className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black text-[10px] uppercase shadow-xl hover:bg-indigo-700 transition-all active:scale-95 disabled:opacity-50">
              {isGenerating ? <i className="fas fa-spinner fa-spin mr-2"></i> : <i className="fas fa-wand-magic-sparkles mr-2"></i>}
              {isGenerating ? 'AI đang soạn đề...' : 'Bắt đầu tạo đề AI'}
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col bg-white rounded-[40px] border border-slate-200 shadow-sm overflow-hidden min-h-0">
        <div className="px-8 py-4 border-b border-slate-100 flex flex-wrap gap-2 items-center justify-between bg-slate-50/50">
          <div className="flex space-x-2">
            <button onClick={() => setViewMode('config')} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${viewMode === 'config' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400'}`}>Xem câu hỏi</button>
            <button onClick={() => setViewMode('matrix')} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${viewMode === 'matrix' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400'}`}>Xem ma trận</button>
          </div>
          <div className="flex items-center space-x-2">
            {questions.length > 0 && (
              <>
                <button onClick={handleShareLink} className="px-4 py-2 bg-rose-50 text-rose-600 rounded-xl text-[10px] font-black uppercase border border-rose-100 hover:bg-rose-100 transition-all">
                  <i className="fas fa-share-nodes mr-2"></i>Chia sẻ Link
                </button>
                {onStartPractice && (
                  <button onClick={() => onStartPractice(config.subject, config.grade, questions)} className="px-4 py-2 bg-indigo-50 text-indigo-600 rounded-xl text-[10px] font-black uppercase border border-indigo-100 hover:bg-indigo-100 transition-all">
                    <i className="fas fa-play mr-2"></i>Luyện tập ngay
                  </button>
                )}
              </>
            )}
            <button onClick={() => setShowImportModal(true)} className="px-4 py-2 bg-emerald-50 text-emerald-600 rounded-xl text-[10px] font-black uppercase border border-emerald-100 hover:bg-emerald-100 transition-all">
              <i className="fas fa-file-import mr-2"></i>Nhập đề cũ
            </button>
            <button onClick={exportText} disabled={questions.length === 0} className="px-6 py-2 bg-indigo-600 text-white rounded-xl text-[10px] font-black uppercase shadow-lg hover:bg-indigo-700 disabled:opacity-30 transition-all">Xuất bản thảo</button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
          {isGenerating ? (
            <div className="h-full flex flex-col items-center justify-center space-y-4 animate-pulse">
              <div className="w-16 h-16 bg-indigo-50 rounded-full flex items-center justify-center text-indigo-600 text-2xl"><i className="fas fa-brain"></i></div>
              <p className="text-sm font-black uppercase text-slate-400 tracking-widest">AI đang thiết kế đề thi...</p>
            </div>
          ) : viewMode === 'matrix' ? (
            <div className="space-y-6 animate-in fade-in zoom-in-95">
              <h4 className="text-center text-lg font-black uppercase tracking-widest text-slate-800">Ma trận đặc tả chi tiết</h4>
              <table className="w-full border-collapse border border-slate-200 text-[11px] font-bold">
                <thead>
                  <tr className="bg-slate-900 text-white">
                    <th className="border border-slate-700 p-3 text-left">Nội dung / Mạch</th>
                    {COGNITIVE_LEVELS.map(l => <th key={l} colSpan={2} className="border border-slate-700 p-2">{l}</th>)}
                    <th className="border border-slate-700 p-2">Tổng</th>
                  </tr>
                  <tr className="bg-slate-800 text-white/70">
                    <th></th>
                    {COGNITIVE_LEVELS.map(l => <React.Fragment key={l}><th>TN</th><th>TL</th></React.Fragment>)}
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(strandMatrix).map(([s, levels]) => (
                    <tr key={s} className="hover:bg-indigo-50">
                      <td className="border border-slate-200 p-3">{s}</td>
                      {COGNITIVE_LEVELS.map(l => (
                        <React.Fragment key={l}>
                          <td className="border border-slate-200 p-3 text-center text-indigo-600">{levels[l].mcq || '-'}</td>
                          <td className="border border-slate-200 p-3 text-center text-rose-600">{levels[l].essay || '-'}</td>
                        </React.Fragment>
                      ))}
                      <td className="border border-slate-200 p-3 text-center bg-slate-50 font-black">{stats.strandTotals[s]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="space-y-6">
              {readingPassage && (
                <div className="p-8 bg-amber-50/30 border border-amber-100 rounded-[32px] animate-in fade-in slide-in-from-top-4 duration-500">
                  <h5 className="text-[10px] font-black text-amber-600 uppercase tracking-widest mb-4 flex items-center">
                    <i className="fas fa-book-open mr-2"></i> Văn bản đọc hiểu (Có thể chỉnh sửa)
                  </h5>
                  <textarea
                    value={readingPassage}
                    onChange={(e) => setReadingPassage(e.target.value)}
                    className="w-full bg-transparent border-none focus:ring-0 text-[15px] leading-relaxed text-slate-700 font-medium italic min-h-[150px] resize-none"
                  />
                </div>
              )}
              {questions.length > 0 ? (
                questions.map((q, idx) => (
                  <div key={q.id} className={`p-6 border rounded-[32px] transition-all flex items-start space-x-5 ${q.type === 'Tự luận' ? 'bg-indigo-50 border-indigo-100' : 'bg-slate-50 border-slate-100'} hover:bg-white hover:shadow-xl animate-in slide-in-from-bottom-4 duration-300 relative group`}>
                    <button onClick={() => removeQuestion(q.id)} className="absolute top-6 right-6 opacity-0 group-hover:opacity-100 text-slate-300 hover:text-rose-500 transition-all">
                      <i className="fas fa-trash-alt"></i>
                    </button>
                    <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-black ${q.type === 'Tự luận' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' : 'bg-white text-indigo-600 shadow-sm'}`}>{idx + 1}</div>
                    <div className="flex-1 space-y-4">
                      <div className="flex items-center space-x-2">
                        <select
                          value={q.type}
                          onChange={(e) => updateQuestionField(q.id, 'type', e.target.value)}
                          className="text-[9px] font-black px-2 py-1 rounded-lg border border-slate-200 uppercase bg-white outline-none"
                        >
                          <option value="Trắc nghiệm">Trắc nghiệm</option>
                          <option value="Tự luận">Tự luận</option>
                        </select>
                        <select
                          value={q.level}
                          onChange={(e) => updateQuestionField(q.id, 'level', e.target.value)}
                          className="text-[9px] font-black text-slate-500 uppercase tracking-widest bg-white border border-slate-100 px-2 py-1 rounded-lg outline-none"
                        >
                          {COGNITIVE_LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
                        </select>
                      </div>

                      <textarea
                        value={q.content}
                        onChange={(e) => updateQuestionField(q.id, 'content', e.target.value)}
                        className="w-full bg-transparent border-none focus:ring-0 text-[15px] font-bold text-slate-800 leading-relaxed resize-none p-0"
                        rows={2}
                      />

                      {renderImage(q.image)}

                      {q.options && q.options.length > 0 && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {q.options.map((opt, i) => (
                            <div key={i} className="p-3 rounded-2xl border bg-white border-slate-100 text-slate-600 text-[13px] font-medium flex items-center space-x-3">
                              <span className="w-6 h-6 rounded-lg bg-slate-100 flex items-center justify-center text-[10px] font-black">{['A', 'B', 'C', 'D'][i]}</span>
                              <input
                                value={opt}
                                onChange={(e) => updateOption(q.id, i, e.target.value)}
                                className="flex-1 border-none focus:ring-0 p-0 text-[13px] bg-transparent"
                              />
                            </div>
                          ))}
                        </div>
                      )}

                      <div className={`p-4 rounded-2xl border ${q.type === 'Tự luận' ? 'bg-indigo-100/50 border-indigo-100' : 'bg-emerald-50 border-emerald-100'}`}>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{q.type === 'Tự luận' ? 'Hướng dẫn trả lời / Thang điểm' : 'Đáp án đúng'}</p>
                        <input
                          value={q.answer}
                          onChange={(e) => updateQuestionField(q.id, 'answer', e.target.value)}
                          className="w-full bg-transparent border-none focus:ring-0 text-[13px] font-bold text-slate-700 p-0"
                        />
                        {q.explanation !== undefined && (
                          <div className="mt-2 pt-2 border-t border-slate-200/50">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Giải thích</p>
                            <textarea
                              value={q.explanation || ''}
                              onChange={(e) => updateQuestionField(q.id, 'explanation', e.target.value)}
                              className="w-full bg-transparent border-none focus:ring-0 text-[12px] text-slate-500 resize-none p-0"
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="h-[400px] flex flex-col items-center justify-center text-center opacity-20">
                  <i className="fas fa-magic text-6xl text-slate-300 mb-6"></i>
                  <p className="text-sm font-black uppercase tracking-[0.4em] text-slate-400">Thiết lập ma trận hoặc nhập đề cũ để bắt đầu</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {showImportModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => !isImporting && setShowImportModal(false)}></div>
          <div className="bg-white w-full max-w-2xl rounded-[40px] shadow-2xl relative z-10 overflow-hidden p-8 animate-in zoom-in-95 duration-300">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h3 className="text-lg font-black uppercase tracking-widest text-slate-800">Số hóa đề thi cũ</h3>
                <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">Bóc tách câu hỏi và hình ảnh từ ảnh/PDF</p>
              </div>
              <button onClick={() => setShowImportModal(false)} className="text-slate-300 hover:text-slate-600 transition-colors"><i className="fas fa-times-circle text-2xl"></i></button>
            </div>
            <div className="space-y-6">
              <div onClick={() => importFileInputRef.current?.click()} className={`w-full aspect-video bg-slate-50 border-4 border-dashed border-slate-100 rounded-[32px] flex flex-col items-center justify-center cursor-pointer hover:bg-slate-100 transition-all overflow-hidden relative group ${isImporting ? 'pointer-events-none opacity-50' : ''}`}>
                {pendingImportFile ? (
                  pendingImportFile.mimeType === 'application/pdf' ? (
                    <div className="flex flex-col items-center">
                      <i className="fas fa-file-pdf text-6xl text-rose-500 mb-3"></i>
                      <p className="text-xs font-bold text-slate-600">{pendingImportFile.name}</p>
                    </div>
                  ) : (
                    <img src={`data:${pendingImportFile.mimeType};base64,${pendingImportFile.data}`} className="w-full h-full object-contain" />
                  )
                ) : (
                  <>
                    <i className="fas fa-cloud-arrow-up text-4xl text-slate-200 mb-2"></i>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Chọn ảnh hoặc file PDF đề thi</p>
                  </>
                )}
              </div>
              <input ref={importFileInputRef} type="file" className="hidden" accept="image/*,application/pdf" onChange={handleFileImport} />
              <button onClick={handleImportOldExam} disabled={isImporting || !pendingImportFile} className="w-full py-5 bg-indigo-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all disabled:opacity-50 flex items-center justify-center">
                {isImporting ? <><i className="fas fa-spinner fa-spin mr-3"></i><span>AI đang bóc tách nội dung đa phương thức...</span></> : <><i className="fas fa-wand-magic mr-3"></i><span>Bắt đầu bóc tách thông minh</span></>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ExamCreator;
