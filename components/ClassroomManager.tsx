
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Classroom, Student, Grade, DailyLogEntry, Attachment, PeriodicEvaluation, ExamQuestion } from '../types';
import { geminiService, FilePart } from '../services/geminiService';

interface ClassroomManagerProps {
  classroom: Classroom;
  onUpdate: (updatedClassroom: Classroom) => void;
  onAIAssist?: (prompt: string, attachments?: Attachment[]) => void;
}

const SUBJECTS_LIST = [
  'Tiếng Việt', 'Toán', 'Đạo đức', 'Tự nhiên và Xã hội',
  'Khoa học', 'Lịch sử và Địa lí', 'Tin học', 'Công nghệ',
  'Giáo dục thể chất', 'Âm nhạc', 'Mỹ thuật', 'Hoạt động trải nghiệm'
];

const QUALITIES_LIST = ['Yêu nước', 'Nhân ái', 'Chăm chỉ', 'Trung thực', 'Trách nhiệm'];

const COMPETENCIES_LIST = [
  'Tự chủ và tự học', 'Giao tiếp và hợp tác', 'Giải quyết vấn đề và sáng tạo', // 3 NL Chung
  'Ngôn ngữ', 'Tính toán', 'Khoa học', 'Công nghệ', 'Tin học', 'Thẩm mỹ', 'Thể chất' // 7 NL Đặc thù
];

const EVALUATION_PERIODS = [
  'Giữa Học kỳ I', 'Cuối Học kỳ I',
  'Giữa Học kỳ II', 'Cuối Học kỳ II'
];

const COMMENTS_BANK = {
  subject: {
    'Hoàn thành tốt': ['Nắm vững kiến thức, kỹ năng. Hoàn thành tốt các bài tập.', 'Tiếp thu bài nhanh, vận dụng tốt.', 'Có năng khiếu, tích cực phát biểu xây dựng bài.', 'Hoàn thành xuất sắc các nội dung học tập.'],
    'Hoàn thành': ['Nắm được kiến thức cơ bản. Hoàn thành các nhiệm vụ.', 'Chăm chỉ, cần cẩn thận hơn khi làm bài.', 'Có tiến bộ, cần phát huy hơn nữa.', 'Thực hiện được các yêu cầu của bài học.'],
    'Chưa hoàn thành': ['Cần cố gắng nhiều hơn. Chưa nắm vững kiến thức.', 'Cần rèn luyện thêm kỹ năng tính toán.', 'Cần chú ý nghe giảng và làm bài tập đầy đủ.', 'Tiếp thu bài còn chậm, cần phụ đạo thêm.']
  },
  competence: {
    'T': ['Có khả năng tự chủ và tự học tốt.', 'Giao tiếp tự tin, hợp tác nhóm hiệu quả.', 'Biết giải quyết vấn đề sáng tạo.', 'Tự giác thực hiện nhiệm vụ học tập.'],
    'Đ': ['Có ý thức tự học.', 'Biết hợp tác với bạn bè.', 'Giải quyết được các nhiệm vụ được giao.', 'Mạnh dạn hơn trong giao tiếp.'],
    'C': ['Cần rèn luyện thêm khả năng tự học.', 'Cần mạnh dạn hơn trong giao tiếp.', 'Cần sự hỗ trợ của giáo viên trong giải quyết vấn đề.', 'Chưa tập trung vào nhiệm vụ.']
  },
  quality: {
    'T': ['Lễ phép, vâng lời thầy cô.', 'Đoàn kết, yêu thương bạn bè.', 'Trung thực, có trách nhiệm cao.', 'Chăm chỉ, tích cực tham gia hoạt động lớp.'],
    'Đ': ['Ngoan, thực hiện đúng nội quy.', 'Hòa đồng với bạn bè.', 'Biết giữ gìn vệ sinh chung.', 'Trung thực trong học tập.'],
    'C': ['Cần thực hiện tốt hơn nội quy lớp học.', 'Cần trung thực hơn trong học tập.', 'Cần rèn luyện tính kỷ luật.', 'Cần hòa đồng hơn với bạn bè.']
  }
};

const COMMON_LOGS = {
  praise: [
    'Tích cực phát biểu', 'Hoàn thành tốt bài tập', 'Giúp đỡ bạn bè',
    'Có tiến bộ trong học tập', 'Lễ phép với thầy cô', 'Giữ gìn vệ sinh chung',
  ],
  mistake: [
    'Nói chuyện riêng', 'Không tập trung', 'Chưa làm bài tập',
    'Đi học muộn', 'Quên sách vở', 'Gây mất trật tự',
  ]
};

