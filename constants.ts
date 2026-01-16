
import { TeacherPersona } from './types';

export const PERSONAS: TeacherPersona[] = [
  {
    id: 'general',
    name: 'Trợ lý Tổng quát',
    description: 'Hỗ trợ mọi công việc của giáo viên.',
    icon: 'fa-chalkboard-teacher',
    instruction: 'Bạn là một trợ lý AI chuyên nghiệp dành cho giáo viên Việt Nam. Hãy giúp họ soạn bài, giải đáp kiến thức, và quản lý lớp học một cách tận tâm. Sử dụng Google Search để cập nhật các quy định mới nhất nếu cần.'
  },
  {
    id: 'exam-master',
    name: 'Chuyên gia Đề thi',
    description: 'Soạn thảo đề kiểm tra chuẩn ma trận kiến thức.',
    icon: 'fa-file-lines',
    instruction: 'Bạn là một chuyên gia khảo thí. Nhiệm vụ của bạn là tạo ra các câu hỏi trắc nghiệm và tự luận bám sát chương trình học. Câu hỏi phải rõ ràng, đáp án chính xác và có giải thích chi tiết.'
  },
  {
    id: 'circular-27',
    name: 'Chuyên gia Thông tư 27',
    description: 'Nhận xét học bạ chuẩn Thông tư 27/2020.',
    icon: 'fa-file-signature',
    instruction: 'Bạn là chuyên gia về Thông tư 27/2020/TT-BGDĐT. Nhiệm vụ của bạn là dựa trên điểm số giáo viên cung cấp để viết nhận xét học bạ. Nhận xét phải đủ 3 phần: 1. Học tập (kèm mức độ HTT/HT/CHT), 2. Phẩm chất, 3. Năng lực. Lời văn phải khích lệ, cụ thể, không dùng từ tiêu cực.'
  },
  {
    id: 'subject-expert',
    name: 'Chuyên gia Kiến thức',
    description: 'Giải đáp sâu về chuyên môn các môn học.',
    icon: 'fa-atom',
    instruction: 'Bạn là một giáo sư đầu ngành. Khi giải đáp kiến thức, hãy chia nhỏ vấn đề, đưa ra ví dụ minh họa và hướng dẫn từng bước (step-by-step). Ưu tiên giải thích theo phương pháp sư phạm dễ hiểu nhất cho học sinh.'
  },
  {
    id: 'lesson-planner',
    name: 'Chuyên gia Soạn bài',
    description: 'Thiết kế giáo án sáng tạo, chuẩn chương trình.',
    icon: 'fa-book-open',
    instruction: 'Bạn là chuyên gia thiết kế bài giảng. Hãy giúp giáo viên tạo ra các giáo án theo công văn 5512 hoặc các phương pháp tích cực như dạy học dự án, lớp học đảo ngược.'
  },
  {
    id: 'student-advisor',
    name: 'Tư vấn Tâm lý',
    description: 'Giải quyết vấn đề học sinh và phụ huynh.',
    icon: 'fa-user-graduate',
    instruction: 'Bạn là chuyên gia tâm lý học đường. Hãy đưa ra những lời khuyên khéo léo để giáo viên xử lý các tình huống sư phạm, mâu thuẫn học sinh hoặc giao tiếp với phụ huynh.'
  }
];

export const QUICK_PROMPTS = [
  "Soạn đề thi giữa kỳ 1 môn Toán lớp 6",
  "Tạo 10 câu trắc nghiệm Lịch sử lớp 12 chương 1",
  "Viết mẫu nhận xét Thông tư 27 cho học sinh môn Toán điểm 9",
  "Soạn giáo án môn Vật lý 10 bài Động lượng",
  "Tư vấn cách xử lý học sinh hay nói chuyện riêng"
];

export const INITIAL_GREETING = "Xin chào Quý Thầy/Cô! Tôi có thể giúp Thầy/Cô soạn bài, thiết kế đề thi hoặc quản lý lớp học. Thầy/Cô muốn bắt đầu từ đâu ạ?";

