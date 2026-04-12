
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { geminiService, FilePart } from '../services/geminiService';
import { Attachment, Message, TeacherPersona } from '../types';
import { PERSONAS } from '../constants';
import ChatMessage from './ChatMessage';
import Crossword from './Crossword';
import { exportWorksheetToDocx } from '../docxHelper';

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
  const [showScore, setShowScore] = useState(false);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [timeLeft, setTimeLeft] = useState(15);
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);
  const [isBatchEditing, setIsBatchEditing] = useState(false);

  useEffect(() => {
    setTimeLeft(15);
    setIsBatchEditing(false); // Reset edit mode when changing question
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
    if (showScore || selectedOption || isBatchEditing) return;

    if (timeLeft === 0) {
      handleAnswerClick('TIMEOUT', -1);
      return;
    }

    const timer = setInterval(() => {
      setTimeLeft(prev => prev - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft, showScore, selectedOption, isBatchEditing]);

  const restartQuiz = () => {
    setCurrentIndex(0);
    setScore(0);
    setShowScore(false);
    setSelectedOption(null);
    setIsCorrect(null);
    setTimeLeft(15);
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

  return (
    <div className="flex flex-col h-full p-4">
      <div className="flex justify-between items-center mb-6">
        <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Câu hỏi {currentIndex + 1}/{data.length}</span>
        <div className={`flex items-center space-x-1 px-3 py-1 rounded-full border ${timeLeft <= 5 ? 'bg-rose-50 border-rose-200 text-rose-600 animate-pulse' : 'bg-slate-50 border-slate-200 text-slate-500'}`}>
          <i className="fas fa-clock text-xs"></i>
          <span className="text-xs font-black w-5 text-center">{timeLeft}s</span>
        </div>
        <div className="flex items-center space-x-2">
          {onUpdateQuestion && (
            <button onClick={startBatchEdit} className="text-xs font-black text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-4 py-2 rounded-xl transition-all border border-indigo-200 flex items-center shadow-sm active:scale-95" title="Sửa toàn bộ đề thi">
              <i className="fas fa-edit mr-2"></i>Sửa đề & Cắt ảnh
            </button>
          )}
          {onShare && (
            <button onClick={onShare} className="text-xs font-bold text-indigo-600 hover:bg-indigo-50 px-3 py-1 rounded-full transition-colors border border-indigo-100 flex items-center">
              <i className="fas fa-share-nodes mr-1"></i>Chia sẻ
            </button>
          )}
          {onCopyCode && (
            <button onClick={onCopyCode} className="text-xs font-bold text-indigo-600 hover:bg-indigo-50 px-3 py-1 rounded-full transition-colors border border-indigo-100 flex items-center" title="Copy Mã Đề">
              <i className="fas fa-code mr-1"></i>Mã
            </button>
          )}
          {onExportDocx && (
            <button onClick={onExportDocx} className="text-xs font-black text-white bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-xl transition-all shadow-md flex items-center shadow-blue-100" title="Xuất ra file Word (.docx)">
              <i className="fas fa-file-word mr-2"></i>Word
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
            /^(http|https|data:image)/i.test(displayImage.trim()) ? (
              <div className="flex justify-center mb-6 relative group">
                <img
                  src={displayImage}
                  alt="Minh họa"
                  className="max-h-[60vh] w-auto rounded-xl shadow-sm border border-slate-200 object-contain cursor-zoom-in hover:opacity-95 transition-opacity"
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
              // Trường hợp còn lại: Là mô tả văn bản (VD: [HÌNH ẢNH: ...]) -> Hiển thị khung text
              <div className="flex justify-center mb-6 p-6 bg-amber-50 rounded-xl border border-amber-200 text-amber-800 text-sm font-medium italic text-center max-w-md mx-auto shadow-sm animate-pulse">
                <i className="fas fa-image text-2xl mb-2 block text-amber-400"></i>
                {displayImage.replace(/[\[\]]/g, '').replace(/^(HÌNH ẢNH|IMAGE|IMG|HÌNH|CẮT ẢNH|CẮT ẢNH TỪ ĐỀ):/i, '').trim()}
                <div className="text-[10px] mt-2 text-amber-600/70">(Không tìm thấy ảnh gốc của trang này)</div>
              </div>
            )
          )
        )}
        <h3 className="text-xl font-bold text-slate-800 mb-8 text-center leading-relaxed">{displayQuestion}</h3>

        <div className="grid grid-cols-1 gap-3">
          {currentQuestion.type === 'Trắc nghiệm' && questionOptions.length > 0 ? (
            questionOptions.map((option: any, index: number) => {
              const optText = toSafeText(typeof option === 'string' || typeof option === 'number' ? option : (option?.text || option?.label || option?.content || ''));
              const optImg = toSafeText(typeof option === 'string' || typeof option === 'number' ? '' : (option?.image || ''));
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
                      ) : /^(http|https|data:image)/i.test(optImg.trim()) ? (
                        <div className="relative inline-block group">
                          <img src={optImg} alt="Option" className="max-h-40 w-auto object-contain rounded-lg cursor-zoom-in hover:opacity-95 transition-opacity" onClick={(e) => {
                            e.stopPropagation();
                            setZoomedImage(optImg);
                          }} onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }} />
                        </div>
                      ) : null}
                    </div>
                  )}

                  {isSelected && (
                    <span className="absolute right-4 top-1/2 -translate-y-1/2">
                      {isCorrectAnswer ? <i className="fas fa-check-circle text-emerald-600 text-xl"></i> : <i className="fas fa-times-circle text-rose-600 text-xl"></i>}
                    </span>
                  )}
                </button>
              );
            })
          ) : (
            <div className="space-y-4">
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Nhập câu trả lời (Câu hỏi Tự luận)..."
                  className="flex-1 p-4 bg-slate-50 border-2 border-slate-100 rounded-xl font-bold text-slate-700 outline-none focus:border-indigo-400 transition-all"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAnswerClick('ESSAY_ANSWER', -1);
                  }}
                />
                <button
                  onClick={() => handleAnswerClick('ESSAY_ANSWER', -1)}
                  className="px-6 py-4 bg-indigo-600 text-white rounded-xl font-black text-xs uppercase tracking-widest shadow-lg"
                >
                  Xác nhận
                </button>
              </div>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest text-center">Đây là câu hỏi Tự luận, học sinh sẽ nhập kết quả trực tiếp.</p>
            </div>
          )}
        </div>
      </div>

      {selectedOption && currentQuestion.explanation && (
        <div className="mt-4 p-3 bg-blue-50 text-blue-800 text-sm rounded-lg animate-in fade-in slide-in-from-bottom-2">
          <i className="fas fa-info-circle mr-2"></i>{currentQuestion.explanation}
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
  const [showCropper, setShowCropper] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [croppingContext, setCroppingContext] = useState<{ src: string, type: 'question' | 'option', qIdx: number, optIdx?: number } | null>(null);

  // State cho Merge PDF
  const [pdfFilesToMerge, setPdfFilesToMerge] = useState<File[]>([]);
  const [isMerging, setIsMerging] = useState(false);

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

    const controller = new AbortController();

    try {
      // Nâng cấp: Sử dụng generateExamQuestionsStructured để đảm bảo định dạng JSON chuẩn và chất lượng tốt hơn
      const prompt = `Bạn là giáo viên giỏi. Hãy soạn bộ câu hỏi trắc nghiệm (Quiz) về chủ đề: "${topic}".
      - Số lượng: ${quizCount} câu.
      - Môn: ${subject}
      - Lớp: ${grade}
      ${additionalPrompt ? `- Yêu cầu thêm: ${additionalPrompt}` : ''}
      
      YÊU CẦU ĐỊNH DẠNG JSON CHÍNH XÁC:
      {
        "questions": [
          {
            "type": "Trắc nghiệm",
            "question": "Nội dung câu hỏi...",
            "options": [{"text": "A..."}, {"text": "B..."}],
            "answer": "Đáp án đúng (VD: A)",
            "explanation": "Giải thích chi tiết..."
          }
        ]
      }`;

      const quizContent = await geminiService.generateExamQuestionsStructured(prompt);
      if (forceStopRef.current) throw new Error("Đã dừng.");

      let rawQuestions = [];
      if (quizContent && quizContent.questions && Array.isArray(quizContent.questions)) {
        rawQuestions = quizContent.questions;
      } else if (Array.isArray(quizContent)) {
        rawQuestions = quizContent;
      }

      if (rawQuestions.length > 0) {
        const formattedQuestions = rawQuestions.map((q: any, i: number) => {
          const normalizedOptions = (q.type === 'Trắc nghiệm' && Array.isArray(q.options))
            ? q.options.map((opt: any) => {
              if (typeof opt === 'string') return { text: opt, image: '' };
              return { text: opt.text || '', image: opt.image || '' };
            }) : [];
          return {
            id: q.id || `quiz-topic-${Date.now()}-${i}`,
            type: q.type || 'Trắc nghiệm',
            question: q.question?.replace(/\[IMAGE\]/g, '').trim() || q.content?.trim() || '',
            image: q.image || '',
            options: normalizedOptions,
            answer: q.answer || '',
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
    setResult(null);
    setAudioUrl(null);
    forceStopRef.current = false;

    const controller = new AbortController();
    const { signal } = controller;

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
      const base64ToUint8Array = (data: string) => {
        const binary = atob(data);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) {
          bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
      };

      const convertPdfToImages = async (base64: string): Promise<{ imageParts: any[]; pageImages: string[] } | null> => {
        try {
          // @ts-ignore
          const pdfjsLib = await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.379/+esm');
          // @ts-ignore
          pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.379/build/pdf.worker.min.mjs';

          const loadingTask = pdfjsLib.getDocument({ data: base64ToUint8Array(base64) });
          const pdf = await loadingTask.promise;
          const imageParts: any[] = [];
          const pageImages: string[] = [];

          const maxPages = Math.min(pdf.numPages, 10); // Giảm xuống 10 trang để tránh lỗi 429/Payload Too Large
          let scale = 1.0; // Giảm độ nét xuống 1.0 (đủ để AI đọc)
          let quality = 0.6; // Giảm chất lượng ảnh xuống 0.6 để nhẹ hơn

          for (let i = 1; i <= maxPages; i++) {
            if (forceStopRef.current) throw new Error("Dừng xử lý PDF.");

            // Yield to main thread more frequently
            await new Promise(resolve => setTimeout(resolve, 50));

            const page = await pdf.getPage(i);
            const viewport = page.getViewport({ scale });
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.height = viewport.height;
            canvas.width = viewport.width;
            await page.render({ canvasContext: context!, viewport: viewport }).promise;

            // Sử dụng jpeg để nén tốt hơn png
            const imgData = canvas.toDataURL('image/jpeg', quality);
            pageImages.push(imgData);
            imageParts.push({
              inlineData: {
                data: imgData.split(',')[1],
                mimeType: 'image/jpeg'
              }
            });

            // Giải phóng bộ nhớ canvas
            canvas.width = 0;
            canvas.height = 0;
          }
          return { imageParts, pageImages };
        } catch (e: any) {
          console.error("PDF Convert Error:", e);
          if (e.message?.includes("Dừng")) throw e;
          return null; // Fallback to original
        }
      };

      const finalFileParts: any[] = [];
      const pageImageUrls: string[] = [];

      for (const part of fileParts) {
        if (forceStopRef.current) throw new Error("Yêu cầu đã bị dừng.");
        if (part.inlineData.mimeType === 'application/pdf') {
          const converted = await convertPdfToImages(part.inlineData.data);
          if (converted && converted.imageParts.length > 0) {
            finalFileParts.push(...converted.imageParts);
            pageImageUrls.push(...converted.pageImages);
          } else {
            finalFileParts.push(part);
          }
        } else {
          finalFileParts.push(part);
          if (part.inlineData.mimeType.startsWith('image/')) {
            pageImageUrls.push(`data:${part.inlineData.mimeType};base64,${part.inlineData.data}`);
          }
        }
      }

      if (forceStopRef.current) throw new Error("Yêu cầu đã bị dừng.");

      const prompt = `Trích xuất TOÀN BỘ câu hỏi từ đề thi. 
      
      YÊU CẦU QUAN TRỌNG (BẮT BUỘC):
      1. TRÍCH XUẤT 100%: Phải trích xuất đầy đủ tất cả câu hỏi trong đề.
      2. TỰ ĐỘNG CẮT ẢNH (BẮT BUỘC): Với MỐI CÂU HỎI, bạn PHẢI cung cấp trường 'bbox' [ymin, xmin, ymax, xmax]. Đây là tọa độ bao quanh vùng không gian của câu hỏi đó trên trang giấy (bao gồm cả văn bản và hình minh họa nếu có). Hệ thống sẽ dùng bbox này để tự động cắt ảnh cho từng câu.
      3. TOÁN HỌC: Trích xuất bằng văn bản/Latex nhưng vẫn phải có 'bbox' vùng câu hỏi.
      
       JSON Format: {
        "questions": [
          {
            "type": "Trắc nghiệm" | "Tự luận",
            "question": "Nội dung câu hỏi (văn bản)",
            "options": [{"text": "...", "image": ""}],
            "answer": "...",
            "bbox": [ymin, xmin, ymax, xmax],
            "page_index": 0
          }
        ]
      }
      Lưu ý: Luôn trả về 'bbox' cho từng câu để hệ thống tự động cắt ảnh minh họa. Nếu không có bbox, hệ thống sẽ không hiển thị được hình ảnh câu hỏi.`;

      const runGenerateQuiz = async () => geminiService.generateExamQuestionsStructured(prompt, finalFileParts);
      let json;
      try {
        json = await runGenerateQuiz();
      } catch (firstError: any) {
        if (forceStopRef.current) throw new Error("Yêu cầu đã bị dừng.");
        const firstMessage = String(firstError?.message || '');
        const isTransientNetwork = /failed to fetch|networkerror|network request failed|load failed|err_network|cors/i.test(firstMessage);
        if (!isTransientNetwork) throw firstError;
        await new Promise((resolve) => setTimeout(resolve, 1800));
        if (forceStopRef.current) throw new Error("Yêu cầu đã bị dừng.");
        json = await runGenerateQuiz();
      }

      let rawQuestions = [];
      if (json && json.questions && Array.isArray(json.questions)) {
        rawQuestions = json.questions;
      } else if (Array.isArray(json)) {
        rawQuestions = json; // AI có thể trả về một mảng câu hỏi trực tiếp
      } else if (json && typeof json === 'object') {
        // Fallback: tìm key nào là mảng
        const key = Object.keys(json).find(k => Array.isArray(json[k]));
        if (key) rawQuestions = json[key];
      }

      if (rawQuestions.length > 0) {
        // KIỂM TRA AN TOÀN: Nếu AI trả về một mảng các chuỗi (chỉ có đáp án) thay vì các đối tượng câu hỏi.
        if (typeof rawQuestions[0] === 'string' || typeof rawQuestions[0] === 'number') {
          throw new Error("AI đã trả về một danh sách đáp án thay vì bộ câu hỏi đầy đủ. Vui lòng thử lại.");
        }

        // Helper để cắt ảnh từ bbox
        const cropImageFromBbox = (base64Image: string, bbox: number[]): Promise<string> => {
          return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
              if (!bbox || bbox.length !== 4) { resolve(base64Image); return; }
              if (img.width === 0 || img.height === 0) { resolve(base64Image); return; }

              const [ymin, xmin, ymax, xmax] = bbox;
              const width = img.width;
              const height = img.height;

              const y = (ymin / 1000) * height;
              const x = (xmin / 1000) * width;
              const h = ((ymax - ymin) / 1000) * height;
              const w = ((xmax - xmin) / 1000) * width;

              if (w <= 0 || h <= 0) { resolve(base64Image); return; }

              const canvas = document.createElement('canvas');
              const padding = 10;
              canvas.width = w + padding * 2;
              canvas.height = h + padding * 2;
              const ctx = canvas.getContext('2d');
              if (ctx) {
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, x, y, w, h, padding, padding, w, h);
                resolve(canvas.toDataURL('image/jpeg'));
              } else {
                resolve(base64Image);
              }
            };
            img.onerror = () => resolve(base64Image);
            img.src = base64Image;
          });
        };

        const formattedQuestions = await Promise.all(rawQuestions.map(async (q: any, i: number) => {
          // Chuẩn hóa dữ liệu options để đảm bảo cấu trúc {text, image}
          const resolveOptions = (candidate: unknown) => {
            if (Array.isArray(candidate)) return candidate;
            if (candidate && typeof candidate === 'object') {
              return Object.values(candidate as Record<string, unknown>);
            }
            return [];
          };
          const rawOptions = resolveOptions(
            q.options
            ?? q.choices
            ?? q.answers
            ?? q.luaChon
            ?? q.luachon
          );
          let normalizedOptions = rawOptions
            .map((opt: any) => {
              const text = (typeof opt === 'string' || typeof opt === 'number') ? String(opt) : (opt.text || opt.label || '');
              const image = (typeof opt === 'object' && opt !== null) ? opt.image : '';
              return { text: text.trim(), image };
            })
            .filter(opt => opt.text !== '' || (typeof opt.image === 'string' && opt.image.length > 0));

          if (normalizedOptions.length < 2) {
            // Tự động chuyển thành Tự luận nếu không có đủ phương án trắc nghiệm
            q.type = 'Tự luận';
            normalizedOptions = [];
          }
          // Xử lý chỉ số trang trả về từ AI: page_index bắt đầu từ 0
          const pageIndexRaw = q.page_index ?? q.page ?? q.pageNumber;
          let pageImage = '';
          if (pageIndexRaw !== undefined && pageIndexRaw !== null) {
            const parsed = Number(pageIndexRaw);
            if (!Number.isNaN(parsed)) {
              // page_index từ AI luôn bắt đầu từ 0 (trang đầu tiên)
              if (parsed >= 0 && parsed < pageImageUrls.length && pageImageUrls[parsed]) {
                pageImage = pageImageUrls[parsed];
              }
            }
          }
          // Fallback: Nếu không có chỉ số trang rõ ràng, dùng logic phân bổ đều
          if (!pageImage && pageImageUrls.length > 0) {
            const totalQuestions = rawQuestions.length;
            const questionsPerPage = Math.ceil(totalQuestions / pageImageUrls.length);
            const calculatedPage = Math.min(Math.floor(i / (questionsPerPage || 1)), pageImageUrls.length - 1);
            pageImage = pageImageUrls[calculatedPage] || pageImageUrls[0];
          }

          const normalizeImage = (value: string) => {
            if (!value) return '';
            const trimmed = value.trim();
            // Detect various forms of "Cut Image" instruction from AI or bbox presence
            const isCutCommand = /\[?(CẮT ẢNH|CẮT ẢNH TỪ ĐỀ|CUT IMAGE|HÌNH ẢNH|IMAGE)\]?/i.test(trimmed);
            if (isCutCommand) return trimmed;
            if (trimmed.startsWith('<svg')) return trimmed;
            if (/^(http|https|data:image)/i.test(trimmed)) return trimmed;
            return trimmed;
          };

          const pickQuestionText = (...values: Array<unknown>) => {
            const stringValue = values.find((val) => typeof val === 'string' && val.trim().length > 0) as string | undefined;
            if (stringValue) return stringValue.trim();
            const numberValue = values.find((val) => typeof val === 'number');
            return typeof numberValue === 'number' ? String(numberValue).trim() : '';
          };

          const questionText = pickQuestionText(
            q.content,
            q.question,
            q.text,
            q.prompt,
            q.title,
            q.cauHoi,
            q.cau_hoi,
            q['câu hỏi']
          );
          const imageMarkerMatch = questionText ? questionText.match(/\[(HÌNH ẢNH|IMAGE|IMG|HÌNH|CẮT ẢNH|CẮT ẢNH TỪ ĐỀ):.*?\]/i) : null;
          const imageMarker = imageMarkerMatch ? imageMarkerMatch[0] : '';
          const questionImage = normalizeImage(q.image || imageMarker);
          const strippedQuestionText = imageMarker ? questionText.replace(imageMarker, '').trim() : questionText;
          const cleanedQuestionText = strippedQuestionText
            || questionText
            || (questionImage ? 'Xem hình và chọn đáp án đúng.' : 'Câu hỏi chưa rõ nội dung, vui lòng xem lại đề.');

          // Xử lý cắt ảnh nếu có bbox
          let finalImage = questionImage;
          if (q.bbox && Array.isArray(q.bbox) && q.bbox.length === 4 && pageImage) {
            try {
              finalImage = await cropImageFromBbox(pageImage, q.bbox);
            } catch (e) {
              console.warn("Failed to crop image", e);
            }
          }

          // Xử lý cắt ảnh cho options (NEW)
          const processedOptions = await Promise.all(normalizedOptions.map(async (opt: any) => {
            let optImage = normalizeImage(opt.image || '');
            if (opt.bbox && Array.isArray(opt.bbox) && opt.bbox.length === 4 && pageImage) {
              try {
                optImage = await cropImageFromBbox(pageImage, opt.bbox);
              } catch (e) {
                console.warn("Failed to crop option image", e);
              }
            }
            return { text: opt.text, image: optImage };
          }));

          return {
            id: q.id || `quiz - ${Date.now()} -${i} `,
            type: q.type || 'Trắc nghiệm',
            question: cleanedQuestionText, // QuizPlayer dùng 'question'
            image: finalImage,
            options: processedOptions,
            answer: q.answer || '',
            explanation: q.explanation || '',
            originalPageImage: pageImage // Lưu ảnh gốc để hỗ trợ cắt lại
          };
        }));
        setResult(formattedQuestions);
      } else {
        throw new Error("AI không trích xuất được câu hỏi nào hoặc định dạng trả về không đúng.");
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
        return [1, q.question || '', opts, q.answer || '', q.explanation || '', img];
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

    let gridHtml = `< div class="grid" style = "grid-template-columns: repeat(${size}, 1fr);" > `;
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const isActive = gridMap[r][c];
        gridHtml += `< div class="cell ${isActive ? 'active' : 'black'}" ></div > `;
      }
    }
    gridHtml += `</div > `;

    const html = `
  < !DOCTYPE html >
    <html>
      <head>
        <title>Ô chữ: ${topic}</title>
        <style>
          body {font - family: 'Times New Roman', serif; padding: 40px; max-width: 800px; margin: 0 auto; }
          h1 {text - align: center; text-transform: uppercase; color: #333; margin-bottom: 10px; }
          .sub-title {text - align: center; margin-bottom: 30px; font-style: italic; color: #666; }
          .container {display: flex; flex-direction: column; align-items: center; gap: 30px; }
          .grid {display: grid; border: 2px solid #333; width: 100%; max-width: 500px; aspect-ratio: 1/1; background: #333; gap: 1px; }
          .cell {background: #fff; position: relative; }
          .cell.black {background: #333; }
          .clues-container {width: 100%; display: grid; grid-template-columns: 1fr 1fr; gap: 40px; }
          .clues-col h3 {border - bottom: 2px solid #eee; padding-bottom: 10px; margin-bottom: 15px; }
          ul {list - style: none; padding: 0; }
          li {margin - bottom: 10px; line-height: 1.4; }
          .footer {margin - top: 50px; text-align: center; font-size: 12px; color: #999; border-top: 1px solid #eee; padding-top: 10px; }
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

  return (
    <div className="h-full flex flex-col space-y-6 animate-in fade-in duration-500 overflow-hidden">
      {showCropper && <ImageCropper onClose={() => { setShowCropper(false); setCroppingContext(null); }} initialSrc={croppingContext?.src} onCropComplete={croppingContext ? handleCropComplete : undefined} />}
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
                              <i className={`fas ${att.mimeType?.includes('pdf') ? 'fa-file-pdf text-rose-500' : 'fa-file-lines text-blue-500'} text-xl mb-1`}></i>
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
                      <div className="space-y-6 animate-in fade-in">
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
                    <div className="flex flex-col items-center">
                      <div className="relative group w-full max-w-lg aspect-video bg-black rounded-[32px] shadow-2xl border-4 border-white overflow-hidden">
                        <img
                          src={result}
                          alt="Video Scene"
                          className={`w - full h - full object - cover transition - transform duration - [20s] ease - linear ${isPlaying ? 'scale-125' : 'scale-100'} `}
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
                                className={`w - 16 h - 16 rounded - full flex items - center justify - center shadow - lg active: scale - 90 transition - all ${isPlaying ? 'bg-emerald-500 text-white animate-pulse' : 'bg-indigo-600 text-white hover:bg-indigo-700'} `}
                              >
                                <i className={`fas ${isPlaying ? 'fa-waveform' : 'fa-play'} text - xl ${!isPlaying && 'ml-1'} `}></i>
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
                              {isPlaying ? 'Đang phát giọng đọc...' : `Giọng ${voiceName === 'Kore' ? 'Nam' : 'Nữ'} • ${audioUrl ? 'Máy chủ' : 'Hệ thống'} `}
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