const ClassroomManager: React.FC<ClassroomManagerProps> = ({ classroom, onUpdate, onAIAssist }) => {
  const [section, setSection] = useState<'daily' | 'periodic'>('daily');
  const [activeTab, setActiveTab] = useState<string>('students');
  const [newStudentName, setNewStudentName] = useState('');
  const [newStudentCode, setNewStudentCode] = useState('');
  const [newStudentGender, setNewStudentGender] = useState<'Nam' | 'Nữ'>('Nam');
  const [studentSearchQuery, setStudentSearchQuery] = useState('');
  const [studentSortBy, setStudentSortBy] = useState<'name' | 'code'>('name');
  const [isImporting, setIsImporting] = useState(false);
  const [isExportingSMAS, setIsExportingSMAS] = useState(false);
  const [isGeneratingReview, setIsGeneratingReview] = useState(false);
  const [selectedStudents, setSelectedStudents] = useState<Set<string>>(new Set());
  const [viewingAssignmentId, setViewingAssignmentId] = useState<string | null>(null);
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string>('');

  const [isEditingName, setIsEditingName] = useState(false);
  const [tempClassName, setTempClassName] = useState(classroom.name);
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [showGradePasteModal, setShowGradePasteModal] = useState(false);
  const [showOnlineResultModal, setShowOnlineResultModal] = useState(false);
  const [onlineResultContent, setOnlineResultContent] = useState('');
  const [gradePasteContent, setGradePasteContent] = useState('');
  const [pasteContent, setPasteContent] = useState('');
  const [selectedSubjects, setSelectedSubjects] = useState<Set<string>>(new Set(['Tiếng Việt', 'Toán']));
  const [selectedQualities, setSelectedQualities] = useState<Set<string>>(new Set(QUALITIES_LIST));
  const [selectedCompetencies, setSelectedCompetencies] = useState<Set<string>>(new Set(COMPETENCIES_LIST));
  const [evaluationPeriod, setEvaluationPeriod] = useState('Cuối Học kỳ I');
  const [showReviewPasteModal, setShowReviewPasteModal] = useState(false);
  const [selectedPeriodicSubject, setSelectedPeriodicSubject] = useState<string>('Toán');
  const [reviewPasteContent, setReviewPasteContent] = useState('');
  const [reviewAttachments, setReviewAttachments] = useState<Attachment[]>([]);
  const [reportViewMode, setReportViewMode] = useState<'subjects' | 'competencies'>('competencies');
  const [logDate, setLogDate] = useState(new Date().toISOString().split('T')[0]);
  const [currentLogEntries, setCurrentLogEntries] = useState<Record<string, { comment: string; type: 'praise' | 'mistake' }>>({});
  const [notificationTitle, setNotificationTitle] = useState('Thông báo từ Giáo viên Chủ nhiệm');
  const [notificationContent, setNotificationContent] = useState('Kính gửi Quý Phụ huynh em {ten_hoc_sinh},\n\nEm xin thông báo về tình hình học tập của con như sau:\n\nTrân trọng,\nGVCN.');
  const [generatedNotifications, setGeneratedNotifications] = useState<string | null>(null);

  const gradeFileInputRef = useRef<HTMLInputElement>(null);
  // Thêm state và ref cho tính năng tạo quiz
  const [generatedQuiz, setGeneratedQuiz] = useState<{ title: string; subject: string; questions: ExamQuestion[] } | null>(null);
  const [isGeneratingQuiz, setIsGeneratingQuiz] = useState(false);
  const [quizFile, setQuizFile] = useState<Attachment | null>(null);
  const quizFileInputRef = useRef<HTMLInputElement>(null);
  const studentFileInputRef = useRef<HTMLInputElement>(null);

  const [openSubjectSelect, setOpenSubjectSelect] = useState(false);
  const [openQualitySelect, setOpenQualitySelect] = useState(false);
  const [openCompetenceSelect, setOpenCompetenceSelect] = useState(false);
  const subjectDropdownRef = useRef<HTMLDivElement>(null);
  const qualityDropdownRef = useRef<HTMLDivElement>(null);
  const competenceDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (subjectDropdownRef.current && !subjectDropdownRef.current.contains(event.target as Node)) {
        setOpenSubjectSelect(false);
      }
      if (qualityDropdownRef.current && !qualityDropdownRef.current.contains(event.target as Node)) {
        setOpenQualitySelect(false);
      }
      if (competenceDropdownRef.current && !competenceDropdownRef.current.contains(event.target as Node)) {
        setOpenCompetenceSelect(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Reset active tab when switching sections
  useEffect(() => {
    setActiveTab(section === 'daily' ? 'students' : 'quiz-creator');
  }, [section]);

  // Reset detail view when switching tabs
  useEffect(() => {
    if (activeTab !== 'assignments') {
      setViewingAssignmentId(null);
    }
  }, [activeTab]);

  const handleRemindUnsubmitted = () => {
    if (!assignmentToView) return;

    const submittedStudentIds = new Set(assignmentToView.grades.map(g => g.studentId));
    const unsubmittedStudents = filteredStudents.filter(s => !submittedStudentIds.has(s.id));

    if (unsubmittedStudents.length === 0) {
      alert("Tất cả học sinh đã nộp bài!");
      return;
    }

    const names = unsubmittedStudents.map((s, i) => `${i + 1}. ${s.name}`).join('\n');
    const message = `Danh sách các em chưa nộp bài "${assignmentToView.title}":\n\n${names}`;

    navigator.clipboard.writeText(message).then(() => {
      alert("Đã sao chép danh sách học sinh chưa nộp bài vào clipboard!\n\n" + message);
    }).catch(err => {
      console.error('Could not copy text: ', err);
      alert("Lỗi khi sao chép. Danh sách:\n\n" + message);
    });
  };

  const { periodicAssignments, dailyAssignments } = useMemo(() => {
    const periodic: any[] = [];
    const daily: any[] = [];
    const periodicKeywords = ['gki', 'cki', 'gkii', 'ckii', 'giữa kỳ', 'cuối kỳ', 'định kỳ', 'kiểm tra'];

    classroom.assignments.forEach(assignment => {
      const titleLower = assignment.title.toLowerCase();
      if (periodicKeywords.some(keyword => titleLower.includes(keyword))) {
        periodic.push(assignment);
      } else {
        daily.push(assignment);
      }
    });

    return { periodicAssignments: periodic, dailyAssignments: daily };
  }, [classroom.assignments]);

  const selectedAssignment = useMemo(() => {
    const assignmentsForSection = section === 'periodic' ? periodicAssignments : dailyAssignments;
    const assignment = classroom.assignments.find(a => a.id === selectedAssignmentId);

    if (assignment && assignmentsForSection.some(a => a.id === assignment.id)) {
      return assignment;
    }

    return undefined;
  }, [classroom.assignments, selectedAssignmentId, section, periodicAssignments, dailyAssignments]);

  const assignmentToView = useMemo(() => {
    if (!viewingAssignmentId) return null;
    return dailyAssignments.find(a => a.id === viewingAssignmentId);
  }, [viewingAssignmentId, dailyAssignments]);

  // Initialize and validate selectedAssignmentId
  useEffect(() => {
    const assignmentsForCurrentSection = section === 'periodic' ? periodicAssignments : dailyAssignments;

    const isSelectionValidForSection = assignmentsForCurrentSection.some(a => a.id === selectedAssignmentId);

    if (assignmentsForCurrentSection.length > 0 && !isSelectionValidForSection) {
      setSelectedAssignmentId(assignmentsForCurrentSection[assignmentsForCurrentSection.length - 1].id);
    } else if (classroom.assignments.length === 0 && selectedAssignmentId) {
      setSelectedAssignmentId('');
    }
  }, [section, periodicAssignments, dailyAssignments, selectedAssignmentId, classroom.assignments]);

  const storageKey = useMemo(() => {
    // Luôn gắn ID bài tập vào key lưu trữ để tách biệt nhận xét cho từng môn/bài
    if (section === 'periodic' && reportViewMode === 'subjects') {
      return `_periodic_${evaluationPeriod}_${selectedPeriodicSubject}`;
    }
    if (selectedAssignmentId) {
      return `${evaluationPeriod}_${selectedAssignmentId}`;
    }
    return evaluationPeriod;
  }, [evaluationPeriod, selectedAssignmentId, section, reportViewMode, selectedPeriodicSubject]);

  const manualEvaluations = useMemo(() => {
    return classroom.periodicEvaluations?.[storageKey] || {};
  }, [classroom.periodicEvaluations, storageKey]);

  useEffect(() => {
    if (activeTab === 'logbook') {
      const logsForDate = classroom.dailyLogs?.find(log => log.date === logDate);
      const initialEntries: Record<string, { comment: string; type: 'praise' | 'mistake' }> = {};
      if (logsForDate) {
        logsForDate.entries.forEach(entry => {
          initialEntries[entry.studentId] = { comment: entry.comment, type: entry.type };
        });
      }
      setCurrentLogEntries(initialEntries);
    }
  }, [logDate, activeTab, classroom.dailyLogs]);

  // Xử lý dán ảnh vào modal nhận xét
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (!showReviewPasteModal) return;

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
              setReviewAttachments(prev => [...prev, {
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
  }, [showReviewPasteModal]);

  const stats = useMemo(() => {
    const totalStudents = classroom.students.length;
    const totalAssignments = classroom.assignments.length;

    let attendanceRate = 0;
    if (classroom.attendance.length > 0 && totalStudents > 0) {
      const totalPresent = classroom.attendance.reduce((sum, record) => sum + record.present.length, 0);
      attendanceRate = (totalPresent / (classroom.attendance.length * totalStudents)) * 100;
    }

    const latestAssignment = selectedAssignment;
    const distribution = { excellent: 0, good: 0, average: 0, weak: 0 };
    let averageScore = 0;

    if (latestAssignment && latestAssignment.grades.length > 0) {
      let totalScore = 0;
      let count = 0;
      latestAssignment.grades.forEach(g => {
        const score = parseFloat(g.score);
        if (!isNaN(score)) {
          totalScore += score;
          count++;
          if (score >= 9) distribution.excellent++;
          else if (score >= 7) distribution.good++;
          else if (score >= 5) distribution.average++;
          else distribution.weak++;
        }
      });
      if (count > 0) averageScore = totalScore / count;
    }

    return { totalStudents, totalAssignments, attendanceRate, distribution, latestAssignment, averageScore: averageScore.toFixed(2) };
  }, [classroom.students, classroom.attendance, classroom.assignments, selectedAssignment]);

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

  const getCircular27Evaluation = (scoreStr: string) => {
    const score = parseFloat(scoreStr);
    if (isNaN(score)) return { subject: '-', competence: '-', quality: '-' };

    let subject = 'Chưa hoàn thành';
    let competence = 'Cần cố gắng';
    let quality = 'Cần cố gắng';

    if (score >= 9) {
      subject = 'Hoàn thành tốt';
      competence = 'Tốt';
      quality = 'Tốt';
    } else if (score >= 5) {
      subject = 'Hoàn thành';
      competence = 'Đạt';
      quality = 'Đạt';
    }

    return { subject, competence, quality };
  };

  const getRandomComment = (type: 'subject' | 'competence' | 'quality', level: string) => {
    const bank = COMMENTS_BANK[type] as any;
    const options = bank[level] || bank['Đ'] || bank['Hoàn thành'] || [];
    return options[Math.floor(Math.random() * options.length)];
  };

  const handleExportSMAS = () => {
    if (classroom.students.length === 0) {
      alert("Lớp học chưa có dữ liệu học sinh.");
      return;
    }

    setIsExportingSMAS(true);
    setTimeout(() => {
      try {
        const assignmentToExport = selectedAssignment;
        let csvContent = "\uFEFF";
        csvContent += "Mã học sinh,Họ và tên,Giới tính,Điểm số,Nhận xét chuyên môn\n";

        filteredStudents.forEach(s => {
          const grade = assignmentToExport?.grades.find(g => g.studentId === s.id);
          const score = grade?.score || "";
          const feedback = (grade?.feedback || "").replace(/,/g, ';');
          csvContent += `${s.code},${s.name},${s.gender},${score},${feedback}\n`;
        });

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `Du_lieu_SMAS_${classroom.name.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.csv`);
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
        if (!line.trim()) return;

        // Fix lỗi định dạng: Loại bỏ dấu ngoặc kép thừa từ Excel
        const cleanLine = line.replace(/"/g, '');

        // Tự động nhận diện dấu phân cách , hoặc ;
        const separator = cleanLine.includes(';') ? ';' : ',';
        const parts = cleanLine.split(separator).map(s => s.trim());

        if (parts.length >= 2) {
          const [code, score, feedback] = parts;
          const student = classroom.students.find(s => s.code === code);
          if (student && score) {
            newGrades.push({
              studentId: student.id,
              score: score,
              feedback: feedback || ''
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
          const targetId = selectedAssignmentId || (selectedAssignment ? selectedAssignment.id : '');
          const targetIndex = updatedAssignments.findIndex(a => a.id === targetId);

          if (targetIndex > -1) {
            updatedAssignments[targetIndex] = {
              ...updatedAssignments[targetIndex],
              grades: [...updatedAssignments[targetIndex].grades, ...newGrades]
            };
          }
        }
        onUpdate({ ...classroom, assignments: updatedAssignments });
        alert(`Đã nhập thành công điểm và nhận xét cho ${newGrades.length} học sinh.`);
      } else {
        alert("Không tìm thấy dữ liệu hợp lệ. Vui lòng kiểm tra định dạng (MãHS, Điểm)");
      }
      setIsImporting(false);
      if (gradeFileInputRef.current) gradeFileInputRef.current.value = '';
    };
    reader.readAsText(file);
  };

  const handleDownloadGradeSample = () => {
    // Tạo file mẫu có BOM để Excel hiển thị đúng tiếng Việt
    const csvContent = "\uFEFFMã HS,Điểm số,Nhận xét (Tùy chọn)\nHS001,9,Hoàn thành tốt nhiệm vụ\nHS002,7,Cần cẩn thận hơn trong tính toán\nHS003,5,Cần cố gắng nhiều hơn";
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'Mau_nhap_diem_va_nhan_xet.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadSample = () => {
    const csvContent = "\uFEFFMã HS,Họ và tên,Giới tính\n101,Nguyễn Văn An,Nam\n102,Trần Thị Bình,Nữ\n103,Lê Hoàng Long,Nam";
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'Mau_danh_sach_hoc_sinh.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePeriodicScoreChange = (studentId: string, score: string) => {
    const newEvals = { ...manualEvaluations };
    const studentData = { ...(newEvals[studentId] || {}) };

    const evalResult = getCircular27Evaluation(score);
    const newFeedback = getRandomComment('subject', evalResult.subject);

    studentData.score = score;
    studentData.subject = evalResult.subject;
    studentData.feedback = newFeedback;

    newEvals[studentId] = studentData;

    const updatedPeriodicEvals = { ...(classroom.periodicEvaluations || {}), [storageKey]: newEvals };
    onUpdate({ ...classroom, periodicEvaluations: updatedPeriodicEvals });
  };

  const handlePeriodicLevelChange = (studentId: string, currentVal: string) => {
    let newVal = currentVal;
    if (currentVal === 'Hoàn thành tốt') newVal = 'Hoàn thành';
    else if (currentVal === 'Hoàn thành') newVal = 'Chưa hoàn thành';
    else newVal = 'Hoàn thành tốt';

    const newFeedback = getRandomComment('subject', newVal);

    const newEvals = { ...manualEvaluations };
    const studentData = { ...(newEvals[studentId] || {}) };
    studentData.subject = newVal;
    studentData.feedback = newFeedback;
    if (studentData.score) {
      studentData.score = '';
    }

    newEvals[studentId] = studentData;

    const updatedPeriodicEvals = { ...(classroom.periodicEvaluations || {}), [storageKey]: newEvals };
    onUpdate({ ...classroom, periodicEvaluations: updatedPeriodicEvals });
  };

  const handlePeriodicFeedbackChange = (studentId: string, feedback: string) => {
    const newEvals = { ...manualEvaluations };
    const studentData = { ...(newEvals[studentId] || {}) };
    studentData.feedback = feedback;
    newEvals[studentId] = studentData;
    const updatedPeriodicEvals = { ...(classroom.periodicEvaluations || {}), [storageKey]: newEvals };
    onUpdate({ ...classroom, periodicEvaluations: updatedPeriodicEvals });
  };

  const handlePastePeriodicScores = (event: React.ClipboardEvent<HTMLInputElement>, startStudentId: string) => {
    event.preventDefault();
    const pasteData = event.clipboardData.getData('text');
    const lines = pasteData.trim().split(/\r\n|\n|\r/);
    if (lines.length === 0) return;

    const startIndex = filteredStudents.findIndex(s => s.id === startStudentId);
    if (startIndex === -1) return;

    const newEvals = { ...manualEvaluations };

    lines.forEach((line, lineIndex) => {
      const studentIndex = startIndex + lineIndex;
      if (studentIndex < filteredStudents.length) {
        const student = filteredStudents[studentIndex];
        const score = line.trim().split(/[\t,;]/)[0];
        if (score) {
          const studentData = { ...(newEvals[student.id] || {}) };
          const evalResult = getCircular27Evaluation(score);
          const newFeedback = getRandomComment('subject', evalResult.subject);
          studentData.score = score;
          studentData.subject = evalResult.subject;
          studentData.feedback = newFeedback;
          newEvals[student.id] = studentData;
        }
      }
    });

    const updatedPeriodicEvals = { ...(classroom.periodicEvaluations || {}), [storageKey]: newEvals };
    onUpdate({ ...classroom, periodicEvaluations: updatedPeriodicEvals });
  };

  const handleStudentListUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const fileName = file.name.toLowerCase();
    if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
      alert("Hệ thống hiện tại hỗ trợ tệp .csv hoặc .txt. Thầy Cô vui lòng chọn 'Save As' trong Excel và chọn định dạng 'CSV (UTF-8)' để nhập liệu chính xác nhất nhé!");
      if (studentFileInputRef.current) studentFileInputRef.current.value = '';
      return;
    }

    setIsImporting(true);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;

        // Kiểm tra file nhị phân (tránh lỗi khi cố đọc file Excel/Word làm text)
        if (text.includes('\0')) {
          throw new Error("Tệp tin có vẻ là định dạng nhị phân (Excel/Word). Vui lòng lưu dưới dạng CSV (UTF-8).");
        }

        // Fix lỗi BOM và chuẩn hóa dòng mới, loại bỏ ký tự lạ
        const cleanText = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        const lines = cleanText.split('\n').filter(l => l.trim());

        const newStudents: Student[] = [];
        let startIndex = 0;

        if (lines[0].toLowerCase().includes('họ và tên') || lines[0].toLowerCase().includes('mã')) {
          startIndex = 1;
        }

        for (let i = startIndex; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;

          // Fix lỗi định dạng: Loại bỏ dấu ngoặc kép thừa trong CSV
          const cleanLine = line.replace(/"/g, '');

          // Tự động nhận diện dấu phân cách , hoặc ; hoặc Tab
          const separator = cleanLine.includes(';') ? ';' : (cleanLine.includes('\t') ? '\t' : ',');
          const parts = cleanLine.split(separator).map(s => s.trim());

          if (parts.length >= 2) {
            const [code, name, genderRaw] = parts;
            // Xử lý giới tính linh hoạt hơn
            const gender: 'Nam' | 'Nữ' = (genderRaw?.toLowerCase().includes('nữ') || genderRaw?.toLowerCase() === 'f' || genderRaw?.toLowerCase() === 'nu') ? 'Nữ' : 'Nam';

            newStudents.push({
              id: (Date.now() + i).toString(),
              name: name,
              code: code || `HS${(classroom.students.length + newStudents.length + 1).toString().padStart(3, '0')}`,
              gender: gender
            });
          } else if (parts.length === 1 && parts[0]) {
            // Trường hợp chỉ có tên
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
        alert(`Lỗi khi đọc file: ${err instanceof Error ? err.message : "Định dạng không hợp lệ"}`);
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

  const handleProcessPaste = () => {
    if (!pasteContent.trim()) return;

    try {
      const text = pasteContent;
      // Chuẩn hóa dòng mới và loại bỏ BOM
      const cleanText = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      const lines = cleanText.split('\n').filter(l => l.trim());

      const newStudents: Student[] = [];
      let startIndex = 0;

      // Bỏ qua dòng tiêu đề nếu có
      if (lines[0].toLowerCase().includes('họ và tên') || lines[0].toLowerCase().includes('mã')) {
        startIndex = 1;
      }

      for (let i = startIndex; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const cleanLine = line.replace(/"/g, '');
        // Ưu tiên Tab (Excel) -> Chấm phẩy -> Phẩy
        const separator = cleanLine.includes('\t') ? '\t' : (cleanLine.includes(';') ? ';' : ',');
        const parts = cleanLine.split(separator).map(s => s.trim());

        if (parts.length >= 2) {
          const [code, name, genderRaw] = parts;
          const gender: 'Nam' | 'Nữ' = (genderRaw?.toLowerCase().includes('nữ') || genderRaw?.toLowerCase() === 'f' || genderRaw?.toLowerCase() === 'nu') ? 'Nữ' : 'Nam';

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
        setShowPasteModal(false);
        setPasteContent('');
      } else {
        alert("Không tìm thấy dữ liệu hợp lệ. Vui lòng kiểm tra lại (Mã, Tên, Giới tính)");
      }
    } catch (e) {
      alert("Lỗi xử lý dữ liệu.");
    }
  };

  const handleProcessGradePaste = () => {
    if (!gradePasteContent.trim()) return;

    const lines = gradePasteContent.trim().split('\n');
    const updatedAssignments = [...classroom.assignments];
    const targetId = selectedAssignmentId || (selectedAssignment ? selectedAssignment.id : '');
    let targetAssignment = updatedAssignments.find(a => a.id === targetId);

    if (!targetAssignment) {
      updatedAssignments.push({
        id: Date.now().toString(),
        title: 'Bài tập nhập từ Bảng dán',
        dueDate: new Date().toISOString().split('T')[0],
        status: 'Đã đóng',
        submissions: [],
        grades: []
      });
      targetAssignment = updatedAssignments[updatedAssignments.length - 1];
      if (!selectedAssignmentId) setSelectedAssignmentId(targetAssignment.id);
    }

    let updatedCount = 0;
    const studentMapByName = new Map(classroom.students.map(s => [s.name.trim().toLowerCase(), s]));
    const studentMapByCode = new Map(classroom.students.map(s => [s.code.trim().toLowerCase(), s]));

    let startIndex = 0;
    const firstLine = lines[0].toLowerCase();
    if (firstLine.includes('tên') || firstLine.includes('mã') || firstLine.includes('điểm')) {
      startIndex = 1;
    }

    for (let i = startIndex; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue;

      const separator = line.includes('\t') ? '\t' : (line.includes(';') ? ';' : ',');
      const parts = line.split(separator).map(p => p.trim().replace(/"/g, ''));
      if (parts.length < 2) continue;

      const [identifier, score, feedback] = parts;
      const student = studentMapByCode.get(identifier.toLowerCase()) || studentMapByName.get(identifier.toLowerCase());

      if (student && score) {
        const gradeIdx = targetAssignment.grades.findIndex(g => g.studentId === student!.id);
        if (gradeIdx > -1) {
          targetAssignment.grades[gradeIdx] = { ...targetAssignment.grades[gradeIdx], score, feedback: feedback || targetAssignment.grades[gradeIdx].feedback || '' };
        } else {
          targetAssignment.grades.push({ studentId: student.id, score, feedback: feedback || '' });
        }
        updatedCount++;
      }
    }

    if (updatedCount > 0) {
      onUpdate({ ...classroom, assignments: updatedAssignments });
      alert(`Đã cập nhật điểm và nhận xét cho ${updatedCount} học sinh.`);
      setShowGradePasteModal(false);
      setGradePasteContent('');
    } else {
      alert("Không tìm thấy dữ liệu học sinh hợp lệ để cập nhật. Vui lòng kiểm tra định dạng: (Mã HS hoặc Tên), Điểm, [Nhận xét]");
    }
  };

  const handleProcessOnlineResults = () => {
    if (!onlineResultContent.trim()) return;

    const updatedAssignments = [...classroom.assignments];
    const targetId = selectedAssignmentId || (selectedAssignment ? selectedAssignment.id : '');
    let targetAssignment = updatedAssignments.find(a => a.id === targetId);

    if (!targetAssignment) {
      // Nếu chưa chọn bài tập nào, tạo mới
      const newAssignment = {
        id: Date.now().toString(),
        title: `Bài tập Online ${new Date().toLocaleDateString('vi-VN')}`,
        dueDate: new Date().toISOString().split('T')[0],
        status: 'Đã đóng' as const,
        submissions: [],
        grades: []
      };
      updatedAssignments.push(newAssignment);
      targetAssignment = newAssignment;
      if (!selectedAssignmentId) setSelectedAssignmentId(newAssignment.id);
    }

    let updatedCount = 0;
    // Regex để bắt chuỗi #EDU_RESULT#:Tên:Điểm:ChiTiết
    const regex = /#EDU_RESULT#:(.*?):([\d\.]+):/g;
    let match;

    // Map học sinh để tìm kiếm nhanh
    const studentMapByName = new Map(classroom.students.map(s => [s.name.trim().toLowerCase(), s]));

    while ((match = regex.exec(onlineResultContent)) !== null) {
      const name = match[1].trim();
      const score = match[2];

      // Tìm học sinh theo tên (chấp nhận tên gần đúng hoặc chính xác)
      const student = studentMapByName.get(name.toLowerCase());

      if (student) {
        const gradeIdx = targetAssignment.grades.findIndex(g => g.studentId === student.id);
        if (gradeIdx > -1) {
          targetAssignment.grades[gradeIdx] = {
            ...targetAssignment.grades[gradeIdx],
            score: score
          };
        } else {
          targetAssignment.grades.push({
            studentId: student.id,
            score: score,
            feedback: 'Hoàn thành bài tập Online'
          });
        }
        updatedCount++;
      }
    }

    onUpdate({ ...classroom, assignments: updatedAssignments });
    alert(`Đã cập nhật điểm cho ${updatedCount} học sinh từ dữ liệu Online.`);
    setShowOnlineResultModal(false);
    setOnlineResultContent('');
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

  const toggleSelection = (id: string) => {
    const newSet = new Set(selectedStudents);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedStudents(newSet);
  };

  const toggleSelectAll = () => {
    if (selectedStudents.size === filteredStudents.length) setSelectedStudents(new Set());
    else setSelectedStudents(new Set(filteredStudents.map(s => s.id)));
  };

  const getAIReviewPrompt = (studentData: string) => {
    const subjectsList = Array.from(selectedSubjects).join(', ');
    const qualitiesList = Array.from(selectedQualities).join(', ');
    const competenciesList = Array.from(selectedCompetencies).join(', ');

    return `Bạn là chuyên gia Thông tư 27. Dựa trên dữ liệu được cung cấp (văn bản hoặc hình ảnh), hãy tạo một đối tượng JSON chứa nhận xét cho TẤT CẢ học sinh.

    Dữ liệu đầu vào:
    - Thời điểm: ${evaluationPeriod}
    - Dữ liệu học sinh (nếu có dạng text):
    ${studentData}
    - Các môn học cần tập trung: ${subjectsList}
    - Các phẩm chất cần tập trung: ${qualitiesList}
    - Các năng lực cần tập trung: ${competenciesList}

    YÊU CẦU VỀ ĐỊNH DẠNG JSON (chỉ trả về JSON, không có markdown):
    {
      "evaluations": [
        {
          "studentCode": "Mã học sinh (nếu có)",
          "studentName": "Tên học sinh",
          "subjectLevel": "Hoàn thành tốt" | "Hoàn thành" | "Chưa hoàn thành",
          "subjectFeedback": "Nhận xét chi tiết về môn học.",
          "competencyLevels": ["T", "Đ", "C", ...], // Mảng 10 chuỗi (3 chung, 7 đặc thù)
          "qualityLevels": ["T", "Đ", "C", ...], // Mảng 5 chuỗi
          "generalCompetencyComment": "Nhận xét về năng lực chung.",
          "specificCompetencyComment": "Nhận xét về năng lực đặc thù.",
          "qualityComment": "Nhận xét về phẩm chất."
        }
      ]
    }

    QUY TẮC:
    - QUAN TRỌNG: Phải xử lý TOÀN BỘ học sinh có trong ảnh/văn bản được cung cấp, không được bỏ sót.
    - Xác định 'studentCode' hoặc 'studentName' từ dữ liệu.
    - 'subjectLevel' phải dựa trên điểm số và suy luận sư phạm.
    - 'competencyLevels' và 'qualityLevels' phải là 'T', 'Đ', hoặc 'C'.
    - Các trường nhận xét phải là văn bản súc tích, mang tính xây dựng.`;
  };

  const processAIReviewResponse = (resultText: string) => {
    const cleanJson = resultText.replace(/```json|```/g, '').trim();
    const result = JSON.parse(cleanJson);

    if (result && result.evaluations && Array.isArray(result.evaluations)) {
      const updatedAssignments = [...classroom.assignments];
      let targetAssignment = updatedAssignments[updatedAssignments.length - 1];

      if (!targetAssignment) {
        updatedAssignments.push({
          id: Date.now().toString(),
          title: `Đánh giá ${evaluationPeriod}`,
          dueDate: new Date().toISOString().split('T')[0],
          status: 'Đã đóng',
          submissions: [],
          grades: []
        });
        targetAssignment = updatedAssignments[updatedAssignments.length - 1];
      }

      const newManualEvaluations = { ...manualEvaluations };

      result.evaluations.forEach((evaluation: any) => {
        const student = classroom.students.find(s =>
          (evaluation.studentCode && s.code === evaluation.studentCode) ||
          s.name === evaluation.studentName
        );

        if (student) {
          const competencyRecord: Record<number, string> = {};
          evaluation.competencyLevels?.forEach((level: string, index: number) => {
            if (['T', 'Đ', 'C'].includes(level)) competencyRecord[index + 1] = level;
          });

          const qualityRecord: Record<number, string> = {};
          evaluation.qualityLevels?.forEach((level: string, index: number) => {
            if (['T', 'Đ', 'C'].includes(level)) qualityRecord[index + 1] = level;
          });

          newManualEvaluations[student.id] = {
            subject: evaluation.subjectLevel,
            competencies: competencyRecord,
            qualities: qualityRecord,
            compComment: evaluation.generalCompetencyComment,
            specComment: evaluation.specificCompetencyComment,
            qualComment: evaluation.qualityComment,
          };

          const gradeIdx = targetAssignment.grades.findIndex(g => g.studentId === student.id);
          if (gradeIdx > -1) {
            if (evaluation.subjectFeedback) {
              targetAssignment.grades[gradeIdx].feedback = evaluation.subjectFeedback;
            }
          } else {
            targetAssignment.grades.push({ studentId: student.id, score: '', feedback: evaluation.subjectFeedback || '' });
          }
        }
      });

      const updatedPeriodicEvals = {
        ...(classroom.periodicEvaluations || {}),
        [storageKey]: newManualEvaluations
      };
      onUpdate({ ...classroom, assignments: updatedAssignments, periodicEvaluations: updatedPeriodicEvals });
      alert(`Đã tự động điền nhận xét cho ${result.evaluations.length} học sinh.`);
    } else {
      throw new Error("AI không trả về dữ liệu nhận xét hợp lệ.");
    }
  };

  const deleteSelected = () => {
    if (selectedStudents.size === 0) return;
    if (window.confirm(`Thầy Cô chắc chắn muốn xóa ${selectedStudents.size} học sinh đã chọn?`)) {
      const remaining = classroom.students.filter(s => !selectedStudents.has(s.id));
      onUpdate({ ...classroom, students: remaining });
      setSelectedStudents(new Set());
    }
  };

  const toggleSubject = (subj: string) => {
    const newSet = new Set(selectedSubjects);
    if (newSet.has(subj)) newSet.delete(subj);
    else newSet.add(subj);
    setSelectedSubjects(newSet);
  };

  const toggleQuality = (item: string) => {
    const newSet = new Set(selectedQualities);
    if (newSet.has(item)) newSet.delete(item);
    else newSet.add(item);
    setSelectedQualities(newSet);
  };

  const toggleCompetence = (item: string) => {
    const newSet = new Set(selectedCompetencies);
    if (newSet.has(item)) newSet.delete(item);
    else newSet.add(item);
    setSelectedCompetencies(newSet);
  };

  const handleGenerateAIReviewFromPaste = async () => {
    if (isGeneratingReview) return;
    if (!reviewPasteContent.trim() && reviewAttachments.length === 0) return;

    setIsGeneratingReview(true);
    const prompt = getAIReviewPrompt(reviewPasteContent);

    try {
      const fileParts: FilePart[] = reviewAttachments.map(at => ({
        inlineData: { data: at.data!, mimeType: at.mimeType! }
      }));
      const resultText = await geminiService.generateText(prompt, fileParts);
      processAIReviewResponse(resultText);
    } catch (error: any) {
      console.error("AI Review Generation Error:", error);
      const msg = error.message || "";
      if (msg.includes("429") || msg.toLowerCase().includes("quota") || msg.includes("resource_exhausted")) {
        alert("⚠️ Hết lượt sử dụng miễn phí (Quota Exceeded).\n\nVui lòng vào Cài đặt (🔑) để nhập API Key mới.");
        try { window.dispatchEvent(new Event('openApiSettings')); } catch { }
      } else {
        alert("Lỗi khi tạo nhận xét AI. Vui lòng thử lại hoặc kiểm tra định dạng dữ liệu.");
      }
    } finally {
      setIsGeneratingReview(false);
      setShowReviewPasteModal(false);
      setReviewPasteContent('');
      setReviewAttachments([]);
    }
  };

  const handleGenerateAIReview = async () => {
    if (isGeneratingReview) return;
    if (filteredStudents.length === 0) {
      alert("Chưa có học sinh trong danh sách để tạo nhận xét.");
      return;
    }
    setIsGeneratingReview(true);

    const assignmentToReview = selectedAssignment;
    let studentDataText = '';

    studentDataText = filteredStudents.map(s => {
      const grade = assignmentToReview?.grades.find(g => g.studentId === s.id);
      return `- ${s.name} (${s.code}): ${grade ? `Điểm ${grade.score}. ${grade.feedback || ''}` : 'Chưa có điểm'}`;
    }).join('\n');

    const prompt = getAIReviewPrompt(studentDataText);

    try {
      const resultText = await geminiService.generateText(prompt);
      processAIReviewResponse(resultText);
    } catch (error: any) {
      console.error("AI Review Generation Error:", error);
      const msg = error.message || "";
      if (msg.includes("429") || msg.toLowerCase().includes("quota") || msg.includes("resource_exhausted")) {
        alert("⚠️ Hết lượt sử dụng miễn phí (Quota Exceeded).\n\nVui lòng vào Cài đặt (🔑) để nhập API Key mới.");
        try { window.dispatchEvent(new Event('openApiSettings')); } catch { }
      } else {
        alert("Lỗi khi tạo nhận xét AI. Vui lòng thử lại.");
      }
    } finally {
      setIsGeneratingReview(false);
    }
  };

  const handleExportCompetencies = () => {
    let csvContent = "\uFEFF"; // BOM for UTF-8 Excel compatibility

    const headers = [
      "STT", "Mã học sinh", "Họ và tên",
      "NL - Tự chủ & Tự học", "NL - Giao tiếp & Hợp tác", "NL - GQ VĐ & Sáng tạo",
      "NL - Ngôn ngữ", "NL - Tính toán", "NL - Khoa học", "NL - Công nghệ", "NL - Tin học", "NL - Thẩm mỹ", "NL - Thể chất",
      "PC - Yêu nước", "PC - Nhân ái", "PC - Chăm chỉ", "PC - Trung thực", "PC - Trách nhiệm",
      "Nhận xét NL chung", "Nhận xét NL đặc thù", "Nhận xét phẩm chất",
      "Thời điểm đánh giá"
    ];
    csvContent += headers.map(h => `"${h}"`).join(',') + '\n';

    filteredStudents.forEach((s, idx) => {
      const grade = selectedAssignment?.grades.find(g => g.studentId === s.id);
      const eval27 = getCircular27Evaluation(grade?.score || '');
      const cVal = eval27.competence === 'Tốt' ? 'T' : eval27.competence === 'Đạt' ? 'Đ' : 'C';
      const qVal = eval27.quality === 'Tốt' ? 'T' : eval27.quality === 'Đạt' ? 'Đ' : 'C';
      const manualData = manualEvaluations[s.id] || {};

      const competencies = Array.from({ length: 10 }, (_, i) => manualData.competencies?.[i + 1] || cVal);
      const qualities = Array.from({ length: 5 }, (_, i) => manualData.qualities?.[i + 1] || qVal);

      const row = [
        idx + 1,
        s.code,
        s.name,
        ...competencies,
        ...qualities,
        manualData.compComment || '',
        manualData.specComment || '',
        manualData.qualComment || '',
        evaluationPeriod
      ];
      csvContent += row.map(cell => `"${String(cell || '').replace(/"/g, '""')}"`).join(',') + '\n';
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Danh_gia_NLPC_${classroom.name.replace(/\s/g, '_')}_${evaluationPeriod.replace(/\s/g, '_')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePasteSubjectLevels = (event: React.ClipboardEvent<HTMLTableCellElement>, startStudentId: string) => {
    event.preventDefault();
    const pasteData = event.clipboardData.getData('text');
    const lines = pasteData.trim().split(/\r\n|\n|\r/);
    if (lines.length === 0) return;

    const startIndex = filteredStudents.findIndex(s => s.id === startStudentId);
    if (startIndex === -1) return;

    const newEvals = { ...manualEvaluations };

    lines.forEach((line, lineIndex) => {
      const studentIndex = startIndex + lineIndex;
      if (studentIndex < filteredStudents.length) {
        const student = filteredStudents[studentIndex];
        const value = line.trim();
        let subjectLevel = '';
        if (value.toUpperCase() === 'T' || value === 'Hoàn thành tốt') subjectLevel = 'Hoàn thành tốt';
        else if (value.toUpperCase() === 'H' || value === 'Hoàn thành') subjectLevel = 'Hoàn thành';
        else if (value.toUpperCase() === 'C' || value === 'Chưa hoàn thành') subjectLevel = 'Chưa hoàn thành';

        if (subjectLevel) {
          const studentData = newEvals[student.id] || {};
          const updatedStudentData: PeriodicEvaluation = { ...studentData, subject: subjectLevel };
          newEvals[student.id] = updatedStudentData;
        }
      }
    });

    const updatedPeriodicEvals = { ...(classroom.periodicEvaluations || {}), [storageKey]: newEvals };
    onUpdate({ ...classroom, periodicEvaluations: updatedPeriodicEvals });
  };

  const handlePastePeriodicLevels = (event: React.ClipboardEvent<HTMLTableCellElement>, startStudentId: string) => {
    event.preventDefault();
    const pasteData = event.clipboardData.getData('text');
    const lines = pasteData.trim().split(/\r\n|\n|\r/);
    if (lines.length === 0) return;

    const startIndex = filteredStudents.findIndex(s => s.id === startStudentId);
    if (startIndex === -1) return;

    const newEvals = { ...manualEvaluations };

    lines.forEach((line, lineIndex) => {
      const studentIndex = startIndex + lineIndex;
      if (studentIndex < filteredStudents.length) {
        const student = filteredStudents[studentIndex];
        const value = line.trim();
        const vUpper = value.toUpperCase();
        let subjectLevel = '';
        if (vUpper === 'T' || vUpper === 'HTT' || value === 'Hoàn thành tốt' || value === 'Tốt') subjectLevel = 'Hoàn thành tốt';
        else if (vUpper === 'H' || vUpper === 'HT' || value === 'Hoàn thành' || value === 'Đạt') subjectLevel = 'Hoàn thành';
        else if (vUpper === 'C' || vUpper === 'CHT' || value === 'Chưa hoàn thành' || value === 'Cần cố gắng') subjectLevel = 'Chưa hoàn thành';

        if (subjectLevel) {
          const studentData = { ...(newEvals[student.id] || {}) };
          studentData.subject = subjectLevel;
          studentData.feedback = getRandomComment('subject', subjectLevel);
          studentData.score = '';
          newEvals[student.id] = studentData;
        }
      }
    });
    const updatedPeriodicEvals = { ...(classroom.periodicEvaluations || {}), [storageKey]: newEvals };
    onUpdate({ ...classroom, periodicEvaluations: updatedPeriodicEvals });
  };

  const handleExportSubjectData = () => {
    let csvContent = "\uFEFF";
    const isScoreSubject = ['Toán', 'Tiếng Việt'].includes(selectedPeriodicSubject);
    const headers = ["STT", "Mã học sinh", "Họ và tên", isScoreSubject ? "Điểm số" : null, "Mức đạt được", "Nhận xét", "Thời điểm"].filter(Boolean);
    csvContent += headers.map(h => `"${h}"`).join(',') + '\n';

    filteredStudents.forEach((s, idx) => {
      const studentEval = manualEvaluations[s.id] || {};
      const score = studentEval.score || '';
      const feedback = studentEval.feedback || '';
      const finalSubject = studentEval.subject || getCircular27Evaluation(score).subject;
      const displaySubjectEval = finalSubject === 'Hoàn thành tốt' ? 'T' : finalSubject === 'Hoàn thành' ? 'H' : finalSubject === 'Chưa hoàn thành' ? 'C' : '-';

      const row = [
        idx + 1, s.code, s.name, isScoreSubject ? score : null, displaySubjectEval, feedback, evaluationPeriod
      ].filter(item => item !== null);

      csvContent += row.map(cell => `"${String(cell || '').replace(/"/g, '""')}"`).join(',') + '\n';
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Danh_gia_${selectedPeriodicSubject.replace(/\s/g, '_')}_${evaluationPeriod.replace(/\s/g, '_')}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleManualChange = (studentId: string, type: 'subject' | 'competence' | 'quality', index: number = 0, currentVal: string) => {
    let newVal = currentVal;
    let newComment = '';

    if (type === 'subject') {
      if (currentVal === 'Hoàn thành tốt') newVal = 'Hoàn thành';
      else if (currentVal === 'Hoàn thành') newVal = 'Chưa hoàn thành';
      else newVal = 'Hoàn thành tốt';
      newComment = getRandomComment('subject', newVal);
    } else {
      const map: Record<string, string> = { 'T': 'Đ', 'Đ': 'C', 'C': 'T', '-': 'Đ' };
      newVal = map[currentVal] || 'Đ';
    }

    // Cập nhật feedback cho môn học (lưu vào assignment)
    if (type === 'subject') {
      handleFeedbackChange(studentId, newComment);
    }

    const newEvals = { ...manualEvaluations };
    const studentData = newEvals[studentId] || {};
    let updatedStudentData: PeriodicEvaluation;

    if (type === 'subject') {
      updatedStudentData = { ...studentData, subject: newVal };
    } else if (type === 'competence') {
      const newCompetencies = { ...(studentData.competencies || {}), [index]: newVal };
      const autoComment = getRandomComment('competence', newVal);
      updatedStudentData = { ...studentData, competencies: newCompetencies };
      if (index > 3) {
        updatedStudentData.specComment = autoComment;
      } else {
        updatedStudentData.compComment = autoComment;
      }
    } else { // quality
      const newQualities = { ...(studentData.qualities || {}), [index]: newVal };
      const autoComment = getRandomComment('quality', newVal);
      updatedStudentData = { ...studentData, qualities: newQualities, qualComment: autoComment };
    }

    newEvals[studentId] = updatedStudentData;

    const updatedPeriodicEvals = {
      ...(classroom.periodicEvaluations || {}),
      [storageKey]: newEvals
    };
    onUpdate({ ...classroom, periodicEvaluations: updatedPeriodicEvals });
  };

  const handlePasteCompetencies = (event: React.ClipboardEvent<HTMLTableCellElement>, startStudentId: string, type: 'competence' | 'quality', index: number) => {
    event.preventDefault();
    const pasteData = event.clipboardData.getData('text');
    const lines = pasteData.trim().split(/\r\n|\n|\r/);
    if (lines.length === 0) return;

    const startIndex = filteredStudents.findIndex(s => s.id === startStudentId);
    if (startIndex === -1) return;

    const newEvals = { ...manualEvaluations };

    lines.forEach((line, lineIndex) => {
      const studentIndex = startIndex + lineIndex;
      if (studentIndex < filteredStudents.length) {
        const student = filteredStudents[studentIndex];
        const value = line.trim().toUpperCase();
        if (['T', 'Đ', 'C'].includes(value)) {
          const studentData = newEvals[student.id] || {};
          let updatedStudentData: PeriodicEvaluation;

          if (type === 'competence') {
            const newCompetencies = { ...(studentData.competencies || {}), [index]: value };
            const autoComment = getRandomComment('competence', value);
            updatedStudentData = { ...studentData, competencies: newCompetencies };
            if (index > 3) updatedStudentData.specComment = autoComment;
            else updatedStudentData.compComment = autoComment;
          } else { // quality
            const newQualities = { ...(studentData.qualities || {}), [index]: value };
            const autoComment = getRandomComment('quality', value);
            updatedStudentData = { ...studentData, qualities: newQualities, qualComment: autoComment };
          }
          newEvals[student.id] = updatedStudentData;
        }
      }
    });

    const updatedPeriodicEvals = {
      ...(classroom.periodicEvaluations || {}),
      [storageKey]: newEvals
    };
    onUpdate({ ...classroom, periodicEvaluations: updatedPeriodicEvals });
  };

  const handleScoreChange = (studentId: string, val: string) => {
    const targetId = selectedAssignment?.id;
    if (!targetId) return;

    const updatedAssignments = classroom.assignments.map(assignment => {
      if (assignment.id === targetId) {
        const newGrades = [...assignment.grades];
        const gradeIdx = newGrades.findIndex(g => g.studentId === studentId);
        if (gradeIdx > -1) {
          newGrades[gradeIdx] = { ...newGrades[gradeIdx], score: val };
        } else {
          newGrades.push({ studentId, score: val, feedback: '' });
        }
        return { ...assignment, grades: newGrades };
      }
      return assignment;
    });
    onUpdate({ ...classroom, assignments: updatedAssignments });
  };

  const handlePasteScores = (event: React.ClipboardEvent<HTMLInputElement>, startStudentId: string) => {
    event.preventDefault();
    const pasteData = event.clipboardData.getData('text');
    const lines = pasteData.trim().split(/\r\n|\n|\r/);

    if (lines.length === 0) return;

    const startIndex = filteredStudents.findIndex(s => s.id === startStudentId);
    if (startIndex === -1) return;

    const targetId = selectedAssignment?.id;
    if (!targetId) return;

    const updatedAssignments = classroom.assignments.map(assignment => {
      if (assignment.id === targetId) {
        // Create a mutable copy of grades to work with
        const gradesMap = new Map(assignment.grades.map(g => [g.studentId, { ...g }]));

        lines.forEach((line, index) => {
          const studentIndex = startIndex + index;
          if (studentIndex < filteredStudents.length) {
            const student = filteredStudents[studentIndex];
            const separator = line.includes('\t') ? '\t' : (line.includes(';') ? ';' : ',');
            const parts = line.split(separator).map(p => p.trim().replace(/"/g, ''));
            const score = parts[0] || '';
            let feedback = parts[1] || '';

            // Tự động tạo nhận xét nếu dán điểm mà không có nhận xét
            if (score && !feedback) {
              const evalResult = getCircular27Evaluation(score);
              feedback = getRandomComment('subject', evalResult.subject);
            }

            const existingGrade = gradesMap.get(student.id);
            if (existingGrade) {
              if (score) existingGrade.score = score;
              if (feedback) existingGrade.feedback = feedback;
            } else {
              gradesMap.set(student.id, { studentId: student.id, score, feedback });
            }
          }
        });

        // Convert map back to array and return new assignment object
        return { ...assignment, grades: Array.from(gradesMap.values()) };
      }
      return assignment;
    });

    onUpdate({ ...classroom, assignments: updatedAssignments });
  };

  const handleFeedbackChange = (studentId: string, val: string) => {
    const targetId = selectedAssignment?.id;
    if (!targetId) return;

    const updatedAssignments = classroom.assignments.map(assignment => {
      if (assignment.id === targetId) {
        const newGrades = [...assignment.grades];
        const gradeIdx = newGrades.findIndex(g => g.studentId === studentId);
        if (gradeIdx > -1) {
          newGrades[gradeIdx] = { ...newGrades[gradeIdx], feedback: val };
        } else {
          newGrades.push({ studentId, score: '', feedback: val });
        }
        return { ...assignment, grades: newGrades };
      }
      return assignment;
    });
    onUpdate({ ...classroom, assignments: updatedAssignments });
  };

  const handleManualCommentChange = (studentId: string, field: 'compComment' | 'specComment' | 'qualComment', val: string) => {
    const newEvals = { ...manualEvaluations };
    newEvals[studentId] = { ...(newEvals[studentId] || {}), [field]: val };

    const updatedPeriodicEvals = {
      ...(classroom.periodicEvaluations || {}),
      [storageKey]: newEvals
    };
    onUpdate({ ...classroom, periodicEvaluations: updatedPeriodicEvals });
  };

  const handleLogChange = (studentId: string, comment: string) => {
    setCurrentLogEntries(prev => ({
      ...prev,
      [studentId]: { ...(prev[studentId] || { type: 'mistake', comment: '' }), comment }
    }));
  };

  const handleLogTypeChange = (studentId: string, type: 'praise' | 'mistake') => {
    setCurrentLogEntries(prev => ({
      ...prev,
      [studentId]: { ...(prev[studentId] || { comment: '' }), type }
    }));
  };

  const handleSelectLogComment = (studentId: string, comment: string, type: 'praise' | 'mistake') => {
    setCurrentLogEntries(prev => {
      const existingComment = prev[studentId]?.comment || '';
      const newComment = existingComment ? `${existingComment}, ${comment.toLowerCase()}` : comment;
      return {
        ...prev,
        [studentId]: { comment: newComment, type }
      };
    });
  };

  const handleSaveLogs = () => {
    const newLogEntriesForDate: DailyLogEntry[] = Object.entries(currentLogEntries)
      .filter(([_, value]) => value.comment?.trim())
      .map(([studentId, value]) => ({
        studentId,
        comment: value.comment,
        type: value.type || 'mistake'
      }));

    const existingLogs = classroom.dailyLogs || [];
    const logIndex = existingLogs.findIndex(log => log.date === logDate);

    let updatedLogs;
    if (logIndex > -1) {
      updatedLogs = [...existingLogs];
      if (newLogEntriesForDate.length > 0) {
        updatedLogs[logIndex] = { date: logDate, entries: newLogEntriesForDate };
      } else {
        updatedLogs.splice(logIndex, 1);
      }
    } else if (newLogEntriesForDate.length > 0) {
      updatedLogs = [...existingLogs, { date: logDate, entries: newLogEntriesForDate }];
    } else {
      updatedLogs = existingLogs;
    }

    onUpdate({ ...classroom, dailyLogs: updatedLogs });
    alert('Đã lưu nhận xét ngày ' + new Date(logDate).toLocaleDateString('vi-VN') + ' thành công!');
  };

  const handleBulkAttendance = (status: 'present' | 'absent') => {
    const today = new Date().toISOString().split('T')[0];
    const studentIds = filteredStudents.map(s => s.id);
    const existingRecordIndex = classroom.attendance.findIndex(a => a.date === today);

    let newAttendance = [...classroom.attendance];
    let newRecord;

    if (status === 'present') {
      newRecord = { date: today, present: studentIds, absent: [] };
    } else { // absent
      newRecord = { date: today, present: [], absent: studentIds };
    }

    if (existingRecordIndex > -1) {
      newAttendance[existingRecordIndex] = newRecord;
    } else {
      newAttendance.push(newRecord);
    }

    onUpdate({ ...classroom, attendance: newAttendance });
    alert(`Đã điểm danh hàng loạt: Tất cả học sinh ${status === 'present' ? 'có mặt' : 'vắng mặt'}.`);
  };

  const handleGenerateNotifications = () => {
    const studentsToSend = selectedStudents.size > 0
      ? classroom.students.filter(s => selectedStudents.has(s.id))
      : filteredStudents;

    if (studentsToSend.length === 0) {
      alert("Vui lòng chọn ít nhất một học sinh để gửi thông báo.");
      return;
    }

    const allMessages = studentsToSend.map(student => {
      const message = notificationContent
        .replace(/{ten_hoc_sinh}/g, student.name)
        .replace(/{ma_hoc_sinh}/g, student.code);

      return `--- THÔNG BÁO CHO PHỤ HUYNH EM ${student.name} ---\n${notificationTitle}\n\n${message}`;
    }).join('\n\n');

    setGeneratedNotifications(allMessages);
  };

  const handleAttendance = (studentId: string) => {
    const today = new Date().toISOString().split('T')[0];
    const existingRecordIndex = classroom.attendance.findIndex(a => a.date === today);

    let newAttendance = [...classroom.attendance];

    if (existingRecordIndex === -1) {
      // Tạo mới cho hôm nay
      newAttendance.push({
        date: today,
        present: [studentId],
        absent: []
      });
    } else {
      const record = { ...newAttendance[existingRecordIndex] };
      if (record.present.includes(studentId)) {
        record.present = record.present.filter(id => id !== studentId);
        record.absent = [...record.absent, studentId];
      } else {
        record.absent = record.absent.filter(id => id !== studentId);
        record.present = [...record.present, studentId];
      }
      newAttendance[existingRecordIndex] = record;
    }
    onUpdate({ ...classroom, attendance: newAttendance });
  };

  const handleGenerateQuizFromFile = async () => {
    if (!quizFile || isGeneratingQuiz) return;
    setIsGeneratingQuiz(true);
    setGeneratedQuiz(null);

    try {
      // --- START: Logic from UtilityKit for robust PDF/Image processing ---
      const fileParts: FilePart[] = [{
        inlineData: { data: quizFile.data!, mimeType: quizFile.mimeType! }
      }];

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
          const maxPages = Math.min(pdf.numPages, 20);

          for (let i = 1; i <= maxPages; i++) {
            const page = await pdf.getPage(i);
            const viewport = page.getViewport({ scale: 1.5 });
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.height = viewport.height;
            canvas.width = viewport.width;
            await page.render({ canvasContext: context!, viewport: viewport }).promise;
            const imgData = canvas.toDataURL('image/jpeg', 0.85);
            pageImages.push(imgData);
            imageParts.push({ inlineData: { data: imgData.split(',')[1], mimeType: 'image/jpeg' } });
          }
          return { imageParts, pageImages };
        } catch (e) {
          console.error("PDF Convert Error in ClassroomManager:", e);
          return null;
        }
      };

      const finalFileParts: any[] = [];
      const pageImageUrls: string[] = [];

      for (const part of fileParts) {
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
      // --- END: PDF processing logic ---

      const prompt = `Trích xuất câu hỏi từ file đính kèm theo định dạng đề thi Violympic, Trạng Nguyên Tiếng Việt.`;
      const result = await geminiService.generateExamQuestionsStructured(prompt, finalFileParts);

      let rawQuestions = [];
      if (result && result.questions && Array.isArray(result.questions)) {
        rawQuestions = result.questions;
      } else if (Array.isArray(result)) {
        rawQuestions = result;
      }

      if (rawQuestions.length > 0) {
        if (typeof rawQuestions[0] === 'string' || typeof rawQuestions[0] === 'number') {
          throw new Error("AI đã trả về một danh sách đáp án thay vì bộ câu hỏi đầy đủ.");
        }
        const formattedQuestions = rawQuestions.map((q: any, i: number) => {
          const pageIndex = Number(q.page_index ?? q.page ?? q.pageNumber);
          const pageImage = (Number.isFinite(pageIndex) && pageIndex >= 0 && pageImageUrls[pageIndex])
            ? pageImageUrls[pageIndex]
            : (pageImageUrls.length === 1 ? pageImageUrls[0] : '');

          const normalizeImage = (value?: string) => {
            if (!value) return pageImage || '';
            const trimmed = value.trim();
            if (trimmed.startsWith('<svg') || /^(http|https|data:image)/i.test(trimmed)) return trimmed;
            return pageImage || trimmed;
          };

          return {
            id: q.id || `quiz-cls-${Date.now()}-${i}`,
            content: q.content || q.question || 'Câu hỏi trống',
            image: normalizeImage(q.image),
            options: Array.isArray(q.options) ? q.options.map((opt: any) => ({ text: opt.text || opt, image: normalizeImage(opt.image) })) : [],
            answer: q.answer || '',
            explanation: q.explanation || '',
          };
        });
        setGeneratedQuiz({ title: result.title || 'Đề thi được tạo bởi AI', subject: result.subject || 'Chưa rõ', questions: formattedQuestions });
      } else {
        throw new Error("AI không trả về dữ liệu quiz hợp lệ.");
      }
    } catch (error) {
      console.error("AI Quiz Generation Error:", error);
      const msg = error instanceof Error ? error.message : "Lỗi không xác định";
      if (msg.includes("hết lượt") || msg.includes("quota") || msg.includes("bận")) {
        alert(`⚠️ Hệ thống AI đang bận.\n\n${msg}\n\n👉 Thầy/Cô hãy thử lại sau vài phút hoặc nhập API Key riêng trong phần Cài đặt.`);
      } else {
        alert(`Lỗi khi tạo quiz từ file: ${msg}`);
      }
    } finally {
      setIsGeneratingQuiz(false);
    }
  };

  const handleQuizFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64Data = (reader.result as string).split(',')[1];
      setQuizFile({
        type: file.type.startsWith('image/') ? 'image' : 'file',
        name: file.name,
        data: base64Data,
        mimeType: file.type
      });
    };
    reader.readAsDataURL(file);
    if (quizFileInputRef.current) quizFileInputRef.current.value = '';
  };

  const renderImage = (content: string) => {
    if (!content) return null;
    const trimmed = content.trim();
    if (trimmed.startsWith('<svg')) {
      return <div className="flex justify-center my-2" dangerouslySetInnerHTML={{ __html: trimmed }} />;
    }
    if (trimmed.startsWith('http') || trimmed.startsWith('data:image')) {
      return <img src={trimmed} alt="Minh họa" className="max-h-40 max-w-full object-contain mx-auto my-2 rounded-lg" />;
    }
    return <div className="my-2 p-2 bg-slate-50 rounded-md text-sm italic text-slate-500 text-center">{trimmed}</div>;
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden animate-in fade-in duration-500">
      <input type="file" ref={gradeFileInputRef} onChange={handleGradeFileUpload} accept=".csv,.txt" className="hidden" />
      <input type="file" ref={quizFileInputRef} onChange={handleQuizFileSelect} accept="application/pdf,image/*" className="hidden" />
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
            onClick={handleDownloadGradeSample}
            className="px-3 py-2 rounded-xl bg-slate-50 text-slate-500 text-[10px] font-black uppercase tracking-widest border border-slate-200 hover:bg-slate-100 transition-all"
            title="Tải mẫu nhập điểm (Excel)"
          >
            <i className="fas fa-download mr-1"></i>Mẫu
          </button>
          <button
            onClick={() => gradeFileInputRef.current?.click()}
            className="px-4 py-2 rounded-xl bg-amber-50 text-amber-700 text-[10px] font-black uppercase tracking-widest border border-amber-200 hover:bg-amber-100 transition-all"
          >
            <i className="fas fa-file-invoice mr-2"></i>Nhập điểm File
          </button>
          <button
            onClick={() => setShowGradePasteModal(true)}
            className="px-4 py-2 rounded-xl bg-sky-50 text-sky-700 text-[10px] font-black uppercase tracking-widest border border-sky-200 hover:bg-sky-100 transition-all"
          >
            <i className="fas fa-paste mr-2"></i>Dán Bảng điểm
          </button>
          <button
            onClick={() => setShowOnlineResultModal(true)}
            className="px-4 py-2 rounded-xl bg-purple-50 text-purple-700 text-[10px] font-black uppercase tracking-widest border border-purple-200 hover:bg-purple-100 transition-all"
          >
            <i className="fas fa-globe mr-2"></i>Nhập KQ Online
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

      {/* Section Toggle */}
      <div className="flex p-2 bg-slate-100 border-y border-slate-200">
        <button
          onClick={() => setSection('daily')}
          className={`flex-1 py-3 text-xs font-black uppercase tracking-widest rounded-xl transition-all flex items-center justify-center gap-2 ${section === 'daily' ? 'bg-white text-indigo-600 shadow-md' : 'text-slate-500 hover:bg-slate-200/50'}`}
        >
          <i className="fas fa-sun"></i>
          Hoạt động Hàng ngày
        </button>
        <button
          onClick={() => setSection('periodic')}
          className={`flex-1 py-3 text-xs font-black uppercase tracking-widest rounded-xl transition-all flex items-center justify-center gap-2 ${section === 'periodic' ? 'bg-white text-indigo-600 shadow-md' : 'text-slate-500 hover:bg-slate-200/50'}`}
        >
          <i className="fas fa-award"></i>
          Đánh giá & Soạn đề
        </button>
      </div>

      {/* Daily Tabs */}
      {section === 'daily' && (
        <div className="flex border-b border-slate-100 p-2 space-x-1 bg-slate-50/50">
          {[
            { id: 'students', label: 'Học sinh', icon: 'fa-users' },
            { id: 'logbook', label: 'Nhật ký lớp', icon: 'fa-book' },
            { id: 'attendance', label: 'Điểm danh', icon: 'fa-calendar-check' },
            { id: 'assignments', label: 'Bài tập', icon: 'fa-tasks' },
            { id: 'notifications', label: 'Thông báo PH', icon: 'fa-bullhorn' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex-1 py-2.5 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${activeTab === tab.id ? 'bg-white text-indigo-600 shadow-sm border border-slate-100' : 'text-slate-400 hover:text-slate-600'}`}
            >
              <i className={`fas ${tab.icon} mr-2`}></i>
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {section === 'periodic' && (
        <div className="flex border-b border-slate-100 p-2 space-x-1 bg-slate-50/50">
          {[
            { id: 'quiz-creator', label: 'Tạo Quiz từ File', icon: 'fa-file-import' },
            { id: 'reports', label: 'Báo cáo Phổ điểm', icon: 'fa-chart-pie' },
            { id: 'subjects', label: 'ĐG Môn học (TT27)', icon: 'fa-book-open-reader' },
            { id: 'competencies', label: 'ĐG Năng lực, Phẩm chất', icon: 'fa-star' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setReportViewMode(tab.id as any)}
              className={`flex-1 py-2.5 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${reportViewMode === tab.id ? 'bg-white text-indigo-600 shadow-sm border border-slate-100' : 'text-slate-400 hover:text-slate-600'}`}
            >
              <i className={`fas ${tab.icon} mr-2`}></i>
              {tab.label}
            </button>
          ))}
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
        {section === 'periodic' && reportViewMode === 'quiz-creator' && (
          <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-500">
            <h3 className="text-xl font-black text-slate-800">Tạo Quiz từ File (Violympic, Trạng Nguyên...)</h3>
            <p className="text-sm text-slate-500">Tải lên tệp PDF hoặc ảnh đề thi, AI sẽ tự động bóc tách câu hỏi, đáp án và cả hình ảnh minh họa.</p>
            <div className="p-6 bg-indigo-50/50 rounded-2xl border-2 border-dashed border-indigo-200 flex flex-col items-center text-center">
              <input type="file" ref={quizFileInputRef} onChange={handleQuizFileSelect} accept="application/pdf,image/*" className="hidden" />
              {quizFile ? (
                <div className="flex items-center space-x-3 text-sm font-bold text-indigo-800">
                  <i className="fas fa-file-check text-emerald-500"></i>
                  <span>{quizFile.name}</span>
                  <button onClick={() => setQuizFile(null)} className="text-rose-500 hover:text-rose-700"><i className="fas fa-times-circle"></i></button>
                </div>
              ) : (
                <button onClick={() => quizFileInputRef.current?.click()} className="text-indigo-600 font-bold"><i className="fas fa-upload mr-2"></i>Chọn tệp PDF hoặc Ảnh...</button>
              )}
            </div>
            <button onClick={handleGenerateQuizFromFile} disabled={!quizFile || isGeneratingQuiz} className="w-full py-4 bg-indigo-600 text-white rounded-xl font-bold shadow-lg shadow-indigo-200 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all">
              {isGeneratingQuiz ? <><i className="fas fa-spinner fa-spin mr-2"></i>Đang phân tích đề...</> : <><i className="fas fa-wand-magic-sparkles mr-2"></i>Bắt đầu tạo Quiz</>}
            </button>
            {generatedQuiz && (
              <div className="mt-8 space-y-4">
                <h4 className="text-lg font-black">{generatedQuiz.title || 'Kết quả Quiz'}</h4>
                {generatedQuiz.questions.map((q, i) => (
                  <div key={q.id || i} className="p-4 border border-slate-200 rounded-xl bg-white">
                    <p className="font-bold">Câu {i + 1}: {q.content}</p>
                    {q.image && renderImage(q.image)}
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      {q.options?.map((opt: any, optIdx: number) => (
                        <div key={optIdx} className={`p-2 rounded-md text-xs ${String(opt.text) === String(q.answer) ? 'bg-emerald-100 text-emerald-800 font-bold' : 'bg-slate-50'}`}>
                          {opt.text}
                          {opt.image && renderImage(opt.image)}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {section === 'periodic' && reportViewMode !== 'quiz-creator' && (
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
                  <h4 className="text-lg font-black text-slate-800">Phổ điểm chi tiết</h4>
                  <p className="text-xs text-slate-400 font-medium">
                    {stats.latestAssignment ? `Bài: ${stats.latestAssignment.title}` : 'Chưa có dữ liệu bài tập'}
                  </p>
                </div>
                {stats.latestAssignment && (
                  <div className="flex items-center space-x-4">
                    <div className="text-right hidden sm:block">
                      <p className="text-[10px] font-black uppercase text-slate-400">Điểm trung bình</p>
                      <p className="text-2xl font-black text-indigo-600">{stats.averageScore}</p>
                    </div>
                    <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600 font-black text-sm border border-indigo-100">
                      {stats.averageScore}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-end justify-between h-64 px-4 border-b border-slate-100 mb-8 relative">
                <div className="absolute inset-0 flex flex-col justify-between pointer-events-none pb-8">
                  {[100, 75, 50, 25, 0].map(p => (
                    <div key={p} className="w-full border-t border-slate-50 flex items-center">
                      <span className="text-[8px] text-slate-300 -mt-2 mr-2 w-6 text-right">{p}%</span>
                    </div>
                  ))}
                </div>

                {[
                  { label: 'Giỏi', sub: '9-10', val: stats.distribution.excellent, color: 'bg-indigo-500', text: 'text-indigo-600' },
                  { label: 'Khá', sub: '7-8', val: stats.distribution.good, color: 'bg-emerald-500', text: 'text-emerald-600' },
                  { label: 'Trung bình', sub: '5-6', val: stats.distribution.average, color: 'bg-amber-500', text: 'text-amber-600' },
                  { label: 'Yếu', sub: '<5', val: stats.distribution.weak, color: 'bg-rose-500', text: 'text-rose-600' }
                ].map((item, i) => {
                  const total = stats.latestAssignment?.grades.length || 1;
                  const percent = Math.round((item.val / total) * 100);

                  return (
                    <div key={i} className="flex flex-col items-center flex-1 group relative z-10 h-full justify-end px-2 sm:px-6">
                      <div className="mb-2 opacity-0 group-hover:opacity-100 transition-all absolute bottom-full mb-2 bg-slate-800 text-white text-[10px] px-3 py-1.5 rounded-xl font-bold shadow-xl whitespace-nowrap transform translate-y-2 group-hover:translate-y-0">
                        {item.val} học sinh ({percent}%)
                        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1 border-4 border-transparent border-t-slate-800"></div>
                      </div>

                      <div className="w-full flex flex-col justify-end relative" style={{ height: '100%' }}>
                        <div className="flex justify-center mb-1">
                          <span className={`text-[10px] font-black ${item.text}`}>{percent}%</span>
                        </div>
                        <div
                          className={`w-full rounded-t-2xl ${item.color} transition-all duration-1000 shadow-lg group-hover:shadow-xl group-hover:brightness-110 relative overflow-hidden`}
                          style={{ height: `${Math.max(percent, 2)}%` }}
                        >
                          <div className="absolute inset-0 bg-gradient-to-t from-black/10 to-transparent"></div>
                        </div>
                      </div>

                      <div className="mt-3 text-center">
                        <p className="text-[10px] font-black text-slate-700 uppercase tracking-tighter">{item.label}</p>
                        <p className="text-[9px] font-bold text-slate-400">{item.sub}</p>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  { label: 'Giỏi', val: stats.distribution.excellent, color: 'text-indigo-600', bg: 'bg-indigo-50' },
                  { label: 'Khá', val: stats.distribution.good, color: 'text-emerald-600', bg: 'bg-emerald-50' },
                  { label: 'Trung bình', val: stats.distribution.average, color: 'text-amber-600', bg: 'bg-amber-50' },
                  { label: 'Yếu', val: stats.distribution.weak, color: 'text-rose-600', bg: 'bg-rose-50' }
                ].map((stat, i) => (
                  <div key={i} className={`p-4 rounded-2xl border border-slate-100 ${stat.bg} flex flex-col items-center justify-center`}>
                    <span className={`text-2xl font-black ${stat.color}`}>{stat.val}</span>
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">{stat.label}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white p-8 rounded-[40px] border border-slate-200 shadow-sm space-y-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <h4 className="text-lg font-black text-slate-800">Đánh giá Môn học (TT27)</h4>
                  <p className="text-xs text-slate-400 font-medium">Chọn môn học để nhập điểm hoặc đánh giá mức độ.</p>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Kỳ:</span>
                  <select
                    value={evaluationPeriod}
                    onChange={(e) => setEvaluationPeriod(e.target.value)}
                    className="bg-slate-50 border border-slate-200 text-slate-700 text-xs font-bold rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
                  >
                    {EVALUATION_PERIODS.map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="border-b border-slate-100 -mx-8 px-8 pb-4">
                <div className="flex space-x-2 overflow-x-auto custom-scrollbar pb-2">
                  {SUBJECTS_LIST.map(subj => (
                    <button
                      key={subj}
                      onClick={() => setSelectedPeriodicSubject(subj)}
                      className={`px-4 py-2 rounded-xl text-[11px] font-bold whitespace-nowrap transition-all border ${selectedPeriodicSubject === subj ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                    >
                      {subj}
                    </button>
                  ))}
                </div>
              </div>

              <div className="overflow-x-auto">
                {reportViewMode === 'subjects' ? (
                  <>
                    <div className="flex justify-end gap-2 mb-4">
                      <button onClick={handleExportSubjectData} className="px-4 py-2 rounded-xl bg-emerald-50 text-emerald-700 text-[10px] font-black uppercase tracking-widest border border-emerald-200 hover:bg-emerald-100 transition-all">
                        <i className="fas fa-file-excel mr-2"></i>Xuất File (CSV)
                      </button>
                    </div>
                    <table className="w-full text-left border-collapse min-w-[800px]">
                      <thead>
                        <tr className="text-[10px] text-slate-500 uppercase tracking-widest border-b border-slate-200 bg-slate-50">
                          <th className="py-3 px-4 font-black border-r border-slate-200 sticky left-0 z-20 bg-slate-50 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">Họ tên</th>
                          <th className="py-3 px-4 font-black text-center border-r border-slate-200">Điểm <span className="text-[9px] font-normal text-slate-400 block">(Toán, TV)</span></th>
                          <th className="py-3 px-4 font-black text-center border-r border-slate-200">Mức đạt được</th>
                          <th className="py-3 px-4 font-black border-r border-slate-200 w-1/3">Nhận xét</th>
                          <th className="py-3 px-4 font-black text-center">Thời điểm đánh giá</th>
                        </tr>
                      </thead>
                      <tbody key={`${storageKey}`} className="text-xs font-medium text-slate-600">
                        {filteredStudents.map(s => {
                          const studentEval = manualEvaluations[s.id] || {};
                          const score = studentEval.score || '';
                          const feedback = studentEval.feedback || '';
                          const finalSubject = studentEval.subject || getCircular27Evaluation(score).subject;
                          const displaySubjectEval = finalSubject === 'Hoàn thành tốt' ? 'T' : finalSubject === 'Hoàn thành' ? 'H' : finalSubject === 'Chưa hoàn thành' ? 'C' : '-';
                          const isScoreSubject = ['Toán', 'Tiếng Việt'].includes(selectedPeriodicSubject);

                          return (
                            <tr key={s.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                              <td className="py-3 px-4 font-bold text-slate-800 border-r border-slate-100 sticky left-0 z-10 bg-white shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] whitespace-nowrap">{s.name} <span className="text-[9px] text-slate-400 font-normal ml-1">({s.code})</span></td>
                              <td className="p-0 border-r border-slate-100">
                                {isScoreSubject ? (
                                  <input
                                    type="text"
                                    className="w-full h-full px-4 py-3 bg-transparent border-none focus:ring-0 text-center font-black text-indigo-600 placeholder-slate-300"
                                    value={score}
                                    onChange={(e) => handlePeriodicScoreChange(s.id, e.target.value)}
                                    onPaste={(e) => handlePastePeriodicScores(e, s.id)}
                                    placeholder="Điểm"
                                  />
                                ) : (
                                  <div className="w-full h-full px-4 py-3 text-center text-slate-300 italic text-xs">Không áp dụng</div>
                                )}
                              </td>
                              <td
                                tabIndex={0}
                                className="py-3 px-4 text-center border-r border-slate-100 cursor-pointer hover:bg-slate-100 outline-none focus:bg-indigo-50"
                                onClick={() => handlePeriodicLevelChange(s.id, finalSubject)}
                                onPaste={(e) => handlePastePeriodicLevels(e, s.id)}
                              >
                                <span className={`px-2 py-1 rounded-lg text-[10px] font-bold select-none ${finalSubject === 'Hoàn thành tốt' ? 'bg-emerald-100 text-emerald-700' : finalSubject === 'Hoàn thành' ? 'bg-blue-100 text-blue-700' : finalSubject === 'Chưa hoàn thành' ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-500'}`}>
                                  {displaySubjectEval}
                                </span>
                              </td>
                              <td className="py-3 px-4 border-r border-slate-100 p-0">
                                <input
                                  type="text"
                                  className="w-full h-full px-4 py-3 bg-transparent border-none focus:ring-0 text-xs font-medium text-slate-600 placeholder-slate-300"
                                  value={feedback}
                                  onChange={(e) => handlePeriodicFeedbackChange(s.id, e.target.value)}
                                  placeholder="Nhận xét tự động..."
                                />
                              </td>
                              <td className="py-3 px-4 text-center">{evaluationPeriod}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </>
                ) : (
                  <>
                    <div className="flex justify-end gap-2 mb-4">
                      <button
                        onClick={handleExportCompetencies}
                        className="px-4 py-2 rounded-xl bg-emerald-50 text-emerald-700 text-[10px] font-black uppercase tracking-widest border border-emerald-200 hover:bg-emerald-100 transition-all"
                      >
                        <i className="fas fa-file-excel mr-2"></i>Xuất ra File (CSV)
                      </button>
                    </div>
                    <table className="w-full text-left border-collapse min-w-[1400px]">
                      <thead>
                        <tr className="text-[9px] text-slate-600 uppercase tracking-tighter border border-slate-300 bg-slate-100 font-black text-center">
                          <th rowSpan={2} className="py-2 px-2 border border-slate-300 w-10 hidden md:table-cell">STT</th>
                          <th rowSpan={2} className="py-2 px-2 border border-slate-300 w-24 hidden md:table-cell">Mã học sinh</th>
                          <th rowSpan={2} className="py-2 px-2 border border-slate-300 w-40 sticky left-0 z-20 bg-slate-100 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">Họ và tên</th>
                          <th colSpan={3} className="py-2 px-1 border border-slate-300 bg-indigo-50 text-indigo-700">NL chung</th>
                          <th colSpan={7} className="py-2 px-1 border border-slate-300 bg-sky-50 text-sky-700">NL đặc thù</th>
                          <th colSpan={5} className="py-2 px-1 border border-slate-300 bg-emerald-50 text-emerald-700">Phẩm chất</th>
                          <th rowSpan={2} className="py-2 px-2 border border-slate-300 w-28">Nhận xét NL chung</th>
                          <th rowSpan={2} className="py-2 px-2 border border-slate-300 w-28">Nhận xét NL đặc thù</th>
                          <th rowSpan={2} className="py-2 px-2 border border-slate-300 w-28">Nhận xét phẩm chất</th>
                          <th rowSpan={2} className="py-2 px-2 border border-slate-300 w-24">Thời điểm đánh giá</th>
                        </tr>
                        <tr className="text-[8px] text-slate-500 uppercase tracking-tighter border border-slate-300 bg-slate-50 text-center font-bold">
                          {/* NL Chung */}
                          <th title="Tự chủ & Tự học" className="py-2 px-1 border border-slate-300 w-12">Tự chủ</th>
                          <th title="Giao tiếp & Hợp tác" className="py-2 px-1 border border-slate-300 w-12">Giao tiếp</th>
                          <th title="Giải quyết Vấn đề & Sáng tạo" className="py-2 px-1 border border-slate-300 w-12">GQ VĐ</th>
                          {/* NL Đặc thù */}
                          <th className="py-2 px-1 border border-slate-300 w-12">Ngôn ngữ</th>
                          <th className="py-2 px-1 border border-slate-300 w-12">Tính toán</th>
                          <th className="py-2 px-1 border border-slate-300 w-12">Khoa học</th>
                          <th className="py-2 px-1 border border-slate-300 w-12">Công nghệ</th>
                          <th className="py-2 px-1 border border-slate-300 w-12">Tin học</th>
                          <th className="py-2 px-1 border border-slate-300 w-12">Thẩm mĩ</th>
                          <th className="py-2 px-1 border border-slate-300 w-12">Thể chất</th>
                          {/* Phẩm chất */}
                          <th className="py-2 px-1 border border-slate-300 w-12">Yêu nước</th>
                          <th className="py-2 px-1 border border-slate-300 w-12">Nhân ái</th>
                          <th className="py-2 px-1 border border-slate-300 w-12">Chăm chỉ</th>
                          <th className="py-2 px-1 border border-slate-300 w-12">Trung thực</th>
                          <th title="Trách nhiệm" className="py-2 px-1 border border-slate-300 w-12">Tr.Nhiệm</th>
                        </tr>
                      </thead>
                      <tbody key={`competencies-${selectedAssignmentId}-${evaluationPeriod}`} className="text-[10px] font-medium text-slate-600">
                        {filteredStudents.map((s, idx) => {
                          const grade = selectedAssignment?.grades.find(g => g.studentId === s.id);
                          const eval27 = getCircular27Evaluation(grade?.score || '');
                          const cVal = eval27.competence === 'Tốt' ? 'T' : eval27.competence === 'Đạt' ? 'Đ' : eval27.competence === 'Cần cố gắng' ? 'C' : '-';
                          const qVal = eval27.quality === 'Tốt' ? 'T' : eval27.quality === 'Đạt' ? 'Đ' : eval27.quality === 'Cần cố gắng' ? 'C' : '-';
                          const manualData = manualEvaluations[s.id] || {};

                          return (
                            <tr key={s.id} className="border-b border-slate-200 hover:bg-slate-50 transition-colors">
                              <td className="py-2 px-2 border border-slate-200 text-center hidden md:table-cell">{idx + 1}</td>
                              <td className="py-2 px-2 border border-slate-200 hidden md:table-cell">{s.code}</td>
                              <td className="py-2 px-2 border border-slate-200 font-bold text-slate-800 sticky left-0 z-10 bg-white shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] whitespace-nowrap">{s.name}</td>
                              {/* NL Chung */}
                              {[1, 2, 3].map(i => {
                                const val = manualData.competencies?.[i] || cVal; return <td key={i} tabIndex={0} onPaste={(e) => handlePasteCompetencies(e, s.id, 'competence', i)} onClick={() => handleManualChange(s.id, 'competence', i, val)} className={`py-2 px-2 border border-slate-200 text-center cursor-pointer hover:bg-slate-100 font-bold outline-none focus:bg-indigo-50 ${val === 'T' ? 'text-emerald-600' : val === 'Đ' ? 'text-blue-600' : val === 'C' ? 'text-rose-500' : 'text-slate-400'}`}>{val}</td>
                              })}
                              {/* NL Đặc thù */}
                              {[1, 2, 3, 4, 5, 6, 7].map(i => {
                                // Offset index cho NL đặc thù để không trùng key với NL chung trong state
                                const realIdx = i + 3;
                                const val = manualData.competencies?.[realIdx] || cVal;
                                return <td key={i} tabIndex={0} onPaste={(e) => handlePasteCompetencies(e, s.id, 'competence', realIdx)} onClick={() => handleManualChange(s.id, 'competence', realIdx, val)} className={`py-2 px-2 border border-slate-200 text-center cursor-pointer hover:bg-slate-100 font-bold outline-none focus:bg-indigo-50 ${val === 'T' ? 'text-emerald-600' : val === 'Đ' ? 'text-blue-600' : val === 'C' ? 'text-rose-500' : 'text-slate-400'}`}>{val}</td>
                              })}
                              {/* Phẩm chất */}
                              {[1, 2, 3, 4, 5].map(i => {
                                const val = manualData.qualities?.[i] || qVal;
                                return <td key={i} tabIndex={0} onPaste={(e) => handlePasteCompetencies(e, s.id, 'quality', i)} onClick={() => handleManualChange(s.id, 'quality', i, val)} className={`py-2 px-2 border border-slate-200 text-center cursor-pointer hover:bg-slate-100 font-bold outline-none focus:bg-indigo-50 ${val === 'T' ? 'text-emerald-600' : val === 'Đ' ? 'text-blue-600' : val === 'C' ? 'text-rose-500' : 'text-slate-400'}`}>{val}</td>
                              })}
                              {/* Nhận xét */}
                              <td className="py-2 px-2 border border-slate-200 p-0">
                                <textarea
                                  className="w-full h-full min-h-[40px] px-2 py-1 bg-transparent border-none focus:ring-0 text-[10px] resize-none"
                                  value={manualData.compComment || ''}
                                  onChange={(e) => handleManualCommentChange(s.id, 'compComment', e.target.value)}
                                  placeholder="NX NL chung..."
                                />
                              </td>
                              <td className="py-2 px-2 border border-slate-200 p-0">
                                <textarea
                                  className="w-full h-full min-h-[40px] px-2 py-1 bg-transparent border-none focus:ring-0 text-[10px] resize-none"
                                  value={manualData.specComment || ''}
                                  onChange={(e) => handleManualCommentChange(s.id, 'specComment', e.target.value)}
                                  placeholder="NX NL đặc thù..."
                                />
                              </td>
                              <td className="py-2 px-2 border border-slate-200 p-0">
                                <textarea
                                  className="w-full h-full min-h-[40px] px-2 py-1 bg-transparent border-none focus:ring-0 text-[10px] resize-none"
                                  value={manualData.qualComment || ''}
                                  onChange={(e) => handleManualCommentChange(s.id, 'qualComment', e.target.value)}
                                  placeholder="NX phẩm chất..."
                                />
                              </td>
                              <td className="py-2 px-2 border border-slate-200 text-center">{evaluationPeriod}</td>
                            </tr>
                          );
                        })}</tbody>
                    </table>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {section === 'daily' && activeTab === 'logbook' && (
          <div className="space-y-6 animate-in fade-in">
            <div className="flex flex-col sm:flex-row items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 gap-4">
              <div>
                <label htmlFor="log-date" className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Chọn ngày nhận xét</label>
                <input
                  type="date"
                  id="log-date"
                  value={logDate}
                  onChange={e => setLogDate(e.target.value)}
                  className="mt-1 bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <button onClick={handleSaveLogs} className="w-full sm:w-auto px-6 py-3 bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg hover:bg-emerald-700 active:scale-95">
                <i className="fas fa-save mr-2"></i>Lưu nhận xét
              </button>
            </div>

            <div className="space-y-3">
              {filteredStudents.map(student => (
                <div key={student.id} className="p-4 bg-white border border-slate-100 rounded-2xl flex items-start gap-4 hover:bg-slate-50/50 transition-colors">
                  <div className={`w-10 h-10 rounded-2xl flex-shrink-0 flex items-center justify-center text-[10px] font-black shadow-sm ${student.gender === 'Nam' ? 'bg-blue-50 text-blue-600 border border-blue-100' : 'bg-rose-50 text-rose-600 border border-rose-100'}`}>
                    {student.name.split(' ').pop()?.charAt(0) || student.name.charAt(0)}
                  </div>
                  <div className="flex-1 space-y-2">
                    <p className="font-bold text-sm text-slate-800">{student.name}</p>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder="Ghi nhận xét, lỗi vi phạm..."
                        value={currentLogEntries[student.id]?.comment || ''}
                        onChange={e => handleLogChange(student.id, e.target.value)}
                        className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                      <button onClick={() => handleLogTypeChange(student.id, 'praise')} className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${currentLogEntries[student.id]?.type === 'praise' ? 'bg-emerald-500 text-white border-emerald-500 shadow-sm' : 'bg-white text-emerald-600 border-slate-200'}`} title="Khen thưởng">
                        <i className="fas fa-award"></i>
                      </button>
                      <button onClick={() => handleLogTypeChange(student.id, 'mistake')} className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${currentLogEntries[student.id]?.type === 'mistake' || !currentLogEntries[student.id]?.type ? 'bg-rose-500 text-white border-rose-500 shadow-sm' : 'bg-white text-rose-600 border-slate-200'}`} title="Cần nhắc nhở">
                        <i className="fas fa-flag"></i>
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1.5 pt-2">
                      {COMMON_LOGS.praise.map(log => (
                        <button
                          key={`praise-${log}`}
                          onClick={() => handleSelectLogComment(student.id, log, 'praise')}
                          className="px-2.5 py-1 bg-emerald-50 text-emerald-700 text-[9px] font-bold rounded-lg border border-emerald-100 hover:bg-emerald-100 transition-all"
                        >
                          <i className="fas fa-plus-circle text-emerald-400 mr-1.5"></i>{log}
                        </button>
                      ))}
                      {COMMON_LOGS.mistake.map(log => (
                        <button
                          key={`mistake-${log}`}
                          onClick={() => handleSelectLogComment(student.id, log, 'mistake')}
                          className="px-2.5 py-1 bg-rose-50 text-rose-700 text-[9px] font-bold rounded-lg border border-rose-100 hover:bg-rose-100 transition-all"
                        >
                          <i className="fas fa-plus-circle text-rose-400 mr-1.5"></i>{log}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {section === 'daily' && activeTab === 'notifications' && (
          <div className="space-y-6 animate-in fade-in">
            {generatedNotifications ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-lg font-black text-slate-800">Kết quả Thông báo hàng loạt</h4>
                  <button onClick={() => setGeneratedNotifications(null)} className="px-4 py-2 rounded-xl bg-slate-100 text-slate-600 text-[10px] font-black uppercase tracking-widest hover:bg-slate-200">
                    <i className="fas fa-arrow-left mr-2"></i>Soạn lại
                  </button>
                </div>
                <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200">
                  <p className="text-xs text-slate-500 mb-2 font-medium">Nội dung đã được tạo cho <b>{selectedStudents.size > 0 ? selectedStudents.size : filteredStudents.length}</b> phụ huynh. Thầy/Cô hãy sao chép và gửi qua Zalo, SMS...</p>
                  <textarea
                    readOnly
                    value={generatedNotifications}
                    className="w-full h-96 p-4 bg-white border border-slate-200 rounded-xl text-xs font-mono focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
                  />
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(generatedNotifications);
                      alert('Đã sao chép toàn bộ nội dung thông báo!');
                    }}
                    className="mt-4 w-full py-3 bg-emerald-600 text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-lg hover:bg-emerald-700"
                  >
                    <i className="fas fa-copy mr-2"></i>Sao chép toàn bộ
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Tiêu đề thông báo</label>
                    <input
                      type="text"
                      value={notificationTitle}
                      onChange={e => setNotificationTitle(e.target.value)}
                      className="w-full mt-1 bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nội dung thông báo</label>
                    <p className="text-[9px] text-slate-400 font-medium ml-1">Sử dụng <code className="bg-slate-100 px-1 rounded">{`{ten_hoc_sinh}`}</code> và <code className="bg-slate-100 px-1 rounded">{`{ma_hoc_sinh}`}</code> để cá nhân hóa.</p>
                    <textarea
                      value={notificationContent}
                      onChange={e => setNotificationContent(e.target.value)}
                      className="w-full mt-1 bg-white border border-slate-200 rounded-xl px-4 py-3 text-xs focus:ring-2 focus:ring-indigo-500 outline-none h-64 resize-none leading-relaxed"
                    />
                  </div>
                  <button
                    onClick={handleGenerateNotifications}
                    className="w-full py-4 bg-indigo-600 text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-lg hover:bg-indigo-700"
                  >
                    <i className="fas fa-paper-plane mr-2"></i>Tạo nội dung thông báo
                  </button>
                </div>
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 h-full flex flex-col">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Chọn người nhận</h4>
                  <p className="text-[9px] text-slate-400 font-medium mb-3">Nếu không chọn học sinh nào, thông báo sẽ được tạo cho tất cả học sinh trong danh sách.</p>
                  <div className="flex items-center mb-3 px-2">
                    <label className="flex items-center space-x-2 cursor-pointer select-none group">
                      <input type="checkbox" checked={selectedStudents.size === filteredStudents.length && filteredStudents.length > 0} onChange={toggleSelectAll} className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer" />
                      <span className="text-[10px] font-bold text-slate-400 uppercase group-hover:text-indigo-600 transition-colors">Chọn tất cả ({filteredStudents.length})</span>
                    </label>
                  </div>
                  <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                    {filteredStudents.map(s => (
                      <div
                        key={s.id}
                        onClick={() => toggleSelection(s.id)}
                        className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center space-x-3 ${selectedStudents.has(s.id) ? 'bg-indigo-50 border-indigo-200' : 'bg-white border-slate-100'}`}
                      >
                        <input
                          type="checkbox"
                          readOnly
                          checked={selectedStudents.has(s.id)}
                          className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-0 cursor-pointer"
                        />
                        <div className={`w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center text-[10px] font-black ${s.gender === 'Nam' ? 'bg-blue-100 text-blue-600' : 'bg-rose-100 text-rose-600'}`}>
                          {s.name.split(' ').pop()?.charAt(0) || s.name.charAt(0)}
                        </div>
                        <div>
                          <p className="text-xs font-bold text-slate-800">{s.name}</p>
                          <p className="text-[9px] text-slate-400 font-medium">{s.code}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {section === 'daily' && activeTab === 'students' && (
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
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => studentFileInputRef.current?.click()}
                    className="px-4 py-3 bg-white text-indigo-600 border-2 border-dashed border-indigo-200 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-50 hover:border-indigo-400 transition-all flex items-center justify-center"
                  >
                    <i className="fas fa-file-upload mr-2"></i>Tải File
                  </button>
                  <button
                    onClick={() => setShowPasteModal(true)}
                    className="px-4 py-3 bg-white text-emerald-600 border-2 border-dashed border-emerald-200 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-50 hover:border-emerald-400 transition-all flex items-center justify-center"
                  >
                    <i className="fas fa-paste mr-2"></i>Dán Text
                  </button>
                </div>
                <div className="flex items-center justify-between px-1">
                  <p className="text-[8px] text-slate-400 font-bold uppercase">Định dạng: Mã HS, Tên, Giới tính</p>
                  <button onClick={handleDownloadSample} className="text-[8px] text-indigo-500 hover:text-indigo-700 font-black uppercase underline decoration-dotted underline-offset-2">Tải file mẫu</button>
                </div>
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

              {selectedStudents.size > 0 && (
                <button onClick={deleteSelected} className="px-4 py-2 bg-rose-50 text-rose-600 rounded-xl text-[10px] font-black uppercase tracking-widest border border-rose-100 hover:bg-rose-100 transition-all animate-in fade-in zoom-in">
                  <i className="fas fa-trash-alt mr-2"></i>Xóa {selectedStudents.size} HS
                </button>
              )}

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

            {filteredStudents.length > 0 && (
              <div className="flex items-center mb-2 px-2">
                <label className="flex items-center space-x-2 cursor-pointer select-none group">
                  <input type="checkbox" checked={selectedStudents.size === filteredStudents.length && filteredStudents.length > 0} onChange={toggleSelectAll} className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer" />
                  <span className="text-[10px] font-bold text-slate-400 uppercase group-hover:text-indigo-600 transition-colors">Chọn tất cả ({filteredStudents.length})</span>
                </label>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredStudents.length > 0 ? (
                filteredStudents.map(s => (
                  <div key={s.id} className={`p-4 bg-white border ${selectedStudents.has(s.id) ? 'border-indigo-500 ring-1 ring-indigo-500 bg-indigo-50/30' : 'border-slate-100'} rounded-[28px] flex items-center justify-between group hover:border-indigo-300 hover:shadow-xl hover:shadow-indigo-50 transition-all animate-in fade-in duration-300 relative`}>
                    <div className="absolute top-4 left-4 z-10">
                      <input
                        type="checkbox"
                        checked={selectedStudents.has(s.id)}
                        onChange={() => toggleSelection(s.id)}
                        className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                      />
                    </div>
                    <div className="flex items-center space-x-3 pl-8">
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

        {section === 'daily' && activeTab === 'attendance' && (
          <div className="space-y-6 animate-in fade-in">
            <div className="flex items-center justify-between p-4 bg-emerald-50 rounded-2xl border border-emerald-100">
              <div>
                <h4 className="text-sm font-black text-emerald-800 uppercase tracking-widest">Điểm danh hôm nay</h4>
                <p className="text-xs text-emerald-600 font-medium">{new Date().toLocaleDateString('vi-VN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
              </div>
              <div className="px-4 py-2 bg-white rounded-xl shadow-sm text-emerald-600 font-black text-xl">
                {(() => {
                  const today = new Date().toISOString().split('T')[0];
                  const record = classroom.attendance.find(a => a.date === today);
                  return record ? `${record.present.length}/${classroom.students.length}` : `0/${classroom.students.length}`;
                })()}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => handleBulkAttendance('present')}
                className="px-4 py-2 rounded-xl bg-emerald-100 text-emerald-700 text-[10px] font-black uppercase tracking-widest border border-emerald-200 hover:bg-emerald-200 transition-all"
              >
                <i className="fas fa-check-double mr-2"></i>Tất cả có mặt
              </button>
              <button
                onClick={() => handleBulkAttendance('absent')}
                className="px-4 py-2 rounded-xl bg-rose-100 text-rose-700 text-[10px] font-black uppercase tracking-widest border border-rose-200 hover:bg-rose-200 transition-all"
              >
                <i className="fas fa-user-slash mr-2"></i>Tất cả vắng mặt
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredStudents.map(s => {
                const today = new Date().toISOString().split('T')[0];
                const record = classroom.attendance.find(a => a.date === today);
                const isPresent = record ? record.present.includes(s.id) : false;

                return (
                  <div key={s.id} onClick={() => handleAttendance(s.id)} className={`p-4 rounded-2xl border cursor-pointer transition-all flex items-center justify-between ${isPresent ? 'bg-white border-emerald-200 shadow-sm' : 'bg-slate-50 border-slate-200 opacity-70'}`}>
                    <div className="flex items-center space-x-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xs font-black ${isPresent ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-200 text-slate-400'}`}>
                        {s.code.slice(-3)}
                      </div>
                      <div>
                        <p className={`text-sm font-bold ${isPresent ? 'text-slate-800' : 'text-slate-500'}`}>{s.name}</p>
                        <p className="text-[10px] uppercase font-bold text-slate-400">{isPresent ? 'Có mặt' : 'Vắng mặt'}</p>
                      </div>
                    </div>
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center border-2 ${isPresent ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300 bg-white'}`}>
                      {isPresent && <i className="fas fa-check text-[10px]"></i>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {section === 'daily' && activeTab === 'assignments' && (
          <div className="space-y-6 animate-in fade-in duration-500">
            {assignmentToView ? (
              <div>
                <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
                  <div>
                    <h4 className="text-lg font-black text-slate-800">Chi tiết: {assignmentToView.title}</h4>
                    <p className="text-xs text-slate-400 font-medium">
                      {assignmentToView.grades.length} / {classroom.students.length} học sinh đã nộp bài.
                    </p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => {
                        const newStatus = assignmentToView.status === 'Đang mở' ? 'Đã đóng' : 'Đang mở';
                        const updatedAssignments = classroom.assignments.map(a =>
                          a.id === assignmentToView.id ? { ...a, status: newStatus } : a
                        );
                        onUpdate({ ...classroom, assignments: updatedAssignments });
                      }}
                      className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${assignmentToView.status === 'Đang mở' ? 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100' : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'}`}
                    >
                      <i className={`fas ${assignmentToView.status === 'Đang mở' ? 'fa-lock' : 'fa-lock-open'} mr-2`}></i>
                      {assignmentToView.status === 'Đang mở' ? 'Đóng bài' : 'Mở lại'}
                    </button>
                    <button
                      onClick={() => {
                        if (window.confirm(`Thầy Cô chắc chắn muốn xóa bài tập "${assignmentToView.title}"? Hành động này không thể hoàn tác.`)) {
                          const updatedAssignments = classroom.assignments.filter(a => a.id !== assignmentToView.id);
                          onUpdate({ ...classroom, assignments: updatedAssignments });
                          setViewingAssignmentId(null);
                        }
                      }}
                      className="px-4 py-2 rounded-xl bg-slate-50 text-slate-600 text-[10px] font-black uppercase tracking-widest border border-slate-200 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 transition-all"
                    >
                      <i className="fas fa-trash-alt mr-2"></i>Xóa
                    </button>
                    <button
                      onClick={handleRemindUnsubmitted}
                      className="px-4 py-2 rounded-xl bg-amber-50 text-amber-700 text-[10px] font-black uppercase tracking-widest border border-amber-200 hover:bg-amber-100 transition-all"
                    >
                      <i className="fas fa-bell mr-2"></i>Nhắc nhở
                    </button>
                    <button
                      onClick={() => setViewingAssignmentId(null)}
                      className="px-4 py-2 rounded-xl bg-slate-100 text-slate-600 text-[10px] font-black uppercase tracking-widest hover:bg-slate-200"
                    >
                      <i className="fas fa-arrow-left mr-2"></i>Quay lại
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  {filteredStudents.map(student => {
                    const grade = assignmentToView.grades.find(g => g.studentId === student.id);
                    const hasSubmitted = !!grade;
                    return (
                      <div key={student.id} className={`p-4 rounded-2xl border flex items-center justify-between ${hasSubmitted ? 'bg-white border-emerald-100' : 'bg-slate-50 border-slate-100'}`}>
                        <div className="flex items-center space-x-3">
                          <div className={`w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center text-[10px] font-black ${student.gender === 'Nam' ? 'bg-blue-100 text-blue-600' : 'bg-rose-100 text-rose-600'}`}>
                            {student.name.split(' ').pop()?.charAt(0) || student.name.charAt(0)}
                          </div>
                          <div>
                            <p className="text-xs font-bold text-slate-800">{student.name}</p>
                            <p className="text-[9px] text-slate-400 font-medium">{student.code}</p>
                          </div>
                        </div>
                        <div className="flex items-center space-x-4">
                          {hasSubmitted && (
                            <span className="text-xs font-bold text-slate-600">Điểm: <span className="text-indigo-600 font-black">{grade.score}</span></span>
                          )}
                          <span className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase ${hasSubmitted ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                            {hasSubmitted ? 'Đã nộp' : 'Chưa nộp'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <>
                <div className="flex justify-end">
                  <button
                    onClick={() => {
                      const newId = Date.now().toString();
                      const newAssignment = {
                        id: newId,
                        title: `Bài tập ngày ${new Date().toLocaleDateString('vi-VN')}`,
                        dueDate: new Date().toISOString().split('T')[0],
                        status: 'Đang mở' as const,
                        submissions: [],
                        grades: []
                      };
                      onUpdate({ ...classroom, assignments: [...classroom.assignments, newAssignment] });
                    }}
                    className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest shadow-lg hover:bg-indigo-700 transition-all"
                  >
                    <i className="fas fa-plus mr-2"></i>Giao bài tập mới
                  </button>
                </div>

                <div className="space-y-3">
                  {dailyAssignments.length > 0 ? dailyAssignments.slice().reverse().map(assign => (
                    <div key={assign.id} onClick={() => setViewingAssignmentId(assign.id)} className="p-5 bg-white border border-slate-100 rounded-[24px] flex items-center justify-between hover:shadow-md transition-all cursor-pointer">
                      <div className="flex items-center space-x-4">
                        <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center text-xl">
                          <i className="fas fa-file-pen"></i>
                        </div>
                        <div>
                          <h4 className="text-sm font-black text-slate-800">{assign.title}</h4>
                          <p className="text-[11px] text-slate-500 font-medium mt-0.5">Hạn nộp: {new Date(assign.dueDate).toLocaleDateString('vi-VN')} • {assign.grades.length} / {classroom.students.length} đã nộp</p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-3">
                        <span className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase ${assign.status === 'Đang mở' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>
                          {assign.status}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (window.confirm('Xóa bài tập này?')) {
                              onUpdate({ ...classroom, assignments: classroom.assignments.filter(a => a.id !== assign.id) });
                            }
                          }}
                          className="w-8 h-8 flex items-center justify-center text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all"
                        >
                          <i className="fas fa-trash-alt"></i>
                        </button>
                      </div>
                    </div>
                  )) : (
                    <div className="text-center py-12 text-slate-400">
                      <i className="fas fa-clipboard-list text-4xl mb-3 opacity-20"></i>
                      <p className="text-xs font-bold uppercase tracking-widest">Chưa có bài tập nào</p>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {showPasteModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowPasteModal(false)}></div>
          <div className="bg-white w-full max-w-2xl rounded-[32px] shadow-2xl relative z-10 animate-in zoom-in-95 flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-center mb-6 p-8 pb-0 shrink-0">
              <h3 className="text-lg font-black text-slate-800 uppercase tracking-widest">Dán danh sách học sinh</h3>
              <button onClick={() => setShowPasteModal(false)} className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 text-slate-400 hover:bg-rose-100 hover:text-rose-500 transition-all">
                <i className="fas fa-times"></i>
              </button>
            </div>

            <div className="mb-6 overflow-y-auto px-8">
              <p className="text-xs text-slate-500 mb-2 font-medium">Copy từ Excel (Cột Mã, Tên, Giới tính) và dán vào đây:</p>
              <textarea
                value={pasteContent}
                onChange={(e) => setPasteContent(e.target.value)}
                placeholder={`Ví dụ:\nHS001\tNguyễn Văn A\tNam\nHS002\tTrần Thị B\tNữ`}
                className="w-full h-64 p-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-mono focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
              />
            </div>

            <div className="flex justify-end space-x-3 mt-auto p-8 pt-0 shrink-0">
              <button onClick={() => setShowPasteModal(false)} className="px-6 py-3 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100 transition-all">Hủy bỏ</button>
              <button onClick={handleProcessPaste} className="px-6 py-3 rounded-xl bg-indigo-600 text-white text-xs font-black uppercase tracking-widest shadow-lg hover:bg-indigo-700 transition-all">
                <i className="fas fa-file-import mr-2"></i>Xử lý & Thêm
              </button>
            </div>
          </div>
        </div>
      )}

      {showReviewPasteModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowReviewPasteModal(false)}></div>
          <div className="bg-white w-full max-w-2xl rounded-[32px] shadow-2xl relative z-10 animate-in zoom-in-95 flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-center mb-6 p-8 pb-0 shrink-0">
              <h3 className="text-lg font-black text-slate-800 uppercase tracking-widest">Dán bảng điểm & Đánh giá</h3>
              <button onClick={() => { setShowReviewPasteModal(false); setReviewAttachments([]); }} className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 text-slate-400 hover:bg-rose-100 hover:text-rose-500 transition-all">
                <i className="fas fa-times"></i>
              </button>
            </div>

            <div className="mb-6 overflow-y-auto px-8">
              <p className="text-xs text-slate-500 mb-2 font-medium">Copy danh sách từ Excel hoặc <b>dán ảnh chụp bảng điểm (Ctrl+V)</b> vào đây:</p>
              {reviewAttachments.length > 0 && (
                <div className="flex gap-2 mb-3 overflow-x-auto pb-2">
                  {reviewAttachments.map((att, idx) => (
                    <div key={idx} className="relative shrink-0 group">
                      <img src={`data:${att.mimeType};base64,${att.data}`} className="h-20 w-auto rounded-lg border border-slate-200 shadow-sm" alt="Pasted" />
                      <button onClick={() => setReviewAttachments(prev => prev.filter((_, i) => i !== idx))} className="absolute -top-2 -right-2 bg-rose-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px] shadow-md hover:bg-rose-600"><i className="fas fa-times"></i></button>
                    </div>
                  ))}
                </div>
              )}
              <textarea
                value={reviewPasteContent}
                onChange={(e) => setReviewPasteContent(e.target.value)}
                placeholder={`Ví dụ:\nNguyễn Văn A - Toán: 9, Tiếng Việt: 8 - Chăm chỉ, ngoan\nTrần Thị B - Toán: 5, Tiếng Việt: 6 - Cần cố gắng môn Toán`}
                className="w-full h-64 p-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-mono focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
              />
            </div>

            <div className="flex justify-end space-x-3 mt-auto p-8 pt-0 shrink-0">
              <button onClick={() => { setShowReviewPasteModal(false); setReviewAttachments([]); }} className="px-6 py-3 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100 transition-all">Hủy bỏ</button>
              <button onClick={handleGenerateAIReviewFromPaste} disabled={isGeneratingReview} className="px-6 py-3 rounded-xl bg-indigo-600 text-white text-xs font-black uppercase tracking-widest shadow-lg hover:bg-indigo-700 transition-all disabled:opacity-60 disabled:cursor-not-allowed">
                {isGeneratingReview ? (
                  <><i className="fas fa-spinner fa-spin mr-2"></i>Đang xử lý...</>
                ) : (
                  <><i className="fas fa-wand-magic-sparkles mr-2"></i>Tạo Nhận xét</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {showGradePasteModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowGradePasteModal(false)}></div>
          <div className="bg-white w-full max-w-2xl rounded-[32px] shadow-2xl relative z-10 animate-in zoom-in-95 flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-center mb-6 p-8 pb-0 shrink-0">
              <h3 className="text-lg font-black text-slate-800 uppercase tracking-widest">Dán Bảng điểm & Nhận xét</h3>
              <button onClick={() => setShowGradePasteModal(false)} className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 text-slate-400 hover:bg-rose-100 hover:text-rose-500 transition-all">
                <i className="fas fa-times"></i>
              </button>
            </div>

            <div className="mb-6 overflow-y-auto px-8">
              <p className="text-xs text-slate-500 mb-2 font-medium">Copy từ Excel (Cột Mã HS/Tên, Điểm, Nhận xét) và dán vào đây:</p>
              <textarea
                value={gradePasteContent}
                onChange={(e) => setGradePasteContent(e.target.value)}
                placeholder={`Ví dụ:\nHS001\t9\tHoàn thành tốt\nTrần Thị Bình\t7\tCần cẩn thận hơn`}
                className="w-full h-64 p-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-mono focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
              />
            </div>

            <div className="flex justify-end space-x-3 mt-auto p-8 pt-0 shrink-0">
              <button onClick={() => setShowGradePasteModal(false)} className="px-6 py-3 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100 transition-all">Hủy bỏ</button>
              <button onClick={handleProcessGradePaste} className="px-6 py-3 rounded-xl bg-indigo-600 text-white text-xs font-black uppercase tracking-widest shadow-lg hover:bg-indigo-700 transition-all">
                <i className="fas fa-file-import mr-2"></i>Xử lý & Nhập điểm
              </button>
            </div>
          </div>
        </div>
      )}

      {showOnlineResultModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowOnlineResultModal(false)}></div>
          <div className="bg-white w-full max-w-2xl rounded-[32px] shadow-2xl relative z-10 animate-in zoom-in-95 flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-center mb-6 p-8 pb-0 shrink-0">
              <h3 className="text-lg font-black text-slate-800 uppercase tracking-widest">Nhập kết quả từ Link Online</h3>
              <button onClick={() => setShowOnlineResultModal(false)} className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 text-slate-400 hover:bg-rose-100 hover:text-rose-500 transition-all">
                <i className="fas fa-times"></i>
              </button>
            </div>

            <div className="mb-6 overflow-y-auto px-8">
              <p className="text-xs text-slate-500 mb-2 font-medium">Dán toàn bộ tin nhắn chứa mã kết quả (dạng #EDU_RESULT#...) mà học sinh gửi vào đây:</p>
              <textarea
                value={onlineResultContent}
                onChange={(e) => setOnlineResultContent(e.target.value)}
                placeholder={`Ví dụ:\nEm nộp bài ạ #EDU_RESULT#:Nguyễn Văn An:9.0:18/20\nBài của em đây #EDU_RESULT#:Trần Thị Bình:8.5:17/20`}
                className="w-full h-64 p-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-mono focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
              />
            </div>

            <div className="flex justify-end space-x-3 mt-auto p-8 pt-0 shrink-0">
              <button onClick={() => setShowOnlineResultModal(false)} className="px-6 py-3 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100 transition-all">Hủy bỏ</button>
              <button onClick={handleProcessOnlineResults} className="px-6 py-3 rounded-xl bg-purple-600 text-white text-xs font-black uppercase tracking-widest shadow-lg hover:bg-purple-700 transition-all">
                <i className="fas fa-magic mr-2"></i>Phân tích & Nhập điểm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ClassroomManager;
