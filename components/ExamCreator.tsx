
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ExamQuestion, CognitiveLevel, Attachment } from '../types';
import { geminiService, FilePart } from '../services/geminiService';
import { convertPdfToImages, ocrImages } from '../services/pdfService';

interface ExamCreatorProps {
  onExportToWorkspace: (content: string) => void;
  onStartPractice?: (subject: string, grade: string, questions: ExamQuestion[], assignmentId: string | null) => void;
  onCreateAssignment?: (title: string) => string; // Returns the new assignment ID
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

interface SavedExam {
  id: string;
  name: string;
  questions: ExamQuestion[];
  readingPassage: string;
  examHeader: string;
  timestamp: string;
}

const ExamCreator: React.FC<ExamCreatorProps> = ({ onExportToWorkspace, onStartPractice, onCreateAssignment }) => {
  const [config, setConfig] = useState({ subject: 'Toán', grade: '1', topic: '' });
  const [strandMatrix, setStrandMatrix] = useState<StrandConfig>({});
  const [isGenerating, setIsGenerating] = useState(false);
  const [questions, setQuestions] = useState<ExamQuestion[]>([]);
  const [readingPassage, setReadingPassage] = useState<string>('');
  const [viewMode, setViewMode] = useState<'config' | 'matrix'>('config');
  const [examHeader, setExamHeader] = useState<string>('');
  const [editingStrand, setEditingStrand] = useState<string | null>(null);
  const [createdAssignmentId, setCreatedAssignmentId] = useState<string | null>(null);
  const [tempStrandName, setTempStrandName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  const [showImportModal, setShowImportModal] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [savedExams, setSavedExams] = useState<SavedExam[]>([]);
  const [pendingImportFiles, setPendingImportFiles] = useState<Attachment[]>([]);
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
            event.preventDefault();
            const reader = new FileReader();
            reader.onloadend = () => {
              const base64Data = (reader.result as string).split(',')[1];
              const newFile: Attachment = {
                type: 'image',
                name: `Pasted_Image_${Date.now()}.png`,
                data: base64Data,
                mimeType: file.type
              };
              setPendingImportFiles(prev => [...prev, newFile]);
            };
            reader.readAsDataURL(file);
          }
        }
      }
    };

    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [showImportModal]);

  useEffect(() => {
    const saved = localStorage.getItem('edu_exam_history');
    if (saved) {
      setSavedExams(JSON.parse(saved));
    }
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
      // Mặc định để trống để giáo viên tự nhập theo ý muốn
      setStrandMatrix(initial);
    }
  }, [config.subject]);

  const applyQuickSetup = (total: number) => {
    const strands = Object.keys(strandMatrix);
    if (strands.length === 0) return;

    const newMatrix = { ...strandMatrix };
    // Reset all
    strands.forEach(s => {
      COGNITIVE_LEVELS.forEach(l => {
        newMatrix[s][l] = { mcq: 0, essay: 0 };
      });
    });

    // Phân bổ đơn giản
    const perStrand = Math.floor(total / strands.length);
    strands.forEach((s, i) => {
      const count = i === strands.length - 1 ? total - (perStrand * (strands.length - 1)) : perStrand;
      newMatrix[s]['Nhận biết'].mcq = Math.floor(count * 0.4);
      newMatrix[s]['Thông hiểu'].mcq = Math.floor(count * 0.4);
      newMatrix[s]['Vận dụng'].mcq = count - (newMatrix[s]['Nhận biết'].mcq + newMatrix[s]['Thông hiểu'].mcq);
    });
    setStrandMatrix(newMatrix);
  };

  const handleExportJSON = () => {
    if (questions.length === 0) return;
    try {
      const payload = {
        header: examHeader,
        subject: config.subject,
        grade: config.grade,
        readingPassage,
        questions
      };
      const jsonStr = JSON.stringify(payload, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(examHeader || 'exam').replace(/[^a-z0-9\-_ ]/gi, '_')}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e: any) {
      alert('Lỗi khi xuất JSON: ' + (e.message || e));
    }
  };

  const handleExportDOCX = () => {
    if (questions.length === 0) return;
    try {
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8" />
          <title>${examHeader || 'Đề thi'}</title>
          <style>body{font-family:Arial,Helvetica,sans-serif;color:#222} .question{margin:16px 0}</style>
        </head>
        <body>
          <h1>${examHeader || ''}</h1>
          <p><strong>Môn:</strong> ${config.subject} &nbsp; <strong>Lớp:</strong> ${config.grade}</p>
          ${readingPassage ? `<h3>Đoạn đọc:</h3><div>${readingPassage}</div>` : ''}
          ${questions.map((q, i) => `
            <div class="question">
              <div><strong>Câu ${i + 1}:</strong> ${q.content}</div>
              ${q.image ? `<div><img src="${q.image}" style="max-width:520px; height:auto;"/></div>` : ''}
              ${q.options && q.options.length ? `<div><em>Đáp án:</em><ul>${q.options.map(o => `<li>${typeof o === 'string' ? o : o.text}</li>`).join('')}</ul></div>` : ''}
            </div>
          `).join('')}
        </body>
        </html>
      `;

      const blob = new Blob(['\uFEFF', html], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(examHeader || 'exam').replace(/[^a-z0-9\-_ ]/gi, '_')}.docx`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e: any) {
      alert('Lỗi khi xuất DOCX: ' + (e.message || e));
    }
  };

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

      const formatted: ExamQuestion[] = result.questions.map((q: any, i: number) => {
        const normalizedOptions = (q.type === 'Trắc nghiệm' && Array.isArray(q.options))
          ? q.options.map((opt: any) => {
            if (typeof opt === 'string') {
              return { text: opt, image: '' };
            }
            return { text: opt.text || '', image: opt.image || '' };
          })
          : undefined;

        return {
          id: 'gen-' + Date.now().toString() + i,
          type: q.type || 'Trắc nghiệm',
          level: q.level || 'Thông hiểu',
          content: q.content || q.question || '',
          image: q.image || '',
          options: normalizedOptions,
          answer: q.answer || '',
          explanation: q.explanation || '',
        };
      });
      setQuestions(formatted.filter(q => q.content.trim() !== '' || q.image.trim() !== ''));
      setReadingPassage(result.readingPassage || '');
      if (!examHeader) setExamHeader(`ĐỀ KIỂM TRA ĐỊNH KỲ - MÔN ${config.subject.toUpperCase()} LỚP ${config.grade}\nThời gian làm bài: ${stats.total * 3} phút`);
      setViewMode('config');
    } catch (error: any) {
      console.error("Exam Generation Error:", error);
      const msg = error.message || 'Lỗi không xác định';
      if (msg.includes("API key") || msg.includes("400")) {
        alert(`⚠️ Lỗi API Key: ${msg}\n\nVui lòng kiểm tra lại Key trong Cài đặt.`);
      } else {
        alert(`Lỗi khi AI đang soạn đề: ${msg}. Thầy/Cô vui lòng thử lại nhé!`);
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64Data = (reader.result as string).split(',')[1];
        const isPdf = file.type === 'application/pdf';
        const newFile: Attachment = {
          type: isPdf ? 'file' : 'image',
          name: file.name,
          data: base64Data,
          mimeType: file.type
        };
        setPendingImportFiles(prev => [...prev, newFile]);
        // Tự động bắt đầu bóc tách sau khi file được thêm (không hỏi người dùng)
        setTimeout(() => {
          if (!isImporting) {
            try {
              handleImportOldExam();
            } catch (err) {
              console.warn('Auto-import failed to start:', err);
            }
          }
        }, 600);
      };
      reader.readAsDataURL(file);
    });
  };

  const handleImportOldExam = async () => {
    if (pendingImportFiles.length === 0) return;
    setIsImporting(true);

    const prompt = `Bạn là chuyên gia số hóa đề thi đa phương thức. Hãy trích xuất TOÀN BỘ câu hỏi từ các tài liệu đính kèm.
    
    YÊU CẦU ĐẶC BIỆT VỀ HÌNH ẢNH (BẮT BUỘC):
    - Rất nhiều câu hỏi trong file này có hình ảnh minh họa hoặc quy luật hình ảnh.
    - Bạn PHẢI trích xuất nội dung hình ảnh đó vào trường "image".
    - Nếu là hình học đơn giản: Hãy trả về mã SVG (chỉ thẻ <svg>...</svg>).
    - Nếu là hình ảnh phức tạp hoặc tranh vẽ: Hãy mô tả chi tiết bằng lời trong ngoặc vuông, ví dụ: "[HÌNH ẢNH: Một chiếc cân đĩa, bên trái có 2 quả táo, bên phải có 1 quả cam...]".
    - TUYỆT ĐỐI KHÔNG ĐỂ TRỐNG trường "image" nếu câu hỏi gốc có hình.
    
    YÊU CẦU VỀ QUY LUẬT:
    - Với các câu hỏi tìm quy luật dãy số/hình: Hãy mô tả rõ quy luật đó trong nội dung câu hỏi hoặc trường "explanation".
    - Đảm bảo trích xuất CHÍNH XÁC và ĐẦY ĐỦ số lượng câu hỏi có trong tài liệu.
    
    QUAN TRỌNG: KHÔNG trả về các câu hỏi rỗng (không có nội dung và không có hình ảnh).
    YÊU CẦU ĐỊNH DẠNG JSON CHÍNH XÁC:
      {
        "questions": [
          {
            "type": "Trắc nghiệm",
            "content": "Câu hỏi...",
            "image": "URL hoặc SVG hoặc Mô tả",
            "options": [
              { "text": "Đáp án A", "image": "" },
              { "text": "Đáp án B", "image": "" }
            ],
            "answer": "Đáp án đúng",
            "explanation": "Giải thích",
            "page_index": 0
          }
        ]
      }`;

    try {
      const finalFileParts: FilePart[] = [];
      const pageImageUrls: string[] = [];

      for (const f of pendingImportFiles) {
        if (f.mimeType === 'application/pdf' && f.data) {
          const images = await convertPdfToImages(f.data);
          if (images.length > 0) {
            images.forEach((img: any) => {
              finalFileParts.push({ inlineData: img.inlineData });
              if (img.dataUrl) pageImageUrls.push(img.dataUrl);
            });
          } else {
            finalFileParts.push({ inlineData: { data: f.data, mimeType: f.mimeType! } });
          }
        } else if (f.data && f.mimeType) {
          finalFileParts.push({ inlineData: { data: f.data, mimeType: f.mimeType } });
          if (f.mimeType.startsWith('image/') && f.data.startsWith('data:')) {
            pageImageUrls.push(`data:${f.mimeType};base64,${f.data}`);
          }
        }
      }

      // Cập nhật prompt để yêu cầu AI trả về page_index
      // Chạy OCR trên các trang ảnh (nếu có) để giúp AI đọc chính xác hơn
      let ocrNotes = '';
      try {
        if (pageImageUrls.length > 0) {
          const ocrTexts = await ocrImages(pageImageUrls, 'vie+eng');
          ocrNotes = ocrTexts.map((t, i) => t ? `OCR_PAGE_${i}: ${t.replace(/\n/g, ' ')}\n` : '').join('\n');
        }
      } catch (err) {
        console.warn('OCR step failed, continuing without OCR notes', err);
      }

      const enhancedPrompt = prompt + "\n" + (ocrNotes ? `THÔNG TIN OCR:\n${ocrNotes}\n` : '') + "QUAN TRỌNG: Nếu câu hỏi nằm trên một trang cụ thể, hãy trả về thuộc tính 'page_index' (số thứ tự trang trong file, bắt đầu từ 0).";

      const extractQuestions = (result: any) => {
        if (result && Array.isArray(result.questions)) return result.questions;
        if (Array.isArray(result)) return result;
        if (result && typeof result === 'object') {
          const key = Object.keys(result).find(k => Array.isArray(result[k]) && result[k].length > 0);
          if (key) return result[key];
        }
        return [];
      };

      const runExtraction = async (filePartsToUse: FilePart[]) => {
        const result = await geminiService.generateExamQuestionsStructured(enhancedPrompt, filePartsToUse);
        return { result, rawQuestions: extractQuestions(result) };
      };

      let { result, rawQuestions } = await runExtraction(finalFileParts);

      // Hàm kiểm tra câu hỏi hợp lệ (có nội dung hoặc hình ảnh)
      const isValidRawQuestion = (q: any) => {
        const c = q.content || q.question || '';
        const i = q.image || '';
        return c.toString().trim().length > 0 || i.toString().trim().length > 0;
      };

      // Lọc sơ bộ kết quả từ AI để loại bỏ câu hỏi rỗng
      rawQuestions = rawQuestions.filter(isValidRawQuestion);

      // Fallback: Nếu không tìm thấy câu hỏi và file quá dài, thử lại với 10 trang đầu
      if (rawQuestions.length === 0 && finalFileParts.length > 10) {
        const fallbackParts = finalFileParts.slice(0, 10);
        const fallbackRun = await runExtraction(fallbackParts);
        result = fallbackRun.result;
        rawQuestions = fallbackRun.rawQuestions.filter(isValidRawQuestion);
      }

      if (rawQuestions.length === 0) {
        throw new Error("AI không tìm thấy câu hỏi nào. Vui lòng thử lại với file PDF ít trang hơn hoặc dùng công cụ Cắt PDF.");
      }

      const extractInlineImage = (text?: string) => {
        if (!text) return { text: '', image: '' };
        const svgMatch = text.match(/<svg[\s\S]*?<\/svg>/i);
        if (svgMatch) {
          return {
            text: text.replace(svgMatch[0], '').trim(),
            image: svgMatch[0]
          };
        }
        const bracketMatch = text.match(/\[(HÌNH ẢNH|HINH ANH|IMAGE|IMG|HÌNH)\s*:\s*([\s\S]*?)\]/i);
        if (bracketMatch) {
          return {
            text: text.replace(bracketMatch[0], '').trim(),
            image: bracketMatch[0]
          };
        }
        const inlineMatch = text.match(/(?:^|\n)\s*(HÌNH ẢNH|HINH ANH|IMAGE|IMG|HÌNH)\s*[:\-]\s*([^\n]+)/i);
        if (inlineMatch) {
          return {
            text: text.replace(inlineMatch[0], '').trim(),
            image: `[HÌNH ẢNH: ${inlineMatch[2].trim()}]`
          };
        }
        return { text, image: '' };
      };

      const shouldAttachImage = (text?: string) => {
        if (!text) return false;
        return /(hình|ảnh|image|img)/i.test(text);
      };

      let pageImageIndex = 0;

      const formatted: ExamQuestion[] = rawQuestions.map((q: any, i: number) => {
        const normalizedContent = extractInlineImage(q.content || q.question || '');

        // Chuẩn hóa dữ liệu options để đảm bảo cấu trúc {text, image}
        const normalizedOptions = (q.type === 'Trắc nghiệm' && Array.isArray(q.options))
          ? q.options.map((opt: any) => {
            if (typeof opt === 'string') {
              const normalizedOpt = extractInlineImage(opt);
              return { text: normalizedOpt.text, image: normalizedOpt.image };
            }
            // Đảm bảo object luôn có cả text và image
            const normalizedOpt = extractInlineImage(opt.text || '');
            return { text: normalizedOpt.text, image: opt.image || normalizedOpt.image || '' };
          })
          : undefined;

        let image = q.image || normalizedContent.image || '';

        // LOGIC GÁN ẢNH THÔNG MINH:
        // 1. Nếu AI trả về page_index, dùng chính xác ảnh trang đó
        if (typeof q.page_index === 'number' && pageImageUrls[q.page_index]) {
          image = pageImageUrls[q.page_index];
        }
        // 2. Fallback: Nếu câu hỏi có từ khóa "hình ảnh" mà chưa có ảnh, lấy ảnh theo thứ tự
        else if (!image && shouldAttachImage(normalizedContent.text) && pageImageUrls[pageImageIndex]) {
          image = pageImageUrls[pageImageIndex++];
        }

        // XÁC THỰC CÂU HỎI HỢP LỆ:
        // - Phải có nội dung text (không chỉ khoảng trắng)
        // - HOẶC có ảnh hợp lệ từ page_index
        // - KHÔNG chấp nhận câu chỉ có mô tả [HÌNH ẢNH: ...] mà không có nội dung thực
        const hasValidTextContent = normalizedContent.text && normalizedContent.text.trim().length > 3 && !normalizedContent.text.match(/^\[?HÌNH\s*ẢNH\]?\s*:/i);
        const hasValidImage = image && (image.startsWith('data:image') || image.startsWith('<svg'));
        const hasPageIndexWithImage = typeof q.page_index === 'number' && pageImageUrls[q.page_index];

        // Nếu không có nội dung hợp lệ và không có ảnh hợp lệ từ page_index, bỏ qua câu này
        if (!hasValidTextContent && !hasValidImage && !hasPageIndexWithImage) {
          return null; // Mark for filtering
        }

        return {
          id: 'imp-' + Date.now().toString() + i,
          type: q.type || 'Trắc nghiệm',
          level: q.level || 'Thông hiểu',
          content: normalizedContent.text,
          image: image,
          options: normalizedOptions,
          answer: q.answer || '',
          explanation: q.explanation || '',
        };
      }).filter((q): q is ExamQuestion => q !== null && (q.content.trim() !== '' || q.image.trim() !== '')); // Lọc lần cuối các câu hỏi rỗng

      if (formatted.length === 0) {
        throw new Error("Không tìm thấy câu hỏi hợp lệ nào sau khi xử lý.");
      }

      setQuestions(prev => [...prev, ...formatted]);
      if (result.readingPassage) setReadingPassage(result.readingPassage);
      setShowImportModal(false);
      setPendingImportFiles([]);
      alert(`Đã bóc tách thành công ${formatted.length} câu hỏi từ ${pendingImportFiles.length} trang tài liệu.`);
    } catch (error: any) {
      console.error(error);
      alert(`Lỗi bóc tách tài liệu: ${error.message}`);
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

  const handleShuffleQuestions = () => {
    if (questions.length < 2) return;
    setQuestions(prev => {
      const shuffled = [...prev];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      return shuffled;
    });
    alert("Đã xáo trộn thứ tự các câu hỏi.");
  };

  const handleShuffleAnswers = () => {
    setQuestions(prev => {
      const newQuestions = prev.map(q => {
        if (q.type !== 'Trắc nghiệm' || !q.options || q.options.length < 2) {
          return q;
        }

        // Tách nhãn đáp án đúng
        const answerPrefixMatch = q.answer.match(/^[A-D][\.\:]\s*/);
        const correctAnswerText = answerPrefixMatch
          ? q.answer.substring(answerPrefixMatch[0].length).trim()
          : q.answer.trim();

        // Tìm đáp án nguyên bản
        const originalOption = q.options.find(opt => {
          const optText = typeof opt === 'string' ? opt : opt.text;
          return optText.trim() === correctAnswerText;
        });

        if (!originalOption) return q;

        const shuffledOptions = [...q.options];
        for (let i = shuffledOptions.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [shuffledOptions[i], shuffledOptions[j]] = [shuffledOptions[j], shuffledOptions[i]];
        }

        const newCorrectIndex = shuffledOptions.findIndex(opt => {
          const optText = typeof opt === 'string' ? opt : opt.text;
          const origText = typeof originalOption === 'string' ? originalOption : originalOption.text;
          return optText.trim() === origText.trim();
        });

        if (newCorrectIndex === -1) return q;

        const newAnswerLetter = String.fromCharCode('A'.charCodeAt(0) + newCorrectIndex);
        const finalOptText = typeof originalOption === 'string' ? originalOption : originalOption.text;
        const newAnswer = `${newAnswerLetter}. ${finalOptText}`;

        return { ...q, options: shuffledOptions, answer: newAnswer };
      });
      return newQuestions;
    });
    alert("Đã xáo trộn các đáp án trắc nghiệm.");
  };

  const handleSaveExam = () => {
    if (questions.length === 0) return;
    const examName = prompt("Nhập tên để lưu đề thi này:", examHeader.split('\n')[0] || `Đề thi ngày ${new Date().toLocaleDateString()}`);
    if (!examName) return;

    const newExam: SavedExam = {
      id: Date.now().toString(), name: examName, questions, readingPassage, examHeader, timestamp: new Date().toISOString(),
    };

    const updatedHistory = [newExam, ...savedExams.filter(e => e.id !== newExam.id)].slice(0, 20);
    setSavedExams(updatedHistory);
    localStorage.setItem('edu_exam_history', JSON.stringify(updatedHistory));
    alert("Đã lưu đề thi thành công!");
  };

  const handleLoadExam = (exam: SavedExam) => {
    if (questions.length > 0 && !window.confirm("Thao tác này sẽ thay thế đề thi hiện tại. Bạn có chắc chắn?")) return;
    setQuestions(exam.questions);
    setReadingPassage(exam.readingPassage);
    setExamHeader(exam.examHeader);
    setShowHistory(false);
  };

  const handleDeleteExam = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = savedExams.filter(p => p.id !== id);
    setSavedExams(updated);
    localStorage.setItem('edu_exam_history', JSON.stringify(updated));
  };

  const handleCreateAssignment = () => {
    if (onCreateAssignment) {
      const title = examHeader.split('\n')[0] || `Bài kiểm tra ${config.subject}`;
      onCreateAssignment(title);
      const newId = onCreateAssignment(title);
      setCreatedAssignmentId(newId);
    }
  };

  const removeQuestion = (id: string) => {
    setQuestions(prev => prev.filter(q => q.id !== id));
  };

  const addOption = (qId: string) => {
    setQuestions(prev => prev.map(q => {
      if (q.id === qId) {
        const newOpt = { text: '', image: '' };
        return { ...q, options: [...(q.options || []), newOpt] };
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
      options: [
        { text: '', image: '' },
        { text: '', image: '' },
        { text: '', image: '' },
        { text: '', image: '' }
      ],
      answer: '',
      explanation: ''
    };
    setQuestions(prev => [...prev, newQ]);
  };

  const renderImage = (imageSrc?: string) => {
    if (!imageSrc) return null;
    const trimmedSrc = imageSrc.trim();
    if (trimmedSrc.startsWith('<svg')) {
      return (
        <div className="my-4 p-4 bg-white rounded-2xl border border-slate-100 flex justify-center shadow-inner" dangerouslySetInnerHTML={{ __html: trimmedSrc }} />
      );
    }
    // Hỗ trợ hiển thị ảnh từ URL hoặc Base64
    if (/^(http|https|data:image)/i.test(trimmedSrc)) {
      return (
        <div className="my-4 flex justify-center">
          <img src={trimmedSrc} alt="Minh họa" className="max-h-64 rounded-2xl border border-slate-200 shadow-sm object-contain" />
        </div>
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

    // Kiem tra xem co anh Base64 hoac SVG
    const hasBase64Images = questions.some(q => q.image && q.image.startsWith('data:image'));
    const hasSvgImages = questions.some(q => q.image && q.image.startsWith('<'));
    const hasAnyImages = hasBase64Images || hasSvgImages;

    if (viewMode === 'link' && hasAnyImages) {
      const confirmMsg = "Canh bao: De thi co chua HINH ANH.\n\nLink se co gang nen de giu anh, nhung neu van qua dai, anh se bi bo.\n\nDe dam bao giu anh, hay dung 'Copy Ma De'.\n\nTiep tuc tao Link?";
      if (!window.confirm(confirmMsg)) return;
    }

    try {
      // 1. Toi uu hoa du lieu - LUON GIU ANH
      const prepareData = (stripImages: boolean = false) => {
        return {
          s: config.subject,
          g: config.grade,
          aid: createdAssignmentId,
          q: questions.map(q => {
            let explanation = q.explanation || '';
            let image = q.image || '';

            // Chi bo anh neu buoc phai
            if (stripImages) {
              image = '';
            }

            // Rut gon explanation
            if (explanation.length > 100) {
              explanation = explanation.substring(0, 97) + '...';
            }

            const item = [
              q.type === 'Trac nghiem' ? 1 : 0,
              q.content,
              q.options || [],
              q.answer,
              explanation,
              image
            ];

            while (item.length > 1 && (!item[item.length - 1] || (Array.isArray(item[item.length - 1]) && item[item.length - 1].length === 0))) {
              item.pop();
            }
            return item;
          })
        };
      };

      // 2. Encode Base64 AN TOÀN với xử lý ký tự đặc biệt
      const encodeData = async (data: any) => {
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

          // Sử dụng Blob + FileReader để encode Base64 nhanh và không bị lỗi stack overflow
          const blob = new Blob([json], { type: 'application/json' });
          return new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              const base64 = (reader.result as string).split(',')[1];
              resolve(base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''));
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
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

      // Thu nén truoc, neu không ho tro thi dung cách cu
      // Luon thu giu anh, chi bo neu link qua dai
      let stripImages = false;
      let currentData = prepareData(false);
      let finalCode = await compressData(currentData) || await encodeData(currentData);
      let url = `${window.location.origin}${window.location.pathname}?exam=${finalCode}`;

      // Neu link van qua dai (>8000), thi bo anh
      if (viewMode === 'link' && url.length > 8000) {
        console.warn(`Link qua dai (${url.length} ky tu), dang thu bo anh...`);
        stripImages = true;
        currentData = prepareData(true);
        finalCode = await compressData(currentData) || await encodeData(currentData);
        url = `${window.location.origin}${window.location.pathname}?exam=${finalCode}`;
      }

      // Neu van con qua dai, bao loi
      if (viewMode === 'link' && url.length > 8000) {
        alert("De thi qua dai (ke ca khi da bo anh). Vui long su dung tinh nang 'Copy Ma De'.");
        return;
      }

      if (viewMode === 'code') {
        // Che do copy ma de: luon dung ban day du
        const fullBase64 = await compressData(prepareData(false)) || await encodeData(prepareData(false));
        await navigator.clipboard.writeText(fullBase64);
        alert(`Da sao chep MA DE THI (Bao gom ca hinh anh).\n\nHuong dan: Gui ma nay cho hoc sinh qua Zalo/Mess. Hoc sinh vao ung dung, chon "Nhap De Cu" -> "Dan Ma De" de lam bai.`);
        return;
      }

      await navigator.clipboard.writeText(url);
      alert(`Link da duoc sao chep!\n\n${stripImages ? 'Canh bao: Link nay KHONG chua hinh anh (da bi bo de dam bao link hoat dong).' : ''}\n\nGui ngay cho hoc sinh de bat dau luyen tap.`);

    } catch (e: any) {
      console.error("Link generation error:", e);
      alert(`❌ Lỗi tạo link: ${e.message || 'Không xác định'}\n\nThầy/Cô hãy thử:\n1. Rút ngắn nội dung câu hỏi\n2. Giảm số lượng câu hỏi\n3. Dùng "Copy Mã Đề" thay vì Link`);
    }
  };

  const updateQuestionField = (id: string, field: keyof ExamQuestion, value: any) => {
    setQuestions(prev => prev.map(q => q.id === id ? { ...q, [field]: value } : q));
  };

  const updateOption = (qId: string, optIdx: number, value: string, isImage: boolean = false) => {
    setQuestions(prev => prev.map(q => {
      if (q.id === qId && q.options) {
        const newOpts = [...q.options];
        const currentOpt = newOpts[optIdx];

        if (typeof currentOpt === 'string') {
          newOpts[optIdx] = isImage ? { text: currentOpt, image: value } : { text: value, image: '' };
        } else {
          newOpts[optIdx] = isImage ? { ...currentOpt, image: value } : { ...currentOpt, text: value };
        }

        return { ...q, options: newOpts };
      }
      return q;
    }));
  };

  return (
    <div className="flex flex-col lg:flex-row h-full gap-6 animate-in fade-in duration-500 overflow-hidden relative">
      <div className="lg:w-[400px] flex-shrink-0 flex flex-col space-y-4 overflow-y-auto custom-scrollbar pb-6 pr-2">
        <div className="bg-white p-6 rounded-[32px] border border-slate-200 shadow-sm space-y-6">
          <div className="flex flex-col space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black uppercase tracking-widest text-slate-800">Ma trận & Cấu hình</h3>
              <div className="bg-emerald-50 px-3 py-1 rounded-full border border-emerald-100 flex items-center space-x-2">
                <span className="text-[10px] font-black text-emerald-600 uppercase">{stats.total} câu</span>
              </div>
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
                <button onClick={handleShuffleQuestions} className="px-4 py-2 bg-slate-50 text-slate-600 rounded-xl text-[10px] font-black uppercase border border-slate-200 hover:bg-slate-100 transition-all" title="Xáo trộn thứ tự các câu hỏi">
                  <i className="fas fa-random mr-2"></i>Xáo câu
                </button>
                <button onClick={handleShuffleAnswers} className="px-4 py-2 bg-slate-50 text-slate-600 rounded-xl text-[10px] font-black uppercase border border-slate-200 hover:bg-slate-100 transition-all" title="Xáo trộn thứ tự các đáp án trắc nghiệm">
                  <i className="fas fa-shuffle mr-2"></i>Xáo đáp án
                </button>
                <button onClick={handleSaveExam} className="px-4 py-2 bg-emerald-50 text-emerald-600 rounded-xl text-[10px] font-black uppercase border border-emerald-100 hover:bg-emerald-100 transition-all">
                  <i className="fas fa-save mr-2"></i>Lưu đề
                </button>
              </>
            )}
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
                  <button onClick={handleCreateAssignment} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase border transition-all ${createdAssignmentId ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-purple-50 text-purple-600 border-purple-100 hover:bg-purple-100'}`} title="Tạo cột điểm trong Quản lý lớp để theo dõi kết quả">
                    <i className={`fas ${createdAssignmentId ? 'fa-check-circle' : 'fa-list-check'} mr-2`}></i>{createdAssignmentId ? 'Đã tạo' : 'Tạo bài tập'}
                  </button>
                )}
                {onStartPractice && (
                  <button onClick={() => onStartPractice(config.subject, config.grade, questions, createdAssignmentId)} className="px-4 py-2 bg-indigo-50 text-indigo-600 rounded-xl text-[10px] font-black uppercase border border-indigo-100 hover:bg-indigo-100 transition-all">
                    <i className="fas fa-play mr-2"></i>Luyện tập ngay
                  </button>
                )}
              </>
            )}
            <button onClick={() => setShowHistory(true)} className="px-4 py-2 bg-slate-50 text-slate-600 rounded-xl text-[10px] font-black uppercase border border-slate-200 hover:bg-slate-100 transition-all">
              <i className="fas fa-clock-rotate-left mr-2"></i>Đề đã lưu
            </button>
            <button onClick={() => setShowImportModal(true)} className="px-4 py-2 bg-emerald-50 text-emerald-600 rounded-xl text-[10px] font-black uppercase border border-emerald-100 hover:bg-emerald-100 transition-all">
              <i className="fas fa-file-import mr-2"></i>Nhập đề cũ
            </button>
            {questions.length > 0 && (
              <button onClick={() => { if (window.confirm('Xóa toàn bộ câu hỏi?')) setQuestions([]); }} className="px-4 py-2 bg-slate-50 text-slate-500 rounded-xl text-[10px] font-black uppercase border border-slate-200 hover:bg-rose-50 hover:text-rose-500 hover:border-rose-200 transition-all">
                <i className="fas fa-trash-alt mr-2"></i>Xóa
              </button>
            )}
            <div className="flex items-center space-x-2">
              <button onClick={handleExportJSON} disabled={questions.length === 0} className="px-4 py-2 bg-green-600 text-white rounded-xl text-[10px] font-black uppercase shadow-lg hover:bg-green-700 disabled:opacity-30 transition-all">Xuất JSON</button>
              <button onClick={handleExportDOCX} disabled={questions.length === 0} className="px-4 py-2 bg-blue-600 text-white rounded-xl text-[10px] font-black uppercase shadow-lg hover:bg-blue-700 disabled:opacity-30 transition-all">Xuất DOCX</button>
              <button onClick={exportText} disabled={questions.length === 0} className="px-6 py-2 bg-indigo-600 text-white rounded-xl text-[10px] font-black uppercase shadow-lg hover:bg-indigo-700 disabled:opacity-30 transition-all">Xuất bản thảo</button>
            </div>
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
                            <div className="flex justify-between items-center mb-1">
                              <label className="text-[10px] font-bold text-slate-400 uppercase">Hình ảnh minh họa</label>
                              {q.image && <button onClick={() => updateQuestionField(q.id, 'image', '')} className="text-[9px] text-rose-500 hover:underline">Xóa ảnh</button>}
                            </div>
                            <div className="flex gap-2">
                              <input
                                value={q.image || ''}
                                onChange={(e) => updateQuestionField(q.id, 'image', e.target.value)}
                                className="flex-1 bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-indigo-500"
                                placeholder="Dán URL/SVG hoặc tải ảnh..."
                              />
                              <label className="px-4 py-2 bg-indigo-50 text-indigo-600 rounded-xl cursor-pointer hover:bg-indigo-100 transition-all border border-indigo-100 flex items-center justify-center shrink-0" title="Tải ảnh từ máy tính">
                                <i className="fas fa-upload mr-2"></i>Tải ảnh
                                <input
                                  type="file"
                                  accept="image/*"
                                  className="hidden"
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) {
                                      const reader = new FileReader();
                                      reader.onloadend = () => updateQuestionField(q.id, 'image', reader.result as string);
                                      reader.readAsDataURL(file);
                                    }
                                  }}
                                />
                              </label>
                            </div>
                            <p className="text-[9px] text-slate-400 mt-1 italic">Mẹo: Dùng công cụ chụp màn hình (Snipping Tool) cắt ảnh câu hỏi rồi tải lên đây.</p>
                          </div>
                        )}

                        {renderImage(q.image)}

                        {q.options && q.options.length > 0 && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {q.options.map((opt, i) => {
                              const optText = typeof opt === 'string' ? opt : opt.text;
                              const optImg = typeof opt === 'string' ? '' : opt.image;
                              return (
                                <div key={i} className={`p-4 rounded-3xl border bg-white border-slate-100 flex flex-col space-y-3 transition-all ${editingId === q.id ? 'border-indigo-200 shadow-md ring-1 ring-indigo-50' : ''}`}>
                                  <div className="flex items-center space-x-3">
                                    <span className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-[10px] font-black shrink-0">{['A', 'B', 'C', 'D', 'E', 'F'][i]}</span>
                                    <input
                                      value={optText}
                                      onChange={(e) => updateOption(q.id, i, e.target.value)}
                                      className="flex-1 border-none focus:ring-0 p-0 text-[14px] font-bold text-slate-700 bg-transparent"
                                      placeholder={`Nội dung lựa chọn ${i + 1}`}
                                    />
                                  </div>

                                  {editingId === q.id && (
                                    <div className="pt-2 border-t border-slate-50 flex flex-col space-y-2">
                                      <div className="flex justify-between items-center">
                                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Hình ảnh đáp án</p>
                                        {optImg && <button onClick={() => updateOption(q.id, i, '', true)} className="text-[8px] text-rose-500 hover:underline">Xóa</button>}
                                      </div>
                                      <div className="flex gap-2">
                                        <input
                                          value={optImg}
                                          onChange={(e) => updateOption(q.id, i, e.target.value, true)}
                                          className="flex-1 bg-slate-50 border-none rounded-xl px-3 py-2 text-[10px] outline-none focus:ring-2 focus:ring-indigo-100"
                                          placeholder="URL/SVG..."
                                        />
                                        <label className="px-3 py-2 bg-slate-100 text-slate-600 rounded-xl cursor-pointer hover:bg-slate-200 transition-all flex items-center justify-center shrink-0" title="Tải ảnh">
                                          <i className="fas fa-upload text-xs"></i>
                                          <input
                                            type="file"
                                            accept="image/*"
                                            className="hidden"
                                            onChange={(e) => {
                                              const file = e.target.files?.[0];
                                              if (file) {
                                                const reader = new FileReader();
                                                reader.onloadend = () => updateOption(q.id, i, reader.result as string, true);
                                                reader.readAsDataURL(file);
                                              }
                                            }}
                                          />
                                        </label>
                                      </div>
                                    </div>
                                  )}

                                  {optImg && (
                                    <div className="mt-1">
                                      {renderImage(optImg)}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
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
          <div className="bg-white w-full max-w-2xl rounded-[40px] shadow-2xl relative z-10 overflow-hidden animate-in zoom-in-95 duration-300 flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between mb-8 p-8 pb-0 shrink-0">
              <div>
                <h3 className="text-lg font-black uppercase tracking-widest text-slate-800">Số hóa đề thi cũ</h3>
                <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">Bóc tách câu hỏi và hình ảnh từ ảnh/PDF</p>
              </div>
              <button onClick={() => setShowImportModal(false)} className="text-slate-300 hover:text-slate-600 transition-colors"><i className="fas fa-times-circle text-2xl"></i></button>
            </div>
            <div className="space-y-6 overflow-y-auto p-8 pt-0">
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div onClick={() => importFileInputRef.current?.click()} className={`w-full aspect-video bg-slate-50 border-4 border-dashed border-slate-100 rounded-[32px] flex flex-col items-center justify-center cursor-pointer hover:bg-slate-100 transition-all overflow-hidden relative group ${isImporting ? 'pointer-events-none opacity-50' : ''}`}>
                    {pendingImportFiles.length > 0 ? (
                      <div className="grid grid-cols-2 gap-2 p-4 w-full h-full overflow-y-auto custom-scrollbar">
                        {pendingImportFiles.map((file, idx) => (
                          <div key={idx} className="relative aspect-video rounded-xl overflow-hidden border border-slate-200 bg-white">
                            {file.mimeType === 'application/pdf' ? (
                              <div className="flex flex-col items-center justify-center h-full">
                                <i className="fas fa-file-pdf text-2xl text-rose-500 mb-1"></i>
                                <span className="text-[8px] font-bold text-slate-500 truncate w-full px-2 text-center">{file.name}</span>
                              </div>
                            ) : (
                              <img src={`data:${file.mimeType};base64,${file.data}`} className="w-full h-full object-cover" />
                            )}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setPendingImportFiles(prev => prev.filter((_, i) => i !== idx));
                              }}
                              className="absolute top-1 right-1 bg-rose-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px] shadow-md hover:bg-rose-600"
                            >
                              <i className="fas fa-times"></i>
                            </button>
                          </div>
                        ))}
                        <div className="aspect-video rounded-xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-300 hover:text-indigo-400 hover:border-indigo-200 transition-all">
                          <i className="fas fa-plus text-xl"></i>
                          <span className="text-[8px] font-black uppercase mt-1">Thêm trang</span>
                        </div>
                      </div>
                    ) : (
                      <>
                        <i className="fas fa-cloud-arrow-up text-4xl text-slate-200 mb-2"></i>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-center px-4">Chọn hoặc Dán nhiều ảnh/PDF đề thi</p>
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

                <input ref={importFileInputRef} type="file" multiple className="hidden" accept="image/*,application/pdf" onChange={handleFileImport} />
                <button onClick={handleImportOldExam} disabled={isImporting || pendingImportFiles.length === 0} className="w-full py-5 bg-indigo-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all disabled:opacity-50 flex items-center justify-center">
                  {isImporting ? <><i className="fas fa-spinner fa-spin mr-3"></i><span>AI đang bóc tách nội dung ({pendingImportFiles.length} trang)...</span></> : <><i className="fas fa-wand-magic mr-3"></i><span>Bắt đầu bóc tách (Từ {pendingImportFiles.length} File)</span></>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showHistory && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowHistory(false)}></div>
          <div className="bg-white w-full max-w-2xl rounded-[40px] shadow-2xl relative z-10 animate-in zoom-in-95 duration-300 flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between mb-6 shrink-0 p-8 pb-4">
              <h3 className="text-lg font-black uppercase tracking-widest text-slate-800">Lịch sử đề đã lưu</h3>
              <button onClick={() => setShowHistory(false)} className="text-slate-300 hover:text-slate-600 transition-colors"><i className="fas fa-times-circle text-2xl"></i></button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-3 px-8 pb-8 custom-scrollbar">
              {savedExams.length > 0 ? (
                savedExams.map(exam => (
                  <div key={exam.id} onClick={() => handleLoadExam(exam)} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 cursor-pointer hover:bg-indigo-50 hover:border-indigo-200 transition-all group relative">
                    <div className="font-bold text-sm text-slate-800 line-clamp-1 mb-1">{exam.name}</div>
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] text-slate-400 font-medium uppercase">{exam.questions.length} câu hỏi</span>
                      <span className="text-[10px] text-slate-400">{new Date(exam.timestamp).toLocaleString('vi-VN')}</span>
                    </div>
                    <button onClick={(e) => handleDeleteExam(exam.id, e)} className="absolute top-3 right-3 w-7 h-7 flex items-center justify-center text-slate-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity rounded-full hover:bg-rose-50">
                      <i className="fas fa-trash-alt text-xs"></i>
                    </button>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-400 text-center py-10">Chưa có đề thi nào được lưu.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div >
  );
};

export default ExamCreator;
