
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { geminiService, FilePart } from '../services/geminiService';
import { Attachment, Message, TeacherPersona } from '../types';
import { PERSONAS } from '../constants';
import ChatMessage from './ChatMessage';
import Crossword from './Crossword';
import { exportWorksheetToDocx, convertPdfToWordDocx, convertPdfToWordWithOCR } from '../docxHelper';
import { VIOEDU_GRADE1_SAMPLE_30 } from '../vioeduQuizData';

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

// Component Cắt ảnh đơn giản (Được đưa lên trước để QuizPlayer sử dụng)
interface ImageCropperProps {
  onClose: () => void;
  initialSrc?: string | null;
  onCropComplete?: (croppedData: string) => void;
}

const ImageCropper: React.FC<ImageCropperProps> = ({ onClose, initialSrc, onCropComplete }) => {
  const [src, setSrc] = useState<string | null>(initialSrc || null);
  const [croppedImage, setCroppedImage] = useState<string | null>(null);
  const [selection, setSelection] = useState<{ x: number, y: number, w: number, h: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [start, setStart] = useState({ x: 0, y: 0 });
  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (initialSrc) {
      setSrc(initialSrc);
      setIsLoading(true);
    } else {
      setSrc(null);
      setIsLoading(false);
    }
  }, [initialSrc]);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      const reader = new FileReader();
      reader.onload = (ev) => setSrc(ev.target?.result as string);
      reader.readAsDataURL(e.target.files[0]);
      setSelection(null);
      setCroppedImage(null);
    }
  };

  const getCoords = (e: React.MouseEvent | React.TouchEvent) => {
    if (!containerRef.current) return { x: 0, y: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const handleMouseDown = (e: React.MouseEvent | React.TouchEvent) => {
    if (!src) return;
    setIsDragging(true);
    const coords = getCoords(e);
    setStart(coords);
    setSelection({ x: coords.x, y: coords.y, w: 0, h: 0 });
  };

  const handleMouseMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDragging || !src) return;
    e.preventDefault();
    const coords = getCoords(e);
    const w = coords.x - start.x;
    const h = coords.y - start.y;
    setSelection({ x: w > 0 ? start.x : coords.x, y: h > 0 ? start.y : coords.y, w: Math.abs(w), h: Math.abs(h) });
  };

  const handleMouseUp = () => setIsDragging(false);

  const cropImage = () => {
    if (!imgRef.current || !selection || selection.w === 0 || selection.h === 0) return;
    const canvas = document.createElement('canvas');
    const scaleX = imgRef.current.naturalWidth / imgRef.current.width;
    const scaleY = imgRef.current.naturalHeight / imgRef.current.height;
    canvas.width = selection.w * scaleX;
    canvas.height = selection.h * scaleY;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(imgRef.current, selection.x * scaleX, selection.y * scaleY, selection.w * scaleX, selection.h * scaleY, 0, 0, canvas.width, canvas.height);
      setCroppedImage(canvas.toDataURL('image/png'));
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-slate-900/90 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
      <div className="bg-white w-full max-w-4xl rounded-[32px] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center">
          <h3 className="text-lg font-black text-slate-800 uppercase tracking-widest">Công cụ Cắt ảnh</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 hover:bg-rose-100 hover:text-rose-500 flex items-center justify-center transition-all"><i className="fas fa-times"></i></button>
        </div>
        <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
          <div className="flex-1 bg-slate-50 p-4 flex items-center justify-center overflow-auto relative select-none" onMouseUp={handleMouseUp} onTouchEnd={handleMouseUp} onMouseLeave={handleMouseUp}>
            {!src ? (
              <div className="text-center animate-in zoom-in">
                <div className="w-20 h-20 bg-indigo-50 rounded-3xl flex items-center justify-center mx-auto mb-4 text-indigo-600">
                  <i className="fas fa-image text-3xl"></i>
                </div>
                <button onClick={() => fileInputRef.current?.click()} className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold shadow-lg hover:bg-indigo-700 transition-all flex items-center mx-auto">
                  <i className="fas fa-upload mr-2"></i>Tải ảnh lên để cắt
                </button>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
              </div>
            ) : (
              <div className="relative flex flex-col items-center">
                {isLoading && (
                  <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-50/50 backdrop-blur-[2px]">
                    <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                  </div>
                )}
                <div ref={containerRef} className="relative inline-block shadow-2xl border-4 border-white rounded-lg overflow-hidden group" onMouseDown={handleMouseDown} onTouchStart={handleMouseDown} onMouseMove={handleMouseMove} onTouchMove={handleMouseMove}>
                  <img
                    ref={imgRef}
                    src={src}
                    alt="Source"
                    className="max-h-[65vh] max-w-full object-contain pointer-events-none transition-opacity duration-300"
                    style={{ opacity: isLoading ? 0.3 : 1 }}
                    onLoad={() => setIsLoading(false)}
                    onError={() => { setIsLoading(false); alert("Không thể tải ảnh này!"); }}
                  />
                  {selection && (
                    <div
                      className="absolute border-2 border-indigo-500 shadow-[0_0_0_9999px_rgba(0,0,0,0.6)] z-20"
                      style={{ left: selection.x, top: selection.y, width: selection.w, height: selection.h, pointerEvents: 'none' }}
                    >
                      <div className="absolute inset-0 border border-white/50 border-dashed"></div>
                      {/* Corner handles visual only */}
                      <div className="absolute -top-1 -left-1 w-2 h-2 bg-indigo-500 rounded-full"></div>
                      <div className="absolute -top-1 -right-1 w-2 h-2 bg-indigo-500 rounded-full"></div>
                      <div className="absolute -bottom-1 -left-1 w-2 h-2 bg-indigo-500 rounded-full"></div>
                      <div className="absolute -bottom-1 -right-1 w-2 h-2 bg-indigo-500 rounded-full"></div>
                    </div>
                  )}
                </div>
                <p className="mt-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest bg-white px-4 py-1.5 rounded-full shadow-sm">Kéo chuột trên ảnh để chọn vùng</p>
              </div>
            )}
          </div>
          <div className="w-full md:w-72 bg-white border-l border-slate-100 p-6 flex flex-col space-y-6 shrink-0">
            {croppedImage ? (
              <div className="space-y-4">
                <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Kết quả</p>
                <div className="bg-slate-100 rounded-xl p-2 border border-slate-200"><img src={croppedImage} className="w-full h-auto rounded-lg" /></div>
                {onCropComplete ? (
                  <button onClick={() => { onCropComplete(croppedImage); onClose(); }} className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold text-xs uppercase tracking-widest shadow-lg hover:bg-indigo-700 transition-all">
                    <i className="fas fa-check mr-2"></i>Sử dụng ảnh này
                  </button>
                ) : (
                  <button onClick={() => { const link = document.createElement('a'); link.download = `cropped_${Date.now()}.png`; link.href = croppedImage; link.click(); }} className="w-full py-3 bg-emerald-600 text-white rounded-xl font-bold text-xs uppercase tracking-widest shadow-lg hover:bg-emerald-700 transition-all"><i className="fas fa-download mr-2"></i>Tải về</button>
                )}
                <button onClick={() => { setCroppedImage(null); setSelection(null); }} className="w-full py-3 bg-slate-100 text-slate-600 rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-slate-200 transition-all">Cắt lại</button>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Hướng dẫn</p>
                <p className="text-[11px] leading-relaxed text-slate-600 font-medium bg-slate-50 p-3 rounded-xl border border-slate-100">Dùng chuột hoặc ngón tay kéo thành hình chữ nhật trên ảnh để chọn vùng Thầy Cô muốn lấy.</p>
                <button
                  onClick={cropImage}
                  disabled={!selection || selection.w < 5 || isLoading}
                  className="w-full py-3.5 bg-indigo-600 text-white rounded-xl font-black text-xs uppercase tracking-widest shadow-xl shadow-indigo-100 hover:bg-indigo-700 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:translate-y-0 transition-all"
                >
                  <i className="fas fa-crop-simple mr-2"></i>Cắt ảnh đã chọn
                </button>
                {src && (
                  <button onClick={() => { setSrc(null); setSelection(null); setCroppedImage(null); }} className="w-full py-3 bg-white text-slate-500 border border-slate-200 rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-slate-50 transition-all">
                    Chọn ảnh khác
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// Component Quiz Player nội bộ
const QuizPlayer: React.FC<{
  data: any[];
  onShare?: () => void;
  onCopyCode?: () => void;
  onCrop?: (src: string, type: 'question' | 'option', qIdx: number, optIdx?: number) => void;
  onUpdateQuestion?: (index: number, updatedQuestion: any) => void;
  onExportDocx?: () => void;
}> = ({ data, onShare, onCopyCode, onCrop, onUpdateQuestion, onExportDocx }) => {
  const toSafeText = (value: unknown): string => {
    if (typeof value === 'string') return value;
    if (typeof value === 'number') return String(value);
    return '';
  };

  const [currentIndex, setCurrentIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [wrongCount, setWrongCount] = useState(0);
  const [showScore, setShowScore] = useState(false);
  const [selectedOption, setSelectedOption] = useState<any>(null);
  const [pendingOptionIndex, setPendingOptionIndex] = useState<number | null>(null);
  const [essayInput, setEssayInput] = useState('');
  const [feedbackToast, setFeedbackToast] = useState<'correct' | 'wrong' | null>(null);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [timeLeft, setTimeLeft] = useState(45);
  const [timerEnabled, setTimerEnabled] = useState(false);
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);
  const [isBatchEditing, setIsBatchEditing] = useState(false);
  const [isSpeakingQuiz, setIsSpeakingQuiz] = useState(false);
  const [autoReadQuiz, setAutoReadQuiz] = useState(true);
  const [quizVoice, setQuizVoice] = useState<'Puck' | 'Kore' | 'Girl' | 'Boy'>('Puck');

  const handleReadQuizQuestion = async (forceRead = false) => {
    const q = data[currentIndex];
    if (!q) return;
    if (isSpeakingQuiz && !forceRead) {
      geminiService.stopSpeakingQuestion();
      setIsSpeakingQuiz(false);
      return;
    }
    const qText = toSafeText(q.question || q.content);
    const qOpts = Array.isArray(q.options) ? q.options : [];
    const speechText = geminiService.formatQuestionForSpeech(qText, qOpts, currentIndex + 1);
    setIsSpeakingQuiz(true);
    await geminiService.speakQuestionText(
      speechText,
      quizVoice,
      () => setIsSpeakingQuiz(true),
      () => setIsSpeakingQuiz(false)
    );
  };

  const handleReadQuizOption = async (e: React.MouseEvent, letter: string, optText: string) => {
    e.stopPropagation();
    const cleaned = geminiService.cleanMathAndSymbolsForSpeech(optText.replace(/^[A-F][\.\:\)]\s*/i, '').trim());
    setIsSpeakingQuiz(true);
    await geminiService.speakQuestionText(
      `Đáp án ${letter}: ${cleaned}`,
      quizVoice,
      () => setIsSpeakingQuiz(true),
      () => setIsSpeakingQuiz(false)
    );
  };

  useEffect(() => {
    setTimeLeft(45);
    setPendingOptionIndex(null);
    setEssayInput('');
    setSelectedOption(null);
    setIsCorrect(null);
    setFeedbackToast(null);
    setIsBatchEditing(false); // Reset edit mode when changing question
    if (showScore) {
      geminiService.stopSpeakingQuestion();
      setIsSpeakingQuiz(false);
      return;
    }
    if (autoReadQuiz && data[currentIndex]) {
      const t = setTimeout(() => {
        handleReadQuizQuestion(true);
      }, 250);
      return () => {
        clearTimeout(t);
        geminiService.stopSpeakingQuestion();
        setIsSpeakingQuiz(false);
      };
    } else {
      geminiService.stopSpeakingQuestion();
      setIsSpeakingQuiz(false);
    }
  }, [currentIndex, showScore, autoReadQuiz, quizVoice]);

  useEffect(() => {
    return () => {
      geminiService.stopSpeakingQuestion();
    };
  }, []);

  const checkCorrectness = (q: any, opt: any, idx: number) => {
    if (!q || opt === null || opt === undefined) return false;

    const ansVal = typeof q.answer === 'string' || typeof q.answer === 'number' ? String(q.answer) : (q.answer?.text || '');
    const ansStr = String(ansVal).trim();

    const optVal = typeof opt === 'string' || typeof opt === 'number' ? String(opt) : (opt?.text || '');
    const optStr = String(optVal).trim();

    if (!ansStr || !optStr) return false;
    if (ansStr.toLowerCase() === optStr.toLowerCase()) return true;

    // So sánh số học cho câu hỏi Điền số VioEdu (VD: "7" và "07" hoặc "7.")
    const cleanAns = ansStr.replace(/^[A-F][\.\:\)]\s*/i, '').trim().toLowerCase();
    const cleanOpt = optStr.replace(/^[A-F][\.\:\)]\s*/i, '').trim().toLowerCase();
    if (cleanAns === cleanOpt) return true;
    if (!Number.isNaN(Number(cleanAns)) && !Number.isNaN(Number(cleanOpt)) && cleanAns !== '' && cleanOpt !== '') {
      if (Number(cleanAns) === Number(cleanOpt)) return true;
    }

    if (idx >= 0) {
      const letter = String.fromCharCode(65 + idx);
      const letterLower = letter.toLowerCase();
      const ansLower = ansStr.toLowerCase();
      if (ansLower === letterLower) return true;
      if (ansLower.startsWith(`${letterLower}.`) || ansLower.startsWith(`${letterLower} `) || ansLower.startsWith(`${letterLower})`) || ansLower.startsWith(`${letterLower}:`)) return true;
    }
    return false;
  };

  const handleAnswerClick = (option: any, index: number) => {
    if (selectedOption !== null) return;

    const correct = checkCorrectness(data[currentIndex], option, index);
    setSelectedOption(option);
    setIsCorrect(correct);
    setFeedbackToast(correct ? 'correct' : 'wrong');

    if (correct) {
      setScore(prev => prev + 1);
    } else {
      setWrongCount(prev => prev + 1);
    }

    setTimeout(() => {
      setFeedbackToast(null);
      const nextQuestion = currentIndex + 1;
      if (nextQuestion < data.length) {
        setCurrentIndex(nextQuestion);
        setSelectedOption(null);
        setPendingOptionIndex(null);
        setEssayInput('');
        setIsCorrect(null);
      } else {
        setShowScore(true);
      }
    }, 1800);
  };

  const handleConfirmCurrentAnswer = () => {
    if (selectedOption !== null) return;
    const currentQ = data[currentIndex];
    const qOpts = Array.isArray(currentQ?.options) ? currentQ.options : [];
    const isMcq = (!currentQ?.type || currentQ.type === 'Trắc nghiệm') && qOpts.length > 0;
    if (isMcq) {
      if (pendingOptionIndex === null) return;
      handleAnswerClick(qOpts[pendingOptionIndex], pendingOptionIndex);
    } else {
      if (!essayInput.trim()) return;
      handleAnswerClick(essayInput.trim(), -1);
    }
  };

  useEffect(() => {
    if (!timerEnabled || showScore || selectedOption !== null || isBatchEditing) return;

    if (timeLeft === 0) {
      handleAnswerClick('TIMEOUT', -1);
      return;
    }

    const timer = setInterval(() => {
      setTimeLeft(prev => prev - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [timerEnabled, timeLeft, showScore, selectedOption, isBatchEditing]);

  const restartQuiz = () => {
    setCurrentIndex(0);
    setScore(0);
    setWrongCount(0);
    setShowScore(false);
    setSelectedOption(null);
    setPendingOptionIndex(null);
    setEssayInput('');
    setFeedbackToast(null);
    setIsCorrect(null);
    setTimeLeft(45);
  };

  const startBatchEdit = () => {
    setIsBatchEditing(true);
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

  if (isBatchEditing) {
    return (
      <div className="flex flex-col h-full p-6 bg-slate-50 rounded-3xl animate-in fade-in">
        <div className="flex items-center justify-between mb-6 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-100 text-indigo-700 rounded-xl"><i className="fas fa-list-check"></i></div>
            <div>
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">Sửa toàn bộ câu hỏi</h3>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{data.length} câu đã trích xuất</p>
            </div>
          </div>
          <button
            onClick={() => setIsBatchEditing(false)}
            className="px-6 py-2.5 rounded-2xl bg-indigo-600 text-white font-black text-[10px] uppercase tracking-widest shadow-xl shadow-indigo-100 hover:bg-indigo-700 active:scale-95 transition-all flex items-center"
          >
            <i className="fas fa-check-circle mr-2"></i> Hoàn tất & Quay lại
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar space-y-6 pr-2">
          {data.map((q, idx) => (
            <div key={idx} className="bg-white p-6 rounded-[32px] border border-slate-200 shadow-sm hover:shadow-md transition-shadow group">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <span className="w-8 h-8 flex items-center justify-center bg-indigo-600 text-white rounded-xl text-xs font-black shadow-lg shadow-indigo-100">
                    {idx + 1}
                  </span>
                  <span className="text-xs font-black text-slate-800 uppercase tracking-widest">Chi tiết câu hỏi</span>
                </div>
                {q.originalPageImage && (
                  <button
                    onClick={() => onCrop?.(q.originalPageImage, 'question', idx)}
                    className="text-[10px] font-black text-indigo-600 uppercase bg-indigo-50 px-4 py-2 rounded-xl hover:bg-indigo-100 transition-colors flex items-center"
                  >
                    <i className="fas fa-crop-simple mr-2"></i> {q.image ? 'Cắt lại ảnh' : 'Cắt ảnh từ đề'}
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-6">
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nội dung câu hỏi</label>
                    <textarea
                      value={q.question}
                      onChange={e => onUpdateQuestion?.(idx, { ...q, question: e.target.value })}
                      className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl mt-1 text-sm font-bold text-slate-700 focus:ring-2 focus:ring-indigo-500 focus:bg-white outline-none resize-none transition-all"
                      rows={3}
                      placeholder="Nhập câu hỏi..."
                    />
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between ml-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Các lựa chọn & Hình ảnh</label>
                      <p className="text-[9px] text-slate-400 italic">Bấm biểu tượng <i className="fas fa-crop mx-1"></i> để cắt ảnh cho từng đáp án</p>
                    </div>
                    {q.options.map((opt: any, oIdx: number) => (
                      <div key={oIdx} className="space-y-2">
                        <div className="flex items-center gap-3">
                          <span className="w-7 h-7 flex items-center justify-center bg-slate-100 text-slate-500 rounded-lg text-[10px] font-black">{String.fromCharCode(65 + oIdx)}</span>
                          <input
                            value={typeof opt === 'string' ? opt : opt.text}
                            onChange={e => {
                              const newOpts = [...q.options];
                              if (typeof newOpts[oIdx] === 'string') newOpts[oIdx] = { text: e.target.value, image: '' };
                              else newOpts[oIdx] = { ...newOpts[oIdx], text: e.target.value };
                              onUpdateQuestion?.(idx, { ...q, options: newOpts });
                            }}
                            className="flex-1 p-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-medium focus:ring-2 focus:ring-indigo-500 focus:bg-white outline-none transition-all font-bold text-slate-700"
                            placeholder={`Nhập đáp án ${String.fromCharCode(65 + oIdx)}...`}
                          />
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              // Ưu tiên: Ảnh đề gốc > Ảnh hiện tại của đáp án > Ảnh câu hỏi
                              const optImg = (typeof opt !== 'string' && opt.image && opt.image.startsWith('data:image')) ? opt.image : '';
                              const qImg = (typeof q.image === 'string' && q.image.startsWith('data:image')) ? q.image : '';
                              const cropSource = q.originalPageImage || optImg || qImg;
                              onCrop?.(cropSource, 'option', idx, oIdx);
                            }}
                            className={`w-10 h-10 flex items-center justify-center rounded-xl transition-all shadow-sm ${(typeof opt !== 'string' && opt.image) ? 'bg-indigo-600 text-white shadow-indigo-200' : 'bg-white text-indigo-600 border border-indigo-100 hover:bg-indigo-50'}`}
                            title="Xác định hình ảnh cho đáp án này bằng cách cắt từ đề gốc hoặc tải lên"
                          >
                            <i className="fas fa-crop"></i>
                          </button>
                        </div>
                        {
                          typeof opt !== 'string' && opt.image && (
                            <div className="ml-10 relative inline-block group/opt">
                              <img src={opt.image} className="h-16 w-auto rounded-lg border-2 border-indigo-100 shadow-md bg-white" />
                              <button
                                onClick={() => {
                                  const newOpts = [...q.options];
                                  if (typeof newOpts[oIdx] !== 'string') newOpts[oIdx] = { ...newOpts[oIdx], image: '' };
                                  onUpdateQuestion?.(idx, { ...q, options: newOpts });
                                }}
                                className="absolute -top-2 -right-2 bg-rose-500 text-white w-5 h-5 rounded-full flex items-center justify-center shadow-lg opacity-0 group-hover/opt:opacity-100 transition-opacity"
                              >
                                <i className="fas fa-times text-[10px]"></i>
                              </button>
                            </div>
                          )
                        }
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-6">
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Hình ảnh câu hỏi</label>
                    <div className="mt-1 relative min-h-[160px] bg-slate-50 border-2 border-dashed border-slate-100 rounded-3xl flex items-center justify-center overflow-hidden">
                      {q.image ? (
                        <div className="relative group/img p-2">
                          <img src={q.image} className="max-h-36 w-auto rounded-xl shadow-md" />
                          <button
                            onClick={() => onUpdateQuestion?.(idx, { ...q, image: '' })}
                            className="absolute top-0 right-0 bg-rose-500 text-white w-6 h-6 rounded-full flex items-center justify-center shadow-lg opacity-0 group-hover/img:opacity-100 transition-opacity"
                          >
                            <i className="fas fa-times text-[10px]"></i>
                          </button>
                        </div>
                      ) : (
                        <div className="text-center p-4">
                          <i className="fas fa-image-slash text-slate-200 text-3xl mb-2"></i>
                          <p className="text-[10px] text-slate-300 font-bold uppercase tracking-widest">Chưa có ảnh minh họa</p>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Đáp đúng</label>
                      <input
                        value={q.answer}
                        onChange={e => onUpdateQuestion?.(idx, { ...q, answer: e.target.value })}
                        className="w-full p-3 bg-emerald-50 border border-emerald-100 rounded-2xl mt-1 text-sm font-black text-emerald-700 focus:ring-2 focus:ring-emerald-500 focus:bg-white outline-none transition-all"
                        placeholder="VD: A"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Giải thích (Tùy chọn)</label>
                      <textarea
                        value={q.explanation}
                        onChange={e => onUpdateQuestion?.(idx, { ...q, explanation: e.target.value })}
                        className="w-full p-3 bg-slate-50 border border-slate-100 rounded-2xl mt-1 text-xs font-semibold text-slate-600 focus:ring-2 focus:ring-indigo-500 focus:bg-white outline-none resize-none transition-all"
                        rows={2}
                        placeholder="Nhập lời giải..."
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div >
    );
  }

  const currentQuestion = data[currentIndex] || { question: '', image: '', options: [] };
  const questionOptions = Array.isArray(currentQuestion.options) ? currentQuestion.options : [];

  // Xử lý thông minh: Tách hình ảnh ra khỏi nội dung câu hỏi nếu AI gộp chung
  let displayQuestion = toSafeText(currentQuestion.question);
  let displayImage = toSafeText(currentQuestion.image);

  if (!displayImage && displayQuestion) {
    const imgMatch = displayQuestion.match(/\[(HÌNH ẢNH|IMAGE|IMG|HÌNH|CẮT ẢNH|CẮT ẢNH TỪ ĐỀ):(.*?)\]/i);
    if (imgMatch) {
      displayImage = imgMatch[0]; // Lấy cả cụm [HÌNH ẢNH: ...]
      displayQuestion = displayQuestion.replace(imgMatch[0], '').trim();
    }
  }

  const isCurrentMcq = (!currentQuestion.type || currentQuestion.type === 'Trắc nghiệm') && questionOptions.length > 0;

  return (
    <div className="flex flex-col h-full p-3 sm:p-5 relative">
      {/* VioEdu Toast Notification */}
      {feedbackToast && (
        <div className="fixed sm:absolute top-3 left-1/2 -translate-x-1/2 z-50 px-5 py-2.5 bg-white rounded-2xl shadow-2xl border border-slate-200 flex items-center gap-2.5 animate-in fade-in slide-in-from-top-3 duration-200">
          {feedbackToast === 'correct' ? (
            <>
              <span className="w-6 h-6 rounded-full bg-emerald-500 text-white flex items-center justify-center text-xs"><i className="fas fa-check"></i></span>
              <span className="text-sm font-black text-slate-800">Bạn đã trả lời đúng!</span>
            </>
          ) : (
            <>
              <span className="w-6 h-6 rounded-full bg-rose-500 text-white flex items-center justify-center text-xs"><i className="fas fa-times"></i></span>
              <span className="text-sm font-black text-slate-800">Bạn đã trả lời sai! (Đáp án: {toSafeText(currentQuestion.answer)})</span>
            </>
          )}
        </div>
      )}

      {/* VioEdu Top Status Bar */}
      <div className="flex flex-wrap justify-between items-center gap-2 mb-4">
        <div className="flex items-center gap-3 bg-white px-4 py-2 rounded-2xl shadow-sm border border-slate-100">
          <span className="text-xs sm:text-sm font-black text-slate-800">{currentIndex + 1}/{data.length}</span>
          <span className="flex items-center gap-1 text-xs sm:text-sm font-black text-emerald-600" title="Số câu đúng">
            <i className="fas fa-check-circle"></i> {score}
          </span>
          <span className="flex items-center gap-1 text-xs sm:text-sm font-black text-rose-500" title="Số câu sai">
            <i className="fas fa-times-circle"></i> {wrongCount}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {onUpdateQuestion && (
            <button onClick={startBatchEdit} className="text-xs font-black text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-3 py-2 rounded-xl transition-all border border-indigo-200 flex items-center shadow-sm active:scale-95" title="Sửa toàn bộ đề thi">
              <i className="fas fa-edit mr-1.5"></i>Sửa đề & Cắt ảnh
            </button>
          )}
          {onShare && (
            <button onClick={onShare} className="text-xs font-bold text-indigo-600 hover:bg-indigo-50 px-3 py-2 rounded-xl transition-colors border border-indigo-100 flex items-center">
              <i className="fas fa-share-nodes mr-1"></i>Chia sẻ
            </button>
          )}
          {onCopyCode && (
            <button onClick={onCopyCode} className="text-xs font-bold text-indigo-600 hover:bg-indigo-50 px-3 py-2 rounded-xl transition-colors border border-indigo-100 flex items-center" title="Copy Mã Đề">
              <i className="fas fa-code mr-1"></i>Mã
            </button>
          )}
          {onExportDocx && (
            <button onClick={onExportDocx} className="text-xs font-black text-white bg-blue-600 hover:bg-blue-700 px-3 py-2 rounded-xl transition-all shadow-md flex items-center shadow-blue-100" title="Xuất ra file Word (.docx)">
              <i className="fas fa-file-word mr-1.5"></i>Word
            </button>
          )}
          <button
            type="button"
            onClick={() => setTimerEnabled(!timerEnabled)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-black text-xs sm:text-sm shadow-md transition-all"
            title="Bấm để Bật/Tắt đếm ngược thời gian"
          >
            <i className="fas fa-clock text-amber-300"></i>
            <span>{timerEnabled ? `00:${String(timeLeft).padStart(2, '0')}` : '15:00'}</span>
          </button>
        </div>
      </div>

      {/* Thanh công cụ AI Đọc câu hỏi hỗ trợ học sinh Lớp 1 */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4 p-2.5 bg-amber-50/70 border border-amber-200/80 rounded-2xl">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => handleReadQuizQuestion(false)}
            className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 shadow-md transition-all active:scale-95 ${
              isSpeakingQuiz
                ? 'bg-rose-500 text-white animate-pulse'
                : 'bg-amber-500 hover:bg-amber-600 text-white'
            }`}
          >
            <i className={`fas ${isSpeakingQuiz ? 'fa-stop-circle' : 'fa-volume-high'} text-sm`}></i>
            <span>{isSpeakingQuiz ? 'Dừng đọc' : 'AI Đọc câu hỏi & đáp án'}</span>
          </button>

          <button
            type="button"
            onClick={() => setAutoReadQuiz(!autoReadQuiz)}
            className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider border transition-all flex items-center gap-1.5 ${
              autoReadQuiz
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-white text-slate-400 border-slate-200'
            }`}
          >
            <i className={`fas ${autoReadQuiz ? 'fa-check-circle' : 'fa-circle-pause'}`}></i>
            <span>Tự đọc: {autoReadQuiz ? 'Bật' : 'Tắt'}</span>
          </button>

          <select
            value={quizVoice}
            onChange={(e) => setQuizVoice(e.target.value as any)}
            className="bg-white text-indigo-700 border border-indigo-200 rounded-xl px-3 py-1.5 text-[11px] font-black outline-none cursor-pointer"
          >
            <option value="Puck">👩‍🏫 Giọng Cô giáo</option>
            <option value="Kore">👨‍🏫 Giọng Thầy giáo</option>
            <option value="Girl">👧 Giọng Bé gái</option>
            <option value="Boy">👦 Giọng Bé trai</option>
          </select>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            disabled={currentIndex === 0}
            onClick={() => setCurrentIndex(prev => Math.max(0, prev - 1))}
            className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-slate-600 text-xs font-bold hover:bg-slate-50 disabled:opacity-30"
          >
            <i className="fas fa-chevron-left mr-1"></i>Trước
          </button>
          <button
            type="button"
            disabled={currentIndex >= data.length - 1}
            onClick={() => setCurrentIndex(prev => Math.min(data.length - 1, prev + 1))}
            className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-slate-600 text-xs font-bold hover:bg-slate-50 disabled:opacity-30"
          >
            Tiếp<i className="fas fa-chevron-right ml-1"></i>
          </button>
        </div>
      </div>

      {/* Khung câu hỏi chuẩn VioEdu */}
      <div className="flex-1 flex flex-col justify-center bg-white rounded-3xl border border-slate-100 p-4 sm:p-6 shadow-sm">
        {displayImage && (
          displayImage.trim().startsWith('<svg') ? (
            <div className="flex justify-center sm:justify-start mb-4 p-3 bg-white rounded-2xl [&>svg]:max-w-full [&>svg]:h-auto [&>svg]:max-h-56" dangerouslySetInnerHTML={{ __html: displayImage }} />
          ) : (
            /^(http|https|data:image)/i.test(displayImage.trim()) ? (
              <div className="flex justify-center sm:justify-start mb-4 relative group">
                <img
                  src={displayImage}
                  alt="Minh họa"
                  className="max-h-56 w-auto rounded-xl shadow-sm border border-slate-200 object-contain cursor-zoom-in hover:opacity-95 transition-opacity"
                  onClick={() => setZoomedImage(displayImage)}
                />
                {onCrop && currentQuestion.originalPageImage && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onCrop(currentQuestion.originalPageImage, 'question', currentIndex); }}
                    className="absolute top-2 right-2 bg-white/90 text-indigo-600 p-2 rounded-full shadow-md hover:bg-white transition-all opacity-0 group-hover:opacity-100 z-10"
                    title="Cắt lại ảnh từ đề gốc"
                  >
                    <i className="fas fa-crop-simple"></i>
                  </button>
                )}
              </div>
            ) : (
              <div className="flex justify-center mb-4 p-4 bg-amber-50 rounded-xl border border-amber-200 text-amber-800 text-sm font-medium italic text-center max-w-md">
                <i className="fas fa-image text-xl mr-2 text-amber-400"></i>
                {displayImage.replace(/[\[\]]/g, '').replace(/^(HÌNH ẢNH|IMAGE|IMG|HÌNH|CẮT ẢNH|CẮT ẢNH TỪ ĐỀ):/i, '').trim()}
              </div>
            )
          )
        )}

              {!displayImage && onCrop && currentQuestion.originalPageImage && (
                <div className="mb-3">
                  <button
                    type="button"
                    onClick={() => onCrop(currentQuestion.originalPageImage, 'question', currentIndex)}
                    className="px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-600 border border-indigo-200 text-xs font-bold inline-flex items-center gap-1.5 transition-all"
                  >
                    <i className="fas fa-crop-simple"></i>
                    <span>Cắt hình minh họa từ trang đề gốc</span>
                  </button>
                </div>
              )}

              <h3 className="text-lg sm:text-xl font-bold text-slate-800 mb-4 leading-relaxed font-serif">{displayQuestion}</h3>

        {isCurrentMcq ? (
          <>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs italic text-slate-500 font-medium">Hãy chọn 1 đáp án đúng</span>
              <button
                type="button"
                disabled={pendingOptionIndex === null || selectedOption !== null}
                onClick={handleConfirmCurrentAnswer}
                className={`px-7 py-2.5 rounded-lg text-xs font-bold transition-all ${
                  pendingOptionIndex !== null && selectedOption === null
                    ? 'bg-indigo-600 text-white shadow-md hover:bg-indigo-700 active:scale-95'
                    : 'bg-slate-200 text-slate-500 cursor-not-allowed'
                }`}
              >
                Xác nhận
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {questionOptions.map((option: any, index: number) => {
                const optText = toSafeText(typeof option === 'string' || typeof option === 'number' ? option : (option?.text || option?.label || option?.content || ''));
                const optImg = toSafeText(typeof option === 'string' || typeof option === 'number' ? '' : (option?.image || ''));
                const isPending = pendingOptionIndex === index && selectedOption === null;
                const isConfirmedSelected = selectedOption === option;
                const isCorrectAnswer = checkCorrectness(currentQuestion, option, index);
                const letter = String.fromCharCode(65 + index);

                let btnClass = "p-4 rounded-xl border-2 text-left font-medium transition-all relative overflow-hidden cursor-pointer flex flex-col justify-between min-h-[84px] ";
                if (isConfirmedSelected) {
                  btnClass += isCorrectAnswer
                    ? "bg-emerald-50 border-emerald-500 text-emerald-900 shadow-md"
                    : "bg-rose-50 border-rose-500 text-rose-900 shadow-md";
                } else if (selectedOption !== null && isCorrectAnswer) {
                  btnClass += "bg-emerald-50/70 border-emerald-400 text-emerald-800";
                } else if (isPending) {
                  btnClass += "bg-indigo-50/80 border-indigo-600 text-indigo-900 ring-2 ring-indigo-200 shadow-md";
                } else {
                  btnClass += "bg-white border-slate-200 hover:border-indigo-400 hover:bg-slate-50/60 text-slate-800";
                }

                return (
                  <div
                    key={index}
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      if (selectedOption !== null) return;
                      setPendingOptionIndex(index);
                    }}
                    onDoubleClick={() => {
                      if (selectedOption !== null) return;
                      handleAnswerClick(option, index);
                    }}
                    className={btnClass}
                  >
                    <div className="flex items-start justify-between gap-2 w-full">
                      <div className="flex-1 min-w-0">
                        {optImg && (
                          <div className="mb-2">
                            {optImg.trim().startsWith('<svg') ? (
                              <div className="inline-block align-middle [&>svg]:max-h-24 [&>svg]:w-auto" dangerouslySetInnerHTML={{ __html: optImg }} />
                            ) : /^(http|https|data:image)/i.test(optImg.trim()) ? (
                              <img
                                src={optImg}
                                alt="Option"
                                className="max-h-28 w-auto object-contain rounded-lg cursor-zoom-in"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setZoomedImage(optImg);
                                }}
                                onError={(e) => {
                                  e.currentTarget.style.display = 'none';
                                }}
                              />
                            ) : null}
                          </div>
                        )}
                        {optText.trim().startsWith('<svg') ? (
                          <div className="inline-block align-middle [&>svg]:h-16 [&>svg]:w-auto" dangerouslySetInnerHTML={{ __html: optText }} />
                        ) : (
                          <div className="flex items-center gap-2">
                            {!optImg && <span className="text-xs font-black text-slate-400">{letter}.</span>}
                            <span className={`${optImg ? 'text-xs text-slate-500 font-semibold' : 'text-lg font-bold text-slate-800'}`}>{optText}</span>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {isConfirmedSelected && (
                          <span>
                            {isCorrectAnswer ? <i className="fas fa-check-circle text-emerald-600 text-xl"></i> : <i className="fas fa-times-circle text-rose-600 text-xl"></i>}
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={(e) => handleReadQuizOption(e, letter, optText)}
                          className="w-8 h-8 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-600 border border-amber-200 flex items-center justify-center shrink-0 transition-all z-10"
                          title={`Nghe đáp án ${letter}`}
                        >
                          <i className="fas fa-volume-high text-xs"></i>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <div className="space-y-3 mt-4">
            <div className="flex flex-wrap items-center gap-2.5">
              <input
                type="text"
                value={essayInput}
                disabled={selectedOption !== null}
                onChange={(e) => setEssayInput(e.target.value)}
                placeholder="Đáp án của bạn..."
                className="w-full sm:w-72 px-4 py-3 bg-white border-2 border-slate-300 rounded-lg font-bold text-slate-800 outline-none focus:border-sky-500 transition-all text-base"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && essayInput.trim()) {
                    handleConfirmCurrentAnswer();
                  }
                }}
              />
              <button
                type="button"
                disabled={!essayInput.trim() || selectedOption !== null}
                onClick={handleConfirmCurrentAnswer}
                className={`px-6 py-3 rounded-lg font-bold text-sm transition-all ${
                  essayInput.trim() && selectedOption === null
                    ? 'bg-indigo-600 text-white shadow-md hover:bg-indigo-700'
                    : 'bg-slate-200 text-slate-500 cursor-not-allowed'
                }`}
              >
                Xác nhận
              </button>
            </div>
            <p className="text-xs italic text-slate-600">
              Lưu ý: Đối với các môn toán và khoa học tự nhiên học sinh chỉ được nhập số và các loại dấu sau: . , ; / - + &gt; &lt; =
            </p>
          </div>
        )}
      </div>

      {selectedOption !== null && currentQuestion.explanation && (
        <div className="mt-3 p-3.5 bg-blue-50 border border-blue-100 text-blue-800 text-xs sm:text-sm rounded-2xl animate-in fade-in slide-in-from-bottom-2">
          <i className="fas fa-info-circle mr-2"></i>
          <b>Giải thích:</b> {currentQuestion.explanation}
        </div>
      )}

      {zoomedImage && (
        <div className="fixed inset-0 z-[200] bg-black/90 flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={() => setZoomedImage(null)}>
          <button className="absolute top-4 right-4 text-white/70 hover:text-white transition-colors" onClick={() => setZoomedImage(null)}>
            <i className="fas fa-times text-3xl"></i>
          </button>
          <img src={zoomedImage} alt="Zoomed" className="max-w-full max-h-full object-contain rounded-lg shadow-2xl animate-in zoom-in-95 duration-300" />
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
  const [quizStyle, setQuizStyle] = useState<'vioedu' | 'standard'>('vioedu');
  const [quizFile, setQuizFile] = useState<File | null>(null);
  const [grade, setGrade] = useState('Lớp 1');
  const [topic, setTopic] = useState('');
  const [videoStyle, setVideoStyle] = useState('Hoạt hình đơn giản');
  const [voiceName, setVoiceName] = useState<'Kore' | 'Puck' | 'Boy' | 'Girl'>('Kore');
  const [quizCount, setQuizCount] = useState(5);
  const [isProcessing, setIsProcessing] = useState(false);
  const [digitizeProgress, setDigitizeProgress] = useState<string>('');
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
  const [showCropper, setShowCropper] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [croppingContext, setCroppingContext] = useState<{ src: string, type: 'question' | 'option', qIdx: number, optIdx?: number } | null>(null);

  // State cho Merge PDF
  const [pdfFilesToMerge, setPdfFilesToMerge] = useState<File[]>([]);
  
  // State cho PDF to Word conversion
  const [pdfToWordFile, setPdfToWordFile] = useState<File | null>(null);
  const [pdfToWordTitle, setPdfToWordTitle] = useState('');
  const [isConvertingToWord, setIsConvertingToWord] = useState(false);
  const [pdfToWordMode, setPdfToWordMode] = useState<'image' | 'ocr'>('ocr'); // image hoặc ocr
  const [pdfToWordIncludeImages, setPdfToWordIncludeImages] = useState(true);
  const [pdfToWordFont, setPdfToWordFont] = useState('Calibri'); // Thêm state cho font
  const [isMerging, setIsMerging] = useState(false);

  // State cho Word / Excel sang PDF
  const [officeToPdfFile, setOfficeToPdfFile] = useState<File | null>(null);
  const [officeToPdfOrientation, setOfficeToPdfOrientation] = useState<'portrait' | 'landscape'>('portrait');
  const [isConvertingOfficeToPdf, setIsConvertingOfficeToPdf] = useState(false);
  const [officePreviewHtml, setOfficePreviewHtml] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const assistantMessagesEndRef = useRef<HTMLDivElement>(null);
  const forceStopRef = useRef(false);

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
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      const inferredMime =
        file.type ||
        (ext === 'pdf'
          ? 'application/pdf'
          : ext === 'png'
            ? 'image/png'
            : ext === 'jpg' || ext === 'jpeg'
              ? 'image/jpeg'
              : ext === 'webp'
                ? 'image/webp'
                : 'application/octet-stream');
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64Data = (reader.result as string).split(',')[1];
        setPendingAttachments(prev => [...prev, {
          type: inferredMime.startsWith('image/') ? 'image' : 'file',
          name: file.name,
          data: base64Data,
          mimeType: inferredMime
        }]);
      };
      reader.readAsDataURL(file);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeAttachment = (index: number) => {
    setPendingAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const handleExportQuizDocx = async () => {
    if (!result || !Array.isArray(result)) return;
    try {
      const payload = {
        header: `ĐỀ THI: ${topic || subject}`,
        subject: subject,
        grade: grade,
        questions: result.map(q => ({
          content: q.question,
          image: q.image,
          options: q.options,
          answer: q.answer,
          explanation: q.explanation
        }))
      };
      await exportWorksheetToDocx(payload, { skipImages: false });
    } catch (e: any) {
      const errorMsg = e?.message || String(e) || 'Lỗi không xác định';
      console.error('Lỗi xuất DOCX:', e);
      alert('Lỗi xuất bản DOCX: ' + errorMsg);
    }
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
    forceStopRef.current = false;

    const controller = new AbortController();
    const { signal } = controller;

    let prompt = '';

    try {
      if (useTemplateMode) {
        if (!templateFile || !planFile) {
          alert("Vui lòng tải lên cả File Mẫu và File Kế Hoạch!");
          setIsProcessing(false);
          return;
        }

        const { readContentFromFile } = await import('../fileReader');
        const templateText = await readContentFromFile(templateFile);
        const planText = await readContentFromFile(planFile);

        prompt = `
          Đóng vai trò là một chuyên gia sư phạm và trợ lý giáo viên đắc lực.
          Nhiệm vụ của bạn là soạn thảo một GIÁO ÁN CHI TIẾT (Kế hoạch bài dạy) dựa trên hai nguồn thông tin đầu vào sau đây:

          ${additionalPrompt ? `YÊU CẦU BỔ SUNG CỤ THỂ TỪ GIÁO VIÊN (ƯU TIÊN CAO NHẤT):
          "${additionalPrompt}"` : ''}

          1. CẤU TRÚC VÀ ĐỊNH DẠNG (FILE MẪU):
          """
          ${templateText}
          """

          2. NỘI DUNG VÀ YÊU CẦU CỤ THỂ (KẾ HOẠCH CỦA GIÁO VIÊN):
          """
          ${planText}
          """

          YÊU CẦU ĐẦU RA: Markdown, giữ nguyên đề mục, không dùng dấu *, phong cách sư phạm.
        `;
      } else {
        if (!topic.trim()) {
          setIsProcessing(false);
          return;
        }
        prompt = `Hãy soạn một GIÁO ÁN CHI TIẾT theo đúng quy định của CÔNG VĂN 2345/BGDĐT-GDTH cho cấp Tiểu học. Môn học: ${subject}. Lớp: ${grade}. Tên bài dạy: "${topic}". ${additionalPrompt ? `YÊU CẦU THÊM: ${additionalPrompt}` : ''} Trình bày Markdown.`;
      }

      let fullContent = '';
      const stream = geminiService.sendMessageStream(prompt, getFileParts(), signal);

      // watchdog for total hang
      const START_TIMEOUT_MS = 25000;
      const startWatchdog = setTimeout(() => {
        if (!fullContent) controller.abort();
      }, START_TIMEOUT_MS);

      try {
        for await (const chunk of stream) {
          if (forceStopRef.current) {
            controller.abort();
            throw new Error('Đã dừng yêu cầu.');
          }

          if (!fullContent) clearTimeout(startWatchdog); // Received first chunk

          fullContent += (chunk && chunk.text) ? chunk.text : '';
          setResult(fullContent);
        }
      } finally {
        clearTimeout(startWatchdog);
      }
    } catch (error: any) {
      if (error.message?.includes('dừng') || error.name === 'AbortError') {
        console.log("Lesson plan generation stopped by user or timeout.");
      } else {
        console.error("Lesson Plan Error:", error);
        alert(`Lỗi khi soạn giáo án: ${error.message || "Không thể kết nối"}`);
        if (error.message?.includes('404') || error.message?.includes('not found')) {
          localStorage.removeItem('preferred_gemini_model');
          localStorage.removeItem('preferred_gemini_version');
        }
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const generateGame = async () => {
    if (!topic.trim()) return;
    setIsProcessing(true);
    setResult(null);
    setAudioUrl(null);
    forceStopRef.current = false;

    const controller = new AbortController();
    const { signal } = controller;

    const prompt = `Hãy thiết kế 3 trò chơi khởi động (warm-up games) cho học sinh tiểu học. Chủ đề: "${topic}".`;

    try {
      let fullContent = '';
      const stream = geminiService.sendMessageStream(prompt, getFileParts(), signal);

      const START_TIMEOUT_MS = 20000;
      const startWatchdog = setTimeout(() => {
        if (!fullContent) controller.abort();
      }, START_TIMEOUT_MS);

      try {
        for await (const chunk of stream) {
          if (forceStopRef.current) {
            controller.abort();
            throw new Error('Đã dừng.');
          }
          if (!fullContent) clearTimeout(startWatchdog);

          fullContent += chunk.text;
          setResult(fullContent);
        }
      } finally {
        clearTimeout(startWatchdog);
      }
    } catch (error: any) {
      if (error.name !== 'AbortError' && !error.message?.includes('dừng')) {
        alert("Lỗi khi tạo trò chơi: " + error.message);
      }
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

    const controller = new AbortController();
    const { signal } = controller;

    try {
      // crossword usually doesn't stream in geminiService but let's assume we want to signal cancellation if the call is pending
      const crosswordData = await geminiService.generateCrossword(topic);
      if (forceStopRef.current) throw new Error("Đã dừng.");

      if (crosswordData && crosswordData.words && crosswordData.words.length > 0) {
        setResult(crosswordData);
      } else {
        throw new Error("AI không thể tạo ô chữ với chủ đề này.");
      }
    } catch (error: any) {
      if (!error.message?.includes('dừng')) {
        alert("Lỗi: " + error.message);
      }
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
      const batchSize = quizStyle === 'vioedu' ? 6 : 10;
      const totalBatches = Math.ceil(quizCount / batchSize);
      const allRawQuestions: any[] = [];

      for (let b = 0; b < totalBatches; b++) {
        if (forceStopRef.current) throw new Error("Đã dừng.");
        const countForBatch = Math.min(batchSize, quizCount - allRawQuestions.length);
        if (countForBatch <= 0) break;

        const vioeduInstruction = quizStyle === 'vioedu'
          ? `PHONG CÁCH ĐỀ THI: Chuẩn VioEdu / Violympic / Trạng Nguyên trực quan sinh động dành cho học sinh ${grade} môn ${subject}:
      1. KẾT HỢP 2 DẠNG CÂU HỎI:
         - Khoảng 70% câu hỏi là "Trắc nghiệm" (4 đáp án hiển thị dạng thẻ 2x2).
         - Khoảng 30% câu hỏi là "Tự luận" (Dạng điền số hoặc từ ngắn vào ô trống / dấu hỏi chấm "?", ví dụ: "Số cần điền vào dấu hỏi chấm là ...", "Hình trên có ... hình vuông", "5 + ? = 5", với "options": [] và "answer" chỉ là con số hoặc kết quả ngắn gọn như "7", "9", "0").
      2. BẮT BUỘC VẼ HÌNH MINH HỌA TRỰC QUAN BẰNG MÃ <svg> CHO HẦU HẾT CÁC CÂU HỎI:
         - Ở trường "image" của câu hỏi (hoặc trường "image" của từng đáp án trong "options"), hãy tự thiết kế mã <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 120" width="300" height="110">...</svg> màu sắc tươi sáng, rõ nét theo đúng các dạng bài VioEdu:
           + Dạng đếm đồ vật / con vật / quả cam / hộp quà.
           + Dạng nhận biết hình phẳng (hình tròn, hình vuông, hình tam giác, hình chữ nhật), robot ghép từ các hình học, hình nằm bên trong hình khác, hoặc tìm bóng của hình.
           + Dạng quy luật dãy hình màu sắc (hình tiếp theo ở dấu ? là hình gì - vẽ <svg> cho cả câu hỏi và 4 đáp án).
           + Dạng sơ đồ tách - gộp số, tia số / thanh đếm thêm (+2, +3...), phép tính bằng hình ảnh (🐶 = 1, 🐱 = 2), so sánh không cần tính (7 + 0 ⬜ 2 + 0), hoặc bất đẳng thức (5 + 2 < [?]).
         - Lưu ý: Mã <svg> phải viết trên 1 dòng gọn gàng, dùng dấu nháy đơn ' cho thuộc tính bên trong SVG (ví dụ: <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 280 100' width='260' height='95'>...</svg>) để không làm lỗi chuỗi JSON!`
          : `Soạn bộ câu hỏi trắc nghiệm bám sát chương trình chuẩn.`;

        const prompt = `Bạn là chuyên gia ra đề thi VioEdu & Giáo viên giỏi. Hãy soạn ${countForBatch} câu hỏi (Phần ${b + 1}/${totalBatches}) về chủ đề: "${topic}".
      - Môn: ${subject}
      - Lớp: ${grade}
      ${additionalPrompt ? `- Yêu cầu thêm: ${additionalPrompt}` : ''}
      ${vioeduInstruction}

      YÊU CẦU ĐỊNH DẠNG JSON CHÍNH XÁC:
      {
        "questions": [
          {
            "type": "Trắc nghiệm" | "Tự luận",
            "question": "Nội dung câu hỏi ngắn gọn, rõ ràng...",
            "image": "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 300 110' width='280' height='100'>...</svg> (hoặc để trống nếu hình nằm ở 4 đáp án)",
            "options": [
              {"text": "Nội dung đáp án A", "image": "<svg ...>...</svg> (hoặc chuỗi rỗng)"},
              {"text": "Nội dung đáp án B", "image": ""},
              {"text": "Nội dung đáp án C", "image": ""},
              {"text": "Nội dung đáp án D", "image": ""}
            ],
            "answer": "Đáp án đúng (VD: 'A' nếu là Trắc nghiệm, hoặc '7' nếu là Tự luận điền số)",
            "explanation": "Giải thích ngắn gọn, dễ hiểu cho học sinh..."
          }
        ]
      }`;

        const quizContent = await geminiService.generateExamQuestionsStructured(prompt);
        if (forceStopRef.current) throw new Error("Đã dừng.");

        let batchQuestions: any[] = [];
        if (quizContent && quizContent.questions && Array.isArray(quizContent.questions)) {
          batchQuestions = quizContent.questions;
        } else if (Array.isArray(quizContent)) {
          batchQuestions = quizContent;
        }
        allRawQuestions.push(...batchQuestions);
      }

      if (allRawQuestions.length > 0) {
        const formattedQuestions = allRawQuestions.map((q: any, i: number) => {
          const rawOpts = Array.isArray(q.options) ? q.options : [];
          const isEssayType =
            q.type === 'Tự luận' ||
            String(q.type || '').toLowerCase().includes('tự luận') ||
            String(q.type || '').toLowerCase().includes('điền') ||
            rawOpts.length === 0;
          const isMcq = !isEssayType;
          const normalizedOptions = isMcq
            ? rawOpts.map((opt: any) => {
                if (typeof opt === 'string' || typeof opt === 'number') return { text: String(opt), image: '' };
                return { text: String(opt?.text ?? opt?.label ?? ''), image: String(opt?.image ?? '') };
              })
            : [];
          return {
            id: q.id || `quiz-topic-${Date.now()}-${i}`,
            type: isMcq ? 'Trắc nghiệm' : 'Tự luận',
            question: (q.question || q.content || '').replace(/\[IMAGE\]/g, '').trim(),
            image: q.image || '',
            options: normalizedOptions,
            answer: String(q.answer ?? '').trim(),
            explanation: q.explanation || '',
          };
        }).filter((q: any) => q.question.trim() !== '' || q.image.trim() !== '');
        setResult(formattedQuestions);
      } else {
        throw new Error("AI không tạo được câu hỏi.");
      }
    } catch (error: any) {
      if (!error.message?.includes('dừng')) {
        alert("Lỗi tạo Quiz: " + error.message);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCropRequest = (src: string, type: 'question' | 'option', qIdx: number, optIdx?: number) => {
    setCroppingContext({ src, type, qIdx, optIdx });
    setShowCropper(true);
  };

  const handleCropComplete = (newImage: string) => {
    if (!croppingContext || !result) {
      setShowCropper(false);
      return;
    }
    const { type, qIdx, optIdx } = croppingContext;

    const updatedResult = result.map((q: any, idx: number) => {
      if (idx !== qIdx) return q;

      if (type === 'question') {
        return { ...q, image: newImage };
      } else if (type === 'option' && typeof optIdx === 'number') {
        const newOptions = (q.options || []).map((opt: any, oIdx: number) => {
          if (oIdx !== optIdx) return opt;
          if (typeof opt === 'string' || typeof opt === 'number') {
            return { text: String(opt), image: newImage };
          }
          return { ...opt, image: newImage };
        });
        return { ...q, options: newOptions };
      }
      return q;
    });

    setResult(updatedResult);
    setShowCropper(false);
    setCroppingContext(null);
  };

  const handleUpdateQuestion = (index: number, updatedQuestion: any) => {
    if (!result) return;
    setResult(prev => {
      if (!prev) return prev;
      const newResult = [...prev];
      newResult[index] = updatedQuestion;
      return newResult;
    });
  };

  const generateQuizFromUpload = async () => {
    setIsProcessing(true);
    setDigitizeProgress('Đang chuẩn bị đọc file đề thi...');
    setResult(null);
    setAudioUrl(null);
    forceStopRef.current = false;

    try {
      const fileParts = getFileParts();

      if (fileParts.length === 0 && quizFile) {
        const ext = quizFile.name.split('.').pop()?.toLowerCase() || '';
        const inferredMime =
          quizFile.type ||
          (ext === 'pdf' ? 'application/pdf' : 'image/jpeg');
        const reader = new FileReader();
        const base64Promise = new Promise<string>((resolve) => {
          reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
          reader.readAsDataURL(quizFile);
        });
        const base64Data = await base64Promise;
        fileParts.push({ inlineData: { data: base64Data, mimeType: inferredMime } });
      }

      if (fileParts.length === 0) {
        alert("Vui lòng chọn file đề thi (Ảnh hoặc PDF) trước khi bấm Tạo Quiz!");
        setIsProcessing(false);
        setDigitizeProgress('');
        return;
      }

      const formattedQuestions = await geminiService.digitizeExamFromFiles(fileParts, {
        onProgress: (msg) => setDigitizeProgress(msg),
        onPartialResult: (partialQs) => {
          if (partialQs.length > 0) {
            setResult(partialQs);
          }
        },
        shouldStop: () => forceStopRef.current,
      });

      if (formattedQuestions.length > 0) {
        setResult(formattedQuestions);
      } else {
        throw new Error("AI không trích xuất được câu hỏi nào từ file. Vui lòng kiểm tra lại file PDF/Ảnh.");
      }
    } catch (error: any) {
      console.error("Quiz Upload Error:", error);

      const errorMessage = error.message || "Lỗi không xác định";
      const normalizedError = errorMessage.toLowerCase();
      const isPayloadError = /payload|size|large/i.test(errorMessage);
      const isNetworkError = /failed to fetch|networkerror|network request failed|load failed|err_network|cors/i.test(errorMessage);
      const isQuotaError = /429|quota|resource_exhausted|rate limit|hết lượt|quá tải|bận/i.test(errorMessage);
      const isPdfInput = pendingAttachments.some(f => f.mimeType?.includes('pdf') || f.name.toLowerCase().endsWith('.pdf')) || quizFile?.type === 'application/pdf';

      // Kịch bản 1: Lỗi mạng
      if (isNetworkError) {
        alert(`⚠️ Không kết nối được tới Google AI (Failed to fetch).

Chi tiết: ${errorMessage}

✅ Cách xử lý nhanh:
- Kiểm tra Internet, VPN, proxy hoặc tường lửa mạng trường học
- Tắt extension chặn quảng cáo / chặn script nếu có
- Thử tải lại trang và tạo lại quiz sau 1 - 2 phút`);
      }
      // Kịch bản 2: Lỗi quota/rate-limit
      else if (isQuotaError) {
        const hasKey = !!localStorage.getItem('manually_entered_api_key');
        if (hasKey) {
          alert(`⚠️ LỖI GIỚI HẠN (429):\n\n${errorMessage}\n\nGoogle giới hạn số lượng yêu cầu miễn phí theo phút/ngày.\n\n👉 GIẢI PHÁP:\n1. Chờ theo thời gian thông báo ở trên rồi thử lại.\n2. Nếu vẫn lỗi sau nhiều lần, hãy thử dùng một API Key khác.`);
        } else {
          alert(`⚠️ Hệ thống AI đang quá tải (429 - hết lượt miễn phí chung).\n\nNội dung lỗi: ${errorMessage}\n\n👉 GIẢI PHÁP TỐT NHẤT: Thầy/Cô vào Cài đặt (🔑) và nhập API Key cá nhân để không bị giới hạn chung với người khác.`);
          try { window.dispatchEvent(new Event('openApiSettings')); } catch { }
        }
      }
      // Kịch bản 3: Lỗi do dung lượng quá lớn
      else if (isPayloadError) {
        if (window.confirm(`⚠️ Lỗi: Đề thi quá lớn để AI xử lý.

Nguyên nhân thường do file PDF có quá nhiều trang hoặc hình ảnh chất lượng quá cao.

✅ KHUYẾN NGHỊ: Thầy / Cô hãy dùng công cụ "Cắt PDF" để chia nhỏ file (thử với 1 - 2 trang) và tải lại.

Chuyển đến công cụ "Cắt PDF" ngay ? `)) {
          setActiveTab('pdf_tools');
          setResult(null);
          setPendingAttachments([]);
        }
      }
      // Kịch bản 4: Lỗi chung khi tải file PDF
      else if (isPdfInput || pendingAttachments.some(f => f.mimeType?.includes('pdf') || f.name.toLowerCase().endsWith('.pdf'))) {
        if (window.confirm(`⚠️ Gặp sự cố khi xử lý file PDF: ${errorMessage} 

Lưu ý: Nếu file PDF dài, AI có thể bị quá tải (429).

Thầy / Cô có muốn chuyển sang công cụ "Cắt PDF" để thử lại với một phần của file không ? `)) {
          setActiveTab('pdf_tools');
          setResult(null);
          setPendingAttachments([]);
        }
      } else {
        // Kịch bản 5: Lỗi chung khác
        if (normalizedError.includes("api key not valid") || normalizedError.includes("key invalid") || normalizedError.includes("400")) {
          alert(`⚠️ API Key không hợp lệ hoặc đã bị vô hiệu hóa.

Vui lòng vào Cài đặt (biểu tượng chìa khóa) để kiểm tra hoặc nhập Key mới.`);
          try { window.dispatchEvent(new Event('openApiSettings')); } catch { }
        } else if (errorMessage.includes('404') || normalizedError.includes('not found')) {
          alert("⚠️ Mô hình AI hiện tại không khả dụng (404). Hệ thống đã tự động đặt lại cấu hình. Vui lòng thử lại.");
          localStorage.removeItem('preferred_gemini_model');
          localStorage.removeItem('preferred_gemini_version');
        } else {
          alert(`⚠️ Lỗi tạo Quiz: ${errorMessage}`);
        }
      }

    } finally {
      setIsProcessing(false);
      setDigitizeProgress('');
    }
  };

  const handleShareQuiz = async () => {
    if (!result || !Array.isArray(result)) return;

    const compressDataImage = async (dataUrl: string): Promise<string> => {
      return new Promise((resolve) => {
        try {
          const img = new Image();
          img.onload = () => {
            const maxWidth = 180; // Giảm thêm kích thước để vừa Link Zalo/Messenger
            const scale = img.width > maxWidth ? (maxWidth / img.width) : 1;
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(img.width * scale));
            canvas.height = Math.max(1, Math.round(img.height * scale));
            const ctx = canvas.getContext('2d');
            if (!ctx) {
              resolve(dataUrl);
              return;
            }
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            resolve(canvas.toDataURL('image/jpeg', 0.15)); // Nén chất lượng xuống 15% (rất nhẹ)
          };
          img.onerror = () => resolve(dataUrl);
          img.src = dataUrl;
        } catch {
          resolve(dataUrl);
        }
      });
    };

    const normalizeSharedImage = async (value: unknown, forceStrip: boolean): Promise<string> => {
      if (forceStrip) return '';
      if (typeof value !== 'string') return '';
      const trimmed = value.trim();
      if (!trimmed) return '';
      if (!trimmed.startsWith('data:image')) {
        return trimmed.length > 500 ? '' : trimmed;
      }

      const compressed = await compressDataImage(trimmed);
      return compressed.length > 15000 ? '' : compressed; // Giới hạn 15KB/ảnh
    };

    try {
      const generatePayload = async (stripImages: boolean) => {
        let droppedCount = 0;
        const normalizedQuestions = await Promise.all(result.map(async (q: any) => {
          const originalQuestionImage = typeof q?.image === 'string' ? q.image.trim() : '';
          const finalQuestionImage = await normalizeSharedImage(originalQuestionImage, stripImages);

          if (originalQuestionImage && !finalQuestionImage) droppedCount++;

          const rawOptions = Array.isArray(q?.options) ? q.options : [];
          const normalizedOptions = await Promise.all(rawOptions.map(async (opt: any) => {
            const isSimple = typeof opt === 'string' || typeof opt === 'number';
            const optionText = isSimple ? String(opt) : (opt?.text || '');
            const optionImageRaw = isSimple ? '' : (typeof opt?.image === 'string' ? opt.image.trim() : '');
            const optionImageFinal = await normalizeSharedImage(optionImageRaw, stripImages);
            if (optionImageRaw && !optionImageFinal) droppedCount++;

            // Format nén: [text, image] thay vì {text, image}
            return [optionText, optionImageFinal];
          }));

          return ([
            q?.type === 'Tự luận' ? 2 : 1, // 1: Trắc nghiệm, 2: Tự luận
            q?.question || '',
            normalizedOptions,
            q?.answer || '',
            q?.explanation || '',
            finalQuestionImage
          ]);
        }));
        return { q: normalizedQuestions, dropped: droppedCount };
      };

      // 1. Thử tạo payload có ảnh (đã nén cực nhẹ)
      let payloadData = await generatePayload(false);
      let quizData = { s: subject, g: grade, q: payloadData.q };
      let json = JSON.stringify(quizData);

      const blobToBase64 = (blob: Blob): Promise<string> => {
        return new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const base64 = (reader.result as string).split(',')[1];
            resolve(base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''));
          };
          reader.readAsDataURL(blob);
        });
      };

      let finalCode = '';
      // @ts-ignore
      if (window.CompressionStream) {
        const stream = new Blob([json]).stream();
        // @ts-ignore
        const compressed = stream.pipeThrough(new CompressionStream('gzip'));
        const response = new Response(compressed);
        const blob = await response.blob();
        finalCode = 'v2_' + await blobToBase64(blob);
      } else {
        const blob = new Blob([json], { type: 'application/json' });
        finalCode = await blobToBase64(blob);
      }

      let url = `${window.location.origin}${window.location.pathname}?exam=${finalCode}`;

      // 2. Nếu Link vẫn quá dài (> 15000 ký tự), thử bỏ bớt ảnh cho đến khi vừa
      // Thay vì bỏ tất cả, ta sẽ thử giữ lại nhiều ảnh nhất có thể
      if (url.length > 15000) {
        let currentQuestions = [...payloadData.q];
        let hasImageQuestions = currentQuestions
          .map((q, idx) => ({ idx, hasImg: !!q[5] || (Array.isArray(q[2]) && q[2].some((o: any) => !!o[1])) }))
          .filter(item => item.hasImg);

        // Bỏ ảnh từng câu một (từ dưới lên) cho đến khi chiều dài link ổn
        while (url.length > 15000 && hasImageQuestions.length > 0) {
          const toStrip = hasImageQuestions.pop();
          if (toStrip) {
            const qIdx = toStrip.idx;
            const q = currentQuestions[qIdx];
            // Bỏ ảnh câu hỏi
            q[5] = '';
            // Bỏ ảnh các phương án
            if (Array.isArray(q[2])) {
              q[2] = q[2].map((o: any) => {
                if (Array.isArray(o)) return [o[0], ''];
                if (typeof o === 'object' && o !== null) return { ...o, image: '' };
                return o;
              });
            }

            quizData = { s: subject, g: grade, q: currentQuestions };
            json = JSON.stringify(quizData);
            // Re-encode
            // @ts-ignore
            if (window.CompressionStream) {
              const stream = new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'));
              finalCode = 'v2_' + await blobToBase64(await new Response(stream).blob());
            } else {
              finalCode = await blobToBase64(new Blob([json], { type: 'application/json' }));
            }
            url = `${window.location.origin}${window.location.pathname}?exam=${finalCode}`;
          }
        }

        // Nếu vẫn quá dài thì mới dùng bản không ảnh hoàn toàn
        if (url.length > 15000) {
          payloadData = await generatePayload(true);
          quizData = { s: subject, g: grade, q: payloadData.q };
          json = JSON.stringify(quizData);
          // @ts-ignore
          if (window.CompressionStream) {
            const stream = new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'));
            finalCode = 'v2_' + await blobToBase64(await new Response(stream).blob());
          } else {
            finalCode = await blobToBase64(new Blob([json], { type: 'application/json' }));
          }
          url = `${window.location.origin}${window.location.pathname}?exam=${finalCode}`;
        }

        if (url.length > 20000) {
          alert("❌ Nội dung đề thi quá lớn. Thầy/Cô hãy chia nhỏ file đề hoặc dùng 'Copy Mã Đề'.");
          return;
        }

        await navigator.clipboard.writeText(url);
        alert(`⚠️ Đề thi có nhiều ảnh, hệ thống đã TỰ ĐỘNG LƯỢC BỎ MỘT SỐ ẢNH để Link hoạt động được trên Zalo/Messenger.\n\n✅ Đã sao chép Link!\n\n💡 Mẹo: Để giữ đầy đủ ảnh sắc nét, Thầy/Cô hãy dùng nút "Copy Mã Đề" bên cạnh.`);
        return;
      }

      await navigator.clipboard.writeText(url);
      const note = payloadData.dropped > 0 ? `\n\n(Lưu ý: Đã lược bỏ ${payloadData.dropped} ảnh quá lớn để tối ưu Link)` : '';
      alert(`✅ Đã sao chép Link Quiz!${note} \n\nGửi ngay cho học sinh để luyện tập.`);
    } catch (e) {
      console.error("Share error", e);
      alert("Lỗi khi tạo link chia sẻ.");
    }
  };

  const handleCopyQuizCode = async () => {
    if (!result || !Array.isArray(result)) return;

    const compressDataImage = async (dataUrl: string): Promise<string> => {
      return new Promise((resolve) => {
        try {
          const img = new Image();
          img.onload = () => {
            const maxWidth = 480;
            const scale = img.width > maxWidth ? (maxWidth / img.width) : 1;
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(img.width * scale));
            canvas.height = Math.max(1, Math.round(img.height * scale));
            const ctx = canvas.getContext('2d');
            if (!ctx) { resolve(dataUrl); return; }
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            resolve(canvas.toDataURL('image/jpeg', 0.5));
          };
          img.onerror = () => resolve(dataUrl);
          img.src = dataUrl;
        } catch { resolve(dataUrl); }
      });
    };

    const normalizeSharedImage = async (value: unknown): Promise<string> => {
      if (typeof value !== 'string') return '';
      const trimmed = value.trim();
      if (!trimmed || !trimmed.startsWith('data:image')) return trimmed;
      return await compressDataImage(trimmed);
    };

    try {
      const normalizedQuestions = await Promise.all(result.map(async (q: any) => {
        const img = await normalizeSharedImage(q.image);
        const opts = await Promise.all((q.options || []).map(async (o: any) => ({ ...o, image: await normalizeSharedImage(o.image) })));
        const qType = q.type === 'Tự luận' ? 0 : 1;
        return [qType, q.question || q.content || '', opts, q.answer || '', q.explanation || '', img];
      }));

      const quizData = { s: subject, g: grade, q: normalizedQuestions };
      const json = JSON.stringify(quizData);
      let finalCode = '';

      const blobToBase64 = (blob: Blob): Promise<string> => new Promise(r => { const reader = new FileReader(); reader.onloadend = () => r((reader.result as string).split(',')[1].replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')); reader.readAsDataURL(blob); });

      // @ts-ignore
      if (window.CompressionStream) {
        const stream = new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'));
        finalCode = 'v2_' + await blobToBase64(await new Response(stream).blob());
      } else {
        finalCode = await blobToBase64(new Blob([json], { type: 'application/json' }));
      }

      await navigator.clipboard.writeText(finalCode);
      alert("✅ Đã sao chép MÃ ĐỀ THI!");
    } catch (e) {
      alert("Lỗi khi tạo mã đề.");
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

    const controller = new AbortController();
    const { signal } = controller;

    let fullContent = '';
    try {
      const stream = geminiService.sendMessageStream(messageContent, currentAttachments, signal);

      const INACTIVITY_TIMEOUT_MS = 40000;
      let timedOut = false;
      let inactivityTimer: any = null;
      const resetInactivity = () => {
        if (inactivityTimer) clearTimeout(inactivityTimer);
        inactivityTimer = setTimeout(() => {
          timedOut = true;
          controller.abort();
        }, INACTIVITY_TIMEOUT_MS);
      };
      resetInactivity();

      try {
        for await (const chunk of stream) {
          if (forceStopRef.current) {
            controller.abort();
            throw new Error('Đã dừng hội thoại.');
          }
          if (timedOut) throw new Error('AI không phản hồi, vui lòng thử lại.');
          resetInactivity();

          fullContent += chunk.text;
          setAssistantMessages(prev => prev.map(msg => msg.id === assistantId ? { ...msg, content: fullContent, isThinking: false } : msg));
        }
      } finally {
        if (inactivityTimer) clearTimeout(inactivityTimer);
      }
      setAssistantMessages(prev => prev.map(msg => msg.id === assistantId ? { ...msg, isStreaming: false } : msg));
    } catch (error: any) {
      const errorMessage = (error.message?.includes("dừng") || error.name === 'AbortError') ? "Đã dừng hội thoại." : (error.message || "Đã có lỗi xảy ra.");
      setAssistantMessages(prev => prev.map(msg => msg.id === assistantId ? { ...msg, content: fullContent ? fullContent + `\n\n⚠️ ${errorMessage} ` : `⚠️ Lỗi: ${errorMessage} `, isThinking: false, isStreaming: false } : msg));
    } finally {
      setIsAssistantLoading(false);
    }
  };

  const [isRecordingVideo, setIsRecordingVideo] = useState(false);
  const [videoScenes, setVideoScenes] = useState<Array<{
    sceneTitle: string;
    narration: string;
    visualPrompt: string;
    effect: string;
    motion: string;
    imageUrl: string;
  }>>([]);
  const [videoNarration, setVideoNarration] = useState<string>('');
  const [currentSceneIdx, setCurrentSceneIdx] = useState<number>(0);
  const videoCanvasRef = useRef<HTMLCanvasElement>(null);
  const sceneTimerRef = useRef<any>(null);

  const drawVideoSceneFrame = (
    ctx: CanvasRenderingContext2D,
    img: HTMLImageElement,
    nextImg: HTMLImageElement | null,
    crossfadeAlpha: number,
    sceneProgress: number,
    motion: string,
    effect: string,
    sceneBadge: string,
    subtitleText: string,
    overallProgress: number,
    tickMs: number
  ) => {
    ctx.clearRect(0, 0, 1280, 720);

    const drawTransformedImage = (image: HTMLImageElement, prog: number, mot: string, alpha: number) => {
      ctx.save();
      ctx.globalAlpha = alpha;
      let scale = 1.08;
      let tx = 0;
      let ty = 0;
      if (mot === 'zoom-in') {
        scale = 1.0 + prog * 0.18;
      } else if (mot === 'zoom-out') {
        scale = 1.18 - prog * 0.16;
      } else if (mot === 'pan-right') {
        scale = 1.14;
        tx = -45 + prog * 90;
      } else if (mot === 'pan-left') {
        scale = 1.14;
        tx = 45 - prog * 90;
      }
      const drawW = 1280 * scale;
      const drawH = 720 * scale;
      const offsetX = (1280 - drawW) / 2 + tx;
      const offsetY = (720 - drawH) / 2 + ty;
      ctx.drawImage(image, offsetX, offsetY, drawW, drawH);
      ctx.restore();
    };

    drawTransformedImage(img, sceneProgress, motion, 1);
    if (nextImg && crossfadeAlpha > 0) {
      drawTransformedImage(nextImg, 0, 'zoom-in', crossfadeAlpha);
    }

    // Hiệu ứng hoạt họa trực tiếp trên Canvas (mây trôi, đom đóm lấp lánh, lá bay, bong bóng...)
    ctx.save();
    const t = tickMs / 1000;
    for (let i = 0; i < 18; i++) {
      const px = ((i * 97 + t * (28 + (i % 4) * 12)) % 1320) - 20;
      const py = ((i * 67 + t * (effect === 'bubbles' ? -35 : 22)) % 680 + 680) % 680;
      if (effect === 'bubbles') {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
        ctx.fillStyle = 'rgba(224, 242, 254, 0.25)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(px, py, 8 + (i % 4) * 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else if (effect === 'leaves') {
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(t * 1.5 + i);
        ctx.fillStyle = i % 2 === 0 ? 'rgba(250, 204, 21, 0.7)' : 'rgba(74, 222, 128, 0.7)';
        ctx.beginPath();
        ctx.ellipse(0, 0, 10, 5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else {
        // Sparkles / ánh sáng hoạt hình
        const pulse = 0.35 + 0.55 * Math.abs(Math.sin(t * 2.5 + i));
        ctx.fillStyle = `rgba(254, 240, 138, ${pulse.toFixed(2)})`;
        ctx.beginPath();
        ctx.arc(px, py, 3 + (i % 3) * 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();

    // Nhãn phân cảnh góc trên bên trái
    if (sceneBadge) {
      ctx.save();
      ctx.font = 'bold 20px "Be Vietnam Pro", Arial, sans-serif';
      const badgeW = Math.min(560, ctx.measureText(sceneBadge).width + 36);
      ctx.fillStyle = 'rgba(15, 23, 42, 0.72)';
      ctx.fillRect(28, 24, badgeW, 42);
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(28, 24, 6, 42);
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'left';
      ctx.fillText(sceneBadge, 46, 51);
      ctx.restore();
    }

    // Phụ đề thuyết minh ở phía dưới
    if (subtitleText) {
      ctx.save();
      ctx.font = 'bold 26px "Be Vietnam Pro", Arial, sans-serif';
      const words = subtitleText.trim().split(/\s+/);
      const lines: string[] = [];
      let cur = '';
      for (const w of words) {
        const test = cur ? `${cur} ${w}` : w;
        if (ctx.measureText(test).width > 1080) {
          if (cur) lines.push(cur);
          cur = w;
        } else {
          cur = test;
        }
      }
      if (cur) lines.push(cur);
      const subLines = lines.slice(0, 3);
      const boxH = subLines.length * 38 + 26;
      const boxY = 720 - boxH - 26;

      ctx.fillStyle = 'rgba(15, 23, 42, 0.82)';
      ctx.fillRect(60, boxY, 1160, boxH);
      ctx.fillStyle = '#fef08a';
      ctx.textAlign = 'center';
      subLines.forEach((line, idx) => {
        ctx.fillText(line, 640, boxY + 38 + idx * 36);
      });
      ctx.restore();
    }

    // Thanh tiến trình video dưới đáy
    ctx.save();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.fillRect(0, 712, 1280, 8);
    ctx.fillStyle = '#a855f7';
    ctx.fillRect(0, 712, Math.max(0, Math.min(1280, 1280 * overallProgress)), 8);
    ctx.restore();
  };

  useEffect(() => {
    if (activeTab !== 'video' || !result) return;
    const canvas = videoCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const scenesToPlay = videoScenes.length > 0
      ? videoScenes
      : [{
          sceneTitle: 'Cảnh 1',
          narration: videoNarration || geminiService.stripCommandPrefix(topic),
          visualPrompt: '',
          effect: 'sparkles',
          motion: 'zoom-in',
          imageUrl: typeof result === 'string' ? result : ''
        }];

    let isCancelled = false;
    let rafId = 0;
    const loadedImages: HTMLImageElement[] = [];

    Promise.all(
      scenesToPlay.map(
        (sc) =>
          new Promise<HTMLImageElement>((resolve) => {
            const im = new Image();
            im.crossOrigin = 'anonymous';
            im.onload = () => resolve(im);
            im.onerror = () => resolve(im);
            im.src = sc.imageUrl || (typeof result === 'string' ? result : '');
          })
      )
    ).then((imgs) => {
      if (isCancelled) return;
      loadedImages.push(...imgs);
      const startTick = performance.now();
      const sceneDurationMs = 5500;
      const totalDurationMs = scenesToPlay.length * sceneDurationMs;

      const renderLoop = (now: number) => {
        if (isCancelled) return;
        const elapsed = now - startTick;

        let activeIdx = currentSceneIdx;
        let sceneProg = ((elapsed % sceneDurationMs) / sceneDurationMs);
        let overallProg = 0;
        let crossfade = 0;

        if (isPlaying) {
          if (audioRef.current && audioRef.current.duration && Number.isFinite(audioRef.current.duration) && audioRef.current.duration > 0) {
            overallProg = Math.min(1, audioRef.current.currentTime / audioRef.current.duration);
          } else {
            overallProg = (elapsed % totalDurationMs) / totalDurationMs;
          }
          const exactScene = overallProg * scenesToPlay.length;
          activeIdx = Math.min(scenesToPlay.length - 1, Math.floor(exactScene));
          sceneProg = exactScene - activeIdx;
          if (sceneProg > 0.85 && activeIdx < scenesToPlay.length - 1) {
            crossfade = (sceneProg - 0.85) / 0.15;
          }
          if (activeIdx !== currentSceneIdx) {
            setCurrentSceneIdx(activeIdx);
          }
        } else {
          overallProg = (activeIdx + 0.3) / scenesToPlay.length;
        }

        const sc = scenesToPlay[activeIdx] || scenesToPlay[0];
        const curImg = loadedImages[activeIdx] || loadedImages[0];
        const nxtImg = activeIdx + 1 < loadedImages.length ? loadedImages[activeIdx + 1] : null;

        if (curImg && curImg.complete && curImg.naturalWidth > 0) {
          drawVideoSceneFrame(
            ctx,
            curImg,
            nxtImg && nxtImg.complete && nxtImg.naturalWidth > 0 ? nxtImg : null,
            crossfade,
            sceneProg,
            sc.motion || 'zoom-in',
            sc.effect || 'sparkles',
            `🎬 ${sc.sceneTitle} (${activeIdx + 1}/${scenesToPlay.length})`,
            sc.narration,
            overallProg,
            now
          );
        }

        rafId = requestAnimationFrame(renderLoop);
      };

      rafId = requestAnimationFrame(renderLoop);
    });

    return () => {
      isCancelled = true;
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [activeTab, result, videoScenes, videoNarration, isPlaying, currentSceneIdx, topic]);

  const handlePlayWithVoiceover = () => {
    if (!result || !topic) return;

    if (isPlaying) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      if (sceneTimerRef.current) {
        clearInterval(sceneTimerRef.current);
        sceneTimerRef.current = null;
      }
      setIsPlaying(false);
      return;
    }

    const scriptToSpeak = (videoNarration || geminiService.stripCommandPrefix(topic)).trim();
    setCurrentSceneIdx(0);

    if (audioUrl && audioRef.current) {
      const isChildVoice = voiceName === 'Boy' || voiceName === 'Girl';
      const isMp3Fallback = audioUrl.startsWith('data:audio/mpeg');
      if (isChildVoice && isMp3Fallback) {
        (audioRef.current as any).preservesPitch = false;
        (audioRef.current as any).mozPreservesPitch = false;
        (audioRef.current as any).webkitPreservesPitch = false;
        audioRef.current.playbackRate = voiceName === 'Girl' ? 1.24 : 1.18;
      } else {
        (audioRef.current as any).preservesPitch = true;
        audioRef.current.playbackRate = 1.0;
      }
      audioRef.current.currentTime = 0;
      audioRef.current.play().then(() => {
        setIsPlaying(true);
      }).catch(() => {
        setIsPlaying(false);
      });
      return;
    }

    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      setIsPlaying(true);

      const utterance = new SpeechSynthesisUtterance(scriptToSpeak);
      utterance.lang = 'vi-VN';
      if (voiceName === 'Boy') {
        utterance.pitch = 1.45;
        utterance.rate = 1.02;
      } else if (voiceName === 'Girl') {
        utterance.pitch = 1.65;
        utterance.rate = 1.05;
      } else if (voiceName === 'Kore') {
        utterance.pitch = 0.85;
        utterance.rate = 0.92;
      } else {
        utterance.pitch = 1.05;
        utterance.rate = 0.92;
      }

      const voices = window.speechSynthesis.getVoices();
      const viVoices = voices.filter(v => v.lang.includes('vi'));
      if (viVoices.length > 0) {
        if (voiceName === 'Kore' || voiceName === 'Boy') {
          utterance.voice = viVoices.find(v => v.name.toLowerCase().includes('nam') || v.name.toLowerCase().includes('male') || v.name.toLowerCase().includes('minh') || v.name.toLowerCase().includes('khang')) || viVoices[0];
        } else {
          utterance.voice = viVoices.find(v => v.name.toLowerCase().includes('hoai') || v.name.toLowerCase().includes('my') || v.name.toLowerCase().includes('nu') || v.name.toLowerCase().includes('female') || v.name.toLowerCase().includes('google') || v.name.toLowerCase().includes('thao') || v.name.toLowerCase().includes('linh')) || viVoices[0];
        }
      }

      utterance.onend = () => {
        setIsPlaying(false);
      };
      utterance.onerror = () => {
        setIsPlaying(false);
      };
      window.speechSynthesis.speak(utterance);
    }
  };

  const handleDownloadVideoWebm = async () => {
    if (!result || isRecordingVideo) return;
    setIsRecordingVideo(true);
    try {
      const scenesToRecord = videoScenes.length > 0
        ? videoScenes
        : [{
            sceneTitle: 'Cảnh 1',
            narration: videoNarration || geminiService.stripCommandPrefix(topic),
            visualPrompt: '',
            effect: 'sparkles',
            motion: 'zoom-in',
            imageUrl: typeof result === 'string' ? result : ''
          }];

      const loadedImgs = await Promise.all(
        scenesToRecord.map(
          (sc) =>
            new Promise<HTMLImageElement>((resolve, reject) => {
              const img = new Image();
              img.crossOrigin = 'anonymous';
              img.onload = () => resolve(img);
              img.onerror = () => reject(new Error('Không thể tải hình ảnh phân cảnh.'));
              img.src = sc.imageUrl || (typeof result === 'string' ? result : '');
            })
        )
      );

      const canvas = document.createElement('canvas');
      canvas.width = 1280;
      canvas.height = 720;
      const ctx = canvas.getContext('2d');
      if (!ctx || typeof (canvas as any).captureStream !== 'function' || typeof MediaRecorder === 'undefined') {
        const link = document.createElement('a');
        link.href = scenesToRecord[0].imageUrl;
        link.download = `Video_Scene_${Date.now()}.png`;
        link.click();
        return;
      }

      const canvasStream: MediaStream = (canvas as any).captureStream(30);
      let combinedStream = canvasStream;
      let audioCtx: AudioContext | null = null;
      let audioSource: AudioBufferSourceNode | null = null;
      let totalDurationMs = scenesToRecord.length * 4500;

      // Nhúng luôn âm thanh giọng đọc thuyết minh AI vào file Video nếu có
      if (audioUrl) {
        try {
          const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
          if (AudioCtxClass) {
            const resp = await fetch(audioUrl);
            const arrBuf = await resp.arrayBuffer();
            audioCtx = new AudioCtxClass();
            const decodedAudio = await audioCtx.decodeAudioData(arrBuf);
            const dest = audioCtx.createMediaStreamDestination();
            audioSource = audioCtx.createBufferSource();
            audioSource.buffer = decodedAudio;
            audioSource.connect(dest);
            totalDurationMs = Math.max(4000, Math.round(decodedAudio.duration * 1000));
            combinedStream = new MediaStream([
              ...canvasStream.getVideoTracks(),
              ...dest.stream.getAudioTracks(),
            ]);
          }
        } catch (audioErr) {
          console.warn('Could not mux audio into video stream:', audioErr);
        }
      }

      const mimeTypes = [
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm',
        'video/mp4'
      ];
      const supportedMime = mimeTypes.find(m => MediaRecorder.isTypeSupported(m)) || '';
      const recorder = supportedMime ? new MediaRecorder(combinedStream, { mimeType: supportedMime }) : new MediaRecorder(combinedStream);
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };

      const donePromise = new Promise<Blob>((resolve) => {
        recorder.onstop = () => {
          resolve(new Blob(chunks, { type: supportedMime || 'video/webm' }));
        };
      });

      recorder.start();
      if (audioSource) {
        try { audioSource.start(0); } catch {}
      }

      const fps = 30;
      const totalFrames = Math.round((totalDurationMs / 1000) * fps);

      for (let f = 0; f <= totalFrames; f++) {
        const overallProg = f / totalFrames;
        const exactScene = overallProg * scenesToRecord.length;
        const sIdx = Math.min(scenesToRecord.length - 1, Math.floor(exactScene));
        const sProg = exactScene - sIdx;
        const crossfade = (sProg > 0.85 && sIdx < scenesToRecord.length - 1) ? (sProg - 0.85) / 0.15 : 0;
        const sc = scenesToRecord[sIdx];

        drawVideoSceneFrame(
          ctx,
          loadedImgs[sIdx],
          sIdx + 1 < loadedImgs.length ? loadedImgs[sIdx + 1] : null,
          crossfade,
          sProg,
          sc.motion || 'zoom-in',
          sc.effect || 'sparkles',
          `🎬 ${sc.sceneTitle} (${sIdx + 1}/${scenesToRecord.length})`,
          sc.narration,
          overallProg,
          f * (1000 / fps)
        );

        await new Promise(r => setTimeout(r, 1000 / fps));
      }

      recorder.stop();
      if (audioSource) {
        try { audioSource.stop(); } catch {}
      }
      if (audioCtx) {
        try { await audioCtx.close(); } catch {}
      }

      const videoBlob = await donePromise;
      const ext = (supportedMime && supportedMime.includes('mp4')) ? 'mp4' : 'webm';
      const url = URL.createObjectURL(videoBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Video_Bai_Giang_AI_${Date.now()}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e: any) {
      console.error('Export video error:', e);
      alert('Không thể xuất file video: ' + (e.message || 'Lỗi không xác định'));
    } finally {
      setIsRecordingVideo(false);
    }
  };

  const generateVideo = async () => {
    if (!topic.trim()) {
      alert("Vui lòng nhập yêu cầu hoặc chủ đề video!");
      return;
    }
    setIsProcessing(true);
    setResult(null);
    setVideoScenes([]);
    setVideoNarration('');
    setCurrentSceneIdx(0);
    setAudioUrl(null);
    setIsPlaying(false);

    try {
      // Bước 1: Tạo kịch bản phân cảnh (3 cảnh) + hình ảnh minh họa riêng cho từng cảnh
      // Lời thuyết minh (fullNarration) chỉ chứa nội dung kể chuyện/bài giảng cho học sinh, TUYỆT ĐỐI KHÔNG đọc lại câu lệnh của giáo viên!
      const storyboard = await geminiService.generateVideoStoryboard(topic, videoStyle);
      setVideoScenes(storyboard.scenes);
      setVideoNarration(storyboard.fullNarration);
      setResult(storyboard.scenes[0]?.imageUrl || '');

      // Bước 2: Tạo giọng đọc thuyết minh AI từ kịch bản bài giảng (KHÔNG đọc câu lệnh gốc topic)
      try {
        const speechUrl = await geminiService.generateSpeech(storyboard.fullNarration, voiceName);
        if (speechUrl) {
          setAudioUrl(speechUrl);
        }
      } catch (ttsErr) {
        console.warn('Video voiceover TTS fallback:', ttsErr);
      }
    } catch (error: any) {
      console.error("Video Gen Error:", error);
      alert(`⚠️ Không thể tạo video: ${error.message || "Lỗi kết nối"} `);
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
      const url = await geminiService.generateSpeech(topic, voiceName);
      if (url) {
        setAudioUrl(url);
        setResult("Đã tạo xong giọng đọc AI! Thầy Cô nhấn Phát để nghe hoặc Tải tệp về máy.");
      } else if ('speechSynthesis' in window) {
        setResult("Hệ thống đã sẵn sàng. Thầy Cô nhấn Phát để bắt đầu.");
      } else {
        alert("Trình duyệt và máy chủ hiện không hỗ trợ giọng nói.");
      }
    } catch (error: any) {
      console.error("TTS error:", error);
      if ('speechSynthesis' in window) {
        setResult("Hệ thống đã sẵn sàng. Thầy Cô nhấn Phát để bắt đầu.");
      } else {
        alert("Lỗi khi chuẩn bị giọng đọc: " + (error.message || "Lỗi không xác định"));
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownloadAudio = async () => {
    const textForSpeech = activeTab === 'video' ? (videoNarration || geminiService.stripCommandPrefix(topic)) : topic;
    if (!textForSpeech.trim()) return;
    let targetUrl = audioUrl;

    if (!targetUrl) {
      setIsProcessing(true);
      try {
        targetUrl = await geminiService.generateSpeech(textForSpeech, voiceName);
        if (targetUrl) {
          setAudioUrl(targetUrl);
        }
      } catch (e) {
        console.error("Download TTS error:", e);
      } finally {
        setIsProcessing(false);
      }
    }

    if (!targetUrl) {
      alert("⚠️ Không thể tạo tệp âm thanh để tải xuống. Vui lòng kiểm tra kết nối mạng hoặc cài đặt API Key.");
      return;
    }

    const ext = targetUrl.includes('audio/wav') ? 'wav' : 'mp3';
    const voiceLabelMap: Record<string, string> = {
      Kore: 'Giong_Nam',
      Puck: 'Giong_Nu',
      Boy: 'Giong_Be_Trai',
      Girl: 'Giong_Be_Gai',
    };
    const voiceLabel = voiceLabelMap[voiceName] || 'Giong_Doc';
    const link = document.createElement('a');
    link.href = targetUrl;
    link.download = `Giong_doc_AI_${voiceLabel}_${Date.now()}.${ext}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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
    setIsConverting(true);

    try {
      // @ts-ignore
      const { PDFDocument } = await import('https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/+esm');

      // Load PDF gốc bằng pdf-lib (giữ nguyên nội dung gốc, không render ảnh)
      const arrayBuffer = await pdfToolFile.arrayBuffer();
      const sourceDoc = await PDFDocument.load(arrayBuffer);
      
      // Tạo PDF mới
      const newPdf = await PDFDocument.create();

      const start = Math.max(1, splitRange.start);
      const end = Math.min(sourceDoc.getPageCount(), splitRange.end);

      if (start > end) {
        throw new Error("Phạm vi trang được chọn không hợp lệ (Trang bắt đầu lớn hơn trang kết thúc).");
      }

      // Copy trang gốc thay vì render ảnh (giữ nguyên text và format)
      const pageIndices = Array.from({ length: end - start + 1 }, (_, i) => start - 1 + i);
      const copiedPages = await newPdf.copyPages(sourceDoc, pageIndices);
      copiedPages.forEach(page => newPdf.addPage(page));

      if (newPdf.getPageCount() === 0) {
        throw new Error("Không thể tạo file PDF mới. File gốc có thể bị lỗi.");
      }

      const pdfBytes = await newPdf.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      const cleanFileName = pdfToolFile.name.replace('.pdf', '').replace(/[<>:"/\\|?*]/g, '');
      link.download = `Cat_Trang_${start}-${end}_${cleanFileName}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
      alert("✅ Đã cắt và tải xuống file PDF thành công! File PDF vẫn giữ nguyên nội dung text gốc, người dùng khác có thể đọc bình thường.");
    } catch (error: any) {
      console.error("PDF Split Error:", error);
      if (window.confirm(`Lỗi khi cắt file PDF: ${error.message} \n\nĐây là lỗi phức tạp. Thầy / Cô có muốn thử phương án cuối cùng là chuyển các trang này thành file ảnh (ZIP) không?`)) {
        await handlePdfToImages();
      }
    } finally {
      setIsConverting(false);
    }
  };

  const handlePdfToImages = async () => {
    if (!pdfToolFile) return;
    setIsConverting(true);

    try {
      // @ts-ignore
      const pdfjsLib = await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.379/+esm');
      // @ts-ignore
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.379/build/pdf.worker.min.mjs';
      // @ts-ignore
      const JSZip = (await import('https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm')).default;

      const arrayBuffer = await pdfToolFile.arrayBuffer();
      const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
      const zip = new JSZip();

      const start = Math.max(1, splitRange.start);
      const end = Math.min(pdf.numPages, splitRange.end);

      for (let i = start; i <= end; i++) {
        // Yield to main thread
        await new Promise(resolve => setTimeout(resolve, 10));

        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 2.0 });
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        await page.render({ canvasContext: context!, viewport: viewport }).promise;

        const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
        if (blob) {
          zip.file(`page_${i}.png`, blob);
        }
      }

      const content = await zip.generateAsync({ type: "blob" });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(content);
      link.download = `Anh_tu_PDF_${pdfToolFile.name.replace('.pdf', '')}.zip`;
      link.click();
      alert("✅ Đã chuyển đổi và tải xuống file ZIP thành công!");

    } catch (error: any) {
      console.error("PDF to Image Error:", error);
      alert("Lỗi: " + error.message);
    } finally {
      setIsConverting(false);
    }
  };

  const handleAddPdfToMerge = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      setPdfFilesToMerge(prev => [...prev, ...files]);
    }
    e.target.value = ''; // Reset input
  };

  const handleRemovePdfFromMerge = (index: number) => {
    setPdfFilesToMerge(prev => prev.filter((_, i) => i !== index));
  };

  const handleMergePdf = async () => {
    if (pdfFilesToMerge.length < 2) {
      alert('Vui lòng chọn ít nhất 2 file PDF để ghép!');
      return;
    }
    
    setIsMerging(true);
    try {
      // @ts-ignore
      const { PDFDocument } = await import('https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/+esm');

      // Tạo PDF mới
      const mergedPdf = await PDFDocument.create();

      // Ghép từng file PDF
      for (const file of pdfFilesToMerge) {
        const arrayBuffer = await file.arrayBuffer();
        const sourceDoc = await PDFDocument.load(arrayBuffer);
        
        // Copy tất cả trang từ file này
        const pages = sourceDoc.getPages();
        const pageIndices = Array.from({ length: pages.length }, (_, i) => i);
        const copiedPages = await mergedPdf.copyPages(sourceDoc, pageIndices);
        copiedPages.forEach(page => mergedPdf.addPage(page));
      }

      if (mergedPdf.getPageCount() === 0) {
        throw new Error("Không thể tạo file PDF ghép. Các file có thể bị lỗi.");
      }

      // Tải xuống file PDF ghép
      const pdfBytes = await mergedPdf.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `Ghep_${pdfFilesToMerge.length}_PDF_${Date.now()}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);

      alert(`✅ Đã ghép ${pdfFilesToMerge.length} file PDF và tải xuống thành công!`);
      setPdfFilesToMerge([]); // Reset danh sách
    } catch (error: any) {
      console.error("PDF Merge Error:", error);
      alert(`Lỗi khi ghép PDF: ${error.message}`);
    } finally {
      setIsMerging(false);
    }
  };

  const handlePdfToWord = async () => {
    if (!pdfToWordFile) {
      alert('Vui lòng chọn file PDF để chuyển đổi!');
      return;
    }

    setIsConvertingToWord(true);
    try {
      // Đọc file PDF thành base64
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve) => {
        reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
        reader.readAsDataURL(pdfToWordFile);
      });
      const base64Data = await base64Promise;

      // Tạo tên file Word
      const fileName = pdfToWordTitle.trim() 
        ? `${pdfToWordTitle.replace(/[<>:"/\\|?*]/g, '')}.docx`
        : pdfToWordFile.name.replace('.pdf', '.docx');

      // Chuyển đổi PDF sang Word theo mode được chọn
      if (pdfToWordMode === 'ocr') {
        console.log('[handlePdfToWord] Using OCR mode...');
        await convertPdfToWordWithOCR(base64Data, fileName, pdfToWordTitle || pdfToWordFile.name.replace('.pdf', ''), pdfToWordIncludeImages, pdfToWordFont);
        alert('✅ Chuyển đổi thành công! File Word với văn bản (OCR) đã được tải xuống.\n\n💡 Lưu ý: OCR có thể mất vài giây tùy vào số trang.');
      } else {
        console.log('[handlePdfToWord] Using image-only mode...');
        await convertPdfToWordDocx(base64Data, fileName, pdfToWordTitle || pdfToWordFile.name.replace('.pdf', ''), pdfToWordFont);
        alert('✅ Chuyển đổi thành công! File Word (chỉ ảnh) đã được tải xuống.');
      }
      
      setPdfToWordFile(null);
      setPdfToWordTitle('');
      setPdfToWordFont('Calibri'); // Reset font về mặc định
    } catch (error: any) {
      console.error('PDF to Word Error:', error);
      alert(`Lỗi chuyển đổi PDF sang Word:\n${error.message}`);
    } finally {
      setIsConvertingToWord(false);
    }
  };

  const buildOfficeDocumentHtml = async (file: File): Promise<string> => {
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    const baseStyle = `
      <style>
        .office-pdf-doc {
          font-family: 'Times New Roman', 'Be Vietnam Pro', serif;
          color: #0f172a;
          line-height: 1.6;
          font-size: 13pt;
          word-wrap: break-word;
        }
        .office-pdf-doc h1, .office-pdf-doc h2, .office-pdf-doc h3, .office-pdf-doc h4 {
          color: #1e293b;
          margin-top: 12px;
          margin-bottom: 8px;
          font-weight: bold;
        }
        .office-pdf-doc p {
          margin: 0 0 8px 0;
        }
        .office-pdf-doc table {
          width: 100%;
          border-collapse: collapse;
          margin: 12px 0;
          font-size: 10.5pt;
          page-break-inside: auto;
        }
        .office-pdf-doc tr {
          page-break-inside: avoid;
          page-break-after: auto;
        }
        .office-pdf-doc th, .office-pdf-doc td {
          border: 1px solid #94a3b8;
          padding: 6px 8px;
          text-align: left;
          vertical-align: top;
        }
        .office-pdf-doc th {
          background-color: #f1f5f9;
          font-weight: bold;
        }
        .office-pdf-doc img {
          max-width: 100%;
          height: auto;
          display: block;
          margin: 8px auto;
        }
        .excel-sheet-title {
          font-family: 'Be Vietnam Pro', Arial, sans-serif;
          font-size: 13pt;
          font-weight: 800;
          color: #0f766e;
          margin: 16px 0 8px 0;
          padding-bottom: 4px;
          border-bottom: 2px solid #99f6e4;
        }
      </style>
    `;

    if (ext === 'docx') {
      const mammothMod = await import('mammoth');
      const mammothLib = (mammothMod as any).default || mammothMod;
      const arrayBuffer = await file.arrayBuffer();
      const res = await mammothLib.convertToHtml({ arrayBuffer });
      if (!res.value || !res.value.trim()) {
        const raw = await mammothLib.extractRawText({ arrayBuffer });
        const paragraphs = (raw.value || '')
          .split(/\r?\n/)
          .map((line: string) => `<p>${line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') || '&nbsp;'}</p>`)
          .join('');
        return `${baseStyle}<div class="office-pdf-doc">${paragraphs}</div>`;
      }
      return `${baseStyle}<div class="office-pdf-doc">${res.value}</div>`;
    }

    if (ext === 'xlsx' || ext === 'xls' || ext === 'csv') {
      const XLSX = await import('xlsx');
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      let sheetsHtml = '';

      workbook.SheetNames.forEach((sheetName, idx) => {
        const worksheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1, defval: '', raw: false });
        const nonEmptyRows = rows.filter(r => Array.isArray(r) && r.some(cell => String(cell ?? '').trim() !== ''));
        if (nonEmptyRows.length === 0) return;

        let firstCol = Infinity;
        let lastCol = 0;
        nonEmptyRows.forEach(r => {
          r.forEach((cell, cIdx) => {
            if (String(cell ?? '').trim() !== '') {
              if (cIdx < firstCol) firstCol = cIdx;
              if (cIdx > lastCol) lastCol = cIdx;
            }
          });
        });
        if (firstCol === Infinity) {
          firstCol = 0;
          lastCol = 0;
        }

        const tableRows = nonEmptyRows
          .map((row, rIdx) => {
            const tag = rIdx === 0 ? 'th' : 'td';
            const cells: string[] = [];
            for (let c = firstCol; c <= lastCol; c++) {
              const val = String(row[c] ?? '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');
              cells.push(`<${tag}>${val}</${tag}>`);
            }
            return `<tr>${cells.join('')}</tr>`;
          })
          .join('');

        sheetsHtml += `
          <div style="${idx > 0 ? 'page-break-before: always;' : ''}">
            <div class="excel-sheet-title">Sheet: ${sheetName}</div>
            <table>${tableRows}</table>
          </div>
        `;
      });

      if (!sheetsHtml) {
        throw new Error('File Excel không có dữ liệu để chuyển đổi.');
      }
      return `${baseStyle}<div class="office-pdf-doc">${sheetsHtml}</div>`;
    }

    if (ext === 'txt' || ext === 'md' || ext === 'doc') {
      const text = await file.text();
      const cleanLines = text
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
        .split(/\r?\n/)
        .map(line => `<p>${line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') || '&nbsp;'}</p>`)
        .join('');
      return `${baseStyle}<div class="office-pdf-doc">${cleanLines}</div>`;
    }

    throw new Error('Định dạng file chưa được hỗ trợ. Vui lòng chọn file Word (.docx) hoặc Excel (.xlsx, .xls, .csv).');
  };

  const handleOfficeToPdfFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    if (ext === 'doc') {
      alert('💡 Lưu ý: File .doc (Word 97-2003 cũ) có thể hiển thị thiếu định dạng. Để giữ nguyên 100% bảng biểu và hình ảnh, khuyến nghị lưu file dưới dạng .docx trước khi chuyển đổi.');
    }
    setOfficeToPdfFile(file);
    if (ext === 'xlsx' || ext === 'xls' || ext === 'csv') {
      setOfficeToPdfOrientation('landscape');
    } else {
      setOfficeToPdfOrientation('portrait');
    }

    try {
      const html = await buildOfficeDocumentHtml(file);
      setOfficePreviewHtml(html);
      setResult(html);
    } catch (err: any) {
      console.error('Preview Office file error:', err);
      setOfficePreviewHtml(null);
    }
  };

  const handleConvertOfficeToPdf = async () => {
    if (!officeToPdfFile) {
      alert('Vui lòng chọn file Word hoặc Excel cần chuyển sang PDF!');
      return;
    }

    setIsConvertingOfficeToPdf(true);
    try {
      const htmlContent = officePreviewHtml || (await buildOfficeDocumentHtml(officeToPdfFile));
      setOfficePreviewHtml(htmlContent);
      setResult(htmlContent);

      const isLandscape = officeToPdfOrientation === 'landscape';
      const pageW = isLandscape ? 1754 : 1240;
      const pageH = isLandscape ? 1240 : 1754;
      const pdfW = isLandscape ? 841.89 : 595.28;
      const pdfH = isLandscape ? 595.28 : 841.89;
      const margin = 56;
      const bottomLimit = pageH - margin - 24;
      const contentW = pageW - margin * 2;
      const fontFamily = "'Be Vietnam Pro', 'Times New Roman', Arial, sans-serif";

      const pages: HTMLCanvasElement[] = [];
      let currentCanvas = document.createElement('canvas');
      let ctx = currentCanvas.getContext('2d')!;
      let cursorY = margin;

      const startNewPage = () => {
        const c = document.createElement('canvas');
        c.width = pageW;
        c.height = pageH;
        const context = c.getContext('2d')!;
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, pageW, pageH);
        pages.push(c);
        currentCanvas = c;
        ctx = context;
        cursorY = margin;
      };

      startNewPage();

      const wrapText = (text: string, maxWidth: number, font: string): string[] => {
        ctx.font = font;
        const rawParagraphs = String(text ?? '').replace(/\r/g, '').split('\n');
        const lines: string[] = [];
        const safeMax = Math.max(24, maxWidth);

        for (const para of rawParagraphs) {
          const trimmed = para.trim();
          if (!trimmed) {
            lines.push('');
            continue;
          }
          const words = trimmed.split(/\s+/);
          let currentLine = '';

          for (const word of words) {
            const testLine = currentLine ? `${currentLine} ${word}` : word;
            if (ctx.measureText(testLine).width <= safeMax) {
              currentLine = testLine;
            } else {
              if (currentLine) {
                lines.push(currentLine);
                currentLine = '';
              }
              if (ctx.measureText(word).width <= safeMax) {
                currentLine = word;
              } else {
                let chunk = '';
                for (const ch of word) {
                  if (ctx.measureText(chunk + ch).width <= safeMax) {
                    chunk += ch;
                  } else {
                    if (chunk) lines.push(chunk);
                    chunk = ch;
                  }
                }
                currentLine = chunk;
              }
            }
          }
          if (currentLine) lines.push(currentLine);
        }
        return lines.length > 0 ? lines : [''];
      };

      const drawTableRows = (rows: string[][], sheetTitle?: string) => {
        const nonEmpty = rows.filter(r => Array.isArray(r) && r.some(cell => String(cell ?? '').trim() !== ''));
        if (nonEmpty.length === 0) return;

        let firstCol = Infinity;
        let lastCol = 0;
        nonEmpty.forEach(r => {
          r.forEach((cell, idx) => {
            if (String(cell ?? '').trim() !== '') {
              if (idx < firstCol) firstCol = idx;
              if (idx > lastCol) lastCol = idx;
            }
          });
        });
        if (firstCol === Infinity) return;

        const trimmedRows = nonEmpty.map(r => r.slice(firstCol, lastCol + 1).map(c => String(c ?? '').trim()));
        const numCols = Math.max(1, lastCol - firstCol + 1);

        if (sheetTitle) {
          const titleFont = `bold 20px ${fontFamily}`;
          if (cursorY + 40 > bottomLimit) startNewPage();
          ctx.font = titleFont;
          ctx.fillStyle = '#0f766e';
          ctx.fillText(sheetTitle, margin, cursorY + 20);
          cursorY += 32;
        }

        // Compute smart column widths
        const weights = new Array(numCols).fill(4);
        trimmedRows.forEach(r => {
          const nonBlankCount = r.filter(c => c !== '').length;
          if (nonBlankCount <= 1 && numCols > 2) return; // Ignore full-width title rows when sizing columns
          r.forEach((cell, cIdx) => {
            const len = Math.min(60, Math.max(4, cell.length));
            if (len > weights[cIdx]) weights[cIdx] = len;
          });
        });
        const adjustedWeights = weights.map(w => Math.max(45, Math.pow(w, 0.65) * 28));
        const totalWeight = adjustedWeights.reduce((a, b) => a + b, 0) || 1;
        const colWidths = adjustedWeights.map(w => (w / totalWeight) * contentW);

        const fontSize = numCols > 10 ? 12 : numCols > 7 ? 13 : 15;
        const lineHeight = Math.round(fontSize * 1.4);
        const cellPadX = numCols > 8 ? 5 : 8;
        const cellPadY = 6;

        let headerRow: string[] | null = null;
        let hasPassedHeader = false;

        const renderSingleRow = (row: string[], isHeader: boolean, rowIdx: number) => {
          const font = `${isHeader ? 'bold ' : ''}${fontSize}px ${fontFamily}`;
          const cellLines = row.map((cell, cIdx) => wrapText(cell, colWidths[cIdx] - cellPadX * 2, font));
          const maxLines = Math.max(1, ...cellLines.map(lines => lines.length));
          const rowH = maxLines * lineHeight + cellPadY * 2;

          if (cursorY + rowH > bottomLimit) {
            startNewPage();
            if (!isHeader && headerRow) {
              renderSingleRow(headerRow, true, 0);
            }
          }

          let curX = margin;
          for (let c = 0; c < numCols; c++) {
            const cw = colWidths[c];
            ctx.fillStyle = isHeader ? '#e2e8f0' : rowIdx % 2 === 1 ? '#f8fafc' : '#ffffff';
            ctx.fillRect(curX, cursorY, cw, rowH);
            ctx.strokeStyle = '#94a3b8';
            ctx.lineWidth = 1;
            ctx.strokeRect(curX, cursorY, cw, rowH);

            ctx.font = font;
            ctx.fillStyle = '#0f172a';
            const lines = cellLines[c] || [''];
            lines.forEach((line, lIdx) => {
              ctx.fillText(line, curX + cellPadX, cursorY + cellPadY + (lIdx + 0.82) * lineHeight);
            });
            curX += cw;
          }
          cursorY += rowH;
        };

        trimmedRows.forEach((row, rIdx) => {
          const nonBlankCells = row.filter(c => c !== '');
          if (!hasPassedHeader && nonBlankCells.length === 1 && numCols > 2) {
            // Title/banner row above the table
            const bannerFont = `bold ${fontSize + 3}px ${fontFamily}`;
            const lines = wrapText(nonBlankCells[0], contentW - 12, bannerFont);
            const bannerH = lines.length * (lineHeight + 4) + 10;
            if (cursorY + bannerH > bottomLimit) startNewPage();
            ctx.font = bannerFont;
            ctx.fillStyle = '#1e293b';
            lines.forEach((l, lIdx) => {
              ctx.fillText(l, margin, cursorY + (lIdx + 0.85) * (lineHeight + 4));
            });
            cursorY += bannerH;
            return;
          }

          if (!hasPassedHeader) {
            hasPassedHeader = true;
            headerRow = row;
            renderSingleRow(row, true, rIdx);
          } else {
            renderSingleRow(row, false, rIdx);
          }
        });

        cursorY += 20;
      };

      const ext = officeToPdfFile.name.split('.').pop()?.toLowerCase() || '';
      if (ext === 'xlsx' || ext === 'xls' || ext === 'csv') {
        const XLSX = await import('xlsx');
        const arrayBuffer = await officeToPdfFile.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });

        workbook.SheetNames.forEach((sheetName, sIdx) => {
          const ws = workbook.Sheets[sheetName];
          const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: '', raw: false });
          const nonEmpty = rows.filter(r => Array.isArray(r) && r.some(cell => String(cell ?? '').trim() !== ''));
          if (nonEmpty.length === 0) return;
          if (sIdx > 0 && cursorY > margin + 20) {
            startNewPage();
          }
          drawTableRows(
            nonEmpty.map(r => r.map(c => String(c ?? ''))),
            workbook.SheetNames.length > 1 ? `Bảng: ${sheetName}` : undefined
          );
        });
      } else {
        // Parse HTML from Word (.docx / .txt / .doc)
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlContent, 'text/html');
        const root = doc.querySelector('.office-pdf-doc') || doc.body;

        const loadImageElement = (src: string): Promise<HTMLImageElement | null> =>
          new Promise(resolve => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => resolve(img);
            img.onerror = () => resolve(null);
            img.src = src;
          });

        const renderNode = async (node: Node) => {
          if (node.nodeType === Node.TEXT_NODE) {
            const txt = (node.textContent || '').trim();
            if (!txt) return;
            const font = `17px ${fontFamily}`;
            const lines = wrapText(txt, contentW, font);
            for (const line of lines) {
              if (cursorY + 26 > bottomLimit) startNewPage();
              ctx.font = font;
              ctx.fillStyle = '#0f172a';
              ctx.fillText(line, margin, cursorY + 20);
              cursorY += 26;
            }
            return;
          }

          if (node.nodeType !== Node.ELEMENT_NODE) return;
          const el = node as HTMLElement;
          const tag = el.tagName.toUpperCase();

          if (tag === 'STYLE' || tag === 'SCRIPT') return;

          if (tag === 'TABLE') {
            const trs = Array.from(el.querySelectorAll('tr'));
            const tableMatrix = trs.map(tr =>
              Array.from(tr.querySelectorAll('th, td')).map(cell => (cell.textContent || '').trim())
            );
            drawTableRows(tableMatrix);
            return;
          }

          if (tag === 'IMG') {
            const src = el.getAttribute('src') || '';
            if (src) {
              const img = await loadImageElement(src);
              if (img && img.naturalWidth > 0 && img.naturalHeight > 0) {
                const maxW = contentW * 0.85;
                const maxH = (pageH - margin * 2) * 0.55;
                const scale = Math.min(1, maxW / img.naturalWidth, maxH / img.naturalHeight);
                const drawW = Math.round(img.naturalWidth * scale);
                const drawH = Math.round(img.naturalHeight * scale);
                if (cursorY + drawH + 16 > bottomLimit) startNewPage();
                const drawX = margin + Math.round((contentW - drawW) / 2);
                ctx.drawImage(img, drawX, cursorY + 6, drawW, drawH);
                cursorY += drawH + 18;
              }
            }
            return;
          }

          if (/^H[1-6]$/.test(tag)) {
            const txt = (el.textContent || '').trim();
            if (!txt) return;
            const level = parseInt(tag.substring(1), 10) || 2;
            const fSize = level === 1 ? 24 : level === 2 ? 21 : 19;
            const lh = Math.round(fSize * 1.4);
            const font = `bold ${fSize}px ${fontFamily}`;
            const lines = wrapText(txt, contentW, font);
            cursorY += 8;
            for (const line of lines) {
              if (cursorY + lh > bottomLimit) startNewPage();
              ctx.font = font;
              ctx.fillStyle = '#0f172a';
              ctx.fillText(line, margin, cursorY + Math.round(fSize * 0.9));
              cursorY += lh;
            }
            cursorY += 6;
            return;
          }

          if (tag === 'P' || tag === 'LI') {
            const imgs = Array.from(el.querySelectorAll('img'));
            for (const imgEl of imgs) {
              await renderNode(imgEl);
            }
            const rawText = (el.textContent || '').trim();
            if (!rawText) {
              cursorY += 8;
              return;
            }
            const prefix = tag === 'LI' ? '• ' : '';
            const isBold =
              el.querySelector('strong, b') !== null &&
              (el.querySelector('strong, b')?.textContent || '').trim().length >= rawText.length * 0.8;
            const fSize = 17;
            const lh = 26;
            const font = `${isBold ? 'bold ' : ''}${fSize}px ${fontFamily}`;
            const lines = wrapText(prefix + rawText, contentW, font);
            for (const line of lines) {
              if (cursorY + lh > bottomLimit) startNewPage();
              ctx.font = font;
              ctx.fillStyle = '#0f172a';
              ctx.fillText(line, margin, cursorY + 20);
              cursorY += lh;
            }
            cursorY += 6;
            return;
          }

          const children = Array.from(el.childNodes);
          for (const child of children) {
            await renderNode(child);
          }
        };

        const children = Array.from(root.childNodes);
        for (const child of children) {
          await renderNode(child);
        }
      }

      // Draw page numbers on footer
      const totalPages = pages.length;
      pages.forEach((canvasPage, idx) => {
        const pCtx = canvasPage.getContext('2d')!;
        pCtx.font = `12px ${fontFamily}`;
        pCtx.fillStyle = '#64748b';
        const footerText = `Trang ${idx + 1} / ${totalPages}`;
        const tw = pCtx.measureText(footerText).width;
        pCtx.fillText(footerText, Math.round((pageW - tw) / 2), pageH - 22);
      });

      // Assemble multi-page PDF using pdf-lib
      // @ts-ignore
      const { PDFDocument } = await import('https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/+esm');
      const pdfDoc = await PDFDocument.create();

      for (const canvasPage of pages) {
        const dataUrl = canvasPage.toDataURL('image/jpeg', 0.92);
        const base64 = dataUrl.split(',')[1];
        const binaryStr = atob(base64);
        const imgBytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) {
          imgBytes[i] = binaryStr.charCodeAt(i);
        }
        const jpgImage = await pdfDoc.embedJpg(imgBytes);
        const page = pdfDoc.addPage([pdfW, pdfH]);
        page.drawImage(jpgImage, {
          x: 0,
          y: 0,
          width: pdfW,
          height: pdfH
        });
      }

      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const baseName =
        officeToPdfFile.name
          .replace(/\.[^/.]+$/, '')
          .replace(/[<>:"/\\|?*]/g, '_')
          .trim() || 'Tai_lieu';

      const link = document.createElement('a');
      link.href = url;
      link.download = `${baseName}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 10000);

      alert(`✅ Đã chuyển đổi "${officeToPdfFile.name}" sang PDF (${totalPages} trang) và tải về thành công!`);
    } catch (error: any) {
      console.error('Office to PDF Error:', error);
      alert(`Lỗi khi chuyển sang PDF: ${error.message || 'Không xác định'}`);
    } finally {
      setIsConvertingOfficeToPdf(false);
    }
  };

  const handlePrintOfficeToPdf = async () => {
    if (!officeToPdfFile) return;
    try {
      const htmlContent = officePreviewHtml || (await buildOfficeDocumentHtml(officeToPdfFile));
      const printWin = window.open('', '_blank');
      if (!printWin) {
        alert('Vui lòng cho phép trình duyệt mở cửa sổ bật lên (Pop-up) để in / lưu PDF!');
        return;
      }
      const baseName = officeToPdfFile.name.replace(/\.[^/.]+$/, '');
      printWin.document.write(`
        <!DOCTYPE html>
        <html lang="vi">
          <head>
            <meta charset="UTF-8" />
            <title>${baseName}</title>
            <style>
              @page { size: A4 ${officeToPdfOrientation}; margin: 12mm; }
              body { margin: 0; padding: 16px; background: #fff; color: #0f172a; }
            </style>
          </head>
          <body>
            ${htmlContent}
            <script>
              window.onload = function() {
                setTimeout(function() { window.print(); }, 400);
              };
            </script>
          </body>
        </html>
      `);
      printWin.document.close();
    } catch (error: any) {
      alert('Không thể mở bản in PDF: ' + (error.message || 'Lỗi không xác định'));
    }
  };

  return (
    <div className="h-full flex flex-col space-y-4 sm:space-y-6 animate-in fade-in duration-500 overflow-y-auto lg:overflow-hidden p-3 sm:p-0">
      {showCropper && <ImageCropper onClose={() => { setShowCropper(false); setCroppingContext(null); }} initialSrc={croppingContext?.src} onCropComplete={croppingContext ? handleCropComplete : undefined} />}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-800 tracking-tight">Kho Tiện ích Sáng tạo</h2>
          <p className="text-xs sm:text-sm text-slate-500 font-medium">Biến bài giảng trở nên sinh động và cuốn hút hơn.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2 bg-white p-1.5 sm:p-1 rounded-2xl shadow-sm h-fit shrink-0">
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
          <i className="fas fa-toolbox"></i>
          <span>Công cụ PDF</span>
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
        <div className="lg:flex-1 grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 lg:overflow-hidden lg:min-h-0">
          <div className={`lg:col-span-1 bg-white p-4 sm:p-6 rounded-3xl sm:rounded-[32px] border border-slate-200 shadow-sm space-y-4 sm:space-y-5 flex-col lg:h-full lg:overflow-y-auto custom-scrollbar ${activeAssistant ? 'hidden lg:flex' : 'flex'}`}>
            <h3 className="text-sm font-black uppercase tracking-widest text-slate-800">Chọn Trợ lý Thông minh</h3>
            <div className="space-y-3">
              {ASSISTANT_PERSONAS.map(persona => (
                <button
                  key={persona.id}
                  onClick={() => setActiveAssistant(persona)}
                  className={`w-full p-4 rounded-2xl border text-left transition-all flex items-start space-x-4 ${activeAssistant?.id === persona.id ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg' : 'bg-slate-50 border-slate-100 hover:border-indigo-200'}`}
                >
                  <div className={`w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center ${activeAssistant?.id === persona.id ? 'bg-white/20' : 'bg-white'}`}>
                    <i className={`fas ${persona.icon} ${activeAssistant?.id === persona.id ? 'text-white' : 'text-indigo-600'} `}></i>
                  </div>
                  <div>
                    <p className="font-black text-sm">{persona.name}</p>
                    <p className={`text-xs mt-1 ${activeAssistant?.id === persona.id ? 'text-indigo-200' : 'text-slate-500'}`}>{persona.description}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
          <div className={`lg:col-span-2 bg-white rounded-3xl sm:rounded-[40px] border border-slate-200 shadow-sm overflow-hidden flex-col min-h-[460px] lg:min-h-0 lg:h-full ${activeAssistant ? 'flex h-[calc(100dvh-230px)]' : 'hidden lg:flex'}`}>
            {activeAssistant ? (
              <>
                <div className="px-4 sm:px-8 py-3 sm:py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest truncate mr-2">Trò chuyện với: {activeAssistant.name}</span>
                  <button onClick={() => setActiveAssistant(null)} className="text-xs font-bold text-indigo-600 lg:text-slate-400 hover:text-rose-500 shrink-0"><i className="fas fa-arrow-left mr-1 lg:hidden"></i>Đổi trợ lý</button>
                </div>
                <div className="flex-1 overflow-y-auto p-3 sm:p-6 custom-scrollbar">
                  {assistantMessages.map(msg => <ChatMessage key={msg.id} message={msg} />)}
                  <div ref={assistantMessagesEndRef} />
                </div>
                <div className="p-3 sm:p-6 bg-white border-t border-slate-100">
                  {pendingAttachments.length > 0 && (
                    <div className="flex gap-2 mb-3 overflow-x-auto pb-2 custom-scrollbar">
                      {pendingAttachments.map((att, idx) => (
                        <div key={idx} className="relative shrink-0 group">
                          {att.type === 'image' ? (
                            <img src={`data:${att.mimeType};base64,${att.data}`} className="h-16 w-auto rounded-lg border border-slate-200 shadow-sm object-cover" alt={att.name} />
                          ) : (
                            <div className="h-16 w-16 flex flex-col items-center justify-center bg-slate-50 rounded-lg border border-slate-200 p-1">
                              <i className={`fas ${att.mimeType?.includes('pdf') ? 'fa-file-pdf text-rose-500' : 'fa-file-lines text-blue-500'} text-xl mb-1`}></i>
                              <span className="text-[8px] text-slate-500 truncate w-full text-center">{att.name}</span>
                            </div>
                          )}
                          <button onClick={() => removeAttachment(idx)} className="absolute -top-2 -right-2 bg-rose-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px] shadow-md hover:bg-rose-600"><i className="fas fa-times"></i></button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="relative flex items-end bg-slate-50 border-2 border-slate-100 rounded-[24px] sm:rounded-[28px] p-1.5 sm:p-2 focus-within:border-indigo-400 focus-within:bg-white transition-all">
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="w-10 h-10 sm:h-12 flex items-center justify-center text-slate-400 hover:text-indigo-600 transition-colors rounded-xl hover:bg-indigo-50 mr-1"
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
                      className="flex-1 bg-transparent border-none focus:ring-0 py-2.5 sm:py-3 px-2 text-[14px] font-medium text-slate-700 resize-none max-h-[160px] sm:max-h-[200px]"
                      rows={1}
                    />
                    <button
                      onClick={handleSendAssistantMessage}
                      disabled={isAssistantLoading}
                      className={`w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center rounded-2xl transition-all ${assistantInput.trim() || pendingAttachments.length > 0 ? 'bg-indigo-600 text-white shadow-lg' : 'bg-slate-200 text-slate-400'}`}
                    >
                      <i className={`fas ${isAssistantLoading ? 'fa-circle-notch fa-spin' : 'fa-paper-plane'} `}></i>
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
        <div className="lg:flex-1 grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 lg:overflow-hidden lg:min-h-0">
          <div className="lg:col-span-1 bg-white p-4 sm:p-6 rounded-3xl sm:rounded-[32px] border border-slate-200 shadow-sm space-y-5 flex flex-col lg:h-full lg:overflow-y-auto custom-scrollbar">
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
                        <button onClick={() => setShowCropper(true)} className="w-full mt-2 py-2 bg-indigo-50 text-indigo-600 rounded-xl text-[10px] font-black uppercase tracking-widest border border-indigo-100 hover:bg-indigo-100 transition-all flex items-center justify-center">
                          <i className="fas fa-crop-simple mr-2"></i>Công cụ Cắt ảnh
                        </button>
                      )}
                      {gameType === 'quiz' && (
                        <div className="mt-3 animate-in fade-in slide-in-from-top-1">
                          <div className="flex bg-slate-100 p-1 rounded-xl mb-3">
                            <button onClick={() => setQuizMode('topic')} className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold uppercase ${quizMode === 'topic' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500'}`}>Từ Chủ đề</button>
                            <button onClick={() => setQuizMode('file')} className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold uppercase ${quizMode === 'file' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500'}`}>Từ File Ảnh/PDF</button>
                          </div>

                          {quizMode === 'topic' ? (
                            <div className="space-y-3">
                              <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Kiểu đề Quiz</label>
                                <div className="grid grid-cols-1 gap-1.5 mt-1">
                                  <button
                                    type="button"
                                    onClick={() => setQuizStyle('vioedu')}
                                    className={`py-2.5 px-3 rounded-xl text-[10px] font-black uppercase tracking-wider border text-left flex items-center justify-between transition-all ${
                                      quizStyle === 'vioedu'
                                        ? 'bg-purple-600 text-white border-purple-600 shadow-md'
                                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-purple-200'
                                    }`}
                                  >
                                    <span>🎯 Dạng VioEdu / Violympic (Hình SVG + Điền số)</span>
                                    {quizStyle === 'vioedu' && <i className="fas fa-check-circle"></i>}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setQuizStyle('standard')}
                                    className={`py-2 px-3 rounded-xl text-[10px] font-bold uppercase tracking-wider border text-left flex items-center justify-between transition-all ${
                                      quizStyle === 'standard'
                                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-md'
                                        : 'bg-slate-50 text-slate-500 border-slate-200 hover:border-indigo-200'
                                    }`}
                                  >
                                    <span>📝 Trắc nghiệm chuẩn SGK</span>
                                    {quizStyle === 'standard' && <i className="fas fa-check-circle"></i>}
                                  </button>
                                </div>
                              </div>

                              <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Số lượng câu hỏi</label>
                                <div className="grid grid-cols-5 gap-1.5 mt-1">
                                  {[5, 10, 15, 20, 30].map(num => (
                                    <button
                                      key={num}
                                      type="button"
                                      onClick={() => setQuizCount(num)}
                                      className={`py-2 rounded-xl text-[10px] font-black border transition-all ${quizCount === num ? 'bg-indigo-50 text-indigo-600 border-indigo-300 shadow-sm' : 'bg-white text-slate-400 border-slate-100 hover:border-indigo-100'}`}
                                    >
                                      {num} câu
                                    </button>
                                  ))}
                                </div>
                              </div>

                              <button
                                type="button"
                                onClick={() => {
                                  setSubject('Toán');
                                  setGrade('Lớp 1');
                                  setTopic('Đề thi VioEdu Toán Lớp 1 (Đếm, Phép cộng trong phạm vi 10, Hình phẳng & Quy luật)');
                                  setResult(VIOEDU_GRADE1_SAMPLE_30);
                                }}
                                className="w-full py-2.5 px-3 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white rounded-xl text-[10px] font-black uppercase tracking-wider shadow-md flex items-center justify-center gap-2 transition-all active:scale-95"
                              >
                                <i className="fas fa-star"></i>
                                <span>Mở bộ đề VioEdu 30 câu (từ file PDF mẫu)</span>
                              </button>
                            </div>
                          ) : (
                            <div className="space-y-3">
                              <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Tải lên đề thi (Ảnh/PDF - Hỗ trợ tới 35 trang)</label>
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
                              <button
                                type="button"
                                onClick={() => {
                                  setSubject('Toán');
                                  setGrade('Lớp 1');
                                  setTopic('Đề thi VioEdu Toán Lớp 1 (30 câu từ file PDF)');
                                  setResult(VIOEDU_GRADE1_SAMPLE_30);
                                }}
                                className="w-full py-2.5 px-3 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white rounded-xl text-[10px] font-black uppercase tracking-wider shadow-md flex items-center justify-center gap-2 transition-all active:scale-95"
                              >
                                <i className="fas fa-file-circle-check"></i>
                                <span>Mở ngay 30 câu từ file PDF VioEdu vừa gửi</span>
                              </button>
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
                        <i className={`fas ${useTemplateMode ? 'fa-toggle-on' : 'fa-toggle-off'} mr-1`}></i>
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
                      <div className="space-y-6 animate-in fade-in">
                        <div>
                          <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
                            <i className="fas fa-file-pdf text-rose-600"></i>
                            Chuyển Word / Excel sang PDF
                          </h3>
                          <div className="space-y-3">
                            <div className="p-4 bg-rose-50 rounded-xl border border-rose-100 text-rose-800 text-[11px]">
                              <i className="fas fa-info-circle mr-2"></i>
                              Chuyển đổi tài liệu Word (<b>.docx</b>) hoặc bảng tính Excel (<b>.xlsx, .xls, .csv</b>) sang file PDF chuẩn A4.
                            </div>
                            <div>
                              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Chọn File Word hoặc Excel</label>
                              <input
                                type="file"
                                accept=".docx,.doc,.xlsx,.xls,.csv,.txt"
                                onChange={handleOfficeToPdfFileChange}
                                className="mt-1 block w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-rose-50 file:text-rose-700 hover:file:bg-rose-100"
                              />
                            </div>

                            {officeToPdfFile && (
                              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                                <p className="text-xs font-bold text-slate-700 flex items-center">
                                  <i className={`fas ${/\.(xlsx|xls|csv)$/i.test(officeToPdfFile.name) ? 'fa-file-excel text-emerald-600' : 'fa-file-word text-blue-600'} mr-2`}></i>
                                  <span className="truncate">{officeToPdfFile.name}</span>
                                </p>

                                <div>
                                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-2 block">Hướng trang PDF (Khổ A4)</label>
                                  <div className="grid grid-cols-2 gap-2">
                                    <button
                                      type="button"
                                      onClick={() => setOfficeToPdfOrientation('portrait')}
                                      className={`py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                                        officeToPdfOrientation === 'portrait'
                                          ? 'bg-rose-600 text-white shadow-md shadow-rose-100'
                                          : 'bg-white border border-slate-200 text-slate-600 hover:border-rose-300'
                                      }`}
                                    >
                                      <i className="fas fa-file-lines mr-1.5"></i>Khổ Dọc
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setOfficeToPdfOrientation('landscape')}
                                      className={`py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                                        officeToPdfOrientation === 'landscape'
                                          ? 'bg-rose-600 text-white shadow-md shadow-rose-100'
                                          : 'bg-white border border-slate-200 text-slate-600 hover:border-rose-300'
                                      }`}
                                    >
                                      <i className="fas fa-panorama mr-1.5"></i>Khổ Ngang
                                    </button>
                                  </div>
                                </div>

                                <div className="flex flex-col sm:flex-row gap-2 pt-2">
                                  <button
                                    type="button"
                                    onClick={handleConvertOfficeToPdf}
                                    disabled={isConvertingOfficeToPdf}
                                    className="flex-1 py-3 bg-gradient-to-r from-rose-600 to-rose-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:from-rose-700 hover:to-rose-800 transition-all disabled:opacity-50 shadow-lg shadow-rose-100"
                                  >
                                    {isConvertingOfficeToPdf ? (
                                      <>
                                        <i className="fas fa-spinner fa-spin mr-2"></i>
                                        Đang tạo PDF...
                                      </>
                                    ) : (
                                      <>
                                        <i className="fas fa-file-pdf mr-2"></i>
                                        Chuyển sang PDF & Tải về
                                      </>
                                    )}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={handlePrintOfficeToPdf}
                                    className="px-4 py-3 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-100 transition-all"
                                    title="In hoặc Lưu PDF chất lượng Vector sắc nét"
                                  >
                                    <i className="fas fa-print mr-1.5"></i>In / Lưu PDF
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setOfficeToPdfFile(null);
                                      setOfficePreviewHtml(null);
                                      setResult(null);
                                    }}
                                    className="px-4 py-3 bg-slate-100 text-slate-600 rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-slate-200 transition-all"
                                  >
                                    Hủy
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>

                        <hr className="border-slate-200" />

                        <div>
                          <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
                            <i className="fas fa-file-word text-blue-600"></i>
                            Chuyển PDF sang Word
                          </h3>
                          <div className="space-y-3">
                            <div className="p-4 bg-blue-50 rounded-xl border border-blue-100 text-blue-800 text-[11px]">
                              <i className="fas fa-info-circle mr-2"></i>
                              Chuyển đổi file PDF thành tài liệu Word (.docx) để có thể chỉnh sửa dễ dàng hơn.
                            </div>
                            <div>
                              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Chọn File PDF</label>
                              <input
                                type="file"
                                accept="application/pdf"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) {
                                    setPdfToWordFile(file);
                                  }
                                }}
                                className="mt-1 block w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                              />
                            </div>

                            {pdfToWordFile && (
                              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                                <p className="text-xs font-bold text-slate-700">
                                  <i className="fas fa-file-pdf mr-2 text-rose-500"></i>
                                  {pdfToWordFile.name}
                                </p>

                                {/* Chọn mode */}
                                <div>
                                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-2 block">Chế độ chuyển đổi</label>
                                  <div className="flex gap-2">
                                    <button
                                      onClick={() => setPdfToWordMode('ocr')}
                                      className={`flex-1 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                                        pdfToWordMode === 'ocr'
                                          ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100'
                                          : 'bg-white border border-slate-200 text-slate-600 hover:border-indigo-300'
                                      }`}
                                    >
                                      <i className="fas fa-spell-check mr-2"></i>
                                      OCR (VĂN BẢN)
                                    </button>
                                    <button
                                      onClick={() => setPdfToWordMode('image')}
                                      className={`flex-1 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                                        pdfToWordMode === 'image'
                                          ? 'bg-blue-600 text-white shadow-lg shadow-blue-100'
                                          : 'bg-white border border-slate-200 text-slate-600 hover:border-blue-300'
                                      }`}
                                    >
                                      <i className="fas fa-image mr-2"></i>
                                      ẢNH ONLY
                                    </button>
                                  </div>
                                  <p className="text-[9px] text-slate-500 italic mt-2">
                                    {pdfToWordMode === 'ocr' 
                                      ? '✓ Trích xuất văn bản (mất vài giây) + tùy chọn thêm ảnh' 
                                      : '✓ Chỉ nhúng ảnh PDF vào Word (nhanh nhất)'}
                                  </p>
                                </div>

                                {/* Tùy chọn cho OCR mode */}
                                {pdfToWordMode === 'ocr' && (
                                  <div>
                                    <label className="flex items-center gap-3 cursor-pointer p-3 bg-white rounded-lg border border-slate-200 hover:border-indigo-300 transition-all">
                                      <input
                                        type="checkbox"
                                        checked={pdfToWordIncludeImages}
                                        onChange={(e) => setPdfToWordIncludeImages(e.target.checked)}
                                        className="w-4 h-4 accent-indigo-600 cursor-pointer"
                                      />
                                      <span className="text-[10px] font-bold text-slate-700">Thêm ảnh gốc PDF vào Word (mỗi trang)</span>
                                    </label>
                                  </div>
                                )}

                                <div>
                                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Tiêu đề tài liệu (tùy chọn)</label>
                                  <input
                                    type="text"
                                    placeholder="VD: Tài liệu học tập"
                                    value={pdfToWordTitle}
                                    onChange={(e) => setPdfToWordTitle(e.target.value)}
                                    className="w-full mt-1 px-3 py-2 rounded-lg border border-slate-200 text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none"
                                  />
                                </div>

                                <div>
                                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-2 block">Phông chữ</label>
                                  <select
                                    value={pdfToWordFont}
                                    onChange={(e) => setPdfToWordFont(e.target.value)}
                                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                                  >
                                    <option value="Calibri">Calibri (Mặc định)</option>
                                    <option value="Times New Roman">Times New Roman</option>
                                    <option value="Arial">Arial</option>
                                    <option value="Verdana">Verdana</option>
                                    <option value="Georgia">Georgia</option>
                                    <option value="Courier New">Courier New</option>
                                    <option value="Comic Sans MS">Comic Sans MS</option>
                                  </select>
                                </div>

                                <div className="flex gap-2 pt-2">
                                  <button
                                    onClick={handlePdfToWord}
                                    disabled={isConvertingToWord}
                                    className="flex-1 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:from-blue-700 hover:to-blue-800 transition-all disabled:opacity-50 shadow-lg shadow-blue-100"
                                  >
                                    {isConvertingToWord ? (
                                      <>
                                        <i className="fas fa-spinner fa-spin mr-2"></i>
                                        Đang chuyển đổi...
                                      </>
                                    ) : (
                                      <>
                                        <i className="fas fa-download mr-2"></i>
                                        Chuyển sang Word & Tải về
                                      </>
                                    )}
                                  </button>
                                  <button
                                    onClick={() => {
                                      setPdfToWordFile(null);
                                      setPdfToWordTitle('');
                                      setPdfToWordFont('Calibri');
                                    }}
                                    className="px-6 py-3 bg-slate-100 text-slate-600 rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-slate-200 transition-all"
                                  >
                                    Hủy
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>

                        <hr className="border-slate-200" />

                        <div>
                          <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
                            <i className="fas fa-scissors text-indigo-600"></i>
                            Cắt PDF (Split)
                          </h3>
                          <div className="p-4 bg-indigo-50 rounded-xl border border-indigo-100 text-indigo-800 text-xs">
                            <i className="fas fa-info-circle mr-2"></i>
                            Chia nhỏ file đề thi lớn để AI xử lý dễ dàng hơn.
                          </div>
                          <div className="mt-3">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Chọn File PDF gốc</label>
                            <input
                              type="file"
                              accept="application/pdf"
                              onChange={handlePdfToolUpload}
                              className="mt-1 block w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                            />
                          </div>
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
                            <div className="flex gap-2 pt-2">
                              <button onClick={handleSplitPdf} disabled={isConverting} className="flex-1 py-2 bg-white border border-indigo-200 text-indigo-600 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-indigo-50 transition-all disabled:opacity-50">
                                {isConverting ? <i className="fas fa-spinner fa-spin mr-2"></i> : <i className="fas fa-scissors mr-2"></i>}
                                {isConverting ? 'Đang xử lý...' : 'Cắt PDF'}
                              </button>
                              <button onClick={handlePdfToImages} disabled={isConverting} className="flex-1 py-2 bg-emerald-600 text-white rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100 disabled:opacity-50">
                                {isConverting ? <i className="fas fa-spinner fa-spin"></i> : <><i className="fas fa-images mr-2"></i>Chuyển thành Ảnh</>}
                                {isConverting ? 'Đang xử lý...' : 'Chuyển thành Ảnh'}
                              </button>
                            </div>
                          </div>
                        )}

                        <hr className="border-slate-200" />

                        <div>
                          <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
                            <i className="fas fa-link text-indigo-600"></i>
                            Ghép PDF (Merge)
                          </h3>
                          <div className="space-y-3">
                            <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-100 text-emerald-800 text-[11px]">
                              <i className="fas fa-info-circle mr-2"></i>
                              Chọn nhiều file PDF để ghép thành một file duy nhất.
                            </div>
                            <div>
                              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Chọn File PDF (có thể chọn nhiều lần)</label>
                              <input
                                type="file"
                                accept="application/pdf"
                                multiple
                                onChange={handleAddPdfToMerge}
                                className="mt-1 block w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100"
                              />
                            </div>

                            {pdfFilesToMerge.length > 0 && (
                              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                                <p className="text-[11px] font-bold text-slate-700">
                                  <i className="fas fa-file-pdf mr-2 text-rose-500"></i>
                                  {pdfFilesToMerge.length} file được chọn:
                                </p>
                                <div className="space-y-1 max-h-48 overflow-y-auto">
                                  {pdfFilesToMerge.map((file, idx) => (
                                    <div key={idx} className="flex items-center justify-between bg-white p-2 rounded-lg border border-slate-100 text-[11px]">
                                      <div className="flex-1 truncate">
                                        <span className="font-bold text-slate-700">{idx + 1}. </span>
                                        <span className="text-slate-600">{file.name}</span>
                                      </div>
                                      <button
                                        onClick={() => handleRemovePdfFromMerge(idx)}
                                        className="ml-2 px-2 py-1 bg-rose-100 text-rose-600 rounded-lg hover:bg-rose-200 transition-all font-bold text-[10px]"
                                      >
                                        <i className="fas fa-trash-alt"></i>
                                      </button>
                                    </div>
                                  ))}
                                </div>
                                <button
                                  onClick={handleMergePdf}
                                  disabled={isMerging || pdfFilesToMerge.length < 2}
                                  className="w-full py-3 bg-gradient-to-r from-emerald-600 to-emerald-700 text-white rounded-xl text-[11px] font-black uppercase tracking-widest hover:from-emerald-700 hover:to-emerald-800 transition-all disabled:opacity-50 shadow-lg shadow-emerald-100 mt-3"
                                >
                                  {isMerging ? (
                                    <>
                                      <i className="fas fa-spinner fa-spin mr-2"></i>
                                      Đang ghép...
                                    </>
                                  ) : (
                                    <>
                                      <i className="fas fa-download mr-2"></i>
                                      Ghép & Tải Xuống
                                    </>
                                  )}
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
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

              {(activeTab === 'tts' || activeTab === 'video') && (
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
                    {activeTab === 'video' ? 'Giọng thuyết minh Video' : 'Giọng đọc'}
                  </label>
                  <div className="grid grid-cols-2 gap-2 mt-1">
                    <button
                      onClick={() => { setVoiceName('Kore'); setAudioUrl(null); setIsPlaying(false); }}
                      className={`py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${voiceName === 'Kore' ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' : 'bg-slate-50 text-slate-500 border-slate-100 hover:border-indigo-200'}`}
                    >
                      <i className="fas fa-mars mr-2"></i>Giọng Nam
                    </button>
                    <button
                      onClick={() => { setVoiceName('Puck'); setAudioUrl(null); setIsPlaying(false); }}
                      className={`py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${voiceName === 'Puck' ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' : 'bg-slate-50 text-slate-500 border-slate-100 hover:border-indigo-200'}`}
                    >
                      <i className="fas fa-venus mr-2"></i>Giọng Nữ
                    </button>
                    <button
                      onClick={() => { setVoiceName('Boy'); setAudioUrl(null); setIsPlaying(false); }}
                      className={`py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${voiceName === 'Boy' ? 'bg-sky-600 text-white border-sky-600 shadow-md' : 'bg-slate-50 text-slate-500 border-slate-100 hover:border-sky-200'}`}
                    >
                      <i className="fas fa-child mr-2"></i>Giọng Bé Trai
                    </button>
                    <button
                      onClick={() => { setVoiceName('Girl'); setAudioUrl(null); setIsPlaying(false); }}
                      className={`py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${voiceName === 'Girl' ? 'bg-pink-500 text-white border-pink-500 shadow-md' : 'bg-slate-50 text-slate-500 border-slate-100 hover:border-pink-200'}`}
                    >
                      <i className="fas fa-child-dress mr-2"></i>Giọng Bé Gái
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

            {!showHistory && activeTab !== 'pdf_tools' && (
              <div className="flex flex-col space-y-2 mt-auto">
                <button
                  onClick={() => {
                    if (isProcessing) {
                      forceStopRef.current = true;
                      setIsProcessing(false);
                      return;
                    }
                    forceStopRef.current = false;
                    const fn = activeTab === 'lesson_plan' ? generateLessonPlan : activeTab === 'games' ? (gameType === 'crossword' ? generateCrossword : gameType === 'quiz' ? (quizMode === 'file' ? generateQuizFromUpload : generateQuiz) : generateGame) : activeTab === 'images' ? generateAIVisual : activeTab === 'video' ? generateVideo : activeTab === 'pdf_tools' ? handleSplitPdf : generateTTS;
                    fn();
                  }}
                  className={`w-full py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl transition-all active:scale-95 ${isProcessing ? 'bg-rose-500 text-white animate-pulse' : (activeTab === 'pdf_tools' ? 'bg-emerald-600 text-white shadow-emerald-100' : 'bg-indigo-600 text-white shadow-indigo-100')} `}
                >
                  {isProcessing ? <><i className="fas fa-hand mr-2"></i>DỪNG LẠI (CANCEL)</> : <><i className="fas fa-magic mr-2"></i>{activeTab === 'lesson_plan' ? 'Bắt đầu soạn giáo án' : activeTab === 'games' ? (gameType === 'crossword' ? 'Tạo ô chữ' : gameType === 'quiz' ? 'Tạo Quiz' : 'Bắt đầu sáng tạo') : activeTab === 'images' ? 'Tạo Hình ảnh' : activeTab === 'video' ? 'Tạo Video' : activeTab === 'pdf_tools' ? 'Cắt & Tải về' : activeTab === 'tts' ? 'Tạo Giọng đọc' : 'Bắt đầu sáng tạo'}</>}
                </button>
                {isProcessing && (
                  <p className="text-[9px] text-center text-rose-500 font-bold animate-bounce mt-1">
                    Hệ thống đang chạy. Bấm "DỪNG LẠI" nếu muốn hủy yêu cầu.
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="lg:col-span-2 bg-white rounded-3xl sm:rounded-[40px] border border-slate-200 shadow-sm lg:overflow-hidden flex flex-col min-h-[420px] lg:min-h-0 lg:h-full shrink-0">
            <div className="px-4 sm:px-8 py-3 sm:py-4 border-b border-slate-100 flex flex-wrap gap-2 items-center justify-between bg-slate-50/50">
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
                        onClick={async () => {
                          const { downloadLessonPlanAsDocx } = await import('../docxHelper');
                          downloadLessonPlanAsDocx(result, topic ? `Giao_an_${topic.replace(/\s+/g, '_')}.docx` : "Giao_an_AI.docx", { font: docxFont, fontSize: docxFontSize, alignment: docxAlignment, lineSpacing: docxLineSpacing });
                        }}
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

            <div className="flex-1 lg:overflow-y-auto p-4 sm:p-8 custom-scrollbar">
              {isProcessing && (!result || !(activeTab === 'games' && gameType === 'quiz' && Array.isArray(result) && result.length > 0)) ? (
                <div className="min-h-[280px] h-full flex flex-col items-center justify-center space-y-6">
                  <div className="relative">
                    <div className="w-20 h-20 border-4 border-indigo-100 rounded-full"></div>
                    <div className="absolute top-0 left-0 w-20 h-20 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                  </div>
                  <div className="text-center">
                    <p className="text-xs font-black text-slate-800 uppercase tracking-widest">
                      {digitizeProgress || 'AI đang làm việc'}
                    </p>
                    <p className="text-[10px] text-slate-400 font-bold uppercase mt-1 tracking-tighter">Vui lòng đợi trong giây lát</p>
                  </div>
                </div>
              ) : result ? (
                <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                  {isProcessing && digitizeProgress && (
                    <div className="mb-4 px-4 py-2.5 bg-indigo-50 border border-indigo-200 rounded-2xl flex items-center justify-between text-xs font-bold text-indigo-700 animate-pulse">
                      <span><i className="fas fa-spinner fa-spin mr-2"></i>{digitizeProgress}</span>
                      <span className="text-[10px] uppercase tracking-wider">Bạn có thể xem trước các câu đã xong</span>
                    </div>
                  )}
                  {activeTab === 'games' && gameType === 'crossword' && typeof result === 'object' ? (
                    <Crossword data={result} />
                  ) : activeTab === 'games' && gameType === 'quiz' && Array.isArray(result) ? (
                    <QuizPlayer data={result} onShare={handleShareQuiz} onCopyCode={handleCopyQuizCode} onCrop={handleCropRequest} onUpdateQuestion={handleUpdateQuestion} onExportDocx={handleExportQuizDocx} />
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
                    <div className="flex flex-col items-center w-full">
                      <audio
                        ref={audioRef}
                        src={audioUrl || ''}
                        onEnded={() => setIsPlaying(false)}
                        onPause={() => setIsPlaying(false)}
                        onPlay={() => setIsPlaying(true)}
                        className="hidden"
                      />
                      <div className="relative group w-full max-w-2xl aspect-video bg-slate-950 rounded-[24px] sm:rounded-[32px] shadow-2xl border-4 border-white overflow-hidden">
                        <canvas
                          ref={videoCanvasRef}
                          width={1280}
                          height={720}
                          className="w-full h-full object-contain block cursor-pointer"
                          onClick={handlePlayWithVoiceover}
                        />
                        {!isPlaying && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/25 group-hover:bg-black/15 transition-all cursor-pointer" onClick={handlePlayWithVoiceover}>
                            <div className="w-16 h-16 bg-white/95 rounded-full flex items-center justify-center shadow-xl backdrop-blur-sm text-purple-600 pl-1 hover:scale-105 transition-transform">
                              <i className="fas fa-play text-2xl"></i>
                            </div>
                          </div>
                        )}
                      </div>

                      {videoScenes.length > 0 && (
                        <div className="w-full max-w-2xl mt-4 space-y-3">
                          <div className="grid grid-cols-3 gap-2">
                            {videoScenes.map((sc, idx) => (
                              <button
                                key={idx}
                                type="button"
                                onClick={() => setCurrentSceneIdx(idx)}
                                className={`p-2 rounded-2xl border text-left transition-all flex items-center gap-2 ${
                                  currentSceneIdx === idx
                                    ? 'bg-purple-50 border-purple-500 ring-2 ring-purple-200'
                                    : 'bg-slate-50 border-slate-200 hover:border-purple-300'
                                }`}
                              >
                                <img src={sc.imageUrl} alt={sc.sceneTitle} className="w-12 h-8 object-cover rounded-lg shrink-0 border border-white shadow-sm" />
                                <div className="min-w-0 flex-1">
                                  <p className="text-[10px] font-black text-purple-700 truncate">{sc.sceneTitle}</p>
                                  <p className="text-[9px] text-slate-500 truncate">{sc.narration}</p>
                                </div>
                              </button>
                            ))}
                          </div>

                          <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200">
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                                <i className="fas fa-microphone-lines text-purple-600 mr-1.5"></i>
                                Lời thuyết minh AI (Chỉ đọc nội dung bài giảng, có thể chỉnh sửa)
                              </span>
                            </div>
                            <textarea
                              value={videoNarration}
                              onChange={(e) => {
                                setVideoNarration(e.target.value);
                                setAudioUrl(null);
                              }}
                              rows={2}
                              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-700 font-medium focus:ring-2 focus:ring-purple-500 outline-none resize-none"
                            />
                          </div>
                        </div>
                      )}

                      <div className="mt-5 flex flex-col items-center space-y-3 w-full">
                        <div className="flex flex-wrap justify-center gap-2.5">
                          <button onClick={handlePlayWithVoiceover} className={`px-6 py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl active:scale-95 transition-all ${isPlaying ? 'bg-rose-500 text-white shadow-rose-100' : 'bg-purple-600 text-white shadow-purple-100 hover:bg-purple-700'}`}>
                            <i className={`fas ${isPlaying ? 'fa-stop' : 'fa-play'} mr-2`}></i>{isPlaying ? 'Dừng phát' : 'Phát Video AI'}
                          </button>
                          <button
                            onClick={handleDownloadVideoWebm}
                            disabled={isRecordingVideo}
                            className="px-6 py-3.5 bg-emerald-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 shadow-xl shadow-emerald-100 active:scale-95 transition-all flex items-center disabled:opacity-50"
                          >
                            <i className={`fas ${isRecordingVideo ? 'fa-spinner fa-spin' : 'fa-film'} mr-2`}></i>
                            {isRecordingVideo ? 'Đang kết xuất Video...' : 'Tải Video (.WEBM)'}
                          </button>
                          <a href={videoScenes[currentSceneIdx]?.imageUrl || result} download={`Canh_${currentSceneIdx + 1}_Video.png`} className="px-6 py-3.5 bg-indigo-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-700 shadow-xl shadow-indigo-100 active:scale-95 transition-all flex items-center">
                            <i className="fas fa-download mr-2"></i>Tải Ảnh cảnh (.PNG)
                          </a>
                          <button
                            onClick={handleDownloadAudio}
                            className="px-6 py-3.5 bg-sky-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-sky-700 shadow-xl shadow-sky-100 active:scale-95 transition-all flex items-center"
                          >
                            <i className="fas fa-volume-high mr-2"></i>Tải Thuyết minh
                          </button>
                        </div>
                        <p className="text-[10px] text-slate-400 font-medium text-center">Video đa phân cảnh (Storyboard 3 cảnh) kèm hiệu ứng chuyển cảnh, hoạt cảnh hạt, phụ đề và giọng thuyết minh AI.</p>
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
                            <audio
                              ref={audioRef}
                              src={audioUrl || ''}
                              onEnded={() => setIsPlaying(false)}
                              onPause={() => setIsPlaying(false)}
                              onPlay={() => setIsPlaying(true)}
                              className="hidden"
                            />
                            <div className="flex items-center justify-center space-x-4">
                              <button
                                onClick={() => {
                                  if (audioUrl && audioRef.current) {
                                    const isChildVoice = voiceName === 'Boy' || voiceName === 'Girl';
                                    const isMp3Fallback = audioUrl.startsWith('data:audio/mpeg');
                                    if (isChildVoice && isMp3Fallback) {
                                      (audioRef.current as any).preservesPitch = false;
                                      (audioRef.current as any).mozPreservesPitch = false;
                                      (audioRef.current as any).webkitPreservesPitch = false;
                                      audioRef.current.playbackRate = voiceName === 'Girl' ? 1.24 : 1.18;
                                    } else {
                                      (audioRef.current as any).preservesPitch = true;
                                      audioRef.current.playbackRate = 1.0;
                                    }
                                    audioRef.current.play();
                                    setIsPlaying(true);
                                  } else if ('speechSynthesis' in window) {
                                    window.speechSynthesis.cancel();
                                    const utterance = new SpeechSynthesisUtterance(topic);
                                    utterance.lang = 'vi-VN';
                                    if (voiceName === 'Boy') {
                                      utterance.pitch = 1.45;
                                      utterance.rate = 1.02;
                                    } else if (voiceName === 'Girl') {
                                      utterance.pitch = 1.65;
                                      utterance.rate = 1.05;
                                    } else if (voiceName === 'Kore') {
                                      utterance.pitch = 0.85;
                                      utterance.rate = 0.92;
                                    } else {
                                      utterance.pitch = 1.05;
                                      utterance.rate = 0.92;
                                    }

                                    const voices = window.speechSynthesis.getVoices();
                                    const viVoices = voices.filter(v => v.lang.includes('vi'));
                                    if (viVoices.length > 0) {
                                      if (voiceName === 'Kore' || voiceName === 'Boy') {
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
                                title="Phát giọng đọc"
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
                                title="Tạm dừng"
                              >
                                <i className="fas fa-pause"></i>
                              </button>
                              <button
                                onClick={handleDownloadAudio}
                                className="w-12 h-12 bg-emerald-600 text-white rounded-full flex items-center justify-center shadow-md hover:bg-emerald-700 active:scale-95 transition-all"
                                title="Tải tệp âm thanh về máy"
                              >
                                <i className="fas fa-download"></i>
                              </button>
                            </div>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest text-center mt-4">
                              {isPlaying
                                ? 'Đang phát giọng đọc...'
                                : `Giọng ${voiceName === 'Kore' ? 'Nam' : voiceName === 'Puck' ? 'Nữ' : voiceName === 'Boy' ? 'Bé Trai' : 'Bé Gái'} • ${audioUrl ? 'AI Audio' : 'Hệ thống'}`}
                            </p>
                            <div className="mt-4 pt-4 border-t border-slate-200/60 flex justify-center">
                              <button
                                onClick={handleDownloadAudio}
                                disabled={isProcessing}
                                className="w-full py-3 px-5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-[11px] font-black uppercase tracking-widest shadow-lg shadow-emerald-100 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                              >
                                <i className="fas fa-download"></i>
                                <span>Tải tệp âm thanh về máy ({audioUrl?.includes('audio/wav') ? '.WAV' : '.MP3'})</span>
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="p-4">
                      {activeTab === 'pdf_tools' ? (
                        officePreviewHtml ? (
                          <div className="space-y-4">
                            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200">
                              <span className="text-xs font-black text-slate-700 flex items-center">
                                <i className="fas fa-eye text-indigo-600 mr-2"></i>
                                Xem trước tài liệu: {officeToPdfFile?.name}
                              </span>
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={handleConvertOfficeToPdf}
                                  disabled={isConvertingOfficeToPdf}
                                  className="px-4 py-2 bg-rose-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-rose-700 transition-all shadow-md"
                                >
                                  <i className={`fas ${isConvertingOfficeToPdf ? 'fa-spinner fa-spin' : 'fa-download'} mr-1.5`}></i>
                                  Tải PDF
                                </button>
                                <button
                                  type="button"
                                  onClick={handlePrintOfficeToPdf}
                                  className="px-4 py-2 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-100 transition-all"
                                >
                                  <i className="fas fa-print mr-1.5"></i>
                                  In / Lưu PDF sắc nét
                                </button>
                              </div>
                            </div>
                            <div
                              className="p-6 bg-white border border-slate-200 rounded-2xl shadow-inner overflow-x-auto"
                              dangerouslySetInnerHTML={{ __html: officePreviewHtml }}
                            />
                          </div>
                        ) : (
                          <div className="text-center py-10 text-slate-400">
                            <i className="fas fa-file-pdf text-4xl mb-3 opacity-30"></i>
                            <p className="text-xs font-bold uppercase">File PDF đã được tải xuống máy của bạn.</p>
                          </div>
                        )
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
                    <i className={`fas ${activeTab === 'games' ? (gameType === 'crossword' ? 'fa-puzzle-piece' : 'fa-gamepad') : activeTab === 'images' ? 'fa-image' : activeTab === 'video' ? 'fa-film' : activeTab === 'pdf_tools' ? 'fa-scissors' : 'fa-microphone'} text-5xl text-slate-300`}></i>
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
