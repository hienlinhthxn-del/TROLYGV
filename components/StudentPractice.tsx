
import React, { useState, useMemo } from 'react';
import { ExamQuestion } from '../types';

interface StudentPracticeProps {
  subject: string;
  grade: string;
  questions: ExamQuestion[];
  onExit: () => void;
}

const StudentPractice: React.FC<StudentPracticeProps> = ({ subject, grade, questions, onExit }) => {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [startTime] = useState(Date.now());
  const [endTime, setEndTime] = useState<number | null>(null);

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
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }, 500);
    }
  };

  const handleTextChange = (val: string) => {
    if (isSubmitted) return;
    setAnswers({ ...answers, [currentQuestion.id]: val });
  };

  const handleSubmit = () => {
    if (window.confirm("Em chắc chắn muốn nộp bài?")) {
      setIsSubmitted(true);
      setEndTime(Date.now());
    }
  };

  const results = useMemo(() => {
    if (!isSubmitted) return null;
    let correctCount = 0;
    const details = questions.map(q => {
      const isCorrect = q.type === 'Trắc nghiệm' ? answers[q.id] === q.answer : null;
      if (isCorrect) correctCount++;
      return { id: q.id, isCorrect };
    });
    const duration = endTime ? Math.floor((endTime - startTime) / 1000) : 0;
    return { correctCount, total: questions.length, duration, details };
  }, [isSubmitted, questions, answers, startTime, endTime]);

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

  if (isSubmitted && results) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-6 bg-slate-50 animate-in fade-in duration-500 overflow-y-auto">
        <div className="w-full max-w-2xl bg-white rounded-[40px] shadow-2xl border border-slate-100 p-10 text-center space-y-8">
          <div className="w-24 h-24 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center mx-auto text-4xl animate-bounce">
            <i className="fas fa-trophy"></i>
          </div>
          <div>
            <h2 className="text-3xl font-black text-slate-800">Kết quả luyện tập</h2>
            <p className="text-slate-400 font-bold uppercase tracking-widest mt-2">Chúc mừng em đã hoàn thành bài tập!</p>
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
            <button
              onClick={() => { setIsSubmitted(false); setCurrentIdx(0); setAnswers({}); }}
              className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all active:scale-95"
            >
              Luyện tập lại
            </button>
            <button onClick={onExit} className="w-full py-4 bg-white text-slate-400 rounded-2xl font-black text-[10px] uppercase tracking-widest border border-slate-100 hover:bg-slate-50 transition-all">
              Thoát giao diện học sinh
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-slate-50 animate-in fade-in duration-500 overflow-hidden">
      <header className="bg-white border-b border-slate-200 px-8 py-4 flex items-center justify-between z-10">
        <div className="flex items-center space-x-4">
          <button onClick={onExit} className="w-10 h-10 flex items-center justify-center text-slate-400 hover:bg-slate-50 rounded-xl transition-all"><i className="fas fa-arrow-left"></i></button>
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
          <button onClick={handleSubmit} className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all active:scale-95">Nộp bài</button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6 md:p-12 flex flex-col items-center custom-scrollbar">
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
                  const label = ['A', 'B', 'C', 'D'][i];
                  const isSelected = answers[currentQuestion.id] === label;
                  return (
                    <button
                      key={i}
                      onClick={() => handleSelectOption(i)}
                      className={`flex items-center p-5 rounded-2xl border-2 text-left transition-all ${isSelected ? 'bg-indigo-600 border-indigo-600 text-white shadow-xl shadow-indigo-100 scale-[1.02]' : 'bg-white border-slate-100 text-slate-600 hover:border-indigo-200 hover:bg-indigo-50/30'}`}
                    >
                      <span className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-black mr-4 ${isSelected ? 'bg-white/20' : 'bg-slate-50'}`}>{label}</span>
                      <span className="text-[15px] font-bold">{opt}</span>
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
              onClick={() => { setCurrentIdx(prev => prev - 1); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
              className="flex items-center space-x-3 px-6 py-3 bg-white text-slate-600 rounded-2xl font-black text-[12px] uppercase tracking-widest shadow-sm border border-slate-100 disabled:opacity-20 transition-all hover:bg-slate-50"
            >
              <i className="fas fa-chevron-left text-indigo-500"></i>
              <span>Câu trước</span>
            </button>

            <div className="hidden sm:flex space-x-3">
              {questions.map((_, i) => (
                <button
                  key={i}
                  onClick={() => { setCurrentIdx(i); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                  className={`w-10 h-10 rounded-xl font-black text-xs transition-all border ${i === currentIdx ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg scale-110' : answers[questions[i].id] ? 'bg-emerald-50 border-emerald-200 text-emerald-600' : 'bg-white border-slate-200 text-slate-400 hover:border-indigo-300'}`}
                >
                  {i + 1}
                </button>
              ))}
            </div>

            <button
              disabled={currentIdx === questions.length - 1}
              onClick={() => { setCurrentIdx(prev => prev + 1); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
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
