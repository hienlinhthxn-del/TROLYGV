
import React, { useState, useMemo, useRef } from 'react';
import { Classroom, Student, Grade } from '../types';

interface ClassroomManagerProps {
  classroom: Classroom;
  onUpdate: (updatedClassroom: Classroom) => void;
  onAIAssist?: (prompt: string) => void;
}

const ClassroomManager: React.FC<ClassroomManagerProps> = ({ classroom, onUpdate, onAIAssist }) => {
  const [activeTab, setActiveTab] = useState<'students' | 'attendance' | 'assignments' | 'reports'>('students');
  const [newStudentName, setNewStudentName] = useState('');
  const [newStudentCode, setNewStudentCode] = useState('');
  const [newStudentGender, setNewStudentGender] = useState<'Nam' | 'Nữ'>('Nam');
  const [studentSearchQuery, setStudentSearchQuery] = useState('');
  const [studentSortBy, setStudentSortBy] = useState<'name' | 'code'>('name');
  const [isImporting, setIsImporting] = useState(false);
  const [isExportingSMAS, setIsExportingSMAS] = useState(false);
  
  const [isEditingName, setIsEditingName] = useState(false);
  const [tempClassName, setTempClassName] = useState(classroom.name);
  
  const gradeFileInputRef = useRef<HTMLInputElement>(null);
  const studentFileInputRef = useRef<HTMLInputElement>(null);

  const stats = useMemo(() => {
    const totalStudents = classroom.students.length;
    const totalAssignments = classroom.assignments.length;
    
    let attendanceRate = 0;
    if (classroom.attendance.length > 0 && totalStudents > 0) {
      const totalPresent = classroom.attendance.reduce((sum, record) => sum + record.present.length, 0);
      attendanceRate = (totalPresent / (classroom.attendance.length * totalStudents)) * 100;
    }

    const latestAssignment = classroom.assignments[classroom.assignments.length - 1];
    const distribution = { excellent: 0, good: 0, average: 0, weak: 0 };
    
    if (latestAssignment && latestAssignment.grades.length > 0) {
      latestAssignment.grades.forEach(g => {
        const score = parseFloat(g.score);
        if (score >= 9) distribution.excellent++;
        else if (score >= 7) distribution.good++;
        else if (score >= 5) distribution.average++;
        else distribution.weak++;
      });
    }

    return { totalStudents, totalAssignments, attendanceRate, distribution, latestAssignment };
  }, [classroom]);

  const filteredStudents = useMemo(() => {
    const query = studentSearchQuery.toLowerCase().trim();
    let result = [...classroom.students];
    if (query) {
      result = result.filter(s => 
        s.name.toLowerCase().includes(query) || 
        s.code.toLowerCase().includes(query)
      );
    }
    result.sort((a, b) => {
      if (studentSortBy === 'name') {
        return a.name.localeCompare(b.name, 'vi');
      }
      return a.code.localeCompare(b.code);
    });
    return result;
  }, [classroom.students, studentSearchQuery, studentSortBy]);

  const handleExportSMAS = () => {
    if (classroom.students.length === 0) {
      alert("Lớp học chưa có dữ liệu học sinh.");
      return;
    }

    setIsExportingSMAS(true);
    setTimeout(() => {
      try {
        const latestAssignment = stats.latestAssignment;
        let csvContent = "\uFEFF";
        csvContent += "Mã học sinh,Họ và tên,Giới tính,Điểm số,Nhận xét chuyên môn\n";
        
        filteredStudents.forEach(s => {
          const grade = latestAssignment?.grades.find(g => g.studentId === s.id);
          const score = grade?.score || "";
          const feedback = (grade?.feedback || "").replace(/,/g, ';');
          csvContent += `${s.code},${s.name},${s.gender},${score},${feedback}\n`;
        });

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `Du_lieu_SMAS_${classroom.name.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0,10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        alert("Đã xuất tệp dữ liệu chuẩn SMAS thành công.");
      } catch (err) {
        console.error(err);
        alert("Có lỗi xảy ra khi xuất dữ liệu.");
      } finally {
        setIsExportingSMAS(false);
      }
    }, 800);
  };

  const handleGradeFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const lines = text.split('\n');
      
      const newGrades: Grade[] = [];
      lines.forEach(line => {
        const parts = line.split(',').map(s => s.trim());
        if (parts.length >= 2) {
          const [code, score] = parts;
          const student = classroom.students.find(s => s.code === code);
          if (student && score) {
            newGrades.push({
              studentId: student.id,
              score: score,
              feedback: ''
            });
          }
        }
      });

      if (newGrades.length > 0) {
        const updatedAssignments = [...classroom.assignments];
        if (updatedAssignments.length === 0) {
          updatedAssignments.push({
            id: Date.now().toString(),
            title: 'Bài tập nhập từ File',
            dueDate: new Date().toISOString().split('T')[0],
            status: 'Đã đóng',
            submissions: [],
            grades: newGrades
          });
        } else {
          const lastIdx = updatedAssignments.length - 1;
          updatedAssignments[lastIdx] = {
            ...updatedAssignments[lastIdx],
            grades: [...updatedAssignments[lastIdx].grades, ...newGrades]
          };
        }
        onUpdate({ ...classroom, assignments: updatedAssignments });
        alert(`Đã nhập thành công điểm cho ${newGrades.length} học sinh.`);
      } else {
        alert("Không tìm thấy dữ liệu hợp lệ. Vui lòng kiểm tra định dạng (MãHS, Điểm)");
      }
      setIsImporting(false);
      if (gradeFileInputRef.current) gradeFileInputRef.current.value = '';
    };
    reader.readAsText(file);
  };

  const handleStudentListUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const lines = text.split('\n').filter(l => l.trim());
        
        const newStudents: Student[] = [];
        let startIndex = 0;
        
        if (lines[0].toLowerCase().includes('họ và tên') || lines[0].toLowerCase().includes('mã')) {
          startIndex = 1;
        }

        for (let i = startIndex; i < lines.length; i++) {
          const parts = lines[i].split(',').map(s => s.trim());
          if (parts.length >= 2) {
            const [code, name, genderRaw] = parts;
            const gender: 'Nam' | 'Nữ' = (genderRaw === 'Nữ' || genderRaw === 'nữ' || genderRaw === 'F') ? 'Nữ' : 'Nam';
            
            newStudents.push({
              id: (Date.now() + i).toString(),
              name: name,
              code: code || `HS${(classroom.students.length + newStudents.length + 1).toString().padStart(3, '0')}`,
              gender: gender
            });
          } else if (parts.length === 1 && parts[0]) {
            newStudents.push({
              id: (Date.now() + i).toString(),
              name: parts[0],
              code: `HS${(classroom.students.length + newStudents.length + 1).toString().padStart(3, '0')}`,
              gender: 'Nam'
            });
          }
        }

        if (newStudents.length > 0) {
          onUpdate({ ...classroom, students: [...classroom.students, ...newStudents] });
          alert(`Đã thêm thành công ${newStudents.length} học sinh mới.`);
        } else {
          alert("Không tìm thấy dữ liệu hợp lệ. Định dạng chuẩn: Mã HS, Họ và tên, Giới tính");
        }
      } catch (err) {
        alert("Lỗi khi đọc file. Vui lòng kiểm tra lại định dạng tệp.");
      } finally {
        setIsImporting(false);
        if (studentFileInputRef.current) studentFileInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  const handleSaveClassName = () => {
    const trimmedName = tempClassName.trim();
    if (trimmedName && trimmedName !== classroom.name) {
      onUpdate({ ...classroom, name: trimmedName });
    } else {
      setTempClassName(classroom.name);
    }
    setIsEditingName(false);
  };

  const handleCancelEditName = () => {
    setTempClassName(classroom.name);
    setIsEditingName(false);
  };

  const addStudent = () => {
    if (!newStudentName.trim()) return;
    
    let code = newStudentCode.trim();
    if (!code) {
      const existingCodes = new Set(classroom.students.map(s => s.code));
      let nextNum = classroom.students.length + 1;
      let generated = `HS${nextNum.toString().padStart(3, '0')}`;
      
      while (existingCodes.has(generated)) {
        nextNum++;
        generated = `HS${nextNum.toString().padStart(3, '0')}`;
      }
      code = generated;
    }

    const newStudent: Student = {
      id: Date.now().toString(),
      name: newStudentName,
      code,
      gender: newStudentGender
    };
    onUpdate({ ...classroom, students: [...classroom.students, newStudent] });
    setNewStudentName('');
    setNewStudentCode('');
    setNewStudentGender('Nam');
  };

  const removeStudent = (id: string) => {
    if (window.confirm('Xóa học sinh này?')) {
      onUpdate({ ...classroom, students: classroom.students.filter(s => s.id !== id) });
    }
  };

  const handleGenerateAIReview = () => {
    if (!onAIAssist) return;

    const latestAssignment = stats.latestAssignment;
    let studentDataText = '';

    studentDataText = filteredStudents.map(s => {
      const grade = latestAssignment?.grades.find(g => g.studentId === s.id);
      return `- ${s.name} (${s.code}): ${grade ? `Điểm ${grade.score}. ${grade.feedback || ''}` : 'Chưa có điểm'}`;
    }).join('\n');

    const prompt = `Dựa trên danh sách điểm số của lớp ${classroom.name}, hãy soạn nhận xét học bạ định kỳ chuẩn Thông tư 27/2020/TT-BGDĐT.

Dữ liệu học sinh & điểm số (đã sắp xếp):
${studentDataText}

Yêu cầu:
1. Đánh giá mức độ Hoàn thành (HTT/HT/CHT) chính xác theo điểm số.
2. Viết nhận xét cá nhân hóa, khích lệ sự tiến bộ.
3. Trình bày rõ ràng theo từng học sinh.`;

    onAIAssist(prompt);
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden animate-in fade-in duration-500">
      <input type="file" ref={gradeFileInputRef} onChange={handleGradeFileUpload} accept=".csv,.txt" className="hidden" />
      <input type="file" ref={studentFileInputRef} onChange={handleStudentListUpload} accept=".csv,.txt" className="hidden" />

      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-slate-100">
        <div className="flex-1 min-w-0 mr-4">
          {isEditingName ? (
            <div className="flex items-center space-x-2 animate-in slide-in-from-left-2 duration-300">
              <input 
                autoFocus
                type="text" 
                value={tempClassName} 
                onChange={(e) => setTempClassName(e.target.value)}
                onBlur={handleSaveClassName}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveClassName();
                    if (e.key === 'Escape') handleCancelEditName();
                }}
                className="text-sm font-black text-slate-800 uppercase tracking-widest bg-slate-50 border border-indigo-200 rounded-lg px-2 py-1 outline-none focus:ring-2 focus:ring-indigo-500 w-full max-w-xs"
              />
              <button onMouseDown={(e) => e.preventDefault()} onClick={handleSaveClassName} className="text-emerald-500 hover:text-emerald-600 p-1">
                <i className="fas fa-check"></i>
              </button>
              <button onMouseDown={(e) => e.preventDefault()} onClick={handleCancelEditName} className="text-rose-500 hover:text-rose-600 p-1">
                <i className="fas fa-times"></i>
              </button>
            </div>
          ) : (
            <div className="group flex items-center space-x-2 cursor-pointer" onClick={() => { setTempClassName(classroom.name); setIsEditingName(true); }}>
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest truncate">
                {classroom.name}
              </h3>
              <i className="fas fa-pen text-[10px] text-slate-300 group-hover:text-indigo-500 transition-colors"></i>
            </div>
          )}
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">Hệ thống Quản lý Sư phạm</p>
        </div>
        <div className="flex space-x-2 shrink-0">
           <button 
             onClick={() => gradeFileInputRef.current?.click()}
             className="px-4 py-2 rounded-xl bg-amber-50 text-amber-700 text-[10px] font-black uppercase tracking-widest border border-amber-200 hover:bg-amber-100 transition-all"
           >
              <i className="fas fa-file-invoice mr-2"></i>Nhập điểm File
           </button>
           <button 
             onClick={handleExportSMAS}
             disabled={isExportingSMAS}
             className="px-4 py-2 rounded-xl bg-emerald-50 text-emerald-700 text-[10px] font-black uppercase tracking-widest border border-emerald-200 hover:bg-emerald-100 transition-all"
           >
              <i className={`fas ${isExportingSMAS ? 'fa-spinner fa-spin' : 'fa-file-excel'} mr-2`}></i>Xuất SMAS
           </button>
           <button onClick={() => setActiveTab('reports')} className="px-4 py-2 rounded-xl bg-indigo-50 text-indigo-600 text-[10px] font-black uppercase tracking-widest border border-indigo-200 hover:bg-indigo-100 transition-all">
              <i className="fas fa-chart-pie mr-2"></i>Báo cáo AI
           </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-100 p-2 space-x-1 bg-slate-50/50">
        {['students', 'attendance', 'assignments', 'reports'].map(tab => (
          <button 
            key={tab}
            onClick={() => setActiveTab(tab as any)}
            className={`flex-1 py-2.5 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${activeTab === tab ? 'bg-white text-indigo-600 shadow-sm border border-slate-100' : 'text-slate-400 hover:text-slate-600'}`}
          >
            <i className={`fas fa-${tab === 'students' ? 'users' : tab === 'attendance' ? 'calendar-check' : tab === 'assignments' ? 'tasks' : 'chart-simple'} mr-2`}></i>
            {tab === 'students' ? 'Học sinh' : tab === 'attendance' ? 'Điểm danh' : tab === 'assignments' ? 'Bài tập' : 'Thống kê'}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
        {activeTab === 'reports' && (
          <div className="space-y-8 animate-in fade-in duration-500">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
               <div className="bg-indigo-600 p-6 rounded-[32px] text-white shadow-xl shadow-indigo-100">
                  <p className="text-[10px] font-black uppercase tracking-widest opacity-80">Tổng sĩ số</p>
                  <h4 className="text-4xl font-black mt-1">{stats.totalStudents}</h4>
                  <p className="text-[10px] font-bold mt-2 opacity-60">Thành viên lớp</p>
               </div>
               <div className="bg-emerald-600 p-6 rounded-[32px] text-white shadow-xl shadow-emerald-100">
                  <p className="text-[10px] font-black uppercase tracking-widest opacity-80">Chuyên cần</p>
                  <h4 className="text-4xl font-black mt-1">{stats.attendanceRate.toFixed(1)}%</h4>
                  <p className="text-[10px] font-bold mt-2 opacity-60">Tỷ lệ hiện diện</p>
               </div>
               <div className="bg-slate-900 p-6 rounded-[32px] text-white shadow-xl">
                  <p className="text-[10px] font-black uppercase tracking-widest opacity-80">Bài đã nhập</p>
                  <h4 className="text-4xl font-black mt-1">
                    {stats.latestAssignment?.grades.length || 0}
                  </h4>
                  <p className="text-[10px] font-bold mt-2 opacity-60">Dữ liệu điểm mới nhất</p>
               </div>
            </div>

            <div className="bg-white p-8 rounded-[40px] border border-slate-200 shadow-sm">
               <div className="flex items-center justify-between mb-8">
                  <div>
                    <h4 className="text-lg font-black text-slate-800">Phổ điểm học tập</h4>
                    <p className="text-xs text-slate-400 font-medium">Biểu đồ đánh giá năng lực học sinh</p>
                  </div>
                  <div className="px-4 py-2 bg-slate-50 border border-slate-100 rounded-xl text-[10px] font-black uppercase text-slate-500">
                     {stats.latestAssignment?.title || 'Chưa có bài tập'}
                  </div>
               </div>

               <div className="flex items-end justify-between h-48 px-4 border-b border-slate-100 mb-4">
                  {[
                    { label: 'Giỏi (9-10)', val: stats.distribution.excellent, color: 'bg-indigo-500' },
                    { label: 'Khá (7-8)', val: stats.distribution.good, color: 'bg-emerald-500' },
                    { label: 'TB (5-6)', val: stats.distribution.average, color: 'bg-amber-500' },
                    { label: 'Yếu (<5)', val: stats.distribution.weak, color: 'bg-rose-500' }
                  ].map((item, i) => {
                    const height = stats.totalStudents > 0 ? (item.val / stats.totalStudents) * 100 : 0;
                    return (
                      <div key={i} className="flex flex-col items-center flex-1 group">
                         <div className="mb-2 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-800 text-white text-[10px] px-2 py-1 rounded font-bold">
                            {item.val} HS
                         </div>
                         <div 
                           className={`w-12 sm:w-16 rounded-t-2xl ${item.color} transition-all duration-1000 shadow-lg`} 
                           style={{ height: `${Math.max(height, 5)}%` }}
                         ></div>
                         <span className="mt-3 text-[9px] font-black text-slate-400 uppercase tracking-tighter text-center">{item.label}</span>
                      </div>
                    );
                  })}
               </div>
            </div>

            <div className="bg-indigo-600 p-8 rounded-[40px] text-white flex flex-col md:flex-row items-center justify-between gap-6 shadow-2xl shadow-indigo-200">
               <div className="flex items-center space-x-5">
                  <div className="w-16 h-16 bg-white/20 backdrop-blur-md rounded-3xl flex items-center justify-center border border-white/20">
                     <i className="fas fa-wand-magic-sparkles text-2xl"></i>
                  </div>
                  <div>
                     <h4 className="text-xl font-black">Trợ lý Nhận xét AI</h4>
                     <p className="text-[11px] text-indigo-100 opacity-80 mt-1">Viết nhận xét học bạ Thông tư 27 dựa trên điểm số vừa tải lên</p>
                  </div>
               </div>
               <div className="flex flex-col sm:flex-row gap-3">
                 <button 
                   onClick={handleGenerateAIReview}
                   className="px-8 py-4 bg-white text-indigo-600 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-indigo-50 transition-all active:scale-95 shadow-xl"
                 >
                   Tạo Nhận xét AI
                 </button>
               </div>
            </div>
          </div>
        )}

        {activeTab === 'students' && (
          <div className="space-y-6">
             <div className="flex flex-col md:flex-row items-stretch gap-4 p-6 bg-indigo-50/50 rounded-[32px] border border-indigo-100">
                <div className="flex-1 space-y-3">
                   <h4 className="text-[10px] font-black text-indigo-600 uppercase tracking-widest ml-1">Thêm học sinh mới</h4>
                   <div className="flex flex-col sm:flex-row gap-2">
                      <input 
                        type="text" 
                        placeholder="Tên học sinh..."
                        value={newStudentName}
                        onChange={e => setNewStudentName(e.target.value)}
                        className="flex-1 bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
                      />
                      <input 
                        type="text" 
                        placeholder="Mã số (Để trống để tự tạo)"
                        value={newStudentCode}
                        onChange={e => setNewStudentCode(e.target.value)}
                        className="w-full sm:w-48 bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
                      />
                      <button onClick={addStudent} className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg hover:bg-indigo-700 transition-all active:scale-95">Thêm</button>
                   </div>
                </div>
                <div className="w-px bg-indigo-100 hidden md:block mx-2"></div>
                <div className="flex flex-col justify-center space-y-2">
                   <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nhập danh sách nhanh</h4>
                   <button 
                     onClick={() => studentFileInputRef.current?.click()}
                     className="px-6 py-3 bg-white text-indigo-600 border-2 border-dashed border-indigo-200 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-50 hover:border-indigo-400 transition-all flex items-center justify-center"
                   >
                      <i className="fas fa-users-medical mr-2"></i>Tải lên Danh sách HS
                   </button>
                   <p className="text-[8px] text-slate-400 font-bold uppercase text-center">Định dạng: Mã HS, Tên, Giới tính</p>
                </div>
             </div>

             <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 py-2 px-1">
                <div className="relative flex-1 max-w-md">
                   <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
                   <input 
                     type="text"
                     placeholder="Tìm kiếm tên hoặc mã số..."
                     value={studentSearchQuery}
                     onChange={e => setStudentSearchQuery(e.target.value)}
                     className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-100 rounded-2xl text-[11px] font-bold text-slate-600 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                   />
                </div>
                <div className="flex items-center space-x-1 bg-slate-50 p-1 rounded-2xl border border-slate-100">
                   <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-3">Xếp theo:</span>
                   <button 
                     onClick={() => setStudentSortBy('name')}
                     className={`px-4 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-tighter transition-all ${studentSortBy === 'name' ? 'bg-white text-indigo-600 shadow-sm border border-slate-100' : 'text-slate-400 hover:text-slate-600'}`}
                   >
                     Tên (A-Z)
                   </button>
                   <button 
                     onClick={() => setStudentSortBy('code')}
                     className={`px-4 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-tighter transition-all ${studentSortBy === 'code' ? 'bg-white text-indigo-600 shadow-sm border border-slate-100' : 'text-slate-400 hover:text-slate-600'}`}
                   >
                     Mã số
                   </button>
                </div>
             </div>

             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredStudents.length > 0 ? (
                  filteredStudents.map(s => (
                    <div key={s.id} className="p-4 bg-white border border-slate-100 rounded-[28px] flex items-center justify-between group hover:border-indigo-300 hover:shadow-xl hover:shadow-indigo-50 transition-all animate-in fade-in duration-300">
                       <div className="flex items-center space-x-3">
                          <div className={`w-10 h-10 rounded-2xl flex items-center justify-center text-[10px] font-black shadow-sm ${s.gender === 'Nam' ? 'bg-blue-50 text-blue-600 border border-blue-100' : 'bg-rose-50 text-rose-600 border border-rose-100'}`}>
                             {s.name.split(' ').pop()?.charAt(0) || s.name.charAt(0)}
                          </div>
                          <div>
                             <p className="text-[13px] font-black text-slate-800 leading-tight">{s.name}</p>
                             <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">{s.code}</p>
                          </div>
                       </div>
                       <button onClick={() => removeStudent(s.id)} className="w-8 h-8 flex items-center justify-center text-slate-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-all rounded-xl hover:bg-rose-50">
                          <i className="fas fa-trash-alt text-xs"></i>
                       </button>
                    </div>
                  ))
                ) : (
                  <div className="col-span-full py-20 flex flex-col items-center justify-center opacity-30 border-2 border-dashed border-slate-100 rounded-[48px] bg-slate-50/50">
                     <div className="w-16 h-16 bg-white rounded-3xl flex items-center justify-center mb-4 shadow-sm text-slate-300">
                        <i className="fas fa-users-slash text-2xl"></i>
                     </div>
                     <p className="text-[11px] font-black uppercase tracking-[0.3em]">Danh sách học sinh đang trống</p>
                  </div>
                )}
             </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ClassroomManager;
