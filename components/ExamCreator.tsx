
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ExamQuestion, CognitiveLevel, Attachment } from '../types';
import { geminiService, FilePart } from '../services/geminiService';

interface ExamCreatorProps {
  onExportToWorkspace: (content: string) => void;
  onStartPractice?: (subject: string, grade: string, questions: ExamQuestion[]) => void;
  onCreateAssignment?: (title: string) => void;
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

const ExamCreator: React.FC<ExamCreatorProps> = ({ onExportToWorkspace, onStartPractice, onCreateAssignment }) => {
  const [config, setConfig] = useState({ subject: 'Toán', grade: '1', topic: '' });
  const [strandMatrix, setStrandMatrix] = useState<StrandConfig>({});
  const [isGenerating, setIsGenerating] = useState(false);
  const [questions, setQuestions] = useState<ExamQuestion[]>([]);
  const [readingPassage, setReadingPassage] = useState<string>('');
  const [viewMode, setViewMode] = useState<'config' | 'matrix'>('config');
  const [examHeader, setExamHeader] = useState<string>('');
  const [editingStrand, setEditingStrand] = useState<string | null>(null);
  const [tempStrandName, setTempStrandName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  const [showImportModal, setShowImportModal] = useState(false);
  const [pendingImportFile, setPendingImportFile] = useState<Attachment | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const importFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      if (!showImportModal) return;

      const items = event.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const file = items[i].getAsFile();
          if (file) {
            event.preventDefault(); // Ngăn trình duyệt dán text (nếu có)
            const reader = new FileReader();
            reader.onloadend = () => {
              const base64Data = (reader.result as string).split(',')[1];
              setPendingImportFile({
                type: 'image',
                name: `Pasted_Image_${Date.now()}.png`,
                data: base64Data,
                mimeType: file.type
              });
            };
            reader.readAsDataURL(file);
            return; // Chỉ xử lý ảnh đầu tiên tìm thấy
          }
        }
      }
    };

    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [showImportModal]);

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

  const handleSaveStrandName = () => {
    if (!editingStrand) return;
    const newName = tempStrandName.trim();

    if (newName && newName !== editingStrand) {
      setStrandMatrix(prev => {
        const newMatrix: StrandConfig = {};
        // Giữ nguyên thứ tự các mạch, chỉ đổi tên key
        Object.keys(prev).forEach(key => {
          if (key === editingStrand) {
            newMatrix[newName] = prev[key];
          } else {
            newMatrix[key] = prev[key];
          }
        });
        return newMatrix;
      });
    }
    setEditingStrand(null);
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

  const handleCreateAssignment = () => {
    if (onCreateAssignment) {
      const title = examHeader.split('\n')[0] || `Bài kiểm tra ${config.subject}`;
      onCreateAssignment(title);
    }
  };

  const removeQuestion = (id: string) => {
    setQuestions(prev => prev.filter(q => q.id !== id));
  };

  const addOption = (qId: string) => {
    setQuestions(prev => prev.map(q => {
      if (q.id === qId) {
        return { ...q, options: [...(q.options || []), ''] };
      }
      return q;
    }));
  };

  const removeOption = (qId: string, idx: number) => {
    setQuestions(prev => prev.map(q => {
      if (q.id === qId && q.options) {
        return { ...q, options: q.options.filter((_, i) => i !== idx) };
      }
      return q;
    }));
  };

  const addQuestion = () => {
    const newQ: ExamQuestion = {
      id: `manual-${Date.now()}`,
      type: 'Trắc nghiệm',
      level: 'Thông hiểu',
      content: 'Câu hỏi mới...',
      options: ['', '', '', ''],
      answer: '',
      explanation: ''
    };
    setQuestions(prev => [...prev, newQ]);
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

  const handleShareLink = async (viewMode: 'link' | 'code' = 'link') => {
    if (questions.length === 0) return;

    try {
      // 1. Tối ưu hóa dữ liệu (Minify)
      const prepareData = (isCompact: boolean) => {
        return {
          s: config.subject,
          g: config.grade,
          q: questions.map(q => {
            // [type, content, options, answer, explanation, image]
            let explanation = q.explanation || '';
            let image = q.image || '';

            if (isCompact) {
              // Rút gọn mạnh nếu link quá dài
              explanation = explanation.length > 50 ? explanation.substring(0, 47) + '...' : explanation;
              image = (image.length > 50 || image.startsWith('<svg')) ? '' : image;
            }

            const item: any[] = [
              q.type === 'Trắc nghiệm' ? 1 : 0,
              q.content,
              q.options || [],
              q.answer,
              explanation,
              image
            ];

            // Loại bỏ các phần tử rỗng ở cuối để giảm kích thước
            while (item.length > 0 && (!item[item.length - 1] || (Array.isArray(item[item.length - 1]) && item[item.length - 1].length === 0))) {
              item.pop();
            }
            return item;
          })
        };
      };

      // 2. Encode Base64 AN TOÀN với xử lý ký tự đặc biệt
      const encodeData = (data: any) => {
        try {
          // Stringify với replacer để xử lý ký tự đặc biệt
          const json = JSON.stringify(data, (key, value) => {
            // Giữ nguyên giá trị, nhưng đảm bảo không có ký tự điều khiển
            if (typeof value === 'string') {
              // Loại bỏ các ký tự điều khiển không hợp lệ (U+0000 đến U+001F trừ \n, \r, \t)
              return value.replace(/[\u0000-\u0008\u000B-\u000C\u000E-\u001F]/g, '');
            }
            return value;
          });

          // Kiểm tra JSON hợp lệ
          JSON.parse(json); // Validate trước khi encode

          // Encode UTF-8 an toàn sang Base64
          const utf8Bytes = new TextEncoder().encode(json);
          let binary = '';
          utf8Bytes.forEach(byte => {
            binary += String.fromCharCode(byte);
          });

          // Base64 encode và chuyển sang URL-safe format
          return btoa(binary)
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');
        } catch (error) {
          console.error("Encoding error:", error);
          throw new Error("Không thể mã hóa dữ liệu. Vui lòng kiểm tra nội dung câu hỏi.");
        }
      };

      // 3. Nén dữ liệu (Gzip Compression) - GIẢM 60-70% DUNG LƯỢNG
      const compressData = async (data: any): Promise<string | null> => {
        // @ts-ignore
        if (!window.CompressionStream) return null;
        try {
          const json = JSON.stringify(data);
          const stream = new Blob([json]).stream();
          // @ts-ignore
          const compressed = stream.pipeThrough(new CompressionStream('gzip'));
          const response = new Response(compressed);
          const blob = await response.blob();
          return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              const base64 = (reader.result as string).split(',')[1];
              // URL Safe & Prefix v2_
              const urlSafe = base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
              resolve('v2_' + urlSafe);
            };
            reader.readAsDataURL(blob);
          });
        } catch (e) {
          console.error("Compression error:", e);
          return null;
        }
      };

      let currentData = prepareData(false);

      // Thử nén trước, nếu không hỗ trợ thì dùng cách cũ
      let finalCode = await compressData(currentData) || encodeData(currentData);
      let url = `${window.location.origin}${window.location.pathname}?exam=${finalCode}`;

      // 3. Nếu link vẫn quá dài (> 1800 ký tự), thực hiện rút gọn nội dung
      if (viewMode === 'link' && url.length > 1800) {
        console.warn(`Link quá dài (${url.length} ký tự), đang thử nén dữ liệu...`);
        currentData = prepareData(true); // Sử dụng chế độ rút gọn tối đa
        finalCode = await compressData(currentData) || encodeData(currentData);
        url = `${window.location.origin}${window.location.pathname}?exam=${finalCode}`;

        if (url.length > 2000) {
          const confirmMsg = `⚠️ ĐỀ THI QUÁ LỚN (${questions.length} câu)\n\nLink hiện tại dài ${url.length} ký tự, có thể bị lỗi (cụt link) khi gửi qua Zalo/Facebook.\n\n✅ KHUYẾN NGHỊ: Chọn "Copy Mã Đề" để gửi cho học sinh sẽ ổn định hơn.\n\nBạn vẫn muốn thử Copy Link?`;
          if (!window.confirm(confirmMsg)) return;
        }
      }

      if (viewMode === 'code') {
        // Chế độ copy mã đề: luôn dùng bản đầy đủ
        const fullBase64 = await compressData(prepareData(false)) || encodeData(prepareData(false));
        await navigator.clipboard.writeText(fullBase64);
        alert(`📋 Đã sao chép MÃ ĐỀ THI.\n\nHướng dẫn: Gửi mã này cho học sinh. Học sinh vào ứng dụng, chọn "Nhập Đề Cũ" -> "Dán Mã Đề" để làm bài.`);
        return;
      }

      await navigator.clipboard.writeText(url);
      alert(`🚀 Link đã được sao chép!\n\n${url.length > 1500 ? '⚠️ Lưu ý: Đề khá dài, nếu học sinh không mở được link, hãy dùng chức năng "Copy Mã Đề" nhé!' : 'Gửi ngay cho học sinh để bắt đầu luyện tập.'}`);

    } catch (e: any) {
      console.error("Link generation error:", e);
      alert(`❌ Lỗi tạo link: ${e.message || 'Không xác định'}\n\nThầy/Cô hãy thử:\n1. Rút ngắn nội dung câu hỏi\n2. Giảm số lượng câu hỏi\n3. Dùng "Copy Mã Đề" thay vì Link`);
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
                  <div className="flex items-center justify-between mb-3">
                    {editingStrand === strand ? (
                      <input
                        autoFocus
                        type="text"
                        value={tempStrandName}
                        onChange={(e) => setTempStrandName(e.target.value)}
                        onBlur={handleSaveStrandName}
                        onKeyDown={(e) => e.key === 'Enter' && handleSaveStrandName()}
                        className="flex-1 bg-white border border-indigo-300 rounded-lg px-2 py-1 text-[10px] font-black text-indigo-700 uppercase tracking-widest outline-none focus:ring-2 focus:ring-indigo-200"
                      />
                    ) : (
                      <div className="flex items-center space-x-2 group cursor-pointer flex-1 min-w-0" onClick={() => { setEditingStrand(strand); setTempStrandName(strand); }} title="Nhấn để sửa tên mạch">
                        <h4 className="text-[10px] font-black text-indigo-600 uppercase tracking-widest truncate">{strand}</h4>
                        <i className="fas fa-pen text-[8px] text-slate-300 group-hover:text-indigo-400 transition-colors"></i>
                      </div>
                    )}
                    {!editingStrand && (
                      <button
                        onClick={() => { if (window.confirm(`Xóa mạch "${strand}" khỏi ma trận?`)) { const newM = { ...strandMatrix }; delete newM[strand]; setStrandMatrix(newM); } }}
                        className="ml-2 text-slate-300 hover:text-rose-500 transition-colors"
                        title="Xóa mạch này"
                      >
                        <i className="fas fa-times"></i>
                      </button>
                    )}
                  </div>
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
                <div className="flex space-x-1">
                  <button onClick={() => handleShareLink('link')} className="px-4 py-2 bg-rose-50 text-rose-600 rounded-l-xl rounded-r-none text-[10px] font-black uppercase border border-rose-100 hover:bg-rose-100 transition-all border-r-0">
                    <i className="fas fa-share-nodes mr-2"></i>Chia sẻ Link
                  </button>
                  <button onClick={() => handleShareLink('code')} className="px-3 py-2 bg-rose-50 text-rose-600 rounded-r-xl rounded-l-none text-[10px] font-black uppercase border border-rose-100 hover:bg-rose-100 transition-all border-l-slate-200" title="Copy Mã Đề (Dùng khi Link bị lỗi)">
                    <i className="fas fa-code"></i>
                  </button>
                </div>
                {onCreateAssignment && (
                  <button onClick={handleCreateAssignment} className="px-4 py-2 bg-purple-50 text-purple-600 rounded-xl text-[10px] font-black uppercase border border-purple-100 hover:bg-purple-100 transition-all" title="Tạo cột điểm trong Quản lý lớp để theo dõi kết quả">
                    <i className="fas fa-list-check mr-2"></i>Tạo bài tập
                  </button>
                )}
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
            {questions.length > 0 && (
              <button onClick={() => { if (window.confirm('Xóa toàn bộ câu hỏi?')) setQuestions([]); }} className="px-4 py-2 bg-slate-50 text-slate-500 rounded-xl text-[10px] font-black uppercase border border-slate-200 hover:bg-rose-50 hover:text-rose-500 hover:border-rose-200 transition-all">
                <i className="fas fa-trash-alt mr-2"></i>Xóa
              </button>
            )}
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
              {questions.length > 0 && (
                <div className="p-6 bg-slate-50 border border-slate-200 rounded-[32px] animate-in fade-in slide-in-from-top-4 duration-500">
                  <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Tiêu đề đề thi</h5>
                  <textarea
                    value={examHeader}
                    onChange={(e) => setExamHeader(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl p-4 text-sm font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
                    rows={3}
                    placeholder="Nhập tiêu đề đề thi..."
                  />
                </div>
              )}
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
                <>
                  {questions.map((q, idx) => (
                    <div key={q.id} className={`p-6 border rounded-[32px] transition-all flex items-start space-x-5 ${q.type === 'Tự luận' ? 'bg-indigo-50 border-indigo-100' : 'bg-slate-50 border-slate-100'} hover:bg-white hover:shadow-xl animate-in slide-in-from-bottom-4 duration-300 relative group`}>
                      <div className="absolute top-6 right-6 flex space-x-2 opacity-0 group-hover:opacity-100 transition-all">
                        <button onClick={() => setEditingId(editingId === q.id ? null : q.id)} className={`w-8 h-8 flex items-center justify-center rounded-full transition-all ${editingId === q.id ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-300 hover:text-indigo-500 hover:bg-indigo-50'}`}>
                          <i className={`fas ${editingId === q.id ? 'fa-check' : 'fa-pen'}`}></i>
                        </button>
                        <button onClick={() => removeQuestion(q.id)} className="w-8 h-8 flex items-center justify-center rounded-full text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition-all"><i className="fas fa-trash-alt"></i></button>
                      </div>
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
                          className={`w-full bg-transparent border-none focus:ring-0 text-[15px] font-bold text-slate-800 leading-relaxed resize-none p-0 transition-all ${editingId === q.id ? 'bg-white p-3 rounded-xl border border-indigo-200 shadow-sm focus:ring-2 focus:ring-indigo-500' : ''}`}
                          rows={editingId === q.id ? 4 : 2}
                          placeholder="Nhập nội dung câu hỏi..."
                        />

                        {editingId === q.id && (
                          <div className="animate-in fade-in slide-in-from-top-2">
                            <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Hình ảnh minh họa (URL hoặc SVG)</label>
                            <input
                              value={q.image || ''}
                              onChange={(e) => updateQuestionField(q.id, 'image', e.target.value)}
                              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-indigo-500"
                              placeholder="Dán đường dẫn ảnh hoặc mã SVG vào đây..."
                            />
                          </div>
                        )}

                        {renderImage(q.image)}

                        {q.options && q.options.length > 0 && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {q.options.map((opt, i) => (
                              <div key={i} className={`p-3 rounded-2xl border bg-white border-slate-100 text-slate-600 text-[13px] font-medium flex items-center space-x-3 ${editingId === q.id ? 'border-indigo-200 shadow-sm' : ''}`}>
                                <span className="w-6 h-6 rounded-lg bg-slate-100 flex items-center justify-center text-[10px] font-black">{['A', 'B', 'C', 'D'][i]}</span>
                                <input
                                  value={opt}
                                  onChange={(e) => updateOption(q.id, i, e.target.value)}
                                  className="flex-1 border-none focus:ring-0 p-0 text-[13px] bg-transparent"
                                  placeholder={`Lựa chọn ${i + 1}`}
                                />
                              </div>
                            ))}
                          </div>
                        )}

                        <div className={`p-4 rounded-2xl border ${q.type === 'Tự luận' ? 'bg-indigo-100/50 border-indigo-100' : 'bg-emerald-50 border-emerald-100'}`}>
                          <div className="flex flex-col space-y-2">
                            <div>
                              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{q.type === 'Tự luận' ? 'Hướng dẫn trả lời / Thang điểm' : 'Đáp án đúng'}</p>
                              <input
                                value={q.answer}
                                onChange={(e) => updateQuestionField(q.id, 'answer', e.target.value)}
                                className="w-full bg-transparent border-none focus:ring-0 text-[13px] font-bold text-slate-700 p-0 placeholder-slate-300"
                                placeholder="Nhập đáp án..."
                              />
                            </div>
                            {(q.explanation !== undefined || editingId === q.id) && (
                              <div className="pt-2 border-t border-slate-200/50">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Giải thích chi tiết</p>
                                <textarea
                                  value={q.explanation || ''}
                                  onChange={(e) => updateQuestionField(q.id, 'explanation', e.target.value)}
                                  className="w-full bg-transparent border-none focus:ring-0 text-[12px] text-slate-500 resize-none p-0 placeholder-slate-300"
                                  placeholder="Nhập giải thích..."
                                  rows={editingId === q.id ? 2 : 1}
                                />
                              </div>
                            )}
                          </div>
                        </div>

                        {editingId === q.id && q.type === 'Trắc nghiệm' && (
                          <div className="flex items-center gap-2 animate-in fade-in">
                            <button onClick={() => addOption(q.id)} className="px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-lg text-[10px] font-bold hover:bg-indigo-100 transition-all">
                              <i className="fas fa-plus mr-1"></i>Thêm lựa chọn
                            </button>
                            {q.options && q.options.length > 0 && (
                              <button onClick={() => removeOption(q.id, q.options!.length - 1)} className="px-3 py-1.5 bg-rose-50 text-rose-600 rounded-lg text-[10px] font-bold hover:bg-rose-100 transition-all">
                                <i className="fas fa-minus mr-1"></i>Xóa lựa chọn cuối
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  <button onClick={addQuestion} className="w-full py-4 border-2 border-dashed border-indigo-200 rounded-[32px] text-indigo-500 font-black uppercase tracking-widest hover:bg-indigo-50 hover:border-indigo-300 transition-all">
                    <i className="fas fa-plus-circle mr-2"></i>Thêm câu hỏi thủ công
                  </button>
                </>
              ) : (
                <div className="h-[400px] flex flex-col items-center justify-center text-center opacity-20">
                  <i className="fas fa-magic text-6xl text-slate-300 mb-6"></i>
                  <p className="text-sm font-black uppercase tracking-[0.4em] text-slate-400">Thiết lập ma trận hoặc nhập đề cũ để bắt đầu</p>
                  <button onClick={addQuestion} className="mt-4 px-4 py-2 bg-slate-100 rounded-xl text-xs font-bold hover:bg-slate-200 pointer-events-auto">
                    Hoặc tạo thủ công
                  </button>
                </div>
              )
              }
            </div >
          )}
        </div >
      </div >

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
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-center px-4">Chọn hoặc Dán ảnh/PDF đề thi</p>
                      </>
                    )}
                  </div>

                  <div className="flex flex-col space-y-3">
                    <div className="flex-1 bg-slate-50 border-2 border-slate-100 rounded-[32px] p-4 flex flex-col relative focus-within:border-indigo-400 focus-within:bg-white transition-all">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2"><i className="fas fa-code mr-1"></i> Dán Mã Đề (Nếu có)</p>
                      <textarea
                        id="paste-code-input"
                        placeholder="Dán mã đề thi vào đây..."
                        className="flex-1 w-full bg-transparent border-none focus:ring-0 text-[11px] font-mono resize-none"
                        onChange={(e) => {
                          // Tự động nhận diện và tải đề khi dán mã
                          const input = e.target.value.trim();
                          if (input.length > 20) {
                            try {
                              // 1. Tách lấy mã nếu người dùng dán cả link
                              let code = input;
                              if (input.includes('exam=')) {
                                code = input.split('exam=')[1].split('&')[0];
                              }

                              // 2. Làm sạch mã Base64 (URL-safe -> Standard)
                              let cleanBase64 = code.replace(/\s/g, '').replace(/-/g, '+').replace(/_/g, '/');

                              // Thêm padding nếu cần
                              while (cleanBase64.length % 4 !== 0) {
                                cleanBase64 += '=';
                              }

                              // 3. Decode an toàn với TextDecoder
                              let json: any;
                              try {
                                // Phương pháp mới: TextDecoder
                                const binaryString = atob(cleanBase64);
                                const bytes = new Uint8Array(binaryString.length);
                                for (let i = 0; i < binaryString.length; i++) {
                                  bytes[i] = binaryString.charCodeAt(i);
                                }
                                const decoder = new TextDecoder('utf-8');
                                const jsonString = decoder.decode(bytes);
                                json = JSON.parse(jsonString);
                              } catch (e) {
                                // Fallback: phương pháp cũ
                                const decoded = decodeURIComponent(escape(atob(cleanBase64)));
                                json = JSON.parse(decoded);
                              }

                              if (json && (json.q || json.questions || json.s)) {
                                if (confirm("✅ Phát hiện dữ liệu đề thi hợp lệ! Bạn có muốn nhập ngay không?")) {
                                  let loadedQuestions: ExamQuestion[] = [];
                                  if (json.q && Array.isArray(json.q)) {
                                    // Chuyển đổi từ định dạng rút gọn
                                    loadedQuestions = json.q.map((item: any, idx: number) => ({
                                      id: `imp-code-${Date.now()}-${idx}`,
                                      type: item[0] === 1 ? 'Trắc nghiệm' : 'Tự luận',
                                      content: item[1] || '',
                                      options: item[2] || [],
                                      answer: item[3] || '',
                                      explanation: item[4] || '',
                                      image: item[5] || '',
                                      level: 'Thông hiểu'
                                    }));
                                  } else {
                                    loadedQuestions = json.questions || [];
                                  }

                                  if (loadedQuestions.length > 0) {
                                    setQuestions(prev => [...prev, ...loadedQuestions]);
                                    if (json.s || json.subject) setConfig(prev => ({ ...prev, subject: json.s || json.subject, grade: json.g || json.grade || prev.grade }));
                                    setShowImportModal(false);
                                    alert(`Đã nhập thành công ${loadedQuestions.length} câu hỏi.`);
                                    e.target.value = "";
                                  }
                                }
                              }
                            } catch (err) {
                              // Bỏ qua nếu đang gõ dở hoặc không phải mã đề
                            }
                          }
                        }}
                      />
                    </div>
                  </div>
                </div>

                <input ref={importFileInputRef} type="file" className="hidden" accept="image/*,application/pdf" onChange={handleFileImport} />
                <button onClick={handleImportOldExam} disabled={isImporting || !pendingImportFile} className="w-full py-5 bg-indigo-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all disabled:opacity-50 flex items-center justify-center">
                  {isImporting ? <><i className="fas fa-spinner fa-spin mr-3"></i><span>AI đang bóc tách nội dung đa phương thức...</span></> : <><i className="fas fa-wand-magic mr-3"></i><span>Bắt đầu bóc tách (Từ File)</span></>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div >
  );
};

export default ExamCreator;
