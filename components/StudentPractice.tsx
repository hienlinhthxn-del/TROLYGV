
import React, { useState, useMemo, useRef } from 'react';
import { ExamQuestion } from '../types';
import { geminiService } from '../services/geminiService';

interface StudentPracticeProps {
  subject: string;
  grade: string;
  questions: ExamQuestion[];
  assignmentId: string | null;
  onExit: () => void;
  isStandalone?: boolean;
}

const StudentPractice: React.FC<StudentPracticeProps> = ({ subject, grade, questions, assignmentId, onExit, isStandalone = false }) => {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [startTime] = useState(Date.now());
  const [endTime, setEndTime] = useState<number | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const resultsContainerRef = useRef<HTMLDivElement>(null);
  const [studentName, setStudentName] = useState('');
  const [aiResults, setAiResults] = useState<Record<string, { isCorrect: boolean, feedback: string }>>({});
  const [isGrading, setIsGrading] = useState(false);
  const [strictness, setStrictness] = useState<'easy' | 'strict'>('easy');

  const currentQuestion = questions[currentIdx];
  const progress = ((currentIdx + 1) / questions.length) * 100;

  const handleSelectOption = (optionIdx: number) => {
    if (isSubmitted) return;
    const labels = ['A', 'B', 'C', 'D'];
    const newAnswers = { ...answers, [currentQuestion.id]: labels[optionIdx] };
    setAnswers(newAnswers);

    // Tự động chuyển câu sau 500ms nếu là trắc nghiệm
    if (currentIdx < questions.length - 1) {
      setTimeout(() => {
        setCurrentIdx(prev => prev + 1);
        scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      }, 500);
    }
  };

  const handleTextChange = (val: string) => {
    if (isSubmitted) return;
    setAnswers({ ...answers, [currentQuestion.id]: val });
  };

  const handleSubmit = async () => {
    if (!window.confirm("Em chắc chắn muốn nộp bài?")) return;

    setEndTime(Date.now());

    // Lọc câu hỏi tự luận để chấm bằng AI
    const essayQuestions = questions.filter(q => q.type !== 'Trắc nghiệm' || !q.options || q.options.length === 0);
    const hasEssayAnswers = essayQuestions.some(q => answers[q.id]?.trim());

    if (essayQuestions.length > 0 && hasEssayAnswers) {
      setIsGrading(true);
      try {
        const dataToGrade = essayQuestions.map(q => ({
          id: q.id,
          question: q.content,
          correctAnswer: q.answer,
          studentAnswer: answers[q.id] || '(Bỏ trống)'
        }));

        const strictnessInstruction = strictness === 'strict'
          ? "CHẾ ĐỘ KHẮT KHE: Yêu cầu câu trả lời phải chính xác, đầy đủ ý và đúng thuật ngữ. Nếu thiếu ý quan trọng hoặc diễn đạt sai lệch -> isCorrect: false. Nhận xét kỹ lỗi sai."
          : "CHẾ ĐỘ DỄ TÍNH: Khuyến khích học sinh. Chỉ cần trả lời đúng ý chính là được tính điểm (isCorrect: true). Bỏ qua lỗi chính tả hoặc diễn đạt chưa hay.";

        const prompt = `Bạn là giáo viên chấm bài. Hãy chấm điểm các câu trả lời tự luận sau.
        ${strictnessInstruction}
        
        Dữ liệu (JSON): ${JSON.stringify(dataToGrade)}
        Yêu cầu:
        1. So sánh "studentAnswer" với "correctAnswer".
        2. feedback: Nhận xét ngắn gọn, cụ thể, khích lệ (Tiếng Việt).
        Trả về JSON: { "results": [{ "id": "...", "isCorrect": boolean, "feedback": "..." }] }`;

        const response = await geminiService.generateText(prompt);
        const cleanJson = response.replace(/```json|```/g, '').trim();
        const parsed = JSON.parse(cleanJson);

        const newAiResults: Record<string, { isCorrect: boolean, feedback: string }> = {};
        if (parsed.results && Array.isArray(parsed.results)) {
          parsed.results.forEach((r: any) => {
            newAiResults[r.id] = { isCorrect: r.isCorrect, feedback: r.feedback };
          });
        }
        setAiResults(newAiResults);
      } catch (e) {
        console.error("AI Grading Error", e);
      } finally {
        setIsGrading(false);
      }
    }

    setIsSubmitted(true);
  };

  const results = useMemo(() => {
    if (!isSubmitted) return null;
    let correctCount = 0;
    const details = questions.map(q => {
      if (q.type !== 'Trắc nghiệm' || !q.options || q.options.length === 0) {
        // 1. Ưu tiên kết quả từ AI
        if (aiResults[q.id]) {
          const { isCorrect, feedback } = aiResults[q.id];
          if (isCorrect) correctCount++;
          return { id: q.id, isCorrect, correctAnswer: q.answer, userAnswer: answers[q.id], feedback };
        }

        // Logic chấm điểm Tự luận theo từ khóa
        const userAnswer = (answers[q.id] || '').trim();
        const correctAnswer = (q.answer || '').trim();
        let isCorrect = false;

        if (userAnswer && correctAnswer) {
          const normalize = (str: string) => str.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, " ").replace(/\s{2,}/g, " ").trim();
          const normUser = normalize(userAnswer);
          const normCorrect = normalize(correctAnswer);

          // 1. Khớp chính xác hoặc chứa đựng toàn bộ đáp án mẫu
          if (normUser === normCorrect || normUser.includes(normCorrect)) {
            isCorrect = true;
          } else {
            // 2. Khớp theo từ khóa/ý chính (tách bởi dấu phẩy/chấm phẩy hoặc khoảng trắng)
            const keywords = (correctAnswer.includes(',') || correctAnswer.includes(';'))
              ? correctAnswer.split(/[,;]/).map(k => normalize(k)).filter(k => k.length > 0)
              : normCorrect.split(' ').filter(w => w.length > 1);

            if (keywords.length > 0) {
              const matchCount = keywords.filter(k => normUser.includes(k)).length;
              // Nếu khớp >= 50% số từ khóa/ý -> Chấp nhận đúng
              if (matchCount / keywords.length >= 0.5) isCorrect = true;
            }
          }
        }

        if (isCorrect) correctCount++;
        return { id: q.id, isCorrect, correctAnswer: q.answer, userAnswer: answers[q.id], feedback: null };
      }

      // Lấy câu trả lời của người dùng ('A', 'B', 'C', 'D')
      const userAnswerLabel = (answers[q.id] || '').trim().toUpperCase();

      // --- Logic chấm điểm mới, mạnh mẽ hơn ---

      // 1. Tìm index của đáp án đúng trong q.options
      // Đáp án đúng 'q.answer' có thể là nhãn (A.) hoặc nội dung text của đáp án
      let correctOptionIndex = -1;

      const answerTextOnly = q.answer.replace(/^[A-E][\.\:]\s*/i, '').trim().toLowerCase();
      const answerLabelOnly = q.answer.match(/^[A-E][\.\:]/i)?.[0].toUpperCase().replace(/[\.\:]/, '') || '';

      correctOptionIndex = q.options.findIndex((opt, i) => {
        const optText = (typeof opt === 'string' ? opt : opt.text).trim().toLowerCase();
        const optLabel = String.fromCharCode('A'.charCodeAt(0) + i);

        // So khớp nhãn hoặc so khớp nội dung
        return optLabel === answerLabelOnly || optText === answerTextOnly;
      });

      // 3. So sánh câu trả lời của người dùng với vị trí đáp án đúng
      let isCorrect = false;
      if (correctOptionIndex !== -1) {
        const correctLabel = String.fromCharCode('A'.charCodeAt(0) + correctOptionIndex);
        if (userAnswerLabel === correctLabel) {
          isCorrect = true;
        }
      }

      if (isCorrect) correctCount++;
      return { id: q.id, isCorrect, correctAnswer: q.answer, userAnswer: answers[q.id], feedback: null };
    });
    const duration = endTime ? Math.floor((endTime - startTime) / 1000) : 0;
    return { correctCount, total: questions.length, duration, details };
  }, [isSubmitted, questions, answers, startTime, endTime, aiResults]);

  const renderQuestionImage = (imageSrc?: string) => {
    if (!imageSrc) return null;
    if (imageSrc.startsWith('<svg')) {
      return (
        <div className="my-6 p-6 bg-white rounded-[32px] border border-slate-100 flex justify-center shadow-inner" dangerouslySetInnerHTML={{ __html: imageSrc }} />
      );
    }
    return (
      <div className="my-6 p-6 bg-indigo-50 border border-indigo-100 rounded-[32px] flex items-start space-x-3">
        <i className="fas fa-circle-info text-indigo-400 mt-1"></i>
        <p className="text-sm font-medium text-indigo-700 italic leading-relaxed">{imageSrc}</p>
      </div>
    );
  };

  const handleGenerateSubmission = () => {
    if (!studentName.trim() && isStandalone) {
      alert("Em vui lòng nhập Họ và tên để Thầy Cô biết nhé!");
      return;
    }

    const score = (results!.correctCount / questions.length * 10).toFixed(1);

    // Nếu có assignmentId, tạo link nộp bài tự động
    if (assignmentId) {
      const submissionData = {
        aid: assignmentId,
        sid: studentName || 'Học sinh không tên',
        sc: score,
      };
      const encodedSubmission = btoa(JSON.stringify(submissionData));
      const submissionUrl = `${window.location.origin}${window.location.pathname}?submission=${encodedSubmission}`;

      navigator.clipboard.writeText(submissionUrl).then(() => {
        alert("✅ Đã sao chép LINK NỘP BÀI!\n\nEm hãy gửi link này cho Thầy Cô để được ghi điểm tự động nhé.");
      });
    } else {
      // Fallback: Nếu không có assignmentId (link đề cũ), dùng phương pháp copy mã
      const resultString = `#EDU_RESULT#:${studentName || 'Học sinh'}:${score}:${results!.correctCount}/${questions.length}`;
      navigator.clipboard.writeText(resultString).then(() => alert("✅ Đã sao chép KẾT QUẢ!\n\nEm hãy gửi mã này cho Thầy Cô nhé."));
    }
  };

  if (isSubmitted && results) {
    return (
      <div className="h-screen flex flex-col bg-slate-50 animate-in fade-in duration-500 overflow-hidden">
        <header className="bg-white border-b border-slate-200 px-8 py-4 flex items-center justify-between z-10 shrink-0">
          {!isStandalone && (
            <button onClick={onExit} className="flex items-center space-x-2 bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-xl transition-all shadow-sm">
              <i className="fas fa-arrow-left"></i>
              <span className="font-bold text-xs uppercase tracking-wider">Trở về</span>
            </button>
          )}
          {isStandalone && <div className="w-10"></div>} {/* Spacer */}
          <div>
            <h1 className="text-sm font-black text-slate-800 uppercase tracking-widest transition-all hover:text-indigo-600 cursor-default">Kết quả luyện tập</h1>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{subject}</p>
          </div>
          <div className="w-10"></div> {/* Spacer balance */}
        </header>

        <div ref={resultsContainerRef} className="flex-1 overflow-y-auto p-6 md:p-12 custom-scrollbar">
          <div className="w-full max-w-2xl mx-auto bg-white rounded-[40px] shadow-2xl border border-slate-100 p-10 text-center space-y-8 my-10">
            <div className="w-24 h-24 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center mx-auto text-4xl animate-bounce">
              <i className="fas fa-trophy"></i>
            </div>
            <div>
              <h2 className="text-3xl font-black text-slate-800">Kết quả luyện tập</h2>
              <p className="text-slate-400 font-bold uppercase tracking-widest mt-2">{results.correctCount === results.total ? 'Xuất sắc! Em đã làm đúng tất cả!' : 'Chúc mừng em đã hoàn thành bài tập!'}</p>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Điểm số</p>
                <p className="text-2xl font-black text-indigo-600">{(results.correctCount / results.total * 10).toFixed(1)}</p>
              </div>
              <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Số câu đúng</p>
                <p className="text-2xl font-black text-emerald-600">{results.correctCount}/{results.total}</p>
              </div>
              <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Thời gian</p>
                <p className="text-2xl font-black text-amber-600">{Math.floor(results.duration / 60)}:{String(results.duration % 60).padStart(2, '0')}</p>
              </div>
            </div>

            <div className="space-y-4 pt-4">
              <div className={`p-6 rounded-3xl border text-center space-y-4 ${assignmentId ? 'bg-indigo-50 border-indigo-100' : 'bg-amber-50 border-amber-100'}`}>
                <h4 className={`text-xs font-black uppercase tracking-widest ${assignmentId ? 'text-indigo-600' : 'text-amber-700'}`}>{assignmentId ? 'Nộp bài tự động' : 'Gửi kết quả thủ công'}</h4>
                <div className="flex flex-col sm:flex-row gap-3 items-center justify-center">
                  <input
                    type="text"
                    placeholder="Nhập Họ và tên của em..."
                    value={studentName}
                    onChange={(e) => setStudentName(e.target.value)}
                    className={`w-full sm:w-64 px-4 py-3 rounded-xl border text-sm font-bold outline-none ${assignmentId ? 'border-indigo-200 focus:ring-2 focus:ring-indigo-500' : 'border-amber-200 focus:ring-2 focus:ring-amber-500'}`}
                  />
                  <button
                    onClick={handleGenerateSubmission}
                    className={`w-full sm:w-auto px-6 py-3 text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-lg transition-all active:scale-95 whitespace-nowrap ${assignmentId ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-amber-600 hover:bg-amber-700'}`}
                  >
                    <i className="fas fa-paper-plane mr-2"></i>{assignmentId ? 'Lấy Link Nộp Bài' : 'Sao chép KQ'}
                  </button>
                </div>
                <p className={`text-[10px] font-medium ${assignmentId ? 'text-indigo-400' : 'text-amber-500'}`}>{assignmentId ? 'Nhập tên, nhấn nút và gửi LINK cho Thầy Cô qua Zalo/Tin nhắn.' : 'Nhập tên, nhấn nút và gửi MÃ cho Thầy Cô qua Zalo/Tin nhắn.'}</p>
              </div>

              <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100 text-left space-y-4">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Xem lại chi tiết bài làm</h4>
                {questions.map((q, idx) => (
                  <div key={q.id} className={`p-4 rounded-2xl border ${results.details[idx].isCorrect ? 'bg-emerald-50 border-emerald-100' : 'bg-rose-50 border-rose-100'}`}>
                    <p className="text-[13px] font-bold text-slate-800">Câu {idx + 1}: {q.content}</p>
                    <div className="mt-2 flex items-center space-x-4 text-[11px]">
                      <span className={results.details[idx].isCorrect ? 'text-emerald-600' : 'text-rose-600'}>
                        <i className={`fas ${results.details[idx].isCorrect ? 'fa-check-circle' : 'fa-times-circle'} mr-1`}></i>
                        {results.details[idx].isCorrect ? 'Đúng' : 'Chưa đúng'}
                      </span>
                      <span className="text-slate-500">Em chọn: <b>{answers[q.id] || 'Bỏ trống'}</b></span>
                      <span className="text-slate-500">Đáp án: <b>{q.answer}</b></span>
                    </div>
                    {q.explanation && !results.details[idx].isCorrect && (
                      <div className="mt-2 text-[10px] text-slate-500 italic border-t border-slate-200/50 pt-2">
                        Gợi ý: {q.explanation}
                      </div>
                    )}
                    {(results.details[idx] as any).feedback && (
                      <div className="mt-2 text-[11px] text-indigo-600 font-medium border-t border-indigo-100 pt-2 bg-indigo-50/50 p-2 rounded-lg animate-in fade-in">
                        <i className="fas fa-robot mr-1"></i>
                        Nhận xét AI: {(results.details[idx] as any).feedback}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex gap-4 pt-4">
                <button
                  onClick={() => { setIsSubmitted(false); setCurrentIdx(0); setAnswers({}); }}
                  className="flex-1 py-4 bg-indigo-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all active:scale-95"
                >
                  Luyện tập lại
                </button>
                {!isStandalone && (
                  <button onClick={onExit} className="flex-1 py-4 bg-white text-slate-500 rounded-2xl font-black text-[10px] uppercase tracking-widest border border-slate-200 hover:bg-slate-50 transition-all hover:text-indigo-600">
                    <i className="fas fa-home mr-2"></i>
                    Trở về màn hình chính
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-slate-50 animate-in fade-in duration-500 overflow-hidden">
      <header className="bg-white border-b border-slate-200 px-8 py-4 flex items-center justify-between z-10 shrink-0">
        <div className="flex items-center space-x-4">
          {!isStandalone && (
            <button onClick={onExit} className="w-10 h-10 flex items-center justify-center text-slate-400 hover:bg-slate-50 rounded-xl transition-all"><i className="fas fa-arrow-left"></i></button>
          )}
          {isStandalone && <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 font-black"><i className="fas fa-graduation-cap"></i></div>}

          <div>
            <h1 className="text-sm font-black text-slate-800 uppercase tracking-widest">Luyện tập: {subject} - Lớp {grade}</h1>
            <div className="flex items-center space-x-2 mt-1">
              <span className="text-[9px] font-black text-emerald-500 uppercase tracking-tighter bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-100">Live Practice</span>
              <span className="text-[9px] font-black text-slate-300 uppercase tracking-tighter">Câu {currentIdx + 1}/{questions.length}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center space-x-6">
          <div className="hidden md:flex flex-col items-end">
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Tiến độ hoàn thành</span>
            <div className="w-48 h-2 bg-slate-100 rounded-full mt-1 overflow-hidden">
              <div className="h-full bg-indigo-600 transition-all duration-500" style={{ width: `${progress}%` }}></div>
            </div>
          </div>

          {!isSubmitted && questions.some(q => q.type !== 'Trắc nghiệm') && (
            <div className="hidden sm:flex items-center space-x-1 bg-slate-100 p-1 rounded-lg border border-slate-200">
              <button onClick={() => setStrictness('easy')} className={`px-3 py-1.5 rounded-md text-[10px] font-bold uppercase transition-all ${strictness === 'easy' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
                Dễ tính
              </button>
              <button onClick={() => setStrictness('strict')} className={`px-3 py-1.5 rounded-md text-[10px] font-bold uppercase transition-all ${strictness === 'strict' ? 'bg-white text-rose-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
                Khắt khe
              </button>
            </div>
          )}

          <button onClick={handleSubmit} disabled={isGrading} className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all active:scale-95 disabled:opacity-70 disabled:cursor-wait">
            {isGrading ? <i className="fas fa-spinner fa-spin mr-2"></i> : null}
            {isGrading ? 'Đang chấm...' : 'Nộp bài'}
          </button>
        </div>
      </header>

      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-6 md:p-12 flex flex-col items-center custom-scrollbar">
        <div className="w-full max-w-3xl space-y-8 mb-24">
          <div className="bg-white p-10 rounded-[40px] shadow-sm border border-slate-200 space-y-8 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-50/50 rounded-full -mr-16 -mt-16 blur-2xl"></div>

            <div className="flex items-center space-x-3 relative z-10">
              <div className="w-10 h-10 bg-slate-900 text-white rounded-2xl flex items-center justify-center font-black text-sm">
                {currentIdx + 1}
              </div>
              <span className="text-[10px] font-black text-indigo-600 uppercase tracking-[0.2em]">{currentQuestion.type}</span>
            </div>

            <p className="text-xl md:text-2xl font-bold text-slate-800 leading-relaxed relative z-10">
              {currentQuestion.content}
            </p>

            {renderQuestionImage(currentQuestion.image)}

            {currentQuestion.type === 'Trắc nghiệm' ? (
              <div className="grid grid-cols-1 gap-3 relative z-10">
                {currentQuestion.options?.map((opt, i) => {
                  const label = ['A', 'B', 'C', 'D', 'E', 'F'][i];
                  const isSelected = answers[currentQuestion.id] === label;
                  const optText = typeof opt === 'string' ? opt : opt.text;
                  const optImg = typeof opt === 'string' ? '' : opt.image;

                  return (
                    <button
                      key={i}
                      onClick={() => handleSelectOption(i)}
                      className={`flex flex-col p-5 rounded-3xl border-2 text-left transition-all ${isSelected ? 'bg-indigo-600 border-indigo-600 text-white shadow-xl shadow-indigo-100 scale-[1.02]' : 'bg-white border-slate-100 text-slate-600 hover:border-indigo-200 hover:bg-indigo-50/30'}`}
                    >
                      <div className="flex items-center w-full">
                        <span className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-black mr-4 ${isSelected ? 'bg-white/20' : 'bg-slate-50'}`}>{label}</span>
                        <span className="text-[17px] font-bold flex-1">{optText}</span>
                      </div>
                      {optImg && (
                        <div className="mt-4 w-full">
                          {renderQuestionImage(optImg)}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="relative z-10">
                <textarea
                  value={answers[currentQuestion.id] || ''}
                  onChange={(e) => handleTextChange(e.target.value)}
                  placeholder="Nhập câu trả lời của em tại đây..."
                  className="w-full h-48 bg-slate-50 border-2 border-slate-100 rounded-3xl p-6 text-[15px] font-medium text-slate-700 focus:bg-white focus:border-indigo-400 outline-none transition-all resize-none"
                />
              </div>
            )}
          </div>

          <div className="flex items-center justify-between px-4 pb-10">
            <button
              disabled={currentIdx === 0}
              onClick={() => { setCurrentIdx(prev => prev - 1); scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' }); }}
              className="flex items-center space-x-3 px-6 py-3 bg-white text-slate-600 rounded-2xl font-black text-[12px] uppercase tracking-widest shadow-sm border border-slate-100 disabled:opacity-20 transition-all hover:bg-slate-50"
            >
              <i className="fas fa-chevron-left text-indigo-500"></i>
              <span>Câu trước</span>
            </button>

            <div className="hidden sm:flex space-x-3">
              {questions.map((_, i) => (
                <button
                  key={i}
                  onClick={() => { setCurrentIdx(i); scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' }); }}
                  className={`w-10 h-10 rounded-xl font-black text-xs transition-all border ${i === currentIdx ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg scale-110' : answers[questions[i].id] ? 'bg-emerald-50 border-emerald-200 text-emerald-600' : 'bg-white border-slate-200 text-slate-400 hover:border-indigo-300'}`}
                >
                  {i + 1}
                </button>
              ))}
            </div>

            <button
              disabled={currentIdx === questions.length - 1}
              onClick={() => { setCurrentIdx(prev => prev + 1); scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' }); }}
              className="flex items-center space-x-3 px-6 py-3 bg-indigo-600 text-white rounded-2xl font-black text-[12px] uppercase tracking-widest shadow-xl shadow-indigo-100 disabled:opacity-20 transition-all hover:bg-indigo-700"
            >
              <span>Câu tiếp</span>
              <i className="fas fa-chevron-right"></i>
            </button>
          </div>
        </div>
      </div>

      <footer className="bg-white border-t border-slate-100 px-8 py-4 text-center">
        <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.3em]">Hệ thống luyện tập EduAssist AI v2.0</p>
      </footer>
    </div>
  );
};

export default StudentPractice;