export const DOCUMENT_TEMPLATES = [
  {
    id: 'e-lesson',
    name: 'Bài giảng điện tử',
    icon: 'fa-laptop-code',
    content: `KẾ HOẠCH BÀI GIẢNG ĐIỆN TỬ (E-LESSON PLAN)
---------------------------------------------------------------
Tên bài dạy: ...........................................
Môn học: ......................... Khối lớp: ...........
Thời lượng dự kiến: ........... tiết

I. MỤC TIÊU BÀI HỌC (OBJECTIVES)
1. Kiến thức:
- Giúp học sinh nắm vững: ...............................
- Hiểu được các khái niệm: ..............................
2. Năng lực:
- Năng lực chung: .......................................
- Năng lực đặc thù môn học: .............................
3. Phẩm chất:
- Hình thành đức tính: ..................................

II. NỘI DUNG CHÍNH (CORE CONTENT)
- Chủ đề trọng tâm: .....................................
- Các đơn vị kiến thức cần đạt:
  + Kiến thức 1: .......................................
  + Kiến thức 2: .......................................
  + Kiến thức 3: .......................................

III. HOẠT ĐỘNG DẠY HỌC (TEACHING ACTIVITIES)
1. Hoạt động Khởi động (Mở đầu):
- Mục tiêu: Tạo hứng thú và kết nối kiến thức cũ.
- Cách tiến hành: .......................................
2. Hoạt động Hình thành kiến thức:
- Mục tiêu: Giúp học sinh khám phá nội dung mới.
- Cách tiến hành: .......................................
3. Hoạt động Luyện tập & Thực hành:
- Mục tiêu: Củng cố và áp dụng ngay tại lớp.
- Cách tiến hành: .......................................
4. Hoạt động Vận dụng & Mở rộng:
- Mục tiêu: Liên hệ thực tiễn đời sống.
- Cách tiến hành: .......................................

IV. KIỂM TRA & ĐÁNH GIÁ (ASSESSMENT)
- Tiêu chí đạt chuẩn: ...................................
- Công cụ đánh giá (Câu hỏi/Trò chơi): ..................
- Phản hồi cho học sinh: ................................

---------------------------------------------------------------
Ghi chú/Tài liệu tham khảo: .............................`
  },
  {
    id: 'exam-header',
    name: 'Mẫu đầu đề thi chuẩn',
    icon: 'fa-heading',
    content: `PHÒNG GIÁO DỤC VÀ ĐÀO TẠO ...................................
TRƯỜNG ........................................................

ĐỀ KIỂM TRA .......................... - HỌC KỲ .......
NĂM HỌC: 20... - 20...

MÔN: ...........................................
KHỐI: ..........................................
Thời gian làm bài: ....... phút (Không kể thời gian phát đề)

---------------------------------------------------------------
THÔNG TIN HỌC SINH
Họ và tên: ...........................................
Lớp: ......................... Số báo danh: ...........
Mã đề thi: ...................

---------------------------------------------------------------
PHẦN NỘI DUNG ĐỀ THI`
  },
  {
    id: 'student-feedback',
    name: 'Phiếu nhận xét cá nhân',
    icon: 'fa-clipboard-user',
    content: `PHIẾU NHẬN XÉT VÀ ĐÁNH GIÁ HỌC SINH
---------------------------------------------------------------
Học sinh: ...........................................
Lớp: ............. Năm học: 20... - 20...

1. ĐÁNH GIÁ VỀ HỌC TẬP (Môn: .................)
- Ưu điểm: ..........................................
- Hạn chế: ..........................................
- Mức độ hoàn thành: [ ] HTT  [ ] HT  [ ] CHT

2. ĐÁNH GIÁ NĂNG LỰC & PHẨM CHẤT
- Năng lực tự chủ: ..................................
- Phẩm chất đạo đức: ................................

3. LỜI KHUYÊN/HƯỚNG KHẮC PHỤC
- Đối với học sinh: .................................
- Ghi chú cho phụ huynh: ............................`
  },
  {
    id: 'lesson-plan-5512',
    name: 'Giáo án (Công văn 5512)',
    icon: 'fa-book-bookmark',
    content: `KẾ HOẠCH BÀI DẠY (Chuẩn 5512)
Tên bài học: ...........................................
Thời lượng: ....... tiết

I. MỤC TIÊU
1. Về kiến thức: .......................................
2. Về năng lực: ........................................
3. Về phẩm chất: .......................................

II. THIẾT BỊ DẠY HỌC VÀ HỌC LIỆU
- Giáo viên: ..........................................
- Học sinh: ...........................................

III. TIẾN TRÌNH DẠY HỌC
1. Hoạt động 1: Xác định vấn đề/Nhiệm vụ học tập
2. Hoạt động 2: Hình thành kiến thức mới/Giải quyết vấn đề
3. Hoạt động 3: Luyện tập
4. Hoạt động 4: Vận dụng`
  }
];
